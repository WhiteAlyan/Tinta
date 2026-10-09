# Tinta — roadmap

> **Status lives elsewhere now.** For built/not-built, check `docs/TINTA-MASTER-TRUTH.md` — that's the single source of truth, verified against actual source code. This file is the chronological build log (how/when things shipped, sequencing decisions) — useful for history and for "full detail" links from README's pass writeups, not for checking current status.

This replaces the original informal "layer plan" (Session 1-10, grouped by
dependency layer) that `README.md` used to reference. That plan assumed a
fixed session grouping decided up front; in practice, each session after
Session 2 picked its own next item from a running "not built yet" list, and
a couple of the original bundles turned out to be too big for one session.
This doc tracks what actually happened and what's realistically left,
rather than a plan frozen before any of it was built.

## What actually shipped, vs. the original plan

| # | Originally planned (Session 1-10 doc) | Actually built |
|---|---|---|
| 1 | Skeleton (Layer 0) | Skeleton — matches |
| 2 | Organization (Layer 1) | Organization — matches |
| 3 | Reference system pt.1 — notes + entity backlinks (Layer 2) | Matches |
| 4 | Reference system pt.2 — relationship canvas **+ character sheets + sketchpad**, one session (Layer 2) | Relationship canvas only — sketchpad split out (see #5) |
| 5 | Continuity — **Timeline** + project-wide find/replace (Layer 3) | Sketchpad / map-maker instead — the other half of planned Session 4. Canvas drawing and node-graph UI turned out to be genuinely separate chunks of work, not one session. |
| 6 | Versioning — snapshots → diff → export (Layer 4) | Matches (shifted by one slot from the split above) |
| 7 | Writing aids — word/char count, focus mode, frequency, name gen, snippet inbox (Layer 5) | Matches |
| 8 | Grammar integration | Matches |
| 9 | Ambience + analytics — music, TTS, **stats dashboard**, one session (Layer 6) | Timeline view instead — the item originally slated for Session 5, picked four sessions later than planned. Nothing depended on it being late (entities existed since Session 3), it just wasn't chosen until here. |
| 10 | Platform — mobile companion + WaoL sync (Layer 7) | Stats dashboard only — split out of planned Session 9, same reasoning as #4/#5: dashboard needed to exist as its own decision point (existing data vs. genuinely-new automatic activity tracking, which turned out to be a real fork). |
| 11 | *(not in original plan — numbers ran out)* | Ambient sound + read-aloud — the other half of planned Session 9 |

Two patterns caused the drift: bundles that looked like one session on paper
turned out to be two unrelated chunks of implementation work (Session 4,
Session 9), and the actual pick order didn't strictly follow the plan's
dependency ordering (Timeline). Neither is a problem — the dependency floor
the original plan cared about (entities before Timeline, snapshots before
diff, etc.) was never violated — but it means the original numbered list is
no longer an accurate map of the repo.

## Session 12-20 — shipped

12/13 landed in one combined pass (sequential, both touch `store.js`). 14
through 19 each landed on their own right after, per the same scoping
discussion. 19.5 followed immediately after 19 rather than riding along
inside it — see the sequencing note below. 20 landed next, per the plan.
Full detail in `README.md`'s Session 12-20 entries; summary:

| # | Session | What shipped |
|---|---|---|
| 12 | Multi-project | `createProject`/`switchProject`/`deleteProject`/`listProjects` in `store.js`, `emptyDb()`'s project object factored into a reusable `makeProject()`, sidebar switcher modal (list/switch/delete/create). |
| 13 | Storage hardening + full backup | `load()` corruption recovery (preserves the corrupted string, surfaces a one-shot warning instead of silently resetting), `save()` quota handling via `onSaveError()` listeners, `exportFullBackup()`/`importFullBackup()` (real JSON backup, distinct from the markdown export), sidebar Backup modal, dismissible storage-warning banner. |
| 14 | Search & replace | New `js/search.js` (pure logic, no Store dependency), full-text search across chapters/entities/snippets/timeline, chapters-only replace with an auto-snapshot safety net, new Search tab with jump-to-result navigation. |
| 15 | Session memory | Cursor/scroll position restore per chapter (`chapter.lastCursorPos`/`lastScrollTop`, not versioned in snapshots), cross-project "recently edited" list (`db.recentActivity`, capped at 8) surfaced in the project switcher modal. |
| 16 | Command palette | New `js/palette.js` (pure ranking, no Store dependency), Ctrl/Cmd+K quick-switcher indexing chapters/entities (active project) and projects (all), defaults to Session 15's recent-activity list on an empty query. |
| 17 | Format layer | New `js/format.js` (pure logic, no Store dependency) — the fork point Sessions 18/19 build on. `**bold**`/`*italic*`/`{{color:text}}` (5 fixed swatch colors), injection-safe HTML rendering, selection-toggle logic, a Write-mode toolbar + Ctrl/Cmd+B/I shortcuts sharing one `applyFormatToggle()` in `editor.js`. |
| 18 | Inline images | New `js/imagestore.js` (IndexedDB wrapper for blobs, verified against `fake-indexeddb`), `project.images` metadata catalog in `store.js`, `{{img:id\|left\|right}}` token added to `format.js`, `wordCount()` fixed to exclude image tokens, Image Library modal (upload/caption/align/insert/delete), cascade-delete of a project's blobs on project delete. Backup modal now flags that image bytes aren't in the JSON backup yet. |
| 19 | Book / Read mode | New Book tab — paginated two-page spread via CSS multi-column layout (browser does the actual pagination; no hand-rolled block-packing). First real caller of `renderFormattedHtml()` outside a test. `Format.extractImageIds()` resolves referenced images before the single render pass. Chapter + page navigation (buttons and ←/→ keys). Fixed pixel column sizing — a known, flagged v0 limitation, not a silent gap. |
| 19.5 | Image-backup gap | `exportFullBackupWithImages()`/`importFullBackupWithImages()` in `app.js`, wrapping Session 13's functions rather than folding into `store.js` (keeps `localStorage`/IndexedDB decoupled). Bundled backup shape (`tintaBackupVersion: 2`) with base64-encoded blobs, backward compatible with pre-19.5 raw-`db` backups. Import reports a restored/failed image count instead of a bare "done". |
| 20 | Writing sprints | New `js/sprint.js` (pure logic, no Store dependency). Sidebar-footer timer (countdown presets or open-ended), tracks project-wide words written this sitting via `Store.getTotalWordCount()`, auto-opens an end-of-sprint summary (words/duration/WPM). Not persisted — a sprint is "this sitting," not history. |

## Session 21 — shipped

**Polish pass** — three small independent pieces bundled because none of
them depended on anything new and each was too small for its own session:

| Piece | What shipped |
|---|---|
| Typewriter sound | New `js/typewriter.js` (Web Audio synth, no audio files — same pattern as `ambience.js`). `playClick()` for ordinary keystrokes, `playBell()` for Enter. Wired in `editor.js` keydown (fires on every keydown while enabled, unfiltered). Sidebar-footer ⌨ Typewriter button → toggle + volume modal. Backed by `getTypewriterSettings()`/`setTypewriterSettings()` in `store.js`. Added to `sw.js` SHELL_FILES. |
| Per-paragraph focus dimming | `splitParagraphs()` added to `mentions.js` (pure, 9 new tests). Mirror-overlay technique (`.focus-dim-overlay` div inside `.editor-stack` wrapper): textarea text transparent in focus mode, overlay paints paragraph spans at full/30% opacity per caret position. Scroll sync and immediate repaint on `toggleFocusMode()`. Focus mode only — not in normal Write view. |
| Goal-hit celebration toast | `checkGoalCelebration(project)` in `store.js` — fires once per calendar day per project when total words cross `wordGoal`. `lastGoalCelebrationDate` added to `makeProject()` + migrate() backfill. Toast in its own `#celebration-toast-root` (not `#modal-root` — needs to coexist with open modals). Auto-dismisses in 5s. |

Verification: 35 Node unit tests, 0 failures. All JS `node --check` clean.
CSS balanced. Service worker bumped to `tinta-shell-v12`.

## Session 22 — shipped

| Piece | What shipped |
|---|---|
| Import .txt/.md | `Store.importChapterFromText()` in `store.js` (inverse of Session 6's export) + `parseImportedFile()` in `app.js` for title extraction (`.md` heading or filename). Toolbar ⇪ Import button next to Export, auto-snapshots on import, switches Write view to the new chapter. |
| Arc / act label | Free-text `chapter.arc` field — `createChapter()`/`makeProject()` + `migrate()` backfill. `Store.updateChapterArc()`, a third Write-toolbar input next to Status/POV, sidebar arc pill (shown only when non-empty), "Filter by arc" dropdown shared between the sidebar chapter list and the corkboard. |

Verification: 10 new Node unit tests (import, arc update, migrate backfill)
plus a smoke pass against unrelated pure-logic modules, 0 failures. All JS
`node --check` clean, CSS balanced, HTML tag structure verified. No new
files, so `sw.js` SHELL_FILES unchanged; cache version bumped to
`tinta-shell-v13` for the 4 changed files.

## Cozy pass — shipped

Not part of the numbered session sequence above — a smaller, informally-scoped
pass picked up after Session 22, focused on toolbar/chrome density and a
long-requested multi-novel Library screen. Three pieces, landed sequentially
since each built on assumptions the previous one settled (chapter-header
restyle needed the decluttered toolbar's breathing room; Library's "Set
cover" needed the Image Library modal to exist first).

| Piece | What shipped |
|---|---|
| Toolbar consolidation | Write-toolbar cut from 11 competing controls (title + 3 metadata fields + 7 labeled buttons) to title + 5 icon buttons. `≡ Details` popover (Status/POV/Arc, stacked as labeled fields). `⋯ More` menu (Word Check, Names & Thesaurus, Read Aloud, Import). History/Grammar/Export stayed one-click. Both popovers close on outside click, Escape, or picking something inside — same pattern the existing highlight-color menu already used. |
| Chapter header/footer restyle | Centered serif chapter title (`chapter-title-input`) with an ornamental ❖ divider (`chapter-heading-divider`), replacing the old left-aligned plain input. Footer restyled to a three-part layout (save status / word count / mirrored Focus toggle) — the footer's Focus button is a second entry point into the exact same `toggleFocusMode()` state as the top-bar one, not a separate feature. |
| Cover art + Library screen | `project.coverImageId` (nullable, points into the existing `ImageStore`/IndexedDB blob store — `makeProject()` + `migrate()` backfill) and `Store.setCoverImage()`. Image Library modal gained a `'cover'` selection mode (`openImageLibrary({ mode, onSelect })`) reusing the same upload pipeline — no second upload flow. The old flat project-switcher modal was fully retired and replaced by a Library drawer (`openLibrary()`): a card grid per novel (cover art or a warm-card fallback, word count/goal progress bar, chapter count, draft/revised/final status-mix dots, last-edited date), a `+ New novel` tile, and a per-card `⋯` menu (Set cover / Rename / Delete — Delete hidden when it's the only novel). Sidebar `▾` switcher button relabeled `‹ Library`. On launch, the app still reopens the last-active novel directly (no separate "land in Library first" mode) — Library is reached by choice, not imposed on boot. |

Verification: all JS `node --check` clean, CSS brace-balanced, every
`library-*`/`image-cover-btn` class referenced in `app.js` markup cross-checked
against `style.css` (all present). No new files, so `sw.js` SHELL_FILES
unchanged; cache version bumped `v13 → v17` across the three pieces (this
doc wasn't updated between them, hence the jump). No automated test harness
is checked into this snapshot, so this was a static/manual verification pass
only, not a Node-test-backed one like Sessions 21-22 — worth adding
regression coverage for `setCoverImage`/Library card rendering if/when the
test harness resurfaces here.

## Nav refinement pass — shipped

Not part of the numbered session sequence — picked up after the Cozy pass,
scoped from a design conversation rather than a pre-planned item. Landed in
one continuous pass since each piece touched the same render path.

| Piece | What shipped |
|---|---|
| Toggleable nav layout | New `navStyle` setting (`'grouped' \| 'compact'`, `store.js`, migrated). Nav groups (Write/Plan/World/Tools) now come from one shared `NAV_GROUPS` config in `js/nav.js` so grouped and compact modes can't drift apart. Grouped keeps the Cozy-pass flat bar with dividers; compact collapses each group into a button that opens a flyout, trading a click for a calmer bar. Switch lives in Settings → Appearance, applies immediately. **Snippets moved from World into Tools** — reads more as a capture utility than reference material once collapsed into a labeled group; flagging the move explicitly since it wasn't part of the original Cozy-pass grouping. |
| Nav render/click extraction | `renderNavTabs()` and its delegated click/outside-click/Escape handling moved out of `app.js` into new `js/nav.js` — first slice of the file-size split the QA flag below calls for, following the `store.js`/`search.js`/`format.js` pattern (small, focused, no Store import where avoidable). |
| Compact-nav accessibility | Group toggles get `aria-haspopup="true"`/`aria-expanded`; flyouts get `role="menu"`, items `role="menuitem"`; Up/Down cycles the open flyout, Enter/Space picks the focused item, Escape closes (previously only closed the write-toolbar's popovers, not this — a genuine gap from the initial compact-nav build, fixed here). |
| Title hierarchy | Sidebar project title restyled larger (18px→21px) with `‹ Library` demoted from a bordered pill to a small text link stacked underneath, so the book's own name reads as the dominant element instead of competing with the switcher. |
| Chapter header calm pass | Derived `CHAPTER 0X` label above the chapter title (computed from reading order, not a stored field — stays correct on reorder). Write-toolbar icons (Details/History/Grammar/Export/More) now rest at low opacity and sharpen on hover/focus/open-popover via `:has()`, instead of sitting at full brightness by default. |
| Service worker — network-first shell | `sw.js`'s fetch handler switched from pure cache-first to network-first-with-cache-fallback for the app shell, so a reload reliably picks up new files without a manual `CACHE_NAME` version bump — the cache is now a fallback for offline use, not the default source. Removes the "bumped v17→v18→v19 by hand across three responses and still needed a hard-reload dance" failure mode from earlier in this pass. |

Verification: `node --check` clean on all touched JS, CSS brace-balanced,
manual click-through of both nav styles plus keyboard nav on the flyout.
No automated test harness for this pass (same caveat as the Cozy pass).

## Library metadata & filtering pass — shipped

Not part of the numbered session sequence — same ad-hoc-pass reasoning as
Cozy and Nav refinement above: it came out of a live conversation about
whether "story type / genre / tags" screenshots from a publishing platform
were something Tinta should grow, not a pre-planned roadmap item. Landed
after confirming the actual motivation was personal organizing/filtering
across the Library, not eventual publishing — which settled it as a small,
free-text metadata addition rather than a curated genre taxonomy.

| Piece | What shipped |
|---|---|
| Project metadata fields | Four new fields on the project shape — `storyType`, `genre`, `language`, `blurb` — added to `makeProject()` and backfilled in `migrate()`, same pattern every field addition since Session 2 has used. All four are plain free text, not a fixed enum/taxonomy: personal cataloging doesn't need a rigid genre list, and free text is the only way "Taglish" (the author's actual use case) shows up as a language value without a dropdown maintainer pre-guessing it. `updateProjectMeta()` already existed as a generic patch setter, so no new Store mutator was needed — just a new `Store.getDistinctProjectValues(field)` reader that returns the alphabetized, deduped, non-empty values in use for a field across every project. |
| Library Details editor | New per-card "📝 Details" menu item (alongside the existing Set cover / Rename / Delete) opening a small modal with Story type / Genre / Language text inputs (each with a `<datalist>` of suggestions drawn from `getDistinctProjectValues`, so existing vocabulary is easy to reuse without being a locked list) and a Blurb/synopsis textarea. Reuses `.grammar-field-label`/`.grammar-settings-actions` CSS wholesale rather than a parallel set of form classes — same label-above-input, save-button-bottom-right shape as the Grammar settings modal. |
| Library filter row | A chip-based filter bar above the card grid, one group per field that actually has values in use (`storyType`/`genre`/`language` — `blurb` isn't filterable, it's prose). Chips are exactly `getDistinctProjectValues()`'s output, so the filter vocabulary is never pre-seeded or hand-maintained. Multiple chips within one group OR together; picking chips across different groups ANDs, e.g. "Fantasy" + "Adventure" under Genre widens the shelf, then also ticking "English" under Language narrows it again. Filter state lives in module scope so it survives the grid re-rendering after an action (rename/cover/delete already called `openLibrary()` again to refresh in place), and clears when the Library modal actually closes. A card's Story type/Genre/Language, when any are set, now also shows as a small dot-separated line under the title — same spot `.library-card-meta`'s chapter/word-count line already occupies, one row up. |

Verification: 19-check Node smoke test (mocked `localStorage`) covering
fresh-project field defaults, `updateProjectMeta` round-tripping all four
fields, `getDistinctProjectValues` dedup/alphabetizing/empty-exclusion
across multiple projects (including a "Taglish" value to confirm free text
isn't being coerced into anything), and `migrate()` backfilling all four
fields onto a simulated pre-pass project shape with none of them present.
0 failures. `node --check` clean on both touched JS files; `<div>`/
`<label>`/`<button>`/`<span>`/`<textarea>` tag counts balanced across the
whole of `app.js` after the new markup landed. No new files, so `sw.js`
`SHELL_FILES` is unchanged — and no cache-version bump needed at all now
that the Nav refinement pass switched the service worker to network-first.

## Focus mode fix, Archeshic Records, and Local music & backgrounds pass — shipped

Three unrelated fixes/additions from one live conversation, landed together
since they touched adjacent settings/editor surfaces:

**Focus mode drift fix.** Not the event-ordering bug it looked like — the
real textarea gets a native scrollbar once a chapter is long enough to
scroll, which narrows its usable text width without shrinking the box
itself. The dim overlay div (which paints which paragraph is "current")
never has a scrollbar, so it kept wrapping ~15-17px wider than the real
textarea. A few paragraphs in, that gap compounds into different line
breaks between the two, so the highlighted paragraph drifted further and
further from wherever the real caret actually was. Fixed by measuring the
real textarea's scrollbar gutter live (`offsetWidth - clientWidth`) and
padding the overlay to match, plus a window-resize listener to keep it
synced (scrollbar presence can change on resize, not just on typing/
clicking, which is what `updateDimOverlay()` was already hooked to).

**Archeshic Records** (renamed from "Thesaurus", display-only — internal
code/CSS keeps the old name since nothing about the rename touches
behavior). More importantly, closed a real gap: the built-in list was a
hardcoded 20-word object with no way to add to it. New `customThesaurus`
map in store.js (app-level, alongside theme/grammar/ambience), a `+ Add a
word` form in the modal, and `wordtools.js`'s `lookupSynonyms`/
`thesaurusEntries` both now take an optional `customEntries` map — passed
in by app.js at call time rather than wordtools.js importing Store
directly, keeping it Store-free like search.js/format.js/diff.js. A custom
entry for a word the built-in list already has shadows it entirely for
lookup rather than merging, on the theory that someone who bothers adding
their own synonyms for "said" wants exactly those.

**Local music & backgrounds.** Two independent additions:

| Piece | What shipped |
|---|---|
| Custom ambience track | A fifth option alongside the four synthesized ambience tracks — the writer's own local audio file, picked via a file input, looped through a `MediaElementAudioSourceNode` → `GainNode` so the existing volume slider controls it identically to the synthesized ones. Persisted (per the "persist it" scoping answer) in a new `assetstore.js` — a second, app-level IndexedDB blob store separate from `imagestore.js` on purpose, since these blobs (one custom ambience track, one custom background image) belong to the app, not any one project, and aren't part of `imagestore.js`'s image-specific framing. |
| Custom background | A `Background` section in Settings, independent of the Theme system — deliberately *not* folded into paper/void/sepia, because those still only govern ink/paper/accent colors on actual content surfaces. The custom background (a two-color gradient, or an uploaded image with a theme-tinted dim scrim for legibility) paints in behind everything at the `body` level, showing through the sidebar and the gaps around the editor's paper card without ever sitting directly under body text. `--bg-rgb` added per theme so the image scrim tints correctly against whichever of paper/void/sepia is active. |

Verification: three independent Node smoke tests (Archeshic Records: 16
checks; this pass's store.js additions — ambience `customTrackName`,
`background` settings including one-level-deep gradient-patch merging, and
migration backfill for both: 18 checks), all passing, plus a combined
regression import exercising every store.js addition from this session
together. `node --check` clean on every touched/new JS file. `<div>`/
`<label>`/`<button>`/`<span>`/`<textarea>`/`<select>` tag counts balanced
across `app.js` (one apparent `<select>` mismatch traced to a pre-existing
code *comment* mentioning the tag, not a real markup imbalance). The
IndexedDB/Web-Audio/DOM-dependent halves of `assetstore.js`/`ambience.js`'s
new `playCustomTrack()`/`theme.js`'s `applyBackground()` aren't
Node-testable (same limitation `imagestore.js` and the rest of Ambience
already had) and need in-browser verification: picking/looping/removing a
custom track, and switching between gradient/image/none backgrounds
including the dim slider and object-URL cleanup on removal or replacement.

## Quick-wins pass — shipped

Not part of the numbered session sequence — a small, low-risk batch picked
up right after the app.js-refactor pass, bundled because none of these
depended on anything new and each was too small for its own session.
Landed in two sub-passes: motion/interaction pieces first, then a
typography/whitespace centralization pass once a file-provenance mismatch
(see below) was reconciled.

| Piece | What shipped |
|---|---|
| Chapter transition + Motion speed | `--motion-micro/normal/large` duration tiers and `--motion-chapter-scale` multiplier added to `base.css` (folding six slightly-different one-off durations — .15s/.18s/.2s/.25s/.26s/.28s — into three named tiers). New `motion: { chapterTransitions, speed }` in `store.js`. `renderWriteView()` tracks `lastRenderedChapterId` so the `.chapter-enter` fade only plays on an actual chapter switch — not on autosave, a status edit, or any other re-render — and is skipped entirely (no class, not a 0-length animation) when the setting's off. Settings → Appearance → Motion speed (Subtle/Normal/Relaxed) control added on top of the existing mechanism. |
| Shortcuts grouped | Settings modal's Keyboard Shortcuts section split from one flat list into Navigation/Editing/Writing/Views sub-groups (`SHORTCUT_GROUP_ORDER` in `app.js`). |
| Empty states with personality | Copy-only pass on 8 empty-state strings across Write, Notes, Canvas, Sketch, Library, and Book views. |
| Status bar audit | Write-footer (save status / word count / Focus toggle) reviewed — already minimal from the Cozy pass, no change needed. |
| Dead file removed | `css/style.css` (the pre-split 3,103-line monolith) deleted — confirmed unreferenced by `index.html`/`sw.js`/any JS, and confirmed every one of its 653 selectors already existed in the 9 split files before deleting. |
| Typography/whitespace centralization | New `--text-2xs` through `--text-3xl` (9 tiers) and `--space-1` through `--space-7` tokens in `base.css`, mechanically replacing every `font-size`/`margin`/`padding` value that recurred 3+ times across the app (376 call sites across `dashboards.css`/`editor-view.css`/`media.css`/`modals.css`/`polish.css`/`shell.css`/`tools.css`/`views.css`) with the nearest tier — each within 0.5px of its original value, same tolerance the motion-token pass established. Values appearing once or twice, or scoped to one self-contained component, were left as literal px rather than force-fit into a tier. Selector count in every touched file verified unchanged before/after (structure untouched, only values swapped). |

**Mid-pass file-provenance issue, caught and resolved.** Partway through,
three loose files (`store.js`, `app.js`, `base.css`) uploaded alongside the
working zip turned out to contain a separate, independently-built version
of the motion/chapter-transition mechanism — more robust than the first
pass here (it had the `lastRenderedChapterId` re-render guard this pass's
first attempt lacked). Confirmed via diff that this was the *only*
substantive divergence between the loose files and the zip; reconciled by
adopting the loose files' implementation wholesale (now byte-identical —
`diff` clean) and layering this pass's other work (shortcuts grouping,
empty-state copy, `style.css` removal) on top rather than discarding it.
Worth flagging for future passes: when loose files are provided alongside
a zip, diff them against the zip's copies before starting work, not after.

Verification: `node --check` clean on all JS, CSS brace-balanced in every
file, `app.js` div/section tag counts balanced, selector count per CSS
file unchanged before/after the token swap (except the one deliberate
`chapter-enter` selector addition from the reconciliation above), and a
Node + localStorage-shim smoke test confirming `motion` settings
round-trip and backfill correctly on a legacy db. No automated test
harness for this pass (same caveat as the Cozy/Nav refinement passes).

## Contextual drawer/inspector, book-tree sidebar, Focus/Zen tiers, Settings jump-links — shipped

Four items from the visual-refinement list, done together in one pass:

**Settings jump-links.** The deliberately-deferred middle option between
the existing single-scroll modal and a full nav-rail redesign (that
redesign itself stays not-built — see the note further down). A sticky
row of section buttons under the modal header, smooth-scrolls the panel
to the matching section, active link tracked via a plain scroll listener.

**Focus/Zen/Typewriter tiers.** The old single on/off `.focus-mode` class
became a 4-value `data-focus-level` attribute on `#app-shell` — `off` /
`focus` (sidebar + nav hidden, toolbars and footer stay) / `zen` (the old
single-toggle behavior wholesale) / `typewriter` (zen plus keeping the
caret's current line vertically centered as you type, via a new
`updateTypewriterScroll()` in editor.js reusing mentions.js's
`getCaretCoordinates()`). `cycleFocusMode()`/`setFocusLevel()`/
`getFocusLevel()` replace the old `toggleFocusMode()`; every call site
that used to touch the class directly (Escape, both toggle buttons, the
Write-only force-exit, project-switch teardown) now goes through these.

**Book-tree sidebar.** Chapters group into collapsible Act sections when
the project actually uses the `arc` field (Session 22) — reuses that
field rather than adding a new "act" concept, and falls through to the
exact old flat list when no chapter has an arc set, so a project that's
never touched arcs sees no change. Grouped by walking chapters in reading
order and starting a new group whenever the arc value changes, so
interleaved arcs don't get silently reordered into contiguous blocks.
Scenes nest under their chapter, collapsed by default, expand state held
in module-scoped Sets (`collapsedActs`/`expandedChapterScenes`) since the
sidebar re-renders on every autosave tick and would otherwise reset any
DOM-only expand state on the next keystroke. Clicking a scene opens its
chapter and the new Scene Inspector (below) for that scene.

**Contextual drawer/inspector.** One slide-in panel mechanism
(`js/drawer.js`, its own `#drawer-root` — no backdrop, unlike every modal,
so the manuscript stays visible and scrollable behind it) for two things:

- *Entity drawer* — click an already-written `[[mention]]` in the
  manuscript. Since the editor is a plain `<textarea>` (not
  contenteditable), there's no real inline clickable span to hang this
  off; instead editor.js's click handler checks the resulting caret
  position against `Store.extractMentions()`'s spans (the same function
  `getBacklinksFor()` already uses) and reports a hit via a new
  `onMentionClick` callback on `attachEditor()`. Shows description,
  relationships (`Store.getRelationshipsForEntity`, previously written but
  never actually called from anywhere), appearances
  (`Store.getBacklinksFor`, click one to jump straight to that chapter),
  and up to 6 gallery images — read-and-jump, not a second place to edit;
  "Open full entry in World" hands off to the existing Notes-view editor
  rather than duplicating its gallery-management UI.
- *Scene Inspector* — POV/location/time/mood/status, five new fields
  added to the scene shape (with a migrate() fallback for scenes created
  before this pass) and edited directly in the drawer. Deliberately
  additive to, not a replacement for, the Corkboard card's existing
  goal/conflict/outcome fields — those stay exclusively on the card so
  there's never two places claiming to be the source of truth for the
  same field.

Both drawer flavors close on Escape, the ✕ button, or a click outside the
panel, and on switching projects (`closeDrawer()` added to
`teardownLiveStateForProjectSwitch()`).

Not touched in this pass, on purpose: the Library shelf and Image Library
modal are still not split out of app.js (see the app.js-refactor entry
below — same reason as before, real view-level coupling). The
nav-rail/multi-page Settings redesign is still not built — jump-links
were the explicitly agreed middle ground, not a first step toward it.

## Quick-wins pass — closed out

Last gap from this batch (motion tokens, type/spacing scale, chapter
transition, grouped shortcuts, status-bar audit — all already covered
above/elsewhere in this doc): Book mode's empty-chapter message was still
the flat "This chapter is empty." — the one empty state in the app that
hadn't gotten the same personality-but-brief treatment as every other one
(sketches, snapshots, corkboard, timeline, etc.). Now "Nothing written
here yet — come back once this chapter has some pages." Audited every
other `empty-note` string in the app first — everything else already had
this treatment, so this was genuinely the only remaining spot.

Also deleted `css/style.css` — the pre-split monolithic stylesheet,
orphaned since the app.js-refactor pass split it into the 9 files under
`css/` and updated `index.html` to link those instead. It was never
actually loaded (nothing references it), just stale dead weight that
survived because zip-based delivery only adds/overwrites files, never
deletes ones that are gone in a newer version — worth remembering for
future passes that remove a file rather than edit it.

## Visual QA pass — shipped

A round of fixes and features from live visual review, not code inspection
— six items flagged from screenshots, tackled one at a time rather than
as a single sweep, per the usual "slowly, verify each" approach for
anything touching more than CSS.

| Item | What shipped |
|---|---|
| Focus mode, Write-only | Confirmed via code (every `.focus-mode` CSS rule only ever touched Write elements) that this was an oversight, not a design decision — the button lived in the always-visible nav bar by default, not because Focus was meant to work elsewhere. Hidden outside Write in `renderViewTabs()`; force-exits focus mode too if it was somehow on when navigating away, so it can't reintroduce the old "no way to exit" bug by leaving nav tabs suppressed with the one exempted button now hidden. |
| Entity delete button, twice | First pass moved it from a reused `.scene-delete` (position:absolute, anchored to a distant ancestor since `.notes-detail-header` had no positioned parent nearby) into the detail header — better, but still shifted position with the entity's name/type width. Second pass (after feedback) moved it again, this time onto the entity's own row in the sidebar list — a normal flex child, never absolutely positioned, so its position is simply wherever that row is, always. |
| Relationship Canvas — continuous link mode | `canvasLinkMode` used to reset after every single link, forcing a re-click of "+ Link" each time. Now only the "from" selection resets, so placing several links in a row is one continuous flow. Added Escape as an explicit way to cancel out of link mode, since it's no longer self-canceling after one link. |
| Relationship Canvas — relationship types | Bigger change: relationships used to carry their own free-text label directly, so N relationships that happened to say the same thing were N independently-drifting strings with nothing tying them together. Now backed by a `relationshipTypes` table — relationships hold a `typeId`, not a label — so genuinely-the-same relationship (a dozen characters who are all "Sibling," a hero with "Hero of X" across many concepts) can be renamed as one thing. Editing an edge that's shared by others now asks "rename all N, or just this one?" — OK renames the shared type (propagates everywhere), Cancel detaches this one relationship onto its own type first. Orphaned types (nothing left pointing at them) are cleaned up automatically on every path that can create one — detach, delete relationship, delete entity — no manual type management ever needed. Migrated existing free-text labels by grouping on exact trimmed text. |
| Book mode centering | Root cause wasn't a text-align bug — the toolbar was a flex row with 1 button on the left and 4 elements on the right, so the "centered" title's own box was already lopsided before centering ran. Rebuilt as a 3-column grid (`minmax(0,1fr) auto minmax(0,1fr)`) so the title centers against the whole bar regardless of how unevenly the flanking controls are distributed. |
| Stats — target word count | The Target column existed in the table since it was first built, but nothing ever wrote to `targetWordCount` — always showed the placeholder dash. Turned into an editable input (`change`, not `input`, so it commits once you're done typing a number, not mid-keystroke). Backfilled onto every chapter that predates the field via `migrate()`, same treatment as `arc`/`lastCursorPos` before it. |
| Stats — write-time tracking | New: cumulative *active-typing* time per chapter, not "chapter was open" time. Starts a session on the first `input` event after a pause, closes it out (banking the elapsed time) after a 5-minute idle gap **or** immediately on blur/chapter-switch/unload — piggybacked onto `flush()`, which already ran at exactly those three points for autosave, so no new wiring was needed at any call site. Displayed in Stats as a new "Time" column, rounded to the nearest minute (`formatWriteTime`) — a stat, not a stopwatch. |

**Verification.** All items: `node --check` clean on every touched module, CSS brace-balanced, `app.js` div/section tags balanced. Relationship types and target word count: functional smoke tests via Node + localStorage shim, including migration against a synthetic legacy db (exact-trimmed-text grouping, whitespace variants merging correctly, blank labels becoming `typeId: null` rather than an empty-string type). Write-time tracking got the deepest verification of this batch, since it's genuine new stateful/timer logic rather than a CSS fix or a straightforward CRUD wire-up: a jsdom-backed test suite (installed `jsdom` for this — not otherwise a project dependency) covering flush-closes-an-open-session, flush-with-no-session-is-a-no-op, additive accumulation across multiple sessions, clicks/arrow-keys never starting a session, two chapters never cross-contaminating each other's time, and — using a temporary copy of `editor.js` with the idle threshold shortened to 300ms for the test only, source untouched — confirming the idle timer genuinely fires and closes a session on its own, without `flush()` ever being called. 6/6 passing.

## Planned — Session 23 onward

**Stale note, partially resolved:** the "What actually shipped, vs. the
original plan" table above this section is still only reliable through
Session 22 — reconciling that table itself is out of scope for a
docs-backfill pass focused on this file's own pass-by-pass history below
it. Session 23's worldbuilding pass, the Craft-tools pass, and the Tier 2
pass, previously missing from this file entirely, now each have their own
entry below (see "Session 23 — worldbuilding pass," "Craft-tools pass,"
and "Tier 2 pass," all landing chronologically before "Tier 3 pass" a few
sections down). The two items below (mobile companion, sync) and the
`app.js`/`style.css` refactor status are still accurate as written —
none of the intervening passes touched either.

Neither remaining item has a firm scope yet, so there's no session table
here the way earlier sections have one — both need a scoping decision
before implementation, not just a build session:

- **Mobile companion view** — genuinely undecided in scope yet: a
  responsive layout for the existing app, or a separate lightweight
  view (e.g. capture/read-only)?
- **WaoL-pattern sync** — the heaviest remaining item. `emptyDb()` has been
  kept flat and JSON-serializable with this in mind since Session 1, but
  actual sync needs whatever pairing/transport WaoL uses, conflict
  handling for concurrent edits, and probably its own design pass before
  any code gets written.

**Flagged during v0.1 QA — `app.js` refactor (two slices done, views/Library still pending)**

`app.js` was 3,391 lines / 77 top-level functions doing rendering for all
12 views plus all 10 modals plus DOM wiring, in one file; `style.css` was
2,127 lines with no scoping convention. Two of the v0.1 QA bugs (the
`.view-tab` class collision blanking every panel, and the `.main` grid-
column collapse in Focus mode) were both symptoms of this — code living
thousands of lines apart from other code it has undocumented assumptions
about. By the time the second slice below started, `app.js` had grown to
4,592 lines and `style.css` to 3,103, unchecked in the meantime.

The Nav refinement pass above pulled nav rendering out into `js/nav.js`
as a first, low-risk slice (small, self-contained, exactly the kind of
piece the original flag had in mind). A second pass split out the five
most self-contained modals — Sprint (`js/sprintPanel.js`), Read Aloud
(`js/readAloud.js`), Grammar/Style Check (`js/grammarModal.js`), Backup &
Restore (`js/backup.js`), and Word Check + Thesaurus (`js/wordCheckModal.js`,
906 lines total) — leaving `app.js` at 3,768. These were chosen
specifically because their only coupling back into `app.js` was a handful
of generic helpers (`q`, `closeModal`, `escapeHtml`/`escapeAttr`, `render`,
`showStorageWarning`, `downloadTextFile`/`safeFilename`) plus, for Grammar
and Backup, read/write access to the active-view navigation state — solved
with live-binding exports (`export { activeView, activeChapterId,
currentEditorHandle }`) for reads and two small setters
(`setActiveView`/`setActiveChapterId`) for the one write Backup needs after
a restore, rather than restructuring who owns that state. `style.css` was
also split, mechanically, into 9 concern-based files under `css/`
(`base`, `shell`, `editor-view`, `views`, `modals`, `dashboards`, `tools`,
`media`, `polish`), linked from `index.html` in the same order the rules
originally appeared in — cascade order is preserved exactly, since linked
stylesheets apply in document order the same way one concatenated file
would.

Investigated but deliberately left alone this pass: the Library shelf
(project switcher) and Image Library modal. Both reach into `app.js`'s
central `render()`/`renderWriteView()` and, for Image Library specifically,
`applyFormatToggle()`/`buildImageToken()` in the live editor — genuine
view-level coupling, not just missing exports, so splitting them safely
needs a bigger design pass rather than the same mechanical move used
above.

The remaining 11 views (Write, Corkboard, Outline, Notes, Canvas, Sketch,
Snippets, Timeline, Search, Stats, Book) and the Library/Image Library
modals are still in `app.js`, still sharing `activeChapterId`/`activeView`/
`activeEntityId`/etc. directly rather than through an explicit interface.
That's the harder remaining slice — worth a proper state-ownership design
pass (a small shared "app state" module, or context object threaded
through, rather than more live-binding exports) before attempting it,
not a hunch-driven split.

## Session 23 — worldbuilding pass (generic entity-type templates) — shipped

Backfilled from `README.md`'s matching log entry (never mirrored here
until this reconciliation pass); summary below, full detail there.

| Piece | What shipped |
|---|---|
| `project.entityTypes[]` | Replaces the old hardcoded character/location/item/concept array — those four now ship as seeded builtin templates, with a migration guard for pre-existing projects. Custom types (name + flat hex color + optional custom-field schema) managed via a new "Manage entity types" modal; builtins protected from key/color/deletion changes, deleting a type in use is blocked. |
| `entity.parentId` | Nesting, cycle-safe parent picker (`wouldCreateCycle`), orphan-on-delete for children rather than dangling refs. |
| `entity.aliases` | Closed a long-standing known gap — `findEntityByName` now matches alt-names/nicknames, not just the exact name. |
| `entity.customFields` | Per-template values, rendered generically in the entity detail panel. |
| `entity.tags` | Activated with a filter-chip bar in the Notes sidebar, reusing the Library filter-chip pattern wholesale. |

Known tradeoff, still true: custom-type colors are flat, not
theme-reactive (no way to generate a paper/void/sepia triad from an
arbitrary hex), so a custom type looks the same across all three themes.

Verified with a Node smoke test (custom type creation, entity
nesting/alias lookup/cycle detection/orphan-on-delete, tag activation,
delete-type guards) plus a separate migration test simulating a
pre-Session-23 save. One real bug found and fixed during testing:
`slugType()`'s generated keys had a stray leading underscore from
misusing `uid('')`.

Not done at the time: no in-browser verification, only Node-level store
logic — flagged then as the biggest open risk heading into Craft-tools/
Tier 2 below, which build directly on this entity system. No DOM bug
from it has surfaced since, per later passes' testing.

## Craft-tools pass — scene relationships, story questions, project health, craft analytics — shipped

Backfilled from `README.md`'s matching log entry; summary below, full
detail there.

| Piece | What shipped |
|---|---|
| Scene relationships | New `project.sceneRelationships` collection — structurally identical to entity `relationships` (id, from/to pair, type) but between scenes, using a fixed vocabulary (`SCENE_RELATIONSHIP_TYPES`: follows/precedes/parallel-to/flashback-of/foreshadows/pays-off) rather than the renameable-type machinery entity relationships have. UI lives in the Scene Inspector drawer. |
| Story questions / foreshadowing tracker | New `project.storyQuestions` collection + Questions nav tab (Plan group). Free text, optionally pinned to the scene it's introduced/paid off in, manual `resolved` toggle — deliberately never auto-resolved. |
| Project health / orphan-detection dashboard | New Health nav tab (Tools group). `getProjectHealthReport()` surfaces orphaned entities, dangling `[[mentions]]`, timeline events linked to a deleted chapter, and unresolved story questions. Read-only, click-to-jump rows. |
| Craft analytics | Added to Stats: pacing (words/chapter bar chart), dialogue-vs-narration ratio (quote-mark heuristic, not a precise parse), POV distribution. All read-only, computed fresh from existing fields — no new persistence. |

Data-layer functions were written and store-tested ahead of their UI in
this pass; the UI was wired in immediately after in the same pass.

## Tier 2 pass — graph presets, "what's changed" report, and one CSS gap closed — shipped

Backfilled from `README.md`'s matching log entry; summary below, full
detail there.

- **Bug found and fixed:** the Craft-tools pass's analytics section
  (Pacing/Dialogue/POV in Stats) had no CSS anywhere — referenced in the
  rendered HTML but never styled. Added the missing rules to
  `dashboards.css`.
- **Canvas graph presets** — new `project.graphPresets` collection.
  Saves a named snapshot of the Canvas legend's hidden-entity-types set,
  the relationship-status filter, and every entity's current
  `canvasX`/`canvasY` — per the audit's "one graph engine, many presets"
  framing, not a second layout engine. Positions are copied at save
  time, not referenced, so moving nodes afterward doesn't silently
  rewrite a saved preset.
- **"What's changed" report** — added to Health: a Today/This week/This
  month toggle backed by `getChangesSince()` (already existed from
  Craft-tools, had no UI until now). Current totals for touched
  chapters, not an added/removed word delta — no word-level history
  outside manual per-chapter snapshots.
- Deliberately skipped a standalone "novel-level diff" view — the
  changes-since report covers the same ground more cheaply, reusing
  tested code rather than a second engine next to `diff.js`.

Verified with a jsdom smoke test: create/apply/update/delete a graph
preset, position round-trip through a preset, `getChangesSince`
detecting newly-created entities. 11/11 assertions passed. All 26 JS
files pass `node --check` at the time; CSS braces balanced.

## Tier 3 pass — shipped

Continuity checking, per-project style guide, and the completion
checklist — all three items `TINTA-FEATURE-AUDIT.md` scoped into Tier 3.
Full detail in `README.md`'s Tier 3 pass log entry; summary:

| Piece | What shipped |
|---|---|
| Continuity checking | `entity.statusEvents[]` + a Status Timeline section on the entity detail panel, anchored to Timeline events' existing `order` field rather than a new date system. `getContinuityReport()` turns each entity's status sequence into blocked intervals and cross-references `[[mention]]` backlinks and `scene.pov` against them. Surfaced as a new Continuity section on the Health dashboard. |
| Per-project style guide | New `project.styleGuide[]` (preferred-vs-wrong term pairs), managed from a new section in Grammar Check → Settings. Local-only scanning (`scanTextForStyleViolations`), merged into the grammar checker's match-card results when the network checker runs, plus a standalone offline-only check button. Rolled into the Health dashboard as its own section. |
| Completion checklist | New Checklist tab (Tools group), backed by `getCompletionChecklist()` — wraps the existing health report for data-quality checks and adds publish-readiness-specific ones (every chapter Final, no empty chapters, targets met, blurb, cover). Each item flagged blocking or informational rather than a single pass/fail gate. |

Verification: three Node smoke tests (46 checks total, not checked into
this snapshot) covering style-guide rule CRUD/scanning, continuity
interval math/dangling-link handling, and checklist pass/fail transitions.
All 27 JS files pass `node --check`; CSS braces balanced across all 9
stylesheets.

## Tier 4 pass — series / universe management (§13) — shipped

**Reconstructed from source, not from a prior write-up** — this pass
shipped without a log entry in either doc (the closest trace was
`series.smoketest.mjs` existing with a broken relative import that
silently never ran, caught in passing by the Calendar pass below and
fixed there). What follows is sourced directly from `store.js`'s own
code comments and a fresh reading of the implementation, not
reconstructed from memory of the pass itself.

| Piece | What shipped |
|---|---|
| `db.series{}` | App-level collection, sibling to `db.projects` — a series is a shelf of Library projects sharing one worldbuilding bible. Gets its own `entities{}`/`entityTypes[]` tables (same shape as a project's, seeded with the same 4 builtins) rather than treating one member project's tables as "primary" — there's no natural primary book in a series. |
| `project.seriesId` | A project belongs to at most one series at a time. Migration backfills existing projects to `null`. |
| Membership CRUD | `createSeries`/`renameSeries`/`deleteSeries`, `addActiveProjectToSeries`/`removeActiveProjectFromSeries`. Deleting a series clears `seriesId` on every member project but leaves the books themselves untouched; deleting a project drops its slot from its series' roster without touching the series or its shared entities. |
| Shared entities | `createSeriesEntity`, `promoteEntityToSeries`/`demoteEntityToProject` (moves an entity between a project's own table and its series' table — same object, different home, `updateEntity` doesn't need to know which), `deleteSeriesEntity` (sweeps every member project's relationships, not just the active one, since any member book could reference it). |
| Transparent resolution | `getEntity()` checks the active project's own table first, then its series' shared table — the one change that makes relationships, backlinks, parent pointers, and `[[mention]]` links all resolve a shared entity the same way they resolve a local one, with no other call site needing to know series exist. `findEntityByName()`/`getEntityChildren()` extended the same way; a project-local entity wins a name collision against a shared one. |
| UI | Library card ⋯ menu gets a "🔗 Series" item opening a create/join/manage modal. Notes sidebar shows a shared-entities group (header: series title) alongside the project's own, with a share/unshare toggle on the entity detail panel and a scope picker (this book vs. the series) on entity creation. |

Deliberately **not** included, per the code's own scoping comment:
series-level relationships or a series-wide timeline. A shared
character's relationships to others are usually genuinely different per
book (allies in Book 1, estranged by Book 3 — same reasoning
`createRelationship`'s own doc comment gives for why that's a feature),
and a series-wide chronology needs the structured-dates work Tier 4's
Calendar item (below) delivered — both natural follow-ups once this
foundation is in use, not part of this pass.

Verification: `series.smoketest.mjs` — membership, shared-entity CRUD,
promote/demote round-trip, transparent `getEntity`/`findEntityByName`
resolution across both tables, and the cross-project delete sweep. Its
relative import was broken until the Calendar pass below caught and
fixed it in passing; re-run fresh as part of this reconciliation pass
to confirm it still holds: 31/31.

## Tier 4 pass — custom calendar (§12) — shipped

First item picked up from Tier 4. Scoped to calendar + time-relationship
math only — `TINTA-FEATURE-AUDIT-MAXIMUM-v0_2.md` §12 marks astronomy
🧪-tier (explicitly optional, same bucket as the procedural map generator),
and seasons/eras/holidays/multi-calendar-conversion weren't needed for
what this pass was actually a prerequisite for: giving Timeline events a
real date to order by instead of just an `order` integer. Full detail in
`README.md`'s Tier 4 pass log entry; summary:

| Piece | What shipped |
|---|---|
| `project.calendar` | `null` by default, entirely opt-in — Timeline's freeform `storyDate` keeps working with no calendar configured. One fixed month/week structure for the project's life once enabled (no leap years); `enableCalendar()`/`disableCalendar()` toggle it without discarding config. |
| Pure date math | `calendarDateToAbsoluteDay`/`absoluteDayToCalendarDate`, `compareCalendarDates`, `daysBetweenCalendarDates`, `offsetCalendarDate` (calendar-aware month/year math, clamps into shorter target months), `getWeekdayIndex`/`getWeekdayName`. All take the calendar as an explicit argument — no `getActiveProject()` reads — so they're unit-testable standalone. |
| Per-event `calendarDate` | Optional `{year, month, day}` on `timelineEvents[]`, opt-in per event. `formatTimelineEventDate()` resolves calendarDate-vs-storyDate for display, falling back to storyDate whenever the structured date isn't usable (no calendar, disabled, or gone stale against a since-edited calendar) — never displays a stale date as if valid. |
| `findCalendarOrderMismatches()` | Flags events whose calendarDate runs earlier than the event before it in Timeline's manual `order` — a non-blocking ⚠ nudge (same spirit as the Tier 3 continuity checker), not an enforced constraint, since an intentionally-earlier-dated flashback later in Timeline order is normal. |
| UI | 📅 Calendar button on Timeline header opens a create/edit modal (months as plain-text `name, days` lines, comma-separated weekdays, optional year suffix, on/off toggle). Each event card gets a "+ Set calendar date" affordance when a calendar is active. |

Also closed this pass: the reconciled files carried no CSS at all for any
of the above (Timeline calendar row, mismatch banner, modal textarea) —
added to `dashboards.css`/`modals.css`, reusing existing patterns
(`.checklist-banner-notready` for the warning, existing timeline-event-card
field styling for the date row) rather than inventing new ones.

Verification: new `calendar.smoketest.mjs` (55 checks) — pure date math
including a negative-year epoch and a deliberately irregular 5-day-week/
3-month calendar (proof nothing assumes 7-day weeks or 12 months), plus
the store-integration surface (opt-in default, enable/disable round-trip,
stale-date fallback, order-mismatch detection). All 27 JS files pass
`node --check`; CSS braces balanced across all 9 stylesheets. Also fixed
a pre-existing bug found in passing: `series.smoketest.mjs`'s relative
import pointed at `./js/store.js` from inside `js/` itself, so it had
never actually run since being placed there — now runs for real (31/31).

## Tier 4 pass — geography / map system (§11) — shipped

Second item picked up from Tier 4. Scoped to §11's Core list minus
freehand vector shapes (regions/paths/rivers/borders — a second drawing
engine's worth of scope, not built here), plus the 🧠-tier marker→entity
link only (not marker→scene/event/faction). The 🧪-tier procedural
generator stayed out on purpose, same bucket as Calendar's astronomy
layer. Full detail in `README.md`'s Tier 4 pass log entry; summary:

| Piece | What shipped |
|---|---|
| `project.maps{}` | Opt-in catalog, backfilled to `{}` for every project predating this pass. Any number of maps; `mapType` is a free label (World/Regional/City/Dungeon-Interior via `getMapTypes()`), not a fixed enum. |
| Backgrounds | A map's background is just an `imageId` into the existing `project.images` catalog, set via a new `'map'` mode in the existing Image Library modal — no second image pipeline, rides along with the existing cleanup sweep. |
| Markers | `map.markers[]`, normalized `{x, y}` (0..1) coordinates so pin position survives the image rendering at any size. Label, free-text note, optional `entityId` link, optional `linkedMapId` for drill-down between maps. Click empty map space to drop a pin; click a pin to open its editor below the map (not an overlay). |
| Orphan-not-dangle | Deleting an entity clears any marker's `entityId` (pin survives); deleting a map clears any other marker's `linkedMapId` pointing at it — same rule the rest of the data model already follows. |
| UI | New Map tab in the nav's World group; Sketch-style list-plus-detail shell (`.sketch-layout` reused wholesale) for the map list, image stage, pins, and marker editor. |

Also closed this pass: the reconciled files carried no CSS at all for the
map stage/pins/marker editor — added to `views.css`, reusing
`.sketch-layout`/`.sketch-list-col`/`.sketch-main-col`/`.sketch-toolbar`/
`.entity-name-input` wholesale. Found and fixed in passing:
`.notes-view-header` (the "Sketches / + New" row, now also "Maps / + New")
had been entirely unstyled since whichever pass introduced Sketch's
version of it — fixed once, both views benefit.

Verification: new `map.smoketest.mjs` (35 checks) — map/marker CRUD, both
orphan-cleanup directions, marker deletion, and a migration-backfill test
via `importFullBackup()` (the one public entry point that re-runs
`migrate()` against fresh parsed JSON — a plain mutate-then-`switchProject`
round-trip wouldn't have, since `_db` is cached after the first `load()`).
`calendar.smoketest.mjs` (55/55) and `series.smoketest.mjs` (31/31)
re-run clean after reconciling the loose files back into the tree. All 29
JS/mjs files + `sw.js` pass `node --check`; all 9 CSS files brace-balanced.

## Tier 4 pass — references / research vault (§14) — shipped

Third Tier 4 item. Full detail in `README.md`'s own §14 log entry;
summary:

| Piece | What shipped |
|---|---|
| References catalog | New `project.references{}`, six fixed types (Note/URL/Quote/Book-Source/Image/Screenshot), single-id links to one entity/chapter/scene, tags with filter chips. Image-type references reuse the `project.images` catalog and `resolveEntityAvatar()` — no new image pipeline. |
| Orphan-not-dangle | Deleting a linked entity/chapter/scene clears the link, keeps the reference — same rule as everywhere else in the data model. |
| UI | References tab in the World nav group; list-plus-detail shell reusing Sketch/Map's layout classes wholesale. |

Also formalized `craft-tools.smoketest.mjs` (47 checks) for the earlier
Craft-tools pass, which had shipped without its own smoke-test file.
Verification: `references.smoketest.mjs` (33 checks) + the newly-added
craft-tools test, both passing; `calendar`/`series`/`map` smoke tests
(121 checks combined) re-run clean, confirming no regressions. All 32
JS/mjs files pass `node --check`. 201 checks passing across all five
smoke-test files project-wide.

## Quick-wins pass — search upgrades, annotations, bookmarks — shipped

Picked up from `TINTA-FEATURE-AUDIT-MAXIMUM-v0_2.md`'s quick-wins list.
Full detail in `README.md`'s own log entry; summary:

| Piece | What shipped |
|---|---|
| Search — regex mode | `useRegex` option on `search.js`'s `findOccurrences`/`searchProject`, zero-width-match guarded, invalid patterns reported via `results.regexError` instead of thrown. Replace stays literal-only and is disabled while regex mode is on, to avoid a match-count mismatch. |
| Search — scene + tag search | Previously out-of-scope categories now searched: scene goal/conflict/outcome/notes/location, and entity tags. UI: category filter chips (only shown for categories with results), scene rows jump into Corkboard. |
| Annotations | New `project.annotations{}` — 8 fixed types (TODO/Check/Research/Rewrite/Canon/Foreshadow/Payoff/Continuity), chapter-level + optional scene-level, manual `resolved` toggle. UI: badge+modal (`annotationsModal.js`, new file) from the Write toolbar, plus a scoped-down section in the Scene Inspector drawer. |
| Bookmarks | New `project.bookmarks{}` — chapter-level or chapter+scene, label + `createdAt` only. UI: ☆/★ toggle + a project-wide jump popover in the Write toolbar. |
| Cascade deletes | Chapter delete removes annotations/bookmarks outright (no meaningful orphan state, same as `sceneRelationships`); scene delete just clears `sceneId`, same "orphan the link" rule `references` uses. |

New `search.smoketest.mjs` (21 checks, no Store shim needed — search.js
has no Store dependency) and `quickwins.smoketest.mjs` (32 checks,
covering annotations, bookmarks, both cascade-delete paths, and
migration). All 7 smoke-test files re-run clean: 233 checks total, zero
regressions. All JS/mjs files pass `node --check`; all CSS brace-balanced.

Not done: no DOM/browser-level test of this pass's UI (standing gap,
same as every Tier 3/4 pass); no project-wide annotations list (only
per-chapter/per-scene) — worth revisiting if chapter-by-chapter search
stops being enough once a project has many chapters.

## Annotations dashboard pass — shipped

Both follow-ups the pass above flagged as open — named distinctly (not
another "Quick-wins pass") since that name has already been reused
across sessions and stopped being disambiguating.

| Piece | What shipped |
|---|---|
| Project-wide annotations view | New `annotations` nav tab (Tools group). Renders `Store.getAnnotationList()` grouped by chapter (reading order), filterable by status (Open/Resolved/All) and type. No new `store.js` surface — reuses the same call the toolbar badge already made. Reuses `annotationsModal.js`/`drawer.js`'s row markup and CSS classes as-is. Chapter heading jumps to Write; scene tag jumps to Write + opens the Scene Inspector. |
| Regex replace | `planChapterReplace` in `search.js` now builds a real `RegExp` in regex mode instead of always doing a literal/escaped substitution — the same pattern `searchProject` already validated, so the previewed match count and the applied count can never disagree. Capture groups (`$1`/`$2`/`$&`) work for free via native `String.replace`. Also fixed a latent literal-mode bug: the Replace button's count now always comes from an uncapped `planChapterReplace` preview, not the display results (which cap at 20/field). |

`search.smoketest.mjs` extended with regex-replace coverage (42/42, up
from 32). No new smoke-test file needed for the dashboard — its data
contract is already covered by `quickwins.smoketest.mjs`. All 7
smoke-test files re-run clean — 296 checks total, zero regressions. Full
`node --check` sweep; all CSS brace-balanced.

Not done: no "view all" link from the chapter-scoped annotations modal
into the new dashboard tab (nav-only for now); no DOM/browser-level test
of this pass's UI, same standing gap as everything else in the app.

## Relationship History pass — shipped

Closes the §10 gap `TINTA-FEATURE-AUDIT-v2.md` flagged as still open: a
relationship's `status`/`strength`/dates (Craft-tools pass) was a single
current-state snapshot, not a sequence of how it changed over the story
("friends → rivals → forced alliance," each with its own date range).

| Piece | What shipped |
|---|---|
| `relationship.history[]` | Each entry is its own label/status/strength/note plus an optional link to a Timeline event. Independent of the edge's current-state fields — adding history doesn't touch `status`/`strength`, and vice versa. |
| Ordering | Sorted by linked Timeline event order when a link exists, falling back to creation order for unlinked entries — a dangling link (event since deleted) degrades to creation-order placement rather than erroring. |
| Migration | Pre-pass relationships backfill `history: []` on load, no data loss. |
| Cascade delete | Deleting a relationship takes its history with it. |

`relationship-history.smoketest.mjs` — 26/26. All 9 smoke-test files
re-run clean (was documented for the first time in this ROADMAP entry,
though it landed as its own self-contained diff before this pass).

Not done: no UI surfacing yet beyond whatever `store.js` exposes — this
was a data-layer pass; a history timeline view in the Relationship
inspector is still open if wanted.

## Manuscript export pass (DOCX + EPUB) — shipped

Closes the other real gap both audit docs called out: the existing
export (`Store.exportChapterText`/`exportProjectText`, Session 6) is
prose-only Markdown — fine as a working backup, not something to hand to
an agent or load onto an e-reader.

| Piece | What shipped |
|---|---|
| `js/zip.js` | Hand-rolled ZIP writer (store method only, no deflate) — no build step to pull in a real zip library, so DOCX/EPUB's shared "it's a zip" requirement gets a from-scratch ~150-line writer instead. Verified against `unzip -t` and Python's `zipfile` module directly, not just round-tripped against its own reader. |
| `js/manuscriptExport.js` | Parses `chapter.content`'s existing markup (`format.js`'s grammar — bold/italic/color/image tokens) into a paragraph model, then renders two different documents from it, not one shared template stretched two ways. |
| DOCX (standard manuscript format) | Times New Roman, double-spaced, first-line-indented paragraphs, centered title page (title/author/word count). Color highlights and inline images are dropped on purpose — a submission manuscript shouldn't carry a Tinta-only reading aid or illustrations. Scene breaks render as a centered "#", but only where the writer explicitly typed a divider line (`***`, `---`, `#`, etc.) — a blank line alone is treated as ordinary spacing, not inferred as a scene boundary, since content is one line per Enter and a blank-line-as-break guess would've scattered "#" between paragraphs that were never meant to be split. |
| EPUB (reader copy) | EPUB3, one XHTML file per chapter + nav.xhtml TOC. Keeps color highlights (rendered as inline CSS classes, same visual idea as Book mode) and resolves `{{img:id}}` tokens to real embedded images via `ImageStore.getBlob`, including an optional cover from `project.coverImageId`. A missing/deleted image resolves to a placeholder rather than failing the whole export. |
| UI | Two new buttons in the existing per-chapter Export modal (`app.js`'s `openExportMenu`), alongside the `.md` buttons — a "Manuscript" section with an author-name field (not a persisted project field; typed fresh per export) feeding both. |

`manuscriptExport.smoketest.mjs` — 54/54, using a from-scratch ZIP
*reader* independent of `zip.js`'s writer (so a bug present in both
wouldn't be masked by testing the writer against itself). All 10
smoke-test files re-run clean — 438 checks total, zero regressions. Full
`node --check` sweep; all CSS brace-balanced (no CSS changes needed this
pass — reused the existing `.backup-section`/`.backup-note` classes).

Also fixed in passing: `sw.js`'s precache list was missing `drawer.js`
and `annotationsModal.js` (both real, in-use modules `app.js` imports) —
added those alongside the two new files.

Not done: PDF/print export, web-serial export profiles, and a distinct
"reader-copy" DOCX profile are still open per the MAXIMUM audit's
wishlist — this pass covers the two formats both audits called out as
the genuine gap (submission + e-reader), not the full wishlist. No
DOM/browser-level test of the new Export-modal buttons — same standing
gap as the rest of the app's UI.

## Tier 7 pass — Rule-System foundation + worldbuilding templates — shipped

Closes §2's last unbuilt "reusable foundation" (the Rule engine) and
seeds §16–21's worldbuilding domains, after confirming by reading actual
source — not the doc's own stale §10–§14 checkboxes — that the Entity
and Graph engines §2 also calls for were already fully general.

| Piece | What shipped |
|---|---|
| Rule-System engine | New `ruleSystem.js` (pure — cycle detection via DFS, prerequisite ordering). `store.js` CRUD for `RuleSystem`/`SystemNode`: domain-agnostic systems (Magic/Tech-tree/martial-art/whatever) with §23-spec framing fields, nodes with requirement/cost/cooldown/effect/synergy/evolvesInto, cascade-delete on both, cycle rejection on every requirement edit. New `systems` nav tab. |
| Worldbuilding templates | 6 starter `createEntityType` presets (Culture, Species, Language, Religion, Faction/Government, Economy), 5 fields each. Zero new store surface — reuses the existing generic entity-type/customFields mechanism as-is. Surfaced in the Entity Type Manager modal. |

New: `rule-system.smoketest.mjs` (35/35), `worldbuilding-templates.smoketest.mjs`
(32/32). All 12 smoke-test files re-run clean — 505 checks total, zero
regressions. Full `node --check` sweep; all CSS brace-balanced.

Not done: no generator/name-tool wired to a system or language template
yet (§2's Generator engine — Tier 8); no DOM/browser-level test coverage
for the new UI; Technology intentionally left un-templated in favor of
the Systems tab already covering trees better than flat fields would.

## Generator engine pass — §2's last shared-foundation piece — shipped

Full detail in `README.md`'s matching log entry; summary:

| Piece | What shipped |
|---|---|
| `generator.js` | New pure engine — classic (migrated syllable pool), pattern (CVC templates), markov (learns from a project's own names). |
| `wordtools.js` | `generateName()`/`generateNames()` now delegate to `generator.js` instead of keeping a duplicate pool — zero behavior change. |
| `store.js` | `generateEntityNames({ mode, type, count, pattern })` — project-aware seeding + exclusion, with a threshold-gated fallback from `learn` to `classic`. |
| UI | Names & Archeshic Records modal gets a Classic/Learn toggle + entity-type filter, defaulting to unchanged behavior. |

Verification: `generator.smoketest.mjs` (35 checks, new). All 13
smoke-test files re-run clean — **540 checks total, zero regressions**.
`node --check` clean project-wide; `modals.css` (only CSS file touched)
brace-balanced.

Still open: the rest of §2's Generator engine scope (culture/city/
faction/religion generation, not just names) — this pass proved the
engine shape with the smallest real slice, not the full scope.

## Generator engine, domains pass — worldbuilding entity drafts + starter systems — shipped

Backfilled from `README.md`'s matching log entry; follows directly on
the name-generator pass above — the two domain-level consumers §2
flagged as depending on it, now built.

| Piece | What shipped |
|---|---|
| `generator.js`'s 4th mode, `generateDescriptor()` | One field-agnostic fragment generator (quality + subject + qualifier, stitched into a sentence) rather than a hand-authored phrase bank per template field — generalizes to a writer's own custom type/field, not just the 7 starter templates. Same "draft, not a deliverable" contract as the Classic name pool. |
| `draftWorldbuildingEntity`/`commitWorldbuildingDraft` | Generic over entity *type* — reads whatever `.fields` the given type defines. Two-step draft/commit, same "generate, look, decide" shape as the Name Generator's reroll-then-pick flow. Name generation auto-escalates classic → learn once 3+ entities of that type exist. |
| `generateStarterSystem({ name, domain, tierCount, perTier })` | Seeds a tiered node tree on Tier 7's `RuleSystem`/`SystemNode` engine, building strictly forward (each tier only requires the tier immediately before it) — no cycle risk to check. Only name/rank/category/effect generated; cost/cooldown/range/duration/limitation/counters/synergy/evolvesInto left blank on purpose, since generic filler on precise mechanical fields would be actively misleading. Result is a normal, fully editable system afterward — no "generated" special case. |
| Settlement template | 7th worldbuilding template (Culture/Species/Language/Religion/Faction-Government/Economy/Settlement) — a Location structurally, but wants different starting fields than a bare Location. |
| UI | New `generatorModal.js` (split-file pattern, like `readAloud.js`) — 🎲 button next to Notes' "+ Add" for entity drafts, 🎲 Generate in the Systems list for starter systems (commits immediately, no draft step — a generated system carries no "wrong to commit to" risk the way a bad name might). |

Verified with `generator-domains.smoketest.mjs` (39 checks): unknown-type
rejection for both draft and commit, fielded vs. fieldless types,
tier-by-tier prerequisite structure, no duplicate node names within one
generated system, name/domain fallback defaults, generated systems
edit/cascade-delete exactly like hand-built ones. All 14 smoke-test
files re-run clean at the time — 579 checks, zero regressions.

Not done: no DOM/browser-level test of this pass's UI, same standing gap
as every domain-level pass. §2's remaining named-domain generators
(structured culture/city/faction content beyond the generic descriptor
filler, procedural map generation) deliberately left as the
already-scoped "genuinely large, chaos-tier" items.

## Foundational pass — Cosmology (§25) + Generation History/Canon Control (§31) — shipped

Full detail in `README.md`'s matching log entry; summary:

| Piece | What shipped |
|---|---|
| Cosmology (§25) | Ninth `WORLDBUILDING_TEMPLATES` entry (6 fields), reclassified out of chaos-tier per the section's own "reuse existing primitives" text. Paired "Cosmic Laws" domain preset added to the starter-system generator for the one part of §25 that's rules, not prose. |
| `CANON_STATUSES` (§31) | Six states (canon/draft/proposed/alternate/deprecated/non-canon) on `entity` and `ruleSystem`. Hand-created → `'canon'`; generator-created → `'draft'`. |
| `generation` metadata (§31) | `generatorName`/`generatorVersion`/`inputs`/`timestamp`/`parentGenerationId`/`edited`, stamped by `commitWorldbuildingDraft`/`generateStarterSystem` via a shared `buildGenerationRecord()`. No `seed` field — no seeded PRNG exists anywhere in this codebase, so one would have been fiction. |
| `markGenerationEdited(kind, id)` | Explicit hook for post-generation-edit tracking. Not auto-wired into every update call (would misfire on the generation-stamping call itself) — a real primitive, no UI consumer yet. |
| Migration | Pre-pass records backfill to `canonStatus: 'canon'`, `generation: null` — not `'draft'`, since they were never generated. |

Verification: `worldbuilding-templates.smoketest.mjs` extended (+8
checks, 67/67), new `canon-control.smoketest.mjs` (43 checks). All 15
smoke-test files re-run clean — **675 checks total, zero regressions.**
All 47 JS/mjs files + `sw.js` pass `node --check`; all 9 CSS files
brace-balanced (no CSS touched this pass).

Still open, checked against each item's actual audit text rather than
assumed: §33 World-State Versioning's named-snapshot+rollback UI (the
backup/snapshot primitives it'd sit on already exist); §35 Contextual AI
and the generative halves of §32/§34 (blocked on a live-AI-dependency
product decision, not a coding task); §36 Contradiction Detective (2 of
14 sub-items already covered by existing features and just unlabeled,
a few more reachable as a lean "World Auditor v1" aggregating existing
signals, the rest needing data models — birthdates, per-scene location,
a knowledge/secrets engine — that don't exist yet); §27/§28 Ecology/
Population (real simulation, correctly chaos-tier, untouched by design).

## Foundational pass — Document-type model (§2.1) — shipped

Full detail in `README.md`'s matching log entry. Summary: 14 builtin
`chapterTypes` across four roles (content/frontmatter/backmatter/
scratch), full CRUD + migration, role-aware chapter numbering, scratch-
role exclusion from manuscript export, UI reusing the Entity Type
Manager's CSS wholesale.

**Flag, not a footnote**: the zip this shipped in had no `.mjs` test
files at all — verified by listing the archive, not assumed. This pass's
own `document-type.smoketest.mjs` (27/27) is real; the previously-claimed
675/675 across 15 files is **not re-confirmed** here, since those 15
files weren't present to re-run. Next session should track down a zip
that actually contains them before trusting that number again.

Remaining foundation-shaped candidates from `TINTA-FEATURE-AUDIT-MAXIMUM-v0_3.md`,
still open: Generator foundation's seed/reproducibility gap (§33 — no
seeded PRNG anywhere, `generator.js` uses plain `Math.random()`), and a
structured query language for Search (§9 — `type:`/`tag:`/`status:`/
date-range syntax; needs no new schema, all the fields it would query
already exist).

## Foundational pass — Document Templates (§2.2) + Organization (§2.3) — shipped

Two-session pass: data layer (`store.js`, `manuscriptExport.js` integration)
landed first, this session finished the UI that makes any of it reachable.
No entry existed for either half until now — writing both up together
since neither is meaningfully "done" without the other.

**§2.2 Document Templates** — 7 builtins (New Chapter, New Scene,
Character Sheet, Research Note, Glossary, Appendix, Screenplay Scene),
split by `appliesTo: 'chapter' | 'scene'` since scenes don't carry prose
of their own — scene templates prefill goal/conflict/outcome/notes/
location instead of content. Full CRUD, builtins protected (same
contract as `chapterTypes`/`entityTypes`), migration backfill seeds the
real 7 for pre-existing projects. UI: a "📄 Template" button next to
+ New opens a flat picker (chapter and scene templates together, tagged
rather than split into two lists — deciding "I want a Character Sheet"
shouldn't require first picking which picker it's in). Scene-template
rows disable themselves with an explanatory tooltip when there's no
active chapter to attach the scene to, rather than silently failing.

**§2.3 Organization** — five new chapter fields (`folderId`, `favorite`,
`pinned`, `archived`, `trashedAt`) plus four project-level registries
(`folders`, `collections`, `savedSearches`, `recentChapterIds`).
Favorites/pins/archive/trash/folders/collections/saved-searches all got
full CRUD in the data-layer session; this session wired all seven into
one tabbed "🗂 Organize" modal (All Chapters / Favorites / Recents /
Folders / Collections / Archive / Trash / Saved Searches) rather than
scattering seven separate entry points — they were built and tested
together as one pass, so the UI treats them as one surface too.

Also fixed three real, pre-existing bugs found while wiring this in,
not part of the original scope but caught along the way:
- The sidebar was rendering trashed *and* archived chapters right
  alongside everything else — Trash/Archive existing as concepts in
  `store.js` did nothing if the primary list never filtered on them.
- The sidebar's delete button called the old hard-delete directly,
  bypassing the new soft-delete entirely — now calls `trashChapter`,
  with `permanentlyDeleteChapter` reachable only from the Trash tab.
- `recordChapterOpened` existed but nothing ever called it, so Recents
  could never populate. Hooked into the existing chapter-switch signal
  `renderWriteView` already computes for the chapter-transition
  animation (`lastRenderedChapterId`), split into its own boolean so
  Recents tracking doesn't depend on whether animations are turned on.

Pinned chapters float to the top of their own group (the flat list, or
each Act section when arc-grouped) rather than globally — a global float
would pull a pinned chapter out of its Act's contiguous run and break
the Book-tree pass's grouping assumption.

`organization.smoketest.mjs` — 82/82 (data layer, from the prior
session). This session added no new store.js logic, so no new store-layer
test file; the new surface is UI only (`app.js` + CSS), same standing gap
as the rest of the app — see the cross-cutting DOM-testing risk noted
elsewhere in this doc.

Also fixed in passing: `sw.js`'s precache list was missing three more
real, in-use files (`generator.js`, `generatorModal.js`, `ruleSystem.js`)
— found by diffing the list against the actual contents of `js/`, not
just checking the files this session happened to touch. Worth doing that
diff as a standing pre-delivery check going forward, since this is the
second time files have gone missing from this list across sessions.

Not done: "smart collections" (dynamic filter-based, distinct from the
manually-curated collections that shipped) still needs §9's query
language first, same reasoning `store.js`'s own comment gives. No bulk
actions (multi-select archive/trash/add-to-collection) — everything above
is one-chapter-at-a-time.

## Containers pass — shipped

First of five foundation pillars picked up together (Containers → Query →
Navigation/Context → Mutation/History → Provenance), scoped as its own
conversation before any code — see the tradeoffs below, since this is the
one pillar with a real design fork.

The fork: `store.js` had a standing deferral comment (dating back to the
Document-type pass) saying a real Manuscript/Volume/Part hierarchy would
mean restructuring `project.chapters` from a flat list into a tree — a
much bigger, riskier change than tagging chapters with a type ever was.
Resolved by *not* doing that. `project.chapters` stays exactly the flat
array it's always been. Instead: a new flat `project.parts` array
(id/title/order, same shape as `folders` but ordered, not alphabetical),
and one new field on each chapter, `partId` (nullable, same single-parent
shape as `folderId`). Depth (Volume > Part nesting via `parentPartId`) was
explicitly deferred rather than built speculatively — flat first, matching
this project's standing "no architecture before a real need for it"
policy — see the decision writeup for the fuller pros/cons on that call.

| Piece | What shipped |
|---|---|
| Data layer | `project.parts` (array) + `chapter.partId` (nullable), both backfilled in `migrate()`. Full CRUD in `store.js`: `getParts`/`createPart`/`renamePart`/`deletePart`/`reorderPart` (swap-based, same pattern as the existing `reorderChapter`) /`assignChapterToPart`/`getChaptersInPart`. `deletePart` cascades to unassign, not to delete — same "orphan, don't touch the real content" rule `deleteFolder` already follows. |
| Content-role restriction | `assignChapterToPart` refuses (returns `false`, no-op) for any chapter whose resolved role isn't `'content'` — a Foreword/Appendix/scratch-role chapter can't join a Part. Folders already exist for "group anything, no restriction"; Parts are manuscript sequence, not a tag, so the restriction is deliberate rather than a gap. |
| Corkboard / Outline | Both group chapters by part now (`groupChaptersByPart()` in `app.js`), part header → its chapters → a trailing "Not in a part" bucket. The bucket, and part headers generally, only render at all once a project has at least one real part — a project with none defined looks exactly like it did before this pass, no new UI for a feature nobody's opted into yet. |
| Organize modal | New "Parts" tab, same shell as Folders (create/rename/delete) plus reorder arrows, since a part is sequence and folders never needed that. The "All Chapters" tab's per-row Folder selector gets a sibling Part selector — shown only for content-role chapters, mirroring the store-layer restriction instead of just letting the assignment silently fail. |
| Manuscript export | `manuscriptExport.js` groups by part the same way (duplicated the grouping logic rather than importing `store.js`, keeping this file's stated "operates purely on the project object it's given" design intact). DOCX gets a centered part-title paragraph at each group boundary; EPUB gets a small uppercase part label above the `<h1>` of each group's first chapter — no new spine/manifest entries, so the existing one-file-per-chapter zip structure didn't need touching. |

Verification: new `containers.smoketest.mjs`, 37/37 (CRUD, the content-role
refusal, cascade-unassign on delete, migration backfill for a project with
zero prior knowledge of parts). Full existing suite re-run after this pass:
20 smoke test files, 955/955, 0 regressions. `node --check` + a runtime
import check on every touched module (`store.js`, `app.js`,
`manuscriptExport.js`), per this project's standing "an import check
catches what `--check` alone doesn't" rule.

**Known tradeoff, flagged rather than fixed:** grouping by part means
Corkboard/Outline/export now render chapters in part-order-then-chapter-
order, not raw `chapter.order` sequence. For a project that assigns parts
*non-contiguously* (chapter 1 and chapter 5 both in "Part One," chapter 3
left unassigned), the rendered/exported order will visibly differ from the
flat sequence — matches how folders already behave, but worth knowing
before relying on it for a real manuscript.

No new browser-loaded file was added (the new smoke test is Node-only,
never fetched by the app), so `sw.js`'s `SHELL_FILES` list and cache
version are unchanged — consistent with the network-first-with-fallback
fix from Session 24 that was meant to end manual cache-version bumps.

## Query pass — shipped

Second of the five foundation pillars (Containers → **Query** → Navigation/
Context → Mutation/History → Provenance). Closes §9, the structured query
language for Search that Smart Collections has been blocked on since it
was first flagged — `type:`/`tag:`/`status:`/date-range syntax, per the
audit doc's own wording, plus the two other named gaps (canon state,
document type) that weren't filterable facets before this pass.

**Syntax:** zero or more `field:value` tokens anywhere in the query
(quoted for multi-word values — `part:"Part One"`), everything left over
is the existing free-text/regex search, unchanged. A pure filter query
with no free text left ("`status:draft`", no keyword) is valid and
common — it returns every matching row rather than requiring a keyword
just to have something to match against.

| Field | Scoped to | Matches against |
|---|---|---|
| `type:` | entities | `entity.type` |
| `tag:` | entities | `entity.tags[]` (exact, case-insensitive) |
| `canon:` | entities, rule systems | `canonStatus` |
| `docType:` | chapters | `chapter.docType` |
| `role:` | chapters | resolved role (`docType` → `chapterTypes[].role`) |
| `status:` | chapters, scenes | `status` (each category's own field) |
| `part:` | chapters | resolved part title (`partId` → `parts[].title`); `none`/`unassigned` matches unassigned |
| `folder:` | chapters | resolved folder name, same `none`/`unassigned` escape hatch |
| `arc:` | chapters | `chapter.arc` |
| `pov:` | chapters, scenes | `povCharacter`/`pov` |
| `updated:` | chapters, entities | `updatedAt`, calendar-day comparison |
| `created:` | entities | `createdAt`, calendar-day comparison |

**Date-range syntax:** a bare date (`updated:2025-06-01`) matches that
calendar day exactly; a `>`/`<`/`>=`/`<=` prefix compares against it;
`from..to` (either side optional — `updated:2025-01-01..` means "since")
matches an inclusive range. Comparison is string comparison on the
`YYYY-MM-DD` slice, not `Date` arithmetic — ISO dates already sort in
calendar order, so no timezone handling needed.

**Category scoping, not silent zero-results.** Each field only means
something for the categories that actually have the concept — `type:`
for entities, `docType:` for chapters. `searchProject` computes the
intersection of every active filter's allowed categories once, up
front; a category outside that intersection is skipped entirely rather
than scanned and just happening to come back empty, so a `type:`-only
query correctly shows zero chapters/snippets/etc. instead of merely
finding none. If two filters' allowed categories don't overlap at all
(`type:character` + `docType:chapter` — one's entity-only, the other's
chapter-only), that's flagged back as `results.filterConflict` instead
of silently running a query that can never match anything.

**Real bug caught before shipping, not after:** the parser lowercases
the field name for case-insensitive matching (`docType:` / `DOCTYPE:` /
`doctype:` should all work), but `QUERY_FILTER_FIELDS`' own keys are
camelCase (`docType`). Lowercasing `docType` produces `doctype`, which
matches nothing in the table — every `docType:`/`role:`-style filter
would have silently fallen through to "unrecognized, treat as literal
text" the moment someone typed it in the natural (lowercase) way. Fixed
with a lowercase→canonical alias table built once from
`QUERY_FILTER_FIELDS`'s own keys, so parsing and the matcher
switch-statements agree on the same canonical field name.

**The other real bug this pass fixed:** `countTotalMatches` sums text-
match occurrences, so a pure filter query legitimately reads as "0
matches" even when real rows came back (a `status:draft` filter has no
free text to count matches of). The UI was gating "No matches for ..."
on that same total, which would have told the user their filter found
nothing when it actually found several chapters. New `countResultRows`
(counts rows, not occurrences) is what the UI now gates on;
`countTotalMatches` still drives the "N matches" wording when there
*is* free text behind the filters.

**UI:** search box placeholder and the empty-query help text now mention
the field syntax with real examples; a `filterConflict` renders its own
explanatory note (which fields conflicted and why) instead of the
generic "no matches." Saved searches needed no changes at all — a saved
search already stores the raw query string, and filters are just more
characters in that string, so `type:character tag:important` round-trips
through Save/run-saved-search for free.

Verification: new `query.smoketest.mjs`, 58/58 (parser in isolation,
every documented field, category scoping including the "genuinely out of
scope, not just unmatched" distinction, `filterConflict`, the pure-filter-
query fix, filter+free-text combined, and the full date-range matrix).
Full existing suite re-run after this pass: 21 smoke test files,
1013/1013, 0 regressions. `node --check` clean on `search.js`/`app.js`; a
runtime import check (real localStorage/DOM stubs, not just syntax) on
`search.js`, `store.js`, and `app.js`. HTML tag counts (`<p>`, `<code>`,
`<div>`, `<span>`, `<button>`, `<label>`, `<textarea>`) re-verified
balanced across `app.js` after the new empty-state markup.

No new browser-loaded file was added (the new smoke test is Node-only),
so `sw.js` is unchanged — same reasoning as the Containers pass entry
above.

**Known scope boundary, not a gap:** this is the query *language*, not
Smart Collections itself — a saved dynamic filter (vs. the manually-
curated collections that already exist) is real UI/data-layer work of
its own, now unblocked but not built in this pass.

## Navigation/Context pass — Universal contextual inspector slice shipped

Third of the five foundation pillars (Containers → Query → **Navigation/
Context** → Mutation/History → Provenance). This pass landed the
*Universal contextual inspector* slice — the smallest of the three
scoped options for Navigation/Context, picked because the other two
(Back/forward history + breadcrumbs, Tabs/split/multi-pane workspace) are
either small-but-also-easy or genuinely large-but-deferred, while this
one was the slice that turned the most "dead-end clicks" into real
navigation affordances with the least new architecture.

**What shipped:** the drawer pattern that used to fire only for entity
(via [[mention]] click in the editor — see `editor.js`'s
`onMentionClick`) and scene (via sidebar book-tree click) now
generalizes to four more kinds. Each new kind routes through the same
`openDrawerShell()` mechanism and follows the same read-and-jump shape
as the entity drawer — peek here, "Open in X view" button does the
full-edit switch.

| Kind | Open function | Peek shows | "Open full X view" goes to |
|---|---|---|---|
| Reference | `openReferenceDrawer(referenceId)` | title, type, source, URL, tags, linked entity/chapter/scene | References view, with the matching reference selected |
| Rule-system node | `openRuleNodeDrawer(systemId, nodeId)` | effect, category/rank/cost/etc., requirements, "required by", synergy, evolution | Systems view, with the matching system open and its node row visible |
| Map marker | `openMapMarkerDrawer(mapId, markerId)` | position %, linked entity, drill-down map, notes | Map view, with the right map loaded and the matching pin selected |
| Timeline event | `openTimelineEventDrawer(eventId)` | story date, description (with clickable [[mentions]]), linked chapter, mentioned-entities list | Timeline view, scrolled to and flashing the matching event |

Plus a single `openContextDrawer(kind, payload)` dispatcher in
`drawer.js` that routes all six kinds (entity + scene + the four new
ones). Future call sites that want "peek at *something*" without
caring which kind — say, a future backlinks panel, a command palette
preview, an annotation's target — call the dispatcher once rather
than maintaining import paths to each individual open function. The
case/payload contract is documented at the dispatcher itself and
verified by a source-regex contract test (see Verification below).

**Wiring:** search-result click handlers for entity / scene / timeline
event / reference results used to switch the active view (Notes /
Corkboard / Timeline / References respectively). They now open the
drawer instead, so clicking a result peeks at it without leaving the
search results. The old switch-view path is preserved as the drawer's
"Open full X view" button — one click deeper, not gone. Chapter search
results still switch to Write (chapters are the main prose surface,
not inspectable); snippet / annotation / system / map results still
switch to their dedicated views (those either don't have a drawer yet
or the search hit is at a coarser level than the drawer peeks at — a
*system* isn't a node, a *map* isn't a marker).

`app.js`'s References and Map view list rows gained `data-reference-id`
/ `data-map-id` attributes so the drawers' "Open in X view" buttons
can target the matching row by id (Systems rows already had
`data-open-system`, Timeline events already had `data-event`).

**New store-side helper:** `getDependentNodes(nodeId)` in `store.js` —
returns the nodes in the same system that directly require this one
(non-recursive; cycle-safe by construction since requirement edges
already go through `RuleSystem.wouldCreateCycle` at update time). Used
by the rule-node drawer's "Required by" section so peeking at a node
shows who depends on it, not just what it depends on. Pure read;
doesn't mutate, doesn't save. Verified directly by the smoketest
against the actual `createSystemNode`/`deleteSystemNode` paths (not
mocked).

**Cross-drawer navigation** is wired through the same patterns the
existing entity drawer already used — clicking a related thing
inside a drawer opens that thing's drawer (or the right dedicated
view, for chapter links). Specifically: reference drawer → linked
entity drawer / linked chapter (Write view) / linked scene inspector;
rule-node drawer → required/dependent/synergy/evolvesInto node
drawers; map-marker drawer → linked entity drawer / drill-down map
view; timeline-event drawer → mentioned-entity drawers (both via the
inline clickable [[mention]] tokens in the description, and via the
"Mentioned" section's pre-resolved entity rows).

**New shared shape helpers** in `drawer.js`:
- `metaRow(label, valueHtml)` — the key/value rows in each drawer's
  meta block. `valueHtml` is already-escaped HTML so the caller can
  pass links/buttons when needed; plain escaped text otherwise. Empty
  value returns an empty string, paired with a `.drawer-meta-value:empty
  { display: none; }` CSS rule, so unfilled fields just don't render a
  row at all.
- `renderClickableMentions(text)` — same `[[Entity Name]]` token
  recognition as `mentions.js`'s `renderMentionsHtml`, but wraps each
  match in a `<button class="drawer-mention" data-entity-name="…">`
  instead of a `<span>`, so the timeline-event drawer can attach
  click handlers per mention.

**CSS:** new classes in `modals.css` (where the existing drawer
classes already live) — `.drawer-meta-block`, `.drawer-meta-row`,
`.drawer-meta-label`, `.drawer-meta-value`, `.drawer-link-button`,
`.drawer-link-out`, `.drawer-link-row`, `.drawer-link-sub`,
`.drawer-tag-chip`, `.drawer-canon-badge`, `.drawer-node-link`,
`.drawer-mention`, `.drawer-mention-row`, `.drawer-annotation-note`.
All reuse existing CSS custom-property theme tokens (`--ink`,
`--accent-deep`, `--accent-glow`, `--rule`, `--space-N`, `--text-N`),
so they pick up the Paper/Void/Sepia theme switch for free.

Verification: new `inspector.smoketest.mjs`, 42/42 — covers
`getDependentNodes` against the real `createSystemNode` /
`deleteSystemNode` paths (basic shape, multiple dependents,
self-exclusion, cross-system scoping, deletion reflection, pure-read
contract) plus a source-regex contract test for `openContextDrawer`'s
case/payload routing (every kind has a case, every case calls the
right open function with the right payload fields, default returns
null). Full existing suite re-run: 22 smoketest files, 935/935, 0
regressions. `node --check` clean on every file under `js/` (33
files). CSS brace balance verified on `modals.css`. No new
browser-loaded file added (`drawer.js` was already in `sw.js`'s
SHELL_FILES), so the service worker is unchanged — same reasoning as
the Query pass above.

**Known scope boundaries, not gaps:** the other three Navigation/
Context items (Back/forward history + breadcrumbs, exact-text
anchors, the larger Tabs/split/multi-pane workspace) are still open
— see TINTA-MASTER-TRUTH.md's "Navigation/workspace layer" §2 entry
for the updated, narrower remaining list. The drawer-based peek for
*chapters*, *snippets*, *annotations*, *systems (system-level, not
node-level)*, and *maps (map-level, not marker-level)* is
deliberately not in this pass — those either have a natural "this is
the content" surface (chapters, snippets) or are at a coarser level
than the new drawers operate at (system / map). A future pass can add
drawers for any of them through the same dispatcher with no new
architecture — one new `open*` function + one new case + one new
payload contract.

## .tinta package pass — shipped

First of the foundational priorities (per the recent Tinta review):
portable `.tinta` package format + auto-backup-to-folder. Closes the
"writer's years of work lives in one browser" gap — the writer can
now save a single self-contained file for the active novel, move it
to another machine, email it, or have Tinta auto-write it to a folder
on every save.

**Bundle format:** `.tinta` extension, auto-picked shape at export time.
JSON-only when the project has zero images (a single JSON file with a
`manifest` + `project` payload, easy to inspect and diff). ZIP when the
project has one or more images (uses the existing `zip.js` writer from
DOCX/EPUB — `manifest.json` + `project.json` + `images/<id>.<ext>`
entries, no base64 bloat). Detection on import is by magic bytes
(`PK\x03\x04` = ZIP, otherwise JSON). Both variants carry the same
logical payload.

**`TINTA_FORMAT_VERSION = 1`** — bumped only when the .tinta *format*
itself changes (manifest schema, entry layout). Distinct from
`Store.SCHEMA_VERSION` (which tracks the project db's own schema).
An imported .tinta with `tintaFormatVersion > current` is rejected
with a clear "update Tinta" message; one with an older version
imports fine (the migration runs on the project payload itself, see
below).

**Manifest** at the top of every file: `{ tintaFormatVersion, kind,
projectId, projectTitle, exportedAt, schemaVersion, imageCount }`.
The `kind: 'project'` field is a forward-compat discriminator — if a
future Tinta ever ships a `.tinta` for a "universe" or a "series" or
a "library", the import handler routes by `kind` and rejects anything
it doesn't recognize rather than guessing.

**Import flow:** detect JSON vs ZIP by magic bytes → parse manifest →
validate `kind === 'project'` and `tintaFormatVersion <= current` →
parse project → run `Store.migrate()` on a one-project wrapper db (so
an older .tinta picks up any new schema fields the import-side Tinta
knows about — same idempotent backfill `load()` runs on every
localStorage read, just with a different db shape) → assign a fresh
`projectId` (so re-imports don't collide with the original or each
other) → restore image blobs to ImageStore → register the project in
the active db → switch to it. Returns `{ projectId, projectTitle,
imageCount, restoredImages, failedImages, migrated }` so the UI can
show a real summary.

**Auto-backup-to-folder:** File System Access API (Chromium-only as of
2024 — Chrome, Edge, Brave, Arc; Firefox/Safari see a "your browser
doesn't support this" note in the Backup modal and fall back to manual
.tinta export). The writer picks a folder once via
`showDirectoryPicker({ mode: 'readwrite' })`; the folder handle is
persisted in IndexedDB (via the existing `AssetStore`, with a new
`BACKUP_FOLDER_HANDLE` key — `FileSystemDirectoryHandle` is
structured-clone-serializable as of Chromium 86+). On every successful
`Store.save()`, the new `onSaveSuccess` subscriber mechanism notifies
listeners; the auto-backup module debounces a `.tinta` write to the
folder (~800ms after the writer stops typing). The Backup modal shows
the current folder name, a "Pick folder" button, a "Save .tinta now"
button, and a "Stop auto-backup" button. Per-session re-permission on
first write is the browser's, not Tinta's — silently no-op'd if
denied.

**`html\`...\`` tagged-template helper** (debt #4 partial fix, landed
in the same pass to kill the highest-risk XSS surface the .tinta
import path opens): new `js/dom-utils.js` zero-dependency module with
the `html` tagged template (auto-escapes every `${...}` interpolation;
`SafeHtml` sentinel class distinguishes "already-escaped HTML" from
"user text that needs escaping"; `raw()` explicit opt-out for
pre-trusted markup; `toBridge()` final unwrap at `innerHTML =`
assignment sites). `escapeHtml`/`escapeAttr`/`q` re-exported from
`app.js` for backward-compat with the ~12 modules that import them.
Migration scope this pass: drawer.js fully migrated (all 7 sites —
entity/reference/rule-node/map-marker/timeline-event/scene drawers),
plus app.js's highest-risk sites (search-result rendering, reference
list + detail, map-marker pins — ~15 sites total). The other ~123
innerHTML sites in app.js / modal files still use the hand-escaped
pattern; a future debt-fix pass can migrate them through the same
helper with no new architecture. The 5-replace escape (all five HTML
special chars: `&` `<` `>` `"` `'`) is a deliberate widening of the
old `escapeHtml`'s 3-replace — the helper can't reliably tell at
template-build time whether an interpolation will land in text or
attribute context, so it escapes all five everywhere. 77/77 tests
passing (`dom-utils.smoketest.mjs`).

Verification: new `tinta-package.smoketest.mjs` (55/55 — covers export
JSON variant + manifest schema, import round-trip from JSON, older
.tinta migration-on-import, newer format version rejection, wrong
kind rejection, ZIP variant with images including byte-identical
round-trip, duplicate-import no-collision, safeFilename sanitization),
new `dom-utils.smoketest.mjs` (77/77 — covers basic interpolation
escaping, SafeHtml composition, null/undefined/boolean handling,
`raw()` opt-out, `toBridge()` defensive behavior, backward-compat
re-exports, mixed SafeHtml + plain interpolation, XSS regression
suite with 10 common attack patterns, performance with 1000-element
templates). Full existing suite re-run: 24 smoketest files, 1032/1032,
0 regressions. `node --check` clean on every file under `js/` (35
files). The existing 148 innerHTML-site count is now ~25 migrated +
123 still on the old pattern; the migration didn't regress any
existing test (the smoketests assert on Store behavior, not on
template-building internals, so a SafeHtml return type where a plain
string used to be is invisible to them).

**Known scope boundaries, not gaps:** (1) the .tinta format itself
doesn't have an integrity-checker (a "is this .tinta well-formed?"
validator that runs before import) — the import path catches
malformed files via try/catch + error messages, but a future pass
could add an explicit pre-import validation step. (2) The
auto-backup writes a snapshot on every save, not a live sync —
multiple writes in quick succession are debounced, but if the writer
wants the .tinta refreshed *right now* they use the "Save .tinta now"
button. (3) The `html\`\`` migration is partial — the highest-risk
~25 sites are done, the other ~123 remain on the hand-escaped
pattern and a future debt-fix pass can finish them. (4) The auto-backup
is Chromium-only by browser support, not by design — when Firefox/Safari
ship the File System Access API, the same code path will Just Work.

## Resume dashboard pass — shipped

Second of the foundational priorities (per the recent Tinta review):
the "where was I" / "come back tomorrow" surface. Closes the gap that
Project Health explicitly doesn't cover — Health is a *report* (orphan
entities, dangling mentions, unresolved questions, etc.); Resume is
the *entry surface* the writer hits when they're back at their desk
after a break.

**Surface:** a new "Resume" tab in the Tools nav group. Sits at the
front of Tools so the writer can hit it as soon as they're back, then
drill into Annotations / Questions / Decisions / Health / Write from
the five cards. One new branch in `render()`'s 19-branch view cascade
(the +1 view I flagged in the .tinta pass scoping — small enough to
accept; the render() refactor will absorb it later).

**Five signals, all from a single `Store.getResumeSummary()` call:**

1. **Last chapter + cursor** — the chapter with the most-recent
   `lastOpenedAt` and its `lastCursorPos` / `lastScrollTop`. One-click
   "continue writing →" jumps back into the Write view with the editor
   focused, cursor restored, scroll position restored. Falls back to
   most-recently-updated chapter when no chapter has `lastOpenedAt`
   (fresh-install or migrated-project case).

2. **Open annotations** — every unresolved annotation, joined with
   chapter + scene titles. Sorted by `updatedAt` desc. Capped at 5
   with an "N more — see all in Annotations →" overflow line. Click-
   through to the Annotations tab.

3. **Open story questions** — every unresolved story question, with
   a "no payoff scene yet" / "payoff scene linked" hint. Same cap +
   overflow pattern. Click-through to the Questions tab.

4. **Recent decisions** — author decision log entries from the last 7
   days, anchored on `project.lastOpenedAt` (or `now()` for the fresh-
   install case). Capped at 10. Click-through to the Decisions tab.

5. **Project health** — pass-through from the existing `getProjectHealthReport`.
   One-line summary ("N issues to look at — see Health →") + click-through.
   The Health view keeps the full drill-down; Resume just shows the
   totals so the writer knows whether to drill in.

**New fields, both migrate-backfilled:**
- `project.lastOpenedAt` — stamped on `pagehide` / `beforeunload` (so
  the timestamp reflects the *previous* session's end, not this boot)
  by the new `Store.markProjectOpened()` helper, called from `app.js
  init()`. Switching projects also stamps via `switchProject()`.
- `chapter.lastOpenedAt` — stamped by the existing `recordChapterOpened`
  hook (which already fires from `renderWriteView`'s chapter-switch
  detection on the same `chapterActuallyChanged` gate the chapter-
  switch animation uses). No new call site needed.

**Render construction:** built with `html\`\`` helper from `dom-utils.js`
per the partial migration in the .tinta package pass — every user-
controlled interpolation (chapter titles, annotation notes, decision
text) routes through the helper's auto-escape. Delegated click handler
at the panel level dispatches by `data-resume-action` (open-chapter /
open-annotation / open-question / open-decision / open-health) rather
than one listener per row — the row count can be 20+ on a busy project
and the writer might re-render frequently (every save).

**CSS:** new classes appended to `dashboards.css` (where Stats/Health/
Checklist already live). Warm-paper aesthetic: white-on-cream cards,
bronze accents, generous spacing, large type on the hero "where you
left off" card. All reuse existing CSS custom-property theme tokens
so Paper/Void/Sepia all work.

**Plus:** new `module-load.smoketest.mjs` — the test that would have
caught the s28 import bugs. Loads every browser-loadable module via a
Node-with-DOM-shim harness, verifies the expected exports exist. 120
export-verifications across 35 modules. Not a full Playwright harness
(that's still debt #5, scheduled for the Real revision pre-pass), but
catches the specific class of bug the s28 pass shipped — "module X
imports Y from app.js but app.js only re-exported Z".

Verification: new `resume.smoketest.mjs` (45/45 — covers summary shape,
last-chapter derivation with fallback, open-annotation filtering with
scene join, open-story-question filtering, recent-decisions date filter
anchored on lastOpenedAt, fresh-install anchor, health-warning pass-
through shape, lastOpenedAt pass-through, markProjectOpened stamps the
active project, recordChapterOpened stamps chapter lastOpenedAt, pure-
read no-mutation), new `module-load.smoketest.mjs` (35/35 modules, 120
exports). Full existing suite re-run: 26 smoketest files, 1254/1254, 0
regressions. `node --check` clean on every file under `js/` (37 files
now, was 35 in s28).

**Known scope boundaries, not gaps:** (1) The "continue writing" CTA
restores cursor + scroll on the editor, but doesn't yet restore
mention-popup state or focus-mode tier — those are session-state, not
chapter-state, and the existing Write view's session-memory also
doesn't restore them. (2) Click-through to Annotations/Questions/
Decisions just switches the view — it doesn't yet scroll+highlight the
specific row. The existing views don't have per-row anchors yet; a
future pass can add `data-annotation-id` / `data-question-id` /
`data-decision-id` to the existing rows and Resume can scroll+flash
the matching one (same pattern search results use). (3) The
"recommended-next-action" surface is explicitly not built — Resume
shows *what is*, not *what you should do next*. (4) Streak /
today's-word-count aren't on Resume (they're on Stats); the writer
picked recent-activity-only over a "today" line, and Stats already
covers that surface.

## Debt-fix pass, part 2 — Playwright specs verified + a real boot bug found and fixed

Continuation of the debt-fix pass: schema versioning (SCHEMA_VERSION now
2, `VERSIONED_MIGRATIONS` as the real extension point, legacy ladder
kept unconditional) and the 3 Playwright smoke specs both landed in the
prior session. This session's job was verification — confirm the schema
fix holds up, and get real signal on the specs the prior session
couldn't execute.

**Schema versioning — reviewed directly, confirmed sound.** Read
`migrate()` and `schema-versioning.smoketest.mjs` (10/10) line by line
rather than trusting the prior session's own account of it. The fix
correctly threads the needle it set out to: the legacy field-backfill
ladder still runs unconditionally (gating it broke the established test
convention across this whole suite of simulating old data by deleting
fields from a current-version export without rolling back `db.version`),
while `VERSIONED_MIGRATIONS` + `Math.max(version, SCHEMA_VERSION)` gives
future schema changes an actual gate that didn't exist before.

**Playwright — still can't execute here.** Tried again: `npm install
@playwright/test` works fine (npmjs.org is reachable), but
`npx playwright install chromium` fails — `cdn.playwright.dev` isn't on
this sandbox's allowed domain list. Checked for a system/apt fallback
too (`chromium-browser` on Ubuntu Noble is a snap-wrapper stub with no
snap-store access here) — not viable either. This is a sandbox
limitation, confirmed twice now across two separate sessions; running
`npx playwright test` on a real machine is the actual next step.

**Did the next best thing: a full manual selector audit.** Went through
all three specs line by line against the real `index.html`, `nav.js`,
and `app.js` — every id, class, and data-attribute they touch — rather
than re-trusting the prior session's "checked for correct selectors"
claim without re-verifying it. Confirmed correct: `#new-chapter-btn`,
`#chapter-list`, `#nav-tabs-groups`, `.sb-chapter`, `#chapter-editor`,
`#word-count` (and its "N words" format), the `input` → debounced
`Store.updateChapterContent` chain, the default 600ms autosave delay,
and — the one place a whole spec's premise needed checking — spec 3's
`VIEW_GROUPS` mapping against `nav.js`'s actual `NAV_GROUPS` (exact
match, "resume"/"decisions" both correctly placed in Tools).

**Found a real bug this way, not a test-writing mistake.** Spec 2
assumes `activeChapterId` survives a real reload. It didn't — `app.js`'s
boot sequence always took the first chapter by `order`, full stop,
ignoring which chapter (if any) was actually last active. The correct
lookup already existed — `getResumeSummary()` (Resume dashboard pass)
had it inline for the "last chapter + cursor" card — boot just never
called it. Extracted that lookup into `Store.getLastActiveChapter()`,
shared by both callers now, so they can't drift apart again. Fixed the
app rather than weakening the spec: the spec's assumption was the
correct one to have, the app just didn't live up to it yet.

Verification: `resume.smoketest.mjs` extended 45→47 (direct test of the
extracted helper, not just through `getResumeSummary`'s wrapping of it).
Full suite re-run clean after the fix — every `*.smoketest.mjs` file
still green, `module-load.smoketest.mjs` still 35/35, `node --check`
clean, `sw.js` precache list re-diffed against the real `js/` directory
(no drift this time).

**New this pass:** a minimal `package.json` (root) — dev-tooling only,
declares `@playwright/test` as the sole devDependency, `npm test` runs
Playwright, `npm run smoketest` runs every `js/*.smoketest.mjs` file in
one command. Nothing under it is loaded by `index.html`; the shipped app
is still zero-dependency, no-build-step, unchanged.

Not done: the specs themselves have still never actually executed in a
browser. The manual audit is real signal (it found a real bug), but it
is not the same as green CI output — treat these three specs as
"believed correct, unverified" until someone runs `npm install && npx
playwright install chromium && npx playwright test` somewhere that can
reach `cdn.playwright.dev`.

## Debt-fix pass, part 3 — regression re-verification found a second real bug

Picked back up after a merge (base zip + a loose `store.js` diff — `app.js`
and `nav.js` loose uploads were byte-identical to the zip, so nothing to
reconcile there). Job was straightforward re-verification before moving
on to anything new — full suite re-run rather than trusting part 2's own
"clean" claim without checking again.

**Found a real regression this way, not a flaky test.** `resume.smoketest.mjs`
was 46/47, not the 47/47 part 2 reported. The failure: `getLastActiveChapter`
(part 2's own extracted helper) picked the *wrong* chapter when two
chapters were opened within the same millisecond — plausible in fast
real use (rapid chapter-switching), and exactly what a tight test loop
does every time. Root cause: `recordChapterOpened` stamps `lastOpenedAt`
with millisecond-precision `Date.now()`; on a tie, `Array.sort`'s
stability keeps whichever chapter sits earlier in `project.chapters`,
not whichever was actually opened last.

**Fixed by reusing data that can't tie, not by adding new schema.**
`recordChapterOpened` already updates `project.recentChapterIds`
(unshift-ordered, exact call order) in the same call that stamps
`lastOpenedAt` — so `getLastActiveChapter` now checks
`recentChapterIds[0]` first and only falls back to the timestamp sort if
that's empty (an old save from before Recents existed, or the referenced
chapter's gone). No schema change, no precision change to `now()`
elsewhere in the app — fixed exactly where the tie caused an observable
bug, not everywhere timestamps are used for ordering.

Verification: `resume.smoketest.mjs` back to 47/47 with the actual bug
fixed rather than the test loosened. Full suite re-run clean: 27
smoke-test files, 1244 checks (up from 1243 — the fix, no other
additions), `module-load.smoketest.mjs` still 35/35, `node --check`
clean, `package.json` validated as parseable JSON and its `smoketest`
script pattern tested directly rather than assumed correct.

## Real Revision Foundation

Picked up mid-implementation from a prior session's status report (store-side
functions built and wired, entity History UI just inserted, no tests written,
nothing re-verified since the last edit). Full regression re-run before
touching anything, per the standing "don't trust a prior clean report" rule
below: 27 smoke-test files, 1244/1244, `module-load.smoketest.mjs` 35/35,
every `.js` file `node --check`-clean. All green — the prior session's
in-progress work hadn't broken anything on its way to this checkpoint.

**What was already done, verified working:** `chapter.snapshots` gained a
structured `auto: true/false` flag (previously only inferable from a label
string a manual snapshot could accidentally collide with); `capAutoSnapshots()`
evicts oldest-first past a cap of 10, touching only auto snapshots, shared
by chapters and entities; entities gained their own full parallel snapshot
mechanism (`createEntitySnapshot`/`getEntitySnapshots`/`restoreEntitySnapshot`/
`deleteEntitySnapshot`) plus an auto-checkpoint trigger inside `updateEntity`,
closing the gap where only full deletion (Session 24's `backupBeforeDelete`)
protected against a bad edit; `createSeriesEntity` picked up the same
`canonStatus`/`generation`/`snapshots`/`lastAutoCheckpointAt` fields
`createEntity` already had; a History modal for entities shipped alongside
chapters' existing one, deliberately without a diff pane (restore-and-look,
not a field-by-field JSON diff — same scope note as `restoreDeletedItem`).

**What this pass added: the missing tests, plus two more real bugs they
caught.** `revision-foundation.smoketest.mjs` (61 assertions) covers all of
the above end to end. Writing it surfaced:

1. **`makeProject()`'s seed chapter was missing `lastAutoCheckpointAt`/
   `lastReadSpread` entirely.** `createChapter()` already initializes both,
   with a comment explicitly warning that skipping this makes a
   mid-session chapter's `lastAutoCheckpointAt` read as `undefined` →
   epoch → an immediate spurious auto-checkpoint on its first real write
   instead of waiting out the interval. The seed chapter — the *one*
   chapter object in the codebase that bypasses `createChapter()` — never
   got the same fix. Invisible in nearly every other smoke test (each
   runs in its own fresh process, so `migrate()`'s once-per-process
   backfill usually papers over it for whichever project happens to load
   first) but real for any *second* project created in the same session
   without a reload — caught only because this new test's timing
   assertions needed a clean, correctly-initialized starting clock.
   Fixed by mirroring `createChapter()`'s two fields directly onto the
   seed chapter.
2. Confirmed (not a new bug, but worth stating plainly): the tie-break fix
   from the debt-fix pass above holds under a genuine forced same-millisecond
   collision, not just the 5ms-gap scenario the original regression test
   happened to use.

Verification: full suite re-run after the `makeProject` fix — 1305/1305
(1244 prior + 61 new), zero regressions, `node --check` clean on the
modified `store.js`.

**Left alone, flagged for later, not fixed now:** the seed chapter is
*also* missing several older fields `createChapter()` sets
(`docType`, `folderId`, `partId`, `favorite`, `pinned`, `archived`,
`trashedAt`) under the same "bypasses createChapter() entirely" gap —
pre-existing, unrelated to this pass, and out of scope the same way the
prior session correctly left `createSeriesEntity`'s own migration gap
alone. Worth a dedicated pass rather than a drive-by fix bundled into
this one.

## Per-scene Foreshadowing/Payoff surfacing

Picked as the next item off `TINTA-MASTER-TRUTH.md`'s "small/medium gaps"
list after Real Revision Foundation closed out. Genuinely the smallest of
the candidates considered (snippet categories/promotion, a `.tinta`
integrity checker, restore-preview diffing were the runners-up) — no new
schema needed at all, since `StoryQuestion.introducedSceneId`/
`payoffSceneId` have existed since the feature was first built. The gap
was purely that nothing below the project-wide Questions tab ever read
them.

Added to the Scene Inspector drawer (`drawer.js`): a "Story questions"
section with two scoped sub-lists — "Sets up" (questions this scene
introduces) and "Pays off" (questions this scene resolves) — each row
unlinkable without deleting the underlying question. Below "Sets up," a
quick-add for a brand-new question introduced right there (the common
case while writing forward). Below "Pays off," a picker over every
existing question for marking the current scene as where an earlier
thread gets resolved (the common case once you reach that scene) —
deliberately not filtered to unresolved-only, since marking the payoff
scene and marking the question resolved are often the same moment, not
a reason to hide it from the list first.

Two new store functions back it: `getStoryQuestionsForScene(sceneId)`
(a scoped read, same shape as the existing `getAnnotationsForScene`) and
`setStoryQuestionScene(id, role, sceneId)` (link/unlink either role;
`sceneId: null` clears it; an unrecognized role is a no-op rather than
writing a stray field). Relinking an already-linked role moves it rather
than accumulating a second link — the schema was always single-valued
here, so this doesn't change that.

No Corkboard-card badge added this pass — the Corkboard scene card has
no badge system at all yet (annotations don't show one there either), so
adding one just for this would be a new UI convention invented on the
side rather than extending an existing one. Worth its own small pass
later if a badge system gets added to Corkboard cards generally.

Verification: `scene-story-questions.smoketest.mjs`, 26 assertions —
empty case, correct introduced/payoff splitting across multiple scenes,
link/unlink/relink for both roles independently, invalid-role no-op,
nonexistent-scene-id safety, and an export/import round-trip sanity
check (no schema changed, so this is confirmation, not a migration
test). Full suite re-run clean: 1331/1331 across 29 smoke-test files,
`node --check` clean on every modified file.

## Quotes — v0.2's first shipped piece

First thing to ship under v0.2 ("UNIFY THE MONSTER") — deliberately not
part of the unification/refactor work itself, which is scoped separately
(see below) and hasn't started. Manual-only, by design: a ❝ button in the
Write view's formatting toolbar saves the current editor selection as a
quote (`project.quotes{}`, `{id, text, chapterId, sceneId, createdAt}`),
listed and deletable from a new Quotes tab in the Organize modal.
Deliberately does not attempt scene-level attribution beyond what's
asked for a click — this codebase has no text-offset mapping from a
scene onto its chapter's raw content, so a selection can only honestly
be attributed to the chapter, not a specific scene within it (`sceneId`
stays null unless set some other way). Auto-detection of "quotable"
lines and any welcome-screen surfacing are explicitly separate, later
features, not started.

Schema: `SCHEMA_VERSION` 3→4, `migrate_v3_to_v4` (backfills an empty
`quotes{}` on projects that predate the field — genuinely nothing fancier
than that, unlike Provenance's per-record backfill, but still routed
through `VERSIONED_MIGRATIONS` rather than the frozen legacy ladder, per
that pass's own rule that the ladder doesn't get new entries regardless
of how simple the change is). `deleteChapter` cascades quotes the same
"no meaningful orphaned state, delete outright" way it already treats
annotations/bookmarks (a quote requires a chapterId, same as those).
`deleteScene` falls back to chapter-level (clears `sceneId`, keeps the
quote) — same "the chapter still exists" treatment references/
annotations/bookmarks already get there.

New `quotes.smoketest.mjs`, 25/25 — including the create/read/delete
path, both delete-cascade shapes, and the migration backfill (verified
by breaking `migrate_v3_to_v4` and confirming the test actually catches
it, then restoring). Caught one test-authoring bug of its own along the
way: the first draft of the sort-order check created two quotes back to
back and asserted on which one sorted first, but `now()` is millisecond-
precision and two synchronous creates can land in the same millisecond —
a stable sort on a tie preserves insertion order, which isn't the
"recency" order the test was trying to assert. Fixed the same way
`resume.smoketest.mjs`/`session24.smoketest.mjs` already do it elsewhere
in this suite: force distinct `createdAt` values directly rather than
trusting wall-clock timing.

Also fixed two of `provenance.smoketest.mjs`'s hardcoded `version, 3`
assertions (now 4, since `SCHEMA_VERSION` moved) and `schema-
versioning.smoketest.mjs`'s five — same maintenance step §45's own pass
already did for `version, 2`→`3`.

**Verification:** 36 smoketest files, 0 regressions. `node --check`
clean, runtime import check clean on `app.js`, HTML tag counts (`div`/
`button`/`span`) re-verified balanced. No `sw.js` change needed — no new
browser-loaded file, only new functions inside existing modules.

**Scoped, not started: the v0.2 unification pass itself.** A shared
modal shell (mirroring `openDrawerShell()`, which already proves the
pattern works — it owns teardown, an objectURL registry, and outside-
click with the capture-paired-listener fix already applied here) is the
first candidate, since it structurally retires the exact
`closeModal()`-as-state-reset bug class that's bitten this project
several times over. Explicitly declined for v0.2: a generic Command Bus/
Event Bus, a Schema Registry, or merging entity-relationships and scene-
relationships into one polymorphic table — each solves a problem this
app doesn't currently have, at real risk to code that's fully tested and
working today.

## About section — creator credit + version

Small, standalone addition: a new "About" section in the Settings modal
(same jump-linked pattern as Appearance/Backup/Shortcuts), showing the
version tied to the v0.1/v0.2/v0.3 phase framework (`TINTA_VERSION`/
`TINTA_PHASE`, both plain manually-bumped constants — this app has no
build step or CI, so there's no natural source for an auto-incrementing
build number), a creator credit, and a short blurb. No new dependencies,
no schema change, nothing to migrate.

## Sequencing notes (historical)

Dependency calls worth flagging explicitly, kept for context even though
everything below is already shipped:
- **17 is the fork point (shipped).** Everything about rich text, images,
  and Book mode hangs off the markup syntax `format.js` decided.
- **13 before 18 (both shipped).** `localStorage` corruption/quota
  handling was solid before IndexedDB (a second local storage layer, for
  images) entered the picture.
- **17/18 before 19 (all shipped).** Book mode needed both the markup
  syntax and image resolution to already exist before it had anything
  real to render.
- **Full backup image gap — shipped in 19.5.** Explicitly *not* picked up
  during Session 19 — asked and left as a deliberate decision rather than
  defaulted into just because it's image-adjacent. Landed as its own pass
  right after, per that decision.
- **20 shipped independent of 19/19.5, as planned.** No dependency either
  direction — Stats (Session 10) already exposed everything Sprints
  needed (`getTotalWordCount()`), so this didn't even touch `store.js`.
- **22 shipped independent of everything above.** Import is a pure
  inverse of Session 6's export; arc is a new field with no relationship
  to rich text, images, or backup. Touched only `store.js`, `app.js`,
  `style.css`, and `index.html` — no new module file, unlike most prior
  sessions.

## Notes for whoever picks the next item

- Don't assume the next number matches the original plan's content — check
  this table, not the old doc, for what's actually done.
- If a "next item" turns out to have two genuinely separate halves once
  you're actually scoping it (like Session 4 and Session 9 did), it's fine
  to split it into two sessions rather than force a bad joint session —
  that's exactly what happened twice already and both splits were the
  right call in hindsight.
- Re-run the full suite yourself before building on a prior session's
  "all green" claim, even when nothing you're about to touch looks
  related. Debt-fix part 3 found a real regression in part 2's own
  extracted helper this way — a timestamp tie-breaking bug that a
  same-session run wouldn't reliably surface (it depends on two calls
  landing in the same millisecond), but a second independent run did.
  Trusting a "clean" report instead of re-running it would have shipped
  a "reload sometimes restores the wrong chapter" bug.

## Doc-cleanup follow-up pass — items 1 & 2 of the 5-item review — shipped

Picked up from a handoff transcript reviewing 5 flagged gaps (snippet
categories/promotion, .tinta integrity checker, restore-preview
consistency, app.js refactor scoping, doc housekeeping). Verified the
handoff's own numbers first (independently re-ran the full suite: 1366
checks at that point, matching the transcript exactly) before building
anything, per this project's standing "verify, don't trust" rule.

**Item 1 — Snippet categories + promotion.** `SNIPPET_CATEGORIES`
(idea/dialogue/research/todo), `createSnippet(text, category)` validates
against it, `updateSnippetCategory`, migration backfill. Promotion was
the bigger find: `promoteSnippetToEntity/Scene/TimelineEvent` already
existed in `store.js` but were never wired to any UI — built the actual
"⇢ Promote" popover (reusing `.wt-popover`/`.wt-menu-item`), added the two
genuinely-missing targets (`promoteSnippetToDecision`,
`promoteSnippetToAnnotation`). Found and fixed a real bug along the way:
bare `ANNOTATION_TYPES`/`SNIPPET_CATEGORIES` references instead of
`Store.ANNOTATION_TYPES` — would have thrown at runtime. 36/36 tests,
`snippet-promotion.smoketest.mjs`.

**Item 2 — `.tinta` package integrity checker.** `checkTintaFile(file)`
already existed in `tintaPackage.js` from the handoff session but had
zero test coverage and zero UI wiring — a real function nobody could
reach. Wrote 17 new smoketest checks covering every error/warning code
(corrupt zip, missing/malformed manifest or project, wrong kind, format
too new, image-count mismatch, and a from-scratch purity check confirming
it never touches `Store` or `ImageStore`). Testing caught a real bug in
the checker itself: `typeof [] === 'object'` in JS let a top-level JSON
array slip past the "malformed root" check — added an explicit
`Array.isArray` guard. Wired into `backup.js`'s import flow: the check
now always runs first and always renders a report before import — files
with errors can't be imported, files with only warnings still need an
explicit "Import" click, closing the same "preview shouldn't be
optional" gap flagged for chapter-restore (item 3, not yet acted on).
`tinta-package.smoketest.mjs` file total: 103/103.

**Verification:** full suite re-run after both items — 30 smoketest
files, 1,415 checks + module-load's 120-export verification, 0 failures.

**Not done from the same review, on purpose:** item 3 (restore-preview
consistency — the chapter-side bypass around the diff pane) is a design
decision (keep the fast path or force the diff every time?) not a
mechanical fix, left for a decision before coding. Item 4 (`app.js`
refactor) still needs the state-ownership pass already on record. Item 5
(doc housekeeping) turned out to be a non-issue on inspection — flagging
here so it isn't re-opened.

## Restore-preview consistency (item 3 of the 5-item review) — shipped

Precedent taken from the `.tinta` checker: always show a preview, never
let it be optional. Applied to both sides:

- **Chapters:** the bare `.snapshot-restore-btn` on the list row (which
  skipped straight past the diff pane) is removed. List rows now offer
  only Compare + Delete; Restore lives inside the diff pane, same as it
  always did there — there's just no faster path around it anymore.
- **Entities:** previously a bare `confirm()` with zero comparison —
  the worse of the two inconsistencies. Added `Store.getEntitySnapshotChanges()`,
  a **shallow top-level field comparison** (name/description first, then
  alphabetical; object/array fields report a count summary rather than
  their contents) and a new Compare pane in the Entity History modal,
  visually matching the chapter diff pane. Deliberately not a deep
  structural diff — the original code comment scoping that out as "a
  bigger problem than this pass is scoped to solve" was correct and is
  still respected; the shallow version is enough to know *whether* and
  *where* something changed without solving JSON-tree diffing.

12 new tests (`revision-foundation.smoketest.mjs`, section 10, now 73/73
for that file) covering: zero-changes-vs-self, scalar and array field
detection, internal-key exclusion (id/createdAt/snapshots never
reported), name/description sort priority, long-value truncation, and
not-found safety on both entity and snapshot ids.

**Full suite after this change: 30 files, 1,427 checks, 0 failures.**

## app.js refactor (item 4) — first two view extractions, proof of the pattern

Went into this expecting to need a big state-ownership rewrite (that's
how it was flagged for several passes running). Audited all 19 view-
render functions against the 47 module-level `let` vars app.js owns
first, before designing anything — turned out 4 views touch zero shared
state and several more touch just 1-2 vars. That completely changed the
plan: no state.js migration needed yet, just a per-view recipe applied
cheapest-first.

**`renderDecisionsView` → `decisionsView.js`.** Zero shared state, zero
private helpers — the cleanest possible first case, done to prove the
mechanics (imports, the one-line dispatcher in app.js, module-load
coverage) before anything harder.

**`renderCorkboardView` → `corkboardView.js`** (with its three exclusive
helpers: `wireCorkboardDropZone`, `getDragAfterElement`,
`renderSceneCard`). Two real decisions here, both made and documented in
code rather than glossed over:
- `groupChaptersByPart` was shared with Outline (staying in app.js for
  now) — moved to `store.js` as pure data-shaping, since it only touches
  `getParts()` and has no DOM in it. Both views now call
  `Store.groupChaptersByPart(...)`. 11 new tests added to
  `containers.smoketest.mjs` (group ordering, unassigned bucket, orphaned
  `partId` treated as unassigned not dropped, empty-input safety) — this
  export had zero coverage before.
- Corkboard needs read-only access to `els.arcFilterSelect` (the cached
  sidebar dropdown). Exported `els` from app.js. This creates a circular
  import (app.js ↔ corkboardView.js) — confirmed safe via
  `module-load.smoketest.mjs` since neither module touches the binding
  at top-level evaluation, only inside function bodies that run later.
  Flagged explicitly in a code comment as a real trade-off (works because
  `els` is read-only here and app.js is the sole writer), not a pattern
  to lean on for a view that needs to *write* app.js state — that case
  still wants a real exported setter, same idiom as
  `setActiveView`/`setActiveChapterId`.

**Verification:** full suite after both extractions — 30 files, 1,438
checks, 0 failures, 35/35 modules loaded.

**Next in the extraction order** (from the same state audit, cheapest
remaining first): Stats and Questions (also zero shared state), then the
single-state-var views — Sketch, Systems, Snippets, Map, References,
Outline. Multi-state-var views (Canvas, Search, Health, Timeline,
Annotations, Resume, Checklist, Write) come last and are where a real
shared-state module might actually become worth building — deferred
until there's more than one view that would use it.

## Reconciliation pass — cross-session merge + the audit's two deferred quick-wins + a live sw.js drift bug

A separate parallel session had progressed further on the save()-redesign
data-safety audit than the zip baseline handed off here reflected —
reconciled by diffing the newer loose `store.js`/`app.js` against the
zip, then merging. One real gap surfaced by that merge, not by the audit
itself: the merged `app.js` imports `openAnnotationDrawer` from
`drawer.js`, but `drawer.js` never actually had it — added it now (single-
entity peek: type/note/resolved-toggle/linked-chapter-and-scene, jump
link to the Annotations dashboard reusing its existing `.annotation-row
[data-anno]` per-row anchor for flash-and-scroll), and wired it into
`openContextDrawer`'s dispatch as the `'annotation'` kind — this is the
half of the "annotation isn't a dispatch kind yet" gap (from the
Universal-contextual-inspector §1 entry) that was still open; relationship
still isn't a peek target and remains out of scope.

Re-verified the audit's own findings against source rather than trusting
the transcript, per this project's standing rule — and two items the
transcript's priority order called "cheap, separable, fix immediately"
turned out to still be open, not done:

- **`backup.js`'s unescaped import-error report** — `check.errors`
  messages (which can carry an attacker-controlled `.tinta` manifest
  `kind` string all the way through, per the original audit) were
  rendered via `raw()` with no escaping. Fixed: `escapeHtml` added to
  `backup.js`'s import list from `app.js` (already re-exported from
  `dom-utils.js`), wrapped around each `err.message`.
- **The chapter-number label's doc-type name** — `chapterDocType.label`
  went into `innerHTML` unescaped two lines below the *correctly* escaped
  version of the exact same field (the doctype `<select>`'s options).
  Both branches of the ternary building `chapterNumberLabel` now wrap the
  label in `escapeHtml`. Brings the "~123 innerHTML sites still on the
  old hand-escaped pattern" count from the `dom-utils.js` pass's own
  entry down by these two (still not migrated to the `html` tagged
  template — just now correctly escaped by hand like the sites already
  using that pattern correctly).

Also found a **live instance** of the precache-drift bug the audit
flagged as a three-time-repeat process failure, not hypothetical:
`corkboardView.js` and `decisionsView.js` (real modules — confirmed
imported in `app.js`, from the same session's app.js-modularization
work) were missing from `sw.js`'s `SHELL_FILES`, meaning the offline
cache was silently missing two live modules right now. Fixed the list,
and — since "add the two missing files" was explicitly called out as
necessary but insufficient last time — built the actual regression test:
new `sw-precache.smoketest.mjs` reads `sw.js`'s real `SHELL_FILES` array
via a text scan (no second hand-maintained list of its own — that would
just be a new copy of the same drift risk) and diffs it against the real
`js/`/`css/` directory listings, both directions. Verified it actually
catches the bug by reverting the `SHELL_FILES` fix, confirming the test
fails with exactly the two missing files named, then restoring the fix.

**Docs rot, closed:** `TINTA-MASTER-TRUTH.md`'s top "Verification basis"
line still read "26 smoketest files... 1254/1254" — stale since at least
the Containers pass (which already logged 30 files/1,415+120 checks
further down the same document, with several more passes' worth of
files added after that and never reflected at the top). This is the
literal contradiction the original audit named. Updated to the current
true count and reworded to point at `ROADMAP.md`'s running log rather
than repeating a number here that will just go stale again next pass.

**Verification:** full suite re-run after every fix above — **31
smoketest files, 1,652 checks, 0 failures** (`module-load.smoketest.mjs`
still 35/35 modules / 120 exports within that total). `node --check` +
a runtime import check on every touched file (`app.js`, `backup.js`,
`drawer.js`, `sw-precache.smoketest.mjs` itself).

**Still open, deliberately not touched this pass:** the batch of lower-
stakes bugs from the original audit (listener leak, closeModal/render
entanglement, trashed-chapter visibility, search caret, palette teardown
skip) — flagged as a second, lower-stakes pass in the audit's own
priority order, and genuinely not investigated yet. Real Revision
(undo/rollback) and Provenance remain confirmed zero, per §4's next-task
pointer.

## Lower-stakes bug batch — continued

Picked back up from the reconciliation pass above. Three loose files
(`app.js`/`drawer.js`/`store.js`) had already closed out the snippet-menu
listener leak, drawer.js's own outside-click stacking, and trashed-
chapter visibility across the stats functions — merged those in and
verified against source (31/31 smoketest files, 0 failures) rather than
trusting the summary alone, per this project's own standing rule.

**Search caret — fixed.** `renderSearchView`'s focus-restore always
snapped the caret to end-of-string on every keystroke (a leftover from
the Query pass), which only feels right when typing at the end — editing
mid-query (fixing a typo inside an already-typed `type:` filter, say)
got the caret yanked to the end on the very next character. New
`searchQueryCaretPos`, set by the `input` handler (which still has the
real `selectionStart` before the re-render tears down the old element)
and consumed once by the restore step; anything else that triggers a
re-render here (case/regex toggle, a category chip) leaves it `null` and
keeps the original end-of-string behavior, since those aren't a typing
interaction.

**A third listener-leak occurrence, found and fixed.** `wireLibraryGrid()`
added a document-level outside-click listener with no remove-before-add
guard — same bug class as the snippet-menu and drawer.js leaks above, but
in a third place. `openLibrary()` is explicitly designed to be re-called
"in place" on every filter toggle, tag toggle, and favorite/series/cover
change (a dozen-plus call sites), and each re-call re-ran
`wireLibraryGrid()`. Browsing the Library shelf and toggling a genre
filter a few times stacked one more listener per toggle for the rest of
that session. `closeModal()` cleans this up on actually closing the
modal, but every refresh in between leaked one. Fixed the same way as
the other two: remove before add, safe on the first call.

**closeModal/render entanglement — investigated, no live bug found.**
`render()` does unconditionally call `closeModal()` at its very top on
every invocation — a real, if implicit, coupling. Traced every reachable
path: `.modal-backdrop` is a full-viewport `position:fixed` overlay
(confirmed in `modals.css`), so no click can reach the sidebar or trigger
an unrelated `render()` while a modal is open; the only document-level
keydown handler that fires regardless (Escape/Ctrl+K) already wants
`closeModal()` explicitly; no timer (autosave, sprint tick, autoBackup)
calls the global `render()` — each updates its own local DOM directly.
Every `closeModal()`/`render()` call site already orders them correctly,
and at least one (the Image Library's cover-select handler) has an
explicit comment already documenting exactly this landmine and working
around it. Conclusion: real architectural fragility, zero currently-
reachable trigger. Left the behavior itself unchanged rather than risk a
broad, hard-to-fully-verify change to every `render()` call site for a
bug that isn't actually live — flagging it here so a future change (a
new keyboard shortcut, a new timer) doesn't reintroduce it unknowingly.

**Palette teardown skip — investigated, no live bug found.** Audited
`openCommandPalette()` in full: every listener it registers
(input/keydown/backdrop-click) is scoped to elements inside `#modal-root`,
torn down for free when `closeModal()` (or a fresh `openCommandPalette()`
call) replaces `modal-root.innerHTML` — no document-level listener of its
own to leak, unlike the three fixed above. Could not find a concrete,
reproducible match for this name; not fixing something unverified.

**Verification:** 31/31 smoketest files, 0 failures, re-run after each
fix above. `node --check` clean on `app.js`; a runtime import check
(real localStorage/DOM stubs) on `app.js`.

**Still open:** Real Revision (undo/rollback) and Provenance remain
confirmed zero. "Closed modal/render entanglement" and "palette teardown
skip" are investigated-and-clear rather than fixed — worth a fresh look
only if a concrete repro ever surfaces.

## Real Revision — undo/rollback

Save-system hardening (cross-tab staleness, retry-on-failure, quota
headroom warning, dangling-`activeProjectId` repair) landed first, in a
separate save-system pass — two more real bugs found and fixed there: the
headroom banner was being written and wiped in the same synchronous tick
by `notifySaveSuccess()`'s own success handler (fixed with a
`retryBannerActive` flag scoped to only clear a banner it raised itself),
and a pending save retry could bypass the cross-tab stale guard through
two call paths that skipped `save()`'s own check (fixed with a guard
inside `writeToLocalStorage()` itself, plus cancelling any pending retry
the moment staleness is detected). `save-system.smoketest.mjs`, 16/16.

Then the undo/rollback engine itself: `recordMutation`/`undo`/`redo`/
`applyMutationEntry`/`clearUndoHistory` in store.js, wired into
`createChapter`/`updateChapterContent`/`trashChapter`/`restoreChapter`/
`createEntity`/`updateEntity`. Deliberately scoped: chapter + entity
create/edit/trash/restore only (scenes, rule systems, references,
relationships, snippets, timeline events, canvas/sketch objects, and any
reordering are out, flagged not forgotten) — and deliberately excludes
permanent/cascading deletes (`deleteChapter`/`deleteEntity`), which
already have their own purpose-built recovery path (the Organize modal's
Trash/Recently Deleted tabs) rather than a second, competing one. In-
memory only, cleared on project switch — undoing across a project switch
isn't how any mainstream editor behaves either. Series-shared entities
are explicitly excluded from recording (`applyMutationEntry` only knows
`project.entities`; recording a series entity's edit would silently
restore into the wrong place on undo).

**The gap that had actually been left mid-session:** the keydown handler
for Ctrl/Cmd+Z and Ctrl+Y was already wired in app.js, calling
`performUndo()`/`performRedo()` — but neither function existed anywhere.
Every store.js piece (the actual data engine) was built and correct; the
apply-and-give-feedback layer that the keyboard shortcut was supposed to
call was simply never written before the session that built it ran out
of budget. Pressing Ctrl+Z would have thrown `ReferenceError: performUndo
is not defined` in the console and done nothing. Added both: each calls
`Store.undo()`/`Store.redo()`, navigates to whatever changed (using the
`{ label, targetType, targetId, projectId }` descriptor those functions
already returned for exactly this purpose — skips navigation if the
target no longer exists, e.g. undoing a chapter's own creation), and
confirms via the existing generic corner-toast helper ("Undid: ...",
"Nothing to undo" when the stack is empty).

**Also previously untested:** none of store.js's undo engine had any
smoke-test coverage at all before this pass, despite already being wired
into six mutation functions. New `revision-undo.smoketest.mjs` (39
checks): create/undo/redo round-trips for both chapters and entities,
content-edit round-trips, trash/restore as ordinary field-flip undos, the
"new mutation clears the redo branch" linear-history rule, the
`MAX_UNDO_STACK` (100) eviction cap, `clearUndoHistory`, and — the one
that actually caught a real gap in the test itself — the series-entity
exclusion. First draft of that assertion compared `canUndo()` before/
after and passed even when I deliberately broke the guard, because a
non-empty stack staying non-empty doesn't prove nothing new was pushed.
Rewrote it to `clearUndoHistory()` first so the check is exact; verified
by re-breaking the guard and confirming the test actually fails, then
restoring and confirming it passes again — same "prove the regression
test bites" discipline as `sw-precache.smoketest.mjs` earlier.

**Verification:** `revision-undo.smoketest.mjs`, 39/39. Full suite: 33
smoketest files, 0 failures. `node --check` clean on `app.js`/`store.js`;
runtime import check (real localStorage/DOM stubs) on `app.js`.

**Not done in this pass, deliberately:** no visible UI affordance for
undo/redo beyond the keyboard shortcut (no toolbar button, no
enabled/disabled state shown anywhere) — keyboard-only is real but easy
to miss; worth a small follow-up if it turns out people don't discover
it. Provenance (canon-fact authority tracking, per the five-pillar scope
note from the scoping conversation this session opened with) remains
confirmed zero.

## Lower-stakes bug batch — closed out

Re-verified every item from the "not done" list against actual source
rather than assuming the prior "investigated, no live bug found"
conclusion still held (it didn't, for two of them) — and found five of
the seven already fixed by the time this pass started, apparently by a
parallel thread of work this doc hadn't caught up with yet:

- **closeModal/render entanglement** — actually fixed. `entityTagFilters`/
  `referenceTagFilters` were never modal state to begin with (they filter
  cards inline in Notes/References, with their own Clear buttons) —
  removed from `closeModal()`'s reset entirely, moved to an explicit reset
  in `teardownLiveStateForProjectSwitch()` where it actually belongs. The
  Organize modal's "Restore" self-close is fixed via a new
  `render({ skipModalClose: true })` option, defaulting to the original
  always-close behavior everywhere else.
- **Resume-view listener leak** — fixed. Named `handleResumePanelClick` +
  remove-before-add, same guard as the other three.
- **Trashed chapters reachable via palette/boot** — fixed. Both the
  palette's chapter index and every tier of `getLastActiveChapter()` now
  filter `!c.trashedAt`.
- **Palette teardown skip** — fixed. Both places the palette can switch
  projects now call `teardownLiveStateForProjectSwitch()` first.
- **Performance tax** — fixed. New `scheduleEntityFieldSave`/
  `flushEntityFieldSave` gives entity name/description the same debounce
  chapter content already had, reusing the person's own autosave-delay
  setting; patches merge across fields so switching fields mid-debounce
  can't drop one.

Two were still genuinely open, fixed just now:

- **`.tinta` import injection, still half-open.** The errors list
  (`backup.js:266`) was escaped in the earlier pass; the warnings list two
  lines below it wasn't — same file, same fix, missed. Wrapped
  `w.message` in `escapeHtml` to match.
- **README rot** — all three confirmed contradictions corrected: auto-
  backup now documented accurately (opt-in, Chromium-only, via
  `autoBackup.js`), the alias/nickname note replaced with what actually
  shipped (`entity.aliases`, matched the same case-insensitive way as the
  primary name), and the scene-reordering note replaced with what actually
  shipped (drag-and-drop in `corkboardView.js`).

**Two more injection gaps found by extending the same sweep**, beyond
what either audit had named — checked every `raw()` call site in the
codebase rather than stopping at the one already-known instance, since
this exact bug class (a `raw()`-wrapped plain string that was supposed to
already be escaped, and wasn't) had already recurred once in the same
file:
- `drawer.js`'s Reference drawer passed `ref.source` (a free-text field)
  straight through `metaRow()`, whose contract for a plain-string
  argument is "already escaped" — it wasn't. Same for a Map-marker
  drawer's linked-scene title (`linkedScene.title`). Both wrapped in
  `escapeHtml` now, matching every other field in the same drawers.

**Verification:** 33/33 smoketest files, 0 regressions, after each fix.
`node --check` clean on `app.js`/`drawer.js`/`backup.js`. Runtime import
check clean on `app.js`.

## Canon Authority / Provenance (§45) — closes the five-pillar foundation track

The fifth and final pillar of the Containers → Query → Navigation/Context
→ Mutation/History → **Provenance** track opened several sessions back.
Containers, Query, and Navigation/Context (partial) shipped earlier;
Mutation/History (undo/rollback) shipped last pass. This pass closes the
track.

**Scoping decision, made before writing anything:** §45's own text asks
for something genuinely distinct from the `canonStatus` field §31 already
shipped. `canonStatus` (canon/draft/proposed/alternate/deprecated/
non-canon) answers "where does this stand in the story's review
workflow." §45 asks a different question — its own example is
distinguishing *"the author says this is true"* from *"a character
thinks this is true."* Those are independent axes: a rumor can itself be
canonically established (yes, this rumor really does circulate in-story)
without the rumored content being true, and a scene-evidence claim can be
canon or still-disputed regardless of whether it came from the author's
own pen or a character's mouth. Folding authority into the existing
6-state enum would have forced a choice neither axis actually implies, so
this shipped as a second, independent field rather than an extra
`canonStatus` value.

- **`authoritySource`** (`store.js`) — a new field on both `entity` and
  `ruleSystem`, holding one of §45's own eight values verbatim: Author
  decision, Published manuscript, Scene evidence, Character belief,
  Rumor, External research, Generated proposal, Imported material.
  Stored display-ready (same convention `REFERENCE_TYPES` already
  established), no separate slug-to-label lookup needed.
- **Two auto-stamped defaults, mirroring `canonStatus`'s own reasoning
  exactly:** hand-created entities/rule systems (`createEntity`,
  `createSeriesEntity`, `createRuleSystem`) default to `'Author
  decision'` — a person typing something in themselves is asserting it,
  full stop, same logic that gives `canonStatus` its `'canon'` default.
  The two real generator entry points (`commitWorldbuildingDraft`,
  `generateStarterSystem`) stamp `'Generated proposal'` instead, right
  alongside their existing `canonStatus: 'draft'` stamp — nobody asserted
  a generated record, a generator proposed it. The other six values are
  never stamped automatically by anything in this codebase; there's no
  reliable signal here for "this came from a scene" vs. "this is a
  rumor" any more than there was for continuity's status-event labels
  (§31-era reasoning) — they exist purely for a person to set via the
  picker.
- **`getAuthoritySources()` / `setAuthoritySource(kind, id, source)`** —
  same shape as `getCanonStatuses()`/`setCanonStatus()`: a validated
  setter (rejects an unrecognized value rather than writing it, since
  this is reachable directly from a UI `<select>`) dispatching on `kind`
  for the same two tables.
- **UI** — an "Authority source" `<select>` added next to "Canon status"
  in both the entity detail panel and the rule-system detail panel,
  reusing the exact same `grammar-field-label`/`wt-popover-field`
  markup and CSS wholesale — zero new CSS. Both panels' flex/stacked
  layouts absorb one more field without any layout change needed.
- **Migration** — `SCHEMA_VERSION` bumped to 3, with a real
  `VERSIONED_MIGRATIONS[3]` entry (`migrate_v2_to_v3`) rather than
  anything added to the frozen legacy ladder, per the debt-fix pass's own
  "freeze the ladder, extend via versioned migrations from here forward"
  rule. Backfills `authoritySource` to `'Author decision'` — not
  `'Generated proposal'` — on anything that predates the field, same
  "silence reads as the strongest, most-established assertion, not as
  something pending review" reasoning `canonStatus`'s own migration used.
  **Also reaches into `db.series[].entities`, not just
  `db.projects[].entities`/`db.projects[].ruleSystems`** — a
  series-shared entity predates this field exactly the same way a
  project entity does, and a `VERSIONED_MIGRATIONS` function receives the
  whole `db`, so there was no structural reason to leave that gap open
  for a field shipping today (unlike the legacy-ladder-era fields, which
  only ever touched `project.entities`/`project.ruleSystems` and never
  got extended to cover `db.series` retroactively — a pre-existing,
  separate gap this pass did not go back and fix for those older fields,
  to keep scope to the field actually being added).
- Verified with a new `provenance.smoketest.mjs` (32 checks): the eight
  authority sources, hand-created-vs-generated defaults for entities,
  rule systems, *and* series-shared entities, `setAuthoritySource`'s
  validation (rejects garbage, dispatches correctly by `kind`, safe
  no-op on an unknown id), an explicit check that `canonStatus` and
  `authoritySource` are genuinely independent (setting one never touches
  the other), and a migration test that strips `authoritySource` from a
  legacy snapshot (entities, rule systems, and series entities alike),
  forces the export back to `version: 2`, re-imports it, and confirms
  everything heals to `'Author decision'` while the db is correctly
  re-stamped `version: 3`.
- `schema-versioning.smoketest.mjs`'s five hardcoded `version, 2`
  assertions updated to `3` to match the bump — re-run clean, including
  the "legacy ladder stays unconditional" and "idempotent re-migration"
  sections, which needed no logic changes, only the expected version
  number.

**Verification:** full suite, 34 smoketest files (33 pre-existing + this
pass's new `provenance.smoketest.mjs`), 0 regressions. `node --check`
clean across every `js`/`mjs` file and `sw.js`; every CSS file
brace-balanced (no CSS actually needed changing this pass — confirmed by
running the check anyway rather than assuming).

**Not done, deliberately:** no automatic classification of the six
manually-set authority values — nothing in this codebase can tell a
scene-evidence claim from a rumor from imported material on its own, and
guessing would be worse than leaving it for a person to set. No bulk
"authority audit" report surfacing everything still at its default
(`'Author decision'`/`'Generated proposal'`) across a project — the data
model and the picker are the actual scope of §45 as written; a filtered
report on top is a small, separate follow-up if it turns out to be
wanted. The pre-existing gap where fields added between the series pass
and this one never got backfilled onto `db.series` entities (only this
pass's own new field does) is flagged above but intentionally not
retroactively fixed for those older fields — that would be a different,
broader cleanup pass, not part of shipping Provenance.

## Hardening pass — href scheme guard, manual snapshot ceiling, import blob GC — shipped

Three close-outs from the external audit of this branch, all in the
"ways an existing feature could hurt" category rather than features:
one click-to-execute hole in the reference drawer, one unbounded-growth
quota risk in snapshots, and one invisible-weight leak on full-backup
import. No UI, no schema change, no SCHEMA_VERSION bump — the db shape
is byte-for-byte identical after this pass; only behavior at the edges
changed.

**1. href scheme allowlist (`dom-utils.safeExternalUrl`, consumer
`drawer.js`).** The reference drawer rendered `<a href="${ref.url}">`
straight from stored data. The `html` template's attribute escaping
stops a value breaking *out* of `href="…"`, but a well-formed
`javascript:alert(1)` never needs to break out of anything — it sits
inside a legal attribute and executes on click. Escaping is not scheme
validation. `safeExternalUrl()` is an allowlist (`http:`/`https:` only,
absolute URLs only, non-strings rejected — a hand-edited `.tinta`
package can carry any JSON in `ref.url`), chosen over a blocklist
because blocklists are a treadmill: case-spelling and tab/newline
variants, future schemes, vendor extensions. A URL that fails the
allowlist still *renders* — as plain escaped text, not an anchor — so
the writer's data is never rewritten or hidden, it just stops being
click-to-execute. `ref.url` in storage is untouched. The audit's
second URL sink, ambience's custom-track URL, was checked and left
alone: it feeds `new Audio(url)`, where script schemes are inert.

**2. Manual snapshot ceiling (`store.js`, `MAX_MANUAL_SNAPSHOTS = 25`).**
Auto-checkpoints have been capped (10) since the Real Revision
Foundation pass, on the stated reasoning that "a writer who manually
snapshots does it rarely enough that count was never the risk." Two
shipped paths broke that assumption: `importChapterFromText()` mints a
manual `'Imported'` snapshot per chapter, so re-importing a manuscript —
a normal recovery workflow — stacked one full content copy per chapter
per import; and long-lived projects simply accumulate save points across
arcs. Every snapshot is a full copy, and the whole db shares one ~5MB
localStorage quota. `capManualSnapshots()` mirrors `capAutoSnapshots`'s
in-place splice contract: oldest-first among manuals only, autos never
touched by it (and vice versa — the `auto` flag boundary from the
migration pass is what keeps the two eviction pools from eating each
other). Why 25 and not 10: manuals are deliberate saves and get a wider
leash; a writer snapshotting once per session on one chapter never sees
an eviction in practice. **Deliberately asymmetric with the auto cap's
migration behavior:** `migrate()` trims over-ceiling *autos* at import
time because they're background noise, but this pass does NOT trim
over-ceiling *manuals* during migration — that would silently delete a
writer's named saves on the first load after upgrading. Legacy hoards
trim going-forward only, on the next manual snapshot in that
chapter/entity. Also applied to entity snapshots (`createEntitySnapshot`
shares the same two-cap call pair as `createSnapshot`).

**3. Full-backup import sweeps stale image blobs (`backup.js`).**
`importFullBackup()` replaces every project in localStorage, but image
blobs live in IndexedDB, which store.js deliberately cannot reach (see
imagestore.js's header comment). Before this pass, restoring a backup
over a workspace that had images orphaned every one of the replaced
projects' blobs forever — no catalog metadata left, so no UI path could
ever delete them. The fix follows the established caller-side division
of labor (same as `deleteProject()`'s blob sweep in app.js): ids are
collected via `listProjects()`/`getProjectImageIds()` BEFORE the swap,
and after a successful swap every collected id NOT present in the
incoming backup's image set is deleted, best-effort. Ids present in both
are left alone, so restoring a backup that shares images with the
current workspace never passes through a window where a blob briefly
doesn't exist. If `Store.importFullBackup()` throws validation, nothing
has been deleted. `importFullBackupWithImages()` is now exported as a
test hook (same reasoning as store.js's `_simulateStorageEvent`) — the
code under test is the wiring, and the wiring needed driving.

**Verification:** new `hardening.smoketest.mjs` (56 checks) pins all
three: the allowlist including `JaVaScRiPt:`/tab-spelled/`data:`/
`vbscript:`/`file:`/protocol-relative/non-string inputs; the 25-ceiling
with oldest-first eviction, auto/manual pool independence in both
directions, and entity coverage; and the import orchestration (swap
lands, stale id becomes GC-eligible, counts degrade cleanly under Node's
missing IndexedDB, and a failed validation leaves the db and the GC
untouched). Full suite re-run: 35 smoketest files, 1,675/1,675 checks
passing, 0 failures; `module-load` still verifies 35/35 modules and 120
exports (it caught nothing this pass, which is the point of running it).
`node --check` clean on all five touched files.

**Not done, deliberately:** write-time sanitization of `ref.url` (the
stored URL is the writer's data; the render-time allowlist is the
security boundary, and rewriting data on save would break legit imports
the render guard already handles safely); mailto:/other benign schemes
in the allowlist (the reference field's placeholder is `https://`, the
fallback keeps the text visible, and a minimal allowlist is the whole
point); capping `deletedItemBackups` or auto-backup files (separate
budgets, different growth curves, not observed to be a problem this
pass). **Addendum, same pass, later the same day — the "never executed" era
ended:** this session's sandbox had Chromium builds already cached and a
working npm registry, so the two blockers the original Playwright pass
hit (browser-binary download unreachable, no @playwright/test installed)
were both removed: `@playwright/test@1.62.1` installed as the dev
dependency package.json always declared (version pinned to the cached
chromium build; range narrowed from ^1.63.0), and all three specs ran
for the first time. Result: **5/5 passing** — boot shape, write→persist
through a real reload with real localStorage, and the full nav sweep
including its no-console-errors gate. One intermittent failure (~1 run
in 3) is a sandbox resource kill ("browser has been closed" at
newContext, different victim each run, zero assertion failures, plain
re-run green) — infra, not app, and recorded as such in the config's
execution note. The browser interaction layer is a verified surface as
of this pass; selector-level render regressions during the coming app.js
refactor now have a real net under them. The refactor-readiness gap this
entry previously closed with "pinned at the module/logic layer instead"
no longer exists.

## v0.2 Pass 1 — shared modal shell (`modal.js`), first migration shipped

New `js/modal.js`: `openModal({ title, body, className, showHeader,
onClose })` + `teardown()`, modeled on `drawer.js`'s already-working
`openDrawerShell()` — one place that owns `#modal-root`'s backdrop/panel/
header frame, the X-button/backdrop-click/Escape close paths, and
document-level listener hygiene (remove-before-add, so repeated or
re-entrant opens can never stack a second click/keydown listener — the
exact bug class this pass exists to retire, found and fixed four times
elsewhere in this project per the Pass 4 list).

**Deliberately narrow scope, matching the plan:** this pass owns
structure and lifecycle only. `body`/`title` stay plain, caller-escaped
HTML strings — the same contract every hand-rolled modal already used —
NOT migrated to the `dom-utils.js` `html`` safe-rendering helper. Mixing
that in here would double-escape every unmigrated caller's markup
(their own `escapeHtml()` calls already ran) and blur a structural
change together with a rendering-safety one; that migration is Pass 2,
tracked separately.

**Coexistence, not a flag day:** app.js's `closeModal()` still exists,
still runs its own TTS/image-library/tag-filter cleanup for the 53
call sites not yet migrated — but its final step now delegates to
`modal.js`'s `teardown()` instead of clearing `#modal-root` directly, so
a modal opened the old hand-rolled way and one opened through
`openModal()` tear down identically regardless of which path closes
them (including `render()`'s own defensive `closeModal()` call on every
render). This is what lets each of the remaining callers migrate one at
a time across future sessions without the unmigrated majority breaking
in between.

**First migration: `annotationsModal.js`.** Was hand-rolled markup plus
two duplicated close-path wirings (X button, backdrop click), each
calling `closeModal(); render();`. The `render()` call (needed to
refresh the Write toolbar's annotation-count badge) is now a single
per-open `onClose` instead of being duplicated at both paths and
implicitly riding along on every modal's global close — the "onClose
scoped per-open, not a shared global function" shape the plan called
for.

**Also folded in, as a scoped addition to Pass 4 rather than executed
this session:** an audit of multiple-em-dash prose strings (user-facing
copy stringing two-plus em-dashes together as a parenthetical-aside
tic) — ~20 lines across `app.js`/`backup.js`/`drawer.js`/
`decisionsView.js`/`generatorModal.js`/`store.js` doc templates, logged
in `V0.2-UNIFICATION-PLAN.md`'s Pass 4 list for a future session.
Explicitly out of scope: the 600+ em-dashes in code comments (invisible
to users) and the paired-dash UI convention (`"— Unset —"`, `"— or —"`)
which is an intentional divider/placeholder pattern, not a prose tic.

**Verification:** new `modal.smoketest.mjs` (37 checks) pins the shell's
own contract directly — backdrop-vs-panel click distinction, Escape vs.
other keys, `onClose` firing exactly once per genuine close and not on
a no-op teardown, and the core regression test: 5 repeated opens plus a
re-entrant open (a second modal opened without closing the first) both
leave exactly one click and one keydown listener bound, with the first
modal's `onClose` still firing (not orphaned) when the second one opens
on top of it. `module-load.smoketest.mjs` updated (`modal.js` added,
37/37 modules now, 124 exports verified) and `sw.js`'s `SHELL_FILES`
updated (`sw-precache.smoketest.mjs` confirms no drift either
direction). Full suite: 37 smoketest files, all green. `node --check`
clean on all six touched/added files.

**Next up:** continue Pass 1 — migrate `wordCheckModal.js` →
`grammarModal.js` → `generatorModal.js` → the 22 inline `app.js` sites
onto `openModal()`, cheapest first, same verification discipline each
step.

---

## Pass 1 continued — wordCheckModal.js, grammarModal.js, generatorModal.js
migrated (both entry points in each: word check + thesaurus/name-gen in
wordCheckModal.js; worldbuilding-draft + starter-system in
generatorModal.js). All three follow the established shape — hand-rolled
backdrop/header markup and X/backdrop wiring replaced by one
`openModal({ title, className, body })` call, self-repainting modals
(thesaurus, worldbuilding draft) deliberately not passing `onClose` since
every internal repaint re-enters `openModal()` too.

**Bug caught before it shipped:** the inline `app.js` site migrated
alongside these (`openChapterTypeManager`, the first of the 22) called a
bare `openModal({...})` — but `app.js` only imports `modal.js` as a
namespace (`import * as ModalShell from './modal.js'`), never a named
`openModal`. That's a `ReferenceError` the moment the function runs;
`node --check` doesn't catch it (syntax is valid, it's a missing binding
at call time) and the current smoketest suite doesn't exercise this
function's DOM path either, so this would have shipped silently broken
until someone actually clicked "Document types." Fixed to
`ModalShell.openModal(...)`, matching the namespace-import style the
rest of `app.js` already uses (`ModalShell.teardown()` a few lines
below it was already correct).

**Continued into 4 more of the 22 inline sites, cheapest first:**
`openOrganizeModal`, `openExportMenu`, `openTemplatePicker`,
`openLibraryDetails`.

- The first three were straightforward — no `onClose` needed, all three
  close through the existing `closeModal()` (still fully functional for
  unmigrated callers per Pass 1's coexistence design).
- `openLibraryDetails` was the first `onClose` candidate among the
  inline sites: its X/backdrop paths were wired to `openLibrary()`
  rather than `closeModal()`. Using `onClose: () => openLibrary()` looked
  like the obvious fit, but surfaced a real interaction: `openLibrary()`
  itself is still unmigrated (raw `#modal-root` `innerHTML` overwrite),
  so it never calls `modal.js`'s `teardown()` — meaning the Save button's
  original `openLibrary()` call would leave this modal's outside-click/
  Escape listeners bound to `document`, now silently pointed at whatever
  markup `openLibrary()` puts in `#modal-root` next. Fixed by having the
  Save handler call `ModalShell.teardown()` instead of `openLibrary()`
  directly — `teardown()` fires the `onClose` (which does the navigation)
  and unconditionally unbinds the listeners first, so no leak regardless
  of whether the close path is Save, X, backdrop, or the new Escape
  capability this migration adds. Worth flagging for future inline-site
  migrations: any site whose original close handler pointed somewhere
  other than `closeModal()` needs this same check — `onClose` only fires
  through `teardown()`, and a still-unmigrated destination function won't
  route through it on its own.

**Verification:** `node --check` clean on `app.js`,`wordCheckModal.js`,
`grammarModal.js`, `generatorModal.js`. Full 37-file smoketest suite
green before and after. 11 of the 22 inline `app.js` sites remain:
`openEntityTypeManager`, `openRelationshipEditModal`, `openHistoryModal`,
`openEntityHistoryModal`, `openLibrary`, `openSeriesManager`,
`openCommandPalette`, `openImageLibrary`, `openCalendarManager`,
`openSystemNodeModal`, `openSettingsModal`.

**Housekeeping note:** this session's starting point was a zip
(`Tinta_v0_2_Pass1.zip`) plus four loose files (`app.js`,
`grammarModal.js`, `generatorModal.js`, `wordCheckModal.js`) uploaded
alongside it. The loose files were ahead of the zip — they already had
`wordCheckModal.js`/`grammarModal.js`/`generatorModal.js` fully migrated
plus the first inline site — so the zip's copies of those four files
were discarded in favor of the loose ones before continuing (per the
project's own "zips named final/checkpoint are often stale" rule; this
export's docs, css, and every other js file were current and used as-is
from the zip since no loose copies of those existed to compare against).

**Next up:** continue Pass 1 on the remaining 11 inline sites, cheapest
first — `openEntityTypeManager` (mirrors the now-migrated
`openChapterTypeManager` almost exactly, should be a near-copy) and
`openSystemNodeModal` are the next-smallest by rough size. `openLibrary`,
`openImageLibrary`, and `openCalendarManager` are the largest remaining
and should come later; note `openLibrary` in particular is now also an
`onClose` target for the migrated `openLibraryDetails` — migrating it
onto `openModal()` itself is a good opportunity to double check that
interaction still holds once it's no longer the "raw innerHTML"
destination on the other end.

---

## Pass 1 continued again — 5 more inline sites migrated
`openEntityTypeManager`, `openSystemNodeModal`, `openHistoryModal`,
`openEntityHistoryModal`, `openRelationshipEditModal`.

- `openEntityTypeManager` mirrored `openChapterTypeManager`'s established
  workaround exactly (no `onClose`, manual listeners rewired onto the
  shell's own X button/backdrop each repaint) rather than the `onClose`
  approach used for `openLibraryDetails` last session — this function
  self-repaints directly (delete/add call it again) with no separate
  paint()/open() split, so `onClose` would fire on every repaint, not
  just a genuine close. Same known Escape-doesn't-navigate-back gap as
  its sibling, logged there already, not repeated here as a new issue.
- `openSystemNodeModal` had no self-repaint and its close path already
  led to one place (`renderSystemsView`), so it got the cleaner `onClose`
  treatment — the save handler now just calls `ModalShell.teardown()`
  and lets `onClose` do the navigation, rather than keeping a duplicate
  local `close()` helper around.
- `openHistoryModal`, `openEntityHistoryModal`, `openRelationshipEditModal`
  were all straightforward — self-repaint via direct recursive calls (new
  snapshot, delete snapshot, add/remove relationship-history entry), but
  every close path already routed through app.js's own `closeModal()`
  directly, so no `onClose` complications like `openLibraryDetails`
  needed — same "drop the manual X/backdrop wiring, let `openModal()`
  own it" migration as the first four sites.

**Verification:** `node --check` clean on `app.js` after each edit in
this batch. Full 37-file smoketest suite green throughout — checked
after every single-function migration, not just at the end.

**Remaining (6 of the original 22 inline sites):** `openLibrary`,
`openSeriesManager`, `openCommandPalette`, `openImageLibrary`,
`openCalendarManager`, `openSettingsModal` — the largest and structurally
riskiest of the batch, left for a session that can give each its own
full attention rather than a cheapest-first sweep. Two are worth flagging
ahead of time:
- `openLibrary` is now an `onClose`/navigation *target* for the already-
  migrated `openLibraryDetails` (and, before this session's fix, would
  have been for anything else routing through it) — migrating it onto
  `openModal()` is the moment to re-verify that interaction still holds
  now that it's no longer the "raw innerHTML, bypasses teardown()"
  destination on the other end.
- `openCommandPalette` uses a `palette-backdrop` class, not
  `modal-backdrop` — worth confirming during that migration whether it's
  actually a `modal.js` candidate at all, or a deliberately separate
  shell (it wasn't one of the sites this pass's plan called out
  specifically, so this needs a fresh look rather than assuming it fits
  the same shape as the rest).

---

## Pass 1 complete — all 22 inline `app.js` sites migrated

**Housekeeping note:** this session's starting point was a base zip plus
three loose files (`app.js`, `modal.js`, `modal_smoketest.mjs`). The loose
files were ahead of the zip — they already had `openLibrary` migrated
plus the `openGeneration` re-entrancy fix in `teardown()` (guards against
an `onClose` that itself calls `openModal()`, e.g. `openLibraryDetails`'s
`onClose: () => openLibrary()`) and its regression test (`modal.smoketest.mjs`
section 11). The zip's copies of those three were discarded in favor of
the loose ones before continuing, per the project's own "loose files often
lead the zip mid-session" rule; everything else was current from the zip.

Of the "6 remaining" logged last time, an audit at the start of this
session found `openSeriesManager` was *already* migrated (using
`ModalShell.openModal()` cleanly, no `onClose`, no self-repaint
complications — the docs just hadn't caught up to it), leaving 5 genuine
sites: `openImageLibrary`, `openCalendarManager`, `openCommandPalette`,
`openSeriesManager` (confirmed done, not touched), and `openSettingsModal`.
All were closed out this session, cheapest first:

- **`openImageLibrary`** — migrated with a real `onClose`, and doing so
  fixed a latent bug for free: the old `closeModal()` reset
  `imageLibraryMode`/`imageLibraryOnSelect`/`imageLibraryEntityId` and
  revoked `imageLibraryUrls` *unconditionally*, not gated on `wasOpen`
  the way the Library-filter reset already was. That meant a background
  `render()` firing its defensive `closeModal()` call while an Image
  Library modal was legitimately open (e.g. mid gallery-add on an entity
  panel) could silently null `imageLibraryOnSelect` out from under it.
  Moving that cleanup into `onClose` — which only runs when the modal
  genuinely closes, via `teardown()`'s own `wasOpen` check — closes that
  gap as a side effect of the migration itself, not a separate fix.
  `closeModal()` no longer touches Image Library internals at all.
- **`openCalendarManager`** — simplest of the five: no self-repaint, no
  module-level state, both existing close paths (`calendar-save-btn`,
  `calendar-toggle-btn`) already called `closeModal()` directly. Straight
  swap, no `onClose` needed.
- **`openCommandPalette`** — the flagged fit-check resolved in favor of
  migrating: `palette-backdrop` turned out to be a CSS positioning
  modifier only (`align-items: flex-start; padding-top: 12vh` in
  `tools.css`), applied on the *same* element as `.modal-backdrop`, not a
  separate shell. Handled the same way `openLibrary()` handles
  `library-backdrop` — added via `classList.add()` on the backdrop
  element right after `openModal()` returns, since `modal.js` has no
  className hook for the backdrop itself (only `.modal-panel`). Used
  `showHeader: false` (the palette never had a title bar or X button).
  The manual outside-click listener was dropped entirely — `modal.js`'s
  own global outside-click handler already covers it once the element has
  the `.modal-backdrop` class. Escape now double-fires harmlessly (once
  from `modal.js`'s own listener via `teardown()`, once from the
  pre-existing app-wide Escape handler's `closeModal()` call) — the exact
  same idempotent-`teardown()` coexistence every other migrated modal
  already relies on, not a new interaction.
- **`openSeriesManager`** — audited, confirmed already fully migrated
  (see above). No changes made.
- **`openSettingsModal`** — the big one, ~550 lines, 11 separate
  self-repaint call sites (nearly every control re-renders the whole modal
  after a change so the panel always reflects Store exactly, rather than
  hand-patching a dozen small DOM states). Followed the established
  `openChapterTypeManager` shape: **no `onClose`** — since every repaint
  goes through `openModal()` too, `onClose` would fire on each one, not
  just a genuine close — with the X button and backdrop wired directly to
  `closeModal()`, exactly reproducing the original hand-rolled wiring
  (which, unlike the type managers, never needed a wrapping "return to
  view X" step — Settings has no navigation target beyond whatever view
  was already showing). The jump-links scroll logic
  (`panelEl.querySelector('.modal-header')`, `.settings-modal` as the
  panel-scoping selector) needed no changes — both still resolve correctly
  against `openModal()`'s own rendered header and panel classes.

**Verification:** `node --check` clean on `app.js` after each edit. Full
37-file smoketest suite green after every single migration, not just at
the end.

**Pass 1 is now complete** — all 22 originally-inline `app.js` modal call
sites (plus `annotationsModal.js`, `wordCheckModal.js`, `grammarModal.js`,
`generatorModal.js` from earlier in the pass) run through `modal.js`'s
shared shell. `app.js`'s own `closeModal()` is now a thin wrapper: TTS
stop, the library-filter/`libraryCoverUrls` cleanup that's still generic
across modals, and a final delegation to `ModalShell.teardown()` — no
per-modal internals left bolted onto it beyond that.

**Known, deliberately-not-fixed gaps carried forward** (all pre-existing,
none introduced by this pass — see the type-manager entries above for
where they were first logged): self-repainting modals
(`openChapterTypeManager`, `openEntityTypeManager`, `openSettingsModal`)
don't run their "return to underlying view" step on Escape, since they
have no `onClose` for `modal.js`'s own Escape listener to call — Escape
still closes the modal fine via the app-wide Escape handler's
`closeModal()` call, it just doesn't additionally re-render whatever view
was underneath. Worth a small dedicated follow-up if it's ever noticed in
practice, not urgent enough to block this pass closing out.

**Next up:** Pass 2 — finishing the `dom-utils.js` safe-rendering
migration (see `V0.2-UNIFICATION-PLAN.md`). Only ~6% of `innerHTML =`
sites across the project use the safe `html\`...\`` auto-escaping helper;
this closes the whole bug class that's already caused four real injection
bugs. Smallest files first, `app.js` last.

**Pass 2 — app.js, session update:** Every non-`app.js` file was already
fully migrated as of last session (confirmed by direct audit, not by
trusting the log — grammarModal.js and modal.js turned out to already be
done too). In `app.js` itself, verified against live source rather than
the stale per-session line numbers/counts in this doc: **94 total
`innerHTML =` sites**, 8 of which are `= ''` clears (no migration
needed), leaving 86 content-setting sites. As of this session, **73 of
those 86 use `html\`...\`` + `toBridge()`**; **13 remain**, all large
per-view panel templates:

| Site | ~lines | Status |
|---|---|---|
| `renderCanvasView` | 24 | pending |
| `renderMarkerEditor` | 23 | pending |
| Write toolbar+editor shell | 93 | pending |
| `renderEntityDetail` | 101 | pending |
| `renderBookView` | 17 | pending |
| Snippets panel | 41 | pending |
| `renderTimelineView` | 57 | pending |
| `renderStatsView` | 106 | pending |
| `renderHealthView` | 129 | pending |
| Health checklist item render | 21 | pending |
| `renderAnnotationsView` | 40 | pending |
| `renderSystemsView` | 27 | pending |
| `renderSystemDetail` | 56 | pending |

This session's slice (smallest-first, per the plan): migrated
`chapterOpenRowHtml()` (the shared row-builder used by Favorites/
Recents/Archive/Trash/Collections tabs) and all 11 Organize-modal tab
render functions (Chapters, Favorites, Recents, Folders, Parts,
Collections, Archive, Trash, Recently Deleted, Saved Searches, Quotes)
from hand-escaped template literals to `html\`...\`` + `toBridge()`.
These were already manually escaping correctly via `escapeHtml`/
`escapeAttr`, so this closes the *consistency* gap (one rendering
pattern project-wide) rather than a live bug — but it's exactly the kind
of site a future edit could silently de-escape by dropping a call, which
the tagged-template default forecloses.

Pattern used throughout (matches the already-migrated `renderEntityGroup`
precedent in Notes view): arrays of rows are passed directly as
`${arr.map(fn)}` with no `.join('')` — `html\`\`` joins `SafeHtml` arrays
internally; joining first with plain string concatenation would call
`.toString()` on each `SafeHtml` and produce `[object Object]`, which is
exactly the kind of subtle breakage this migration exists to avoid.
Empty-list fallbacks changed from `arr.map(...).join('') || '<p>...</p>'`
to explicit `arr.length ? arr.map(...) : html\`<p>...</p>\`` for the same
reason. `raw('selected')` / `raw('disabled')` used for the handful of
boolean-attribute sites where the plain string needs to appear verbatim
inside an already-escaping template (matches the existing
`raw('selected')` precedent in the References panel's option-rendering).
Spot-checked with a standalone harness (both `<script>` tags and
attribute-breakout `"`-in-id payloads land fully escaped, not reproduced
verbatim) rather than relying on the smoketest suite, which doesn't
assert on markup escaping directly — same verification approach the
hardening pass used.

Verification: `node --check` clean, 37/37 smoketest files green after
the slice.

**Next slice:** continue smallest-first — `renderBookView` (17),
`renderMarkerEditor` (23), `renderCanvasView` (24), Health checklist item
render (21), `renderSystemsView` (27), then the larger view panels
(`renderAnnotationsView`, Snippets panel, `renderSystemDetail`,
`renderTimelineView`, Write toolbar+editor shell, `renderEntityDetail`,
`renderStatsView`, `renderHealthView` — these last two are bigger than
this session's log previously estimated for "the Write toolbar," so the
size ordering above supersedes any earlier line-number-based claims).

## v0.2 Pass 2 — complete: last 4 `app.js` sites migrated, 0 remain

Picked up from "only the 4 biggest remain." Re-audited `app.js` directly
(grep for `\.innerHTML = ` minus `toBridge(`/`= ''` clears) rather than
trusting the previous session's tracked list — that surfaced a **5th
site the earlier 13-item list had never included**: `renderImageLibraryGrid`
(~5746), a `.map().join('')` pattern rather than a template literal, which
is presumably why it never got caught by the line-number-targeted
scanner scripts (`measure.py`/`measure2.py`) used to size the tracked
list. It was already correctly hand-escaped (`escapeAttr(img.caption)`,
non-user-controlled `img.id` in `data-image`), so — same as the Organize
tabs last session — this was a consistency gap, not a live bug.

Migrated, smallest-first, `node --check` + full 37-file smoketest suite
green after each:
- `renderImageLibraryGrid` (~30 lines, the previously-untracked one) —
  array of `html\`` cards via `.map()`, no `.join('')` (same
  `renderEntityGroup` precedent as always: joining first stringifies
  `SafeHtml` to `[object Object]`).
- `renderEntityDetail` (101 lines) — one `raw()` site preserved:
  `entityColorStyleAttr(entity.type)`'s pre-built `style="..."` fragment,
  same already-audited-safe pattern noted in earlier passes. Every
  `<option>`/`<select>` list converted to `html\`` + `raw('selected')`
  for the boolean attribute, matching the Organize-tabs convention.
- `renderStatsView` (106 lines) — numeric interpolations (word counts,
  percentages) left as plain `${}` since escaping is a no-op on them;
  `escapeHtml(c.title)` / `escapeHtml(p.pov)` calls dropped in favor of
  `html\`` 's automatic escaping.
- `renderHealthView` (129 lines, the largest) — one `raw()` site
  preserved: the dead-links row's conditional
  `data-jump-map="..."` / `data-jump-reference="..."` attribute, built
  with `escapeAttr()` inside `raw()` since it's whole-attribute markup
  being chosen at render time, not a single value. **Caught and fixed a
  self-introduced regression before shipping**: a first pass at this
  file accidentally flattened two typographic-quote strings ("after
  “…”" in the continuity-issues row, "prefers “…”" in the style-guide
  row) to straight quotes while rewriting the template — restored the
  original curly-quote characters via a follow-up `str_replace` and
  re-verified. Worth flagging as a general migration-hygiene note: a
  large hand-rewritten template is exactly where silent character
  substitutions like this can slip through smoketests (they don't assert
  on exact punctuation), so a diff/grep check for the source's non-ASCII
  punctuation is worth doing on any future large-template migration, not
  just a green test run.

**Pass 2 is now complete.** Verified directly against source: 94 total
`.innerHTML = ` sites in `app.js`, 8 plain `= ''` clears, 85 on
`html\`` + toBridge()`, 1 stray grep hit that's actually a comment
mentioning the pattern (not real code) — zero un-migrated sites remain.
Every non-`app.js` file was already fully migrated per Pass 1. 37/37
smoketest files green, `node --check` clean, throughout and at the end.

Not done as part of this pass, still open per `TINTA-MASTER-TRUTH.md`:
dissolving `app.js`'s utility re-exports (`escapeHtml`/`escapeAttr`/`q`
are still re-exported from `dom-utils.js` for backward compat even
though every call site has now migrated off needing them directly) —
that's a separate follow-up cleanup, not blocking Pass 2's completion.

## v0.2 follow-up — dissolving app.js's utility re-exports

Picked up the one open follow-up flagged at the end of Pass 2. Direct
audit (not the "~12 modules" estimate in the old comment) found exactly
7 real importers still pulling `q`/`escapeHtml`/`escapeAttr`/`html`/
`raw`/`toBridge` from `./app.js` instead of `./dom-utils.js` directly:
`annotationsModal.js`, `backup.js`, `generatorModal.js`,
`wordCheckModal.js`, `grammarModal.js`, `readAloud.js`, `sprintPanel.js`.
Switched each to import these straight from `./dom-utils.js`, keeping
only genuinely app.js-owned exports (`render`, `closeModal`,
`activeView`, `activeChapterId`, `currentEditorHandle`,
`showStorageWarning`, `downloadTextFile`, `safeFilename`,
`setActiveView`, `setActiveChapterId`) on the app.js import line. Three
files (`wordCheckModal.js`, `grammarModal.js`, `readAloud.js`,
`sprintPanel.js`) already had a `./dom-utils.js` import line for
`html`/`toBridge`, so `q` (and `escapeHtml` for `wordCheckModal.js`)
just folded into the existing line rather than adding a new one.

**Did not delete the re-export line itself**, despite the doc's framing
of this as "dissolving" it — checked `module-load.smoketest.mjs` first
and found it explicitly asserts `app.js` exports exactly
`['render', 'setActiveView', 'setActiveChapterId', 'escapeHtml',
'escapeAttr', 'q', 'html', 'raw', 'toBridge']`, written as a regression
test for a real past bug (importing `html` from `app.js` when `app.js`
only re-exported `escapeHtml` etc.). Removing the line would fail that
test and reopen the exact failure mode it exists to catch. Left the
`export { escapeHtml, escapeAttr, q, html, raw, toBridge } from
'./dom-utils.js';` line in place, purely as the export surface the test
guards, and rewrote the comment above it to say plainly that it has zero
real importers left rather than the stale "~12 modules" claim.

Verified: `node --check` clean on all 8 touched files,
`module-load.smoketest.mjs` still 36/36 modules / 124 exports green,
full suite 37/37 smoketest files green.

## v0.2 Pass 4 — the recurring small-duplication cleanups (complete)

All five items from the plan's Pass 4 list, in order, each verified
independently:

**1. Outside-click listener helper.** `bindOutsideClick(handler, options)`
added to `dom-utils.js` (always `removeEventListener` then `addEventListener`
internally). All four sites that had independently hand-rolled this exact
"remove-before-add" dance — the Write toolbar's popovers, the snippet-
promote menu, the Library grid's ⋯ menu, and `drawer.js`'s click-to-close —
now call it instead. The Write-toolbar site was the only one that needed
restructuring beyond a one-line swap: it used to rebuild its own closure in
a module-level-var wrapper (`bindToolbarPopoverOutsideClick`) each render;
that's now a plain named function (`closeToolbarPopoversOnOutsideClick`)
like the other three sites, since `bindOutsideClick` needs a stable function
reference to actually find and remove the previous listener.

**2. Toast duplication.** `showGoalCelebration` and `showToast` rendered
near-identical markup with two separate module-level auto-dismiss timers.
The two-timer split was a real latent bug, not just duplicate code: since
both write to the same `celebrationToastRoot` but each only clears its own
timer, calling one shortly after the other left the first one's stale
`setTimeout` free to fire later and blank out the second toast's markup
out from under it. Factored into a shared `renderToast(bodyHtml, { icon,
actionLabel, onAction, duration })` shell with one timer
(`toastDismissTimer`); each caller now only supplies its own body markup
(`showGoalCelebration`'s bold title + detail line, stacked, vs.
`showToast`'s single line) and duration (5s vs. 6s).

**3. The `[[mention]]` regex.** Was copy-pasted identically
(`/\[\[([^\[\]]+)\]\]/g`) in `store.js`, `mentions.js`, and `drawer.js`.
`store.js`'s copy is now the single exported `MENTION_RE` constant; the
other two import it instead of re-typing the pattern. `mentions.js` gained
its first-ever import (previously zero, by design, to avoid reaching into
Store's live functions/state from a pure-UI module) — importing a static
regex constant doesn't reopen that concern, since a regex literal carries
no behavioral coupling the way calling a Store function would. No
circularity: confirmed `store.js` doesn't import `mentions.js` before
adding the edge.

**4. Tag/chip-filter duplication.** `entityTagFilters` (Notes) and
`referenceTagFilters` (References) were two independent "toggle a Set,
render chips, Clear button" implementations, identical apart from id
prefix, which Set they touched, and which render function to call after.
Factored into three shared helpers: `tagFilterBarHtml(idPrefix, activeSet,
tagOptions, extraStyle)`, `wireTagFilterBar(idPrefix, activeSet, onChange)`,
and `filterByTagSet(list, activeSet, tagsField)`. Both call sites rewired;
verified with a standalone escaping harness (a tag containing
`"><script>alert(1)</script>` renders fully escaped through the shared
helper). **The Library's genre/storyType/language filter was deliberately
left separate**, despite being named alongside these two in the plan —
direct comparison showed it's multi-field (AND across fields, OR within a
field, one labeled group per field) rather than the single-Set, single-field
shape the other two share; forcing all three into one shape would mean
generalizing across a structural difference, not just deduplicating a
copy-paste, so it stays its own (already reasonably general,
`LIBRARY_FILTER_FIELDS`-table-driven) implementation.

**5. Multiple-em-dash prose strings.** Fixed the genuine "X — aside — Y"
bracketing-parenthetical instances found on direct re-audit (not fully
trusting the prior session's "~20 lines audited" count, which turned out
to include some false positives — see below): `app.js`'s manuscript-export
note and entity-type-manager note, `backup.js`'s auto-backup browser-support
note, `generatorModal.js`'s starter-system note, and `store.js`'s glossary
seed-content template (two duplicate copies, `**Term** — Definition.`
→ `**Term**: Definition.`). **Explicitly left alone, confirmed not
in scope**: the paired-dash UI placeholder convention (`"— Unset —"`,
`"— None (top-level) —"`, `"— or —"`) called out as excluded by the plan
itself; ternary ` — edited since' : ' — not yet reviewed'` branches, which
only ever render one dash at a time despite two appearing in the source
line; and paragraphs containing two *independent* single-dash sentences
(e.g. app.js's timeline-mismatch warning, backup.js's full-backup-import
warning) — a real aside strings a parenthetical between two dashes in one
clause, which reads differently from two separate single-dash sentences
that happen to sit in the same paragraph, so those were left as the
single-dash convention the plan explicitly keeps out of scope.

Verified throughout: `node --check` clean on every touched file
(`dom-utils.js`, `app.js`, `drawer.js`, `store.js`, `mentions.js`,
`backup.js`, `generatorModal.js`), full 37-file smoketest suite green
after each of the five items, not just at the end.

**v0.2 Pass 4 is now complete.** Per the plan's own ordering note, Pass 5
(dissolving `app.js`'s utility re-exports) was already done in an earlier
session, ahead of Pass 3 (view modularization) rather than after it as the
plan intended — flagged there as fine but early; Pass 3's later
extractions may still touch some of the same import lines again. Pass 3
itself (8 full view extractions: References, Systems, Canvas, Map,
Timeline, Snippets, Health, Stats) remains the only open pass from the
v0.2 plan.


## v0.2 Pass 3, begun — `statsView.js` extracted (1 of 8)

Started view modularization. Stats was picked first among the eight
Pass 3 targets (References/Systems/Canvas/Map/Timeline/Snippets/
Health/Stats) for the same reason Corkboard and Decisions were safe to
do ahead of the plan: it touches none of `app.js`'s module-level `let`
state, and unlike References/Systems/Health it's never a target of a
cross-view "jump to X" link — nothing sets an "active stats row" from
outside the Stats view itself.

`renderStatsView` and its private `formatWriteTime()` helper moved to
`js/statsView.js` verbatim, imported back into `app.js`
(`import { renderStatsView } from './statsView.js'`). `formatWriteTime()`
came along rather than staying behind as a cross-module import — a
full-project grep confirmed it has exactly one call site, inside
`renderStatsView` itself, so there was no reason to leave a
single-consumer helper in the file it was extracted out of.

Landed this session: merged the three loose files (`app.js`,
`statsView.js`, `sw.js`) into the zip tree, confirmed no stray references
to `renderStatsView`/`formatWriteTime` remained anywhere else in the
codebase (checked the Health view's dangling-reference jump and the
Resume dashboard specifically, since those are the two other places a
view's render function sometimes gets called from outside its own file —
neither touches Stats), and added `./js/statsView.js` to `sw.js`'s
`SHELL_FILES` so the new file is part of the offline app-shell cache like
every other view module.

`module-load.smoketest.mjs` needed no new entry — like `corkboardView.js`
and `decisionsView.js` before it, `statsView.js` isn't listed as its own
module in that test's table; it's exercised transitively through
`app.js`'s import chain, which is exactly the failure mode that test was
built to catch. Confirmed the module count held at 36/36 loaded, 124
exports verified.

`node --check` clean on every file in `js/`. Full 37-file smoketest suite
green (1,868 assertions total across the suite, well past the prior
~1,438 baseline — the growth is cumulative from every pass since, not
something this extraction added on its own).

**7 of 8 Pass 3 views remain: References, Systems, Canvas, Map, Timeline,
Snippets, Health.** Write/Notes/Search are still deliberately last per
the plan — they're the most entangled with shared module-level state
(`activeChapterId` etc.) and the highest-traffic views.

## v0.2 Pass 3, continued — `snippetsView.js` extracted (2 of 8)

Second Pass 3 extraction. Snippets was the cleanest of the seven
remaining targets: `activeSnippetCategory` is touched nowhere outside
its own render function — no "jump to X" button anywhere else in the app
ever sets it, unlike `activeReferenceId`/`activeSystemId`/`activeMapId`,
which Health's and Search's jump links write into from outside their own
views. That let the state move into the new module wholesale rather than
staying behind as a new `app.js` export — the same footing
`activeSystemId` already has sitting next to `renderSystemsView`.

`renderSnippetsView`, its private `promoteMenu()` helper, and
`closeSnippetMenusOnOutsideClick()` all moved to `js/snippetsView.js`
verbatim. Re-render stays a direct recursive call to
`renderSnippetsView()` itself (create/delete/category-change/promote all
call it after mutating) rather than a round-trip through `app.js`'s
`render()` dispatcher — the same recipe `decisionsView.js` and
`corkboardView.js` established. No new export was needed from `app.js`
for this one: `bindOutsideClick` was already a clean `dom-utils.js`
export from the Pass 4 cleanup, so the import list is just `Store` +
`dom-utils.js` helpers, nothing circular.

Confirmed both `bindOutsideClick` and `raw` still have other consumers
left in `app.js` (toolbar popovers, Library card menu, and 46 other
`raw()` call sites respectively) before removing the old inline block, so
neither import went dead. Added `./js/snippetsView.js` to `sw.js`'s
`SHELL_FILES`. `module-load.smoketest.mjs` needed no new entry, same
reasoning as Stats — it loads transitively through `app.js`'s import
chain; module count held at 36/36 loaded, 124 exports verified.

`node --check` clean on every file in `js/`. Full 37-file smoketest suite
green, 0 failures (`snippet-promotion.smoketest.mjs` included).

**6 of 8 Pass 3 views remain: References, Systems, Canvas, Map, Timeline,
Health.** Timeline's next in line — no dedicated active-id state either,
just two already-exported cross-imports (`render`, `closeModal`) plus one
purely local calendar helper that travels with it untouched. Health,
Canvas, then References/Systems/Map (the three genuinely two-way-coupled
ones, deliberately last) after that. Write/Notes/Search stay last of all,
per the plan.

## v0.2 Pass 3, continued — `timelineView.js` extracted (3 of 8)

Third Pass 3 extraction, and the first one that's a genuine *write*
case rather than a read. Timeline has no dedicated `activeXId` of its
own, but its "↦ Open chapter" button on a linked event needs to jump to
the Write view — which means writing `app.js`'s
`activeChapterId`/`activeView` and calling its `render()` dispatcher.
That's exactly the case `corkboardView.js`'s own header comment flagged
as "the next, harder case" back when it only needed read-only access to
`els`. `setActiveChapterId()`/`setActiveView()` already existed for this
(added ahead of need, per that comment) — nothing new had to go on
`app.js`'s exported surface. `closeModal` (needed by the Calendar modal's
save/toggle handlers) was already exported too.

`renderTimelineView`, `parseCalendarMonthsInput()`, and
`openCalendarManager()` all moved to `js/timelineView.js` verbatim — the
latter two are single-consumer helpers (only this view's own Calendar
button ever reaches them), same reasoning as Stats' `formatWriteTime()`
and Snippets' `promoteMenu()`. `openModal` (from `modal.js`, previously
reached via `app.js`'s `ModalShell` namespace import) is now imported
directly.

This is a real circular import: `app.js` imports `renderTimelineView`
from here, `timelineView.js` imports `closeModal`/`render`/
`setActiveView`/`setActiveChapterId` back from `app.js`. Confirmed safe
the same way `corkboardView.js`'s `els` circular import is — neither side
touches the circular bindings during top-level module evaluation, only
inside event handlers that run later. `module-load.smoketest.mjs`
exercises the actual load order and stayed green (36/36 modules, 124
exports verified — unchanged, since this loads transitively same as
every other extracted view).

Confirmed `ModalShell` still has 19 other call sites left in `app.js`
before treating that import as untouched.

`node --check` clean on every file in `js/`. Full 37-file smoketest suite
green, 0 failures (`calendar.smoketest.mjs` included — the module most
likely to catch a circular-import or calendar-logic regression here).

**5 of 8 Pass 3 views remain: References, Systems, Canvas, Map, Health.**
Health's next — it needs new setter exports added to `app.js`
(`setActiveReferenceId`/`setActiveSystemId`/`setActiveMapId`, following
the exact precedent this session just exercised) before its jump-to
wiring can move with it. Canvas after that (biggest, but still
self-contained), then References/Systems/Map last — the three where the
state-ownership decision actually has to get made, since those three are
both senders and receivers of their own jump targets. Write/Notes/Search
stay last of all, per the plan.

## v0.2 Pass 3, continued — `healthView.js` extracted (4 of 8)

Fourth Pass 3 extraction — the one the plan itself flagged as needing new
setter exports first. Health is the *sender* for every "jump to X" link
in the app: References, Systems, Map, Notes (entity), Write (chapter),
Timeline, and Questions all get jumped to from its rows. Four targets
(`activeEntityId`/`activeSystemId`/`activeReferenceId`/`activeMapId`) had
no setter yet — nothing outside their own view had ever needed to write
them before Health did. Added `setActiveEntityId()`/`setActiveSystemId()`/
`setActiveReferenceId()`/`setActiveMapId()` to `app.js`'s exported
surface, same shape as the existing `setActiveChapterId()`. These stay on
`app.js` rather than moving into their own view modules — References/
Systems/Map still render from inline `app.js` code for now, so `app.js`
remains the one place all four ids actually live until those three get
extracted too; when they are, each setter can move with its view without
Health's own import list needing to change, since Health only ever calls
the setters, never reads the ids back.

`renderHealthView` and its two self-contained helpers
(`healthChangesRange` state + `healthChangesSinceIso()` resolver) moved to
`js/healthView.js` verbatim — neither is touched by anything outside this
view, same footing as Snippets' `activeSnippetCategory`.

Confirmed the `CHECKLIST_JUMP_VIEW` table and Checklist's own
`activeView = 'health'` line (still inline in `app.js`) only ever
reference the `'health'` view-id string, not anything inside the render
function itself — no coupling there to account for.

`node --check` clean on every file in `js/`. `module-load.smoketest.mjs`
green with the new exports in place (36/36 modules, 124 exports
verified). Full 37-file smoketest suite green, 0 failures.

**4 of 8 Pass 3 views remain: References, Systems, Canvas, Map.** These
are the four where a real state-ownership decision has to get made:
References/Systems/Map are each both sender and receiver of their own
jump target (clicked normally from within their own view, and jumped to
externally from Health, same as Health itself now demonstrates the
receiving side of). Canvas has no jump-to entanglement but is the
largest single extraction left (~439 lines, drag-handle lifecycle,
private `canvasNodeHandles`/`canvasStatusFilter` state) — plausibly worth
doing before the three coupled ones just to bank the biggest remaining
"clean" win first. Write/Notes/Search stay last of all, per the plan.

## Session 25 — v0.2 completion pass (Passes 2, 3, 5 closed) + nav auto-compact

The session that closed out `V0.2-UNIFICATION-PLAN.md`. Baseline first:
full suite re-run green before any edit (38 smoketest files at that point),
`node --check` clean across `js/`.

**Nav auto-compact fallback (the review fix, not a plan pass).** The
grouped nav bar had outgrown common viewports: at 1440px the four groups
plus the ⌘K palette button total ~2100px, so the Tools group (eight views)
and the palette button silently clipped off the right edge — no scroll, no
affordance, ⌘K itself unreachable. Fix in `nav.js`: "Grouped" now reads as
"grouped when it fits." Render paints grouped, measures it against the
real tab bar (last group's right edge past the bar's edge, or the palette
button pushed out/collapsed → doesn't fit), and falls back to compact for
that paint — synchronously, so nothing flickers. A debounced (150ms)
resize listener re-runs the same path so widening the window restores
grouped without a reload. The pure half of the decision is a named export,
`effectiveNavStyle(userStyle, fitsGrouped)`, pinned by a new
`nav.smoketest.mjs` (12 assertions: user choice of compact always wins;
measurement only ever downgrades grouped; NAV_GROUPS shape guarantees).
Settings' nav-style note now says what Grouped actually does. Suite green
after.

**Pass 3 — the last three extractions.** The ROADMAP's previous entry
listed "4 of 8 Pass 3 views remaining: References, Systems, Canvas, Map."
Map, References, and Systems are now extracted (`mapView.js`,
`referencesView.js`, `systemsView.js`), each wholesale with its state:

- `mapView.js` — `activeMapId`/`selectedMarkerId`/`mapImageUrl`,
  `revokeMapImageUrl()`, five render functions. `setActiveMapId` moved
  with the state; app.js re-exports it (live binding) so healthView.js's
  import and module-load.smoketest.mjs's assertions never changed.
  app.js's render() still owns the "map background URL lives only while
  Map is showing" rule, now via the module's exported revoker.
- `referencesView.js` — `activeReferenceId` + `referenceTagFilters`;
  project-switch's filter reset now calls the module's exported
  `resetReferenceTagFilters()`. The Pass 4 tag-chip trio
  (`tagFilterBarHtml`/`wireTagFilterBar`/`filterByTagSet`) stayed in app.js
  (Notes is the first caller) and gained exports for this second one.
- `systemsView.js` — `activeSystemId`, both render functions, and
  `openSystemNodeModal` (exists solely for this view). Imports the Pass 1
  modal shell, the generator seam (starter-system modal +
  `activeSystemIdFromGenerator` pickup), and `capitalize`.

The three jump-target setters are imported back into app.js (Search's jump
rows write through them) and re-exported from it, same live-binding trick
as the utility re-export. Drawer.js needed zero edits — it already coupled
to these views at the DOM level (`data-map-id`/`data-reference-id`/
`data-open-system` row attributes). Shared helpers that gained exports for
new callers: `openImageLibrary`, `resolveEntityAvatar`, the tag-chip trio.
app.js: 7,793 → ~7,060 lines. **Canvas remains inline by choice** — it has
no jump-target entanglement but is the largest single extraction (~440
lines, drag lifecycle, private filter state), and with the plan's named
view list complete, it belongs to the same future slice as
Write/Notes/Search rather than holding v0.2 open. sw.js's SHELL_FILES and
module-load.smoketest.mjs grew by the three files (39 modules, 142
exports). Suite green after every extraction.

**Pass 2 — verified complete, final slice landed.** A repo-wide audit of
every `innerHTML =` site: zero dynamic sites anywhere are assigned anything
except `toBridge(html\`...\`)` — the only non-`toBridge` assignments left
in the codebase are teardown clearings and one pure-static string
(readAloud's "System default" option). The last hand-escaped dynamic sites
(grammarModal's dictionary + style-guide lists) migrated onto `html`` ``
this session as the final slice. The remaining `raw()` call families are
the documented, deliberate ones (`selected` markers, trusted `extraStyle`,
and Outline's synopsis — pre-escaped through `renderMentionsHtml`).

**Pass 5 — verified complete.** Repo-wide grep: zero importers of
`q`/`escapeHtml`/`escapeAttr` from app.js. The re-export line stays on
purpose — module-load.smoketest.mjs asserts it (the s28 regression test) —
but it is now a test-asserted compatibility surface, not a live dependency
path. The pass's goal is met and auditable.

**Docs.** `V0.2-UNIFICATION-PLAN.md`: Passes 2/3/5 marked complete with
logs (including the honest note that most of Pass 2's migration landed in
earlier sessions, and the plan doc's own numbers had drifted stale —
source won over labels, per this project's standing rule).
`TINTA-MASTER-TRUTH.md`'s verification header refreshed (38 smoketest
files, 39 modules, 142 exports). healthView.js's and app.js's
Pass-3-era header comments updated to describe the finished state instead
of anticipating it.

Final state: full smoketest suite green (38 files, 0 failures), 39/39
modules load, 142 exports verified, `node --check` clean across `js/`,
and the app boots and clicks through every view in a real browser.

## Session 26 — the canvas-and-trio pass (last four views out of app.js, fonts self-hosted, em-dash copy swept)

The v0.2 plan deliberately deferred Write/Notes/Search ("highest-traffic,
most entangled") and Canvas was the last clean win it anticipated. This
session extracted all four under the same discipline as every slice before
(full suite green before starting, green after each extraction,
`node --check` clean throughout), plus the two standing asks from the
review: fully offline fonts, and finishing what Pass 4 started on em-dash
copy.

**View extractions, one at a time, suite green after each:**

- **canvasView.js** — the eighth extracted view (Health's numbering):
  all five canvas state vars, the viewBox constants, the entity-type
  presentation helpers (`entityTypeLabelPlural`/`entityDotClass`/
  `entityNodeClass`/`entityColorStyleAttr` — exported, since Notes renders
  through the same three), `renderCanvasView`, `canvasHintText`,
  `openRelationshipEditModal`, and the SVG portrait resolver. The shared
  portrait-URL registry stays owned by app.js; canvasView reaches it
  through new `trackEntityPortraitUrl()`/`revokeEntityPortraitUrls()`
  exports. Node-click now jumps through the existing
  `setActiveView`/`setActiveEntityId` setters. app.js's global Escape
  handler calls the module's `cancelCanvasLinkMode()` instead of touching
  canvasLinkMode inline.

- **searchView.js** — ninth: all six search state vars and the five
  render/highlight functions. Jump rows go through setters
  (`setActiveChapterId`/`setActiveView`, plus `setActiveMapId`/
  `setActiveSystemId` imported from their own view modules rather than
  through app.js). The Organize modal's saved-search runner now calls the
  module's `applySavedSearch()` instead of writing the old module-level
  vars. `flashAndScrollTo` deliberately stayed in app.js (Outline uses it
  too) and gained an export.

- **notesView.js** — tenth, the largest slice: renderNotesView, the
  debounced entity-field save (with its two state vars), renderEntityDetail,
  renderEntityStatusList, and the `activeEntityId`/`entityTagFilters`
  state. `setActiveEntityId` moved with its state and is re-exported from
  app.js (Health's and Map's imports unchanged — the last of Health's four
  jump-target setters to make the trip, exactly as app.js's comment
  anticipated). Project-switch reset goes through the module's
  `resetEntityTagFilters()`; init's pagehide/beforeunload registration
  stays in app.js and calls the module's exported `flushEntityFieldSave()`.
  The type managers (`openEntityTypeManager`/`openChapterTypeManager`) and
  `openEntityHistoryModal` stayed in app.js — modal infrastructure shared
  beyond Notes — and gained exports.

- **writeView.js** — eleventh and last inline view: renderWriteView,
  closeToolbarPopoversOnOutsideClick, and parseImportedFile (it follows
  its only caller). `currentEditorHandle` moved with the editor it owns
  and is re-exported from app.js as a live binding
  (`export { currentEditorHandle } from './writeView.js'`), so
  grammarModal's read is unchanged. `activeTextareaEl` stays owned by
  app.js (the Image Library reads it) with a new `setActiveTextareaEl()`
  setter. renderSidebar/showToast/showGoalCelebration/updateFocusButtons/
  openChapterTypeManager/openHistoryModal/openExportMenu/STATUS_ORDER are
  now app.js exports — the same "modal infra and app chrome stay home"
  line drawn by the earlier extractions.

- **Real bug fixed by the Write extraction:** since Pass 4,
  `closeToolbarPopoversOnOutsideClick` (module level) called
  `closeToolbarPopovers`, which only existed as a renderWriteView-local
  function — every outside click while Write was mounted threw a
  ReferenceError and the Details/More/Bookmarks popovers never closed on
  outside click. The closer is now module-level in writeView.js (the
  popovers sit at stable ids; no captured locals needed) and works.

**Net:** app.js went 7,061 → 5,277 lines; every one of the app's 20 views
now renders from its own module (plus modal/inspector modules). sw.js's
SHELL_FILES and module-load.smoketest.mjs grew to match: **43/43 modules
load, 164 exports verified**. sw-precache.smoketest.mjs caught one missed
SHELL_FILES registration mid-pass (notesView.js), exactly the drift bug it
exists for.

**Fonts self-hosted (fully offline now).** The Google Fonts stylesheet
link (the app's only remaining CDN dependency) is gone: `css/fonts.css`
+ `fonts/*.woff2` carry the same five families (Literata, Fraunces,
Inter, JetBrains Mono, Atkinson Hyperlegible), same latin unicode-ranges,
same `font-display: swap`, ~267 KB total. The six woff2 files precache
with the shell. Generated by `scripts/selfhost_fonts.py` from the
css2 API (regenerate there if the families ever change); sw.js's
cross-origin fetch-guard comment updated to reflect that fonts are
same-origin now.

**Em-dash copy swept (Pass 4's item, finished in full).** Pass 4 fixed
only the multi-dash parenthetical asides and explicitly left single-dash
strings; the writer asked for the rest. A small lexer (strings vs.
comments vs. code, template-interpolation aware) inventoried **243
in-string dashes** across the app's copy; all user-facing ones were
hand-reworded (~200 sites across 25 files: titles now use `·`
separators, prose asides became commas/colons/parentheses/periods, the
`— Unset —` / `— None (top-level) —` / `— or —` placeholder convention
retired to plain words, `Snapshot — date` → `Snapshot · date`,
screenplay slug lines to the ASCII hyphen convention,
provenance badges now read `Generated by X · edited since`). Deliberately
untouched: code comments (users never see them), the `'—'` entry in
manuscriptExport's `SCENE_BREAK_LINES` (that's scene-break *detection*
for imported manuscripts, not copy), the en dash in Book mode's
"Page 1–2" range, and invisible HTML comments inside one settings
template. One smoketest assertion updated with the copy
(organization.smoketest.mjs's titleSeed check).

**Version:** TINTA_VERSION bumped to 0.2.1 by hand, per the manual-bump
convention.

Final state: full smoketest suite green (38 files, 0 failures), 43/43
modules load with 164 exports verified, `node --check` clean across all
of `js/`, fonts served same-origin, and the UI copy carries no em dashes.

## Session 27 — the registry pass (v0.2 Phase 5 close-out)

The archive doc came back off the shelf (§55's Phase 5 list, re-read
against source), and three Phase 5 items turned out to have never been
audited, plus Phase 2 had never produced its written deliverable. This
session closes all of it; the reconciliation lives in
`docs/CANONICAL-MODELS.md` (new, the Phase 1 architecture map + all
fourteen canonical concepts with verdicts).

- **js/commands.js — the command/shortcut registry.** Before this, three
  hand-synced surfaces described the same shortcuts: app.js's inline boot
  keydown handler (the only real behavior), the display-only SHORTCUTS
  list for Settings, and ~30 undocumented widget-local handlers. The
  registry collapses the first two into one list: `COMMANDS` entries carry
  display shape (label/group/keys) and, for app-level commands, real
  `run` behavior with per-entry preventDefault semantics ('before' /
  'when-ran' / false) preserving the old handler exactly, including the
  load-bearing undo/redo text-field guard (native undo keeps working while
  typing — carried over with its full rationale). The Settings help table
  renders from the registry (and gains the Undo/Redo rows it never had),
  and the palette's index gains runnable command rows (Undo/Redo today,
  fuzzy-matched alongside chapters/entities/projects; empty-query default
  stays recent-activity only). The deliberate boundary, documented in the
  module header: widget-local keydown stays with its widget (editor
  Mod+B/I, palette arrows, nav flyout roving focus, Enter-to-add inputs);
  those appear as metadata-only entries so the help table stays
  single-sourced. Bug caught by its own smoketest on first run: the combo
  matcher compared case one-sidedly and never matched Escape.
- **confirmDialog — native confirm() fully retired.** 27 sites across 9
  files migrated onto one themed, accessible dialog (modal.js):
  role=alertdialog, focus moved in (cancel button when danger, the least
  destructive action) and restored on close, message is plain text escaped
  internally (native confirm's contract, kept), Escape captured and
  stopped from also closing a host modal, one-at-a-time supersession.
  Owns its own #confirm-root at z-index 70 on purpose: openModal() tears
  down open state, native confirm never did, and two migrated sites fire
  from inside an open modal. The Canvas rename's OK/Cancel-as-two-actions
  became a labeled two-button choice ("Rename everywhere" / "Only this
  one") — strictly clearer than the native dialog it replaces.
- **openRelationshipDrawer — the Inspector's last named gap.**
  openContextDrawer now dispatches 8 kinds; entity drawer relationship
  rows keep their jump-to-other-entity click and gain a quiet "details"
  affordance that peeks at the record itself (status, strength, story-time
  span, notes, history path, links to both entities, jump to Canvas).
  Read-only by design: editing stays in the Canvas's relationship editor.
- **docs/CANONICAL-MODELS.md (new).** The Phase 2 deliverable: the
  UI → controller → domain → persistence map, then all fourteen archive
  concepts (Entity, Relationship, Event, Time, Location, Rule, Resource,
  State, Scene, Reference, Generator, Scenario, Revision, Query) with
  their canonical home and an explicit verdict — including the declined
  ones (Resource, State, Scenario: engines follow features, not wishes)
  and the separate-on-purpose ones (two relationships, two revision
  engines). Phase 6 stays in v0.3 per the archive's own §59.
- **Tests:** commands.smoketest.mjs (69 assertions: registry contract,
  dispatch semantics incl. shift-exactness and the text-field guard, book
  view gate, palette rows, display helpers) + modal.smoketest.mjs's
  confirmDialog sections (19 new: every close path, focus discipline,
  supersession, escaping). module-load.smoketest.mjs: 44 modules, 184
  exports. sw.js SHELL_FILES gains commands.js.
- **Known remnant, deliberately left:** the Canvas link flow still asks
  for a label via native prompt() — the one OS dialog left in the app; a
  future promptDialog() on the same pattern can absorb it.
  (Correction, Session 29: the count was wrong — two more prompt()s and
  one alert() were also live; all four closed in Session 29.)

**Version:** TINTA_VERSION bumped to 0.2.2 by hand, per the manual-bump
convention.

Final state: full smoketest suite green (38 files, 0 failures), 44/44
modules load with 184 exports verified, `node --check` clean, and a live
browser pass at the registry dispatch (Mod+K, Mod+Z end-to-end undo),
Settings table, themed confirm (danger focus + Escape cancel), and the
relationship peek end-to-end.

## Session 28 — the font-restore patch (custom font survives backups, picker stops lying)

User report, filed as "the added font is not showing on the fonts one —
should I manually install it first even if it's inside the file?": a
font added to Tinta wasn't there after coming back to the app, and the
working assumption was that a bundled font file might need an OS-level
install first. It doesn't — Tinta's Font picker is a fixed list fed by
@font-face and FontFace registration, not a system-font enumerator, and
nothing about a font needs installing outside the browser. The report
did point at a real gap, though, and the audit under it grew into this
patch.

- **The actual gap (backup.js).** The customFont *metadata* (family +
  fileName) lives in the localStorage db and always traveled inside
  Store.exportFullBackup(); the font *bytes* live in assetstore.js's
  IndexedDB and never did — the same shape of gap images had in Session
  18. So a full backup taken with a custom font active, restored into a
  fresh browser, produced exactly the reported symptom with extra steps:
  the picker showed "MyFont (custom)" while [data-font="custom"]
  silently rendered Literata through the CSS-var fallback. Export now
  bundles the bytes (only when the metadata says a font is picked; a
  failed blob read skips the font instead of failing the backup), import
  puts them back, and the "replaces everything" sweep deletes the local
  blob when the incoming db says no font is picked — the image-GC
  discipline, one layer over. Restore also live re-registers the FontFace
  (Theme.registerCustomFont) so the font renders immediately, not just
  after the next reload, and the restore toast says the font came back.
- **Self-heal (theme.js initCustomFont).** Metadata-without-bytes can
  also arise outside backups (asset store cleared separately). Boot now
  stands the picker down honestly: manuscript font falls back to
  Literata, the remembered filename stays visible in Settings with a new
  "bytes are missing, re-upload" note (app.js), instead of the picker
  claiming a font the page can't render.
- **Tests.** hardening.smoketest.mjs section 8 (export skip/no-font
  paths, import mirror + sweep + legacy-shape degradation, fontRestored
  reporting) — the Node half of the story, where the blob store is
  unavailable by design. tests/04-font-restore.spec.js is the byte-level
  half in a real browser: upload → applies live → survives reload →
  rides the backup download → asset store deleted out from under the
  metadata (self-heal asserts) → restore through the themed confirm →
  font renders again and survives one more reload. The spec caught one
  more real gap on its first run (the mid-session re-register above);
  its own boot race was the only other fix needed. Playwright 6/6, full
  smoketest suite 38 files green.
- **Also answered in passing:** the Font picker's three built-ins
  (Literata, Atkinson Hyperlegible, JetBrains Mono) are the manuscript
  choices by design — Fraunces and Inter are self-hosted for display/brand
  surfaces and are not meant to appear there; own fonts go through
  Settings → Appearance → "Upload a font file", no install required.

**Version:** TINTA_VERSION bumped to 0.2.3 by hand, per the manual-bump
convention.

Final state: full smoketest suite green (38 files, 0 failures), 44/44
modules load with 184 exports verified, Playwright 6/6 across the four
spec files, `node --check` clean.

## Session 29 — the dialogs pass (zero OS dialogs, and a bookkeeping correction)

The Session 27 close-out recorded native prompt() as "the one OS dialog
left in the app." A fresh live audit for the v0.2-completeness question
found that bookkeeping wrong: it counted the Canvas relationship-label
prompt but missed two more prompt()s (Library rename, Canvas preset
naming) and one real native alert() (the generator's seed notice). This
session closes all four and corrects the record.

- **modal.js: promptDialog() + noticeDialog().** Both on the exact
  confirmDialog skeleton: same lazily-created #confirm-root layered above
  modals, plain-text messages escaped internally, capture-phase Escape a
  host modal underneath never sees, focus moved in and restored on the
  way out. promptDialog() keeps native prompt()'s contract precisely —
  the RAW input value resolves on OK/Enter (callers keep their own
  trim/empty handling verbatim), null on cancel/Escape/backdrop, default
  preselected on open. noticeDialog() is alert() minus the OS chrome —
  one OK button, newlines preserved via the confirm-message pre-line
  rule, alertdialog semantics. The shared pending-dialog slot now carries
  each kind's own cancelled value, so a dialog superseded by a DIFFERENT
  kind resolves per its own contract (a superseded prompt is null even
  when a confirm replaces it) — the smoketest caught this the same hour
  it was written.
- **Migrations (4):** Library rename (fires inside the OPEN Library
  modal — the layering case the independent root exists for), Canvas
  preset naming, Canvas relationship labels (the registry pass's
  documented remnant), and the generator seed notice. Zero native
  dialogs remain in js/ — every dialog in the app is now themed,
  keyboard-accessible, and Escape-layered.
- **Tests:** modal.smoketest.mjs +19 (raw-value/null contract, all
  cancel paths, cross-kind supersession matrix, notice's true/false,
  newline preservation, escaping, focus discipline) — 90 asserts total.
  A live browser pass drove all four flows end-to-end (rename above an
  open modal with the app's focus-glow styling intact, preset listed,
  relationship created with the typed label, seed notice pre-line and
  dismissed cleanly, zero console errors). Playwright 6/6.

**Version:** TINTA_VERSION bumped to 0.2.4 by hand, per the manual-bump
convention.

Final state: full smoketest suite green (38 files, 0 failures), 44/44
modules with 184 exports verified, Playwright 6/6, `node --check` clean.

## Session 30 — the first user-report UX round (theme-blind controls, settings bleed, corner-anchored toolbar)

The v0.2.5 plan was agreed in advance: the writer tests 0.2.4 end to
end and points at anything off; the findings become the 0.2.5 worklist.
This session is that first batch, reproduced and fixed from the live
app in Void theme (where UA-default controls glare the hardest).

- **base.css: `color-scheme` per theme.** Every dropdown's fall-out
  option list, the date/time pickers, checkboxes, range sliders, and
  scrollbars are drawn by the browser, not the stylesheet — with no
  color-scheme declared they rendered OS-light even in Void (white
  select popups off dark modals, UA-blue volume sliders, white
  checkboxes). Declared once per theme block (light for paper/sepia,
  dark for void) so every native control app-wide — including ones not
  yet written — follows the theme. The grammar modal's date-input
  color-scheme patch predates this and is now redundant-but-harmless.
- **base.css: zero-specificity fallback for bare fields.** A
  `:where(...)` rule (font inherit, `--paper`/`--ink`/`--rule`, 9px
  radius) catches any text-like input/select/textarea no pass styled:
  orphans used to render as raw UA chrome. Text-like types only —
  checkbox/radio/range/color/file keep native controls under
  color-scheme. Because it's zero-specificity, every existing rule in
  every other file still wins unchanged.
- **modals.css: `.organize-part-select`** joins `.organize-folder-select`
  — the containers pass added the Part select unstyled, so it sat as a
  white UA box next to its themed sibling in the Organize rows.
- **modals.css: `.snippets-capture input[type="text"]`** joins the
  capture-row textarea rule — the Decisions view's three capture inputs
  ("What did you decide?" / why / alternatives) rendered as white UA
  bars in Void ("decisions looks off"); they now match the intended
  capture look.
- **tools.css: settings jump-links pin flush.** A sticky element's
  constraint rectangle is inset by the scroller's own padding, and
  `.modal-panel` pads its top by a hardcoded 20px — so `top: 0` let the
  bar rest 20px below the panel's visible edge, leaving a strip where
  scrolled sections showed through above the tabs ("the top of the
  settings bleeds through"). `top: -20px` cancels the padding; the
  stale comment claiming the header wasn't in the scroll flow is
  rewritten with the actual mechanics.
- **shell.css: `#new-from-template-btn`** — it sat in the Chapters row
  completely unstyled, a raw white UA pill glaring out of the dark
  sidebar ("template looks off, not same color as the rest"). Now the
  same mono family as its "+ New" sibling, one step quieter
  (ink-faint, accent on hover).
- **editor-view.css: `.write-toolbar` spans the view.** The toolbar was
  a centered 720px column matching the page, which parked the icon
  cluster's left edge at the page's midpoint — the icons read as
  floating at the center of the chapter-start header. Full width plus
  the nav bar's 28px side inset pins the cluster to the view's
  top-right corner, vertically aligned with ⌘K above it.

Two report fragments stayed unreproduced ("block the autosave → the
highlight is background, same as when clicking background", and an
"error in text" on deleting in Appearance): the font upload → replace →
remove flow was driven end to end in a live browser with a real .ttf
(clean, no stray text), text selection renders UA blue, and the
flash/jump highlight uses `--accent-glow`. Left to the next test round
with a request to re-point at them if still visible.

Verification: programmatic audit across all 20 views and the Template/
Images/Organize/Settings modals — zero controls still carrying
UA-default styling; before/after screenshots in Void for every fix.
Full smoketest suite 38 files green, Playwright 6/6, `node --check`
clean. CSS-only changes plus the version bump; no JS behavior touched.

**Version:** TINTA_VERSION bumped to 0.2.5 by hand, per the manual-bump
convention.

## Session 31 — the second user-report round (dialog text entities, drawn controls, jumplink spy, format-toolbar column)

The tester came back mid-round with the two fragments Session 30 asked
to have re-pointed, plus new findings, and this time every one of them
mapped to a hard defect: the delete/trash confirms printed literal
`&quot;`/`&#39;` in their sentences ("Delete &quot;Tina Arts&quot;?
… won&#39;t be removed."), checkboxes were "still white colored, not
theme aware", and the Settings section chips highlighted "the button
behind it, not the button you're in/clicked in" (clicking Autosave lit
Background, clicking About lit Shortcuts).

- **modal.js: the double-escape (the round's core fix).** The dialogs
  pass wrote its templates as "escape here, then interpolate" — but the
  dom-utils `html`` helper the templates render through ALREADY
  auto-escapes every plain interpolation. So a quote became `&quot;`
  (escape one) and then `&amp;quot;` (escape two), and the browser
  displayed the first escape as text: every delete/rename/trash dialog
  in the app showed entity soup instead of `"` and `'`. The redundant
  `escapeHtml`/`escapeAttr` wrappers are gone from all three dialog
  templates (confirm/prompt/notice — title, message, button labels,
  input value/placeholder, aria-labels); plain strings in, escaped
  exactly once by the helper. modal.smoketest.mjs pins it: quoted
  titles must produce `&quot;` but never `&amp;`.
- **base.css: checkboxes and radios are drawn, not delegated.** The
  color-scheme pass deliberately left them native ("the browser paints
  them per scheme") — and the browser's paint still shipped a bright
  white unchecked box into dark sessions (user report, then reproduced
  in a live render: computed `color-scheme: dark`, painted white
  anyway). `appearance: none` takes them off the UA's hands entirely:
  `--paper` fill, `--ink-faint` border, `--accent` checked state with a
  paper tick (clip-path) on the cozy settle easing, hover/focus-ring/
  disabled states matching the rest of the app. Per-component size
  overrides still win; only the paint is pinned.
- **base.css: selects off the UA's hands too.** The same render audit
  caught Chromium's select widget paint flipping between the themed
  face and a raw light-face widget depending on render order — the same
  flake family that produced the white checkboxes. `appearance: none`
  plus a small `currentColor` chevron (drawn from two background
  gradients, so it follows each theme's ink) makes the closed face
  deterministic; the dropdown list itself stays native under
  color-scheme. The chevron's background longhands and its
  `padding-right` carry `!important` deliberately — per-component
  select rules style themselves with `background:`/`padding:` shorthands,
  which would otherwise wipe the chevron; this is the one cascade anchor
  that has to survive them.
- **base.css: range sliders get `accent-color: var(--accent)`.** The
  volume sliders were the UA default blue — the only blue thing in the
  room.
- **app.js: the Settings jump-link scroll-spy was off by one header.**
  Clicking a chip scrolls the section heading to `header + 12px` below
  the panel top, but the spy line sat at `scrollTop + 40` — with a ~56px
  header, every freshly-jumped-to section landed ~28px BELOW its own
  spy line and the previous section kept the gold highlight. The spy
  now derives its offset from the same header height the scroll uses
  (plus slack), and a bottom clamp lights the last section when the
  panel can't scroll any further (About could previously never light
  up at all).
- **tools.css: `.format-toolbar` joins the manuscript's column.** B /
  highlight / quote floated full-width-left while the chapter heading,
  paper, and footer are all the same centered 720px column — the four
  buttons read as misplaced icons at the chapter-start height ("the
  facing icons are misplaced, almost at the center of the chapter
  starting"). Same `max-width: 720px; margin: 0 auto` as its siblings
  now, so they sit on the paper's own top edge.
- **index.html: the Template chip lost its 📄.** The emoji renders as a
  bright white page glyph next to the quiet mono "+ New" — the
  remaining "not same color as the rest" after Session 30 styled the
  button itself. Text-only now, matching its sibling.
- **modals.css: confirm panels get an edge on Void.** Panel `--paper`
  and page `--bg` are near-identical there and the shared 8%-white rule
  border all but vanished, so small confirms read as faint floating
  text ("decisions looks off"). One notch more border light under
  `[data-theme="void"]`; light themes untouched.

Verification: full smoketest suite 39 files green (modal's grew 90 → 93
with the double-escape pins), Playwright 6/6, `node --check` clean.
Live-browser probes on Void: delete/trash confirms render real quotes;
search + settings checkboxes draw themed; a checked box fills bronze
with a paper tick; sliders are accent-tinted; settings selects and the
Organize row selects paint dark with chevrons; every jump-link click
lights its own chip including About; the format buttons sit on the
paper's left edge. Version stays 0.2.5 — the test round is still open;
this batch rides it.

## Session 32 — the 0.2.6 foundations pass (de-hub, workspace context, one vocabulary, one intent, one empty state)

Scope agreed with the user mid-test-round: the unification program ships
as **0.2.6** (it's all inside the current codebase — zero new features,
zero surface change), sitting between the open 0.2.5 test round and the
0.3 "coming home" work (Welcome Back + collapsible rail + onboarding).
The pre-flight audit that scoped it: five verified gaps (workspace state
scattered across six modules, 47 `data-jump-*` sites speaking four jump
dialects, ~8 vocabularies re-deriving label/valid logic by hand, 21
hand-rolled "No X yet" strings, and app.js still a hub — 18 modules
importing back into it).

- **Pass 0 — de-hub.** The generic surfaces that made app.js an API
  moved to their natural homes: `capitalize` → dom-utils.js;
  `STATUS_LABEL`/`STATUS_ORDER` → new vocabulary.js; `showToast`,
  `showGoalCelebration`, `showStorageWarning` and the shared toast shell
  → new toast.js; `downloadTextFile`/`downloadBinaryFile`/`safeFilename`
  → new file-utils.js; `els` → new els.js; and `closeModal` → modal.js,
  where #modal-root always belonged — with app.js's accreted Library
  cleanup now registering through modal.js's new `onModalCloseCleanup`
  hook (behavior contract byte-identical: TTS stop, wasOpen-gated filter
  reset, cover-URL revocation, listener removal, then teardown). All 18
  importers re-pointed; app.js keeps one-release re-exports as
  deprecation shims.
- **Pass 1 — context.js.** One canonical workspace-state module:
  `activeView`, `activeChapterId`, `activeEntityId`, `activeSketchId`,
  `activeMapId`, `activeReferenceId`, `activeSystemId`,
  `currentEditorHandle` — previously split across app.js, writeView,
  notesView, mapView, referencesView, and systemsView. Live bindings for
  readers, setters for writers, no auto-render (the historical
  set-then-render contract is untouched). ~100 assignment sites
  converted across six files; grammarModal now imports zero things from
  app.js; Health imports only `render`.
- **Pass 2 — targets.js.** The navigation intent:
  `resolveTarget({type, id})` (pure, dangling ids refuse to `null`) +
  `openTarget(target, {render})` (resolve → context write → view switch
  → repaint via injected render, never an import of app.js). Health's
  eight copy-pasted `data-jump-*` handler blocks are now one delegated
  listener speaking the intent; Search's cluster and the remaining jump
  dialects migrate ride-along from here.
- **Passes 3+4 — Vocabulary API + StatusBadge** (vocabulary.js). One
  tiny interface over the eight fixed domains — `vocabularyValues/
  Label/Order/IsValid/IsTerminal` + `vocabularyDomains()` — reading the
  store.js arrays (never copying them) and absorbing per-domain shapes
  (label maps, `{key,label}` entries, display-ready strings). Labels
  fall back gracefully on unknown values; terminal states are
  status-only. `StatusBadgeRender` is the shared presentation face (chip
  + sidebar-dot variants, escaped, data-attribute hooks). First
  adoptions: the chapter-status select (write) and canon-status select
  (Notes) now label through the registry; the new
  vocabulary.smoketest.mjs pins the whole contract (52 asserts) and
  caught two real registry bugs same-session (values() returned objects
  for labeled domains; humanize titled every word — 'Non canon' vs the
  stored-style 'Non-canon', fixed with explicit canon labels).
- **Pass 5 — EmptyState** (emptyState.js). One structural helper for the
  21 hand-rolled "No X yet" moments — deliberately NOT a redesign: the
  default output is the established `.empty-note` paragraph, byte-for-
  byte, with optional icon/action affordances and escape-once-here
  semantics (empty-state copy often embeds dynamic bits). The content-
  aware copy stays at the call sites on purpose — Map's voice and
  Systems' voice are the coziness, not drift. First adoptions: Map,
  Timeline, and References (both filter-empty and truly-empty variants);
  the rest migrate ride-along.

Verification: full smoketest suite now **41 files green** (new
vocabulary/targets/emptyState suites; 51 modules, 252 exports asserted
by module-load), `node --check` clean across js/ + sw.js. sw.js
SHELL_FILES precaches the six new modules (sw-precache keeps them
honest). One MultiEdit partial-application gotcha hit and recovered via
marker-asserted migration scripts (the same failure mode documented in
Sessions 25 and 27). Version bumps 0.2.5 → 0.2.6; the 0.2.5 test round
stays open in parallel — remaining fragments (autosave highlight
coloring, the "error in text" report) are still flagged back to the
user. What 0.2.6 buys: Welcome Back's getWelcomeContext(), back/forward,
and the framework importer all now have a context, an intent, and a
vocabulary to sit on.

## Session 33 — the 0.2.7 move-out pass (app.js stops being a godfile)

Session 32 broke the hub's *import* edges; this pass moved the *territory*.
The audit was blunt: app.js was still 5,163 lines because every view,
modal, and shared helper that had ever been born inline still lived there.
The fix is one big mechanical move with a render bus on top — no behavior
change, every repaint and every module contract identical.

- **renderBus.js** — the one repaint seam. `setRenderer()` is armed once in
  `init()` before the first paint; every module repaints through
  `requestRender()` (opts pass through, so `render({skipModalClose:true})`
  callers keep their contract). This deletes the last hub edge: 11 modules
  imported `render` back off app.js; now **zero modules import app.js**.
  app.js is 599 lines: boot, the render loop, undo/redo navigation.
- **23 new modules**, moved verbatim with their module-level state:
  sidebar, outlineView, sketchView, bookView, resumeView, questionsView,
  checklistView, annotationsView (dashboards — the Pass 5 side-rule
  batch), historyModals, typeManagers, exportMenu, templatePicker,
  organizeModal (all twelve tabs), library (+ series manager +
  `registerLibraryCleanup`, the modal-close hook from init), settingsModal
  (the 606-line single function, still one function on purpose),
  commandPalette, imageLibrary, projectSwitch (first-open pick, live-state
  teardown, switchToProjectFromLibrary — shared by library, palette, and
  boot), portraits (entityPortraitUrls + resolveEntityAvatar +
  track/revoke), tagFilter, worldTemplates (pure data — the future
  framework importer's anchor), appMeta (version/phase/creator), renderBus.
- **Rehomed into existing modules**: `updateFocusButtons` + tooltip →
  editor.js; `applyMotionSpeed` + scale → theme.js; `flashAndScrollTo` →
  dom-utils.js; `activeTextareaEl`/setter + `navHandle`/setter → context.js
  (same live-binding shape as currentEditorHandle). The 0.2.6 re-export
  shims on app.js are gone — module-load's app.js assertion is now just
  `render`. Dead code removed: `sprintState`/`sprintTickId` (orphans since
  the sprintPanel extraction) and a zero-caller `themeLabel`.
- **Three latent runtime crashes found by the audit and fixed**: app.js
  still assigned `activeEntityId` directly (strict-mode ReferenceError) in
  three places since the binding moved to context.js — undo/redo of an
  entity mutation (navigateToMutationTarget), the palette's entity pick,
  and the sketch link chips. All three now go through
  `setActiveEntityId()`; all three are probed live.
- **Migration method**: marker-asserted Python surgery (exact range +
  anchor per chunk, overlap checks, computed import preambles re-verified
  by a second identifier scan, node --check gate before anything shipped).
  Two engine bugs were caught by the gates and fixed: the `setNavHandle`
  wrap lost its closing paren, and the setRenderer insertion ate the
  storage-headroom handler's closer. The `DOMContentLoaded` boot line was
  initially swept into library.js and returned to app.js;
  `organizeModalTab` was missed by the chunk table and relocated after the
  live probe caught the ReferenceError.
- **module-load.smoketest.mjs** now asserts 74 modules / 328 exports
  (app.js: `render` only; context.js gains the textarea + nav-handle
  quartet; editor/theme/dom-utils gain their moved exports). sw.js
  SHELL_FILES precaches the 23 new modules (network-first, no cache bump
  needed).

Verification: full smoketest suite green — **2,056 asserts, 0 failures,
exit 0**; Playwright **6/6** (real browser boots the new module graph);
live probes **31/31** (palette entity pick, entity undo/redo + toast,
sketch via the bus, five modals, all twenty views non-blank with zero
console errors, library grid) plus a micro-probe round (sidebar row →
write, history, export menu, both type managers). Version bumps
0.2.6 → 0.2.7; phase becomes "Move Out". What this buys: 0.3's Welcome
Back grows resumeView.js instead of app.js, the collapsible rail grows
sidebar.js/nav.js, and the framework importer extends worldTemplates.js —
nothing re-inflates the shell. The remaining big file, store.js (7,143
lines of pure CRUD), is queued as its own facade-preserving split.

---

## Security & correctness audit pass (external review response)

Worked from an external code review of the v0.2 codebase. Fix order followed
the review's own "Immediate → Next → Architectural" grouping.

### Immediate — shipped

**1. Stored-data XSS in the rule/system drawer** (`js/drawer.js`)
`metaRow()` routed every value through `raw()`, so ordinary project data —
rule-node Category/Rank/Cost/Cooldown/Range/Duration/Limitation/Counters —
became live markup. Since projects arrive via `.tinta` import, a malicious
file could carry the payload. `metaRow()` now interpolates through the
`html``` tagged template, which already distinguishes `SafeHtml` (pass
through) from ordinary strings (escape). `raw()` is back to being an
audited escape hatch — the only remaining uses in the file are
`renderClickableMentions`, which escapes first and then builds markup.

Two bugs fell out of the same fix:
- The Tags row was rendering `[object Object],[object Object]`. The old
  `'value' in valueHtml` check never matched arrays, so an array of
  `SafeHtml` chips stringified instead of joining.
- Seven call sites were **double-escaping** by passing `escapeHtml(...)`
  into something that escapes again (`&` rendered as `&amp;`). Removed.

**2. Stored-data XSS in the "What's New" banner** (`js/app.js`)
Built with DOM APIs (`createTextNode` / `textContent`) rather than
migrated to `toBridge()`. The `innerHTML` site is *gone*, not made safe,
so there is nothing there to regress. `app.js` now has exactly one
`innerHTML`: an `= ''` clear.

**3. Autosave could report "Saved" after a failed write**
`updateChapterContent()` / `updateChapterPosition()` now return `save()`'s
boolean instead of swallowing it (`false` for a missing chapter, cross-tab
staleness, quota, or unreachable localStorage).

The dangerous half was never the label. `editor.js` keeps a
`lastSavedValue` watermark and skips the blur/unload flush when the
textarea matches it — and the old code advanced that watermark on failure.
So a failed persist didn't just show a green light, it convinced the
editor there was nothing left to flush, and the prose was dropped at the
next chapter switch. Both save paths now advance the watermark only on a
genuine persist, and the footer gained a third state ("Not saved",
`--status-draft`, the same ochre the storage-warning banner uses).

Pinned by `js/save-truthfulness.smoketest.mjs`. Harness note: going
cross-tab stale is terminal for a module instance (recovery is a page
reload, and store.js ships no reset hook), so that case must run last.

**4. Image imports created cross-project asset coupling**
Import minted a fresh *project* id but reused incoming *image* ids, while
`ImageStore` blobs are keyed globally. Importing the same `.tinta` twice
gave two projects one shared blob per id, so deleting an image from one
broke it in the other.

Import now mints fresh image ids and rewrites every reference via a deep
tree walk (`remapImageIds`). A walk rather than a known-field list because
image ids live in two structurally different places: whole-value id fields
(`coverImageId`, `entity.imageIds[]`, `primaryImageId`, `map.imageId`,
`reference.imageId`) **and** `{{img:id}}` tokens embedded in chapter and
scene prose. A field-by-field rewrite would have left every imported
chapter full of broken inline art while the catalog looked perfectly
healthy. Matching on exact string equality plus the token pattern is
precise in both directions and survives a future field being added.

This is option (A) from the review. Option (B) — a compound
`(projectId, imageId)` blob key so asset lifetime matches project
lifetime — remains the better end state and is still open; (A) makes the
current global keyspace correct without an IndexedDB migration.

Delete-side guard added regardless: metadata always goes, but the shared
blob only goes when `Store.isImageUsedByOtherProjects(id)` is false. New
imports can't collide any more, but a db that already double-imported
before this pass can.

Coverage added to the existing double-import smoketest — the review
correctly noted that test verified project duplication but not image-store
isolation.

**6. Mobile breakpoint (≤800px)**
The review's diagnosis was right and its suggested fix would not have
worked. Moving `.sidebar { display: none }` after the base rule in
`shell.css` still loses, because `polish.css` loads later (index.html link
order) and re-declares both `.sidebar { position: relative }` and the whole
`#app-shell.sidebar-collapsed` rail at equal specificity.

The mobile treatment therefore lives at the **end of `polish.css`**, which
already owns the burger-sidebar concern, with a pointer comment left in
`shell.css` explaining why it isn't there.

It is an off-canvas drawer, not `display: none`. Hiding the sidebar
outright fixes the layout by removing the mobile writer's only route to the
chapter list. `#mobile-nav-btn` is created in `app.js` and rendered into
`.view-tabs` (inside `.main`) — deliberately *not* inside the panel it
reveals, which is why the existing `.sidebar-toggle-btn` couldn't serve.
Backdrop dismiss, Escape dismiss, and auto-close on chapter/view selection.
A persisted `collapsed: true` is neutralised at mobile widths, or the
drawer would open showing a 56px rail with its chapter list stripped out.

`js/css-cascade-order.smoketest.mjs` rebuilds the real cascade from
`index.html`'s link order and asserts the winning declarations at 390px and
1200px, plus a general "dead declaration" lint (a media-scoped rule an
equally-specific later unconditional rule overrides at every width it
covers). This bug class bit twice in one session, so a comment wasn't
enough. Both the linter's checks were mutation-tested; the first version of
the dead-rule check was itself buggy and passed against a reintroduced
bug — mutation testing is what caught it.

### Next — shipped

**5. Workspace density wired into navigation**
`getVisibleNavGroups(density)` derives the nav instead of painting
`NAV_GROUPS` verbatim; `attachNavTabs` takes a `getDensity` callback and
reads it per-paint, so a Settings change applies on the next render.
Switching to a density that hides the current view redirects to Write
(`isViewVisibleAtDensity` / `DENSITY_FALLBACK_VIEW`) rather than stranding
the writer on a panel with no tab back to it.

`SIMPLE_HIDDEN_VIEWS` is not invented — it is exactly the list the Settings
copy has always promised. Two honesty corrections were needed:

- **"Maximum adds dev/test surfaces" was aspirational.** Cross-checking
  `NAV_GROUPS` against `app.js`'s render dispatch shows all 20 views already
  appear in the nav; there is no hidden surface for maximum to reveal.
  Rather than invent a fake one, maximum resolves to the same set as normal
  and the copy now says so, with the reservation stated explicitly.
- **Onboarding and Settings disagreed.** Onboarding promised "Write, Notes,
  Outline, Search. Everything else hidden"; Settings enumerated nine hidden
  views. Implemented the Settings list (more precise, and far less drastic
  for a first-run user) and corrected the onboarding copy to match.

Deep links into a hidden view (e.g. a drawer's "jump to Timeline") are
deliberately still allowed — the view renders, it just has no tab. Blocking
them would break legitimate contextual navigation.

**7. Prototype / inherited-property collisions in project maps**
`project.entities[id]` and friends are plain objects, so every
`Object.prototype` key answered a lookup as a stored record:
`getEntity('constructor')` returned the Object constructor *function* and
passed the getter's truthiness check.

Added `ownGet()` / `ownHas()` in `store-core.js` and applied them across
the entity, relationship, rule-system, system-node, timeline, map, marker,
reference and image getters.

`Object.hasOwn` rather than null-prototype dictionaries **on purpose**: the
db round-trips through `JSON.parse` on every load, which always produces
ordinary-prototype objects, so a null prototype set at creation time would
silently vanish at the next reload — the appearance of a fix without the
substance. Covered in `hardening.smoketest.mjs`; mutation-tested.

**8. Onboarding chips are keyboard accessible**
Converted from `<div>` to real `<button type="button">` with
`role="radio"`, `aria-checked`, `role="radiogroup"` containers, a
`:focus-visible` ring, and arrow-key selection. The three near-identical
handler blocks collapsed into one `wireChipGroup()` so they can't drift.
`aria-checked` is set with explicit `"true"`/`"false"` strings — a raw
boolean interpolates to an empty attribute value.

**9. Theme initialization storage guard**
`store-core.js`'s `load()` deliberately guards its localStorage reads, but
`theme.js` read `tinta:db` / `scriptorium:db` unguarded — so a
private-browsing lockdown got *past* the store layer only to throw during
theme init, taking the boot with it. Two boot paths, one storage
assumption; now they agree.

**12. Image deletion shows real usage**
The confirmation used to shrug ("any chapter still referencing it will show
a broken-image placeholder") — a safe fallback, but not an informed choice.
`Store.findImageUsage(id)` now lists exactly where the image is used
(chapters, scenes, entities, maps, references, project cover), capped at 8
with an overflow count. `.confirm-message` already had `white-space:
pre-line`, so no CSS was needed.

### Also fixed — not in the review

`settingsModal.js` called `navHandle.requestRender()`, a method `nav.js`
has never returned (the handle exposes `render()`). Changing nav style in
Settings threw a TypeError and the nav kept its old style until some
unrelated render came along. Found while wiring density into the same
handle.

### #11 and #13 — shipped in a follow-up pass

**#11 — `.tinta` ZIP parser hardening.**
`parseZipEntries()` (the hand-rolled zip reader) previously trusted every
archive-controlled offset and size without validation: a lying offset
either silently produced `undefined` (plain array indexing past the end)
or threw a native `RangeError` from inside `DataView` — two different
failure shapes for the same "this number lies" condition, one of them
silent. A `requireRange()` guard now checks every offset/length against
the actual file before anything reads from it, so every failure reports
the same clean `Malformed zip: …` message.

Layered resource limits, enforced *while* parsing, not after:
- `MAX_TINTA_FILE_BYTES` (500 MB), checked via `file.size` **before**
  `file.arrayBuffer()` is ever called — an oversized file is never read
  into memory at all. Applies uniformly to both the ZIP and JSON `.tinta`
  variants, since the size gate runs before either branch is chosen.
- `MAX_ZIP_ENTRIES` (5,000), checked before the central-directory loop
  starts.
- `MAX_TOTAL_UNCOMPRESSED_BYTES` (500 MB), checked **incrementally, per
  entry, before that entry's bytes are copied** — this is the one that
  actually matters. A per-entry size cap alone doesn't stop a
  duplication attack: a small file whose central directory lists many
  entries all pointing at the *same* local header, each individually
  valid (its own `dataOffset + size` fits inside the real file), can
  still claim to unpack to far more content than the file contains. The
  running-total check catches this while parsing, so the entry that
  would cross the cap is never copied — a ~2 MB crafted file claiming
  600 MB is rejected having actually touched only its own ~2 MB.
- `MAX_IMAGE_ENTRIES` (2,000) and `MAX_SINGLE_IMAGE_BYTES` (50 MB),
  checked in `readTintaZip` after a successful parse.
- `MAX_PROJECT_JSON_BYTES` (100 MB) and `MAX_MANIFEST_JSON_BYTES` (1 MB),
  checked **before** `JSON.parse` ever touches the string — the point is
  to stop an absurd string from reaching the parser, not to recover
  gracefully mid-parse. `checkTintaFile` duplicates these checks rather
  than calling `readTintaZip` (it's a separate code path), so both got
  the same guard independently.
- Duplicate entry names are now rejected outright.
- The end-of-central-directory search is bounded to the ZIP spec's own
  window (22-byte record + max 65,535-byte comment) instead of walking
  the whole file backwards.

`checkTintaFile` and `importTintaProject` both get their own copy of the
whole-file size gate — in the normal UI flow `checkTintaFile` always runs
first and would already have caught an oversized file, but
`importTintaProject`'s own copy protects any caller that invokes it
directly.

Covered by 47 new assertions in `tinta-package.smoketest.mjs`, each
scenario built as an actual malformed byte sequence (a patched EOCD
entry-count field, a central-directory offset pushed past EOF, a
duplicated-entry archive, oversized real payloads) rather than mocked.
Five of the guards were individually mutation-tested — commented out one
at a time — to confirm the test suite actually depends on each one rather
than passing regardless.

**Process note, for honesty:** while mutation-testing the running-total
guard, an early version of one assertion (`.find(...).message` with no
existence check) threw an uncaught `TypeError` when the guard was
disabled. That crash happened *inside* `tinta-package.smoketest.mjs`,
which temporarily stubs `js/imagestore.js` on disk for the test run and
restores it at the end — but the crash occurred before that restore line,
leaving the real `imagestore.js` overwritten with the stub (missing
`deleteBlob`/`deleteBlobs`) until `hardening.smoketest.mjs` failed with
`ImageStore.deleteBlobs is not a function`, a confusing symptom to debug
from an unrelated file. Recovered the real file from the last delivered
zip, fixed the fragile assertion, and — since this is a real gap in the
test harness's own robustness, not just this one mutation — added a
`process.on('exit', …)` handler right after the stub is written, so
**any** future uncaught exception during this file's run restores
`imagestore.js` on the way out. Verified by deliberately throwing a
`ReferenceError` near the end of the file and confirming the real file
survived byte-for-byte.

**#13 — Custom background image constraints.**
A custom background image was previously stored and decoded at whatever
resolution the person's photo happened to be — a 4000×3000 phone photo
sat in IndexedDB at full size and was decoded by the browser as a
full-resolution `body`-level layer present behind every view for the
whole session. `background-size: cover` (`css/base.css`) was already
correct, so this was purely a decode-cost problem, not a visual one.

`Theme.prepareBackgroundImage(file)` now decodes the picked file via
`createImageBitmap`, and if either dimension exceeds
`MAX_BACKGROUND_IMAGE_DIMENSION` (2,560px — chosen relative to what
`cover` can ever actually show: nothing past the longer screen dimension
is visible, so 2,560px comfortably covers a 2560×1440 display at 1x or a
1280-wide viewport at 2x/retina, with headroom), downscales it via an
off-screen canvas and re-encodes as JPEG (quality 0.85 — a background
doesn't need lossless fidelity, and JPEG compresses photographic content
far better than PNG). An image already within bounds is stored completely
untouched — no needless recompression. `settingsModal.js`'s upload handler
wraps this in the exact same try/catch-and-toast pattern already used for
a bad custom-font file, so a file that can't be decoded at all surfaces as
a clear message instead of silently storing something broken.

The actual decode/canvas/encode work needs a real browser and can't run in
this sandbox's Node-only smoketest suite (same limitation noted under
Testing in `docs/TINTA-MASTER-TRUTH.md` — the Playwright specs in `tests/`
have never executed here). The sizing *decision* itself, though, is pure
arithmetic and was pulled out into its own function,
`computeBackgroundImageTargetSize(width, height, maxDimension)`, so it
could get real automated coverage rather than resting on manual
verification alone. New `theme.smoketest.mjs` — the first smoketest
`theme.js` has ever had — covers within-bounds/at-boundary/over-bounds
cases in both landscape and portrait orientation, aspect-ratio
preservation, and that the `maxDimension` parameter is actually
respected rather than hardcoded. Mutation-tested by swapping the
width/height computation, which correctly failed 7 of the 21 assertions.

### Still open

- **Persistence (review's "architectural" item).** Every mutation still
  serializes the entire db and writes it back to localStorage, so bulk
  operations are roughly quadratic. `perf-large-project.smoketest.mjs`
  still exceeds its timeout — unchanged since before this whole pass, and
  consistent with the architecture rather than a regression. The review's
  framing is right: preserve the current Store API and replace the
  persistence implementation underneath it, rather than micro-optimizing
  `JSON.stringify`.

With this, every numbered finding from the original review (#1–#13) has
been addressed except the persistence architecture, which both the review
and this pass agree is a deliberate, larger undertaking rather than a
quick fix.

---

## v0.2 close-out — doc reconciliation + package.json fix

`TINTA-MASTER-TRUTH.md`'s "three-phase plan" section had drifted behind
source again — it still read "v0.3+ is not started" and never recorded
Pass 3 (the `app.js` view extraction, this doc's own Session 33 entry
above) or the subsequent `store.js` split into 12 `store-*.js` modules,
even though both were long since shipped and green. Corrected to match
current source: `app.js` at 584 lines, `store.js` reduced to a 10-export
barrel, `module-load.smoketest.mjs` at 86/86 modules and 916 exports.
v0.2 is now recorded as done and v0.3 as started, with the persistence
item carried forward as v0.3's first item rather than left ambiguous.

Also fixed: `fake-indexeddb` was imported by
`recovery-snapshot.smoketest.mjs` but never declared in `package.json`'s
devDependencies, so a fresh clone's `npm install` wouldn't have provided
it. Added at the version actually in use (`^6.2.5`); verified with a
clean `rm -rf node_modules && npm install` followed by a fresh run of
that smoketest (13/13 green).

Not done as part of this pass: the Playwright specs in `tests/` (15
files) still haven't executed in this environment — no real browser
available here. Browser-level behavior remains unverified until someone
runs them somewhere that has one.
