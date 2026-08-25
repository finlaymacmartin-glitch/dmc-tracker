// Crew: members → shifts (hourly or flat) → what you OWE each person.
// Pay out marks shifts paid and books one Wages expense automatically.
// "Their jobs" shows what each member is assigned to on the schedule.

import { el, navigate, render, openModal, closeModal, field, textInput, numberInput, dateInput, select, formValues, searchBox, toast, confirmAction } from '../app.js';
import { put, remove } from '../db.js';
import { newCrew, newShift, newExpense, touch, shiftAmount, crewOwed, money, fmtDate, today, round2, LINES } from '../models.js';
import { jobsForCrew } from '../schedule.js';

let crewQ = '';
const LIST_CAP = 200;

export function renderCrew(root, data, { params }) {
  if (params.crewId) return renderCrewDetail(root, data, params.crewId);

  root.append(el('button', { class: 'btn add-btn', onclick: () => crewForm(null) }, '+ Add crew member'));
  const members = [...data.crew].sort((a, b) => a.name.localeCompare(b.name));
  if (members.length === 0) {
    root.append(el('div', { class: 'empty' }, 'No crew yet. Add whoever helps you out — assign them jobs on the schedule, log their shifts, and the app tracks what you owe them.'));
    return;
  }
  const listBox = el('div');
  const draw = () => {
    listBox.innerHTML = '';
    const q = crewQ.trim().toLowerCase();
    const matched = members.filter(c => !q || `${c.name} ${c.phone} ${c.notes}`.toLowerCase().includes(q));
    for (const c of matched.slice(0, LIST_CAP)) {
      const owed = crewOwed(c.id, data.shifts);
      const { missed, upcoming } = jobsForCrew(data, c.id, 7);
      const jobCount = missed.length + upcoming.length;
      listBox.append(el('div', { class: 'card tappable', onclick: () => navigate('crew', { crewId: c.id }) },
        el('div', { class: 'row' },
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, c.name),
            el('div', { class: 'row-sub' }, [
              c.defaultRate > 0 ? `${money(c.defaultRate)}/hr` : '',
              jobCount ? `on ${jobCount} job${jobCount > 1 ? 's' : ''} this week` : '',
              c.status === 'inactive' ? 'inactive' : '',
            ].filter(Boolean).join(' · ') || 'No rate set')),
          el('div', {},
            el('div', { class: 'row-amount' + (owed > 0 ? ' neg' : '') }, owed > 0 ? money(owed) : '—'),
            owed > 0 ? el('div', { class: 'row-sub', style: 'text-align:right' }, 'owed') : null))));
    }
    if (matched.length === 0) listBox.append(el('div', { class: 'empty' }, 'No crew match that search.'));
  };
  if (members.length > 5) root.append(searchBox('Search crew…', crewQ, v => { crewQ = v; draw(); }));
  root.append(listBox);
  draw();
  root.append(el('div', { class: 'fab-space' }));
}

