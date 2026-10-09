// Tinta — Generator engine (§2 shared foundation, final piece) smoke test.
// Covers generator.js's pure logic (classic syllable-pool mode migrated
// from wordtools.js, pattern mode, Markov mode), the wordtools.js
// migration (generateName/generateNames must behave identically to
// before the move), and store.js's generateEntityNames wrapper (seeding
// from project entities, mode fallback, migration backfill — this pass
// added no new schema, so the migration check here just confirms nothing
// broke, not that new fields got backfilled). Run with:
//   node generator.smoketest.mjs

class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Generator = await import('./generator.js');
const WordTools = await import('./wordtools.js');
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

section('generator.js — classic (syllable pool) mode');
assert(!!Generator.CLASSIC_FANTASY_POOL.starts.length, 'CLASSIC_FANTASY_POOL has start syllables');
const classicName = Generator.generateFromSyllablePool({ ...Generator.CLASSIC_FANTASY_POOL, minSyllables: 2, maxSyllables: 3 });
assert(typeof classicName === 'string' && classicName.length > 0, 'generateFromSyllablePool produces a non-empty string: ' + classicName);
assert(Generator.CLASSIC_FANTASY_POOL.starts.some((s) => classicName.startsWith(s)), 'generated name starts with a pool start-syllable');
assertEqual(Generator.generateFromSyllablePool({ starts: [], mids: ['a'], ends: ['b'] }), null, 'empty starts pool returns null rather than throwing');

section('generator.js — pattern mode');
const patternName = Generator.generateFromPattern({ pattern: 'CVCVC' });
assertEqual(patternName.length, 5, 'CVCVC pattern produces a 5-character name: ' + patternName);
assert(/^[A-Z][a-z]{4}$/.test(patternName), 'pattern name is capitalized, rest lowercase: ' + patternName);
const literalPattern = Generator.generateFromPattern({ pattern: "CV'CVC", capitalize: false });
assertEqual(literalPattern[2], "'", 'literal characters in a pattern pass through unchanged: ' + literalPattern);
assertEqual(Generator.generateFromPattern({ pattern: null }), null, 'no pattern returns null rather than throwing');

section('generator.js — markov mode');
const seedWords = ['Zhydryx', 'Kaelthir', 'Vorenth', 'Zaltheris', 'Kaethun', 'Vornael'];
const markov = Generator.buildMarkovModel(seedWords, 2);
const markovName = Generator.generateFromMarkov(markov, { minLength: 3, maxLength: 10 });
assert(typeof markovName === 'string' && markovName.length >= 3, 'generateFromMarkov produces a name meeting minLength: ' + markovName);
const emptyMarkov = Generator.buildMarkovModel([], 2);
assertEqual(Generator.generateFromMarkov(emptyMarkov), null, 'an empty seed set produces no name rather than throwing');

section('generator.js — generateNames unified entry point');
{
  const { names, modeUsed } = Generator.generateNames({ seedWords, mode: 'auto', count: 6 });
  assertEqual(modeUsed, 'markov', 'auto mode picks markov when there are 3+ seed words');
  assertEqual(names.length, 6, 'requested count is honored when enough distinct names are reachable: ' + names.length);
  assertEqual(new Set(names.map((n) => n.toLowerCase())).size, names.length, 'no duplicate names within one batch');
}
{
  const { names, modeUsed } = Generator.generateNames({ seedWords: ['One', 'Two'], mode: 'auto', count: 4 });
  assertEqual(modeUsed, 'pattern', 'auto mode falls back to pattern with fewer than 3 seed words');
  assertEqual(names.length, 4, 'pattern fallback still produces the requested count');
}
{
  const { names } = Generator.generateNames({ seedWords, mode: 'markov', count: 5, exclude: seedWords });
  const seedLower = new Set(seedWords.map((w) => w.toLowerCase()));
  assert(names.every((n) => !seedLower.has(n.toLowerCase())), 'exclude list is honored — no generated name exactly matches a seed word');
}

