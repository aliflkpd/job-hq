import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STORE_FILE } from './config.mjs';
import { buildSeed } from './seed.mjs';

let cache = null;
let writing = Promise.resolve();

export function uid() { return crypto.randomUUID().slice(0, 8); }

export function load() {
  if (cache) return cache;
  if (fs.existsSync(STORE_FILE)) {
    cache = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } else {
    cache = buildSeed();
    persist();
  }
  cache.filters = { hideStaff: true, ...(cache.filters || {}) };
  cache.prep = { auto: true, max: 5, minScore: 70, batch: [], ...(cache.prep || {}), jobs: cache.prep?.jobs || {} };
  return cache;
}

export function persist() {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  const tmp = STORE_FILE + '.tmp';
  const data = JSON.stringify(cache, null, 1);
  writing = writing.then(() => { fs.writeFileSync(tmp, data); fs.renameSync(tmp, STORE_FILE); });
  return writing;
}

export function appMeta(id) {
  const s = load();
  s.apps[id] ||= { links: [], meta: {}, nextAction: null, events: [], docsFolder: null };
  return s.apps[id];
}

export function addEvent(id, text, kind = 'note') {
  appMeta(id).events.unshift({ at: new Date().toISOString(), text, kind });
}
