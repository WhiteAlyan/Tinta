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

// Roadmap #5 — downgrade quarantine. When an OLD Tinta build finds a
// database written by a NEWER one (schema version above what it knows),
// store-core.js refuses to load it, boots on an empty db, and locks all
// writes so the newer data is never clobbered. This store keeps a pristine
// copy of the raw JSON as a second line of defense — IndexedDB is a
// separate quota universe from the localStorage key being protected, so
// the copy lands even when the main key is over quota.
const quarantineStore = makeBlobStore('tinta-quarantine');
const QUARANTINE_KEY = 'newer-schema-db';

// Save the raw (unparsed) db JSON. Takes the string, not an object — the
// whole point is preserving bytes exactly as the newer binary wrote them.
export async function saveDowngradeQuarantine(rawJson) {
  if (typeof rawJson !== 'string') return false;
  try {
    await quarantineStore.putBlob(QUARANTINE_KEY, rawJson);
    return true;
  } catch {
    // Best-effort by design — the write lock on tinta:db is the primary
    // protection; this copy is redundancy, not the plan.
    return false;
  }
}

// Read the quarantined raw JSON back (string or null). Surfaced for a
// future "restore onto a newer Tinta" flow and for diagnostics.
export async function getDowngradeQuarantine() {
  try {
    const json = await quarantineStore.getBlob(QUARANTINE_KEY);
    if (typeof json !== 'string') return null;
    return json;
  } catch {
    return null;
  }
}

// Delete the quarantine copy — for when the writer confirms the newer
// data was recovered (or deliberately abandons it).
export async function clearDowngradeQuarantine() {
  try {
    await quarantineStore.deleteBlob(QUARANTINE_KEY);
  } catch {
    // Same best-effort posture as clearRecoverySnapshot.
  }
}

