// Schedule engine: occurrences are DERIVED from contract repeat rules; the jobs
// store holds only one-time jobs and per-occurrence overrides (done/skipped/moved),
// keyed by contractId|origDate. Pure functions — unit-testable outside the browser.

import { today, addDays, daysBetween, REPEAT_DAYS } from './models.js';

export function overrideKey(contractId, origDate) {
  return `${contractId}|${origDate}`;
}

// who actually works an occurrence: job override wins, contract default fills in,
// '' means the owner himself. The 'me' sentinel is an explicit owner override
// of a contract default — it resolves to '' here and never leaves this function.
export function effectiveCrewId(job, contract) {
  const j = job?.crewId || '';
  if (j === 'me') return '';
  return j || contract?.defaultCrewId || '';
}

// dates a contract generates within [from, to], inclusive
export function occurrencesFor(contract, from, to) {
  if (contract.status !== 'active' || contract.repeat === 'none') return [];
  const step = REPEAT_DAYS[contract.repeat];
  if (!step || !contract.nextDate) return [];
  const lo = contract.startDate && contract.startDate > from ? contract.startDate : from;
  const hi = contract.endDate && contract.endDate < to ? contract.endDate : to;
  if (hi < lo) return [];
  let d = contract.nextDate;
  if (d < lo) {
    const behind = daysBetween(d, lo);
    d = addDays(d, Math.ceil(behind / step) * step);
  }
  const out = [];
  while (d <= hi) {
    out.push(d);
    d = addDays(d, step);
  }
  return out;
}

// merged agenda entries in [from, from+days), sorted by date then client name
export function agenda(data, from = today(), days = 14) {
  const to = addDays(from, days - 1);
  const clientById = new Map(data.clients.map(c => [c.id, c]));
  const contractById = new Map(data.contracts.map(k => [k.id, k]));
  const overrides = new Set();
  for (const j of data.jobs) {
    if (j.contractId && j.origDate) overrides.add(overrideKey(j.contractId, j.origDate));
  }
  const entries = [];
  for (const k of data.contracts) {
    for (const date of occurrencesFor(k, from, to)) {
      if (overrides.has(overrideKey(k.id, date))) continue; // its job record speaks instead
      entries.push({ date, origDate: date, kind: 'recurring', contract: k, client: clientById.get(k.clientId) || null, job: null, status: 'planned', crewId: effectiveCrewId(null, k) });
    }
  }
  for (const j of data.jobs) {
    if (j.status === 'skipped') continue; // skipped occurrences disappear from the agenda
    if (j.date < from || j.date > to) continue;
    const k = contractById.get(j.contractId) || null;
    entries.push({ date: j.date, origDate: j.origDate || j.date, kind: j.contractId ? 'recurring' : 'manual', contract: k, client: clientById.get(j.clientId) || null, job: j, status: j.status, crewId: effectiveCrewId(j, k) });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) ||
    ((a.client && a.client.name) || '').localeCompare((b.client && b.client.name) || ''));
  return entries;
}

// unfinished planned work from the last `back` days (not including today)
export function catchUp(data, back = 7) {
  const yesterday = addDays(today(), -1);
  return agenda(data, addDays(today(), -back), back)
    .filter(e => e.status === 'planned' && e.date <= yesterday);
}

export function todayStats(data) {
  const entries = agenda(data, today(), 1);
  return {
    total: entries.length,
    done: entries.filter(e => e.status === 'done').length,
    delegated: entries.filter(e => e.crewId).length,
  };
}

// a crew member's upcoming plate: today + the next `days`-1, plus missed work
export function jobsForCrew(data, crewId, days = 7) {
  const upcoming = agenda(data, today(), days).filter(e => e.crewId === crewId && e.status !== 'done');
  const missed = catchUp(data).filter(e => e.crewId === crewId);
  return { missed, upcoming };
}

// active repeat-capable contracts not yet on the schedule (mowing-type work)
export function unscheduled(data) {
  return data.contracts.filter(k =>
    k.status === 'active' && k.repeat === 'none' &&
    (k.billing === 'per-visit' || k.billing === 'monthly' || k.billing === 'level'));
}
