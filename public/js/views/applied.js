import { h } from '../dom.js';
import { S, refresh, emit, appById } from '../state.js';
import { api } from '../api.js';
import { modal, field, toast } from '../ui.js';

const VIA = ['Company website', 'Jobstreet', 'LinkedIn', 'Kalibrr', 'Glints', 'Email to recruiter', 'Referral', 'Other'];

// Mark something as already applied, outside this app. Works for a scanned job or an existing tracked application.
export function markApplied({ job, app }) {
  const company = job ? job.company : app.company;
  const role = job ? job.title : app.role;
  const date = h('input', { class: 'input', type: 'date', value: new Date().toLocaleDateString('en-CA'), max: new Date().toLocaleDateString('en-CA') });
  const via = h('select', { class: 'select', style: { width: '100%' } }, VIA.map((v) => h('option', { value: v }, v)));
  const note = h('input', { class: 'input', placeholder: 'Optional, e.g. sent CV to hr@...' });
  modal({
    title: 'I already applied', body: h('div', { class: 'form' },
      h('p', { class: 'muted' }, `${role} at ${company}. It goes to Applied, with a follow-up reminder 7 days after the date below.`),
      field('When did you apply', date), field('Where', via), field('Note', note)),
    actions: (close) => [
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!date.value) { date.focus(); return; }
        try {
          if (app) await api.patchApp(app.id, { status: 'Applied', appliedOn: date.value, via: via.value });
          else {
            const r = await api.addApp({ company, role, url: job.url, location: job.location, workMode: job.mode, salary: job.salary ? job.salary.raw : '', source: job.source, status: 'Applied', external: true, appliedOn: date.value, via: via.value, note: note.value });
            if (S.peek === job.url) S.peek = null;
            toast(`${company} marked as applied.`, { label: 'Open', onClick: () => { S.drawerApp = r.id; emit(); } });
          }
          close(); await refresh();
          if (app) toast(`${company} marked as applied.`);
        } catch (e) { toast(e.message, { tone: 'bad' }); }
      } }, 'Mark as applied'),
    ],
  });
}
