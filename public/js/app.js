import { h, icon, clear } from './dom.js';
import { S, subscribe, refresh, bindToast, emit } from './state.js';
import { toast, modal, closeMenu } from './ui.js';
import { initScan, paintScan } from './scan.js';
import { renderToday, renderApps, addAppModal } from './views/today.js';
import { renderDiscover } from './views/discover.js';
import { renderContacts } from './views/contacts.js';
import { renderInsights } from './views/insights.js';
import { renderAppDrawer, renderJobDrawer, closeDrawers } from './views/drawer.js';

bindToast(toast);
const ROUTES = { today: ['Today', 'house', renderToday], applications: ['Applications', 'kanban', renderApps], discover: ['Discover', 'magnifying-glass', renderDiscover], contacts: ['Contacts', 'address-book', renderContacts], insights: ['Insights', 'chart-bar', renderInsights] };
const main = document.getElementById('main');
const nav = document.getElementById('nav');
const drawer = document.getElementById('drawer');

const route = () => { const m = /^#\/(\w+)(?:\/(\d+))?/.exec(location.hash); return { name: ROUTES[m?.[1]] ? m[1] : 'today', id: m?.[2] }; };

function paintNav() {
  clear(nav);
  const cur = route().name;
  for (const [k, [label, ic]] of Object.entries(ROUTES)) {
    let badge = '';
    if (S.data) { if (k === 'applications') badge = S.data.apps.filter((a) => !['Rejected', 'Discarded', 'SKIP'].includes(a.status)).length; if (k === 'discover') badge = S.data.jobs.filter((j) => j.isNew && j.digital && j.access !== 'restricted').length || ''; }
    nav.append(h('a', { href: '#/' + k, class: 'nav-item' + (cur === k ? ' on' : ''), 'aria-current': cur === k ? 'page' : null }, icon(ic, 18), h('span', null, label), badge !== '' && h('span', { class: 'n' }, String(badge))));
  }
}

let lastKey = '';
function render() {
  const r = route();
  if (r.id && S.data && !S.drawerApp && r.name === 'applications') S.drawerApp = Number(r.id);
  paintNav();
  if (S.loading) { main.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'skeleton-row' }), h('div', { class: 'skeleton-row' }), h('div', { class: 'skeleton-row' }))); return; }
  if (!S.data) { main.replaceChildren(h('div', { class: 'empty' }, h('h3', null, 'Could not load your data'), h('p', null, S.error || 'Unknown error'), h('button', { class: 'btn', onclick: () => refresh() }, 'Try again'))); return; }
  const scroll = main.scrollTop;
  const root = h('div', { class: 'page' });
  ROUTES[r.name][2](root);
  main.replaceChildren(root);
  main._keys = root._keys;
  document.title = `${ROUTES[r.name][0]} · Job HQ`;
  if (lastKey === r.name) main.scrollTop = scroll; else main.scrollTop = 0;
  lastKey = r.name;
  if (S.drawerApp) renderAppDrawer(drawer); else if (S.peek) renderJobDrawer(drawer); else { clear(drawer); drawer.classList.remove('open'); }
  paintScan();
}

subscribe(render);
window.addEventListener('hashchange', () => { S.drawerApp = null; S.peek = null; render(); });

document.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t.matches?.('input,textarea,select') || t.isContentEditable;
  if (e.key === 'Escape' && (S.drawerApp || S.peek) && !document.getElementById('modal').classList.contains('open')) { closeDrawers(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || document.getElementById('modal').classList.contains('open')) return;
  if (e.key === '/') { const s = document.getElementById('search'); if (s) { e.preventDefault(); s.focus(); } return; }
  if (e.key === '?') { showKeys(); return; }
  const go = { g: null };
  if (main._keys?.(e)) { e.preventDefault(); return; }
  const map = { '1': 'today', '2': 'applications', '3': 'discover', '4': 'contacts', '5': 'insights' };
  if (map[e.key]) location.hash = '#/' + map[e.key];
  if (e.key === 'n' && route().name === 'applications') addAppModal();
});

function showKeys() {
  const row = (k, d) => h('div', { class: 'kv' }, h('dt', { class: 'mono' }, k), h('dd', null, d));
  modal({ title: 'Keyboard shortcuts', body: h('dl', { class: 'kvs' }, row('1 to 5', 'Go to Today, Applications, Discover, Contacts, Insights'), row('/', 'Search'), row('j / k', 'Next / previous role in Discover'), row('o', 'Open the focused posting'), row('t', 'Track the focused role'), row('a', 'Mark the focused role as already applied'), row('x', 'Dismiss the focused role'), row('n', 'New application (on Applications)'), row('Esc', 'Close panel')), actions: (c) => h('button', { class: 'btn primary', onclick: c }, 'Got it') });
}
document.getElementById('keys-btn').addEventListener('click', showKeys);
document.getElementById('scan-side').addEventListener('click', () => { location.hash = '#/discover'; });

render();
await refresh();
initScan();
let tick = 0;
setInterval(() => { tick++; const busy = S.data?.prep?.active; if (!document.hidden && !S.scan?.running && (busy || tick % 12 === 0)) refresh(); }, 5000);
