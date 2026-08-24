// IndexedDB layer — no dependencies. All business data lives here, on-device only.

const DB_NAME = 'dmc-db';
const DB_VERSION = 4; // v2: +visits; v3: +quotes, mileage, equipment; v4: +crew, shifts
export const STORES = ['clients', 'contracts', 'invoices', 'payments', 'expenses', 'budgets', 'visits', 'quotes', 'mileage', 'equipment', 'crew', 'shifts', 'meta'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = fn(store);
    t.oncomplete = () => resolve(result.__value !== undefined ? result.__value : result);
    t.onerror = () => reject(t.error);
  }));
}

export function getAll(storeName) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(storeName).objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export function put(storeName, obj) {
  return tx(storeName, 'readwrite', store => { store.put(obj); return obj; });
}

export function remove(storeName, id) {
  return tx(storeName, 'readwrite', store => { store.delete(id); return id; });
}

export function bulkPut(storeName, objects) {
  return tx(storeName, 'readwrite', store => {
    for (const o of objects) store.put(o);
    return objects.length;
  });
}

export function clearStore(storeName) {
  return tx(storeName, 'readwrite', store => { store.clear(); return true; });
}

export async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta').objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

export function setMeta(key, value) {
  return put('meta', { key, value });
}

// Load everything at once — the dataset for a one-man business stays tiny,
// so views just recompute from a full in-memory snapshot.
export async function loadAll() {
  const [clients, contracts, invoices, payments, expenses, budgets, visits, quotes, mileage, equipment, crew, shifts] = await Promise.all([
    getAll('clients'), getAll('contracts'), getAll('invoices'),
    getAll('payments'), getAll('expenses'), getAll('budgets'), getAll('visits'),
    getAll('quotes'), getAll('mileage'), getAll('equipment'), getAll('crew'), getAll('shifts'),
  ]);
  return { clients, contracts, invoices, payments, expenses, budgets, visits, quotes, mileage, equipment, crew, shifts };
}
