import { h, icon, clear } from './dom.js';
import { labelOf } from './state.js';

/* ---------- toast ---------- */
let toastHost;
export function toast(message, { label, onClick, tone } = {}) {
  toastHost ||= document.getElementById('toasts');
  const t = h('div', { class: 'toast' + (tone ? ' ' + tone : ''), role: 'status' },
    h('span', null, message),
    label && h('button', { class: 'toast-act', onclick: () => { onClick?.(); t.remove(); } }, label),
    h('button', { class: 'icon-btn sm', 'aria-label': 'Dismiss', onclick: () => t.remove() }, icon('x', 14)),
  );
  toastHost.append(t);
  setTimeout(() => t.remove(), label ? 9000 : 5000);
}

/* ---------- small building blocks ---------- */
export function iconBtn(name, label, onclick, extra = {}) {
  return h('button', { class: 'icon-btn' + (extra.class ? ' ' + extra.class : ''), type: 'button', 'aria-label': label, title: label, onclick }, icon(name, extra.size || 16));
}

export function chip(text, tone = '', ic) {
  return h('span', { class: 'chip' + (tone ? ' ' + tone : '') }, ic && icon(ic, 12), text);
}

export function statusChip(status) {
  const tone = { Applied: 'accent', Responded: 'good', Assessment: 'good', Interview: 'good', Offer: 'good', Hired: 'good', Rejected: 'muted', SKIP: 'muted', Discarded: 'muted', Evaluated: '' }[status] || '';
  return h('span', { class: 'chip status ' + tone }, labelOf(status));
}

export function fitBadge(job) {
  const b = job.bucket;
  const label = { strong: 'Strong fit', possible: 'Possible fit', weak: 'Weak fit', blocked: 'Not open to you', off: 'Not a design role' }[b];
  return h('span', { class: 'fit ' + b, role: 'img', 'aria-label': `${label}, estimate ${job.score} out of 100`, title: `${label} (${job.score}/100)` }, String(job.score));
}

export function segmented(options, value, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const o of options) {
    wrap.append(h('button', { type: 'button', class: o.value === value ? 'on' : '', 'aria-pressed': String(o.value === value), onclick: () => onChange(o.value) }, o.label, o.count != null && h('span', { class: 'n' }, String(o.count))));
  }
  return wrap;
}

export function emptyState(ic, title, body, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, icon(ic, 22)), h('h3', null, title), body && h('p', null, body), action);
}

export function skeletonRows(n = 6) {
  return h('div', { class: 'skeleton-list', 'aria-hidden': 'true' }, Array.from({ length: n }, () => h('div', { class: 'skeleton-row' })));
}

/* ---------- popover menu ---------- */
let openMenu = null;
export function closeMenu() { openMenu?.remove(); openMenu = null; document.removeEventListener('mousedown', outside, true); }
function outside(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }

export function menu(anchor, items, { align = 'right' } = {}) {
  closeMenu();
  const m = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (it.sep) { m.append(h('div', { class: 'menu-sep' })); continue; }
    const b = h('button', { class: 'menu-item' + (it.current ? ' current' : ''), role: 'menuitem', type: 'button', onclick: () => { closeMenu(); it.onClick(); } }, it.icon && icon(it.icon, 15), h('span', null, it.label), it.current && icon('check', 14));
    m.append(b);
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, hgt = m.offsetHeight;
  let left = align === 'right' ? r.right - w : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  let top = r.bottom + 6;
  if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - 6);
  Object.assign(m.style, { left: left + 'px', top: top + 'px' });
  openMenu = m;
  setTimeout(() => document.addEventListener('mousedown', outside, true));
  m.addEventListener('keydown', (e) => {
    const btns = [...m.querySelectorAll('button')];
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); anchor.focus(); }
  });
  (m.querySelector('.current') || m.querySelector('button'))?.focus();
  return m;
}

/* ---------- modal ---------- */
export function modal({ title, body, actions, wide = false, onClose }) {
  const prev = document.activeElement;
  const host = document.getElementById('modal');
  clear(host);
  const close = () => { clear(host); host.classList.remove('open'); document.removeEventListener('keydown', onKey, true); prev?.focus?.(); onClose?.(); };
  const dlg = h('div', { class: 'dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', null, h('h2', null, title), iconBtn('x', 'Close', close)),
    h('div', { class: 'dialog-body' }, body),
    actions && h('footer', null, actions(close)),
  );
  host.append(h('div', { class: 'scrim', onclick: close }), dlg);
  host.classList.add('open');
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = [...dlg.querySelectorAll('button,input,select,textarea,a[href]')].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => (dlg.querySelector('input,textarea,select') || dlg.querySelector('button'))?.focus(), 30);
  return close;
}

export function field(label, control, hint) {
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint && h('p', { class: 'hint' }, hint));
}
