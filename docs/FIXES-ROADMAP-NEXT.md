# FIXES-ROADMAP-NEXT — queued findings, overlap-mapped (2026-10-31)

The second review session's findings were each re-verified against the source
before queueing. **All of them check out.** They are folded into the existing
CR queue (CR-06…CR-40 from the main report) below, in priority order. Where a
finding duplicates an existing CR, it is marked **MERGED** — no new item; work
on the existing CR covers it.

**UPDATE (same day, batch 2 applied):** the quick wins (CR-47, CR-46, CR-17)
and the storage epic (CR-19, CR-42, CR-41, with CR-45's benchmark redesign as
the acceptance gate) are **applied, test-pinned, and green** — see
`FIXES-ROADMAP-QUICKWINS-STORAGE.md`.

**UPDATE (same day, batch 3 applied):** **CR-43 (search worker + ReDoS
hardening) is applied, test-pinned, and green** — see
`FIXES-ROADMAP-CR43-SEARCH.md`.

**UPDATE (same day, batch 4 applied):** **CR-44 (accessibility pass,
absorbing CR-13) is applied, test-pinned, and green** — see
`FIXES-ROADMAP-CR44-A11Y.md`. The remaining queue is the CR-06…CR-40
remainder in report order, interleaving CR-48/CR-49 where a touched
file makes them cheap.

**UPDATE (same day, batch 5 applied):** **the entire CR-06…CR-40
remainder (32 findings — 35 minus CR-13/CR-17/CR-19, applied in
batches 2–4) is applied, test-pinned, and green** — see
`FIXES-ROADMAP-BATCH5-CR06-40.md`. The queue now holds only CR-48 and
CR-49 (both P3, untouched by batch 5: no fix landed in bookView.js's
pagination or in zip.js), plus whatever new sessions surface against
MASTER-TRUTH's corrected verification basis.

---

## Queue order (after the applied CR-01…05 batch)

### CR-41 (P1 — architecture) Primary database should move from localStorage to IndexedDB — **✅ APPLIED (batch 2)**
*Source: second session P1. Verified: store-core.js serializes the whole db to
the `tinta:db` localStorage key; IndexedDB is used only for blob stores,
recovery snapshots, and the downgrade quarantine.*
Applied together with CR-42 and CR-19 — see `FIXES-ROADMAP-QUICKWINS-STORAGE.md`.
The primary now lives in `tinta-db` (meta store + one record per project,
one transaction per flush), legacy installs migrate on boot, the `tinta:db`
mirror is retained as a bounded fallback with rev arbitration, and
`navigator.storage.estimate()` drives the headroom warning.

