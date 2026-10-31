# Tinta — Applied Fixes: Roadmap Items 8–11

Applied: 2026-10-31 · Scope: code-review roadmap items 8 through 11 (items
1–2 and 3–7 were applied earlier — see `FIXES-ROADMAP-1-2.md` and
`FIXES-ROADMAP-3-7.md`).
Verification: all 59 Node smoketest files pass (including three new
files), 34/34 Playwright specs pass (Chromium), `npx eslint js/ tests/`
exits clean with zero findings, and the notes-file verifier reports
848/848 cross-references resolving. Details at the bottom.

---

## Item 8 (P2) — documentation truth, regenerated

`scripts/extract_codebase_notes.py` (rewritten), `docs/CODEBASE_NOTES.md`
(regenerated), 92 source files (cross-references repointed),
`js/appMeta.js`, `docs/TINTA-MASTER-TRUTH.md`, `docs/ROADMAP.md`

**What the review found:** 849 dead anchors into an empty document, a
version number three releases behind, and truth documents carrying false
claims.

**What was actually recoverable, stated plainly:** the original ~800
historical comment blocks are GONE. The first migration stripped them out
of the sources into the generated .md; that generated file was later
truncated to a 30-line stub; there was no git history and no other copy.
Nothing in this pass can un-lose that prose — so this pass is built
around making sure it cannot happen again:

1. **Stable anchors.** Every cross-reference now points at a per-FILE
   anchor (`docs/CODEBASE_NOTES.md#jsgrammarmodal-js`) instead of the old
   per-line-range form (`#jsgrammarmodal-js-1-14`) that died on every
   edit. The stable form is byte-identical to the old anchor's prefix, so
   the migration is a pure suffix-strip: `--fix-xref` rewrote all **848**
   xref lines across 92 files, one line becoming one line — no line
   numbers in any source file shifted.
2. **Non-destructive regeneration.** The rewritten script's default mode
   reads the comment blocks currently in the sources and rebuilds the
   full .md (file tree + 99 per-file sections, 142 current blocks) without
   ever modifying a source file. The original destructive mode is refused
   at the CLI unless an explicit acknowledgment flag is passed.
3. **A regression guard.** `--verify` fails with a nonzero exit listing
   any anchor referenced from `js/*.js` that the .md does not resolve.
   Result after regeneration: **848/848 resolve** (the review's 849-dead-
   anchors count is now zero, and the state is loud if it ever returns).
   Files whose historical blocks are lost carry an honest note in their
   section; recent history lives in the `FIXES-ROADMAP-*.md` batches.

**Version reconciliation.** `appMeta.js` now reads **0.3.0 "Fast,
Beautiful, Trustworthy"** — it still read 0.2.8 "Own the Vault" while the
v0.2.9 "app disappears" onboarding release and the v0.3 editor-preview
pass (Typora-style always-on rendering, `{{u:text}}` underline, the image
URL cache) were already shipped and self-labeled across `onboarding.js` /
`editor.js` / `format.js`. The phase label is the project's own v0.3
charter from MASTER-TRUTH, not an invented one. `sw.js`'s `CACHE_NAME`
bumped to `tinta-shell-v0.3.0` so installed clients refresh the shell.

**MASTER-TRUTH corrected in place (not rewritten):** the onboarding
"confirmed zero code" claim (false — `js/onboarding.js` and
`js/welcomeScreen.js` both ship), the `prefers-reduced-motion` debt item
(shipped — blocks in `css/base.css`, `css/modals.css` ×2,
`css/polish.css`), the dead `app.js` line-number citations (3698/3715
died with the godfile split; DOCX/EPUB call sites now live in
`exportMenu.js`), the `app.js` line-count claim annotated with current
reality, and a dated version-reconciliation paragraph. **ROADMAP.md's
build log** gains the missing entries: the v0.3-era gap meant the log
stopped at "v0.2 close-out"; it now records all three external-review
fix batches (1–2, 3–7, 8–11).

## Item 9 (P2) — storage hygiene

`js/store-core.js`, `js/store-craft.js`, `js/store-relationships.js`,
`js/autoBackup.js` + new `js/autoBackupName.js`, `sw.js`

Four erosion paths closed:

1. **Corrupt-db quarantine sweep.** Every boot that hit an unreadable
   `tinta:db` wrote `tinta:db:corrupt-backup:<ts>` — a FULL copy of the
   unreadable data — and nothing ever removed one. `load()` now sweeps
   the quarantine to the newest **two** before anything can add to it.
   Every step is failure-swallowed: a hygiene sweep must never turn a
   boot into a crash.
