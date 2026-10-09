// Historical context: see docs/CODEBASE_NOTES.md#jsimagestore-js-1-16
//
// P2-9 fix — imagestore.js and assetstore.js used to implement
// byte-for-byte near-identical openDb / putBlob / getBlob / deleteBlob /
// getObjectUrl against separate IndexedDBs. Both now delegate to
// makeBlobStore(dbName). No data migration: 'tinta-images' DB name is
// preserved, public API is identical, all 11 importers
// (drawer, mapView, bookView, exportMenu, portraits, tintaPackage,
// library, canvasView, sketchView, imageLibrary, backup) continue to
// work without changes.

import { makeBlobStore } from './makeBlobStore.js';

const store = makeBlobStore('tinta-images');

export const openDb = store.openDb;
export const putBlob = store.putBlob;
export const getBlob = store.getBlob;
export const deleteBlob = store.deleteBlob;
export const getObjectUrl = store.getObjectUrl;

// Historical context: see docs/CODEBASE_NOTES.md#jsimagestore-js-71-76
export async function deleteBlobs(ids) {
  const results = await Promise.allSettled(ids.map((id) => deleteBlob(id)));
  return results.filter((r) => r.status === 'rejected').length; // count of failures, for the caller to decide whether to warn
}