### CR-42 (P1 — architecture) Full-database serialization on every mutation — **✅ APPLIED (batch 2)**
*Source: second session P1. Verified: `writeToLocalStorage()` runs
`JSON.stringify({..._db, rev})` on every save; every mutation saves; creating
5,000 entities serializes a progressively larger db 5,000 times. The project's
own perf smoketest comment admits "each create calls save() synchronously".*
Applied together with CR-41 — coalesced microtask flushes, structured clones
instead of JSON strings, `saveNow()` for landed-result paths. Acceptance
gate: 5,000 creates = ONE flush / one rev bump / 43ms (was 5,000
serializations over minutes). **MERGED partially with CR-39** (overlay does
full-document work twice per keystroke — same "per-keystroke whole-world
work" family, different layer; still queued for when that file is touched).

### CR-43 (P2) User-supplied regex can freeze the app (ReDoS + sync search) — **✅ APPLIED (batch 3)**
*Source: second session P2. Verified: search.js constructs `new RegExp(query)`
from writer input and runs sync `.exec()`/`.match()` loops over project
content; syntactic validation does not protect against catastrophic
backtracking.*
Applied as a four-layer fix — cooperative time/match budgets in the engine,
scanning moved into a terminate-able module worker, a hard watchdog that
terminates a worker wedged inside a single catastrophic `exec()`, and
token-based cancellation over slice-yielded category scans — with the
stopped/capped states surfaced honestly in the view and the Replace path
evaluated under the same protection. Full design, contract changes, and
verification in `FIXES-ROADMAP-CR43-SEARCH.md`.

### CR-44 (P2) Accessibility dedicated pass — **✅ APPLIED (batch 4) — absorbs existing CR-13**
*Source: second session P2 (partially overlapping). Existing CR-13 (no focus
management in modal/drawer layers) is folded into this as workstream 1.*
Applied as five workstreams — modal/drawer focus trap + restoration (CR-13),
aria-current nav + view-change announcements, accessible names for every
icon-only button with a drift gate, keyboard/screen-reader semantics
(combobox palette, live-region toasts, keyboard-operable sidebar rows), and
a computed WCAG contrast audit whose token fixes are pinned by smoketest.
Full design, contract changes, and verification in
`FIXES-ROADMAP-CR44-A11Y.md`.

### CR-45 (P2) Large-project performance benchmarking redesign — **✅ APPLIED (batch 2, as the epic's acceptance gate)**
*Source: second session P2. Verified: perf-large-project.smoketest.mjs creates
5,000 entities one-by-one through the full save path, so it mostly measures
CR-42's serialization problem.*
Redesigned into the benchmark set the review asked for: big-db flush, batch
import (with the one-flush structural pin), db load, editor save latency
(p50/p95), render reads, passive scan, word count, quota estimate — elapsed
time + memory, generous sanity budgets. Runs in ~25s.

### CR-46 (P3) Read Aloud reads raw manuscript syntax — **✅ APPLIED (batch 2)**
*Source: second session P3. Verified: readAloud.js:99 passes
`Store.applyPronunciations(chapter.content)` — formatting tokens (`**`,
`{{u:…}}`, `{{img:…}}`), and mention brackets go to TTS verbatim.*
Fix: build a `speechText()` stripper (shared with CR-09's export stripper —
`format.js` already centralizes token patterns; add `stripFormattingTokens()`
next to `stripImageTokens()` and reuse in both callers).

### CR-47 (P3) TTS voiceschanged listener leak — **✅ APPLIED (batch 2)**
*Source: second session P3. Verified: tts.js:34-37 — the 1s fallback
`setTimeout` resolves the promise but never removes the `voiceschanged`
handler; it stays registered until a later (possibly never) voiceschanged
event.*
Tiny fix: `const timer = setTimeout(() => { synth.removeEventListener('voiceschanged', handler); resolve(synth.getVoices()); }, 1000)` and clear the timer inside the handler. Ten minutes of work; bundle with any tts.js touch.

### CR-48 (P3) Book view fixed geometry on narrow screens
*Source: second session P3. Verified: bookView.js contains no resize/viewport
recalculation.*
Recalculate pagination on resize/orientation change; test narrow tablets.

### CR-49 (P3) ZIP package uses STORE (no compression)
*Source: second session P3. Verified: zip.js:67 — compression method 0 =
store.*
Image-heavy novels export as multi-MB files that would deflate heavily.
Offer optional DEFLATE for non-media entries; keep STORE for already-
compressed media (JPEG/PNG/WebP don't compress again).

---

## Already queued — overlaps with the second session (no new item)

| Second-session finding | Disposition |
| --- | --- |
| CSP blocks external ambience URLs (P2) | **✅ APPLIED (batch 2) — CR-17.** `media-src 'self' blob: https:` — HTTPS-only widening matching connect-src's trust line. |
| Documentation drift (P3) | **MERGED — CR-34.** |
| No root-level README (P3) | **MERGED — CR-36** (which also covers LICENSE, .gitignore, and the Windows launcher Store-stub trap). |

## Suggested execution order

1. ~~**Quick wins first**~~ — **✅ APPLIED (batch 2):** CR-47, CR-46, CR-17.
2. ~~**CR-43** (search worker)~~ — **✅ APPLIED (batch 3)** — independent,
   user-visible stability; see `FIXES-ROADMAP-CR43-SEARCH.md`.
3. ~~CR-19~~ — **✅ APPLIED (batch 2)** (open-failure retry, no session poisoning).
4. ~~**CR-41 + CR-42**~~ — **✅ APPLIED (batch 2)** with CR-45's benchmarks as the acceptance gate.
5. ~~**CR-44** (a11y pass, absorbs CR-13)~~ — **✅ APPLIED (batch 4)**, see
   `FIXES-ROADMAP-CR44-A11Y.md`.
6. ~~Remainder of the existing CR-06…CR-40 queue in report order~~ —
   **✅ APPLIED (batch 5)**, see `FIXES-ROADMAP-BATCH5-CR06-40.md`.

Still queued: **CR-48** (Book view resize repagination) and **CR-49**
(ZIP optional DEFLATE) — neither batch 5 nor any earlier batch touched
their files, so the interleaving rule never made them cheap. Next
session can close them in one small pass.

The main report's CR list (CR-01…CR-49) is otherwise fully applied.
