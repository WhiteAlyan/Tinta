# FIXES-ROADMAP-CR44-A11Y — applied batch (2026-10-31)

This batch applied **CR-44 (P2): the accessibility dedicated pass**, which
**absorbs CR-13** (no focus management in modal/drawer layers) as its
workstream 1. All green: **the complete Node smoketest suite passes
(including the new `a11y.smoketest.mjs`, 124 assertions), ESLint clean,
Playwright 44/44 in Chromium (6 new browser specs in
`tests/17-a11y-focus.spec.js`).**

The report's own caveat was "requires a real browser session with
assistive tech" — the Playwright specs are that session for the
behavioral half: they drive real Tab keypresses through real modals,
press Escape and watch focus land back on the opener, read the live
region's actual textContent, and resolve buttons by accessible NAME
(via `getByRole`) rather than by the CSS classes a screen reader never
sees.

---

## What the audit found

- **Modal layer (CR-13):** panels had no dialog role, no `aria-modal`,
  no label, never took focus on open, never returned it on close, and
  Tab walked straight out of the backdrop into the page behind. The
  confirm/prompt/notice dialogs were further along (role + label +
  focus restore) but had no trap either. Escape already worked.
- **Drawer layer (CR-13):** nothing at all — no role, no focus in, no
  focus restore, no Escape of its own (the global overlay shortcut
  covered it).
- **Nav:** the active tab was a CSS class only; a screen reader had no
  way to know which view you were on. Flyouts had `aria-expanded` but
  Escape did nothing.
- **Sidebar:** chapter/scene rows were click-only `div`s — a keyboard
  writer could not open a chapter from the sidebar AT ALL. The row's
  favorite/pin/trash buttons were title-only (and stayed `opacity: 0`
  until hover — even a focused control was invisible).
- **Icon buttons:** 60+ glyph-only buttons named by `title=` alone —
  a tooltip, not a name; most screen readers don't expose it on focus
  and touch never shows it.
- **Contrast (computed, all three themes):** paper's `--ink-faint`
  3.3–3.6:1 (used as text 165×), paper's `--accent` 2.84:1 on `--bg`,
  paper/sepia `--status-final` 3.09/4.11:1 as text, paper
  `--status-draft` 4.25:1 / `--status-revised` 4.46:1 on `--bg`,
  sepia `--ink-faint` 3.5–3.8:1, void `--ink-faint` 3.5–3.7:1.
  Void passed everything else.
- **Announcements:** zero `aria-live` regions in the entire app; a view
  switch replaced a whole panel in silence. Toasts and the storage
  banner weren't live regions either.

## What changed, file by file

- **`js/a11y.js` (new)** — the three primitives more than one overlay
  layer needs: `trapTabKey()` (WAI-ARIA dialog Tab cycling, edge-wrap,
  visibility-filtered focusables), `restoreFocus()` (best-effort, skips
  detached openers, tolerates option-less `focus()`), `announce()`
  (one lazy polite `role="status"` region, clear-then-set so identical
  repeated messages actually re-speak). Defensive throughout — the Node
  shims in modal.smoketest have no `querySelectorAll`/geometry, and the
  overlay code paths must survive them.
- **`js/modal.js`** — the panel is a real dialog: `role="dialog"`,
  `aria-modal="true"`, `tabindex="-1"`, `aria-labelledby="modal-title"`
  (header h2 got the id; headerless modals with a plain-string title
  fall back to `aria-label`). Focus moves into the panel on open (APG
  container-focus; callers that focus a specific field right after open
  — the palette — simply win). Escape handler is now a `handleKeydown`
  that also traps Tab against `.modal-panel`. `teardown()` restores the
  opener's focus on genuine closes — and because `openModal()` captures
  AFTER its internal teardown, stacked modals restore one step at a
  time, correctly. Confirm/prompt/notice gained the same in-dialog Tab
  trap on their capture-phase handler. Close button named.
