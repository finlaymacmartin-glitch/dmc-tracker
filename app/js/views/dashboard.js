// Dashboard = alert center + AR snapshot + this-month money picture.

import { el, navigate, render, toast, openModal, closeModal, field, numberInput } from '../app.js';
import { put, getMeta, setMeta } from '../db.js';
import { agingBuckets, invoiceState, money, fmtMonth, monthKey, today, newInvoice, nextInvoiceNumber, addDays, touch } from '../models.js';
import { computeAlerts } from '../alerts.js';
import { billingSuggestions, suggestionKey } from '../billing.js';
import { todayStats } from '../schedule.js';
import { monthlyPnl, linePnl, labourStats, opsStats, hiringPower, defaultWageRate } from '../insights.js';

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

  // ---- alerts (capped: nobody reads 50 alerts; the worst ones surface first) ----
  const alerts = computeAlerts(data, lastExportAt);
  root.append(el('div', { class: 'section-label' }, 'Needs attention'));
  if (alerts.length === 0) {
    root.append(el('div', { class: 'card' },
      el('div', { class: 'row-sub' }, '✅ All clear — nothing overdue, nothing over budget.')));
  } else {
    for (const a of alerts.slice(0, 8)) {
      root.append(el('div', { class: `alert ${a.level}`, onclick: () => navigate(a.view, a.params || {}) },
        el('span', { class: 'a-icon' }, a.icon), el('span', {}, a.text)));
    }
    if (alerts.length > 8) {
      root.append(el('div', { class: 'alert info', onclick: () => navigate('invoices') },
        el('span', { class: 'a-icon' }, '➕'),
        el('span', {}, `…and ${alerts.length - 8} more — the Money tab's Overdue filter has the full list.`)));
    }
  }

  // ---- today's jobs ----
  const ts = todayStats(data);
  root.append(el('div', { class: 'card tappable', onclick: () => navigate('schedule') },
    el('div', { class: 'row' },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title' }, '📅 Today'),
        el('div', { class: 'row-sub' }, ts.total === 0
          ? 'No jobs scheduled — open Schedule to plan the week'
          : `${ts.total} job${ts.total > 1 ? 's' : ''} · ${ts.done} done`)),
      el('span', { class: 'row-sub' }, '›'))));

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

  // ---- AR snapshot ----
  root.append(el('div', { class: 'section-label' }, 'Money owed to you'));
  const arCard = el('div', { class: 'card tappable', onclick: () => navigate('invoices') },
    el('div', { class: 'row' },
      el('div', { class: 'row-main' }, el('div', { class: 'row-title' }, 'Total outstanding')),
      el('div', { class: 'row-amount' + (buckets.total > 0 ? '' : ''), style: 'font-size:1.3rem' }, money(buckets.total))),
    el('div', { class: 'aging' },
      bucket('Not due', buckets.notDue, ''),
      bucket('1–30', buckets.d1_30, 'b1'),
      bucket('31–60', buckets.d31_60, 'b2'),
      bucket('61–90', buckets.d61_90, 'b3'),
      bucket('90+', buckets.d90plus, 'b4')));
  root.append(arCard);

  // ---- this month ----
  root.append(el('div', { class: 'section-label' }, 'This month'));
  root.append(el('div', { class: 'stat-grid' },
    stat('Collected', money(revenueThisMonth), ''),
    stat('Spent', money(expensesThisMonth), ''),
    stat('Net', money(net), net >= 0 ? 'pos' : 'neg'),
    stat('Open invoices', String(countOpen(data)), '')));

  // ---- business analysis ----
  root.append(el('div', { class: 'section-label' }, 'Business'));
  root.append(el('div', { class: 'card tappable', onclick: () => insightsModal(data) },
    el('div', { class: 'row' },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title' }, '📊 Insights'),
        el('div', { class: 'row-sub' }, 'Monthly profit, mowing vs plowing, labour cost, revenue per visit')),
      el('span', { class: 'row-sub' }, '›'))));
  root.append(el('div', { class: 'card tappable', onclick: () => hiringModal(data) },
    el('div', { class: 'row' },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title' }, '💪 Hiring power'),
        el('div', { class: 'row-sub' }, 'What a helper costs, and whether the business can carry one')),
      el('span', { class: 'row-sub' }, '›'))));

  root.append(el('div', { class: 'fab-space' }));
}

