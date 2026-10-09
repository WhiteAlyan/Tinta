// P2-9 fix — shared blob-store factory. imagestore.js and assetstore.js
// used to implement byte-for-byte near-identical openDb / putBlob /
// getBlob / deleteBlob / getObjectUrl against two separate IndexedDBs
// ('tinta-images' and 'tinta-assets'). Now both delegate to this
// factory, parameterized by DB name. No data migration needed — each
// DB keeps its own name and the public API is identical. The factory
// returns the same five functions; the calling module re-exports them
// as named exports so existing import sites continue to work without
// any change.

export function makeBlobStore(dbName, storeName = 'blobs') {
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser/context.'));
        return;
      }
      const req = indexedDB.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
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
