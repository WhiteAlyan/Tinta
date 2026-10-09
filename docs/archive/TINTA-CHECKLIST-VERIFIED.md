# Tinta — Verified Checklist (checked against actual source, not just docs)

**How this was built:** unzipped `Tinta.zip` and checked claims against real
code — ran every smoketest, grepped `store.js`/`app.js`/`nav.js` for the
functions/wiring each doc claimed exist, and read the actual pass-by-pass
build log in `docs/ROADMAP.md` (which turns out to be the real ground truth,
more current than any of the three audit docs — see §0).

This file is now the one to trust. The other four docs in `docs/` (README,
ROADMAP, both FEATURE-AUDIT versions, the old TINTA-UNIFIED-STATUS I wrote
last time) can stay for history, but don't re-derive status from them —
re-derive from this, and from source directly if this goes stale.

---

## 0a. Honesty check on methodology (added after being asked "are you sure?")

First pass of this doc verified major categories (smoketests, nav wiring,
big "not built" categories like sync/mobile/AI) but did **not** check
every single item inside the "Foundationals" sections item-by-item. That
was a real gap, not just caution — §2.1's Volume/Part container gap was
missing from the doc entirely until this round. §3 (Revision/Safety/
Review) and §4 (Scene model) got a category-level "mostly not built" nod
last time but not the full item list. All three are now filled in below
(§3b) with direct grep results, not carried-over labels.

**Nothing was deleted from your actual project.** The doc-cleanup last
turn only worked on an extracted copy in this sandbox and produced a
downloadable zip — your real project's `docs/` folder is untouched unless
you apply that zip yourself. The original `TINTA-FEATURE-AUDIT-MAXIMUM-v0_2.md`
and `v0_3.md` are still sitting in `/mnt/user-data/uploads/` from your
earlier upload if you want to keep them regardless.

## 0. What I found that changes the picture from last time

1. **`docs/ROADMAP.md` already existed and is the real build log.**
   I didn't have this file last time. It's more current and more reliable
   than either FEATURE-AUDIT doc — it's written pass-by-pass as work
   actually shipped, with function names, file names, and test counts, not
   status labels. Treat it as primary going forward, above `v0_3`.

2. **My last recommendation was wrong.** I told you "Character arc fields"
   was THE next task, still unbuilt. That's half-true and I should have
   caught the distinction:
   - ✅ **Arc *profile* fields** (want/need/wound/flaw) — actually already
     shipped, silently, inside the "Craft-tools pass." Confirmed live in
     `store.js` (`{ key: 'want', label: 'Want' }` etc. on the Character
     builtin, four separate places) and covered by
     `craft-tools.smoketest.mjs`. This pass predates my last review; I
     just didn't have ROADMAP.md to catch it.
   - 🧠 **Arc *structure*** (starting state → turning points → midpoint →
     crisis → choice → ending state, arc-to-scene links, arc
     visualization) — confirmed genuinely **not** built. Zero hits for
     `turningPoint`/`midpoint`/`crisis` as real fields anywhere in
     `store.js` or `app.js`.
   So "character arc fields" as a single task was already half-done and
   I'd have sent you to re-scope work that shipped. The real remaining
   piece is narrower: **arc structure/visualization**, not arc fields.

3. **The README-session-log gap I flagged isn't a gap.** README's session
   log stops at Session 23 on purpose — `ROADMAP.md` explicitly took over
   as the running log for everything smaller-than-a-numbered-session after
   that point (it says so in its own header). Nothing to backfill.

---

## 1. Ground-truth verification performed this pass

- **Every smoketest run, fresh:** 18 files, **801 checks, 0 failures.**
  (calendar 55, canon-control 43, craft-tools 47, document-type 27,
  generator-domains 39, generator 35, manuscriptExport 54, map 35,
  organization 82, quickwins 53, references 33, relationship-history 26,
  rule-system 35, search 42, seed-foundation 64, series 31, tier3 62,
  worldbuilding-templates 38.) This is real coverage of the data/logic
  layer across every major pass — not a doc claim, an actual re-run.
