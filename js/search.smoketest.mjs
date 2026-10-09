// Tinta — search & replace (Quick-wins pass) smoke test.
//
// search.js has no Store dependency (same as diff.js/wordtools.js), so
// this builds plain project-shaped fixtures directly rather than using
// the localStorage-backed Store shim the other smoke tests use. Run
// with: node search.smoketest.mjs

import { searchProject, countTotalMatches, planChapterReplace } from './search.js';

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

function makeProject() {
  return {
    chapters: [
      {
        id: 'chap1',
        title: 'The Beginning',
        content: 'It was a dark and stormy night. The castle loomed ahead.',
        scenes: [
          {
            id: 'scene1',
            title: 'Arrival',
            goal: 'Reach the castle before dawn',
            conflict: 'A storm blocks the road',
            outcome: 'Arrives soaked but on time',
            notes: 'Consider foreshadowing the storm later',
            location: 'The old coastal road',
          },
        ],
      },
      {
        id: 'chap2',
        title: 'The Departure',
        content: 'She left without looking back.',
        scenes: [],
      },
    ],
    entities: {
      e1: { id: 'e1', name: 'Elena Castellan', type: 'character', description: 'Keeper of the castle keys', tags: ['protagonist', 'royalty'] },
      e2: { id: 'e2', name: 'Kael', type: 'character', description: 'A wandering merchant', tags: ['minor'] },
    },
    snippets: {
      s1: { id: 's1', createdAt: '2024-01-01T00:00:00Z', text: 'The castle gates creaked open.' },
    },
    timelineEvents: {
      t1: { id: 't1', title: 'The Storm', storyDate: 'Year 1', description: 'A storm hits the castle coast' },
    },
  };
}

section('Literal search — chapters/entities/snippets/timeline');
{
  const project = makeProject();
  const results = searchProject(project, 'castle');
  assertEqual(results.chapters.length, 1, 'finds the one chapter containing "castle"');
  assertEqual(results.entities.length, 1, 'finds the one entity (description match) containing "castle"');
  assertEqual(results.snippets.length, 1, 'finds the one snippet containing "castle"');
  assertEqual(results.timelineEvents.length, 1, 'finds the one timeline event containing "castle"');
  assert(results.regexError === null, 'regexError is null on a clean literal search');
}

section('Case sensitivity');
{
  const project = makeProject();
  const insensitive = searchProject(project, 'CASTLE');
  assertEqual(insensitive.chapters.length, 1, 'case-insensitive by default');
  const sensitive = searchProject(project, 'CASTLE', { caseSensitive: true });
  assertEqual(sensitive.chapters.length, 0, 'case-sensitive mode respects case');
}

section('Empty / whitespace query');
{
  const project = makeProject();
  const empty = searchProject(project, '   ');
  assertEqual(countTotalMatches(empty), 0, 'a whitespace-only query returns no matches');
  assert(Array.isArray(empty.chapters) && empty.chapters.length === 0, 'empty result shape is well-formed');
}

section('Scene-field search (Quick-wins pass — previously out of scope)');
{
  const project = makeProject();
  const goalHit = searchProject(project, 'dawn');
  assertEqual(goalHit.scenes.length, 1, 'matches scene.goal ("Reach the castle before dawn")');
  assertEqual(goalHit.scenes[0].chapterId, 'chap1', 'scene result carries its parent chapterId for jump-to-Corkboard');

  const conflictHit = searchProject(project, 'storm');
  assertEqual(conflictHit.scenes.length, 1, 'matches scene.conflict ("A storm blocks the road")');

  const notesHit = searchProject(project, 'foreshadowing');
  assertEqual(notesHit.scenes.length, 1, 'matches scene.notes');

  const locationHit = searchProject(project, 'coastal');
  assertEqual(locationHit.scenes.length, 1, 'matches scene.location');
}

section('Tag search (Quick-wins pass — previously out of scope)');
{
  const project = makeProject();
  const tagHit = searchProject(project, 'protagonist');
  assertEqual(tagHit.entities.length, 1, 'matches an entity via its tags array');
  assertEqual(tagHit.entities[0].tagMatches.length, 1, 'tagMatches carries the one matching tag');
  assertEqual(tagHit.entities[0].tagMatches[0], 'protagonist', 'tagMatches returns the raw matching tag string, not a {index,snippet} shape');

  const nameHit = searchProject(project, 'Elena');
  assertEqual(nameHit.entities[0].tagMatches.length, 0, 'a name-only match leaves tagMatches empty');
}

section('Regex mode — basic pattern');
{
  const project = makeProject();
  const results = searchProject(project, 'c[au]stle', { useRegex: true });
  assertEqual(results.chapters.length, 1, 'a valid regex pattern matches as expected');
  assert(results.regexError === null, 'regexError stays null for a valid pattern');
}

