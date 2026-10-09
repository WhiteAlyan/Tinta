// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-1-32

import * as Store from './store.js';
import * as ImageStore from './imagestore.js';
import { createZip } from './zip.js';

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-38-43
export const TINTA_FORMAT_VERSION = 1;

// ── hostile-input hardening (resource limits) ───────────────────────────
//
// .tinta files are external input — this app reads them from disk with no
// server in between to pre-validate anything. parseZipEntries() below is a
// hand-rolled zip reader (kept small on purpose, to avoid a dependency),
// which means it trusts a lot of archive-controlled offsets and sizes by
// construction. Every one of those numbers now gets checked against what's
// actually in the file before anything reads from it, and bounded before
// any bytes get copied. Two attack shapes this specifically defends
// against:
//   - a whole-file DoS: handing the tab a file too large to safely read
//     into memory at all (checked via file.size, before any read happens)
//   - a duplication DoS: a SMALL file whose central directory claims many
//     entries that all overlap the same region, so each entry individually
//     fits inside the file, but their declared sizes SUM to far more data
//     than the file actually contains — copying every one of them would
//     multiply the file's real size by however many entries are listed
// None of these numbers are exact spec limits (except the end-of-central-
// directory search window, which is) — they're generous ceilings for what
// a real writing project could plausibly need, picked to leave headroom
// while still bounding worst-case memory/CPU use to something a browser
// tab survives.
export const MAX_TINTA_FILE_BYTES = 500 * 1024 * 1024;          // 500 MB — the whole upload, checked via file.size before any read
export const MAX_ZIP_ENTRIES = 5000;                             // central-directory entries (manifest + project + images + headroom)
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;   // sum of every entry's declared size — the duplication-DoS guard
export const MAX_IMAGE_ENTRIES = 2000;                           // images/ entries specifically — tighter than MAX_ZIP_ENTRIES on purpose
export const MAX_SINGLE_IMAGE_BYTES = 50 * 1024 * 1024;          // 50 MB — one images/ entry
export const MAX_PROJECT_JSON_BYTES = 100 * 1024 * 1024;         // project.json, checked before it's handed to JSON.parse
export const MAX_MANIFEST_JSON_BYTES = 1 * 1024 * 1024;          // manifest.json — a small metadata object, no legitimate reason to be large
const EOCD_SEARCH_WINDOW_BYTES = 65557; // ZIP spec: 22-byte EOCD record + max 65535-byte comment — real readers never search further back than this

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// Checked via file.size, which is available synchronously with no I/O —
// this is what lets a too-large file get rejected before file.arrayBuffer()
// ever tries to read it into memory. Shared by checkTintaFile (which turns
// it into an accumulated error) and importTintaProject (which throws it
// directly, same contract as every other malformed-input case there).
function fileSizeError(file) {
  if (file.size <= MAX_TINTA_FILE_BYTES) return null;
  return `This file is ${formatBytes(file.size)}, over the ${formatBytes(MAX_TINTA_FILE_BYTES)} Tinta will read as a .tinta file. It may be corrupted, or carrying something it shouldn't.`;
}

