// Tinta — Document Templates (§2.2) & Organization (§2.3) smoke test.
// Run with: node organization.smoketest.mjs

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

// ═══════════════════════════════════════════════════════════════════════
// §2.2 — Document Templates
// ═══════════════════════════════════════════════════════════════════════

section('§2.2 — builtin templates seeded');

const project = Store.getActiveProject();
assertEqual(project.documentTemplates.length, 7, 'all 7 builtin templates present');
assert(project.documentTemplates.every((t) => t.builtin), 'every seeded template is builtin');
const chapterTemplates = Store.getDocumentTemplates('chapter');
const sceneTemplates = Store.getDocumentTemplates('scene');
assertEqual(chapterTemplates.length, 5, 'five chapter-level templates (New Chapter, Character Sheet, Research Note, Glossary, Appendix)');
assertEqual(sceneTemplates.length, 2, 'two scene-level templates (New Scene, Screenplay Scene)');

section('§2.2 — creating a chapter from a template');

const charSheetTpl = project.documentTemplates.find((t) => t.id === 'tpl-character-sheet');
const newChapter = Store.createChapterFromTemplate(charSheetTpl.id, 'Alaric');
assert(newChapter !== null, 'createChapterFromTemplate succeeds');
assertEqual(newChapter.title, 'Alaric', 'titleOverride wins over the template\'s titleSeed');
assertEqual(newChapter.docType, 'research-note', 'the new chapter gets the template\'s docType');
assert(newChapter.content.includes('## Appearance'), 'the new chapter gets the template\'s starter content');

const blankTitleChapter = Store.createChapterFromTemplate(charSheetTpl.id);
assertEqual(blankTitleChapter.title, 'Character: ', 'with no override, falls back to the template\'s titleSeed');

section('§2.2 — creating a scene from a template');

const screenplayTpl = project.documentTemplates.find((t) => t.id === 'tpl-screenplay-scene');
const hostChapter = Store.createChapter('Host Chapter');
const newScene = Store.createSceneFromTemplate(hostChapter.id, screenplayTpl.id, 'Opening scene');
assert(newScene !== null, 'createSceneFromTemplate succeeds');
assertEqual(newScene.title, 'Opening scene', 'titleOverride applied');
assert(newScene.notes.includes('INT./EXT.'), 'sceneFields (notes, in this case) are seeded from the template');

section('§2.2 — custom templates');

const customTpl = Store.createDocumentTemplate({ appliesTo: 'chapter', name: 'Interview Log', docType: 'research-note', titleSeed: 'Interview — ', content: 'Q: \nA: \n' });
assert(customTpl !== null, 'createDocumentTemplate succeeds with valid input');
assertEqual(Store.getDocumentTemplates('chapter').length, 6, 'the new custom template is now included');
assertEqual(Store.createDocumentTemplate({ appliesTo: 'chapter', name: '   ' }), null, 'a blank name is rejected');
assertEqual(Store.createDocumentTemplate({ appliesTo: 'not-a-real-value', name: 'X' }), null, 'an invalid appliesTo is rejected');

Store.updateDocumentTemplate(customTpl.id, { name: 'Interview Transcript' });
assertEqual(Store.getDocumentTemplate(customTpl.id).name, 'Interview Transcript', 'updateDocumentTemplate patches a custom template');

assertEqual(Store.updateDocumentTemplate(charSheetTpl.id, { name: 'Renamed' }), false, 'updateDocumentTemplate refuses to touch a builtin');
assertEqual(Store.deleteDocumentTemplate(charSheetTpl.id), false, 'deleteDocumentTemplate refuses to delete a builtin');
assertEqual(Store.deleteDocumentTemplate(customTpl.id), true, 'deleteDocumentTemplate succeeds on a custom template');
assertEqual(Store.getDocumentTemplate(customTpl.id), null, 'the deleted custom template is gone');

section('§2.2 — migration backfill');

