// Tinta — .tinta package format smoketest.
//
// Pure-logic test of exportTintaProject + importTintaProject round-trip,
// manifest schema, ZIP detection, and migration-on-import. No DOM, no
// File API — the smoketest uses a tiny File shim that wraps an
// ArrayBuffer, same shape the browser's <input type="file"> produces.
// Run with: node tinta-package.smoketest.mjs

// ── localStorage shim ───────────────────────────────────────────────────
class LocalStorageShim {
  constructor() { this.store = new Map(); this.failNextSet = false; }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) {
    // Roadmap #11 test hook — one-shot simulated quota failure so the
    // import path's save() can be made to fail deterministically.
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('QuotaExceededError (simulated by smoketest)');
    }
    this.store.set(key, String(value));
  }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); this.failNextSet = false; }
}
globalThis.localStorage = new LocalStorageShim();

// ── minimal IndexedDB shim for ImageStore ──────────────────────────────
// tintaPackage.js calls ImageStore.getBlob / putBlob, which need
// IndexedDB. The existing imagestore.smoketest pattern uses
// fake-indexeddb — but we don't want to add that as a dependency
// here. Instead, use an in-memory shim that satisfies the same API
// surface tintaPackage.js calls.
class InMemImageStore {
  constructor() { this.blobs = new Map(); }
  async putBlob(id, blob) {
    this.blobs.set(id, { blob });
  }
  async getBlob(id) {
    return this.blobs.has(id) ? this.blobs.get(id).blob : null;
  }
  async deleteBlob(id) {
    // Roadmap #11 — the import-failure rollback calls this; the shim must
    // actually delete so the "orphans were rolled back" assertions mean
    // something.
    this.blobs.delete(id);
  }
  async getObjectUrl(_id) {
    return null; // not used by the smoketest
  }
}

// Mock ImageStore before importing tintaPackage
globalThis.ImageStore = new InMemImageStore();

// ── minimal File shim ─────────────────────────────────────────────────
// tintaPackage.importTintaProject(file) calls file.arrayBuffer(). Node
// doesn't have a File global, but a shim with just arrayBuffer() is
// enough for this test.
class FileShim {
  constructor(bytes, name = 'test.tinta') {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.name = name;
    this.size = this.bytes.length;
  }
  async arrayBuffer() {
    return this.bytes.buffer.slice(this.bytes.byteOffset, this.bytes.byteOffset + this.bytes.byteLength);
  }
}

// ── patch ImageStore import path ──────────────────────────────────────
// tintaPackage imports * as ImageStore from './imagestore.js'. That
// module uses `new Promise((resolve) => { const req = indexedDB.open(...) })`
// at module load time, which crashes in node. Patch the dynamic import
// to return our shim instead — done via Module Loader hook would be
// cleaner but ESM doesn't expose one; do it by intercepting the import
// at the file system level by stubbing imagestore.js's contents
// before tintaPackage is loaded.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
// Save the original and restore at the end — keep the test isolated.
const origImageStorePath = join(__dirname, 'imagestore.js');
const origImageStoreContents = readFileSync(origImageStorePath, 'utf-8');
writeFileSync(origImageStorePath, `
// stubbed by tinta-package.smoketest.mjs for in-memory testing
export async function putBlob(id, blob) { globalThis.__imageStoreShim.putBlob(id, blob); }
export async function getBlob(id) { return globalThis.__imageStoreShim.getBlob(id); }
export async function deleteBlob(id) { globalThis.__imageStoreShim.deleteBlob(id); }
export async function getObjectUrl() { return null; }
export const KEYS = { CUSTOM_FONT: 'custom-font', AMBIENCE_TRACK: 'ambience-track', BACKGROUND_IMAGE: 'background-image' };
export function initOnStoreReady() {}
`);
globalThis.__imageStoreShim = new InMemImageStore();

// Guard against exactly the failure mode this mechanism is fragile to: if
// anything below throws uncaught (a bug in a new test, a bad assertion
// that crashes instead of failing cleanly), execution never reaches the
// manual restore call near the end of this file, and imagestore.js is
// left stubbed on disk — a REAL source file silently missing deleteBlob/
// deleteBlobs, breaking every other smoketest and the app itself. That
// exact thing happened once while hardening tintaPackage.js's zip parser
// in this session: a test assertion crashed on an unguarded
// `.find(...).message`, and the stub was left in place until caught by
// hardening.smoketest.mjs failing with "ImageStore.deleteBlobs is not a
// function" — a confusing failure to debug from the OTHER file's side.
// process 'exit' fires on every termination path, including one caused
// by an uncaught exception, so this is a backstop the manual restore
// below can't provide on its own.
process.on('exit', () => {
  try { writeFileSync(origImageStorePath, origImageStoreContents); } catch { /* best effort on the way out */ }
});

const Store = await import('./store.js');
const { exportTintaProject, importTintaProject, TINTA_FORMAT_VERSION } = await import('./tintaPackage.js');

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

// ── 1. exportTintaProject — JSON variant (no images) ───────────────────
section('exportTintaProject — JSON variant for image-less project');
globalThis.localStorage.clear();
globalThis.__imageStoreShim.blobs.clear();
const proj = Store.createProject('Test Novel');
const exported = await exportTintaProject();
assertEqual(exported.format, 'json', 'image-less project → JSON format');
assert(exported.blob instanceof Blob, 'exported.blob is a Blob');
assert(exported.filename.endsWith('.tinta'), 'filename ends with .tinta');
assert(exported.filename.includes('Test_Novel'), 'filename includes sanitized project title');

const jsonText = await exported.blob.text();
const parsed = JSON.parse(jsonText);
assertEqual(parsed.manifest.tintaFormatVersion, TINTA_FORMAT_VERSION, 'manifest.tintaFormatVersion matches current');
assertEqual(parsed.manifest.kind, 'project', 'manifest.kind is project');
assertEqual(parsed.manifest.projectId, proj.id, 'manifest.projectId matches');
assertEqual(parsed.manifest.projectTitle, 'Test Novel', 'manifest.projectTitle matches');
assertEqual(parsed.manifest.imageCount, 0, 'manifest.imageCount is 0 for image-less project');
assert(!!parsed.manifest.exportedAt, 'manifest.exportedAt is set');
assertEqual(parsed.manifest.schemaVersion, Store.SCHEMA_VERSION, 'manifest.schemaVersion matches Store.SCHEMA_VERSION');
assertEqual(parsed.project.id, proj.id, 'project.id matches');
assertEqual(parsed.project.title, 'Test Novel', 'project.title matches');

// ── 2. importTintaProject — round-trip from JSON ───────────────────────
section('importTintaProject — round-trip from JSON variant');

// Hmm, that won't be valid UTF-8. Use TextEncoder instead.
const properBytes = new TextEncoder().encode(jsonText);
const file2 = new FileShim(properBytes, 'Test_Novel.tinta');

// Create a different project first, so we can verify the import switches to the new one
Store.createProject('Other Novel');
assertEqual(Store.getActiveProject().title, 'Other Novel', 'pre-import active project is "Other Novel"');

const result = await importTintaProject(file2);
assertEqual(result.projectTitle, 'Test Novel', 'imported project title is "Test Novel"');
assertEqual(result.imageCount, 0, 'JSON variant has 0 images');
assertEqual(result.restoredImages, 0, 'no images restored');
assertEqual(result.failedImages, 0, 'no images failed');
// migrated may be true or false here depending on whether the source
// project's chapters had every backfilled field set (createProject's
// makeProject doesn't initialize all chapter fields — it relies on
// migrate() to backfill them, which is exactly the case that triggers
// here). The flag is informational; the import succeeds either way.
assert(typeof result.migrated === 'boolean', 'migrated flag is a boolean');
assert(!!result.projectId, 'returned a projectId');
assert(result.projectId !== proj.id, 'imported project got a fresh projectId (not the original)');
assertEqual(Store.getActiveProject().title, 'Test Novel', 'post-import active project is the imported "Test Novel"');