function renderCrewDetail(root, data, crewId) {
  const member = data.crew.find(c => c.id === crewId);
  if (!member) { navigate('crew'); return; }
  const shifts = data.shifts.filter(s => s.crewId === crewId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const owed = crewOwed(crewId, data.shifts);

  root.append(el('button', { class: 'back-link', onclick: () => navigate('crew') }, '‹ Crew'));

  root.append(el('div', { class: 'card detail-head' },
    el('h2', {}, member.name),
    el('div', { class: 'row-sub' }, [member.phone, member.defaultRate > 0 ? `${money(member.defaultRate)}/hr default` : ''].filter(Boolean).join(' · ')),
    member.notes ? el('div', { class: 'row-sub' }, '📝 ' + member.notes) : null,
    el('div', { class: 'row', style: 'margin-top:10px' },
      el('div', { class: 'row-sub' }, 'You owe'),
      el('div', { class: 'row-amount' + (owed > 0 ? ' neg' : '') }, money(owed))),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn small', onclick: () => shiftForm(member, data) }, '+ Log shift'),
      owed > 0 ? el('button', { class: 'btn secondary small', onclick: () => payOutModal(member, data) }, '💵 Pay out') : null,
      el('button', { class: 'btn subtle small', onclick: () => crewForm(member) }, 'Edit'),
      el('button', { class: 'btn subtle small', onclick: () => deleteCrew(member, data) }, 'Delete'))));

  // ---- their jobs (assigned on the schedule) ----
  const { missed, upcoming } = jobsForCrew(data, crewId, 7);
  root.append(el('div', { class: 'section-label' }, 'Their jobs'));
  if (missed.length === 0 && upcoming.length === 0) {
    root.append(el('div', { class: 'empty' }, `Nothing assigned. Use “Assign” on any schedule job, or set “Usually done by” on a contract, to put ${member.name} on it.`));
  } else {
    for (const e of missed) root.append(crewJobRow(e, true));
    for (const e of upcoming) root.append(crewJobRow(e, false));
  }

  root.append(el('div', { class: 'section-label' }, 'Shifts'));
  if (shifts.length === 0) root.append(el('div', { class: 'empty' }, 'No shifts logged yet.'));
  const clientById = Object.fromEntries(data.clients.map(c => [c.id, c]));
  for (const s of shifts) {
    root.append(el('div', { class: 'card' },
      el('div', { class: 'row' },
        el('div', { class: 'row-main' },
          el('div', { class: 'row-title' }, `${money(s.amount)}${Number(s.hours) > 0 ? ` · ${s.hours}h @ ${money(s.rate)}` : ' · flat'}`),
          el('div', { class: 'row-sub' }, [fmtDate(s.date), clientById[s.clientId]?.name, s.line !== 'general' ? s.line : '', s.note].filter(Boolean).join(' · '))),
        s.paid
          ? el('span', { class: 'chip paid' }, 'paid')
          : el('div', { style: 'display:flex;align-items:center;gap:8px' },
              el('span', { class: 'chip partial' }, 'owed'),
              el('button', {
                class: 'btn subtle small', onclick: async () => {
                  if (!confirmAction('Delete this shift?')) return;
                  await remove('shifts', s.id);
                  toast('Shift deleted'); render();
                }
              }, '✕')))));
  }
  root.append(el('div', { class: 'fab-space' }));
}

// read-only row for the "Their jobs" list — actions live on the Schedule tab
function crewJobRow(e, late) {
  const name = e.client ? e.client.name : (e.job?.note || 'Job');
  const when = late ? `was ${fmtDate(e.date)} — catch up` : fmtDate(e.date);
  return el('div', { class: 'card tappable', onclick: () => navigate('schedule') },
    el('div', { class: 'row' },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title' }, name),
        el('div', { class: 'row-sub' }, [e.contract ? cap(e.contract.service) : 'one-time', when].filter(Boolean).join(' · '))),
      late ? el('span', { class: 'chip overdue' }, 'late') : el('span', { class: 'row-sub' }, '›')));
}

function crewForm(existing) {
  const c = existing || newCrew();
  const form = el('form', {},
    field('Name *', textInput('name', c.name, { autocomplete: 'off' })),
    el('div', { class: 'field-pair' },
      field('Phone', textInput('phone', c.phone, { type: 'tel' })),
      field('Default rate ($/hr)', numberInput('defaultRate', c.defaultRate || ''))),
    field('Notes', textInput('notes', c.notes)),
    existing ? field('Status', select('status', ['active', 'inactive'], c.status)) : null,
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, existing ? 'Save' : 'Add crew member')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    if (!v.name) return;
    const saved = touch({ ...c, ...v, defaultRate: Number(v.defaultRate) || 0 });
    await put('crew', saved);
    closeModal();
    toast(existing ? 'Crew member updated' : 'Crew member added ✔');
    if (existing) render(); else navigate('crew', { crewId: saved.id });
  });
  openModal(existing ? 'Edit crew member' : 'New crew member', [form]);
}

