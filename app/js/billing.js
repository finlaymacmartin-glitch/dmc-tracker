// Billing suggestions: what's ready to be invoiced, computed from contracts + visits.
// Nothing is billed automatically — suggestions become DRAFT invoices he approves in Money.

import { monthKey, today, round2, fmtMonth, monthsInRange } from './models.js';

// A suggestion's key identifies it for dismissal (stored in meta 'dismissedBilling').
export function suggestionKey(s) {
  return `${s.contract.id}:${s.period}`;
}

export function billingSuggestions(data, dismissed = {}) {
  const out = [];
  const cur = monthKey(today());
  const clientById = Object.fromEntries(data.clients.map(c => [c.id, c]));

  for (const k of data.contracts) {
    if (k.status !== 'active') continue;
    const client = clientById[k.clientId];
    if (!client) continue;
    const price = Number(k.price) || 0;
    const contractInvoices = data.invoices.filter(i => i.contractId === k.id);

    if (k.billing === 'per-visit' || k.billing === 'per-push') {
      // bill completed months only — this month's visits/pushes wait until the month ends
      const word = k.billing === 'per-push' ? 'push' : 'visit';
      const byMonth = {};
      for (const v of data.visits) {
        if (v.contractId !== k.id || v.invoiceId) continue;
        const m = monthKey(v.date);
        if (m && m < cur) (byMonth[m] = byMonth[m] || []).push(v);
      }
      for (const m of Object.keys(byMonth).sort()) {
        const visits = byMonth[m];
        out.push({
          contract: k, client, visits, period: m,
          amount: round2(visits.length * price),
          label: `${visits.length} ${word}${visits.length > 1 ? (word === 'push' ? 'es' : 's') : ''} in ${fmtMonth(m)}`,
        });
      }
    } else if (k.billing === 'level') {
      // seasonal total split evenly across the contract's months
      const span = monthsInRange(k.startDate, k.endDate);
      if (span.length === 0) continue; // level billing needs both dates
      const installment = round2(price / span.length);
      const candidates = lastMonths(cur, 3).filter(m => span.includes(m));
      for (const m of candidates) {
        if (contractInvoices.some(i => monthKey(i.dateIssued) === m)) continue;
        out.push({
          contract: k, client, visits: [], period: m, amount: installment,
          label: `Level billing ${span.indexOf(m) + 1}/${span.length} — ${fmtMonth(m)}`,
        });
      }
    } else if (k.billing === 'monthly') {
      // current month + up to 2 months back, within the contract window
      // (no start date -> never suggest months before the contract was created)
      const startBound = monthKey(k.startDate) || monthKey(k.createdAt) || cur;
      const months = lastMonths(cur, 3).filter(m =>
        m >= startBound && (!k.endDate || m <= monthKey(k.endDate)));
      for (const m of months) {
        if (contractInvoices.some(i => monthKey(i.dateIssued) === m)) continue;
        out.push({
          contract: k, client, visits: [], period: m, amount: price,
          label: `Monthly billing — ${fmtMonth(m)}`,
        });
      }
    } else if (k.billing === 'seasonal' || k.billing === 'one-time') {
      // one invoice per contract, suggested once it has started
      if (k.startDate && k.startDate > today()) continue;
      if (contractInvoices.length > 0) continue;
      out.push({
        contract: k, client, visits: [], period: 'once', amount: price,
        label: k.billing === 'seasonal' ? 'Seasonal billing' : 'One-time billing',
      });
    }
  }
  return out.filter(s => s.amount > 0 && !dismissed[suggestionKey(s)]);
}

// Count of this-month unbilled visits (shown on the contract, not yet billable).
export function unbilledVisits(contractId, visits) {
  return visits.filter(v => v.contractId === contractId && !v.invoiceId);
}

function lastMonths(cur, n) {
  const [y, m] = cur.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
