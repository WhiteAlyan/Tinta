// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js

import {
  escapeRegExp,
  getActiveProject,
  getChapter,
  now,
  save,
  uid,
} from './store-core.js';
import { containsCjk } from './format.js';

// Roadmap #9 — every save re-serializes the whole db, so an unbounded
// array is unbounded quota growth, and the decision log was exactly that:
// entries went in, nothing ever aged out. Decisions are user-authored
// records, so the cap is deliberately generous (250 — years of deliberate
// logging) and only ever evicts the OLDEST entry once it's actually
// exceeded; getDecisionList() orders newest-first, so eviction affects the
// tail a writer hasn't touched in years, not the working set.
export const MAX_DECISION_LOG = 250;

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js

export function getSketchList() {
  const project = getActiveProject();
  return Object.values(project.sketches).sort((a, b) => a.title.localeCompare(b.title));
}

export function getSketch(sketchId) {
  const project = getActiveProject();
  return project.sketches[sketchId] || null;
}

export function createSketch({ title = 'Untitled Sketch', mode = 'freeform' } = {}) {
  const project = getActiveProject();
  const sketch = {
    id: uid('sketch'),
    title,
    mode, // 'freeform' | 'map' — map mode shows a grid overlay, same data underneath
    gridStyle: 'square', // 'square' | 'hex' — only relevant when mode === 'map'
    strokes: [],
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js
    linkedEntityIds: [],
    createdAt: now(),
    updatedAt: now(),
  };
  project.sketches[sketch.id] = sketch;
  project.updatedAt = now();
  save();
  return sketch;
}

export function updateSketchMeta(sketchId, patch) {
  const sketch = getSketch(sketchId);
  if (!sketch) return;
  Object.assign(sketch, patch, { updatedAt: now() });
  save();
}

export function deleteSketch(sketchId) {
  const project = getActiveProject();
  delete project.sketches[sketchId];
  save();
}

// A stroke is { id, color, width, points: [{x,y}, ...] }. Points are in a
// fixed 0-1000 logical coordinate space so strokes render correctly
// regardless of the actual canvas element's pixel size.
export function addStroke(sketchId, stroke) {
  const sketch = getSketch(sketchId);
  if (!sketch) return null;
  const newStroke = {
    id: uid('stroke'),
    color: stroke.color || '#191825',
    width: stroke.width || 3,
    points: stroke.points || [],
  };
  sketch.strokes.push(newStroke);
  sketch.updatedAt = now();
  save();
  return newStroke;
}

export function undoLastStroke(sketchId) {
  const sketch = getSketch(sketchId);
  if (!sketch || sketch.strokes.length === 0) return;
  sketch.strokes.pop();
  sketch.updatedAt = now();
  save();
}

