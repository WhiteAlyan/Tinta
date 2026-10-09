# Tinta — v0, Session 1-24 (Tier 3 pass)

A local-first novel writing workspace. Part of RabbitHole / LightApps.

Formerly built under the working title "Scriptorium" (Sessions 1-11);
renamed to Tinta as of this doc. See "Data" below for what that means for
anyone who already has a project saved under the old name.

## Status

Feature status (built / not built) lives in `docs/TINTA-MASTER-TRUTH.md` now — that's the single source of truth. This file keeps the per-pass implementation writeups below (what `ROADMAP.md` calls out as "full detail there") plus setup/schema reference at the bottom. Don't reconstruct status from this file or from `ROADMAP.md` — both are historical/detail records now, not status trackers.

## Session 23 — Worldbuilding pass (generic entity-type templates)

- `project.entityTypes[]` replaces the old hardcoded character/location/
  item/concept array — those four now ship as seeded builtin templates,
  with a migration guard for existing projects. Custom types (name + flat
  hex color + optional custom-field schema) are created/edited/deleted via
  a new "Manage entity types" modal off the Notes sidebar; builtins are
  protected from key/color/deletion changes, and deleting a type in use is
  blocked.
- `entity.parentId` (nesting, cycle-safe parent picker via
  `wouldCreateCycle`, orphan-on-delete for children rather than dangling
  refs), `entity.aliases` (closes a long-standing known gap —
  `findEntityByName` now matches alt-names/nicknames, not just the exact
  name), `entity.customFields` (per-template values, rendered generically
  in the entity detail panel).
- `entity.tags` activated with a filter-chip bar in the Notes sidebar,
  reusing the Library filter-chip pattern wholesale; `getDistinctEntityTags`
  drives it the same way `getDistinctProjectValues` drives Library's chips.
- Custom-type coloring uses a `--type-color` CSS var on the dot/legend/
  Canvas node; builtins keep their existing theme-reactive CSS classes.
  Known tradeoff: custom colors are flat, not theme-reactive — there's no
  way to generate a paper/void/sepia triad from an arbitrary user-picked
  hex, so a custom type's color looks the same across all three themes.
- Verified with a Node smoke test (custom type creation, entity
  nesting/alias lookup/cycle detection/orphan-on-delete, tag activation,
  delete-type guards) and a separate migration test simulating a
  pre-Session-23 save with none of the new fields present — both passed.
  Found and fixed one real bug during that testing: `slugType()`'s
  generated keys had a stray leading underscore from misusing `uid('')`;
  switched to a direct random suffix.
- **Not verified in-browser at the time** — only Node-level store logic
  had automated coverage; the DOM wiring in `app.js` (templates, event
  binding) was flagged as the single biggest open risk heading into the
  next pass. The Craft-tools and Tier 2 passes below build directly on
  this entity system, so if a DOM-wiring bug ever surfaces in Notes/
  Canvas entity handling, this is where to look first.

## Craft-tools pass — scene relationships, story questions, project health, craft analytics

- **Scene relationships** — new `project.sceneRelationships` collection,
  structurally identical to entity `relationships` (an id, a from/to pair,
  a type) but between scenes instead of entities, using a fixed small
  vocabulary (`SCENE_RELATIONSHIP_TYPES`: follows/precedes/parallel-to/
  flashback-of/foreshadows/pays-off) rather than the rename-a-shared-type
  machinery entity relationship *types* have, since this vocabulary isn't
  expected to grow. UI lives in the Scene Inspector drawer (`drawer.js`)
  — list of existing edges, add-new row with type + target-scene picker,
  remove button.
- **Story questions / foreshadowing tracker** — new `project.storyQuestions`
  collection and a new Questions nav tab (Plan group). Each question is
  free text, optionally pinned to the scene where it's introduced and
  where it pays off, with a manual `resolved` toggle — deliberately never
  auto-resolved, since whether a scene actually answers a question is a
  judgment call the app can't infer from data.
- **Project health / orphan-detection dashboard** — new Health nav tab
  (Tools group), `Store.getProjectHealthReport()` surfaces orphaned
  entities (never mentioned, never related, no nested children), dangling
  `[[mentions]]` that don't resolve to any entity, timeline events linked
  to a since-deleted chapter, and unresolved story questions. Read-only —
  nothing here writes to the store, same "visit it, it doesn't visit you"
  principle as Sprint/Stats. Every row is click-to-jump to the thing it's
  about, same pattern as backlinks and the drawer's own lists.
- **Craft analytics** — added to the Stats view: pacing (words per
  chapter, bar chart), dialogue-vs-narration ratio (rough estimate —
  anything inside quote marks counts as dialogue, not a precise parse),
  and POV distribution (count of scenes per POV string). All three are
  read-only and computed fresh from fields already stored (`scene.pov`,
  chapter content, quote characters) — no schema change, no persistence
  of their own.
- Data-layer functions (`getStoryQuestionList/create/update/delete`,
  `getProjectHealthReport`, `getPovDistribution`, `getChapterWordCounts`,
  `getDialogueRatio`) were written and store-tested ahead of their UI in
  this pass; the UI (Questions/Health views, Stats additions) was wired
  in immediately after in the same pass, closing that gap out.

## Tier 2 pass — graph presets, "what's changed" report, and one CSS gap closed

- **Bug found and fixed:** the craft-analytics section above (Pacing/
  Dialogue/POV panels in Stats) had no CSS anywhere — `.craft-analytics-
  grid`, `.pov-dist-*`, `.dialogue-ratio-*`, `.dialogue-swatch-*` were all
  referenced in the rendered HTML but never styled, so that section would
  have rendered as unstyled stacked text. Added the missing rules to
  `dashboards.css`.
- **Canvas graph presets** — new `project.graphPresets` collection.
  Saves a named snapshot of the Canvas legend's hidden-entity-types set,
  the relationship-status filter, and every entity's current `canvasX`/
  `canvasY` — enough to reconstruct a "family tree" or "faction map" as a
  one-click view of the *same* graph, per the audit's "one graph engine,
  many presets" framing, rather than a second layout engine. Positions
  are copied into the preset at save time (not referenced), so moving
  nodes afterward doesn't silently rewrite a saved preset — it only
  changes on an explicit re-save under the same name. UI: a preset
  dropdown + "💾 Save view" + delete button in the Canvas toolbar,
  alongside the existing status filter.
- **"What's changed" report** — added to the Health view: a Today/This
  week/This month toggle backed by `Store.getChangesSince()`, which
  already existed in `store.js` from the Craft-tools pass but had no UI.
  Shows chapters edited, entities added/changed, relationships added,
  timeline events added, and scenes touched within the selected window,
  read off each record's existing `updatedAt`/`createdAt` timestamps — no
  new schema. Deliberately labeled as current totals for touched chapters,
  not an added/removed word delta, since Tinta doesn't keep word-level
  history outside manual per-chapter snapshots — see the note on this in
  "Notes for next session" below if that distinction matters later.
- Skipped a standalone "novel-level diff" view as a separate build: the
  changes-since report above covers the same ground (an aggregate view of
  what moved across the whole project) more cheaply, reusing tested code,
  rather than standing up a second engine next to the existing
  chapter-level word diff (`diff.js`). Flagged as a judgment call in case
  a true chapter-by-chapter aggregate diff (words added *and* removed,
  not just current totals) turns out to be wanted later.
- Verified with a jsdom smoke test exercising the new store functions
  end-to-end: create/apply/update/delete a graph preset, position
  round-trip through a preset, `getChangesSince` detecting newly-created
  entities. 11/11 assertions passed. All 26 JS files pass `node --check`;
  CSS braces balanced across all 9 stylesheets.

## Tier 3 pass — continuity checking, style guide, completion checklist

All three items the audit scoped for Tier 3, landed as one continuous
pass (picked up mid-flight from where an interrupted prior session had
left continuity checking's data layer and entity-panel UI built but
undocumented):

- **Continuity checking.** `entity.statusEvents[]` — a writer-anchored
  status timeline per entity (`{ label, timelineEventId, blocksAppearance,
  note }`), edited from a new "Status timeline" section on the entity
  detail panel (Notes view). Anchoring to a Timeline event's existing
  `order` field, rather than adding a parallel date system, per the
  "Notes for next session" entry below — Timeline order already gives a
  reliable before/after comparison without a structured-calendar build.
  `getContinuityReport()` walks each entity's sorted status sequence into
  blocked intervals (`blocksAppearance: true` opens a block, the next
  `false` entry closes it, an unclosed block runs to the end of the
  story-as-plotted) and cross-references two signals per flagged
  interval: `[[mention]]` backlinks (solid) and a chapter's own
  `scene.pov` field via a loose substring match (marked "possible" in the
  UI, not treated as equally certain). Folded into the Health dashboard
  as a new Continuity section, reusing the existing `[data-jump-chapter]`
  delegated handler rather than adding a second one.
