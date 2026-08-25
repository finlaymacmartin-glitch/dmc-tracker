// Money tab: Invoices | Quotes | Insights.
// Invoice status and balances are always derived from payments, never typed in.
// Quotes: open → accepted (auto-creates client + contract) / declined; expiry derived.
// Insights render inline (no dead-end modals): P&L, per-line, labour, hiring power.

import { el, navigate, render, openModal, closeModal, field, textInput, numberInput, dateInput, select, formValues, searchBox, toast, confirmAction } from '../app.js';
import { put, remove } from '../db.js';
import {
  newInvoice, newPayment, newQuote, newClient, newContract, touch, invoiceState,
  nextInvoiceNumber, quoteName, quoteStatus, money, fmtDate, fmtMonth, addDays, today, round2,
  PAYMENT_METHODS, SERVICES, BILLING_TYPES, BILLING_LABELS,
} from '../models.js';
import { getBusiness, paymentRequestText, reviewRequestText, shareText } from '../messages.js';
import { monthlyPnl, linePnl, labourStats, opsStats, hiringPower, defaultWageRate } from '../insights.js';
import { icon } from '../icons.js';

let filter = 'open';
let moneyMode = 'invoices'; // 'invoices' | 'quotes' | 'insights'

// The Money tab's segment bar. Shared with the Expenses view ("Spend"), which is a
// separate view but reads as the 3rd segment of Money — navigate() keeps deep links clean.
export function moneySegments(active) {
  const seg = (key, label, go) =>
    el('button', { class: 'seg' + (active === key ? ' active' : ''), onclick: go }, label);
  return el('div', { class: 'segment' },
    seg('invoices', 'Bills', () => { moneyMode = 'invoices'; navigate('invoices'); }),
    seg('spend', 'Spend', () => navigate('expenses')),
    seg('quotes', 'Quotes', () => { moneyMode = 'quotes'; navigate('invoices'); }),
    seg('insights', 'Insights', () => { moneyMode = 'insights'; navigate('invoices'); }));
}
let invQ = '';
let quoteQ = '';
const LIST_CAP = 200;

export function renderInvoices(root, data, { params }) {
  if (params.invoiceId) return renderInvoiceDetail(root, data, params.invoiceId);
  if (params.mode) moneyMode = params.mode;

  root.append(moneySegments(moneyMode));

  if (moneyMode === 'quotes') return renderQuotes(root, data);
  if (moneyMode === 'insights') return renderInsights(root, data);

  root.append(el('button', {
    class: 'btn add-btn',
    onclick: () => data.clients.length ? invoiceForm(null, data) : toast('Add a client first (Clients tab)'),
  }, '+ New invoice'));

  const draftCount = data.invoices.filter(i => i.status === 'draft').length;
  const filters = [['open', 'Open'], ['drafts', draftCount ? `Drafts (${draftCount})` : 'Drafts'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['all', 'All']];
  root.append(el('div', { class: 'filters' }, filters.map(([key, label]) =>
    el('button', { class: 'fbtn' + (filter === key ? ' active' : ''), onclick: () => { filter = key; render(); } }, label))));

  const clientById = Object.fromEntries(data.clients.map(c => [c.id, c]));
  let rows = data.invoices.map(inv => ({ inv, st: invoiceState(inv, data.payments) }));
  if (filter === 'open') rows = rows.filter(r => r.st.balance > 0.004 && r.inv.status !== 'draft');
  else if (filter === 'drafts') rows = rows.filter(r => r.inv.status === 'draft');
  else if (filter === 'overdue') rows = rows.filter(r => r.st.status === 'overdue');
  else if (filter === 'paid') rows = rows.filter(r => r.st.status === 'paid');
  rows.sort((a, b) => (b.inv.dateIssued || '').localeCompare(a.inv.dateIssued || ''));

  if (rows.length === 0) {
    root.append(el('div', { class: 'empty' }, filter === 'all' ? 'No invoices yet.' : `No ${filter === 'drafts' ? 'draft' : filter} invoices.`));
    return;
  }
  const listBox = el('div');
  const draw = () => {
    listBox.innerHTML = '';
    const q = invQ.trim().toLowerCase();
    const matched = rows.filter(({ inv }) => {
      if (!q) return true;
      const who = clientById[inv.clientId]?.name || '';
      return `${inv.number} ${who} ${inv.notes}`.toLowerCase().includes(q);
    });
    for (const { inv, st } of matched.slice(0, LIST_CAP)) {
      const who = clientById[inv.clientId]?.name || 'Unknown client';
      listBox.append(el('div', { class: 'card tappable', onclick: () => navigate('invoices', { invoiceId: inv.id }) },
        el('div', { class: 'row' },
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, `${who} · ${inv.number}`),
            el('div', { class: 'row-sub' },
              st.balance > 0.004
                ? `${money(st.balance)} owing${st.daysPastDue > 0 ? ` · ${st.daysPastDue}d overdue` : inv.dueDate ? ` · due ${fmtDate(inv.dueDate)}` : ''}`
                : `Paid in full · ${money(inv.amount)}`)),
          el('span', { class: `chip ${st.status}` }, st.status))));
    }
    if (matched.length === 0) listBox.append(el('div', { class: 'empty' }, 'No invoices match that search.'));
    else if (matched.length > LIST_CAP) listBox.append(el('div', { class: 'empty' }, `Showing ${LIST_CAP} of ${matched.length} — type to narrow down.`));
  };
  if (data.invoices.length > 5) root.append(searchBox('Search by client or invoice #…', invQ, v => { invQ = v; draw(); }));
  root.append(listBox);
  draw();
  root.append(el('div', { class: 'fab-space' }));
}

