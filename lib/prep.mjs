import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CAREER_OPS, DOCS_ROOT, APP_DIR } from './config.mjs';
import { load, persist, appMeta, addEvent, uid } from './store.mjs';
import { appendApplication, parseApplications, setApplicationField } from './parse.mjs';
import { buildState } from './state.mjs';
import { buildPrompt } from './prep-prompt.mjs';

// Auto-prep: for roles worth applying to, an agent run reads the posting, builds a tailored CV with
// career-ops, writes a cover letter and looks for public contacts. It never sends anything and never
// touches applications.md itself: it writes one result file, and this module registers it.
// The agent is Hermes (`hermes chat`). Set JOBHQ_AGENT_CMD to use another command that accepts a prompt file.

const PREP_DIR = path.join(APP_DIR, 'data/prep');
const NOTIFY_FILE = path.join(APP_DIR, 'data/notify.json');
const AGENT = process.env.JOBHQ_AGENT_CMD || 'hermes';
const skills = () => load().prep.skills || process.env.JOBHQ_AGENT_SKILLS || '';
function candidateName() {
  if (load().prep.name) return load().prep.name;
  if (process.env.JOBHQ_CANDIDATE) return process.env.JOBHQ_CANDIDATE;
  try { return (/full_name:\s*"?([^"\n]+)"?/.exec(fs.readFileSync(path.join(CAREER_OPS, 'config/profile.yml'), 'utf8')) || [])[1]?.trim() || 'Candidate'; } catch { return 'Candidate'; }
}
const TIMEOUT_MS = 25 * 60 * 1000;

let current = null;

const norm = (x) => String(x).toLowerCase().replace(/\(.*?\)/g, '').replace(/\b(pt|inc|ltd|llc|group|co|corp|tbk|pte|sdn|bhd)\b\.?/g, '').replace(/[^a-z0-9]+/g, '');
const safeName = (x) => String(x).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Company';
const hash = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 10);
const clip = (v, n = 400) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const safeUrl = (u) => (/^(https?:|mailto:)/i.test(clip(u, 1000)) ? clip(u, 1000) : '');

export function prepSettings() { const { auto, max, minScore, name } = load().prep; return { auto, max, minScore, name: name || '' }; }

export async function savePrepSettings(b) {
  const p = load().prep;
  if ('auto' in b) p.auto = !!b.auto;
  if (typeof b.name === 'string') p.name = clip(b.name, 80);
  if (Number(b.max) >= 1 && Number(b.max) <= 15) p.max = Math.round(Number(b.max));
  if (Number(b.minScore) >= 40 && Number(b.minScore) <= 100) p.minScore = Math.round(Number(b.minScore));
  await persist();
}

export function prepSummary() {
  const p = load().prep;
  const jobs = Object.values(p.jobs).sort((a, b) => (b.queuedAt || '').localeCompare(a.queuedAt || ''));
  return { ...prepSettings(), active: jobs.some((j) => j.status === 'queued' || j.status === 'running'), jobs: jobs.slice(0, 30) };
}

function snapshot(j) {
  return { url: j.url, company: j.company, title: j.title, location: j.location || '', source: j.source, salary: j.salary ? j.salary.raw : '', fit: j.score, reasons: (j.reasons || []).map((r) => `${r.t} ${r.m}`) };
}

export function enqueue(job, source = 'manual') {
  const p = load().prep;
  const existing = p.jobs[job.url];
  if (existing && ['queued', 'running', 'done'].includes(existing.status)) return existing;
  const entry = { ...snapshot(job), status: 'queued', trigger: source, queuedAt: new Date().toISOString(), attempts: (existing?.attempts || 0) + (existing ? 1 : 0) };
  const dupe = parseApplications().find((a) => norm(a.company) === norm(job.company) && norm(a.role) === norm(job.title));
  if (dupe) Object.assign(entry, { status: 'skipped', note: 'Already in your Applications.', appId: dupe.id, finishedAt: entry.queuedAt });
  p.jobs[job.url] = entry;
  return entry;
}

