# FIXES-ROADMAP-BATCH5-CR06-40 — applied batch (2026-10-31)

This batch applied **the entire CR-06…CR-40 remainder in report order** —
32 findings (35 minus CR-13, absorbed by batch 4's a11y pass; CR-17 and
CR-19, applied in batch 2). All green: **the complete Node smoketest
suite passes — 64 files including the new `cr-batch5.smoketest.mjs`
(92 assertions) — and ESLint is clean on the freshly upgraded toolchain
(ESLint 10 / @eslint/js 10 / globals 17 / eslint-plugin-import-x).**

Where a fix's contract changes how other code may behave, that contract
is named here. Findings are in report order; the notes are honest about
what is pinned by test and what is review-pinned (the DOM-bound half of
the batch has no jsdom harness — the same standing gap every prior pass
documented, now listed in one place in the batch smoketest's header).

---

## P2 fixes (report order)

### CR-06 — cross-tab guard is blind to equal-revision clobbers
Two arbitration paths existed; both only fired on `incomingRev > ourRev`.
Both now detect the equal-rev race, each in the way its transport allows:

- **BroadcastChannel path (IndexedDB primary):** the flush message now
  carries the sender's per-tab session id. One landed flush bumps the rev
  exactly once, so a peer flush at OUR current rev from a DIFFERENT
  session can only mean two flushes raced to the same revision and the
  second write won the disk. Both tabs flag stale (neither can prove it
  won), which is the honest outcome — the losing copy exists only in one
  tab's memory, and that tab now gets the copy-out rescue instead of
  silently continuing on a clobbering trajectory.
- **Mirror storage-event path (legacy/fallback):** payloads carry no
  session id (older builds must keep loading them), so equality is
  arbitrated by CONTENT: a fast 53-bit hash (cyrb53 shape) of the
  incoming bytes is compared against the hash of the last bytes THIS tab
  wrote to the same key. Identical bytes = a benign echo of a shared
  state (including the pause-point mirror write); different bytes = two
  divergent states met and one lost. A tab that has never written
  (hash slot null) never flags — a peer persisting the state both tabs
  loaded is not a clobber.

Contract change: `_simulateCrossTabFlush(rev, sid = 'test-peer')` and
`onCrossTabConflict` details gain `equalRev: true` for the equal-rev case.
Pinned by `cr-batch5.smoketest.mjs` (benign echo, divergent equal-rev,
lower-rev unchanged, both broadcast cases).

### CR-07 — copy-out rescue compared against already-mutated state
The conflict banner compared `editor.value !== savedChapter.content`, but
`updateChapterContent` mutates the in-memory chapter BEFORE `save()` is
attempted — in the ordering where the debounce fired and was refused as
stale, the comparison saw "no difference" and degraded the banner to the
plain reload variant. The banner now compares against the editor's
**watermark** (`getLastSavedValue()` on the attachEditor handle) — the
last value whose persist actually LANDED, which is exactly the
last-known-good reference the report called for. The banner message also
names the equal-rev case distinctly (CR-06's detail flag). Review-pinned
(DOM); the watermark contract itself was already test-pinned by
save-truthfulness.smoketest.mjs.

### CR-08 — format toggles / mention insertion / grammar replacement wiped native undo
All three paths assigned `textarea.value = …`, which clears the browser's
native undo history — and the app-level undo deliberately refuses to run
inside a textarea, so one Ctrl+B invalidated the writer's whole Ctrl+Z
history. New sanctioned edit path, `applyTextareaEdit()` in editor.js:
compute the minimal replaced span by trimming the common prefix/suffix of
the old and new values, select it, and insert via
`execCommand('insertText')` — the one editing path that records a native
undo step in Chromium/Firefox/WebKit. setRangeText was considered and
rejected (it bypasses undo). If the engine rejects or mangles the edit
(verified by comparing the resulting value — insertText has known
newline quirks), the code falls back to the historical value assignment:
losing undo for one operation is strictly better than losing prose.
Routes: toolbar buttons, Ctrl+B/I/U, image insert (via applyFormatToggle),
mention popup selection, grammar-modal replacement. Review-pinned (DOM).

### CR-09 — export defects (underline leak, [object Object] images, .md backup contents)
- The combined inline pattern now covers **underline** (`{{u:…}}` was the
  one missing token), group indices shifted accordingly; DOCX emits
  `<w:u/>`, EPUB emits `<u>`.
- `epubRunHtml` no longer returns an object for image runs (the literal
  `[object Object]` in mid-sentence-image paragraphs). The mixed-run path
  renders a valid inline `<img>`; missing images degrade to the same
  placeholder the figure path uses.
- `exportProjectText` now applies `isExportableChapter` (trashed,
  archived, and scratch chapters no longer ship in the whole-project
  .md backup) and both .md paths strip manuscript tokens via
  `stripFormattingTokens` (the CR-46 stripper), matching the menu's
  "prose-only" promise.
Pinned by `cr-batch5.smoketest.mjs` (parser + markdown export sections).

### CR-10 — quadratic LCS diff → capped Myers O(ND)
`diffText` built an (n+1)×(m+1) matrix: measured ~0.8 s and ~400 MB at
12k tokens, projective tab death at SFF chapter sizes. Replaced with
Myers shortest-edit over the token streams: common prefix/suffix trimmed
first (typical revision compares become nearly free), hard edit-distance
cap of 1500 (trace memory O(D²) ≈ 9 MB worst case), and past the cap one
honest remove+add replace pair — the summary counts stay exact, nothing
freezes, nothing allocates gigabytes. Pinned by `cr-batch5.smoketest.mjs`
(correctness, 12k-token latency, over-budget fallback, exact summary).

### CR-11 — sprint countdown stomped whatever modal was open
Both sprint surfaces wrote `#modal-root.innerHTML` directly — no Escape
handling, no outside-click, no focus management (CR-44's trap never
engaged), and the stomped modal's registered onClose fired later against
the wrong surface (the Library yanked itself back open). Both surfaces
now route through `openModal()`, and the countdown-zero path respects a
non-sprint modal: the sprint still ends, and a toast with a
"See summary" action replaces the surprise takeover. Review-pinned (DOM).

### CR-12 — health view accumulated a click handler per render
The jump-row handler attached to the persistent `.view-panel` section on
every render; after N visits, N handlers each did a synchronous
full-app render. Same dedupe as resumeView: one module-level
`handleHealthPanelClick`, removed and re-added per render.

### CR-14 — clicking the current project's Library card wiped undo
`switchToProjectFromLibrary` early-returns when the id equals the active
project: the Library still closes (the gesture's intent), the workspace
keeps its undo stack, filters, and active chapter.

### CR-15 — debounced entity edits dropped on project switch
`teardownLiveStateForProjectSwitch()` now flushes the pending entity
field save FIRST — while the old project is still active — instead of
letting the deferred flush look the entity up in the new project and
silently fail. Same protection the chapter editor's flush already had.

### CR-16 — referencesView patched another panel's DOM
The live title-update selector scoped from `document` to the references
panel root. Typing in References no longer rewrites hidden Map/Sketch
rows, and the visible References row now actually live-updates.

### CR-18 — statistics/word-check/style-scan were Latin-only
- `wordCount()` counts CJK characters (han/hiragana/katakana, one ≈ one
  word — the CJK writing-tool convention) and strips them before the
  unchanged Latin whitespace pass, so the footer, goals, celebrations,
  sprint WPM, and the DOCX title-page total (now computed through the
  same `wordCount`) all agree for CJK prose.
- Word Check's tokenizer emits individual CJK characters (the standard
  CJK word-check unit); the length>1 Latin filter no longer eats them.
- The style-guide scanner uses script-aware boundaries for CJK rules:
  the guard blocks only ASCII-word embedding ("误差less"), because CJK
  characters cannot delimit each other — requiring a non-CJK neighbor
  would have made almost every real match impossible. Lookbehind
  compiled in try/catch with the legacy \b fallback.
Hangul deliberately excluded (Korean is space-separated; the Latin path
already counts it). Pinned by `cr-batch5.smoketest.mjs` (three sections).

### CR-20 — corrupt backup surfaced a raw TypeError
`importFullBackup` validates each project record is an object before
migrating, and the `replaceDb` call is wrapped so any other
structurally-plausible shape surfaces as the designed "That file doesn't
look like a Tinta backup." (with the engine error preserved as `cause`).
`replaceDb`'s own schema-downgrade refusal passes through untouched, and
migrate() throws before any state is touched, so no rollback path is
needed. Pinned by `cr-batch5.smoketest.mjs` (four hostile shapes).

---

## P3 fixes (report order)

### CR-21 — exportTintaProject ignored its parameter
Resolves the id honestly via the new `Store.getProjectById()` (ownGet
semantics — imported garbage keys like `constructor` resolve to null);
null id still falls back to the active project; unknown ids throw a
named error. Pinned by `cr-batch5.smoketest.mjs`.

### CR-22 — reorderChapter threw on unknown id + 'down'
Explicit `idx === -1` guard, mirroring reorderTimelineEvent. Pinned.

### CR-23 — permanent entity delete destroyed its relationships unrecoverably
`backupBeforeDelete` gained an optional `extra` payload (deep-copied,
kept separate from `data` so restore paths that spread data never
inherit it). `deleteEntity` captures every cascade-doomed relationship —
with its TYPE's label resolved at capture time, because
`cleanupOrphanedRelationshipType` garbage-collects the type the moment
the cascade deletes its last edge — and `restoreDeletedItem` rebuilds
the edges with fresh ids, remapping the original entity id onto the
restored record, skipping edges whose other endpoint no longer exists.
Freeform fields (status/strength/dates/notes) ride along; audit history
intentionally does not (its timelineEventIds may themselves be deleted).
The bare `project.entities[entityId]` index is now `ownGet`, so
`deleteEntity('constructor')` can't archive a junk backup. Pinned.

### CR-24 — nested `<option>` phantom blank in Scene Inspector dropdowns
Both selects (scene-relationship target, story-question link) emit a
real `<option value="">Choose a…</option>` placeholder instead of the
parser artifact. Review-pinned (DOM).

### CR-25 — async uploads resurrected a closed Settings modal
Every post-`await` re-render goes through `reopenSettingsIfStillOpen()`,
which checks the settings-modal class on the live panel before
re-opening. Escape during a large font/track/image upload now stays
closed. Review-pinned (DOM).

### CR-26 — map background URL registry race
Staleness check now precedes the registry write, and a resolution that
lost the race revokes its own fresh object URL immediately (fresh URL
per call — the loser owns it). One leak per re-render collision → zero.
bookView's async push was examined and needs no change: it pushes into a
multi-slot array revoked wholesale at teardown, so push-then-check is
already leak-free there.

### CR-27 — corkboard ignored live arc-filter changes
The sidebar arc filter's change handler now also `requestRender()`s, so
the corkboard (and any other live view reading the filter) refreshes
immediately instead of at the next full render.

### CR-28 — leading blank line stripped by the render-save round trip
The chapter textarea's content is assigned via `.value` (before
attachEditor snapshots the watermark) instead of being rendered as
inner text, which the HTML parser byte-mutates (one newline after the
opening tag). Stored prose is byte-stable across visits now.

### CR-29 — service worker: no offline fallback; fire-and-forget cache refresh
The cache refresh inside the fetch chain is wrapped in
`event.waitUntil` (the SW could be killed before the put landed), and
the network-first catch falls back to a real offline page for
navigations (pointing at the precached app root) or a well-formed 504
for everything else, instead of a rejected promise. `CACHE_NAME`
bumped to v0.3.3 (SHELL_FILES + fetch-handler changed).

### CR-30 — serve.py: directory listings, missing headers, single-threaded
A `TintaRequestHandler` subclass 404s directory paths without an index
(the app root still serves), stamps `X-Content-Type-Options: nosniff`
and `Cache-Control: no-cache`, and the server is now
`ThreadingHTTPServer` (one stalled connection can no longer freeze the
launcher). Binding stays 127.0.0.1.

### CR-31 — Playwright: Chromium-only, retries disabled under a documented flake
`retries: process.env.CI ? 1 : 0` (the ~1-in-3 "browser-closed"
infra flake no longer reds CI; local runs still show real flakes), a
WebKit project joins Chromium (run `npx playwright install webkit`;
CI can scope with `--project=chromium`), and the test webServer binds
127.0.0.1 like serve.py.

### CR-32 — PWA manifest lacked a maskable icon
`icons/icon-maskable-512.png` generated from the existing 512 icon at
76% scale on the theme-color canvas (inside the ~80% safe zone), declared
with `purpose: "maskable"`, and precached in SHELL_FILES — which the
sw-precache smoketest enforced the moment the file existed (it caught
the drift before this batch shipped).

### CR-33 — ESLint config: Node globals leaked into browser files
Split into per-file-class blocks: `js/**/*.js` (what the browser loads)
gets browser globals ONLY; `js/**/*.mjs` (smoketest harnesses) and
`tests/**/*.js` (Playwright specs) get node globals + the deliberate
globalThis extension. `no-unused-vars` is an **error** for app code
(warn for harness files).

### CR-34 — documentation truth
- docs/README.md's **Data** section rewritten: primary database is
  IndexedDB (`tinta-db`), localStorage `tinta:db` is a bounded
  best-effort mirror, legacy `scriptorium:db` migrates on boot, and the
  blob stores (images/fonts/ambience/recovery/quarantine) live in their
  own IndexedDB stores. This was the most load-bearing claim writers
  rely on for data-safety decisions, and it was false.
- docs/TINTA-MASTER-TRUTH.md's verification-basis header corrected: the
  real smoketest/module/export counts (64 files; 90/90 modules, 946
  exports — and an explicit warning that module-load's list is a
  load-and-shape check, not complete coverage), with the stale 55/58
  claim and its history kept clearly marked.
- sw.js's storage header was already corrected by batch 2's storage
  epic; verified, no further edit needed.

### CR-35 — tooling currency
Upgraded and locked: `eslint@^10.14.0`, `@eslint/js@^10.0.1`,
`globals@^17.13.0`, and `eslint-plugin-import` → the maintained
`eslint-plugin-import-x@^4.17.1` (the config used exactly one rule —
`import/no-unresolved` — a trivial port; same rule name, same resolver
settings). ESLint 10's new core rules (`no-useless-assignment`,
`preserve-caught-error`) then flagged 6 latent spots across app.js,
editor.js, theme.js, store-core.js, tintaPackage.js — all fixed, lint
green.