- **Nav surface confirmed by reading `nav.js` directly:** 20 real views
  wired across four groups (Write: Write/Book · Plan: Corkboard/Outline/
  Timeline/Questions · World: Notes/Canvas/Map/Sketch/References/Systems ·
  Tools: Search/Stats/Health/Checklist/Annotations/Snippets).
- **Current file sizes:** `app.js` 7,458 lines, `store.js` 5,404 lines,
  302 exported functions in `store.js` alone. (Roadmap's last checkpoint
  had app.js at 3,768 after the modal-extraction slice — it's grown ~2x
  since, all new feature surface, not bloat from that slice.)
- **Spot-checked absence of the big "not built" categories** — zero hits,
  confirming these are genuinely untouched, not just undocumented:
  mobile view, sync engine, plugin registry, collaboration, any AI/LLM
  call, universal inspector, simulation (`whatIfScenario`/
  `worldStateVersion`), procedural culture/city/faction generation beyond
  names.

---

## 2. ✅ CONFIRMED BUILT (source-verified, not doc-trusted)

### Writing & editor
Distraction-free/Focus/Zen tiers, Typewriter mode + sound + per-paragraph
dimming, ambient sound, command palette, cursor/scroll memory, autosave,
read-aloud (TTS), grammar/style check (LanguageTool + a `raw` backend seam
for future Archemedeus integration), repeated-word/crutch-word check,
name generator + tiny thesaurus, custom + pronunciation dictionaries,
project style guide, inline formatting (`**bold**`/`*italic*`/color),
inline images, Book/Read mode (CSS multi-column), themes, writing sprints.

### Manuscript structure
Chapters + reordering, Scenes + cross-chapter drag, Corkboard, Outline,
Timeline with real story-date + order, Snippets/idea inbox, chapter
snapshots, word-level diff, semantic chapter/document types (14 builtins,
role-driven — `manuscriptExport.js` actually reads the role, not cosmetic),
7 document templates + custom templates, folders/favorites/pins/recents/
collections/saved-searches/archive/trash (Organization pass — 82/82 tests).

### Worldbuilding
Generic entity-type-template engine (custom types, custom fields, nesting,
cycle-safe parent picker, aliases, tags, backlinks), entity relationships
+ relationship types + rich metadata (status/strength/dates/notes) +
**relationship history over time** (26/26 tests — this resolves the
"current-state-snapshot-only" gap both old audits flagged as open),
Canvas relationship graph + presets, Sketchpad + sketch-to-entity linking,
Maps (types/coordinates/markers/marker→entity), custom calendars (months,
weekdays, real date arithmetic, before/after, duration, flashback
chronology checking), Series/universe management (shared entities/
characters/locations across projects), References/research vault (6 types,
tags, single-link-per-item to entity/chapter/scene).

### Craft / project intelligence
Scene relationships (6 fixed types), story-question/foreshadowing tracker,
Project Health dashboard (orphans, dangling mentions, unresolved
questions), craft analytics (pacing, dialogue ratio, POV distribution),
"what's changed" report, continuity checking, style-guide checking,
completion checklist, **character arc profile fields** (want/need/wound/
flaw on the Character builtin — see §0.2), annotations (8 fixed types +
dashboard tab), bookmarks.

### Worldbuilding systems (the "Maximum Tinta" tier, further than either
old audit credited)
Domain-agnostic rule-system engine with real cycle detection
(`rule-system.smoketest.mjs`, 35/35), starter-system generator wired to it,
Cosmology + Canon-status/Generation-history tracking (`canonStatus` field,
migration-safe), name/entity generator engine (syllable pool, pattern,
Markov, all seeded/deterministic via `createRng`), worldbuilding-entity
drafting (`draftWorldbuildingEntity`) that goes through the real
create-entity path rather than a shortcut.

