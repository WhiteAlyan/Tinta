// Tinta — references / research vault (§14) smoke test.
//
// Same convention as calendar.smoketest.mjs, series.smoketest.mjs and
// map.smoketest.mjs: a minimal in-memory localStorage shim, imported
// against the real store.js (no mocking of store internals), asserting
// on observable behavior. Run with: node references.smoketest.mjs
//
// Covers the store-layer surface only (reference CRUD, tag filtering,
// entity/chapter/scene linking, orphan-not-dangle cleanup when a linked
// entity/chapter/scene is deleted, migration backfill for pre-§14 saves).
// The DOM rendering in app.js (renderReferencesView/renderReferenceMain)
// has no automated coverage here — same gap Map/Calendar's own passes
// left for their UI, consistent rather than a regression specific to
// this feature.

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

section('Setup — a fresh project starts with an empty reference catalog');
const project = Store.getActiveProject();
assert(project.references && typeof project.references === 'object', 'project.references exists on a freshly-created project');
assertEqual(Store.getReferenceList().length, 0, 'no references yet');
assert(Array.isArray(Store.getReferenceTypes()) && Store.getReferenceTypes().includes('Note') && Store.getReferenceTypes().includes('Image'), 'getReferenceTypes returns the built-in type list');

section('Reference CRUD');
const note = Store.createReference({ refType: 'Note', title: 'Naming conventions' });
assert(!!note.id, 'createReference returns a reference with an id');
assertEqual(note.refType, 'Note', 'refType set correctly');
assertEqual(note.tags.length, 0, 'a new reference starts with no tags');
assertEqual(Store.getReferenceList().length, 1, 'getReferenceList sees the new reference');
assertEqual(Store.getReference(note.id).title, 'Naming conventions', 'getReference resolves by id');
assertEqual(Store.getReference('nope'), null, 'getReference returns null for an unknown id');

const badType = Store.createReference({ refType: 'NotARealType', title: 'x' });
assertEqual(badType.refType, 'Note', 'createReference falls back to Note for an unrecognized refType rather than storing garbage');

Store.updateReference(note.id, { content: 'Names follow Zaharan phonotactics.', url: 'https://example.com/phonology' });
assertEqual(Store.getReference(note.id).content, 'Names follow Zaharan phonotactics.', 'updateReference patches content');
assertEqual(Store.getReference(note.id).url, 'https://example.com/phonology', 'updateReference patches url');

section('Tags + getDistinctReferenceTags');
Store.updateReference(note.id, { tags: ['worldbuilding', 'language'] });
const quote = Store.createReference({ refType: 'Quote', title: 'Opening line inspiration' });
Store.updateReference(quote.id, { tags: ['language', 'tone'] });
const tagList = Store.getDistinctReferenceTags();
assert(tagList.includes('worldbuilding') && tagList.includes('language') && tagList.includes('tone'), 'getDistinctReferenceTags collects tags across all references');
assertEqual(tagList.length, 3, 'getDistinctReferenceTags de-duplicates shared tags: ' + JSON.stringify(tagList));

section('Linking to entity / chapter / scene');
const hero = Store.createEntity({ name: 'Elena', type: 'character' });
const chapter = project.chapters[0];
const scene = Store.createScene(chapter.id, { title: 'Opening scene' });

Store.updateReference(note.id, { entityId: hero.id, chapterId: chapter.id, sceneId: scene.id });
assertEqual(Store.getReferencesForEntity(hero.id).length, 1, 'getReferencesForEntity finds the linked reference');
assertEqual(Store.getReferencesForChapter(chapter.id).length, 1, 'getReferencesForChapter finds the linked reference');
assertEqual(Store.getReferencesForScene(scene.id).length, 1, 'getReferencesForScene finds the linked reference');
assertEqual(Store.getReferencesForEntity('nope').length, 0, 'getReferencesForEntity returns empty for an unlinked entity');

section('Orphan-not-dangle — deleting a linked entity clears the link, keeps the reference');
Store.deleteEntity(hero.id);
assert(Store.getReference(note.id) !== null, 'reference survives its linked entity being deleted');
assertEqual(Store.getReference(note.id).entityId, null, 'entityId cleared, not left dangling');
assertEqual(Store.getReference(note.id).chapterId, chapter.id, 'chapterId untouched by the entity deletion');

section('Orphan-not-dangle — deleting a linked scene clears sceneId only');
Store.deleteScene(chapter.id, scene.id);
assertEqual(Store.getReference(note.id).sceneId, null, 'sceneId cleared after its scene is deleted');
assertEqual(Store.getReference(note.id).chapterId, chapter.id, 'chapterId still untouched — deleting a scene should not touch its chapter link');

section('Orphan-not-dangle — deleting a linked chapter (and its scenes) clears both');
const scene2 = Store.createScene(chapter.id, { title: 'Another scene' });
Store.updateReference(note.id, { sceneId: scene2.id });
Store.deleteChapter(chapter.id);
assert(Store.getReference(note.id) !== null, 'reference survives its linked chapter being deleted');
assertEqual(Store.getReference(note.id).chapterId, null, 'chapterId cleared after the chapter is deleted');
assertEqual(Store.getReference(note.id).sceneId, null, 'sceneId (belonging to the deleted chapter) also cleared');

section('Delete reference');
const scratch = Store.createReference({ refType: 'URL', title: 'temp' });
assertEqual(Store.getReferenceList().length, 4, 'four references exist before deletion (note, badType, quote, scratch)');
Store.deleteReference(scratch.id);
assertEqual(Store.getReferenceList().length, 3, 'reference removed');
assertEqual(Store.getReference(scratch.id), null, 'getReference confirms it is gone');
Store.deleteReference('nope'); // should no-op, not throw
assert(true, 'deleting an unknown reference id does not throw');

section('Migration — importing a pre-§14 backup backfills project.references');
{
  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  delete legacyDb.projects[legacyProjectId].references;
  assert(legacyDb.projects[legacyProjectId].references === undefined, 'sanity check — the field really is gone in the legacy snapshot');

  Store.importFullBackup(JSON.stringify(legacyDb));
  assert(Store.getActiveProject().references && typeof Store.getActiveProject().references === 'object', 'importing a backup missing `references` backfills it to {} rather than throwing');
  assertEqual(Store.getReferenceList().length, 0, 'the backfilled catalog is empty, not populated with garbage');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
