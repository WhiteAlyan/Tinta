// Tinta — snippet categories + promotion paths smoke test.
//
// Same convention as craft-tools.smoketest.mjs and every other
// smoketest.mjs in this folder: a minimal in-memory localStorage shim,
// imported against the real store.js, asserting on observable behavior.
// Run with: node snippet-promotion.smoketest.mjs
//
// Covers: SNIPPET_CATEGORIES validation on create/update, migration
// backfill for pre-existing snippets, and all five promotion paths
// (Entity/Scene/Timeline Event — pre-existing, re-verified here since
// this pass is what first wires them into anything — and
// Decision/Annotation, new this pass), including the "snippet is deleted
// after a successful promotion, survives a failed one" contract each
// promoteSnippetTo* function shares.

// ── localStorage shim ───────────────────────────────────────────────────
class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Store = await import('./store.js');

// ── tiny test harness ───────────────────────────────────────────────────
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
const project = Store.getActiveProject();
const chapterId = project.chapters[0].id;

section('SNIPPET_CATEGORIES — shape');
assert(Array.isArray(Store.SNIPPET_CATEGORIES) && Store.SNIPPET_CATEGORIES.length === 4, 'four fixed categories');
assert(Store.SNIPPET_CATEGORIES.every((c) => c.key && c.label), 'every category has a key and label');

section('createSnippet — category validation');
const idea = Store.createSnippet('A city built entirely on the backs of sleeping giants.', 'idea');
assertEqual(idea.category, 'idea', 'valid category accepted');
const uncategorized = Store.createSnippet('Some loose line with no category given');
assertEqual(uncategorized.category, '', 'omitted category defaults to uncategorized');
const bogus = Store.createSnippet('Line with a made-up category', 'not-a-real-category');
assertEqual(bogus.category, '', 'invalid category silently falls back to uncategorized, not stored as garbage');
assertEqual(Store.createSnippet('   '), null, 'blank text still rejected, same as before this pass');

section('updateSnippetCategory');
Store.updateSnippetCategory(uncategorized.id, 'research');
assertEqual(Store.getSnippetList().find((s) => s.id === uncategorized.id).category, 'research', 'recategorize to a valid category');
Store.updateSnippetCategory(uncategorized.id, 'nonsense');
assertEqual(Store.getSnippetList().find((s) => s.id === uncategorized.id).category, '', 'recategorize with an invalid value resets to uncategorized rather than storing it');
Store.updateSnippetCategory('snip_does_not_exist', 'idea');
assert(true, 'updateSnippetCategory on a missing id does not throw');

section('Migration backfill — pre-existing snippet with no category field');
{
  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  const legacyProject = legacyDb.projects[legacyProjectId];
  const legacyId = 'snip_legacy_001';
  legacyProject.snippets[legacyId] = { id: legacyId, text: 'Written before this pass existed', createdAt: new Date().toISOString() };
  Store.importFullBackup(JSON.stringify(legacyDb));
  const healed = Store.getSnippetList().find((s) => s.id === legacyId);
  assert(!!healed, 'legacy snippet survives migration');
  assertEqual(healed.category, '', 'legacy snippet backfilled to uncategorized, not left undefined');
}

section('promoteSnippetToEntity (pre-existing, re-verified — first pass to wire it into any UI)');
{
  const s = Store.createSnippet('Kestrel Vane, a smuggler with a debt to the wrong people.', 'idea');
  const entity = Store.promoteSnippetToEntity(s.id, 'character');
  assert(!!entity, 'entity created');
  assertEqual(entity.name, 'Kestrel Vane, a smuggler with a debt to the wrong people.'.slice(0, 60), 'entity name derived from first line, truncated to 60 chars');
  assertEqual(entity.description, s.text, 'full snippet text preserved as description');
  assert(!Store.getSnippetList().some((x) => x.id === s.id), 'snippet deleted after successful promotion');
}

section('promoteSnippetToScene (pre-existing, re-verified)');
{
  const s = Store.createSnippet('They meet again in the ruined chapel, years later.');
  const scene = Store.promoteSnippetToScene(s.id, chapterId);
  assert(!!scene, 'scene created');
  assert(!Store.getSnippetList().some((x) => x.id === s.id), 'snippet deleted after successful promotion to scene');
}
{
  const s = Store.createSnippet('Orphaned scene idea with no chapter given');
  const scene = Store.promoteSnippetToScene(s.id, 'chap_does_not_exist');
  assertEqual(scene, null, 'promotion to a nonexistent chapter fails');
  assert(Store.getSnippetList().some((x) => x.id === s.id), 'snippet survives a failed promotion, not silently lost');
}

section('promoteSnippetToTimelineEvent (pre-existing, re-verified)');
{
  const s = Store.createSnippet('The eclipse that starts the war.');
  const event = Store.promoteSnippetToTimelineEvent(s.id);
  assert(!!event, 'timeline event created');
  assert(!Store.getSnippetList().some((x) => x.id === s.id), 'snippet deleted after promotion to timeline event');
}

section('promoteSnippetToDecision (new this pass)');
{
  const s = Store.createSnippet('Killing off the mentor in Act 2, not Act 3.\nConsidered: keeping him alive as a red herring, but it dilutes the stakes.');
  const decision = Store.promoteSnippetToDecision(s.id);
  assert(!!decision, 'decision created');
  assertEqual(decision.decision, 'Killing off the mentor in Act 2, not Act 3.', 'first line becomes the decision field');
  assertEqual(decision.reason, 'Considered: keeping him alive as a red herring, but it dilutes the stakes.', 'remaining lines become the reason field');
  assert(!Store.getSnippetList().some((x) => x.id === s.id), 'snippet deleted after promotion to decision');
  assert(Store.getDecisionList().some((d) => d.id === decision.id), 'decision actually shows up in the decision log');
}
{
  const single = Store.createSnippet('One-line decision, nothing else.');
  const decision = Store.promoteSnippetToDecision(single.id);
  assertEqual(decision.decision, 'One-line decision, nothing else.', 'single-line snippet still works — whole text as decision');
  assertEqual(decision.reason, '', 'no second line means an empty reason, not undefined/garbage');
}

section('promoteSnippetToAnnotation (new this pass)');
{
  const s = Store.createSnippet('Double check this character\'s eye color matches ch.3.', 'todo');
  const annotation = Store.promoteSnippetToAnnotation(s.id, chapterId, 'continuity');
  assert(!!annotation, 'annotation created');
  assertEqual(annotation.chapterId, chapterId, 'annotation anchored to the given chapter');
  assertEqual(annotation.type, 'continuity', 'annotation type passed through');
  assertEqual(annotation.note, s.text, 'full snippet text preserved as the annotation note');
  assert(!Store.getSnippetList().some((x) => x.id === s.id), 'snippet deleted after promotion to annotation');
}
{
  const s = Store.createSnippet('No chapter given for this one.');
  const annotation = Store.promoteSnippetToAnnotation(s.id, null);
  assertEqual(annotation, null, 'promotion without a chapterId fails, same contract as promoteSnippetToScene');
  assert(Store.getSnippetList().some((x) => x.id === s.id), 'snippet survives a failed promotion to annotation');
}
{
  const s = Store.createSnippet('Bogus type given.');
  const annotation = Store.promoteSnippetToAnnotation(s.id, chapterId, 'not-a-real-type');
  assertEqual(annotation.type, 'todo', 'invalid annotation type falls back to the default, same as createAnnotation itself does');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
