import { h, icon, clear, dateTime, dateShort, dueInfo, copyText, safeHref, idrShort, salaryText, agoShort, todayISO } from '../dom.js';
import { labelOf, S, appById, contactsFor, CLOSED, setStatus, patchApp, trackJob, dismissJob, restoreJob, refresh, emit } from '../state.js';
import { api } from '../api.js';
import { toast, iconBtn, menu, modal, field, statusChip, chip, fitBadge } from '../ui.js';
import { contactRow, contactModal } from './contacts.js';
import { markApplied } from './applied.js';
import { prepChip, queuePrep, prepareApp, PREP_LABEL } from './prep.js';

function drawerShell(host, { label, onClose, children }) {
  clear(host);
  host.classList.add('open');
  const panel = h('aside', { class: 'drawer-panel', role: 'dialog', 'aria-label': label, 'aria-modal': 'false' }, children);
  host.append(h('div', { class: 'drawer-scrim', onclick: onClose }), panel);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } });
  return panel;
}

export function closeDrawers() {
  S.drawerApp = null; S.peek = null;
  if (/^#\/applications\/\d+/.test(location.hash)) history.replaceState(null, '', '#/applications');
  emit();
}

/* ---------- application drawer ---------- */
export function renderAppDrawer(host) {
  const a = appById(S.drawerApp);
  if (!a) { clear(host); host.classList.remove('open'); return; }
  const contacts = contactsFor(a.id);
  const apply = a.links.find((l) => l.kind === 'apply') || a.links.find((l) => l.kind === 'posting');
  const mailLinks = a.links.filter((l) => l.kind === 'email');
  const otherLinks = a.links.filter((l) => l !== apply && l.kind !== 'email');

  const statusBtn = h('button', { class: 'btn sm', type: 'button', 'aria-haspopup': 'menu', onclick: (e) => menu(e.currentTarget, S.data.statuses.map((s) => ({ label: labelOf(s), current: s === a.status, onClick: () => setStatus(a, s) })), { align: 'left' }) }, statusChip(a.status), icon('caret-down', 12));

  const head = h('header', { class: 'drawer-head' },
    h('div', { class: 'drawer-title' }, h('h2', null, a.company), h('p', { class: 'muted' }, a.role)),
    iconBtn('x', 'Close', closeDrawers),
  );
  const sub = h('div', { class: 'drawer-sub' }, statusBtn,
    a.score && a.score !== '-' && chip(`Score ${a.score}`, 'accent'),
    a.meta.workMode && a.meta.workMode !== 'unspecified' && chip(a.meta.workMode, '', 'map-pin'),
    h('span', { class: 'muted small' }, 'Added ' + dateShort(a.date)));

  /* where to apply */
  const applyBox = h('section', { class: 'block' }, h('h3', null, 'Where to apply'),
    a.status === 'Evaluated' && h('button', { class: 'btn wide done-btn', type: 'button', onclick: () => markApplied({ app: a }) }, icon('check-circle', 16), 'I already applied'),
    apply ? h('a', { class: 'btn primary wide', href: safeHref(apply.url), target: '_blank', rel: 'noopener noreferrer' }, icon('arrow-square-out', 16), a.status === 'Evaluated' ? 'Open application' : 'Open posting', h('span', { class: 'btn-sub' }, new URL(apply.url).hostname.replace(/^www\./, '')))
      : h('p', { class: 'muted small' }, 'No link saved yet.'),
    mailLinks.map((l) => h('div', { class: 'link-row' }, h('a', { class: 'btn', href: safeHref(l.url) }, icon('envelope-simple', 16), l.label), iconBtn('copy', 'Copy address', async () => { const addr = l.url.replace(/^mailto:/, '').split('?')[0]; await copyText(addr); toast(`Copied ${addr}`); }, { size: 15 }))),
    otherLinks.length > 0 && h('ul', { class: 'plain-links' }, otherLinks.map((l) => h('li', null, h('a', { href: safeHref(l.url), target: '_blank', rel: 'noopener noreferrer' }, icon('link', 14), l.label)))),
    h('button', { class: 'link-btn small', type: 'button', onclick: () => linkModal(a) }, '+ Add link'),
  );

  /* next action */
  const na = a.nextAction;
  const due = na ? dueInfo(na.due) : null;
  const nextBox = h('section', { class: 'block' }, h('h3', null, 'Next action'),
    na ? h('div', { class: 'next-action' + (na.done ? ' done' : '') },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: na.done, onchange: (e) => patchApp(a, { nextAction: { ...na, done: e.target.checked } }) }), h('span', null, na.text)),
      h('span', { class: 'due ' + due.tone }, na.done ? 'Done' : due.text),
      iconBtn('note-pencil', 'Edit next action', () => actionModal(a), { class: 'sm', size: 14 }))
      : h('button', { class: 'btn sm', type: 'button', onclick: () => actionModal(a) }, icon('plus', 14), 'Set a next action'));

  /* contacts */
  const pp = a.prep;
  const busy = pp && (pp.status === 'queued' || pp.status === 'running');
  const contactBox = h('section', { class: 'block' }, h('header', { class: 'block-head' }, h('h3', null, 'Reach out'), h('button', { class: 'btn sm ghost', type: 'button', onclick: () => contactModal(null, a.id) }, icon('plus', 14), 'Add')),
    contacts.length ? contacts.map((c) => contactRow(c)) : h('p', { class: 'muted small' }, busy ? 'Looking for contacts as part of the prep.' : 'No contacts yet.'));

  /* documents */
  const docs = a.docs;
  const docBox = h('section', { class: 'block' }, h('h3', null, 'Documents'),
    docs.length ? docs.map((d) => docRow(d)) : null,
    busy && h('p', { class: 'prep-busy small' }, icon('arrows-clockwise', 14), pp.status === 'queued' ? 'Waiting in the prep queue.' : 'Preparing the CV, cover letter and contacts. This takes a few minutes, you can leave this open.'),
    !busy && !docs.length && h('p', { class: 'muted small' }, pp?.status === 'failed' ? `The last prep failed: ${pp.error || 'unknown error'}` : pp?.status === 'skipped' ? `Prep checked this role and skipped it: ${pp.note || ''}` : 'Nothing prepared for this one yet.'),
    !busy && !docs.length && (pp?.status === 'skipped'
      ? h('div', null, h('p', { class: 'small muted' }, 'Pressing Prepare again would give the same answer. If you want to apply anyway, the CV and letter are built without the skip, and the gaps are listed in the notes.'),
        h('button', { class: 'btn sm primary', type: 'button', onclick: () => prepareApp(a, true) }, icon('file-pdf', 14), 'Prepare anyway'))
      : h('button', { class: 'btn sm primary', type: 'button', onclick: () => prepareApp(a) }, icon('file-pdf', 14), pp?.status === 'failed' ? 'Try again' : 'Prepare CV, letter and contacts')));

  /* details */
  const notes = h('textarea', { class: 'input', rows: 3, placeholder: 'Your private notes', 'aria-label': 'Notes', onblur: (e) => { if (e.target.value !== (a.notesLocal || '')) patchApp(a, { notes: e.target.value }); } }, a.notesLocal || '');
  const detail = (k, v) => v && h('div', { class: 'kv' }, h('dt', null, k), h('dd', null, v));
  const detailBox = h('section', { class: 'block' }, h('h3', null, 'Details'),
    h('dl', { class: 'kvs' }, detail('Location', a.meta.location), detail('Pay', a.meta.salary), detail('Found on', a.meta.source), a.notes && a.notes !== '-' && detail('Tracker note', a.notes)),
    field('Notes', notes));

  /* timeline */
  const note = h('input', { class: 'input', placeholder: 'Log something, e.g. "Recruiter replied"', 'aria-label': 'Add to timeline', onkeydown: async (e) => { if (e.key === 'Enter' && e.target.value.trim()) { await api.addEvent(a.id, e.target.value); await refresh(); } } });
  const timeline = h('section', { class: 'block' }, h('h3', null, 'Timeline'), note,
    h('ol', { class: 'timeline' }, a.events.map((ev) => h('li', null, h('span', { class: 'mono small muted' }, dateTime(ev.at)), h('span', null, ev.text)))));

  const panel = drawerShell(host, { label: `${a.company}, ${a.role}`, onClose: closeDrawers, children: [head, sub, h('div', { class: 'drawer-body' }, applyBox, nextBox, contactBox, docBox, detailBox, timeline)] });
  panel.querySelector('.icon-btn')?.focus();
}

