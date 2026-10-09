// Tinta — Session 24 batch smoke test.
//
// Same convention as calendar.smoketest.mjs, quickwins.smoketest.mjs,
// craft-tools.smoketest.mjs: a minimal in-memory localStorage shim,
// imported against the real store.js (plus search.js directly for its
// no-Store parts), asserting on observable behavior. Run with:
//   node session24.smoketest.mjs
//
// Covers the 8-item batch TINTA-MASTER-TRUTH.md's §1 "Session 24 batch"
// entry currently only claims via direct source check, not an automated
// suite:
//   1. Scene model — the 9 new fields (obstacle/infoRevealed/
//      secretsIntroduced/characterChanges/themeMotif/symbolism/intensity/
//      revisionStatus/narrativePurpose)
//   2. Auto-checkpoint (updateChapterContent) + pre-destructive-action
//      backups (deleteEntity/deleteRuleSystem) + restore
//   3. markGenerationEdited
//   4. setCanonStatus / getCanonStatuses
//   5. Extended search coverage (references/annotations/ruleSystems/maps)
//   6. Lore-health checks (unused rule systems, duplicate references,
//      dead links)
//   7. Author decision log CRUD
//   8. Book-mode reader progress (updateChapterReadPosition)
// Plus a migration test for the batch's new fields together.
//
// Store-layer (+ search.js) only — the drawer.js/app.js UI (Scene
// Inspector fields, Organize modal's Recently Deleted tab, canon-status
// dropdowns, decisions view, Book mode's pagination call site) has no
// automated coverage here, same standing gap every other pass has left
// for its own UI.

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
const { searchProject, countTotalMatches } = await import('./search.js');

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

const chapA = Store.createChapter('Chapter One');
const chapB = Store.createChapter('Chapter Two');

// ── 1. Scene model — 9 new fields ────────────────────────────────────────
section('SCENE_INTENSITY_LEVELS / SCENE_REVISION_STATUSES vocab');
assertEqual(Store.SCENE_INTENSITY_LEVELS.length, 4, 'exactly 4 intensity levels');
assert(Store.SCENE_INTENSITY_LEVELS.includes('peak'), 'intensity levels include "peak"');
assertEqual(Store.SCENE_REVISION_STATUSES.length, 4, 'exactly 4 revision statuses');
assert(Store.SCENE_REVISION_STATUSES.includes('polished'), 'revision statuses include "polished"');

section('createScene — new fields default to empty string, not undefined');
const sceneA1 = Store.createScene(chapA.id, { title: 'Opening scene' });
['obstacle', 'infoRevealed', 'secretsIntroduced', 'characterChanges', 'themeMotif', 'symbolism', 'intensity', 'revisionStatus', 'narrativePurpose'].forEach((field) => {
  assertEqual(sceneA1[field], '', `createScene defaults ${field} to ''`);
});

section('createScene — new fields settable at creation time');
const sceneA2 = Store.createScene(chapA.id, {
  title: 'Reveal scene',
  obstacle: 'The door is locked',
  infoRevealed: 'The letter was a forgery',
  secretsIntroduced: 'Mira knew all along',
  characterChanges: 'Kade stops trusting Mira',
  themeMotif: 'Trust',
  symbolism: 'The broken key',
  intensity: 'high',
  revisionStatus: 'drafted',
  narrativePurpose: 'Turns the midpoint',
});
assertEqual(sceneA2.obstacle, 'The door is locked', 'obstacle carries through createScene');
assertEqual(sceneA2.intensity, 'high', 'intensity carries through createScene');
assertEqual(sceneA2.revisionStatus, 'drafted', 'revisionStatus carries through createScene');
assertEqual(sceneA2.narrativePurpose, 'Turns the midpoint', 'narrativePurpose carries through createScene');

section('updateScene — new fields editable after creation');
Store.updateScene(chapA.id, sceneA1.id, { symbolism: 'A cracked mirror', intensity: 'peak', revisionStatus: 'polished' });
const reloaded = Store.getChapter(chapA.id).scenes.find((s) => s.id === sceneA1.id);
assertEqual(reloaded.symbolism, 'A cracked mirror', 'updateScene sets symbolism');
assertEqual(reloaded.intensity, 'peak', 'updateScene sets intensity');
assertEqual(reloaded.revisionStatus, 'polished', 'updateScene sets revisionStatus');
// store.js doesn't validate intensity/revisionStatus against the vocab in
// updateScene itself (same as goal/conflict/outcome having no validation)
// — the UI <select> is what constrains the value, not the setter. Worth
// knowing rather than assuming, so this is asserted rather than skipped.
Store.updateScene(chapA.id, sceneA1.id, { intensity: 'not-a-real-level' });
assertEqual(Store.getChapter(chapA.id).scenes.find((s) => s.id === sceneA1.id).intensity, 'not-a-real-level', 'updateScene stores intensity as given — no store-layer enum validation, by design (see comment above)');
Store.updateScene(chapA.id, sceneA1.id, { intensity: 'peak' }); // restore for later assertions

