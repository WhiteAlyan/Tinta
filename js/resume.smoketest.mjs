// Tinta — Resume dashboard smoketest (getResumeSummary).
//
// Pure-logic test of the store-side helper that backs the Resume tab.
// Verifies the summary's shape, the "last chapter" derivation (with
// the fallback when no chapter has lastOpenedAt), open-annotation
// filtering, open-story-question filtering, recent-decisions date
// filter, and health-warning pass-through. No DOM, no UI.
// Run with: node resume.smoketest.mjs

// ── localStorage shim ───────────────────────────────────────────────────
class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Store = await import('./store.js');

// ── tiny test harness ───────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(title) { console.log(`\n${title}`); }

globalThis.localStorage.clear();

// ── 1. Empty project — minimal summary shape ────────────────────────────
section('empty project — minimal summary shape');
{
  Store.createProject('Empty');
  // The freshly-created project from createProject() always has one
  // "Chapter 1" chapter, so lastChapter is non-null even on a fresh
  // project. lastOpenedAt is '' because markProjectOpened isn't
  // called here (it's only called from app.js init / pagehide).
  const summary = Store.getResumeSummary();
  assert(!!summary.lastChapter, 'lastChapter is non-null on a fresh project');
  assertEqual(summary.lastChapter.chapterTitle, 'Chapter 1', 'lastChapter is the seeded Chapter 1');
  assertEqual(summary.lastChapter.lastOpenedAt, '', 'lastChapter.lastOpenedAt is "" on a fresh project (never opened)');
  assertEqual(summary.openAnnotations.length, 0, 'no annotations');
  assertEqual(summary.openStoryQuestions.length, 0, 'no story questions');
  assertEqual(summary.recentDecisions.length, 0, 'no decisions');
  assertEqual(summary.healthWarnings.total, 0, 'no health warnings on a fresh project');
  assertEqual(summary.lastOpenedAt, '', 'project.lastOpenedAt is "" on a fresh project');
}

// ── 2. Last chapter — uses the most-recent lastOpenedAt ────────────────
section('last chapter — picks the most-recent lastOpenedAt');
globalThis.localStorage.clear();
{
  Store.createProject('Multi-Chapter');
  const ch1 = Store.createChapter('Chapter One');
  const ch2 = Store.createChapter('Chapter Two');
  const ch3 = Store.createChapter('Chapter Three');

  // Open ch1 first, then ch3 — ch3 should be the "last chapter"
  // because its lastOpenedAt is most recent.
  Store.recordChapterOpened(ch1.id);
  // Tiny sleep to ensure timestamps differ (recordChapterOpened uses ISO ms).
  await new Promise((r) => setTimeout(r, 5));
  Store.recordChapterOpened(ch3.id);

  const summary = Store.getResumeSummary();
  assertEqual(summary.lastChapter.chapterId, ch3.id, 'lastChapter is the most-recently-opened chapter');
  assertEqual(summary.lastChapter.chapterTitle, 'Chapter Three', 'lastChapter title matches');
  assert(!!summary.lastChapter.lastOpenedAt, 'lastChapter has a lastOpenedAt timestamp');
}

// ── 3. Last chapter — fallback when no chapter has lastOpenedAt ────────
section('last chapter — falls back to most-recently-updated when no lastOpenedAt');
globalThis.localStorage.clear();
{
  Store.createProject('No Opens');
  const ch1 = Store.createChapter('Chapter One');
  const ch2 = Store.createChapter('Chapter Two');
  // Update ch1's content (which sets its updatedAt) but don't call
  // recordChapterOpened on either — simulates a migrated project
  // where the writer has chapter content but no lastOpenedAt data.
  Store.updateChapterContent(ch1.id, 'some content');
  await new Promise((r) => setTimeout(r, 5));
  Store.updateChapterContent(ch2.id, 'some other content');

  const summary = Store.getResumeSummary();
  // ch2 should be the fallback since its updatedAt is most recent
  assertEqual(summary.lastChapter.chapterId, ch2.id, 'lastChapter falls back to most-recently-updated');
  assertEqual(summary.lastChapter.lastOpenedAt, '', 'lastChapter.lastOpenedAt is "" (no opens recorded)');
}

