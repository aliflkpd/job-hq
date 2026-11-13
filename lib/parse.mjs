import fs from 'node:fs';
import path from 'node:path';
import { CAREER_OPS } from './config.mjs';

const read = (rel) => fs.readFileSync(path.join(CAREER_OPS, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(CAREER_OPS, rel));
const mtime = (rel) => (exists(rel) ? fs.statSync(path.join(CAREER_OPS, rel)).mtimeMs : 0);

/* ---------- applications.md (the tracker career-ops owns) ---------- */

const APP_FILE = 'data/applications.md';

function cells(line) {
  return line.split('|').slice(1, -1).map((s) => s.trim());
}

export function parseApplications() {
  if (!exists(APP_FILE)) return [];
  const rows = [];
  for (const line of read(APP_FILE).split('\n')) {
    if (!line.startsWith('|')) continue;
    const c = cells(line);
    if (c.length < 9 || !/^\d+$/.test(c[0])) continue;
    rows.push({
      id: Number(c[0]), date: c[1], company: c[2], role: c[3], score: c[4],
      status: c[5], pdf: c[6], report: c[7], notes: c.slice(8).join(' | '),
    });
  }
  return rows;
}

const clean = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

export function setApplicationField(id, field, value) {
  const idx = { score: 4, status: 5, pdf: 6, notes: 8 }[field];
  if (idx === undefined) throw new Error('field not writable: ' + field);
  const file = path.join(CAREER_OPS, APP_FILE);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let hit = false;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('|')) continue;
    const c = cells(lines[i]);
    if (c[0] !== String(id)) continue;
    c[idx] = clean(value) || '-';
    lines[i] = `| ${c.join(' | ')} |`;
    hit = true;
    break;
  }
  if (!hit) throw new Error('application not found: ' + id);
  fs.writeFileSync(file, lines.join('\n'));
}

export function appendApplication({ date, company, role, score = '-', status = 'Evaluated', pdf = '-', report = '-', notes = '' }) {
  const file = path.join(CAREER_OPS, APP_FILE);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n';
  const id = parseApplications().reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const line = `| ${id} | ${clean(date)} | ${clean(company)} | ${clean(role)} | ${clean(score)} | ${clean(status)} | ${clean(pdf)} | ${clean(report)} | ${clean(notes) || '-'} |`;
  fs.writeFileSync(file, text.replace(/\n*$/, '\n') + line + '\n');
  return id;
}

/* ---------- scan-history.tsv (everything the scanner has ever read) ---------- */

export function parseScanHistory() {
  const rel = 'data/scan-history.tsv';
  if (!exists(rel)) return [];
  const lines = read(rel).split('\n');
  const head = lines[0].split('\t');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = lines[i].split('\t');
    const r = {};
    for (let k = 0; k < head.length; k++) r[head[k]] = f[k] ?? '';
    out.push(r);
  }
  return out;
}

export function parseScanRuns() {
  const rel = 'data/scan-runs.tsv';
  if (!exists(rel)) return [];
  const lines = read(rel).trim().split('\n');
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => {
    const f = l.split('\t');
    const r = {};
    head.forEach((h, i) => { r[h] = /^\d+$/.test(f[i] ?? '') ? Number(f[i]) : f[i]; });
    return r;
  });
}

/* ---------- pipeline.md: salary text sits only here ---------- */

export function parsePipelineSalaries() {
  const rel = 'data/pipeline.md';
  const map = new Map();
  if (!exists(rel)) return map;
  for (const line of read(rel).split('\n')) {
    if (!line.startsWith('- [')) continue;
    const parts = line.replace(/^- \[.\]\s*/, '').split(' | ').map((s) => s.trim());
    const url = parts[0];
    const sal = parts.find((p) => /^[\d.,]+\s*-\s*[\d.,]+\s+[A-Z]{3}$/.test(p));
    if (sal) map.set(url, sal);
  }
  return map;
}

/* ---------- settings we agreed on (profile.yml + portals.yml) ---------- */

export function readSettings() {
  const out = { roles: [], titleKeywords: [], minSalary: '', location: '', years: null, maxAgeDays: null, enabledSources: 0, files: { profile: path.join(CAREER_OPS, 'config/profile.yml'), portals: path.join(CAREER_OPS, 'portals.yml') } };
  try {
    const p = read('config/profile.yml');
    const lines = p.split('\n');
    const at = lines.findIndex((l) => /^\s*primary:\s*$/.test(l));
    if (at >= 0) for (let i = at + 1; i < lines.length && /^\s+- /.test(lines[i]); i++) out.roles.push(lines[i].replace(/^\s+- /, '').replace(/^"|"\s*$/g, '').trim());
    out.minSalary = (/minimum:\s*"([^"]+)"/.exec(p) || [])[1] || '';
    out.location = (/candidate:[\s\S]*?location:\s*"([^"]+)"/.exec(p) || [])[1] || '';
    out.years = Number((/years_of_experience:\s*(\d+)/.exec(p) || [])[1]) || null;
  } catch { /* profile missing: leave defaults */ }
  try {
    const t = read('portals.yml');
    out.maxAgeDays = Number((/^max_posting_age_days:\s*(\d+)/m.exec(t) || [])[1]) || null;
    const pos = /title_filter:\s*\n(?:\s*#.*\n)*\s*positive:\s*\n((?:\s*(?:#.*)?\n|\s+- .*\n)+?)\s+negative:/.exec(t);
    if (pos) out.titleKeywords = [...pos[1].matchAll(/^\s+- "([^"]+)"/gm)].map((m) => m[1]);
    out.enabledSources = (t.match(/^\s{4}enabled:\s*true/gm) || []).length;
  } catch { /* portals missing */ }
  return out;
}

export const fileMtime = mtime;