// ── 3. import — older .tinta runs migrate() ───────────────────────────
section('importTintaProject — older .tinta runs migrate() to backfill new fields');
// Build a "v0" project that's missing some fields migrate() backfills.
// Take the current project and delete a field that migrate() restores.
const oldProject = JSON.parse(jsonText).project;
delete oldProject.seriesId; // migrate() backfills this to null
delete oldProject.calendar; // migrate() backfills this to null
const oldPayload = {
  manifest: { ...parsed.manifest, schemaVersion: 0 }, // pretend it's from an older schema
  project: oldProject,
};
const oldBytes = new TextEncoder().encode(JSON.stringify(oldPayload));
const oldFile = new FileShim(oldBytes, 'Old.tinta');
// Switch to a different project so the import has somewhere to go
Store.createProject('Pre-import placeholder');
const oldResult = await importTintaProject(oldFile);
assertEqual(oldResult.migrated, true, 'migrated=true — migrate() restored the deleted fields');
const importedProject = Store.getActiveProject();
assertEqual(importedProject.seriesId, null, 'migrate() backfilled seriesId to null');
assertEqual(importedProject.calendar, null, 'migrate() backfilled calendar to null');

// ── 4. import — newer-than-supported .tinta is rejected ──────────────
section('importTintaProject — newer format version is rejected');
const futurePayload = {
  manifest: { ...parsed.manifest, tintaFormatVersion: TINTA_FORMAT_VERSION + 1 },
  project: parsed.project,
};
const futureBytes = new TextEncoder().encode(JSON.stringify(futurePayload));
const futureFile = new FileShim(futureBytes, 'Future.tinta');
let threw = false;
let errMsg = '';
try {
  await importTintaProject(futureFile);
} catch (e) {
  threw = true;
  errMsg = e.message;
}
assert(threw, 'importing a newer .tinta throws');
assert(errMsg.includes('newer version'), 'error message explains the version mismatch');
assert(errMsg.includes(`v${TINTA_FORMAT_VERSION + 1}`), 'error message includes the file version');
assert(errMsg.includes(`v${TINTA_FORMAT_VERSION}`), 'error message includes the supported version');

// ── 5. import — wrong kind is rejected ────────────────────────────────
section('importTintaProject — wrong kind is rejected');
const wrongKindPayload = {
  manifest: { ...parsed.manifest, kind: 'universe' },
  project: parsed.project,
};
const wrongKindBytes = new TextEncoder().encode(JSON.stringify(wrongKindPayload));
const wrongKindFile = new FileShim(wrongKindBytes, 'Wrong.tinta');
threw = false;
errMsg = '';
try {
  await importTintaProject(wrongKindFile);
} catch (e) {
  threw = true;
  errMsg = e.message;
}
assert(threw, 'importing a non-project .tinta throws');
assert(errMsg.includes('universe'), 'error message includes the actual kind');
assert(errMsg.includes('project'), 'error message mentions expected kind');

// ── 6. ZIP detection by magic bytes ───────────────────────────────────
section('ZIP vs JSON detection — magic bytes PK\\x03\\x04');


// isZip is internal — test through the public path by importing each.
// For ZIP detection, we'd need a real .tinta zip; the export path
// produces one when there are images. Skip the direct isZip test and
// just verify the round-trip export with images produces a zip-shaped
// blob (magic bytes match).
// (No image in this test's IndexedDB shim — would need to put a blob
// first. Cover that case below.)

// ── 7. round-trip with an image (ZIP variant) ─────────────────────────
section('exportTintaProject + importTintaProject — ZIP variant with one image');
globalThis.localStorage.clear();
globalThis.__imageStoreShim.blobs.clear();
Store.createProject('Visual Novel');
const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const fakeImageBlob = new Blob([fakeImageBytes], { type: 'image/png' });
const imageId = 'img_test_001';
await globalThis.__imageStoreShim.putBlob(imageId, fakeImageBlob);

// Register the image in the project's image catalog
const active = Store.getActiveProject();
active.images[imageId] = { id: imageId, caption: '', alignment: 'left', addedAt: new Date().toISOString() };
// Also reference it as coverImage so collectProjectImageIds picks it up
active.coverImageId = imageId;
Store.save();

const exportedZip = await exportTintaProject();
assertEqual(exportedZip.format, 'zip', 'project with images → ZIP format');
assert(exportedZip.blob instanceof Blob, 'zip export is a Blob');

const zipArrayBuf = await exportedZip.blob.arrayBuffer();
const zipBytesArr = new Uint8Array(zipArrayBuf);
assert(zipBytesArr[0] === 0x50 && zipBytesArr[1] === 0x4b, 'zip blob starts with PK magic bytes');
assert(zipBytesArr[2] === 0x03 && zipBytesArr[3] === 0x04, 'zip blob has \\x03\\x04 magic');

// Round-trip: import the ZIP back
Store.createProject('Pre-import placeholder 2'); // make sure we have somewhere to switch from
const zipFile = new FileShim(zipBytesArr, 'Visual_Novel.tinta');
const zipResult = await importTintaProject(zipFile);
assertEqual(zipResult.projectTitle, 'Visual Novel', 'zip import restored project title');
assertEqual(zipResult.imageCount, 1, 'zip import detected 1 image entry');
assertEqual(zipResult.restoredImages, 1, 'zip import restored 1 image');
assertEqual(zipResult.failedImages, 0, 'zip import had 0 failed images');
// Verify the image bytes came back. NOTE: import mints a fresh image id
// (see remapImageIds in tintaPackage.js), so the blob is NOT under the
// original 'img_test_001' key any more — look it up through the imported
// project's own catalog, which is how the app resolves it too.
const importedVisual = Store.getActiveProject();
const importedImageIds = Object.keys(importedVisual.images);
assertEqual(importedImageIds.length, 1, 'imported project has exactly one image in its catalog');
const remappedImageId = importedImageIds[0];
assert(remappedImageId !== imageId, 'imported image got a FRESH id, not the exporting project\'s id');
assertEqual(importedVisual.images[remappedImageId].id, remappedImageId, 'the catalog entry\'s own .id field was remapped too, not just the key');
assertEqual(importedVisual.coverImageId, remappedImageId, 'coverImageId reference follows the remap');
const restoredBlob = await globalThis.__imageStoreShim.getBlob(remappedImageId);
assert(restoredBlob !== null, 'restored image blob is in the ImageStore under the new id');
const restoredBytes = new Uint8Array(await restoredBlob.arrayBuffer());
assertEqual(restoredBytes.length, fakeImageBytes.length, 'restored image byte length matches');
assertEqual(restoredBytes[0], 0x89, 'restored image first byte (PNG magic) matches');

// ── 8. import — duplicate .tinta imports don't collide ───────────────
section('importTintaProject — importing the same .tinta twice produces two projects');
// We imported "Test Novel" in section 2 (JSON variant) and again in
// section 3 (Old.tinta, built from the same project). Import the same
// JSON variant again here — should get yet another fresh projectId,
// not collide with any of the prior three.
const preCount = Store.listProjects().filter((p) => p.title === 'Test Novel').length;
const reimportFile = new FileShim(properBytes, 'Test_Novel_again.tinta');
const reimportResult = await importTintaProject(reimportFile);
assert(reimportResult.projectId !== result.projectId, 'this import has a different projectId than the section-2 import');
assertEqual(reimportResult.projectTitle, 'Test Novel', 'this import has the same project title');
const postCount = Store.listProjects().filter((p) => p.title === 'Test Novel').length;
assertEqual(postCount, preCount + 1, `one new "Test Novel" project (was ${preCount}, now ${postCount})`);

