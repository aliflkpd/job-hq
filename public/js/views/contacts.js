import { h, icon, clear, dateTime, copyText, safeHref, debounce } from '../dom.js';
import { S, appById, refresh, emit } from '../state.js';
import { api } from '../api.js';
import { toast, iconBtn, menu, modal, field, segmented, emptyState, chip } from '../ui.js';

const STATUS_LABEL = { todo: 'To contact', sent: 'Sent', replied: 'Replied', skipped: 'Skipped' };
const waLink = (p) => 'https://wa.me/' + String(p).replace(/\D/g, '');

export function contactRow(c, { showApp = false } = {}) {
  const limit = c.channel === 'linkedin' ? 200 : null;
  const app = showApp ? appById(c.appId) : null;
  const actions = h('div', { class: 'contact-actions' });
  if (c.url) actions.append(h('a', { class: 'btn sm', href: safeHref(c.url), target: '_blank', rel: 'noopener noreferrer' }, icon(c.channel === 'linkedin' ? 'linkedin-logo' : 'link', 14), c.channel === 'linkedin' ? 'LinkedIn' : 'Open'));
  if (c.email) {
    const subject = c.appId && appById(c.appId) ? `${appById(c.appId).role}${S.data.prep.name ? ' - ' + S.data.prep.name : ''}` : (S.data.prep.name || '');
    actions.append(h('a', { class: 'btn sm', href: 'mailto:' + c.email + '?subject=' + encodeURIComponent(subject) }, icon('envelope-simple', 14), 'Email'),
      iconBtn('copy', `Copy ${c.email}`, async () => { await copyText(c.email); toast(`Copied ${c.email}`); }, { class: 'sm', size: 14 }));
  }
  if (c.phone) actions.append(h('a', { class: 'btn sm', href: waLink(c.phone), target: '_blank', rel: 'noopener noreferrer' }, icon('whatsapp-logo', 14), 'WhatsApp'));
  if (c.draft) {
    const over = limit && c.draft.length > limit;
    actions.append(h('button', { class: 'btn sm' + (over ? ' warn' : ''), type: 'button', title: over ? `Over the ${limit} character limit` : 'Copy the drafted message', onclick: async () => { await copyText(c.draft); toast('Message copied. Paste it into ' + (c.channel === 'linkedin' ? 'the LinkedIn note.' : 'your message.')); } },
      icon('copy', 14), 'Copy message', limit && h('span', { class: 'mono count' }, `${c.draft.length}/${limit}`)));
  }

  const sel = h('select', { class: 'select sm', 'aria-label': `Status for ${c.name}`, onchange: async (e) => { await api.patchContact(c.id, { status: e.target.value }); await refresh(); } },
    Object.entries(STATUS_LABEL).map(([v, l]) => h('option', { value: v, selected: v === c.status }, l)));

  return h('div', { class: 'contact ' + c.status },
    h('div', { class: 'contact-main' },
      h('div', { class: 'contact-name' }, h('strong', null, c.name), app && h('button', { class: 'link-btn', type: 'button', onclick: () => { S.drawerApp = app.id; emit(); } }, app.company), c.lastAt && h('span', { class: 'muted small' }, 'Contacted ' + dateTime(c.lastAt))),
      c.role && h('div', { class: 'muted small' }, c.role),
      c.note && h('div', { class: 'note small' }, c.note),
    ),
    h('div', { class: 'contact-side' }, actions, sel, iconBtn('dots-three', `More for ${c.name}`, (e) => menu(e.currentTarget, [
      { label: 'Edit', icon: 'note-pencil', onClick: () => contactModal(c) },
      { label: 'Delete', icon: 'trash', onClick: async () => { await api.delContact(c.id); await refresh(); toast(`${c.name} removed.`); } },
    ]), { class: 'sm' })),
  );
}

