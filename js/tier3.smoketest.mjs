// Tinta — Tier 3 pass (continuity checking, style guide, completion
// checklist) smoke test.
//
// Same convention as calendar.smoketest.mjs, series.smoketest.mjs,
// map.smoketest.mjs, references.smoketest.mjs, and craft-tools.smoketest.mjs:
// a minimal in-memory localStorage shim, imported against the real
// store.js, asserting on observable behavior. Run with:
//   node tier3.smoketest.mjs
//
// This closes a gap flagged in TINTA-FEATURE-AUDIT-v2.md: continuity
// checking, style guide, and completion checklist shipped in the Tier 3
// pass but had no dedicated smoke-test file in that snapshot — coverage
// existed only as ad-hoc verification during the pass itself, not as a
// repeatable, checked-in test. Store-layer only — see each feature's UI
// (entity Status timeline in Notes, "Style guide" in Grammar Settings,
// the Health view's Continuity/Style guide sections, the Checklist view)
// for the DOM wiring, which is read-verified but not automated here,
// same standing gap as the rest of the app's UI per the audit's "one
// real risk" note.

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

// ═══════════════════════════════════════════════════════════════════════
section('Entity status events — CRUD');
// ═══════════════════════════════════════════════════════════════════════
{
  Store.createProject('Tier 3 Test Novel');
  const elena = Store.createEntity({ type: 'character', name: 'Elena' });
  const evt = Store.createTimelineEvent({ title: 'Something happens' });

  assertEqual(Store.getEntityStatusEvents(elena.id).length, 0, 'no status events on a fresh entity');

  const se = Store.addEntityStatusEvent(elena.id, { label: 'Injured', timelineEventId: evt.id, blocksAppearance: false, note: 'left arm' });
  assert(!!se && se.label === 'Injured', 'status event created');
  assertEqual(Store.getEntityStatusEvents(elena.id).length, 1, 'status event retrievable');

  assert(Store.addEntityStatusEvent(elena.id, { label: '', timelineEventId: evt.id }) === null, 'empty label rejected');
  assert(Store.addEntityStatusEvent(elena.id, { label: 'X', timelineEventId: null }) === null, 'missing timelineEventId rejected');

  Store.updateEntityStatusEvent(elena.id, se.id, { label: 'Renamed', blocksAppearance: true });
  assertEqual(Store.getEntityStatusEvents(elena.id)[0].label, 'Renamed', 'status event updated');
  assertEqual(Store.getEntityStatusEvents(elena.id)[0].blocksAppearance, true, 'status event blocksAppearance updated');

  Store.deleteEntityStatusEvent(elena.id, se.id);
  assertEqual(Store.getEntityStatusEvents(elena.id).length, 0, 'status event deleted');

  // Sort order follows the linked timeline event's story order, not
  // creation order.
  const eEarly = Store.createTimelineEvent({ title: 'Early event' });
  const eLate = Store.createTimelineEvent({ title: 'Late event' });
  assert(eEarly.order < eLate.order, 'sanity: eEarly really does have a lower story order than eLate');
  // Add the status events in the *opposite* order they occur in the
  // story, so the test actually exercises the sort rather than have
  // insertion order coincidentally match story order.
  Store.addEntityStatusEvent(elena.id, { label: 'Later label', timelineEventId: eLate.id });
  Store.addEntityStatusEvent(elena.id, { label: 'Earlier label', timelineEventId: eEarly.id });
  const sorted = Store.getEntityStatusEvents(elena.id);
  assertEqual(sorted[0].label, 'Earlier label', 'status events sort by linked timeline event order, not insertion order');
  assertEqual(sorted[1].label, 'Later label', 'second status event sorts after the first');

  // A status event whose linked timeline event was deleted sorts last,
  // stays visible, and is excluded from interval math (checked below).
  const eDoomed = Store.createTimelineEvent({ title: 'Will be deleted' });
  Store.addEntityStatusEvent(elena.id, { label: 'Dangling', timelineEventId: eDoomed.id });
  Store.deleteTimelineEvent(eDoomed.id);
  const withDangling = Store.getEntityStatusEvents(elena.id);
  assertEqual(withDangling[withDangling.length - 1].label, 'Dangling', 'status event with a deleted linked event sorts last, not dropped');
}

