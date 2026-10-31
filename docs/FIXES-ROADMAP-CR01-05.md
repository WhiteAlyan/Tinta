# FIXES-ROADMAP-CR01-05 — urgent batch applied (2026-10-31)

All five urgent findings from the code-review report are fixed, test-pinned, and
green: **55+ Node smoketests (2 new/extended), ESLint clean, 34/34 Playwright
browser tests.** The `save-rev-integrity.smoketest` invariant ("rev only
advances after a successful save") is deliberately unchanged — CR-01's fix was
designed around it, not against it.

---

## CR-01 (P0) — Quota-recovery snapshot was always destroyed at boot

**Root cause.** `_db.rev` only advances after a *successful* localStorage write,
so the snapshot taken on the quota-failure path always carried a rev **equal**
to disk. `recoveryToast.maybeShow()`'s staleness rule was
`snapshotRev <= diskRev → stale`, so every snapshot that survived to boot was
classified as stale and silently deleted. The rescue toast was unreachable
code, and boot actively destroyed the only copy of the writer's unsaved work.

**Fix.**
- `js/recoveryStore.js` — snapshots now travel with a meta record
  (`diskRevAtSnapshot`) under a sibling IndexedDB key
  (`unsaved-db-snapshot-meta`), so `getRecoverySnapshot()` still returns the
  clean db object for `replaceDb()`. New pure function `isSnapshotStale()`
  encapsulates the corrected rule: **stale only when the disk rev has moved
  PAST the rev the snapshot was taken against.** Equality means the failed
  write never landed — the snapshot *is* the freshest copy.
- `js/store-core.js` — the quota path passes
  `{ diskRevAtSnapshot: _db.rev || 0 }` with the snapshot.
- `js/recoveryToast.js` — boot check uses `isSnapshotStale()`; header docs
  updated. Legacy snapshots written before this fix (no meta record) fall back
  to the payload rev — which also fixes the P0 for existing installs, because
  equality is no longer misread as staleness.

**Pinned by** `js/cr-urgent-batch.smoketest.mjs`: pure rule pins (including the
exact equality case), a meta round-trip, and an end-to-end quota failure
through the real `writeToLocalStorage` (injected `QuotaExceededError` +
fake-indexeddb): snapshot lands → holds the unsaved prose → classified NOT
stale at equal disk rev → cleared after a successful retry → inverse pin (a
later successful save *does* stale it).

## CR-02 (P1) — Full-backup restore imported an attacker-controlled grammar endpoint

**Root cause.** The `.tinta` import builds an empty grammar shell, but
`importFullBackup()` fed the whole parsed file to `migrate()`, which only
backfills *missing* grammar settings. A crafted backup could land with
`grammar.enabled = true` and any `endpointUrl`; the first Grammar click would
POST the full chapter text plus the stored LanguageTool apiKey/username to
that host (grammar.js is the only `fetch()` caller in js/).

**Fix.** `js/store-backup.js` — `delete parsed.grammar` before `replaceDb()`;
`migrate()` backfills the canonical safe shell (`enabled: false`, stock
LanguageTool endpoint, no credentials). Covers both import paths —
`backup.js importFullBackupWithImages()` delegates to `importFullBackup()`.
Covers both import paths — recovery-restore keeps the writer's own settings (trusted, first-party data).

**Pinned by** `cr-urgent-batch.smoketest.mjs`: hostile values gone, safe shell
present, imported project intact, grammar-less backups still import cleanly.

## CR-03 (P1) — Stored XSS in the entity image-gallery modal title

**Fix.** `js/notesView.js:398` — `` title: `Add images · ${escapeHtml(entity.name)}` ``;
`escapeHtml` joins the dom-utils import. Every other `openModal` caller already
escaped; a codebase-wide sweep of dynamic `` title: `…${…}` `` properties finds
no remaining unescaped HTML sink (the two rg hits are store-record titles, not
markup).

**Pinned by** sink-scoped static pins in `cr-urgent-batch.smoketest.mjs`.

## CR-04 (P1) — Overlay caret/scroll desync when formatting is used

**Root cause.** The overlay deleted format markers and rendered real bold
glyphs, so formatted paragraphs soft-wrapped at different points than the
textarea's layout of the same characters; near the bottom of a formatted
chapter the shorter overlay content also clamped `scrollTop` and lost sync.

**Fix (metric-parity rendering).**
- `js/format.js` — `renderFormattedHtml()` / `renderEditorParagraph()` gain
  `keepMarkers`. In that mode every marker character stays in the output,
  wrapped in `.fmt-marker` spans. Markers are parked behind per-call sentinels
  (`\uE000<idx>\uE001`, Private Use Area — unmatchable by every format pass,
  lint-clean) because the passes run sequentially and the italic pass would
  otherwise match *across* bold marker spans (caught by the new tests).
  Default mode resolves sentinels to `''` — byte-identical to the old output,
  so Book view/exports don't change.
- `js/editor.js` — `updateDimOverlay()` passes `keepMarkers: true`.
- `css/editor-view.css` — `.fmt-marker` is transparent at inherited weight;
  `strong` switches from `font-weight: 700` to faux bold
  (`-webkit-text-stroke: 0.7px currentColor`) — visually heavy, metrically
  identical; mention chips rebuilt from zero-layout-cost properties
  (box-shadow halo + outline instead of padding + border, weight inherited).

**Known residual.** True italics still have slightly different advance widths
(fixing that would cost the feature's actual italic look); inline images
remain the documented approximation. Everything else (markers, bold,
underline, color, mentions) is now width-exact.

**Pinned by** `editor-paragraph.smoketest.mjs` CR-04 section: for a range of
formatted inputs, tag-stripped keepMarkers output must equal the raw text
character-for-character; plus marker-count, sentinel-isolation, and
default-mode-unchanged pins; plus a static pin that the overlay passes
`keepMarkers: true`.

## CR-05 (P1) — No IME composition guards in the editor

**Fix.** `js/editor.js` — new `isImeComposing(e)` (`e.isComposing === true ||
e.keyCode === 229`), early-returning in **all three** textarea keydown
handlers: the mention popup (`handleKeydown` — guard ordered *before* the
visibility check so a visible popup can't swallow composition-committing
Enter/Tab or candidate-navigation arrows), the typewriter-sound handler, and
the Ctrl+B/I/U formatter (a mid-composition toggle rewrites `textarea.value`
underneath the IME and cancels the composition).

**Pinned by** static pins in `cr-urgent-batch.smoketest.mjs` (helper shape,
exactly three guard sites, guard-before-visibility ordering).

---

## Verification

- `npm run smoketest` — all files, 0 failures (incl. the new
  `cr-urgent-batch.smoketest.mjs` and extended `editor-paragraph` /
  recovery suites; `save-rev-integrity` invariant intact).
- `npx playwright test` — 34/34 passed (Chromium), including
  `12-quota-exceeded.spec.js` and `15-migration-backfill.spec.js`.
- `npx eslint` on all touched files — clean.