// ---------------- quotes ----------------
function renderQuotes(root, data) {
  root.append(el('button', { class: 'btn add-btn', onclick: () => quoteForm(null, data) }, '+ New quote'));

  const quotes = [...data.quotes].sort((a, b) => (b.dateIssued || '').localeCompare(a.dateIssued || ''));
  const decided = quotes.filter(q => quoteStatus(q) !== 'open');
  const won = quotes.filter(q => q.status === 'accepted');
  if (decided.length) {
    root.append(el('div', { class: 'row-sub', style: 'margin-bottom:10px' },
      `Win rate: ${won.length} of ${decided.length} decided (${Math.round(won.length / decided.length * 100)}%)`));
  }
  if (quotes.length === 0) {
    root.append(el('div', { class: 'empty' }, 'No quotes yet. Quote a job, and if it’s accepted the client and contract are created for you.'));
    return;
  }
  const chipClass = { open: 'sent', accepted: 'paid', declined: 'overdue', expired: 'draft' };
  const listBox = el('div');
  const draw = () => {
    listBox.innerHTML = '';
    const ql = quoteQ.trim().toLowerCase();
    const matched = quotes.filter(q => !ql ||
      `${quoteName(q, data.clients)} ${q.service} ${q.description} ${q.notes}`.toLowerCase().includes(ql));
    for (const q of matched.slice(0, LIST_CAP)) {
      const st = quoteStatus(q);
      listBox.append(el('div', { class: 'card tappable', onclick: () => quoteActions(q, data) },
        el('div', { class: 'row' },
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, `${quoteName(q, data.clients)} · ${money(q.price)} ${BILLING_LABELS[q.billing] || q.billing}`),
            el('div', { class: 'row-sub' }, [cap(q.service), q.description, `sent ${fmtDate(q.dateIssued)}`, st === 'open' && q.expiryDate ? `expires ${fmtDate(q.expiryDate)}` : ''].filter(Boolean).join(' · '))),
          el('span', { class: `chip ${chipClass[st]}` }, st))));
    }
    if (matched.length === 0) listBox.append(el('div', { class: 'empty' }, 'No quotes match that search.'));
  };
  if (quotes.length > 5) root.append(searchBox('Search quotes…', quoteQ, v => { quoteQ = v; draw(); }));
  root.append(listBox);
  draw();
  root.append(el('div', { class: 'fab-space' }));
}