// ═══════════════════════════════════════════════════════════════════════
section('Continuity report — mention-based detection');
// ═══════════════════════════════════════════════════════════════════════
{
  Store.createProject('Continuity Test Novel');
  const elena = Store.createEntity({ type: 'character', name: 'Elena' });

  const ch1 = Store.getActiveProject().chapters[0];
  Store.updateChapterContent(ch1.id, '[[Elena]] walked into the tavern.');
  const ch2 = Store.createChapter('After the fall');
  Store.updateChapterContent(ch2.id, 'The village mourned. [[Elena]] was gone, but her ghost lingered.');

  const eArrive = Store.createTimelineEvent({ title: 'Elena arrives', chapterId: ch1.id });
  const eDeath = Store.createTimelineEvent({ title: 'Elena dies', chapterId: null });
  const eAftermath = Store.createTimelineEvent({ title: 'Village aftermath', chapterId: ch2.id });

  assert(eArrive.order < eDeath.order && eDeath.order < eAftermath.order, 'sanity: story order is arrive < death < aftermath');

  let report = Store.getContinuityReport();
  assertEqual(report.length, 0, 'no status events yet — no issues reported');

  Store.addEntityStatusEvent(elena.id, { label: 'Deceased', timelineEventId: eDeath.id, blocksAppearance: true });
  report = Store.getContinuityReport();
  assertEqual(report.length, 1, 'mention after death flagged');
  assertEqual(report[0].entityName, 'Elena', 'flagged issue names the right entity');
  assertEqual(report[0].chapterId, ch2.id, 'flagged issue points at the right chapter');
  assertEqual(report[0].kind, 'mention', 'mention-based issue tagged as "mention"');
  assertEqual(report[0].statusLabel, 'Deceased', 'flagged issue carries the blocking status label');

  // The chapter before death (ch1, which also mentions Elena) must not
  // be flagged — it's outside the blocked interval.
  assert(!report.some((r) => r.chapterId === ch1.id), 'mention before the status change is not flagged');

  // An event with no chapterId can't be checked and must not throw or
  // spuriously appear.
  assert(!report.some((r) => r.eventId === eDeath.id && r.chapterId === null), 'events with no chapterId are skipped, not flagged with a null chapter');
}

// ═══════════════════════════════════════════════════════════════════════
section('Continuity report — POV-based (lower-confidence) detection');
// ═══════════════════════════════════════════════════════════════════════
{
  Store.createProject('POV Continuity Test');
  const elena = Store.createEntity({ type: 'character', name: 'Elena' });
  const eDeath = Store.createTimelineEvent({ title: 'Elena dies', chapterId: null });
  Store.addEntityStatusEvent(elena.id, { label: 'Deceased', timelineEventId: eDeath.id, blocksAppearance: true });

  const ch = Store.createChapter('Ghost chapter');
  const scene = Store.createScene(ch.id, { title: 'Haunting' });
  Store.updateScene(ch.id, scene.id, { pov: 'Elena' });
  const eAfter = Store.createTimelineEvent({ title: 'After the death', chapterId: ch.id });
  assert(eAfter.order > eDeath.order, 'sanity: after-event has a higher story order than the death event');

  const report = Store.getContinuityReport();
  const povIssue = report.find((r) => r.kind === 'pov');
  assert(!!povIssue, 'POV-based issue detected');
  assertEqual(povIssue.chapterId, ch.id, 'POV-based issue points at the right chapter');
  assertEqual(povIssue.sceneId, scene.id, 'POV-based issue points at the right scene');
}

// ═══════════════════════════════════════════════════════════════════════
section('Continuity report — blocked-interval reopening ("resurrection")');
// ═══════════════════════════════════════════════════════════════════════
{
  Store.createProject('Resurrection Test');
  const elena = Store.createEntity({ type: 'character', name: 'Elena' });

  const chBefore = Store.getActiveProject().chapters[0];
  const chDuring = Store.createChapter('While sealed away');
  const chAfter = Store.createChapter('After being freed');
  Store.updateChapterContent(chDuring.id, 'The [[Elena]] shaped shadow moved behind the wall.');
  Store.updateChapterContent(chAfter.id, '[[Elena]] laughed again, alive and free.');

  const eSeal = Store.createTimelineEvent({ title: 'Elena sealed away', chapterId: null });
  const eDuring = Store.createTimelineEvent({ title: 'Something stirs', chapterId: chDuring.id });
  const eFree = Store.createTimelineEvent({ title: 'Elena freed', chapterId: null });
  const eAfter = Store.createTimelineEvent({ title: 'Elena returns', chapterId: chAfter.id });

  Store.addEntityStatusEvent(elena.id, { label: 'Sealed away', timelineEventId: eSeal.id, blocksAppearance: true });
  Store.addEntityStatusEvent(elena.id, { label: 'Freed', timelineEventId: eFree.id, blocksAppearance: false });

  const report = Store.getContinuityReport();
  assert(report.some((r) => r.chapterId === chDuring.id), 'chapter within the blocked interval (sealed, not yet freed) is flagged');
  assert(!report.some((r) => r.chapterId === chAfter.id), 'chapter after the unblocking status event is NOT flagged');
  assert(!report.some((r) => r.chapterId === chBefore.id), 'chapter before the seal event is not flagged (no mention there anyway, but must not throw)');
}

