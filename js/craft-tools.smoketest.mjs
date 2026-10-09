// Tinta — craft-tools pass (Tier 1 + Tier 2) smoke test.
//
// Same convention as calendar.smoketest.mjs, series.smoketest.mjs,
// map.smoketest.mjs and references.smoketest.mjs: a minimal in-memory
// localStorage shim, imported against the real store.js, asserting on
// observable behavior. Run with: node craft-tools.smoketest.mjs
//
// Covers: character arc fields, relationship metadata, pronunciation
// dictionary, custom grammar dictionary, sketch↔entity linking, snippet
// promotion, scene relationships, story questions, project health/orphan
// detection, and craft analytics (POV distribution, dialogue ratio,
// changes-since report). Store-layer only — see each feature's UI in
// app.js for the (manually smoke-tested, not automated) DOM wiring.

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

section('Setup — fresh-project collections');
const project = Store.getActiveProject();
assert(project.sceneRelationships && typeof project.sceneRelationships === 'object', 'sceneRelationships collection exists');
assert(project.storyQuestions && typeof project.storyQuestions === 'object', 'storyQuestions collection exists');
assert(project.pronunciations && typeof project.pronunciations === 'object', 'pronunciations collection exists');
assert(Array.isArray(project.customDictionary), 'customDictionary is an array');

section('Character arc fields (want/need/wound/flaw)');
const charType = Store.getEntityType('character');
const keys = charType.fields.map((f) => f.key);
assert(['want', 'need', 'wound', 'flaw'].every((k) => keys.includes(k)), 'character builtin has all four arc fields: ' + keys.join(','));
const hero = Store.createEntity({ name: 'Elena', type: 'character' });
Store.updateEntity(hero.id, { customFields: { ...hero.customFields, want: 'to be free' } });
assertEqual(Store.getEntity(hero.id).customFields.want, 'to be free', 'arc field (want) saves via the generic customFields mechanism');

section('Relationship metadata');
const villain = Store.createEntity({ name: 'Kael', type: 'character' });
const rel = Store.createRelationship({ fromId: hero.id, toId: villain.id, label: 'Rival' });
assert(['status', 'strength', 'startDate', 'endDate', 'notes'].every((k) => k in rel), 'relationship has all metadata fields');
Store.updateRelationship(rel.id, { status: 'active', strength: 'strong' });
assertEqual(Store.getRelationship(rel.id).status, 'active', 'relationship metadata updates');

section('Pronunciation dictionary');
Store.setPronunciation('Zhydryx', 'ZY-driks');
assert(Store.getPronunciationList().some((p) => p.word === 'Zhydryx' && p.phonetic === 'ZY-driks'), 'pronunciation entry saved');
assertEqual(Store.applyPronunciations('Zhydryx walked in.'), 'ZY-driks walked in.', 'applyPronunciations substitutes correctly');
Store.deletePronunciation('Zhydryx');
assertEqual(Store.getPronunciationList().length, 0, 'pronunciation deleted');

section('Custom grammar dictionary');
Store.addToCustomDictionary('Archesmedeus');
assert(Store.isDictionaryIgnored('archesmedeus'), 'custom dictionary ignores case-insensitively');
assert(!Store.isDictionaryIgnored('randomword'), 'custom dictionary does not over-match');
Store.removeFromCustomDictionary('archesmedeus');
assertEqual(Store.getCustomDictionary().length, 0, 'custom dictionary entry removed');

section('Sketch ↔ entity linking');
const sketch = Store.createSketch({ title: 'City Map' });
Store.linkSketchToEntity(sketch.id, hero.id);
assert(Store.getSketch(sketch.id).linkedEntityIds.includes(hero.id), 'sketch linked to entity');
assert(Store.getSketchesForEntity(hero.id).some((s) => s.id === sketch.id), 'getSketchesForEntity finds it');
Store.unlinkSketchFromEntity(sketch.id, hero.id);
assert(!Store.getSketch(sketch.id).linkedEntityIds.includes(hero.id), 'sketch unlinked');

section('Snippet promotion');
const snip1 = Store.createSnippet('A mysterious ring glows near the ruins.');
const promotedEntity = Store.promoteSnippetToEntity(snip1.id, 'item');
assert(promotedEntity.type === 'item' && promotedEntity.description.includes('mysterious ring'), 'snippet promoted to entity');
assertEqual(Store.getSnippetList().length, 0, 'snippet removed after promotion');

const chapter = project.chapters[0];
const snip2 = Store.createSnippet('White discovers the truth about his father.');
const promotedScene = Store.promoteSnippetToScene(snip2.id, chapter.id);
assert(promotedScene.notes.includes('discovers the truth'), 'snippet promoted to scene notes');
assert(Store.getChapter(chapter.id).scenes.some((s) => s.id === promotedScene.id), 'promoted scene actually attached to its chapter');

const snip3 = Store.createSnippet('The kingdom fell in the third year of the war.');
const promotedEvent = Store.promoteSnippetToTimelineEvent(snip3.id);
assert(promotedEvent.description.includes('kingdom fell'), 'snippet promoted to timeline event');

section('Scene relationships');
const sceneA = Store.createScene(chapter.id, { title: 'Scene A' });
const sceneB = Store.createScene(chapter.id, { title: 'Scene B' });
const screl = Store.createSceneRelationship({ fromSceneId: sceneA.id, toSceneId: sceneB.id, type: 'foreshadows' });
assertEqual(Store.getSceneRelationshipsForScene(sceneA.id).length, 1, 'scene relationship created and queryable');
assertEqual(Store.getSceneRelationshipTypeLabel('foreshadows'), 'Foreshadows', 'scene relationship type label lookup');
Store.deleteSceneRelationship(screl.id);
assertEqual(Store.getSceneRelationshipsForScene(sceneA.id).length, 0, 'scene relationship deleted');

