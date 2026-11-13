import { h, icon, dateTime } from './dom.js';
import { S, refresh } from './state.js';
import { api } from './api.js';
import { toast, chip } from './ui.js';
import { openPrefs } from './views/prefs.js';

let timer = null;
const fmtClock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function paintScan() {
  const st = S.scan || {};
  for (const el of document.querySelectorAll('[data-scan]')) {
    const k = el.dataset.scan;
    if (k === 'elapsed') el.textContent = st.running ? fmtClock(Date.now() - st.startedAt) : '';
    else if (k === 'line') el.textContent = st.lastLine || 'Starting...';
    else if (k === 'log') el.textContent = (st.tail || []).join('\n');
    else if (k === 'side') {
      el.textContent = st.running ? `Scanning ${fmtClock(Date.now() - st.startedAt)}` : S.data?.scan.last ? `Last scan ${dateTime(S.data.scan.last.at)}` : 'Never scanned';
      el.parentElement.classList.toggle('busy', !!st.running);
    }
  }
  for (const el of document.querySelectorAll('[data-scan-show]')) el.hidden = el.dataset.scanShow === 'running' ? !st.running : !!st.running;
  for (const b of document.querySelectorAll('[data-scan-disable]')) b.disabled = !!st.running;
}

async function poll() {
  clearTimeout(timer);
  let st;
  try { st = await api.scanStatus(); } catch { timer = setTimeout(poll, 3000); return; }
  const wasRunning = S.scan?.running;
  S.scan = st;
  paintScan();
  if (st.running) { timer = setTimeout(poll, 1500); return; }
  if (wasRunning) {
    await refresh();
    const l = st.last;
    if (l?.error) toast('Scan stopped: ' + l.error, { tone: 'bad' });
    else toast(l.newCount ? `Scan finished: ${l.newCount} new ${l.newCount === 1 ? 'posting' : 'postings'}.` : 'Scan finished: nothing new since the last run.', l.newCount ? { label: 'Show new', onClick: () => { S.ui.discover.newOnly = true; S.ui.discover.tab = 'open'; location.hash = '#/discover'; } } : {});
  }
}

export async function runScan(since, scope) {
  try {
    S.scan = await api.startScan(since, scope);
    paintScan();
    poll();
  } catch (e) { toast(e.message, { tone: 'bad' }); }
}

export async function initScan() {
  try { S.scan = await api.scanStatus(); } catch { S.scan = { running: false }; }
  paintScan();
  if (S.scan.running) poll();
}

export function scanPanel() {
  const s = S.data.settings;
  const last = S.data.scan.last;
  const sel = h('select', { class: 'select', id: 'since', 'aria-label': 'How far back to look' },
    h('option', { value: '' }, `Your setting (${s.maxAgeDays || 45} days)`), h('option', { value: '7' }, 'Last 7 days'), h('option', { value: '14' }, 'Last 14 days'), h('option', { value: '30' }, 'Last 30 days'));
  const scopeSel = h('select', { class: 'select', id: 'scope', 'aria-label': 'Where to look' },
    h('option', { value: 'all' }, 'Everywhere'), h('option', { value: 'local' }, 'Indonesia only'), h('option', { value: 'intl' }, 'International only'));
  scopeSel.value = S.ui.scanScope || 'all';
  scopeSel.addEventListener('change', () => { S.ui.scanScope = scopeSel.value; });
  const idle = h('div', { 'data-scan-show': 'idle' },
    h('div', { class: 'scan-row' }, h('label', { for: 'scope', class: 'small muted' }, 'Where'), scopeSel, h('label', { for: 'since', class: 'small muted' }, 'Look back'), sel,
      h('button', { class: 'btn primary', type: 'button', 'data-scan-disable': '', onclick: () => runScan(sel.value || undefined, scopeSel.value) }, icon('arrows-clockwise', 16), 'Run scan')),
    last && h('p', { class: 'small muted scan-last' }, last.error ? `Last run failed: ${last.error}` : `Last run ${dateTime(last.at)}, took ${Math.round(last.seconds / 60) || '<1'} min${last.scope && last.scope !== 'all' ? ', ' + ({ local: 'Indonesia only', intl: 'international only' }[last.scope]) : ''}. ${last.newCount} new, ${last.totalAdded} matching in total.${last.partial ? ' Some boards failed to respond.' : ''}`));
  const busy = h('div', { 'data-scan-show': 'running', hidden: true },
    h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Scan in progress' }, h('span')),
    h('p', { class: 'scan-line' }, h('strong', null, 'Scanning '), h('span', { class: 'mono', 'data-scan': 'elapsed' }), h('span', { class: 'muted small', 'data-scan': 'line' })),
    h('details', { class: 'log' }, h('summary', null, 'Show log'), h('pre', { 'data-scan': 'log' })));
  const box = h('section', { class: 'card scan-card' },
    h('div', { class: 'scan-head' }, h('div', null, h('h2', null, 'Rescan'), h('p', { class: 'small muted' }, 'Runs the career-ops scanner with the filters you already settled. Pick Indonesia only for local boards, or International for remote boards, global companies and Singapore, Malaysia, Australia.')),
      h('div', { class: 'filters-line' },
        chip(`${s.keywords.length} role ${s.keywords.length === 1 ? 'title' : 'titles'}`, '', 'target'), chip('Remote first, international, Indonesia OK', '', 'globe'),
        chip(`Min Rp${s.minIdr / 1e6}jt a month`, '', 'currency-circle-dollar'), chip(`Posted within ${s.maxAgeDays} days`, '', 'calendar-blank'), chip(`${s.enabledSources} sources on`, '', 'tray'),
        s.customized && chip('Adjusted', 'accent'),
        h('button', { class: 'btn sm', type: 'button', onclick: openPrefs }, icon('sliders-horizontal', 14), 'Adjust'))),
    idle, busy);
  queueMicrotask(paintScan);
  return box;
}
