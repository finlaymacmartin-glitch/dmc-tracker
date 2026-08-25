// Expenses & Budget: categorized expense log (grouped by month) + budget-vs-actual bars.
// Expenses carry a mowing/plowing/general tag so per-service-line P&L is possible.

import { el, render, openModal, closeModal, field, textInput, numberInput, dateInput, select, formValues, toast, confirmAction } from '../app.js';
import { put, remove } from '../db.js';
import { newExpense, newBudget, newMileage, newEquipment, touch, budgetActual, money, fmtDate, fmtMonth, monthKey, today, EXPENSE_CATEGORIES, LINES } from '../models.js';
import { icon } from '../icons.js';

export function renderExpenses(root, data) {
  // ---- budget vs actual ----
  root.append(el('div', { class: 'section-label' }, 'Budget vs actual'));
  root.append(el('button', { class: 'btn secondary add-btn', onclick: () => budgetForm(null, data) }, '+ Set a budget'));
  const refMonth = monthKey(today());
  const budgets = [...data.budgets].sort((a, b) => a.category.localeCompare(b.category));
  if (budgets.length === 0) {
    root.append(el('div', { class: 'empty' }, 'No budgets set. Set a monthly or seasonal limit per category to see actual vs budget here.'));
  }
  for (const b of budgets) {
    const actual = budgetActual(b, data.expenses, refMonth);
    const limit = Number(b.limit) || 0;
    const pct = limit > 0 ? actual / limit : 0;
    const fillCls = pct >= 1 ? 'over' : pct >= 0.9 ? 'warn' : '';
    root.append(el('div', { class: 'card tappable', onclick: () => budgetForm(b, data) },
      el('div', { class: 'row' },
        el('div', { class: 'row-main' },
          el('div', { class: 'row-title' }, b.category),
          el('div', { class: 'row-sub' }, `${b.period} limit ${money(limit)}`)),
        el('div', { class: 'row-amount' + (pct >= 1 ? ' neg' : '') }, `${money(actual)} (${limit > 0 ? Math.round(pct * 100) : 0}%)`)),
      el('div', { class: 'budget-bar' },
        el('div', { class: `fill ${fillCls}`, style: `width:${Math.min(100, pct * 100)}%` }))));
  }

  // ---- mileage & equipment ----
  root.append(el('div', { class: 'section-label' }, 'Mileage & equipment'));
  const refM = monthKey(today());
  const kmMonth = data.mileage.filter(m => monthKey(m.date) === refM).reduce((s, m) => s + (Number(m.km) || 0), 0);
  const kmTotal = data.mileage.reduce((s, m) => s + (Number(m.km) || 0), 0);
  root.append(el('div', { class: 'card' },
    el('div', { class: 'row' },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title' }, icon('truck', 'ico-inline'), ' Mileage'),
        el('div', { class: 'row-sub' }, `${kmMonth} km this month · ${kmTotal} km all time — every km is a tax deduction`)),
      null),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn small', onclick: () => mileageForm(null) }, '+ Add trip'),
      el('button', { class: 'btn subtle small', onclick: () => mileageLog(data) }, 'View log'))));
  const equipCost = data.equipment.reduce((s, q) => s + (Number(q.cost) || 0), 0);
  root.append(el('div', { class: 'card' },
    el('div', { class: 'row' },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title' }, icon('wrench', 'ico-inline'), ' Equipment'),
        el('div', { class: 'row-sub' }, data.equipment.length
          ? `${data.equipment.length} item${data.equipment.length > 1 ? 's' : ''} · ${money(equipCost)} invested`
          : 'Track what you own — purchase price and service dates')),
      null),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn small', onclick: () => equipmentForm(null) }, '+ Add equipment'),
      el('button', { class: 'btn subtle small', onclick: () => equipmentList(data) }, 'View all'))));

  // ---- expenses ----
  root.append(el('div', { class: 'section-label' }, 'Expenses'));
  root.append(el('button', { class: 'btn add-btn', onclick: () => expenseForm(null) }, '+ Add expense'));

  const expenses = [...data.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (expenses.length === 0) {
    root.append(el('div', { class: 'empty' }, 'No expenses yet. Log fuel, repairs, insurance — everything. This becomes the accounting dataset.'));
    return;
  }
  let currentMonth = null;
  for (const e of expenses) {
    const mk = monthKey(e.date);
    if (mk !== currentMonth) {
      currentMonth = mk;
      const monthTotal = expenses.filter(x => monthKey(x.date) === mk)
        .reduce((s, x) => s + (Number(x.amount) || 0), 0);
      root.append(el('div', { class: 'month-head' },
        el('span', {}, fmtMonth(mk)), el('span', {}, money(monthTotal))));
    }
    root.append(el('div', { class: 'card tappable', onclick: () => expenseForm(e) },
      el('div', { class: 'row' },
        el('div', { class: 'row-main' },
          el('div', { class: 'row-title' }, `${e.category}${e.vendor ? ' · ' + e.vendor : ''}`),
          el('div', { class: 'row-sub' }, [fmtDate(e.date), e.note].filter(Boolean).join(' · '))),
        el('div', {},
          el('div', { class: 'row-amount' }, money(e.amount)),
          el('div', { style: 'text-align:right;margin-top:3px' }, el('span', { class: `chip ${e.line}` }, e.line))))));
  }
  root.append(el('div', { class: 'fab-space' }));
}

