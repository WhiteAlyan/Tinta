// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js-1-32

import * as Store from './store.js';
import * as AssetStore from './assetstore.js';
import { exportTintaProject } from './tintaPackage.js';
import { showStorageWarning } from './toast.js';

const FS_API_SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
const FOLDER_HANDLE_KEY = AssetStore.KEYS.BACKUP_FOLDER_HANDLE;

export function isAutoBackupSupported() {
  return FS_API_SUPPORTED;
}

// Returns the currently-persisted folder handle, or null. Doesn't
// check permission — the caller (the Backup modal) does that via
// requestBackupPermission() before actually using the handle.
export async function getBackupFolderHandle() {
  if (!FS_API_SUPPORTED) return null;
  try {
    const handle = await AssetStore.getBlob(FOLDER_HANDLE_KEY);
    return handle || null;
  } catch {
    return null;
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js-59-63
export async function setBackupFolderHandle(handle) {
  if (!FS_API_SUPPORTED || !handle) return;
  try {
// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js-67-72
    await AssetStore.putBlob(FOLDER_HANDLE_KEY, handle);
  } catch (err) {
    console.error('Tinta: could not persist backup folder handle', err);
  }
}

export async function clearBackupFolderHandle() {
  try {
    await AssetStore.deleteBlob(FOLDER_HANDLE_KEY);
  } catch {
    // ignore — already gone or never set
  }
}

// Checks if we have permission to write to the persisted handle. Returns
// 'granted', 'prompt' (need a user gesture to ask), 'denied', or
// 'no-handle' if no folder has been picked yet.
export async function checkBackupPermission() {
  if (!FS_API_SUPPORTED) return 'unsupported';
  const handle = await getBackupFolderHandle();
  if (!handle) return 'no-handle';
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return 'granted';
  if ((await handle.requestPermission(opts)) === 'granted') return 'granted';
  return 'prompt';
}

// Requests permission to write to the persisted handle. Requires a
// user gesture (so call from a click handler, not on page load).
// Returns 'granted' or 'denied'.
export async function requestBackupPermission() {
  if (!FS_API_SUPPORTED) return 'unsupported';
  const handle = await getBackupFolderHandle();
  if (!handle) return 'no-handle';
  const opts = { mode: 'readwrite' };
  return (await handle.requestPermission(opts)) === 'granted' ? 'granted' : 'denied';
}

// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js-111-118
export async function writeTintaToBackupFolder() {
  if (!FS_API_SUPPORTED) return { ok: false, error: 'File System Access API not supported by this browser.' };
  const handle = await getBackupFolderHandle();
  if (!handle) return { ok: false, error: 'No backup folder picked yet.' };

  const perm = await checkBackupPermission();
  if (perm !== 'granted') return { ok: false, error: 'Permission not granted for the backup folder.' };

  try {
    const result = await exportTintaProject();
    const fileHandle = await handle.getFileHandle(result.filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(result.blob);
    await writable.close();
    return { ok: true, filename: result.filename };
  } catch (err) {
    return { ok: false, error: err.message || 'Unknown error writing .tinta to folder.' };
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js-139-142
let writeTimer = null;
// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js-144-154
let consecutiveFailures = 0;
const FAILURE_THRESHOLD = 3;
let failureBannerShown = false;
export function scheduleAutoBackupTinta() {
  if (!FS_API_SUPPORTED) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeTintaToBackupFolder()
      .then(({ ok }) => {
        if (ok) {
// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js-166-169
          consecutiveFailures = 0;
          failureBannerShown = false;
          return;
        }
        consecutiveFailures++;
        if (consecutiveFailures === FAILURE_THRESHOLD && !failureBannerShown) {
          failureBannerShown = true;
          showStorageWarning('Auto-backup to your folder has failed 3 times in a row. Open Backup → Auto-backup to check the folder handle and re-grant permission if needed.');
        }
      })
      .catch(() => {
        // Same handling as { ok: false } — writeTintaToBackupFolder
        // catches its own errors and returns { ok: false, error }, so
        // this catch is for unexpected throws only.
        consecutiveFailures++;
        if (consecutiveFailures === FAILURE_THRESHOLD && !failureBannerShown) {
          failureBannerShown = true;
          showStorageWarning('Auto-backup to your folder has failed 3 times in a row. Open Backup → Auto-backup to check the folder handle and re-grant permission if needed.');
        }
      });
  }, 800);
}
