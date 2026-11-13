import { h, icon, clear, dueInfo, longToday, dateShort, safeHref } from '../dom.js';
import { labelOf, S, tasks, setStatus, patchApp, jobsIn, appById, CLOSED, emit } from '../state.js';
import { chip, statusChip, emptyState, segmented, menu, iconBtn } from '../ui.js';
import { scanPanel } from '../scan.js';
import { copyText } from '../dom.js';
import { toast } from '../ui.js';
import { prepCard } from './prep.js';

export function renderToday(root) {
  const d = S.data;
  const t = tasks();
  const open = jobsIn('open');
  const strong = open.filter((j) => j.bucket === 'strong').sort((a, b) => b.score - a.score).slice(0, 5);
  const waiting = d.apps.filter((a) => a.status === 'Applied').length;

  const stat = (n, label) => h('div', { class: 'stat' }, h('strong', { class: 'mono' }, String(n)), h('span', { class: 'muted small' }, label));
  const taskList = t.length ? h('ul', { class: 'tasks' }, t.map((x) => {
    const due = dueInfo(x.due);
    return h('li', { class: 'task' },
      h('div', { class: 'task-main' }, h('button', { class: 'link-btn title', type: 'button', onclick: () => { S.drawerApp = x.app.id; emit(); } }, x.text), h('span', { class: 'muted small' }, `${x.app.company}, ${x.extra || x.app.role}`)),
      h('span', { class: 'due ' + due.tone }, due.text),
      x.kind === 'action' ? h('button', { class: 'btn sm', type: 'button', onclick: () => patchApp(x.app, { nextAction: { ...x.app.nextAction, done: true } }) }, icon('check', 14), 'Done')
        : h('button', { class: 'btn sm', type: 'button', onclick: () => { S.drawerApp = x.app.id; emit(); } }, 'Open'));
  })) : emptyState('check', 'You are caught up', 'No follow-ups or outreach waiting. Rescan to find more roles.');

  const apply = d.apps.filter((a) => a.status === 'Evaluated').map((a) => {
    const l = a.links.find((x) => x.kind === 'apply') || a.links[0];
    return h('li', { class: 'task' }, h('div', { class: 'task-main' }, h('button', { class: 'link-btn title', type: 'button', onclick: () => { S.drawerApp = a.id; emit(); } }, a.company), h('span', { class: 'muted small' }, a.role)),
      l ? h('a', { class: 'btn sm primary', href: safeHref(l.url), target: '_blank', rel: 'noopener noreferrer' }, icon('arrow-square-out', 14), 'Apply') : null);
  });

  root.append(
    h('header', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, longToday()), h('h1', null, 'Today'))),
    h('div', { class: 'stats' }, stat(waiting, 'Applied, waiting'), stat(d.insights.live, 'Active applications'), stat(open.length, 'Open roles to review'), stat(open.filter((j) => j.isNew).length, 'New since last scan')),
    h('div', { class: 'cols' },
      h('section', { class: 'card' }, h('h2', null, 'To do'), taskList),
      h('div', { class: 'stack' },
        prepCard(),
        apply.length > 0 && h('section', { class: 'card' }, h('h2', null, 'Ready to submit'), h('p', { class: 'small muted' }, 'Documents are prepared. You submit.'), h('ul', { class: 'tasks' }, apply)),
        h('section', { class: 'card' }, h('header', { class: 'block-head' }, h('h2', null, 'Best new matches'), h('a', { class: 'link-btn small', href: '#/discover' }, 'See all')),
          strong.length ? h('ul', { class: 'tasks' }, strong.map((j) => h('li', { class: 'task' }, h('div', { class: 'task-main' }, h('button', { class: 'link-btn title', type: 'button', onclick: () => { S.peek = j.url; emit(); } }, j.title), h('span', { class: 'muted small' }, `${j.company}, ${j.location || j.regionLabel}`)), h('span', { class: 'mono fit-num' }, String(j.score))))) : h('p', { class: 'muted small' }, 'No strong matches yet. Run a rescan.')))),
    scanPanel(),
  );
}

/* ---------- Applications ---------- */
const COLS = [['Evaluated', 'To apply'], ['Applied', 'Applied'], ['Responded', 'Responded'], ['Interview', 'Interview'], ['Offer', 'Offer']];

