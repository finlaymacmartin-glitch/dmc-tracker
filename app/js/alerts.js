// Alert center: computed fresh from the data snapshot on every dashboard render.
// This replaces push notifications on iPhone — alerts appear whenever he opens the app.

import { invoiceState, budgetActual, crewOwed, monthKey, today, daysBetween, money } from './models.js';

export function computeAlerts(data, lastExportAt) {
  const alerts = [];
  const clientById = Object.fromEntries(data.clients.map(c => [c.id, c]));

  // Overdue invoices — most urgent first
  const overdue = [];
  for (const inv of data.invoices) {
    if (inv.status === 'draft') continue;
    const st = invoiceState(inv, data.payments);
    if (st.status === 'overdue') overdue.push({ inv, st });
  }
  overdue.sort((a, b) => b.st.daysPastDue - a.st.daysPastDue);
  for (const { inv, st } of overdue) {
    const who = clientById[inv.clientId]?.name || 'Unknown client';
    alerts.push({
      level: 'danger', icon: '⚠️', view: 'invoices',
      text: `${who} owes ${money(st.balance)} on ${inv.number || 'an invoice'} — ${st.daysPastDue} days overdue`,
    });
  }

  // Contracts ending within 30 days
  for (const c of data.contracts) {
    if (c.status !== 'active' || !c.endDate) continue;
    const daysLeft = daysBetween(today(), c.endDate);
    if (daysLeft >= 0 && daysLeft <= 30) {
      const who = clientById[c.clientId]?.name || 'Unknown client';
      alerts.push({
        level: 'info', icon: '📅', view: 'clients',
        text: `${who}'s ${c.service} contract ends ${daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`} — time to renew?`,
      });
    }
  }

  // Budget categories over (or near) their limit
  const refMonth = monthKey(today());
  for (const b of data.budgets) {
    if (!(Number(b.limit) > 0)) continue;
    const actual = budgetActual(b, data.expenses, refMonth);
    const pct = actual / Number(b.limit);
    if (pct >= 1) {
      alerts.push({
        level: 'warn', icon: '💸', view: 'expenses',
        text: `${b.category} is over budget: ${money(actual)} spent of ${money(b.limit)} (${b.period})`,
      });
    } else if (pct >= 0.9) {
      alerts.push({
        level: 'warn', icon: '💸', view: 'expenses',
        text: `${b.category} is at ${Math.round(pct * 100)}% of its ${b.period} budget`,
      });
    }
  }

  // Unpaid crew wages
  for (const c of data.crew || []) {
    const owed = crewOwed(c.id, data.shifts || []);
    if (owed > 0) {
      const n = (data.shifts || []).filter(s => s.crewId === c.id && !s.paid).length;
      alerts.push({
        level: 'warn', icon: '💵', view: 'crew', params: { crewId: c.id },
        text: `You owe ${c.name} ${money(owed)} (${n} shift${n > 1 ? 's' : ''}) — open Crew to pay out`,
      });
    }
  }

  // Backup nudge: no export in 30+ days (and there is data worth protecting)
  const hasData = data.clients.length || data.invoices.length || data.expenses.length;
  if (hasData) {
    if (!lastExportAt) {
      alerts.push({
        level: 'info', icon: '💾', view: 'settings',
        text: 'No backup yet — export your data from Settings so nothing is ever lost.',
      });
    } else {
      const days = daysBetween(lastExportAt.slice(0, 10), today());
      if (days > 30) {
        alerts.push({
          level: 'info', icon: '💾', view: 'settings',
          text: `Last backup was ${days} days ago — export your data from Settings.`,
        });
      }
    }
  }

  return alerts;
}
