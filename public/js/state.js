import { api } from './api.js';

// career-ops only allows its canonical states in applications.md. "Not available" is shown for Discarded
// (offer closed or taken down), so the terminal tools keep working.
export const STATUS_LABEL = { Discarded: 'Not available', SKIP: 'Skipped' };
export const labelOf = (st) => STATUS_LABEL[st] || st;
export const CLOSED = new Set(['Rejected', 'Discarded', 'SKIP']);
export const OPEN_ACCESS = new Set(['local', 'remote-open', 'unclear']);

export const S = {
  data: null,
  loading: true,
  error: null,
  peek: null, // job url shown in the job drawer
  drawerApp: null, // application id shown in the app drawer
  ui: {
    discover: { mode: 'any', tab: 'open', q: '', sort: 'fit', within: 0, newOnly: false, hasPay: false, limit: 80 },
    contacts: { status: 'all', q: '' },
    apps: { view: 'board' },
  },
  scan: { running: false },
};

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const emit = () => subs.forEach((f) => f());

export async function refresh({ quiet = false } = {}) {
  try {
    S.data = await api.state();
    S.error = null;
  } catch (e) {
    S.error = e.message;
  }
  S.loading = false;
  if (!quiet) emit(); else emit();
}

export const appById = (id) => S.data?.apps.find((a) => a.id === Number(id));
export const contactsFor = (appId) => S.data.contacts.filter((c) => c.appId === appId);
export const jobByUrl = (url) => S.data?.jobs.find((j) => j.url === url);

const hideStaff = (j) => !(S.data.filters.hideStaff && j.level === 'staff');
const fresh = (j) => j.daysAgo === null || j.daysAgo <= S.data.settings.maxAgeDays;

export function jobsIn(tab) {
  const J = S.data.jobs;
  switch (tab) {
    case 'open': return J.filter((j) => j.digital && OPEN_ACCESS.has(j.access) && !j.tracked && !j.dismissed && hideStaff(j) && fresh(j));
    case 'visa': return J.filter((j) => j.digital && j.access === 'sponsor' && !j.tracked && !j.dismissed && hideStaff(j) && fresh(j));
    case 'filtered': return J.filter((j) => (!j.digital || j.access === 'restricted') && !j.tracked && !j.dismissed);
    case 'dismissed': return J.filter((j) => j.dismissed && !j.tracked);
    default: return [];
  }
}

export function tasks() {
  const out = [];
  const today = new Date().toLocaleDateString('en-CA');
  for (const a of S.data.apps) {
    if (CLOSED.has(a.status) || !a.nextAction || a.nextAction.done) continue;
    out.push({ kind: 'action', app: a, text: a.nextAction.text, due: a.nextAction.due });
  }
  const byApp = new Map();
  for (const c of S.data.contacts) {
    if (c.status !== 'todo') continue;
    const a = appById(c.appId);
    if (!a || CLOSED.has(a.status) || a.status === 'Evaluated') continue; // reach out after applying
    if (!byApp.has(a.id)) byApp.set(a.id, { a, list: [] });
    byApp.get(a.id).list.push(c);
  }
  for (const { a, list } of byApp.values()) {
    const names = list.slice(0, 2).map((c) => c.name).join(', ');
    out.push({ kind: 'contact', app: a, contacts: list, text: `Reach out to ${list.length} ${list.length === 1 ? 'person' : 'people'}`, extra: names + (list.length > 2 ? ` and ${list.length - 2} more` : ''), due: today });
  }
  const rank = (t) => (t.due && t.due < today ? 0 : t.due === today ? 1 : 2);
  out.sort((x, y) => rank(x) - rank(y) || (x.due || '9').localeCompare(y.due || '9'));
  return out;
}

/* ---------- mutations ---------- */
let toastFn = () => {};
export const bindToast = (fn) => { toastFn = fn; };

export async function setStatus(app, status, { silent = false } = {}) {
  const prev = app.status;
  if (prev === status) return;
  app.status = status; // optimistic
  emit();
  try {
    const res = await api.patchApp(app.id, { status });
    await refresh();
    if (!silent) {
      toastFn(res.followUpDue ? `${app.company} moved to ${labelOf(status)}. Follow-up set for ${res.followUpDue}.` : `${app.company} moved to ${labelOf(status)}.`, {
        label: 'Undo', onClick: async () => { await api.patchApp(app.id, { status: prev }); await refresh(); },
      });
    }
  } catch (e) {
    app.status = prev; emit(); toastFn(e.message, { tone: 'bad' });
  }
}

export async function patchApp(app, body) {
  try { await api.patchApp(app.id, body); await refresh(); } catch (e) { toastFn(e.message, { tone: 'bad' }); }
}

export async function trackJob(job, status = 'Evaluated') {
  try {
    const r = await api.addApp({ company: job.company, role: job.title, url: job.url, location: job.location, workMode: job.mode, salary: job.salary ? job.salary.raw : '', source: job.source, status, fromScan: true });
    await refresh();
    toastFn(`${job.company} added to Applications.`, { label: 'Open', onClick: () => { S.drawerApp = r.id; S.peek = null; emit(); } });
    return r.id;
  } catch (e) { toastFn(e.message, { tone: 'bad' }); }
}

export async function dismissJob(job, reason = '') {
  try {
    await api.dismiss(job.url, reason);
    if (S.peek === job.url) S.peek = null;
    await refresh();
    toastFn(`Dismissed ${job.company}.`, { label: 'Undo', onClick: async () => { await api.restore(job.url); await refresh(); } });
  } catch (e) { toastFn(e.message, { tone: 'bad' }); }
}

export async function restoreJob(job) { await api.restore(job.url); await refresh(); }
