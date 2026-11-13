import { h, icon, clear, debounce } from '../dom.js';
import { S, refresh } from '../state.js';
import { api } from '../api.js';
import { modal, field, toast } from '../ui.js';

const AGES = [7, 14, 21, 30, 45, 60, 90];

export async function openPrefs() {
  let data;
  try { data = await api.prefs(); } catch (e) { toast(e.message, { tone: 'bad' }); return; }
  const d = data.defaults;
  const eff = data.effective;
  const st = { keywords: [...eff.keywords], maxAgeDays: eff.maxAgeDays, minJt: Math.round(eff.minIdr / 1e6), disabled: new Set(eff.disabled) };

  /* role keywords */
  const kwHost = h('div', { class: 'tags' });
  const kwInput = h('input', { class: 'input', placeholder: 'Add a title, e.g. Motion Designer, then press Enter', 'aria-label': 'Add role keyword' });
  const paintKw = () => {
    clear(kwHost);
    for (const k of st.keywords) kwHost.append(h('span', { class: 'tag' }, k, h('button', { type: 'button', 'aria-label': `Remove ${k}`, onclick: () => { st.keywords = st.keywords.filter((x) => x !== k); paintKw(); } }, icon('x', 12))));
    if (!st.keywords.length) kwHost.append(h('span', { class: 'small muted' }, 'No keywords: the defaults are used.'));
  };
  kwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = kwInput.value.trim(); if (v && !st.keywords.some((k) => k.toLowerCase() === v.toLowerCase())) { st.keywords.push(v); paintKw(); } kwInput.value = ''; } });
  paintKw();

  /* age + pay */
  const age = h('select', { class: 'select', style: { width: '100%' } }, [...new Set([...AGES, st.maxAgeDays])].sort((a, b) => a - b).map((n) => h('option', { value: n, selected: n === st.maxAgeDays }, `${n} days`)));
  age.addEventListener('change', () => { st.maxAgeDays = Number(age.value); });
  const pay = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: String(st.minJt), inputMode: 'numeric' });
  pay.addEventListener('input', () => { st.minJt = Math.max(0, Number(pay.value) || 0); });

  /* sources */
  const mk = (names, label) => {
    const q = h('input', { class: 'input search', type: 'search', placeholder: `Search ${label.toLowerCase()}`, 'aria-label': `Search ${label}` });
    const list = h('div', { class: 'src-list' });
    const count = h('span', { class: 'small muted' });
    const paint = () => {
      clear(list);
      const needle = q.value.trim().toLowerCase();
      for (const n of names.filter((x) => !needle || x.toLowerCase().includes(needle))) {
        list.append(h('label', { class: 'src' }, h('input', { type: 'checkbox', checked: !st.disabled.has(n), onchange: (e) => { e.target.checked ? st.disabled.delete(n) : st.disabled.add(n); count.textContent = tally(); } }), h('span', null, n)));
      }
      count.textContent = tally();
    };
    const tally = () => `${names.filter((n) => !st.disabled.has(n)).length} of ${names.length} on`;
    q.addEventListener('input', debounce(paint, 80));
    const all = (on) => { for (const n of names) on ? st.disabled.delete(n) : st.disabled.add(n); paint(); };
    paint();
    return h('div', { class: 'src-group' },
      h('div', { class: 'src-head' }, h('h4', null, label), count, h('span', { class: 'spacer' }),
        h('button', { class: 'link-btn small', type: 'button', onclick: () => all(true) }, 'All on'), h('button', { class: 'link-btn small', type: 'button', onclick: () => all(false) }, 'All off')),
      names.length > 12 && q, list);
  };

  const P = S.data.prep;
  const ap = { auto: P.auto, max: P.max, minScore: P.minScore, name: P.name || '' };
  const autoBox = h('input', { type: 'checkbox', checked: ap.auto, onchange: (e) => { ap.auto = e.target.checked; } });
  const maxIn = h('input', { class: 'input', type: 'number', min: '1', max: '15', value: String(ap.max), oninput: (e) => { ap.max = Number(e.target.value) || 1; } });
  const fitIn = h('input', { class: 'input', type: 'number', min: '40', max: '100', value: String(ap.minScore), oninput: (e) => { ap.minScore = Number(e.target.value) || 70; } });
  const nameIn = h('input', { class: 'input', value: ap.name, placeholder: 'Name used on CV files, e.g. Jane Doe', oninput: (e) => { ap.name = e.target.value; } });
  const prepBox = h('section', null, h('h3', null, 'After a scan'),
    h('label', { class: 'src' }, autoBox, h('span', null, 'Prepare CV, cover letter and contacts automatically for the best new roles')),
    h('p', { class: 'small muted' }, 'Only roles open to you (Indonesia or remote anywhere) with a strong fit. It runs an agent in the background and takes a few minutes per role. It never sends anything, and you get a WhatsApp message when it is done.'),
    h('div', { class: 'two' }, field('Max roles per scan', maxIn), field('Minimum fit (0 to 100)', fitIn)), field('Name on CV files', nameIn));

  const body = h('div', { class: 'form prefs' },
    h('p', { class: 'muted small' }, 'These apply to the next scan from this page. The settings file in career-ops stays as it is, so Reset brings back what we settled.'),
    h('section', null, h('h3', null, 'Roles'), h('p', { class: 'small muted' }, 'A posting is kept when its title contains one of these.'), kwHost, kwInput),
    h('div', { class: 'two' },
      field('Posted within', age, 'Also hides older roles from the lists right away.'),
      field('Minimum pay (Rp jt a month)', pay, 'Roles that list pay under this get a warning and a lower fit. Roles without pay are not removed.')),
    prepBox,
    h('section', null, h('h3', null, 'Sources'), mk(d.boards, 'Job boards'), mk(d.companies, 'Company career sites')));

  modal({
    title: 'Adjust scan filters', body, wide: true,
    actions: (close) => [
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => { try { await api.savePrefs({}); close(); await refresh(); toast('Back to the settled filters.'); } catch (e) { toast(e.message, { tone: 'bad' }); } } }, 'Reset to settled'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        try {
          await api.prepSettings(ap);
          await api.savePrefs({ keywords: st.keywords, maxAgeDays: st.maxAgeDays, minIdr: st.minJt * 1_000_000, disabled: [...st.disabled] });
          close(); await refresh(); toast('Filters saved. Run a scan to apply them.');
        } catch (e) { toast(e.message, { tone: 'bad' }); }
      } }, 'Save filters'),
    ],
  });
}