- **Per-project style guide.** New `project.styleGuide[]` — preferred-vs-
  wrong spelling/naming pairs (`{ incorrect, preferred, note }`), managed
  from a new "Style guide" section in Grammar Check → Settings (mirrors
  the existing Custom Dictionary section's list+add-row shape). Checking
  is pure local string scanning (`scanTextForStyleViolations` —
  word-boundary, case-insensitive, longest-term-first so a rule for "grey
  eyes" isn't pre-empted by a shorter standalone "grey" rule) — no
  network round-trip, so it runs even with the grammar checker disabled
  via a new "Check style guide only (offline)" button. When the network
  checker *is* enabled, style-guide matches merge into the same
  match-card list LanguageTool results use, sharing the existing
  Ignore/Replace affordances (an "Ignore word" on a style-guide card adds
  it to the custom dictionary, same as any other match — the two lists
  stay conceptually distinct in the schema but converge at the results
  UI). Deliberately a separate list from Custom Dictionary, not a merge
  of it — the dictionary says "never flag this word," style guide says
  "flag the *other* form of this word." Rolled into
  `getProjectHealthReport()` as a new project-wide Style Guide section
  (which chapters, how many violations, which preferred term), same
  one-report-many-checks shape continuity uses.
- **Completion checklist.** New Checklist tab (Tools group) backed by
  `Store.getCompletionChecklist()`, which deliberately doesn't re-derive
  any data-quality checks — it wraps `getProjectHealthReport()` for
  orphans/dangling-mentions/continuity/style-guide/unresolved-questions
  and only adds checks specific to publish-readiness: every chapter
  marked Final, no empty chapters, chapters meeting their own target word
  counts, a blurb set, cover art set. Each item is flagged `blocking` or
  informational — a missing blurb or an unresolved story thread doesn't
  block `readyToPublish`, an orphaned entity or a chapter still marked
  Draft does. Chapter-shaped failures (not-final/empty/under-target) get
  their own per-chapter jump chips inline; the data-quality items jump to
  Health/Questions, where their own detail lists already live, instead of
  duplicating that UI a third time.
- Verified with three separate Node smoke tests (not checked into this
  snapshot, per this doc's usual note on that): style guide rule
  CRUD/scanning/longest-match/case-insensitivity/project rollup (18
  checks), continuity status-timeline CRUD/interval math/dangling-link
  handling/health-report integration (13 checks), completion checklist
  pass/fail transitions across every item including the
  blocking-vs-informational split (15 checks). 46/46 passed. All 27 JS
  files (including `sw.js`) pass `node --check`; CSS braces balanced
  across all 9 stylesheets; the new `checklist` view-panel/nav-entry/
  render-routing triple cross-checked against the existing `health` entry
  it was modeled on.

## Tier 4 pass — custom calendar (§12)

The first item picked up from Tier 4 (`TINTA-FEATURE-AUDIT-MAXIMUM-v0_2.md`
§12 — Custom Time / Calendar / Astronomy), scoped to the calendar and
time-relationship pieces only. Astronomy (orbits, eclipses, derived
seasons) is 🧪-tier in the audit — explicitly optional chaos-tier, same
category as the procedural map generator — and stayed out of scope here;
so did seasons/eras/holidays/multiple-calendar-conversion, which the audit
marks 🧠 but which aren't needed for the thing this pass was actually
prerequisite for: giving Timeline events something better than a freeform
`storyDate` string to order by.

- **`project.calendar`** — `null` by default on every project, existing
  and new. A project never has to define a calendar just to use Timeline;
  freeform `storyDate` labels keep working exactly as before. Once
  enabled (`Store.enableCalendar()`), it holds one fixed month/week
  structure for the life of the project — every month the same length
  every year, no leap years. A calendar with its own irregular pattern (a
  leap month every few years, a 10-day week) isn't something a general
  leap-year algorithm could guess at anyway; hand-varying `daysPerMonth`
  per month is the tool available today, the same trade-off real-world
  "13 months of 28 days" calendars make. Turning a calendar off
  (`disableCalendar()`) keeps its configuration rather than discarding it
  — Timeline display just falls back to freeform-only while it's off, so
  toggling it back on doesn't mean retyping every month name.
- **Pure date-math functions** — `calendarDateToAbsoluteDay` /
  `absoluteDayToCalendarDate` (the shared representation every other
  function builds on), `compareCalendarDates`, `daysBetweenCalendarDates`,
  `offsetCalendarDate` (calendar-aware month/year math — adding a month
  lands on the same day next month, not +30 days, and clamps into a
  shorter target month the same way real calendars overflow), and
  `getWeekdayIndex`/`getWeekdayName`. All take a calendar object as an
  explicit argument rather than reading `getActiveProject()` — makes them
  unit-testable in total isolation, and is also just correct: a calendar's
  math is a fact about that calendar object, not about "the currently
  active project" the way most of `store.js` is scoped.
- **Per-event `calendarDate`** — an optional `{ year, month, day }`
  companion to `storyDate` on `timelineEvents[]`, opt-in per event even
  when the project's calendar is on. `formatTimelineEventDate()` is the
  one function the UI needs: resolves whichever of `calendarDate`/
  `storyDate` is right to show, falling back to the freeform label
  whenever the structured date isn't usable — no calendar, calendar
  disabled, or a `calendarDate` gone stale against a since-edited calendar
  (e.g. a stored day 31 after a month got shortened to 28 days). A
  structured date never displays as if valid when it isn't; nothing gets
  silently clamped into a garbage date.
- **`findCalendarOrderMismatches()`** — flags Timeline events whose
  `calendarDate` runs earlier than the event immediately before it in the
  writer's own manual `order`, the thing a freeform `storyDate` string
  could never detect. Same spirit as the Tier 3 continuity checker's
  status-event blocking, just for chronology: a non-blocking nudge (⚠
  banner on the Timeline view, naming the two events involved) rather
  than an enforced constraint, since a flashback placed later in Timeline
  order but dated earlier in-world is a legitimate, common thing a writer
  does on purpose.
- **UI** — a 📅 Calendar button on the Timeline header opens a
  create-or-edit modal (same shape as the Series manager): months as
  plain-text `name, days` lines, comma-separated weekday names, an
  optional year suffix (e.g. "AR"), plus an on/off toggle once a calendar
  exists. Each Timeline event card gets a "+ Set calendar date" button
  when a calendar is active, expanding into month/day/year fields with a
  live formatted-date preview once set.
- CSS was the one piece the reconciled files didn't carry — the Timeline
  calendar row, the mismatch-warning banner, and the modal's months
  textarea had no styling at all going into this pass. Added to
  `dashboards.css` (the warning banner reuses the existing
  `.checklist-banner-notready` non-blocking-nudge treatment; the date row
  matches the existing timeline-event-card field styling) and extended
  `.grammar-field-label` in `modals.css` to cover `textarea`, replacing an
  inline style.
- Verified with a new Node smoke test, `calendar.smoketest.mjs` (55
  checks): pure date math (round-trips including a negative-year epoch
  and a deliberately irregular non-7-day/non-12-month calendar,
  month/year offset math with day-clamping, weekday cycling), plus the
  store-integration surface (opt-in default, enable/disable preserving
  config, stale-date fallback after reconfiguration,
  `findCalendarOrderMismatches` including the "flashback resolves the
  mismatch once reordered" case). All 27 JS files pass `node --check`;
  CSS braces balanced across all 9 stylesheets.
- **Found in passing:** `series.smoketest.mjs` (from the Series/universe
  pass — not otherwise logged in this file yet, see the note in "Not
  built yet" below) had a broken relative import: `./js/store.js` from a
  file that's lived in `js/` itself, where it needed `./store.js`. It's
  never actually run since being placed there. Fixed; it now runs for
  real and passes 31/31.

## Tier 4 pass — geography / map system (§11)

Second item picked up from Tier 4 (`TINTA-FEATURE-AUDIT-MAXIMUM-v0_2.md`
§11 — Map/Geography System). Scoped to the Core list's image-layer +
coordinates + markers pieces, plus the 🧠-tier marker→entity link — not
the full Core list as written, and not the 🧪-tier procedural layer.

**What §11 lists that this pass deliberately did not build**, and why:
- **Regions/paths/rivers/borders as freehand vector shapes** — this is a
  second full drawing engine's worth of scope (fills, strokes, editable
  vector paths), not a variant of the marker system. Sketch already has a
  hand-drawn "map mode" with a grid overlay for freeform battle-maps/
  dungeons — the design decision this pass made was to be deliberately
  the *other* half of that: pinning markers onto an uploaded map image
  (a scan, commissioned art, or a Sketch export) rather than drawing one
  from scratch. Vector regions/paths built on Sketch's existing drawing
  primitives is a future pass, not duplicated here.
- **Location→scenes / Location→events / Location→factions** (🧠-tier) —
  only Location→entity shipped. The other three would need scenes and
  timeline events to carry their own location-marker references, which
  is additive but genuinely separate work from this pass's scope.
- **Procedural map generator** (🧪-tier: heightmaps, biomes, trade
  routes) — explicitly optional chaos-tier per the audit, same bucket as
  Calendar's astronomy layer. Out of scope on purpose.

**What shipped:**
- **`project.maps{}`** — opt-in catalog, backfilled to `{}` on load for
  every project that predates this pass. A project can hold any number
  of maps; `mapType` (World/Regional/City/Dungeon-Interior, via
  `Store.getMapTypes()`) is a label on the map, not a fixed enum baked
  into the data shape — a novelist's own scale names won't always match
  those four.
- **Image reuse, not a second image pipeline** — a map's background is
  just an `imageId` pointing into the existing `project.images` catalog,
  set through a new `'map'` selection mode in the existing Image Library
  modal (the same single-select-then-close shape `'cover'` mode already
  used). Map backgrounds ride along with the existing image cleanup
  sweep for free.
- **Markers** — `map.markers[]`, each with normalized `{x, y}` (0..1)
  coordinates so a pin's position is independent of how large the image
  happens to render — the stage sizes to the image's natural dimensions
  and scrolls rather than stretching the map to fit the panel. A marker
  carries a label, a free-text note, an optional `entityId` link ("this
  pin is Kessa Vane's home base"), and an optional `linkedMapId` for
  drill-down ("clicking this pin opens the regional map"). Clicking
  empty space on the map drops a new pin there; clicking an existing pin
  opens an editor panel below the map (not an overlay — the point of
  clicking a pin is seeing where it is while editing it).
- **Orphan-not-dangle, same rule as everywhere else in the data model** —
  deleting an entity clears any marker's `entityId` link to it (the pin
  and its position/label survive); deleting a map clears any other
  marker's `linkedMapId` pointing at it. Neither leaves a reference to
  something that no longer exists.
- **UI** — a Map tab added to the nav's World group (alongside Notes/
  Canvas/Sketch), a Sketch-style list-plus-detail shell (`.sketch-layout`
  reused wholesale), and the pin/stage/marker-editor views themselves.
- CSS was, again, the one piece the reconciled files didn't carry going
  into this pass — the image stage, pins, and marker editor had no
  styling at all. Added to `views.css`, reusing `.sketch-layout`/
  `.sketch-list-col`/`.sketch-main-col`/`.sketch-toolbar`/
  `.entity-name-input` wholesale rather than inventing parallel classes.
  In passing, also fixed `.notes-view-header` (the "Sketches / + New" and
  now "Maps / + New" row) which had been unstyled since whichever pass
  introduced Sketch's version first — falling back to bare default
  h2/button stacking with no layout at all.
- Verified with a new Node smoke test, `map.smoketest.mjs` (35 checks):
  map/marker CRUD, both orphan-cleanup paths (entity deletion, map
  deletion), marker deletion, and migration backfill — the last of these
  via `importFullBackup()` specifically, since `_db` is cached after the
  first `load()` and a plain mutate-then-`switchProject` round-trip
  would've handed back the same cached reference without re-running
  `migrate()`; `importFullBackup()` is the one public entry point that
  re-runs migration against genuinely fresh parsed JSON, same as opening
  a real backup file exported before this pass existed.
- `calendar.smoketest.mjs` (55/55) and `series.smoketest.mjs` (31/31)
  re-run after this pass to confirm no regressions from reconciling the
  loose files back into the project tree. All 29 JS/mjs files + `sw.js`
  pass
  `node --check`; all 9 CSS files brace-balanced.

## Tier 4 pass — references / research vault (§14)

Third item picked up from Tier 4 (`TINTA-FEATURE-AUDIT-MAXIMUM-v0_2.md`
§14). Started in the same working session as the Map pass above; the
UI (`renderReferencesView`/`renderReferenceMain` in `app.js`) was written
first and got ahead of the store layer — this pass is what closes that
gap, plus a reconciliation: the UI file had been edited further than the
zip it was meant to ship alongside, so the two had to be diffed and
merged before anything else could be verified.

**Scope decision, matching the audit's own framing**: no spatial
pinboard (Milanote-style dragging notes/images around a canvas) — that's
new UI, not a data-model variant of anything that already exists, the
same "genuinely separate build" reasoning Maps and Calendar both got in
the audit. What shipped instead is the list-plus-detail research-item
model: closer to a lightweight bibliography than a mood board.

**What shipped:**
- **`project.references{}`** — opt-in catalog, backfilled to `{}` on
  load for every project that predates this pass. Six fixed types
  (`Note`/`URL`/`Quote`/`Book/Source`/`Image`/`Screenshot` via
  `Store.getReferenceTypes()`) — unlike entity types, this vocabulary
  isn't user-extensible; six categories cover what gets gathered while
  researching a novel without needing a type-manager of its own.
- **Single-id linking, not arrays** — a reference optionally links to
  one entity, one chapter, and one scene (`entityId`/`chapterId`/
  `sceneId`), deliberately simpler than Sketch's `linkedEntityIds[]`
  array — a research note is "about" one thing at a time in the picker
  UI, not several.
- **Image reuse, same pattern as Map backgrounds** — an Image/Screenshot
  reference's `imageId` points into the existing `project.images`
  catalog via the Image Library's `'map'` selection mode (reused as-is,
  no reference-specific mode needed); thumbnail display reuses
  `resolveEntityAvatar()`/`entityPortraitUrls` verbatim rather than a
  third URL-tracking array.
- **Tags + filter chips** — `getDistinctReferenceTags()`, same
  chip-derivation pattern Library metadata and entity Tags established.
- **Orphan-not-dangle** — deleting a linked entity, chapter, or scene
  clears the corresponding link field and leaves the reference itself
  intact, same rule as every other cross-reference in the data model.
  Deleting a chapter also clears `sceneId` for any reference pointing at
  one of that chapter's now-gone scenes.
- **UI** — a References tab added to the nav's World group; already
  fully built in `app.js` before this pass started, unchanged here.
- CSS: `.reference-type-tag` and the image-preview box were the only
  genuinely new rules needed — everything else in the detail panel
  reuses `.sketch-layout`/`.sketch-toolbar`/`.entity-meta-row`/
  `.grammar-field-label`/`.map-list`/`.notes-view-header` wholesale.
- Verified with a new Node smoke test, `references.smoketest.mjs` (33
  checks): CRUD, tag de-duplication, all three link types, both
  orphan-cleanup paths (entity deletion, chapter/scene deletion), and
  migration backfill via `importFullBackup()`.
- Also formalized a smoke test for the Craft-tools pass above, which
  hadn't shipped with one of its own: `craft-tools.smoketest.mjs` (47
  checks) covering arc fields, relationship metadata, the pronunciation
  and grammar dictionaries, sketch linking, snippet promotion, scene
  relationships (including cleanup on scene/chapter deletion, which
  wasn't previously covered), story questions, project health, craft
  analytics, and the changes-since report — plus its own migration test.
- One real bug caught and fixed during this pass: an earlier edit to the
  `references{}` schema comment had silently mangled a neighboring
  comment line into `references: {}, Keyed` — syntactically odd enough
  that `node --check` did **not** catch it, but importing the module
  did (`Unexpected identifier 'dailyWordCounts'`). Worth remembering
  `--check` alone isn't sufficient verification; an actual smoke test
  that imports the module is what caught this one.
- `calendar.smoketest.mjs` (55/55), `series.smoketest.mjs` (31/31), and
  `map.smoketest.mjs` (35/35) all re-run clean after this pass — no
  regressions from either the merge or the new `deleteEntity`/
  `deleteChapter`/`deleteScene` cleanup additions. All 32 JS/mjs files +
  `sw.js` pass `node --check`; all CSS files brace-balanced. Total
  automated coverage across all five smoke-test files: 201 checks, all
  passing.
- Not done: no DOM/browser-level test of the References UI itself, same
  gap every other Tier 3/4 pass has left for its own UI — the store
  layer is what's actually verified.

## Quick-wins pass — search upgrades, annotations, bookmarks

Picked up from `TINTA-FEATURE-AUDIT-MAXIMUM-v0_2.md`'s quick-wins list
after the Tier 4 reconciliation above. Four items, all deliberately
reusing existing engines rather than starting anything new:

**Search — regex mode, scene-field search, tag search.** `search.js`
gained a `useRegex` option on `findOccurrences`/`searchProject` (with
zero-width-match protection so a pattern like `x*` can't infinite-loop),
plus two categories that were explicitly out of scope when search.js was
first written: scene fields (goal/conflict/outcome/notes/location) and
entity tags. An invalid regex pattern is validated once up front and
reported as `results.regexError` rather than thrown mid-scan. Replace is
deliberately disabled while regex mode is on — it still does a literal,
escaped substitution internally, and showing a regex-derived match count
next to a literal-replace button would be a real mismatch, not just a
UI nit. UI: a Regex checkbox, category filter chips (only rendered for
categories with actual results), scene rows with click-to-jump into
Corkboard. New `search.smoketest.mjs` (21 checks) — search.js has no
Store dependency, same reasoning as diff.js/wordtools.js, so no
localStorage shim needed for this one.

**Annotations.** New `project.annotations{}` — TODO / Check / Research /
Rewrite / Canon / Foreshadow / Payoff / Continuity tags, each attached to
a chapter and optionally a specific scene within it. Deliberately scoped
to chapter/scene level, not precise inline text-offset anchoring — offsets
shift under every subsequent edit to the surrounding prose, which would
need its own real engineering; this gets most of the value (know what
needs revisiting, and roughly where) without it. Same shape as
`storyQuestions`: a small collection, a manual `resolved` toggle (never
auto-inferred). UI: a 🏷 button with an open-count badge in the Write
view toolbar opens `annotationsModal.js` (new file, same
readAloud.js/grammarModal.js pattern) listing every annotation in the
chapter, grouped Open/Resolved, with a type+scene+note add row; a
matching scoped-down section was added to the Scene Inspector drawer
(`drawer.js`) for scene-only annotations, reusing the exact same store
functions.

**Bookmarks.** New `project.bookmarks{}` — a saved "jump back here" list,
chapter-level or chapter+scene. No folders or manual ordering, just
`createdAt`; this is a quick-nav aid, not another organizational system
to maintain alongside Timeline/Corkboard/Health. UI: a ☆/★ toggle in the
Write toolbar bookmarks the current chapter in one click; a 🔖 popover
(same `.wt-popover-group` pattern as Details/More) lists every bookmark
project-wide with click-to-jump and a remove button.

**Cascade-delete behavior**, matching the rest of the data model: deleting
a chapter removes its annotations/bookmarks outright (they require a
`chapterId`, so there's no meaningful orphaned-but-useful state, same
reasoning as `sceneRelationships`); deleting a scene just clears the
`sceneId` on any annotation/bookmark pointing at it, same "orphan the
link, keep the thing" rule `references` uses.

- Verified with a new `quickwins.smoketest.mjs` (32 checks): annotation
  type validation and fallback, chapter-vs-scene-scoped list queries,
  bookmark label fallback to chapter title, both cascade-delete paths,
  and a migration test (importing a pre-pass backup with `annotations`/
  `bookmarks` stripped backfills cleanly).
- All 7 smoke-test files re-run clean after this pass — 233 checks
  total, zero regressions: `calendar` (55), `craft-tools` (47), `map`
  (35), `quickwins` (32), `references` (33), `search` (21), `series`
  (31). Full `node --check` sweep across every JS/mjs file; every CSS
  file brace-balanced.
- Not done: no DOM/browser-level test of any of this session's UI —
  same standing gap as every Tier 3/4 pass. Also not done: annotations
  have no project-wide list view (only per-chapter, via the toolbar
  button, and per-scene, via the drawer) — a "every open annotation
  across the whole manuscript" view would be a natural Tier-2-style
  follow-up if chapter-by-chapter turns out to not be enough once a
  project has many chapters each carrying a few.

## Annotations dashboard pass — project-wide annotations view + regex replace

The two follow-ups the Quick-wins pass explicitly flagged as open, done as
one small pass since neither touches the other's code:

**Project-wide annotations view.** A new `annotations` tab (Tools group,
next to Health/Checklist) rendering every annotation across the whole
manuscript, grouped by chapter in reading order — not just the per-chapter
(toolbar modal) or per-scene (drawer section) views the Quick-wins pass
shipped. Filters: status (Open/Resolved/All, defaulting to Open to match
the toolbar badge's own framing) and type. No new `store.js` surface at
all — it's `Store.getAnnotationList()`, the same call the badge count
already made, just rendered ungrouped-by-chapter instead of pre-filtered
to one. Row markup and CSS classes (`.annotation-row`,
`.annotation-type-tag`, `.annotation-note-text`, `.annotation-delete-btn`)
are the exact ones `annotationsModal.js` and `drawer.js`'s scene section
already use, so resolving or deleting an annotation looks and behaves
identically no matter which of the three surfaces it's done from. A
chapter heading jumps to Write on that chapter; a scene tag jumps to
Write *and* opens the Scene Inspector for that specific scene (the only
other place a scene-level annotation is editable), same pattern the
sidebar's own scene-list click handler already uses.

**Regex replace.** Closes the one deliberate gap the Quick-wins pass left
in search: replace was literal-only even in regex mode, specifically to
avoid the regex-derived match count shown while searching disagreeing
with what a literal-substitution replace would actually touch.
`search.js`'s `planChapterReplace` now builds the same real `RegExp` in
regex mode that `searchProject` already validated (a caller never reaches
replace with an invalid pattern — `results.regexError` gates that in the
UI), so the previewed count and the applied count are the same regex
evaluated the same way, every time — the mismatch the old restriction was
protecting against no longer exists. Capture groups come free: since the
pattern is a real `RegExp` object, `String.prototype.replace` already
understands `$1`/`$2`/`$&`/`$$` in the replacement, no extra plumbing
needed. Along the way, fixed a related latent bug in the literal-mode
match-count too: the Replace button's count used to be read off the
*display* results, which cap at 20 matches per field for readability —
a chapter with more literal matches than that would show an undercounted
button label. The preview now always re-runs `planChapterReplace`
uncapped, so the number on the button is the real number Replace is
about to touch, in either mode.

- Verified by extending `search.smoketest.mjs` with regex-replace
  coverage: count parity between regex search and regex replace on the
  same pattern, capture-group substitution, invalid-pattern safety
  (no-op, not a throw), case sensitivity, and confirming literal-mode
  replace is unaffected — 42/42 (up from 32).
- No new smoke-test file for the annotations dashboard — it adds no
  `store.js` functions to test; the underlying data contract
  (`getAnnotationList`, cascade-delete, migration) is already covered by
  `quickwins.smoketest.mjs`. Same standing gap as every other view in the
  app: no automated DOM-level coverage.
- All 7 smoke-test files re-run clean after this pass — 296 checks total
  (was 286), zero regressions: `calendar` (55), `craft-tools` (47), `map`
  (35), `quickwins` (53), `references` (33), `search` (42, up from 32),
  `series` (31). Full `node --check` sweep across every JS/mjs file;
  every CSS file brace-balanced.
- Not done: the annotations dashboard doesn't surface from the toolbar
  modal itself (no "view all →" link inside `annotationsModal.js`) — the
  new tab is only reachable via the nav bar. Small, deliberately deferred
  rather than adding cross-module view-state coupling for a one-line
  convenience link.

## Tier 7 pass — Rule-System foundation + worldbuilding starter templates

Picked up straight from `TINTA-FEATURE-AUDIT-MAXIMUM-v0_2.md`'s §2
architecture note and §16–23 concept lists. Before writing any code, this
pass first checked what §2's "reusable foundations, not fifty isolated
mini-apps" call actually still needed, by reading the real merged
codebase rather than trusting the doc's own (largely stale, pre-Tier-4)
per-item checkboxes in §10–§14: the **Entity engine** (generic types +
per-type customFields, "a Deity's domain, a Species' lifespan, etc." was
always the design target) and the **Graph engine** (`createRelationship`
takes a bare `fromId`/`toId`, no type restriction — already usable for
faction politics, cosmology hierarchies, whatever) both turned out to be
fully general already. The one genuine gap against §2's seven-engine list
was the **Rule engine** — never built, and specifically what §23 (Magic/
Power/Skill System Builder) needs that customFields alone can't give it:
real prerequisite-chain logic, not just freeform text fields.

**Rule-System foundation.** New `ruleSystem.js` (pure logic, no Store
import — same pattern as `search.js`): `wouldCreateCycle` does a DFS over
a system's nodes to reject a prerequisite edge that would create a
circular dependency (direct or transitive), and `orderByPrerequisite`
sorts a node list so prerequisites always render before what needs them.
`store.js` adds full `RuleSystem`/`SystemNode` CRUD on top: a *system*
(Elemental Magic, a Tech Tree, Cyberware, a martial art — deliberately
domain-agnostic, no fixed category enum the way `ANNOTATION_TYPES` has
one) carries the §23-spec framing fields (source/resource/channel/
restrictions); a *node* (whatever that system's own vocabulary calls a
skill/spell/technology) carries requirement/cost/cooldown/range/
duration/effect/limitation/counter/synergy/evolvesInto. Deleting a system
cascades to its nodes; deleting a node cleans up every other node's
dangling references to it (same "orphan the reference, don't leave a
dangling id" stance the Quick-wins pass's scene-delete cascade already
established for annotations/bookmarks) rather than blocking the delete or
leaving broken pointers behind. New `systems` nav tab (World group):
a system list → click into one for its node list (ordered by
prerequisite) → a ~10-field modal to add/edit a node, with an inline
error if a requirement change would close a cycle.

**Worldbuilding starter templates.** Not a new engine — six pre-filled
`createEntityType` calls (Culture, Species, Language, Religion, Faction/
Government, Economy), 5 fields each, trimmed from §16–21's full bullet
lists the same way the Character builtin's want/need/wound/flaw were
trimmed from every conceivable character field. Surfaced as a "Starter
templates" row in the existing Entity Type Manager modal — click one,
get a ready-to-fill type, same customFields mechanism any hand-built
custom type already uses. A template already added (by label) drops out
of the row rather than offering a duplicate. Technology (§22) was
deliberately *not* given a flat-fields template — §22 explicitly wants
prerequisites and branching trees, which is exactly what a Systems-tab
Tech Tree already covers better than five text fields could.

- New smoke-test files: `rule-system.smoketest.mjs` (cycle detection,
  prerequisite ordering, full CRUD + cascade-delete + migration
  backfill) — 35/35. `worldbuilding-templates.smoketest.mjs` (template
  shape sanity, a template-created type round-tripping through an
  entity's customFields, delete-while-in-use guarded at the store level
  not just the UI) — 32/32.
- All 12 smoke-test files re-run clean — **505 checks total, zero
  regressions**. Full `node --check` sweep; all CSS brace-balanced.
- Not done: no generator/name-tool consuming a Rule-System or a Language
  template yet (that's §2's Generator engine — Tier 8 territory, out of
  scope here). No DOM/browser-level test coverage for the new Systems
  view or the template row, same standing gap as the rest of the app's
  UI. Technology, Culture-as-a-graph-of-sub-cultures, and cross-system
  node references (a Tech Tree node requiring a Magic-system node) are
  all left for a future pass if they turn out to matter.

## Generator engine pass — §2's last shared-foundation piece

Picked up the loose end Tier 7's own log entry flagged above ("no
generator/name-tool... yet — that's §2's Generator engine"). Rather than
build a new one alongside the Session-7 name generator that already
existed (Names & Archeshic Records), this migrates that generator's
mechanism into the shared engine and extends it — one generator, not two.

- **`generator.js`** — new pure module (no UI, no Store import, same
  pattern as `search.js`/`ruleSystem.js`). Three modes: `classic` (the
  original syllable-start/mid/end pool, moved here unchanged — same
  three arrays, same syllable-count logic, same output for the same
  random draws), `pattern` (CVC-style templates over a configurable
  consonant/vowel set), and `markov` (a character-level Markov chain
  trained on a project's own existing names — a world with "Zhydryx"/
  "Kaelthir"/"Vorenth" generates more names that sound like *those*, not
  generic fantasy syllables, which is the actual worldbuilding value-add
  here).
- **`wordtools.js` migration** — `generateName()`/`generateNames()` kept
  their exact original signatures and now call through to
  `generator.js`'s `generateFromSyllablePool()`/`CLASSIC_FANTASY_POOL`
  instead of keeping a second copy of the pool + combination logic. Zero
  behavior change for the one existing caller (`wordCheckModal.js`).
- **`store.js`'s `generateEntityNames({ mode, type, count, pattern })`**
  — the project-aware entry point `generator.js` deliberately doesn't
  have. Gathers a project's existing entity names + aliases (optionally
  filtered to one entity type) as both `learn` mode's seed data and an
  exclusion list, so a batch never hands back a name already in the
  project. `learn` mode falls back to `classic` (and reports
  `fellBack: true`) below a 3-seed-name threshold, rather than
  generating near-duplicates of one or two names.
- **UI** — the existing Name Generator section (inside Names & Archeshic
  Records) gets a "Classic" / "Learn from this project" toggle, defaulting
  to Classic so the modal behaves exactly as it always has unless a
  writer opts in, plus an entity-type filter that only appears in Learn
  mode. A fallback note explains itself in plain language when there
  isn't enough seed data yet, rather than silently switching modes.
- Verified with a new `generator.smoketest.mjs` (35 checks): every mode
  in isolation, the unified `generateNames()` auto-selection logic, the
  wordtools.js migration producing identical-shaped output to before the
  move, and all of `generateEntityNames`'s branches (classic, learn with
  fallback, learn with real seed data, the type filter actually narrowing
  the seed pool rather than just labeling it, pattern mode, and an
  export/import round trip). This pass added no new schema, so there's
  no migration-backfill test the way other passes have one — confirmed
  instead that an existing project's data survives a full round trip
  unaffected.
- All 13 smoke-test files re-run clean — **540 checks total, zero
  regressions**.

## Generator engine, domains pass — worldbuilding entity drafts + starter systems

Follows directly on the name-generator slice above — the two domain-level
consumers §2 flagged as depending on it, now built.

**`generator.js` gained a fourth mode, `generateDescriptor()`.** Every
worldbuilding template field (Culture's "Customs & taboos", Religion's
"Afterlife", a writer's own custom type's own custom field) means
something different, so genuinely field-aware generation for all of them
would mean hand-authoring a phrase bank per field — doesn't scale past
the templates that exist today, and wouldn't scale to a type a writer
defines themselves tomorrow. What generalizes instead: one
field-agnostic fragment generator (quality + subject + qualifier,
stitched into a sentence) that produces a plausible starter phrase for
*any* field, meant to be edited, not shipped as final prose — same
"draft, not a deliverable" contract the Classic name pool has always had.

**`store.js`: `draftWorldbuildingEntity({ typeKey })` /
`commitWorldbuildingDraft({ typeKey, name, customFields })`.** Deliberately
generic over entity *type*, not hardcoded to the seven starter templates —
reads whatever `.fields` the given type actually defines, so it works
identically for a writer's own custom type. Two-step draft/commit, not a
single create call — same "generate, look at it, then decide" shape as
the Name Generator's reroll-then-pick flow. Name generation escalates
from `classic` to `learn` mode automatically once 3+ entities of that
type already exist, reusing `generateEntityNames` rather than
duplicating its threshold logic.

**`store.js`: `generateStarterSystem({ name, domain, tierCount, perTier })`.**
Seeds a tiered node tree on top of Tier 7's `RuleSystem`/`SystemNode`
engine — builds strictly forward (each tier only requires nodes from the
tier immediately before it, which already exist by construction), so
there's no cycle risk to check the way editing an existing tree has to.
Only `name`/`rank`/`category`/`effect` are generated; `cost`/`cooldown`/
`range`/`duration`/`limitation`/`counters`/`synergy`/`evolvesInto` are
left blank on purpose — those are precise mechanical fields where
generic filler text would be actively misleading, unlike a flavor field.
The result is a normal system afterward, not a special generated one —
every node is individually editable/deletable exactly like a hand-built
one, and deleting the system cascades its nodes the same as any other.

**Settlement joins the worldbuilding template set** (Culture/Species/
Language/Religion/Faction-Government/Economy/Settlement, seven now) — a
Location structurally, but "a place with 40k people, a guild council,
and a river-trade economy" wants different starting fields than a
Location that's just a mountain pass, same reasoning Species got its own
template instead of overloading Character's.

**UI** — new `generatorModal.js` (same split-file pattern as
`readAloud.js`/`annotationsModal.js`): a 🎲 button next to Notes' "+ Add"
opens a preview/reroll/commit modal for whatever entity type is selected
in the same dropdown; a 🎲 Generate button in the Systems list opens a
small config form (name/domain/tier count/nodes-per-tier) that commits
immediately, since a generated system carries no "wrong to commit to"
risk the way a bad entity name might.

- Verified with a new `generator-domains.smoketest.mjs` (39 checks):
  unknown-type rejection for both draft and commit, a type with fields
  vs. a type with none, the tier-by-tier prerequisite structure (tier 2
  requires exactly one tier-1 node, never tier-1-or-itself), no duplicate
  node names within one generated system, name/domain fallback defaults,
  and confirming a generated system edits and cascade-deletes exactly
  like a hand-built one.
- All 14 smoke-test files re-run clean — **579 checks total, zero
  regressions**. Full `node --check` sweep across every JS/mjs file;
  every CSS file brace-balanced.
- Not done: no DOM/browser-level test of this pass's UI, same standing
  gap as every domain-level pass since Tier 3. Also not done: the
  Generator engine's remaining named domains from §2 (structured
  culture/city/faction content beyond the generic descriptor filler,
  procedural map generation) — deliberately left as the "genuinely
  large, chaos-tier" items they were already scoped as. Full `node --check` sweep; `modals.css` (the only CSS
  file touched) still brace-balanced.