export function renderApps(root) {
  const U = S.ui.apps;
  const host = h('div');
  const paint = () => {
    clear(host);
    const apps = S.data.apps;
    if (!apps.length) { host.append(emptyState('kanban', 'No applications yet', 'Track a role from Discover.')); return; }
    if (U.view === 'board') {
      const board = h('div', { class: 'board' });
      for (const [st, label] of COLS) {
        const group = apps.filter((a) => (st === 'Responded' ? ['Responded', 'Assessment'].includes(a.status) : st === 'Offer' ? ['Offer', 'Hired'].includes(a.status) : a.status === st));
        const col = h('section', { class: 'col', 'aria-label': label, ondragover: (e) => { e.preventDefault(); col.classList.add('over'); }, ondragleave: () => col.classList.remove('over'),
          ondrop: (e) => { e.preventDefault(); col.classList.remove('over'); const a = appById(e.dataTransfer.getData('text/plain')); if (a) setStatus(a, st); } },
          h('header', null, h('h2', null, label), h('span', { class: 'n' }, String(group.length))),
          group.length ? group.map(card) : h('p', { class: 'col-empty small muted' }, 'Drop a card here'));
        board.append(col);
      }
      host.append(board);
      const groups = [['Discarded', 'Not available', 'The posting was closed or taken down'], ['Rejected', 'Rejected', 'The company said no'], ['SKIP', 'Skipped', 'You decided not to apply']]
        .map(([st, label, hint]) => ({ st, label, hint, list: apps.filter((a) => a.status === st) })).filter((g) => g.list.length);
      for (const g of groups) host.append(h('details', { class: 'closed', open: g.st === 'Discarded' }, h('summary', null, `${g.label} (${g.list.length})`, h('span', { class: 'small muted' }, ' ' + g.hint)),
        h('div', { class: 'closed-list' }, g.list.map((a) => h('button', { class: 'closed-row', type: 'button', onclick: () => { S.drawerApp = a.id; emit(); } }, h('strong', null, a.company), h('span', { class: 'muted small' }, a.role), statusChip(a.status))))));
    } else {
      host.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, ['Company', 'Role', 'Status', 'Next action', 'Added'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, apps.map((a) => h('tr', { tabindex: '0', onclick: () => { S.drawerApp = a.id; emit(); }, onkeydown: (e) => e.key === 'Enter' && (S.drawerApp = a.id, emit()) },
          h('td', null, h('strong', null, a.company)), h('td', null, a.role), h('td', null, statusChip(a.status)), h('td', null, a.nextAction && !a.nextAction.done ? `${a.nextAction.text} (${dueInfo(a.nextAction.due).text})` : ''), h('td', { class: 'mono small' }, dateShort(a.date))))))));
    }
  };
  const card = (a) => {
    const l = a.links.find((x) => x.kind === 'apply') || a.links[0];
    const due = a.nextAction && !a.nextAction.done ? dueInfo(a.nextAction.due) : null;
    const contacts = S.data.contacts.filter((c) => c.appId === a.id);
    const todo = contacts.filter((c) => c.status === 'todo').length;
    const el = h('article', { class: 'card-app', draggable: 'true', tabindex: '0', 'aria-label': `${a.company}, ${a.role}, ${a.status}`,
      ondragstart: (e) => { e.dataTransfer.setData('text/plain', String(a.id)); el.classList.add('drag'); }, ondragend: () => el.classList.remove('drag'),
      onclick: (e) => { if (!e.target.closest('a,button')) { S.drawerApp = a.id; emit(); } }, onkeydown: (e) => { if (e.key === 'Enter' && !e.target.closest('a,button')) { S.drawerApp = a.id; emit(); } } },
      h('div', { class: 'ca-top' }, h('strong', null, a.company), a.score && a.score !== '-' && h('span', { class: 'mono small muted' }, a.score)),
      h('p', { class: 'small' }, a.role),
      h('div', { class: 'ca-meta' }, a.meta.workMode && a.meta.workMode !== 'unspecified' && chip(a.meta.workMode), a.meta.salary && h('span', { class: 'small muted' }, a.meta.salary.split('(')[0].trim())),
      due && h('div', { class: 'due ' + due.tone + ' small' }, icon('clock', 12), `${a.nextAction.text.split(/[.:(]/)[0].trim()}: ${due.text}`),
      h('div', { class: 'ca-foot' }, h('span', { class: 'small muted' }, todo ? `${todo} to contact` : contacts.length ? `${contacts.length} contacts` : ''), h('span', { class: 'spacer' }),
        l && h('a', { class: 'icon-btn sm', href: safeHref(l.url), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open posting' }, icon('arrow-square-out', 14)),
        iconBtn('caret-right', 'Move to status', (e) => menu(e.currentTarget, S.data.statuses.map((s) => ({ label: labelOf(s), current: s === a.status, onClick: () => setStatus(a, s) }))), { class: 'sm', size: 14 })));
    return el;
  };
  const segHost = h('div');
  const paintSeg = () => { clear(segHost); segHost.append(segmented([{ value: 'board', label: 'Board' }, { value: 'table', label: 'Table' }], U.view, (v) => { U.view = v; paintSeg(); paint(); }, 'View')); };
  paintSeg(); paint();
  root.append(h('header', { class: 'page-head' }, h('div', null, h('h1', null, 'Applications'), h('p', { class: 'sub' }, 'Status changes are written to career-ops, so the terminal tool sees them too.')), segHost,
    h('button', { class: 'btn primary', type: 'button', onclick: addAppModal }, icon('plus', 16), 'Add')), host);
}

import { modal, field } from '../ui.js';
import { api } from '../api.js';
import { refresh } from '../state.js';
function addAppModal() {
  const company = h('input', { class: 'input', placeholder: 'Company' });
  const role = h('input', { class: 'input', placeholder: 'Role title' });
  const url = h('input', { class: 'input', placeholder: 'https://... apply link', inputMode: 'url' });
  const loc = h('input', { class: 'input', placeholder: 'Remote, Jakarta, Singapore...' });
  modal({ title: 'Add application', body: h('div', { class: 'form' }, field('Company', company), field('Role', role), field('Apply link', url), field('Location', loc)),
    actions: (close) => [h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      if (!company.value.trim() || !role.value.trim()) { (company.value.trim() ? role : company).focus(); return; }
      try { const r = await api.addApp({ company: company.value, role: role.value, url: url.value, location: loc.value }); close(); await refresh(); S.drawerApp = r.id; emit(); } catch (e) { toast(e.message, { tone: 'bad' }); }
    } }, 'Add')] });
}
export { addAppModal };
