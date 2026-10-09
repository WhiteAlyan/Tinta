// P2-7 fix — IndexedDB-backed recovery snapshot for quota-exceeded saves.
//
// Problem this closes: when localStorage.setItem throws a quota error
// in store-core.js's writeToLocalStorage, the in-memory _db has
// mutations that don't reach disk. The retry timer retries the SAME
// payload that just failed — if the db is over quota because of
// accumulated snapshots/images, retrying won't help until the writer
// manually trims. If the writer closes the tab before a retry
// succeeds, the in-memory state is lost.
//
// The natural fix — write the unsaved state to a separate localStorage
// key — does NOT work because localStorage quota is shared across
// keys. A write that fails for the main `tinta:db` key will also fail
// for `tinta:db:unsaved:...` with the same payload.
//
// IndexedDB has a much higher quota (~50MB+ per origin vs localStorage's
// ~5MB), so a snapshot saved to IndexedDB will land even when the same
// payload fails to land in localStorage. On next boot, we check for a
// recovery snapshot and surface a non-blocking toast offering to
// restore the lost changes. If the snapshot's rev is <= the disk db's
// rev (because the retry timer eventually succeeded before the tab
// closed), the snapshot is stale and is silently cleared.
//
// The snapshot is the FULL in-memory _db serialized as JSON. We don't
// try to diff against the disk db — that's complex and the typical
// recovery case is "all my work since the last successful save is
// gone", which is the full db anyway.

import { makeBlobStore } from './makeBlobStore.js';

const store = makeBlobStore('tinta-recovery');
const SNAPSHOT_KEY = 'unsaved-db-snapshot';

// Save the in-memory _db as a JSON string to IndexedDB. Best-effort —
// if IndexedDB itself is unavailable (private browsing, fresh session,
// etc.), the catch swallows the error and the writer is no worse off
// than before this fix existed. Returns true if the snapshot landed,
// false otherwise.
export async function saveRecoverySnapshot(db) {
  if (!db) return false;
  try {
    const json = JSON.stringify(db);
    await store.putBlob(SNAPSHOT_KEY, json);
    return true;
  } catch {
    // IndexedDB unavailable, quota exceeded even for IndexedDB
    // (extremely unlikely given the ~50MB quota vs the ~5MB that
    // triggered this path), or JSON.stringify threw on a cyclic
    // structure (shouldn't happen for the db, but defensive). Either
    // way, fail silent — the retry timer is still the backstop.
    return false;
  }
}

// Read the snapshot if one exists. Returns the parsed db object or null.
// Also returns null if the snapshot is unreadable (corrupted JSON,
// IndexedDB unavailable).
export async function getRecoverySnapshot() {
  try {
    const json = await store.getBlob(SNAPSHOT_KEY);
    if (!json) return null;
    if (typeof json !== 'string') return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Delete the snapshot. Called after a successful restore OR after
// detecting the snapshot is stale (rev <= disk db's rev).
export async function clearRecoverySnapshot() {
  try {
    await store.deleteBlob(SNAPSHOT_KEY);
  } catch {
    // Best-effort — if the delete fails, the next boot will see the
    // stale snapshot again and offer to restore from it. Not harmful
    // because the rev comparison will re-detect staleness.
  }
}
