// Tinta — §33 foundation pass (seeded/reproducible generation) and the
// §31 canon-status/generation-record substrate that landed alongside it
// in the same store.js pass. Neither had a dedicated test before this.
// generator.js's own rng plumbing (createRng/randomSeed + every function
// threading `rng` through) is covered here directly since it's Store-free,
// same as generator.smoketest.mjs's original scope; the store.js layer
// (generateEntityNames/draftWorldbuildingEntity/generateStarterSystem
// reproducibility, canonStatus, generation records, markGenerationEdited,
// migration) needs the usual shim.
//
// Run with: node seed-foundation.smoketest.mjs

class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Generator = await import('./generator.js');
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

// ── generator.js: seeded RNG core ───────────────────────────────────────
section('createRng — determinism');
{
  const seq = (rng, n) => Array.from({ length: n }, () => rng());
  const a = seq(Generator.createRng('acorn'), 20);
  const b = seq(Generator.createRng('acorn'), 20);
  assertEqual(JSON.stringify(a), JSON.stringify(b), 'same seed produces the exact same draw sequence');

  const c = seq(Generator.createRng('birch'), 20);
  assert(JSON.stringify(a) !== JSON.stringify(c), 'a different seed produces a different sequence');

  a.forEach((v, i) => assert(v >= 0 && v < 1, `draw #${i} from a seeded rng is in [0,1)`));

  const d1 = seq(Generator.createRng(''), 5);
  const d2 = seq(Generator.createRng(undefined), 5);
  assertEqual(JSON.stringify(d1), JSON.stringify(d2), 'an empty-string seed and an omitted seed hash identically (both coerce the same way)');
}

section('randomSeed — fresh, non-colliding-in-practice seeds');
{
  const seeds = new Set(Array.from({ length: 50 }, () => Generator.randomSeed()));
  assertEqual(seeds.size, 50, '50 calls produce 50 distinct seed strings');
  assert([...seeds].every((s) => typeof s === 'string' && s.length > 0), 'every seed is a non-empty string');
}

section('Every generator function is reproducible given the same rng, and unseeded calls still work');
{
  const rngA = Generator.createRng('reef');
  const rngB = Generator.createRng('reef');
  assertEqual(
    Generator.generateFromSyllablePool({ ...Generator.CLASSIC_FANTASY_POOL, rng: rngA }),
    Generator.generateFromSyllablePool({ ...Generator.CLASSIC_FANTASY_POOL, rng: rngB }),
    'generateFromSyllablePool reproduces with the same rng'
  );
  assertEqual(
    Generator.generateDescriptor(Generator.createRng('reef')),
    Generator.generateDescriptor(Generator.createRng('reef')),
    'generateDescriptor(rng) reproduces with the same rng (positional arg, not an options object)'
  );
  assertEqual(
    Generator.generateFromPattern({ pattern: 'CVCVC', rng: Generator.createRng('reef') }),
    Generator.generateFromPattern({ pattern: 'CVCVC', rng: Generator.createRng('reef') }),
    'generateFromPattern reproduces with the same rng'
  );
  const markov = Generator.buildMarkovModel(['Zhydryx', 'Kaelthir', 'Vorenth', 'Nymrisa']);
  assertEqual(
    Generator.generateFromMarkov(markov, { rng: Generator.createRng('reef') }),
    Generator.generateFromMarkov(markov, { rng: Generator.createRng('reef') }),
    'generateFromMarkov reproduces with the same rng'
  );
  const namesA = Generator.generateNames({ mode: 'pattern', count: 6, rng: Generator.createRng('reef') }).names;
  const namesB = Generator.generateNames({ mode: 'pattern', count: 6, rng: Generator.createRng('reef') }).names;
  assertEqual(JSON.stringify(namesA), JSON.stringify(namesB), 'generateNames (pattern mode) reproduces a whole batch with the same rng');

  // No rng at all — must still work exactly as before this pass (falls
  // back to Math.random internally, per every default above).
  const unseeded = Generator.generateNames({ mode: 'pattern', count: 3 });
  assertEqual(unseeded.names.length, 3, 'calling with no rng at all still works (Math.random default)');
  assert(!!Generator.generateDescriptor(), 'generateDescriptor() with no args still works');
}

// ── store.js layer ───────────────────────────────────────────────────────
globalThis.localStorage.clear();
Store.getActiveProject();

section('generateEntityNames — seed round-trip');
{
  const first = Store.generateEntityNames({ mode: 'pattern', count: 5 });
  assert(typeof first.seed === 'string' && first.seed.length > 0, 'a batch always carries a seed, even when the caller didn\'t ask for one');
  const reproduced = Store.generateEntityNames({ mode: 'pattern', count: 5, seed: first.seed });
  assertEqual(JSON.stringify(reproduced.names), JSON.stringify(first.names), 'passing the returned seed back reproduces the exact same batch');
  const different = Store.generateEntityNames({ mode: 'pattern', count: 5 });
  assert(different.seed !== first.seed, 'two unseeded calls get two different seeds (overwhelmingly likely, not guaranteed by construction — this checks the common case)');
}

