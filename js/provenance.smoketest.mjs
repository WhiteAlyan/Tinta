// Tinta — Canon Authority / Provenance (Foundational pass, §45) smoke test.
//
// Closes the fifth and final pillar of the Containers → Query →
// Navigation/Context → Mutation/History → Provenance foundation track.
//
// Scope note, matching store.js's own comments: `authoritySource` is a
// deliberately separate field from `canonStatus` (see store.js's
// AUTHORITY_SOURCES comment for why collapsing the two would lose
// information §45 itself asks to keep distinct). This covers what was
// actually built — the eight-value enum, the two auto-stamped defaults
// (hand-authored vs. generated, for both entities and rule systems,
// including series-shared entities), the validated setter, and migration
// backfill. It deliberately does NOT test automatic classification of the
// other six values (Published manuscript/Scene evidence/Character
// belief/Rumor/External research/Imported material) — nothing in this
// codebase stamps those automatically; they exist purely for a person to
// pick via the UI <select>, same as most of CANON_STATUSES's own values.
//
// Run with: node provenance.smoketest.mjs

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
Store.getActiveProject();

section('getAuthoritySources — the eight sources from §45, exactly');
{
  const sources = Store.getAuthoritySources();
  assertEqual(sources.length, 8, 'exactly eight authority sources');
  [
    'Author decision',
    'Published manuscript',
    'Scene evidence',
    'Character belief',
    'Rumor',
    'External research',
    'Generated proposal',
    'Imported material',
  ].forEach((s) => {
    assert(sources.includes(s), `getAuthoritySources includes "${s}"`);
  });
}

section('Hand-created entities default to "Author decision"');
{
  const entity = Store.createEntity({ name: 'Kessa Vane', type: 'character' });
  assertEqual(entity.authoritySource, 'Author decision', 'a manually created entity defaults to authoritySource "Author decision"');
  assertEqual(entity.canonStatus, 'canon', 'sanity check — canonStatus is still the independent "canon" default, unaffected by this pass');
}

section('Hand-created rule systems default to "Author decision"');
{
  const system = Store.createRuleSystem({ name: 'Blade Forms' });
  assertEqual(system.authoritySource, 'Author decision', 'a manually created rule system defaults to authoritySource "Author decision"');
}

section('Hand-created series entities default to "Author decision" too');
{
  const series = Store.createSeries('The Vane Cycle');
  Store.addActiveProjectToSeries(series.id);
  const shared = Store.createSeriesEntity({ name: 'Shared Elder', type: 'character' });
  assert(!!shared, 'createSeriesEntity succeeded once the active project belongs to a series');
  assertEqual(shared.authoritySource, 'Author decision', 'a manually created series-shared entity defaults to authoritySource "Author decision", same as a project entity');
}

section('commitWorldbuildingDraft — the entity generator stamps "Generated proposal"');
{
  const type = Store.createEntityType({ label: 'Deity', color: '#5A5B8F', fields: [{ key: 'domain', label: 'Domain' }] });
  const entity = Store.commitWorldbuildingDraft({ typeKey: type.key, name: 'Voss, the Unmade', customFields: { domain: 'Entropy' } });
  assert(!!entity, 'commitWorldbuildingDraft returns the created entity');
  assertEqual(entity.authoritySource, 'Generated proposal', 'a generated entity defaults to authoritySource "Generated proposal", not "Author decision" — nobody asserted this, a generator proposed it');
  assertEqual(entity.canonStatus, 'draft', 'sanity check — canonStatus is independently still "draft"');
}

section('generateStarterSystem — the rule-system generator stamps "Generated proposal"');
{
  const { system } = Store.generateStarterSystem({ name: 'Void Magic', domain: 'entropy', tierCount: 2, perTier: 2 });
  assertEqual(system.authoritySource, 'Generated proposal', 'a generated rule system defaults to authoritySource "Generated proposal"');
  assertEqual(Store.getRuleSystem(system.id).authoritySource, 'Generated proposal', 're-fetching the system from the store shows the same authoritySource the returned object already carried — no stale reference');
}

