// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js

import { saveRecoverySnapshot, getRecoverySnapshot, clearRecoverySnapshot, saveDowngradeQuarantine } from './recoveryStore.js';

const DB_KEY = 'tinta:db';
// Roadmap #5 — exported (and re-exported through store.js) so the .tinta
// manifest builder and the import guards compare against the one source of
// truth. It was previously module-private while tintaPackage.js read
// Store.SCHEMA_VERSION, which evaluated to undefined — every exported
// manifest silently carried no schemaVersion at all.
export const SCHEMA_VERSION = 5;
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export const STORAGE_KEY = DB_KEY;
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
const LEGACY_DB_KEY = 'scriptorium:db';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export const MAX_RECENT_ACTIVITY = 8;

// ── safe dictionary lookup ─────────────────────────────────────────────
//
// project.entities / relationships / ruleSystems / systemNodes /
// timelineEvents / maps / references / images are plain objects used as
// dictionaries, and plain objects inherit from Object.prototype. So a
// lookup like `project.entities[id]` is truthy for ids that were never
// stored: 'constructor' returns the Object function, 'toString' and
// 'valueOf' return functions, 'hasOwnProperty' likewise. A getter that
// tests truthiness then hands that back as if it were an entity, and the
// caller gets a function where it expected a record.
//
// Ordinary Tinta ids are uid-generated and can't collide, but .tinta files
// are external input — an imported project can carry whatever keys it
// likes. ownGet() makes the lookup mean what it reads as: "is this key
// actually in this dictionary", never "did the prototype chain answer".
//
// Object.hasOwn rather than a null-prototype dictionary because the db
// round-trips through JSON.parse on every load, which always produces
// ordinary-prototype objects — a null prototype set at creation time would
// silently disappear at the next reload, giving the appearance of a fix
// without the substance.
export function ownGet(map, key) {
  if (!map || typeof map !== 'object') return undefined;
  if (typeof key !== 'string' && typeof key !== 'number') return undefined;
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

export function ownHas(map, key) {
  if (!map || typeof map !== 'object') return false;
  if (typeof key !== 'string' && typeof key !== 'number') return false;
  return Object.hasOwn(map, key);
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function now() {
  return new Date().toISOString();
}

// Session 12 — factored out of emptyDb() so createProject() builds a project
// with exactly the same shape as the one a fresh install gets, instead of a
// second hand-maintained copy of this object drifting out of sync with it.
export function makeProject(title = 'My Novel') {
  const projectId = uid('proj');
  const chapterId = uid('chap');
  return {
    id: projectId,
    title,
    createdAt: now(),
    updatedAt: now(),
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    lastOpenedAt: '',
    wordGoal: 0,
    // Session 21 — local ISO date of the last goal-hit celebration toast,
    // '' if never. See checkGoalCelebration() below for why this is a
    // per-day guard rather than a per-crossing one.
    lastGoalCelebrationDate: '',
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    coverImageId: null,
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    startedAt: null,
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    storyType: '', // e.g. "Fiction", "Fanfic" — free text, not a fixed enum
    genre: '',
    language: '',
    blurb: '', // synopsis/description — prose, not a filter field
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    seriesId: null,
    // v0.2.9 — passive entity recognition. mentionStopwords is a list of
    // words the writer has marked as "not an entity mention even though
    // they match an entity name/alias." passiveRecognition gates whether
    // the editor scans for entity names in plain prose (Phase 6). Default
    // off for existing projects (set in migrate_v4_to_v5), on for new
    // projects via this seed.
    mentionStopwords: [],
    passiveRecognition: true, // on by default for new projects — existing projects stay off (migration sets false)
    chapters: [
      {
        id: chapterId,
        title: 'Chapter 1',
        order: 0,
        status: 'draft', // 'draft' | 'revised' | 'final'
        povCharacter: '',
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
        arc: '',
        targetWordCount: 0,
        writeTimeMs: 0,
        content: '',
        updatedAt: now(),
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
        lastOpenedAt: '',
        scenes: [],
        // Session 6 — manual revision snapshots. See createSnapshot() below.
        snapshots: [],
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
        lastCursorPos: 0,
        lastScrollTop: 0,
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
        lastReadSpread: 0,
        lastAutoCheckpointAt: now(),
      },
    ],
    // Session 3 — entities table for [[mention]] backlinks. Keyed by id,
    // same "flat, JSON-serializable" philosophy as the rest of the db.
    entities: {},
    // Session 4 — relationship edges between entities, kept as their own
    // collection rather than nested on entities, same reasoning as
    // mentions being decoupled from what they point at.
    relationships: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    relationshipTypes: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    sceneRelationships: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    storyQuestions: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    graphPresets: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    pronunciations: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    customDictionary: [],
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    styleGuide: [],
    // Session 5 — sketchpad/map-maker. Strokes stored as vector point
    // arrays, not raster images, to stay small and JSON-serializable —
    // same "small vault" philosophy as the rest of the db.
    sketches: {},
    // Session 7 — snippet/idea inbox. Flat, unlinked scratch notes —
    // deliberately not entities or scenes, just a place to park a
    // stray idea without deciding where it belongs yet.
    snippets: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    timelineEvents: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    calendar: null,
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    maps: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    references: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    annotations: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    bookmarks: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    quotes: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    ruleSystems: {},
    systemNodes: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    dailyWordCounts: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    images: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    entityTypes: [
      {
        key: 'character',
        label: 'Character',
        color: null,
        builtin: true,
        fields: [
          { key: 'want', label: 'Want' },
          { key: 'need', label: 'Need' },
          { key: 'wound', label: 'Wound' },
          { key: 'flaw', label: 'Flaw' },
        ],
      },
      { key: 'location', label: 'Location', color: null, builtin: true, fields: [] },
      { key: 'item', label: 'Item', color: null, builtin: true, fields: [] },
      { key: 'concept', label: 'Concept', color: null, builtin: true, fields: [] },
    ],
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    chapterTypes: [
      { key: 'chapter', label: 'Chapter', role: 'content', builtin: true },
      { key: 'prologue', label: 'Prologue', role: 'content', builtin: true },
      { key: 'epilogue', label: 'Epilogue', role: 'content', builtin: true },
      { key: 'interlude', label: 'Interlude', role: 'content', builtin: true },
      { key: 'foreword', label: 'Foreword', role: 'frontmatter', builtin: true },
      { key: 'dedication', label: 'Dedication', role: 'frontmatter', builtin: true },
      { key: 'epigraph', label: 'Epigraph', role: 'frontmatter', builtin: true },
      { key: 'afterword', label: 'Afterword', role: 'backmatter', builtin: true },
      { key: 'appendix', label: 'Appendix', role: 'backmatter', builtin: true },
      { key: 'glossary', label: 'Glossary', role: 'backmatter', builtin: true },
      { key: 'bibliography', label: 'Bibliography', role: 'backmatter', builtin: true },
      { key: 'author-note', label: 'Author note', role: 'scratch', builtin: true },
      { key: 'research-note', label: 'Research note', role: 'scratch', builtin: true },
      { key: 'alternate-draft', label: 'Alternate/draft material', role: 'scratch', builtin: true },
    ],
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    folders: [],
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    parts: [],
    collections: [],
    savedSearches: [],
    recentChapterIds: [],
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    documentTemplates: [
      { id: 'tpl-new-chapter', builtin: true, appliesTo: 'chapter', name: 'New Chapter', docType: 'chapter', titleSeed: 'Untitled Chapter', content: '' },
      { id: 'tpl-new-scene', builtin: true, appliesTo: 'scene', name: 'New Scene', titleSeed: 'Untitled Scene', sceneFields: { goal: '', conflict: '', outcome: '', notes: '', location: '' } },
      {
        id: 'tpl-character-sheet',
        builtin: true,
        appliesTo: 'chapter',
        name: 'Character Sheet',
        docType: 'research-note',
        titleSeed: 'Character: ',
        content: '# Name\n\n## Appearance\n\n\n## Voice\n\n\n## Want / Need\n\n\n## Wound / Flaw\n\n\n## Backstory\n\n\n## Notes\n\n',
      },
      {
        id: 'tpl-research-note',
        builtin: true,
        appliesTo: 'chapter',
        name: 'Research Note',
        docType: 'research-note',
        titleSeed: 'Research: ',
        content: '## Topic\n\n\n## Source\n\n\n## Key facts\n\n\n## Relevance to the story\n\n',
      },
      {
        id: 'tpl-glossary',
        builtin: true,
        appliesTo: 'chapter',
        name: 'Glossary',
        docType: 'glossary',
        titleSeed: 'Glossary',
        content: '**Term**: Definition.\n\n**Term**: Definition.\n\n',
      },
      {
        id: 'tpl-appendix',
        builtin: true,
        appliesTo: 'chapter',
        name: 'Appendix',
        docType: 'appendix',
        titleSeed: 'Appendix: ',
        content: '# \n\n',
      },
      {
        id: 'tpl-screenplay-scene',
        builtin: true,
        appliesTo: 'scene',
        name: 'Screenplay Scene',
        titleSeed: 'INT. LOCATION - DAY',
        sceneFields: { goal: '', conflict: '', outcome: '', notes: 'INT./EXT. LOCATION - TIME\n\nAction line.\n\nCHARACTER\nDialogue.', location: '' },
      },
    ],
  };
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export function makeSeries(title = 'Untitled Series') {
  return {
    id: uid('series'),
    title: (title || 'Untitled Series').trim(),
    createdAt: now(),
    updatedAt: now(),
    memberProjectIds: [],
    // Same 4 builtins as a fresh project, same reasoning: a shared
    // Character/Location/Item/Concept vocabulary to start from rather than
    // an empty type list every series would immediately have to rebuild.
    entityTypes: [
      { key: 'character', label: 'Character', color: null, builtin: true, fields: [
        { key: 'want', label: 'Want' },
        { key: 'need', label: 'Need' },
        { key: 'wound', label: 'Wound' },
        { key: 'flaw', label: 'Flaw' },
      ] },
      { key: 'location', label: 'Location', color: null, builtin: true, fields: [] },
      { key: 'item', label: 'Item', color: null, builtin: true, fields: [] },
      { key: 'concept', label: 'Concept', color: null, builtin: true, fields: [] },
    ],
    entities: {},
  };
}

function emptyDb() {
  const project = makeProject('My Novel');
  return {
    version: SCHEMA_VERSION,
    activeProjectId: project.id,
    theme: 'paper', // 'paper' | 'void' | 'sepia'
    manuscriptFont: 'literata', // 'literata' | 'hyperlegible' | 'mono' | 'custom'
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    customFont: { family: '', fileName: '' },
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    navStyle: 'grouped', // 'grouped' | 'compact'
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    motion: {
      chapterTransitions: true,
      speed: 'normal', // 'subtle' | 'normal' | 'relaxed'
    },
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    grammar: {
      enabled: false,
      endpointUrl: 'https://api.languagetool.org/v2/check',
      language: 'en-US',
      apiKey: '',
      username: '',
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      responseFormat: 'languagetool',
    },
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    ambience: {
      track: 'off',
      volume: 0.4,
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      customTrackName: '',
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      customTrackSource: 'file', // 'file' | 'url'
      customTrackUrl: '',
    },
    tts: {
      voiceURI: '',
      rate: 1,
    },
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    typewriter: {
      enabled: false,
      volume: 0.5,
      style: 'classic', // 'classic' | 'soft' | 'mechanical' | 'digital' — all synthesized, see typewriter.js
    },
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    autosaveDelayMs: 1500, // 0 (off) | 600 | 2000 | 5000
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    recentActivity: [],
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    customThesaurus: {},
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    background: {
      mode: 'none', // 'none' | 'gradient' | 'image'
      gradient: { colorA: '#B08D57', colorB: '#F7F5F0', direction: 'to bottom right' },
      imageDim: 0.35, // 0–1 scrim over a custom image, for legibility against sidebar text
      imageName: '', // original filename, for display only — bytes live in assetstore.js
    },
    // v0.2.9 — the "app disappears" release. App-level fields for the
    // welcome screen, onboarding, burger sidebar, and the typewriter-mode
    // gate. See migrate_v4_to_v5 for the per-field semantics.
    writerName: '', // shown on the "Welcome back, [name]" boot screen
    workspaceDensity: 'normal', // 'simple' | 'normal' | 'maximum' — gates view visibility
    sidebarCollapsed: false, // burger sidebar: false = expanded (260px), true = collapsed (60px rail)
    typewriterEnabled: false, // gates the 4th focus mode tier (off → focus → zen → typewriter)
    onboardingComplete: false, // gates the 3-card onboarding flow on first boot
    projects: {
      [project.id]: project,
    },
    // Series pass — app-level, like `projects` itself: a series is a shelf
    // spanning multiple projects, so it can't live inside any one of them.
    series: {},
  };
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
function applyLegacyFieldMigrations(db) {
  if (!db.grammar) {
    db.grammar = {
      enabled: false,
      endpointUrl: 'https://api.languagetool.org/v2/check',
      language: 'en-US',
      apiKey: '',
      username: '',
      responseFormat: 'languagetool',
    };
  }
  if (!db.ambience) db.ambience = { track: 'off', volume: 0.4, customTrackName: '' };
  if (typeof db.ambience.customTrackName !== 'string') db.ambience.customTrackName = '';
  if (db.ambience.customTrackSource !== 'file' && db.ambience.customTrackSource !== 'url') db.ambience.customTrackSource = 'file';
  if (typeof db.ambience.customTrackUrl !== 'string') db.ambience.customTrackUrl = '';
  if (!db.tts) db.tts = { voiceURI: '', rate: 1 };
  if (!db.typewriter) db.typewriter = { enabled: false, volume: 0.5, style: 'classic' };
  if (typeof db.typewriter.style !== 'string') db.typewriter.style = 'classic';
  if (!db.customFont || typeof db.customFont !== 'object') db.customFont = { family: '', fileName: '' };
  if (typeof db.autosaveDelayMs !== 'number') db.autosaveDelayMs = 1500;
  if (db.navStyle !== 'grouped' && db.navStyle !== 'compact') db.navStyle = 'grouped';
  if (!db.motion || typeof db.motion !== 'object') db.motion = { chapterTransitions: true, speed: 'normal' };
  if (typeof db.motion.chapterTransitions !== 'boolean') db.motion.chapterTransitions = true;
  if (!['subtle', 'normal', 'relaxed'].includes(db.motion.speed)) db.motion.speed = 'normal';
  if (!db.recentActivity) db.recentActivity = [];
  if (!db.customThesaurus || typeof db.customThesaurus !== 'object') db.customThesaurus = {};
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
  if (!db.background || typeof db.background !== 'object') {
    db.background = {
      mode: 'none',
      gradient: { colorA: '#B08D57', colorB: '#F7F5F0', direction: 'to bottom right' },
      imageDim: 0.35,
      imageName: '',
    };
  }
  // Series pass — app-level table, same backfill spot as background/
  // recentActivity above.
  if (!db.series || typeof db.series !== 'object') db.series = {};
  Object.values(db.projects || {}).forEach((project) => {
    if (typeof project.seriesId === 'undefined') project.seriesId = null;
    // Calendar pass — same backfill spot, same reasoning as seriesId just
    // above: old saves predate this field entirely, so it has to be
    // conjured into existence rather than just trusted to be there.
    if (typeof project.calendar === 'undefined') project.calendar = null;
    // Tier 4 pass — same backfill spot, same reasoning as calendar just
    // above.
    if (!project.maps) project.maps = {};
    if (!project.references) project.references = {};
    // Quick-wins pass — same backfill spot, same reasoning as maps/
    // references above: old saves predate these tables entirely.
    if (!project.annotations) project.annotations = {};
    if (!project.bookmarks) project.bookmarks = {};
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    if (!project.ruleSystems) project.ruleSystems = {};
    if (!project.systemNodes) project.systemNodes = {};
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    if (!project.entities) project.entities = {};
    if (!project.relationships) project.relationships = {};
    if (!project.relationshipTypes) project.relationshipTypes = {};
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    Object.values(project.relationships).forEach((rel) => {
      if (rel.typeId !== undefined) return;
      const trimmed = (rel.label || '').trim();
      if (!trimmed) {
        rel.typeId = null;
      } else {
        let type = Object.values(project.relationshipTypes).find((t) => t.label === trimmed);
        if (!type) {
          type = { id: uid('reltype'), label: trimmed, createdAt: rel.createdAt || now(), updatedAt: now() };
          project.relationshipTypes[type.id] = type;
        }
        rel.typeId = type.id;
      }
      delete rel.label;
    });
    if (!project.sketches) project.sketches = {};
    if (!project.snippets) project.snippets = {};
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    Object.values(project.snippets).forEach((s) => {
      if (typeof s.category !== 'string') s.category = '';
    });
    if (!project.timelineEvents) project.timelineEvents = {};
    if (!project.dailyWordCounts) project.dailyWordCounts = {};
    if (!project.images) project.images = {};
    if (typeof project.lastGoalCelebrationDate !== 'string') project.lastGoalCelebrationDate = '';
    if (project.coverImageId === undefined) project.coverImageId = null;
    if (project.startedAt === undefined) project.startedAt = null;
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    if (typeof project.lastOpenedAt !== 'string') project.lastOpenedAt = '';
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    if (!Array.isArray(project.chapters)) project.chapters = [];
    project.chapters.forEach((chapter) => {
      if (typeof chapter.lastOpenedAt !== 'string') chapter.lastOpenedAt = '';
    });
    // Library metadata pass — Library organizing/filtering metadata.
    if (typeof project.storyType !== 'string') project.storyType = '';
    if (typeof project.genre !== 'string') project.genre = '';
    if (typeof project.language !== 'string') project.language = '';
    if (typeof project.blurb !== 'string') project.blurb = '';
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    if (!Array.isArray(project.entityTypes)) {
      project.entityTypes = [
        {
          key: 'character',
          label: 'Character',
          color: null,
          builtin: true,
          fields: [
            { key: 'want', label: 'Want' },
            { key: 'need', label: 'Need' },
            { key: 'wound', label: 'Wound' },
            { key: 'flaw', label: 'Flaw' },
          ],
        },
        { key: 'location', label: 'Location', color: null, builtin: true, fields: [] },
        { key: 'item', label: 'Item', color: null, builtin: true, fields: [] },
        { key: 'concept', label: 'Concept', color: null, builtin: true, fields: [] },
      ];
    }
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    {
      const charType = project.entityTypes.find((t) => t.key === 'character');
      if (charType) {
        if (!Array.isArray(charType.fields)) charType.fields = [];
        const existingKeys = new Set(charType.fields.map((f) => f.key));
        [
          { key: 'want', label: 'Want' },
          { key: 'need', label: 'Need' },
          { key: 'wound', label: 'Wound' },
          { key: 'flaw', label: 'Flaw' },
        ].forEach((f) => {
          if (!existingKeys.has(f.key)) charType.fields.push(f);
        });
      }
    }
    // Document-type foundation pass — same reasoning as entityTypes above:
    // a pre-existing project gets the same builtin seed a fresh one would.
    if (!Array.isArray(project.chapterTypes)) {
      project.chapterTypes = [
        { key: 'chapter', label: 'Chapter', role: 'content', builtin: true },
        { key: 'prologue', label: 'Prologue', role: 'content', builtin: true },
        { key: 'epilogue', label: 'Epilogue', role: 'content', builtin: true },
        { key: 'interlude', label: 'Interlude', role: 'content', builtin: true },
        { key: 'foreword', label: 'Foreword', role: 'frontmatter', builtin: true },
        { key: 'dedication', label: 'Dedication', role: 'frontmatter', builtin: true },
        { key: 'epigraph', label: 'Epigraph', role: 'frontmatter', builtin: true },
        { key: 'afterword', label: 'Afterword', role: 'backmatter', builtin: true },
        { key: 'appendix', label: 'Appendix', role: 'backmatter', builtin: true },
        { key: 'glossary', label: 'Glossary', role: 'backmatter', builtin: true },
        { key: 'bibliography', label: 'Bibliography', role: 'backmatter', builtin: true },
        { key: 'author-note', label: 'Author note', role: 'scratch', builtin: true },
        { key: 'research-note', label: 'Research note', role: 'scratch', builtin: true },
        { key: 'alternate-draft', label: 'Alternate/draft material', role: 'scratch', builtin: true },
      ];
    }
    // Organization pass (§2.3) — project-level registries. Same "if it's
    // not an array, this project predates the feature" backfill as
    // chapterTypes just above.
    if (!Array.isArray(project.folders)) project.folders = [];
    if (!Array.isArray(project.parts)) project.parts = [];
    if (!Array.isArray(project.collections)) project.collections = [];
    if (!Array.isArray(project.savedSearches)) project.savedSearches = [];
    if (!Array.isArray(project.recentChapterIds)) project.recentChapterIds = [];
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    if (!Array.isArray(project.documentTemplates)) {
      project.documentTemplates = [
        { id: 'tpl-new-chapter', builtin: true, appliesTo: 'chapter', name: 'New Chapter', docType: 'chapter', titleSeed: 'Untitled Chapter', content: '' },
        { id: 'tpl-new-scene', builtin: true, appliesTo: 'scene', name: 'New Scene', titleSeed: 'Untitled Scene', sceneFields: { goal: '', conflict: '', outcome: '', notes: '', location: '' } },
        {
          id: 'tpl-character-sheet',
          builtin: true,
          appliesTo: 'chapter',
          name: 'Character Sheet',
          docType: 'research-note',
          titleSeed: 'Character: ',
          content: '# Name\n\n## Appearance\n\n\n## Voice\n\n\n## Want / Need\n\n\n## Wound / Flaw\n\n\n## Backstory\n\n\n## Notes\n\n',
        },
        {
          id: 'tpl-research-note',
          builtin: true,
          appliesTo: 'chapter',
          name: 'Research Note',
          docType: 'research-note',
          titleSeed: 'Research: ',
          content: '## Topic\n\n\n## Source\n\n\n## Key facts\n\n\n## Relevance to the story\n\n',
        },
        {
          id: 'tpl-glossary',
          builtin: true,
          appliesTo: 'chapter',
          name: 'Glossary',
          docType: 'glossary',
          titleSeed: 'Glossary',
          content: '**Term**: Definition.\n\n**Term**: Definition.\n\n',
        },
        {
          id: 'tpl-appendix',
          builtin: true,
          appliesTo: 'chapter',
          name: 'Appendix',
          docType: 'appendix',
          titleSeed: 'Appendix: ',
          content: '# \n\n',
        },
        {
          id: 'tpl-screenplay-scene',
          builtin: true,
          appliesTo: 'scene',
          name: 'Screenplay Scene',
          titleSeed: 'INT. LOCATION - DAY',
          sceneFields: { goal: '', conflict: '', outcome: '', notes: 'INT./EXT. LOCATION - TIME\n\nAction line.\n\nCHARACTER\nDialogue.', location: '' },
        },
      ];
    }
    Object.values(project.entities || {}).forEach((entity) => {
      if (entity.parentId === undefined) entity.parentId = null;
      if (!Array.isArray(entity.aliases)) entity.aliases = [];
      if (!entity.customFields || typeof entity.customFields !== 'object') entity.customFields = {};
      if (!Array.isArray(entity.tags)) entity.tags = [];
      if (!Array.isArray(entity.statusEvents)) entity.statusEvents = [];
      // Foundational pass (Real Revision Foundation) — see the schema
      // comment on createEntity's `snapshots` field.
      if (!Array.isArray(entity.snapshots)) entity.snapshots = [];
      if (typeof entity.lastAutoCheckpointAt !== 'string') entity.lastAutoCheckpointAt = entity.updatedAt || now();
      capAutoSnapshots(entity.snapshots);
    });
    (project.chapters || []).forEach((chapter) => {
      if (!chapter.snapshots) chapter.snapshots = [];
      if (typeof chapter.lastCursorPos !== 'number') chapter.lastCursorPos = 0;
      if (typeof chapter.lastScrollTop !== 'number') chapter.lastScrollTop = 0;
      // Session 22 — arc label, added to the chapter shape.
      if (typeof chapter.arc !== 'string') chapter.arc = '';
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      if (typeof chapter.targetWordCount !== 'number') chapter.targetWordCount = 0;
      if (typeof chapter.writeTimeMs !== 'number') chapter.writeTimeMs = 0;
      // Document-type foundation pass — every pre-existing chapter is a
      // plain 'chapter' by definition (the concept didn't exist before
      // this pass, so there's nothing to infer from old data).
      if (typeof chapter.docType !== 'string') chapter.docType = 'chapter';
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      if (typeof chapter.folderId === 'undefined') chapter.folderId = null;
      // Containers foundation pass — backfill for any chapter that
      // predates parts existing at all.
      if (typeof chapter.partId === 'undefined') chapter.partId = null;
      if (typeof chapter.favorite !== 'boolean') chapter.favorite = false;
      if (typeof chapter.pinned !== 'boolean') chapter.pinned = false;
      if (typeof chapter.archived !== 'boolean') chapter.archived = false;
      if (typeof chapter.trashedAt === 'undefined') chapter.trashedAt = null;
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      if (!Array.isArray(chapter.scenes)) chapter.scenes = [];
      // Contextual drawer/inspector pass — POV/location/time/mood/status on
      // scenes created before these fields existed.
      chapter.scenes.forEach((scene) => {
        if (typeof scene.pov !== 'string') scene.pov = '';
        if (typeof scene.location !== 'string') scene.location = '';
        if (typeof scene.time !== 'string') scene.time = '';
        if (typeof scene.mood !== 'string') scene.mood = '';
        if (typeof scene.status !== 'string') scene.status = 'draft';
      });
    });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    (project.chapters || []).forEach((chapter) => {
      chapter.scenes.forEach((scene) => {
        if (typeof scene.obstacle !== 'string') scene.obstacle = '';
        if (typeof scene.infoRevealed !== 'string') scene.infoRevealed = '';
        if (typeof scene.secretsIntroduced !== 'string') scene.secretsIntroduced = '';
        if (typeof scene.characterChanges !== 'string') scene.characterChanges = '';
        if (typeof scene.themeMotif !== 'string') scene.themeMotif = '';
        if (typeof scene.symbolism !== 'string') scene.symbolism = '';
        if (typeof scene.intensity !== 'string') scene.intensity = '';
        if (typeof scene.revisionStatus !== 'string') scene.revisionStatus = '';
        if (typeof scene.narrativePurpose !== 'string') scene.narrativePurpose = '';
      });
      // Session 24 — Book/Read mode's own position memory, same shape as
      // lastCursorPos/lastScrollTop above but for the paginated reader
      // rather than the editor.
      if (typeof chapter.lastReadSpread !== 'number') chapter.lastReadSpread = 0;
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      if (typeof chapter.lastAutoCheckpointAt !== 'string') chapter.lastAutoCheckpointAt = chapter.updatedAt || now();
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      (chapter.snapshots || []).forEach((snap) => {
        if (typeof snap.auto !== 'boolean') snap.auto = snap.label === 'Auto-checkpoint';
      });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      capAutoSnapshots(chapter.snapshots || []);
    });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    if (!Array.isArray(project.deletedItemBackups)) project.deletedItemBackups = [];
    if (!Array.isArray(project.decisionLog)) project.decisionLog = [];
    // Session 23 — entity image galleries (portraits/reference art), so
    // worldbuilding entries can show real images instead of only the
    // type-colored dot the canvas graph falls back to.
    Object.values(project.entities || {}).forEach((entity) => {
      if (!Array.isArray(entity.imageIds)) entity.imageIds = [];
      if (entity.primaryImageId === undefined) entity.primaryImageId = null;
    });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    Object.values(project.entities || {}).forEach((entity) => {
      if (typeof entity.canonStatus !== 'string' || !CANON_STATUSES.includes(entity.canonStatus)) entity.canonStatus = 'canon';
      if (entity.generation === undefined) entity.generation = null;
    });
    Object.values(project.ruleSystems || {}).forEach((system) => {
      if (typeof system.canonStatus !== 'string' || !CANON_STATUSES.includes(system.canonStatus)) system.canonStatus = 'canon';
      if (system.generation === undefined) system.generation = null;
    });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    Object.values(project.relationships || {}).forEach((rel) => {
      if (typeof rel.status !== 'string') rel.status = '';
      if (typeof rel.strength !== 'string') rel.strength = '';
      if (typeof rel.startDate !== 'string') rel.startDate = '';
      if (typeof rel.endDate !== 'string') rel.endDate = '';
      if (typeof rel.notes !== 'string') rel.notes = '';
    });
    // Relationship History pass — same backfill spot as the craft-tools
    // fields directly above, one pass later. A relationship from any
    // backup older than this pass won't have `history` at all.
    Object.values(project.relationships || {}).forEach((rel) => {
      if (!Array.isArray(rel.history)) rel.history = [];
    });
    (project.chapters || []).forEach((chapter) => {
      chapter.scenes.forEach((scene) => {
        if (typeof scene.notes !== 'string') scene.notes = '';
      });
    });
    Object.values(project.sketches || {}).forEach((sketch) => {
      if (!Array.isArray(sketch.linkedEntityIds)) sketch.linkedEntityIds = [];
    });
    if (!project.sceneRelationships) project.sceneRelationships = {};
    if (!project.storyQuestions) project.storyQuestions = {};
    if (!project.graphPresets) project.graphPresets = {};
    if (!project.pronunciations || typeof project.pronunciations !== 'object') project.pronunciations = {};
    if (!Array.isArray(project.customDictionary)) project.customDictionary = [];
    if (!Array.isArray(project.styleGuide)) project.styleGuide = [];
  });
  return db;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
function migrate_v2_to_v3(db) {
  const backfillAuthoritySource = (record) => {
    if (typeof record.authoritySource !== 'string' || !AUTHORITY_SOURCES.includes(record.authoritySource)) {
      record.authoritySource = 'Author decision';
    }
  };
  Object.values(db.projects || {}).forEach((project) => {
    Object.values(project.entities || {}).forEach(backfillAuthoritySource);
    Object.values(project.ruleSystems || {}).forEach(backfillAuthoritySource);
  });
  Object.values(db.series || {}).forEach((series) => {
    Object.values(series.entities || {}).forEach(backfillAuthoritySource);
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
function migrate_v3_to_v4(db) {
  Object.values(db.projects || {}).forEach((project) => {
    if (!project.quotes) project.quotes = {};
  });
}

// v0.2.9 — the "app disappears" release. Adds app-level fields for the
// welcome screen (writerName), onboarding (onboardingComplete,
// workspaceDensity), burger sidebar (sidebarCollapsed), and the
// typewriter-mode gate (typewriterEnabled). Also adds project-level
// fields for passive entity recognition (mentionStopwords,
// passiveRecognition). All seven have safe defaults that preserve
// existing behavior — existing installs won't see onboarding fire
// again (onboardingComplete is set true for pre-v5 dbs), the sidebar
// stays expanded, passive recognition stays off.
function migrate_v4_to_v5(db) {
  // App-level fields
  if (typeof db.writerName !== 'string') db.writerName = '';
  if (!['simple', 'normal', 'maximum'].includes(db.workspaceDensity)) db.workspaceDensity = 'normal';
  if (typeof db.sidebarCollapsed !== 'boolean') db.sidebarCollapsed = false;
  if (typeof db.typewriterEnabled !== 'boolean') db.typewriterEnabled = false;
  // Existing installs (pre-v5) skip onboarding — they've already been
  // using Tinta, so showing them the 3-card "what's your name?" flow
  // would be confusing. New installs get onboardingComplete = false
  // from emptyDb(), so they DO see onboarding.
  if (typeof db.onboardingComplete !== 'boolean') db.onboardingComplete = true;

  // Project-level fields
  Object.values(db.projects || {}).forEach((project) => {
    if (!Array.isArray(project.mentionStopwords)) project.mentionStopwords = [];
    // Only set passiveRecognition if it doesn't exist — makeProject()
    // seeds it as true for new projects; the migration shouldn't
    // override that. Existing projects (pre-v5) don't have the field,
    // so they get false (preserve existing behavior — don't surprise
    // the writer with a new popup they didn't ask for).
    if (typeof project.passiveRecognition !== 'boolean') project.passiveRecognition = false;
  });
}

const VERSIONED_MIGRATIONS = {
  3: migrate_v2_to_v3,
  4: migrate_v3_to_v4,
  5: migrate_v4_to_v5,
};

function migrate(db) {
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
  // P2-6 documentation — two parallel migration systems coexist here,
  // and the convention matters for future contributors:
  //
  //   1. applyLegacyFieldMigrations (line 367) runs UNCONDITIONALLY on
  //      every load and every replaceDb. It's the de-facto schema
  //      authority — idempotent backfills for new fields live here.
  //      Most new field additions should go here, not in a versioned
  //      migration, because (a) it runs on every load so existing
  //      projects get the field without needing a version bump, and
  //      (b) it runs on .tinta imports too (which set version: 5 on
  //      the wrapper to skip the versioned migrations — see
  //      tintaPackage.js:693).
  //
  //   2. VERSIONED_MIGRATIONS (line 760) runs only when db.version <
  //      target. Use this only for migrations that genuinely must NOT
  //      re-run on every load — e.g. one-time structural transforms
  //      like the v4→v5 passiveRecognition reset. If you put a new
  //      field backfill here, .tinta imports will skip it because the
  //      wrapper sets version: 5, and the field won't be added to
  //      imported projects.
  //
  // The current state is intentional (most field additions go in
  // applyLegacyFieldMigrations), but db.version ends up not tracking
  // which fields are actually present. A hand-crafted db with version: 5
  // can still be missing v5 fields — applyLegacyFieldMigrations catches
  // that case. Don't try to "fix" this by moving everything to
  // versioned migrations; the current setup is what makes .tinta import
  // work without per-version branching.
  applyLegacyFieldMigrations(db);
  let version = typeof db.version === 'number' ? db.version : 0;
  Object.keys(VERSIONED_MIGRATIONS)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((target) => {
      if (version < target) {
        VERSIONED_MIGRATIONS[target](db);
        version = target;
      }
    });
  db.version = Math.max(version, SCHEMA_VERSION);
  return db;
}

let _db = null;

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
let _loadWarning = null;

// Roadmap #5 — set when load() finds a db written by a NEWER Tinta (version
// above SCHEMA_VERSION). While set, every save path refuses to touch
// tinta:db so this build can never clobber data whose schema it can't
// interpret. Cleared never — a locked session stays locked; the writer was
// pointed at the newer build.
let _schemaDowngradeLock = false;

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
const _saveErrorListeners = [];

export function onSaveError(fn) {
  _saveErrorListeners.push(fn);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
const _saveSuccessListeners = [];

export function onSaveSuccess(fn) {
  _saveSuccessListeners.push(fn);
}

function notifySaveSuccess() {
  _saveSuccessListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener throwing shouldn't stop the others — same defensive
      // pattern as notifySaveError above.
    }
  });
}

function notifySaveError(detail) {
  _saveErrorListeners.forEach((fn) => {
    try {
      fn(detail);
    } catch {
      // A listener throwing shouldn't stop the others from being notified,
      // and definitely shouldn't turn a save failure into an uncaught error.
    }
  });
}

export function consumeLoadWarning() {
  const warning = _loadWarning;
  _loadWarning = null;
  return warning;
}

export function load() {
  if (_db) return _db;
  // Roadmap #9 — bound the corrupt-backup quarantine BEFORE anything this
  // boot can add to it. Each `tinta:db:corrupt-backup:<ts>` key holds a
  // full copy of an unreadable db, and they used to accumulate forever:
  // every boot that hit an unreadable key added one, nothing ever removed
  // one, and every one of them spends the same ~5 MB localStorage budget
  // the live db lives in. The newest two are kept (the recovery path at
  // most ever needs the most recent quarantine); anything older goes.
  sweepCorruptBackups();
  let migratedFromLegacyKey = false;
  let raw = null;

  try {
    raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      // Nothing under the new key yet — check the pre-rename key before
      // assuming this is a genuinely fresh install.
      raw = localStorage.getItem(LEGACY_DB_KEY);
      if (raw) migratedFromLegacyKey = true;
    }
  } catch {
    // localStorage itself is unreachable (private-browsing lockdown, a
    // browser setting, etc.) — nothing to recover, just start fresh.
    raw = null;
  }

  if (!raw) {
    // Genuinely nothing saved yet — a fresh install, not a recovery case.
    _db = emptyDb();
  } else {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.projects || Object.keys(parsed.projects).length === 0) {
        throw new Error('saved data has no projects');
      }
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      if (!parsed.activeProjectId || !parsed.projects[parsed.activeProjectId]) {
        parsed.activeProjectId = Object.keys(parsed.projects)[0];
      }
      // Roadmap #5 — downgrade guard. A db whose version is above
      // SCHEMA_VERSION was written by a newer Tinta and carries schema
      // semantics this build doesn't know (fields it would drop, migrations
      // a later upgrade would then wrongly skip because the version tag
      // already claims them). Every save re-serializes the whole db, so
      // "load it but don't touch it" isn't a real option — instead:
      // quarantine the raw bytes, boot on an empty db, and lock all writes
      // so the newer data is never clobbered. The writer gets a load
      // warning explaining where their data went.
      if (typeof parsed.version === 'number' && parsed.version > SCHEMA_VERSION) {
        _schemaDowngradeLock = true;
        // Pristine safety copy to IndexedDB (a separate quota universe
        // from the localStorage key being protected). Fire-and-forget:
        // the write lock keeps localStorage's copy pristine regardless.
        saveDowngradeQuarantine(raw).catch(() => {});
        _db = emptyDb();
        _loadWarning = {
          type: 'downgrade',
          message:
            `This database was written by a newer version of Tinta (schema v${parsed.version}; this build understands up to v${SCHEMA_VERSION}). ` +
            'Your data was not modified — a pristine copy was also saved to browser storage, and saving is paused in this build so nothing can overwrite it. ' +
            'Please continue in the newer version of Tinta, or update this copy first.',
        };
      } else {
        _db = parsed;
      }
    } catch {
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      try {
        localStorage.setItem(`${DB_KEY}:corrupt-backup:${Date.now()}`, raw);
      } catch {
        // Couldn't even save the backup copy (quota, storage disabled) —
        // nothing more to do here; fall through to the blank db regardless.
      }
      _db = emptyDb();
      _loadWarning = {
        type: 'corrupt',
        message:
          "Your saved writing couldn't be read and had to be reset. " +
          "A copy of the unreadable data was kept in local storage under a " +
          "'-corrupt-backup-' key, in case it can be recovered.",
      };
    }
  }

  _db = migrate(_db);
  ensureCrossTabListener();
  // Roadmap #5 — never persist under DB_KEY when a downgrade lock is on:
  // the legacy-key migration path would otherwise write the EMPTY db over
  // the newer data it just refused to load.
  if (migratedFromLegacyKey && !_schemaDowngradeLock) {
    // Roadmap #9 — persist under DB_KEY right away so this path only runs
    // once, and then actually DELETE the legacy key. Until this write
    // succeeds, `scriptorium:db` is still the only copy of the writer's
    // data and must not be touched; afterwards it is a stale duplicate
    // spending quota for nothing — the exact "legacy key re-saved under
    // the new name but never deleted" erosion the review flagged. A failed
    // save leaves the legacy key in place (it may be needed again).
    if (save()) {
      try { localStorage.removeItem(LEGACY_DB_KEY); } catch { /* best effort — it will be swept again on the next successful migration-save */ }
    }
  }
  return _db;
}

// Roadmap #9 — see the call at the top of load(). Enumerates quarantine
// keys, keeps the KEEP_CORRUPT_BACKUPS newest by timestamp, removes the
// rest. Every failure is swallowed by design: a hygiene sweep must never
// turn a boot into a crash, and losing an OLD quarantine is strictly
// better than losing the boot.
const CORRUPT_BACKUP_PREFIX = `${DB_KEY}:corrupt-backup:`;
const KEEP_CORRUPT_BACKUPS = 2;
function sweepCorruptBackups() {
  let length = 0;
  try {
    length = localStorage.length;
  } catch {
    return; // localStorage unreachable — nothing to sweep
  }
  const stamps = [];
  for (let i = 0; i < length; i++) {
    try {
      const key = localStorage.key(i);
      if (key && key.startsWith(CORRUPT_BACKUP_PREFIX)) {
        const ts = Number(key.slice(CORRUPT_BACKUP_PREFIX.length));
        stamps.push({ key, ts: Number.isFinite(ts) ? ts : 0 });
      }
    } catch { /* a single unreadable key shouldn't stop the sweep */ }
  }
  stamps.sort((a, b) => b.ts - a.ts);
  for (const stale of stamps.slice(KEEP_CORRUPT_BACKUPS)) {
    try { localStorage.removeItem(stale.key); } catch { /* best effort */ }
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
let _crossTabStale = false;
const _crossTabListeners = [];
export function onCrossTabConflict(fn) {
  _crossTabListeners.push(fn);
}
function notifyCrossTabConflict(detail) {
  _crossTabListeners.forEach((fn) => {
    try {
      fn(detail);
    } catch {
      // Same defensive shape as notifySaveError/notifySaveSuccess below —
      // a listener throwing shouldn't break the others or the save path.
    }
  });
}
// Exposed read-only so the UI can decide what to show without needing its
// own copy of this state (e.g. re-rendering a banner after a re-render
// wipes it, or checking on boot after a background tab was left open).
export function isCrossTabStale() {
  return _crossTabStale;
}

function handleStorageEvent(e) {
  if (e.key !== DB_KEY || !e.newValue) return;
  try {
    const incoming = JSON.parse(e.newValue);
    const incomingRev = incoming?.rev || 0;
    const ourRev = _db?.rev || 0;
    if (incomingRev > ourRev) {
      _crossTabStale = true;
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
      clearSaveRetry();
      notifyCrossTabConflict({ incomingRev, ourRev });
    }
  } catch {
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
  }
}

let _crossTabListenerRegistered = false;
function ensureCrossTabListener() {
  if (_crossTabListenerRegistered) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('storage', handleStorageEvent);
  _crossTabListenerRegistered = true;
}
// Test-only hook — smoketests can't open a second real tab, so this lets
// a test drive the exact same code path a genuine `storage` event would.
export function _simulateStorageEvent(newValueJson) {
  handleStorageEvent({ key: DB_KEY, newValue: newValueJson });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
const SAVE_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000]; // last value repeats
let _saveRetryTimer = null;
let _saveRetryAttempt = 0;

function scheduleSaveRetry() {
  if (_saveRetryTimer) return; // a retry is already pending — don't stack
  const delay = SAVE_RETRY_DELAYS_MS[Math.min(_saveRetryAttempt, SAVE_RETRY_DELAYS_MS.length - 1)];
  _saveRetryTimer = setTimeout(() => {
    _saveRetryTimer = null;
    _saveRetryAttempt++;
    writeToLocalStorage();
  }, delay);
}

function clearSaveRetry() {
  if (_saveRetryTimer) {
    clearTimeout(_saveRetryTimer);
    _saveRetryTimer = null;
  }
  _saveRetryAttempt = 0;
}

// Exposed so the UI can show "still trying" rather than nothing, and so
// tests can assert a retry is actually pending without waiting on a real
// timer.
export function getSaveRetryState() {
  return { pending: _saveRetryTimer !== null, attempt: _saveRetryAttempt };
}

// Test-only hook — forces a pending retry to run immediately instead of
// waiting out the real backoff delay. A no-op (returns false) if nothing
// is pending.
export function _forceSaveRetryNow() {
  if (!_saveRetryTimer) return false;
  clearTimeout(_saveRetryTimer);
  _saveRetryTimer = null;
  _saveRetryAttempt++;
  writeToLocalStorage();
  return true;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
const STORAGE_WARNING_THRESHOLD_BYTES = 4 * 1024 * 1024; // ~4MB — ahead of the ~5MB wall
const STORAGE_WARNING_RESET_RATIO = 0.9; // must drop back below 90% of the threshold to re-arm
let _sizeWarningShown = false;
const _storageHeadroomListeners = [];
export function onStorageHeadroom(fn) {
  _storageHeadroomListeners.push(fn);
}
function checkStorageHeadroom() {
  const size = estimateDbSizeBytes();
  if (size >= STORAGE_WARNING_THRESHOLD_BYTES && !_sizeWarningShown) {
    _sizeWarningShown = true;
    _storageHeadroomListeners.forEach((fn) => {
      try {
        fn({ bytes: size });
      } catch {
        // same defensive shape as every other listener list here
      }
    });
  } else if (size < STORAGE_WARNING_THRESHOLD_BYTES * STORAGE_WARNING_RESET_RATIO) {
    _sizeWarningShown = false;
  }
}

export function save() {
  if (!_db) return true;
  // Roadmap #5 — schema-downgrade lock: this session booted on a newer
  // binary's db; writing would destroy it. Same refusal shape as the
  // cross-tab-stale guard below.
  if (_schemaDowngradeLock) {
    notifySaveError({ type: 'locked', error: null });
    return false;
  }
  if (_crossTabStale) {
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    notifySaveError({ type: 'stale', error: null });
    return false;
  }
  return writeToLocalStorage();
}

function writeToLocalStorage() {
  if (_schemaDowngradeLock) {
// Roadmap #5 — retries are pointless while the lock is on (the payload can
// never land), so stop the retry machinery the way the storage-event stale
// path does, and report through the same channel app.js listens on.
    clearSaveRetry();
    notifySaveError({ type: 'locked', error: null });
    return false;
  }
  if (_crossTabStale) {
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    notifySaveError({ type: 'stale', error: null });
    return false;
  }
  try {
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    const newRev = (_db.rev || 0) + 1;
    const json = JSON.stringify({ ..._db, rev: newRev });
    localStorage.setItem(DB_KEY, json);
    _db.rev = newRev; // only commit the bump after the write actually landed
    clearSaveRetry();
    checkStorageHeadroom();
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    notifySaveSuccess();
    // P2-7 — successful save means any previous recovery snapshot is
    // now stale (the disk has the latest state), so drop it. If the
    // clear fails, the next boot sees the stale snapshot and silently
    // discards it via the rev comparison in recoveryToast.maybeShow().
    clearRecoverySnapshot().catch(() => {});
    return true;
  } catch (err) {
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
    const isQuota = Boolean(err && /quota/i.test(err.name || err.message || ''));
    notifySaveError({ type: isQuota ? 'quota' : 'unknown', error: err });
    scheduleSaveRetry();
    // P2-7, roadmap #3 revision — on a quota failure, snapshot the
    // in-memory _db to IndexedDB. IndexedDB has ~50MB+ quota vs
    // localStorage's ~5MB, so the same payload that failed to land in
    // localStorage will usually land in IndexedDB; recoveryToast.maybeShow()
    // offers it back on next boot.
    //
    // This used to snapshot only the FIRST quota failure (guarded by a
    // module flag reset on the next successful save). That was built on a
    // wrong assumption: "the in-memory _db doesn't change between retries".
    // It does — the writer keeps working while every save fails, and the
    // retry timer re-saves the same stale payload, so only the first
    // snapshot ever mattered. Anything typed after the first quota error
    // existed only in RAM and was lost if the tab closed. Snapshotting on
    // EVERY quota failure means the IndexedDB copy always tracks the
    // freshest unsaved state. The cost is one async IndexedDB put per
    // failed save (rare by definition — saving is broken), and puts on the
    // same store serialize, so overlapping retries can't corrupt it.
    if (isQuota) {
      saveRecoverySnapshot(_db).catch(() => {});
    }
    return false;
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export function estimateDbSizeBytes() {
  if (!_db) return 0;
  return JSON.stringify(_db).length * 2;
}

// P2-7 — public recovery-snapshot API. Used by recoveryToast.maybeShow()
// on boot to check whether a previous session ended with unsaved
// changes that landed in IndexedDB but not localStorage.
export { getRecoverySnapshot, clearRecoverySnapshot };

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
const MAX_UNDO_STACK = 100;
let _undoStack = [];
let _redoStack = [];

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export function cloneWithoutSnapshots(obj) {
  const { snapshots: _omit, ...rest } = obj;
  return JSON.parse(JSON.stringify(rest));
}

export function recordMutation(entry) {
  _undoStack.push(entry);
  if (_undoStack.length > MAX_UNDO_STACK) _undoStack.shift();
  // Any new mutation invalidates whatever redo branch existed — same
  // "linear history, no branching" behavior every mainstream editor uses.
  _redoStack = [];
}

export function clearUndoHistory() {
  _undoStack = [];
  _redoStack = [];
}

export function canUndo() { return _undoStack.length > 0; }
export function canRedo() { return _redoStack.length > 0; }
export function getUndoLabel() { return _undoStack.length ? _undoStack[_undoStack.length - 1].label : null; }
export function getRedoLabel() { return _redoStack.length ? _redoStack[_redoStack.length - 1].label : null; }

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
function applyMutationEntry(project, targetType, targetId, data) {
  if (targetType === 'chapter') {
    const idx = project.chapters.findIndex((c) => c.id === targetId);
    if (data === null) {
      if (idx !== -1) project.chapters.splice(idx, 1);
      return;
    }
    const currentSnapshots = idx !== -1 ? project.chapters[idx].snapshots || [] : [];
    const restored = { ...JSON.parse(JSON.stringify(data)), snapshots: currentSnapshots };
    if (idx === -1) project.chapters.push(restored);
    else project.chapters[idx] = restored;
  } else if (targetType === 'entity') {
    if (data === null) {
      delete project.entities[targetId];
      return;
    }
    const currentSnapshots = project.entities[targetId]?.snapshots || [];
    project.entities[targetId] = { ...JSON.parse(JSON.stringify(data)), snapshots: currentSnapshots };
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export function undo() {
  if (!_undoStack.length) return null;
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
  const entry = _undoStack[_undoStack.length - 1];
  const project = load().projects[entry.projectId];
  if (!project) {
    _undoStack.pop();
    return null;
  }
  _undoStack.pop();
  applyMutationEntry(project, entry.targetType, entry.targetId, entry.before);
  project.updatedAt = now();
  _redoStack.push(entry);
  save();
  return { label: entry.label, targetType: entry.targetType, targetId: entry.targetId, projectId: entry.projectId };
}

export function redo() {
  if (!_redoStack.length) return null;
  // Same peek-then-pop pattern as undo() above — don't lose the entry
  // if the project lookup fails.
  const entry = _redoStack[_redoStack.length - 1];
  const project = load().projects[entry.projectId];
  if (!project) {
    _redoStack.pop();
    return null;
  }
  _redoStack.pop();
  applyMutationEntry(project, entry.targetType, entry.targetId, entry.after);
  project.updatedAt = now();
  _undoStack.push(entry);
  save();
  return { label: entry.label, targetType: entry.targetType, targetId: entry.targetId, projectId: entry.projectId };
}

export function getActiveProject() {
  const db = load();
  return db.projects[db.activeProjectId];
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export function getActiveDb() {
  return load();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export { migrate };
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
const MAX_DELETED_ITEM_BACKUPS = 20;

export function backupBeforeDelete(kind, id, data, label) {
  const project = getActiveProject();
  if (!Array.isArray(project.deletedItemBackups)) project.deletedItemBackups = [];
  project.deletedItemBackups.unshift({
    id: uid('delbak'),
    kind, // 'entity' | 'ruleSystem'
    originalId: id,
    label,
    data: JSON.parse(JSON.stringify(data)), // deep copy — the live record is about to be mutated/deleted out from under this
    deletedAt: now(),
  });
  project.deletedItemBackups = project.deletedItemBackups.slice(0, MAX_DELETED_ITEM_BACKUPS);
}

// ── schema vocabulary + snapshot cap (0.2.8 Pass 1) ──────────────────
// Referenced by the migration ladder above AND by the entity/snapshot
// domain code in store.js — shared internals live here per the map.

export const CANON_STATUSES = ['canon', 'draft', 'proposed', 'alternate', 'deprecated', 'non-canon'];
export const AUTHORITY_SOURCES = [
  'Author decision',
  'Published manuscript',
  'Scene evidence',
  'Character belief',
  'Rumor',
  'External research',
  'Generated proposal',
  'Imported material',
];
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
const MAX_AUTO_SNAPSHOTS = 10;
export function capAutoSnapshots(snapshots, maxAuto = MAX_AUTO_SNAPSHOTS) {
  const autoIndices = snapshots
    .map((s, i) => (s.auto ? i : -1))
    .filter((i) => i !== -1);
  if (autoIndices.length <= maxAuto) return;
  // Oldest-first among the auto ones (array order is insertion order,
  // i.e. oldest-first already, since new snapshots are always pushed).
  const toRemoveCount = autoIndices.length - maxAuto;
  const idsToRemove = new Set(autoIndices.slice(0, toRemoveCount).map((i) => snapshots[i].id));
  // Splice from the end backward so earlier indices don't shift under us.
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (idsToRemove.has(snapshots[i].id)) snapshots.splice(i, 1);
  }
}

// 0.2.8 Pass 5 — helpers degraded from store.js: shared by the moved
// manuscript domain and the staying entity code, and domains cannot
// import each other, so they live here (exported for those importers).

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export const AUTO_CHECKPOINT_INTERVAL_MS = 20 * 60 * 1000;

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
const MAX_MANUAL_SNAPSHOTS = 25;
export function capManualSnapshots(snapshots, maxManual = MAX_MANUAL_SNAPSHOTS) {
  const manualIndices = snapshots
    .map((s, i) => (!s.auto ? i : -1))
    .filter((i) => i !== -1);
  if (manualIndices.length <= maxManual) return;
  const toRemoveCount = manualIndices.length - maxManual;
  const idsToRemove = new Set(manualIndices.slice(0, toRemoveCount).map((i) => snapshots[i].id));
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (idsToRemove.has(snapshots[i].id)) snapshots.splice(i, 1);
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export function getSeries(seriesId) {
  const db = load();
  return db.series[seriesId] || null;
}
export function getSeriesForActiveProject() {
  const project = getActiveProject();
  if (!project.seriesId) return null;
  return getSeries(project.seriesId) || null;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export function getChapter(chapterId) {
  const project = getActiveProject();
  return project.chapters.find((c) => c.id === chapterId) || null;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export function slugType(label) {
  const base = (label || 'type').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'type';
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-core-js
export function replaceDb(parsed) {
// Roadmap #5 — a full backup written by a NEWER Tinta must not land here:
// this build would round-trip it under a version tag claiming migrations
// it never ran, and a later upgrade would then skip those migrations for
// this data. Refuse BEFORE any state is touched — importFullBackup calls
// this before mutating anything, so throwing here leaves its rollback
// path unexercised and the current db intact.
  if (parsed && typeof parsed.version === 'number' && parsed.version > SCHEMA_VERSION) {
    throw new Error(
      `That backup was written by a newer version of Tinta (schema v${parsed.version}; this build understands up to v${SCHEMA_VERSION}). ` +
      'Nothing was changed — update Tinta and import it there.'
    );
  }
  _db = migrate(parsed);
  return _db;
}