### Backup / output
Full JSON backup + image-inclusive backup, Markdown export, **DOCX + EPUB
manuscript export** (54/54 tests — resolves the "no manuscript export
beyond markdown" gap both old audits listed as open), service-worker
offline caching.

### Infrastructure
Local-first store, PWA/offline, `app.js` partially modularized (`nav.js`,
5 modals split into their own files — Sprint/ReadAloud/Grammar/Backup/
WordCheck), `style.css` split into 9 concern-based files under `css/`.

---

## 3. 🔲 CONFIRMED NOT BUILT (spot-checked, genuinely zero code)

Small/medium, no new architecture:
- **Character arc structure** — turning points, midpoint, crisis, choice,
  ending state, arc-to-scene links, arc visualization/state comparison.
  (Profile fields are done — see §0.2. This is the narrower real gap.)
- **Knowledge/secrets/mystery toolkit** — character-knows/reader-knows
  tracking, evidence board, red herrings, dramatic irony.
- **Themes/motifs/symbolism tracking**
- **Smart collections** — deliberately deferred, needs the query/filter
  language below first (this is `store.js`'s own stated reasoning, still
  accurate).
- **Search/query foundation** (§9) — the blocker for smart collections
  above; a real filter/query language doesn't exist yet, only literal +
  regex text search.
- **Navigation/workspace layer** — breadcrumbs, back/forward history,
  tabs, split editor, multi-pane, saved layouts. Genuinely zero code
  beyond one unrelated code comment using "breadcrumb" loosely.
- **Universal contextual inspector** — the `[[mention]]`-click entity
  drawer exists but is a narrower, different feature from a "click
  anything, see relevant context" universal inspector.

Larger, separate builds:
- **Contextual AI** — zero LLM/API integration anywhere in the codebase.
  `grammar.js`'s `raw` backend seam is the only thing shaped to plug into
  something like Archemedeus later, and it's inert until wired up.
- **Simulation** — no world-state versioning, no what-if scenarios,
  no historical/civilization simulation.
- **Procedural generation beyond names** — no culture/city/faction
  generators; the generator *engine* (seeded RNG, patterns, Markov) is
  built and reusable, but nothing calls it for anything except names and
  starter rule-systems yet.
- **Mobile companion view** — undecided in scope (responsive layout vs.
  separate lightweight view), not started.
- **Cross-device sync** — undecided in scope, heaviest remaining item;
  `emptyDb()` has been kept flat/JSON-serializable since Session 1
  specifically to leave this option open, but no transport/pairing/
  conflict-handling exists.
- **Collaboration / plugin architecture** — zero code, explicitly
  "design later" per project's own philosophy, no disagreement on that.

---

## 3b. 🔲 FOUNDATIONALS — full item-by-item pass (added after a gap was caught)

The first pass of this checklist summarized categories but did not verify
every single item in the "Foundationals" sections. Re-checked exhaustively
against current source this round — every line below is a direct grep
result, zero hits unless marked ✅.

### §2.1 Document model
- ❌ **Manuscript / Volume / Part as hierarchical containers** —
  deliberately not built. `store.js`'s own comment: *"Deliberately doesn't
  cover Manuscript/Volume/Part from the audit's §2.1 list — those are
  hierarchical containers"* (restructuring `project.chapters` from a flat
  list into a tree, a genuinely different data problem from the
  chapter-type/role registry that **is** built). I missed this in the
  first pass — it's real and still open.
- Everything else in §2.1 (semantic chapter types, 14 builtins) — ✅ built,
  unchanged from last check.

### §2.4 Navigation/workspace — confirmed still fully zero code
❌ Breadcrumbs · Back/forward history · Tabs · Split editor · Multi-pane
workspace · Saved workspace layouts · Pinned inspector · Text anchors ·
Return-to-origin navigation · Smart resume.
(Bookmarks *do* exist — `project.bookmarks{}`, chapter/scene-level "jump
back here" saved points from the Quick-wins pass — but that's a coarser
feature than the "exact-text anchor" bookmark this section originally
meant; worth noting as partial, not a full match.)

