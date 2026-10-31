# FIXES-ROADMAP-CR43-SEARCH — applied batch (2026-10-31)

This batch applied **CR-43 (P2): user-supplied regex can freeze the app
(ReDoS + sync search)**. All green: **the complete Node smoketest suite
passes (new `search-hardening.smoketest.mjs`, 177 assertions), ESLint
clean, Playwright 38/38 in Chromium (3 new browser specs in
`tests/16-search-regex-freeze.spec.js`).**

The bug, precisely: `searchView.js` called `Store.searchProject()` **on
every keystroke, synchronously, on the main thread**, and `search.js`
compiled the writer's regex with no execution limit of any kind. JS
regex has no built-in time bound, so a pattern like `(a+)+c` against one
unlucky chapter backtracks exponentially **inside a single `exec()`
call** and froze the whole app — no typing, no clicking, no closing
cleanly. The same unguarded pass also ran through the Replace preview on
every render and through `planChapterReplace` on replace.

---

## The design: four layers, because no single one is sufficient

A regex engine cannot be interrupted from outside a single `exec()` call
— that's the whole difficulty. So the fix stacks four defenses, each
covering the case the previous one can't:

1. **Cooperative budget (engine, `search.js`).** Every match ATTEMPT
   (loop iteration, not per scanned character — `indexOf`/`exec` do the
   scanning in C) checks a wall-clock deadline; a global result cap
   (2000) bounds runaway match counts. When either trips, the scan stops
   and the run reports `stopped: { reason: 'time' | 'matches' }` —
   partial results, honestly labeled. Handles "slow pattern over a big
   project" gracefully.

2. **Off the main thread (worker, `search-worker.js`).** Scanning runs
   in a module worker (`{ type: 'module' }`, CSP `worker-src 'self'`
   allows a same-origin file — NOT a blob:, which is why this is a real
   file precached in `sw.js`). The main thread never runs user regex
   anymore; the UI stays responsive no matter what the pattern does.

3. **Hard watchdog (service, `searchService.js`).** A single
   catastrophic `exec()` never returns control, so no in-worker check
   can fire. The service arms a watchdog at **engine budget (2s) +
   grace (1.5s)**: no reply in time → `worker.terminate()` — the ONLY
   way to interrupt a stuck regex — and the next search respawns the
   worker lazily. That is RE2's actual guarantee ("the pattern cannot
   run unbounded") without RE2's syntax restrictions, which would
   reject patterns prose writers legitimately use. This is why "consider
   RE2-style safe regex" resolved to a terminate-able worker instead of
   a pattern-screening filter: any static screen either false-positives
   on legitimate patterns or misses real killers.

4. **Cancellation (tokens + slice yields).** Every run carries a
   monotonic token; `cancelActive()` invalidates it (the promise
   resolves 'cancelled', late replies are dropped) and the worker aborts
   at its next slice boundary. The search runs **one result category per
   slice** (`searchTaskRunner.js`, shared by worker and fallback) and
   yields to the event loop between slices — so a cancel lands MID-search
   instead of after it. The view supersedes on every debounced keystroke,
   project switch, and view reset.

## What changed, file by file

- **`js/search.js`** — `createSearchBudget()` (deadline + global match
  cap, checked per match attempt); `searchProject()` gained
  `budgetMs` / `maxMatches` / `onlyCategories` options and returns
  `stopped` on every result shape (additive — the sync signature and
  results the Node tests and store layer already use are unchanged);
  new `buildReplacePlan()` (budgeted, `countsOnly` mode) with
  `planChapterReplace` now a thin legacy wrapper over it.
- **`js/searchTaskRunner.js` (new)** — the one slice-per-category loop,
  merge rules, and replace-preview-counts step shared by BOTH backends.
  Deliberate drift-proofing: these are exactly the things that would
  silently diverge if the worker and the fallback each hand-rolled
  their loop.
- **`js/search-worker.js` (new)** — thin glue: protocol in/out, token-
  scoped cancel, honest `error` replies. Module worker so the engine
  lives in one place.
- **`js/searchService.js` (new)** — backend selection (worker, fallback
  to main-thread slicing when `Worker` is missing or fails to load),
  run tokens, cancellation, the hard watchdog, worker respawn, and a
  `worker.onerror` path that degrades a broken worker to the fallback
  mid-run instead of leaving a dead search view. Every entry point
  RESOLVES — never rejects — so the view can render every outcome.