section('setAuthoritySource — validated setter, same shape as setCanonStatus');
{
  const entity = Store.createEntity({ name: 'Promotable', type: 'character' });
  Store.setAuthoritySource('entity', entity.id, 'Rumor');
  assertEqual(Store.getEntity(entity.id).authoritySource, 'Rumor', 'setAuthoritySource updates an entity to a valid source');

  Store.setAuthoritySource('entity', entity.id, 'Not A Real Source');
  assertEqual(Store.getEntity(entity.id).authoritySource, 'Rumor', 'an unrecognized value is silently ignored, not written — same "validate rather than trust the caller" discipline as setCanonStatus');

  const system = Store.createRuleSystem({ name: 'Test System' });
  Store.setAuthoritySource('ruleSystem', system.id, 'External research');
  assertEqual(Store.getRuleSystem(system.id).authoritySource, 'External research', 'setAuthoritySource also dispatches correctly for rule systems via the "kind" parameter');

  Store.setAuthoritySource('entity', 'nonexistent-id', 'Rumor');
  assert(true, 'setAuthoritySource on an unknown id is a safe no-op, not a crash');
}

section('authoritySource and canonStatus are genuinely independent axes');
{
  // The whole point of keeping these as two fields rather than folding
  // authority into canonStatus: a rumor can itself be canonically
  // established (yes, this rumor really does circulate in-story) while
  // still being flagged as a rumor rather than an author-asserted fact.
  const entity = Store.createEntity({ name: 'Rumor Carrier', type: 'character' });
  Store.setCanonStatus('entity', entity.id, 'canon');
  Store.setAuthoritySource('entity', entity.id, 'Rumor');
  const fetched = Store.getEntity(entity.id);
  assertEqual(fetched.canonStatus, 'canon', 'canonStatus can be "canon"...');
  assertEqual(fetched.authoritySource, 'Rumor', '...while authoritySource is independently "Rumor" — setting one never touches the other');
}

section('Migration — a pre-§45 backup (no authoritySource at all) backfills to "Author decision", not "Generated proposal"');
{
  // Same importFullBackup() technique canon-control.smoketest.mjs and
  // seed-foundation.smoketest.mjs already established for this.
  const legacyDb = JSON.parse(Store.exportFullBackup());
  assertEqual(legacyDb.version, 5, 'sanity check — this export really is at the current SCHEMA_VERSION before we strip fields from it');
  const legacyProjectId = legacyDb.activeProjectId;
  const legacyProject = legacyDb.projects[legacyProjectId];
  Object.values(legacyProject.entities).forEach((e) => { delete e.authoritySource; });
  Object.values(legacyProject.ruleSystems).forEach((s) => { delete s.authoritySource; });
  Object.values(legacyDb.series || {}).forEach((series) => {
    Object.values(series.entities || {}).forEach((e) => { delete e.authoritySource; });
  });
  // Force the version backward too, so this genuinely exercises
  // migrate_v2_to_v3 via VERSIONED_MIGRATIONS rather than relying on the
  // (also-correct, but separately-tested) "ladder reruns unconditionally
  // even on an already-current version" behavior.
  legacyDb.version = 2;

  const anEntityId = Object.keys(legacyProject.entities)[0];
  assert(legacyProject.entities[anEntityId].authoritySource === undefined, 'sanity check — authoritySource really is gone in the legacy snapshot');

  Store.importFullBackup(JSON.stringify(legacyDb));
  const healedEntity = Store.getEntity(anEntityId);
  assertEqual(healedEntity.authoritySource, 'Author decision', 'a pre-§45 entity backfills to "Author decision" — it was hand-authored before this feature existed, so defaulting it to the weakest source would misrepresent its actual history');
  assertEqual(JSON.parse(Store.exportFullBackup()).version, 5, 'importing the stripped-down, version-2-stamped backup brings it back up to version 4 — migrate_v2_to_v3 runs first (this test\'s actual target), migrate_v3_to_v4 rides along since a several-versions-behind db picks up every intermediate step');

  const aSystemId = Object.keys(Store.getActiveProject().ruleSystems)[0];
  if (aSystemId) {
    assertEqual(Store.getRuleSystem(aSystemId).authoritySource, 'Author decision', 'a pre-§45 rule system backfills to "Author decision" too, same reasoning');
  }

  const seriesIds = Object.keys(Store.getActiveDb().series || {});
  let checkedASeriesEntity = false;
  seriesIds.forEach((sid) => {
    const series = Store.getActiveDb().series[sid];
    Object.values(series.entities || {}).forEach((e) => {
      assertEqual(e.authoritySource, 'Author decision', 'a pre-§45 series-shared entity also backfills to "Author decision" — migrate_v2_to_v3 deliberately reaches into db.series, not just db.projects');
      checkedASeriesEntity = true;
    });
  });
  assert(checkedASeriesEntity, 'the migration test actually exercised at least one series-shared entity, not zero (a passing loop over an empty list would prove nothing)');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