section('draftWorldbuildingEntity / commitWorldbuildingDraft — seed, canonStatus, generation record');
{
  const type = Store.createEntityType({
    label: 'Culture',
    color: '#8B6F47',
    fields: [{ key: 'customsTaboos', label: 'Customs & taboos' }, { key: 'artsCuisine', label: 'Arts & cuisine' }],
  });

  const draft1 = Store.draftWorldbuildingEntity({ typeKey: type.key });
  assert(typeof draft1.seed === 'string' && draft1.seed.length > 0, 'a draft carries a seed');
  const draft2 = Store.draftWorldbuildingEntity({ typeKey: type.key, seed: draft1.seed });
  assertEqual(draft2.name, draft1.name, 'reproducing a draft from its seed gives the same name');
  assertEqual(JSON.stringify(draft2.customFields), JSON.stringify(draft1.customFields), 'reproducing a draft from its seed gives the same customFields (one rng stream drives both the name and every field)');

  const committed = Store.commitWorldbuildingDraft({ typeKey: type.key, name: draft1.name, customFields: draft1.customFields, seed: draft1.seed });
  assertEqual(committed.canonStatus, 'draft', 'a committed worldbuilding draft starts as canonStatus "draft", not "canon"');
  assert(!!committed.generation, 'a generation record is stamped on commit');
  assertEqual(committed.generation.seed, draft1.seed, 'the generation record carries the actual seed used');
  assertEqual(committed.generation.generatorName, 'draftWorldbuildingEntity', 'the generation record names its generator');
  assertEqual(committed.generation.edited, false, 'a freshly committed draft is not marked edited');
  assert(typeof committed.generation.generatorVersion === 'number', 'the generation record carries a generator version number');

  Store.markGenerationEdited('entity', committed.id);
  assertEqual(Store.getEntity(committed.id).generation.edited, true, 'markGenerationEdited flips the edited flag');
  Store.markGenerationEdited('entity', committed.id); // idempotent — shouldn't throw or double-anything
  assertEqual(Store.getEntity(committed.id).generation.edited, true, 'calling markGenerationEdited again is a harmless no-op');

  const hand = Store.createEntity({ name: 'Hand-built Culture', type: type.key });
  assertEqual(hand.canonStatus, 'canon', 'an entity created directly (not via a generator) defaults to canonStatus "canon"');
  assertEqual(hand.generation, null, 'a hand-built entity has no generation record');
}

section('generateStarterSystem — seed round-trip produces an identical tree');
{
  const { system: sysA, nodes: nodesA, seed } = Store.generateStarterSystem({ name: 'Elemental Magic', domain: 'fire', tierCount: 3, perTier: 2 });
  const { system: sysB, nodes: nodesB } = Store.generateStarterSystem({ name: 'Elemental Magic', domain: 'fire', tierCount: 3, perTier: 2, seed });
  assertEqual(nodesA.map((n) => n.name).join(','), nodesB.map((n) => n.name).join(','), 'the same seed reproduces the exact same node names, in the same order');
  assertEqual(
    nodesA.map((n) => n.requirement.length ? nodesA.findIndex((x) => x.id === n.requirement[0]) : -1).join(','),
    nodesB.map((n) => n.requirement.length ? nodesB.findIndex((x) => x.id === n.requirement[0]) : -1).join(','),
    'the same seed reproduces the exact same prerequisite structure (which node in the prior tier each pick lands on), not just the same names'
  );
  assertEqual(sysA.canonStatus, 'draft', 'a generated system starts as canonStatus "draft"');
  assertEqual(sysA.generation.generatorName, 'generateStarterSystem', 'the system\'s generation record names its generator');
  assertEqual(sysA.generation.seed, seed, 'the system\'s generation record carries the actual seed used');
  assertEqual(sysA.generation.inputs.tierCount, 3, 'the generation record\'s inputs capture what was asked for, for a future re-generate feature to replay');

  const handSystem = Store.createRuleSystem({ name: 'Hand-built System' });
  assertEqual(handSystem.canonStatus, 'canon', 'a hand-built system defaults to canonStatus "canon"');
  assertEqual(handSystem.generation, null, 'a hand-built system has no generation record');

  Store.markGenerationEdited('ruleSystem', sysA.id);
  assertEqual(Store.getRuleSystem(sysA.id).generation.edited, true, 'markGenerationEdited works for rule systems too');
}

section('getCanonStatuses');
{
  const statuses = Store.getCanonStatuses();
  assert(Array.isArray(statuses) && statuses.length >= 4, 'returns a real list of canon statuses');
  ['canon', 'draft'].forEach((s) => assert(statuses.includes(s), `includes "${s}"`));
}

section('Migration — a pre-§33/§31 backup backfills canonStatus/generation cleanly');
{
  const backupJson = Store.exportFullBackup();
  const legacyDb = JSON.parse(backupJson);
  Object.values(legacyDb.projects).forEach((p) => {
    Object.values(p.entities || {}).forEach((e) => { delete e.canonStatus; delete e.generation; });
    Object.values(p.ruleSystems || {}).forEach((s) => { delete s.canonStatus; delete s.generation; });
  });
  Store.importFullBackup(JSON.stringify(legacyDb));
  const healedProject = Store.getActiveProject();
  const anyEntity = Object.values(healedProject.entities)[0];
  assertEqual(anyEntity.canonStatus, 'canon', 'a stripped entity heals to canonStatus "canon" on import, not "draft" — silence about provenance should read as established, not as pending review');
  assertEqual(anyEntity.generation, null, 'a stripped entity\'s generation heals to null');
  const anySystem = Object.values(healedProject.ruleSystems)[0];
  if (anySystem) {
    assertEqual(anySystem.canonStatus, 'canon', 'a stripped rule system heals to canonStatus "canon" on import');
    assertEqual(anySystem.generation, null, 'a stripped rule system\'s generation heals to null');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
