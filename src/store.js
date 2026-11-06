// Everything a visitor changes stays in their own browser: words, uploaded photos, pictures taken with the camera.
const DB_NAME = 'film-tins';
const STORE = 'kv';
let opening;

function db() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return opening;
}

function run(mode, act) {
  return db().then(
    (base) =>
      new Promise((resolve, reject) => {
        const tx = base.transaction(STORE, mode);
        const request = act(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

// Storage can be refused (private windows, blocked site data). Reads then come back empty and the page uses its defaults.
export async function load(key) {
  try {
    return await run('readonly', (store) => store.get(key));
  } catch {
    return undefined;
  }
}

export function save(key, value) {
  return run('readwrite', (store) => store.put(value, key));
}

export function remove(key) {
  return run('readwrite', (store) => store.delete(key));
}

export async function keys() {
  try {
    return (await run('readonly', (store) => store.getAllKeys())) || [];
  } catch {
    return [];
  }
}

export const photoKey = (src) => `photo:${src}`;
