// Tinta — quotes (v0.2 pass, manual "save this as a quote" from an editor
// selection) smoke test.
//
// Same minimal in-memory localStorage shim + real-store-module convention
// as every other smoketest.mjs. Covers createQuote/getQuoteList/
// deleteQuote, the deleteChapter/deleteScene cascade treatment (delete
// outright vs. fall back to chapter-level, matching annotations/
// bookmarks' own established precedent), and the migrate_v3_to_v4
// backfill + SCHEMA_VERSION bump to 5.
//
// Deliberately does NOT test: any welcome-screen/rotation UI (doesn't
// exist yet — a genuinely separate, later feature) or auto-detection of
// "quotable" lines (same — manual capture only, by design, for now).
//
// Run with: node quotes.smoketest.mjs

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
Store.getActiveProject();

section('createQuote — requires both text and a chapterId');
{
  const chapter = Store.createChapter('Chapter One');
  assertEqual(Store.createQuote({ text: '', chapterId: chapter.id }), null, 'empty text is refused');
  assertEqual(Store.createQuote({ text: '   ', chapterId: chapter.id }), null, 'whitespace-only text is refused, same as trimmed-empty elsewhere in this codebase');
  assertEqual(Store.createQuote({ text: 'A real line.', chapterId: null }), null, 'no chapterId is refused — a quote with nowhere to point back to isn\'t meaningful');
  assertEqual(Store.createQuote({ text: 'A real line.' }), null, 'missing chapterId entirely (not just null) is refused the same way');

  const quote = Store.createQuote({ text: '  A real line.  ', chapterId: chapter.id });
  assert(!!quote, 'valid text + chapterId succeeds');
  assertEqual(quote.text, 'A real line.', 'text is trimmed');
  assertEqual(quote.chapterId, chapter.id, 'chapterId is recorded');
  assertEqual(quote.sceneId, null, 'sceneId defaults to null when not given');
  assert(quote.id.startsWith('quote_'), 'id uses the quote_ prefix');
}

section('getQuoteList — sorted newest first, reflects live store state');
{
  const chapter = Store.createChapter('Sort Test Chapter');
  const a = Store.createQuote({ text: 'First saved.', chapterId: chapter.id });
  const b = Store.createQuote({ text: 'Second saved.', chapterId: chapter.id });
  // Force distinct timestamps rather than relying on real wall-clock
  // timing — two synchronous creates can land in the same millisecond,
  // same convention as resume.smoketest.mjs/session24.smoketest.mjs.
  Store.getActiveProject().quotes[a.id].createdAt = '2024-01-01T00:00:00.000Z';
  Store.getActiveProject().quotes[b.id].createdAt = '2024-06-01T00:00:00.000Z';
  const list = Store.getQuoteList().filter((q) => q.chapterId === chapter.id);
  assertEqual(list.length, 2, 'both quotes are present');
  assertEqual(list[0].id, b.id, 'the more recently created quote sorts first');
  assertEqual(list[1].id, a.id, 'the older quote sorts second');
}

section('deleteQuote — removes it, safe no-op on an unknown id');
{
  const chapter = Store.createChapter('Delete Test Chapter');
  const quote = Store.createQuote({ text: 'Delete me.', chapterId: chapter.id });
  assert(Store.getQuoteList().some((q) => q.id === quote.id), 'sanity check — the quote exists before deletion');
  Store.deleteQuote(quote.id);
  assert(!Store.getQuoteList().some((q) => q.id === quote.id), 'the quote is gone after deleteQuote');
  Store.deleteQuote('quote_does_not_exist');
  assert(true, 'deleting an unknown id does not throw');
}

section('deleteChapter cascade — a quote anchored to the deleted chapter is removed outright');
{
  const chapter = Store.createChapter('Doomed Chapter');
  const quote = Store.createQuote({ text: 'This chapter is about to go.', chapterId: chapter.id });
  const survivor = Store.createChapter('Survivor Chapter');
  const survivorQuote = Store.createQuote({ text: 'This one should survive.', chapterId: survivor.id });

  Store.deleteChapter(chapter.id);
  assert(!Store.getQuoteList().some((q) => q.id === quote.id), 'the quote anchored to the deleted chapter is gone — same "no meaningful orphaned state" treatment as annotations/bookmarks');
  assert(Store.getQuoteList().some((q) => q.id === survivorQuote.id), 'a quote anchored to a different, still-existing chapter is untouched');
}

section('deleteScene cascade — a scene-attributed quote falls back to chapter-level, is not deleted');
{
  const chapter = Store.createChapter('Scene Cascade Chapter');
  const scene = Store.createScene(chapter.id, { title: 'Scene One' });
  const quote = Store.createQuote({ text: 'Attributed to a scene.', chapterId: chapter.id, sceneId: scene.id });
  assertEqual(Store.getQuoteList().find((q) => q.id === quote.id).sceneId, scene.id, 'sanity check — sceneId was actually recorded');

  Store.deleteScene(chapter.id, scene.id);
  const survived = Store.getQuoteList().find((q) => q.id === quote.id);
  assert(!!survived, 'the quote itself survives a scene deletion — the chapter it lives in still exists');
  assertEqual(survived.sceneId, null, 'sceneId falls back to null rather than pointing at a scene that no longer exists, same as annotations/bookmarks');
  assertEqual(survived.chapterId, chapter.id, 'chapterId is untouched — the quote just loses its more specific scene attribution');
}

section('Migration — a pre-v0.2 project (no quotes collection at all) backfills to {}, version bumps to 5');
{
  const legacyDb = JSON.parse(Store.exportFullBackup());
  assertEqual(legacyDb.version, 5, 'sanity check — this export really is at the current SCHEMA_VERSION before we strip the field from it');
  const legacyProjectId = legacyDb.activeProjectId;
  const legacyProject = legacyDb.projects[legacyProjectId];
  delete legacyProject.quotes;
  legacyDb.version = 3; // force backward so this genuinely exercises migrate_v3_to_v4 via VERSIONED_MIGRATIONS

  assert(legacyProject.quotes === undefined, 'sanity check — quotes really is gone in the legacy snapshot');
  Store.importFullBackup(JSON.stringify(legacyDb));
  const healedProject = Store.getActiveProject();
  assert(typeof healedProject.quotes === 'object' && healedProject.quotes !== null, 'quotes is backfilled to an object (empty collection), not left undefined');
  assertEqual(JSON.parse(Store.exportFullBackup()).version, 5, 'importing the stripped-down, version-3-stamped backup brings it back up to version 4 via migrate_v3_to_v4');

  // The migration should be additive-only — quotes that DID exist before
  // the field was stripped (there weren't any in this particular fixture,
  // but the ladder-vs-versioned-migration precedent this codebase already
  // established is that backfill never clobbers real data) aren't tested
  // further here since createQuote/deleteQuote above already cover the
  // read/write path exhaustively; this section is specifically about the
  // "collection didn't exist at all" case.
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
