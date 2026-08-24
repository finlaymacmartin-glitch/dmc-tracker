// Export / backup / restore. The JSON export is the ONLY way data leaves the device,
// and only when the user explicitly shares it. Same file format serves as backup.

import { loadAll, bulkPut, clearStore, setMeta, STORES } from './db.js';
import { today } from './models.js';

export const EXPORT_FORMAT = 'dmc-export';
export const EXPORT_VERSION = 1;

export async function buildExport() {
  const data = await loadAll();
  return {
    app: EXPORT_FORMAT,
    formatVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export async function exportAndShare() {
  const payload = await buildExport();
  const json = JSON.stringify(payload, null, 2);
  const filename = `dmc-export-${today()}.json`;
  const file = new File([json], filename, { type: 'application/json' });

  // iOS share sheet (AirDrop / email / OneDrive) when available, download otherwise.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'DMC data export' });
      await setMeta('lastExportAt', new Date().toISOString());
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  await setMeta('lastExportAt', new Date().toISOString());
  return 'downloaded';
}

// Restore REPLACES everything on the device with the backup's contents.
export async function restoreFromFile(file) {
  const text = await file.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (payload.app !== EXPORT_FORMAT || !payload.data) {
    throw new Error('That file is not a DMC export/backup file.');
  }
  const counts = {};
  for (const store of STORES) {
    if (store === 'meta') continue;
    await clearStore(store);
    const records = Array.isArray(payload.data[store]) ? payload.data[store] : [];
    if (records.length) await bulkPut(store, records);
    counts[store] = records.length;
  }
  return counts;
}
