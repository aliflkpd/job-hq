import { h, icon, clear, safeHref, agoShort, salaryText, idrShort, debounce } from '../dom.js';
import { S, jobsIn, trackJob, dismissJob, restoreJob, refresh, emit } from '../state.js';
import { api } from '../api.js';
import { iconBtn, chip, fitBadge, segmented, emptyState, toast } from '../ui.js';
import { scanPanel } from '../scan.js';
import { markApplied } from './applied.js';
import { prepChip, queuePrep } from './prep.js';

const MODES = [['any', 'Any work type'], ['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site'], ['unspecified', 'Not stated']];
const SORTS = { fit: (a, b) => b.score - a.score || (a.daysAgo ?? 99) - (b.daysAgo ?? 99), new: (a, b) => (a.daysAgo ?? 999) - (b.daysAgo ?? 999) || b.score - a.score, company: (a, b) => a.company.localeCompare(b.company) };

const TAB_COPY = {
  open: { empty: ['target', 'Nothing open to you right now', 'Try a rescan, or look at the Needs a visa tab.'], note: 'In Indonesia or remote from anywhere, and a real digital design role.' },
  visa: { empty: ['globe', 'No visa-sponsor roles', 'Singapore, Malaysia and Australia roles show up here after a scan.'], note: 'Overseas roles. Posts rarely say if they sponsor, so confirm with the recruiter. Singapore Employment Pass needs about SGD 5,600 a month or more.' },
  filtered: { empty: ['funnel', 'Nothing filtered out', ''], note: 'Hidden by your settings: limited to residents of the US, Europe and other regions, or not a digital design job. Track one anyway if you disagree.' },
  dismissed: { empty: ['eye-slash', 'Nothing dismissed', 'Roles you dismiss end up here so you can restore them.'], note: 'Roles you dismissed.' },
};