### CR-36 — repo hygiene
Added `LICENSE` (MIT, "Tinta contributors" as holder — no person was
inventable from the repo), `.gitignore` (node_modules, Playwright
artifacts, Python caches, OS noise — the first `git init` no longer
commits the toolchain), and a root `README.md` (quick start, where the
writing lives, docs map, dev commands — the Linux launcher's README
reference now resolves). The Windows launcher checks `py` BEFORE
`python`, so the Microsoft Store python stub can no longer intercept
double-clicks on machines without real Python.

### CR-37 — safeFilename was ASCII-only
Both `file-utils.js` and manuscriptExport's local copy now strip
`[^\p{L}\p{N}\-_ ]+/gu` — letters and numbers from any script survive,
genuinely unsafe characters don't. 我的小说 exports as 我的小说.epub,
untitled no more. Pinned by `cr-batch5.smoketest.mjs`.

### CR-38 — data-mention-name double-escaped (latent)
The chip pass runs on already-escaped text; the captured name is now
unescaped back to the writer's raw text (entity order handled, `&amp;`
last), the attribute is escaped exactly once, and the entity-resolver
comparison runs against raw names too — it used to miss every name
containing `& < > ' "`. The visible chip text is unchanged (single
escape in body context was already correct). Pinned.

### CR-39 — overlay did full-document work twice per keystroke
The `keyup` handler refreshed the overlay and typewriter scroll
unconditionally after `input` had already done both at the same caret.
Both now gate on the caret having actually moved since the last
rendered overlay state (arrows/Home/End/PgUp/PgDn), eliminating the
duplicate full-document regex pass, the per-mention lookups, the
innerHTML parse, and the mirror-div layout thrash per printable
keystroke. Review-pinned (DOM).

