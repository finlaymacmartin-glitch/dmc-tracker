// Business insights — every number computed on-device from local data. No servers.

import { monthKey, today, round2, quoteStatus, agingBuckets } from './models.js';

// payment → service line via its invoice's contract (general when unlinked)
function paymentLine(p, invoiceById, contractById) {
  const inv = invoiceById[p.invoiceId];
  const k = inv ? contractById[inv.contractId] : null;
  const s = k ? k.service : '';
  return s === 'mowing' || s === 'plowing' ? s : 'general';
}

function lastNMonthKeys(n, includeCurrent = true) {
  const [y, m] = monthKey(today()).split('-').map(Number);
  const out = [];
  const start = includeCurrent ? 0 : 1;
  for (let i = start; i < n + start; i++) {
    const d = new Date(y, m - 1 - i, 1);
    out.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function sumBy(list, monthField, m) {
  return round2(list.filter(x => monthKey(x[monthField]) === m)
    .reduce((s, x) => s + (Number(x.amount) || 0), 0));
}

// ---- monthly cash P&L, last n months including current ----
export function monthlyPnl(data, n = 6) {
  return lastNMonthKeys(n).map(m => {
    const revenue = sumBy(data.payments, 'date', m);
    const expenses = sumBy(data.expenses, 'date', m);
    return { month: m, revenue, expenses, net: round2(revenue - expenses) };
  });
}

// ---- per-line P&L (all time, cash basis; paid wages are line-tagged expenses already) ----
export function linePnl(data) {
  const invoiceById = Object.fromEntries(data.invoices.map(i => [i.id, i]));
  const contractById = Object.fromEntries(data.contracts.map(k => [k.id, k]));
  return ['mowing', 'plowing', 'general'].map(line => {
    const revenue = round2(data.payments
      .filter(p => paymentLine(p, invoiceById, contractById) === line)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const expenses = round2(data.expenses
      .filter(e => (e.line || 'general') === line)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0));
    const wagesOwed = round2(data.shifts
      .filter(s => !s.paid && (s.line || 'general') === line)
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
    return { line, revenue, expenses, wagesOwed, net: round2(revenue - expenses - wagesOwed) };
  });
}

// ---- labour ----
export function labourStats(data) {
  const wagesPaid = round2(data.expenses.filter(e => e.category === 'Wages')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const wagesOwed = round2(data.shifts.filter(s => !s.paid)
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
  const revenue = round2(data.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const total = round2(wagesPaid + wagesOwed);
  return {
    wagesPaid, wagesOwed, total, revenue,
    labourPct: revenue > 0 ? total / revenue : 0,
  };
}

// ---- revenue per visit, computed honestly ----
// Preferred basis: dollars billed on invoices that were generated FROM logged visits,
// divided by exactly those visits. Never distorted by monthly/seasonal revenue whose
// work isn't visit-logged. Fallback while no visits are billed yet: the typical
// per-visit/per-push contract price (labeled as such).
export function revenuePerVisit(data) {
  const invoiceById = Object.fromEntries(data.invoices.map(i => [i.id, i]));
  const visitsByInvoice = {};
  for (const v of data.visits) {
    if (v.invoiceId) visitsByInvoice[v.invoiceId] = (visitsByInvoice[v.invoiceId] || 0) + 1;
  }
  let amount = 0, count = 0;
  for (const [invId, n] of Object.entries(visitsByInvoice)) {
    const inv = invoiceById[invId];
    if (!inv || inv.status === 'draft') continue; // drafts aren't billed yet
    amount += Number(inv.amount) || 0;
    count += n;
  }
  if (count > 0) return { value: round2(amount / count), basis: 'billed', visits: count };
  const prices = data.contracts
    .filter(k => (k.billing === 'per-visit' || k.billing === 'per-push') && k.status === 'active' && Number(k.price) > 0)
    .map(k => Number(k.price));
  if (prices.length) {
    return { value: round2(prices.reduce((s, p) => s + p, 0) / prices.length), basis: 'contract-price', visits: 0 };
  }
  return { value: 0, basis: 'none', visits: 0 };
}

// ---- ops ----
export function opsStats(data) {
  const rpv = revenuePerVisit(data);
  const decided = data.quotes.filter(q => quoteStatus(q) !== 'open');
  const won = data.quotes.filter(q => q.status === 'accepted');
  const buckets = agingBuckets(data.invoices, data.payments);
  return {
    avgPerVisit: rpv.value,
    avgPerVisitBasis: rpv.basis,
    billedVisits: rpv.visits,
    visitCount: data.visits.length,
    winRate: decided.length ? won.length / decided.length : null,
    quotesDecided: decided.length,
    arTotal: buckets.total,
    arOverdue: round2(buckets.d1_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90plus),
  };
}

// ---- hiring power: what one helper costs vs what the business actually nets ----
export function hiringPower(data, ratePerHour, hoursPerWeek) {
  const rate = Number(ratePerHour) || 0;
  const hours = Number(hoursPerWeek) || 0;
  const weeklyCost = round2(rate * hours);
  const monthlyCost = round2(weeklyCost * 4.33);

  // average net over the last 3 COMPLETED months that had any activity
  const candidates = lastNMonthKeys(6, false);
  const active = candidates.map(m => {
    const revenue = sumBy(data.payments, 'date', m);
    const expenses = sumBy(data.expenses, 'date', m);
    return { m, net: round2(revenue - expenses), any: revenue > 0 || expenses > 0 };
  }).filter(x => x.any).slice(-3);
  const avgNet = active.length ? round2(active.reduce((s, x) => s + x.net, 0) / active.length) : 0;

  const { avgPerVisit, avgPerVisitBasis } = opsStats(data);
  return {
    weeklyCost, monthlyCost, avgNet,
    monthsUsed: active.length,
    affordable: monthlyCost > 0 && avgNet > 0 ? Math.floor(avgNet / monthlyCost) : 0,
    breakEvenVisitsPerWeek: avgPerVisit > 0 && weeklyCost > 0 ? Math.ceil(weeklyCost / avgPerVisit) : null,
    avgPerVisit,
    avgPerVisitBasis,
    thin: active.length === 0,
  };
}

// suggested default wage rate: average of active crew rates, else $20
export function defaultWageRate(crew) {
  const rates = crew.filter(c => c.status === 'active' && Number(c.defaultRate) > 0).map(c => Number(c.defaultRate));
  if (!rates.length) return 20;
  return round2(rates.reduce((s, r) => s + r, 0) / rates.length);
}
