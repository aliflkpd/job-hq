import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { CAREER_OPS } from './config.mjs';
import { load, persist } from './store.mjs';
import { addedUrls } from './state.mjs';
import { autoQueue } from './prep.mjs';
import { yamlLib, overrides, hasOverrides } from './prefs.mjs';

// One scan at a time. The scan itself is career-ops' own `scan.mjs`, so it uses exactly the filters
// in portals.yml (title keywords, location rules, max posting age, enabled boards).
let run = null;

// Local = Indonesian boards and companies. International = everything else enabled in portals.yml
// (remote boards, global company sites, Singapore, Malaysia, Australia). Filters stay as configured.
const LOCAL_RE = /indonesia|tech in asia|glints|kalibrr/i;
const LOCAL_COMPANIES = new Set(['xendit', 'ajaib']);
export const SCOPES = { all: 'Everything', local: 'Indonesia only', intl: 'International only' };

function scopedPortals(scope) {
  const yaml = yamlLib();
  const cfg = yaml.load(fs.readFileSync(path.join(CAREER_OPS, 'portals.yml'), 'utf8'));
  const o = overrides();
  const off = new Set(o.disabled || []);
  const isLocal = (e) => LOCAL_RE.test(e.name || '') || LOCAL_COMPANIES.has(String(e.name || '').toLowerCase());
  const keep = (e) => !off.has(e.name) && (scope === 'all' || (scope === 'local' ? isLocal(e) : !isLocal(e)));
  cfg.tracked_companies = (cfg.tracked_companies || []).filter(keep);
  cfg.job_boards = (cfg.job_boards || []).filter(keep);
  if (o.keywords?.length) cfg.title_filter = { ...(cfg.title_filter || {}), positive: o.keywords };
  if (o.maxAgeDays) cfg.max_posting_age_days = o.maxAgeDays;
  const tmp = path.join(CAREER_OPS, `.jobhq-scope-${scope}.portals.yml`);
  fs.writeFileSync(tmp, yaml.dump(cfg, { lineWidth: -1, noRefs: true }));
  const cnt = (a) => a.filter((e) => e.enabled !== false).length;
  return { tmp, companies: cnt(cfg.tracked_companies), boards: cnt(cfg.job_boards) };
}

const MAX_LOG = 500;

export function scanStatus() {
  if (!run) return { running: false, last: load().scan.last };
  return {
    running: run.running, startedAt: run.startedAt, since: run.since, scope: run.scope, lines: run.log.length,
    tail: run.log.slice(-60), lastLine: run.log[run.log.length - 1] || '', last: load().scan.last,
  };
}

export function startScan({ since, scope = 'all' } = {}) {
  if (!SCOPES[scope]) throw new Error('Unknown scope');
  if (run?.running) throw new Error('A scan is already running');
  const days = since ? Math.max(1, Math.min(60, Number(since))) : null;
  const args = ['scan.mjs', '--json', '--quiet'];
  if (days) args.push('--since', String(days));

  let tmpFile = null, sources = null;
  const env = { ...process.env };
  if (scope !== 'all' || hasOverrides()) {
    const sp = scopedPortals(scope);
    tmpFile = sp.tmp; sources = { companies: sp.companies, boards: sp.boards };
    env.CAREER_OPS_PORTALS = tmpFile;
  }
  const before = new Set(addedUrls());
  run = { running: true, startedAt: Date.now(), since: days, scope, log: [], out: '' };
  const child = spawn(process.execPath, args, { cwd: CAREER_OPS, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const push = (chunk, isOut) => {
    const text = chunk.toString();
    if (isOut) run.out += text;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      run.log.push(line.slice(0, 300));
      if (run.log.length > MAX_LOG) run.log.shift();
    }
  };
  child.stdout.on('data', (d) => push(d, true));
  child.stderr.on('data', (d) => push(d, false));
  const killer = setTimeout(() => child.kill('SIGTERM'), 15 * 60 * 1000);

  child.on('close', (code) => {
    clearTimeout(killer);
    if (tmpFile) fs.rm(tmpFile, { force: true }, () => {});
    const after = addedUrls();
    const fresh = after.filter((u) => !before.has(u));
    let receipt = null;
    try { receipt = JSON.parse(run.out.slice(run.out.indexOf('{'))); } catch { /* receipt is optional */ }
    const s = load();
    s.scan.last = {
      at: new Date(run.startedAt).toISOString(), seconds: Math.round((Date.now() - run.startedAt) / 1000),
      since: run.since, scope, sources, exit: code, newCount: fresh.length, totalAdded: new Set(after).size,
      error: code !== 0 && code !== 2 ? (run.log[run.log.length - 1] || 'scan failed') : null,
      partial: code === 2,
      receipt: receipt && typeof receipt === 'object' ? summarize(receipt) : null,
    };
    persist();
    run.running = false;
    autoQueue(fresh).then((n) => { if (n) { s.scan.last.queued = n; persist(); } }).catch((e) => console.error('auto-prep:', e.message));
  });
  child.on('error', (e) => { run.log.push('Could not start scan: ' + e.message); run.running = false; if (tmpFile) fs.rm(tmpFile, { force: true }, () => {}); });
  return scanStatus();
}

function summarize(r) {
  const pick = {};
  for (const k of ['found', 'new_added', 'new', 'dupes', 'filtered_title', 'filtered_posting_age', 'filtered_location', 'errors', 'companies', 'boards']) if (k in r) pick[k] = r[k];
  return pick;
}
