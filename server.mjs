import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PORT, HOST, PUBLIC_DIR, DOCS_ROOT, CAREER_OPS } from './lib/config.mjs';
import { load, persist, appMeta, addEvent, uid } from './lib/store.mjs';
import { buildState } from './lib/state.mjs';
import { defaults as prefDefaults, effective as prefEffective, savePrefs } from './lib/prefs.mjs';
import { queueApp, queueUrl, retryUrl, removeUrl, savePrepSettings, resumeOnStart } from './lib/prep.mjs';
import { startScan, scanStatus } from './lib/scan.mjs';
import { setApplicationField, appendApplication, parseApplications } from './lib/parse.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const STATUSES = ['Evaluated', 'Applied', 'Responded', 'Assessment', 'Interview', 'Offer', 'Hired', 'Rejected', 'Discarded', 'SKIP'];
const CLOSED = new Set(['Rejected', 'Discarded', 'SKIP']);
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);

const today = () => new Date().toLocaleDateString('en-CA');
const str = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const safeUrl = (u) => { const s = str(u, 1000); return /^(https?:|mailto:|tel:)/i.test(s) ? s : ''; };

function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 1_000_000) throw new Error('Body too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid JSON'); }
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found');
  const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': path.extname(file) === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  if (path.extname(file) === '.html') headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