const legacyDb1 = JSON.parse(Store.exportFullBackup());
delete legacyDb1.projects[legacyDb1.activeProjectId].documentTemplates;
Store.importFullBackup(JSON.stringify(legacyDb1));
assert(Array.isArray(Store.getActiveProject().documentTemplates), 'migrate() backfills documentTemplates');
assertEqual(Store.getActiveProject().documentTemplates.length, 7, 'backfill seeds the real 7 builtins, not an empty array');

// ═══════════════════════════════════════════════════════════════════════
// §2.3 — Organization
// ═══════════════════════════════════════════════════════════════════════

section('§2.3 — fresh chapters default to unaffected');

const plainChapter = Store.createChapter('Plain Chapter');
assertEqual(plainChapter.folderId, null, 'no folder by default');
assertEqual(plainChapter.favorite, false, 'not a favorite by default');
assertEqual(plainChapter.pinned, false, 'not pinned by default');
assertEqual(plainChapter.archived, false, 'not archived by default');
assertEqual(plainChapter.trashedAt, null, 'not trashed by default');

section('§2.3 — favorites and pins are independent');

Store.toggleChapterFavorite(plainChapter.id);
assertEqual(Store.getChapter(plainChapter.id).favorite, true, 'toggleChapterFavorite turns it on');
assert(Store.getFavoriteChapters().some((c) => c.id === plainChapter.id), 'getFavoriteChapters includes it');
assertEqual(Store.getChapter(plainChapter.id).pinned, false, 'favoriting did not also pin it');
Store.toggleChapterPin(plainChapter.id);
assertEqual(Store.getChapter(plainChapter.id).pinned, true, 'toggleChapterPin turns it on independently');
Store.toggleChapterFavorite(plainChapter.id);
assertEqual(Store.getChapter(plainChapter.id).favorite, false, 'toggling favorite off again works');
assertEqual(Store.getChapter(plainChapter.id).pinned, true, 'un-favoriting did not also un-pin it');

section('§2.3 — folders: flat, single-membership, non-destructive deletion');

const folder = Store.createFolder('Deleted Scenes');
assert(folder !== null, 'createFolder succeeds');
assertEqual(Store.createFolder('  '), null, 'createFolder rejects a blank name');
Store.assignChapterToFolder(plainChapter.id, folder.id);
assertEqual(Store.getChapter(plainChapter.id).folderId, folder.id, 'chapter now carries the folder id');
assert(Store.getChaptersInFolder(folder.id).some((c) => c.id === plainChapter.id), 'getChaptersInFolder finds it');
Store.deleteFolder(folder.id);
assertEqual(Store.getFolders().length, 0, 'the folder itself is gone');
assertEqual(Store.getChapter(plainChapter.id).folderId, null, 'deleting the folder un-assigned the chapter rather than deleting it');
assert(Store.getChapter(plainChapter.id) !== null, 'the chapter itself still exists after its folder was deleted');

section('§2.3 — recents: MRU order, capped, deduplicated');

const recentTestChapters = Array.from({ length: 12 }, (_, i) => Store.createChapter(`Recent ${i}`));
recentTestChapters.forEach((c) => Store.recordChapterOpened(c.id));
const recents = Store.getRecentChapters();
assertEqual(recents.length, 10, 'recents list is capped at 10 even though 12 chapters were opened');
assertEqual(recents[0].title, 'Recent 11', 'most-recently-opened chapter is first');
Store.recordChapterOpened(recentTestChapters[5].id); // re-open an already-recent one
assertEqual(Store.getRecentChapters()[0].id, recentTestChapters[5].id, 'reopening an already-recent chapter moves it to the front, not a duplicate entry');
assertEqual(Store.getRecentChapters().length, 10, 'still capped at 10 after reopening one already in the list — no duplicate added');

section('§2.3 — saved collections: multi-membership, unlike folders');

