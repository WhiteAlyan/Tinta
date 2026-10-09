// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-1-6

const SNIPPET_RADIUS = 40; // chars of context on each side of a match
const MAX_MATCHES_PER_FIELD = 20; // a runaway "e" search on a full chapter
// shouldn't return hundreds of hits — cap per field, not per project, so a
// long chapter doesn't crowd out every other result type.

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-13-18
function findOccurrences(text, query, caseSensitive, useRegex = false) {
  if (!text || !query) return [];
  if (useRegex) {
    const pattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
    const indices = [];
    let match;
    // A pattern that can match the empty string (e.g. "a*") would loop
    // forever without this — advance manually past zero-length matches.
    while (indices.length < MAX_MATCHES_PER_FIELD && (match = pattern.exec(text))) {
      indices.push({ index: match.index, length: match[0].length || 1 });
      if (match[0].length === 0) pattern.lastIndex++;
    }
    return indices.map(({ index, length }) => ({ index, snippet: excerpt(text, index, length) }));
  }
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const indices = [];
  let from = 0;
  while (indices.length < MAX_MATCHES_PER_FIELD) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    indices.push(idx);
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

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-56-89
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

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-107-112
const FIELD_ALIASES = Object.fromEntries(Object.keys(QUERY_FILTER_FIELDS).map((k) => [k.toLowerCase(), k]));

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-115-118
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

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-133-136
function categoriesForFilters(filters) {
  if (filters.length === 0) return new Set(ALL_CATEGORIES);
  return filters.reduce((set, f) => {
    const allowed = new Set(QUERY_FILTER_FIELDS[f.field].categories);
    return new Set([...set].filter((c) => allowed.has(c)));
  }, new Set(ALL_CATEGORIES));
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-145-149
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

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-170-176
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

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-246-253
export function searchProject(project, query, { caseSensitive = false, useRegex = false } = {}) {
  const rawTrimmed = (query || '').trim();
  const empty = { chapters: [], entities: [], scenes: [], snippets: [], timelineEvents: [], references: [], annotations: [], ruleSystems: [], maps: [], regexError: null, filterConflict: false, filters: [] };
  if (!rawTrimmed) return empty;

  const { filters, freeText } = parseQuery(rawTrimmed);
  const inScope = categoriesForFilters(filters);
  if (filters.length > 0 && inScope.size === 0) {
    return { ...empty, filterConflict: true, filters };
  }
// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-264-268
  const trimmed = freeText;
  const hasFreeText = trimmed.length > 0;

  // Regex mode — validate once up front. An invalid pattern shouldn't
  // throw halfway through scanning entities after chapters already
  // scanned fine; the caller gets a clean "here's what's wrong" instead.
  if (useRegex) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(trimmed);
    } catch (err) {
      return { ...empty, regexError: err.message, filters };
    }
  }
  const find = (text) => findOccurrences(text, trimmed, caseSensitive, useRegex);
// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-284-287
  const passesFilters = (matchFn, ...args) => filters.every((f) => matchFn(...args, f));

  const chapters = inScope.has('chapters')
    ? project.chapters
        .filter((c) => passesFilters(chapterMatchesFilter, project, c))
        .map((c) => ({ id: c.id, title: c.title, matches: find(c.content) }))
        .filter((r) => !hasFreeText || r.matches.length > 0)
        .sort((a, b) => a.title.localeCompare(b.title))
    : [];

  const entities = inScope.has('entities')
    ? Object.values(project.entities)
        .filter((e) => passesFilters(entityMatchesFilter, e))
        .map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          nameMatches: find(e.name),
          descMatches: find(e.description),
// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-307-310
          tagMatches: (e.tags || []).filter((t) => find(t).length > 0),
        }))
        .filter((r) => !hasFreeText || r.nameMatches.length > 0 || r.descMatches.length > 0 || r.tagMatches.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-317-323
  const scenes = [];
  if (inScope.has('scenes')) {
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

  const snippets = inScope.has('snippets')
    ? Object.values(project.snippets)
        .map((s) => ({ id: s.id, createdAt: s.createdAt, matches: find(s.text) }))
        .filter((r) => r.matches.length > 0)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : [];

  const timelineEvents = inScope.has('timelineEvents')
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
  const references = inScope.has('references')
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

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-391-394
  const annotations = inScope.has('annotations')
    ? Object.values(project.annotations || {})
        .filter((a) => find(a.note).length > 0)
        .map((a) => ({ id: a.id, note: a.note, type: a.type, chapterId: a.chapterId, sceneId: a.sceneId }))
        .sort((a, b) => new Date(project.annotations[b.id]?.createdAt || 0) - new Date(project.annotations[a.id]?.createdAt || 0))
    : [];

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-402-405
  const ruleSystems = inScope.has('ruleSystems')
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
  const maps = inScope.has('maps')
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

  return { chapters, entities, scenes, snippets, timelineEvents, references, annotations, ruleSystems, maps, regexError: null, filterConflict: false, filters };
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

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-459-464
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

// Historical context: see docs/CODEBASE_NOTES.md#jssearch-js-479-506
export function planChapterReplace(project, query, replacement, { caseSensitive = false, useRegex = false } = {}) {
  const trimmed = (query || '').trim();
  if (!trimmed) return [];
  let pattern;
  if (useRegex) {
    try {
      pattern = new RegExp(trimmed, caseSensitive ? 'g' : 'gi');
    } catch {
      // Defensive only — the UI validates the pattern via searchProject's
      // regexError first and never offers Replace while that's set. A
      // caller that skips that check gets a no-op plan instead of a throw.
      return [];
    }
  } else {
    pattern = new RegExp(escapeRegExp(trimmed), caseSensitive ? 'g' : 'gi');
  }
  return project.chapters
    .map((c) => {
      const matches = c.content.match(pattern);
      if (!matches) return null;
      return { chapterId: c.id, title: c.title, count: matches.length, newContent: c.content.replace(pattern, replacement) };
    })
    .filter(Boolean);
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