// ---------------- insights (inline; also the app's first page) ----------------
export function renderInsights(root, data) {
  const labour = labourStats(data);
  const ops = opsStats(data);
  const pnl = monthlyPnl(data, 6).filter(r => r.revenue || r.expenses);
  const lines = linePnl(data).filter(r => r.revenue || r.expenses || r.wagesOwed);

  root.append(el('div', { class: 'stat-grid', style: 'margin-bottom:16px' },
    stat('Labour % of revenue', labour.revenue > 0 ? `${Math.round(labour.labourPct * 100)}%` : '—', labour.labourPct > 0.3 ? 'neg' : ''),
    stat('Wages owed', money(labour.wagesOwed), labour.wagesOwed > 0 ? 'neg' : ''),
    stat(ops.avgPerVisitBasis === 'billed' ? 'Avg $ / billed visit' : 'Typical visit price',
      ops.avgPerVisit > 0 ? money(ops.avgPerVisit) : '—', ''),
    stat('Quote win rate', ops.winRate === null ? '—' : `${Math.round(ops.winRate * 100)}%`, '')));

  // monthly cash flow as glanceable bars: in (green) vs out (red), bold net — no table
  root.append(el('div', { class: 'section-label', style: 'margin-top:0' }, 'Monthly cash flow'));
  if (pnl.length === 0) root.append(el('div', { class: 'empty' }, 'No activity yet.'));
  else {
    const max = Math.max(...pnl.map(r => Math.max(r.revenue, r.expenses)), 1);
    root.append(el('div', { class: 'card cash-card' }, pnl.map(r =>
      el('div', { class: 'cash-row' },
        el('div', { class: 'cash-month' }, fmtMonth(r.month).replace(/ \d{4}$/, '')),
        el('div', { class: 'cash-bars' },
          el('div', { class: 'cash-bar in', style: `width:${Math.max(2, r.revenue / max * 100)}%` }),
          el('div', { class: 'cash-bar out', style: `width:${Math.max(2, r.expenses / max * 100)}%` })),
        el('div', { class: 'cash-net' + (r.net < 0 ? ' neg' : '') }, money(r.net))))));
  }

  // per-line cards, color-coded (green = mowing, cyan = plowing)
  root.append(el('div', { class: 'section-label' }, 'Mowing vs plowing (all time, owed wages included)'));
  if (lines.length === 0) root.append(el('div', { class: 'empty' }, 'No line-tagged activity yet.'));
  else root.append(el('div', { class: 'line-grid' }, lines.map(r =>
    el('div', { class: `stat line-card ${r.line}` },
      el('div', { class: 'label' }, r.line[0].toUpperCase() + r.line.slice(1)),
      el('div', { class: 'value' + (r.net < 0 ? ' neg' : '') }, money(r.net)),
      el('div', { class: 'row-sub' }, `${money(r.revenue)} in · ${money(r.expenses + r.wagesOwed)} out`)))));
  root.append(el('div', { class: 'row-sub', style: 'margin-top:10px' },
    'Cash basis: money in = payments received, money out = expenses (paid wages included).'));

  // ---- hiring power (live what-if, inline — inputs redraw only the output box) ----
  root.append(el('div', { class: 'section-label' }, icon('trendUp', 'ico-inline'), ' Hiring power'));
  root.append(el('div', { class: 'row-sub', style: 'margin-bottom:10px' },
    'What would hiring a helper do to your numbers? Adjust and see.'));
  const rateIn = numberInput('rate', defaultWageRate(data.crew));
  const hoursIn = numberInput('hours', 10, { step: '1' });
  const out = el('div', {});

  function recompute() {
    const hp = hiringPower(data, rateIn.value, hoursIn.value);
    out.innerHTML = '';
    if (hp.thin) {
      out.append(el('div', { class: 'empty' }, 'Not enough history yet — after a full month of payments and expenses this can give a real answer.'));
      return;
    }
    out.append(el('div', { class: 'stat-grid', style: 'margin:14px 0' },
      stat('Helper cost / month', money(hp.monthlyCost), ''),
      stat('Your avg profit / month', money(hp.avgNet), hp.avgNet < 0 ? 'neg' : 'pos')));
    const verdictText = hp.avgNet <= 0
      ? 'Right now the business isn’t clearing a profit, so a helper only makes sense if they directly bring in new work.'
      : hp.affordable >= 1
        ? `Your current profit covers ${hp.affordable} helper${hp.affordable > 1 ? 's' : ''} at these hours without any new work.`
        : 'Current profit doesn’t fully cover a helper at these hours — they’d need to help you take on more work.';
    out.append(el('div', { class: `alert ${hp.avgNet > 0 && hp.affordable >= 1 ? 'info' : 'warn'}`, style: 'cursor:default' },
      el('span', { class: 'a-icon' }, icon(hp.avgNet > 0 && hp.affordable >= 1 ? 'check' : 'warning')),
      el('span', {}, verdictText)));
    if (hp.breakEvenVisitsPerWeek !== null) {
      const basisText = hp.avgPerVisitBasis === 'billed'
        ? `at your average of ${money(hp.avgPerVisit)} billed per visit`
        : `at your typical per-visit price of ${money(hp.avgPerVisit)}`;
      out.append(el('div', { class: 'row-sub', style: 'margin-top:8px' },
        `Break-even: ${basisText}, a helper pays for themselves if they help complete about ${hp.breakEvenVisitsPerWeek} extra visit${hp.breakEvenVisitsPerWeek > 1 ? 's' : ''} a week.`));
    }
    out.append(el('div', { class: 'row-sub', style: 'margin-top:8px' },
      `Rule of thumb: keep total labour under ~30% of revenue. Profit average uses your last ${hp.monthsUsed} completed month${hp.monthsUsed > 1 ? 's' : ''}.`));
  }
  rateIn.addEventListener('input', recompute);
  hoursIn.addEventListener('input', recompute);
  recompute();

  root.append(el('div', { class: 'card' },
    el('div', { class: 'field-pair' },
      field('Wage ($/hr)', rateIn),
      field('Hours / week', hoursIn)),
    out));
  root.append(el('div', { class: 'fab-space' }));
}

