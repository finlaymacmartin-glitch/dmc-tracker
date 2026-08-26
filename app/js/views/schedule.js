// Schedule: rolling agenda (default) + month calendar toggle.
// Occurrences come from contract repeat rules; job rows/actions live in jobrow.js.

import { el, navigate, render, openModal, closeModal, field, textInput, dateInput, select, formValues, toast } from '../app.js';
import { put } from '../db.js';
import { newJob, today, addDays } from '../models.js';
import { agenda, catchUp, contractIssues } from '../schedule.js';
import { jobRow } from './jobrow.js';
import { icon } from '../icons.js';

let schedMode = 'agenda'; // 'agenda' | 'month'
let monthOffset = 0;
let selDate = '';

export function renderSchedule(root, data) {
  root.append(el('div', { class: 'segment' },
    el('button', { class: 'seg' + (schedMode === 'agenda' ? ' active' : ''), onclick: () => { schedMode = 'agenda'; render(); } }, 'Agenda'),
    el('button', { class: 'seg' + (schedMode === 'month' ? ' active' : ''), onclick: () => { schedMode = 'month'; render(); } }, 'Month')));

  root.append(el('button', { class: 'btn add-btn', onclick: () => jobForm(data) }, '+ Add one-time job'));

  const issues = contractIssues(data);
  const clientById = new Map(data.clients.map(c => [c.id, c]));
  const who = list => list.slice(0, 3).map(k => clientById.get(k.clientId)?.name).filter(Boolean).join(', ')
    + (list.length > 3 ? '…' : '');
  // jump straight to the client whose contract needs the fix
  const fix = list => navigate('clients', list[0]?.clientId ? { clientId: list[0].clientId } : {});

  if (issues.dateNoRepeat.length) {
    const n = issues.dateNoRepeat.length;
    root.append(el('div', { class: 'alert warn', onclick: () => fix(issues.dateNoRepeat) },
      el('span', { class: 'a-icon' }, icon('calendarAdd')),
      el('span', {}, `${n} contract${n > 1 ? 's have' : ' has'} a next-visit date but no “Repeats” rule (${who(issues.dateNoRepeat)}), so nothing is scheduled — open the contract and pick how often it repeats.`)));
  }
  if (issues.unscheduled.length) {
    const n = issues.unscheduled.length;
    root.append(el('div', { class: 'alert info', onclick: () => fix(issues.unscheduled) },
      el('span', { class: 'a-icon' }, icon('calendarAdd')),
      el('span', {}, `${n} contract${n > 1 ? 's aren’t' : ' isn’t'} on the schedule yet (${who(issues.unscheduled)}) — open the contract and set “Repeats”.`)));
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

// ---------------- one-time job ----------------
function jobForm(data) {
  const members = data.crew.filter(c => c.status !== 'inactive')
    .sort((a, b) => a.name.localeCompare(b.name));
  const form = el('form', {},
    field('Date', dateInput('date', today())),
    field('Client (optional)', select('clientId', [['', '— no client —'], ...data.clients.map(c => [c.id, c.name])], '')),
    field('What is it?', textInput('note', '', { placeholder: 'e.g. gutter clean, estimate visit' })),
    members.length ? field('Assign to (optional)', select('crewId', [['', '— me —'], ...members.map(c => [c.id, c.name])], '')) : null,
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, 'Add job')));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = formValues(form);
    if (!v.clientId && !v.note) { toast('Pick a client or say what the job is'); return; }
    await put('jobs', newJob({ date: v.date || today(), clientId: v.clientId, note: v.note, crewId: v.crewId || '' }));
    closeModal();
    toast('Job added ✔');
    render();
  });
  openModal('One-time job', [form]);
}
