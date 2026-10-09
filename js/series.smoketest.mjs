// Tinta — series/universe smoke test.
//
// Same convention as the write-time-tracking suite: a minimal in-memory
// localStorage shim, imported against the real store.js (no mocking of
// store internals), asserting on observable behavior rather than
// implementation details. Run with: node series.smoketest.mjs
//
// This exists because the series feature was shipped with zero automated
// coverage despite mutating shared state across multiple projects — the
// one part of Tinta's data model where a bug wouldn't just corrupt one
// book, it could corrupt every book on a shelf.

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

// ── fresh db per run ─────────────────────────────────────────────────────
globalThis.localStorage.clear();

section('Setup — two books joining one series');

// load() lazily creates the first project ("My Novel") and makes it active.
const bookA = Store.getActiveProject();
bookA.title = 'Book One'; // direct mutation is fine — getActiveProject() returns the live db reference

const bookB = Store.createProject('Book Two'); // createProject switches active to B
assert(Store.getActiveProject().id === bookB.id, 'createProject makes the new project active');

const series = Store.createSeries('The Ashvale Chronicles');
assertEqual(Store.listSeries().length, 1, 'series was created');

// Add Book Two (currently active) to the series.
Store.addActiveProjectToSeries(series.id);
assertEqual(Store.getSeriesForActiveProject()?.id, series.id, 'Book Two resolves its series');

// Switch to Book One and add it too.
Store.switchProject(bookA.id);
Store.addActiveProjectToSeries(series.id);
assertEqual(Store.getSeriesForActiveProject()?.id, series.id, 'Book One resolves its series');
assertEqual(Store.getSeries(series.id).memberProjectIds.length, 2, 'series has two member books');

section('Shared entity — created in the series, visible from both books');

const hero = Store.createSeriesEntity({ name: 'Kessa Vane', type: 'character' });
assert(Store.isSeriesEntity(hero.id), 'a series-created entity is reported as shared');
assertEqual(Store.getEntity(hero.id)?.name, 'Kessa Vane', 'Book One (active) resolves the shared entity by id');

Store.switchProject(bookB.id);
assertEqual(Store.getEntity(hero.id)?.name, 'Kessa Vane', 'Book Two also resolves the same shared entity by id');
assertEqual(Store.findEntityByName('Kessa Vane')?.id, hero.id, 'name lookup finds the shared entity from Book Two too');

section('Promote — a book-local entity becomes shared');

Store.switchProject(bookB.id);
const localSidekick = Store.createEntity({ name: 'Rook', type: 'character' });
assert(!Store.isSeriesEntity(localSidekick.id), 'a freshly created project entity is not shared yet');

Store.promoteEntityToSeries(localSidekick.id);
assert(Store.isSeriesEntity(localSidekick.id), 'promoteEntityToSeries flips isSeriesEntity to true');
assertEqual(Store.getEntity(localSidekick.id)?.id, localSidekick.id, 'promoted entity still resolves by the same id');

Store.switchProject(bookA.id);
assertEqual(Store.getEntity(localSidekick.id)?.name, 'Rook', 'promoted entity is now visible from Book One too');

section('Demote — a shared entity becomes book-local again');

Store.demoteEntityToProject(localSidekick.id); // active project is Book One right now
assert(!Store.isSeriesEntity(localSidekick.id), 'demoteEntityToProject flips isSeriesEntity to false');
assertEqual(Store.getEntity(localSidekick.id)?.name, 'Rook', 'demoted entity still resolves from the book that demoted it');

Store.switchProject(bookB.id);
assertEqual(Store.getEntity(localSidekick.id), null, 'demoted entity no longer resolves from the OTHER book — it moved, not copied');

section('Cross-project delete sweep — the untested part');

// Rebuild: promote Rook back to the series so we have a real shared entity
// referenced from both books' own relationship tables. promoteEntityToSeries
// only looks in the ACTIVE project's own table — and the demote step above
// left Rook living in Book One's table (Book One was active at the time) —
// so we have to switch back to Book One before re-promoting, or this is a
// silent no-op (project.entities[entityId] is undefined for the wrong
// active project, so the function just returns null and does nothing).
Store.switchProject(bookA.id);
const rePromoted = Store.promoteEntityToSeries(localSidekick.id);
assert(rePromoted !== null, 'promoteEntityToSeries succeeds when called from the book that actually owns the entity locally');
assert(Store.isSeriesEntity(localSidekick.id), 'Rook is shared again after promoting from the correct book');

// In Book Two (active), create a local entity and relate it to the shared one.
Store.switchProject(bookB.id);
const villagerB = Store.createEntity({ name: 'Tamsin', type: 'character' });
const relB = Store.createRelationship({ fromId: villagerB.id, toId: localSidekick.id, label: 'Ally' });
assertEqual(Store.getRelationshipsForEntity(localSidekick.id).length, 1, 'Book Two sees its own relationship to the shared entity');

// In Book One (NOT active when we delete), create a separate relationship
// to the same shared entity — this is the case deleteSeriesEntity's doc
// comment says is handled specially (direct sweep, not deleteRelationship()).
Store.switchProject(bookA.id);
const villagerA = Store.createEntity({ name: 'Old Bram', type: 'character' });
const relA = Store.createRelationship({ fromId: villagerA.id, toId: localSidekick.id, label: 'Mentor' });

// Delete the shared entity while Book One is active.
const deleted = Store.deleteSeriesEntity(localSidekick.id);
assert(deleted === true, 'deleteSeriesEntity reports success');
assertEqual(Store.getEntity(localSidekick.id), null, 'the shared entity is gone from the series table');

// Book One's own relationship (active project at delete time) should be gone.
assertEqual(Store.getActiveProject().relationships[relA.id], undefined, 'the ACTIVE book\'s relationship to the deleted shared entity was cleaned up');

// Book Two's relationship (NOT active at delete time) must ALSO be gone —
// this is the cross-project sweep that had no test coverage before.
Store.switchProject(bookB.id);
assertEqual(Store.getActiveProject().relationships[relB.id], undefined, 'the OTHER (non-active) book\'s relationship was ALSO cleaned up');

section('Leaving / deleting — series survives, books don\'t dangle');

// Book Two leaves the series.
Store.removeActiveProjectFromSeries();
assertEqual(Store.getActiveProject().seriesId, null, 'Book Two is no longer linked to the series');
assertEqual(Store.getSeries(series.id).memberProjectIds.includes(bookB.id), false, 'series no longer lists Book Two as a member');
assertEqual(Store.getSeries(series.id).memberProjectIds.includes(bookA.id), true, 'series still lists Book One — leaving is per-book, not destructive to the shelf');

// Shared entity that's still there (Kessa Vane) should still resolve from Book One.
Store.switchProject(bookA.id);
assertEqual(Store.getEntity(hero.id)?.name, 'Kessa Vane', 'remaining shared entity still resolves after the other book left');

// Deleting Book One (the last member) should unlink it from the series
// without deleting the series or its remaining shared entity.
const bookC = Store.createProject('Book Three'); // need a 2nd project to satisfy "can't delete the last project"
Store.switchProject(bookA.id);
const deletedProject = Store.deleteProject(bookA.id);
assert(deletedProject === true, 'deleteProject succeeds');
assert(Store.getSeries(series.id) !== null, 'series survives after its only member book is deleted');
assertEqual(Store.getSeries(series.id).memberProjectIds.includes(bookA.id), false, 'deleted book was unlinked from the series member list');
assertEqual(Store.getSeries(series.id).entities[hero.id]?.name, 'Kessa Vane', 'shared entity survives the deletion of the book that referenced it');
void bookC;

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
