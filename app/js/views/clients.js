// Clients: list with balance owed → client detail (contracts + invoices) → add/edit forms.

import { el, navigate, render, openModal, closeModal, field, textInput, numberInput, dateInput, select, formValues, searchBox, toast, confirmAction } from '../app.js';
import { put, remove, getAll } from '../db.js';
import { newClient, newContract, newVisit, newCrew, newShift, newExpense, touch, clientBalance, invoiceState, shiftAmount, crewOwed, money, fmtDate, today, round2, SERVICES, BILLING_TYPES, BILLING_LABELS, REPEAT_LABELS, LINES } from '../models.js';
import { unbilledVisits } from '../billing.js';
import { onMyWayText, shareText } from '../messages.js';

let clientsMode = 'clients'; // 'clients' | 'crew'
let clientQ = '';
let crewQ = '';
const LIST_CAP = 200;

export function renderClients(root, data, { params }) {
  if (params.clientId) return renderClientDetail(root, data, params.clientId);
  if (params.crewId) return renderCrewDetail(root, data, params.crewId);
  if (params.mode) clientsMode = params.mode;

  root.append(el('div', { class: 'segment' },
    el('button', { class: 'seg' + (clientsMode === 'clients' ? ' active' : ''), onclick: () => { clientsMode = 'clients'; navigate('clients'); } }, 'Clients'),
    el('button', { class: 'seg' + (clientsMode === 'crew' ? ' active' : ''), onclick: () => { clientsMode = 'crew'; navigate('clients'); } }, 'Crew')));

  if (clientsMode === 'crew') return renderCrewList(root, data);

  root.append(el('button', { class: 'btn add-btn', onclick: () => clientForm(null) }, '+ Add client'));

  const clients = [...data.clients].sort((a, b) => a.name.localeCompare(b.name));
  if (clients.length === 0) {
    root.append(el('div', { class: 'empty' }, 'No clients yet. Add your first one above.'));
    return;
  }
  // per-contract active counts in one pass (matters at large client counts)
  const activeByClient = new Map();
  for (const k of data.contracts) {
    if (k.status === 'active') activeByClient.set(k.clientId, (activeByClient.get(k.clientId) || 0) + 1);
  }
  const listBox = el('div');
  const draw = () => {
    listBox.innerHTML = '';
    const q = clientQ.trim().toLowerCase();
    const matched = clients.filter(c => !q || `${c.name} ${c.address} ${c.phone} ${c.notes}`.toLowerCase().includes(q));
    for (const c of matched.slice(0, LIST_CAP)) {
      const balance = clientBalance(c.id, data.invoices, data.payments);
      const activeContracts = activeByClient.get(c.id) || 0;
      listBox.append(el('div', { class: 'card tappable', onclick: () => navigate('clients', { clientId: c.id }) },
        el('div', { class: 'row' },
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, c.name),
            el('div', { class: 'row-sub' }, [c.address, activeContracts ? `${activeContracts} active contract${activeContracts > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || 'No details')),
          el('div', { class: 'row-amount' + (balance > 0 ? ' neg' : '') }, balance > 0 ? money(balance) : '—'))));
    }
    if (matched.length === 0) listBox.append(el('div', { class: 'empty' }, 'No clients match that search.'));
    else if (matched.length > LIST_CAP) listBox.append(el('div', { class: 'empty' }, `Showing ${LIST_CAP} of ${matched.length} — type to narrow down.`));
  };
  if (clients.length > 5) root.append(searchBox('Search clients…', clientQ, v => { clientQ = v; draw(); }));
  root.append(listBox);
  draw();
  root.append(el('div', { class: 'fab-space' }));
}

function renderClientDetail(root, data, clientId) {
  const client = data.clients.find(c => c.id === clientId);
  if (!client) { navigate('clients'); return; }
  const balance = clientBalance(clientId, data.invoices, data.payments);

  root.append(el('button', { class: 'back-link', onclick: () => navigate('clients') }, '‹ All clients'));

  root.append(el('div', { class: 'card detail-head' },
    el('h2', {}, client.name),
    el('div', { class: 'row-sub' }, [client.phone, client.email].filter(Boolean).join(' · ')),
    client.address ? el('div', { class: 'row-sub' }, client.address) : null,
    client.notes ? el('div', { class: 'row-sub' }, '📝 ' + client.notes) : null,
    el('div', { class: 'row', style: 'margin-top:10px' },
      el('div', { class: 'row-sub' }, 'Balance owed'),
      el('div', { class: 'row-amount' + (balance > 0 ? ' neg' : '') }, money(balance))),
    el('div', { class: 'btn-row' },
      el('button', {
        class: 'btn secondary small', onclick: async () => {
          const result = await shareText(onMyWayText(client));
          if (result === 'shared') toast('Share sheet opened ✔');
          else if (result === 'copied') toast('Message copied — paste it into a text');
        }
      }, '🚗 On my way'),
      el('button', { class: 'btn secondary small', onclick: () => statementModal(client, data) }, '🧾 Statement'),
      el('button', { class: 'btn subtle small', onclick: () => clientForm(client) }, 'Edit'),
      el('button', { class: 'btn subtle small', onclick: () => deleteClient(client, data) }, 'Delete'))));

  // ---- contracts ----
  root.append(el('div', { class: 'section-label' }, 'Contracts'));
  root.append(el('button', { class: 'btn secondary add-btn', onclick: () => contractForm(null, client) }, '+ Add contract'));
  const contracts = data.contracts.filter(k => k.clientId === clientId);
  if (contracts.length === 0) root.append(el('div', { class: 'empty' }, 'No contracts yet.'));
  for (const k of contracts) {
    const card = el('div', { class: 'card tappable', onclick: () => contractForm(k, client) },
      el('div', { class: 'row' },
        el('div', { class: 'row-main' },
          el('div', { class: 'row-title' }, `${cap(k.service)} — ${money(k.price)} ${(BILLING_LABELS[k.billing] || k.billing).toLowerCase()}`),
          el('div', { class: 'row-sub' }, [k.frequency, k.startDate && `${fmtDate(k.startDate)}${k.endDate ? ' → ' + fmtDate(k.endDate) : ''}`].filter(Boolean).join(' · '))),
        el('span', { class: `chip ${k.status}` }, k.status)));
    if ((k.billing === 'per-visit' || k.billing === 'per-push') && k.status === 'active') {
      const word = k.billing === 'per-push' ? 'push' : 'visit';
      const unbilled = unbilledVisits(k.id, data.visits);
      card.append(el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn small', onclick: async e => {
            e.stopPropagation();
            await put('visits', newVisit({ contractId: k.id, clientId: client.id }));
            toast(`${word === 'push' ? 'Push' : 'Visit'} logged — ${client.name} ✔`);
            render();
          }
        }, `✓ Log ${word} today`),
        el('button', {
          class: 'btn subtle small', onclick: e => { e.stopPropagation(); visitsModal(k, client, data); }
        }, `Visits${unbilled.length ? ` (${unbilled.length} unbilled)` : ''}`)));
    }
    root.append(card);
  }

  // ---- invoices for this client ----
  root.append(el('div', { class: 'section-label' }, 'Invoices'));
  const invoices = data.invoices.filter(i => i.clientId === clientId)
    .sort((a, b) => (b.dateIssued || '').localeCompare(a.dateIssued || ''));
  if (invoices.length === 0) root.append(el('div', { class: 'empty' }, 'No invoices yet. Create one from the Money tab.'));
  for (const inv of invoices) {
    const st = invoiceState(inv, data.payments);
    root.append(el('div', { class: 'card tappable', onclick: () => navigate('invoices', { invoiceId: inv.id }) },
      el('div', { class: 'row' },
        el('div', { class: 'row-main' },
          el('div', { class: 'row-title' }, `${inv.number} · ${money(inv.amount)}`),
          el('div', { class: 'row-sub' }, `Issued ${fmtDate(inv.dateIssued)}${inv.dueDate ? ' · due ' + fmtDate(inv.dueDate) : ''}`)),
        el('span', { class: `chip ${st.status}` }, st.status))));
  }
  root.append(el('div', { class: 'fab-space' }));
}

// ---------- crew ----------
function renderCrewList(root, data) {
  root.append(el('button', { class: 'btn add-btn', onclick: () => crewForm(null) }, '+ Add crew member'));
  const members = [...data.crew].sort((a, b) => a.name.localeCompare(b.name));
  if (members.length === 0) {
    root.append(el('div', { class: 'empty' }, 'No crew yet. Add whoever helps you out — log their shifts, and the app tracks what you owe them.'));
    return;
  }
  const listBox = el('div');
  const draw = () => {
    listBox.innerHTML = '';
    const q = crewQ.trim().toLowerCase();
    const matched = members.filter(c => !q || `${c.name} ${c.phone} ${c.notes}`.toLowerCase().includes(q));
    for (const c of matched.slice(0, LIST_CAP)) {
      const owed = crewOwed(c.id, data.shifts);
      listBox.append(el('div', { class: 'card tappable', onclick: () => navigate('clients', { crewId: c.id }) },
        el('div', { class: 'row' },
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, c.name),
            el('div', { class: 'row-sub' }, [c.defaultRate > 0 ? `${money(c.defaultRate)}/hr` : '', c.status === 'inactive' ? 'inactive' : ''].filter(Boolean).join(' · ') || 'No rate set')),
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
  if (!member) { navigate('clients', { mode: 'crew' }); return; }
  const shifts = data.shifts.filter(s => s.crewId === crewId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const owed = crewOwed(crewId, data.shifts);

  root.append(el('button', { class: 'back-link', onclick: () => navigate('clients', { mode: 'crew' }) }, '‹ Crew'));

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
    if (existing) render(); else navigate('clients', { crewId: saved.id });
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
  await remove('crew', member.id);
  toast('Crew member deleted');
  navigate('clients', { mode: 'crew' });
}

// ---------- statement ----------
function statementModal(client, data) {
  const events = [];
  for (const inv of data.invoices.filter(i => i.clientId === client.id && i.status !== 'draft')) {
    events.push({ date: inv.dateIssued || '', desc: `Invoice ${inv.number}${inv.notes ? ' — ' + inv.notes : ''}`, charge: Number(inv.amount) || 0, credit: 0 });
  }
  for (const p of data.payments.filter(p => p.clientId === client.id)) {
    events.push({ date: p.date || '', desc: `Payment received${p.method ? ' (' + p.method + ')' : ''}`, charge: 0, credit: Number(p.amount) || 0 });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  const rows = events.map(ev => {
    balance = Math.round((balance + ev.charge - ev.credit) * 100) / 100;
    return el('tr', {},
      el('td', {}, fmtDate(ev.date)),
      el('td', {}, ev.desc),
      el('td', { class: 'num' }, ev.charge ? money(ev.charge) : ''),
      el('td', { class: 'num' }, ev.credit ? money(ev.credit) : ''),
      el('td', { class: 'num' }, money(balance)));
  });

  const statement = el('div', { class: 'statement' },
    el('div', { class: 'stmt-head' },
      el('div', {},
        el('div', { class: 'stmt-brand' }, 'Delisle Mowing Company'),
        el('div', { class: 'row-sub' }, `Statement of account — ${fmtDate(today())}`)),
      el('div', { class: 'stmt-client' },
        el('div', { class: 'row-title' }, client.name),
        client.address ? el('div', { class: 'row-sub' }, client.address) : null,
        client.phone ? el('div', { class: 'row-sub' }, client.phone) : null)),
    events.length === 0
      ? el('div', { class: 'empty' }, 'No activity yet.')
      : el('table', { class: 'stmt-table' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Date'), el('th', {}, 'Description'),
            el('th', { class: 'num' }, 'Charge'), el('th', { class: 'num' }, 'Payment'), el('th', { class: 'num' }, 'Balance'))),
          el('tbody', {}, rows)),
    el('div', { class: 'stmt-total row' },
      el('div', { class: 'row-title' }, 'Balance owing'),
      el('div', { class: 'row-amount' + (balance > 0 ? ' neg' : '') }, money(Math.max(0, balance)))));

  openModal(`Statement — ${client.name}`, [
    statement,
    el('div', { class: 'btn-row no-print' },
      el('button', { class: 'btn subtle', onclick: closeModal }, 'Close'),
      el('button', { class: 'btn', onclick: () => window.print() }, '🖨 Print / Save PDF')),
  ]);
}

// ---------- visits ----------
function visitsModal(contract, client, data) {
  const visits = data.visits.filter(v => v.contractId === contract.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const form = el('form', { class: 'field-pair' },
    field('Date', dateInput('date', '')),
    field('Note', textInput('note', '', { placeholder: 'optional' })));
  const addBtn = el('button', { class: 'btn secondary', type: 'button', onclick: async () => {
    const v = formValues(form);
    await put('visits', newVisit({ contractId: contract.id, clientId: client.id, ...(v.date ? { date: v.date } : {}), note: v.note }));
    closeModal();
    toast('Visit logged ✔');
    render();
  } }, '+ Add visit');
  const list = visits.length === 0
    ? [el('div', { class: 'empty' }, 'No visits logged yet.')]
    : visits.map(v => el('div', { class: 'card' },
        el('div', { class: 'row' },
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, fmtDate(v.date)),
            v.note ? el('div', { class: 'row-sub' }, v.note) : null),
          v.invoiceId
            ? el('span', { class: 'chip paid' }, 'billed')
            : el('button', {
                class: 'btn subtle small', onclick: async () => {
                  if (!confirmAction('Delete this visit?')) return;
                  await remove('visits', v.id);
                  closeModal(); toast('Visit deleted'); render();
                }
              }, '✕'))));
  openModal(`Visits — ${client.name} (${cap(contract.service)})`,
    [form, addBtn, el('div', { class: 'section-label' }, 'History'), ...list]);
}

// ---------- forms ----------
function clientForm(existing) {
  const c = existing || newClient();
  const clientFields = [
    field('Name *', textInput('name', c.name, { required: 'true', autocomplete: 'off' })),
    field('Phone', textInput('phone', c.phone, { type: 'tel' })),
    field('Email', textInput('email', c.email, { type: 'email' })),
    field('Address', textInput('address', c.address)),
    field('Notes', textInput('notes', c.notes)),
  ];
  // contract fields live INSIDE the new-client form — optional, leave blank to skip
  const contractFields = existing ? [] : [
    el('div', { class: 'section-label', style: 'margin-top:18px' }, 'Contract (optional)'),
    el('div', { class: 'row-sub', style: 'margin-bottom:10px' },
      'Enter a price to set up their contract at the same time — or leave this blank and add one later.'),
    el('div', { class: 'field-pair' },
      field('Service', select('service', SERVICES.map(s => [s, cap(s)]), 'mowing')),
      field('Price (CAD)', numberInput('price', ''))),
    el('div', { class: 'field-pair' },
      field('Billing', select('billing', BILLING_TYPES, 'per-visit')),
      field('Frequency', textInput('frequency', '', { placeholder: 'e.g. weekly' }))),
    el('div', { class: 'field-pair' },
      field('Repeats (schedule)', select('repeat', Object.entries(REPEAT_LABELS), 'none')),
      field('Next visit', dateInput('nextDate', ''))),
    el('div', { class: 'field-pair' },
      field('Start date', dateInput('startDate', '')),
      field('End date', dateInput('endDate', ''))),
  ];
  const form = el('form', {}, ...clientFields, ...contractFields,
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, existing ? 'Save' : 'Add client')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    if (!v.name) return;
    const saved = touch({
      ...c, name: v.name, phone: v.phone, email: v.email, address: v.address, notes: v.notes,
    });
    await put('clients', saved);
    let msg = existing ? 'Client updated' : 'Client added ✔';
    if (!existing && v.price && Number(v.price) > 0) {
      await put('contracts', newContract({
        clientId: saved.id, service: v.service, price: Number(v.price),
        billing: v.billing, frequency: v.frequency, startDate: v.startDate, endDate: v.endDate,
        repeat: v.repeat || 'none', nextDate: v.nextDate || '',
      }));
      msg = 'Client + contract added ✔';
    }
    closeModal();
    toast(msg);
    if (existing) render();
    else navigate('clients', { clientId: saved.id });
  });
  openModal(existing ? 'Edit client' : 'New client', [form]);
}

async function deleteClient(client, data) {
  const related = data.invoices.filter(i => i.clientId === client.id).length +
    data.contracts.filter(k => k.clientId === client.id).length;
  const msg = related
    ? `Delete ${client.name}? Their ${related} contract(s)/invoice(s) will also be deleted. This cannot be undone.`
    : `Delete ${client.name}? This cannot be undone.`;
  if (!confirmAction(msg)) return;
  for (const k of data.contracts.filter(k => k.clientId === client.id)) await remove('contracts', k.id);
  for (const i of data.invoices.filter(i => i.clientId === client.id)) await remove('invoices', i.id);
  for (const p of data.payments.filter(p => p.clientId === client.id)) await remove('payments', p.id);
  for (const v of data.visits.filter(v => v.clientId === client.id)) await remove('visits', v.id);
  for (const j of data.jobs.filter(j => j.clientId === client.id)) await remove('jobs', j.id);
  await remove('clients', client.id);
  toast('Client deleted');
  navigate('clients');
}

function contractForm(existing, client) {
  const k = existing || newContract({ clientId: client.id });
  const form = el('form', {},
    field('Service', select('service', SERVICES.map(s => [s, cap(s)]), k.service)),
    field('Description', textInput('description', k.description, { placeholder: 'e.g. weekly front + back lawn' })),
    el('div', { class: 'field-pair' },
      field('Price (CAD) *', numberInput('price', k.price || '')),
      field('Billing', select('billing', BILLING_TYPES, k.billing))),
    field('Frequency', textInput('frequency', k.frequency, { placeholder: 'e.g. weekly, per snowfall' })),
    el('div', { class: 'field-pair' },
      field('Repeats (schedule)', select('repeat', Object.entries(REPEAT_LABELS), k.repeat || 'none')),
      field('Next visit', dateInput('nextDate', k.nextDate))),
    el('div', { class: 'field-pair' },
      field('Start date', dateInput('startDate', k.startDate)),
      field('End date', dateInput('endDate', k.endDate))),
    field('Status', select('status', ['active', 'ended'], k.status)),
    field('Notes', textInput('notes', k.notes)),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, existing ? 'Save' : 'Add contract')),
    existing ? el('button', {
      class: 'link-danger', type: 'button', onclick: async () => {
        if (!confirmAction('Delete this contract? Its logged visits and scheduled jobs are deleted too.')) return;
        for (const v of (await getAll('visits')).filter(v => v.contractId === k.id)) await remove('visits', v.id);
        for (const j of (await getAll('jobs')).filter(j => j.contractId === k.id)) await remove('jobs', j.id);
        await remove('contracts', k.id);
        closeModal(); toast('Contract deleted'); render();
      }
    }, 'Delete contract') : null);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    if (!v.price) return;
    await put('contracts', touch({ ...k, ...v, price: Number(v.price) }));
    closeModal();
    toast(existing ? 'Contract updated' : 'Contract added');
    render();
  });
  openModal(existing ? 'Edit contract' : `New contract — ${client.name}`, [form]);
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