### CR-40 — EPUB manifest interpolated image MIME unescaped
Allow-list (`image/png|jpeg|jpg|gif|webp` — the types Tinta itself
produces); anything else exports as `application/octet-stream`. Hostile
mimes from an imported .tinta package can no longer break the OPF.
Pinned by `cr-batch5.smoketest.mjs` (hostile + legitimate pass-through).

---

## Interleaving note (CR-48 / CR-49)

The queue's rule was "interleave CR-48/CR-49 where a touched file makes
them cheap." No batch-5 fix touched `bookView.js`'s pagination or
`zip.js`, so both remain queued for their own (small) pass: CR-48 =
recalculate Book view pagination on resize/orientation change; CR-49 =
optional DEFLATE for non-media ZIP entries.

## Remaining queue

Empty for the main report's CR-01…CR-49 list except CR-48/CR-49 above.
Any NEW findings from later sessions start their own queue against
`docs/TINTA-MASTER-TRUTH.md`'s corrected verification basis.

## Verification (this batch)

- `for f in js/*.smoketest.mjs; do node $f; done` — **64/64 files green**
  (including the new `cr-batch5.smoketest.mjs`, 92 assertions).
- `npm run lint` — clean on ESLint 10.
- `node --check` clean on every touched file; `python3 -m py_compile
  serve.py` clean.
- The sw-precache drift gate fired on the new maskable icon during the
  run (as designed) and the precache was completed in the same batch.