- Not done: no DOM/browser-level test of the new mode toggle/type filter,
  same standing gap as everything else in the app's UI. §2's other
  domain generators (culture/city/faction/religion name-and-detail
  generation, not just names) aren't started — this pass is the *names*
  slice specifically, the smallest real proof of the engine shape, not
  the full Generator engine's scope.

## Foundational pass — chaos-tier reconciliation: Cosmology (§25) + Generation History/Canon Control (§31)

Two items picked up together from `TINTA-FEATURE-AUDIT-MAXIMUM-v0_2.md`,
per an explicit "foundational-only, no refactor/UX pass yet" directive —
both close real zero-code gaps, neither touches existing behavior.

**§25 Cosmology Architect — reclassified, not chaos-tier.** The audit
filed this under the same section as Ecology/Population/Historical-Sim/
What-if (genuine simulation systems, correctly left alone), but §25's own
spec text says the opposite of what that filing implies: *"prefer the
existing entity/relationship/graph/rule primitives rather than creating
unrelated data models."* Reality/Planes/Gods/Afterlife/Creation-model is
descriptive worldbuilding — the same shape as Culture/Religion/Philosophy,
which already have template treatment; it just hadn't gotten its own yet.
- **Ninth `WORLDBUILDING_TEMPLATES` entry** (`app.js`) — Cosmology, 6
  fields: creation model, planes/realms/domains, gods & cosmic entities,
  souls & afterlife, time & causality, and a summary field pointing at
  the Rule-System engine for the one part of §25 that isn't prose.