export function contactModal(existing, appId) {
  const c = existing || { channel: 'linkedin', name: '', role: '', url: '', email: '', phone: '', draft: '', note: '', appId };
  const name = h('input', { class: 'input', value: c.name, placeholder: 'Full name', autocomplete: 'off' });
  const role = h('input', { class: 'input', value: c.role, placeholder: 'Title or why this person' });
  const channel = h('select', { class: 'select' }, ['linkedin', 'email', 'whatsapp', 'other'].map((v) => h('option', { value: v, selected: v === c.channel }, { linkedin: 'LinkedIn', email: 'Email', whatsapp: 'WhatsApp', other: 'Other' }[v])));
  const url = h('input', { class: 'input', value: c.url, placeholder: 'https://linkedin.com/in/...', inputMode: 'url' });
  const email = h('input', { class: 'input', value: c.email, placeholder: 'name@company.com', inputMode: 'email' });
  const phone = h('input', { class: 'input', value: c.phone, placeholder: '+62...', inputMode: 'tel' });
  const draft = h('textarea', { class: 'input', rows: 4, placeholder: 'Message to paste' }, c.draft);
  const counter = h('p', { class: 'hint mono', 'aria-live': 'polite' });
  const paint = () => { const lim = channel.value === 'linkedin' ? 200 : null; counter.textContent = lim ? `${draft.value.length}/${lim} characters` : `${draft.value.length} characters`; counter.className = 'hint mono' + (lim && draft.value.length > lim ? ' over' : ''); };
  draft.addEventListener('input', paint); channel.addEventListener('change', paint); paint();
  const note = h('input', { class: 'input', value: c.note, placeholder: 'Anything worth remembering' });
  const body = h('div', { class: 'form' }, field('Name', name), field('Role', role), field('Channel', channel), field('LinkedIn or profile link', url), field('Email', email, 'Only use addresses that are public or on the company site.'), field('WhatsApp number', phone), field('Message draft', draft), counter, field('Note', note));
  modal({
    title: existing ? 'Edit contact' : 'Add contact', body,
    actions: (close) => [
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!name.value.trim()) { name.focus(); return; }
        const payload = { name: name.value, role: role.value, channel: channel.value, url: url.value, email: email.value, phone: phone.value, draft: draft.value, note: note.value };
        try {
          if (existing) await api.patchContact(existing.id, payload); else await api.addContact({ ...payload, appId });
          close(); await refresh(); toast(existing ? 'Contact saved.' : 'Contact added.');
        } catch (e) { toast(e.message, { tone: 'bad' }); }
      } }, existing ? 'Save' : 'Add contact'),
    ],
  });
}

export function renderContacts(root) {
  const U = S.ui.contacts;
  const all = S.data.contacts;
  const counts = (s) => (s === 'all' ? all.length : all.filter((c) => c.status === s).length);
  const list = h('div', { class: 'contact-groups' });

  const paint = () => {
    clear(list);
    const q = U.q.trim().toLowerCase();
    const shown = all.filter((c) => (U.status === 'all' || c.status === U.status) && (!q || [c.name, c.role, c.email, appById(c.appId)?.company].join(' ').toLowerCase().includes(q)));
    const groups = new Map();
    for (const c of shown) { const k = c.appId ?? 0; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    for (const a of S.data.apps) {
      if (U.status !== 'all' || q) continue;
      if (!groups.has(a.id)) groups.set(a.id, []);
    }
    if (!shown.length && (U.status !== 'all' || q)) { list.append(emptyState('address-book', 'No contacts match', 'Try another status or clear the search.')); return; }
    for (const [appId, cs] of [...groups].sort((x, y) => (x[1].length ? 0 : 1) - (y[1].length ? 0 : 1) || x[0] - y[0])) {
      const a = appById(appId);
      list.append(h('section', { class: 'group' },
        h('header', { class: 'group-head' },
          h('h2', null, a ? a.company : 'No application'), a && h('span', { class: 'muted small' }, a.role),
          h('span', { class: 'spacer' }),
          a && h('button', { class: 'btn sm ghost', type: 'button', onclick: () => contactModal(null, a.id) }, icon('plus', 14), 'Add contact')),
        cs.length ? cs.map((c) => contactRow(c)) : h('p', { class: 'muted small group-empty' }, 'No contact found yet. No public recruiting email turned up, so outreach is skipped until you add one.')));
    }
  };

  const search = h('input', { class: 'input search', type: 'search', placeholder: 'Search name, role, company', value: U.q, 'aria-label': 'Search contacts', id: 'search', oninput: debounce((e) => { U.q = e.target.value; paint(); }) });
  const segHost = h('div');
  const paintSeg = () => { clear(segHost); segHost.append(segmented([{ value: 'all', label: 'All', count: counts('all') }, { value: 'todo', label: 'To contact', count: counts('todo') }, { value: 'sent', label: 'Sent', count: counts('sent') }, { value: 'replied', label: 'Replied', count: counts('replied') }, { value: 'skipped', label: 'Skipped', count: counts('skipped') }], U.status, (v) => { U.status = v; paintSeg(); paint(); }, 'Filter by status')); };
  paintSeg(); paint();

  root.append(
    h('header', { class: 'page-head' }, h('div', null, h('h1', null, 'Contacts'), h('p', { class: 'sub' }, 'People and inboxes to reach out to, grouped by application. Emails come only from company pages or the job post.')),
      h('button', { class: 'btn primary', type: 'button', onclick: () => contactModal(null, null) }, icon('plus', 16), 'Add contact')),
    h('div', { class: 'toolbar' }, search, segHost),
    list,
  );
}