function docRow(d) {
  const icn = d.kind === 'cv' ? 'file-pdf' : 'file-text';
  if (d.ext === '.pdf') return h('div', { class: 'doc' }, h('a', { class: 'doc-link', href: d.url, target: '_blank', rel: 'noopener noreferrer' }, icon(icn, 16), d.name), h('span', { class: 'muted small mono' }, Math.round(d.size / 1024) + ' KB'));
  const pre = h('pre', { class: 'doc-pre' }, 'Loading...');
  const det = h('details', { class: 'doc' }, h('summary', null, icon(icn, 16), d.name, h('span', { class: 'spacer' })), pre,
    h('button', { class: 'btn sm', type: 'button', onclick: async () => { await copyText(pre.textContent); toast('Copied.'); } }, icon('copy', 14), 'Copy text'));
  det.addEventListener('toggle', async () => { if (det.open && pre.textContent === 'Loading...') { try { pre.textContent = await (await fetch(d.url)).text(); } catch { pre.textContent = 'Could not load this file.'; } } });
  return det;
}

function actionModal(a) {
  const na = a.nextAction || { text: '', due: todayISO(), done: false };
  const text = h('input', { class: 'input', value: na.text, placeholder: 'e.g. Follow up by email' });
  const due = h('input', { class: 'input', type: 'date', value: na.due });
  modal({ title: 'Next action', body: h('div', { class: 'form' }, field('What', text), field('Due', due)),
    actions: (close) => [
      a.nextAction && h('button', { class: 'btn ghost danger', type: 'button', onclick: async () => { close(); await patchApp(a, { nextAction: null }); } }, 'Remove'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { close(); await patchApp(a, { nextAction: { text: text.value, due: due.value, done: false } }); } }, 'Save'),
    ] });
}

