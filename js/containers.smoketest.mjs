// Tinta — Containers foundation pass smoke test.
//
// Same convention as relationship-history/calendar/series/map.smoketest.mjs:
// a minimal in-memory localStorage shim, imported against the real
// store.js, asserting on observable behavior. Run with:
//   node containers.smoketest.mjs
//
// Covers: Part CRUD, order/reorder (swap-based, same pattern as
// reorderChapter), the content-role restriction on assignChapterToPart,
// cascade-unassign on deletePart (chapters kept, not touched further),
// getChaptersInPart filtering, and migration backfill for a pre-Containers
// project (missing project.parts entirely, missing chapter.partId).

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

section('Setup');

const chapA = Store.createChapter('Chapter One');
const chapB = Store.createChapter('Chapter Two');
const chapC = Store.createChapter('Chapter Three');
assertEqual(chapA.partId, null, 'a freshly created chapter has partId null');

section('Part CRUD');

assertEqual(Store.getParts().length, 0, 'no parts exist yet');
assert(Store.createPart('') === null, 'createPart rejects an empty/whitespace-only title');
const partOne = Store.createPart('Part One');
const partTwo = Store.createPart('Part Two');
assertEqual(Store.getParts().length, 2, 'two parts now exist');
assertEqual(Store.getParts()[0].id, partOne.id, 'getParts returns parts sorted by order — Part One first');
assertEqual(partOne.order, 0, 'first part created gets order 0');
assertEqual(partTwo.order, 1, 'second part created gets order 1');

assert(Store.renamePart(partOne.id, 'Book One') === true, 'renamePart succeeds for a real part');
assertEqual(Store.getParts().find((p) => p.id === partOne.id).title, 'Book One', 'rename actually took');
assert(Store.renamePart('nonexistent', 'X') === false, 'renamePart is a safe no-op for a bad id');
assert(Store.renamePart(partOne.id, '   ') === false, 'renamePart rejects a whitespace-only title, leaves the part alone');

section('Reordering (swap-based, same pattern as reorderChapter)');

Store.reorderPart(partTwo.id, 'up');
assertEqual(Store.getParts()[0].id, partTwo.id, 'Part Two swapped to first position');
assertEqual(Store.getParts()[1].id, partOne.id, 'Book One swapped to second position');
Store.reorderPart(partTwo.id, 'up'); // already first — no-op, doesn't throw
assertEqual(Store.getParts()[0].id, partTwo.id, 'reordering past the start is a safe no-op');
Store.reorderPart(partTwo.id, 'down');
assertEqual(Store.getParts()[0].id, partOne.id, 'swapped back — Book One first again');

section('assignChapterToPart — content-role restriction');

assert(Store.assignChapterToPart(chapA.id, partOne.id) === true, 'a plain content-role chapter can join a part');
assertEqual(Store.getChapter(chapA.id).partId, partOne.id, 'partId actually set');
assert(Store.assignChapterToPart(chapA.id, null) === true, 'passing null always succeeds — removing from a part can\'t be the wrong move');
assertEqual(Store.getChapter(chapA.id).partId, null, 'partId cleared');
Store.assignChapterToPart(chapA.id, partOne.id); // re-assign for later sections

const noteChapter = Store.createChapter('Author Note');
Store.updateChapterMeta(noteChapter.id, { docType: 'author-note' });
assertEqual(Store.getChapterTypeForChapter(Store.getChapter(noteChapter.id)).role, 'scratch', 'setup: the note chapter really does resolve to scratch role');
assert(Store.assignChapterToPart(noteChapter.id, partOne.id) === false, 'a scratch-role chapter is refused — cannot join a part');
assertEqual(Store.getChapter(noteChapter.id).partId, null, 'refused assignment leaves partId untouched');

assert(Store.assignChapterToPart('nonexistent', partOne.id) === false, 'assignChapterToPart is a safe no-op for a bad chapter id');

section('getChaptersInPart');

Store.assignChapterToPart(chapB.id, partOne.id);
Store.assignChapterToPart(chapC.id, partTwo.id);
const inPartOne = Store.getChaptersInPart(partOne.id);
assertEqual(inPartOne.length, 2, 'Part One has both assigned chapters');
assert(inPartOne.some((c) => c.id === chapA.id) && inPartOne.some((c) => c.id === chapB.id), 'Part One contains exactly chapA and chapB');
assertEqual(Store.getChaptersInPart(partTwo.id).length, 1, 'Part Two has exactly one chapter');