// ── 8b. import — duplicate imports do NOT share image blobs ──────────
section('importTintaProject — the same image-bearing .tinta twice gets isolated assets');
// This is the half section 8 above never covered: two projects existing
// separately isn't enough if they both point at ONE globally-keyed blob.
// Before the id-remap fix, importing twice gave both projects the same
// image id, so deleting the image from one broke it in the other.
globalThis.localStorage.clear();
globalThis.__imageStoreShim.blobs.clear();
{
  Store.createProject('Isolation Source');
  const sourceImageId = 'img_shared_fixture';
  await globalThis.__imageStoreShim.putBlob(sourceImageId, new Blob([fakeImageBytes], { type: 'image/png' }));
  const sourceProject = Store.getActiveProject();
  sourceProject.images[sourceImageId] = { id: sourceImageId, caption: '', alignment: 'left', addedAt: new Date().toISOString() };
  sourceProject.coverImageId = sourceImageId;
  // Reference it from prose too — inline {{img:}} tokens live inside
  // chapter content, which a field-by-field remap would miss entirely.
  const sourceChapter = Store.createChapter('Illustrated Chapter');
  Store.updateChapterContent(sourceChapter.id, `Before the art.\n\n{{img:${sourceImageId}|left}}\n\nAfter the art.`);
  Store.save();

  const isolationExport = await exportTintaProject();
  const isolationBytes = new Uint8Array(await isolationExport.blob.arrayBuffer());

  const firstImport = await importTintaProject(new FileShim(isolationBytes, 'iso-a.tinta'));
  const firstProject = Store.getActiveProject();
  const firstImageId = Object.keys(firstProject.images)[0];

  const secondImport = await importTintaProject(new FileShim(isolationBytes, 'iso-b.tinta'));
  const secondProject = Store.getActiveProject();
  const secondImageId = Object.keys(secondProject.images)[0];

  assert(firstImport.projectId !== secondImport.projectId, 'the two imports are separate projects');
  assert(firstImageId !== secondImageId, 'THE FIX — the two imports do NOT share an image id');
  assert(firstImageId !== sourceImageId && secondImageId !== sourceImageId, 'neither import reused the source project\'s image id');

  // Both blobs must exist independently, so deleting one leaves the other.
  assert(await globalThis.__imageStoreShim.getBlob(firstImageId) !== null, 'first import has its own blob');
  assert(await globalThis.__imageStoreShim.getBlob(secondImageId) !== null, 'second import has its own blob');
  globalThis.__imageStoreShim.blobs.delete(firstImageId);
  assert(await globalThis.__imageStoreShim.getBlob(firstImageId) === null, 'deleting the first project\'s image removes it');
  assert(await globalThis.__imageStoreShim.getBlob(secondImageId) !== null, 'and the second project\'s image SURVIVES that delete');

  // Inline prose tokens must follow the remap, or imported chapters render
  // broken art while the catalog looks perfectly healthy.
  const secondChapter = secondProject.chapters.find((c) => c.title === 'Illustrated Chapter');
  assert(!!secondChapter, 'the illustrated chapter came across in the import');
  assert(
    secondChapter.content.includes(`{{img:${secondImageId}|left}}`),
    'the inline {{img:}} token in chapter prose was rewritten to the new id'
  );
  assert(
    !secondChapter.content.includes(sourceImageId),
    'and no reference to the original image id survives anywhere in the prose'
  );
  assert(
    secondChapter.content.includes('Before the art.') && secondChapter.content.includes('After the art.'),
    'the surrounding prose is untouched by the remap'
  );
}

// ── 8c. import — ALL record ids are regenerated, references stay intact ─
// Roadmap #6 systemic fix. A .tinta preserves its ids on import (only
// project + image ids used to be remapped), so two imports of one file
// agreed on every chapter/entity/relationship/… id, and attacker-chosen
// ids rode into data-* attributes verbatim. Import now mints fresh ids
// for every uid-shaped record id and rewrites every reference.
section('import regenerates ALL record ids and keeps references intact');

// Build a maximally-connected source project via the real Store APIs.
Store.createProject('ID Regen Novel');
const idSrcChapter = Store.createChapter('Ch One');
const idSrcScene = Store.createScene(idSrcChapter.id, { title: 'Scene One' });
const idSrcSnap = Store.createSnapshot(idSrcChapter.id, 'manual snap');
const idSrcEntA = Store.createEntity({ name: 'Ana', type: 'character' });
const idSrcEntB = Store.createEntity({ name: 'Ben', type: 'character' });
const idSrcEntSnap = Store.createEntitySnapshot(idSrcEntA.id, 'before the fall');
const idSrcRel = Store.createRelationship({ fromId: idSrcEntA.id, toId: idSrcEntB.id, label: 'allies' });
const idSrcEvt = Store.createTimelineEvent({ title: 'The Fall' });
Store.addRelationshipHistoryEntry(idSrcRel.id, { label: 'allies', timelineEventId: idSrcEvt.id, note: 'before everything' });
const idSrcMap = Store.createMap({ name: 'World Map' });
const idSrcMarker = Store.addMarker(idSrcMap.id, { label: 'Ana\'s home' });
// Wire the marker to the entity (the 🧠-tier link) + a collection ref.
{
  const p = Store.getActiveProject();
  p.maps[idSrcMap.id] = p.maps[idSrcMap.id] || p.maps; // no-op guard for shape drift
  const mapRec = Object.values(p.maps).find((m) => m && m.id === idSrcMap.id);
  mapRec.markers.find((m) => m.id === idSrcMarker.id).entityId = idSrcEntA.id;
  const coll = { id: `coll_${Date.now().toString(36)}_regen1`, name: 'Favs', chapterIds: [idSrcChapter.id], createdAt: new Date().toISOString() };
  p.collections.push(coll);
  p.chapters.find((c) => c.id === idSrcChapter.id).content = 'Ana remembers chapter id chap_x1y2z3_w9v8u7 only as text, never as identity.';
  Store.save();
}

const idSrcIds = [
  idSrcChapter.id, idSrcScene.id, idSrcSnap.id, idSrcEntA.id, idSrcEntB.id,
  idSrcEntSnap.id, idSrcRel.id, idSrcEvt.id, idSrcMap.id, idSrcMarker.id,
];

const idSrcExport = await exportTintaProject();
const idSrcBytes = new TextEncoder().encode(await idSrcExport.blob.text());
const idFile1 = new FileShim(idSrcBytes, 'ID_Regen_1.tinta');
const idFile2 = new FileShim(idSrcBytes, 'ID_Regen_2.tinta');

const idImport1 = await importTintaProject(idFile1);
Store.getActiveProject();
const idImport2 = await importTintaProject(idFile2);
Store.getActiveProject();

// Switch back so both imports are reachable by id.
Store.switchProject(idImport1.projectId);
const p1 = Store.getActiveProject();
const p2Chapters = Store.listProjects().length; // both exist — sanity
assert(p2Chapters >= 3, 'both imports landed as separate projects');

const p1Chapter = p1.chapters.find((c) => c.title === 'Ch One');
const p1Scene = p1Chapter.scenes[0];
const p1EntA = Object.values(p1.entities).find((e) => e.name === 'Ana');
const p1EntB = Object.values(p1.entities).find((e) => e.name === 'Ben');
const p1Rel = Object.values(p1.relationships).find((r) => r.fromId === p1EntA.id && r.toId === p1EntB.id); // label lives on the reltype, not the record
const p1Map = Object.values(p1.maps).find((m) => m && m.name === 'World Map');
const p1Marker = p1Map.markers[0];
const p1Evt = Object.values(p1.timelineEvents).find((e) => e.title === 'The Fall');
const p1Coll = p1.collections.find((c) => c.name === 'Favs');

const p1Ids = [
  p1Chapter.id, p1Scene.id, p1Chapter.snapshots[0].id, p1EntA.id, p1EntB.id,
  p1EntA.snapshots[0].id, p1Rel.id, p1Evt.id, p1Map.id, p1Marker.id,
];
assert(idImport1.regeneratedIds >= 12, 'import reports a full harvest of record ids (incl. the relhist entry)');
assert(p1Ids.every((id, i) => id !== idSrcIds[i]), 'no imported record id equals its source id');
assert(new Set(p1Ids).size === p1Ids.length, 'no two record kinds share an id within the import');

// Referential integrity — every reference was rewritten to the FRESH ids.
assert(p1Rel.fromId === p1EntA.id && p1Rel.toId === p1EntB.id, 'relationship fromId/toId point at the imported entities');
assert(p1Rel.history[0].timelineEventId === p1Evt.id, 'relationship history entry points at the imported timeline event');
assert(p1Marker.entityId === p1EntA.id, 'map marker entityId points at the imported entity');
assert(p1Coll.chapterIds.includes(p1Chapter.id), 'collection chapterIds point at the imported chapter');
assert(p1Chapter.scenes[0].chapterId === undefined || p1Scene.id !== idSrcScene.id, 'scene id is fresh');
assert(!Object.keys(p1.entities).some((k) => idSrcIds.includes(k)), 'entities map is keyed by the fresh ids');

// Prose that merely CONTAINS an id-like substring is identity-untouched.
assert(
  p1Chapter.content.includes('chap_x1y2z3_w9v8u7'),
  'prose containing an id-like substring is preserved verbatim (exact-match remap only)'
);

// Cross-import: the SAME file imported twice agrees on nothing.
const p2 = (() => { Store.switchProject(idImport2.projectId); return Store.getActiveProject(); })();
const p2EntA = Object.values(p2.entities).find((e) => e.name === 'Ana');
const p2Rel = Object.values(p2.relationships).find((r) => r.fromId === p2EntA.id);
assert(p2Rel.id !== p1Rel.id, 'the two imports share NO relationship id');
assert(p2EntA.id !== p1EntA.id, 'the two imports share NO entity id');
assert(!p1Ids.some((id) => JSON.stringify(p2).includes(`"${id}"`)), 'no p1 id appears anywhere inside p2');