// ── helpers ────────────────────────────────────────────────────────────

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-48-51
function safeFilename(name) {
  return (name || 'untitled')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'untitled';
}

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-60-63
function collectProjectImageIds(project) {
  const ids = new Set();
  if (project.coverImageId) ids.add(project.coverImageId);
  Object.values(project.images || {}).forEach((img) => {
    if (img && img.id) ids.add(img.id);
  });
  Object.values(project.entities || {}).forEach((e) => {
    // P1-4 fix — collect `primaryImageId` (the canonical field set by
    // createEntity / setEntityPrimaryImage and migrated by store-core.js:660),
    // NOT `portraitImageId` (which is dead schema set by no creator in the
    // codebase). For .tinta files treated as hostile external input, an
    // entity with `primaryImageId` set but NOT present in `imageIds` would
    // silently fail to remap that id, leaving the imported entity pointing
    // at a non-existent image.
    if (e.primaryImageId) ids.add(e.primaryImageId);
    // Defensive: also collect portraitImageId in case a hand-edited or
    // buggy-source .tinta has it set without primaryImageId — both resolve
    // to the same concept and the blob lookup is the same. (See store-world.js
    // findImageUsage which also defensively checks both.)
    if (e.portraitImageId) ids.add(e.portraitImageId);
    (e.imageIds || []).forEach((id) => ids.add(id));
  });
  Object.values(project.maps || {}).forEach((m) => {
    if (m.imageId) ids.add(m.imageId);
  });
  Object.values(project.references || {}).forEach((r) => {
    if (r.imageId) ids.add(r.imageId);
  });
  // P2-3 fix — scan prose for {{img:id}} tokens. An image inserted
  // into chapter content / scene content via the {{img:id}} marker
  // but not referenced structurally (not in coverImageId, entity.imageIds,
  // map.imageId, reference.imageId) used to be silently dropped on
  // export — the blob wasn't bundled, and on import the prose token
  // survived pointing at an id with no blob. The image was already
  // broken in that case (its metadata had been deleted), but bundling
  // it on export + remapping on import preserves the invariant
  // "export-then-import produces a working project" even for orphan
  // prose-only references. Same regex as remapImageIds uses for the
  // replace pass.
  const IMG_TOKEN_RE = /\{\{img:([a-zA-Z0-9_-]+)\}\}/g;
  const scanContent = (text) => {
    if (typeof text !== 'string') return;
    let m;
    while ((m = IMG_TOKEN_RE.exec(text)) !== null) ids.add(m[1]);
  };
  Object.values(project.chapters || {}).forEach((ch) => {
    scanContent(ch?.content);
    Object.values(ch?.scenes || {}).forEach((sc) => scanContent(sc?.content));
  });
  return [...ids];
}

// ── image-id isolation on import ───────────────────────────────────────
//
// Import already mints a fresh PROJECT id, but it used to reuse the
// incoming IMAGE ids verbatim — and ImageStore blobs are keyed globally,
// not per project. Importing the same .tinta twice therefore produced two
// projects sharing one blob per id: deleting an image from project A
// yanked it out from under project B, which then rendered a broken-image
// placeholder for art it still legitimately owned.
//
// Minting new image ids at import time restores the invariant that an
// image id belongs to exactly one project, which is what the blob store's
// global keyspace has always assumed. (The deeper fix is a compound
// (projectId, imageId) key so asset lifetime matches project lifetime —
// see docs/ROADMAP.md. This makes the current keyspace correct without
// an IndexedDB migration.)

// Same shape as imageLibrary.js's generator, so imported ids are
// indistinguishable from natively-created ones.
function newImageId() {
  return 'img_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Rewrites every reference to an old image id inside a project tree.
//
// Deliberately a deep walk rather than a list of known fields, because
// image ids live in two structurally different places: as whole string
// values (project.coverImageId, entity.imageIds[], entity.primaryImageId,
// map.imageId, reference.imageId) AND embedded inside prose as
// `{{img:id}}` tokens (format.js's IMAGE_TOKEN_PATTERN) in chapter and
// scene content. A field-by-field rewrite would silently miss the tokens,
// leaving imported chapters full of broken inline art; a blind
// string-replace over the serialized JSON could corrupt prose that merely
// happened to contain an id-like substring. Walking the tree and matching
// on EXACT string equality (plus the token pattern) is precise in both
// directions, and stays correct if a future field starts holding an image
// id without this function being told about it.
//
// Object KEYS are remapped too, which is what moves project.images itself
// across to the new ids.
const IMPORT_IMAGE_TOKEN_RE = /\{\{img:([a-zA-Z0-9_-]+)((?:\|(?:left|right|center))?)\}\}/g;

function remapImageIds(value, idMap) {
  if (typeof value === 'string') {
    // Whole-value match first — this is the common case (an id field).
    if (Object.hasOwn(idMap, value)) return idMap[value];
    // Otherwise rewrite any inline image tokens the string carries.
    if (value.includes('{{img:')) {
      return value.replace(IMPORT_IMAGE_TOKEN_RE, (whole, id, align) =>
        (Object.hasOwn(idMap, id) ? `{{img:${idMap[id]}${align}}}` : whole));
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => remapImageIds(item, idMap));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const newKey = Object.hasOwn(idMap, key) ? idMap[key] : key;
      out[newKey] = remapImageIds(child, idMap);
    }
    return out;
  }
  return value;
}

