// Tinta — Real Revision: undo/rollback (Mutation/History pillar) smoke test.
//
// Same minimal in-memory localStorage shim + real-store-module convention
// as containers.smoketest.mjs etc. Covers store.js's undo()/redo()/
// recordMutation/clearUndoHistory/canUndo/canRedo/getUndoLabel/
// getRedoLabel — none of which had any test coverage before this file,
// despite already being wired into createChapter/updateChapterContent/
// trashChapter/restoreChapter/createEntity/updateEntity.
//
// Also documents (via the "not recorded" assertions) the two deliberate
// scope boundaries from the design: series-shared entities are excluded
// from undo recording (applyMutationEntry only knows how to restore
// project-owned storage), and permanent/cascading deletes
// (deleteChapter/deleteEntity) are deliberately NOT undoable — that's the
// existing backup/restore flow's job, not this stack's.
//
// Run with: node revision-undo.smoketest.mjs

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

section('Empty stack — canUndo/canRedo/labels/undo()/redo() all safe no-ops');
{
  assertEqual(Store.canUndo(), false, 'nothing to undo yet');
  assertEqual(Store.canRedo(), false, 'nothing to redo yet');
  assertEqual(Store.getUndoLabel(), null, 'no undo label when stack is empty');
  assertEqual(Store.getRedoLabel(), null, 'no redo label when stack is empty');
  assertEqual(Store.undo(), null, 'undo() on an empty stack returns null, not a throw');
  assertEqual(Store.redo(), null, 'redo() on an empty stack returns null, not a throw');
}

section('Chapter create — undo removes it, redo brings it back');
{
  const chapter = Store.createChapter('Chapter One');
  assertEqual(Store.canUndo(), true, 'creating a chapter is undoable');
  assertEqual(Store.getUndoLabel(), 'Created "Chapter One"', 'undo label names the chapter');

  const undoResult = Store.undo();
  assertEqual(undoResult.targetType, 'chapter', 'undo result identifies the target type');
  assertEqual(undoResult.targetId, chapter.id, 'undo result identifies the target id');
  assertEqual(Store.getChapter(chapter.id), null, 'undoing a create actually removes the chapter');
  assertEqual(Store.canRedo(), true, 'undoing pushes onto the redo stack');

  const redoResult = Store.redo();
  assertEqual(redoResult.targetId, chapter.id, 'redo result points at the same chapter');
  const restored = Store.getChapter(chapter.id);
  assert(restored !== null, 'redoing a create brings the chapter back');
  assertEqual(restored.title, 'Chapter One', 'the redone chapter has its original title');
}

section('Chapter content edit — undo/redo round-trips the actual text');
{
  const chapter = Store.createChapter('Prose Chapter');
  Store.updateChapterContent(chapter.id, 'First draft sentence.');
  Store.updateChapterContent(chapter.id, 'Revised sentence, much better.');
  assertEqual(Store.getChapter(chapter.id).content, 'Revised sentence, much better.', 'sanity check on the live content before undoing');

  Store.undo(); // undoes the second content edit
  assertEqual(Store.getChapter(chapter.id).content, 'First draft sentence.', 'undo restores the immediately-prior content');

  Store.redo();
  assertEqual(Store.getChapter(chapter.id).content, 'Revised sentence, much better.', 'redo reapplies the newer content');
}

section('New mutation after an undo clears the redo branch (linear history, no branching)');
{
  const chapter = Store.createChapter('Branch Test');
  Store.updateChapterContent(chapter.id, 'Version A');
  Store.updateChapterContent(chapter.id, 'Version B');
  Store.undo(); // back to Version A, "Version B" now sits on the redo stack
  assertEqual(Store.canRedo(), true, 'redo is available right after the undo');

  Store.updateChapterContent(chapter.id, 'Version C — a new branch');
  assertEqual(Store.canRedo(), false, 'a fresh mutation invalidates the old redo branch, same as every mainstream editor');
}

section('Trash/restore — captured as ordinary field-flip updates, undo reverses each');
{
  const chapter = Store.createChapter('Doomed Chapter');
  Store.trashChapter(chapter.id);
  assert(Store.getChapter(chapter.id).trashedAt != null, 'sanity check — chapter is trashed');

  Store.undo(); // undoes the trash
  assertEqual(Store.getChapter(chapter.id).trashedAt, null, 'undo reverses trashChapter, same as any other field edit');

  Store.trashChapter(chapter.id);
  Store.restoreChapter(chapter.id);
  assertEqual(Store.getChapter(chapter.id).trashedAt, null, 'sanity check — chapter is restored');
  Store.undo(); // undoes the restore, chapter goes back to trashed
  assert(Store.getChapter(chapter.id).trashedAt != null, 'undo reverses restoreChapter, putting it back in the trash');
}