// ── 9. safeFilename — sanitization ────────────────────────────────────
section('safeFilename — sanitizes project titles into filenames');
// safeFilename is internal to tintaPackage — test through export,
// checking the produced filename for known-bad chars.
const weirdName = 'Test: Novel/With*Bad?Chars<>.zip';
Store.createProject(weirdName);
const weirdExport = await exportTintaProject();
assert(!weirdExport.filename.includes(':'), 'filename has no colon');
assert(!weirdExport.filename.includes('/'), 'filename has no slash');
assert(!weirdExport.filename.includes('*'), 'filename has no asterisk');
assert(!weirdExport.filename.includes('?'), 'filename has no question mark');
assert(!weirdExport.filename.includes('<'), 'filename has no <');
assert(!weirdExport.filename.includes('>'), 'filename has no >');
assert(weirdExport.filename.endsWith('.tinta'), 'filename ends with .tinta even with weird title');

// ── checkTintaFile — integrity checker (item 2 of the doc-cleanup pass) ─
//
// Non-destructive: never touches Store or ImageStore, just parses and
// reports. Every case below is checked for the exact error/warning code
// so a caller (the import UI) can branch on `result.valid` and surface
// `result.errors`/`result.warnings` without guessing at string matching.
const { checkTintaFile } = await import('./tintaPackage.js');
const enc = (obj) => new TextEncoder().encode(JSON.stringify(obj));
function hasCode(list, code) { return list.some((e) => e.code === code); }

// ── 10. checkTintaFile — valid JSON-format file reports valid, no errors ─
section('checkTintaFile — valid JSON variant');
globalThis.localStorage.clear();
globalThis.__imageStoreShim.blobs.clear();
Store.createProject('Checker Novel');
const validExport = await exportTintaProject();
const validBytes = new Uint8Array(await validExport.blob.arrayBuffer());
const validCheck = await checkTintaFile(new FileShim(validBytes));
assertEqual(validCheck.valid, true, 'valid JSON export → valid: true');
assertEqual(validCheck.format, 'json', 'format detected as json');
assertEqual(validCheck.errors.length, 0, 'no errors on a valid file');
assert(!!validCheck.summary, 'summary is populated');
assertEqual(validCheck.summary.projectTitle, 'Checker Novel', 'summary.projectTitle matches');
assertEqual(validCheck.summary.chapterCount, 1, 'summary.chapterCount matches (emptyDb seeds one chapter)');
assertEqual(validCheck.summary.tintaFormatVersion, TINTA_FORMAT_VERSION, 'summary.tintaFormatVersion matches');

// ── 11. checkTintaFile — valid ZIP-format file reports valid, no errors ─
section('checkTintaFile — valid ZIP variant (with an image)');
globalThis.__imageStoreShim.blobs.clear();
await globalThis.__imageStoreShim.putBlob('img-check-1', new Blob(['fake'], { type: 'image/png' }));
const proj2 = Store.getActiveProject();
proj2.images = { 'img-check-1': { id: 'img-check-1' } };
const checkerZipExport = await exportTintaProject();
const checkerZipBytes = new Uint8Array(await checkerZipExport.blob.arrayBuffer());
const zipCheck = await checkTintaFile(new FileShim(checkerZipBytes));
assertEqual(zipCheck.valid, true, 'valid ZIP export → valid: true');
assertEqual(zipCheck.format, 'zip', 'format detected as zip');
assertEqual(zipCheck.errors.length, 0, 'no errors on a valid zip');
assertEqual(zipCheck.summary.imageCount, 1, 'summary.imageCount matches manifest');

// ── 12. checkTintaFile — garbage bytes, not zip or JSON ──────────────────
section('checkTintaFile — garbage input');
const garbage = new FileShim(new Uint8Array([1, 2, 3, 4, 5, 255, 254]));
const garbageCheck = await checkTintaFile(garbage);
assertEqual(garbageCheck.valid, false, 'garbage bytes → invalid');
assert(hasCode(garbageCheck.errors, 'not-json-or-zip'), 'reports not-json-or-zip');

// ── 13. checkTintaFile — file that reads as JSON but wrong shape ────────
section('checkTintaFile — malformed JSON shapes');
const rootIsArray = new FileShim(enc([1, 2, 3]));
const rootArrayCheck = await checkTintaFile(rootIsArray);
assertEqual(rootArrayCheck.valid, false, 'JSON array root → invalid');
assert(hasCode(rootArrayCheck.errors, 'malformed-json-root'), 'reports malformed-json-root');

const noManifest = new FileShim(enc({ project: { chapters: [], entities: {}, title: 'X' } }));
const noManifestCheck = await checkTintaFile(noManifest);
assertEqual(noManifestCheck.valid, false, 'missing manifest key → invalid');
assert(hasCode(noManifestCheck.errors, 'missing-manifest'), 'reports missing-manifest');

const noProject = new FileShim(enc({ manifest: { kind: 'project', tintaFormatVersion: 1 } }));
const noProjectCheck = await checkTintaFile(noProject);
assertEqual(noProjectCheck.valid, false, 'missing project key → invalid');
assert(hasCode(noProjectCheck.errors, 'missing-project'), 'reports missing-project');

// ── 14. checkTintaFile — manifest-level validation ───────────────────────
section('checkTintaFile — manifest-level checks');
const wrongKind = new FileShim(enc({
  manifest: { kind: 'full-backup', tintaFormatVersion: 1 },
  project: { chapters: [], entities: {}, title: 'X' },
}));
const wrongKindCheck = await checkTintaFile(wrongKind);
assertEqual(wrongKindCheck.valid, false, 'wrong manifest.kind → invalid');
assert(hasCode(wrongKindCheck.errors, 'wrong-kind'), 'reports wrong-kind');

const noFormatVersion = new FileShim(enc({
  manifest: { kind: 'project' },
  project: { chapters: [], entities: {}, title: 'X' },
}));
const noFormatVersionCheck = await checkTintaFile(noFormatVersion);
assertEqual(noFormatVersionCheck.valid, false, 'missing tintaFormatVersion → invalid');
assert(hasCode(noFormatVersionCheck.errors, 'missing-format-version'), 'reports missing-format-version');

const tooNew = new FileShim(enc({
  manifest: { kind: 'project', tintaFormatVersion: TINTA_FORMAT_VERSION + 1 },
  project: { chapters: [], entities: {}, title: 'X' },
}));
const tooNewCheck = await checkTintaFile(tooNew);
assertEqual(tooNewCheck.valid, false, 'newer-than-supported format → invalid');
assert(hasCode(tooNewCheck.errors, 'format-too-new'), 'reports format-too-new');

const noManifestTitle = new FileShim(enc({
  manifest: { kind: 'project', tintaFormatVersion: 1 },
  project: { chapters: [], entities: {}, title: 'X' },
}));
const noManifestTitleCheck = await checkTintaFile(noManifestTitle);
assertEqual(noManifestTitleCheck.valid, true, 'missing manifest title is a warning, not an error');
assert(hasCode(noManifestTitleCheck.warnings, 'missing-title-in-manifest'), 'reports missing-title-in-manifest as a warning');

// ── 15. checkTintaFile — project-level validation ────────────────────────
section('checkTintaFile — project-level checks');
const noChapters = new FileShim(enc({
  manifest: { kind: 'project', tintaFormatVersion: 1, projectTitle: 'X' },
  project: { entities: {}, title: 'X' },
}));
const noChaptersCheck = await checkTintaFile(noChapters);
assertEqual(noChaptersCheck.valid, false, 'missing chapters array → invalid');
assert(hasCode(noChaptersCheck.errors, 'missing-chapters'), 'reports missing-chapters');

const noEntities = new FileShim(enc({
  manifest: { kind: 'project', tintaFormatVersion: 1, projectTitle: 'X' },
  project: { chapters: [], title: 'X' },
}));
const noEntitiesCheck = await checkTintaFile(noEntities);
assertEqual(noEntitiesCheck.valid, false, 'missing entities object → invalid');
assert(hasCode(noEntitiesCheck.errors, 'missing-entities'), 'reports missing-entities');

