# Tinta — Canonical Models

**What this document is:** the Phase 1 + Phase 2 deliverable of the
archive's §55 Great Refactor (see `docs/archive/TINTA-FEATURE-AUDIT-MAXIMUM-v0_3.md`),
produced by the registry pass after the five unification passes and the
canvas-and-trio pass had already done the code-side work. §57's core rule
was "define what each concept means first, then migrate implementations
toward the canonical model" — the migrations happened; this is the
"define" part, written down at last so future sessions inherit the
verdicts instead of re-deriving them. Every claim below was checked
against current source, not carried forward from an older audit.

---

## Phase 1 — the architecture, as it actually is

```text
UI            views/*View.js (20 views, one module each), drawer.js,
              modal.js + the modal modules, nav.js, editor.js,
              palette rows, settings surface
  │           (safe rendering everywhere via dom-utils html``/toBridge)
controller    app.js: boot wiring, render() dispatch, activeView/
              activeChapterId/activeEntityId, project-switch teardown;
              commands.js: the one document-level keydown dispatch
  │
domain        store.js (all record CRUD + derived logic: continuity
              blocking, goal pacing, calendar math), plus pure engines:
              ruleSystem.js, search.js (query), diff.js, palette.js
              (fuzzy ranking), generator.js, format.js, mentions.js,
              wordtools.js, typewriter.js, sprint.js
  │
persistence   store.js save() → one JSON blob in localStorage;
              blobs → IndexedDB (imagestore.js, assetstore.js);
              .tinta export/import (tintaPackage.js + zip.js);
              sw.js shell precache for offline
```

