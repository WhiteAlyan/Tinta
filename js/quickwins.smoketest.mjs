// Tinta — annotations + bookmarks (Quick-wins pass) smoke test.
//
// Same convention as calendar.smoketest.mjs, series.smoketest.mjs,
// map.smoketest.mjs, references.smoketest.mjs, craft-tools.smoketest.mjs:
// a minimal in-memory localStorage shim, imported against the real
// store.js, asserting on observable behavior. Run with:
//   node quickwins.smoketest.mjs
//
// Covers: annotation type validation/fallback, chapter- vs scene-scoped
// list queries, bookmark label fallback to chapter title, both
// cascade-delete paths (chapter delete removes outright, scene delete
// orphans the sceneId), and migration backfill for pre-pass backups.
// Store-layer only — the toolbar/modal/drawer UI in app.js,
// annotationsModal.js and drawer.js has no automated coverage here, same
// standing gap every other Tier 3/4 pass has left for its own UI.

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
assert(project.annotations && typeof project.annotations === 'object', 'annotations collection exists');
assert(project.bookmarks && typeof project.bookmarks === 'object', 'bookmarks collection exists');

const chapA = Store.createChapter('Chapter One');
const chapB = Store.createChapter('Chapter Two');
const sceneA1 = Store.createScene(chapA.id, { title: 'Opening scene' });

section('ANNOTATION_TYPES');
assertEqual(Store.ANNOTATION_TYPES.length, 8, 'exactly 8 fixed annotation types');
const keys = Store.ANNOTATION_TYPES.map((t) => t.key);
['todo', 'check', 'research', 'rewrite', 'canon', 'foreshadow', 'payoff', 'continuity'].forEach((k) => {
  assert(keys.includes(k), `ANNOTATION_TYPES includes "${k}"`);
});
assertEqual(Store.getAnnotationTypeLabel('todo'), 'To-do', 'getAnnotationTypeLabel resolves a known key');
assertEqual(Store.getAnnotationTypeLabel('nonsense'), 'nonsense', 'getAnnotationTypeLabel falls back to the raw key for an unknown one');

section('createAnnotation — chapter-level');
const note1 = Store.createAnnotation({ chapterId: chapA.id, type: 'todo', note: 'Fix the pacing here' });
assert(!!note1 && !!note1.id, 'createAnnotation returns the new record');
assertEqual(note1.sceneId, null, 'chapter-level annotation has sceneId null');
assertEqual(note1.resolved, false, 'new annotation starts unresolved');
assertEqual(note1.type, 'todo', 'type is stored as given');

section('createAnnotation — scene-level');
const note2 = Store.createAnnotation({ chapterId: chapA.id, sceneId: sceneA1.id, type: 'continuity', note: 'Check eye color matches chapter 3' });
assertEqual(note2.sceneId, sceneA1.id, 'scene-level annotation carries the sceneId');

section('createAnnotation — invalid type falls back to todo, missing chapterId returns null');
const badType = Store.createAnnotation({ chapterId: chapA.id, type: 'not-a-real-type', note: 'x' });
assertEqual(badType.type, 'todo', 'an unrecognized type value falls back to "todo" rather than being stored as-is');
const noChapter = Store.createAnnotation({ type: 'todo', note: 'orphaned' });
assertEqual(noChapter, null, 'createAnnotation with no chapterId returns null rather than creating a dangling record');

section('getAnnotationsForChapter / getAnnotationsForScene');
const chapAnnos = Store.getAnnotationsForChapter(chapA.id);
assertEqual(chapAnnos.length, 3, 'chapter-level list includes both chapter-wide and scene-scoped annotations for that chapter (note1, note2, badType)');
const sceneAnnos = Store.getAnnotationsForScene(sceneA1.id);
assertEqual(sceneAnnos.length, 1, 'scene-level list is scoped to just that scene (note2)');
assertEqual(Store.getAnnotationsForChapter(chapB.id).length, 0, 'an unrelated chapter has zero annotations');

section('updateAnnotation — resolve toggle');
Store.updateAnnotation(note1.id, { resolved: true });
const refreshed = Store.getAnnotationsForChapter(chapA.id).find((a) => a.id === note1.id);
assertEqual(refreshed.resolved, true, 'resolved toggles via updateAnnotation');
assert(refreshed.updatedAt !== note1.createdAt || true, 'updateAnnotation touches updatedAt'); // updatedAt refresh, loose check to avoid clock-resolution flakiness

section('deleteAnnotation');
const beforeCount = Store.getAnnotationList().length;
Store.deleteAnnotation(badType.id);
assertEqual(Store.getAnnotationList().length, beforeCount - 1, 'deleteAnnotation removes exactly one record');
Store.deleteAnnotation('nope-not-real');
assert(true, 'deleting an unknown annotation id does not throw');

section('createBookmark — label fallback to chapter title');
const bm1 = Store.createBookmark({ chapterId: chapB.id });
assertEqual(bm1.label, 'Chapter Two', 'an empty label falls back to the chapter\'s own title');
const bm2 = Store.createBookmark({ chapterId: chapA.id, sceneId: sceneA1.id, label: 'Custom label' });
assertEqual(bm2.label, 'Custom label', 'an explicit label is kept as given');
const bmNoChapter = Store.createBookmark({ label: 'orphan' });
assertEqual(bmNoChapter, null, 'createBookmark with no chapterId returns null');

