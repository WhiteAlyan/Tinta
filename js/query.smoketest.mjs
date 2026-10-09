// Tinta — field-scoped query language (Query pass, foundation pillar 2 of 5:
// Containers → Query → Navigation/Context → Mutation/History → Provenance)
// smoke test.
//
// Covers parseQuery() in isolation plus searchProject()'s use of it —
// filter/category scoping, filterConflict, date-range syntax, and the
// "pure filter, no free text" case. Same no-Store, plain-fixture pattern
// as search.smoketest.mjs. Run with: node query.smoketest.mjs

import { searchProject, parseQuery, countResultRows, QUERY_FILTER_FIELDS } from './search.js';

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
    chapterTypes: [
      { key: 'chapter', builtin: true, role: 'content', label: 'Chapter' },
      { key: 'foreword', builtin: true, role: 'frontmatter', label: 'Foreword' },
    ],
    parts: [
      { id: 'part1', title: 'Part One', order: 0 },
    ],
    folders: [
      { id: 'fold1', name: 'Subplot A' },
    ],
    chapters: [
      {
        id: 'chap1',
        title: 'The Beginning',
        content: 'It was a dark and stormy night. The castle loomed ahead.',
        status: 'draft',
        docType: 'chapter',
        arc: 'Act I',
        povCharacter: 'Elena',
        partId: 'part1',
        folderId: 'fold1',
        updatedAt: '2025-01-10T00:00:00Z',
        scenes: [
          {
            id: 'scene1',
            title: 'Arrival',
            status: 'draft',
            pov: 'Elena',
            goal: 'Reach the castle before dawn',
            conflict: 'A storm blocks the road',
            outcome: 'Arrives soaked but on time',
            notes: '',
            location: '',
          },
        ],
      },
      {
        id: 'chap2',
        title: 'The Departure',
        content: 'She left without looking back.',
        status: 'final',
        docType: 'chapter',
        arc: 'Act II',
        povCharacter: 'Kael',
        partId: null,
        folderId: null,
        updatedAt: '2025-06-15T00:00:00Z',
        scenes: [
          { id: 'scene2', title: 'Goodbye', status: 'revised', pov: 'Kael', goal: '', conflict: '', outcome: '', notes: '', location: '' },
        ],
      },
      {
        id: 'chap3',
        title: 'Foreword',
        content: 'A note from the author.',
        status: 'final',
        docType: 'foreword',
        arc: '',
        povCharacter: '',
        partId: null,
        folderId: null,
        updatedAt: '2025-03-01T00:00:00Z',
        scenes: [],
      },
    ],
    entities: {
      e1: {
        id: 'e1', name: 'Elena Castellan', type: 'character', description: 'Keeper of the castle keys',
        tags: ['protagonist', 'royalty'], canonStatus: 'canon',
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-05T00:00:00Z',
      },
      e2: {
        id: 'e2', name: 'Kael', type: 'character', description: 'A wandering merchant',
        tags: ['minor'], canonStatus: 'draft',
        createdAt: '2025-05-01T00:00:00Z', updatedAt: '2025-07-01T00:00:00Z',
      },
      e3: {
        id: 'e3', name: 'The Sunken City', type: 'location', description: 'A ruined coastal city',
        tags: ['worldbuilding'], canonStatus: 'canon',
        createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-02-01T00:00:00Z',
      },
    },
    ruleSystems: {
      sys1: { id: 'sys1', name: 'Blood Magic', canonStatus: 'canon', source: '', resource: '', channel: '', restrictions: '', description: '' },
      sys2: { id: 'sys2', name: 'Draft Pantheon Rules', canonStatus: 'draft', source: '', resource: '', channel: '', restrictions: '', description: '' },
    },
    systemNodes: {},
    snippets: {
      s1: { id: 's1', createdAt: '2024-01-01T00:00:00Z', text: 'The castle gates creaked open.' },
    },
    timelineEvents: {
      t1: { id: 't1', title: 'The Storm', storyDate: 'Year 1', description: 'A storm hits the castle coast' },
    },
    references: {},
    annotations: {},
    maps: {},
  };
}