2. **Legacy key finally deleted.** The pre-rename `scriptorium:db` was
   re-saved under `tinta:db` on first boot and then kept forever, spending
   quota as a permanent duplicate. It is now removed — but only AFTER the
   same data has actually landed under `tinta:db` (until that write
   succeeds, the legacy key is the only copy; a failed save leaves it in
   place).
3. **Bounded histories.** The decision log and per-relationship histories
   grew without limit inside a db that re-serializes on every save. Both
   are capped at the write path, oldest-first:
   `MAX_DECISION_LOG = 250` (user-authored records, deliberately
   generous — years of deliberate logging) and
   `MAX_RELATIONSHIP_HISTORY = 50` per relationship (auto-appended on
   every edit). Constants are exported and pinned by tests.
4. **Dated auto-backup with rotation.** The folder auto-backup overwrote
   ONE fixed-name .tinta per project — a mistake made today replaced
   yesterday's good copy. Backups are now
   `<project>-autosave-YYYY-MM-DD.tinta` (local date; same-day saves
   rewrite the same file, so the save debounce can't fill the folder),
   and after each write the folder rotates to the newest
   `AUTOBACKUP_KEEP = 5` dated files per project. Rotation selects ONLY
   files matching the module's exact naming pattern — manual exports,
   other projects' backups, and anything else in the folder are never
   touched. The naming/selection logic lives in the new pure
   `autoBackupName.js` (unit-tested in `autoBackup-name.smoketest.mjs`;
   also registered in sw.js's SHELL_FILES — the sw-precache guard caught
   the omission the moment the module landed).

## Item 10 (P3) — ESLint signal restored

`eslint.config.js`, `package.json`, `js/store-projects.js`, + 40 more files

The config's hand-maintained ~40-name browser-globals list was exactly
how the grammar modal's `ReferenceError` shipped silently: the codebase
used `performance`, `TextEncoder`/`TextDecoder`, `getComputedStyle`,
`fetch`, and friends — none on the list — so **53 real `no-undef` errors**
were live in the lint output alongside 108 warnings and nobody could see
the signal. The hand list is gone: the config now uses the `globals`
package's `browser` + `node` presets (already in node_modules as an
eslint transitive dep; now pinned in devDependencies at `^14.0.0`).

Then every remaining finding was fixed by hand, file by file — **`npm
run lint` is now completely clean (0 errors, 0 warnings)**:

- **One real latent bug the restored signal caught:**
  `store-projects.js`'s `renameSeries()` called `getSeries()` without
  importing it — renaming any series threw `ReferenceError`. The import
  is added; a rename now works.
- 15 dead "vault machinery" import names + 3 dead namespace imports
  removed from `store.js` (the domain code moved to `store-*.js` in the
  split; the imports stayed behind — the direct `export {} from`
  re-exports the app actually consumes were untouched).
- Dead imports trimmed in 13 modal/view files (`openModal`,
  `confirmDialog`, `promptDialog`, `html`, `capitalize`, `STATUS_LABEL`,
  `STATUS_ORDER`, five unused context setters in `projectSwitch.js`).
- Eleven view render functions kept their positional `project` argument
  but renamed it `_project` (the codebase's sanctioned unused-arg form) —
  no signatures changed.
- Five `no-useless-escape`s cleaned (`format.js`, `store-entities.js` —
  the mention regex now uses the unambiguous `[^\][]` form — `theme.js`,
  `welcomeScreen.js`), one stale `eslint-disable` directive removed
  (`search.js`), and write-only state deleted (`tts.js`'s never-read
  `currentUtterance`, `store-reports.js`'s word-count loop whose result
  was never read).
- ~45 dead test bindings removed or `_`-prefixed across the smoketest
  suite and Playwright specs — side-effectful constructor calls kept as
  bare calls, only the dead assignments dropped.

## Item 11 (P3) — zip reader verifies content, not just structure

`js/tintaPackage.js`, `js/tinta-package.smoketest.mjs`

The hand-rolled reader validated archive STRUCTURE exhaustively (bounds,
signatures, entry counts, duplication-DoS totals) and its CONTENT not at
all — a corrupt-but-structurally-valid archive (byte flipped in transit,
truncated download) imported silently wrong bytes.

1. **CRC-32 verification.** Every entry is now checksummed against the
   central directory's stored CRC (table-based IEEE 0xEDB88320
   implementation; the central value is authoritative because streaming
   writers legitimately zero the local copy under a data descriptor).
   Tinta's writer is STORE-only, so entry bytes ARE the content — a
   mismatch is damaged data, and the whole archive is refused with a
   message naming the entry and both checksums.