- **"Fundamental forces" and "reality laws" are genuinely rules**
  ("fire magic doesn't work in the Shadow Plane"), not a seventh prose
  field — so rather than one more free-text box, a **"Cosmic Laws"
  domain preset** was added to the starter-system generator
  (`generatorModal.js`, `STARTER_SYSTEM_DOMAIN_PRESETS`) alongside
  Magic/Skill tree/Technology/Martial arts/Cyberware. Zero new engine —
  same reuse pattern as Technology Tree.
- `worldbuilding-templates.smoketest.mjs` extended with a full Cosmology
  section: template shape, an entity round-trip through the new type,
  and a standalone check that a "Cosmic Laws" Rule System can exist with
  no foreign-key dependency on the Cosmology entity/type (the pairing is
  by convention — someone naming both the same thing — not by any actual
  link, which is the real substance of the "no new engine" claim). 67/67
  passing (was 59).

**§31 Generation History / Canon Control — built from zero, scoped
deliberately honest.** The audit's own line: *"Generated content must
never silently mutate established canon."* Checked this against the
actual codebase before writing anything: every generator function
(`commitWorldbuildingDraft`, `generateStarterSystem`) only ever calls
`createEntity`/`createRuleSystem`, never an update — so the guarantee
already holds today, by construction, not by an enforced rule. What was
missing was the provenance/state data model the audit asks generated
objects to carry, and the substrate a future regenerate-in-place feature
would need to check before it could ever violate that guarantee.
- **`CANON_STATUSES`** (`store.js`) — the exact six states from §31:
  canon/draft/proposed/alternate/deprecated/non-canon. `entity` and
  `ruleSystem` both gained a `canonStatus` field, defaulting to `'canon'`
  for anything hand-created (a person typing something in themselves is
  asserting it into the story) and `'draft'` for anything stamped by a
  generator (per §31's own framing — generated content starts
  unreviewed). `getCanonStatuses()` exported for the UI to build a picker
  from later.
