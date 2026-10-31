# FIXES-ROADMAP-QUICKWINS-STORAGE — applied batch (2026-10-31)

This batch applied the queue's quick wins (**CR-47, CR-46, CR-17**) and the
full storage epic (**CR-19, CR-42, CR-41**, with **CR-45's benchmark set as
the acceptance gate**). All green: **the complete Node smoketest suite passes
(3 new / extended files, `perf-large-project` now finishes in ~25s instead of
never), ESLint clean, Playwright 35/35 (Chromium).**

A pre-existing tree problem was found and fixed on the way: the working copy
of `js/imagestore.js` had been **overwritten by `tinta-package.smoketest.mjs`'s
test stub** (a killed run skips the on-disk restore), which broke every image
operation in the real app. The real module was restored from git and the test
now restores its stub on SIGINT/SIGTERM as well as `exit`.

---

## CR-47 (P3) — TTS voiceschanged listener leak

**Root cause.** `tts.js getVoices()` registered a `voiceschanged` handler and
a 1s fallback timer; the fallback resolved the promise but never removed the
handler. The Read Aloud modal opens a fresh `getVoices()` every time it is
opened, so every open that hit the fallback leaked one listener for the life
of the page.

**Fix.** Both exit paths clean up now: the handler removes itself and clears
the timer on the event path; the fallback removes the handler (and caches the
result, matching the event path — `speak()` matches the saved voice against
`cachedVoices`, so a fallback-resolved session previously never restored the
saved voice).

**Pinned by** `readaloud-tts-csp.smoketest.mjs`: three fallback-path calls
leave zero registered listeners; the event path removes its own handler.

## CR-46 (P3) — Read Aloud read the manuscript's raw syntax

**Root cause.** `readAloud.js` handed `Store.applyPronunciations(chapter.content)`
straight to speech synthesis — the browser read `**`, `*`, `{{u:…}}`,
`{{<color>:…}}`, `{{img:…}}` tokens and `[[mention]]` brackets verbatim
("star star", "brace brace u colon").

**Fix.** New `format.js stripFormattingTokens()` — the one stripper, placed
next to `stripImageTokens()` because format.js already centralizes the token
patterns. Documented order: image tokens deleted outright → brace tokens
(`{{u:`, `{{<color>:`) unwrapped before the markdown passes so nested markers
still strip → bold before italic (same ordering reason as
`renderFormattedHtml`) → mentions unwrap to the bare name. Unclosed tokens
stay literal (same parity as the renderer — nothing silently disappears
mid-edit). `readAloud.js` calls it before the pronunciation dictionary pass,
so taught respellings still apply to the cleaned text.

**Pinned by** `readaloud-tts-csp.smoketest.mjs`: token/nesting/ordering pins,
unclosed-token parity, plus static pins that the call site strips before
`applyPronunciations`.

## CR-17 (P2) — CSP blocked the external ambience URLs the settings modal offers

**Root cause.** `index.html` declared `media-src 'self' blob:` while
`settingsModal.js` offers direct `https://` audio URLs that `ambience.js`
plays via `new Audio(url)` (`playFromUrl`). The feature was silently dead.

**Fix.** `media-src 'self' blob: https:` — HTTPS only, no plain http, the
same trust line `connect-src` already draws for the grammar endpoint. The CSP
comment block documents the widening; `store-backup.js`'s security comment
was updated (imported backups' `customTrackUrl` is still reset — untrusted
input stays untrusted even now that first-party https playback works).

**Pinned by** `readaloud-tts-csp.smoketest.mjs`: https present, plain http
absent, script/object policy untouched, `playFromUrl` still the playback path.

---

## CR-19 (P2) — one transient IndexedDB open failure poisoned blob stores for the session

**Root cause.** `makeBlobStore.openDb()` cached `dbPromise` unconditionally —
a single transient open failure (disk hiccup, browser startup race) left the
REJECTED promise cached: every later put/get for the rest of the session
failed without ever retrying. The `typeof indexedDB === 'undefined'` branch
had the same disease (it cached its rejection too).

**Fix.** Rejections are never cached: a failed open evicts `dbPromise` so the
next operation genuinely retries, with escalating backoff (250ms doubling per
consecutive failure, capped at 4s) so a permanently broken IndexedDB can't be
hot-looped either. Missing-IDB environments re-check availability per call (a
store that starts in a no-IDB context starts working the moment one appears).
An abnormal connection close (`db.onclose`) evicts the cached handle too.
Applied to `makeBlobStore.js` (recovery, quarantine, images, assets) and the
new `dbBackend.js` alike.

**Pinned by** `storage-epic.smoketest.mjs` §10: first open fails → honest
rejection → the next operation retries and the store is genuinely usable.

---

## CR-42 (P1) — persistence is decoupled from mutations

**Root cause.** Every `save()` (i.e., every mutation) ran
`JSON.stringify({..._db})` on the whole database — creating 5,000 entities
serialized a progressively larger db 5,000 times. `perf-large-project`
measured exactly that and took many minutes.

**Fix (store-core.js).**
- `save()` on the IDB backend now **schedules** a coalesced flush
  (`queueMicrotask`) — every save() in one task shares ONE IndexedDB
  transaction, and the write is a native **structured clone**: no JSON string
  is ever built on the hot path.
- Flushes are serialized through a promise chain; a save() arriving mid-flush
  chains the next flush instead of racing one. Each flush persists the state
  as of its start.