section('deletePart — cascade unassign, not cascade delete');

Store.deletePart(partOne.id);
assertEqual(Store.getParts().length, 1, 'one part remains after delete');
assertEqual(Store.getParts()[0].order, 0, 'remaining part is reindexed to order 0');
assertEqual(Store.getChapter(chapA.id).partId, null, 'chapA survives, just unassigned');
assertEqual(Store.getChapter(chapB.id).partId, null, 'chapB survives, just unassigned');
assert(!!Store.getChapter(chapA.id), 'deletePart never touches the chapter record itself');

section('Migration — a pre-Containers backup (no project.parts, no chapter.partId at all)');

const backupJson = Store.exportFullBackup();
const legacyDb = JSON.parse(backupJson);
const legacyProjectId = legacyDb.activeProjectId;
const legacyProject = legacyDb.projects[legacyProjectId];
delete legacyProject.parts;
legacyProject.chapters.forEach((c) => { delete c.partId; });
assert(legacyProject.parts === undefined, 'setup: project.parts really is gone in the simulated legacy backup');
assert(legacyProject.chapters.every((c) => c.partId === undefined), 'setup: chapter.partId really is gone too');

Store.importFullBackup(JSON.stringify(legacyDb));
const healedProject = Store.getActiveProject();
assert(Array.isArray(healedProject.parts), 'migrate() backfills project.parts as an array');
assertEqual(healedProject.parts.length, 0, 'backfilled parts array is empty, not invented data');
assert(healedProject.chapters.every((c) => c.partId === null), 'migrate() backfills chapter.partId to null on every chapter');
assert(!!healedProject.chapters.find((c) => c.id === chapC.id), 'no data loss — a pre-existing chapter survived the round trip');

// ── groupChaptersByPart — app.js refactor pass, moved from a view helper ─
// into store.js as pure data-shaping (see the function's own comment for
// why). Corkboard and Outline both call this directly now.
section('Store.groupChaptersByPart');
globalThis.localStorage.clear();
{
  const partA = Store.createPart('Part A');
  const partB = Store.createPart('Part B');
  const g1 = Store.createChapter('G1');
  const g2 = Store.createChapter('G2');
  const g3 = Store.createChapter('G3'); // deliberately left unassigned
  assert(Store.assignChapterToPart(g1.id, partA.id), 'setup: g1 assigned to Part A');
  assert(Store.assignChapterToPart(g2.id, partB.id), 'setup: g2 assigned to Part B');

  const chapters = [Store.getChapter(g1.id), Store.getChapter(g2.id), Store.getChapter(g3.id)];
  const groups = Store.groupChaptersByPart(chapters);
  assertEqual(groups.length, 3, 'one group per part plus one for unassigned');
  assertEqual(groups[0].part.id, partA.id, 'groups are in part order — Part A first');
  assertEqual(groups[1].part.id, partB.id, 'Part B second');
  assertEqual(groups[2].part, null, 'unassigned group has part: null');
  assertEqual(groups[0].chapters.length, 1, 'Part A group has exactly its one chapter');
  assertEqual(groups[2].chapters.some((c) => c.id === g3.id), true, 'the never-assigned chapter lands in the unassigned group');

  // A chapter pointing at a partId that no longer exists should fall
  // back to unassigned rather than being silently dropped — same
  // "orphan safely, don't lose data" rule the rest of this codebase
  // follows. Simulated directly (bypassing assignChapterToPart, which
  // would rightly refuse to assign a deleted part) since this models
  // data that predates a part deletion, not a normal assignment path.
  const orphanChapter = Store.getChapter(g1.id);
  orphanChapter.partId = 'not-a-real-part-id';
  Store.save();
  const groupsAfterOrphan = Store.groupChaptersByPart([orphanChapter, Store.getChapter(g2.id), Store.getChapter(g3.id)]);
  const unassignedAfter = groupsAfterOrphan.find((g) => g.part === null);
  assert(unassignedAfter.chapters.some((c) => c.id === g1.id), 'a chapter with a dangling partId is treated as unassigned, not dropped');

  const emptyGroups = Store.groupChaptersByPart([]);
  assertEqual(emptyGroups.length, 3, 'an empty chapter list still returns one group per existing part plus one unassigned group — never throws');
  assert(emptyGroups.every((g) => g.chapters.length === 0), 'every group is empty when given an empty chapter list');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
