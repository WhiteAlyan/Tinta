// Tinta — Per-scene foreshadow/payoff surfacing smoketest.
//
// StoryQuestion has always had introducedSceneId/payoffSceneId, but
// nothing surfaced them at the scene level until this pass — this file
// covers the two store-side additions that back the Scene Inspector's
// new "Story questions" section: getStoryQuestionsForScene (a scoped
// read) and setStoryQuestionScene (link/unlink). No DOM, no UI.
// Run with: node scene-story-questions.smoketest.mjs

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

// ── 1. getStoryQuestionsForScene — empty case ───────────────────────────
section('getStoryQuestionsForScene — a scene with no linked questions returns empty arrays');
globalThis.localStorage.clear();
{
  Store.createProject('Empty Case');
  const ch = Store.getActiveProject().chapters[0];
  const scene = Store.createScene(ch.id, { title: 'Scene A' });
  Store.createStoryQuestion({ question: 'Unrelated question' }); // no scene link at all

  const result = Store.getStoryQuestionsForScene(scene.id);
  assertEqual(result.introduced.length, 0, 'introduced is empty for a scene nothing points at');
  assertEqual(result.payoffs.length, 0, 'payoffs is empty for a scene nothing points at');
}

// ── 2. getStoryQuestionsForScene — filters correctly, both directions ──
section('getStoryQuestionsForScene — correctly splits introduced vs payoff, ignores other scenes');
globalThis.localStorage.clear();
{
  Store.createProject('Split Case');
  const ch = Store.getActiveProject().chapters[0];
  const sceneA = Store.createScene(ch.id, { title: 'Scene A' });
  const sceneB = Store.createScene(ch.id, { title: 'Scene B' });

  const q1 = Store.createStoryQuestion({ question: 'Who sent the letter?', introducedSceneId: sceneA.id });
  const q2 = Store.createStoryQuestion({ question: 'Why did Mira leave?', introducedSceneId: sceneA.id, payoffSceneId: sceneB.id });
  const q3 = Store.createStoryQuestion({ question: 'Unrelated to A or B' }); // no links

  const forA = Store.getStoryQuestionsForScene(sceneA.id);
  assertEqual(forA.introduced.length, 2, 'both questions introduced in Scene A show up');
  assert(forA.introduced.some((q) => q.id === q1.id), 'q1 is in Scene A\'s introduced list');
  assert(forA.introduced.some((q) => q.id === q2.id), 'q2 is in Scene A\'s introduced list');
  assertEqual(forA.payoffs.length, 0, 'nothing pays off in Scene A');
  assert(!forA.introduced.some((q) => q.id === q3.id), 'the unrelated question does not appear');

  const forB = Store.getStoryQuestionsForScene(sceneB.id);
  assertEqual(forB.introduced.length, 0, 'nothing is introduced in Scene B');
  assertEqual(forB.payoffs.length, 1, 'q2 pays off in Scene B');
  assertEqual(forB.payoffs[0].id, q2.id, 'the payoff entry is q2 specifically');
}