export function clearSketch(sketchId) {
  const sketch = getSketch(sketchId);
  if (!sketch) return;
  sketch.strokes = [];
  sketch.updatedAt = now();
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js
export const SNIPPET_CATEGORIES = [
  { key: 'idea', label: 'Idea' },
  { key: 'dialogue', label: 'Dialogue' },
  { key: 'research', label: 'Research' },
  { key: 'todo', label: 'To-do' },
];

export function getSnippetList() {
  const project = getActiveProject();
  // v0.2.9 — sort by updatedAt desc so the snippet the writer just
  // edited is at the top, not the one created 3 months ago.
  return Object.values(project.snippets).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

export function createSnippet(text, category = '') {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const project = getActiveProject();
  const snippet = {
    id: uid('snip'),
    text: trimmed,
    category: SNIPPET_CATEGORIES.some((c) => c.key === category) ? category : '',
    createdAt: now(),
  };
  project.snippets[snippet.id] = snippet;
  save();
  return snippet;
}

// Recategorizing after the fact — capture is fast/low-friction on
// purpose (see the view's own comment), so getting the category "right"
// shouldn't have to happen at write time.
export function updateSnippetCategory(snippetId, category) {
  const project = getActiveProject();
  const snippet = project.snippets[snippetId];
  if (!snippet) return;
  snippet.category = SNIPPET_CATEGORIES.some((c) => c.key === category) ? category : '';
  save();
}

export function deleteSnippet(snippetId) {
  const project = getActiveProject();
  delete project.snippets[snippetId];
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js

export function getStyleGuideRules() {
  const project = getActiveProject();
  return [...(project.styleGuide || [])].sort((a, b) => a.incorrect.localeCompare(b.incorrect));
}

export function addStyleGuideRule({ incorrect, preferred, note = '' } = {}) {
  const incorrectTrim = (incorrect || '').trim();
  const preferredTrim = (preferred || '').trim();
  if (!incorrectTrim || !preferredTrim) return null;
  const project = getActiveProject();
  const rule = { id: uid('sg'), incorrect: incorrectTrim, preferred: preferredTrim, note: note.trim() };
  project.styleGuide = [...(project.styleGuide || []), rule];
  save();
  return rule;
}

export function updateStyleGuideRule(ruleId, patch) {
  const project = getActiveProject();
  const rule = (project.styleGuide || []).find((r) => r.id === ruleId);
  if (!rule) return;
  Object.assign(rule, patch);
  save();
}

export function deleteStyleGuideRule(ruleId) {
  const project = getActiveProject();
  project.styleGuide = (project.styleGuide || []).filter((r) => r.id !== ruleId);
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js

export function scanTextForStyleViolations(text = '', rules = []) {
  if (!text || !rules.length) return [];
  const sorted = [...rules].sort((a, b) => b.incorrect.length - a.incorrect.length);
  const found = [];
  sorted.forEach((rule) => {
    // CR-18 — \b is a LATIN word boundary: it can never match between two
    // CJK characters, so a style-guide rule never fired on Chinese or
    // Japanese prose (there is no whitespace for \b to anchor to). Rules
    // whose "incorrect" text contains CJK characters get explicit
    // lookarounds instead. The boundary deliberately guards ONLY against
    // ASCII word characters (\w): CJK characters must NOT block each
    // other — prose like 但是误差仍在 has no separators, and requiring a
    // non-CJK neighbor would make almost every real match impossible. The
    // guard still stops a CJK rule from firing inside a Latin word
    // ("误差less"). Lookbehind needs a modern engine; a context that can't
    // compile it falls back to the legacy \b pattern rather than breaking
    // the scan.
    let re;
    if (containsCjk(rule.incorrect)) {
      try {
        re = new RegExp(`(?<!\\w)${escapeRegExp(rule.incorrect)}(?!\\w)`, 'gi');
      } catch {
        re = new RegExp(`\\b${escapeRegExp(rule.incorrect)}\\b`, 'gi');
      }
    } else {
      re = new RegExp(`\\b${escapeRegExp(rule.incorrect)}\\b`, 'gi');
    }
    let m;
    while ((m = re.exec(text))) {
      found.push({
        id: `sg-${rule.id}-${m.index}`,
        category: 'Style guide',
        shortMessage: `Project style guide prefers “${rule.preferred}” over “${rule.incorrect}”${rule.note ? ` · ${rule.note}` : ''}.`,
        offset: m.index,
        length: m[0].length,
        replacements: [rule.preferred],
      });
    }
  });
  return found.sort((a, b) => a.offset - b.offset);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js
export function getStyleGuideReport() {
  const project = getActiveProject();
  const rules = project.styleGuide || [];
  if (!rules.length) return [];
  const issues = [];
  (project.chapters || []).forEach((chapter) => {
    const violations = scanTextForStyleViolations(chapter.content, rules);
    if (!violations.length) return;
    const counts = {};
    violations.forEach((v) => {
      counts[v.replacements[0]] = counts[v.replacements[0]] || { preferred: v.replacements[0], message: v.shortMessage, count: 0 };
      counts[v.replacements[0]].count += 1;
    });
    Object.values(counts).forEach((c) => {
      issues.push({ chapterId: chapter.id, chapterTitle: chapter.title, preferred: c.preferred, message: c.message, count: c.count });
    });
  });
  return issues;
}

// ── sketch ↔ entity linking (Craft-tools pass) ─────────────────────────────

export function linkSketchToEntity(sketchId, entityId) {
  const sketch = getSketch(sketchId);
  if (!sketch) return;
  if (!sketch.linkedEntityIds.includes(entityId)) {
    sketch.linkedEntityIds.push(entityId);
    sketch.updatedAt = now();
    save();
  }
}

export function unlinkSketchFromEntity(sketchId, entityId) {
  const sketch = getSketch(sketchId);
  if (!sketch) return;
  sketch.linkedEntityIds = sketch.linkedEntityIds.filter((id) => id !== entityId);
  sketch.updatedAt = now();
  save();
}

// Sketches attached to a given entity — the entity-detail-panel-facing
// counterpart to sketch.linkedEntityIds, same "computed from the owning
// side" shape as getBacklinksFor.
export function getSketchesForEntity(entityId) {
  return getSketchList().filter((s) => (s.linkedEntityIds || []).includes(entityId));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js

export const SCENE_RELATIONSHIP_TYPES = [
  { key: 'follows', label: 'Follows' },
  { key: 'precedes', label: 'Precedes' },
  { key: 'parallel', label: 'Parallel to' },
  { key: 'flashback-of', label: 'Flashback of' },
  { key: 'foreshadows', label: 'Foreshadows' },
  { key: 'pays-off', label: 'Pays off' },
  { key: 'references', label: 'References' },
  { key: 'consequence-of', label: 'Consequence of' },
];

export function getSceneRelationshipTypeLabel(key) {
  return SCENE_RELATIONSHIP_TYPES.find((t) => t.key === key)?.label || key;
}

export function getSceneRelationshipList() {
  const project = getActiveProject();
  return Object.values(project.sceneRelationships || {});
}

export function getSceneRelationshipsForScene(sceneId) {
  return getSceneRelationshipList().filter((r) => r.fromSceneId === sceneId || r.toSceneId === sceneId);
}

export function createSceneRelationship({ fromSceneId, toSceneId, type = 'follows', notes = '' }) {
  const project = getActiveProject();
  const rel = {
    id: uid('screl'),
    fromSceneId,
    toSceneId,
    type,
    notes,
    createdAt: now(),
    updatedAt: now(),
  };
  project.sceneRelationships[rel.id] = rel;
  save();
  return rel;
}

export function updateSceneRelationship(relId, patch) {
  const project = getActiveProject();
  const rel = project.sceneRelationships[relId];
  if (!rel) return;
  Object.assign(rel, patch, { updatedAt: now() });
  save();
}

export function deleteSceneRelationship(relId) {
  const project = getActiveProject();
  delete project.sceneRelationships[relId];
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js

export function getStoryQuestionList() {
  const project = getActiveProject();
  return Object.values(project.storyQuestions || {}).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getStoryQuestion(id) {
  const project = getActiveProject();
  return project.storyQuestions[id] || null;
}

export function createStoryQuestion({ question, introducedSceneId = null, payoffSceneId = null, notes = '' } = {}) {
  const trimmed = (question || '').trim();
  if (!trimmed) return null;
  const project = getActiveProject();
  const q = {
    id: uid('sq'),
    question: trimmed,
    introducedSceneId,
    payoffSceneId,
    resolved: false,
    notes,
    createdAt: now(),
    updatedAt: now(),
  };
  project.storyQuestions[q.id] = q;
  save();
  return q;
}

export function updateStoryQuestion(id, patch) {
  const project = getActiveProject();
  const q = project.storyQuestions[id];
  if (!q) return;
  Object.assign(q, patch, { updatedAt: now() });
  save();
}

export function deleteStoryQuestion(id) {
  const project = getActiveProject();
  delete project.storyQuestions[id];
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js
export function getStoryQuestionsForScene(sceneId) {
  const all = getStoryQuestionList();
  return {
    introduced: all.filter((q) => q.introducedSceneId === sceneId),
    payoffs: all.filter((q) => q.payoffSceneId === sceneId),
  };
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js
export function setStoryQuestionScene(id, role, sceneId) {
  if (role !== 'introducedSceneId' && role !== 'payoffSceneId') return;
  updateStoryQuestion(id, { [role]: sceneId });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js
export const ANNOTATION_TYPES = [
  { key: 'todo', label: 'To-do' },
  { key: 'check', label: 'Check' },
  { key: 'research', label: 'Research' },
  { key: 'rewrite', label: 'Rewrite' },
  { key: 'canon', label: 'Canon' },
  { key: 'foreshadow', label: 'Foreshadow' },
  { key: 'payoff', label: 'Payoff' },
  { key: 'continuity', label: 'Continuity' },
];

export function getAnnotationTypeLabel(key) {
  return ANNOTATION_TYPES.find((t) => t.key === key)?.label || key;
}

export function getAnnotationList() {
  const project = getActiveProject();
  return Object.values(project.annotations || {}).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Chapter-level list — every annotation on this chapter, scene-scoped ones
// included, so a chapter's toolbar badge count matches "everything tagged
// somewhere in this chapter" rather than only the chapter-wide ones.
export function getAnnotationsForChapter(chapterId) {
  return getAnnotationList().filter((a) => a.chapterId === chapterId);
}

export function getAnnotationsForScene(sceneId) {
  return getAnnotationList().filter((a) => a.sceneId === sceneId);
}

export function createAnnotation({ chapterId, sceneId = null, type = 'todo', note = '' } = {}) {
  if (!chapterId) return null;
  const project = getActiveProject();
  const a = {
    id: uid('note'),
    chapterId,
    sceneId,
    type: ANNOTATION_TYPES.some((t) => t.key === type) ? type : 'todo',
    note: (note || '').trim(),
    resolved: false,
    createdAt: now(),
    updatedAt: now(),
  };
  project.annotations[a.id] = a;
  save();
  return a;
}

export function getAnnotation(id) {
  const project = getActiveProject();
  return project.annotations[id] || null;
}

export function updateAnnotation(id, patch) {
  const project = getActiveProject();
  const a = project.annotations[id];
  if (!a) return;
  Object.assign(a, patch, { updatedAt: now() });
  save();
}

export function deleteAnnotation(id) {
  const project = getActiveProject();
  delete project.annotations[id];
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js
export function getBookmarkList() {
  const project = getActiveProject();
  return Object.values(project.bookmarks || {}).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getBookmarkForChapter(chapterId, sceneId = null) {
  const project = getActiveProject();
  return Object.values(project.bookmarks || {}).find((b) => b.chapterId === chapterId && (b.sceneId || null) === (sceneId || null)) || null;
}

export function createBookmark({ chapterId, sceneId = null, label = '' } = {}) {
  if (!chapterId) return null;
  const project = getActiveProject();
  const chapter = getChapter(chapterId);
  const b = {
    id: uid('bm'),
    chapterId,
    sceneId,
    label: (label || '').trim() || chapter?.title || 'Bookmark',
    createdAt: now(),
  };
  project.bookmarks[b.id] = b;
  save();
  return b;
}

export function renameBookmark(id, label) {
  const project = getActiveProject();
  const b = project.bookmarks[id];
  if (!b) return;
  b.label = (label || '').trim() || b.label;
  save();
}

export function deleteBookmark(id) {
  const project = getActiveProject();
  delete project.bookmarks[id];
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js
export function getQuoteList() {
  const project = getActiveProject();
  return Object.values(project.quotes || {}).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function createQuote({ text, chapterId, sceneId = null } = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed || !chapterId) return null;
  const project = getActiveProject();
  const quote = {
    id: uid('quote'),
    text: trimmed,
    chapterId,
    sceneId,
    createdAt: now(),
  };
  project.quotes[quote.id] = quote;
  save();
  return quote;
}

export function deleteQuote(id) {
  const project = getActiveProject();
  delete project.quotes[id];
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-craft-js
export function getDecisionList() {
  const project = getActiveProject();
  return [...(project.decisionLog || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getDecision(id) {
  const project = getActiveProject();
  return (project.decisionLog || []).find((d) => d.id === id) || null;
}

export function createDecision({ decision = '', reason = '', alternatives = '' } = {}) {
  const trimmedDecision = (decision || '').trim();
  if (!trimmedDecision) return null;
  const project = getActiveProject();
  if (!Array.isArray(project.decisionLog)) project.decisionLog = [];
  const entry = {
    id: uid('dec'),
    decision: trimmedDecision,
    reason: (reason || '').trim(),
    alternatives: (alternatives || '').trim(),
    createdAt: now(),
    updatedAt: now(),
  };
  project.decisionLog.push(entry);
  // Roadmap #9 — enforce the cap at the write path (not read time): the
  // point is bounding what gets serialized on every save, forever.
  if (project.decisionLog.length > MAX_DECISION_LOG) {
    project.decisionLog = project.decisionLog.slice(-MAX_DECISION_LOG);
  }
  save();
  return entry;
}

export function updateDecision(id, patch) {
  const project = getActiveProject();
  const entry = (project.decisionLog || []).find((d) => d.id === id);
  if (!entry) return;
  Object.assign(entry, patch, { updatedAt: now() });
  save();
}

export function deleteDecision(id) {
  const project = getActiveProject();
  project.decisionLog = (project.decisionLog || []).filter((d) => d.id !== id);
  save();
}