// ── 4. Last chapter — null only when project has zero chapters ─────────
section('last chapter — null only when project has zero chapters');
// Every Tinta project always has at least one chapter (createProject
// seeds one), so the only way to have zero chapters is a manually-
// constructed fixture. Verify the helper handles it.
globalThis.localStorage.clear();
{
  const proj = Store.createProject('Empty After Deletes');
  // Manually empty the chapters array — bypassing store's normal
  // invariants for test purposes
  const db = Store.getActiveDb();
  db.projects[proj.id].chapters = [];
  Store.save();

  const summary = Store.getResumeSummary();
  assertEqual(summary.lastChapter, null, 'lastChapter is null when project has no chapters');
}

// ── 4b. getLastActiveChapter — the extracted helper app.js's boot ───────
// sequence now calls directly (debt-fix pass — boot used to always take
// the first chapter by `order`, ignoring lastOpenedAt entirely, so a
// reload dropped you back to chapter 1 regardless of what you were
// actually writing). This exercises the exported function itself, not
// just through getResumeSummary's wrapping of it — the two happened to
// stay in sync above because the extraction was a pure move, but boot's
// actual dependency deserves its own direct assertion.
section('getLastActiveChapter — same lookup getResumeSummary uses, called directly');
globalThis.localStorage.clear();
{
  const proj = Store.createProject('Direct Helper Check');
  const ch1 = Store.createChapter('First');
  const ch2 = Store.createChapter('Second');
  Store.recordChapterOpened(ch1.id);
  Store.recordChapterOpened(ch2.id);

  const result = Store.getLastActiveChapter(Store.getActiveProject());
  assertEqual(result.chapterId, ch2.id, 'returns the most-recently-opened chapter, matching what boot should restore');

  const db = Store.getActiveDb();
  db.projects[proj.id].chapters = [];
  Store.save();
  assertEqual(Store.getLastActiveChapter(Store.getActiveProject()), null, 'returns null for a project with zero chapters, matching getResumeSummary lastChapter behavior');
}

// ── 5. Open annotations — filtered + joined ────────────────────────────
section('open annotations — resolved excluded, open included with chapter/scene titles');
globalThis.localStorage.clear();
{
  Store.createProject('With Annotations');
  const ch1 = Store.createChapter('Chapter One');
  const ch2 = Store.createChapter('Chapter Two');
  const scene1 = Store.createScene(ch1.id, { title: 'Scene 1A' });

  const openAnno = Store.createAnnotation({ chapterId: ch1.id, type: 'todo', note: 'Fix this later' });
  const openSceneAnno = Store.createAnnotation({ chapterId: ch1.id, sceneId: scene1.id, type: 'continuity', note: 'Scene-level check' });
  const resolvedAnno = Store.createAnnotation({ chapterId: ch2.id, type: 'check', note: 'Already verified' });
  Store.updateAnnotation(resolvedAnno.id, { resolved: true });

  const summary = Store.getResumeSummary();
  assertEqual(summary.openAnnotations.length, 2, '2 open annotations (resolved one excluded)');
  // Sorted by updatedAt desc; the most-recently-touched one is at top
  const titles = summary.openAnnotations.map((a) => a.chapterTitle);
  assert(titles.includes('Chapter One'), 'annotations include Chapter One');
  assert(!titles.includes('Chapter Two') || summary.openAnnotations.find((a) => a.chapterId === ch2.id)?.note === undefined, 'Chapter Two annotation is excluded (resolved)');

  // Verify scene join
  const sceneAnno = summary.openAnnotations.find((a) => a.sceneId === scene1.id);
  assert(!!sceneAnno, 'scene-level annotation is in the list');
  assertEqual(sceneAnno.sceneTitle, 'Scene 1A', 'scene annotation joins scene title');
  assertEqual(sceneAnno.chapterTitle, 'Chapter One', 'scene annotation joins chapter title');
}