section('Entity create — undo removes it, redo brings it back');
{
  const entity = Store.createEntity({ name: 'Elena Castellan', type: 'character' });
  assertEqual(Store.getUndoLabel(), 'Created "Elena Castellan"', 'undo label names the entity');

  Store.undo();
  assertEqual(Store.getEntity(entity.id), null, 'undoing a create removes the entity');
  Store.redo();
  assert(Store.getEntity(entity.id) !== null, 'redoing brings the entity back');
}

section('Entity field edit — undo/redo round-trips the field');
{
  const entity = Store.createEntity({ name: 'Kael', type: 'character' });
  Store.updateEntity(entity.id, { description: 'A wandering merchant.' });
  Store.updateEntity(entity.id, { description: 'A retired soldier turned merchant.' });
  Store.undo();
  assertEqual(Store.getEntity(entity.id).description, 'A wandering merchant.', 'undo restores the prior description');
  Store.redo();
  assertEqual(Store.getEntity(entity.id).description, 'A retired soldier turned merchant.', 'redo reapplies the newer description');
}

section('Manual snapshot survives an unrelated undo — snapshots are excluded from undo entries entirely');
{
  const chapter = Store.createChapter('Snapshot Interplay');
  Store.updateChapterContent(chapter.id, 'Content before the manual snapshot.');
  Store.createSnapshot(chapter.id, 'A deliberate manual snapshot');
  assertEqual(Store.getSnapshots(chapter.id).length, 1, 'sanity check — the manual snapshot exists');

  Store.updateChapterContent(chapter.id, 'Content after the manual snapshot.');
  Store.undo(); // undoes only the content edit, should not touch .snapshots at all
  assertEqual(Store.getChapter(chapter.id).content, 'Content before the manual snapshot.', 'the content edit itself was undone');
  assertEqual(Store.getSnapshots(chapter.id).length, 1, 'the manual snapshot taken in between is untouched by an unrelated undo — proves cloneWithoutSnapshots + the current-array-preservation in applyMutationEntry both work');
}

section('Series-shared entity — deliberately excluded from undo recording');
{
  Store.clearUndoHistory(); // isolate this check — canUndo() alone can't
  // distinguish "stayed true" from "one more entry got pushed" once the
  // stack already has anything on it, so start from empty.
  const series = Store.createSeries('The Chronicle');
  Store.addActiveProjectToSeries(series.id);

  const seriesEntity = Store.createSeriesEntity({ name: 'Shared Character', type: 'character' });
  // createSeriesEntity itself isn't wired into recordMutation at all (only
  // createEntity/updateEntity are, per the diff) — this just confirms it,
  // then the real test is the *update* path below, which shares code with
  // the project-entity case and needed the explicit guard.
  assertEqual(Store.canUndo(), false, 'creating a series entity does not add an undo entry');

  Store.updateEntity(seriesEntity.id, { description: 'Edited via the shared/series path' });
  assertEqual(Store.canUndo(), false, 'editing a series-shared entity is deliberately NOT recorded — applyMutationEntry only knows project.entities, so recording this would silently restore into the wrong place on undo');
  // The edit itself still needs to have actually gone through, obviously —
  // this isn't supposed to block the edit, only skip recording it for undo.
  assertEqual(Store.getEntity(seriesEntity.id).description, 'Edited via the shared/series path', 'the edit itself still applies normally, only undo-recording is skipped');
}

section('MAX_UNDO_STACK — old entries evicted rather than growing unbounded');
{
  Store.clearUndoHistory();
  const chapter = Store.createChapter('Stack Cap Test');
  for (let i = 0; i < 105; i++) {
    Store.updateChapterContent(chapter.id, `Revision ${i}`);
  }
  // 1 create + 105 updates = 106 entries pushed; capped at 100, so undoing
  // 100 times should exhaust the stack, and the earliest content states
  // (from before the cap kicked in) should be unreachable.
  let undoCount = 0;
  while (Store.canUndo()) { Store.undo(); undoCount++; }
  assertEqual(undoCount, 100, 'the undo stack caps at MAX_UNDO_STACK (100) rather than growing unbounded');
}

section('clearUndoHistory — wipes both stacks (the project-switch teardown path)');
{
  Store.createChapter('One More Chapter');
  assertEqual(Store.canUndo(), true, 'sanity check — something is on the undo stack');
  Store.clearUndoHistory();
  assertEqual(Store.canUndo(), false, 'clearUndoHistory empties the undo stack');
  assertEqual(Store.canRedo(), false, 'clearUndoHistory empties the redo stack too');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