export async function queueUrl(url) {
  const st = await buildState();
  const job = st.jobs.find((j) => j.url === url);
  if (!job) throw Object.assign(new Error('Posting not found'), { status: 404 });
  const e = enqueue(job, 'manual');
  await persist();
  kick();
  return e;
}

// Prepare documents for an application that is already tracked (added by hand or from Discover).
export async function queueApp(id, trigger = 'manual', force = false) {
  const p = load().prep;
  const app = parseApplications().find((a) => a.id === Number(id));
  if (!app) throw Object.assign(new Error('Application not found'), { status: 404 });
  const m = appMeta(app.id);
  const link = (m.links || []).find((l) => l.kind === 'apply') || (m.links || [])[0];
  const url = link?.url || `app:${app.id}`;
  const existing = p.jobs[url];
  if (existing && ['queued', 'running'].includes(existing.status)) return existing;
  const entry = { url, company: app.company, title: app.role, location: m.meta?.location || '', source: m.meta?.source || '', salary: m.meta?.salary || '', fit: null, reasons: [], status: 'queued', trigger, queuedAt: new Date().toISOString(), attempts: existing ? (existing.attempts || 0) + 1 : 0, appId: app.id, existing: true, force: !!force };
  p.jobs[url] = entry;
  await persist();
  kick();
  return entry;
}

export async function retryUrl(url) {
  const p = load().prep;
  const e = p.jobs[url];
  if (!e) throw Object.assign(new Error('Not in the queue'), { status: 404 });
  if (e.status === 'running') return e;
  Object.assign(e, { status: 'queued', error: null, note: '', queuedAt: new Date().toISOString(), attempts: (e.attempts || 0) + 1 });
  await persist();
  kick();
  return e;
}

export async function removeUrl(url) {
  const p = load().prep;
  if (p.jobs[url] && p.jobs[url].status !== 'running') delete p.jobs[url];
  await persist();
}

// Called after a scan: queue the strongest new roles that are open to the candidate.
export async function autoQueue(freshUrls) {
  const p = load().prep;
  if (!p.auto || !freshUrls.length) return 0;
  const st = await buildState();
  const fresh = new Set(freshUrls);
  const picks = st.jobs
    .filter((j) => fresh.has(j.url) && j.digital && ['local', 'remote-open'].includes(j.access) && j.bucket === 'strong' && j.score >= p.minScore && j.level !== 'staff'
      && !j.tracked && !j.dismissed && !p.jobs[j.url])
    .sort((a, b) => b.score - a.score).slice(0, p.max);
  for (const j of picks) enqueue(j, 'auto');
  await persist();
  kick();
  return picks.length;
}

export function resumeOnStart() {
  const p = load().prep;
  let changed = false;
  for (const e of Object.values(p.jobs)) if (e.status === 'running') { e.status = 'failed'; e.error = 'Interrupted when Job HQ stopped. Use Retry.'; changed = true; }
  if (changed) persist();
  if (Object.values(p.jobs).some((e) => e.status === 'queued')) kick();
}

function kick() {
  if (current) return;
  const p = load().prep;
  const next = Object.values(p.jobs).filter((e) => e.status === 'queued').sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))[0];
  if (!next) { finishBatch(); return; }
  runJob(next);
}

