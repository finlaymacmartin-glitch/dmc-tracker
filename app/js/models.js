// Domain model: record factories + derived AR / budget math.
// Every record carries a UUID and updatedAt so the Excel import can upsert idempotently.

export const SERVICES = ['mowing', 'plowing', 'other'];
export const LINES = ['mowing', 'plowing', 'general'];
// per-push = per-visit for snow (bills from logged pushes); level = seasonal total split into equal monthly bills
export const BILLING_TYPES = ['per-visit', 'per-push', 'monthly', 'seasonal', 'level', 'one-time'];
export const BILLING_LABELS = {
  'per-visit': 'Per visit', 'per-push': 'Per push (snow)', monthly: 'Monthly',
  seasonal: 'Seasonal (one bill)', level: 'Level (seasonal ÷ months)', 'one-time': 'One-time',
};
export const EXPENSE_CATEGORIES = [
  'Fuel', 'Equipment', 'Repairs & Maintenance', 'Vehicle', 'Insurance',
  'Supplies', 'Wages', 'Marketing', 'Subcontractors', 'Fees & Licenses', 'Other',
];
export const PAYMENT_METHODS = ['e-transfer', 'cash', 'cheque', 'card', 'other'];

const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

export function newClient(d = {}) {
  return { id: uuid(), name: '', phone: '', email: '', address: '', notes: '', createdAt: now(), updatedAt: now(), ...d };
}
export const REPEAT_LABELS = { none: 'Does not repeat', weekly: 'Every week', biweekly: 'Every 2 weeks', every4weeks: 'Every 4 weeks' };
export const REPEAT_DAYS = { weekly: 7, biweekly: 14, every4weeks: 28 };

export function newContract(d = {}) {
  return { id: uuid(), clientId: '', service: 'mowing', description: '', price: 0, billing: 'per-visit', frequency: '', startDate: '', endDate: '', repeat: 'none', nextDate: '', status: 'active', notes: '', createdAt: now(), updatedAt: now(), ...d };
}
export function newInvoice(d = {}) {
  return { id: uuid(), number: '', clientId: '', contractId: '', dateIssued: today(), dueDate: '', amount: 0, status: 'sent', notes: '', createdAt: now(), updatedAt: now(), ...d };
}
export function newPayment(d = {}) {
  return { id: uuid(), invoiceId: '', clientId: '', date: today(), amount: 0, method: 'e-transfer', note: '', createdAt: now(), updatedAt: now(), ...d };
}
export function newExpense(d = {}) {
  return { id: uuid(), date: today(), amount: 0, category: 'Fuel', vendor: '', line: 'general', note: '', createdAt: now(), updatedAt: now(), ...d };
}
export function newBudget(d = {}) {
  return { id: uuid(), category: 'Fuel', period: 'monthly', limit: 0, updatedAt: now(), ...d };
}
export function newVisit(d = {}) {
  return { id: uuid(), contractId: '', clientId: '', date: today(), note: '', invoiceId: '', createdAt: now(), updatedAt: now(), ...d };
}
export function newQuote(d = {}) {
  return { id: uuid(), clientId: '', prospectName: '', prospectPhone: '', prospectAddress: '', service: 'mowing', description: '', price: 0, billing: 'per-visit', frequency: '', dateIssued: today(), expiryDate: addDays(today(), 30), status: 'open', notes: '', contractId: '', createdAt: now(), updatedAt: now(), ...d };
}
export function newMileage(d = {}) {
  return { id: uuid(), date: today(), km: 0, line: 'general', note: '', createdAt: now(), updatedAt: now(), ...d };
}
export function newEquipment(d = {}) {
  return { id: uuid(), name: '', purchaseDate: today(), cost: 0, line: 'general', lastServiceDate: '', serviceNotes: '', notes: '', createdAt: now(), updatedAt: now(), ...d };
}

