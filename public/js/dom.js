// Tiny DOM helpers. Everything user or scan-derived goes through textContent, never innerHTML.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'for') el.htmlFor = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && !['list', 'form', 'type'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

export function icon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ic');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '/sprite.svg#i-' + name);
  svg.append(use);
  return svg;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const todayISO = () => new Date().toLocaleDateString('en-CA');
export function dateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function dateTime(iso) {
  if (!iso) return '';
  if (iso.length === 10) return dateShort(iso);
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function longToday() {
  const d = new Date();
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]}`;
}
export function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00'), b = new Date(isoB + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}
export function dueInfo(iso) {
  if (!iso) return { text: 'No date', tone: 'none' };
  const n = daysBetween(iso, todayISO());
  if (n < 0) return { text: n === -1 ? 'Yesterday' : `${-n} days overdue`, tone: 'late', n };
  if (n === 0) return { text: 'Today', tone: 'today', n };
  if (n === 1) return { text: 'Tomorrow', tone: 'soon', n };
  if (n <= 7) return { text: `In ${n} days`, tone: 'soon', n };
  return { text: dateShort(iso), tone: 'later', n };
}
export function agoShort(days) {
  if (days == null) return '';
  if (days === 0) return 'Today';
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}
export function idrShort(n) {
  if (n == null) return '';
  if (n >= 1e9) return `Rp${(n / 1e9).toFixed(1).replace(/\.0$/, '')}M`;
  return `Rp${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, '').replace('.', ',')}jt`;
}
export function salaryText(j) {
  if (!j.salary) return '';
  const k = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : n);
  return `${j.salary.cur} ${k(j.salary.min)} to ${k(j.salary.max)}`;
}
export function safeHref(u) { return /^(https?:|mailto:|tel:)/i.test(u || '') ? u : '#'; }
export function plural(n, one, many) { return `${n} ${n === 1 ? one : many || one + 's'}`; }

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

export function debounce(fn, ms = 120) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
