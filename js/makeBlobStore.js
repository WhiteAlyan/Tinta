// P2-9 fix — shared blob-store factory. imagestore.js and assetstore.js
// used to implement byte-for-byte near-identical openDb / putBlob /
// getBlob / deleteBlob / getObjectUrl against two separate IndexedDBs
// ('tinta-images' and 'tinta-assets'). Now both delegate to this
// factory, parameterized by DB name. No data migration needed — each
// DB keeps its own name and the public API is identical. The factory
// returns the same five functions; the calling module re-exports them
// as named exports so existing import sites continue to work without
// any change.
//
// CR-19 fix — transient IndexedDB open failures used to poison the store
// for the whole session. openDb() cached `dbPromise` unconditionally, so
// when the very first open failed (a momentary disk hiccup, a browser
// startup race, the OS briefly suspending storage I/O), the REJECTED
// promise stayed cached: every later putBlob/getBlob for the rest of the
// session rejected without ever retrying the open. The user-visible
// symptom was "images/ambience/recovery stopped working until I reload
// the app". Now the rejected promise is evicted from the cache so the
// next operation genuinely retries, with an escalating backoff (250ms
// doubling per consecutive failure, capped at 4s) so a permanently-broken
// IndexedDB can't be hot-looped either. An abnormal connection close
// (`db.onclose` — the browser can evict open connections under memory or
// I/O pressure) also evicts the cached handle the same way.

const OPEN_RETRY_BASE_MS = 250;
const OPEN_RETRY_CAP_MS = 4000;

export function makeBlobStore(dbName, storeName = 'blobs') {
  const DB_VERSION = 1;
  let dbPromise = null;
  let openFailures = 0;
  let lastOpenAttemptAt = 0;
  let lastOpenError = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    // Missing-IndexedDB environments (old browsers, some privacy modes,
    // Node smoketests) reject WITHOUT caching: the absence is re-checked
    // on every call, so a store that starts in a no-IDB context starts
    // working the moment one appears. (Caching this rejection was the
    // same session-poisoning disease CR-19 fixed for failed opens — the
    // first pre-IDB call would have condemned every later call even
    // after IndexedDB became available.)
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available in this browser/context.'));
    }
    // Backoff gate — ONLY after a failed attempt (openFailures > 0); a
    // recent SUCCESSFUL open must never block the next one (the same bug
    // briefly lived in the first version of this gate: fast successive
    // opens within the base backoff window got rejected with nothing
    // having ever failed).
    const backoffMs = Math.min(OPEN_RETRY_BASE_MS * 2 ** openFailures, OPEN_RETRY_CAP_MS);
    if (openFailures > 0 && lastOpenAttemptAt !== 0 && Date.now() - lastOpenAttemptAt < backoffMs) {
      return Promise.reject(lastOpenError || new Error(`IndexedDB open for ${dbName} is in retry backoff`));
    }
    lastOpenAttemptAt = Date.now();
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(storeName);
      };
      req.onsuccess = () => {
        openFailures = 0;
        lastOpenError = null;
        const db = req.result;
        // Abnormal close (browser evicted the connection): evict the
        // cached handle so the next operation reopens a live one.
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        // THE CR-19 FIX: evict the rejected promise from the cache so the
        // next openDb() call actually retries instead of replaying this
        // failure forever.
        dbPromise = null;
        openFailures++;
        lastOpenError = req.error || new Error(`IndexedDB open failed for ${dbName}`);
        reject(lastOpenError);
      };
    });
    return dbPromise;
  }

  async function putBlob(id, blob) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getBlob(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteBlob(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getObjectUrl(id) {
    const blob = await getBlob(id);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  return { openDb, putBlob, getBlob, deleteBlob, getObjectUrl };
}
