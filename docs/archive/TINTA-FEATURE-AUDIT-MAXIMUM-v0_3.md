# Tinta — Master Feature Audit / Maximum v0.3

## Purpose

This is the expanded “maximum Tinta” inventory: serious writing-app foundations plus worldbuilding, fictional systems, generation, simulation, AI, research, publishing, collaboration, and onboarding.

### v0.1 philosophy

> **Build the monster.**

v0.1 may become enormous. Establish the foundation of each major capability and prove the product surface. Perfect modularization and polish are not the priority.

### v0.2 philosophy

> **Great Refactor. Unify the monster.**

After the v0.1 feature freeze: map the real architecture, define canonical concepts, unify shared models, migrate features onto reusable engines, modularize the UI/application, improve performance/accessibility/UX, and remove duplication.

**Important:** Do not blindly refactor first or blindly unify everything first. Use a hybrid sequence:

`Freeze → Archaeology → Define canonical models → Unify foundations → Adapter → Refactor one domain → Test → Migrate → Delete old path → Repeat → Polish`

---

# 1. CURRENT TINTA FOUNDATION

Already represented in the current project/audit:

- ✅ Writing/editor foundation
- ✅ Focus/typewriter modes
- ✅ Typewriter and ambience audio
- ✅ Command palette
- ✅ Cursor/scroll restoration
- ✅ Autosave
- ✅ TTS/read-aloud
- ✅ Grammar/style checking
- ✅ Repeated-word/verbal-tic analysis
- ✅ Name/thesaurus tools
- ✅ Custom dictionary
- ✅ Pronunciation dictionary
- ✅ Style guide
- ✅ Inline formatting/images
- ✅ Reader/Book mode
- ✅ Themes
- ✅ Chapters
- ✅ Chapter reorder
- ✅ Scenes
- ✅ Cross-chapter scene movement
- ✅ Corkboard
- ✅ Outline
- ✅ Timeline
- ✅ Snippets
- ✅ Scene relationships
- ✅ Story questions / foreshadowing
- ✅ Snapshots
- ✅ Word-level diff
- ✅ Annotations
- ✅ Project Health
- ✅ Craft analytics
- ✅ “What’s changed”
- ✅ Continuity checking
- ✅ Completion checklist
- ✅ Generic entity types
- ✅ Custom fields
- ✅ Entity nesting
- ✅ Aliases
- ✅ Tags
- ✅ Backlinks
- ✅ Relationships
- ✅ Relationship metadata
- ✅ Canvas graph
- ✅ Graph presets
- ✅ Sketchpad
- ✅ Sketch-to-entity linking
- ✅ Maps foundation
- ✅ Custom calendar foundation
- ✅ Series foundation
- ✅ References foundation
- ✅ Domain-agnostic rule-system foundation
- ✅ Magic/skill node foundation
- ✅ Culture/species/language/religion/government/economy starter templates
- ✅ Local-first store
- ✅ PWA/offline foundation
- ✅ Full JSON backup
- ✅ Markdown export
- ✅ Multi-project Library

The original post-Session-23 audit should remain the historical baseline; current source/code should win whenever statuses differ.

---

# 2. WRITING-APP FOUNDATIONS

## 2.1 Document model

> **Foundation pass, checked directly against `store.js` — not assumed
> from the doc.** `project.chapterTypes` is a generic registry (same
> shape as `entityTypes`), seeded with 14 builtins, each with a `role`
> (`content`/`frontmatter`/`backmatter`/`scratch`) that actually does
> something: `manuscriptExport.js` and the chapter-numbering logic key
> off it directly, which is the real bar for "built" here — a free-text
> label that nothing reads would just be cosmetic. `createChapterType`
> lets a writer add more, wired to a real "Document types" manager modal
> (`openChapterTypeManager`), not store-only.

- ✅ Semantic document types — the `role` field, with real behavior riding on it
- 📋 Manuscript — no dedicated container; a manuscript is just "the project," which is arguably fine, but nothing distinguishes it as its own concept
- ❌ Volume — deliberately not built: this is a hierarchical *container*
  (chapters grouped inside parts grouped inside volumes), a different
  data problem from "what kind of content is this chapter." Building it
  means restructuring `project.chapters` from a flat list into a tree,
  not just tagging existing entries — store.js's own comment calls this
  out explicitly rather than pretending the leaf-type registry covers it.
- ❌ Part — same container problem as Volume, same reason it's not in this pass
- ✅ Chapter — builtin type
- ✅ Scene — exists independently of chapterTypes (scenes are their own record inside a chapter, always have been)
- ✅ Prologue — builtin type
- ✅ Epilogue — builtin type
- ✅ Interlude — builtin type
- ✅ Appendix — builtin type
- ✅ Glossary — builtin type
- ✅ Foreword — builtin type
- ✅ Afterword — builtin type
- ✅ Dedication — builtin type
- ✅ Epigraph — builtin type
- ✅ Bibliography — builtin type
- ✅ Author note — builtin type
- ✅ Research note — builtin type
- ✅ Alternate/draft material — builtin type

## 2.2 Document templates

> **Foundation pass, checked directly.** 7 builtins in `project.documentTemplates`
> (New Chapter, New Scene, Character Sheet, Research Note, Glossary,
> Appendix, Screenplay Scene — one more than the original wishlist even
> asked for), plus `createDocumentTemplate` as the real custom-template
> capability, not just a builtin list. Wired to a real "📄 Template"
> button opening `openTemplatePicker()` — flat list of all 7, chapter and
> scene templates together; scene templates correctly disable themselves
> with a tooltip when there's no active chapter to attach to.

- ✅ New chapter template
- ✅ New scene template
- ✅ Character-sheet template
- ✅ Research-note template
- ✅ Glossary template
- ✅ Appendix template
- ✅ Screenplay-scene template — not in the original wishlist, shipped anyway
- ✅ Custom document templates — `createDocumentTemplate`, the actual capability

## 2.3 Organization

> **Foundation pass, checked directly — this is the one that was most
> wrong before this correction.** Every item below except Smart
> collections has real `store.js` functions *and* is wired to a UI (the
> "🗂 Organize" modal's tabs, plus per-row star/pin toggles in the
> sidebar) — confirmed by reading `openOrganizeModal`'s references to
> each getter, not just confirming the getters exist. This distinction
> mattered this session: `organize-btn` itself was found completely
> unwired at one point (cached but no click handler), the sidebar was
> found still showing trashed/archived chapters despite Trash/Archive
> existing in `store.js`, and the chapter delete button was found calling
> the old hard-delete directly, bypassing the new soft-delete entirely —
> three real "exists in store.js but the UI doesn't actually use it right"
> bugs, now fixed.

