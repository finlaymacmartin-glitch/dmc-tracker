// Demo dataset, generated fresh at load time so dates are always current
// (overdue invoices, aging buckets, and billing suggestions all light up).
// Only offered when the app is completely empty — it can never touch real data.

import { bulkPut } from './db.js';
import {
  newClient, newContract, newInvoice, newPayment, newExpense, newBudget,
  newVisit, newQuote, newMileage, newEquipment, newCrew, newShift,
} from './models.js';

function d(daysAgo) {
  const t = new Date();
  t.setDate(t.getDate() - daysAgo);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export async function loadDemoData() {
  const clients = [], contracts = [], invoices = [], payments = [], expenses = [],
    budgets = [], visits = [], quotes = [], mileage = [], equipment = [], crew = [], shifts = [];

  const client = (name, phone, address, notes = '') => {
    const c = newClient({ name, phone, address, notes });
    clients.push(c);
    return c;
  };
  const contract = (c, service, description, price, billing, frequency, startAgo, endInDays, notes = '') => {
    const k = newContract({
      clientId: c.id, service, description, price, billing, frequency,
      startDate: d(startAgo), endDate: d(-endInDays), notes,
    });
    contracts.push(k);
    return k;
  };
  let invNo = 0;
  const invoice = (c, k, amount, issuedAgo, dueAgo, pay = null, notes = '') => {
    invNo += 1;
    const inv = newInvoice({
      number: `INV-${String(invNo).padStart(4, '0')}`, clientId: c.id, contractId: k ? k.id : '',
      dateIssued: d(issuedAgo), dueDate: d(dueAgo), amount, status: 'sent', notes,
    });
    invoices.push(inv);
    if (pay !== null) {
      payments.push(newPayment({
        invoiceId: inv.id, clientId: c.id, date: d(Math.max(0, dueAgo + 2)),
        amount: pay === 'full' ? amount : pay, method: 'e-transfer',
      }));
    }
    return inv;
  };
  const expense = (ago, amount, category, vendor, line, note = '') =>
    expenses.push(newExpense({ date: d(ago), amount, category, vendor, line, note }));

  // ---- clients & contracts ----
  const marie = client('Marie Tremblay', '506-555-0101', '12 Rue Principale, Dieppe');
  const bob = client('Bob Leblanc', '506-555-0202', '48 Oak St, Moncton', 'slow payer — follow up by phone');
  const dental = client('Dieppe Dental Clinic', '506-555-0303', '200 Champlain Ave, Dieppe', 'commercial lot');
  const helene = client('Helene Cormier', '506-555-0404', '9 Birch Cres, Riverview');
  const retire = client('Riverview Retirement Home', '506-555-0505', '77 Pine Glen Rd, Riverview', 'gate opens 7am');
  const jack = client('Jack Steeves', '506-555-0606', '31 Salter St, Moncton');
  const chantal = client('Chantal Doiron', '506-555-0707', '5 Amirault St, Dieppe');
  const vet = client('Moncton Vet Clinic', '506-555-0808', '410 Mountain Rd, Moncton', 'plowing this winter too');

  const kMarie = contract(marie, 'mowing', 'weekly front+back', 45, 'per-visit', 'weekly', 110, 52);
  const kBob = contract(bob, 'mowing', 'weekly, small lot', 40, 'per-visit', 'weekly', 108, 52);
  const kDental = contract(dental, 'mowing', 'commercial lot, biweekly', 300, 'monthly', 'biweekly', 100, 22, 'renewal conversation needed');
  const kHelene = contract(helene, 'mowing', 'biweekly', 50, 'per-visit', 'biweekly', 105, 52);
  const kRetire = contract(retire, 'mowing', 'full grounds, weekly', 450, 'monthly', 'weekly', 95, 52);
  const kJack = contract(jack, 'mowing', 'weekly', 35, 'per-visit', 'weekly', 102, 52);
  const kChantal = contract(chantal, 'mowing', 'biweekly, corner lot', 55, 'per-visit', 'biweekly', 98, 52);
  const kVet = contract(vet, 'mowing', 'monthly maintenance', 250, 'monthly', 'biweekly', 90, 52);
  contract(vet, 'plowing', 'parking lot, per push', 120, 'per-push', 'per snowfall', 10, 220, 'signed early for winter');
  contract(bob, 'plowing', 'driveway, seasonal flat rate', 500, 'seasonal', 'per snowfall', 5, 220);

  // ---- three months of invoices ----
  for (const [c, k, amt] of [[marie, kMarie, 180], [bob, kBob, 160], [dental, kDental, 300],
    [helene, kHelene, 100], [retire, kRetire, 450], [jack, kJack, 140]]) {
    invoice(c, k, amt, 85, 71, 'full');
  }
  invoice(marie, kMarie, 225, 55, 41, 'full');
  invoice(bob, kBob, 160, 55, 41, null, '2nd reminder sent');
  invoice(dental, kDental, 300, 55, 41, 'full');
  invoice(retire, kRetire, 450, 55, 41, 'full');
  invoice(chantal, kChantal, 110, 55, 41, 'full');
  invoice(vet, kVet, 250, 55, 41, 'full');
  invoice(marie, kMarie, 180, 24, 10, 'full');
  invoice(dental, kDental, 300, 24, 10, null);
  invoice(retire, kRetire, 450, 24, 10, 'full');
  invoice(helene, kHelene, 100, 24, 10, 'full');
  invoice(chantal, kChantal, 110, 24, 10, 55, 'paid half, rest next week');
  invoice(jack, kJack, 175, 24, 10, 'full');
  invoice(vet, kVet, 250, 24, 10, 'full');
  invoice(marie, kMarie, 180, 3, -11);
  invoice(retire, kRetire, 450, 3, -11);
  invoice(dental, kDental, 300, 3, -11);

  // ---- expenses ----
  for (const [ago, amt, vendor] of [[100, 78.40, 'Irving'], [82, 95.10, 'Irving'], [66, 88.25, 'Shell'],
    [48, 102.60, 'Irving'], [31, 91.75, 'Irving'], [12, 96.30, 'Shell'], [4, 44.15, 'Irving']]) {
    expense(ago, amt, 'Fuel', vendor, 'mowing');
  }
  for (const ago of [103, 73, 43, 13]) expense(ago, 142.00, 'Insurance', 'Co-operators', 'general', 'monthly premium');
  expense(93, 65.99, 'Supplies', 'Canadian Tire', 'mowing', 'trimmer line + oil');
  expense(70, 260.00, 'Repairs & Maintenance', 'Small Engine Shop', 'mowing', 'blade + belt');
  expense(38, 180.00, 'Repairs & Maintenance', 'OK Tire', 'general', 'trailer tires');
  expense(9, 1200.00, 'Equipment', 'Kijiji', 'plowing', 'used plow blade — deposit');
  expense(2, 214.50, 'Fuel', 'Irving', 'general', 'truck fill-ups');

  // ---- budgets ----
  for (const [category, period, limit] of [['Fuel', 'monthly', 150], ['Repairs & Maintenance', 'monthly', 150],
    ['Insurance', 'monthly', 150], ['Equipment', 'seasonal', 3000]]) {
    budgets.push(newBudget({ category, period, limit }));
  }

  // ---- visits: last month unbilled (lights up "Ready to bill") + this month in progress ----
  for (const ago of [38, 31]) visits.push(newVisit({ contractId: kMarie.id, clientId: marie.id, date: d(ago) }));
  for (const ago of [10, 3]) visits.push(newVisit({ contractId: kMarie.id, clientId: marie.id, date: d(ago) }));

  // ---- crew: Kevin, owed for 2 shifts, 1 already paid out ----
  const kevin = newCrew({ name: 'Kevin (cousin)', phone: '506-555-0909', defaultRate: 20 });
  crew.push(kevin);
  shifts.push(newShift({ crewId: kevin.id, date: d(40), hours: 4, rate: 20, amount: 80, line: 'mowing', paid: true, paidDate: d(38) }));
  expense(38, 80.00, 'Wages', 'Kevin (cousin)', 'mowing', '1 shift');
  shifts.push(newShift({ crewId: kevin.id, date: d(6), hours: 3, rate: 20, amount: 60, clientId: retire.id, line: 'mowing' }));
  shifts.push(newShift({ crewId: kevin.id, date: d(2), flatAmount: 50, amount: 50, line: 'mowing', note: 'helped clear brush' }));

  // ---- quotes, mileage, equipment ----
  quotes.push(newQuote({ prospectName: 'New Neighbour on Oak St', prospectPhone: '506-555-1010', service: 'mowing', price: 50, billing: 'per-visit', frequency: 'weekly', dateIssued: d(5), expiryDate: d(-25), description: 'front + back, weekly' }));
  quotes.push(newQuote({ prospectName: 'Gagnon Bakery', service: 'plowing', price: 90, billing: 'per-push', dateIssued: d(20), expiryDate: d(-10), status: 'declined', description: 'small lot' }));
  for (const [ago, km, note] of [[12, 34, 'route day'], [5, 28, 'route day'], [2, 12, 'dump run']]) {
    mileage.push(newMileage({ date: d(ago), km, line: 'mowing', note }));
  }
  equipment.push(newEquipment({ name: 'Toro 30" mower', purchaseDate: d(400), cost: 1899, line: 'mowing', lastServiceDate: d(70), serviceNotes: 'blade + belt' }));
  equipment.push(newEquipment({ name: 'Utility trailer', purchaseDate: d(300), cost: 850, line: 'general', lastServiceDate: d(38), serviceNotes: 'new tires' }));

  const stores = { clients, contracts, invoices, payments, expenses, budgets, visits, quotes, mileage, equipment, crew, shifts };
  for (const [store, records] of Object.entries(stores)) {
    if (records.length) await bulkPut(store, records);
  }
  return clients.length;
}