### §2.5 Contextual inspector — confirmed still fully zero code
❌ Universal inspector (click anything → relevant context: scene/
character/location/reference/timeline/story-question/relationship/rule/
annotation context, all in one panel). The `[[mention]]`-click entity
drawer is real but narrower — a different, older feature, not this one
wearing a different name.

### §3 Revision / Safety / Review — confirmed still fully zero code
This entire section is open. Only manual named snapshots (Session 6) and
chapter-level trash/soft-delete (Organization pass) exist; nothing below
does:
- ❌ Automatic version checkpoints (snapshot creation is manual-only, one
  button, nothing scheduled or save-triggered)
- ❌ Pre-destructive-action checkpoints, revision branches, branch
  compare/merge, world-state snapshots/diff
- ❌ Text undo, structural undo, project-action history, transactional
  mutations, rollback, crash recovery, backup rotation/integrity
  validation, restore preview
- ❌ Any review layer at all — comments, threads, replies, resolve/
  reopen, suggestions, Track Changes, accept/reject, reviewer identity,
  review filters, editor/beta-reader modes
- ❌ Revision Studio (developmental/structural/scene/line/copy/proofing
  pass tracking, pass-specific notes/checklists, revision history by pass)

### §4 Scene model — 8 of 19 fields exist, rest genuinely missing
Checked `createScene` directly. Built: POV, Location, Story time (`time`),
Goal, Conflict, Outcome, Emotional state (`mood`), Status.
❌ Not built: Obstacle (as distinct from Conflict), Information revealed,
Secrets introduced, Character changes, per-scene Foreshadowing/Payoff (the
project-level story-question tracker exists but isn't a per-scene field),
Theme/motif, Symbolism, Scene intensity, Revision status, Narrative
purpose.
Scene-derived tools — all ❌: heartbeat/"did something change," goal-
conflict-outcome analysis, scene dependency graph, chain visualization,
density analysis, split/join, safe duplication, structural move/merge
integrity.

---

## 4. Architecture debt (real, tracked, not urgent)

- `app.js` refactor is **partial**: nav + 5 modals extracted; the 11
  remaining views (Write, Corkboard, Outline, Notes, Canvas, Sketch,
  Snippets, Timeline, Search, Stats, Book) plus the Library/Image-Library
  modals still live in `app.js`, still sharing state directly rather than
  through an explicit interface. `ROADMAP.md` itself says this needs a
  state-ownership design pass before attempting, not a mechanical split.
- DOM/browser verification is **real but partial**, not absent and not
  comprehensive. Confirmed: at least one genuine headless-Chromium
  (Playwright) regression test exists (the Book-mode column-width bug),
  plus scattered jsdom functional tests for specific features (focus
  layout, write-time tracking, graph presets). Most of the huge surface
  built since Session 23 is still verified at the `node --check` +
  logic-smoketest level only, same standing risk both old audits flagged
  — just now more precisely: it's a coverage gap on 11 unsplit views, not
  on "everything since Session 23" as previously stated.

---

## 5. The single next task

**Arc structure / visualization** — the narrower, now-correctly-scoped
version of what I got wrong last time. Concretely: turning points,
midpoint, crisis, choice, ending state on the Character builtin (same
custom-fields mechanism the profile fields already proved out), plus
arc-to-scene linking and a simple visualization.

Why this one:
- Confirmed genuinely open by direct source check, not a doc label.
- Needs no new architecture — same fields/template mechanism already
  shipped and tested twice over (worldbuilding pass, then arc profile
  fields).
- Small enough to be a clean single-session re-entry point.

Runner-up if you'd rather do infrastructure instead of a feature: the
**Search/query foundation (§9)**, since it's the one dependency actively
blocking something else already on the list (smart collections) — worth
picking only if you want to unblock, not just add.