section('Scene relationships are cleaned up (not left dangling) on scene/chapter deletion');
const sceneC = Store.createScene(chapter.id, { title: 'Scene C' });
Store.createSceneRelationship({ fromSceneId: sceneB.id, toSceneId: sceneC.id, type: 'precedes' });
assertEqual(Store.getSceneRelationshipsForScene(sceneC.id).length, 1, 'relationship exists before deletion');
Store.deleteScene(chapter.id, sceneC.id);
assertEqual(Store.getSceneRelationshipsForScene(sceneB.id).length, 0, 'relationship removed once one of its two scenes is deleted, not left half-dangling');

section('Story questions');
const sq = Store.createStoryQuestion({ question: 'Who killed the king?', introducedSceneId: sceneA.id });
assertEqual(Store.getStoryQuestionList().length, 1, 'story question created');
Store.updateStoryQuestion(sq.id, { resolved: true, payoffSceneId: sceneB.id });
assertEqual(Store.getStoryQuestion(sq.id).resolved, true, 'story question resolved');
Store.deleteStoryQuestion(sq.id);
assertEqual(Store.getStoryQuestionList().length, 0, 'story question deleted');

section('Project health / orphan detection');
Store.createEntity({ name: 'Ghost Character', type: 'character' }); // never mentioned, no relationships, no children
Store.updateChapterContent(chapter.id, (Store.getChapter(chapter.id).content || '') + ' [[Someone Who Does Not Exist]] ');
const health = Store.getProjectHealthReport();
assert(health.orphanedEntities.some((e) => e.name === 'Ghost Character'), 'orphan detection finds an unreferenced entity');
assert(health.danglingMentions.some((m) => m.name === 'Someone Who Does Not Exist'), 'dangling-mention detection finds a broken [[mention]]');
assert(health.totalIssues >= 2, 'totalIssues aggregates correctly: ' + health.totalIssues);

section('Craft analytics');
Store.updateScene(chapter.id, sceneA.id, { pov: 'Elena' });
Store.updateScene(chapter.id, sceneB.id, { pov: 'Kael' });
const povDist = Store.getPovDistribution();
assert(povDist.some((p) => p.pov === 'Elena') && povDist.some((p) => p.pov === 'Kael'), 'POV distribution computed: ' + JSON.stringify(povDist));

Store.updateChapterContent(chapter.id, 'She said, "I will never surrender." He walked away in silence, saying nothing more.');
const dlg = Store.getDialogueRatio();
assert(dlg.totalWords > 0 && dlg.dialogueWords > 0, 'dialogue ratio computed: ' + JSON.stringify(dlg));

const wc = Store.getChapterWordCounts();
assertEqual(wc.length, project.chapters.length, 'chapter word counts computed for every chapter');

section('"What changed" report');
const past = new Date(Date.now() - 100000).toISOString();
const changes = Store.getChangesSince(past);
assert(changes.chaptersChanged.length >= 1, 'changes-since detects touched chapters');
assert(changes.entitiesAdded.length >= 1, 'changes-since detects newly added entities');

section('Migration — importing a pre-craft-tools backup backfills every new field, no data loss');
{
  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  const legacyProject = legacyDb.projects[legacyProjectId];
  delete legacyProject.sceneRelationships;
  delete legacyProject.storyQuestions;
  delete legacyProject.pronunciations;
  delete legacyProject.customDictionary;
  const legacyCharType = legacyProject.entityTypes.find((t) => t.key === 'character');
  legacyCharType.fields = [];
  Object.values(legacyProject.relationships).forEach((r) => {
    delete r.status; delete r.strength; delete r.startDate; delete r.endDate; delete r.notes;
  });
  legacyProject.chapters.forEach((c) => c.scenes.forEach((s) => { delete s.notes; }));
  Object.values(legacyProject.sketches).forEach((s) => { delete s.linkedEntityIds; });
  const survivingEntityId = Object.keys(legacyProject.entities)[0];

  Store.importFullBackup(JSON.stringify(legacyDb));
  const healedProject = Store.getActiveProject();

  const healedCharType = healedProject.entityTypes.find((t) => t.key === 'character');
  assert(healedCharType.fields.some((f) => f.key === 'want'), 'arc fields re-added to character builtin on healing');
  assert(healedProject.sceneRelationships && typeof healedProject.sceneRelationships === 'object', 'sceneRelationships healed');
  assert(healedProject.storyQuestions && typeof healedProject.storyQuestions === 'object', 'storyQuestions healed');
  assert(healedProject.pronunciations && typeof healedProject.pronunciations === 'object', 'pronunciations healed');
  assert(Array.isArray(healedProject.customDictionary), 'customDictionary healed');
  const healedRel = Object.values(healedProject.relationships)[0];
  assert(typeof healedRel.status === 'string' && typeof healedRel.notes === 'string', 'relationship metadata healed');
  const healedScene = healedProject.chapters.flatMap((c) => c.scenes).find((s) => typeof s.notes !== 'undefined');
  assert(!!healedScene, 'scene.notes healed on at least one scene');
  const healedSketch = Object.values(healedProject.sketches)[0];
  assert(Array.isArray(healedSketch.linkedEntityIds), 'sketch.linkedEntityIds healed');
  assert(!!healedProject.entities[survivingEntityId], 'no data loss — a pre-existing entity survived the round trip');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
