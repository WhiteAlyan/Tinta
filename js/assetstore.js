// Historical context: see docs/CODEBASE_NOTES.md#jsassetstore-js-1-17
//
// P2-9 fix — imagestore.js and assetstore.js used to implement
// byte-for-byte near-identical openDb / putBlob / getBlob / deleteBlob /
// getObjectUrl against separate IndexedDBs. Both now delegate to
// makeBlobStore(dbName). No data migration: 'tinta-assets' DB name is
// preserved, public API is identical, all 4 importers
// (theme, autoBackup, settingsModal, backup) continue to work
// without changes.

import { makeBlobStore } from './makeBlobStore.js';

export const KEYS = {
  AMBIENCE_TRACK: 'ambience-custom-track',
  BACKGROUND_IMAGE: 'background-custom-image',
  CUSTOM_FONT: 'custom-manuscript-font',
// Historical context: see docs/CODEBASE_NOTES.md#jsassetstore-js-23-27
  BACKUP_FOLDER_HANDLE: 'tinta-backup-folder-handle',
};

const store = makeBlobStore('tinta-assets');

export const openDb = store.openDb;
export const putBlob = store.putBlob;
export const getBlob = store.getBlob;
export const deleteBlob = store.deleteBlob;
export const getObjectUrl = store.getObjectUrl;