function serveFile(res, query) {
  const root = query.get('root') === 'ops' ? CAREER_OPS : DOCS_ROOT;
  const rel = query.get('p') || '';
  const file = path.resolve(root, rel);
  const ext = path.extname(file).toLowerCase();
  if (!file.startsWith(root + path.sep) || !MIME[ext] || ['.html', '.js', '.mjs', '.svg'].includes(ext)) return send(res, 403, 'Not allowed');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found');
  res.writeHead(200, { 'Content-Type': MIME[ext], 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`, 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

/* ---------- API handlers ---------- */

const handlers = [];
const route = (method, pattern, fn) => handlers.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

route('GET', '/api/state', async () => buildState());

route('PATCH', '/api/apps/:id', async ({ params, body }) => {
  const id = Number(params.id);
  const rows = parseApplications();
  const row = rows.find((r) => r.id === id);
  if (!row) throw httpError(404, 'Application not found');
  const m = appMeta(id);
  const out = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw httpError(400, 'Unknown status');
    if (body.status !== row.status) {
      setApplicationField(id, 'status', body.status);
      const on = body.status === 'Applied' && /^\d{4}-\d{2}-\d{2}$/.test(body.appliedOn || '') && body.appliedOn <= today() ? body.appliedOn : null;
      const via = str(body.via, 80);
      const L = { Discarded: 'Not available', SKIP: 'Skipped' };
      addEvent(id, on ? `Applied${via ? ' via ' + via : ''} on ${on} (done outside Job HQ)` : `Status: ${L[row.status] || row.status} to ${L[body.status] || body.status}`, 'status');
      if (body.status === 'Applied' && !m.nextAction) {
        const base = on ? new Date(on + 'T00:00:00') : new Date();
        base.setDate(base.getDate() + 7);
        const due = base.toLocaleDateString('en-CA');
        m.nextAction = { text: 'Follow up if nobody has replied', due, done: false };
        out.followUpDue = due;
      }
      if (CLOSED.has(body.status) && m.nextAction) m.nextAction.done = true;
    }
  }
  if (body.nextAction !== undefined) {
    m.nextAction = body.nextAction === null ? null : { text: str(body.nextAction.text, 200), due: /^\d{4}-\d{2}-\d{2}$/.test(body.nextAction.due || '') ? body.nextAction.due : '', done: !!body.nextAction.done };
    if (m.nextAction && !m.nextAction.text) m.nextAction = null;
  }
  if (body.notes !== undefined) m.notes = str(body.notes, 4000);
  if (body.meta) m.meta = { ...m.meta, ...Object.fromEntries(['location', 'workMode', 'salary', 'source'].filter((k) => k in body.meta).map((k) => [k, str(body.meta[k], 200)])) };
  if (body.links) m.links = body.links.slice(0, 12).map((l) => ({ label: str(l.label, 80), url: safeUrl(l.url), kind: ['apply', 'posting', 'email'].includes(l.kind) ? l.kind : 'posting' })).filter((l) => l.url);
  await persist();
  return { ok: true, ...out };
});

route('POST', '/api/apps/:id/events', async ({ params, body }) => {
  const id = Number(params.id);
  const text = str(body.text, 500);
  if (!text) throw httpError(400, 'Empty note');
  addEvent(id, text, 'note');
  await persist();
  return { ok: true };
});

route('POST', '/api/apps', async ({ body }) => {
  const company = str(body.company, 120), role = str(body.role, 160);
  if (!company || !role) throw httpError(400, 'Company and role are required');
  const status = STATUSES.includes(body.status) ? body.status : 'Evaluated';
  const url = safeUrl(body.url);
  const on = /^\d{4}-\d{2}-\d{2}$/.test(body.appliedOn || '') && body.appliedOn <= today() ? body.appliedOn : today();
  const via = str(body.via, 80), extra = str(body.note, 300);
  const id = appendApplication({ date: on, company, role, status, notes: status === 'Applied' && body.external ? `Applied outside Job HQ${via ? ' via ' + via : ''}.${extra ? ' ' + extra : ''}` : 'Added from Job HQ' });
  const m = appMeta(id);
  if (url) m.links = [{ label: 'Job posting', url, kind: 'apply' }];
  m.meta = { location: str(body.location, 200), workMode: str(body.workMode, 20) || 'unspecified', salary: str(body.salary, 200), source: str(body.source, 80) };
  m.events = [{ at: body.external ? on : new Date().toISOString(), text: body.external ? `Applied${via ? ' via ' + via : ''} before using Job HQ.${extra ? ' ' + extra : ''}` : body.fromScan ? 'Added from a scan result.' : 'Added manually.', kind: 'status' }];
  if (status === 'Applied') { const d = new Date(on + 'T00:00:00'); d.setDate(d.getDate() + 7); const due = d.toLocaleDateString('en-CA'); m.nextAction = { text: 'Follow up if nobody has replied', due, done: false }; }
  if (url) load().tracked[url] = id;
  await persist();
  if (!body.external && status === 'Evaluated' && load().prep.auto) queueApp(id, 'auto').catch((e) => console.error('auto-prep:', e.message));
  return { ok: true, id };
});

route('POST', '/api/contacts', async ({ body }) => {
  const name = str(body.name, 120);
  if (!name) throw httpError(400, 'Name is required');
  const ct = { id: uid(), appId: Number(body.appId) || null, name, role: str(body.role, 160), channel: ['linkedin', 'email', 'whatsapp', 'other'].includes(body.channel) ? body.channel : 'linkedin', url: safeUrl(body.url), email: str(body.email, 200), phone: str(body.phone, 40), status: 'todo', draft: str(body.draft, 2000), note: str(body.note, 600) };
  load().contacts.push(ct);
  await persist();
  return { ok: true, contact: ct };
});

route('PATCH', '/api/contacts/:id', async ({ params, body }) => {
  const ct = load().contacts.find((c) => c.id === params.id);
  if (!ct) throw httpError(404, 'Contact not found');
  for (const k of ['name', 'role', 'email', 'phone', 'draft', 'note']) if (k in body) ct[k] = str(body[k], k === 'draft' ? 2000 : 300);
  if ('url' in body) ct.url = safeUrl(body.url);
  if ('channel' in body && ['linkedin', 'email', 'whatsapp', 'other'].includes(body.channel)) ct.channel = body.channel;
  if ('status' in body && ['todo', 'sent', 'replied', 'skipped'].includes(body.status)) {
    ct.status = body.status;
    if (body.status === 'sent' || body.status === 'replied') ct.lastAt = new Date().toISOString();
    if (ct.appId) addEvent(ct.appId, `${ct.name}: ${{ todo: 'back to to-contact', sent: 'message sent', replied: 'replied', skipped: 'skipped' }[body.status]}`, body.status === 'replied' ? 'reply' : 'sent');
  }
  await persist();
  return { ok: true };
});

route('DELETE', '/api/contacts/:id', async ({ params }) => {
  const s = load();
  s.contacts = s.contacts.filter((c) => c.id !== params.id);
  await persist();
  return { ok: true };
});

route('POST', '/api/jobs/dismiss', async ({ body }) => {
  const url = safeUrl(body.url);
  if (!url) throw httpError(400, 'Bad url');
  load().dismissed[url] = { at: new Date().toISOString(), reason: str(body.reason, 120) };
  await persist();
  return { ok: true };
});
route('POST', '/api/jobs/restore', async ({ body }) => {
  delete load().dismissed[safeUrl(body.url)];
  await persist();
  return { ok: true };
});
route('POST', '/api/jobs/seen', async ({ body }) => {
  const s = load();
  const urls = Array.isArray(body.urls) ? body.urls.map(safeUrl).filter(Boolean) : null;
  const st = await buildState();
  const target = urls || st.jobs.map((j) => j.url);
  s.seenKeys = [...new Set([...s.seenKeys, ...target])];
  await persist();
  return { ok: true };
});

route('POST', '/api/filters', async ({ body }) => {
  const s = load();
  if ('hideStaff' in body) s.filters.hideStaff = !!body.hideStaff;
  await persist();
  return { ok: true };
});

route('POST', '/api/scan', async ({ body }) => startScan({ since: body.since, scope: body.scope }));
route('GET', '/api/prefs', async () => ({ defaults: prefDefaults(), effective: prefEffective() }));
route('POST', '/api/prefs', async ({ body }) => { await savePrefs(body); return { defaults: prefDefaults(), effective: prefEffective() }; });
route('POST', '/api/prep/queue', async ({ body }) => queueUrl(safeUrl(body.url)));
route('POST', '/api/prep/app', async ({ body }) => queueApp(Number(body.id), 'manual', !!body.force));
route('POST', '/api/prep/retry', async ({ body }) => retryUrl(safeUrl(body.url)));
route('POST', '/api/prep/remove', async ({ body }) => { await removeUrl(safeUrl(body.url)); return { ok: true }; });
route('POST', '/api/prep/settings', async ({ body }) => { await savePrepSettings(body); return { ok: true }; });
route('GET', '/api/scan', async () => scanStatus());

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

const server = http.createServer(async (req, res) => {
  try {
    if (!HOSTS.has(req.headers.host || '')) return send(res, 403, 'Forbidden host');
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/file' && req.method === 'GET') return serveFile(res, url.searchParams);
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') {
        if (req.headers['x-jobhq'] !== '1') return send(res, 403, { error: 'Missing header' });
        const origin = req.headers.origin;
        if (origin && ![`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, `http://[::1]:${PORT}`].includes(origin)) return send(res, 403, { error: 'Bad origin' });
      }
      const h = handlers.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!h) return send(res, 404, { error: 'No such endpoint' });
      const params = url.pathname.match(h.re).groups || {};
      const body = req.method === 'GET' ? {} : await readBody(req);
      return send(res, 200, await h.fn({ params, body, query: url.searchParams }));
    }
    if (req.method === 'GET') return serveStatic(req, res, decodeURIComponent(url.pathname));
    send(res, 405, 'Method not allowed');
  } catch (e) {
    send(res, e.status || 500, { error: e.message || 'Server error' });
  }
});

resumeOnStart();
server.listen(PORT, HOST, () => console.log(`Job HQ running at http://localhost:${PORT}`));
// Browsers often resolve "localhost" to ::1 first, so listen there too (still loopback only).
const v6 = http.createServer(server.listeners('request')[0]);
v6.on('error', () => {});
v6.listen(PORT, '::1');

process.on('uncaughtException', (e) => console.error('uncaught:', e));
process.on('unhandledRejection', (e) => console.error('unhandled:', e));