const collectionA = Store.createCollection('Beta Reader Draft');
const collectionB = Store.createCollection('Award Excerpt');
Store.addChapterToCollection(collectionA.id, plainChapter.id);
Store.addChapterToCollection(collectionB.id, plainChapter.id);
assert(Store.getChaptersInCollection(collectionA.id).some((c) => c.id === plainChapter.id), 'chapter is in collection A');
assert(Store.getChaptersInCollection(collectionB.id).some((c) => c.id === plainChapter.id), 'the SAME chapter is also in collection B — multi-membership works');
Store.addChapterToCollection(collectionA.id, plainChapter.id); // add again
assertEqual(Store.getChaptersInCollection(collectionA.id).length, 1, 'adding the same chapter twice does not duplicate it');
Store.removeChapterFromCollection(collectionA.id, plainChapter.id);
assertEqual(Store.getChaptersInCollection(collectionA.id).length, 0, 'removeChapterFromCollection works');
assert(Store.getChaptersInCollection(collectionB.id).some((c) => c.id === plainChapter.id), 'removing from collection A did not affect collection B');

section('§2.3 — saved searches');

const savedSearch = Store.createSavedSearch({ name: 'Tournament mentions', query: 'tournament', useRegex: false });
assert(savedSearch !== null, 'createSavedSearch succeeds');
assertEqual(Store.createSavedSearch({ name: '', query: 'x' }), null, 'rejects a blank name');
assertEqual(Store.createSavedSearch({ name: 'x', query: '  ' }), null, 'rejects a blank query');
assertEqual(Store.getSavedSearches().length, 1, 'getSavedSearches returns it');
Store.deleteSavedSearch(savedSearch.id);
assertEqual(Store.getSavedSearches().length, 0, 'deleteSavedSearch works');

section('§2.3 — archive: hidden from numbering and export, fully intact otherwise');

const contentChapterA = Store.createChapter('Chapter One');
const contentChapterB = Store.createChapter('Chapter Two');
const numBefore = Store.getContentChapterNumber(contentChapterB);
Store.archiveChapter(contentChapterA.id);
assertEqual(Store.getChapter(contentChapterA.id).archived, true, 'archiveChapter sets the flag');
assertEqual(Store.getContentChapterNumber(contentChapterA), null, 'an archived chapter itself gets no content-chapter number');
assert(Store.getContentChapterNumber(contentChapterB) < numBefore, 'archiving a chapter earlier in the sequence shifts the numbers after it down, same as manuscriptExport would show');
assert(Store.getArchivedChapters().some((c) => c.id === contentChapterA.id), 'getArchivedChapters includes it');
Store.unarchiveChapter(contentChapterA.id);
assertEqual(Store.getChapter(contentChapterA.id).archived, false, 'unarchiveChapter reverses it');
assertEqual(Store.getContentChapterNumber(contentChapterB), numBefore, 'unarchiving restores the original numbering');

section('§2.3 — archive/trash excluded from manuscript export');

const exportProject = Store.getActiveProject();
const exportableBefore = exportProject.chapters.filter((c) => !c.archived && !c.trashedAt && Store.getChapterTypeForChapter(c).role !== 'scratch').length;
const docxBefore = ManuscriptExport.buildDocx(exportProject, { author: 'Test', wordTotal: 0 });
Store.archiveChapter(contentChapterA.id);
const docxAfterArchive = ManuscriptExport.buildDocx(Store.getActiveProject(), { author: 'Test', wordTotal: 0 });
assert(docxAfterArchive.length < docxBefore.length, 'archiving a chapter shrinks the exported docx (it was actually excluded, not just flagged)');
assert(!docxAfterArchive.includes('Chapter One'), 'the archived chapter\'s title does not appear in the export');
Store.unarchiveChapter(contentChapterA.id);
void exportableBefore;

section('§2.3 — trash: soft delete preserves everything, hard delete does not');