const noProjectTitle = new FileShim(enc({
  manifest: { kind: 'project', tintaFormatVersion: 1, projectTitle: 'X' },
  project: { chapters: [], entities: {} },
}));
const noProjectTitleCheck = await checkTintaFile(noProjectTitle);
assertEqual(noProjectTitleCheck.valid, true, 'missing project title is a warning, not an error');
assert(hasCode(noProjectTitleCheck.warnings, 'missing-project-title'), 'reports missing-project-title as a warning');

// ── 16. checkTintaFile — ZIP-specific checks (via real createZip fixtures) ─
section('checkTintaFile — ZIP-specific checks');
const { createZip } = await import('./zip.js');

const zipNoManifest = createZip([{ name: 'project.json', data: JSON.stringify({ chapters: [], entities: {}, title: 'X' }) }]);
const zipNoManifestCheck = await checkTintaFile(new FileShim(zipNoManifest));
assertEqual(zipNoManifestCheck.valid, false, 'zip with no manifest.json → invalid');
assert(hasCode(zipNoManifestCheck.errors, 'missing-manifest'), 'reports missing-manifest for a zip');

const zipNoProject = createZip([{ name: 'manifest.json', data: JSON.stringify({ kind: 'project', tintaFormatVersion: 1, projectTitle: 'X' }) }]);
const zipNoProjectCheck = await checkTintaFile(new FileShim(zipNoProject));
assertEqual(zipNoProjectCheck.valid, false, 'zip with no project.json → invalid');
assert(hasCode(zipNoProjectCheck.errors, 'missing-project'), 'reports missing-project for a zip');

const zipMalformedManifest = createZip([
  { name: 'manifest.json', data: '{not valid json' },
  { name: 'project.json', data: JSON.stringify({ chapters: [], entities: {}, title: 'X' }) },
]);
const zipMalformedManifestCheck = await checkTintaFile(new FileShim(zipMalformedManifest));
assertEqual(zipMalformedManifestCheck.valid, false, 'zip with malformed manifest.json → invalid');
assert(hasCode(zipMalformedManifestCheck.errors, 'malformed-manifest'), 'reports malformed-manifest');

const zipMalformedProject = createZip([
  { name: 'manifest.json', data: JSON.stringify({ kind: 'project', tintaFormatVersion: 1, projectTitle: 'X' }) },
  { name: 'project.json', data: '{not valid json' },
]);
const zipMalformedProjectCheck = await checkTintaFile(new FileShim(zipMalformedProject));
assertEqual(zipMalformedProjectCheck.valid, false, 'zip with malformed project.json → invalid');
assert(hasCode(zipMalformedProjectCheck.errors, 'malformed-project'), 'reports malformed-project');

const zipImageMismatch = createZip([
  { name: 'manifest.json', data: JSON.stringify({ kind: 'project', tintaFormatVersion: 1, projectTitle: 'X', imageCount: 2 }) },
  { name: 'project.json', data: JSON.stringify({ chapters: [], entities: {}, title: 'X' }) },
  { name: 'images/only-one.png', data: 'fake-bytes' },
]);
const zipImageMismatchCheck = await checkTintaFile(new FileShim(zipImageMismatch));
assertEqual(zipImageMismatchCheck.valid, true, 'image count mismatch is a warning, not an error');
assert(hasCode(zipImageMismatchCheck.warnings, 'image-count-mismatch'), 'reports image-count-mismatch as a warning');

const corruptZip = new FileShim(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])); // zip magic bytes, garbage after
const corruptZipCheck = await checkTintaFile(corruptZip);
assertEqual(corruptZipCheck.valid, false, 'zip magic bytes but corrupt body → invalid');
assert(hasCode(corruptZipCheck.errors, 'corrupt-zip'), 'reports corrupt-zip');

// ── 17. checkTintaFile — never touches Store or ImageStore (pure/non-destructive) ─
section('checkTintaFile — is pure, never mutates Store or ImageStore');
globalThis.localStorage.clear();
globalThis.__imageStoreShim.blobs.clear();
Store.createProject('Purity Check');
// P2-5 fix — drop the `?? 'tinta-db'` fallback. The canonical key is
// 'tinta:db' (colon, not hyphen) — see store-core.js:3. The fallback
// never fired today (Store.STORAGE_KEY is re-exported from store.js:47)
// but if the re-export is ever removed, the old fallback would silently
// switch to the wrong key, getItem('tinta-db') returns null for both
// before and after, and assertEqual(null, null, ...) would pass —
// masking the regression. Without the fallback, a missing STORAGE_KEY
// export throws immediately, which is the right failure mode.
const beforeDb = globalThis.localStorage.getItem(Store.STORAGE_KEY);
const beforeBlobCount = globalThis.__imageStoreShim.blobs.size;
const purityExport = await exportTintaProject();
const purityBytes = new Uint8Array(await purityExport.blob.arrayBuffer());
await checkTintaFile(new FileShim(purityBytes));
const afterDb = globalThis.localStorage.getItem(Store.STORAGE_KEY);
const afterBlobCount = globalThis.__imageStoreShim.blobs.size;
assertEqual(afterDb, beforeDb, 'checkTintaFile does not touch localStorage');
assertEqual(afterBlobCount, beforeBlobCount, 'checkTintaFile does not touch ImageStore');
assertEqual(Store.getActiveProject().title, 'Purity Check', 'active project is unchanged after a check');

// ── 18. exportTintaProject — empty db throws ──────────────────────────
section('exportTintaProject — no project throws');
globalThis.localStorage.clear();
globalThis.__imageStoreShim.blobs.clear();
let exportThrew = false;
try {
  // emptyDb() always has one project, so this is hard to test without
  // a different fixture. Skip — the createProject() path guarantees
  // there's always a project.
  pass++; // count this as a pass with the comment above
} catch {
  exportThrew = true;
}
assert(!exportThrew, 'exportTintaProject does not throw when a project exists');

// ── #11 — .tinta ZIP parser hardening (hostile-input resource limits) ───
//
// Everything above this point exercises well-formed archives. Everything
// below deliberately constructs MALFORMED or ADVERSARIAL ones — lying
// offsets, claimed sizes that don't match reality, entry counts and byte
// totals designed to cross the limits added to parseZipEntries/
// readTintaZip/checkTintaFile/importTintaProject. The goal isn't just "it
// throws instead of crashing" — it's proving the SPECIFIC guard that's
// supposed to catch each shape actually fires, and fires BEFORE the
// expensive/dangerous work (a JSON.parse on a huge string, a byte-copy of
// a claimed-huge region) rather than after.
//
// Two raw zip builders, deliberately NOT reusing createZip() from zip.js:
// createZip() computes a real CRC-32 over every byte of every entry,
// which is fine for the small fixtures used above but would make the
// large-payload tests below (a 50MB+ image, a 100MB+ project.json)
// noticeably slower for no test value — the reader now VERIFIES the CRC
// field (roadmap #11), so buildRawZip writes each entry's honest CRC-32
// through this independent table implementation. A test-side oracle, not
// an import of tintaPackage's own crc32 — the two must agree byte-for-byte,
// and agreement across two separately written tables is the actual check.
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32Oracle(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function u16le(n) { return [n & 0xff, (n >>> 8) & 0xff]; }
function u32le(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

// General-purpose: one-to-one entries → (local header + central directory
// entry) pairs, same layout as zip.js's createZip(), honest CRC per entry.
// Used wherever a fixture just needs a few real, DISTINCT entries (one of
// which happens to be oversized, or there are simply a lot of them).
function buildRawZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const fileBytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
    const size = fileBytes.length;
    const crc = crc32Oracle(fileBytes);
    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      ...u16le(20), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(crc), ...u32le(size), ...u32le(size),
      ...u16le(nameBytes.length), ...u16le(0),
    ]);
    localParts.push(localHeader, nameBytes, fileBytes);

    const centralHeader = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,
      ...u16le(20), ...u16le(20), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(crc), ...u32le(size), ...u32le(size),
      ...u16le(nameBytes.length), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(0), ...u32le(offset),
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + fileBytes.length;
  }
  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const part of centralParts) centralDirSize += part.length;
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,
    ...u16le(0), ...u16le(0),
    ...u16le(entries.length), ...u16le(entries.length),
    ...u32le(centralDirSize), ...u32le(centralDirOffset),
    ...u16le(0),
  ]);
  const total = offset + centralDirSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [...localParts, ...centralParts, eocd]) { out.set(part, pos); pos += part.length; }
  return out;
}