function stat(label, value, valueCls) {
  return el('div', { class: 'stat' },
    el('div', { class: 'label' }, label),
    el('div', { class: `value ${valueCls}` }, value));
}

function quoteActions(q, data) {
  const st = quoteStatus(q);
  const body = [
    el('div', { class: 'row-sub' }, `${quoteName(q, data.clients)} — ${cap(q.service)}`),
    el('div', { class: 'row-sub' }, `${money(q.price)} ${BILLING_LABELS[q.billing] || q.billing}${q.frequency ? ' · ' + q.frequency : ''}`),
    q.description ? el('div', { class: 'row-sub' }, q.description) : null,
    q.notes ? el('div', { class: 'row-sub' }, icon('note', 'ico-inline'), ' ' + q.notes) : null,
    el('div', { class: 'row-sub', style: 'margin-bottom:12px' }, `Sent ${fmtDate(q.dateIssued)}${q.expiryDate ? ' · expires ' + fmtDate(q.expiryDate) : ''}`),
  ];
  if (st === 'open' || st === 'expired') {
    body.push(el('button', { class: 'btn', style: 'margin-bottom:8px', onclick: () => acceptQuote(q, data) }, '✓ Accepted — create client & contract'));
    body.push(el('button', {
      class: 'btn subtle', style: 'margin-bottom:8px', onclick: async () => {
        await put('quotes', touch({ ...q, status: 'declined' }));
        closeModal(); toast('Quote marked declined'); render();
      }
    }, 'Declined'));
  }
  body.push(el('div', { class: 'btn-row' },
    el('button', { class: 'btn secondary small', onclick: () => quoteForm(q, data) }, 'Edit'),
    el('button', {
      class: 'btn subtle small', onclick: async () => {
        if (!confirmAction('Delete this quote?')) return;
        await remove('quotes', q.id);
        closeModal(); toast('Quote deleted'); render();
      }
    }, 'Delete')));
  openModal(`Quote — ${quoteName(q, data.clients)}`, body);
}