function shiftForm(member, data) {
  const s = newShift({ crewId: member.id, rate: member.defaultRate || 0 });
  const form = el('form', {},
    el('div', { class: 'field-pair' },
      field('Date', dateInput('date', s.date)),
      field('Worked on (optional)', select('clientId', [['', '—'], ...data.clients.map(c => [c.id, c.name])], ''))),
    el('div', { class: 'field-pair' },
      field('Hours', numberInput('hours', '', { step: '0.5' })),
      field('Rate ($/hr)', numberInput('rate', s.rate || ''))),
    field('OR flat amount (CAD) — overrides hours', numberInput('flatAmount', '')),
    field('Business line', select('line', LINES.map(l => [l, l === 'general' ? 'General / both' : l[0].toUpperCase() + l.slice(1)]), 'general')),
    field('Note', textInput('note', '')),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, 'Log shift')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    const amount = shiftAmount(v.hours, v.rate, v.flatAmount);
    if (amount <= 0) { toast('Enter hours + rate, or a flat amount'); return; }
    await put('shifts', touch({
      ...s, ...v,
      hours: Number(v.hours) || 0, rate: Number(v.rate) || 0,
      flatAmount: Number(v.flatAmount) || 0, amount,
    }));
    closeModal();
    toast(`Shift logged — ${money(amount)} owed to ${member.name}`);
    render();
  });
  openModal(`Log shift — ${member.name}`, [form]);
}

function payOutModal(member, data) {
  const unpaid = data.shifts.filter(s => s.crewId === member.id && !s.paid);
  const total = round2(unpaid.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
  // wage expense inherits the line most of the unpaid shifts were worked on
  const lineCounts = {};
  for (const s of unpaid) lineCounts[s.line || 'general'] = (lineCounts[s.line || 'general'] || 0) + 1;
  const topLine = Object.entries(lineCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';

  const form = el('form', {},
    el('div', { class: 'row-sub', style: 'margin-bottom:12px' },
      `Marks ${unpaid.length} shift${unpaid.length > 1 ? 's' : ''} paid and records a ${money(total)} Wages expense so it shows in your books automatically.`),
    field('Paid on', dateInput('date', today())),
    field('Note', textInput('note', '', { placeholder: 'e.g. e-transfer' })),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, `Pay out ${money(total)}`)));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    const payDate = v.date || today();
    for (const s of unpaid) {
      s.paid = true;
      s.paidDate = payDate;
      await put('shifts', touch(s));
    }
    await put('expenses', newExpense({
      date: payDate, amount: total, category: 'Wages', vendor: member.name, line: topLine,
      note: `${unpaid.length} shift${unpaid.length > 1 ? 's' : ''}${v.note ? ' · ' + v.note : ''}`,
    }));
    closeModal();
    toast(`Paid ${member.name} ${money(total)} — logged as Wages`);
    render();
  });
  openModal(`Pay out — ${member.name}`, [form]);
}

async function deleteCrew(member, data) {
  const n = data.shifts.filter(s => s.crewId === member.id).length;
  if (!confirmAction(`Delete ${member.name}?${n ? ` Their ${n} shift record(s) are deleted too.` : ''} Paid wage expenses stay in your books.`)) return;
  for (const s of data.shifts.filter(s => s.crewId === member.id)) await remove('shifts', s.id);
  // unhook them from schedule assignments so no job points at a ghost
  for (const j of data.jobs.filter(j => j.crewId === member.id)) await put('jobs', touch({ ...j, crewId: '' }));
  for (const k of data.contracts.filter(k => k.defaultCrewId === member.id)) await put('contracts', touch({ ...k, defaultCrewId: '' }));
  await remove('crew', member.id);
  toast('Crew member deleted');
  navigate('crew');
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
