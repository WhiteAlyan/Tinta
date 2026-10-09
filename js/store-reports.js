// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-1-24

import { getActiveProject, now } from './store-core.js';
import { wordCount } from './format.js';
import {
  extractMentions,
  getBacklinksFor,
  getEntityChildren,
  getEntityList,
  getEntityStatusEvents,
} from './store-entities.js';
import { getRelationshipsForEntity } from './store-relationships.js';
import { getReferenceList } from './store-world.js';
import {
  getAnnotationList,
  getDecisionList,
  getStoryQuestionList,
  getStyleGuideReport,
} from './store-craft.js';
import { getRuleSystemList, getSystemNodeList } from './store-systems.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-45-51
function computeBlockedIntervals(sortedStatusEvents, timelineEventsById) {
  const intervals = [];
  let openStart = null;
  let openLabel = null;
  sortedStatusEvents.forEach((se) => {
    const event = timelineEventsById[se.timelineEventId];
    if (!event) return;
    if (se.blocksAppearance && openStart === null) {
      openStart = event.order;
      openLabel = se.label;
    } else if (!se.blocksAppearance && openStart !== null) {
      intervals.push({ start: openStart, end: event.order, label: openLabel });
      openStart = null;
      openLabel = null;
    }
  });
  if (openStart !== null) intervals.push({ start: openStart, end: Infinity, label: openLabel });
  return intervals;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-72-92
export function getContinuityReport() {
  const project = getActiveProject();
  const timelineEventsById = project.timelineEvents || {};
  const issues = [];

  getEntityList().forEach((entity) => {
    if (!entity.statusEvents || !entity.statusEvents.length) return;
    const sorted = getEntityStatusEvents(entity.id);
    const intervals = computeBlockedIntervals(sorted, timelineEventsById);
    if (!intervals.length) return;

    const backlinks = getBacklinksFor(entity.id);

    Object.values(timelineEventsById).forEach((event) => {
      if (!event.chapterId) return;
      const blocking = intervals.find((iv) => event.order > iv.start && event.order <= iv.end);
      if (!blocking) return;
      const chapter = project.chapters.find((c) => c.id === event.chapterId);
      if (!chapter) return;

      backlinks
        .filter((bl) => bl.chapterId === event.chapterId)
        .forEach((bl) => {
          issues.push({
            entityId: entity.id,
            entityName: entity.name,
            statusLabel: blocking.label,
            kind: 'mention',
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            sceneId: bl.sceneId || null,
            sceneTitle: bl.sceneTitle || null,
            snippet: bl.snippet,
            eventId: event.id,
            eventTitle: event.title,
          });
        });

      const nameLower = entity.name.trim().toLowerCase();
      chapter.scenes.forEach((scene) => {
        if (nameLower && (scene.pov || '').toLowerCase().includes(nameLower)) {
          issues.push({
            entityId: entity.id,
            entityName: entity.name,
            statusLabel: blocking.label,
            kind: 'pov',
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            sceneId: scene.id,
            sceneTitle: scene.title,
            snippet: scene.pov,
            eventId: event.id,
            eventTitle: event.title,
          });
        }
      });
    });
  });

  return issues;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-155-158

export function getProjectHealthReport() {
  const project = getActiveProject();
  const entities = getEntityList();
  const allMentionNames = new Set();
  const scanned = [];

  project.chapters.forEach((chapter) => {
    scanned.push(chapter.content);
    chapter.scenes.forEach((scene) => {
      scanned.push(scene.goal, scene.conflict, scene.outcome, scene.notes);
    });
  });
  Object.values(project.timelineEvents || {}).forEach((e) => scanned.push(e.description));

  scanned.forEach((text) => {
    extractMentions(text || '').forEach((m) => allMentionNames.add(m.name.trim().toLowerCase()));
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-178-182
  const orphanedEntities = entities.filter((e) => {
    const mentioned = allMentionNames.has(e.name.trim().toLowerCase()) ||
      (e.aliases || []).some((a) => allMentionNames.has(a.trim().toLowerCase()));
    const hasRelationships = getRelationshipsForEntity(e.id).length > 0;
    const hasChildren = getEntityChildren(e.id).length > 0;
    return !mentioned && !hasRelationships && !hasChildren;
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-191-194
  const knownNames = new Set();
  entities.forEach((e) => {
    knownNames.add(e.name.trim().toLowerCase());
    (e.aliases || []).forEach((a) => knownNames.add(a.trim().toLowerCase()));
  });
  const danglingMentions = [];
  const seenDangling = new Set();
  function scanDangling(text, source) {
    extractMentions(text || '').forEach((m) => {
      const key = m.name.trim().toLowerCase();
      if (!key || knownNames.has(key)) return;
      const dedupeKey = `${key}::${source.chapterId || ''}::${source.eventId || ''}::${source.field}`;
      if (seenDangling.has(dedupeKey)) return;
      seenDangling.add(dedupeKey);
      danglingMentions.push({ name: m.name.trim(), ...source });
    });
  }
  project.chapters.forEach((chapter) => {
    scanDangling(chapter.content, { chapterId: chapter.id, chapterTitle: chapter.title, field: 'content' });
    chapter.scenes.forEach((scene) => {
      ['goal', 'conflict', 'outcome', 'notes'].forEach((field) => {
        scanDangling(scene[field], { chapterId: chapter.id, chapterTitle: chapter.title, sceneId: scene.id, sceneTitle: scene.title, field });
      });
    });
  });
  Object.values(project.timelineEvents || {}).forEach((event) => {
    scanDangling(event.description, { eventId: event.id, eventTitle: event.title, field: 'description' });
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-224-228
  const scenesWithoutChapter = [];

  // Timeline events pointing at a chapterId that no longer exists (the
  // chapter was deleted after the event referenced it).
  const chapterIds = new Set(project.chapters.map((c) => c.id));
  const orphanedTimelineEvents = Object.values(project.timelineEvents || {}).filter(
    (e) => e.chapterId && !chapterIds.has(e.chapterId)
  );

  // Unresolved story questions — not a "problem" exactly, but part of
  // the same at-a-glance health picture.
  const unresolvedQuestions = getStoryQuestionList().filter((q) => !q.resolved);

  // Tier 3 pass — continuity issues, folded into the same at-a-glance
  // total as everything else here.
  const continuityIssues = getContinuityReport();

  // Tier 3 pass — style guide drift across the whole manuscript, same
  // "one dashboard, several checks feed it" shape as continuity above.
  const styleGuideIssues = getStyleGuideReport();

  // Session 24 — three more checks, same "the report just grows another
  // field" shape as everything above.

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-253-256
  const unusedRuleSystems = getRuleSystemList().filter((sys) => getSystemNodeList(sys.id).length === 0);

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-259-264
  const referencesByKey = new Map();
  getReferenceList().forEach((ref) => {
    const titleKey = ref.title.trim().toLowerCase();
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-268-274
    if (!titleKey || titleKey === 'untitled reference') return;
    const key = `${ref.refType}::${titleKey}`;
    if (!referencesByKey.has(key)) referencesByKey.set(key, []);
    referencesByKey.get(key).push(ref);
  });
  const duplicateReferences = [...referencesByKey.values()].filter((group) => group.length > 1).flat();

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-282-289
  const mapIds = new Set(Object.keys(project.maps || {}));
  const entityIds = new Set(entities.map((e) => e.id));
  const deadLinks = [];
  Object.values(project.maps || {}).forEach((map) => {
    (map.markers || []).forEach((marker) => {
      if (marker.linkedMapId && !mapIds.has(marker.linkedMapId)) {
        deadLinks.push({ kind: 'map-marker-map', mapId: map.id, mapName: map.name, markerId: marker.id, label: marker.label });
      }
      if (marker.entityId && !entityIds.has(marker.entityId)) {
        deadLinks.push({ kind: 'map-marker-entity', mapId: map.id, mapName: map.name, markerId: marker.id, label: marker.label });
      }
    });
  });
  Object.values(project.references || {}).forEach((ref) => {
    if (ref.entityId && !entityIds.has(ref.entityId)) deadLinks.push({ kind: 'reference-entity', refId: ref.id, label: ref.title });
    if (ref.chapterId && !chapterIds.has(ref.chapterId)) deadLinks.push({ kind: 'reference-chapter', refId: ref.id, label: ref.title });
  });

  return {
    orphanedEntities,
    danglingMentions,
    scenesWithoutChapter,
    orphanedTimelineEvents,
    unresolvedQuestions,
    continuityIssues,
    styleGuideIssues,
    unusedRuleSystems,
    duplicateReferences,
    deadLinks,
    totalIssues:
      orphanedEntities.length +
      danglingMentions.length +
      orphanedTimelineEvents.length +
      continuityIssues.length +
      styleGuideIssues.length +
      unusedRuleSystems.length +
      duplicateReferences.length +
      deadLinks.length,
  };
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-331-374
// P2-4 fix — there are three "active chapter" resolvers in the codebase
// with overlapping but distinct semantics. This one is for the Resume
// view (the writer's "where was I?" dashboard): recent → lastOpenedAt →
// updatedAt, with cursor/scroll restoration data attached.
//
//   - getLastActiveChapter (HERE) — used by Resume view. Three-tier
//     fallback: recentChapterIds[0] → most-recently-opened → most-
//     recently-updated. Returns full restoration object (cursor pos,
//     scroll top). Call when the writer wants to pick up where they
//     left off.
//   - firstOpenChapterId (projectSwitch.js:13) — used when switching
//     projects. First-by-order non-trashed, no lastOpenedAt
//     consideration. Call when the writer just opened a different
//     novel and we want a sensible default chapter to land on, not
//     a "resume" experience.
//   - recordChapterOpened (store-manuscript.js:351) — write-only, no
//     resolution. Maintains the recentChapterIds[0] slot that
//     getLastActiveChapter reads as its first tier.
//
// They don't conflict today, but the naming overlap is a footgun for
// future contributors reading app.js:139-145 wondering which to call.
// If you find yourself adding a fourth, consider unifying instead.
export function getLastActiveChapter(project) {
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-376-391
  const recentId = (project.recentChapterIds || [])[0];
  if (recentId) {
    const c = project.chapters.find((ch) => ch.id === recentId && ch.lastOpenedAt && !ch.trashedAt);
    if (c) return { chapterId: c.id, chapterTitle: c.title, lastOpenedAt: c.lastOpenedAt, lastCursorPos: c.lastCursorPos || 0, lastScrollTop: c.lastScrollTop || 0 };
  }
  const opened = project.chapters.filter((c) => c.lastOpenedAt && !c.trashedAt);
  if (opened.length) {
    const sorted = [...opened].sort((a, b) => new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt));
    const c = sorted[0];
    return { chapterId: c.id, chapterTitle: c.title, lastOpenedAt: c.lastOpenedAt, lastCursorPos: c.lastCursorPos || 0, lastScrollTop: c.lastScrollTop || 0 };
  }
  const byUpdated = project.chapters.filter((c) => !c.trashedAt).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  if (!byUpdated.length) return null;
  const c = byUpdated[0];
  return { chapterId: c.id, chapterTitle: c.title, lastOpenedAt: '', lastCursorPos: c.lastCursorPos || 0, lastScrollTop: c.lastScrollTop || 0 };
}

export function getResumeSummary() {
  const project = getActiveProject();
  const lastOpenedAt = project.lastOpenedAt || '';

  // Last chapter — see getLastActiveChapter above (shared with app.js's
  // boot sequence, which is the only reason this is its own function
  // rather than staying inlined here).
  const lastChapter = getLastActiveChapter(project);

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-418-422
  const allAnnotations = getAnnotationList();
  const openAnnotations = allAnnotations
    .filter((a) => !a.resolved)
    .map((a) => {
      const chapter = project.chapters.find((c) => c.id === a.chapterId);
      const scene = a.sceneId ? chapter?.scenes.find((s) => s.id === a.sceneId) : null;
      return {
        id: a.id,
        type: a.type,
        note: a.note,
        chapterId: a.chapterId,
        chapterTitle: chapter?.title || '(deleted chapter)',
        sceneId: a.sceneId || null,
        sceneTitle: scene?.title || null,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      };
    });

  // Open story questions — every unresolved story question. Sorted
  // by updatedAt desc.
  const openStoryQuestions = getStoryQuestionList()
    .filter((q) => !q.resolved)
    .map((q) => ({
      id: q.id,
      question: q.question,
      introducedSceneId: q.introducedSceneId || null,
      payoffSceneId: q.payoffSceneId || null,
      notes: q.notes,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    }));

  // Recent decisions — last 7 days from lastOpenedAt (or now for the
  // fresh-install case). Capped at 10 so the dashboard doesn't drown.
  const decisionsCutoff = new Date(lastOpenedAt || now());
  decisionsCutoff.setDate(decisionsCutoff.getDate() - 7);
  const recentDecisions = getDecisionList()
    .filter((d) => new Date(d.createdAt) >= decisionsCutoff)
    .slice(0, 10)
    .map((d) => ({
      id: d.id,
      decision: d.decision,
      reason: d.reason || '',
      alternatives: d.alternatives || '',
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-472-477
  const healthReport = getProjectHealthReport();
  const healthWarnings = {
    orphanEntities: healthReport.orphanedEntities.map((e) => ({ id: e.id, name: e.name, kind: 'entity' })),
    danglingMentions: healthReport.danglingMentions.map((m) => ({ name: m.name, kind: 'mention' })),
    unresolvedQuestions: healthReport.unresolvedQuestions.map((q) => ({ id: q.id, question: q.question, kind: 'story-question' })),
    duplicateReferences: healthReport.duplicateReferences.map((r) => ({ id: r.id, title: r.title, kind: 'reference' })),
    deadLinks: healthReport.deadLinks.map((l) => ({ kind: l.kind, label: l.label, mapName: l.mapName })),
    continuityIssues: healthReport.continuityIssues.map((c) => ({ id: c.id, kind: 'continuity', message: c.message })),
    styleGuideIssues: healthReport.styleGuideIssues.map((s) => ({ kind: 'style', wrong: s.wrong, correct: s.correct, snippet: s.snippet })),
    total: healthReport.totalIssues,
  };

  return {
    lastChapter,
    openAnnotations,
    openStoryQuestions,
    recentDecisions,
    healthWarnings,
    lastOpenedAt,
  };
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-500-510
export function getCompletionChecklist() {
  const project = getActiveProject();
  const health = getProjectHealthReport();

  const chaptersNotFinal = project.chapters.filter((c) => c.status !== 'final');
  const chaptersUnderTarget = project.chapters.filter((c) => c.targetWordCount > 0 && wordCount(c.content) < c.targetWordCount);
  const emptyChapters = project.chapters.filter((c) => wordCount(c.content) === 0);

  const items = [
    {
      key: 'orphanedEntities',
      label: 'No orphaned entities',
      blocking: true,
      pass: health.orphanedEntities.length === 0,
      detail: `${health.orphanedEntities.length} entit${health.orphanedEntities.length === 1 ? 'y' : 'ies'} never mentioned or related to anything.`,
    },
    {
      key: 'danglingMentions',
      label: 'No dangling [[mentions]]',
      blocking: true,
      pass: health.danglingMentions.length === 0,
      detail: `${health.danglingMentions.length} mention${health.danglingMentions.length === 1 ? '' : 's'} pointing at an entity that no longer exists.`,
    },
    {
      key: 'continuity',
      label: 'No continuity issues',
      blocking: true,
      pass: health.continuityIssues.length === 0,
      detail: `${health.continuityIssues.length} place${health.continuityIssues.length === 1 ? '' : 's'} where an entity appears after a status change marked as ending its appearances.`,
    },
    {
      key: 'styleGuide',
      label: 'No style guide violations',
      blocking: true,
      pass: health.styleGuideIssues.length === 0,
      detail: `${health.styleGuideIssues.length} chapter${health.styleGuideIssues.length === 1 ? '' : 's'} with wording that contradicts the project's style guide.`,
    },
    {
      key: 'storyQuestions',
      label: 'No unresolved story questions',
      blocking: false,
      pass: health.unresolvedQuestions.length === 0,
      detail: `${health.unresolvedQuestions.length} open question${health.unresolvedQuestions.length === 1 ? '' : 's'}/foreshadowing thread${health.unresolvedQuestions.length === 1 ? '' : 's'} still unresolved; not necessarily a problem if some are meant to stay open past this draft.`,
    },
    {
      key: 'chaptersFinal',
      label: 'Every chapter marked Final',
      blocking: true,
      pass: chaptersNotFinal.length === 0,
      detail: `${chaptersNotFinal.length} chapter${chaptersNotFinal.length === 1 ? '' : 's'} still marked Draft or Revised.`,
      chapters: chaptersNotFinal,
    },
    {
      key: 'emptyChapters',
      label: 'No empty chapters',
      blocking: true,
      pass: emptyChapters.length === 0,
      detail: `${emptyChapters.length} chapter${emptyChapters.length === 1 ? '' : 's'} with no content yet.`,
      chapters: emptyChapters,
    },
    {
      key: 'chapterTargets',
      label: 'Chapters meet their word-count targets',
      blocking: false,
      pass: chaptersUnderTarget.length === 0,
      detail: `${chaptersUnderTarget.length} chapter${chaptersUnderTarget.length === 1 ? '' : 's'} under its own target word count.`,
      chapters: chaptersUnderTarget,
    },
    {
      key: 'blurb',
      label: 'Project has a blurb/synopsis',
      blocking: false,
      pass: !!(project.blurb || '').trim(),
      detail: 'No blurb set yet. Library → Details.',
    },
    {
      key: 'cover',
      label: 'Project has cover art',
      blocking: false,
      pass: !!project.coverImageId,
      detail: 'No cover set yet. Library → ⋯ → Set cover.',
    },
  ];

  const blockingItems = items.filter((i) => i.blocking);
  return {
    items,
    blockingCount: blockingItems.filter((i) => !i.pass).length,
    infoCount: items.filter((i) => !i.blocking && !i.pass).length,
    readyToPublish: blockingItems.every((i) => i.pass),
  };
}

// ── craft analytics (Craft-tools pass) ──────────────────────────────────────
// Read-only reports computed from fields already stored (scene.pov,
// chapter word counts, etc.) — no new schema, this is entirely derived.

export function getPovDistribution() {
  const project = getActiveProject();
  const counts = {};
  project.chapters.filter((c) => !c.trashedAt).forEach((chapter) => {
    chapter.scenes.forEach((scene) => {
      const pov = (scene.pov || '').trim() || '(unset)';
      counts[pov] = (counts[pov] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .map(([pov, count]) => ({ pov, count }))
    .sort((a, b) => b.count - a.count);
}

export function getChapterWordCounts() {
  const project = getActiveProject();
  return project.chapters
    .filter((c) => !c.trashedAt)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ chapterId: c.id, title: c.title, words: wordCount(c.content) }));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-631-634
export function getDialogueRatio(chapterId = null) {
  const project = getActiveProject();
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-637-640
  const chapters = chapterId ? project.chapters.filter((c) => c.id === chapterId) : project.chapters.filter((c) => !c.trashedAt);
  let dialogueWords = 0;
  let totalWords = 0;
  const QUOTE_RE = /["“][^"”]*["”]/g;
  chapters.forEach((c) => {
    const text = c.content || '';
    totalWords += wordCount(text);
    const matches = text.match(QUOTE_RE) || [];
    matches.forEach((m) => { dialogueWords += wordCount(m); });
  });
  return {
    dialogueWords,
    narrationWords: Math.max(0, totalWords - dialogueWords),
    totalWords,
    dialoguePct: totalWords ? Math.round((dialogueWords / totalWords) * 100) : 0,
  };
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-reports-js-659-664
export function getChangesSince(sinceIso) {
  const project = getActiveProject();
  const since = new Date(sinceIso).getTime();
  const isAfter = (iso) => iso && new Date(iso).getTime() > since;

  const chaptersChanged = project.chapters.filter((c) => isAfter(c.updatedAt));
  let wordsNow = 0;
  chaptersChanged.forEach((c) => { wordsNow += wordCount(c.content); });

  const entitiesAdded = Object.values(project.entities || {}).filter((e) => isAfter(e.createdAt));
  const entitiesChanged = Object.values(project.entities || {}).filter(
    (e) => isAfter(e.updatedAt) && !isAfter(e.createdAt)
  );
  const relationshipsAdded = Object.values(project.relationships || {}).filter((r) => isAfter(r.createdAt));
  const timelineEventsAdded = Object.values(project.timelineEvents || {}).filter((e) => isAfter(e.createdAt));
  const scenesTouched = [];
  project.chapters.forEach((chapter) => {
    chapter.scenes.forEach((scene) => {
      if (isAfter(scene.updatedAt)) scenesTouched.push({ ...scene, chapterTitle: chapter.title });
    });
  });

  return {
    since: sinceIso,
    chaptersChanged: chaptersChanged.map((c) => ({ id: c.id, title: c.title, words: wordCount(c.content) })),
    entitiesAdded,
    entitiesChanged,
    relationshipsAdded: relationshipsAdded.length,
    timelineEventsAdded,
    scenesTouched,
  };
}