// ── 2a. Auto-checkpoint ──────────────────────────────────────────────────
section('Auto-checkpoint — does not fire on the very first content write');
Store.updateChapterContent(chapA.id, 'First words.');
assertEqual(Store.getSnapshots(chapA.id).length, 0, 'no snapshot yet — nothing existed before this write to protect');

section('Auto-checkpoint — does not fire again immediately after (interval not elapsed)');
Store.updateChapterContent(chapA.id, 'A few more words.');
assertEqual(Store.getSnapshots(chapA.id).length, 0, 'still no auto-checkpoint — 20 minutes have not passed');

section('Auto-checkpoint — fires once the interval has elapsed');
{
  const chapter = Store.getChapter(chapA.id);
  chapter.lastAutoCheckpointAt = new Date(Date.now() - 25 * 60 * 1000).toISOString(); // simulate 25 minutes ago
  const contentBeforeThisWrite = chapter.content;
  Store.updateChapterContent(chapA.id, 'Yet more words, after the interval.');
  const snaps = Store.getSnapshots(chapA.id);
  assertEqual(snaps.length, 1, 'exactly one auto-checkpoint snapshot created');
  assertEqual(snaps[0].label, 'Auto-checkpoint', 'the snapshot is labeled "Auto-checkpoint"');
  assertEqual(snaps[0].content, contentBeforeThisWrite, 'the snapshot captures content from BEFORE the new write overwrote it');
  assert(new Date(Store.getChapter(chapA.id).lastAutoCheckpointAt).getTime() > Date.now() - 5000, 'lastAutoCheckpointAt was reset to just now after firing');
}

section('Auto-checkpoint — does not fire twice in a row right after firing');
Store.updateChapterContent(chapA.id, 'One more edit, right after the checkpoint fired.');
assertEqual(Store.getSnapshots(chapA.id).length, 1, 'still just the one auto-checkpoint — the timer was reset when it fired');

// ── 2b. Pre-destructive-action backups + restore ─────────────────────────
section('backupBeforeDelete — deleteEntity backs up the record before removing it');
const villain = Store.createEntity({ name: 'Kessa Vane', type: 'character', description: 'A reluctant antagonist' });
assertEqual(Store.getDeletedItemBackups().length, 0, 'no backups yet');
Store.deleteEntity(villain.id);
assertEqual(Store.getEntity(villain.id), null, 'the entity really is gone');
const backupsAfterEntityDelete = Store.getDeletedItemBackups();
assertEqual(backupsAfterEntityDelete.length, 1, 'exactly one backup exists after the delete');
assertEqual(backupsAfterEntityDelete[0].kind, 'entity', 'backup is tagged kind: entity');
assertEqual(backupsAfterEntityDelete[0].label, 'Kessa Vane', 'backup carries the entity name as its label');
assertEqual(backupsAfterEntityDelete[0].data.description, 'A reluctant antagonist', 'backup carries a deep copy of the full record, not just the name');

section('backupBeforeDelete — deleteRuleSystem backs up the record before removing it');
const magicSystem = Store.createRuleSystem({ name: 'Bloodweave', source: 'Inherited', resource: 'Vitality' });
Store.deleteRuleSystem(magicSystem.id);
assertEqual(Store.getRuleSystem(magicSystem.id), null, 'the rule system really is gone');
const backupsAfterSystemDelete = Store.getDeletedItemBackups();
assertEqual(backupsAfterSystemDelete.length, 2, 'now two backups total');
const systemBackup = backupsAfterSystemDelete.find((b) => b.kind === 'ruleSystem');
assert(!!systemBackup, 'a ruleSystem-kind backup exists');
assertEqual(systemBackup.label, 'Bloodweave', 'backup carries the rule system name as its label');

section('getDeletedItemBackups — sorted most-recently-deleted first');
assertEqual(Store.getDeletedItemBackups()[0].kind, 'ruleSystem', 'the rule system (deleted second) sorts first');