section('Regex mode — invalid pattern reported cleanly, not thrown');
{
  const project = makeProject();
  let threw = false;
  let results;
  try {
    results = searchProject(project, '[unterminated', { useRegex: true });
  } catch {
    threw = true;
  }
  assert(!threw, 'an invalid regex pattern does not throw out of searchProject');
  assert(typeof results.regexError === 'string' && results.regexError.length > 0, 'invalid pattern is reported via results.regexError');
  assertEqual(countTotalMatches(results), 0, 'no partial results are returned alongside a regexError');
}

section('Regex mode — zero-width match protection (no infinite loop)');
{
  const project = makeProject();
  const start = Date.now();
  const results = searchProject(project, 'x*', { useRegex: true });
  const elapsed = Date.now() - start;
  assert(elapsed < 2000, `a zero-width-capable pattern ("x*") completes quickly, not hangs (took ${elapsed}ms)`);
  assert(results.chapters.length >= 1, 'a zero-width pattern still returns results rather than bailing out empty');
}

section('countTotalMatches');
{
  const project = makeProject();
  const results = searchProject(project, 'castle');
  const total = countTotalMatches(results);
  assert(total > 0, 'countTotalMatches sums across all result categories');
  const noMatch = searchProject(project, 'zzz_nope_zzz');
  assertEqual(countTotalMatches(noMatch), 0, 'countTotalMatches is 0 when nothing matches');
}

section('Replace — chapters only, literal (regex mode intentionally not plumbed through here)');
{
  const project = makeProject();
  const plan = planChapterReplace(project, 'castle', 'keep');
  assertEqual(plan.length, 1, 'replace plan touches only the one chapter containing the query');
  assertEqual(plan[0].count, 1, 'reports the correct match count for that chapter');
  assert(plan[0].newContent.includes('keep') && !plan[0].newContent.toLowerCase().includes('castle'), 'newContent has the literal substitution applied');
  assert(!JSON.stringify(plan).includes('scene1'), 'replace plan never touches scene fields');
}

section('Replace — empty query is a no-op, not a throw');
{
  const project = makeProject();
  const plan = planChapterReplace(project, '', 'anything');
  assertEqual(plan.length, 0, 'an empty/whitespace query produces an empty replace plan');
}

section('Regex replace — count matches the same regex used for search (no mismatch)');
{
  const project = makeProject();
  const searchResults = searchProject(project, 'c[au]stle', { useRegex: true });
  const searchDerivedCount = searchResults.chapters.reduce((sum, r) => sum + r.matches.length, 0);
  const plan = planChapterReplace(project, 'c[au]stle', 'keep', { useRegex: true });
  const replaceDerivedCount = plan.reduce((sum, p) => sum + p.count, 0);
  assertEqual(replaceDerivedCount, searchDerivedCount, 'regex replace touches exactly as many matches as regex search reported — the count can never disagree');
  assertEqual(plan[0].newContent, 'It was a dark and stormy night. The keep loomed ahead.', 'regex replace substitutes correctly');
}

section('Regex replace — capture group references ($1) in the replacement');
{
  const project = makeProject();
  project.chapters[0].content = 'Elena said hello. Kael said goodbye.';
  const plan = planChapterReplace(project, '(\\w+) said', '$1 shouted', { useRegex: true });
  assertEqual(plan[0].newContent, 'Elena shouted hello. Kael shouted goodbye.', 'a capture group ($1) in the replacement is honored, same as native String.replace with a real RegExp');
  assertEqual(plan[0].count, 2, 'both matches counted');
}

section('Regex replace — invalid pattern is a safe no-op, not a throw');
{
  const project = makeProject();
  let threw = false;
  let plan;
  try {
    plan = planChapterReplace(project, '[unterminated', 'x', { useRegex: true });
  } catch {
    threw = true;
  }
  assert(!threw, 'an invalid regex pattern passed to planChapterReplace does not throw');
  assertEqual(plan.length, 0, 'an invalid pattern produces an empty (no-op) plan rather than partial or garbage replacements');
}

section('Regex replace — case sensitivity respected');
{
  const project = makeProject();
  const insensitive = planChapterReplace(project, 'CASTLE', 'keep', { useRegex: true });
  assertEqual(insensitive.length, 1, 'case-insensitive by default in regex mode too');
  const sensitive = planChapterReplace(project, 'CASTLE', 'keep', { useRegex: true, caseSensitive: true });
  assertEqual(sensitive.length, 0, 'case-sensitive regex mode respects case');
}

section('Regex replace — literal mode is unaffected by these changes');
{
  const project = makeProject();
  const plan = planChapterReplace(project, 'castle', 'keep', { caseSensitive: false });
  assertEqual(plan.length, 1, 'literal (non-regex) replace still works exactly as before');
  assertEqual(plan[0].count, 1, 'literal replace count unaffected by the regex-mode changes');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
