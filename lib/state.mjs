import fs from 'node:fs';
import path from 'node:path';
import { CAREER_OPS, DOCS_ROOT, FALLBACK_IDR } from './config.mjs';
import { parseApplications, parseScanHistory, parseScanRuns, parsePipelineSalaries, readSettings } from './parse.mjs';
import { classify, sourceLabel, REGION_LABELS } from './classify.mjs';
import { load, persist } from './store.mjs';

import { effective } from './prefs.mjs';

/* ---------- exchange rates (IDR per unit), refreshed at most once a day ---------- */
export async function refreshRates() {
  const s = load();
  const fresh = s.rates && Date.now() - s.rates.at < 86400000;
  if (fresh) return s.rates;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/IDR', { signal: AbortSignal.timeout(6000) });
    const j = await res.json();
    if (j.result === 'success') {
      const per = {};
      for (const cur of Object.keys(FALLBACK_IDR)) if (j.rates[cur]) per[cur] = 1 / j.rates[cur];
      s.rates = { at: Date.now(), live: true, per };
      persist();
      return s.rates;
    }
  } catch { /* offline: fall through to constants */ }
  s.rates = s.rates || { at: Date.now() - 80000000, live: false, per: { ...FALLBACK_IDR } };
  return s.rates;
}

/* ---------- cache keyed on source file mtimes ---------- */
let jobCache = { sig: '', jobs: [], runs: [] };

function sig() {
  const f = ['data/scan-history.tsv', 'data/pipeline.md'].map((r) => {
    try { return fs.statSync(path.join(CAREER_OPS, r)).mtimeMs; } catch { return 0; }
  });
  const s = load();
  return f.join('|') + '|' + (s.rates?.at || 0);
}

function loadJobs(rates) {
  const minIdr = effective().minIdr;
  const key = sig() + '|' + minIdr;
  if (jobCache.sig === key) return jobCache;
  const salaries = parsePipelineSalaries();
  const rows = parseScanHistory();
  const seen = new Set();
  const jobs = [];
  for (const r of rows) {
    if (r.status !== 'added') continue;
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    const job = { ...r, salaryRaw: salaries.get(r.url) || '' };
    const cls = classify(job, { rates, minIdr });
    jobs.push({
      url: r.url, company: r.company, title: r.title, location: r.location, posted: r.posted_at || null,
      firstSeen: r.first_seen, source: sourceLabel(r.portal, r.url), portal: r.portal,
      ...cls,
    });
  }
  jobCache = { sig: key, jobs, runs: parseScanRuns(), totalRows: rows.length, matchedTitle: rows.filter((r) => r.status !== 'skipped_title').length };
  return jobCache;
}

export function addedUrls() {
  return parseScanHistory().filter((r) => r.status === 'added').map((r) => r.url);
}

/* ---------- documents saved for each application ---------- */
function listDocs(folder) {
  if (!folder) return [];
  const dir = path.join(DOCS_ROOT, 'Job Applications', folder);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => !n.startsWith('.')).map((name) => {
    const st = fs.statSync(path.join(dir, name));
    const ext = path.extname(name).toLowerCase();
    let kind = 'other';
    if (ext === '.pdf') kind = 'cv';
    else if (/cover/i.test(name)) kind = 'letter';
    else if (/email/i.test(name)) kind = 'email';
    else if (/outreach/i.test(name)) kind = 'outreach';
    return { name, kind, size: st.size, ext, url: '/file?root=docs&p=' + encodeURIComponent(path.join('Job Applications', folder, name)) };
  }).sort((a, b) => ['cv', 'letter', 'email', 'outreach', 'other'].indexOf(a.kind) - ['cv', 'letter', 'email', 'outreach', 'other'].indexOf(b.kind));
}

const norm = (u) => String(u || '').split('#')[0].replace(/\/$/, '').toLowerCase();
const STATUSES = ['Evaluated', 'Applied', 'Responded', 'Assessment', 'Interview', 'Offer', 'Hired', 'Rejected', 'Discarded', 'SKIP'];