// Builds the manifest object that goes at the top of every .tinta
// file (JSON or ZIP). The manifest is what importTintaProject reads
// first to decide how to handle the rest of the file.
function buildManifest(project, imageCount) {
  return {
    tintaFormatVersion: TINTA_FORMAT_VERSION,
    kind: 'project',
    projectId: project.id,
    projectTitle: project.title,
    exportedAt: new Date().toISOString(),
    schemaVersion: Store.SCHEMA_VERSION,
    imageCount,
  };
}

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-98-107

export async function exportTintaProject(projectId = null) {
  const project = projectId ? Store.getActiveProject() : Store.getActiveProject();
// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-111-116
  if (!project) throw new Error('No active project to export');

  const imageIds = collectProjectImageIds(project);
  const manifest = buildManifest(project, imageIds.length);

  if (imageIds.length === 0) {
    // JSON-only variant — single file, easy to inspect.
    const payload = { manifest, project: project };
    const json = JSON.stringify(payload, null, 2);
    return {
      format: 'json',
      blob: new Blob([json], { type: 'application/json;charset=utf-8' }),
      filename: `${safeFilename(project.title)}.tinta`,
    };
  }

  // ZIP variant — manifest.json + project.json + images/<id>.<ext>
  const entries = [
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    { name: 'project.json', data: JSON.stringify(project, null, 2) },
  ];

  for (const id of imageIds) {
    try {
      const blob = await ImageStore.getBlob(id);
      if (!blob) continue; // metadata exists but blob gone — skip, same as backup.js
      // Use the ImageStore's recorded mimeType for the extension. Fall
      // back to .bin if the type is missing or unrecognized.
      const ext = mimeToExt(blob.type);
      const buf = await blob.arrayBuffer();
      entries.push({ name: `images/${id}.${ext}`, data: buf });
    } catch {
      // One bad image shouldn't sink the whole export.
    }
  }

  const zipBytes = createZip(entries);
  return {
    format: 'zip',
    blob: new Blob([zipBytes], { type: 'application/zip' }),
    filename: `${safeFilename(project.title)}.tinta`,
  };
}