section('restoreDeletedItem — entity comes back as a new record with the backed-up data');
const entityBackupId = Store.getDeletedItemBackups().find((b) => b.kind === 'entity').id;
const restoredEntityResult = Store.restoreDeletedItem(entityBackupId);
assertEqual(restoredEntityResult.kind, 'entity', 'restore reports kind: entity');
const restoredEntity = Store.getEntity(restoredEntityResult.id);
assert(!!restoredEntity, 'the restored entity is a real, live record now');
assertEqual(restoredEntity.name, 'Kessa Vane', 'restored entity has the original name');
assertEqual(restoredEntity.description, 'A reluctant antagonist', 'restored entity has the original description');
assert(restoredEntity.id !== villain.id, "restored entity gets a fresh id — it's a new record, not a resurrection of the exact old one (see store.js's own doc comment on this)");
assertEqual(Store.getDeletedItemBackups().length, 1, 'the consumed backup is removed from the buffer after restoring');

section('restoreDeletedItem — rule system comes back the same way');
const systemBackupId = Store.getDeletedItemBackups()[0].id;
const restoredSystemResult = Store.restoreDeletedItem(systemBackupId);
assertEqual(restoredSystemResult.kind, 'ruleSystem', 'restore reports kind: ruleSystem');
const restoredSystem = Store.getRuleSystem(restoredSystemResult.id);
assertEqual(restoredSystem.name, 'Bloodweave', 'restored rule system has the original name');
assertEqual(restoredSystem.resource, 'Vitality', 'restored rule system has the original resource field');
assertEqual(Store.getDeletedItemBackups().length, 0, 'buffer is empty again — both backups consumed');

section('restoreDeletedItem — an unknown backup id is a no-op, not a throw');
assertEqual(Store.restoreDeletedItem('not-a-real-backup-id'), null, 'restoring a bogus id returns null');

// ── 3. markGenerationEdited ───────────────────────────────────────────────
section('markGenerationEdited — flips a generated entity\'s edited flag');
const generatedEntity = Store.createEntity({ name: 'Generated One', type: 'character' });
Store.updateEntity(generatedEntity.id, { generation: { generatorName: 'test', generatorVersion: 1, inputs: {}, seed: null, timestamp: Store.getEntity(generatedEntity.id).updatedAt, parentGenerationId: null, edited: false } });
assertEqual(Store.getEntity(generatedEntity.id).generation.edited, false, 'starts unedited');
Store.markGenerationEdited('entity', generatedEntity.id);
assertEqual(Store.getEntity(generatedEntity.id).generation.edited, true, 'markGenerationEdited flips edited to true');

section('markGenerationEdited — idempotent once already edited (no-op, does not touch updatedAt again)');
const editedAtFirstFlip = Store.getEntity(generatedEntity.id).updatedAt;
Store.markGenerationEdited('entity', generatedEntity.id);
assertEqual(Store.getEntity(generatedEntity.id).updatedAt, editedAtFirstFlip, 'a second call is a true no-op — already-edited records are never re-written');

section('markGenerationEdited — safe no-op on a record with no generation field at all');
const plainEntity = Store.createEntity({ name: 'Hand-written', type: 'character' });
Store.markGenerationEdited('entity', plainEntity.id); // should not throw
assertEqual(Store.getEntity(plainEntity.id).generation, null, 'a plain (non-generated) entity is left alone — createEntity defaults generation to null, and markGenerationEdited is a no-op on it');

section('markGenerationEdited — safe no-op on a nonexistent id');
Store.markGenerationEdited('entity', 'not-a-real-entity-id'); // should not throw
assert(true, 'no throw on an unknown id');

section('markGenerationEdited — works the same way for rule systems');
const generatedSystem = Store.createRuleSystem({ name: 'Generated System' });
Store.updateRuleSystem(generatedSystem.id, { generation: { generatorName: 'test', generatorVersion: 1, inputs: {}, seed: null, timestamp: now_(), parentGenerationId: null, edited: false } });
Store.markGenerationEdited('ruleSystem', generatedSystem.id);
assertEqual(Store.getRuleSystem(generatedSystem.id).generation.edited, true, 'markGenerationEdited flips edited to true for a rule system too');
function now_() { return new Date().toISOString(); }

