// Tinta — Generation History / Canon Control (Foundational pass, §31)
// smoke test.
//
// Scope note, matching store.js's own comments: this covers what was
// actually built — canonStatus + generation metadata on entities and
// rule systems, stamped by the two real generator entry points, plus
// migration backfill. It deliberately does NOT test a `seed` field
// (none exists — no seeded PRNG anywhere in this codebase) or automatic
// edited-detection on arbitrary updateEntity/updateRuleSystem calls
// (also doesn't exist — markGenerationEdited is an explicit hook, not
// wired to fire on every patch; see store.js's comment on why).
//
// Run with: node canon-control.smoketest.mjs

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

section('getCanonStatuses — the six states from §31, exactly');
{
  const statuses = Store.getCanonStatuses();
  assertEqual(statuses.length, 6, 'exactly six canon states');
  ['canon', 'draft', 'proposed', 'alternate', 'deprecated', 'non-canon'].forEach((s) => {
    assert(statuses.includes(s), `getCanonStatuses includes "${s}"`);
  });
}

section('Hand-created entities default to canon, no generation record');
{
  const entity = Store.createEntity({ name: 'Kessa Vane', type: 'character' });
  assertEqual(entity.canonStatus, 'canon', 'a manually created entity defaults to canonStatus "canon"');
  assertEqual(entity.generation, null, 'a manually created entity has no generation record — nothing generated it');
}

section('Hand-created rule systems default to canon, no generation record');
{
  const system = Store.createRuleSystem({ name: 'Blade Forms' });
  assertEqual(system.canonStatus, 'canon', 'a manually created rule system defaults to canonStatus "canon"');
  assertEqual(system.generation, null, 'a manually created rule system has no generation record');
}

section('commitWorldbuildingDraft — the actual entity generator stamps draft + generation');
{
  const type = Store.createEntityType({ label: 'Deity', color: '#5A5B8F', fields: [{ key: 'domain', label: 'Domain' }] });
  const entity = Store.commitWorldbuildingDraft({ typeKey: type.key, name: 'Voss, the Unmade', customFields: { domain: 'Entropy' } });
  assert(!!entity, 'commitWorldbuildingDraft returns the created entity');
  assertEqual(entity.canonStatus, 'draft', 'a generated entity defaults to canonStatus "draft", not "canon" — per §31, generated content starts unreviewed');
  assert(!!entity.generation, 'a generated entity carries a generation record');
  assertEqual(entity.generation.generatorName, 'draftWorldbuildingEntity', 'generation.generatorName identifies which generator made this');
  assertEqual(typeof entity.generation.generatorVersion, 'number', 'generation.generatorVersion is recorded');
  assertEqual(entity.generation.inputs.typeKey, type.key, 'generation.inputs captures what was actually passed to the generator');
  assert(!!entity.generation.timestamp, 'generation.timestamp is recorded');
  assertEqual(entity.generation.parentGenerationId, null, 'parentGenerationId is null — no regenerate-from-a-prior-generation feature exists yet to populate it');
  assertEqual(entity.generation.edited, false, 'a freshly generated entity is not yet marked edited');
  assertEqual(entity.customFields.domain, 'Entropy', 'the actual generated content (customFields) still lands correctly alongside the new metadata');
}

section('generateStarterSystem — the rule-system generator stamps draft + generation');
{
  const { system, nodes } = Store.generateStarterSystem({ name: 'Void Magic', domain: 'entropy', tierCount: 2, perTier: 2 });
  assertEqual(system.canonStatus, 'draft', 'a generated rule system defaults to canonStatus "draft"');
  assert(!!system.generation, 'a generated rule system carries a generation record');
  assertEqual(system.generation.generatorName, 'generateStarterSystem', 'generation.generatorName identifies the system generator');
  assertEqual(system.generation.inputs.domain, 'entropy', 'generation.inputs captures the domain that was passed in');
  assertEqual(system.generation.inputs.tierCount, 2, 'generation.inputs captures tierCount');
  assertEqual(system.generation.edited, false, 'a freshly generated system is not yet marked edited');
  assertEqual(nodes.length, 4, 'the actual generated content (2 tiers × 2 nodes) still lands correctly alongside the new metadata — stamping the system did not interfere with node generation');
  // Confirms the earlier-flagged staleness risk doesn't exist: the
  // `system` object returned is the same reference the canonStatus/
  // generation update was applied to, via updateRuleSystem's
  // Object.assign-onto-the-same-object pattern.
  assertEqual(Store.getRuleSystem(system.id).canonStatus, 'draft', 're-fetching the system from the store shows the same canonStatus the returned object already carried — no stale reference');
}