// ═══════════════════════════════════════════════════════════════════════
section('Continuity report — multiple entities, one with no status events');
// ═══════════════════════════════════════════════════════════════════════
{
  Store.createProject('Multi-entity Continuity Test');
  const elena = Store.createEntity({ type: 'character', name: 'Elena' });
  const bram = Store.createEntity({ type: 'character', name: 'Bram' }); // never given a status event

  const ch = Store.createChapter('Later chapter');
  Store.updateChapterContent(ch.id, '[[Elena]] and [[Bram]] stood together.');
  const eDeath = Store.createTimelineEvent({ title: 'Elena dies', chapterId: null });
  const eLater = Store.createTimelineEvent({ title: 'Later scene', chapterId: ch.id });
  Store.addEntityStatusEvent(elena.id, { label: 'Deceased', timelineEventId: eDeath.id, blocksAppearance: true });

  const report = Store.getContinuityReport();
  assert(report.some((r) => r.entityId === elena.id), 'entity with a blocking status event is flagged');
  assert(!report.some((r) => r.entityId === bram.id), 'entity with no status events is never flagged, even when co-mentioned');
}

// ═══════════════════════════════════════════════════════════════════════
section('Style guide rules — CRUD');
// ═══════════════════════════════════════════════════════════════════════
{
  Store.createProject('Style Guide Test');
  assertEqual(Store.getStyleGuideRules().length, 0, 'no rules on a fresh project');

  const rule = Store.addStyleGuideRule({ incorrect: 'grey', preferred: 'gray', note: 'US spelling throughout' });
  assert(!!rule, 'rule created');
  assertEqual(Store.getStyleGuideRules().length, 1, 'rule retrievable');

  assert(Store.addStyleGuideRule({ incorrect: '', preferred: 'gray' }) === null, 'empty "incorrect" rejected');
  assert(Store.addStyleGuideRule({ incorrect: 'grey', preferred: '' }) === null, 'empty "preferred" rejected');

  Store.updateStyleGuideRule(rule.id, { note: 'updated note' });
  assertEqual(Store.getStyleGuideRules()[0].note, 'updated note', 'rule updated');

  Store.deleteStyleGuideRule(rule.id);
  assertEqual(Store.getStyleGuideRules().length, 0, 'rule deleted');

  // Rules list sorts alphabetically by "incorrect", not insertion order.
  Store.addStyleGuideRule({ incorrect: 'towards', preferred: 'toward' });
  Store.addStyleGuideRule({ incorrect: 'alright', preferred: 'all right' });
  const rules = Store.getStyleGuideRules();
  assertEqual(rules[0].incorrect, 'alright', 'rules sort alphabetically by "incorrect"');
}

// ═══════════════════════════════════════════════════════════════════════
section('Style guide — scan and project-wide report');
// ═══════════════════════════════════════════════════════════════════════
{
  Store.createProject('Style Scan Test');
  Store.addStyleGuideRule({ incorrect: 'grey', preferred: 'gray' });
  Store.addStyleGuideRule({ incorrect: 'grey eyes', preferred: 'gray eyes', note: 'longer match should win' });

  const scan = Store.scanTextForStyleViolations('She had grey eyes and a grey coat.', Store.getStyleGuideRules());
  // Rules aren't mutually exclusive by span — scanTextForStyleViolations
  // sorts longer rules first but doesn't suppress a shorter rule's match
  // inside a longer rule's already-matched region, so "grey eyes" (1
  // match) and "grey" (2 matches, one of them inside "grey eyes") both
  // fire independently: 3 total, not 2. Worth knowing if a project ever
  // defines both a rule and a more specific rule sharing a prefix — the
  // grammar-check UI would show two overlapping flags for that span.
  assert(scan.length === 3, `scan finds 3 violations (grey×2 + "grey eyes"×1, matches are not de-overlapped across rules), got ${scan.length}`);
  assert(scan.some((v) => v.replacements[0] === 'gray eyes'), 'the "grey eyes" rule does fire on its exact span');

  assertEqual(Store.scanTextForStyleViolations('', Store.getStyleGuideRules()).length, 0, 'empty text scans clean');
  assertEqual(Store.scanTextForStyleViolations('nothing to see', []).length, 0, 'no rules means no violations');

  // Word-boundary matching — "greyhound" must not trip the "grey" rule.
  const boundaryScan = Store.scanTextForStyleViolations('The greyhound ran.', [{ id: 'x', incorrect: 'grey', preferred: 'gray' }]);
  assertEqual(boundaryScan.length, 0, 'word-boundary matching avoids false positives inside longer words');

  const project = Store.getActiveProject();
  Store.updateChapterContent(project.chapters[0].id, 'His grey coat was grey.');
  const report = Store.getStyleGuideReport();
  assertEqual(report.length, 1, 'style guide report has one entry for the touched chapter');
  assertEqual(report[0].count, 2, 'violation count aggregates repeated occurrences in the same chapter');

  Store.deleteStyleGuideRule(Store.getStyleGuideRules()[0].id);
  Store.deleteStyleGuideRule(Store.getStyleGuideRules()[0].id);
  assertEqual(Store.getStyleGuideReport().length, 0, 'report is empty once all rules are removed, even with matching text still present');
}