- **`js/searchView.js`** — the engine call is off the render path.
  Renders paint the last completed outcome from a result cache whose
  key binds query + case + regex + **the store's save revision**
  (`getSaveRev()`), so any landed edit invalidates the cache without
  this view knowing what the edit touched. Typing is debounced (150ms),
  a stale outcome still renders under an explicit "Searching…" note
  (progressive-search presentation, no blanking between keystrokes),
  and the stopped/capped states are surfaced honestly (see below).
- **`js/store-core.js` / `js/store.js`** — new `getSaveRev()` export
  (read-only view of the last landed flush's rev — the cache-buster).
- **`js/store-manuscript.js` / `js/store.js`** — new `applyReplacePlan()`:
  the store side of the split replace. The UI evaluates the plan in the
  worker first (same budget/watchdog protection — the Replace door can't
  freeze the app either), then hands the precomputed `newContent`
  strings to the store, which snapshots and assigns — **no second
  unguarded regex pass on the main thread**. `replaceInChapters` keeps
  its legacy find+apply shape and now shares this apply path.
- **`js/sw.js`** — `searchTaskRunner.js` + `searchService.js` +
  `search-worker.js` precached; `CACHE_NAME` bumped to
  `tinta-shell-v0.3.1`.
- **`css/tools.css`** — `.search-stopped-note` shares the regex-error
  warning tone; a stopped/capped run must not look like a quiet
  "no matches".

## Honest-UI contract (what the writer sees)

- **Cooperative stop** (time): partial results + "Search stopped after
  Ns — showing the partial results found before the time budget ran
  out. They may be incomplete; narrowing the query will finish faster."
- **Match cap**: partial results + "Result cap reached — showing the
  first matches only."
- **Hard stop** (watchdog terminated the worker): NO results (none
  survived) and no fake "No matches" — just "Search stopped — this
  pattern was too expensive to run safely on this project, so it was
  terminated before it could lock the app up."
- **Replace is count-gated**: the button renders only from a COMPLETED
  run's `replacePlanCounts` (computed in the same worker round-trip as
  the results). While counts are unknown or the pattern couldn't be
  fully evaluated, the panel says so and offers no button — a replace
  must never be offered on numbers known to be partial, and the actual
  replace re-evaluates the plan in the worker and refuses to apply a
  stopped plan.
- **Error path**: a worker-level failure renders "Search failed: …" and
  the service falls back to the main thread for the in-flight run
  rather than leaving a dead view.

## Deliberate contract changes (read before touching)

- `searchProject()` results now ALWAYS carry `stopped` (null = ran to
  completion). Existing consumers that read categories/`regexError` are
  unaffected; new consumers should honor `stopped` rather than treating
  results as total.
- `planChapterReplace(project, q, r, opts)` still returns the plain
  plan array, but the canonical builder is `buildReplacePlan()`
  (`{ plan, stopped }`). Prefer it everywhere new.
- The search view renders from a result CACHE keyed by
  query/case/regex/`getSaveRev()` — flushes are microtask-coalesced, so
  the rev has always bumped by the next render after a mutation. If you
  add a mutation path that does NOT go through `save()`, the cache
  won't know about it.
- `search-worker.js` MUST stay in `sw.js`'s SHELL_FILES (the precache
  drift smoketest enforces this) — offline use needs the worker for the
  freeze guarantee; without it the app falls back to main-thread
  slicing, which is bounded but not terminate-able.

## Verification

- `node js/search-hardening.smoketest.mjs` — 177 assertions: engine
  regression + honest `stopped` shape, slice/full equivalence for every
  category, global cap lands on exactly the capped count, budget-0
  determinism, budgeted replace plan + countsOnly, the store refusing a
  countsOnly plan, fallback backend completion, cancel-then-next-run
  recovery (the CR-19 lesson applied to search), and the watchdog path
  driven by a fake wedged Worker (hard stop, bounded wait, respawn).
- Full Node suite: green. ESLint: clean.
- `npx playwright test` — 38/38 including the three new specs:
  1. catastrophic regex: main thread answers `evaluate()` WHILE the
     pattern is wedged in the worker, watchdog note lands, app fully
     interactive afterwards, no console errors;
  2. result cap: 120 chapters × 20 matches trips the 2000 cap, note
     shows next to the (useful) partial results;
  3. ordinary search: full results, no stopped note, replace button
     backed by real counts.

## Remaining queue

Next in `FIXES-ROADMAP-NEXT.md`: **CR-44** (accessibility pass, absorbs
CR-13), then the CR-06…CR-40 remainder, interleaving CR-48/CR-49 where a
touched file makes them cheap. Nothing in this batch changed that order.
