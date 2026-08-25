// Schedule: rolling agenda (default) + month calendar toggle.
// Occurrences come from contract repeat rules; Done on visit-billed work logs the visit.

import { el, navigate, render, openModal, closeModal, field, textInput, dateInput, select, formValues, toast, confirmAction } from '../app.js';
import { put, remove } from '../db.js';
import { newJob, newVisit, touch, today, addDays, fmtDate } from '../models.js';
import { agenda, catchUp, unscheduled } from '../schedule.js';

let schedMode = 'agenda'; // 'agenda' | 'month'
let monthOffset = 0;
let selDate = '';

export function renderSchedule(root, data) {
  root.append(el('div', { class: 'segment' },
    el('button', { class: 'seg' + (schedMode === 'agenda' ? ' active' : ''), onclick: () => { schedMode = 'agenda'; render(); } }, 'Agenda'),
    el('button', { class: 'seg' + (schedMode === 'month' ? ' active' : ''), onclick: () => { schedMode = 'month'; render(); } }, 'Month')));

  root.append(el('button', { class: 'btn add-btn', onclick: () => jobForm(data) }, '+ Add one-time job'));

  const missing = unscheduled(data);
  if (missing.length) {
    const clientById = new Map(data.clients.map(c => [c.id, c]));
    const names = missing.slice(0, 3).map(k => clientById.get(k.clientId)?.name).filter(Boolean).join(', ');
    root.append(el('div', { class: 'alert info', onclick: () => navigate('clients') },
      el('span', { class: 'a-icon' }, '🗓'),
      el('span', {}, `${missing.length} contract${missing.length > 1 ? 's aren’t' : ' isn’t'} on the schedule yet (${names}${missing.length > 3 ? '…' : ''}) — open the contract and set “Repeats”.`)));
  }

  if (schedMode === 'month') renderMonth(root, data);
  else renderAgenda(root, data);
  root.append(el('div', { class: 'fab-space' }));
}

// ---------------- agenda ----------------
function renderAgenda(root, data) {
  const missed = catchUp(data);
  if (missed.length) {
    root.append(el('div', { class: 'section-label' }, `Catch up (${missed.length})`));
    for (const e of missed) root.append(jobRow(e, data, true));
  }

  const entries = agenda(data, today(), 14);
  if (entries.length === 0 && missed.length === 0) {
    root.append(el('div', { class: 'empty' },
      'Nothing scheduled. Set “Repeats” on a contract (Clients tab) or add a one-time job above.'));
    return;
  }
  let currentDay = null;
  for (const e of entries) {
    if (e.date !== currentDay) {
      currentDay = e.date;
      root.append(el('div', { class: 'month-head' }, el('span', {}, dayLabel(e.date)), el('span', {}, '')));
    }
    root.append(jobRow(e, data));
  }
}

function dayLabel(date) {
  if (date === today()) return 'Today';
  if (date === addDays(today(), 1)) return 'Tomorrow';
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ---------------- month ----------------
function renderMonth(root, data) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const y = base.getFullYear(), m = base.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const entries = agenda(data, first, daysInMonth);
  const byDate = new Map();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  if (!selDate || selDate.slice(0, 7) !== first.slice(0, 7)) {
    selDate = today().slice(0, 7) === first.slice(0, 7) ? today() : first;
  }

  root.append(el('div', { class: 'cal-head' },
    el('button', { class: 'btn subtle small', onclick: () => { monthOffset--; render(); } }, '‹'),
    el('div', { class: 'cal-title' }, base.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })),
    el('button', { class: 'btn subtle small', onclick: () => { monthOffset++; render(); } }, '›')));

  const grid = el('div', { class: 'cal-grid' });
  for (const dow of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) grid.append(el('div', { class: 'cal-dow' }, dow));
  const lead = new Date(y, m, 1).getDay();
  for (let i = 0; i < lead; i++) grid.append(el('div', {}));
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = el('button', {
      class: 'cal-day' + (date === today() ? ' now' : '') + (date === selDate ? ' sel' : ''),
      onclick: () => { selDate = date; render(); },
    }, String(day));
    if (byDate.has(date)) cell.append(el('span', { class: 'dot' }));
    grid.append(cell);
  }
  root.append(grid);

  root.append(el('div', { class: 'section-label' }, dayLabel(selDate)));
  const dayEntries = byDate.get(selDate) || [];
  if (dayEntries.length === 0) root.append(el('div', { class: 'empty' }, 'Nothing on this day.'));
  for (const e of dayEntries) root.append(jobRow(e, data));
}