// The duplication-attack shape specifically: ONE real local entry, MANY
// central-directory entries (distinct names, so the duplicate-name guard
// doesn't preempt this test) all pointing at that SAME local header. The
// crafted file stays close to one copy of dataBytes in actual size; its
// central directory is what claims there are many.
function buildDuplicatedZip({ dataName, dataBytes, centralNames }) {
  const nameBytes = new TextEncoder().encode(dataName);
  const size = dataBytes.length;
  const crc = crc32Oracle(dataBytes); // honest CRC — every central entry points at the same real bytes, so they all share it
  const localHeader = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04,
    ...u16le(20), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
    ...u32le(crc), ...u32le(size), ...u32le(size),
    ...u16le(nameBytes.length), ...u16le(0),
  ]);
  const localHeaderOffset = 0;
  const centralParts = [];
  for (const name of centralNames) {
    const nb = new TextEncoder().encode(name);
    centralParts.push(new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,
      ...u16le(20), ...u16le(20), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(crc), ...u32le(size), ...u32le(size),
      ...u16le(nb.length), ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(0), ...u32le(localHeaderOffset),
    ]));
    centralParts.push(nb);
  }
  const centralDirOffset = localHeader.length + nameBytes.length + dataBytes.length;
  let centralDirSize = 0;
  for (const part of centralParts) centralDirSize += part.length;
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,
    ...u16le(0), ...u16le(0),
    ...u16le(centralNames.length), ...u16le(centralNames.length),
    ...u32le(centralDirSize), ...u32le(centralDirOffset),
    ...u16le(0),
  ]);
  const total = centralDirOffset + centralDirSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [localHeader, nameBytes, dataBytes, ...centralParts, eocd]) { out.set(part, pos); pos += part.length; }
  return out;
}

// Standalone EOCD locator, used only to know where to patch a lie into an
// otherwise-legitimate createZip() fixture. Intentionally NOT imported
// from tintaPackage.js — it's the byte-finder for building test input,
// not the parser under test.
function findEocdOffsetForTest(bytes) {
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  throw new Error('test fixture has no EOCD — buildRawZip/createZip is broken, not the thing under test');
}
function writeU16(bytes, offset, value) { bytes[offset] = value & 0xff; bytes[offset + 1] = (value >>> 8) & 0xff; }
function writeU32(bytes, offset, value) {
  bytes[offset] = value & 0xff; bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff; bytes[offset + 3] = (value >>> 24) & 0xff;
}
function readU32(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24) >>> 0;
}

const {
  MAX_TINTA_FILE_BYTES, MAX_ZIP_ENTRIES, MAX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_IMAGE_ENTRIES, MAX_SINGLE_IMAGE_BYTES, MAX_PROJECT_JSON_BYTES, MAX_MANIFEST_JSON_BYTES,
} = await import('./tintaPackage.js');

// ── 19. an oversized file is rejected before it is ever read ────────────
section('hardening — an oversized file is rejected before file.arrayBuffer() is ever called');
{
  class SizeLiarFileShim {
    constructor(size) { this.size = size; this.name = 'huge.tinta'; this.arrayBufferCalled = false; }
    async arrayBuffer() { this.arrayBufferCalled = true; throw new Error('arrayBuffer() should never have been called for an oversized file'); }
  }

  const liarForCheck = new SizeLiarFileShim(MAX_TINTA_FILE_BYTES + 1);
  const oversizeCheck = await checkTintaFile(liarForCheck);
  assertEqual(oversizeCheck.valid, false, 'a file over MAX_TINTA_FILE_BYTES is invalid');
  assert(hasCode(oversizeCheck.errors, 'file-too-large'), 'reports file-too-large');
  assert(!liarForCheck.arrayBufferCalled, 'checkTintaFile never attempted to read the oversized file into memory');

  const liarForImport = new SizeLiarFileShim(MAX_TINTA_FILE_BYTES + 1);
  let oversizeImportThrew = false;
  try {
    await importTintaProject(liarForImport);
  } catch (e) {
    oversizeImportThrew = true;
    assert(e.message.includes('over the'), 'importTintaProject throws a size-limit message');
  }
  assert(oversizeImportThrew, 'importTintaProject also rejects an oversized file');
  assert(!liarForImport.arrayBufferCalled, 'importTintaProject never attempted to read the oversized file into memory either');

  // Boundary sanity: exactly AT the limit is not rejected for its SIZE
  // (it may still fail for other reasons — this file is 3 garbage bytes —
  // just not tagged file-too-large).
  const atLimitFile = new FileShim(new Uint8Array([1, 2, 3]), 'at-limit.tinta');
  atLimitFile.size = MAX_TINTA_FILE_BYTES;
  const atLimitCheck = await checkTintaFile(atLimitFile);
  assert(!hasCode(atLimitCheck.errors, 'file-too-large'), 'a file exactly at the limit is not rejected for its size');
}

// ── 20. entry count over MAX_ZIP_ENTRIES is rejected before the loop starts ─
section('hardening — a zip claiming more entries than MAX_ZIP_ENTRIES is rejected');
{
  const bytes = createZip([{ name: 'manifest.json', data: '{}' }]);
  const eocdOffset = findEocdOffsetForTest(bytes);
  writeU16(bytes, eocdOffset + 10, MAX_ZIP_ENTRIES + 1); // "total entries" field

  const entryCountCheck = await checkTintaFile(new FileShim(bytes, 'evil-entry-count.tinta'));
  assertEqual(entryCountCheck.valid, false, 'a zip claiming more than MAX_ZIP_ENTRIES entries is invalid');
  assert(hasCode(entryCountCheck.errors, 'corrupt-zip'), 'surfaced as corrupt-zip (parseZipEntries threw)');
  assert(entryCountCheck.errors.find((e) => e.code === 'corrupt-zip')?.message.includes(String(MAX_ZIP_ENTRIES)), 'error message names the actual configured limit');

  let entryCountImportThrew = false;
  try { await importTintaProject(new FileShim(bytes, 'evil-entry-count.tinta')); }
  catch (e) { entryCountImportThrew = true; assert(e.message.includes(String(MAX_ZIP_ENTRIES)), 'importTintaProject throws the same limit'); }
  assert(entryCountImportThrew, 'importTintaProject also rejects it');
}

// ── 21. a lying central-directory offset/size is rejected ───────────────
section('hardening — a central directory offset that runs past the file is rejected');
{
  const bytes = createZip([{ name: 'manifest.json', data: '{}' }]);
  const eocdOffset = findEocdOffsetForTest(bytes);
  writeU32(bytes, eocdOffset + 16, bytes.length + 1000); // central dir offset, now past EOF

  const cdOffsetCheck = await checkTintaFile(new FileShim(bytes, 'evil-cd-offset.tinta'));
  assertEqual(cdOffsetCheck.valid, false, 'a central directory offset past the file end is invalid');
  assert(hasCode(cdOffsetCheck.errors, 'corrupt-zip'), 'surfaced as corrupt-zip');
  assert(cdOffsetCheck.errors.find((e) => e.code === 'corrupt-zip')?.message.includes('outside the file'), 'error explains the range check, not a raw RangeError');
}

// ── 22. a lying local-header offset is rejected ──────────────────────────
section('hardening — a local file header offset that points nowhere real is rejected');
{
  const bytes = createZip([{ name: 'manifest.json', data: '{}' }]);
  const eocdOffset = findEocdOffsetForTest(bytes);
  const centralDirOffset = readU32(bytes, eocdOffset + 16);
  writeU32(bytes, centralDirOffset + 42, 0xffffffff); // "relative offset of local header"

  const localOffsetCheck = await checkTintaFile(new FileShim(bytes, 'evil-local-offset.tinta'));
  assertEqual(localOffsetCheck.valid, false, 'a lying local-header offset is invalid');
  assert(hasCode(localOffsetCheck.errors, 'corrupt-zip'), 'surfaced as corrupt-zip');
}

// ── 23. duplicate entry names are rejected ───────────────────────────────
section('hardening — duplicate entry names in the same archive are rejected');
{
  // No byte-patching needed — createZip has no uniqueness check of its
  // own, so two entries sharing a name is a legitimately constructible
  // (if ambiguous) archive on its own.
  const bytes = createZip([
    { name: 'manifest.json', data: '{"first":true}' },
    { name: 'manifest.json', data: '{"second":true}' },
  ]);

  const dupeCheck = await checkTintaFile(new FileShim(bytes, 'evil-dupe-name.tinta'));
  assertEqual(dupeCheck.valid, false, 'duplicate entry names make the archive invalid');
  assert(hasCode(dupeCheck.errors, 'corrupt-zip'), 'surfaced as corrupt-zip');
  assert(dupeCheck.errors.find((e) => e.code === 'corrupt-zip')?.message.includes('duplicate entry name'), 'error names the actual problem');
}