- ✅ Folders/groups — `createFolder`/`assignChapterToFolder`, single-membership (one folder per chapter, unlike Collections below)
- ✅ Favorites — `toggleChapterFavorite`, ★ toggle on each sidebar row
- ✅ Pins — `toggleChapterPin`, 📌 toggle on each sidebar row, floats to the top of its own group (not globally — deliberately per-Act-group, so it can't fight the Act-grouping pass's contiguous-arc assumption)
- ✅ Recents — `getRecentChapters`, backed by `recordChapterOpened` hooked into the existing chapter-switch signal `renderWriteView` already computes (was previously dead code — the function existed but was never called anywhere, so Recents could never populate)
- ✅ Saved collections — `createCollection`/`addChapterToCollection`, multi-membership (a chapter can be in any number of collections, unlike Folders)
- 🧠 Smart collections — deliberately deferred by `store.js`'s own comment: a smart collection is a saved dynamic *filter*, which needs a real query/filter language to define what the rule even is. That's §9's job (Search/Query Foundation), still its own unbuilt foundation. Building a one-off ad-hoc filter just for this would mean redoing the work once §9 lands.
- ✅ Saved searches — `createSavedSearch`, stores query + case-sensitivity + regex flag
- ✅ Archive — `archiveChapter`/`unarchiveChapter`, correctly hidden from the main sidebar now (previously a real bug: archived chapters still showed there)
- ✅ Trash/recycle bin — `trashChapter` (soft-delete) + restore, the chapter delete button was fixed this session to actually call this instead of the old permanent `deleteChapter`

## 2.4 Navigation/workspace

> **Confirmed still genuinely zero code** — checked directly against
> both `store.js` and `app.js`, not carried over from an older pass. No
> hits for any of the below beyond one incidental code comment
> ("breadcrumb," used loosely to describe an unrelated entity-nesting
> UI element, not a navigation feature).

- 📋 Breadcrumbs
- 📋 Back/forward history
- 📋 Tabs
- 📋 Split editor
- 📋 Multi-pane workspace
- 📋 Saved workspace layouts
- 📋 Pinned inspector
- 📋 Exact-text bookmarks
- 📋 Text anchors
- 📋 Return-to-origin navigation
- ✅ Global project search — this one already exists (`searchProject`/Search view) and shouldn't have been grouped here; it's a §9 (Search) item that got miscategorized into this list, not a real gap
- 📋 Smart resume / continue where left off

## 2.5 Contextual inspector

> **Confirmed still genuinely zero code**, checked directly. What exists
> under a similar-sounding name is the `[[mention]]`-click entity drawer
> from much earlier in the project — a real feature, but a narrower,
> different thing than the universal "click anything, see relevant
> context" inspector this section describes. Not the same feature wearing
> a different name; genuinely unbuilt.

- 📋 Universal inspector
- 📋 Scene context
- 📋 Character context
- 📋 Location context
- 📋 Reference context
- 📋 Timeline context
- 📋 Story-question context
- 📋 Relationship context
- 📋 Relevant world rules
- 📋 Relevant annotations

---

# 3. REVISION / SAFETY / REVIEW

## 3.1 Automatic history

Manual named snapshots exist and are wired up (Revision History modal,
Session 6) — `createSnapshot(chapterId, label)` / `getSnapshots` /
`restoreSnapshot` / `deleteSnapshot` in `store.js`, plus a real diff view
comparing a snapshot against current content (`diff.js`'s `diffText`,
used directly by the modal). Checked directly, not assumed from the doc.

- ✅ Named snapshots
- ✅ Snapshot restore
- ✅ Snapshot-vs-current diff
- 📋 Automatic version checkpoints (snapshot creation is manual-only —
  one call site, the modal's own "save snapshot" button; nothing creates
  one automatically on a timer or on save)
- 📋 Pre-destructive-action checkpoints
- 📋 Revision branches
- 📋 Branch comparison
- 📋 Branch merge
- 📋 World-state snapshots
- 📋 World-state diff

## 3.2 Undo/recovery

- 📋 Text undo
- 📋 Structural undo
- 📋 Project-action history
- 📋 Transactional mutations
- 📋 Rollback
- ✅ Trash (Organization pass, §2.3 — soft-delete/restore/permanent-delete
  for chapters; nothing else yet — entities, scenes, and other record
  types still only hard-delete)
- ✅ Object restore (chapters only, same scope note as Trash above)
- 📋 Project restore
- 📋 Crash recovery
- 📋 Backup rotation
- 📋 Backup integrity validation
- 📋 Restore preview

## 3.3 Review

- 📋 Exact-text comments
- 📋 Comment threads
- 📋 Replies
- 📋 Resolve/reopen
- 📋 Suggestions
- 📋 Track Changes
- 📋 Accept/reject
- 📋 Reviewer identity
- 📋 Review filters
- 📋 Editor mode
- 📋 Beta-reader mode

## 3.4 Revision Studio

- 📋 Developmental edit
- 📋 Structural edit
- 📋 Scene edit
- 📋 Line edit
- 📋 Copy edit
- 📋 Proofreading
- 📋 Final pass
- 📋 Pass-specific notes
- 📋 Pass-specific checklists
- 📋 Revision history by pass

---

# 4. ADVANCED MANUSCRIPT / SCENE MODEL

## Scene fields