function mimeToExt(mime) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
  };
  return map[mime] || 'bin';
}

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-175-201
export async function checkTintaFile(file) {
  const errors = [];
  const warnings = [];
  const err = (code, message) => errors.push({ code, message });
  const warn = (code, message) => warnings.push({ code, message });

  // file.size is a plain property — synchronous, no I/O — so an
  // oversized file is rejected before file.arrayBuffer() ever tries to
  // read it into memory. This is the load-bearing check in this
  // function: everything below it assumes `bytes` is a size a browser
  // tab can hold comfortably.
  const sizeError = fileSizeError(file);
  if (sizeError) {
    err('file-too-large', sizeError);
    return { valid: false, format: 'unknown', errors, warnings, summary: null };
  }

  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    err('unreadable-file', "Couldn't read this file at all; it may have been moved or deleted.");
    return { valid: false, format: 'unknown', errors, warnings, summary: null };
  }

  let manifest = null;
  let project = null;
  let imageEntries = [];
  let format = 'unknown';

  if (isZip(bytes)) {
    format = 'zip';
    let entries;
    try {
      entries = parseZipEntries(bytes);
    } catch (e) {
      err('corrupt-zip', `This .tinta's zip container is corrupted and can't be read: ${e.message}`);
      return { valid: false, format, errors, warnings, summary: null };
    }

    const manifestEntry = entries.find((e) => e.name === 'manifest.json');
    const projectEntry = entries.find((e) => e.name === 'project.json');
    if (!manifestEntry) err('missing-manifest', 'No manifest.json found inside the zip.');
    if (!projectEntry) err('missing-project', 'No project.json found inside the zip.');

    // Same "check the size before handing it to JSON.parse" discipline as
    // readTintaZip's actual import path — checkTintaFile is a separate
    // code path (it doesn't call readTintaZip), so it needs its own copy
    // of the same guard rather than inheriting it for free.
    if (manifestEntry && manifestEntry.bytes.length > MAX_MANIFEST_JSON_BYTES) {
      err('manifest-too-large', `manifest.json is ${formatBytes(manifestEntry.bytes.length)}, over the ${formatBytes(MAX_MANIFEST_JSON_BYTES)} Tinta expects for a manifest.`);
    } else if (manifestEntry) {
      try {
        manifest = JSON.parse(new TextDecoder().decode(manifestEntry.bytes));
      } catch {
        err('malformed-manifest', "manifest.json exists but isn't valid JSON.");
      }
    }
    if (projectEntry && projectEntry.bytes.length > MAX_PROJECT_JSON_BYTES) {
      err('project-too-large', `project.json is ${formatBytes(projectEntry.bytes.length)}, over the ${formatBytes(MAX_PROJECT_JSON_BYTES)} Tinta will parse.`);
    } else if (projectEntry) {
      try {
        project = JSON.parse(new TextDecoder().decode(projectEntry.bytes));
      } catch {
        err('malformed-project', "project.json exists but isn't valid JSON.");
      }
    }

    imageEntries = entries.filter((e) => e.name.startsWith('images/'));
    if (imageEntries.length > MAX_IMAGE_ENTRIES) {
      err('too-many-images', `This .tinta has ${imageEntries.length} images, over the ${MAX_IMAGE_ENTRIES} Tinta will import from one file.`);
    }
    const oversizedImage = imageEntries.find((e) => e.bytes.length > MAX_SINGLE_IMAGE_BYTES);
    if (oversizedImage) {
      err('image-too-large', `One of the images (${formatBytes(oversizedImage.bytes.length)}) is over the ${formatBytes(MAX_SINGLE_IMAGE_BYTES)} Tinta will import for a single image.`);
    }
  } else {
    format = 'json';
    // Same combined-ceiling reasoning as importTintaProject's JSON branch:
    // no images/ in this format, so the whole file stands in for
    // "manifest + project" together. Checked before JSON.parse touches it.
    if (bytes.length > MAX_PROJECT_JSON_BYTES + MAX_MANIFEST_JSON_BYTES) {
      err('file-too-large', `This file is ${formatBytes(bytes.length)}, over the ${formatBytes(MAX_PROJECT_JSON_BYTES + MAX_MANIFEST_JSON_BYTES)} Tinta will parse for a JSON-format .tinta file.`);
      return { valid: false, format, errors, warnings, summary: null };
    }
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      err('not-json-or-zip', "This isn't a zip archive and isn't valid JSON either; it doesn't look like a .tinta file at all.");
      return { valid: false, format, errors, warnings, summary: null };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      err('malformed-json-root', 'The file parses as JSON, but the top level is not an object.');
      return { valid: false, format, errors, warnings, summary: null };
    }
    if (!parsed.manifest) err('missing-manifest', 'No `manifest` key at the top level.');
    if (!parsed.project) err('missing-project', 'No `project` key at the top level.');
    manifest = parsed.manifest || null;
    project = parsed.project || null;
  }

  // ── manifest-level checks ──────────────────────────────────────────
  if (manifest) {
    if (manifest.kind !== 'project') {
      err('wrong-kind', `This .tinta is a "${manifest.kind ?? 'unknown'}", not a project; Tinta can only import project .tinta files.`);
    }
    if (typeof manifest.tintaFormatVersion !== 'number') {
      err('missing-format-version', 'The manifest has no readable format version.');
    } else if (manifest.tintaFormatVersion > TINTA_FORMAT_VERSION) {
      err(
        'format-too-new',
        `This .tinta was made with a newer version of Tinta (format v${manifest.tintaFormatVersion}). This Tinta only understands v${TINTA_FORMAT_VERSION} and earlier.`
      );
    }
    if (!manifest.projectTitle) warn('missing-title-in-manifest', "The manifest has no project title recorded; the imported project would show as untitled until you rename it.");
  }

  // ── project-level checks ────────────────────────────────────────────
  if (project) {
    if (!Array.isArray(project.chapters)) err('missing-chapters', 'The project has no `chapters` array; this is required and would break import.');
    if (!project.entities || typeof project.entities !== 'object') err('missing-entities', 'The project has no `entities` object; this is required and would break import.');
    if (!project.title) warn('missing-project-title', 'The project itself has no title set.');
  }

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-294-297
  if (format === 'zip' && manifest && typeof manifest.imageCount === 'number') {
    if (imageEntries.length < manifest.imageCount) {
      warn(
        'image-count-mismatch',
        `The manifest says this project had ${manifest.imageCount} image${manifest.imageCount === 1 ? '' : 's'}, but only ${imageEntries.length} were found in the archive; some images may not come back.`
      );
    }
  }

  const summary =
    project && manifest
      ? {
          projectTitle: project.title || manifest.projectTitle || null,
          chapterCount: Array.isArray(project.chapters) ? project.chapters.length : null,
          entityCount: project.entities && typeof project.entities === 'object' ? Object.keys(project.entities).length : null,
          imageCount: typeof manifest.imageCount === 'number' ? manifest.imageCount : imageEntries.length,
          schemaVersion: manifest.schemaVersion ?? null,
          tintaFormatVersion: manifest.tintaFormatVersion ?? null,
        }
      : null;

  return { valid: errors.length === 0, format, errors, warnings, summary };
}

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-322-335

