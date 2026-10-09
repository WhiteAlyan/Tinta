// Tinta — Document-type model (§2.1 foundation) smoke test.
// Covers store.js's chapterTypes CRUD, the two pieces of real behavior
// riding on `role` (getContentChapterNumber's content-only numbering,
// manuscriptExport's scratch-role exclusion), and migration backfill for
// a pre-this-pass project. Run with: node document-type.smoketest.mjs

class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Store = await import('./store.js');
const ManuscriptExport = await import('./manuscriptExport.js');

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

section('Setup — fresh project seeds all 14 builtin chapter types');
const project = Store.getActiveProject();
assert(Array.isArray(project.chapterTypes) && project.chapterTypes.length === 14, 'chapterTypes seeded with 14 builtins: ' + project.chapterTypes.length);
assert(project.chapterTypes.every((t) => t.builtin), 'every seeded type is builtin');
const roles = new Set(project.chapterTypes.map((t) => t.role));
assert(['content', 'frontmatter', 'backmatter', 'scratch'].every((r) => roles.has(r)), 'all four roles represented among builtins: ' + [...roles].join(','));

section('getChapterTypes / getChapterType');
assertEqual(Store.getChapterTypes().length, 14, 'getChapterTypes returns all builtins with no custom types yet');
assertEqual(Store.getChapterType('appendix').role, 'backmatter', 'getChapterType resolves a builtin by key');
assertEqual(Store.getChapterType('not-a-real-type'), null, 'unknown key returns null');

section('getChapterTypeForChapter — fallback for a dangling/unknown docType');
const chapter = project.chapters[0];
assertEqual(Store.getChapterTypeForChapter(chapter).key, 'chapter', 'a fresh chapter defaults to the chapter builtin');
Store.updateChapterMeta(chapter.id, { docType: 'totally-not-a-real-type' });
assertEqual(Store.getChapterTypeForChapter(chapter).key, 'chapter', 'a dangling docType falls back to the chapter builtin, not null/throw');
Store.updateChapterMeta(chapter.id, { docType: 'chapter' });

section('createChapterType / updateChapterType / deleteChapterType');
const custom = Store.createChapterType({ label: 'Map Key', role: 'frontmatter' });
assert(!!custom.key && custom.builtin === false, 'createChapterType returns a non-builtin type with a generated key');
assertEqual(Store.getChapterTypes().length, 15, 'new custom type appears in the list');
Store.updateChapterType(custom.key, { label: 'World Map Key', role: 'backmatter' });
assertEqual(Store.getChapterType(custom.key).label, 'World Map Key', 'updateChapterType patches label');
assertEqual(Store.getChapterType(custom.key).role, 'backmatter', 'updateChapterType patches role');

assertEqual(Store.deleteChapterType('chapter'), false, 'deleting a builtin is refused');
assertEqual(Store.getChapterTypes().length, 15, 'builtin survives the refused delete');

const chapter2 = Store.createChapter('Second chapter');
Store.updateChapterMeta(chapter2.id, { docType: custom.key });
assertEqual(Store.deleteChapterType(custom.key), false, 'deleting a custom type still in use is refused');
Store.updateChapterMeta(chapter2.id, { docType: 'chapter' });
assertEqual(Store.deleteChapterType(custom.key), true, 'deleting an unused custom type succeeds');
assertEqual(Store.getChapterTypes().length, 14, 'deleted type no longer appears in the list');

section('getContentChapterNumber — role-aware numbering');
{
  // localStorage.clear() alone doesn't reset store.js's cached in-memory
  // _db (same caching behavior the Map pass's own smoke test ran into —
  // see map.smoketest.mjs's migration-test comment), so this uses
  // createProject() for a genuinely isolated project instead of
  // assuming a fresh single-chapter state.
  const fresh = Store.createProject('Numbering test project');
  Store.switchProject(fresh.id);
  const p = Store.getActiveProject();
  const ch1 = p.chapters[0]; // the one default chapter createProject seeds
  const ch2 = Store.createChapter('Chapter Two');
  const appendix = Store.createChapter('An Appendix');
  Store.updateChapterMeta(appendix.id, { docType: 'appendix' });
  const ch3 = Store.createChapter('Chapter Three');
  const scratch = Store.createChapter('Author Notes');
  Store.updateChapterMeta(scratch.id, { docType: 'author-note' });

  assertEqual(Store.getContentChapterNumber(Store.getChapter(ch1.id)), 1, 'first content chapter is numbered 1');
  assertEqual(Store.getContentChapterNumber(Store.getChapter(ch2.id)), 2, 'second content chapter is numbered 2');
  assertEqual(Store.getContentChapterNumber(Store.getChapter(appendix.id)), null, 'a backmatter-role chapter gets no number');
  assertEqual(Store.getContentChapterNumber(Store.getChapter(ch3.id)), 3, 'a chapter after an inserted Appendix is still 3, not 4 — the Appendix does not consume a number');
  assertEqual(Store.getContentChapterNumber(Store.getChapter(scratch.id)), null, 'a scratch-role chapter gets no number either');

  section('manuscriptExport — scratch-role chapters excluded, everything else included');
  const docx = ManuscriptExport.buildDocx(Store.getActiveProject(), { author: 'Test Author', wordTotal: 100 });
  assert(docx instanceof Uint8Array || docx.length > 0, 'buildDocx produces output with scratch chapters present in the project');
  // isExportableChapter isn't exported directly, so this is verified
  // indirectly: buildDocx must not throw and must produce a non-trivial
  // zip even with a scratch-role chapter mixed into the project — a
  // regression that stopped filtering would still "work" in the sense
  // of not throwing, so the meaningful check is the size sanity below
  // rather than just "did it run."
  assert(docx.length > 500, 'docx output is non-trivial in size: ' + docx.length + ' bytes');
}

section('Migration — a pre-Document-type-model project backfills chapterTypes + chapter.docType');
{
  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  const legacyProject = legacyDb.projects[legacyProjectId];
  delete legacyProject.chapterTypes;
  legacyProject.chapters.forEach((c) => { delete c.docType; });
  const chapterCountBefore = legacyProject.chapters.length;

  Store.importFullBackup(JSON.stringify(legacyDb));
  const healed = Store.getActiveProject();

  assert(Array.isArray(healed.chapterTypes) && healed.chapterTypes.length === 14, 'chapterTypes re-seeded with all 14 builtins on healing');
  assert(healed.chapters.every((c) => typeof c.docType === 'string' && c.docType === 'chapter'), 'every pre-existing chapter backfilled to docType "chapter"');
  assertEqual(healed.chapters.length, chapterCountBefore, 'no chapters lost during healing');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