// ---------------- insights ----------------
function insightsModal(data) {
  const labour = labourStats(data);
  const ops = opsStats(data);
  const pnl = monthlyPnl(data, 6).filter(r => r.revenue || r.expenses);
  const lines = linePnl(data).filter(r => r.revenue || r.expenses || r.wagesOwed);

  const statGrid = el('div', { class: 'stat-grid', style: 'margin-bottom:16px' },
    stat('Labour % of revenue', labour.revenue > 0 ? `${Math.round(labour.labourPct * 100)}%` : '—', labour.labourPct > 0.3 ? 'neg' : ''),
    stat('Wages owed', money(labour.wagesOwed), labour.wagesOwed > 0 ? 'neg' : ''),
    stat(ops.avgPerVisitBasis === 'billed' ? 'Avg $ / billed visit' : 'Typical visit price',
      ops.avgPerVisit > 0 ? money(ops.avgPerVisit) : '—', ''),
    stat('Quote win rate', ops.winRate === null ? '—' : `${Math.round(ops.winRate * 100)}%`, ''));

  const pnlTable = el('table', { class: 'stmt-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Month'), el('th', { class: 'num' }, 'In'), el('th', { class: 'num' }, 'Out'), el('th', { class: 'num' }, 'Net'))),
    el('tbody', {}, pnl.map(r => el('tr', {},
      el('td', {}, fmtMonth(r.month)),
      el('td', { class: 'num' }, money(r.revenue)),
      el('td', { class: 'num' }, money(r.expenses)),
      el('td', { class: 'num', style: r.net < 0 ? 'color:var(--danger);font-weight:700' : 'font-weight:700' }, money(r.net))))));

  const lineTable = el('table', { class: 'stmt-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Line'), el('th', { class: 'num' }, 'Revenue'), el('th', { class: 'num' }, 'Costs'), el('th', { class: 'num' }, 'Net'))),
    el('tbody', {}, lines.map(r => el('tr', {},
      el('td', {}, r.line[0].toUpperCase() + r.line.slice(1)),
      el('td', { class: 'num' }, money(r.revenue)),
      el('td', { class: 'num' }, money(r.expenses + r.wagesOwed)),
      el('td', { class: 'num', style: r.net < 0 ? 'color:var(--danger);font-weight:700' : 'font-weight:700' }, money(r.net))))));

  openModal('Business insights', [
    statGrid,
    el('div', { class: 'section-label', style: 'margin-top:0' }, 'Monthly cash flow'),
    pnl.length ? pnlTable : el('div', { class: 'empty' }, 'No activity yet.'),
    el('div', { class: 'section-label' }, 'Mowing vs plowing (all time, owed wages included)'),
    lines.length ? lineTable : el('div', { class: 'empty' }, 'No line-tagged activity yet.'),
    el('div', { class: 'row-sub', style: 'margin-top:10px' },
      'Cash basis: money in = payments received, money out = expenses (paid wages included).'),
  ]);
}

function hiringModal(data) {
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
      stat(`Your avg profit / month`, money(hp.avgNet), hp.avgNet < 0 ? 'neg' : 'pos')));
    const verdictText = hp.avgNet <= 0
      ? 'Right now the business isn’t clearing a profit, so a helper only makes sense if they directly bring in new work.'
      : hp.affordable >= 1
        ? `Your current profit covers ${hp.affordable} helper${hp.affordable > 1 ? 's' : ''} at these hours without any new work.`
        : 'Current profit doesn’t fully cover a helper at these hours — they’d need to help you take on more work.';
    out.append(el('div', { class: `alert ${hp.avgNet > 0 && hp.affordable >= 1 ? 'info' : 'warn'}`, style: 'cursor:default' },
      el('span', { class: 'a-icon' }, hp.avgNet > 0 && hp.affordable >= 1 ? '✅' : '⚠️'),
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

  openModal('Hiring power', [
    el('div', { class: 'row-sub', style: 'margin-bottom:12px' }, 'What would hiring a helper do to your numbers? Adjust and see.'),
    el('div', { class: 'field-pair' },
      field('Wage ($/hr)', rateIn),
      field('Hours / week', hoursIn)),
    out,
  ]);
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
function countOpen(data) {
  return data.invoices.filter(i => {
    if (i.status === 'draft') return false;
    return invoiceState(i, data.payments).balance > 0.004;
  }).length;
}
