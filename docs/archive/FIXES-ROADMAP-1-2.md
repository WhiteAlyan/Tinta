# Tinta — Applied Fixes: Roadmap Items 1–2 (the two P0s)

Applied: 2026-10-31 · Scope: code-review roadmap items 1 and 2 only.
Verification: all Node smoketests pass (see "Verification" below). No store,
save, or import logic was touched — every change is render-path only.

---

## Item 1 — Grammar modal was dead on results (P0)

**Symptoms.** Running a grammar check that found anything threw
`ReferenceError: escapeHtml is not defined` inside an async context. The
rejection was unhandled (the caller never awaited a UI surface for it), so the
loading modal hung forever and nothing reached the console-facing UI. Even had
the imports existed, the results body was built as a *plain string* that
`grammarModalShell` routed through `toBridge()` — the whole panel would have
been escaped into visible source text (the double-escape bug).

**Fix — `js/grammarModal.js` (rebuilt on the `html`` tagged template):**

- `grammarMatchContext()` — was a hand-escaped plain string calling the
  never-imported `escapeHtml`. Now built with `html``, which escapes
  `before` / `flagged` / `after` by construction and keeps the real
  `<mark class="grammar-flag">` highlight tag.
- `renderGrammarResultsModal()` — was the only modal body in the file built as
  a plain string, calling `escapeHtml()` / `escapeAttr()` six times without
  importing them. Rebuilt on `html`` like the other three modals in the file;
  every checker-supplied value (category, shortMessage, replacement chips,
  match ids) now escapes exactly once, and the body reaches `openModal()` as
  SafeHtml so nothing double-escapes. Exported for testing (same convention as
  `historyModals.js`'s `renderSnapshotListPane`).

**New test — `js/grammar-modal-render.smoketest.mjs`** pins the whole contract:

1. rendering actually happens (no ReferenceError) and produces real markup,
   not escaped-into-text source;
2. checker/package-supplied hostile strings — category, message, replacement
   values, raw match ids (attribute-breakout attempts included) — escape
   exactly once and only as inert text;
3. the `<mark class="grammar-flag">` context highlight stays a real tag while
   the prose around it (including a literal `<b>` in the chapter text) is
   escaped;
4. the zero-matches empty state renders without cards.

Run: `node js/grammar-modal-render.smoketest.mjs`

---

## Item 2 — The four XSS interpolations (P0)

Class of bug: a malicious `.tinta` package preserves chapter / entity /
snapshot / relationship identifiers verbatim on import (only project and image
ids are remapped), and several render sites interpolated those ids — plus
other user-controlled strings — straight into HTML or attribute positions.

| # | Site | Before | After |
|---|------|--------|-------|
| S-1 | `settingsModal.js:110` | recognition stopwords (user-importable) joined raw into a plain-string modal body | joined list wrapped in `escapeHtml(...)` |
| S-2 | `searchView.js:252` (`dataAttr` builder feeding all ten `data-jump-*` row kinds at lines 84–100) | attribute values interpolated raw, builder result wrapped in `raw(...)` | builder now applies `escapeAttr` to **every** name/value pair once, centrally; import updated |
| S-3a | `historyModals.js:71` and `:144` | `data-snapshot="${s.id}"` raw | `data-snapshot="${escapeAttr(s.id)}"` at both snapshot-list sites |
| S-3b | `canvasView.js:502–508` | `data-entry="${h.id}"` raw; meta line joined raw | `data-entry="${escapeAttr(h.id)}"`; meta line now `escapeHtml([h.status, h.strength].filter(Boolean).join(' · '))` |

Note on S-2: escaping once inside the shared `dataAttr()` builder covers all
ten search categories (chapters, entities, scenes, snippets, timeline events,
references, annotations, rule systems, maps) — no per-row changes needed.

---

## Verification

- **Node smoketests:** 55 pass / 0 fail / 0 crashes via
  `scripts/run_all_smoketests.sh` (per-file 60 s timeout).
  `perf-large-project.smoketest.mjs` is CPU-bound (synthesizes 5,000 entities
  + 10,000 relationships) and exceeds that 60 s cap on slow machines — run it
  directly with a longer timeout; it is unaffected by these changes.
- **Syntax:** `node --check` passes on all five modified modules.
- **Playwright suite (`tests/01–15`):** not run for this checkpoint (requires
  `npm ci` + browser download). Nothing under `store*.js`, `app.js`, or the
  import path changed, so browser-level save/navigation behavior is untouched.
  The new grammar smoketest covers the render contract at module level.

## Files changed

| File | Δ | What |
|------|---|------|
| `js/grammarModal.js` | ~41 lines | rebuilt `grammarMatchContext` + `renderGrammarResultsModal` on `html``; export for test |
| `js/searchView.js` | ~34 lines | `escapeAttr` in `dataAttr` builder; import; highlight builder hardened |
| `js/historyModals.js` | 6 lines | `escapeAttr` import + 2 × `data-snapshot` |
| `js/canvasView.js` | 4 lines | `escapeAttr` import + `data-entry` + meta-line escape |
| `js/settingsModal.js` | 2 lines | `escapeHtml` around joined stopword list |
| `js/grammar-modal-render.smoketest.mjs` | +164 new | render-path pin for the grammar results modal |

## Applying only the diff

`fixes-roadmap-1-2.patch` uses paths relative to the project root (this
folder). From inside the project directory:

    git apply fixes-roadmap-1-2.patch      # or: patch -p1 < fixes-roadmap-1-2.patch

`scripts/run_all_smoketests.sh` (shipped alongside) is an optional dev
convenience: runs every `js/*.smoketest.mjs` with a 60 s per-file timeout and
a pass/fail summary.