const trashTestChapter = Store.createChapter('Will be trashed');
const trashScene = Store.createScene(trashTestChapter.id, { title: 'A scene' });
Store.trashChapter(trashTestChapter.id);
assert(Store.getChapter(trashTestChapter.id).trashedAt !== null, 'trashChapter sets trashedAt');
assertEqual(Store.getChapter(trashTestChapter.id).title, 'Will be trashed', 'the chapter itself, and its scenes, are completely untouched by a soft delete');
assertEqual(Store.getChapter(trashTestChapter.id).scenes.length, 1, 'scenes survive a soft delete');
assert(Store.getTrashedChapters().some((c) => c.id === trashTestChapter.id), 'getTrashedChapters includes it');

Store.restoreChapter(trashTestChapter.id);
assertEqual(Store.getChapter(trashTestChapter.id).trashedAt, null, 'restoreChapter clears trashedAt');
assertEqual(Store.getChapter(trashTestChapter.id).scenes.length, 1, 'the scene is still there after restore — nothing was ever actually lost');
assertEqual(Store.getTrashedChapters().length, 0, 'no longer listed as trashed');

section('§2.3 — permanentlyDeleteChapter actually removes it (unlike trashChapter)');

Store.trashChapter(trashTestChapter.id);
Store.permanentlyDeleteChapter(trashTestChapter.id);
assertEqual(Store.getChapter(trashTestChapter.id), null, 'permanentlyDeleteChapter actually removes the chapter, unlike trashChapter');
void trashScene;

section('§2.3 — recents and collections clean up after a permanent delete, folders need no cleanup');

const cleanupChapter = Store.createChapter('Cleanup target');
Store.recordChapterOpened(cleanupChapter.id);
const cleanupCollection = Store.createCollection('Cleanup Collection');
Store.addChapterToCollection(cleanupCollection.id, cleanupChapter.id);
Store.permanentlyDeleteChapter(cleanupChapter.id);
assert(!Store.getRecentChapters().some((c) => c.id === cleanupChapter.id), 'recents no longer references the permanently-deleted chapter');
assertEqual(Store.getChaptersInCollection(cleanupCollection.id).length, 0, 'the collection no longer references it either');

section('§2.3 — migration backfill for a pre-Organization-pass project');

const legacyDb2 = JSON.parse(Store.exportFullBackup());
const legacyProject2 = legacyDb2.projects[legacyDb2.activeProjectId];
delete legacyProject2.folders;
delete legacyProject2.collections;
delete legacyProject2.savedSearches;
delete legacyProject2.recentChapterIds;
const survivingChapterId = legacyProject2.chapters[0].id;
delete legacyProject2.chapters[0].folderId;
delete legacyProject2.chapters[0].favorite;
delete legacyProject2.chapters[0].pinned;
delete legacyProject2.chapters[0].archived;
delete legacyProject2.chapters[0].trashedAt;

Store.importFullBackup(JSON.stringify(legacyDb2));
const healedProject = Store.getActiveProject();
assert(Array.isArray(healedProject.folders), 'migrate() backfills project.folders');
assert(Array.isArray(healedProject.collections), 'migrate() backfills project.collections');
assert(Array.isArray(healedProject.savedSearches), 'migrate() backfills project.savedSearches');
assert(Array.isArray(healedProject.recentChapterIds), 'migrate() backfills project.recentChapterIds');
const healedChapter = Store.getChapter(survivingChapterId);
assertEqual(healedChapter.folderId, null, 'migrate() backfills chapter.folderId');
assertEqual(healedChapter.favorite, false, 'migrate() backfills chapter.favorite');
assertEqual(healedChapter.pinned, false, 'migrate() backfills chapter.pinned');
assertEqual(healedChapter.archived, false, 'migrate() backfills chapter.archived');
assertEqual(healedChapter.trashedAt, null, 'migrate() backfills chapter.trashedAt');

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