**Ownership rule that fell out of the passes:** state lives in the module
that renders from it (`activeMapId` in mapView.js, `activeEntityId` in
notesView.js), cross-view writes go through exported setters re-exported
from app.js, and teardown ownership is explicit (modal.js owns
#modal-root, drawer.js owns its shell lifecycle, the confirm dialog owns
#confirm-root). The old "everything reaches through app.js" path is gone;
the remaining app.js re-export surface is a test-asserted compatibility
shim, not a live dependency.

**Duplication found and retired across the refactor:** modal shell (Pass 1,
54 closeModal call sites), unsafe innerHTML (Pass 2, 110 sites), inline
view renders (Pass 3 + canvas/trio, 11 view modules), outside-click
listeners/toast/tag-chips/mention regex (Pass 4), utility re-exports
(Pass 5), hand-synced shortcut tables (registry pass), native confirm()
(27 sites, registry pass).

---

## Phase 2 — the fourteen canonical concepts

For each: what it means in Tinta, its canonical home, and a verdict.
"Separate on purpose" is a verdict, not a failure — §57 forbids unifying
things that are honestly different, and forcing shared shapes usually
grows `if (domain === ...)` escape hatches.

### 1. Entity
**Canonical home:** `store.js` entities map + `entityType`/`chapterType`
custom-field schemas. An entity is a typed record whose type carries its
own fields; Notes renders the inspector, Canvas renders the graph.
**Verdict:** already canonical (the archive agrees). Not merged with
chapters: a chapter is manuscript structure with order and word counts, an
entity is world knowledge; they share the type-schema *pattern*, not a
record shape.

### 2. Relationship
**Canonical home:** entity relationships in `store.js` relationships map
(`createRelationship`: fromId/toId/typeId/status/strength/startDate/
endDate/notes/history[]), rendered in Canvas, peeked via
`openRelationshipDrawer`, edited in the Canvas's relationship editor.
**Verdict:** entity-relationships and scene-relationships stay separate on
purpose. They have different validation rules and different test files
(`relationship-history.smoketest.mjs`, `tier3.smoketest.mjs`); one
polymorphic table would blur both. The registry pass added the missing
peek (8th dispatch kind in `openContextDrawer`) without touching that
boundary.

### 3. Event
**Canonical home:** `project.timelineEvents` (`createTimelineEvent`):
one event record with a freeform storyDate and, when a calendar exists, a
structured calendarDate. Consumed by the Timeline view, the calendar
blocking math (`computeBlockedIntervals`, scene-status gating), and search.
**Verdict:** canonical. Scene beat markers and annotations reference
events by id rather than duplicating the record.

### 4. Time
**Canonical home:** `project.calendar` (Tier 4 pass): one opt-in fixed
month/week structure for the life of the project; every event may carry a
structured calendarDate against it. Without a calendar, time is the
freeform storyDate string, which is what v0.1 shipped and what still works
everywhere.
**Verdict:** canonical, and deliberately optional. A project never has to
define a calendar; nothing in the app assumes one exists. Irregular
fictional calendars (leap months) are out of scope by design (fixed month
lengths).

### 5. Location
**Canonical home:** the Map system (`project.maps`, markers with
entity/map links), rendered by mapView.js. A "location" as a *thing in the
story* is an entity (typed, mentionable, relationshipable); a location as
a *point on a map* is a marker that links to it.
**Verdict:** the two-layer answer is the canonical model. Merging "place"
into one record would force every location to carry map coordinates even
when the writer never draws a map.

### 6. Rule
**Canonical home:** `ruleSystem.js` — one engine for magic, skills,
technology, religions, and any other system the writer defines
(`createRuleSystem`: source/resource/channel/restrictions + node graph
with require/synergy edges). Systems view renders it; Health checks it.
**Verdict:** canonical; the archive's own table already marked this
"exactly as envisioned."

### 7. Resource
**Canonical home:** a *field* on the Rule engine (`resource`: "what's
spent to use it" — Mana, Stamina, Nanite reserves). Not a record kind, not
an engine.
**Verdict:** declined as a standalone concept until a real feature needs
one (an inventory/economy tracker is archive §26/§31 feature territory,
v0.3+). Defining a Resource engine now would be architecture without a
consumer, exactly what §56 warned against.

### 8. State
**Canonical home:** per-kind status vocabularies: chapter statuses
(STATUS_ORDER/STATUS_LABEL, shared with Organize and Health), scene
statuses (with calendar-driven blocking intervals), entity status strings,
rule-system node states. UI-level "state" (focus tiers) lives on
#app-shell's dataset.
**Verdict:** per-kind statuses are canonical; a cross-cutting State engine
is declined for the same reason as Resource: §35's world-state system is
an unbuilt feature, and engines follow features, not wishes.

### 9. Scene
**Canonical home:** chapters' scenes arrays; 19 of 19 base fields exist
(verified by MASTER-TRUTH), including summary, status, storyDate, notes,
and mention-bearing fields. Scene tools (beat sheets, story questions,
scene-relationships) hang off the record, not around it.
**Verdict:** canonical; scene-derived *analytics* (§4/§8 prose tools)
remain v0.3 feature work.

### 10. Reference
**Canonical home:** `project.references` (title/author/genre/tags/source/
links to entity/chapter/scene), rendered by referencesView.js with the
shared tag-chip filter trio (the same trio Notes uses).
**Verdict:** canonical. Research/provenance extensions (§39) extend this
record; they don't fork it.

### 11. Generator
**Canonical home:** `generator.js` — one seeded RNG (`createRng`/
`randomSeed`) threaded through every generator (names, quotes, starter
systems, worldbuilding drafts), with provenance badges marking generated
content.
**Verdict:** canonical; the archive agrees. AI features beyond the
opt-in grammar check remain v0.3 feature territory with the same
provenance discipline.

### 12. Scenario
**Canonical home:** none. Not built: §35's world-state/scenario system is
confirmed zero in source.
**Verdict:** correctly nothing. The archive's own plan lists scenario
branches under the Maximum onboarding profile (§52) and Simulation under
v0.3. No Scenario engine until a Scenario feature exists.

### 13. Revision
**Canonical home:** two engines, on purpose. Named + auto snapshots
(chapters and entities, shared cap logic, auto-snapshot before destructive
actions, diff view via diff.js) and the live undo/redo stack (Real
Revision pass, store-level checkpoints, text-field guard documented in
commands.js).
**Verdict:** separate on purpose: a restore-and-look system and a
keystroke-granularity stack solve different problems; the archive's table
already declined the merge.

### 14. Query
**Canonical home:** `search.js` — `searchProject()` plus the field-scoped
`field:value` syntax (`QUERY_FILTER_FIELDS`), consumed by the Search view
and the saved-search runner.
**Verdict:** canonical; the archive agrees ("the Query pass").

---

## Phase 5 UI unification, where it stands

- **Modal system:** `modal.js` openModal shell (Pass 1) + `confirmDialog`
  (registry pass) on its own layered root. Every dialog in the app is
  themed, Escape-safe, and listener-hygienic.
- **Inspector system:** `openContextDrawer` dispatches 8 kinds: entity,
  scene, reference, ruleNode, mapMarker, timelineEvent, annotation,
  relationship. The archive's §2.5 wish list is fully covered (story-
  question context rides the scene inspector's questions section).
- **Panel system:** `openDrawerShell` (7 drawer consumers) + the Write
  sidebar as the one bespoke view region. Dockable multi-pane workspaces
  are §2.4 feature territory, v0.3.
- **Command registry:** `commands.js` — one list driving keydown dispatch,
  the Settings help table, and the palette's command rows. Widget-local
  keydown stays with its widget (documented boundary in the module header).
  Rebindable shortcuts (§50) now have a place to land: flip keys → match,
  add a settings editor.
- **Notifications:** toasts merged in Pass 4; native confirm() fully
  retired in the registry pass (27 sites, one themed, accessible dialog).
- **Navigation:** nav.js grouped/compact with measured wrap fallback;
  breadcrumbs/tabs/history remain §2.4 features, v0.3.
- **Filtering:** shared tag trio (Notes + References); Library's
  multi-field filters separate on purpose (documented at the site).
- **Workspace layouts:** deferred with §2.4, v0.3.

## Phase 6, and where polish goes

The archive's own §59 answers the sequencing question: v0.3 is "make the
monster fast, beautiful, trustworthy, and extensible." Performance,
accessibility beyond the dialog/keyboard work above, mobile, sync,
onboarding levels, and visual consistency are v0.3 work, deliberately
started after unification so they polish an architecture that earned it.