// ---------- mileage ----------
function mileageForm(existing) {
  const m = existing || newMileage();
  const form = el('form', {},
    el('div', { class: 'field-pair' },
      field('Distance (km) *', numberInput('km', m.km || '', { step: '1' })),
      field('Date', dateInput('date', m.date))),
    field('Business line', select('line', LINES.map(l => [l, l === 'general' ? 'General / both' : l[0].toUpperCase() + l.slice(1)]), m.line)),
    field('Note', textInput('note', m.note, { placeholder: 'e.g. route day, dump run' })),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, existing ? 'Save' : 'Add trip')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    if (!v.km || Number(v.km) <= 0) return;
    await put('mileage', touch({ ...m, ...v, km: Number(v.km) }));
    closeModal();
    toast('Trip logged ✔');
    render();
  });
  openModal(existing ? 'Edit trip' : 'Log mileage', [form]);
}

function mileageLog(data) {
  const trips = [...data.mileage].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const list = trips.length === 0
    ? [el('div', { class: 'empty' }, 'No trips logged yet.')]
    : trips.map(m => el('div', { class: 'card tappable', onclick: () => mileageForm(m) },
        el('div', { class: 'row' },
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, `${m.km} km`),
            el('div', { class: 'row-sub' }, [fmtDate(m.date), m.line, m.note].filter(Boolean).join(' · '))),
          el('button', {
            class: 'btn subtle small', onclick: async e => {
              e.stopPropagation();
              if (!confirmAction('Delete this trip?')) return;
              await remove('mileage', m.id);
              closeModal(); toast('Trip deleted'); render();
            }
          }, '✕'))));
  openModal('Mileage log', list);
}

// ---------- equipment ----------
function equipmentForm(existing) {
  const q = existing || newEquipment();
  const form = el('form', {},
    field('Name *', textInput('name', q.name, { placeholder: 'e.g. Toro 30" mower' })),
    el('div', { class: 'field-pair' },
      field('Purchase date', dateInput('purchaseDate', q.purchaseDate)),
      field('Cost (CAD)', numberInput('cost', q.cost || ''))),
    field('Business line', select('line', LINES.map(l => [l, l === 'general' ? 'General / both' : l[0].toUpperCase() + l.slice(1)]), q.line)),
    el('div', { class: 'field-pair' },
      field('Last serviced', dateInput('lastServiceDate', q.lastServiceDate)),
      field('Service notes', textInput('serviceNotes', q.serviceNotes, { placeholder: 'e.g. blade + oil' }))),
    field('Notes', textInput('notes', q.notes)),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, existing ? 'Save' : 'Add equipment')),
    existing ? el('button', {
      class: 'link-danger', type: 'button', onclick: async () => {
        if (!confirmAction('Delete this equipment record?')) return;
        await remove('equipment', q.id);
        closeModal(); toast('Equipment deleted'); render();
      }
    }, 'Delete equipment') : null);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    if (!v.name) return;
    await put('equipment', touch({ ...q, ...v, cost: Number(v.cost) || 0 }));
    closeModal();
    toast(existing ? 'Equipment updated' : 'Equipment added ✔');
    render();
  });
  openModal(existing ? 'Edit equipment' : 'New equipment', [form]);
}

