// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js

const SNIPPET_RADIUS = 40; // chars of context on each side of a match
const MAX_MATCHES_PER_FIELD = 20; // a runaway "e" search on a full chapter
// shouldn't return hundreds of hits — cap per field, not per project, so a
// long chapter doesn't crowd out every other result type.

// CR-43 — user-supplied regex must never be able to freeze the app. JS
// regex has no built-in execution limit, so a pattern like (a+)+$ against
// the wrong manuscript line backtracks exponentially. A cooperative
// budget between match iterations handles the "slow pattern over a big
// project" case gracefully (partial results + an honest "stopped" flag);
// the pathological single-exec() hang — where no cooperative check can
// ever run — is handled one layer up by the search worker's hard
// watchdog terminate (see searchService.js / search-worker.js). The
// budget constants here are the engine-level half of that design.
// Exported for searchService.js — the main-thread watchdog is armed at
// budget + grace, so it needs the same default the engine runs with.
export const SEARCH_TIME_BUDGET_MS = 2000; // cooperative wall-clock budget per search run
const MAX_TOTAL_MATCHES = 2000; // global result cap across the whole project

// performance.now() is monotonic and sub-ms (Date.now() can round to 0
// elapsed on fast fixtures, which would make budget-0 tests flaky).
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// One shared budget for a whole search run. findOccurrences consults it
// per loop iteration; searchProject consults it between categories. When
// the budget trips, scanning stops and the run reports WHY it stopped —
// the UI surfaces that honestly instead of pretending results are total.
function createSearchBudget({ budgetMs = SEARCH_TIME_BUDGET_MS, maxMatches = MAX_TOTAL_MATCHES } = {}) {
  const startedAt = nowMs();
  const budget = {
    deadline: budgetMs == null ? Infinity : startedAt + budgetMs,
    stopped: null, // null = ran to completion; else { reason: 'time' | 'matches', elapsedMs }
    elapsedMs() { return nowMs() - startedAt; },
    // Called once per match-iteration. Cheap by design: the deadline
    // comparison only runs when a match attempt is about to happen, never
    // per scanned character (indexOf/exec do the scanning in C). When
    // budgetMs is 0 the very first iteration stops — deterministic for tests.
    tick() {
      if (budget.stopped) return true;
      if (nowMs() >= budget.deadline) {
        budget.stopped = { reason: 'time', elapsedMs: budget.elapsedMs() };
      }
      return budget.stopped !== null;
    },
    addMatches(n) {
      if (budget.stopped || n <= 0) return;
      budget._count += n;
      if (budget._count >= budget._maxMatches) {
        budget.stopped = { reason: 'matches', elapsedMs: budget.elapsedMs() };
      }
    },
    _count: 0,
    _maxMatches: maxMatches == null ? Infinity : maxMatches,
  };
  return budget;
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
// budget (CR-43) is the run-wide createSearchBudget() instance — checked
// once per match ATTEMPT (loop iteration), which is what bounds a runaway
// "e*"-style pattern without taxing the C-speed scan between matches.
function findOccurrences(text, query, caseSensitive, useRegex = false, budget = null) {
  if (!text || !query) return [];
  if (budget && budget.stopped) return [];
  if (useRegex) {
    const pattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
    const indices = [];
    let match;
    // A pattern that can match the empty string (e.g. "a*") would loop
    // forever without this — advance manually past zero-length matches.
    while (indices.length < MAX_MATCHES_PER_FIELD) {
      if (budget && budget.tick()) break;
      match = pattern.exec(text);
      if (!match) break;
      indices.push({ index: match.index, length: match[0].length || 1 });
      if (budget) budget.addMatches(1);
      if (match[0].length === 0) pattern.lastIndex++;
    }
    return indices.map(({ index, length }) => ({ index, snippet: excerpt(text, index, length) }));
  }
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const indices = [];
  let from = 0;
  while (indices.length < MAX_MATCHES_PER_FIELD) {
    if (budget && budget.tick()) break;
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    indices.push(idx);
    if (budget) budget.addMatches(1);
    from = idx + needle.length;
  }
  return indices.map((index) => ({ index, snippet: excerpt(text, index, query.length) }));
}

// A short excerpt centered on the match, not the whole field — a result
// list should be scannable, not a second copy of the chapter.
function excerpt(text, index, matchLength) {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + matchLength + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
export const QUERY_FILTER_FIELDS = {
  type: { categories: ['entities'] },
  tag: { categories: ['entities'] },
  canon: { categories: ['entities', 'ruleSystems'] },
  docType: { categories: ['chapters'] },
  role: { categories: ['chapters'] },
  status: { categories: ['chapters', 'scenes'] },
  part: { categories: ['chapters'] },
  folder: { categories: ['chapters'] },
  arc: { categories: ['chapters'] },
  pov: { categories: ['chapters', 'scenes'] },
  updated: { categories: ['chapters', 'entities'] },
  created: { categories: ['entities'] },
};

const ALL_CATEGORIES = ['chapters', 'entities', 'scenes', 'snippets', 'timelineEvents', 'references', 'annotations', 'ruleSystems', 'maps'];

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
const FIELD_ALIASES = Object.fromEntries(Object.keys(QUERY_FILTER_FIELDS).map((k) => [k.toLowerCase(), k]));

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
export function parseQuery(raw) {
  const filters = [];
  let freeText = (raw || '').replace(/(\w+):(?:"([^"]*)"|(\S+))/g, (whole, field, quoted, plain) => {
    const key = FIELD_ALIASES[field.toLowerCase()];
    if (!key) return whole; // unrecognized — leave as literal text
    const value = (quoted !== undefined ? quoted : plain).trim();
    if (!value) return whole; // `field:` with nothing after it — not a real filter, leave literal
    filters.push({ field: key, value: value.toLowerCase() });
    return '';
  });
  freeText = freeText.replace(/\s+/g, ' ').trim();
  return { filters, freeText };
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
function categoriesForFilters(filters) {
  if (filters.length === 0) return new Set(ALL_CATEGORIES);
  return filters.reduce((set, f) => {
    const allowed = new Set(QUERY_FILTER_FIELDS[f.field].categories);
    return new Set([...set].filter((c) => allowed.has(c)));
  }, new Set(ALL_CATEGORIES));
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
function chapterRole(project, chapter) {
  const type = (project.chapterTypes || []).find((t) => t.key === chapter.docType);
  return type ? type.role : 'content';
}
function partTitle(project, partId) {
  if (!partId) return null;
  const part = (project.parts || []).find((p) => p.id === partId);
  return part ? part.title.toLowerCase() : null;
}
function folderName(project, folderId) {
  if (!folderId) return null;
  const folder = (project.folders || []).find((f) => f.id === folderId);
  return folder ? folder.name.toLowerCase() : null;
}

// `none`/`unassigned` as the value for part:/folder: matches an
// un-assigned chapter — the same escape hatch a real filter language
// needs for "show me what's NOT tagged," not just "what is."
const NONE_VALUES = new Set(['none', 'unassigned']);

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
function matchesDateFilter(actualIso, spec) {
  if (!actualIso || !spec) return false;
  const actual = new Date(actualIso);
  if (Number.isNaN(actual.getTime())) return false;
  const actualDay = actual.toISOString().slice(0, 10);

  if (spec.includes('..')) {
    const [from, to] = spec.split('..').map((s) => s.trim());
    if (from && actualDay < from) return false;
    if (to && actualDay > to) return false;
    return true;
  }
  const match = spec.match(/^(>=|<=|>|<)?(.+)$/);
  if (!match) return false;
  const [, op, dateStr] = match;
  switch (op) {
    case '>': return actualDay > dateStr;
    case '<': return actualDay < dateStr;
    case '>=': return actualDay >= dateStr;
    case '<=': return actualDay <= dateStr;
    default: return actualDay === dateStr;
  }
}

function chapterMatchesFilter(project, chapter, filter) {
  const { field, value } = filter;
  switch (field) {
    case 'docType': return (chapter.docType || 'chapter').toLowerCase() === value;
    case 'role': return chapterRole(project, chapter).toLowerCase() === value;
    case 'status': return (chapter.status || '').toLowerCase() === value;
    case 'arc': return (chapter.arc || '').toLowerCase() === value;
    case 'pov': return (chapter.povCharacter || '').toLowerCase() === value;
    case 'part':
      if (NONE_VALUES.has(value)) return !chapter.partId;
      return partTitle(project, chapter.partId) === value;
    case 'folder':
      if (NONE_VALUES.has(value)) return !chapter.folderId;
      return folderName(project, chapter.folderId) === value;
    case 'updated': return matchesDateFilter(chapter.updatedAt, value);
    default: return true; // field not scoped to chapters — categoriesForFilters already excludes this case
  }
}

function sceneMatchesFilter(scene, filter) {
  const { field, value } = filter;
  switch (field) {
    case 'status': return (scene.status || '').toLowerCase() === value;
    case 'pov': return (scene.pov || '').toLowerCase() === value;
    default: return true;
  }
}

function entityMatchesFilter(entity, filter) {
  const { field, value } = filter;
  switch (field) {
    case 'type': return (entity.type || '').toLowerCase() === value;
    case 'tag': return (entity.tags || []).some((t) => t.toLowerCase() === value);
    case 'canon': return (entity.canonStatus || 'canon').toLowerCase() === value;
    case 'updated': return matchesDateFilter(entity.updatedAt, value);
    case 'created': return matchesDateFilter(entity.createdAt, value);
    default: return true;
  }
}

function ruleSystemMatchesFilter(system, filter) {
  if (filter.field === 'canon') return (system.canonStatus || 'canon').toLowerCase() === filter.value;
  return true;
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
export function searchProject(project, query, { caseSensitive = false, useRegex = false, budgetMs = SEARCH_TIME_BUDGET_MS, maxMatches = MAX_TOTAL_MATCHES, onlyCategories = null } = {}) {
  const rawTrimmed = (query || '').trim();
  const empty = { chapters: [], entities: [], scenes: [], snippets: [], timelineEvents: [], references: [], annotations: [], ruleSystems: [], maps: [], regexError: null, filterConflict: false, filters: [], stopped: null };
  if (!rawTrimmed) return empty;

  const { filters, freeText } = parseQuery(rawTrimmed);
  const inScope = categoriesForFilters(filters);
  if (filters.length > 0 && inScope.size === 0) {
    return { ...empty, filterConflict: true, filters, stopped: null };
  }
// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
  const trimmed = freeText;
  const hasFreeText = trimmed.length > 0;

  // CR-43 — the run-wide budget and the category slicer. `onlyCategories`
  // lets a driver (the search worker's yield loop, or the main-thread
  // fallback) run one category per slice and yield to the event loop
  // between slices — that's what makes a cancel message land MID-search
  // instead of after it, and what keeps the fallback path's main thread
  // mostly responsive. Every slice shares this one wall-clock budget.
  const budget = createSearchBudget({ budgetMs, maxMatches });
  const wanted = (cat) => !onlyCategories || onlyCategories.includes(cat);
  const stopped = () => budget.stopped !== null;

  // Regex mode — validate once up front. An invalid pattern shouldn't
  // throw halfway through scanning entities after chapters already
  // scanned fine; the caller gets a clean "here's what's wrong" instead.
  if (useRegex) {
    try {
      new RegExp(trimmed);
    } catch (err) {
      return { ...empty, regexError: err.message, filters, stopped: null };
    }
  }
  const find = (text) => findOccurrences(text, trimmed, caseSensitive, useRegex, budget);
// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
  const passesFilters = (matchFn, ...args) => filters.every((f) => matchFn(...args, f));

  const chapters = inScope.has('chapters') && wanted('chapters') && !stopped()
    ? project.chapters
        .filter((c) => passesFilters(chapterMatchesFilter, project, c))
        .map((c) => ({ id: c.id, title: c.title, matches: find(c.content) }))
        .filter((r) => !hasFreeText || r.matches.length > 0)
        .sort((a, b) => a.title.localeCompare(b.title))
    : [];

  const entities = inScope.has('entities') && wanted('entities') && !stopped()
    ? Object.values(project.entities)
        .filter((e) => passesFilters(entityMatchesFilter, e))
        .map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          nameMatches: find(e.name),
          descMatches: find(e.description),
// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
          tagMatches: (e.tags || []).filter((t) => find(t).length > 0),
        }))
        .filter((r) => !hasFreeText || r.nameMatches.length > 0 || r.descMatches.length > 0 || r.tagMatches.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
  const scenes = [];
  if (inScope.has('scenes') && wanted('scenes') && !stopped()) {
    project.chapters.forEach((c) => {
      (c.scenes || []).forEach((s) => {
        if (!passesFilters(sceneMatchesFilter, s)) return;
        const fieldMatches = {
          goal: find(s.goal),
          conflict: find(s.conflict),
          outcome: find(s.outcome),
          notes: find(s.notes),
          location: find(s.location),
          obstacle: find(s.obstacle),
          infoRevealed: find(s.infoRevealed),
          secretsIntroduced: find(s.secretsIntroduced),
          characterChanges: find(s.characterChanges),
          themeMotif: find(s.themeMotif),
          symbolism: find(s.symbolism),
          narrativePurpose: find(s.narrativePurpose),
        };
        const total = Object.values(fieldMatches).reduce((sum, m) => sum + m.length, 0);
        if (hasFreeText && total === 0) return;
        const firstHit = Object.values(fieldMatches).find((m) => m.length > 0);
        scenes.push({ id: s.id, chapterId: c.id, title: s.title, chapterTitle: c.title, matchCount: total, snippet: firstHit ? firstHit[0].snippet : null });
      });
    });
    scenes.sort((a, b) => a.title.localeCompare(b.title));
  }

  const snippets = inScope.has('snippets') && wanted('snippets') && !stopped()
    ? Object.values(project.snippets)
        .map((s) => ({ id: s.id, createdAt: s.createdAt, matches: find(s.text) }))
        .filter((r) => r.matches.length > 0)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : [];

  const timelineEvents = inScope.has('timelineEvents') && wanted('timelineEvents') && !stopped()
    ? Object.values(project.timelineEvents)
        .map((ev) => ({
          id: ev.id,
          title: ev.title,
          titleMatches: find(ev.title),
          dateMatches: find(ev.storyDate),
          descMatches: find(ev.description),
        }))
        .filter((r) => r.titleMatches.length > 0 || r.dateMatches.length > 0 || r.descMatches.length > 0)
        .sort((a, b) => a.title.localeCompare(b.title))
    : [];

  // Session 24 — research vault. title/content/annotation/source are all
  // free text a writer might be trying to relocate; url gets its own
  // matches too since a half-remembered domain is a plausible search.
  const references = inScope.has('references') && wanted('references') && !stopped()
    ? Object.values(project.references || {})
        .map((r) => ({
          id: r.id,
          title: r.title,
          refType: r.refType,
          titleMatches: find(r.title),
          contentMatches: find(r.content),
          annotationMatches: find(r.annotation),
          urlMatches: find(r.url),
          sourceMatches: find(r.source),
        }))
        .filter((r) => r.titleMatches.length > 0 || r.contentMatches.length > 0 || r.annotationMatches.length > 0 || r.urlMatches.length > 0 || r.sourceMatches.length > 0)
        .sort((a, b) => a.title.localeCompare(b.title))
    : [];

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
  const annotations = inScope.has('annotations') && wanted('annotations') && !stopped()
    ? Object.values(project.annotations || {})
        .filter((a) => find(a.note).length > 0)
        .map((a) => ({ id: a.id, note: a.note, type: a.type, chapterId: a.chapterId, sceneId: a.sceneId }))
        .sort((a, b) => new Date(project.annotations[b.id]?.createdAt || 0) - new Date(project.annotations[a.id]?.createdAt || 0))
    : [];

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
  const ruleSystems = inScope.has('ruleSystems') && wanted('ruleSystems') && !stopped()
    ? Object.values(project.ruleSystems || {})
        .filter((sys) => passesFilters(ruleSystemMatchesFilter, sys))
        .map((sys) => {
          const nodes = Object.values(project.systemNodes || {}).filter((n) => n.systemId === sys.id);
          const nodeMatches = nodes.filter((n) => find(n.name).length > 0 || find(n.effect).length > 0);
          const fieldMatches = {
            name: find(sys.name),
            source: find(sys.source),
            resource: find(sys.resource),
            channel: find(sys.channel),
            restrictions: find(sys.restrictions),
            description: find(sys.description),
          };
          const fieldTotal = Object.values(fieldMatches).reduce((sum, m) => sum + m.length, 0);
          if (hasFreeText && fieldTotal === 0 && nodeMatches.length === 0) return null;
          return { id: sys.id, name: sys.name, matchCount: fieldTotal + nodeMatches.length, nodeMatches: nodeMatches.map((n) => n.name) };
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // Session 24 — maps. Map name + every marker's label/note text on it.
  const maps = inScope.has('maps') && wanted('maps') && !stopped()
    ? Object.values(project.maps || {})
        .map((map) => {
          const nameMatches = find(map.name);
          const markerMatches = (map.markers || []).filter((m) => find(m.label).length > 0 || find(m.note).length > 0);
          if (nameMatches.length === 0 && markerMatches.length === 0) return null;
          return { id: map.id, name: map.name, matchCount: nameMatches.length + markerMatches.length, markerLabels: markerMatches.map((m) => m.label) };
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return { chapters, entities, scenes, snippets, timelineEvents, references, annotations, ruleSystems, maps, regexError: null, filterConflict: false, filters, stopped: budget.stopped };
}

export function countTotalMatches(results) {
  const sum = (rows, ...fields) => rows.reduce((acc, r) => acc + fields.reduce((a, f) => a + (r[f]?.length || 0), 0), 0);
  return (
    sum(results.chapters, 'matches') +
    sum(results.entities, 'nameMatches', 'descMatches', 'tagMatches') +
    (results.scenes || []).reduce((acc, r) => acc + r.matchCount, 0) +
    sum(results.snippets, 'matches') +
    sum(results.timelineEvents, 'titleMatches', 'dateMatches', 'descMatches') +
    sum(results.references || [], 'titleMatches', 'contentMatches', 'annotationMatches', 'urlMatches', 'sourceMatches') +
    (results.annotations || []).length +
    (results.ruleSystems || []).reduce((acc, r) => acc + r.matchCount, 0) +
    (results.maps || []).reduce((acc, r) => acc + r.matchCount, 0)
  );
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
export function countResultRows(results) {
  return (
    results.chapters.length +
    results.entities.length +
    (results.scenes || []).length +
    results.snippets.length +
    results.timelineEvents.length +
    (results.references || []).length +
    (results.annotations || []).length +
    (results.ruleSystems || []).length +
    (results.maps || []).length
  );
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js
// CR-43 — budgeted replace planning. The plan is what the search worker
// evaluates (so the same ReDoS pattern can't freeze the app through the
// Replace door either); `stopped` tells the caller the counts are PARTIAL
// and a replace must not be offered off them. planChapterReplace below
// stays the legacy thin wrapper — same return shape as always — for the
// Node smoketests and any store-layer caller.
export function buildReplacePlan(project, query, replacement, { caseSensitive = false, useRegex = false, budgetMs = SEARCH_TIME_BUDGET_MS, maxMatches = Infinity, countsOnly = false } = {}) {
  const trimmed = (query || '').trim();
  if (!trimmed) return { plan: [], stopped: null };
  let pattern;
  if (useRegex) {
    try {
      pattern = new RegExp(trimmed, caseSensitive ? 'g' : 'gi');
    } catch {
      // Defensive only — the UI validates the pattern via searchProject's
      // regexError first and never offers Replace while that's set. A
      // caller that skips that check gets a no-op plan instead of a throw.
      return { plan: [], stopped: null };
    }
  } else {
    pattern = new RegExp(escapeRegExp(trimmed), caseSensitive ? 'g' : 'gi');
  }
  // maxMatches defaults to Infinity here, deliberately: replace counts
  // must be exact or the confirm dialog would lie ("Replace 3 matches"
  // then silently change 40). The time budget is the guard that matters;
  // a single pathological chapter can still stall one match() call, and
  // that residual risk is what the worker watchdog exists for.
  const budget = createSearchBudget({ budgetMs, maxMatches });
  const plan = [];
  for (const c of project.chapters) {
    if (budget.tick()) break;
    const matches = c.content ? c.content.match(pattern) : null;
    if (!matches) continue;
    // countsOnly (CR-43): the per-keystroke replace preview only needs
    // counts — building newContent for every hit chapter would do the
    // full replacement pass for strings the preview never shows.
    plan.push({ chapterId: c.id, title: c.title, count: matches.length, newContent: countsOnly ? null : c.content.replace(pattern, replacement) });
  }
  return { plan, stopped: budget.stopped };
}

export function planChapterReplace(project, query, replacement, options = {}) {
  return buildReplacePlan(project, query, replacement, options).plan;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