2. **Encryption rejected.** General-purpose bit 0 is checked in BOTH the
   central directory and the local header — an encrypted entry's
   ciphertext used to be handed to JSON.parse / the image store as if it
   were plaintext. The error tells the writer what happened and to
   re-export without a password.
3. **Failed imports roll back their image blobs.** Blobs written to the
   shared IndexedDB store before a late failure (cross-tab pause,
   quota-refused save) used to remain forever: invisible, unreferenced,
   pure quota loss. The import now tracks exactly the keys IT wrote and
   deletes them on any post-write failure, best-effort, rethrowing the
   original error. Success never reaches the cleanup, and re-importing
   the same file mints fresh ids — so only true orphans are ever removed.

New smoketest sections pin all three: a byte-flipped project.json is
rejected with a checksum message naming the entry; encryption flags in
either header are rejected; and an import whose save is refused (one-shot
quota failure injected via the test's localStorage shim) leaves ZERO new
image blobs behind. The test's raw zip builders now write honest CRCs
through an independent table implementation — two separately written
tables that must agree is the actual check.

---

## Verification

- **Node smoketests: all 59 files green** (run file-by-file), including
  `tinta-package` 196 assertions (3 new sections), `storage-hygiene`
  16 assertions (new file), `autoBackup-name` 10 assertions (new file),
  `sw-precache` 350 (SHELL_FILES including `autoBackupName.js`).
  `perf-large-project` needs a longer-than-60s timeout on this machine
  (CPU-bound synthesis, pre-existing) — 8/8 green with one.
- **Playwright: 34/34 pass** (Chromium). One parallel-run infra-flake
  (03-view-navigation) passed in isolation and on the full re-run — the
  same flake shape FIXES-ROADMAP-3-7 documented.
- **eslint: `npx eslint js/ tests/` → exit 0, zero findings** (was 58
  errors + 108 warnings).
- **Notes anchors: 848/848 resolve** (`extract_codebase_notes.py --verify`).

## Files changed (core)

| File | What |
|------|------|
| `scripts/extract_codebase_notes.py` | #8 rewritten: non-destructive regen (default), --fix-xref, --verify, destructive mode refused |
| `docs/CODEBASE_NOTES.md` | #8 regenerated: 99 sections, 142 blocks, stable per-file anchors |
| 92 × `js/*.js` | #8 cross-references repointed to stable anchors (1:1 lines) |
| `js/appMeta.js` | #8 0.3.0 "Fast, Beautiful, Trustworthy" |
| `docs/TINTA-MASTER-TRUTH.md` | #8 false claims corrected, dead citations fixed, reconciliation paragraph |
| `docs/ROADMAP.md` | #8 build-log entries for fix batches 1–2, 3–7, 8–11 |
| `sw.js` | #8/#9 CACHE_NAME → v0.3.0; SHELL_FILES + autoBackupName.js |
| `js/store-core.js` | #9 corrupt-backup sweep; legacy key deleted after successful migration save |
| `js/store-craft.js` | #9 MAX_DECISION_LOG (250), oldest-first at the write path |
| `js/store-relationships.js` | #9 MAX_RELATIONSHIP_HISTORY (50), oldest-first |
| `js/autoBackupName.js` (new) | #9 pure naming + rotation selection (unit-tested) |
| `js/autoBackup.js` | #9 dated filenames, rotation after each successful write |
| `eslint.config.js` | #10 globals presets replace the hand-maintained list |
| `package.json` | #10 globals pinned (^14.0.0) |
| `js/store-projects.js` | #10 getSeries import — renameSeries no longer throws |
| ~40 × js/tests files | #10 dead imports/state/escapes/stale directives cleaned |
| `js/tintaPackage.js` | #11 CRC-32 verification, encryption-flag rejection, orphan-blob rollback |
| `js/tinta-package.smoketest.mjs` | #11 3 new sections; honest-CRC test builders; quota-failure shim hook |
| `js/storage-hygiene.smoketest.mjs` (new) | #9 16 assertions |
| `js/autoBackup-name.smoketest.mjs` (new) | #9 10 assertions |

## Applying only the diff

`fixes-roadmap-8-11.patch` uses paths relative to the project root. From
inside the project directory:

    git apply fixes-roadmap-8-11.patch     # or: patch -p1 < fixes-roadmap-8-11.patch
