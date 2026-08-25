// Today = what to do first (today's jobs), then what needs chasing, then the money picture.

import { el, navigate, render, toast } from '../app.js';
import { getMeta, setMeta, put } from '../db.js';
import { agingBuckets, money, monthKey, today, newInvoice, nextInvoiceNumber, addDays, touch, invoiceState, round2 } from '../models.js';
import { computeAlerts } from '../alerts.js';
import { billingSuggestions, suggestionKey } from '../billing.js';
import { agenda, catchUp } from '../schedule.js';
import { jobRow } from './jobrow.js';

const JOBS_CAP = 5;
const ALERTS_CAP = 5;

export async function renderDashboard(root, data, { lastExportAt }) {
  const refMonth = monthKey(today());
  const buckets = agingBuckets(data.invoices, data.payments);

  const revenueThisMonth = data.payments
    .filter(p => monthKey(p.date) === refMonth)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const expensesThisMonth = data.expenses
    .filter(e => monthKey(e.date) === refMonth)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const net = revenueThisMonth - expensesThisMonth;
  const wagesOwed = round2(data.shifts.filter(s => !s.paid)
    .reduce((s, x) => s + (Number(x.amount) || 0), 0));

  // ---- today's jobs — the reason he opens the app ----
  const jobs = agenda(data, today(), 1);
  const missed = catchUp(data);
  root.append(el('div', { class: 'section-label' }, 'Today'));
  if (missed.length) {
    root.append(el('div', { class: 'alert warn', onclick: () => navigate('schedule') },
      el('span', { class: 'a-icon' }, '⏰'),
      el('span', {}, `${missed.length} missed job${missed.length > 1 ? 's' : ''} to catch up on ›`)));
  }
  if (jobs.length === 0) {
    root.append(el('div', { class: 'card tappable', onclick: () => navigate('schedule') },
      el('div', { class: 'row' },
        el('div', { class: 'row-sub' }, 'Nothing scheduled today — open Schedule to plan the week'),
        el('span', { class: 'row-sub' }, '›'))));
  } else {
    for (const e of jobs.slice(0, JOBS_CAP)) root.append(jobRow(e, data));
    if (jobs.length > JOBS_CAP) {
      root.append(el('div', { class: 'card tappable', onclick: () => navigate('schedule') },
        el('div', { class: 'row' },
          el('div', { class: 'row-sub' }, `+${jobs.length - JOBS_CAP} more today`),
          el('span', { class: 'row-sub' }, '›'))));
    }
  }

  // ---- alerts (capped: nobody reads 50 alerts; the worst ones surface first) ----
  const alerts = computeAlerts(data, lastExportAt);
  root.append(el('div', { class: 'section-label' }, 'Needs attention'));
  if (alerts.length === 0) {
    root.append(el('div', { class: 'card' },
      el('div', { class: 'row-sub' }, '✅ All clear — nothing overdue, nothing over budget.')));
  } else {
    for (const a of alerts.slice(0, ALERTS_CAP)) {
      root.append(el('div', { class: `alert ${a.level}`, onclick: () => navigate(a.view, a.params || {}) },
        el('span', { class: 'a-icon' }, a.icon), el('span', {}, a.text)));
    }
    if (alerts.length > ALERTS_CAP) {
      root.append(el('div', { class: 'alert info', onclick: () => navigate('invoices') },
        el('span', { class: 'a-icon' }, '➕'),
        el('span', {}, `…and ${alerts.length - ALERTS_CAP} more — the Money tab's Overdue filter has the full list.`)));
    }
  }

  // ---- money hero — the loudest numbers on the screen ----
  root.append(el('div', { class: 'section-label' }, 'Money owed to you'));
  root.append(el('div', { class: 'hero-card tappable', onclick: () => navigate('invoices') },
    el('div', { class: 'hero-label' }, 'Owed to you'),
    el('div', { class: 'hero-value' }, money(buckets.total)),
    el('div', { class: 'aging hero-aging' },
      bucket('Not due', buckets.notDue, ''),
      bucket('1–30', buckets.d1_30, 'b1'),
      bucket('31–60', buckets.d31_60, 'b2'),
      bucket('61–90', buckets.d61_90, 'b3'),
      bucket('90+', buckets.d90plus, 'b4'))));

  // ---- this month ----
  root.append(el('div', { class: 'section-label' }, 'This month'));
  root.append(el('div', { class: 'stat-grid stat-hero-row' },
    el('div', { class: 'stat hero tappable', onclick: () => navigate('invoices', { mode: 'insights' }) },
      el('div', { class: 'label' }, 'Net this month'),
      el('div', { class: 'value ' + (net >= 0 ? 'pos' : 'neg') }, money(net)))));
  root.append(el('div', { class: 'stat-grid' },
    stat('Collected', money(revenueThisMonth), ''),
    stat('Spent', money(expensesThisMonth), ''),
    statLink('Wages owed', money(wagesOwed), wagesOwed > 0 ? 'neg' : '', () => navigate('crew')),
    stat('Open invoices', String(countOpen(data)), '')));

  // ---- ready to bill ----
  const dismissed = (await getMeta('dismissedBilling')) || {};
  const suggestions = billingSuggestions(data, dismissed);
  if (suggestions.length) {
    root.append(el('div', { class: 'section-label' },
      suggestions.length > 10 ? `Ready to bill (10 of ${suggestions.length})` : 'Ready to bill'));
    for (const s of suggestions.slice(0, 10)) {
      root.append(el('div', { class: 'card' },
        el('div', { class: 'row' },
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, `${s.client.name} · ${money(s.amount)}`),
            el('div', { class: 'row-sub' }, `${s.label} — ${s.contract.service}`)),
          el('div', { class: 'btn-row', style: 'margin-top:0' },
            el('button', { class: 'btn small', onclick: () => createDraft(s, data) }, 'Create draft'),
            el('button', {
              class: 'btn subtle small', title: 'Dismiss', onclick: async () => {
                dismissed[suggestionKey(s)] = true;
                await setMeta('dismissedBilling', dismissed);
                toast('Dismissed — it won’t be suggested again');
                render();
              }
            }, '✕')))));
    }
  }

  // ---- insights ----
  root.append(el('div', { class: 'section-label' }, 'Business'));
  root.append(el('div', { class: 'card tappable', onclick: () => navigate('invoices', { mode: 'insights' }) },
    el('div', { class: 'row' },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title' }, '📊 Insights'),
        el('div', { class: 'row-sub' }, 'Profit, mowing vs plowing, labour cost, hiring power')),
      el('span', { class: 'row-sub' }, '›'))));

  root.append(el('div', { class: 'fab-space' }));
}

async function createDraft(s, data) {
  const inv = newInvoice({
    number: nextInvoiceNumber(data.invoices),
    clientId: s.client.id,
    contractId: s.contract.id,
    amount: s.amount,
    status: 'draft',
    dueDate: addDays(today(), 14),
    notes: s.label,
  });
  await put('invoices', inv);
  for (const v of s.visits) {
    v.invoiceId = inv.id;
    await put('visits', touch(v));
  }
  toast(`Draft ${inv.number} created — review it in Money`);
  render();
}

function bucket(label, value, cls) {
  return el('div', { class: `bucket ${cls}` }, el('b', {}, money(value)), label);
}
function stat(label, value, valueCls) {
  return el('div', { class: 'stat' },
    el('div', { class: 'label' }, label),
    el('div', { class: `value ${valueCls}` }, value));
}
function statLink(label, value, valueCls, onclick) {
  return el('div', { class: 'stat tappable', onclick },
    el('div', { class: 'label' }, label),
    el('div', { class: `value ${valueCls}` }, value));
}
function countOpen(data) {
  return data.invoices.filter(i => {
    if (i.status === 'draft') return false;
    return invoiceState(i, data.payments).balance > 0.004;
  }).length;
}