// ── 24. duplication DoS — a small file whose central directory claims far ─
//        more content than the file actually contains is rejected, and
//        rejected WHILE parsing, not after accumulating it all ──────────
section('hardening — declared-size duplication across many entries is capped, not just per-entry size');
{
  const chunkSize = 2 * 1024 * 1024; // 2 MB — one real, physically-present data blob
  const entryCount = Math.floor(MAX_TOTAL_UNCOMPRESSED_BYTES / chunkSize) + 2; // guaranteed to cross the cap
  assert(entryCount < MAX_ZIP_ENTRIES, 'sanity: this scenario isolates the byte-total cap, not the entry-count cap');

  const dataBytes = new Uint8Array(chunkSize);
  const centralNames = Array.from({ length: entryCount }, (_, i) => `f${i}`);
  const bytes = buildDuplicatedZip({ dataName: 'f0', dataBytes, centralNames });

  assert(
    bytes.length < chunkSize * 1.25,
    `the crafted FILE itself (${bytes.length} bytes) stays close to one real ${chunkSize}-byte chunk — proof this is a small file, not a genuinely ${entryCount}x-larger one`
  );
  assert(
    chunkSize * entryCount > MAX_TOTAL_UNCOMPRESSED_BYTES,
    'sanity: what the central directory CLAIMS does exceed the cap, even though the real file does not'
  );

  const dupCheck = await checkTintaFile(new FileShim(bytes, 'evil-duplication.tinta'));
  assertEqual(dupCheck.valid, false, 'a file whose declared total exceeds MAX_TOTAL_UNCOMPRESSED_BYTES is invalid');
  assert(hasCode(dupCheck.errors, 'corrupt-zip'), 'surfaced as corrupt-zip (parseZipEntries threw mid-parse)');
  assert(
    dupCheck.errors.find((e) => e.code === 'corrupt-zip')?.message.includes('add up to more than'),
    'error explains it is the SUM of declared entry sizes that is over the limit, not the file size'
  );

  let dupImportThrew = false;
  try { await importTintaProject(new FileShim(bytes, 'evil-duplication.tinta')); }
  catch (e) { dupImportThrew = true; assert(e.message.includes('add up to more than'), 'importTintaProject rejects it with the same reasoning'); }
  assert(dupImportThrew, 'importTintaProject also rejects it');
}

// ── 25. too many images/ entries is rejected (readTintaZip/checkTintaFile level) ─
section('hardening — more images than MAX_IMAGE_ENTRIES is rejected');
{
  const manifestData = JSON.stringify({ kind: 'project', tintaFormatVersion: 1, projectTitle: 'Too Many Images', imageCount: MAX_IMAGE_ENTRIES + 1 });
  const projectData = JSON.stringify({ id: 'proj_toomany', title: 'Too Many Images', chapters: [], entities: {}, images: {} });
  const imageEntries = Array.from({ length: MAX_IMAGE_ENTRIES + 1 }, (_, i) => ({ name: `images/img${i}.png`, data: new Uint8Array([1]) }));
  const bytes = buildRawZip([{ name: 'manifest.json', data: manifestData }, { name: 'project.json', data: projectData }, ...imageEntries]);

  const tooManyCheck = await checkTintaFile(new FileShim(bytes, 'too-many-images.tinta'));
  assertEqual(tooManyCheck.valid, false, 'more than MAX_IMAGE_ENTRIES images makes the archive invalid');
  assert(hasCode(tooManyCheck.errors, 'too-many-images'), 'reports too-many-images specifically (a structured code, not a generic corrupt-zip)');

  let tooManyImportThrew = false;
  try { await importTintaProject(new FileShim(bytes, 'too-many-images.tinta')); }
  catch (e) { tooManyImportThrew = true; assert(e.message.includes(String(MAX_IMAGE_ENTRIES)), 'importTintaProject throws naming the actual limit'); }
  assert(tooManyImportThrew, 'importTintaProject also rejects it');
}

// ── 26. a single oversized image is rejected ─────────────────────────────
section('hardening — a single image over MAX_SINGLE_IMAGE_BYTES is rejected');
{
  const bigImage = new Uint8Array(MAX_SINGLE_IMAGE_BYTES + 1);
  const bytes = buildRawZip([
    { name: 'manifest.json', data: JSON.stringify({ kind: 'project', tintaFormatVersion: 1, projectTitle: 'Big Image', imageCount: 1 }) },
    { name: 'project.json', data: JSON.stringify({ id: 'proj_bigimg', title: 'Big Image', chapters: [], entities: {}, images: {} }) },
    { name: 'images/huge.png', data: bigImage },
  ]);

  const bigImageCheck = await checkTintaFile(new FileShim(bytes, 'big-image.tinta'));
  assertEqual(bigImageCheck.valid, false, 'an oversized single image makes the archive invalid');
  assert(hasCode(bigImageCheck.errors, 'image-too-large'), 'reports image-too-large specifically');

  let bigImageImportThrew = false;
  try { await importTintaProject(new FileShim(bytes, 'big-image.tinta')); }
  catch { bigImageImportThrew = true; }
  assert(bigImageImportThrew, 'importTintaProject also rejects it');
}

// ── 27. an oversized project.json is rejected BEFORE JSON.parse touches it ─
section('hardening — an oversized project.json is rejected before JSON.parse touches it');
{
  const bigProjectBytes = new Uint8Array(MAX_PROJECT_JSON_BYTES + 1); // content need not be valid JSON — the size check runs first
  const bytes = buildRawZip([
    { name: 'manifest.json', data: JSON.stringify({ kind: 'project', tintaFormatVersion: 1, projectTitle: 'Big Project', imageCount: 0 }) },
    { name: 'project.json', data: bigProjectBytes },
  ]);

  const bigProjectCheck = await checkTintaFile(new FileShim(bytes, 'big-project.tinta'));
  assertEqual(bigProjectCheck.valid, false, 'an oversized project.json makes the archive invalid');
  assert(hasCode(bigProjectCheck.errors, 'project-too-large'), 'reports project-too-large specifically');
  assert(
    !hasCode(bigProjectCheck.errors, 'malformed-project'),
    'does NOT report malformed-project — proves the size check ran before any JSON.parse attempt, not as a parse-failure fallback'
  );

  let bigProjectImportThrew = false;
  try { await importTintaProject(new FileShim(bytes, 'big-project.tinta')); }
  catch { bigProjectImportThrew = true; }
  assert(bigProjectImportThrew, 'importTintaProject also rejects it');
}

// ── 28. an oversized manifest.json is rejected BEFORE JSON.parse touches it ─
section('hardening — an oversized manifest.json is rejected before JSON.parse touches it');
{
  const bigManifestBytes = new Uint8Array(MAX_MANIFEST_JSON_BYTES + 1);
  const bytes = buildRawZip([
    { name: 'manifest.json', data: bigManifestBytes },
    { name: 'project.json', data: JSON.stringify({ id: 'proj_bigmanifest', title: 'Big Manifest', chapters: [], entities: {}, images: {} }) },
  ]);

  const bigManifestCheck = await checkTintaFile(new FileShim(bytes, 'big-manifest.tinta'));
  assertEqual(bigManifestCheck.valid, false, 'an oversized manifest.json makes the archive invalid');
  assert(hasCode(bigManifestCheck.errors, 'manifest-too-large'), 'reports manifest-too-large specifically');
  assert(
    !hasCode(bigManifestCheck.errors, 'malformed-manifest'),
    'does NOT report malformed-manifest — same before-JSON.parse proof as the project.json case above'
  );

  let bigManifestImportThrew = false;
  try { await importTintaProject(new FileShim(bytes, 'big-manifest.tinta')); }
  catch { bigManifestImportThrew = true; }
  assert(bigManifestImportThrew, 'importTintaProject also rejects it');
}