function linkModal(a) {
  const label = h('input', { class: 'input', placeholder: 'e.g. Company careers page' });
  const url = h('input', { class: 'input', placeholder: 'https://...', inputMode: 'url' });
  modal({ title: 'Add link', body: h('div', { class: 'form' }, field('Label', label), field('URL', url)),
    actions: (close) => [h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!/^(https?:|mailto:)/i.test(url.value.trim())) { url.focus(); toast('Enter a link that starts with https:// or mailto:', { tone: 'bad' }); return; }
        close(); await patchApp(a, { links: [...a.links, { label: label.value || 'Link', url: url.value.trim(), kind: url.value.startsWith('mailto:') ? 'email' : 'posting' }] });
      } }, 'Add')],
  });
}

/* ---------- job drawer (peek at a scanned posting) ---------- */
export function renderJobDrawer(host) {
  const j = S.data.jobs.find((x) => x.url === S.peek);
  if (!j) { clear(host); host.classList.remove('open'); return; }
  const pay = j.salary ? h('div', null, salaryText(j), j.idr && h('div', { class: 'muted small' }, `About ${idrShort(j.idr.min)} to ${idrShort(j.idr.max)} a month at today's rate`)) : null;
  const kv = (k, v) => v && h('div', { class: 'kv' }, h('dt', null, k), h('dd', null, v));

  const head = h('header', { class: 'drawer-head' }, h('div', { class: 'drawer-title' }, h('h2', null, j.title), h('p', { class: 'muted' }, j.company)), iconBtn('x', 'Close', closeDrawers));
  const sub = h('div', { class: 'drawer-sub' }, fitBadge(j), h('strong', null, { strong: 'Strong fit', possible: 'Possible fit', weak: 'Weak fit', blocked: 'Not open to you', off: 'Not a design role' }[j.bucket]), j.isNew && chip('New', 'accent'), prepChip(j), j.appliedAtCompany && chip(`You applied here: ${j.appliedAtCompany.role}`, 'good'), j.agency && chip('Agency or hidden employer', 'warn'), j.ambiguous && chip('Check the title', 'warn'));

  const actions = h('section', { class: 'block' },
    h('a', { class: 'btn primary wide', href: safeHref(j.url), target: '_blank', rel: 'noopener noreferrer' }, icon('arrow-square-out', 16), 'Open posting', h('span', { class: 'btn-sub' }, new URL(j.url).hostname.replace(/^www\./, ''))),
    h('div', { class: 'btn-row' },
      !j.tracked && !j.prep && h('button', { class: 'btn', type: 'button', onclick: () => queuePrep(j) }, icon('file-pdf', 16), 'Prepare CV, letter, contacts'),
      !j.tracked && h('button', { class: 'btn', type: 'button', onclick: () => markApplied({ job: j }) }, icon('check-circle', 16), 'I already applied'),
      !j.tracked && h('button', { class: 'btn', type: 'button', onclick: () => trackJob(j) }, icon('plus', 16), 'Track it'),
      j.dismissed ? h('button', { class: 'btn', type: 'button', onclick: () => restoreJob(j) }, icon('arrow-counter-clockwise', 16), 'Restore') : !j.tracked && h('button', { class: 'btn', type: 'button', onclick: () => dismissJob(j) }, icon('eye-slash', 16), 'Dismiss')));

  const why = h('section', { class: 'block' }, h('h3', null, 'Why this fit estimate'), h('p', { class: 'muted small' }, 'Rule-based, from your settings. It is not an AI read of the full job post.'),
    h('ul', { class: 'reasons' }, j.reasons.map((r) => h('li', null, h('span', { class: 'mono pts ' + (r.t.startsWith('-') ? 'neg' : r.t === '0' ? 'zero' : 'pos') }, r.t), h('span', null, r.m)))),
    h('div', { class: 'reasons-total' }, h('span', null, 'Estimate'), h('strong', { class: 'mono' }, `${j.score} / 100`)));

  const details = h('section', { class: 'block' }, h('h3', null, 'Details'),
    h('dl', { class: 'kvs' }, kv('Location', j.location || 'Not stated'), kv('Country', j.country), kv('Access', j.accessLabel), kv('Level', { junior: 'Junior', mid: 'Mid', senior: 'Senior', lead: 'Lead or manager', staff: 'Staff, Principal or Head' }[j.level]), kv('Posted', j.posted ? `${dateShort(j.posted)} (${agoShort(j.daysAgo)})` : 'Not stated'), kv('Found on', j.source), pay && kv('Pay listed', pay), j.tracked && kv('Tracking', 'Already in Applications')));

  const panel = drawerShell(host, { label: `${j.title} at ${j.company}`, onClose: closeDrawers, children: [head, sub, h('div', { class: 'drawer-body' }, actions, why, details)] });
  panel.querySelector('.icon-btn')?.focus();
}
