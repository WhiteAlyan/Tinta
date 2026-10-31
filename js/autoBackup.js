// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js

import * as AssetStore from './assetstore.js';
import { exportTintaProject } from './tintaPackage.js';
import { showStorageWarning } from './toast.js';
import { autoBackupStamp, selectAutoBackupsToRotate } from './autoBackupName.js';

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

// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js
export async function setBackupFolderHandle(handle) {
  if (!FS_API_SUPPORTED || !handle) return;
  try {
// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js
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

// ── Roadmap #9 — dated backup names + rotation ────────────────────────
// The naming/rotation logic itself (autoBackupStamp, selectAutoBackups-
// ToRotate, AUTOBACKUP_KEEP) lives in autoBackupName.js — pure strings,
// unit-tested in Node. Only the handle-touching side lives here.

// Best-effort rotation after a successful write. The backup itself has
// already landed by the time this runs, so a rotation failure (folder
// hiccup, a file briefly locked by the OS) must never fail the backup —
// one extra stale file is the worst case.
async function rotateAutoBackups(handle, base) {
  try {
    const names = [];
    for await (const name of handle.keys()) names.push(name);
    for (const name of selectAutoBackupsToRotate(names, base)) {
      try { await handle.removeEntry(name); } catch { /* best effort, per file */ }
    }
  } catch {
    // Enumeration itself failed — leave the folder as it is.
  }
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

// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js
export async function writeTintaToBackupFolder() {
  if (!FS_API_SUPPORTED) return { ok: false, error: 'File System Access API not supported by this browser.' };
  const handle = await getBackupFolderHandle();
  if (!handle) return { ok: false, error: 'No backup folder picked yet.' };

  const perm = await checkBackupPermission();
  if (perm !== 'granted') return { ok: false, error: 'Permission not granted for the backup folder.' };

  try {
    const result = await exportTintaProject();
    // Roadmap #9 — dated filename: <project>-autosave-YYYY-MM-DD.tinta.
    // Same-day saves reuse the same name (an overwrite, exactly like the
    // old fixed name behaved for a single day), so the save debounce can
    // fire as often as it likes without filling the folder.
    const base = result.filename.replace(/\.tinta$/, '');
    const backupName = `${base}-autosave-${autoBackupStamp()}.tinta`;
    const fileHandle = await handle.getFileHandle(backupName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(result.blob);
    await writable.close();
    await rotateAutoBackups(handle, base);
    return { ok: true, filename: backupName };
  } catch (err) {
    return { ok: false, error: err.message || 'Unknown error writing .tinta to folder.' };
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js
let writeTimer = null;
// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js
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
// Historical context: see docs/CODEBASE_NOTES.md#jsautobackup-js
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