export function renderDiscover(root) {
  const U = S.ui.discover;
  const listHost = h('div', { class: 'job-list', role: 'list' });
  const tabsHost = h('div', { class: 'tabs', role: 'tablist' });
  const noteHost = h('p', { class: 'tab-note small muted' });
  const countHost = h('span', { class: 'muted small', 'aria-live': 'polite' });
  let rows = [];
  let focusIdx = -1;

  const applyFilters = (arr) => {
    const q = U.q.trim().toLowerCase();
    return arr.filter((j) => {
      if (q && ![j.title, j.company, j.location, j.source].join(' ').toLowerCase().includes(q)) return false;
      if (U.within && (j.daysAgo === null || j.daysAgo > U.within)) return false;
      if (U.newOnly && !j.isNew) return false;
      if (U.hasPay && !j.salary) return false;
      if (U.mode && U.mode !== 'any' && j.mode !== U.mode) return false;
      return true;
    }).sort(SORTS[U.sort]);
  };

  const paintTabs = () => {
    clear(tabsHost);
    for (const [k, label] of [['open', 'Open to me'], ['visa', 'Needs a visa'], ['filtered', 'Filtered out'], ['dismissed', 'Dismissed']]) {
      const n = jobsIn(k).length;
      tabsHost.append(h('button', { class: 'tab' + (U.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(U.tab === k), type: 'button', onclick: () => { U.tab = k; U.limit = 80; paintTabs(); paintList(); } }, label, h('span', { class: 'n' }, String(n))));
    }
  };

  const row = (j, i) => {
    const mainChips = [prepChip(j), j.appliedAtCompany && chip('Applied here before', 'good'), j.isNew && chip('New', 'accent'), j.level === 'staff' && chip('Staff or above', 'muted'), j.level === 'lead' && chip('Lead', 'muted'), j.agency && chip('Agency or hidden', 'warn'), j.ambiguous && chip('Check title', 'warn'), j.belowMin && chip('Below your floor', 'bad')].filter(Boolean);
    const pay = j.salary ? h('div', { class: 'pay' }, h('span', null, salaryText(j)), j.idr && h('span', { class: 'muted small' }, `${idrShort(j.idr.min)} to ${idrShort(j.idr.max)} a month`)) : h('span', { class: 'muted' }, '');
    const reason = U.tab === 'filtered' ? (j.offReason || `Only for residents of ${j.regionLabel}`) : null;
    const el = h('div', { class: 'job' + (j.isNew ? ' is-new' : ''), role: 'listitem', tabindex: '0', dataset: { i: i }, 'aria-label': `${j.title} at ${j.company}`,
      onclick: (e) => { if (e.target.closest('a,button')) return; open(j); },
      onkeydown: (e) => { if (e.key === 'Enter' && !e.target.closest('a,button')) open(j); } },
      fitBadge(j),
      h('div', { class: 'job-main' }, h('div', { class: 'job-title' }, h('button', { class: 'link-btn title', type: 'button', onclick: () => open(j) }, j.title), mainChips),
        h('div', { class: 'muted small' }, j.company, ' on ', j.source), reason && h('div', { class: 'small reason' }, reason)),
      h('div', { class: 'job-where' }, h('span', { class: 'loc' }, j.location || 'Location not stated'), h('span', { class: 'access ' + j.access }, j.accessLabel)),
      h('div', { class: 'job-when muted small' }, j.daysAgo === null ? '' : agoShort(j.daysAgo)),
      pay,
      h('div', { class: 'job-actions' },
        h('a', { class: 'icon-btn', href: safeHref(j.url), target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open posting for ${j.title}`, title: 'Open posting (o)' }, icon('arrow-square-out', 16)),
        U.tab === 'dismissed' ? iconBtn('arrow-counter-clockwise', 'Restore', () => restoreJob(j)) : [!j.prep && U.tab !== 'filtered' && iconBtn('file-pdf', 'Prepare CV, letter and contacts (p)', () => queuePrep(j)), iconBtn('check-circle', 'I already applied (a)', () => markApplied({ job: j })), iconBtn('plus', 'Track in Applications (t)', () => trackJob(j)), U.tab !== 'filtered' && iconBtn('eye-slash', 'Dismiss (x)', () => dismissJob(j))]));
    return el;
  };

  const open = (j) => { S.peek = j.url; S.drawerApp = null; emit(); };

  const paintList = () => {
    clear(listHost); clear(noteHost);
    const all = jobsIn(U.tab);
    rows = applyFilters(all);
    noteHost.textContent = TAB_COPY[U.tab].note;
    countHost.textContent = rows.length === all.length ? `${rows.length} roles` : `${rows.length} of ${all.length} roles`;
    if (!rows.length) {
      const [ic, t, b] = TAB_COPY[U.tab].empty;
      listHost.append(emptyState(ic, all.length ? 'No roles match these filters' : t, all.length ? 'Loosen the search or turn a filter off.' : b, all.length ? h('button', { class: 'btn', type: 'button', onclick: () => { Object.assign(U, { q: '', within: 0, newOnly: false, hasPay: false, mode: 'any' }); emit(); } }, 'Clear filters') : null));
      return;
    }
    rows.slice(0, U.limit).forEach((j, i) => listHost.append(row(j, i)));
    if (rows.length > U.limit) listHost.append(h('button', { class: 'btn wide-more', type: 'button', onclick: () => { U.limit += 120; paintList(); } }, `Show ${Math.min(120, rows.length - U.limit)} more`));
  };

  const search = h('input', { class: 'input search', type: 'search', id: 'search', placeholder: 'Search title, company or place', value: U.q, 'aria-label': 'Search roles', oninput: debounce((e) => { U.q = e.target.value; U.limit = 80; paintList(); }) });
  const within = h('select', { class: 'select', 'aria-label': 'Posted within', onchange: (e) => { U.within = Number(e.target.value); paintList(); } }, [[0, 'Posted any time'], [7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days']].map(([v, l]) => h('option', { value: v, selected: U.within === v }, l)));
  const mode = h('select', { class: 'select', 'aria-label': 'Work type', onchange: (e) => { U.mode = e.target.value; paintList(); } }, MODES.map(([v, l]) => h('option', { value: v, selected: (U.mode || 'any') === v }, l)));
  const sort = h('select', { class: 'select', 'aria-label': 'Sort by', onchange: (e) => { U.sort = e.target.value; paintList(); } }, [['fit', 'Best fit first'], ['new', 'Newest first'], ['company', 'Company A to Z']].map(([v, l]) => h('option', { value: v, selected: U.sort === v }, l)));
  const toggle = (label, on, fn, ic) => h('button', { class: 'toggle' + (on ? ' on' : ''), type: 'button', 'aria-pressed': String(on), onclick: fn }, ic && icon(ic, 14), label);
  const newCount = S.data.jobs.filter((j) => j.isNew).length;
  const chips = h('div', { class: 'chip-row' },
    toggle(`New${newCount ? ' (' + newCount + ')' : ''}`, U.newOnly, () => { U.newOnly = !U.newOnly; emit(); }, 'sparkle'),
    toggle('Has pay listed', U.hasPay, () => { U.hasPay = !U.hasPay; emit(); }, 'currency-circle-dollar'),
    toggle('Hide Staff and above', S.data.filters.hideStaff, async () => { await api.setFilters({ hideStaff: !S.data.filters.hideStaff }); await refresh(); }, 'sliders-horizontal'),
    newCount > 0 && h('button', { class: 'link-btn small', type: 'button', onclick: async () => { await api.seen(); await refresh(); toast('Marked everything as seen.'); } }, 'Mark all seen'));

  paintTabs(); paintList();
  root.append(
    h('header', { class: 'page-head' }, h('div', null, h('h1', null, 'Discover'), h('p', { class: 'sub' }, `${S.data.jobs.length} postings passed your filters in the last scans. Sorted by a plain-rules fit estimate, not by AI.`))),
    scanPanel(),
    tabsHost, noteHost,
    h('div', { class: 'toolbar' }, search, mode, within, sort, countHost), chips,
    listHost,
  );

  // list keyboard shortcuts: j/k move, o open posting, t track, x dismiss
  root._keys = (e) => {
    const items = [...listHost.querySelectorAll('.job')];
    if (!items.length) return false;
    const cur = items.indexOf(document.activeElement.closest?.('.job'));
    const focusAt = (i) => { const n = items[Math.max(0, Math.min(items.length - 1, i))]; n.focus(); n.scrollIntoView({ block: 'nearest' }); };
    if (e.key === 'j') { focusAt(cur + 1); return true; }
    if (e.key === 'k') { focusAt(cur < 0 ? 0 : cur - 1); return true; }
    if (cur < 0) return false;
    const j = rows[Number(items[cur].dataset.i)];
    if (e.key === 'o') { window.open(safeHref(j.url), '_blank', 'noopener'); return true; }
    if (e.key === 'p' && !j.prep && U.tab !== 'filtered' && U.tab !== 'dismissed') { queuePrep(j); return true; }
    if (e.key === 'a' && U.tab !== 'dismissed') { markApplied({ job: j }); return true; }
    if (e.key === 't' && U.tab !== 'dismissed') { trackJob(j); return true; }
    if (e.key === 'x' && (U.tab === 'open' || U.tab === 'visa')) { dismissJob(j); return true; }
    return false;
  };
}
