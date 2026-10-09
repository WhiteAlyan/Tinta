// Tinta — schema versioning debt-fix smoke test.
// Run with: node schema-versioning.smoketest.mjs
//
// Covers the actual point of this pass: db.version is now real (not just
// a cosmetic stamp), the legacy ladder stays unconditional (verified by
// the exact regression this pass caused and then fixed — see the
// "unconditional" section below), and VERSIONED_MIGRATIONS is a genuine,
// correctly-gated extension point for schema changes from here forward.

class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Store = await import('./store.js');

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(title) { console.log(`\n${title}`); }

globalThis.localStorage.clear();

section('A fresh db is stamped with the current SCHEMA_VERSION');

Store.getActiveProject(); // triggers load(), which creates a fresh db
const freshBackup = JSON.parse(Store.exportFullBackup());
assertEqual(freshBackup.version, 5, 'a brand-new db is version 5, the current SCHEMA_VERSION');
assert(typeof freshBackup.version === 'number', 'version is a plain number, not a string like "1.1" — no semver-style fractional values');

section('An old/missing version number still gets fully migrated and bumped');

const noVersionDb = JSON.parse(Store.exportFullBackup());
delete noVersionDb.version;
Store.importFullBackup(JSON.stringify(noVersionDb));
assertEqual(JSON.parse(Store.exportFullBackup()).version, 5, 'a db with no version field at all is treated as version 0 and brought up to 5');

const oldVersionDb = JSON.parse(Store.exportFullBackup());
oldVersionDb.version = 1;
// Also strip a real legacy-era field to confirm the ladder actually ran,
// not just that the version number got bumped cosmetically.
delete oldVersionDb.background;
Store.importFullBackup(JSON.stringify(oldVersionDb));
assertEqual(JSON.parse(Store.exportFullBackup()).version, 5, 'a db explicitly stamped version 1 is bumped to 5');
assert(!!Store.getActiveDb().background, 'the legacy ladder actually ran (background got backfilled), not just the version number');

section('The legacy ladder stays unconditional — this is the regression this pass caused and then fixed');

// This is the exact scenario that broke on the first attempt: simulate
// "old data" by deleting a legacy-era field from an ALREADY-current
// (version 2) export, without touching the version number at all — every
// existing migration test in this codebase's suite does exactly this,
// because until this pass, migrate() never looked at version anyway.
const alreadyCurrentDb = JSON.parse(Store.exportFullBackup());
assertEqual(alreadyCurrentDb.version, 5, 'setup: this export is already at the current version');
delete alreadyCurrentDb.ambience;
Store.importFullBackup(JSON.stringify(alreadyCurrentDb));
assert(!!JSON.parse(Store.exportFullBackup()).ambience, 'a legacy field deleted from an ALREADY-current-version db still gets backfilled — the ladder does not skip itself just because version looks current');

section('Idempotency — running migrate() twice in a row does not creep the version or duplicate data');

const beforeSecondPass = JSON.parse(Store.exportFullBackup());
const projectCountBefore = Object.keys(beforeSecondPass.projects).length;
Store.importFullBackup(JSON.stringify(beforeSecondPass));
const afterSecondPass = JSON.parse(Store.exportFullBackup());
assertEqual(afterSecondPass.version, 5, 'version stays at 4 on a second migration pass, does not creep upward');
assertEqual(Object.keys(afterSecondPass.projects).length, projectCountBefore, 're-migrating does not duplicate projects');

section('VERSIONED_MIGRATIONS — the real extension point for future schema changes');

// There's no public API to register a migration (by design — it's a
// module-internal table, not something app.js or a test should reach
// into at runtime). This section instead verifies the CONTRACT the doc
// comment promises, by confirming migrate() is well-behaved for a db
// version at/above SCHEMA_VERSION (a future migration's target), which is
// the scenario a real VERSIONED_MIGRATIONS entry would eventually be
// exercised against.
const futureVersionDb = JSON.parse(Store.exportFullBackup());
futureVersionDb.version = 99; // simulates a db from a future Tinta version
Store.importFullBackup(JSON.stringify(futureVersionDb));
assertEqual(JSON.parse(Store.exportFullBackup()).version, 99, 'migrate() never downgrades a version number that is already ahead of SCHEMA_VERSION — Math.max, not overwrite');

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
