// CR-41 / CR-42 — IndexedDB persistence backend for Tinta's primary
// database. store-core.js owns ALL decisions about when to save; this
// module is the transport it hands the data to.
//
// WHY THIS EXISTS
// The primary db lived only in localStorage under 'tinta:db', capped at
// ~5MB per origin — the binding constraint on a writing app whose
// database grows without bound. IndexedDB's quota is orders of magnitude
// larger, and its put() accepts objects directly: persistence no longer
// needs a giant JSON string at all.
//
// SHAPE — one database ('tinta-db'), two object stores:
//   meta     → ONE record under key 'db': the db object WITHOUT its
//              projects dictionary (schema version, rev, theme, grammar,
//              series, and every other app-level field).
//   projects → ONE record PER PROJECT, keyed by project id.
// Every flush writes meta + the affected project records in a single
// readwrite transaction over both stores, so a flush is all-or-nothing.
//
// AGGREGATION CHOICE (a deliberate, documented trade-off): chapters,
// entities, relationships, snapshots, etc. stay INSIDE their project
// record instead of getting per-record stores. The domain modules mutate
// in-memory project objects directly across ~200 call sites; per-record
// stores would force all of them through explicit transaction plumbing
// for little gain — project-level aggregation already removes the 5MB
// ceiling, keeps one-transaction atomicity, and makes each flush cost a
// few native structured clones instead of a whole-db JSON.stringify.
// If the CR-45 benchmarks ever show a single giant project record getting
// expensive to clone per flush, per-chapter stores are the next step —
// the store seam here (persist() writes whatever records it is given) is
// where that change lands.
//
// STRUCTURED CLONE, NOT JSON: put() clones the value natively and
// synchronously at call time. The clone is taken inside the transaction
// setup while the JS thread is still inside our own synchronous section —
// later mutations can't corrupt an in-flight flush, and no intermediate
// string is ever built.
//
// TOMBSTONES: deleted projects must not resurrect on the next boot, so
// persist() diffs the current project ids against the ids it knows it
// wrote last (seeded from getAllKeys at load time) and deletes the
// difference in the SAME transaction. Self-healing: a deleted record that
// somehow survives gets re-deleted on the next flush.

const DB_NAME = 'tinta-db';
const DB_VERSION = 1;
const META_STORE = 'meta';
const PROJECT_STORE = 'projects';
const META_KEY = 'db';

let dbPromise = null;
// Project ids present in the store as of the last load/persist — the
// tombstone diff baseline (see persist()).
let persistedProjectIds = null;

export function isAvailable() {
  return typeof indexedDB !== 'undefined';
}

// ── open (with CR-19-shaped transient-failure handling) ──────────────────
const OPEN_RETRY_BASE_MS = 250;
const OPEN_RETRY_CAP_MS = 4000;
let openFailures = 0;
let lastOpenAttemptAt = 0;
let lastOpenError = null;

function openDb() {
  if (dbPromise) return dbPromise;
  // Missing-IndexedDB environments reject WITHOUT caching (re-checked per
  // call — see makeBlobStore.js for why caching this rejection would be
  // the same session-poisoning disease CR-19 fixed).
  if (!isAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available in this browser/context.'));
  }
  // Backoff gate — ONLY after a failed attempt (openFailures > 0). An
  // earlier version of this gate keyed on elapsed time alone, which
  // rejected legitimate fast-successive opens (boot → first save) with
  // "in retry backoff" even though nothing had ever failed.
  const backoffMs = Math.min(OPEN_RETRY_BASE_MS * 2 ** openFailures, OPEN_RETRY_CAP_MS);
  if (openFailures > 0 && lastOpenAttemptAt !== 0 && Date.now() - lastOpenAttemptAt < backoffMs) {
    return Promise.reject(lastOpenError || new Error(`IndexedDB open for ${DB_NAME} is in retry backoff`));
  }
  lastOpenAttemptAt = Date.now();
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE);
    };
    req.onsuccess = () => {
      openFailures = 0;
      lastOpenError = null;
      const db = req.result;
      // Abnormal close (browser evicted the connection): evict the cached
      // handle so the next operation reopens a live one.
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      // Evict the rejected promise so the next open genuinely retries.
      dbPromise = null;
      openFailures++;
      lastOpenError = req.error || new Error(`IndexedDB open failed for ${DB_NAME}`);
      reject(lastOpenError);
    };
  });
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

// ── load ─────────────────────────────────────────────────────────────────
// Reads the whole persisted state back: { meta, projects } where meta is
// the meta record (or null on a fresh database) and projects is a plain
// { id: project } dictionary. Also seeds the tombstone baseline.
export async function loadAll() {
  const db = await openDb();
  const tx = db.transaction([META_STORE, PROJECT_STORE], 'readonly');
  const metaReq = tx.objectStore(META_STORE).get(META_KEY);
  const allProjectsReq = tx.objectStore(PROJECT_STORE).getAll();
  const allKeysReq = tx.objectStore(PROJECT_STORE).getAllKeys();
  await txDone(tx);
  const meta = metaReq.result ?? null;
  const projects = {};
  const records = allProjectsReq.result || [];
  const keys = allKeysReq.result || [];
  for (let i = 0; i < records.length; i++) {
    if (records[i] && typeof records[i] === 'object' && typeof keys[i] === 'string') {
      projects[keys[i]] = records[i];
    }
  }
  persistedProjectIds = new Set(Object.keys(projects));
  return { meta, projects };
}

// ── persist ──────────────────────────────────────────────────────────────
// Writes the db in ONE transaction: the meta record (db minus projects,
// with rev set to newRev) + every project record, deleting tombstoned
// ids. Resolves true when the transaction commits.
export async function persist(db, newRev) {
  if (!db || typeof db !== 'object') return false;
  const adb = await openDb();
  const meta = { ...db };
  delete meta.projects; // the projects dictionary travels in its own store
  meta.rev = newRev;

  const tx = adb.transaction([META_STORE, PROJECT_STORE], 'readwrite');
  tx.objectStore(META_STORE).put(meta, META_KEY);
  const projectStore = tx.objectStore(PROJECT_STORE);
  const currentIds = new Set();
  for (const [id, project] of Object.entries(db.projects || {})) {
    currentIds.add(id);
    projectStore.put(project, id); // structured clone happens HERE, synchronously
  }
  // Tombstones: ids the store held last flush that no longer exist.
  if (persistedProjectIds) {
    for (const staleId of persistedProjectIds) {
      if (!currentIds.has(staleId)) projectStore.delete(staleId);
    }
  }
  persistedProjectIds = currentIds;
  await txDone(tx);
  return true;
}

// ── diagnostics ──────────────────────────────────────────────────────────
// Quota/usage for the storage-headroom warning. Returns { usage, quota }
// or null when the browser doesn't expose an estimate.
export async function estimateUsage() {
  try {
    if (navigator && typeof navigator.storage?.estimate === 'function') {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota };
    }
  } catch { /* estimate is advisory only */ }
  return null;
}

// Drop everything (used by tests and by nothing else).
export async function wipe() {
  try { await indexedDB.deleteDatabase(DB_NAME); } catch { /* best effort */ }
  dbPromise = null;
  persistedProjectIds = null;
}

// Test-only: forget cached handles and the tombstone baseline without
// deleting any data (lets a test re-drive boot paths against the same
// fake database).
export function _resetForTests() {
  dbPromise = null;
  persistedProjectIds = null;
}
