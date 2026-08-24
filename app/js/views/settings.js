// Settings: export for Finlay, backup/restore, storage status, danger zone.

import { el, render, toast, confirmAction, field, textInput, APP_VERSION } from '../app.js';
import { clearStore, getMeta, setMeta, STORES } from '../db.js';
import { exportAndShare, restoreFromFile } from '../export.js';
import { fmtDate } from '../models.js';

export async function renderSettings(root, data, { lastExportAt }) {
  const counts = `${data.clients.length} clients · ${data.invoices.length} invoices · ${data.payments.length} payments · ${data.expenses.length} expenses`;

  // ---- export ----
  root.append(el('div', { class: 'section-label' }, 'Send data to Finlay'));
  root.append(el('div', { class: 'card' },
    el('div', { class: 'row-sub', style: 'margin-bottom:6px' }, '1. Tap the button — your share sheet opens'),
    el('div', { class: 'row-sub', style: 'margin-bottom:6px' }, '2. Pick AirDrop, Messages, or Mail → send to Finlay'),
    el('div', { class: 'row-sub', style: 'margin-bottom:10px' }, '3. Done — this file is also your backup'),
    el('div', { class: 'row-sub', style: 'margin-bottom:10px' }, counts),
    lastExportAt ? el('div', { class: 'row-sub', style: 'margin-bottom:10px' }, `Last sent: ${fmtDate(lastExportAt.slice(0, 10))}`) : null,
    el('button', {
      class: 'btn', onclick: async () => {
        const result = await exportAndShare();
        if (result === 'shared') toast('Sent ✔ (backup saved too)');
        else if (result === 'downloaded') toast('File downloaded ✔ — send it to Finlay');
        render();
      }
    }, '📤 Send to Finlay')));

  // ---- business info (used by payment-request / review texts) ----
  const biz = (await getMeta('business')) || { etransfer: '', reviewLink: '' };
  const etIn = textInput('etransfer', biz.etransfer, { placeholder: 'e-transfer email or phone' });
  const rvIn = textInput('reviewLink', biz.reviewLink, { placeholder: 'https://g.page/r/…' });
  root.append(el('div', { class: 'section-label' }, 'Business info'));
  root.append(el('div', { class: 'card' },
    el('div', { class: 'row-sub', style: 'margin-bottom:10px' },
      'Used in the one-tap texts: payment requests include your e-transfer address, review asks include your Google review link.'),
    field('E-transfer address', etIn),
    field('Google review link', rvIn),
    el('button', {
      class: 'btn secondary', onclick: async () => {
        await setMeta('business', { etransfer: etIn.value.trim(), reviewLink: rvIn.value.trim() });
        toast('Business info saved ✔');
      }
    }, 'Save business info')));

  // ---- restore ----
  root.append(el('div', { class: 'section-label' }, 'Restore from backup'));
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!confirmAction('Restoring will REPLACE everything currently in the app with the backup file. Continue?')) {
      fileInput.value = '';
      return;
    }
    try {
      const counts = await restoreFromFile(file);
      toast(`Restored ${counts.clients} clients, ${counts.invoices} invoices, ${counts.expenses} expenses`);
      render();
    } catch (err) {
      toast('Restore failed: ' + err.message);
    }
    fileInput.value = '';
  });
  root.append(el('div', { class: 'card' },
    el('div', { class: 'row-sub', style: 'margin-bottom:10px' },
      'Load a previous export file. Replaces everything currently on this device.'),
    el('button', { class: 'btn secondary', onclick: () => fileInput.click() }, '📥 Restore from file'),
    fileInput));

  // ---- storage status ----
  root.append(el('div', { class: 'section-label' }, 'About'));
  const storageLine = el('div', { class: 'row-sub' }, 'Checking storage…');
  root.append(el('div', { class: 'card' },
    el('div', { class: 'row-title' }, 'Delisle Mowing Co. tracker'),
    el('div', { class: 'row-sub' }, `Version ${APP_VERSION}`),
    el('div', { class: 'row-sub' }, 'All data is stored on this device only. Nothing is uploaded anywhere.'),
    storageLine));
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then(p => {
      storageLine.textContent = p
        ? 'Storage: protected from automatic cleanup ✔'
        : 'Storage: not yet marked persistent — keep the app on your Home Screen and export regularly.';
    }).catch(() => { storageLine.textContent = ''; });
  } else {
    storageLine.textContent = '';
  }

  // ---- danger zone ----
  root.append(el('div', { class: 'section-label' }, 'Danger zone'));
  root.append(el('div', { class: 'card' },
    el('button', {
      class: 'btn danger', onclick: async () => {
        if (!confirmAction('Erase ALL data on this device? Make sure you have an export first. This cannot be undone.')) return;
        if (!confirmAction('Really erase everything?')) return;
        for (const s of STORES) await clearStore(s);
        toast('All data erased');
        render();
      }
    }, 'Erase all data')));
  root.append(el('div', { class: 'fab-space' }));
}