// ── 6. Open story questions — only unresolved ──────────────────────────
section('open story questions — only unresolved');
globalThis.localStorage.clear();
{
  Store.createProject('With Questions');
  const ch1 = Store.createChapter('Chapter One');
  const scene1 = Store.createScene(ch1.id, { title: 'Scene 1A' });

  const openQ = Store.createStoryQuestion({ question: 'Who killed the king?' });
  const openQWithPayoff = Store.createStoryQuestion({ question: 'Where is the dagger hidden?', introducedSceneId: scene1.id, payoffSceneId: scene1.id });
  const resolvedQ = Store.createStoryQuestion({ question: 'Why did Mira lie?' });
  Store.updateStoryQuestion(resolvedQ.id, { resolved: true });

  const summary = Store.getResumeSummary();
  assertEqual(summary.openStoryQuestions.length, 2, '2 open questions (resolved excluded)');
  const questions = summary.openStoryQuestions.map((q) => q.question).sort();
  assert(questions.includes('Who killed the king?'), 'open question 1 included');
  assert(questions.includes('Where is the dagger hidden?'), 'open question 2 included');
  assert(!questions.includes('Why did Mira lie?'), 'resolved question excluded');

  // Verify scene-id shape
  const withPayoff = summary.openStoryQuestions.find((q) => q.payoffSceneId);
  assert(!!withPayoff, 'a question with a payoff scene is included');
  assertEqual(withPayoff.payoffSceneId, scene1.id, 'payoffSceneId preserved');
}

// ── 7. Recent decisions — last 7 days from lastOpenedAt ────────────────
section('recent decisions — last 7 days from project.lastOpenedAt');
globalThis.localStorage.clear();
{
  Store.createProject('With Decisions');
  // Manually set lastOpenedAt to a fixed timestamp so the cutoff is
  // deterministic — getResumeSummary uses project.lastOpenedAt || now()
  // as the cutoff anchor.
  const anchorTime = '2025-06-15T12:00:00Z';
  const db = Store.getActiveDb();
  db.projects[db.activeProjectId].lastOpenedAt = anchorTime;
  Store.save();

  // A decision from 5 days before the anchor — should be in the last-7-days window
  const recentDecision = Store.createDecision({ decision: 'Pick the blue door', reason: 'It glows' });
  db.projects[db.activeProjectId].decisionLog[0].createdAt = '2025-06-10T12:00:00Z';
  Store.save();

  // A decision from 30 days before the anchor — outside the 7-day window
  const oldDecision = Store.createDecision({ decision: 'Old choice', reason: '' });
  db.projects[db.activeProjectId].decisionLog[1].createdAt = '2025-05-15T12:00:00Z';
  Store.save();

  const summary = Store.getResumeSummary();
  assertEqual(summary.recentDecisions.length, 1, '1 decision within the 7-day window');
  assertEqual(summary.recentDecisions[0].decision, 'Pick the blue door', 'recent decision is the one in window');
  assertEqual(summary.recentDecisions[0].reason, 'It glows', 'reason preserved');
}

// ── 8. Recent decisions — fresh-install case (lastOpenedAt = '') ──────
section('recent decisions — fresh-install anchor (lastOpenedAt = "")');
globalThis.localStorage.clear();
{
  Store.createProject('Fresh Install');
  // lastOpenedAt is '' — getResumeSummary should use now() as the
  // cutoff anchor. A decision just created should be within 7 days
  // of now, so it should appear in recentDecisions.
  Store.createDecision({ decision: 'Just decided', reason: 'fresh' });
  const summary = Store.getResumeSummary();
  assertEqual(summary.recentDecisions.length, 1, 'just-created decision is in the recent list');
  assertEqual(summary.recentDecisions[0].decision, 'Just decided', 'decision text preserved');
}