function equipmentList(data) {
  const items = [...data.equipment].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const list = items.length === 0
    ? [el('div', { class: 'empty' }, 'No equipment yet.')]
    : items.map(q => el('div', { class: 'card tappable', onclick: () => equipmentForm(q) },
        el('div', { class: 'row' },
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, q.name),
            el('div', { class: 'row-sub' }, [
              q.purchaseDate ? `bought ${fmtDate(q.purchaseDate)}` : '',
              q.cost ? money(q.cost) : '',
              q.lastServiceDate ? `serviced ${fmtDate(q.lastServiceDate)}` : 'no service logged',
            ].filter(Boolean).join(' · '))),
          el('span', { class: `chip ${q.line}` }, q.line))));
  openModal('Equipment', list);
}

// ---------- forms ----------
function expenseForm(existing) {
  const x = existing || newExpense();
  const form = el('form', {},
    el('div', { class: 'field-pair' },
      field('Amount (CAD) *', numberInput('amount', x.amount || '')),
      field('Date', dateInput('date', x.date))),
    field('Category', select('category', EXPENSE_CATEGORIES, x.category)),
    field('Business line', select('line', LINES.map(l => [l, l === 'general' ? 'General / both' : l[0].toUpperCase() + l.slice(1)]), x.line)),
    field('Vendor', textInput('vendor', x.vendor, { placeholder: 'e.g. Canadian Tire' })),
    field('Note', textInput('note', x.note)),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, existing ? 'Save' : 'Add expense')),
    existing ? el('button', {
      class: 'link-danger', type: 'button', onclick: async () => {
        if (!confirmAction('Delete this expense?')) return;
        await remove('expenses', x.id);
        closeModal(); toast('Expense deleted'); render();
      }
    }, 'Delete expense') : null);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    if (!v.amount || Number(v.amount) <= 0) return;
    await put('expenses', touch({ ...x, ...v, amount: Number(v.amount) }));
    closeModal();
    toast(existing ? 'Expense updated' : 'Expense added');
    render();
  });
  openModal(existing ? 'Edit expense' : 'New expense', [form]);
}

function budgetForm(existing, data) {
  const b = existing || newBudget();
  const form = el('form', {},
    field('Category', select('category', EXPENSE_CATEGORIES, b.category)),
    el('div', { class: 'field-pair' },
      field('Limit (CAD) *', numberInput('limit', b.limit || '')),
      field('Period', select('period', [['monthly', 'Monthly'], ['seasonal', 'Seasonal']], b.period))),
    el('div', { class: 'row-sub', style: 'margin-bottom:12px' },
      'Seasonal = mowing season (Apr–Oct) or plowing season (Nov–Mar), whichever the current date falls in.'),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn subtle', type: 'button', onclick: closeModal }, 'Cancel'),
      el('button', { class: 'btn', type: 'submit' }, existing ? 'Save' : 'Set budget')),
    existing ? el('button', {
      class: 'link-danger', type: 'button', onclick: async () => {
        if (!confirmAction('Remove this budget?')) return;
        await remove('budgets', b.id);
        closeModal(); toast('Budget removed'); render();
      }
    }, 'Remove budget') : null);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = formValues(form);
    if (!v.limit || Number(v.limit) <= 0) return;
    // one budget per category+period — replace an existing duplicate instead of stacking
    const dupe = data.budgets.find(x => x.category === v.category && x.period === v.period && x.id !== b.id);
    if (dupe) await remove('budgets', dupe.id);
    await put('budgets', touch({ ...b, ...v, limit: Number(v.limit) }));
    closeModal();
    toast('Budget saved');
    render();
  });
  openModal(existing ? 'Edit budget' : 'New budget', [form]);
}