async function acceptQuote(q, data) {
  let clientId = q.clientId;
  if (!clientId) {
    const client = newClient({ name: q.prospectName || 'New client', phone: q.prospectPhone, address: q.prospectAddress });
    await put('clients', client);
    clientId = client.id;
  }
  const contract = newContract({
    clientId, service: q.service, description: q.description, price: Number(q.price) || 0,
    billing: q.billing, frequency: q.frequency, startDate: today(),
  });
  await put('contracts', contract);
  await put('quotes', touch({ ...q, status: 'accepted', clientId, contractId: contract.id }));
  closeModal();
  toast('Quote won ✔ — client & contract created');
  navigate('clients', { clientId });
}

function quoteForm(existing, data) {
  const q = existing || newQuote();
  const clientSel = select('clientId', [['', '— New prospect —'], ...data.clients.map(c => [c.id, c.name])], q.clientId);
  const prospectFields = el('div', {},
    field('Prospect name *', textInput('prospectName', q.prospectName)),
    el('div', { class: 'field-pair' },
      field('Phone', textInput('prospectPhone', q.prospectPhone, { type: 'tel' })),
      field('Address', textInput('prospectAddress', q.prospectAddress))));
  const syncProspect = () => { prospectFields.style.display = clientSel.value ? 'none' : ''; };
  clientSel.addEventListener('change', syncProspect);
  syncProspect();

  const form = el('form', {},
    field('Who is this for?', clientSel),
    prospectFields,
    el('div', { class: 'field-pair' },
      field('Service', select('service', SERVICES.map(s => [s, cap(s)]), q.service)),
      field('Price (CAD) *', numberInput('price', q.price || ''))),
    el('div', { class: 'field-pair' },
      field('Billing', select('billing', BILLING_TYPES.map(b => [b, BILLING_LABELS[b]]), q.billing)),
      field('Frequency', textInput('frequency', q.frequency, { placeholder: 'e.g. weekly' }))),
    field('Description', textInput('description', q.description, { placeholder: 'what’s included' })),
    el('div', { class: 'field-pair' },
      field('Date sent', dateInput('dateIssued', q.dateIssued)),
      field('Expires', dateInput('expiryDate', q.expiryDate))),
    field('Notes', textInput('notes', q.notes)),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, existing ? 'Save' : 'Add quote')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    if (!v.price || (!v.clientId && !v.prospectName)) return;
    await put('quotes', touch({ ...q, ...v, price: Number(v.price) }));
    closeModal();
    toast(existing ? 'Quote updated' : 'Quote added');
    render();
  });
  openModal(existing ? 'Edit quote' : 'New quote', [form]);
}