section('parseQuery — basic field:value extraction');
{
  const { filters, freeText } = parseQuery('type:character castle');
  assertEqual(filters.length, 1, 'one filter token extracted');
  assertEqual(filters[0].field, 'type', 'field name parsed');
  assertEqual(filters[0].value, 'character', 'value parsed');
  assertEqual(freeText, 'castle', 'remaining free text has the filter token stripped, whitespace collapsed');
}

section('parseQuery — quoted values with spaces');
{
  const { filters, freeText } = parseQuery('part:"Part One" dawn');
  assertEqual(filters.length, 1, 'quoted value parsed as one filter');
  assertEqual(filters[0].value, 'part one', 'quoted value preserves internal spaces (lowercased)');
  assertEqual(freeText, 'dawn', 'free text left over after the quoted filter is stripped');
}

section('parseQuery — unrecognized field:value is left as literal free text');
{
  const { filters, freeText } = parseQuery('color:blue sky');
  assertEqual(filters.length, 0, 'an unknown field produces no filter');
  assertEqual(freeText, 'color:blue sky', 'unrecognized token stays in the free text verbatim');
}

section('parseQuery — every documented field is recognized');
{
  ['type', 'tag', 'canon', 'docType', 'role', 'status', 'part', 'folder', 'arc', 'pov', 'updated', 'created'].forEach((f) => {
    assert(!!QUERY_FILTER_FIELDS[f], `${f}: is a recognized filter field`);
  });
}

section('type: — entity-only filter, scopes results to entities');
{
  const project = makeProject();
  const results = searchProject(project, 'type:character');
  assertEqual(results.entities.length, 2, 'both character-type entities match');
  assertEqual(results.chapters.length, 0, 'chapters are out of scope for an entity-only field, not just empty by chance');
  assertEqual(results.snippets.length, 0, 'snippets are likewise out of scope');
  assert(results.entities.every((e) => e.name !== 'The Sunken City'), 'the location-type entity is excluded');
}

section('tag: — exact tag match, case-insensitive');
{
  const project = makeProject();
  const results = searchProject(project, 'tag:PROTAGONIST');
  assertEqual(results.entities.length, 1, 'tag filter matches case-insensitively');
  assertEqual(results.entities[0].id, 'e1', 'matches the entity actually carrying that tag');
}

section('status: — shared field name, scoped separately per category');
{
  const project = makeProject();
  const chapterStatus = searchProject(project, 'status:draft');
  assertEqual(chapterStatus.chapters.length, 1, 'status:draft matches the one draft chapter');
  assertEqual(chapterStatus.scenes.length, 1, 'status:draft also matches the one draft scene (status is scoped to both)');
  assertEqual(chapterStatus.entities.length, 0, 'entities are out of scope for status: (they use canon:, not status:)');
}

section('docType: / role: — chapter-only, resolves role via chapterTypes lookup');
{
  const project = makeProject();
  const byDocType = searchProject(project, 'docType:foreword');
  assertEqual(byDocType.chapters.length, 1, 'docType:foreword matches the one foreword chapter');
  assertEqual(byDocType.chapters[0].id, 'chap3', 'matches the correct chapter');

  const byRole = searchProject(project, 'role:frontmatter');
  assertEqual(byRole.chapters.length, 1, 'role:frontmatter resolves docType->role via chapterTypes and matches the same chapter');
  assertEqual(byRole.chapters[0].id, 'chap3', 'role lookup matches the correct chapter');

  const byContentRole = searchProject(project, 'role:content');
  assertEqual(byContentRole.chapters.length, 2, 'role:content matches the two real chapters, not the foreword');
}