section('markGenerationEdited — the explicit post-generation-edit hook');
{
  const type = Store.getEntityType('character');
  const entity = Store.commitWorldbuildingDraft({ typeKey: type.key, name: 'Draft Character', customFields: {} });
  assertEqual(entity.generation.edited, false, 'sanity check — starts unedited');

  Store.markGenerationEdited('entity', entity.id);
  assertEqual(Store.getEntity(entity.id).generation.edited, true, 'markGenerationEdited flips generation.edited to true for an entity');

  Store.markGenerationEdited('entity', entity.id); // calling twice should be harmless, not throw or double-wrap
  assertEqual(Store.getEntity(entity.id).generation.edited, true, 'calling markGenerationEdited again is a safe no-op, still true');

  const { system } = Store.generateStarterSystem({ name: 'Test System', domain: 'test', tierCount: 1, perTier: 1 });
  Store.markGenerationEdited('ruleSystem', system.id);
  assertEqual(Store.getRuleSystem(system.id).generation.edited, true, 'markGenerationEdited flips generation.edited to true for a rule system');

  const canonEntity = Store.createEntity({ name: 'Never Generated', type: 'character' });
  Store.markGenerationEdited('entity', canonEntity.id); // should be a no-op — no generation record to flip
  assertEqual(Store.getEntity(canonEntity.id).generation, null, 'markGenerationEdited on a hand-created record (no generation object) is a safe no-op, does not fabricate one');

  Store.markGenerationEdited('entity', 'nonexistent-id'); // should not throw
  assert(true, 'markGenerationEdited on an unknown id is a safe no-op, not a crash');
}

section('canonStatus is a plain field — settable via the existing update functions, no separate setter needed');
{
  const entity = Store.createEntity({ name: 'Promotable', type: 'character' });
  const draftEntity = Store.commitWorldbuildingDraft({ typeKey: 'character', name: 'Was Draft', customFields: {} });
  assertEqual(draftEntity.canonStatus, 'draft', 'sanity check — starts draft');

  Store.updateEntity(draftEntity.id, { canonStatus: 'canon' });
  assertEqual(Store.getEntity(draftEntity.id).canonStatus, 'canon', 'canonStatus can be promoted to canon via the ordinary updateEntity path — no dedicated setCanonStatus function was needed since this is a plain field, not a guarded relationship');
  assert(!!Store.getEntity(draftEntity.id).generation, 'promoting to canon does not erase the generation history — the record of how it was made still exists even once accepted into canon, per §31\'s own field list keeping both concerns (state AND provenance) side by side');
}

section('Migration — a pre-§31 backup (no canonStatus/generation at all) backfills to canon, not draft');
{
  // Same importFullBackup() technique map.smoketest.mjs and
  // calendar.smoketest.mjs already established for this — _db is cached
  // after the first load(), so a plain mutate-then-switchProject
  // round-trip would hand back the same cached reference without
  // re-running migrate(). importFullBackup() genuinely re-parses fresh
  // JSON and re-runs migration, the same as opening a real old backup.
  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  const legacyProject = legacyDb.projects[legacyProjectId];
  Object.values(legacyProject.entities).forEach((e) => {
    delete e.canonStatus;
    delete e.generation;
  });
  Object.values(legacyProject.ruleSystems).forEach((s) => {
    delete s.canonStatus;
    delete s.generation;
  });
  const anEntityId = Object.keys(legacyProject.entities)[0];
  assert(legacyProject.entities[anEntityId].canonStatus === undefined, 'sanity check — canonStatus really is gone in the legacy snapshot');

  Store.importFullBackup(JSON.stringify(legacyDb));
  const healedEntity = Store.getEntity(anEntityId);
  assertEqual(healedEntity.canonStatus, 'canon', 'a pre-§31 entity backfills to "canon", not "draft" — it was hand-authored before this feature existed, so demoting it to an unreviewed state would misrepresent its actual history');
  assertEqual(healedEntity.generation, null, 'a pre-§31 entity backfills generation to null — there is genuinely no generation record for it to have');

  const aSystemId = Object.keys(Store.getActiveProject().ruleSystems)[0];
  if (aSystemId) {
    const healedSystem = Store.getRuleSystem(aSystemId);
    assertEqual(healedSystem.canonStatus, 'canon', 'a pre-§31 rule system backfills to "canon" too, same reasoning');
    assertEqual(healedSystem.generation, null, 'a pre-§31 rule system backfills generation to null');
  }
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
