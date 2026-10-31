# Tinta — Applied Fixes: Roadmap Items 3–7

Applied: 2026-10-31 · Scope: code-review roadmap items 3 through 7 (items 1–2
were applied earlier and are documented in `FIXES-ROADMAP-1-2.md`).
Verification: 55/55 Node smoketests and 34/34 Playwright specs pass (details
at the bottom). Everything below is also pinned by new or updated tests.

---

## Item 3 (P1) — recovery snapshot on EVERY quota failure

`js/store-core.js`

The old code snapshotted the in-memory db to IndexedDB only on the FIRST
quota failure, guarded by a module flag reset on the next successful save.
The flag was built on a wrong assumption — "the in-memory db doesn't change
between retries" — but the writer keeps typing while every save fails, so
anything written after the first quota error existed only in RAM and was
lost if the tab closed. The flag is gone: every quota-failed save
re-snapshots `_db`, so the IndexedDB copy always tracks the freshest
unsaved state. (One async put per failed save; puts on the same store
serialize, so overlapping retries can't corrupt it.)

## Item 4 (P1) — cross-tab banner names the loss and offers copy-out

`js/toast.js`, `js/app.js`, `tests/14-cross-tab-stale-with-unsaved.spec.js`

tests/14 sketched the choice: flush the pending debounce, or warn + copy-out.
The flush is impossible by design — a stale tab's `save()` must refuse, and
bypassing the refusal would clobber the newer tab — so this is the warn +
copy-out path, fully built:

- At conflict time, `app.js` compares `#chapter-editor`'s live value against
  the saved chapter. If they differ, the banner message NAMES the unsaved
  text ("this tab's editor still holds unsaved text…") and gains a
  **Copy unsaved text** action ahead of **Reload now**.
- Copy uses `navigator.clipboard.writeText` with a hidden-textarea +
  `execCommand('copy')` fallback; the button shows inline "Copied ✓" (or an
  honest failure hint) for 2.5 s.
- `showStorageWarning()` gained an `actions: [{ label, onClick }]` array
  (the old `actionLabel`/`onAction` pair still works — it normalizes into
  the same list). Action buttons carry a stable `data-sw-action` index.
- New third spec in tests/14 drives the whole flow end-to-end: type in tab A
  under the autosave debounce, tab B saves, tab A's banner names the loss,
  the copy button is clicked, and the clipboard is read back and asserted.

## Item 5 (P1) — refuse/warn on newer schemas, snapshot before migrating

`js/store-core.js`, `js/recoveryStore.js`, `js/store.js`, `js/tintaPackage.js`, `js/app.js`, `js/schema-versioning.smoketest.mjs`

Three boundaries, one rule: this build never re-serializes data whose schema
it cannot interpret.

1. **Boot (`load()`)** — if the saved db's `version` is above
   `SCHEMA_VERSION`: the raw bytes are quarantined to IndexedDB
   (`tinta-quarantine` store, via new `saveDowngradeQuarantine` in
   recoveryStore.js), the app boots on an empty db, and a new
   **schema-downgrade write lock** makes every save path (`save()` and
   `writeToLocalStorage()`) refuse to touch `tinta:db` — the newer data can
   never be clobbered by the old binary. The writer gets a persistent,
   non-dismissible banner explaining exactly that; save errors of the new
   `locked` type surface once, not per attempt. The legacy-key migration
   path also refuses to write under the lock (it would otherwise persist
   the empty db over the newer data).
2. **Full-backup import (`replaceDb`)** — a backup with
   `version > SCHEMA_VERSION` throws BEFORE any state is touched
   (importFullBackup's rollback path stays unexercised and the current db
   is untouched). schema-versioning.smoketest now pins the refusal and the
   untouched-db guarantee; the `Math.max` contract migrate() itself owns is
   still pinned, directly.
3. **.tinta import** — `manifest.schemaVersion > SCHEMA_VERSION` throws in
   `importTintaProject` and reports `schema-too-new` in `checkTintaFile`
   (so the import UI's preview rejects it before the importer runs).

**Prerequisite bug fixed along the way:** `SCHEMA_VERSION` was never
re-exported through `store.js`, so `tintaPackage.js`'s
`schemaVersion: Store.SCHEMA_VERSION` in every exported manifest silently
evaluated to `undefined` and was dropped by JSON.stringify. It is now
exported from store-core and re-exported through store.js — manifests carry
the real version number, which is what makes guards 2 and 3 meaningful for
future exports.

## Item 6 (P0/P2, systemic)

### a) openModal() escapes plain-string bodies by default — `js/modal.js` + 16 caller files

`${raw(body)}` became `${body}` interpolated through the `html` template:
SafeHtml (`html` / `raw()`) passes through verbatim; a plain string is now
escaped like any other interpolated value. The unsafe thing is now the
opt-in. Every caller that legitimately passes pre-built, self-escaped
markup was migrated to `raw(...)` in the same pass:

- `raw()`-wrapped plain-string bodies: templatePicker, commandPalette,
  settingsModal, exportMenu, organizeModal, historyModals (×2), systemsView,
  typeManagers (×2), generatorModal (×2), timelineView, imageLibrary,
  canvasView, library (×2), plus the series modal's `raw(body)` variable.
- `toBridge(...)`-flattened SafeHtml bodies now pass the SafeHtml directly
  (otherwise the new default would have escaped them into visible source):
  grammarModal's shell, wordCheckModal (×2), annotationsModal.
- modal.smoketest.mjs updated: a plain-string body renders as inert escaped
  text, `raw()` renders real markup, and `html` keeps real tags with
  escaped interpolations.

### b) .tinta import regenerates ALL record identifiers — `js/tintaPackage.js`

Only project and image ids used to be remapped; every chapter, entity,
snapshot, relationship, etc. id survived import verbatim — the shared-identity
bug class (two imports of one file agree on every id) and the
attacker-chosen-id vector behind S-2/S-3. Import now:

1. walks the project tree collecting every uid-shaped record id (30 prefixes:
   chap/scene/snap/esnap/ent/rel/relhist/reltype/se/evt/map/mrk/ref/rsys/
   snode/sketch/stroke/snip/sg/screl/sq/note/bm/quote/dec/fold/part/coll/
   svsrch/tpl) — tree-walk, not a field list, so future id-bearing fields
   are covered automatically;
2. mints fresh ids of the same prefix in the same shape natively-created
   records use (`prefix_<base36 ts>_<base36 rand>`);
3. re-walks with exact whole-string-value + object-key replacement — the
   exact pattern `remapImageIds` established. Prose that merely CONTAINS an
   id-like substring is untouched (exact equality only); entity/chapter
   TYPE keys are deliberately out of scope (slug labels, project-scoped,
   the escaping bridge's job — documented at the site).

`importTintaProject`'s result gained `regeneratedIds` (harvest size).
New smoketest section 8c builds a maximally-connected project (chapter,
scene, snapshots, two entities + entity snapshot, relationship + history
entry wired to an event, map + marker wired to an entity, collection), then
asserts 14 pins: no imported id equals its source, references all point at
the fresh ids, the entities map is keyed by fresh ids, prose substrings
survive, and the same file imported twice shares NOTHING.

### c) Content-Security-Policy — `index.html`, `js/sw-register.js`, `sw.js`

The shell now ships `<meta http-equiv="Content-Security-Policy">`:
`script-src 'self'` (no inline script, no eval — the codebase was already
eval-free), `style-src 'self' 'unsafe-inline'` (style= attributes are the
app's design), `img-src data: blob:` (user images), `media-src blob:`
(custom ambience), `font-src 'self'`, `connect-src 'self' https:
http://localhost:* http://127.0.0.1:*` (the opt-in grammar check's
user-configured endpoint — plain-http LAN endpoints need adding on purpose),
and `object-src/base-uri/form-action 'none'`. The one inline script in
index.html (SW registration) moved to `js/sw-register.js` so `script-src
'self'` means it, and is precached in sw.js's SHELL_FILES (which the
sw-precache smoketest enforces).

## Item 7 (P1) — undo stack cleared across full-db replaces

`js/store-backup.js`, `js/recoveryToast.js`, `js/tintaPackage.js`

Undo entries describe mutations to a specific db; after a full-backup
restore, a recovery-snapshot restore, or a .tinta import, applying them
would blend two different documents (or silently "undo" the restore itself).
`clearUndoHistory()` now runs in all three flows — only after the operation
actually landed: the failure paths roll the in-memory db back, so their
undo history still matches reality.

---

## Verification

- **Node smoketests: 55 pass / 0 fail** (`scripts/run_all_smoketests.sh`).
  Includes: tinta-package 179 assertions (14 new), updated modal + grammar
  render + schema-versioning contracts, new sw-register precache coverage.
  `perf-large-project.smoketest.mjs` exceeds the runner's 60 s/file cap on
  slow machines (CPU-bound synthesis) — run it directly with a longer
  timeout; unaffected by these changes.
- **Playwright: 34/34 pass**, including the new cross-tab copy-out spec
  with clipboard read-back (Chromium, `npx playwright test`). One earlier
  infra-flake (browser context closed during parallel setup) passes in
  isolation.
- **eslint** over all touched files: no new unused imports/vars (the
  remaining `no-unused-vars`/browser-global warnings predate this pass —
  that cleanup is roadmap #10).

## Files changed (16 source + 4 test + 2 shell)

| File | What |
|------|------|
| `js/store-core.js` | #3 always-snapshot; #5 downgrade lock, quarantine, replaceDb guard, SCHEMA_VERSION export |
| `js/recoveryStore.js` | #5 downgrade quarantine store (save/get/clear) |
| `js/store.js` | #5 SCHEMA_VERSION re-export |
| `js/tintaPackage.js` | #5 manifest guards; #6b id regeneration; #7 undo clear |
| `js/store-backup.js` | #7 undo clear after restore |
| `js/recoveryToast.js` | #7 undo clear after restore |
| `js/modal.js` | #6a escape-by-default body |
| `js/toast.js` | #4 actions[] support |
| `js/app.js` | #4 copy-out banner; #5 locked banner + persistent downgrade warning |
| 12 modal-caller files | #6a raw()/SafeHtml migration |
| `index.html` | #6c CSP meta |
| `js/sw-register.js` (new) | #6c SW registration module |
| `sw.js` | #6c precache sw-register.js |
| `js/modal.smoketest.mjs`, `js/schema-versioning.smoketest.mjs` | updated contracts |
| `js/tinta-package.smoketest.mjs` | +14 assertions (section 8c) |
| `tests/14-cross-tab-stale-with-unsaved.spec.js` | +copy-out spec |

## Applying only the diff

`fixes-roadmap-3-7.patch` uses paths relative to the project root. From
inside the project directory:

    git apply fixes-roadmap-3-7.patch     # or: patch -p1 < fixes-roadmap-3-7.patch
