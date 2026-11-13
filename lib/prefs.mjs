import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { CAREER_OPS } from './config.mjs';
import { load, persist } from './store.mjs';

// Scan preferences set from the web. portals.yml stays untouched: overrides are applied to a temporary copy
// at scan time, so "Reset" always returns to the filters settled in career-ops.

export function yamlLib() {
  return createRequire(path.join(CAREER_OPS, 'package.json'))('js-yaml');
}

export function readPortals() {
  return yamlLib().load(fs.readFileSync(path.join(CAREER_OPS, 'portals.yml'), 'utf8'));
}

const on = (a) => (a || []).filter((e) => e.enabled !== false);

export function defaults() {
  const c = readPortals();
  return {
    keywords: c.title_filter?.positive || [],
    maxAgeDays: Number(c.max_posting_age_days) || 45,
    minIdr: 10_000_000,
    boards: on(c.job_boards).map((b) => b.name),
    companies: on(c.tracked_companies).map((b) => b.name),
  };
}

export function overrides() { return load().prefs || {}; }

export function effective() {
  const d = defaults();
  const o = overrides();
  const off = new Set(o.disabled || []);
  return {
    keywords: o.keywords?.length ? o.keywords : d.keywords,
    maxAgeDays: o.maxAgeDays || d.maxAgeDays,
    minIdr: o.minIdr ?? d.minIdr,
    boards: d.boards.filter((n) => !off.has(n)),
    companies: d.companies.filter((n) => !off.has(n)),
    disabled: [...off],
    customized: Object.keys(o).length > 0,
  };
}

export async function savePrefs(body) {
  const d = defaults();
  const s = load();
  const next = {};
  const kw = Array.isArray(body.keywords) ? [...new Set(body.keywords.map((k) => String(k).trim().slice(0, 60)).filter(Boolean))].slice(0, 40) : null;
  if (kw && kw.length && JSON.stringify(kw) !== JSON.stringify(d.keywords)) next.keywords = kw;
  const age = Number(body.maxAgeDays);
  if (age >= 1 && age <= 180 && age !== d.maxAgeDays) next.maxAgeDays = Math.round(age);
  const min = Number(body.minIdr);
  if (Number.isFinite(min) && min >= 0 && min <= 1_000_000_000 && min !== d.minIdr) next.minIdr = Math.round(min);
  const known = new Set([...d.boards, ...d.companies]);
  const off = Array.isArray(body.disabled) ? body.disabled.filter((n) => known.has(n)) : [];
  if (off.length) next.disabled = off;
  s.prefs = next;
  await persist();
  return effective();
}

export function hasOverrides() { return Object.keys(overrides()).some((k) => k !== 'minIdr'); }
