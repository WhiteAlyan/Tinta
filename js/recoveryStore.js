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
// restore the lost changes.
//
// CR-01 fix — staleness is now CONTENT-TIMELINE-aware, not a bare rev
// comparison. The old rule ("snapshot.rev <= disk.rev → stale") was
// inverted for the exact case the snapshot exists for: _db.rev only
// advances AFTER a successful localStorage write, so a snapshot taken
// on the quota-failure path always carries the last SUCCESSFUL save's
// rev — numerically equal to disk. Under the old rule every snapshot
// that survived to boot was classified as stale and silently deleted,
// destroying the only copy of the writer's unsaved work and making the
// recovery toast unreachable. The rule is now: a snapshot is stale only
// when the disk rev has moved PAST the rev the snapshot was taken
// against (proof that a later save landed). Equality means the failed
// write never landed — the snapshot IS the freshest copy. Snapshots
// also carry a `diskRevAtSnapshot` meta record (stored alongside the
// payload, not inside it — replaceDb() must receive a clean db) so the
// comparison survives any future path that snapshots with a bumped
// payload rev. See isSnapshotStale() below.
//
// The snapshot is the FULL in-memory _db serialized as JSON. We don't
// try to diff against the disk db — that's complex and the typical
// recovery case is "all my work since the last successful save is
// gone", which is the full db anyway.

import { makeBlobStore } from './makeBlobStore.js';

const store = makeBlobStore('tinta-recovery');
const SNAPSHOT_KEY = 'unsaved-db-snapshot';
// CR-01 — bookkeeping that travels WITH the snapshot but is not part of
// the db. Kept under a separate key so getRecoverySnapshot() can keep
// returning the db object verbatim (recoveryToast feeds it straight
// into replaceDb()). Best-effort: if the meta put ever fails while the
// payload put succeeded, isSnapshotStale() falls back to the payload's
// own rev, which still classifies the mainline case correctly.
const SNAPSHOT_META_KEY = 'unsaved-db-snapshot-meta';

// Save the in-memory _db as a JSON string to IndexedDB (plus the CR-01
// meta record under a sibling key). Best-effort —
// if IndexedDB itself is unavailable (private browsing, fresh session,
// etc.), the catch swallows the error and the writer is no worse off
// than before this fix existed. Returns true if the snapshot landed,
// false otherwise.
// CR-01 — `meta` travels in a sibling key (see SNAPSHOT_META_KEY).
// store-core's quota path passes { diskRevAtSnapshot: _db.rev }.
export async function saveRecoverySnapshot(db, meta = {}) {
  if (!db) return false;
  try {
    const json = JSON.stringify(db);
    await store.putBlob(SNAPSHOT_KEY, json);
    // The payload is the critical copy; the meta record is an accuracy
    // upgrade. A failed meta put must not discard a landed payload.
    try {
      await store.putBlob(SNAPSHOT_META_KEY, JSON.stringify(meta || {}));
    } catch {}
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

// Read the snapshot's meta record back. Returns {} when absent (legacy
// snapshots written before CR-01 have no meta — isSnapshotStale then
// falls back to the payload rev).
export async function getRecoverySnapshotMeta() {
  try {
    const json = await store.getBlob(SNAPSHOT_META_KEY);
    if (typeof json !== 'string' || !json) return {};
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// CR-01 — the boot-time staleness decision, extracted as a pure function
// so the smoketest can pin it against the exact scenario that used to
// destroy the writer's work.
//
// Stale means: "a successful save landed after this snapshot was taken,
// so disk already contains (at least) this state". That is provable only
// by the disk rev moving PAST the rev the snapshot was taken against —
// never by equality, because the quota-failure path cannot advance the
// rev (only a successful write does, and success also clears the
// snapshot). Equality therefore means the failed write never landed and
// the snapshot is the only copy of the unsaved work → NOT stale.
export function isSnapshotStale(snapshot, meta, diskRev) {
  if (!snapshot) return true;
  const disk = Number.isFinite(diskRev) ? diskRev : 0;
  const metaRev = Number.isFinite(meta?.diskRevAtSnapshot) ? meta.diskRevAtSnapshot : null;
  // Prefer the recorded disk rev; legacy snapshots fall back to the
  // payload rev (which equaled disk at snapshot time under the old code).
  const effective = metaRev !== null ? metaRev : (Number.isFinite(snapshot.rev) ? snapshot.rev : 0);
  return effective < disk;
}

// Delete the snapshot. Called after a successful restore OR after
// detecting the snapshot is stale (disk rev moved past it — see
// isSnapshotStale).
export async function clearRecoverySnapshot() {
  try {
    await store.deleteBlob(SNAPSHOT_KEY);
  } catch {
    // Best-effort — if the delete fails, the next boot will see the
    // snapshot again and re-run the staleness check.
  }
  try {
    await store.deleteBlob(SNAPSHOT_META_KEY);
  } catch {
    // Same best-effort posture. An orphaned meta record is harmless:
    // the next saveRecoverySnapshot overwrites it, and without a
    // payload getRecoverySnapshot() returns null so maybeShow() exits
    // before the meta is ever consulted.
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