// ── 4. Canon status ────────────────────────────────────────────────────
section('getCanonStatuses');
assertEqual(Store.getCanonStatuses().length, 6, 'exactly 6 canon statuses');
['canon', 'draft', 'proposed', 'alternate', 'deprecated', 'non-canon'].forEach((s) => {
  assert(Store.getCanonStatuses().includes(s), `canon statuses include "${s}"`);
});

section('setCanonStatus — entity');
const canonEntity = Store.createEntity({ name: 'Canon Candidate', type: 'character' });
assertEqual(Store.getEntity(canonEntity.id).canonStatus, 'canon', 'a normally-created entity starts as canon by default');
Store.setCanonStatus('entity', canonEntity.id, 'proposed');
assertEqual(Store.getEntity(canonEntity.id).canonStatus, 'proposed', 'setCanonStatus updates canonStatus to a valid value');

section('setCanonStatus — invalid value is ignored, not stored');
Store.setCanonStatus('entity', canonEntity.id, 'made-up-status');
assertEqual(Store.getEntity(canonEntity.id).canonStatus, 'proposed', 'an unrecognized status value is silently rejected, prior value untouched');

section('setCanonStatus — rule system');
const canonSystem = Store.createRuleSystem({ name: 'Canon System Candidate' });
Store.setCanonStatus('ruleSystem', canonSystem.id, 'deprecated');
assertEqual(Store.getRuleSystem(canonSystem.id).canonStatus, 'deprecated', 'setCanonStatus works for kind: ruleSystem too');

// ── 5. Extended search coverage ──────────────────────────────────────────
section('searchProject — References, Annotations, Rule systems (+ nodes), Maps');
{
  const project = {
    chapters: [{ id: 'c1', title: 'Ch. 1', content: 'Nothing relevant here.', scenes: [] }],
    entities: {},
    snippets: {},
    timelineEvents: {},
    references: {
      ref1: { id: 'ref1', title: 'Interview transcript', refType: 'Note', content: 'They mentioned the lighthouse keeper by name.', url: '', source: '', annotation: '' },
      ref2: { id: 'ref2', title: 'Unrelated clipping', refType: 'Note', content: 'Nothing to do with anything.', url: '', source: '', annotation: '' },
    },
    annotations: {
      a1: { id: 'a1', note: 'Check the lighthouse keeper\'s name matches ch. 4', type: 'continuity', chapterId: 'c1', sceneId: null, createdAt: '2024-01-01' },
    },
    ruleSystems: {
      sys1: { id: 'sys1', name: 'Lighthouse Ward', source: '', resource: '', channel: '', restrictions: '', description: 'A protective ward tied to the lighthouse.' },
    },
    systemNodes: {
      n1: { id: 'n1', systemId: 'sys1', name: 'Beacon Pulse', effect: 'Reveals hidden lighthouse keepers within range.' },
    },
    maps: {
      map1: { id: 'map1', name: 'Coastal Region', markers: [{ label: 'Lighthouse', note: 'Where the keeper lives' }] },
    },
  };

  const results = searchProject(project, 'lighthouse');
  assertEqual(results.references.length, 1, 'exactly one reference matches "lighthouse" (content match)');
  assertEqual(results.references[0].id, 'ref1', 'the matching reference is ref1');
  assertEqual(results.annotations.length, 1, 'exactly one annotation matches "lighthouse"');
  assertEqual(results.annotations[0].id, 'a1', 'the matching annotation is a1');
  assertEqual(results.ruleSystems.length, 1, 'exactly one rule system matches "lighthouse" (via its own description AND its node)');
  assertEqual(results.ruleSystems[0].nodeMatches.length, 1, 'the matching rule system reports one matching node');
  assertEqual(results.ruleSystems[0].nodeMatches[0], 'Beacon Pulse', 'the node match is Beacon Pulse (matched via its effect text)');
  assertEqual(results.maps.length, 1, 'exactly one map matches "lighthouse" (via a marker label + note)');
  assertEqual(results.maps[0].markerLabels.length, 1, 'the matching map reports one matching marker');

  const total = countTotalMatches(results);
  assert(total >= 4, `countTotalMatches includes the new categories (got ${total}, expected at least 4)`);

  const noMatch = searchProject(project, 'nonexistent-term-xyz');
  assertEqual(noMatch.references.length, 0, 'a non-matching query returns zero references');
  assertEqual(noMatch.annotations.length, 0, 'a non-matching query returns zero annotations');
  assertEqual(noMatch.ruleSystems.length, 0, 'a non-matching query returns zero rule systems');
  assertEqual(noMatch.maps.length, 0, 'a non-matching query returns zero maps');
}