export async function importTintaProject(file) {
  // Same file.size gate as checkTintaFile, and for the same reason: reject
  // before file.arrayBuffer() ever attempts the read. In the normal UI
  // flow checkTintaFile always runs first and would already have caught
  // this — this copy is what protects a caller that invokes
  // importTintaProject directly. Throws (rather than returning an error
  // shape) to match every other malformed-input case in this function;
  // both of this function's real callers already wrap it in try/catch.
  const sizeError = fileSizeError(file);
  if (sizeError) throw new Error(sizeError);

  // Read as array buffer so we can detect by magic bytes, then convert
  // to text for JSON parsing. Reads once, slices twice — no redundant
  // I/O.
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  let manifest, project, imageEntries;

  if (isZip(bytes)) {
    ({ manifest, project, imageEntries } = readTintaZip(bytes));
  } else {
    // JSON variant — single object at top level, no images/ (see below),
    // so the whole file is essentially "manifest + project" combined.
    // Checked against that COMBINED ceiling rather than the much larger
    // whole-file cap, which exists mainly to cover image-bearing zips —
    // a text-only .tinta this size would already be a malformed or
    // hostile file, not just a very long novel.
    if (bytes.length > MAX_PROJECT_JSON_BYTES + MAX_MANIFEST_JSON_BYTES) {
      throw new Error(`This .tinta is ${formatBytes(bytes.length)}, over the ${formatBytes(MAX_PROJECT_JSON_BYTES + MAX_MANIFEST_JSON_BYTES)} Tinta will parse for a JSON-format .tinta file.`);
    }
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('Not a valid .tinta file (top level is not an object)');
    if (!parsed.manifest || !parsed.project) throw new Error('Not a valid .tinta file (missing manifest or project)');
    manifest = parsed.manifest;
    project = parsed.project;
    imageEntries = []; // JSON variant has no images
  }

  if (manifest.tintaFormatVersion > TINTA_FORMAT_VERSION) {
    throw new Error(
      `This .tinta was made with a newer version of Tinta (format v${manifest.tintaFormatVersion}). ` +
      `This Tinta only understands v${TINTA_FORMAT_VERSION} and earlier. Update Tinta and try again.`
    );
  }

  if (manifest.kind !== 'project') {
    throw new Error(`This .tinta is a "${manifest.kind}", not a project. Tinta can only import project .tinta files.`);
  }

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-370-380
  const preMigrateJson = JSON.stringify(project);
  const wrapperDb = { ...emptyDbShell(), projects: { [project.id]: project } };
  Store.migrate(wrapperDb);
  const migrated = JSON.stringify(project) !== preMigrateJson;

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-386-391
  const oldProjectId = project.id;
  const newProjectId = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  project.id = newProjectId;

  // Image ids get the same fresh-identity treatment as the project id —
  // see remapImageIds() above for why sharing them across projects is the
  // bug. Every id the project actually references is remapped (collected
  // from the project itself, not from the archive, so a .tinta carrying
  // stray images/ entries nothing points at can't inject ids).
  const imageIdMap = Object.create(null);
  for (const oldImageId of collectProjectImageIds(project)) {
    imageIdMap[oldImageId] = newImageId();
  }
  project = remapImageIds(project, imageIdMap);
  project.id = newProjectId; // remap rebuilds the object; re-pin the id defensively

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-396-399
  let restoredImages = 0;
  let failedImages = 0;
  for (const entry of imageEntries) {
    // Blobs land under the NEW id. An archive entry whose id the project
    // never references has no mapping — skip it rather than writing an
    // orphan blob into the shared store that nothing will ever delete.
    const newId = imageIdMap[entry.id];
    if (!newId) continue;
    try {
      const blob = new Blob([entry.bytes], { type: entry.mimeType });
      await ImageStore.putBlob(newId, blob);
      restoredImages++;
    } catch {
      failedImages++;
    }
  }

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-412-415
  // P1-1 fix — mirror store-backup.js:32-43: check isCrossTabStale() first
  // and honor Store.save()'s boolean return. Previously this called save()
  // and discarded the result, so a paused tab (cross-tab conflict) or a
  // quota-exceeded write would leave the new project in memory but not on
  // disk, and switchProject() would proceed as if everything had landed.
  // On reload the imported project vanished silently.
  if (Store.isCrossTabStale()) {
    throw new Error('This tab is paused because another tab just saved. Reload this tab, then try the import again.');
  }
  const db = Store.getActiveDb();
  const previousProjectSlot = db.projects[newProjectId];
  db.projects[newProjectId] = project;
  const saved = Store.save(); // persist the new project before switching to it
  if (!saved) {
    // Roll back the in-memory mutation so a failed save can't leave a
    // half-imported project slot. Mirrors store-backup.js:39-43.
    if (previousProjectSlot === undefined) delete db.projects[newProjectId];
    else db.projects[newProjectId] = previousProjectSlot;
    throw new Error('The .tinta file was read, but saving it locally failed (storage may be full or this tab is paused). The current project was not changed.');
  }
  Store.switchProject(newProjectId);

  return {
    projectId: newProjectId,
    projectTitle: project.title,
    imageCount: imageEntries.length,
    restoredImages,
    failedImages,
    migrated,
    originalProjectId: oldProjectId,
  };
}