function runJob(entry) {
  fs.mkdirSync(PREP_DIR, { recursive: true });
  const id = hash(entry.url);
  const folderName = safeName(entry.company);
  const folder = path.join(DOCS_ROOT, 'Job Applications', folderName);
  const resultPath = path.join(PREP_DIR, `${id}.result.json`);
  const promptPath = path.join(PREP_DIR, `${id}.prompt.md`);
  const logPath = path.join(PREP_DIR, `${id}.log`);
  fs.rmSync(resultPath, { force: true });
  fs.writeFileSync(promptPath, buildPrompt({ job: entry, force: entry.force, folder, resultPath, careerOps: CAREER_OPS, candidate: candidateName() }));
  Object.assign(entry, { status: 'running', startedAt: new Date().toISOString(), error: null, folder: folderName });
  persist();

  const log = fs.createWriteStream(logPath);
  const child = spawn(AGENT, ['chat', '--query-file', promptPath, '-Q', ...(skills() ? ['-s', skills()] : []), '--max-turns', '90'], { cwd: CAREER_OPS, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  current = { child, entry };
  let tail = '';
  const onData = (d) => { log.write(d); tail = (tail + d.toString()).slice(-600); };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const killer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS);
  const done = async (code, err) => {
    clearTimeout(killer); log.end(); current = null;
    entry.finishedAt = new Date().toISOString();
    try {
      if (fs.existsSync(resultPath)) ingest(entry, JSON.parse(fs.readFileSync(resultPath, 'utf8')), folderName);
      else { entry.status = 'failed'; entry.error = err || `The agent stopped without a result (exit ${code}). ${tail.trim().split('\n').pop() || ''}`.slice(0, 300); }
    } catch (e) { entry.status = 'failed'; entry.error = 'Could not read the result: ' + e.message; }
    await persist();
    kick();
  };
  child.on('close', (code) => done(code));
  child.on('error', (e) => done(-1, `Could not start "${AGENT}": ${e.message}`));
}

function ingestExisting(entry, r, folderName) {
  const store = load();
  const id = entry.appId;
  const m = appMeta(id);
  const note = clip(r.notes, 300);
  if (r.verdict === 'skip' && !entry.force) {
    setApplicationField(id, 'status', 'SKIP');
    setApplicationField(id, 'notes', `Auto-prep skipped it: ${clip(r.skipReason, 200)}`);
    addEvent(id, `Auto-prep checked it and skipped: ${clip(r.skipReason, 200)}`, 'status');
    Object.assign(entry, { status: 'skipped', verdict: 'skip', note: clip(r.skipReason, 200) });
    return;
  }
  if (entry.force && parseApplications().find((a) => a.id === id)?.status === 'SKIP') { setApplicationField(id, 'status', 'Evaluated'); addEvent(id, 'You chose to apply anyway, so prep ran without the eligibility skip.', 'status'); }
  if (clip(r.score, 12)) setApplicationField(id, 'score', clip(r.score, 12));
  setApplicationField(id, 'notes', `Auto-prepared by Job HQ.${note ? ' ' + note : ''}`);
  m.docsFolder = folderName;
  m.meta = { ...m.meta, location: m.meta?.location || clip(r.location, 200), salary: m.meta?.salary || clip(r.salary, 200) };
  const ap = safeUrl(r.applyUrl);
  if (ap && !(m.links || []).some((l) => l.url === ap)) m.links = [{ label: 'Apply', url: ap, kind: 'apply' }, ...(m.links || [])];
  if (!m.nextAction) m.nextAction = { text: 'Review the CV and letter, then submit', due: new Date().toLocaleDateString('en-CA'), done: false };
  addEvent(id, 'CV, cover letter and contacts prepared automatically.', 'doc');
  const have = new Set(store.contacts.filter((c) => c.appId === id).map((c) => c.name.toLowerCase()));
  let n = 0;
  for (const c of Array.isArray(r.contacts) ? r.contacts.slice(0, 6) : []) {
    const name = clip(c.name, 120); if (!name || have.has(name.toLowerCase())) continue;
    const channel = ['linkedin', 'email', 'whatsapp', 'other'].includes(c.channel) ? c.channel : (c.email ? 'email' : 'linkedin');
    store.contacts.push({ id: uid(), appId: id, name, role: clip(c.role, 160), channel, url: safeUrl(c.url), email: clip(c.email, 200), phone: '', status: 'todo', draft: clip(c.draft, 2000), note: clip(c.note, 300) }); n++;
  }
  Object.assign(entry, { status: 'done', verdict: 'prepare', contacts: n, note });
  store.prep.batch = [...(store.prep.batch || []), entry.url];
}

function ingest(entry, r, folderName) {
  if (entry.existing) return ingestExisting(entry, r, folderName);
  const store = load();
  const verdict = r.verdict === 'skip' ? 'skip' : 'prepare';
  const company = clip(r.company, 120) || entry.company;
  const role = clip(r.role, 160) || entry.title;
  const date = new Date().toLocaleDateString('en-CA');
  const note = clip(r.notes, 300);
  if (verdict === 'skip') {
    const id = appendApplication({ date, company, role, score: clip(r.score, 12) || '-', status: 'SKIP', notes: `Auto-prep skipped it: ${clip(r.skipReason, 200)}` });
    appMeta(id).meta = { location: clip(r.location, 200) || entry.location, workMode: 'unspecified', salary: clip(r.salary, 200) || entry.salary, source: entry.source };
    appMeta(id).links = [{ label: 'Job posting', url: entry.url, kind: 'posting' }];
    addEvent(id, `Auto-prep checked it and skipped: ${clip(r.skipReason, 200)}`, 'status');
    Object.assign(entry, { status: 'skipped', appId: id, verdict, note: clip(r.skipReason, 200) });
    store.tracked[entry.url] = id;
    return;
  }
  const id = appendApplication({ date, company, role, score: clip(r.score, 12) || '-', status: 'Evaluated', notes: `Auto-prepared by Job HQ.${note ? ' ' + note : ''}` });
  const m = appMeta(id);
  const apply = safeUrl(r.applyUrl) || entry.url;
  m.links = [{ label: 'Apply', url: apply, kind: 'apply' }, ...(apply !== entry.url ? [{ label: 'Listing where it was found', url: entry.url, kind: 'posting' }] : [])];
  m.meta = { location: clip(r.location, 200) || entry.location, workMode: 'unspecified', salary: clip(r.salary, 200) || entry.salary, source: entry.source };
  m.docsFolder = folderName;
  m.nextAction = { text: 'Review the CV and letter, then submit', due: date, done: false };
  addEvent(id, 'CV, cover letter and contacts prepared automatically after a scan.', 'doc');
  let n = 0;
  for (const c of Array.isArray(r.contacts) ? r.contacts.slice(0, 6) : []) {
    const name = clip(c.name, 120); if (!name) continue;
    const channel = ['linkedin', 'email', 'whatsapp', 'other'].includes(c.channel) ? c.channel : (c.email ? 'email' : 'linkedin');
    store.contacts.push({ id: uid(), appId: id, name, role: clip(c.role, 160), channel, url: safeUrl(c.url), email: clip(c.email, 200), phone: '', status: 'todo', draft: clip(c.draft, 2000), note: clip(c.note, 300) }); n++;
  }
  store.tracked[entry.url] = id;
  Object.assign(entry, { status: 'done', appId: id, verdict, contacts: n, note });
  store.prep.batch = [...(store.prep.batch || []), entry.url];
}

function finishBatch() {
  const p = load().prep;
  const urls = p.batch || [];
  const skipped = Object.values(p.jobs).filter((e) => e.status === 'skipped' && e.finishedAt && e.trigger === 'auto' && Date.now() - Date.parse(e.finishedAt) < 3 * 3600e3);
  if (!urls.length && !skipped.length) return;
  const done = urls.map((u) => p.jobs[u]).filter(Boolean);
  const lines = [`Job HQ udah nyiapin ${done.length} lowongan hasil scan:`];
  for (const e of done) lines.push(`- ${e.company}, ${e.title}: CV + cover letter${e.contacts ? ` + ${e.contacts} kontak` : ''}`);
  if (skipped.length) lines.push(`${skipped.length} lainnya otomatis di-skip (${skipped.map((e) => e.company).join(', ')}).`);
  lines.push('Cek dan submit sendiri di http://127.0.0.1:4747/#/applications. Belum ada yang dikirim.');
  fs.writeFileSync(NOTIFY_FILE, JSON.stringify({ at: new Date().toISOString(), text: lines.join('\n') }));
  p.batch = [];
  persist();
}