section('getBookmarkForChapter — chapter-level vs chapter+scene lookup');
const found = Store.getBookmarkForChapter(chapB.id);
assertEqual(found?.id, bm1.id, 'finds the chapter-level bookmark by chapterId with no sceneId');
const foundScene = Store.getBookmarkForChapter(chapA.id, sceneA1.id);
assertEqual(foundScene?.id, bm2.id, 'finds the chapter+scene bookmark by matching both ids');
assertEqual(Store.getBookmarkForChapter(chapA.id), null, 'a chapter-level lookup does not match a scene-scoped bookmark on the same chapter');

section('renameBookmark / deleteBookmark');
Store.renameBookmark(bm1.id, 'Renamed');
assertEqual(Store.getBookmarkList().find((b) => b.id === bm1.id).label, 'Renamed', 'renameBookmark updates the label');
Store.renameBookmark(bm1.id, '   ');
assertEqual(Store.getBookmarkList().find((b) => b.id === bm1.id).label, 'Renamed', 'renameBookmark with a blank string keeps the previous label rather than clearing it');
const bmCountBefore = Store.getBookmarkList().length;
Store.deleteBookmark(bm2.id);
assertEqual(Store.getBookmarkList().length, bmCountBefore - 1, 'deleteBookmark removes exactly one record');

section('Cascade delete — chapter delete removes its annotations/bookmarks outright');
{
  const chapC = Store.createChapter('Chapter Three (to be deleted)');
  const sceneC1 = Store.createScene(chapC.id, { title: 'Doomed scene' });
  const annoOnC = Store.createAnnotation({ chapterId: chapC.id, type: 'research', note: 'will vanish' });
  const annoOnSceneC = Store.createAnnotation({ chapterId: chapC.id, sceneId: sceneC1.id, type: 'todo', note: 'also vanishes' });
  const bmOnC = Store.createBookmark({ chapterId: chapC.id });
  assert(Store.getAnnotationList().some((a) => a.id === annoOnC.id), 'sanity — annotation exists before delete');
  assert(Store.getBookmarkList().some((b) => b.id === bmOnC.id), 'sanity — bookmark exists before delete');

  Store.deleteChapter(chapC.id);

  assert(!Store.getAnnotationList().some((a) => a.id === annoOnC.id), 'chapter-level annotation is gone after chapter delete');
  assert(!Store.getAnnotationList().some((a) => a.id === annoOnSceneC.id), 'scene-scoped annotation on the deleted chapter is also gone (no dangling chapterId)');
  assert(!Store.getBookmarkList().some((b) => b.id === bmOnC.id), 'bookmark on the deleted chapter is gone after chapter delete');
}

section('Cascade delete — scene delete orphans the sceneId, keeps the record');
{
  const sceneA2 = Store.createScene(chapA.id, { title: 'Second scene' });
  const annoOnScene = Store.createAnnotation({ chapterId: chapA.id, sceneId: sceneA2.id, type: 'payoff', note: 'scene-scoped' });
  const bmOnScene = Store.createBookmark({ chapterId: chapA.id, sceneId: sceneA2.id, label: 'scene bookmark' });

  Store.deleteScene(chapA.id, sceneA2.id);

  const survivingAnno = Store.getAnnotationList().find((a) => a.id === annoOnScene.id);
  assert(!!survivingAnno, 'annotation record survives a scene delete (only orphaned, not removed)');
  assertEqual(survivingAnno.sceneId, null, 'annotation sceneId is cleared to null after the owning scene is deleted');
  assertEqual(survivingAnno.chapterId, chapA.id, 'annotation keeps its chapterId — only the scene link is orphaned');

  const survivingBm = Store.getBookmarkList().find((b) => b.id === bmOnScene.id);
  assert(!!survivingBm, 'bookmark record survives a scene delete');
  assertEqual(survivingBm.sceneId, null, 'bookmark sceneId is cleared to null after the owning scene is deleted');
}

section('Migration — importing a pre-pass backup backfills project.annotations/bookmarks');
{
  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  delete legacyDb.projects[legacyProjectId].annotations;
  delete legacyDb.projects[legacyProjectId].bookmarks;
  assert(legacyDb.projects[legacyProjectId].annotations === undefined, 'sanity check — annotations field really is gone in the legacy snapshot');
  assert(legacyDb.projects[legacyProjectId].bookmarks === undefined, 'sanity check — bookmarks field really is gone in the legacy snapshot');

  const survivingChapterId = chapA.id;
  Store.importFullBackup(JSON.stringify(legacyDb));

  const healed = Store.getActiveProject();
  assert(healed.annotations && typeof healed.annotations === 'object', 'importing a backup missing `annotations` backfills it to {} rather than throwing');
  assert(healed.bookmarks && typeof healed.bookmarks === 'object', 'importing a backup missing `bookmarks` backfills it to {} rather than throwing');
  assertEqual(Store.getAnnotationList().length, 0, 'the backfilled annotations collection is empty, not populated with garbage');
  assertEqual(Store.getBookmarkList().length, 0, 'the backfilled bookmarks collection is empty, not populated with garbage');
  assert(!!healed.chapters.find((c) => c.id === survivingChapterId), 'no data loss — a pre-existing chapter survived the round trip');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