// ── 6. Lore-health checks ────────────────────────────────────────────────
section('getProjectHealthReport — unused rule systems');
const emptySystem = Store.createRuleSystem({ name: 'Empty System' });
const populatedSystem = Store.createRuleSystem({ name: 'Populated System' });
Store.createSystemNode({ systemId: populatedSystem.id, name: 'Some Ability' });
{
  const report = Store.getProjectHealthReport();
  const unusedNames = report.unusedRuleSystems.map((s) => s.name);
  assert(unusedNames.includes('Empty System'), 'a rule system with zero nodes is flagged as unused');
  assert(!unusedNames.includes('Populated System'), 'a rule system with at least one node is not flagged as unused');
}

section('getProjectHealthReport — duplicate references');
const dupRefA = Store.createReference({ refType: 'Note', title: 'Family tree' });
const dupRefB = Store.createReference({ refType: 'Note', title: '  Family Tree  ' }); // same title, different case/whitespace
const uniqueRef = Store.createReference({ refType: 'Note', title: 'Something else entirely' });
const untitledRefA = Store.createReference({ refType: 'Note', title: 'Untitled reference' });
const untitledRefB = Store.createReference({ refType: 'Note', title: 'Untitled reference' });
{
  const report = Store.getProjectHealthReport();
  const dupIds = report.duplicateReferences.map((r) => r.id);
  assert(dupIds.includes(dupRefA.id) && dupIds.includes(dupRefB.id), 'two references with the same title (case/whitespace-insensitive) are both flagged as duplicates');
  assert(!dupIds.includes(uniqueRef.id), 'a reference with a unique title is not flagged');
  assert(!dupIds.includes(untitledRefA.id) && !dupIds.includes(untitledRefB.id), '"Untitled reference" duplicates are excluded from the grouping entirely, by design');
}

section('getProjectHealthReport — dead links');
// deleteEntity/deleteMap both self-heal their own dangling links as part
// of their cascade (see deleteEntity's doc comment) — so exercising this
// check meaningfully means simulating a genuinely broken invariant
// directly on the project data, not going through the normal delete API
// (which would just clean the link up before the report ever saw it).
const mapForDeadLink = Store.createMap({ name: 'Dead-link Map' });
const markerWithBogusEntity = Store.addMarker(mapForDeadLink.id, { label: 'Doomed marker' });
const refWithBogusEntity = Store.createReference({ refType: 'Note', title: 'Points at a phantom entity' });
{
  const project = Store.getActiveProject();
  project.maps[mapForDeadLink.id].markers.find((m) => m.id === markerWithBogusEntity.id).entityId = 'entity-that-does-not-exist';
  project.references[refWithBogusEntity.id].entityId = 'entity-that-does-not-exist';
  Store.save();
}
{
  const report = Store.getProjectHealthReport();
  const markerDeadLink = report.deadLinks.find((d) => d.kind === 'map-marker-entity' && d.markerId === markerWithBogusEntity.id);
  assert(!!markerDeadLink, 'a map marker pointing at a nonexistent entity is flagged as a dead link');
  const refDeadLink = report.deadLinks.find((d) => d.kind === 'reference-entity' && d.refId === refWithBogusEntity.id);
  assert(!!refDeadLink, 'a reference pointing at a nonexistent entity is flagged as a dead link');
}

// ── 7. Author decision log ────────────────────────────────────────────────
section('createDecision — requires a non-empty decision, trims fields');
const noDecision = Store.createDecision({ decision: '   ', reason: 'x' });
assertEqual(noDecision, null, 'a blank decision text returns null rather than creating an empty entry');
const dec1 = Store.createDecision({ decision: '  Kill off the mentor in Act 2  ', reason: ' raises the stakes ', alternatives: 'keep him, weaken him instead' });
assertEqual(dec1.decision, 'Kill off the mentor in Act 2', 'decision text is trimmed');
assertEqual(dec1.reason, 'raises the stakes', 'reason text is trimmed');

section('getDecisionList — sorted most-recent first');
const dec2 = Store.createDecision({ decision: 'Rename the capital city' });
// Both decisions were created within the same test tick, so they may
// share an identical createdAt millisecond — a stable sort would then
// preserve insertion order (dec1 first) rather than showing anything
// about recency. Force genuinely distinct timestamps directly, the same
// way the migration tests below reach into raw project data, so this
// actually exercises the sort rather than an accidental tie.
{
  const project = Store.getActiveProject();
  project.decisionLog.find((d) => d.id === dec1.id).createdAt = '2024-01-01T00:00:00.000Z';
  project.decisionLog.find((d) => d.id === dec2.id).createdAt = '2024-06-01T00:00:00.000Z';
  Store.save();
}
const list = Store.getDecisionList();
assertEqual(list[0].id, dec2.id, 'the more recently created decision (later createdAt) sorts first');

