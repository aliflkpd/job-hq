import { h, idrShort, safeHref } from '../dom.js';
import { S, emit } from '../state.js';

const bar = (n, max, cls = '') => h('span', { class: 'bar ' + cls }, h('i', { style: { width: Math.max(2, (n / Math.max(1, max)) * 100) + '%' } }));

export function renderInsights(root) {
  const I = S.data.insights;
  const fmax = I.funnel[0].n;
  const funnel = h('ol', { class: 'funnel' }, I.funnel.map((f) => h('li', null, h('div', { class: 'f-top' }, h('span', null, f.label), h('strong', { class: 'mono' }, f.n.toLocaleString())), bar(f.n, fmax), h('span', { class: 'small muted' }, f.hint))));
  const rmax = Math.max(...I.regionCounts.map((r) => r.n), 1);
  const regions = h('ul', { class: 'rows' }, I.regionCounts.map((r) => h('li', null, h('span', null, r.label), bar(r.n, rmax), h('strong', { class: 'mono' }, String(r.n)))));
  const smax = Math.max(...I.sources.map((s) => s.n), 1);
  const sources = h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['Source', 'Design roles', 'Open to you', 'Strong'].map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', null, I.sources.map((s) => h('tr', null, h('td', null, s.label), h('td', { class: 'mono' }, String(s.n)), h('td', { class: 'mono' }, String(s.open)), h('td', { class: 'mono' }, String(s.strong))))));
  const wmax = Math.max(...I.weeks.map((w) => w.n), 1);
  const weeks = h('ul', { class: 'rows' }, I.weeks.map((w) => h('li', null, h('span', null, w.label), bar(w.n, wmax), h('strong', { class: 'mono' }, `${w.open}/${w.n}`))));
  const pay = I.withPay.length ? h('ul', { class: 'rows pay-rows' }, I.withPay.map((p) => h('li', null, h('a', { href: safeHref(p.url), target: '_blank', rel: 'noopener noreferrer' }, `${p.company}, ${p.title}`), h('span', { class: 'mono small' }, p.raw), h('span', { class: 'muted small' }, `about ${idrShort(p.idrMax)} a month`)))) : h('p', { class: 'muted small' }, 'No open roles list pay.');
  const comp = I.topCompanies.length ? h('ul', { class: 'rows' }, I.topCompanies.map((c) => h('li', null, h('span', null, c.company), bar(c.n, I.topCompanies[0].n), h('strong', { class: 'mono' }, String(c.n))))) : null;

  root.append(
    h('header', { class: 'page-head' }, h('div', null, h('h1', null, 'Insights'), h('p', { class: 'sub' }, `What the scanner has found, and where it narrows down. Exchange rate ${S.data.rates.live ? 'is live' : 'is a saved estimate'}: 1 USD is about Rp${S.data.rates.usd.toLocaleString()}.`))),
    h('div', { class: 'cols even' },
      h('section', { class: 'card' }, h('h2', null, 'From all postings to applied'), funnel),
      h('div', { class: 'stack' },
        h('section', { class: 'card' }, h('h2', null, 'Where the design roles are'), regions, h('p', { class: 'small muted' }, `${I.hiddenBlocked} design roles are limited to residents of other regions and ${I.hiddenOff} were hardware or non-digital, so both are hidden by default.`)),
        h('section', { class: 'card' }, h('h2', null, 'When they were posted'), h('p', { class: 'small muted' }, 'Open to you / all design roles'), weeks, I.undated > 0 && h('p', { class: 'small muted' }, `${I.undated} have no posting date.`)))),
    h('div', { class: 'cols even' },
      h('section', { class: 'card' }, h('h2', null, 'Which boards pay off'), sources),
      h('div', { class: 'stack' },
        h('section', { class: 'card' }, h('h2', null, 'Highest listed pay among open roles'), pay),
        comp && h('section', { class: 'card' }, h('h2', null, 'Companies with several open roles'), comp))),
  );
}