section('wordtools.js migration — generateName/generateNames behave identically after moving to generator.js');
const wtName = WordTools.generateName();
assert(typeof wtName === 'string' && wtName.length > 0, 'WordTools.generateName() still returns a name: ' + wtName);
assert(Generator.CLASSIC_FANTASY_POOL.starts.some((s) => wtName.startsWith(s)), 'WordTools.generateName() still draws from the same classic pool');
const wtBatch = WordTools.generateNames(6);
assertEqual(wtBatch.length, 6, 'WordTools.generateNames(6) still returns 6 names');
assertEqual(new Set(wtBatch.map((n) => n.toLowerCase())).size, wtBatch.length, 'WordTools.generateNames() still de-duplicates within a batch');

section('store.js — generateEntityNames, classic mode (default, zero behavior change)');
const project = Store.getActiveProject();
{
  const { names, modeUsed, fellBack } = Store.generateEntityNames({ mode: 'classic', count: 5 });
  assertEqual(modeUsed, 'classic', 'classic mode reports classic');
  assertEqual(fellBack, false, 'classic mode never reports a fallback (there is nothing to fall back from)');
  assertEqual(names.length, 5, 'classic mode honors the requested count');
}

section('store.js — generateEntityNames, learn mode with insufficient seed data falls back');
{
  const { modeUsed, fellBack, names } = Store.generateEntityNames({ mode: 'learn', type: 'character', count: 5 });
  assertEqual(modeUsed, 'classic', 'learn mode with 0 character entities falls back to classic');
  assertEqual(fellBack, true, 'fellBack is reported true so the UI can explain the fallback');
  assertEqual(names.length, 5, 'fallback batch still honors the requested count');
}

section('store.js — generateEntityNames, learn mode with enough seed data actually learns');
{
  ['Zhydryx', 'Kaelthir', 'Vorenth', 'Zaltheris'].forEach((n) => Store.createEntity({ name: n, type: 'character' }));
  const { modeUsed, fellBack, names } = Store.generateEntityNames({ mode: 'learn', type: 'character', count: 5 });
  assertEqual(modeUsed, 'markov', 'learn mode with 4 seed character names actually uses markov');
  assertEqual(fellBack, false, 'no fallback once there is enough seed data');
  const existingLower = new Set(['zhydryx', 'kaelthir', 'vorenth', 'zaltheris']);
  assert(names.every((n) => !existingLower.has(n.toLowerCase())), 'generated batch excludes exact matches of existing character names');
}

section('store.js — generateEntityNames, type filter narrows the seed set');
{
  Store.createEntity({ name: 'Somewhere Distinct Placename', type: 'location' });
  // Only 1 location exists — below the 3-seed threshold — so filtering to
  // 'location' should fall back even though 'character' alone has enough.
  const { modeUsed, fellBack } = Store.generateEntityNames({ mode: 'learn', type: 'location', count: 3 });
  assertEqual(modeUsed, 'classic', 'type filter genuinely narrows the seed pool, not just labels it — 1 location is still below threshold');
  assertEqual(fellBack, true, 'fellBack correctly reflects the narrowed (not the whole-project) seed count');
}

section('store.js — generateEntityNames, pattern mode');
{
  const { names, modeUsed } = Store.generateEntityNames({ mode: 'pattern', pattern: 'CVCV', count: 4 });
  assertEqual(modeUsed, 'pattern', 'pattern mode reports pattern');
  assert(names.every((n) => n.length === 4), 'every generated name matches the 4-character CVCV pattern length');
}

section('Migration — this pass added no new schema, so an existing project loads unaffected');
{
  const legacyDb = JSON.parse(Store.exportFullBackup());
  Store.importFullBackup(JSON.stringify(legacyDb));
  assert(Store.getActiveProject().entities && Object.keys(Store.getActiveProject().entities).length > 0, 'project with existing entities (created above) survives a full export/import round trip');
  const { names } = Store.generateEntityNames({ mode: 'classic', count: 3 });
  assertEqual(names.length, 3, 'generateEntityNames still works immediately after a round-tripped import');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