section('updateDecision / deleteDecision');
Store.updateDecision(dec1.id, { reason: 'updated reasoning' });
assertEqual(Store.getDecision(dec1.id).reason, 'updated reasoning', 'updateDecision patches the record');
Store.deleteDecision(dec1.id);
assertEqual(Store.getDecision(dec1.id), null, 'deleteDecision removes the record');

// ── 8. Book-mode reader progress ─────────────────────────────────────────
section('updateChapterReadPosition — sets and persists lastReadSpread');
assertEqual(Store.getChapter(chapB.id).lastReadSpread, 0, 'starts at 0, same as the migration default');
Store.updateChapterReadPosition(chapB.id, 4);
assertEqual(Store.getChapter(chapB.id).lastReadSpread, 4, 'lastReadSpread updates to the given spread index');

section('updateChapterReadPosition — ignores a non-number spreadIndex');
Store.updateChapterReadPosition(chapB.id, 'not-a-number');
assertEqual(Store.getChapter(chapB.id).lastReadSpread, 4, 'an invalid spreadIndex is ignored, prior value untouched');

section('updateChapterReadPosition — safe no-op for a nonexistent chapter');
Store.updateChapterReadPosition('not-a-real-chapter-id', 2); // should not throw
assert(true, 'no throw on an unknown chapter id');

// ── Migration — pre-Session-24 backup backfills all of the above ─────────
section('Migration — importing a pre-Session-24 backup backfills every new field, no data loss');
{
  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  const legacyProject = legacyDb.projects[legacyProjectId];
  delete legacyProject.deletedItemBackups;
  delete legacyProject.decisionLog;
  legacyProject.chapters.forEach((chapter) => {
    delete chapter.lastReadSpread;
    delete chapter.lastAutoCheckpointAt;
    (chapter.scenes || []).forEach((scene) => {
      delete scene.obstacle;
      delete scene.infoRevealed;
      delete scene.secretsIntroduced;
      delete scene.characterChanges;
      delete scene.themeMotif;
      delete scene.symbolism;
      delete scene.intensity;
      delete scene.revisionStatus;
      delete scene.narrativePurpose;
    });
  });
  assert(legacyProject.deletedItemBackups === undefined, 'sanity check — deletedItemBackups really is gone in the legacy snapshot');
  assert(legacyProject.decisionLog === undefined, 'sanity check — decisionLog really is gone in the legacy snapshot');

  const survivingChapterId = chapA.id;
  const survivingSceneId = sceneA1.id;
  Store.importFullBackup(JSON.stringify(legacyDb));

  const healed = Store.getActiveProject();
  assert(Array.isArray(healed.deletedItemBackups), 'importing a backup missing `deletedItemBackups` backfills it to [] rather than throwing');
  assert(Array.isArray(healed.decisionLog), 'importing a backup missing `decisionLog` backfills it to [] rather than throwing');
  assertEqual(healed.deletedItemBackups.length, 0, 'the backfilled deletedItemBackups is empty, not populated with garbage');
  assertEqual(healed.decisionLog.length, 0, 'the backfilled decisionLog is empty, not populated with garbage');

  const healedChapter = healed.chapters.find((c) => c.id === survivingChapterId);
  assert(!!healedChapter, 'no data loss — a pre-existing chapter survived the round trip');
  assertEqual(healedChapter.lastReadSpread, 0, 'lastReadSpread backfills to 0');
  assert(typeof healedChapter.lastAutoCheckpointAt === 'string', 'lastAutoCheckpointAt backfills to a timestamp string, not left undefined');

  const healedScene = healedChapter.scenes.find((s) => s.id === survivingSceneId);
  assert(!!healedScene, 'no data loss — the pre-existing scene survived the round trip');
  ['obstacle', 'infoRevealed', 'secretsIntroduced', 'characterChanges', 'themeMotif', 'symbolism', 'intensity', 'revisionStatus', 'narrativePurpose'].forEach((field) => {
    assertEqual(healedScene[field], '', `migration backfills scene.${field} to '' for a pre-Session-24 scene`);
  });
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