// ═══════════════════════════════════════════════════════════════════════
section('Completion checklist — blocking vs. informational items');
// ═══════════════════════════════════════════════════════════════════════
{
  Store.createProject('Checklist Test');
  const project = Store.getActiveProject();

  let checklist = Store.getCompletionChecklist();
  assert(Array.isArray(checklist.items) && checklist.items.length > 0, 'checklist returns a non-empty item list');
  const blockingKeys = checklist.items.filter((i) => i.blocking).map((i) => i.key);
  assert(blockingKeys.includes('continuity'), 'continuity is a blocking checklist item');
  assert(blockingKeys.includes('styleGuide'), 'style guide is a blocking checklist item');
  assert(blockingKeys.includes('orphanedEntities'), 'orphaned entities is a blocking checklist item');
  const infoKeys = checklist.items.filter((i) => !i.blocking).map((i) => i.key);
  assert(infoKeys.includes('storyQuestions'), 'unresolved story questions is informational, not blocking');

  // A fresh single-chapter project: default chapter is Draft status and
  // empty, so chaptersFinal and emptyChapters should both fail.
  const chaptersFinalItem = checklist.items.find((i) => i.key === 'chaptersFinal');
  assert(chaptersFinalItem.pass === false, 'fresh project fails "every chapter marked Final"');
  assertEqual(checklist.readyToPublish, false, 'fresh project is not readyToPublish');
  assert(checklist.blockingCount > 0, 'fresh project has a nonzero blockingCount');

  // Mark the one chapter Final and give it content — should clear two
  // blocking items (chaptersFinal, emptyChapters) but not necessarily all.
  Store.updateChapterContent(project.chapters[0].id, 'Once upon a time, this chapter had words in it.');
  Store.updateChapterMeta(project.chapters[0].id, { status: 'final' });
  checklist = Store.getCompletionChecklist();
  assert(checklist.items.find((i) => i.key === 'chaptersFinal').pass === true, 'chaptersFinal passes once the only chapter is marked Final');
  assert(checklist.items.find((i) => i.key === 'emptyChapters').pass === true, 'emptyChapters passes once the only chapter has content');

  // readyToPublish requires every *blocking* item to pass — confirm it's
  // computed from blocking items only, not the full list.
  const blockingItems = checklist.items.filter((i) => i.blocking);
  const expectedReady = blockingItems.every((i) => i.pass);
  assertEqual(checklist.readyToPublish, expectedReady, 'readyToPublish reflects blocking items only');
}

// ═══════════════════════════════════════════════════════════════════════
section('Migration — importing a pre-Tier-3 backup backfills statusEvents/styleGuide, no data loss');
// ═══════════════════════════════════════════════════════════════════════
{
  Store.createProject('Pre-Tier-3 Migration Test');
  const project = Store.getActiveProject();
  const survivor = Store.createEntity({ type: 'character', name: 'Survivor' });
  Store.createEntity({ type: 'character', name: 'Another Entity' });

  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  const legacyProject = legacyDb.projects[legacyProjectId];
  delete legacyProject.styleGuide;
  Object.values(legacyProject.entities).forEach((e) => { delete e.statusEvents; });

  Store.importFullBackup(JSON.stringify(legacyDb));
  const healed = Store.getActiveProject();

  assert(Array.isArray(healed.styleGuide), 'project.styleGuide healed to an array on import');
  assert(Object.values(healed.entities).every((e) => Array.isArray(e.statusEvents)), 'every entity.statusEvents healed to an array on import');
  assert(!!healed.entities[survivor.id], 'no data loss — a pre-existing entity survived the round trip');

  // Post-migration, the healed store should work normally end to end —
  // not just have the right shape, but actually function.
  const evt = Store.createTimelineEvent({ title: 'Post-migration event', chapterId: null });
  const se = Store.addEntityStatusEvent(survivor.id, { label: 'Test', timelineEventId: evt.id, blocksAppearance: true });
  assert(!!se, 'addEntityStatusEvent works on a freshly-healed project');
  const rule = Store.addStyleGuideRule({ incorrect: 'a', preferred: 'b' });
  assert(!!rule, 'addStyleGuideRule works on a freshly-healed project');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
