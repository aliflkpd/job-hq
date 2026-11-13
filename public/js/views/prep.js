import { h, icon, dateTime } from '../dom.js';
import { S, refresh, emit } from '../state.js';
import { api } from '../api.js';
import { chip, toast } from '../ui.js';

export const PREP_LABEL = { queued: 'Queued for prep', running: 'Preparing CV and letter', done: 'Docs ready', skipped: 'Prep skipped it', failed: 'Prep failed' };

export async function queuePrep(job) {
  try {
    await api.prepQueue(job.url);
    await refresh();
    toast(`${job.company}: CV, cover letter and contacts are being prepared. This takes a few minutes.`);
  } catch (e) { toast(e.message, { tone: 'bad' }); }
}

export function prepChip(j) {
  const p = j.prep;
  if (!p) return null;
  const tone = { queued: '', running: 'accent', done: 'good', skipped: 'muted', failed: 'bad' }[p.status];
  const c = chip(PREP_LABEL[p.status], tone, p.status === 'done' ? 'file-pdf' : p.status === 'running' ? 'arrows-clockwise' : null);
  if (p.status === 'running') c.classList.add('spin');
  if (p.appId) { c.classList.add('clickable'); c.setAttribute('role', 'button'); c.tabIndex = 0; const go = () => { S.drawerApp = p.appId; S.peek = null; emit(); }; c.addEventListener('click', go); c.addEventListener('keydown', (e) => e.key === 'Enter' && go()); }
  return c;
}

// Today card: what auto-prep did and what it is doing.
export function prepCard() {
  const P = S.data.prep;
  if (!P.jobs.length && !P.auto) return null;
  const rows = P.jobs.slice(0, 6).map((e) => h('li', { class: 'task' },
    h('div', { class: 'task-main' },
      e.appId ? h('button', { class: 'link-btn title', type: 'button', onclick: () => { S.drawerApp = e.appId; emit(); } }, e.company) : h('strong', null, e.company),
      h('span', { class: 'muted small' }, e.status === 'failed' ? (e.error || 'Failed') : e.status === 'done' ? `${e.title}${e.contacts ? `, ${e.contacts} contacts` : ''}` : e.status === 'skipped' ? (e.note || e.title) : e.title)),
    h('span', { class: 'chip ' + ({ done: 'good', running: 'accent', failed: 'bad' }[e.status] || 'muted') }, PREP_LABEL[e.status]),
    e.status === 'failed' && h('button', { class: 'btn sm', type: 'button', onclick: async () => { await api.prepRetry(e.url); await refresh(); } }, 'Retry')));
  return h('section', { class: 'card' },
    h('header', { class: 'block-head' }, h('h2', null, 'Auto-prep'), h('span', { class: 'small muted' }, P.auto ? `On, up to ${P.max} per scan, fit ${P.minScore}+` : 'Off')),
    rows.length ? h('ul', { class: 'tasks' }, rows) : h('p', { class: 'small muted' }, 'After each scan, the strongest new roles get a tailored CV, a cover letter and contacts, without you asking. Nothing is ever sent.'));
}

export async function prepareApp(app, force = false) {
  try { await api.prepApp(app.id, force); await refresh(); toast(`${app.company}: preparing CV, cover letter and contacts. This takes a few minutes.`); } catch (e) { toast(e.message, { tone: 'bad' }); }
}