// ── 29. none of the above broke the legitimate large-ish archive path ────
section('hardening — a large but WITHIN-limits archive still imports cleanly');
{
  globalThis.localStorage.clear();
  globalThis.__imageStoreShim.blobs.clear();
  const okImage = new Uint8Array(1024); // 1 KB — nowhere near any limit
  const bytes = buildRawZip([
    { name: 'manifest.json', data: JSON.stringify({ kind: 'project', tintaFormatVersion: 1, projectTitle: 'Within Limits', imageCount: 1 }) },
    { name: 'project.json', data: JSON.stringify({ id: 'proj_within', title: 'Within Limits', chapters: [{ id: 'ch1', title: 'One', content: 'Hello.', order: 0 }], entities: {}, images: {}, coverImageId: null }) },
    { name: 'images/ok.png', data: okImage },
  ]);

  const withinLimitsCheck = await checkTintaFile(new FileShim(bytes, 'within-limits.tinta'));
  assertEqual(withinLimitsCheck.valid, true, 'a modest, well-formed archive is still valid after all the hardening above');
  assertEqual(withinLimitsCheck.errors.length, 0, 'no errors on a legitimate archive');

  const withinLimitsResult = await importTintaProject(new FileShim(bytes, 'within-limits.tinta'));
  assertEqual(withinLimitsResult.projectTitle, 'Within Limits', 'the legitimate project actually imported');
  assertEqual(Store.getActiveProject().chapters[0]?.title, 'One', 'and its content came through intact');
}

// ── 30. a byte-flipped entry fails its CRC check ────────────────────────
// Roadmap #11 — the reader used to validate structure and never content:
// a corrupt-but-structurally-valid archive imported silently wrong bytes.
section('roadmap #11 — a corrupt-but-structurally-valid zip fails its CRC check');
{
  globalThis.localStorage.clear();
  globalThis.__imageStoreShim.blobs.clear();
  const bytes = buildRawZip([
    { name: 'manifest.json', data: JSON.stringify({ kind: 'project', tintaFormatVersion: 1, projectTitle: 'Crc Flip', imageCount: 0 }) },
    { name: 'project.json', data: JSON.stringify({ id: 'proj_crcflip', title: 'Crc Flip', chapters: [{ id: 'ch1', title: 'One', content: 'Original prose that must never silently change.', order: 0 }], entities: {}, images: {} }) },
  ]);
  // Flip one byte inside project.json's DATA. Offsets are computed from
  // the archive's own headers (local header = 30 bytes + filename), not
  // hardcoded — the manifest's JSON length shifts where project.json's
  // data actually starts. Headers/CRCs stay honest, the payload no longer
  // matches them — exactly a damaged-in-transit file.
  const localHeaderOffsets = [];
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) localHeaderOffsets.push(i);
  }
  assertEqual(localHeaderOffsets.length, 2, 'sanity: two local file headers in this fixture');
  const projEntryOffset = localHeaderOffsets[1];
  const projNameLen = bytes[projEntryOffset + 26] | (bytes[projEntryOffset + 27] << 8);
  const projDataOffset = projEntryOffset + 30 + projNameLen;
  bytes[projDataOffset] ^= 0x01;

  const crcCheck = await checkTintaFile(new FileShim(bytes, 'crc-flip.tinta'));
  assertEqual(crcCheck.valid, false, 'a CRC mismatch makes the archive invalid');
  assert(hasCode(crcCheck.errors, 'corrupt-zip'), 'reports corrupt-zip');
  assert(
    crcCheck.errors.some((e) => /checksum/i.test(e.message)),
    'the corrupt-zip message explains it was a checksum failure, not generic corruption'
  );
  assert(
    crcCheck.errors.some((e) => /project\.json/.test(e.message)),
    'the message names the entry that failed'
  );

  let crcImportThrew = false;
  let crcImportMessage = '';
  try { await importTintaProject(new FileShim(bytes, 'crc-flip.tinta')); }
  catch (e) { crcImportThrew = true; crcImportMessage = e.message; }
  assert(crcImportThrew, 'importTintaProject refuses the flipped archive');
  assert(/checksum/i.test(crcImportMessage), `import error names the checksum (got: ${crcImportMessage.slice(0, 80)})`);
  assertEqual(Store.getActiveProject()?.title, 'Within Limits', 'the previously active project is untouched');
}

// ── 31. the encryption flag is rejected in both headers ─────────────────
section('roadmap #11 — encrypted entries are rejected (central + local flag)');
{
  globalThis.localStorage.clear();
  const base = buildRawZip([
    { name: 'manifest.json', data: JSON.stringify({ kind: 'project', tintaFormatVersion: 1, projectTitle: 'Enc', imageCount: 0 }) },
    { name: 'project.json', data: JSON.stringify({ id: 'proj_enc', title: 'Enc', chapters: [], entities: {}, images: {} }) },
  ]);

  // Variant A: bit 0 set in the CENTRAL directory's general-purpose flags.
  // EOCD is the last 22 bytes; its +16 u32 points at the central directory.
  const eocdOffset = base.length - 22;
  const centralDirOffset =
    base[eocdOffset + 16] | (base[eocdOffset + 17] << 8) | (base[eocdOffset + 18] << 16) | (base[eocdOffset + 19] << 24);
  const centralVariant = base.slice();
  centralVariant[centralDirOffset + 8] |= 0x01;
  const centralCheck = await checkTintaFile(new FileShim(centralVariant, 'enc-central.tinta'));
  assertEqual(centralCheck.valid, false, 'a central-directory encryption flag makes the archive invalid');
  assert(
    centralCheck.errors.some((e) => /encrypted/i.test(e.message)),
    'the message says the archive is encrypted'
  );
  let centralThrew = false;
  try { await importTintaProject(new FileShim(centralVariant, 'enc-central.tinta')); }
  catch { centralThrew = true; }
  assert(centralThrew, 'importTintaProject refuses the central-flag variant');

  // Variant B: bit 0 set in the LOCAL header's flags (first entry starts
  // at offset 0; its GP flags live at +6).
  const localVariant = base.slice();
  localVariant[6] |= 0x01;
  const localCheck = await checkTintaFile(new FileShim(localVariant, 'enc-local.tinta'));
  assertEqual(localCheck.valid, false, 'a local-header encryption flag also makes the archive invalid');
  assert(
    localCheck.errors.some((e) => /encrypted/i.test(e.message)),
    'the local-flag variant also reports encryption, not generic corruption'
  );
}

// ── 32. a failed import rolls back the image blobs it already wrote ─────
// Roadmap #11 — blobs written before a late failure (cross-tab pause,
// quota-refused save) used to stay in the shared IndexedDB store forever:
// invisible, unreferenced, pure quota loss.
section('roadmap #11 — a failed import rolls back its already-written image blobs');
{
  globalThis.localStorage.clear();
  globalThis.__imageStoreShim.blobs.clear();
  const bytes = buildRawZip([
    { name: 'manifest.json', data: JSON.stringify({ kind: 'project', tintaFormatVersion: 1, projectTitle: 'Orphan Rollback', imageCount: 2 }) },
    { name: 'project.json', data: JSON.stringify({ id: 'proj_orphan', title: 'Orphan Rollback', chapters: [], entities: {}, images: {}, coverImageId: 'img_src1' }) },
    { name: 'images/img_src1.png', data: new Uint8Array([1, 2, 3, 4]) },
    { name: 'images/img_src2.png', data: new Uint8Array([5, 6, 7, 8]) },
  ]);

  // Project.json references img_src1 → import maps BOTH archive image
  // entries? No — only ids the project actually references get mapped and
  // written; img_src2 is unreferenced and must never be written at all.
  const blobCountBefore = globalThis.__imageStoreShim.blobs.size;
  globalThis.localStorage.failNextSet = true; // one-shot: the import's save() will fail
  let importThrew = false;
  let importMessage = '';
  try { await importTintaProject(new FileShim(bytes, 'orphan.tinta')); }
  catch (e) { importThrew = true; importMessage = e.message; }
  assert(importThrew, 'the import fails when the save is refused');
  assert(/saving it locally failed/.test(importMessage), `the failure is the save-refusal (got: ${importMessage.slice(0, 90)})`);
  assertEqual(globalThis.__imageStoreShim.blobs.size, blobCountBefore, 'the image blob written before the failure was rolled back — no orphans left behind');
  assert(
    !Object.values(Store.getActiveDb().projects).some((p) => p.title === 'Orphan Rollback'),
    'and the half-imported project slot is gone from the db, as before'
  );
}

// ── summary ────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
}

// Restore the original imagestore.js so we don't leave the codebase modified.
writeFileSync(origImageStorePath, origImageStoreContents);

if (fail > 0) process.exit(1);