// ── zip detection + reading ────────────────────────────────────────────

function isZip(bytes) {
  // PK\x03\x04 — standard ZIP local file header magic. (Empty zips use
  // PK\x05\x06 for the end-of-central-directory record, but a .tinta
  // always has at least one entry — manifest.json — so this is fine.)
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-441-445
function readTintaZip(bytes) {
  const entries = parseZipEntries(bytes);
  const manifestEntry = entries.find((e) => e.name === 'manifest.json');
  const projectEntry = entries.find((e) => e.name === 'project.json');
  if (!manifestEntry) throw new Error('Not a valid .tinta file (no manifest.json inside the zip)');
  if (!projectEntry) throw new Error('Not a valid .tinta file (no project.json inside the zip)');

  // Checked BEFORE JSON.parse, not after — the point is to stop an
  // absurdly large string from ever reaching the parser, not to recover
  // gracefully once it's already mid-parse.
  if (manifestEntry.bytes.length > MAX_MANIFEST_JSON_BYTES) {
    throw new Error(`manifest.json is ${formatBytes(manifestEntry.bytes.length)}, over the ${formatBytes(MAX_MANIFEST_JSON_BYTES)} Tinta expects for a manifest.`);
  }
  if (projectEntry.bytes.length > MAX_PROJECT_JSON_BYTES) {
    throw new Error(`project.json is ${formatBytes(projectEntry.bytes.length)}, over the ${formatBytes(MAX_PROJECT_JSON_BYTES)} Tinta will parse.`);
  }

  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.bytes));
  const project = JSON.parse(new TextDecoder().decode(projectEntry.bytes));

  // Image entries — collect every entry under images/, parse the
  // imageId out of the filename (the part before the extension).
  const imageEntries = entries
    .filter((e) => e.name.startsWith('images/'))
    .map((e) => {
      const basename = e.name.slice('images/'.length);
      const dotIdx = basename.lastIndexOf('.');
      const id = dotIdx === -1 ? basename : basename.slice(0, dotIdx);
      const ext = dotIdx === -1 ? 'bin' : basename.slice(dotIdx + 1);
      const mimeType = extToMime(ext);
      return { id, mimeType, bytes: e.bytes };
    });

  if (imageEntries.length > MAX_IMAGE_ENTRIES) {
    throw new Error(`This .tinta has ${imageEntries.length} images, over the ${MAX_IMAGE_ENTRIES} Tinta will import from one file.`);
  }
  const oversizedImage = imageEntries.find((e) => e.bytes.length > MAX_SINGLE_IMAGE_BYTES);
  if (oversizedImage) {
    throw new Error(`One of the images (${formatBytes(oversizedImage.bytes.length)}) is over the ${formatBytes(MAX_SINGLE_IMAGE_BYTES)} Tinta will import for a single image.`);
  }

  return { manifest, project, imageEntries };
}

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-472-477
//
// HARDENING PASS — every offset and length below is archive-controlled,
// i.e. it comes from the file itself, not from Tinta. The original version
// of this function read most of them with plain array indexing or
// DataView calls with no validation of its own: a lying offset either
// silently produced `undefined` (array indexing past the end) or threw a
// native RangeError from deep inside DataView (a numeric read that
// overruns the buffer) — two different failure shapes for the same "this
// number lies" condition, one of them silent. requireRange() below is the
// one place that decides whether a claimed offset/length is honest BEFORE
// anything reads from it, so every failure reports the same clean
// "Malformed zip" message, and nothing gets read from outside the file.
//
// Three resource limits live in this function specifically because they
// have to be enforced WHILE parsing, not after: the entry count (before
// the loop even starts), and the running total of every entry's declared
// size (checked incrementally, before each entry's bytes get copied — see
// the module-level comment above MAX_TOTAL_UNCOMPRESSED_BYTES for why a
// per-entry-size check alone isn't enough to stop a duplication attack).
function parseZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();

  function requireRange(offset, length, what) {
    if (!Number.isFinite(offset) || !Number.isFinite(length) || offset < 0 || length < 0 || offset + length > bytes.length) {
      throw new Error(`Malformed zip: ${what} (offset ${offset}, length ${length}) falls outside the file.`);
    }
  }
  function u16(offset, what) { requireRange(offset, 2, what); return view.getUint16(offset, true); }
  function u32(offset, what) { requireRange(offset, 4, what); return view.getUint32(offset, true); }
  function requireMagic(offset, expected, what) {
    requireRange(offset, 4, what);
    if (bytes[offset] !== expected[0] || bytes[offset + 1] !== expected[1] || bytes[offset + 2] !== expected[2] || bytes[offset + 3] !== expected[3]) {
      throw new Error(`Malformed zip: ${what} at offset ${offset} has the wrong signature.`);
    }
  }

  // Find the end-of-central-directory record (search backwards from the
  // end — it's the last thing in the zip). Bounded to the ZIP spec's own
  // window (22-byte record + max 65535-byte comment) rather than walking
  // the whole file: a comment can never be longer than that, so the
  // record can never be further back than that either. This also means a
  // huge file with no valid EOCD fails fast instead of scanning to the
  // start of the buffer.
  const searchStart = Math.max(0, bytes.length - EOCD_SEARCH_WINDOW_BYTES);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (
      bytes[i] === 0x50 && bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Not a valid zip (no end-of-central-directory record)');

  const centralDirOffset = u32(eocdOffset + 16, 'central directory offset');
  const centralDirSize = u32(eocdOffset + 12, 'central directory size');
  const totalEntries = u16(eocdOffset + 10, 'entry count');

  if (totalEntries > MAX_ZIP_ENTRIES) {
    throw new Error(`This .tinta claims ${totalEntries} entries, over the ${MAX_ZIP_ENTRIES} Tinta will read from one file.`);
  }
  // The whole claimed central directory has to actually fit inside the
  // file — catches a lying offset/size pair before the loop below ever
  // starts walking it.
  requireRange(centralDirOffset, centralDirSize, 'central directory');

  const entries = [];
  const seenNames = new Set();
  let totalDeclaredBytes = 0;
  let pos = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    requireMagic(pos, [0x50, 0x4b, 0x01, 0x02], 'central directory entry');
    const compressionMethod = u16(pos + 10, 'compression method');
    if (compressionMethod !== 0) {
      throw new Error(`Unsupported zip: entry uses compression method ${compressionMethod}, only STORE (0) is supported`);
    }
    const nameLen = u16(pos + 28, 'filename length');
    const extraLen = u16(pos + 30, 'extra field length');
    const commentLen = u16(pos + 32, 'comment length');
    const localHeaderOffset = u32(pos + 42, 'local header offset');
    const size = u32(pos + 24, 'entry size');

    requireRange(pos + 46, nameLen, 'filename');
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    if (seenNames.has(name)) {
      throw new Error(`Malformed zip: duplicate entry name "${name}".`);
    }
    seenNames.add(name);

    // Read the local file header to get the actual data offset + size.
    requireMagic(localHeaderOffset, [0x50, 0x4b, 0x03, 0x04], 'local file header');
    const localNameLen = u16(localHeaderOffset + 26, 'local filename length');
    const localExtraLen = u16(localHeaderOffset + 28, 'local extra field length');
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

    // The duplication-DoS guard: check the RUNNING TOTAL before copying
    // this entry's bytes, not after. An attacker doesn't need any single
    // entry to lie about the file's real size — 5000 entries all pointing
    // at the same small region, each individually valid, would still
    // multiply that region's bytes 5000x if nothing summed them first.
    totalDeclaredBytes += size;
    if (totalDeclaredBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(
        `This .tinta's entries add up to more than ${formatBytes(MAX_TOTAL_UNCOMPRESSED_BYTES)} of content, ` +
        'over what Tinta will read — even though the file itself may be smaller. This usually means the archive is malformed.'
      );
    }
    requireRange(dataOffset, size, `data for "${name}"`);
    const entryBytes = bytes.subarray(dataOffset, dataOffset + size);

    entries.push({ name, bytes: new Uint8Array(entryBytes) });

    pos += 46 + nameLen + extraLen + commentLen;
    if (pos > centralDirOffset + centralDirSize) {
      // Was a silent `break` (accept fewer entries than claimed and move
      // on) — now a hard error. A cursor that overruns the declared
      // central-directory size means the file's own bookkeeping doesn't
      // add up, which is a malformed archive, not a mildly-short one.
      throw new Error('Malformed zip: central directory entries run past the declared central directory size.');
    }
  }

  return entries;
}

function extToMime(ext) {
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    bin: 'application/octet-stream',
  };
  return map[ext] || 'application/octet-stream';
}

// Historical context: see docs/CODEBASE_NOTES.md#jstintapackage-js-557-565
function emptyDbShell() {
  return {
    version: Store.SCHEMA_VERSION,
    projects: {},
    grammar: {},
    ambience: {},
    tts: {},
    typewriter: {},
    customFont: {},
    background: {},
    recentActivity: [],
    customThesaurus: {},
    series: {},
  };
}
