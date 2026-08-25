// Shared job row + actions (used by Schedule and Today).
// Done logs the visit for billing AND, on delegated jobs, offers to log the
// crew member's shift — schedule doubles as both billing and wages input.

import { el, render, openModal, closeModal, field, textInput, numberInput, dateInput, select, formValues, toast, confirmAction } from '../app.js';
import { put, remove } from '../db.js';
import { newJob, newVisit, newShift, touch, today, fmtDate, money, shiftAmount, lineForService } from '../models.js';

export function jobRow(e, data, late = false) {
  const name = e.client ? e.client.name : (e.job?.note || 'Job');
  const assignee = e.crewId ? data.crew.find(c => c.id === e.crewId) : null;
  const subBits = [
    e.contract ? cap(e.contract.service) : (e.kind === 'manual' ? 'one-time' : ''),
    e.client && e.job?.note ? e.job.note : '',
    late ? `was ${fmtDate(e.date)}` : '',
  ].filter(Boolean);
  const done = e.status === 'done';
  // One big obvious tap target per job: the circle IS "yes, this one's done".
  const tick = el('button', {
    class: 'tick' + (done ? ' on' : ''),
    'aria-label': done ? `${name} is done — tap to undo` : `Mark ${name} done`,
    onclick: () => (done ? revertDone(e, data) : markDone(e, data)),
  });
  tick.append(el('span', { class: 'tick-mark' }, '✓'));

  const card = el('div', { class: 'card job-card' + (done ? ' is-done' : '') },
    el('div', { class: 'row' },
      tick,
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title' }, name,
          assignee ? el('span', { class: 'chip assignee' }, firstName(assignee.name)) : null),
        el('div', { class: 'row-sub' }, subBits.join(' · ') || '—'))));
  if (!done) {
    card.append(el('div', { class: 'btn-row job-more' },
      data.crew.some(c => c.status !== 'inactive')
        ? el('button', { class: 'btn subtle small', onclick: () => assignForm(e, data) }, assignee ? 'Reassign' : 'Assign')
        : null,
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
export async function backingJob(e, changes) {
  const j = e.job
    ? { ...e.job, ...changes }
    : newJob({ date: e.date, clientId: e.client?.id || '', contractId: e.contract?.id || '', origDate: e.origDate, ...changes });
  await put('jobs', touch(j));
  return j;
}

export async function markDone(e, data) {
  const changes = { status: 'done' };
  const billing = e.contract?.billing;
  let msg = 'Marked done ✔';
  if (e.contract && (billing === 'per-visit' || billing === 'per-push')) {
    const v = newVisit({ contractId: e.contract.id, clientId: e.contract.clientId, date: e.date });
    await put('visits', v);
    changes.visitId = v.id;
    msg = `Done ✔ — ${billing === 'per-push' ? 'push' : 'visit'} logged for billing`;
  }
  const job = await backingJob(e, changes);
  toast(msg);
  // Delegated job → offer the shift. Done is already committed; skipping keeps it done.
  const member = e.crewId ? data.crew.find(c => c.id === e.crewId) : null;
  if (member) shiftSheet(e, member, job, data);
  else render();
}

// One-tap wage logging: everything prefilled, "Skip" costs nothing.
function shiftSheet(e, member, job, data) {
  // best guess at hours: their last shift for this client, else their last shift anywhere, else 1
  const past = data.shifts.filter(s => s.crewId === member.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const sameClient = e.client ? past.find(s => s.clientId === e.client.id) : null;
  const guessHours = Number((sameClient || past[0])?.hours) || 1;
  const rate = Number(member.defaultRate) || Number(past[0]?.rate) || 0;
  const line = e.contract ? lineForService(e.contract.service) : 'general';

  const hoursIn = numberInput('hours', guessHours, { step: '0.5' });
  const rateIn = numberInput('rate', rate || '');
  const dateIn = dateInput('date', e.date);
  const submitBtn = el('button', { class: 'btn', type: 'submit' }, '');
  const setLabel = () => {
    submitBtn.textContent = `Log shift — ${money(shiftAmount(hoursIn.value, rateIn.value, 0))}`;
  };
  hoursIn.addEventListener('input', setLabel);
  rateIn.addEventListener('input', setLabel);
  setLabel();

  const form = el('form', {},
    el('div', { class: 'row-sub', style: 'margin-bottom:12px' },
      `${member.name} did this job — log their shift so the app tracks what you owe them. Skip if you'll log it later.`),
    el('div', { class: 'field-pair' },
      field('Hours', hoursIn),
      field('Rate ($/hr)', rateIn)),
    field('Date', dateIn),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: () => { closeModal(); render(); } }, 'Skip'),
      submitBtn));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = formValues(form);
    const amount = shiftAmount(v.hours, v.rate, 0);
    if (amount <= 0) { toast('Enter hours and a rate'); return; }
    const shift = newShift({
      crewId: member.id, clientId: e.client?.id || '', jobId: job.id,
      date: v.date || e.date, hours: Number(v.hours) || 0, rate: Number(v.rate) || 0,
      amount, line,
    });
    await put('shifts', shift);
    await put('jobs', touch({ ...job, shiftId: shift.id }));
    closeModal();
    toast(`Shift logged — ${money(amount)} owed to ${member.name}`);
    render();
  });
  openModal(`${firstName(member.name)}'s shift`, [form]);
}

export async function revertDone(e, data) {
  if (!confirmAction('Put this job back to planned?')) return;
  let note = '';
  if (e.job?.visitId) {
    const v = data.visits.find(x => x.id === e.job.visitId);
    if (v && !v.invoiceId) await remove('visits', v.id); // un-log unless already billed
  }
  if (e.job?.shiftId) {
    const s = data.shifts.find(x => x.id === e.job.shiftId);
    if (s && !s.paid) await remove('shifts', s.id); // un-log unless already paid out
    else if (s && s.paid) note = ' — the paid shift stays in your books';
  }
  await backingJob(e, { status: 'planned', visitId: '', shiftId: '' });
  toast('Back to planned' + note);
  render();
}

export async function skipJob(e) {
  await backingJob(e, { status: 'skipped' });
  toast('Skipped — it won’t come back');
  render();
}

export function moveJob(e, data) {
  const form = el('form', {},
    field('New date', dateInput('date', e.date)),
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

// Who's doing this job? '' = me; picking me over a contract default stores 'me'.
export function assignForm(e, data) {
  const members = data.crew.filter(c => c.status !== 'inactive')
    .sort((a, b) => a.name.localeCompare(b.name));
  const current = e.job?.crewId || e.contract?.defaultCrewId || '';
  const sel = select('crewId', [['', '— me —'], ...members.map(c => [c.id, c.name])],
    current === 'me' ? '' : current);
  const form = el('form', {},
    field('Who’s doing this job?', sel),
    e.contract?.defaultCrewId ? el('div', { class: 'row-sub', style: 'margin-bottom:10px' },
      'Only changes this visit — set “Usually done by” on the contract to change them all.') : null,
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, 'Assign')));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = formValues(form);
    const crewId = v.crewId || (e.contract?.defaultCrewId ? 'me' : '');
    await backingJob(e, { crewId });
    closeModal();
    const who = v.crewId ? members.find(c => c.id === v.crewId)?.name : 'you';
    toast(`Assigned to ${who} ✔`);
    render();
  });
  openModal('Assign job', [form]);
}

export function firstName(name) { return (name || '').trim().split(/\s+/)[0] || ''; }
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
