// App shell: routing between views, modal/toast helpers, service-worker update flow.

import { loadAll, getMeta, setMeta } from './db.js';
import { renderDashboard } from './views/dashboard.js';
import { renderClients } from './views/clients.js';
import { renderInvoices } from './views/invoices.js';
import { renderExpenses } from './views/expenses.js';
import { renderSettings } from './views/settings.js';

export const APP_VERSION = '1.6.1';
const BRAND = 'Delisle Mowing';

const VIEWS = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  clients: { title: 'Clients', render: renderClients },
  invoices: { title: 'Money', render: renderInvoices },
  expenses: { title: 'Expenses', render: renderExpenses },
  settings: { title: 'Settings', render: renderSettings },
};

const state = { view: 'dashboard', params: {} };

export async function navigate(view, params = {}) {
  state.view = VIEWS[view] ? view : 'dashboard';
  state.params = params;
  await render();
}

export async function render() {
  const view = VIEWS[state.view];
  const fullTitle = `${BRAND} — ${view.title}`;
  document.getElementById('view-title').textContent = fullTitle;
  document.title = fullTitle;
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === state.view));
  const root = document.getElementById('view');
  root.innerHTML = '';
  const data = await loadAll();
  const lastExportAt = await getMeta('lastExportAt');
  await view.render(root, data, { params: state.params, lastExportAt });
  window.scrollTo(0, 0);
}

// ---------- tiny DOM helper ----------
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

// ---------- modal + form helpers ----------
export function openModal(title, bodyNodes, { onClose } = {}) {
  closeModal();
  const backdrop = el('div', { class: 'modal-backdrop', onclick: e => { if (e.target === backdrop) closeModal(); } },
    el('div', { class: 'modal' }, el('h2', {}, title), ...bodyNodes));
  backdrop.addEventListener('remove-modal', () => onClose && onClose());
  document.getElementById('modal-root').append(backdrop);
  return backdrop;
}
export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export function field(labelText, inputEl) {
  return el('div', { class: 'field' }, el('label', {}, labelText), inputEl);
}
export function textInput(name, value = '', attrs = {}) {
  return el('input', { name, type: 'text', value, ...attrs });
}
export function numberInput(name, value = '', attrs = {}) {
  return el('input', { name, type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value, ...attrs });
}
export function dateInput(name, value = '') {
  return el('input', { name, type: 'date', value });
}
export function select(name, options, selected) {
  const s = el('select', { name });
  for (const opt of options) {
    const [val, label] = Array.isArray(opt) ? opt : [opt, opt];
    const o = el('option', { value: val }, label);
    if (val === selected) o.selected = true;
    s.append(o);
  }
  return s;
}
export function formValues(form) {
  const out = {};
  for (const input of form.querySelectorAll('[name]')) out[input.name] = input.value.trim();
  return out;
}

// ---------- toast ----------
export function toast(message, { actionLabel, onAction, sticky } = {}) {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: 'toast' }, el('span', {}, message));
  if (actionLabel) {
    t.append(el('button', { onclick: () => { onAction && onAction(); t.remove(); } }, actionLabel));
  }
  root.append(t);
  if (!sticky) setTimeout(() => t.remove(), 3500);
}

export function confirmAction(message) {
  return window.confirm(message);
}

// ---------- boot ----------
document.querySelectorAll('.tab').forEach(tab =>
  tab.addEventListener('click', () => navigate(tab.dataset.view)));
document.getElementById('app-version').textContent = 'v' + APP_VERSION;

// Keep data safe from browser eviction where supported.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// Service worker: offline cache. Updates are AUTOMATIC — a new version installs,
// takes control, and the page reloads itself once. No toast to tap.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

// confirm to the user when a new version has just landed
getMeta('appVersion').then(prev => {
  if (prev && prev !== APP_VERSION) toast(`Updated to v${APP_VERSION} ✔`);
  if (prev !== APP_VERSION) setMeta('appVersion', APP_VERSION);
}).catch(() => {});

navigate('dashboard');