- The rev invariant is preserved: `_db.rev` advances only after the flush's
  transaction commits (`save-rev-integrity`'s invariant, now pinned for the
  IDB path too in `storage-epic.smoketest.mjs` §6).
- Flush failures surface through the SAME channels as before —
  `onSaveError` banners, the existing retry backoff (retargeted via
  `retryPersistNow()`), and the CR-01-aware recovery snapshot.
- New `await saveNow()` for the three paths that need the LANDED result
  (full-backup restore's rollback, recovery-snapshot restore's
  clear-on-success, schema-versioning's refused-import test).
  `importFullBackup()` is async now accordingly.
- The localStorage backend (IndexedDB unavailable) keeps the original
  synchronous contract byte-for-byte — that's why all legacy smoketests pass
  unchanged.

**Acceptance gate numbers** (`perf-large-project.smoketest.mjs`, fake-IDB):
batch of 5,000 entities → **ONE flush, one rev bump, 43ms**; full-db flush of
a 9.31MB database → **72ms**; db load of 10k entities + 50 chapters → **155ms**;
editor save p95 → 153ms (fake-IDB clones in JavaScript; real browsers clone
natively and are several times faster — and the app autosaves on a 1500ms
debounce, so this worst case is not per-keystroke).

## CR-41 (P1) — the primary database moved from localStorage to IndexedDB

**Shape.** New `js/dbBackend.js`: database `tinta-db`, two object stores —
`meta` (one record: everything except projects) and `projects` (one record
per project). Every flush writes meta + project records in a single
readwrite transaction (all-or-nothing). **Documented aggregation choice:**
chapters/entities stay inside their project record — per-record stores would
force ~200 in-memory mutation sites through explicit transaction plumbing;
project-level aggregation already removes the 5MB ceiling and keeps one-
transaction atomicity. Per-chapter stores remain the next lever if real
world profiling ever demands it (noted in `dbBackend.js`'s header).

**Boot.** `Store.ready()` is the production boot path (`app.js init` awaits
it first). Order of preference at boot:
1. IndexedDB meta exists → load meta + projects; reconcile against the
   `tinta:db` localStorage mirror by **rev** (a mirror with a higher rev —
   the rare crash window — wins; a stale mirror is kept in place: it doubles
   as the fallback older builds read).
2. Fresh IndexedDB + a localStorage/legacy-key db → migrate it in, flush
   immediately, drop the legacy `scriptorium:db` key.
3. Fresh everything → empty db, flushed immediately.
4. IndexedDB unavailable or open failed at boot → the legacy localStorage
   backend for the whole session (the pre-CR-41 behavior, strictly better
   than a blank db).
5. A pre-ready synchronous `load()` (tests, pre-boot callers) reconciles with
   IDB only when nothing has mutated yet.

**Safety properties carried over:** schema downgrade quarantine + write lock
(now also on the IDB meta record), corrupt-data quarantine + load warning,
"db with zero projects is not a bootable state", cross-tab staleness (now via
`BroadcastChannel('tinta:db-sync')` carrying rev bumps — the storage-event
path remains for the mirror/fallback), recovery snapshots (unchanged; now the
safety net for IDB quota failures), page-lifecycle durability
(`visibilitychange`→hidden / `pagehide` / `beforeunload` → fire-and-forget
flush + a best-effort ≤4.4MB localStorage mirror write), and a headroom
warning driven by `navigator.storage.estimate()` (≥80% of granted quota or
≥200MB absolute).

**Deleted projects** don't resurrect: the backend tracks the ids it last
wrote and deletes tombstones in the same flush transaction.

**Pinned by** `storage-epic.smoketest.mjs` (38 pins): fallback backend
truthfulness, migration (incl. mirror retention), IDB-only reload,
tombstones, coalescing + rev arithmetic, rev invariant under flush failure
with retry landing the freshest text, CR-01 recovery snapshot on quota flush
failure (staleness rule intact), cross-tab rev arbitration, IDB downgrade
lock, CR-19 retry. Playwright: `12-quota-exceeded.spec.js` now covers BOTH
failure surfaces (IDB disabled → local fallback + setItem stub; IDB primary +
flush interceptor via the opt-in `__TINTA_EXPOSE_STORE` seam), and
`11-canvas-drag-persist.spec.js` reads the IDB primary directly.

---

## Deliberate contract changes (read before touching)

- `save()` on the IDB backend returns **"accepted for persistence"**, not
  "landed". Paths needing the landed result must `await saveNow()`. The
  local backend keeps the old truthful boolean. Both contracts are documented
  at the top of `save()` and pinned by tests.
- `importFullBackup()` is async (callers await it; a refused import is a
  rejected promise, not a synchronous throw).
- `tinta:db` in localStorage is now a bounded best-effort mirror, not the
  primary. Anything that needs the writer's data reads the IDB primary
  (see `11-canvas-drag-persist.spec.js` for the pattern).

## Verification

- `npm run smoketest` — all files green (incl. the new `storage-epic.smoketest.mjs`
  and `readaloud-tts-csp.smoketest.mjs`; `perf-large-project.smoketest.mjs`
  redesigned per CR-45 and passing in ~25s).
- `npx eslint js/ tests/` — clean.
- `npx playwright test` — 35/35 (Chromium). Two earlier full-suite runs
  showed one harness-level flake (`browser.newContext: browser has been
  closed` — the sandbox's 4GB under 15 sequential Chromium launches); it
  never reproduced with the suite re-run and is unrelated to the app.