export async function buildState() {
  const store = load();
  const ratesObj = await refreshRates();
  const rates = ratesObj.per;
  const { jobs, runs, totalRows, matchedTitle } = loadJobs(rates);

  const rows = parseApplications();
  const apps = rows.map((r) => {
    const pj = Object.values(store.prep.jobs).filter((e) => e.appId === r.id).sort((x, y) => (y.queuedAt || '').localeCompare(x.queuedAt || ''))[0];
    const m = store.apps[r.id] || { links: [], meta: {}, nextAction: null, events: [], docsFolder: null };
    return { ...r, links: m.links || [], meta: m.meta || {}, nextAction: m.nextAction || null, events: m.events || [], docs: listDocs(m.docsFolder), docsFolder: m.docsFolder || null, prep: pj ? { status: pj.status, url: pj.url, error: pj.error || '', note: pj.note || '' } : null, notesLocal: m.notes || '' };
  });
  const trackedUrls = new Set();
  for (const a of apps) for (const l of a.links) trackedUrls.add(norm(l.url));
  for (const u of Object.keys(store.tracked)) trackedUrls.add(norm(u));

  const cn = (x) => String(x).toLowerCase().replace(/\(.*?\)/g, '').replace(/\b(pt|inc|ltd|llc|group|co|corp|tbk|pte|sdn|bhd)\b\.?/g, '').replace(/[^a-z0-9]+/g, '');
  const appliedCo = new Map();
  for (const a of apps) if (!['Evaluated', 'SKIP', 'Discarded'].includes(a.status) && cn(a.company).length > 2) appliedCo.set(cn(a.company), a);
  const seen = new Set(store.seenKeys);
  const outJobs = jobs.map((j) => ({
    ...j,
    tracked: trackedUrls.has(norm(j.url)),
    dismissed: store.dismissed[j.url] || null,
    isNew: !seen.has(j.url),
    prep: store.prep.jobs[j.url] ? { status: store.prep.jobs[j.url].status, appId: store.prep.jobs[j.url].appId || null, note: store.prep.jobs[j.url].note || store.prep.jobs[j.url].error || '' } : null,
    appliedAtCompany: appliedCo.has(cn(j.company)) ? { id: appliedCo.get(cn(j.company)).id, role: appliedCo.get(cn(j.company)).role, status: appliedCo.get(cn(j.company)).status } : null,
  }));

  return {
    now: new Date().toISOString(),
    statuses: STATUSES,
    apps,
    contacts: store.contacts,
    jobs: outJobs,
    filters: store.filters,
    settings: { ...readSettings(), ...(() => { const e = effective(); return { minIdr: e.minIdr, maxAgeDays: e.maxAgeDays, keywords: e.keywords, enabledSources: e.boards.length + e.companies.length, customized: e.customized }; })() },
    rates: { live: ratesObj.live, at: ratesObj.at, usd: Math.round(rates.USD), sgd: Math.round(rates.SGD) },
    prep: { name: store.prep.name || '', auto: store.prep.auto, max: store.prep.max, minScore: store.prep.minScore, active: Object.values(store.prep.jobs).some((e) => e.status === 'queued' || e.status === 'running'), jobs: Object.values(store.prep.jobs).sort((a, b) => (b.queuedAt || '').localeCompare(a.queuedAt || '')).slice(0, 30) },
    scan: { last: store.scan.last, runs: runs.slice(-6) },
    insights: buildInsights(outJobs, apps, { totalRows, matchedTitle, runs }),
  };
}

function count(arr, fn) { const m = new Map(); for (const x of arr) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); } return m; }

function buildInsights(jobs, apps, { totalRows, matchedTitle }) {
  const digital = jobs.filter((j) => j.digital);
  const reachable = digital.filter((j) => j.access !== 'restricted');
  const strong = reachable.filter((j) => j.bucket === 'strong');
  const live = apps.filter((a) => !['Rejected', 'Discarded', 'SKIP'].includes(a.status));
  const applied = apps.filter((a) => ['Applied', 'Responded', 'Assessment', 'Interview', 'Offer', 'Hired'].includes(a.status));

  const funnel = [
    { label: 'Postings the scanner read', n: totalRows, hint: 'Every posting across all enabled boards' },
    { label: 'Title matches your roles', n: matchedTitle, hint: 'Passed the title filter in portals.yml' },
    { label: 'Fresh enough to act on', n: jobs.length, hint: 'Within the max posting age' },
    { label: 'Real digital design roles', n: digital.length, hint: 'Not hardware, textile, construction' },
    { label: 'Open to you', n: reachable.length, hint: 'Indonesia, remote anywhere or visa-sponsor countries' },
    { label: 'Strong fit', n: strong.length, hint: 'Fit estimate 70 or higher' },
    { label: 'In your tracker', n: apps.length, hint: 'Rows in applications.md' },
    { label: 'Applied', n: applied.length, hint: 'Applied, or further along' },
  ];

  const regionCounts = [...count(digital, (j) => j.region)].map(([k, n]) => ({ key: k, label: REGION_LABELS[k] || k, n })).sort((a, b) => b.n - a.n);
  const sources = [...count(digital, (j) => j.source)].map(([k, n]) => ({
    label: k, n, open: digital.filter((j) => j.source === k && j.access !== 'restricted').length, strong: strong.filter((j) => j.source === k).length,
  })).sort((a, b) => b.open - a.open || b.n - a.n);

  const weeks = Array.from({ length: 7 }, (_, i) => ({ label: i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i} weeks ago`, n: 0, open: 0 }));
  let undated = 0;
  for (const j of digital) {
    if (j.daysAgo === null) { undated++; continue; }
    const w = Math.min(6, Math.floor(j.daysAgo / 7));
    weeks[w].n++;
    if (j.access !== 'restricted') weeks[w].open++;
  }

  const topCompanies = [...count(reachable, (j) => j.company)].map(([k, n]) => ({ company: k, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  const withPay = reachable.filter((j) => j.idr).sort((a, b) => b.idr.max - a.idr.max).slice(0, 8).map((j) => ({ company: j.company, title: j.title, raw: j.salary.raw, idrMax: j.idr.max, url: j.url }));

  const byStatus = Object.fromEntries([...count(apps, (a) => a.status)]);
  const responded = apps.filter((a) => ['Responded', 'Assessment', 'Interview', 'Offer', 'Hired'].includes(a.status)).length;

  return { funnel, regionCounts, sources, weeks, undated, topCompanies, withPay, byStatus, applied: applied.length, responded, live: live.length, hiddenOff: jobs.filter((j) => !j.digital).length, hiddenBlocked: digital.filter((j) => j.access === 'restricted').length };
}