- **`generation` metadata** — `generatorName`, `generatorVersion`,
  `inputs`, `timestamp`, `parentGenerationId`, `edited`. Wired into both
  real generator entry points via a shared `buildGenerationRecord()`
  helper. **Deliberately does not include a `seed` field** — there is no
  seeded/reproducible PRNG anywhere in `generator.js` (plain
  `Math.random()` throughout), so a seed field would have implied a
  replay capability that doesn't exist. Recording one anyway to look
  audit-complete would have been fiction, not a shipped feature.
- **`markGenerationEdited(kind, id)`** — the explicit hook for §31's
  "post-generation edits" tracking. Deliberately *not* wired to fire
  automatically inside `updateEntity`/`updateRuleSystem`: the initial
  generation-stamping call itself goes through those same functions
  (`commitWorldbuildingDraft` calls `updateEntity` to attach
  `customFields` + `canonStatus` + `generation` all at once), so
  automatic detection would misfire and mark a record "edited" the
  instant it's generated. This is a real, tested primitive with no UI
  wired to call it yet — flagged as exactly that rather than overclaimed.
- Migration: pre-§31 entities/rule systems backfill to `canonStatus:
  'canon'`, `generation: null` — not `'draft'`, since demoting a writer's
  existing, already-canonical entities to an unreviewed state on upgrade
  would misrepresent their actual history. There is no generation record
  to backfill either, since nothing generated them.