Checked directly against `store.js`'s `createScene` — 8 of the 19 listed
already exist as real fields (goal/conflict/outcome from the original
Corkboard card; pov/location/time/mood/status from the Contextual
drawer/inspector pass's Scene Inspector).

- ✅ POV
- ✅ Location
- ✅ Story time (field name: `time`)
- ✅ Goal
- ✅ Conflict
- 📋 Obstacle (distinct from Conflict in the wishlist's sense — not
  broken out as its own field)
- ✅ Outcome
- ✅ Emotional state (field name: `mood`)
- 📋 Information revealed
- 📋 Secrets introduced
- 📋 Character changes
- 📋 Foreshadowing (the standalone story-questions/foreshadowing
  tracker exists at the *project* level — §7's setup/payoff engine — but
  isn't a per-scene field)
- 📋 Payoff (same note as Foreshadowing above)
- 📋 Theme/motif
- 📋 Symbolism
- 📋 Scene intensity
- ✅ Scene status (field name: `status`, mirrors chapter status)
- 📋 Revision status (if meant as distinct from Scene status above —
  ambiguous in the original wishlist; only one status field exists)
- 📋 Narrative purpose

## Scene-derived tools

- 📋 Scene heartbeat / “did something change?”
- 📋 Goal-conflict-outcome analysis
- 📋 Scene dependency graph
- 📋 Scene chain visualization
- 📋 Scene density analysis
- 📋 Scene split/join
- 📋 Safe scene duplication
- 📋 Structural move/merge integrity

---

# 5. CHARACTER ARCHITECTURE

## Profile

- 🧠 Want
- 🧠 Need
- 🧠 Wound
- 🧠 Flaw
- 🧠 Strengths
- 🧠 Fears
- 🧠 Beliefs
- 🧠 Values
- 🧠 Contradictions
- 🧠 Secrets
- 🧠 Voice
- 🧠 Appearance
- 🧠 Relationships
- 🧠 Possessions
- 🧠 Physical condition

## Arc

- 🧠 Starting state
- 🧠 Desire
- 🧠 Lie/false belief
- 🧠 Pressure
- 🧠 Turning points
- 🧠 Midpoint
- 🧠 Crisis
- 🧠 Choice
- 🧠 Ending state
- 🧠 Arc-to-scene links
- 🧠 Arc visualization
- 🧠 State comparison

## Continuity

- 🧠 Appearance state
- 🧠 Clothing
- 🧠 Injuries
- 🧠 Possessions
- 🧠 Knowledge
- 🧠 Location
- 🧠 Emotional state
- 🧠 Inventory history

---

# 6. KNOWLEDGE / SECRETS / MYSTERY

- 🧠 Character knows
- 🧠 Character suspects
- 🧠 Character believes
- 🧠 Character falsely believes
- 🧠 Character does not know
- 🧠 Reader knows
- 🧠 Reader does not know
- 🧠 Faction knows
- 🧠 Knowledge gained at event
- 🧠 Secret origin
- 🧠 Secret holders
- 🧠 Reveal scene
- 🧠 Reveal path
- 🧠 Red herrings
- 🧠 Information dependencies
- 🧠 Dramatic irony
- 🧠 Reader-knowledge simulation
- 🧠 Character-knowledge simulation

## Mystery toolkit

- 🧠 Evidence board
- 🧠 Clues
- 🧠 Suspects
- 🧠 Motives
- 🧠 Theories
- 🧠 Witnesses
- 🧠 Evidence provenance
- 🧠 Investigation timeline
- 🧠 Case-board graph

---

# 7. THEMES / MOTIFS / NARRATIVE INTENT

- 🧠 Themes
- 🧠 Motifs
- 🧠 Symbols
- 🧠 Recurring imagery
- 🧠 Theme-to-scene links
- 🧠 Motif frequency
- 🧠 First appearance
- 🧠 Escalation
- 🧠 Payoff
- 🧠 Meaning changes
- 🧠 Narrative intent
- 🧠 Scene consequence
- 🧠 Setup / promise / payoff
- 🧠 Open loops
- 🧠 Hooks
- 🧠 Story threads
- 🧠 Thread health / dormancy

---

# 8. PROSE / CRAFT ANALYTICS

> **Checked directly against `store.js`/`app.js` while correcting §2 —
> this section is stale in the same "built but not marked" way §2.1–2.3
> were.** Three of the Narrative items below are real, tested (Craft-tools
> pass, `craft-tools.smoketest.mjs`), and wired into the Stats view, not
> just present in `store.js`. Everything in Prose (sentence-level style
> metrics) is genuinely still unbuilt — this doc isn't wrong about all of
> §8, just the three specific Narrative items below.

## Prose

- 📋 Sentence length
- 📋 Paragraph length
- 📋 Passive voice
- 📋 Repetition
- 📋 Clichés
- 📋 Filler
- 📋 Readability
- 📋 Cadence
- 📋 Dialogue tags
- 📋 Adverbs
- 📋 Tense drift
- 📋 Voice drift

## Narrative

- 📋 Action density
- ✅ Dialogue ratio — `getDialogueRatio`, an estimate (anything inside quote marks counts as dialogue, not a precise parse), correctly advisory
- 📋 Description ratio
- 📋 Information density
- ✅ POV distribution — `getPovDistribution`, count of scenes per POV string
- 🔶 Scene length — not scene-level; `getChapterWordCounts` gives per-chapter totals, which is the closest thing shipped to a length/pacing signal but isn't the finer scene-by-scene granularity this item implies
- 📋 Location changes
- 📋 Character appearances
- 📋 Pacing curve
- 📋 Tension curve
- 📋 Emotional curve
- 📋 Exposition density
- 📋 Subplot distribution
- 📋 Setting distribution

Analytics remain advisory, not objective writing law.

---

# 9. SEARCH / QUERY FOUNDATION

> **Checked directly against `search.js`'s actual `searchProject`
> implementation.** The doc previously marked Manuscript/Scenes/Entities
> as unbuilt, which was flatly wrong — all three are real, tested, and
> wired into the Search view. This is a wiring-and-coverage gap, not a
> missing feature: the underlying scan function exists and works well for
> what it covers, it just never got extended to the other data types
> listed below. Confirmed no hits for References/Annotations/Rule
> systems/Maps/canon state/document type anywhere in `search.js`.

## Global search

- ✅ Manuscript — chapter content, full-text
- ✅ Scenes — goal/conflict/outcome/notes/location fields (Quick-wins pass)
- ✅ Entities — name, description, and tags (Quick-wins pass)
- 📋 References — real gap; `references.js`'s data is never scanned
- ✅ Notes — covered via Entities above; there's no separate "Notes" data type beyond the entity list itself
- ✅ Timeline — event title, story date, description
- 📋 Annotations — real gap
- 📋 Rule systems — real gap; system/node names and descriptions aren't scanned
- 📋 Maps — real gap; marker labels aren't scanned
- ✅ Tags — entity tags specifically (`tagMatches`); reference tags are moot until References itself is covered
- 📋 Canon state — `canonStatus` exists on entities/rule systems (§34) but isn't filterable here
- 📋 Document type — `docType` exists (§2.1) but isn't filterable here
- *(not in the original wishlist, shipped anyway)* ✅ Snippets — full-text, sorted by recency

## Query language

Potential examples:

`type:character`

`tag:important`

`status:draft`

`pov:White`

`chapter:10..20`

`created:30d`

Saved queries should be usable as Smart Collections.

None of this exists — `searchProject` takes a plain string query with
`caseSensitive`/`useRegex` flags, nothing resembling field-scoped query
syntax. This is the real prerequisite §2.3 already points to for Smart
Collections, and is its own unbuilt foundation, not a light wrapper over
what's there now.

---

# 10. PROJECT DASHBOARD / HEALTH / RESUME

- 📋 Unified project dashboard
- 📋 Writing status
- 📋 Revision status
- 📋 Worldbuilding status
- 📋 Continuity status
- 📋 Publishing status
- 📋 Open questions
- 📋 Unresolved annotations
- 📋 Current blockers
- 📋 Recently changed objects
- 📋 Recommended next action
- 📋 “Where was I?”
- 📋 Last editing context
- 📋 Return-after-long-break summary

Potential summary:

```text
NEWLIGHT

182,402 words
54 chapters
317 scenes

12 unfinished scenes
8 unresolved annotations
5 continuity warnings
21 open questions

Next recommended task:
→ Revise Chapter 31
```

---

# 11. AUTHOR WORKBENCH / SCRATCH LAYER

Extend Snippets into:

- 📋 Ideas
- 📋 Dialogue fragments
- 📋 Scene fragments
- 📋 Character thoughts
- 📋 Research-to-do
- 📋 Future-book ideas
- 📋 Images
- 📋 Voice notes
- 📋 Temporary experiments
- 📋 “Maybe”
- 📋 Random chaos

Promotion:

`Snippet → Scene`

`Snippet → Character`

`Snippet → Entity`

`Snippet → Reference`

`Snippet → Story Question`

`Snippet → Canon`

---

# 12. WRITING PRODUCTIVITY

- 📋 Daily goals
- 📋 Weekly goals
- 📋 Monthly goals
- 📋 Project targets
- 📋 Chapter targets
- 📋 Scene targets
- 📋 Deadlines
- 📋 Projected completion
- 📋 Writing session history
- 📋 Productivity heatmap
- 📋 Milestones
- 📋 Streaks
- 📋 Best writing hours
- 📋 Average words/session
- 📋 Returning-author resume
- 📋 Abandoned-project resume

Optional chaos:

- 🧪 Word-count combat
- 🧪 Writing quests
- 🧪 Rewards
- 🧪 Challenges

---

# 13. IMPORT FOUNDATION

- ✅ Plain text
- ✅ Markdown
- 📋 DOCX
- 📋 RTF
- 📋 ODT
- 📋 HTML
- 📋 Portable Tinta project
- 📋 Structured backup
- 📋 EPUB ingestion for migration/reference
- 📋 PDF ingestion for research

Import pipeline:

`parse → detect structure → detect chapters → detect scene breaks → detect metadata → preview → normalize → import`

---

# 14. OUTPUT / PUBLISHING FOUNDATION

## Formats

- ✅ Markdown
- 📋 DOCX
- 📋 EPUB
- 📋 PDF
- 📋 Standard manuscript
- 📋 Web serial
- 📋 Reader copy
- 📋 Review copy
- 📋 Archive package

## Book structure

- 📋 Title page
- 📋 Copyright
- 📋 Dedication
- 📋 Epigraph
- 📋 Foreword
- 📋 Preface
- 📋 Table of contents
- 📋 Afterword
- 📋 Acknowledgements
- 📋 About author
- 📋 Other works
- 📋 Glossary
- 📋 Appendix
- 📋 Bibliography

## Layout

- 📋 Page size
- 📋 Margins
- 📋 Headers
- 📋 Footers
- 📋 Page numbers
- 📋 Chapter openings
- 📋 Scene breaks
- 📋 Widow/orphan handling
- 📋 Page breaks
- 📋 Typography profiles
- 📋 Paragraph indentation
- 📋 Line spacing

## Preview

- 📋 Page preview
- 📋 EPUB preview
- 📋 Print preview
- 📋 Reader preview
- 📋 TOC preview

## Profiles

- 📋 Ebook
- 📋 Print
- 📋 Standard manuscript
- 📋 Web serial
- 📋 Reader
- 📋 Editor
- 📋 Custom

---

# 15. PORTABLE PROJECT / DATA SAFETY

- 📋 `.tinta` portable project package
- 📋 Media bundling
- 📋 References bundled
- 📋 Maps bundled
- 📋 Snapshots bundled
- 📋 World data bundled
- 📋 Import/export round-trip verification
- 📋 Project integrity checker
- 📋 Recovery package

Potential package:

```text
MyNovel.tinta
├── project
├── manuscript
├── entities
├── relationships
├── timeline
├── maps
├── references
├── systems
├── generators
├── scenarios
├── snapshots
├── media
└── metadata
```

---

# 16. REFERENCES / RESEARCH

Current foundation:

- ✅ Images
- ✅ URLs
- ✅ Notes
- ✅ Quotes
- ✅ Screenshots
- ✅ Book/source entries
- ✅ Tags
- ✅ Entity/chapter/scene links

Future:

- 📋 PDF
- 📋 Video
- 📋 Image gallery
- 📋 Reference board
- 📋 Provenance chain
- 📋 Citation metadata
- 📋 Bibliography
- 📋 Source annotations
- 📋 Research collections
- 📋 Research inbox
- 📋 Reverse-linked reference display

---

# 17. MAP / SPATIAL SYSTEM

Current foundation:

- ✅ Map types
- ✅ Coordinates
- ✅ Markers
- ✅ Marker → entity

Future:

- 📋 Regions/polygons
- 📋 Paths
- 📋 Rivers
- 📋 Borders
- 📋 Multiple layers
- 📋 Location → scenes
- 📋 Location → events
- 📋 Travel routes
- 📋 Travel duration
- 📋 Geographic scale
- 📋 Spatial queries

Chaos:

- 🧪 Heightmaps
- 🧪 Biomes
- 🧪 Political borders
- 🧪 Cities
- 🧪 Roads
- 🧪 Cultures
- 🧪 Religions
- 🧪 Resources
- 🧪 Trade routes

---

# 18. TIME / CALENDAR

Current foundation:

- ✅ Custom months
- ✅ Weekdays
- ✅ Date arithmetic
- ✅ Before/after
- ✅ Duration
- ✅ Relative offsets
- ✅ Flashback chronology checking

Future:

- 📋 Seasons
- 📋 Multiple eras
- 📋 Multiple calendars
- 📋 Holidays
- 📋 Calendar conversion
- 📋 Parallel timeline strands
- 📋 Temporal branches
- 📋 Relative natural-language date parsing

Chaos:

- 🧪 Astronomy
- 🧪 Orbital models
- 🧪 Multiple moons
- 🧪 Eclipses
- 🧪 Derived seasons
- 🧪 Astronomical events

---

# 19. SERIES / UNIVERSE

Current foundation:

- ✅ Series
- ✅ Shared entities
- ✅ Shared characters
- ✅ Shared locations

Future:

- 📋 Shared factions
- 📋 Shared magic systems
- 📋 Shared cosmology
- 📋 Shared chronology
- 📋 Cross-book continuity
- 📋 Cross-book versioning
- 📋 Universe dashboard
- 📋 Universe-wide search
- 📋 Universe glossary
- 📋 Universe references

---

# 20. RELATIONSHIP HISTORY

Current relationship metadata is a current-state snapshot.

Future:

- 📋 State history
- 📋 Start/end state records
- 📋 Relationship event log
- 📋 Friends → rivals → enemies → allies
- 📋 Relationship timeline
- 📋 Historical graph
- 📋 Time-slider graph

This should reuse:

`Relationship + Event + Time + State`

---

# 21. CULTURE

Starter template foundation exists.

Future depth:

- 📋 Food
- 📋 Economy
- 📋 Family
- 📋 Religion
- 📋 Government
- 📋 Social hierarchy
- 📋 Marriage
- 📋 Inheritance
- 📋 Clothing
- 📋 Architecture
- 📋 Art
- 📋 Military customs
- 📋 Taboos
- 📋 Festivals
- 📋 Etiquette
- 📋 Naming conventions
- 📋 Historical influence

---

# 22. SPECIES / BIOLOGY

Starter foundation exists.

Future depth:

- 📋 Anatomy
- 📋 Physiology
- 📋 Lifespan
- 📋 Reproduction
- ✅ Diet
- ✅ Senses
- 📋 Abilities
- 📋 Weaknesses
- ✅ Habitat
- 📋 Adaptations
- 📋 Evolutionary history
- 📋 Disease susceptibility
- 📋 Cultural implications

---

# 23. LANGUAGE / CONLANG

Starter foundation exists.

Future depth:

- 📋 Phonology
- ✅ Phonotactics
- 📋 Grammar
- 📋 Syntax
- ✅ Morphology
- 📋 Writing system
- 📋 Vocabulary
- 📋 Naming rules
- 📋 Dialects
- 📋 Proto-language
- 📋 Historical stages
- 📋 Language evolution
- 📋 Generator constraints

---

# 24. RELIGION / PHILOSOPHY

## Religion

- ✅ Starter foundation
- 📋 Creation myth
- 📋 Deities
- 📋 Sacred texts
- 📋 Clergy
- 📋 Rituals
- 📋 Festivals
- 📋 Taboos
- 📋 Virtues
- 📋 Sins
- 📋 Afterlife
- 📋 Sacred places
- 📋 Schisms
- 📋 Heresy
- 📋 Political influence

## Philosophy

- 🧠 Axioms
- 🧠 Principles
- 🧠 Schools
- 🧠 Philosophers
- 🧠 Contradictions
- 🧠 Political effects
- 🧠 Cultural effects

---

# 25. GOVERNMENT / POLITICS

Starter foundation exists.

Future:

- 📋 Government types
- 📋 Offices
- 📋 Succession
- 📋 Laws
- 📋 Institutions
- 📋 Factions
- 📋 Legitimacy
- 📋 Territory
- 📋 Alliances
- 📋 Rivalries
- 📋 Diplomacy
- 📋 Political events
- 📋 Regime changes

---

# 26. ECONOMY / RESOURCES

Starter foundation exists.

Future:

- 📋 Resources
- 📋 Production
- 📋 Scarcity
- 📋 Labor
- 📋 Trade
- 📋 Imports
- 📋 Exports
- 📋 Currency
- 📋 Taxation
- 📋 Prices
- 📋 Economic shocks
- 📋 Trade routes
- 📋 Resource dependencies

---

# 27. TECHNOLOGY TREE

- 🧠 Technologies
- 🧠 Prerequisites
- 🧠 Resources
- 🧠 Production
- 🧠 Branching technology
- 🧠 Adoption
- 🧠 Civilizational effects
- 🧠 Magic/technology interactions

---

# 28. MAGIC / POWER / SKILLS

Current domain-agnostic rule-system foundation exists.

## System

- ✅ Source
- ✅ Resource
- ✅ Channel
- ✅ Rules / cycle prevention
- ✅ Costs
- ✅ Restrictions
- ✅ Progression/rank
- ✅ Categories
- ✅ Abilities
- ✅ Counters
- ✅ Evolution
- 🧠 Affinities
- 🧠 Cross-system interactions

## Skill

- ✅ Name
- ✅ Type/category
- ✅ Rank
- ✅ Requirements
- ✅ Cost
- ✅ Cooldown
- ✅ Range
- ✅ Duration
- ✅ Effect
- ✅ Limitation
- ✅ Counter
- ✅ Synergy
- ✅ Evolution

## Class/progression

- 🧠 Class trees
- 🧠 Unlock requirements
- 🧠 Branching UI
- 🧠 Skill dependencies
- 🧠 Trait systems
- 🧠 Multi-stage evolution

---

# 29. FICTIONAL RULES / PHYSICS

Reuse the RuleSystem rather than inventing another architecture.

- 🧠 Magic rules
- 🧠 Physical laws
- 🧠 Biology rules
- 🧠 Technology constraints
- 🧠 Religious laws
- 🧠 Political rules
- 🧠 Economic rules
- 🧠 Social customs
- 🧠 Supernatural laws

Future:

`Proposed event/ability → evaluate against rules → contradiction / unresolved exception`

---

# 30. COSMOLOGY / ONTOLOGY

The cosmology layer is explicitly allowed to become absurd, provided it remains useful for authoring.

## Ontology

- 🧪 Physical
- 🧪 Spiritual
- 🧪 Conceptual
- 🧪 Temporal
- 🧪 Informational
- 🧪 Divine
- 🧪 Transcendent
- 🧪 Unknown

## Reality

- 🧪 Universe
- 🧪 Dimension
- 🧪 Plane
- 🧪 Realm
- 🧪 Domain
- 🧪 Pocket world
- 🧪 Dream world
- 🧪 Afterlife
- 🧪 Void

## Metaphysics

- 🧪 Reality laws
- 🧪 Metaphysical rules
- 🧪 Ontological invariants
- 🧪 Forbidden states
- 🧪 Authority/domain rules
- 🧪 Existence conditions

## Causality

- 🧪 Causal graph
- 🧪 Causal strength
- 🧪 Retrocausality
- 🧪 Causal loops
- 🧪 Paradox registry
- 🧪 Temporal branches
- 🧪 Outside-time entities

## Identity

- 🧪 Avatar
- 🧪 Reincarnation
- 🧪 Clone
- 🧪 Fragment
- 🧪 Manifestation
- 🧪 Successor
- 🧪 “Same entity?” relationships

## State

- 🧪 Alive
- 🧪 Dead
- 🧪 Undead
- 🧪 Dormant
- 🧪 Ascended
- 🧪 Erased
- 🧪 Forgotten
- 🧪 Manifest
- 🧪 Unmanifest
- 🧪 Split
- 🧪 Merged
- 🧪 Transcendent

## Cosmology tools

- 🧪 Reality-layer stack
- 🧪 Cosmological hierarchy graph
- 🧪 Authority graph
- 🧪 Canon authority
- 🧪 Cosmology glossary
- 🧪 Cosmology report
- 🧪 Cosmology contradiction detector
- 🧪 “Where is this law used?”
- 🧪 “What depends on this law?”

---

# 31. ARTIFACT / ITEM SYSTEM

- 🧠 Identity
- 🧠 Material
- 🧠 Maker
- 🧠 Origin
- 🧠 Abilities
- 🧠 Limitations
- 🧠 Ownership
- 🧠 Ownership history
- 🧠 Symbolism
- 🧠 Destruction condition
- 🧠 Appearance
- 🧠 Historical events

---

# 32. ECOLOGY / POPULATION / CIVILIZATION

## Ecology

- 🧪 Biomes
- 🧪 Flora
- 🧪 Fauna
- 🧪 Predators
- 🧪 Prey
- 🧪 Food chains
- 🧪 Disease
- 🧪 Resources
- 🧪 Migration
- 🧪 Ecological effects

## Population

- 🧪 Population
- 🧪 Birth/death
- 🧪 Migration
- 🧪 Age groups
- 🧪 Occupations
- 🧪 Urbanization
- 🧪 Settlement growth
- 🧪 Demographic shocks

## Civilization

- 🧪 Geography
- 🧪 Population
- 🧪 Resources
- 🧪 Economy
- 🧪 Technology
- 🧪 Government
- 🧪 Religion
- 🧪 Culture
- 🧪 Military
- 🧪 Trade
- 🧪 History

---

# 33. PROCEDURAL GENERATION

## Generator foundation

- 🧱 Inputs
- 🧱 Rules
- 🧱 Components
- 🧱 Weights
- 🧱 Dependencies
- 🧱 Output schema
- 🧱 Seed
- 🧱 Generator version
- 🧱 Reproducibility
- 🧱 Custom generator definition

Generators:

- 🧠 Names
- 🧠 Characters
- 🧠 Places
- 🧠 Cities
- 🧠 Cultures
- 🧠 Factions
- 🧠 Religions
- 🧠 Species
- 🧠 Artifacts
- 🧠 Monsters
- 🧠 Myths
- 🧠 Magic systems
- 🧠 Skills
- 🧠 Historical events
- 🧠 Civilizations
- 🧠 Languages

---

# 34. GENERATION / CANON CONTROL

> **Foundational pass, checked directly against `store.js` and
> `canon-control.smoketest.mjs`/`seed-foundation.smoketest.mjs` (43 + 64
> assertions). Real, not aspirational** — `commitWorldbuildingDraft` and
> `generateStarterSystem`, the app's two actual generator entry points,
> both stamp every object they create with a `generation` record and
> default `canonStatus: 'draft'`. One real gap found while verifying:
> `markGenerationEdited` (the "user modifications" tracker) is an
> explicit hook, not wired to fire automatically on edit — store.js's own
> comment says as much, and a repo-wide search confirms zero call sites
> in `app.js`. The field exists and is tested in isolation; in the
> running app right now, a generated entity's `edited` flag will never
> actually flip to `true`, because nothing calls the function that would.

Generated objects should preserve provenance:

- ✅ Seed — `seed` param threaded through `generateEntityNames`/`draftWorldbuildingEntity`/`commitWorldbuildingDraft`/`generateStarterSystem`, backed by a real seeded PRNG (`createRng`/`randomSeed` in `generator.js`, deterministic — same seed produces the same draw sequence, verified directly)
- ✅ Inputs — `generation.inputs`, captures what was actually passed to the generator (e.g. `typeKey`)
- 🔶 Rule set — not its own field; `inputs` captures the type/domain used, which is the closest thing to "which rules applied," but there's no distinct record of the ruleset itself
- ✅ Generator version — `generation.generatorVersion`, a module-level constant
- ✅ Timestamp — `generation.timestamp`
- 🔶 Parent generation — the field exists (`parentGenerationId`) and is always `null` on purpose; no "regenerate from a prior generation" feature exists yet to populate it. Schema's ready, capability isn't.
- 🔶 **User modifications — real gap, not cosmetic.** `markGenerationEdited` exists, is correct, and is tested directly — but has zero call sites in `app.js`. Editing a generated entity's fields by hand right now does not flip `generation.edited`, despite the infrastructure being fully built for it to.

Canon states:

- ✅ Proposed
- ✅ Draft — the default for anything generated, confirmed by direct test
- ✅ Canon — the default for anything hand-created
- ✅ Alternate
- ✅ Deprecated
- ✅ Non-canon

(`getCanonStatuses()` returns exactly these six.)

Hard rule:

> **Generated content never silently becomes canon.**

✅ Upheld by default behavior — generated entities/systems start at
`'draft'`, never `'canon'`, confirmed by direct test. There's no UI yet
for a writer to actually change an object's canon status by hand (no
`setCanonStatus`-style function or dropdown exists) — so today the rule
holds trivially (nothing ever promotes anything), rather than because a
promotion flow exists and behaves correctly. Worth building a real
promotion UI before calling this fully closed, since "the field can't
change yet" and "the field changes correctly" aren't the same guarantee.

---

# 35. WORLD-STATE / SCENARIO SYSTEM

- 🧠 World snapshots
- 🧠 Entity-state snapshots
- 🧠 Timeline-state snapshots
- 🧠 World diff
- 🧠 Rollback
- 🧠 Scenario branches
- 🧠 Alternate history
- 🧠 Alternate ending
- 🧠 Counterfactuals
- 🧠 Scenario comparison
- 🧠 Promote scenario to canon
- 🧠 Discard scenario

---

# 36. HISTORICAL / CIVILIZATION SIMULATION

Simulation levels:

### Level 1 — logical

Does this violate a rule?

### Level 2 — deterministic

What necessarily follows?

### Level 3 — procedural

What plausible consequences might occur?

### Level 4 — historical

How might the world develop?

### Level 5 — chaos

Simulate:

`10 years`

`100 years`

`1,000 years`

`10,000 years`

Simulation output defaults to:

> **Experimental / Proposed**

not automatic canon.

---

# 37. IMPACT ANALYSIS

For important changes:

> **What changes if I change this?**

Possible affected objects:

- entities
- scenes
- chapters
- relationships
- timeline events
- maps
- references
- character arcs
- magic systems
- rules
- cosmology
- scenarios

Example:

```text
Rule changed
→ 3 systems
→ 14 entities
→ 27 skills
→ 82 scenes
→ 11 chapters
→ 2 open questions
```

This should eventually combine:

`Graph + Query + Rule + State + Timeline`

---

# 38. WORLD / MANUSCRIPT CONTINUITY

Potential checks:

- 🧠 Character age
- 🧠 Existence/death
- 🧠 Location
- 🧠 Travel time
- 🧠 Possession
- 🧠 Injury
- 🧠 Appearance
- 🧠 Relationship state
- 🧠 Knowledge
- 🧠 Timeline
- 🧠 World rules
- 🧠 Magic rules
- 🧠 Technology
- 🧠 Culture
- 🧠 Cosmology
- 🧠 Terminology
- 🧠 Canon state

Severity:

- Hard contradiction
- Possible inconsistency
- Writer judgment required

---

# 39. RESEARCH / PROVENANCE / FACT CHECK

- 🧠 Source metadata
- 🧠 Quote capture
- 🧠 Citation
- 🧠 Bibliography
- 🧠 Source → entity
- 🧠 Source → scene
- 🧠 Source → chapter
- 🧠 Provenance chain
- 🧠 Research notes
- 🧠 Fact-check flags
- 🧠 External-fact review queue

---

# 40. VISUAL / WHITEBOARD SYSTEM

- 🧠 Text cards
- 🧠 Entity cards
- 🧠 Scene cards
- 🧠 Images
- 🧠 Maps
- 🧠 Arrows
- 🧠 Groups
- 🧠 Freeform notes
- 🧠 Layers
- 🧠 Linked objects
- 🧠 Saved board layouts

---

# 41. READER / AUDIOBOOK / ADAPTATION

## Reader

- 🧠 Full manuscript reading
- 🧠 Reading progress
- 🧠 Reading time
- 🧠 Reader bookmarks
- 🧠 Clean review copy

## Audiobook preparation

- ✅ TTS foundation
- ✅ Pronunciation foundation
- 🧠 Dialogue extraction
- 🧠 Speaker identification
- 🧠 Narrator notes
- 🧠 Pause markers
- 🧠 Per-character pronunciation
- 🧠 Audiobook script export

## Adaptation

- 🧠 Screenplay document type
- 🧠 Screenplay formatting
- 🧠 Novel → adaptation workflow
- 🧠 Interactive-fiction branches
- 🧠 Choice/state graph

---

# 42. DOCUMENTATION / BIBLE GENERATION

Generate:

- 🧠 Character Bible
- 🧠 World Bible
- 🧠 Series Bible
- 🧠 Timeline
- 🧠 Glossary
- 🧠 Magic-system documentation
- 🧠 Cosmology report
- 🧠 Faction report
- 🧠 Continuity report
- 🧠 Health report
- 🧠 Research bibliography

---

# 43. LORE HEALTH

- 🧠 Unused entities
- 🧠 Unused rules
- 🧠 Unused locations
- 🧠 Unused factions
- 🧠 Unused magic
- 🧠 Duplicate entities
- 🧠 Duplicate references
- 🧠 Dead links
- 🧠 Stale lore
- 🧠 Orphaned objects
- 🧠 Lore bloat indicators

Advisory only.

---

# 44. AUTHOR DECISION LOG

Record:

- Decision
- Reason
- Alternatives
- Affected objects
- Date
- Author

Examples:

- Magic system changed
- Chapter removed
- Character motivation changed
- Cosmology rule established
- Timeline retconned

Separate from technical version history.

---

# 45. CANON AUTHORITY / PROVENANCE

Possible authority sources:

- Author decision
- Published manuscript
- Scene evidence
- Character belief
- Rumor
- External research
- Generated proposal
- Imported material

This helps AI, continuity, revision, and canon auditing distinguish:

> “The author says this is true.”

from:

> “A character thinks this is true.”

---

# 46. CONTEXTUAL AI

AI scope:

- selection
- sentence
- paragraph
- scene
- chapter
- arc
- book
- entity
- world
- universe

Commands:

- summarize
- brainstorm
- continue
- rewrite
- extract entities
- extract references
- generate metadata
- find contradictions
- generate lore proposal
- analyze scene
- generate synopsis
- generate Bible/report

AI context should respect:

- canon
- permissions
- selected scope
- project rules
- character voice
- world rules
- POV
- knowledge state

---

# 47. AI TRUST / PRIVACY

- 🧠 No-AI mode
- 🧠 Cloud-AI mode
- 🧠 Local-AI mode
- 🧠 Per-project AI permissions
- 🧠 Read-only AI
- 🧠 Suggestion-only AI
- 🧠 AI provenance
- 🧠 AI-generated-content state
- 🧠 Context visibility controls
- 🧠 AI cannot silently mutate canon

---

# 48. COLLABORATION / SHARING

- 📋 Shared projects
- 📋 Author role
- 📋 Editor role
- 📋 Co-author role
- 📋 Reviewer role
- 📋 Permission system
- 📋 Shared comments
- 📋 Change history
- 📋 Merge/conflict handling
- 📋 Beta-reader workflow

---

# 49. PLUGINS / EXTENSIONS

- 📋 Plugin API
- 📋 Custom views
- 📋 Custom generators
- 📋 Custom entity types
- 📋 Custom analyzers
- 📋 Custom exporters
- 📋 Custom commands
- 📋 Custom inspector panels
- 📋 Integration hooks

---

# 50. ACCESSIBILITY / DEVICES

- 📋 Full keyboard navigation
- 📋 Screen-reader semantics
- 📋 Focus management
- 📋 Accessible dialogs
- 📋 Accessible drag/drop alternatives
- 📋 Reduced motion
- 📋 Contrast controls
- 📋 Font scaling
- 📋 Responsive writing surface
- 📋 Tablet workflow
- 📋 Mobile writing workflow
- 📋 Rebindable shortcuts

---

# 51. SYNC

Eventually:

```text
LOCAL
  ↕
SYNC
  ↕
DESKTOP / LAPTOP / TABLET / PHONE
```

Requirements:

- 📋 Cross-device synchronization
- 📋 Conflict detection
- 📋 Conflict resolution
- 📋 Offline queue
- 📋 Version reconciliation
- 📋 Time-zone-aware history

---

# 52. ONBOARDING

Build this near the end of v0.1.

## Simple

> **I just want to write.**

Expose:

- Manuscript
- Chapters
- Scenes
- Basic outline
- Characters
- Timeline
- Basic world entities
- Search
- Writing goals

## Normal

> **I want a serious novelist workspace.**

Expose:

- Full writing
- Planning
- Worldbuilding
- Timeline
- Relationships
- Maps
- References
- Health
- Continuity
- Craft
- Systems

## Maximum

> **I am constructing a fucking universe.**

Expose:

- Everything
- Advanced world systems
- Magic
- Skills
- Culture
- Language
- Religion
- Economy
- Technology
- Cosmology
- Generation
- Simulation
- AI
- Advanced analytics
- Research
- Publishing
- Scenario branches
- Experimental tools

Simple/Normal/Maximum are **workspace profiles**, not product editions.

---

# 53. PROGRESSIVE DISCLOSURE

- 🧠 Show advanced
- 🧠 Tooltips
- 🧠 Contextual help
- 🧠 First-run walkthrough
- 🧠 Feature discovery
- 🧠 Example projects
- 🧠 Suggested tools
- 🧠 Project-type suggestions
- 🧠 Configurable navigation density

Potential project archetypes:

- Standard novel
- Epic fantasy
- Science fiction
- Mystery
- Romance
- Historical fiction
- Screenplay
- Interactive fiction
- Nonfiction
- Research-heavy project

---

# 54. V0.1 FEATURE FREEZE

Before declaring v0.1 complete:

- Verify current implementation
- Browser-test major data/UI flows
- Run migration tests
- Run destructive-action tests
- Run large-project tests
- Validate backups
- Validate import/export round-trips
- Audit all major data models
- Capture known technical debt
- Freeze feature scope

Then:

# **TINTA v0.1 = BUILD THE MONSTER**

---

# 55. V0.2 GREAT REFACTOR

## Phase 1 — Archaeology

Map:

`UI → controller → domain → store → persistence`

Find duplication and ownership conflicts.

## Phase 2 — Canonical concepts

Define:

- Entity
- Relationship
- Event
- Time
- Location
- Rule
- Resource
- State
- Scene
- Reference
- Generator
- Scenario
- Revision
- Query

## Phase 3 — Hybrid migration

`Unify → Adapter → Refactor one domain → Test → Migrate → Delete old path`

## Phase 4 — Shared engines

- Entity engine
- Relationship engine
- Event engine
- Timeline engine
- State engine
- Rule engine
- Reference engine
- Generator engine
- Query engine
- Scenario engine
- Revision engine

## Phase 5 — UI unification

- Modal system
- Inspector system
- Panel system
- Command registry
- Shortcut registry
- Filtering
- Navigation
- Notifications
- Workspace layouts

## Phase 6 — Product polish

- Performance
- UX
- Accessibility
- Mobile
- Sync
- Testing
- Visual consistency
- Onboarding

---

# 56. THE CORE RULE OF V0.1

> **Prototype capabilities broadly. Preserve coherent data contracts. Do not waste the release polishing architecture that has not yet proven itself.**

---

# 57. THE CORE RULE OF V0.2

> **Do not refactor blindly. Define what each concept means first, then migrate implementations toward the canonical model.**

---

# 58. THE MAXIMUM TINTA PRODUCT MODEL

```text
TINTA
│
├── AUTHORING
│   ├── Manuscript
│   ├── Scenes
│   ├── Revision
│   ├── Review
│   └── Publishing
│
├── STORY
│   ├── Arcs
│   ├── Threads
│   ├── Questions
│   ├── Themes
│   ├── Mystery
│   └── Knowledge
│
├── WORLD
│   ├── Entities
│   ├── Relationships
│   ├── Geography
│   ├── Time
│   ├── Culture
│   ├── Language
│   ├── Religion
│   ├── Politics
│   └── Economy
│
├── SYSTEMS
│   ├── Magic
│   ├── Skills
│   ├── Classes
│   ├── Technology
│   └── Rules
│
├── COSMOLOGY
│   ├── Ontology
│   ├── Reality
│   ├── Realms
│   ├── Metaphysics
│   ├── Causality
│   └── Canon
│
├── GENERATION
│   ├── Procedural
│   ├── Rule-based
│   └── AI
│
├── SIMULATION
│   ├── History
│   ├── Population
│   ├── Economy
│   ├── Politics
│   ├── Culture
│   └── What-if
│
├── INTELLIGENCE
│   ├── Search
│   ├── Queries
│   ├── Continuity
│   ├── Impact analysis
│   └── Craft analysis
│
├── RESEARCH
│   ├── References
│   ├── Sources
│   ├── Provenance
│   └── Media
│
└── ECOSYSTEM
    ├── Sync
    ├── Collaboration
    ├── Mobile
    ├── Accessibility
    └── Plugins
```

---

# 59. FINAL PHILOSOPHY

### v0.1

> **BUILD THE MONSTER.**

Build the foundations of each major capability.

### v0.2

> **UNIFY THE MONSTER.**

Turn the accumulated features into a coherent architecture.

### v0.3+

> **MAKE THE MONSTER FAST, BEAUTIFUL, TRUSTWORTHY, AND EXTENSIBLE.**

### Maximum Tinta

The author can open one project, write the novel, build its universe, define its rules, model its history, generate within its constraints, explore alternate possibilities, audit continuity, research sources, revise safely, and produce the finished book without maintaining disconnected copies of the same creative world.
