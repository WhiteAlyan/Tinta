# Tinta

### A local-first writing workspace for stories and the worlds behind them.

Tinta is a novel-writing and story-development workspace designed to bring the different parts of creating a story together.

Writing a novel is more than putting words on a page. There are characters to develop, relationships to track, timelines to organize, worldbuilding systems to maintain, references to collect, and countless details that need to remain consistent as a story grows.

Tinta brings these elements into one connected workspace.

Instead of treating writing, planning, and worldbuilding as separate activities, Tinta lets them work together around the same project — giving writers a place to write their stories, understand their structure, develop their worlds, and keep track of the details that hold everything together.

**Your manuscript is the center. Everything else exists to support it.**

---

## What is Tinta?

Tinta is a local-first novel-writing application built for writers who want more than a conventional text editor.

It combines a manuscript editor with tools for outlining, story organization, character development, relationship mapping, worldbuilding, continuity checking, and writing analytics.

The goal isn't to tell writers how their stories should be written. It's to give them the tools to manage the complexity of their own creative work without losing control of it.

Tinta is designed around three ideas:

- **Writing first.** The manuscript remains the heart of the project. Planning and worldbuilding should support the writing process, not get in its way.
- **Connected creativity.** Chapters, scenes, characters, locations, relationships, timelines, and references can inform one another.
- **Ownership of your work.** Your projects are stored locally, with portable project backups and manuscript export options.

## Features

### Writing and manuscript

- Distraction-free, Focus, and Zen writing modes
- Rich-text editing with Markdown support
- Chapter and scene organization
- Writing sprints and ambient sound
- Typewriter mode and customizable writing themes
- Inline images and saved quotations
- Chapter snapshots and revision comparison
- Book / Read mode with read-aloud support
- Grammar and style checking
- Word frequency and repeated-word checks
- Custom dictionaries and project-specific style guides

### Story planning and organization

- Outline and Corkboard views
- Chapter and scene reordering
- Story Timeline with custom calendars
- Document and chapter templates
- Folders, favorites, pins, collections, and saved searches
- Archive and Trash
- Story questions and foreshadowing tracking
- Annotations and bookmarks
- Writing statistics and project progress reports

### Worldbuilding

- Character, location, item, and concept records
- Custom entity types and fields
- Character relationships and relationship history
- Interactive Relationship Canvas
- Canvas layouts and saved graph presets
- Maps with custom markers
- Sketchpad for visual planning
- Shared entities across novels in a series or universe
- References and research organization
- Custom calendars and fictional date systems

### Systems and deeper worldbuilding

- Rule-based worldbuilding systems
- Magic, skills, technology, martial arts, cyberware, and cosmic-law templates
- Abilities, resources, restrictions, progression, and dependencies
- Character and worldbuilding generators
- Cosmology and other worldbuilding foundations
- Generation history and canon-status tracking

### Project intelligence

Tinta includes tools that help writers inspect their own projects without taking creative decisions away from them.

- Project Health checks for unresolved questions, orphaned entities, and broken references
- Continuity checking using entity status timelines
- Character arc profiles
- Scene relationships
- POV distribution and chapter word-count analytics
- Dialogue-to-narration estimates
- Writing activity and change reports
- Completion checklists

These tools provide information and surface potential issues. They do not decide what is canon, what is correct, or what a story must become.

---

## Local-first by design

Tinta is designed to work locally rather than depending on a hosted writing service.

- No account is required to use the application.
- Core writing and project features do not require a cloud service.
- Projects are stored in the browser on your device.
- The application supports offline use through its service worker.
- Projects can be exported as portable `.tinta` packages.
- Manuscripts can be exported to Markdown, DOCX, and EPUB.
- Automatic folder backups are available in supported Chromium-based browsers.

**A note about privacy:** Grammar checking is optional. If enabled, the selected chapter text is sent to the configured LanguageTool or compatible checking endpoint. This is not required for ordinary writing and can remain disabled.

Local storage is still subject to browser data-clearing and storage limitations. Keep backups of important projects.

---

## Getting started

Tinta uses vanilla JavaScript and ES modules. The application has no runtime package dependencies and does not require a build step.

You need Python 3 to use the included launchers.

1. Download or clone this repository.
2. Open the project folder.
3. Run the launcher for your operating system:

| Operating system | Launcher |
|---|---|
| Windows | `Launch Tinta (Windows).bat` |
| macOS | `Launch Tinta (Mac).command` |
| Linux | `Launch Tinta (Linux).sh` |

The launcher starts a local web server and opens Tinta in your browser.

Alternatively, start the server manually:

```bash
python3 -m http.server 8080
```

Then visit:

```text
http://localhost:8080
```

Do not open `index.html` directly with `file://`. Tinta uses ES modules and service workers, which require a local HTTP origin.

---

## Technology

Tinta is intentionally built without a front-end framework.

- HTML
- CSS
- Vanilla JavaScript
- JavaScript ES modules
- Browser storage APIs
- Progressive Web App support
- Service Worker for offline caching

Development and testing tools are separate from the application itself. Playwright, ESLint, and the associated test dependencies are used for development and verification; they are not required to run Tinta.

---

## Project status

**Current version: v0.3.0 — Fast, Beautiful(for beta), Trustworthy**

Tinta is an actively developed project. Its core writing, manuscript organization, worldbuilding, and project-intelligence foundations are implemented, while further refinement and expansion remain ongoing.

The long-term direction is to make Tinta a coherent creative workspace where writing and worldbuilding can grow together without making the application unnecessarily complicated.

Some advanced capabilities, integrations, accessibility improvements, and workflow refinements remain under development. Not every planned feature is currently available.

---

## Philosophy

Tinta began as a tool one story needed. Every feature here started as a wish my own writing software couldn't grant.

It is being built around a simple belief:

**A writer should own their work, their world, and the tools they use to create them.**

Tinta is not here to replace the writer. It is here to give the writer a place to build.

*May it hold your world as carefully as it has held mine.*

---

**Created by Zyeha Light • White Alyan**