- **`js/drawer.js`** — the panel is `role="dialog"` WITHOUT
  `aria-modal` on purpose (the drawer deliberately doesn't block the
  manuscript; screen readers must keep page-wide reach). Labelled from
  its `.drawer-title`, `tabindex="-1"`, focus moves in on open, focus
  returns to the opener on close (guarded so redundant `closeDrawer()`
  calls from outside-click + global Escape don't restore twice).
  Close button named.
- **`js/nav.js`** — both paint paths emit `aria-current="page"` on the
  active tab (grouped) / flyout item (compact). Escape on an open
  flyout closes it and refocuses the group toggle.
- **`js/sidebar.js`** — chapter rows are `role="button"` + `tabindex="0"`
  + Enter/Space activation, with a tight `aria-label` ("Title, Draft,
  1,204 words") and `aria-current="true"` on the active row; scene rows
  match. Act headers expose `aria-expanded`. Favorite/pin got
  `aria-label` + `aria-pressed`, trash got a NAME-SPECIFIC label ("Move
  {chapter} to trash" — three identical "Move to trash" entries in a
  screen reader's button list is unusable), scene carets got
  `aria-label` + `aria-expanded`, status dots became `role="img"` +
  named.
- **`css/shell.css`** — `:focus-within` reveals the row's hover-only
  buttons: opacity-0-until-hover must never hide a FOCUSED control from
  the keyboard writer who just Tab'd onto it (WCAG 2.4.7).
- **`js/commandPalette.js`** — proper combobox: input is
  `role="combobox"` with `aria-controls`/`aria-expanded`/
  `aria-autocomplete="list"`, results are a `role="listbox"`, rows are
  `role="option"` + `aria-selected` with stable ids, and the input's
  `aria-activedescendant` tracks the highlighted row.
- **`js/toast.js`** — toasts are `role="status"` (polite), the storage
  banner is `role="alert"` (assertive — storage loss is an emergency),
  both dismiss buttons named, decorative icon `aria-hidden`.
- **`js/app.js`** — the sidebar toggle is a real disclosure
  (`aria-label` + `aria-expanded`, kept in sync from Settings too);
  `render()` announces a landed view ("Book view") through the live
  region, on view CHANGE only — typing re-renders constantly and must
  not babble.
- **60+ icon buttons across 21 files** (codemod + manual review) — every
  glyph-only button carries `aria-label` mirroring its title, including
  the write toolbar, organize modal, notes, timeline, canvas, theme
  swatches, and the shell's ⌘K button. Buttons with real text content
  deliberately keep title-as-tooltip (content already names them;
  adding aria-label would override the richer visible name — WCAG
  2.5.3 label-in-name respected).
- **`css/base.css`** — contrast fixes, minimal same-hue nudges:
  paper `--ink-faint` `#8B8680→#746F6B`, paper `--accent`
  `#B08D57→#A98754`, paper `--entity-item` tracks the new accent,
  paper `--status-draft` `#9B6B2F→#94662D`, `--status-revised`
  `#4A7C59→#467556`, `--status-final` now its own value
  (`#8A6B3D`, the accent-deep bronze — it was raw accent as text);
  sepia `--ink-faint` `#8A7856→#756549`, `--status-final`
  `#966B3D→#74512A`; void `--ink-faint` `#6B6780→#7E7B90`.
- **`css/polish.css`** — a themed `:focus-visible` ring
  (`--accent-deep`, 2px + offset) for everything that doesn't declare
  its own focus treatment; the palette input's border shows focus.
  The chapter editor keeps its intentional borderless design (the
  caret + per-paragraph highlight ARE the indicator — documented in
  the CSS).
- **`sw.js`** — `a11y.js` precached; `CACHE_NAME` bumped to
  `tinta-shell-v0.3.2`.
- **`js/module-load.smoketest.mjs`** — a11y.js registered (90/90
  modules, 946 exports verified).

## Deliberate contracts (read before touching)

- **Blocking modals trap; the drawer doesn't.** That asymmetry is the
  modal/drawer split documented in both file headers — modal blocks via
  backdrop, drawer doesn't. Don't "unify" the trap into the drawer.
- **aria-label only on glyph-only buttons.** A text button named by
  aria-label OVERRIDES its visible text; that's a regression, not a
  fix. The a11y smoketest's icon-name gate encodes exactly this
  heuristic (title + no aria-label + glyph-only content = failure), so
  new icon buttons drift-fail CI until named.
- **The contrast tiers are pinned**: ink family / accent-deep /
  status-* must hold ≥ 4.5:1 on BOTH `--paper` and `--bg` in all three
  themes; accent / entity-* hold ≥ 3:1 (dot/badge tier). Retuning a
  theme means re-passing `a11y.smoketest.mjs`.
- **`announce()` is for view-level changes only.** Per-keystroke
  announcements (word count, saves) would drown the writer; saves are
  already visible in the toast (role=status).

## Verification

- `node js/a11y.smoketest.mjs` — 124 assertions: the contrast matrix
  (7 text-tier + 5 UI-tier tokens × 2 surfaces × 3 themes + editor ink),
  the icon-name gate scanned across all js + index.html, structural
  pins on every CR-44 markup contract, and behavioral unit tests for
  trapTabKey (edge wraps, in-range pass-through, null safety),
  restoreFocus (connected/detached/null/option-less), and announce()
  (single reused region, async landing, identical-message re-speech).
- Full Node suite: green (exit 0). ESLint: clean.
- `npx playwright test` — 44/44, including the six new specs:
  1. blocking modal: labelled dialog, focus enters, forward-Tab from
     the last control wraps to the first, Escape restores the opener;
  2. confirm dialog: alertdialog semantics, Tab stays inside the two
     buttons, Escape restores the ✕ that opened it;
  3. `aria-current` on nav + active chapter row, and the live region
     literally reads "Book view" after the switch;
  4. chapter rows keyboard-operable (Enter and Space both land in
     Write);
  5. entity drawer via a real user path (Notes create → Search →
     result row): non-modal dialog, labelled from its title, focus in,
     Escape closes, zero console errors;
  6. icon-only shell buttons resolved by accessible NAME (⌘K, Close),
     palette combobox wiring end-to-end.

## Remaining queue

Next in `FIXES-ROADMAP-NEXT.md`: the CR-06…CR-40 remainder in report
order, interleaving CR-48/CR-49 where a touched file makes them cheap.
Nothing in this batch changed that order. (CR-13 is closed — absorbed
here.)