// ---------------- invoice detail ----------------
function renderInvoiceDetail(root, data, invoiceId) {
  const inv = data.invoices.find(i => i.id === invoiceId);
  if (!inv) { navigate('invoices'); return; }
  const st = invoiceState(inv, data.payments);
  const client = data.clients.find(c => c.id === inv.clientId);
  const contract = data.contracts.find(k => k.id === inv.contractId);

  root.append(el('button', { class: 'back-link', onclick: () => navigate('invoices') }, '‹ All invoices'));

  root.append(el('div', { class: 'card detail-head' },
    el('div', { class: 'row' },
      el('h2', {}, inv.number),
      el('span', { class: `chip ${st.status}` }, st.status)),
    el('div', { class: 'row-sub' }, client ? client.name : 'Unknown client'),
    contract ? el('div', { class: 'row-sub' }, `Contract: ${contract.service} — ${contract.description || money(contract.price) + ' ' + (BILLING_LABELS[contract.billing] || contract.billing)}`) : null,
    el('div', { class: 'row-sub' }, `Issued ${fmtDate(inv.dateIssued)}${inv.dueDate ? ' · due ' + fmtDate(inv.dueDate) : ''}`),
    inv.notes ? el('div', { class: 'row-sub' }, icon('note', 'ico-inline'), ' ' + inv.notes) : null,
    el('div', { class: 'row', style: 'margin-top:10px' }, el('div', { class: 'row-sub' }, 'Invoice total'), el('div', { class: 'row-amount' }, money(inv.amount))),
    el('div', { class: 'row' }, el('div', { class: 'row-sub' }, 'Paid'), el('div', { class: 'row-amount' }, money(st.paid))),
    el('div', { class: 'row' }, el('div', { class: 'row-sub' }, 'Balance'), el('div', { class: 'row-amount' + (st.balance > 0 ? ' neg' : '') }, money(st.balance))),
    el('div', { class: 'btn-row' },
      st.status === 'draft' ? el('button', {
        class: 'btn small', onclick: async () => {
          await put('invoices', touch({ ...inv, status: 'sent' }));
          toast(`${inv.number} approved — now counts in AR`);
          render();
        }
      }, '✓ Approve & send') : null,
      st.status !== 'draft' && st.balance > 0.004 ? el('button', { class: 'btn small', onclick: () => paymentForm(inv, st) }, 'Record payment') : null,
      el('button', { class: 'btn secondary small', onclick: () => invoiceForm(inv, data) }, 'Edit'),
      el('button', { class: 'btn subtle small', onclick: () => deleteInvoice(inv, data) }, 'Delete')),
    el('div', { class: 'btn-row' },
      st.status !== 'draft' && st.balance > 0.004 && client ? el('button', {
        class: 'btn secondary small', onclick: async () => {
          const result = await shareText(paymentRequestText(client, inv, st.balance, await getBusiness()));
          if (result === 'shared') toast('Share sheet opened ✔');
          else if (result === 'copied') toast('Message copied — paste it into a text');
        }
      }, icon('message', 'ico-inline'), ' Request payment') : null,
      st.status === 'overdue' ? el('button', { class: 'btn secondary small', onclick: () => lateFeeForm(inv, st) }, '+ Late fee') : null,
      st.status === 'paid' && client ? el('button', {
        class: 'btn secondary small', onclick: async () => {
          const result = await shareText(reviewRequestText(client, await getBusiness()));
          if (result === 'shared') toast('Share sheet opened ✔');
          else if (result === 'copied') toast('Message copied — paste it into a text');
        }
      }, icon('star', 'ico-inline'), ' Ask for review') : null)));

  root.append(el('div', { class: 'section-label' }, 'Payments'));
  const pays = data.payments.filter(p => p.invoiceId === inv.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (pays.length === 0) root.append(el('div', { class: 'empty' }, 'No payments recorded yet.'));
  for (const p of pays) {
    root.append(el('div', { class: 'card' },
      el('div', { class: 'row' },
        el('div', { class: 'row-main' },
          el('div', { class: 'row-title' }, money(p.amount)),
          el('div', { class: 'row-sub' }, [fmtDate(p.date), p.method, p.note].filter(Boolean).join(' · '))),
        el('button', {
          class: 'btn subtle small', onclick: async () => {
            if (!confirmAction('Delete this payment?')) return;
            await remove('payments', p.id);
            toast('Payment deleted'); render();
          }
        }, '✕'))));
  }
  root.append(el('div', { class: 'fab-space' }));
}

function lateFeeForm(inv, st) {
  const suggested = Math.max(10, round2(st.balance * 0.02));
  const form = el('form', {},
    el('div', { class: 'row-sub', style: 'margin-bottom:12px' },
      `Adds a late fee onto ${inv.number}. Suggested: $10 or 2% of the balance, whichever is more.`),
    field('Late fee (CAD)', numberInput('fee', suggested)),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, 'Add fee')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fee = round2(Number(formValues(form).fee) || 0);
    if (fee <= 0) return;
    const note = `Late fee ${money(fee)} added ${today()}`;
    await put('invoices', touch({ ...inv, amount: round2(Number(inv.amount) + fee), notes: inv.notes ? `${inv.notes} · ${note}` : note }));
    closeModal();
    toast(`Late fee added — new total reflects it`);
    render();
  });
  openModal('Add late fee', [form]);
}