// ---------------- shared job row + actions ----------------
function jobRow(e, data, late = false) {
  const name = e.client ? e.client.name : (e.job?.note || 'Job');
  const subBits = [
    e.contract ? cap(e.contract.service) : (e.kind === 'manual' ? 'one-time' : ''),
    e.client && e.job?.note ? e.job.note : '',
    late ? `was ${fmtDate(e.date)}` : '',
  ].filter(Boolean);
  const card = el('div', { class: 'card' },
    el('div', { class: 'row' },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title' }, name),
        el('div', { class: 'row-sub' }, subBits.join(' · ') || '—')),
      e.status === 'done'
        ? el('button', {
            class: 'btn subtle small', onclick: () => revertDone(e, data)
          }, '✓ done')
        : null));
  if (e.status !== 'done') {
    card.append(el('div', { class: 'btn-row' },
      el('button', { class: 'btn small', onclick: () => markDone(e, data) }, '✓ Done'),
      el('button', { class: 'btn subtle small', onclick: () => moveJob(e, data) }, 'Move'),
      e.kind === 'manual'
        ? el('button', {
            class: 'btn subtle small', onclick: async () => {
              if (!confirmAction('Delete this one-time job?')) return;
              await remove('jobs', e.job.id);
              toast('Job deleted'); render();
            }
          }, 'Delete')
        : el('button', { class: 'btn subtle small', onclick: () => skipJob(e) }, 'Skip')));
  }
  return card;
}

// upsert the override/manual record backing an agenda entry
async function backingJob(e, changes) {
  const j = e.job
    ? { ...e.job, ...changes }
    : newJob({ date: e.date, clientId: e.client?.id || '', contractId: e.contract?.id || '', origDate: e.origDate, ...changes });
  await put('jobs', touch(j));
  return j;
}

async function markDone(e, data) {
  const changes = { status: 'done' };
  const billing = e.contract?.billing;
  let msg = 'Marked done ✔';
  if (e.contract && (billing === 'per-visit' || billing === 'per-push')) {
    const v = newVisit({ contractId: e.contract.id, clientId: e.contract.clientId, date: e.date });
    await put('visits', v);
    changes.visitId = v.id;
    msg = `Done ✔ — ${billing === 'per-push' ? 'push' : 'visit'} logged for billing`;
  }
  await backingJob(e, changes);
  toast(msg);
  render();
}

async function revertDone(e, data) {
  if (!confirmAction('Put this job back to planned?')) return;
  if (e.job?.visitId) {
    const v = data.visits.find(x => x.id === e.job.visitId);
    if (v && !v.invoiceId) await remove('visits', v.id); // un-log unless already billed
  }
  await backingJob(e, { status: 'planned', visitId: '' });
  toast('Back to planned');
  render();
}

async function skipJob(e) {
  await backingJob(e, { status: 'skipped' });
  toast('Skipped — it won’t come back');
  render();
}

function moveJob(e, data) {
  const dateIn = dateInput('date', e.date);
  const form = el('form', {},
    field('New date', dateIn),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, 'Move job')));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = formValues(form);
    if (!v.date) return;
    await backingJob(e, { date: v.date });
    closeModal();
    toast(`Moved to ${fmtDate(v.date)}`);
    render();
  });
  openModal(`Move — ${e.client?.name || 'job'}`, [form]);
}

function jobForm(data) {
  const form = el('form', {},
    field('Date', dateInput('date', today())),
    field('Client (optional)', select('clientId', [['', '— no client —'], ...data.clients.map(c => [c.id, c.name])], '')),
    field('What is it?', textInput('note', '', { placeholder: 'e.g. gutter clean, estimate visit' })),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, 'Add job')));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = formValues(form);
    if (!v.clientId && !v.note) { toast('Pick a client or say what the job is'); return; }
    await put('jobs', newJob({ date: v.date || today(), clientId: v.clientId, note: v.note }));
    closeModal();
    toast('Job added ✔');
    render();
  });
  openModal('One-time job', [form]);
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