// ── 9. Health warnings — pass-through shape ───────────────────────────
section('health warnings — passed through from getProjectHealthReport');
globalThis.localStorage.clear();
{
  Store.createProject('With Health Issues');
  // Create an entity with no mentions/relationships — should show as orphan
  Store.createEntity({ name: 'Lonely Character', type: 'character' });
  // Create an unresolved story question — should show as unresolvedQuestions
  Store.createStoryQuestion({ question: 'Mystery with no resolution' });

  const summary = Store.getResumeSummary();
  assert(summary.healthWarnings.total > 0, 'total > 0 with orphan entity + unresolved question');
  assert(summary.healthWarnings.orphanEntities.length >= 1, 'orphan entity is in the list');
  assertEqual(summary.healthWarnings.orphanEntities[0].name, 'Lonely Character', 'orphan entity name preserved');
  assertEqual(summary.healthWarnings.orphanEntities[0].kind, 'entity', 'orphan entity has kind discriminator');
  assert(summary.healthWarnings.unresolvedQuestions.length >= 1, 'unresolved question is in the list');
  assertEqual(summary.healthWarnings.unresolvedQuestions[0].question, 'Mystery with no resolution', 'unresolved question text preserved');
}

// ── 10. lastOpenedAt — pass-through from project ──────────────────────
section('lastOpenedAt — passed through from project.lastOpenedAt');
globalThis.localStorage.clear();
{
  Store.createProject('Project With Timestamp');
  const db = Store.getActiveDb();
  const ts = '2025-06-01T08:30:00Z';
  db.projects[db.activeProjectId].lastOpenedAt = ts;
  Store.save();

  const summary = Store.getResumeSummary();
  assertEqual(summary.lastOpenedAt, ts, 'lastOpenedAt is project.lastOpenedAt');
}

// ── 11. markProjectOpened — stamps the active project ──────────────────
section('markProjectOpened — stamps project.lastOpenedAt');
globalThis.localStorage.clear();
{
  Store.createProject('To Open');
  assertEqual(Store.getActiveProject().lastOpenedAt, '', 'fresh project lastOpenedAt is ""');
  Store.markProjectOpened();
  const ts = Store.getActiveProject().lastOpenedAt;
  assert(!!ts, 'markProjectOpened sets lastOpenedAt to a non-empty timestamp');
  assert(Date.now() - new Date(ts).getTime() < 5000, 'markProjectOpened timestamp is recent (within 5s)');
}

// ── 12. recordChapterOpened — stamps the chapter's lastOpenedAt ───────
section('recordChapterOpened — also stamps chapter.lastOpenedAt');
globalThis.localStorage.clear();
{
  Store.createProject('To Open Chapter');
  const ch1 = Store.createChapter('Chapter One');
  assertEqual(ch1.lastOpenedAt, '', 'fresh chapter lastOpenedAt is ""');
  Store.recordChapterOpened(ch1.id);
  const ch1After = Store.getChapter(ch1.id);
  assert(!!ch1After.lastOpenedAt, 'recordChapterOpened stamps chapter.lastOpenedAt');
  assert(Date.now() - new Date(ch1After.lastOpenedAt).getTime() < 5000, 'chapter lastOpenedAt is recent');
}

// ── 13. Pure-read — getResumeSummary doesn't mutate ───────────────────
section('getResumeSummary — pure read, does not mutate');
globalThis.localStorage.clear();
{
  Store.createProject('Pure Read Test');
  Store.createChapter('Chapter One');
  const before = JSON.stringify(Store.getActiveDb());
  Store.getResumeSummary();
  const after = JSON.stringify(Store.getActiveDb());
  assertEqual(before, after, 'db JSON identical before/after getResumeSummary');
}

// ── summary ────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}