- Verified with a new `canon-control.smoketest.mjs` (43 checks): the six
  canon states, hand-created-vs-generated defaults for both entities and
  rule systems, both generators' actual `generation` payload shape,
  `markGenerationEdited`'s idempotency and its no-op behavior on a
  hand-created record (must not fabricate a generation object that
  never existed) and on an unknown id, canon-promotion via the ordinary
  `updateEntity` path (no dedicated setter needed — this is a plain
  field, not a guarded relationship), and the migration backfill via
  `importFullBackup()` (the one entry point that genuinely re-runs
  `migrate()` against fresh parsed JSON, same reasoning the Map/Calendar
  passes already established for this).
- Full smoke suite re-run: **all 15 files, 675 checks, zero regressions.**
  All 47 JS/mjs files + `sw.js` pass `node --check`; all 9 CSS files
  brace-balanced (no CSS touched this pass — store.js/app.js/
  generatorModal.js only).
- **Not done**: no UI surfaces canon status or generation history
  anywhere yet (no badge on a draft entity, no "promote to canon"
  button, no way to see a record's generation inputs) — this pass is the
  data model and the one explicit hook a future UI needs, not the UI
  itself, per this pass's own "foundational only" scope.

## Foundational pass — Document-type model (§2.1)

Picked from the three zero-code, foundation-shaped candidates identified
against `TINTA-FEATURE-AUDIT-MAXIMUM-v0_3.md` (the other two — the
Generator foundation's seed/reproducibility gap, and a structured query
language for Search — remain open, see below). Code for this pass was
already substantially built when this session picked it up (uploaded as
loose `app.js`/`store.js`/`manuscriptExport.js` ahead of the zip, same
pattern as every prior merge in this project's history) — verified it
function-by-function rather than assuming the upload was complete, and it
was: full CRUD, migration, UI, and export integration, no gaps found.

- **`project.chapterTypes[]`** — 14 builtin types across four roles
  (`content`: Chapter/Prologue/Epilogue/Interlude; `frontmatter`:
  Foreword/Dedication/Epigraph; `backmatter`: Afterword/Appendix/
  Glossary/Bibliography; `scratch`: Author note/Research note/Alternate
  draft material). Deliberately scoped to leaf content types only —
  Manuscript/Volume/Part from §2.1's list are hierarchical *containers*
  (a book made of parts made of chapters), a genuinely different data
  problem that would mean restructuring `project.chapters` from a flat
  list into a tree, not just tagging existing entries. `role` is the one
  field with real behavior riding on it; a free-text label alone
  would've been cosmetic, not foundational.
- **`chapter.docType`** — which type a given chapter is. `getChapterTypeForChapter()`
  degrades a dangling/unknown docType to the `chapter` builtin rather than
  null, so every role check downstream never has to null-guard.
- **`getContentChapterNumber()`** — only `content`-role chapters get a
  number; inserting an Appendix between Chapter 3 and Chapter 4 doesn't
  relabel Chapter 4 as Chapter 5. The Write view's heading shows the
  type's own label (`PROLOGUE`, `APPENDIX`) instead of a fabricated
  chapter number for anything non-content-role.
- **`manuscriptExport.js`** — `scratch`-role chapters (author/research
  notes, alternate drafts) are excluded from both DOCX and EPUB export
  entirely, same "a submission shouldn't carry a Tinta-only aid"
  reasoning the file already applied to dropping color highlights.
- **UI** — a Document type dropdown next to Status in the Write
  toolbar's Details popover, plus a full "Manage document types" modal
  (add/delete custom types, builtin protection, in-use-blocks-delete) —
  reuses the Entity Type Manager's CSS classes wholesale, no new CSS
  needed.
- Verified with a new `document-type.smoketest.mjs` (27 checks): CRUD,
  the dangling-docType fallback, role-aware numbering (including the
  "insert an Appendix, following chapters don't renumber" case
  specifically), `manuscriptExport`'s scratch-role exclusion, and
  migration backfill for a pre-this-pass project.

**Verification gap, stated plainly rather than glossed over**: the zip
this pass's code arrived in (`Tinta-docs-reconciled.zip`) contains zero
`.mjs` test files — confirmed by listing the archive directly, not
assumed. The docs-reconciliation pass immediately before this one
explicitly claimed "confirmed only the two .md files changed, no code
touched" and "re-ran all 15 smoke test files myself: still 675/675" —
but whatever zip actually got uploaded here doesn't contain those 15
files to re-run. The 33 JS files are all present and `node --check`
clean, so the application code itself looks intact; it's specifically
the historical test suite that's missing from this artifact. This pass's
own new test (27/27) is genuinely verified. The other ~648 checks from
before this pass are **not** re-confirmed here — next session should
either locate a zip that actually contains the `.mjs` files, or treat
everything before this entry as "last confirmed at 675/675, not
reconfirmed since" rather than currently-verified.

## Foundational pass — §33 seed/reproducibility, plus the §31 canon-status substrate it landed with

**Resolves the prior entry's flagged gap first:** the zip that reached
this session (containing the document-type-model pass above, plus a
further-along `store.js`/`generatorModal.js`/`wordCheckModal.js`/
`modals.css` uploaded loose on top of it) had exactly **one** `.mjs`
test file in it — this pass's own `document-type.smoketest.mjs`. All 13
of this project's other smoke-test files, and `generator.js` itself
(the file the loose `store.js` most needed to actually run against),
were genuinely absent from the artifact — not a false alarm, confirmed
by listing the archive directly. Both are restored now: `generator.js`
was rebuilt from its last-known content plus the exact seeded-RNG
contract the new `store.js` already called into (recovered by reading
every `Generator.*` call site in the uploaded `store.js`, not guessed),
and all 13 smoke-test files were restored from the last session that had
them. One of the 13 (`worldbuilding-templates.smoketest.mjs`) needed a
one-line fix — a hardcoded "5 fields" assertion that predated Culture
and Religion each gaining a 6th (`festivals`) field in an earlier pass —
everything else re-ran clean against the new code with zero changes
needed.

**§33 — seed/reproducibility.** `generator.js` gained `createRng(seed)`
(a string hash feeding a mulberry32 PRNG — deterministic, not
cryptographic, which is all this needs) and `randomSeed()` (a fresh,
human-shareable seed string for when a caller doesn't supply their own).
Every function that draws randomly — `generateFromSyllablePool`,
`generateDescriptor`, `generateFromPattern`, `generateFromMarkov`,
`generateNames` — now accepts an `rng` (a plain `() => number` in [0,1),
same calling convention as `Math.random`) and defaults to `Math.random`
when none is given, so every existing caller keeps working unseeded.
`store.js`'s three generator entry points (`generateEntityNames`,
`draftWorldbuildingEntity`, `generateStarterSystem`) each build one `rng`
from one `seed` and thread that single stream through everything they
do — a worldbuilding draft's name *and* every one of its custom fields
come from the same seed, and a starter system's node names *and* its
prerequisite-picking draws do too, so reproducing a seed reproduces the
whole thing, not just part of it. Every one of the three now always
returns the `seed` it used, whether or not the caller asked for one —
nothing is generated without a reproducible receipt.

**§31 — canon-status/generation substrate (landed in the same pass, data
layer only).** Every entity and rule system now carries `canonStatus`
(`'canon' | 'draft' | 'proposed' | 'alternate' | 'deprecated' |
'non-canon'`, defaulting to `'canon'` for anything hand-created) and
`generation` (null for hand-created records; for generated ones, a
stamped record of which generator, what inputs, what seed, a
`generatorVersion`, and an `edited` flag a future hand-edit-detection
feature can flip via the new `markGenerationEdited()`). Both
`commitWorldbuildingDraft` and `generateStarterSystem` stamp their
output `'draft'`, not `'canon'` — generated content starts unreviewed,
per §31's own framing. **Deliberately no UI yet** — this is the
substrate a "Generation panel" or a canon-status filter/badge would need,
not those features themselves; nothing today lets a person see or change
a record's canon status. Worth building next given the data's already
sitting there unused, but out of scope for this pass.

- Verified with a new `seed-foundation.smoketest.mjs` (64 checks):
  `createRng` determinism and cross-seed divergence, every generator.js
  function reproducing with a shared rng, unseeded calls still working,
  full seed round-trips through all three store.js entry points
  (including that a starter system's *prerequisite structure*, not just
  its node names, reproduces exactly), canon-status defaults for
  hand-built vs. generated records, `markGenerationEdited` (including
  idempotency), and a migration test confirming a pre-pass backup with
  `canonStatus`/`generation` stripped heals to `'canon'`/`null` — canon,
  not draft, since silence about a record's provenance should read as
  established, not as pending review.
- All 15 smoke-test files now re-run clean together — **676 checks
  total, zero regressions** (612 from the 14 pre-existing files + this
  pass's 64 new ones — see the correction above on why the historical
  number can't be cited as "675 re-confirmed," but every check that
  actually ran, ran clean). Full `node --check` sweep across every
  JS/mjs file; every CSS file brace-balanced.
- Not done: the canon-status/generation UI noted above; `app.js` itself
  needed zero changes this pass (the seed UI lives entirely inside
  `generatorModal.js`/`wordCheckModal.js`, which kept their existing
  exported names), so nothing in the main view files knows any of this
  happened yet.

## Running it

No build step — it's vanilla JS with ES modules, same as WaoL. Needs a local
server (not `file://`) because ES modules and the service worker both require
an HTTP origin. Double-clicking `index.html` directly will not work correctly.

**Easiest: double-click launcher.** Requires Python 3 (already installed on
most Macs/Linux; on Windows, install from python.org and check "Add
python.exe to PATH"). Pick the one for your OS:

- Mac: `Launch Tinta (Mac).command`
- Windows: `Launch Tinta (Windows).bat`
- Linux: `Launch Tinta (Linux).sh` — most file managers need
  "Allow executing as program" checked in the file's Properties before
  double-click will run it; alternatively run it from a terminal.

Each one starts a local server on the first free port from 8080 up and opens
the app in your default browser automatically. A terminal/console window
stays open while the server runs — closing that window (or pressing Ctrl+C
in it) stops the server. Nothing is installed system-wide; it's just Python's
built-in `http.server` under the hood (`serve.py`), so quitting it leaves
nothing running in the background.

**Manual alternative**, if you'd rather run it yourself or Python isn't
picked up by the launcher:

```
cd tinta
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Install it as a PWA from the browser's
install prompt if you want it in its own window.

## Data

Everything lives in `localStorage` under the key `tinta:db` — a single
JSON blob holding the active project, its chapters (with scenes and now
revision snapshots), the entities table, relationship edges, and sketches,
plus the app-level grammar-check settings from Session 8.

If a project was saved before this rename, it's under the old key
`scriptorium:db` instead. `store.js`'s `load()` checks for that automatically
the first time it doesn't find anything under `tinta:db`, and immediately
re-saves it under the new key — the old key is left in place afterward
(untouched, not deleted) as an extra safety copy rather than something you
need to clean up. Nothing is lost either way; this only matters if you're
digging through dev tools directly and wondering why there are two keys.

The one exception to "nothing leaves the browser": if you turn on the
Session 8 grammar/style check, that chapter's text is sent to whatever
endpoint you configured (the public LanguageTool API by default) each time
you run a check. It's off by default and stays off until you explicitly
enable it in the Grammar Check settings panel — everything else in the app
has no network dependency at all.

Clearing site data still wipes the project unless you've set up folder
auto-backup (Chromium browsers only, opt-in via the Backup modal's
"Pick folder" button — see `autoBackup.js`): once set up, every save also
writes a `.tinta` snapshot to that folder. Without it, the Session 6
export feature still gives you a manual markdown backup (per chapter or
the whole project) as a fallback.

## Notes for next session

- Canvas positions (`canvasX`/`canvasY`) and the `relationships` collection
  are both per-project, same as everything else — no cross-project graph
  yet, which is probably correct for a single-novel workspace.
- The canvas uses `prompt()`/`confirm()` for relationship labels and entity
  deletion — consistent with how entity delete already worked, but if a
  proper modal system gets built for a later session, this is the other
  place that wants it.
- Relationship labels are single strings, no direction-aware phrasing (e.g.
  "mentor of" vs "student of" for the same edge viewed from either end). If
  that distinction matters later, it's a `label`/`reverseLabel` pair rather
  than a schema rework — edges already store `fromId`/`toId` directionally.
- ~~Mention matching is still case-insensitive exact-name only; no alias/
  nickname support.~~ Shipped: `entity.aliases: []`, matched the same
  case-insensitive way as the primary name.
- The mention autocomplete popup in `editor.js` only wires into the chapter
  textarea, not Corkboard scene fields — those still resolve for backlinks,
  just without the popup.
- The `emptyDb()` shape in `store.js` is effectively the sync manifest shape
  too, if/when the WaoL pairing pattern gets wired in — keep it flat and
  JSON-serializable as more fields get added.
- ~~Scene reordering (drag-and-drop) wasn't implemented — cards currently
  just append in creation order.~~ Shipped in `corkboardView.js`: a
  drag handle per card, live-reflow on drag, final order written to the
  store on drop.
- No eraser tool on the sketchpad — since strokes are vector data, a real
  eraser would need either per-point trimming or a click-to-delete-stroke
  interaction, not a raster paint-over. Undo/clear cover the basic case for
  now; worth revisiting if freeform sketching sees heavy use.
- Sketches aren't linked to entities yet (no "attach this sketch to White's
  character sheet" relationship) — they're a flat list per project. That's
  the natural next step once character sheets get built, rather than
  something to retrofit onto entities now.
- No canvas resize handling on window resize — `fitCanvasToElement` runs
  once per mount. Existing strokes stay correct (they're stored in logical
  space) but the canvas won't re-fit until you switch sketches or views.
- Snapshots store full content copies, not deltas — fine at prose-chapter
  scale (kilobytes), but if snapshotting habits get heavy on a very long
  chapter, worth revisiting with actual usage data rather than guessing now.
- The diff is word-level only — no scene-field diffing (goal/conflict/
  outcome), no project-wide diff across all chapters at once. Chapter-level
  covers the real use case (comparing a rewrite), so those stayed out.
- Export is markdown-only — no docx/PDF yet, per the original v0 scope note
  ("later docx/PDF"). Both chapter and project exports use the same
  `Store.export*Text()` functions, so adding a format later means adding a
  converter, not touching the export flow itself.
- Timeline's `storyDate` is genuinely just a display label — two events
  both dated "Spring" have no inherent relationship to each other beyond
  wherever the writer manually drags them in `order`. That's the right
  call for a first pass (real-world dates, in-story calendars, and
  "three weeks later"-style relative dates can't share one sort key
  without a lot of parsing complexity), but if a future session wants
  actual chronological math (durations between events, a visual axis
  instead of a plain list), `order` alone won't support it — would need a
  real date/offset field kept separate from the display label.
- Timeline export wasn't added to the Session 6 export feature — chapter
  and project markdown exports don't currently include timeline events.
  Worth adding if the timeline sees real use as planning material.
- `dailyWordCounts` only grows on `updateChapterContent` — deleting a
  chapter entirely doesn't retroactively remove or adjust the days it
  contributed to. That's the right call (a streak/history shouldn't
  un-happen because a chapter got cut later), but worth knowing if the
  numbers on the Stats view ever look larger than a fresh read of current
  content would suggest.
- The 30-day chart is a fixed window with no way to see further back or
  zoom into a single day/week. Fine for a first pass; worth a date-range
  picker if anyone's actually mining their own history later.
- Streak/day-bucketing uses the browser's local calendar day, computed
  fresh each render — correct for a single-device local-first app, but
  would need explicit timezone handling if this ever synced across
  devices (see the WaoL-pattern sync note above).
- Read Aloud speaks the chapter's raw content as-is, including
  `[[mention]]` bracket syntax — it isn't stripped before being sent to
  speech synthesis, so a heavily-linked chapter will have the brackets and
  entity names read aloud verbatim. Worth revisiting if that turns out to
  read awkwardly in practice; stripping to the entity name alone
- Double-click launcher (`serve.py` + the three OS-specific wrapper files):
  verified the port-finding logic and that `serve.py` actually serves the
  app correctly (200s on index.html/sw.js/css) from a headless environment.
  The parts that can't be verified outside a real desktop — Finder/Explorer
  actually running `.command`/`.bat` on double-click, and the browser
  auto-opening — rest on standard, well-documented behavior for those file
  types rather than an automated test. Worth a real double-click check on
  each OS before relying on it.
  (`[[Hero]]` → "Hero") would be a small, contained change to
  `openReadAloudModal` if so.
- Ambient sound and read-aloud are both genuinely browser-API-dependent
  (`Web Audio`, `SpeechSynthesis`) and degrade to a plain "not supported"
  message if either is missing — but that degradation path, and the audio
  synthesis itself, were verified by code review rather than an automated
  test, since neither API exists in a headless Node environment. Worth an
  actual in-browser pass before leaning on them.
- No per-track ambience presets beyond the four built in — if a writer
  wants a specific noise color/frequency mix (e.g. "rain but deeper"),
  that'd need exposed filter parameters, not just a track picker.
- `#modal-root` is reused by History and Export now; if a third modal need
  shows up later, it already has the backdrop/close/Escape wiring in place
  — no new pattern needed, just another `render*Modal()` function.
- Word Check's thresholds (`count >= 5 && share > 0.012` for ordinary words,
  `count >= 4 && share > 0.003` for crutch words) were picked by feel and
  sanity-tested on synthetic samples, not tuned against a real manuscript.
  Worth revisiting once someone actually runs it on a full chapter.
- The thesaurus is intentionally tiny (~20 entries) — it's scoped to the
  words Word Check is most likely to surface, not a general-purpose lookup.
  Growing it is just adding `THESAURUS` entries in `wordtools.js`, no
  structural change needed.
- The name generator is culture-agnostic syllable soup on purpose (start +
  0-1 mid syllables + end). If genre-specific name sets become useful later
  (real-world-sounding vs. fantasy), that's a second syllable table and a
  mode toggle, not a rewrite.
- Snippets have no search/filter/tagging yet — just reverse-chronological.
  Fine at low volume; worth a tag or search box if the inbox grows past a
  screenful.
- Grammar check re-runs the full check on every accepted replacement rather
  than adjusting remaining match offsets locally. Correct (offsets do shift
  once text length changes) but means one network round-trip per accepted
  suggestion — fine for occasional use, worth revisiting with a local
  offset-adjustment pass if someone's running it heavily against a chapter
  with a lot of flagged items.
- The `raw` backend format is a seam, not a working Archemedeus
  integration — no adapter exists yet on the Archemedeus side. Whoever
  wires that up just needs an endpoint returning `{ matches: [{ message,
  offset, length, replacements? }] }`; everything else in `grammar.js`
  (timeout, error handling, normalization) already treats that shape as a
  first-class input.
- No per-project grammar language override — the language code is a single
  app-level setting. If a novel gets written in a different language than
  the last project checked, it's a manual settings change, not automatic.
- LanguageTool's public API has its own rate limits and a request size cap;
  `grammar.js` doesn't pre-check chapter length before sending, it just
  surfaces whatever HTTP error status comes back. Worth adding a soft
  length warning if long chapters turn out to hit it in practice.
- Graph presets snapshot entity positions by id at save time — if an
  entity referenced in a preset is later deleted, applying that preset
  just skips it silently (`applyGraphPreset` checks `getEntity(entityId)`
  before moving anything). Nothing prunes the stale id out of the saved
  preset itself, so a preset saved against a cast that later loses a
  character will carry a small amount of dead weight indefinitely. Fine
  at the scale a novel's cast operates at; worth a cleanup pass if presets
  ever get reused across very different drafts of the same project.
- Graph presets don't capture the type-manager's custom colors or the
  entity-type set itself, only positions + the hidden-types/status filter
  — if a custom type gets deleted after a preset that hid it was saved,
  reapplying that preset just has one fewer thing to hide, no error.
- The "what's changed" report's word counts are current totals for
  chapters touched in the window, not a true added/removed delta —
  flagged inline in the Tier 2 pass log entry above. Getting a real delta
  would mean either diffing against the nearest manual snapshot before
  the window start (unreliable — snapshots are opt-in and sparse) or
  recording a lightweight word-count history alongside `dailyWordCounts`
  specifically for this purpose. Worth doing only if the current
  "totals, not deltas" framing turns out to read as misleading in
  practice.
- `TINTA-FEATURE-AUDIT.md`'s Tier 3 recommends designing continuity
  checking *before* scene relationships on the reasoning that continuity
  needs comparable dates and Timeline currently stores dates as freeform
  strings — that ordering note is now moot (scene relationships already
  shipped in the Craft-tools pass), but the underlying freeform-date
  problem is still there and will still block continuity checking
  whenever that's picked up. A minimal structured-date pass on Timeline
  (just enough to compare "before/after," not a full custom-calendar
  system) is still worth doing first.