section('part: / folder: — id-to-name lookup, plus none/unassigned escape hatch');
{
  const project = makeProject();
  const inPart = searchProject(project, 'part:"Part One"');
  assertEqual(inPart.chapters.length, 1, 'part filter resolves the part id to its title and matches the one assigned chapter');
  assertEqual(inPart.chapters[0].id, 'chap1', 'matches the correct chapter');

  const noPart = searchProject(project, 'part:none');
  assertEqual(noPart.chapters.length, 2, '"none" matches every chapter with no partId');

  const inFolder = searchProject(project, 'folder:"Subplot A"');
  assertEqual(inFolder.chapters.length, 1, 'folder filter resolves the folder id to its name');
}

section('canon: — shared across entities and rule systems');
{
  const project = makeProject();
  const results = searchProject(project, 'canon:draft');
  assertEqual(results.entities.length, 1, 'canon:draft matches the one draft-canon entity');
  assertEqual(results.ruleSystems.length, 1, 'canon:draft also matches the one draft-canon rule system');
  assertEqual(results.chapters.length, 0, 'chapters are out of scope for canon: entirely');
}

section('Pure filter query — no free text still returns real rows (the "still match" fix)');
{
  const project = makeProject();
  const results = searchProject(project, 'status:final');
  assertEqual(results.chapters.length, 2, 'a filter-only query (no keyword) returns every matching row');
  assert(results.chapters.every((c) => c.matches.length === 0), 'rows from a pure filter query carry no text matches, since none were requested');
  assert(countResultRows(results) === 2, 'countResultRows reflects real rows even when countTotalMatches would read as 0');
}

section('Filter + free text combined — both must be satisfied');
{
  const project = makeProject();
  const results = searchProject(project, 'status:draft castle');
  assertEqual(results.chapters.length, 1, 'only the chapter that is both draft-status AND contains "castle" matches');
  assertEqual(results.chapters[0].matches.length, 1, 'the surviving row still carries its real text match');

  const noOverlap = searchProject(project, 'status:final castle');
  assertEqual(noOverlap.chapters.length, 0, 'a final-status chapter containing "castle" does not exist, so this correctly returns nothing');
}

section('filterConflict — incompatible fields in one query flagged, not silently empty');
{
  const project = makeProject();
  const results = searchProject(project, 'type:character docType:chapter');
  assert(results.filterConflict === true, 'combining an entity-only field with a chapter-only field is flagged as a conflict');
  assertEqual(results.chapters.length, 0, 'no category is scanned once a conflict is detected');
  assertEqual(results.entities.length, 0, 'no category is scanned once a conflict is detected');
}

section('date-range — exact day, comparison operators, and open/closed ranges');
{
  const project = makeProject();
  const exact = searchProject(project, 'updated:2025-01-10');
  assertEqual(exact.chapters.length, 1, 'an exact date matches the chapter updated that calendar day');

  const after = searchProject(project, 'updated:>2025-03-01');
  assertEqual(after.chapters.length, 1, '">" matches only chapters updated strictly after the given date');
  assertEqual(after.chapters[0].id, 'chap2', 'matches the correct (later) chapter');

  const onOrAfter = searchProject(project, 'created:>=2025-02-01');
  assertEqual(onOrAfter.entities.length, 2, '">=" on entities includes the boundary date itself');

  const range = searchProject(project, 'updated:2025-01-01..2025-03-31');
  assertEqual(range.chapters.length, 2, 'a closed from..to range matches every chapter updated within it, inclusive');

  const openEnded = searchProject(project, 'updated:2025-05-01..');
  assertEqual(openEnded.chapters.length, 1, 'an open-ended "from.." range matches everything on or after "from"');
}

section('Category chips — an out-of-scope category is genuinely empty, not just unmatched');
{
  const project = makeProject();
  const results = searchProject(project, 'canon:canon');
  assert(results.snippets.length === 0 && results.timelineEvents.length === 0, 'categories with no matching filter field are excluded entirely once any filter is active');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