// ── 3. setStoryQuestionScene — links and unlinks each role independently ─
section('setStoryQuestionScene — links a question to a scene by role, and unlinks with null');
globalThis.localStorage.clear();
{
  Store.createProject('Link/Unlink');
  const ch = Store.getActiveProject().chapters[0];
  const sceneA = Store.createScene(ch.id, { title: 'Scene A' });
  const sceneB = Store.createScene(ch.id, { title: 'Scene B' });
  const q1 = Store.createStoryQuestion({ question: 'A mystery' });

  assertEqual(Store.getStoryQuestion(q1.id).introducedSceneId, null, 'starts unlinked');

  Store.setStoryQuestionScene(q1.id, 'introducedSceneId', sceneA.id);
  assertEqual(Store.getStoryQuestion(q1.id).introducedSceneId, sceneA.id, 'linking sets introducedSceneId');
  assertEqual(Store.getStoryQuestionsForScene(sceneA.id).introduced.length, 1, 'the link shows up via getStoryQuestionsForScene too');

  Store.setStoryQuestionScene(q1.id, 'payoffSceneId', sceneB.id);
  assertEqual(Store.getStoryQuestion(q1.id).payoffSceneId, sceneB.id, 'linking the payoff role is independent of the introduced role');
  assertEqual(Store.getStoryQuestion(q1.id).introducedSceneId, sceneA.id, 'linking payoff does not clear the existing introduced link');

  // Re-linking the same role moves it rather than adding a second link
  // (the schema is single-valued, not an array) — relinking to a scene
  // that already had it is a no-op in effect, so link to a third scene
  // to prove it moves.
  const sceneC = Store.createScene(ch.id, { title: 'Scene C' });
  Store.setStoryQuestionScene(q1.id, 'introducedSceneId', sceneC.id);
  assertEqual(Store.getStoryQuestion(q1.id).introducedSceneId, sceneC.id, 'relinking introducedSceneId moves it to the new scene');
  assertEqual(Store.getStoryQuestionsForScene(sceneA.id).introduced.length, 0, 'Scene A no longer sees it as introduced there');
  assertEqual(Store.getStoryQuestionsForScene(sceneC.id).introduced.length, 1, 'Scene C now sees it');

  // Unlink
  Store.setStoryQuestionScene(q1.id, 'payoffSceneId', null);
  assertEqual(Store.getStoryQuestion(q1.id).payoffSceneId, null, 'unlinking clears the field back to null');
  assertEqual(Store.getStoryQuestionsForScene(sceneB.id).payoffs.length, 0, 'Scene B no longer sees a payoff after unlinking');
}

// ── 4. setStoryQuestionScene — guards against an invalid role ──────────
section('setStoryQuestionScene — an unrecognized role is a safe no-op, doesn\'t touch the record');
globalThis.localStorage.clear();
{
  Store.createProject('Invalid Role');
  const ch = Store.getActiveProject().chapters[0];
  const scene = Store.createScene(ch.id, { title: 'Scene A' });
  const q1 = Store.createStoryQuestion({ question: 'A mystery' });

  Store.setStoryQuestionScene(q1.id, 'someOtherField', scene.id);
  const after = Store.getStoryQuestion(q1.id);
  assertEqual(after.introducedSceneId, null, 'introducedSceneId untouched by an invalid role');
  assertEqual(after.payoffSceneId, null, 'payoffSceneId untouched by an invalid role');
  assert(after.someOtherField === undefined, 'no stray field was added to the record');
}

// ── 5. getStoryQuestionsForScene — a nonexistent scene id is a safe empty ─
section('getStoryQuestionsForScene — a scene id matching nothing returns empty, not throws');
globalThis.localStorage.clear();
{
  Store.createProject('Nonexistent Scene');
  Store.createStoryQuestion({ question: 'Something' });
  const result = Store.getStoryQuestionsForScene('does-not-exist');
  assertEqual(result.introduced.length, 0, 'introduced is empty for a nonexistent scene id');
  assertEqual(result.payoffs.length, 0, 'payoffs is empty for a nonexistent scene id');
}

// ── 6. Migration — untouched by this pass (sanity check) ────────────────
section('Migration — this pass added no new schema, so an existing project loads unaffected');
globalThis.localStorage.clear();
{
  Store.createProject('Migration Sanity');
  const ch = Store.getActiveProject().chapters[0];
  const scene = Store.createScene(ch.id, { title: 'Scene A' });
  Store.createStoryQuestion({ question: 'Existing question', introducedSceneId: scene.id });

  const legacyDb = JSON.parse(Store.exportFullBackup());
  Store.importFullBackup(JSON.stringify(legacyDb));

  const healed = Store.getActiveProject();
  const healedScene = healed.chapters[0].scenes.find((s) => s.title === 'Scene A');
  const result = Store.getStoryQuestionsForScene(healedScene.id);
  assertEqual(result.introduced.length, 1, 'the existing introduced link survives an export/import round trip unchanged');
}

// ── summary ────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}