export function newJob(d = {}) {
  return { id: uuid(), date: today(), clientId: '', contractId: '', note: '', status: 'planned', origDate: '', createdAt: now(), updatedAt: now(), ...d };
}
export function newCrew(d = {}) {
  return { id: uuid(), name: '', phone: '', defaultRate: 0, notes: '', status: 'active', createdAt: now(), updatedAt: now(), ...d };
}
export function newShift(d = {}) {
  return { id: uuid(), crewId: '', date: today(), hours: 0, rate: 0, flatAmount: 0, amount: 0, clientId: '', line: 'general', note: '', paid: false, paidDate: '', createdAt: now(), updatedAt: now(), ...d };
}
// a shift's pay: flat amount wins when set, otherwise hours x rate
export function shiftAmount(hours, rate, flatAmount) {
  const flat = Number(flatAmount) || 0;
  if (flat > 0) return round2(flat);
  return round2((Number(hours) || 0) * (Number(rate) || 0));
}
export function crewOwed(crewId, shifts) {
  return round2(shifts.filter(s => s.crewId === crewId && !s.paid)
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
}

// display name for a quote's counterparty (existing client or prospect)
export function quoteName(q, clients) {
  if (q.clientId) return clients.find(c => c.id === q.clientId)?.name || 'Unknown client';
  return q.prospectName || 'Unnamed prospect';
}

// derived quote status: open quotes past expiry display as expired
export function quoteStatus(q) {
  if (q.status === 'open' && q.expiryDate && q.expiryDate < today()) return 'expired';
  return q.status;
}

// months 'YYYY-MM' covered by a date range, inclusive (for level billing)
export function monthsInRange(startDate, endDate) {
  if (!startDate || !endDate || endDate < startDate) return [];
  const out = [];
  let [y, m] = startDate.slice(0, 7).split('-').map(Number);
  const end = endDate.slice(0, 7);
  for (let i = 0; i < 24; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key === end) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function touch(record) { record.updatedAt = now(); return record; }

// ---------- date helpers ----------
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function monthKey(dateStr) { return (dateStr || '').slice(0, 7); } // 'YYYY-MM'
export function daysBetween(fromStr, toStr) {
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T00:00:00');
  return Math.floor((to - from) / 86400000);
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- invoice / AR math (always derived, never hand-entered) ----------
// Payment sums are memoized per payments-array (fresh array every render via loadAll),
// turning per-invoice cost from O(payments) into O(1). Same trick for per-client invoices.
const paidCache = new WeakMap();
function paidByInvoice(payments) {
  let m = paidCache.get(payments);
  if (!m) {
    m = new Map();
    for (const p of payments) m.set(p.invoiceId, (m.get(p.invoiceId) || 0) + (Number(p.amount) || 0));
    paidCache.set(payments, m);
  }
  return m;
}
const invByClientCache = new WeakMap();
function invoicesByClient(invoices) {
  let m = invByClientCache.get(invoices);
  if (!m) {
    m = new Map();
    for (const i of invoices) {
      if (!m.has(i.clientId)) m.set(i.clientId, []);
      m.get(i.clientId).push(i);
    }
    invByClientCache.set(invoices, m);
  }
  return m;
}

export function invoiceState(invoice, payments) {
  const paid = paidByInvoice(payments).get(invoice.id) || 0;
  const amount = Number(invoice.amount) || 0;
  const balance = Math.max(0, round2(amount - paid));
  const daysPastDue = invoice.dueDate && balance > 0.004 ? daysBetween(invoice.dueDate, today()) : 0;
  let status;
  if (invoice.status === 'draft') status = 'draft';
  else if (balance <= 0.004 && amount > 0) status = 'paid';
  else if (daysPastDue > 0) status = 'overdue';
  else if (paid > 0) status = 'partial';
  else status = 'sent';
  return { paid: round2(paid), balance, daysPastDue: Math.max(0, daysPastDue), status };
}

export function clientBalance(clientId, invoices, payments) {
  return round2((invoicesByClient(invoices).get(clientId) || [])
    .filter(i => i.status !== 'draft')
    .reduce((s, i) => s + invoiceState(i, payments).balance, 0));
}

// Aging buckets on OUTSTANDING (non-draft) invoices, by days past due.
export function agingBuckets(invoices, payments) {
  const buckets = { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
  for (const inv of invoices) {
    if (inv.status === 'draft') continue;
    const st = invoiceState(inv, payments);
    if (st.balance <= 0.004) continue;
    buckets.total += st.balance;
    if (st.daysPastDue <= 0) buckets.notDue += st.balance;
    else if (st.daysPastDue <= 30) buckets.d1_30 += st.balance;
    else if (st.daysPastDue <= 60) buckets.d31_60 += st.balance;
    else if (st.daysPastDue <= 90) buckets.d61_90 += st.balance;
    else buckets.d90plus += st.balance;
  }
  for (const k of Object.keys(buckets)) buckets[k] = round2(buckets[k]);
  return buckets;
}

export function nextInvoiceNumber(invoices) {
  let max = 0;
  for (const inv of invoices) {
    const m = /^INV-(\d+)$/.exec(inv.number || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `INV-${String(max + 1).padStart(4, '0')}`;
}

// ---------- budget math ----------
// Actuals for a category in the current month (monthly budgets)
// or in the last 12 months (seasonal budgets are checked against season-to-date manually).
export function budgetActual(budget, expenses, refMonth) {
  if (budget.period === 'monthly') {
    return round2(expenses
      .filter(e => e.category === budget.category && monthKey(e.date) === refMonth)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0));
  }
  // seasonal: mowing season = Apr–Oct, plowing season = Nov–Mar (spanning year end)
  const [y, m] = refMonth.split('-').map(Number);
  const inMowingSeason = m >= 4 && m <= 10;
  const months = [];
  if (inMowingSeason) {
    for (let mm = 4; mm <= 10; mm++) months.push(`${y}-${String(mm).padStart(2, '0')}`);
  } else {
    const startYear = m >= 11 ? y : y - 1;
    for (const [yy, mm] of [[startYear, 11], [startYear, 12], [startYear + 1, 1], [startYear + 1, 2], [startYear + 1, 3]]) {
      months.push(`${yy}-${String(mm).padStart(2, '0')}`);
    }
  }
  return round2(expenses
    .filter(e => e.category === budget.category && months.includes(monthKey(e.date)))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0));
}

export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// ---------- formatting ----------
const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
export function money(n) { return cad.format(Number(n) || 0); }
export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtMonth(mKey) {
  const d = new Date(mKey + '-01T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}