// ---------------- forms ----------------
function invoiceForm(existing, data) {
  const inv = existing || newInvoice({
    number: nextInvoiceNumber(data.invoices),
    dueDate: addDays(today(), 14),
  });
  const clientOptions = data.clients.map(c => [c.id, c.name]);
  const clientSel = select('clientId', clientOptions, inv.clientId || clientOptions[0]?.[0]);
  const contractSel = select('contractId', contractOptionsFor(clientSel.value, data), inv.contractId);
  clientSel.addEventListener('change', () => {
    const opts = contractOptionsFor(clientSel.value, data);
    contractSel.innerHTML = '';
    for (const [val, label] of opts) contractSel.append(el('option', { value: val }, label));
  });
  // Picking a contract pre-fills the amount with the contract price.
  const amountIn = numberInput('amount', inv.amount || '');
  contractSel.addEventListener('change', () => {
    const k = data.contracts.find(x => x.id === contractSel.value);
    if (k && !existing) amountIn.value = k.price;
  });

  const form = el('form', {},
    el('div', { class: 'field-pair' },
      field('Invoice #', textInput('number', inv.number)),
      field('Status', select('status', [['sent', 'Sent'], ['draft', 'Draft']], inv.status === 'draft' ? 'draft' : 'sent'))),
    field('Client *', clientSel),
    field('Contract (optional)', contractSel),
    field('Amount (CAD) *', amountIn),
    el('div', { class: 'field-pair' },
      field('Date issued', dateInput('dateIssued', inv.dateIssued)),
      field('Due date', dateInput('dueDate', inv.dueDate))),
    field('Notes', textInput('notes', inv.notes)),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, existing ? 'Save' : 'Create invoice')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    if (!v.clientId || !v.amount) return;
    await put('invoices', touch({ ...inv, ...v, amount: Number(v.amount) }));
    closeModal();
    toast(existing ? 'Invoice updated' : `Invoice ${v.number} created`);
    render();
  });
  openModal(existing ? 'Edit invoice' : 'New invoice', [form]);
}

function contractOptionsFor(clientId, data) {
  const opts = [['', 'None / one-off job']];
  for (const k of data.contracts.filter(k => k.clientId === clientId)) {
    opts.push([k.id, `${k.service} — ${money(k.price)} ${BILLING_LABELS[k.billing] || k.billing}`]);
  }
  return opts;
}

function paymentForm(inv, st) {
  const p = newPayment({ invoiceId: inv.id, clientId: inv.clientId, amount: st.balance });
  const form = el('form', {},
    field('Amount (CAD) *', numberInput('amount', p.amount)),
    el('div', { class: 'field-pair' },
      field('Date', dateInput('date', p.date)),
      field('Method', select('method', PAYMENT_METHODS, p.method))),
    field('Note', textInput('note', '')),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, 'Record payment')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    if (!v.amount || Number(v.amount) <= 0) return;
    await put('payments', touch({ ...p, ...v, amount: Number(v.amount) }));
    closeModal();
    toast('Payment recorded');
    render();
  });
  openModal(`Payment — ${inv.number}`, [form]);
}

async function deleteInvoice(inv, data) {
  const pays = data.payments.filter(p => p.invoiceId === inv.id);
  const msg = pays.length
    ? `Delete ${inv.number} and its ${pays.length} payment(s)? This cannot be undone.`
    : `Delete ${inv.number}? This cannot be undone.`;
  if (!confirmAction(msg)) return;
  for (const p of pays) await remove('payments', p.id);
  // visits billed on this invoice become billable again
  for (const v of data.visits.filter(v => v.invoiceId === inv.id)) {
    v.invoiceId = '';
    await put('visits', touch(v));
  }
  await remove('invoices', inv.id);
  toast('Invoice deleted');
  navigate('invoices');
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
