// Tinta — vocabulary registry smoketest (0.2.6 Pass 3/4).
//
// Pins the Vocabulary API contract: every domain resolves, labels fall
// back gracefully on unknown values, validity is exact, terminal states
// are status-only, and StatusBadge output is escaped. Imports store.js
// transitively (vocabulary.js does), which is fine — the smoketests run
// in Node with no DOM needed here.
//
// Run with: node vocabulary.smoketest.mjs

import {
  vocabularyValues,
  vocabularyLabel,
  vocabularyOrder,
  vocabularyIsValid,
  vocabularyIsTerminal,
  vocabularyDomains,
  StatusBadgeRender,
  STATUS_LABEL,
  STATUS_ORDER,
} from './vocabulary.js';
import { SCENE_REVISION_STATUSES, ANNOTATION_TYPES, SCENE_RELATIONSHIP_TYPES } from './store.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${msg}`); }
}
function section(title) { console.log(`\n${title}`); }

section('registry shape — every domain resolves with a non-empty value list');
const domains = vocabularyDomains();
assert(domains.length === 8, `8 domains registered (got ${domains.length})`);
for (const { key } of domains) {
  const vals = vocabularyValues(key);
  assert(Array.isArray(vals) && vals.length > 0, `${key}: non-empty values`);
  assert(vocabularyOrder(key).length === vals.length, `${key}: order matches values`);
}
assert(domains.some((d) => d.key === 'chapterStatus'), 'chapterStatus present');
assert(domains.some((d) => d.key === 'canonStatus'), 'canonStatus present');
assert(domains.some((d) => d.key === 'sceneRelationshipType'), 'sceneRelationshipType present');

section('labels — canonical values, humanized kebab, display-ready, labeled entries');
assert(vocabularyLabel('chapterStatus', 'revised') === 'Revised', 'chapterStatus uses the label map');
assert(vocabularyLabel('sceneStatus', 'needs-work') === 'Needs work', 'kebab value humanized');
assert(vocabularyLabel('canonStatus', 'non-canon') === 'Non-canon', 'explicit canon labels preserve hyphen copy');
assert(vocabularyLabel('mapType', 'Dungeon/Interior') === 'Dungeon/Interior', 'display-ready value verbatim');
assert(vocabularyLabel('annotationType', 'todo') === 'To-do', 'labeled entry label used');
assert(vocabularyLabel('sceneRelationshipType', 'pays-off') === 'Pays off', 'relationship label used');
assert(vocabularyLabel('chapterStatus', 'made-up-value') === 'made-up-value', 'unknown value falls back to raw (no throw)');

section('validity — exact membership, unknown domain throws');
assert(vocabularyIsValid('chapterStatus', 'draft') === true, 'draft valid');
assert(vocabularyIsValid('chapterStatus', 'polished') === false, 'scene value not valid for chapters');
assert(vocabularyIsValid('sceneStatus', 'polished') === true, 'polished valid for scenes');
assert(vocabularyIsValid('referenceType', 'Note') === true, 'reference Note valid');
let threw = false;
try { vocabularyLabel('nope', 'x'); } catch { threw = true; }
assert(threw, 'unknown domain throws loudly');
threw = false;
try { vocabularyIsValid('nope', 'x'); } catch { threw = true; }
assert(threw, 'unknown domain throws for isValid too');

section('terminal states — status domains only');
assert(vocabularyIsTerminal('chapterStatus', 'final') === true, 'final is terminal');
assert(vocabularyIsTerminal('chapterStatus', 'draft') === false, 'draft is not');
assert(vocabularyIsTerminal('sceneStatus', 'polished') === true, 'polished terminal');
assert(vocabularyIsTerminal('canonStatus', 'deprecated') === true, 'deprecated terminal');
assert(vocabularyIsTerminal('canonStatus', 'proposed') === false, 'proposed not terminal');
assert(vocabularyIsTerminal('mapType', 'World') === false, 'non-status domain: never terminal');

section('registry reads store.js vocabulary without copying it');
assert(JSON.stringify(vocabularyValues('sceneStatus')) === JSON.stringify(SCENE_REVISION_STATUSES), 'sceneStatus mirrors store const');
assert(JSON.stringify(vocabularyValues('annotationType')) === JSON.stringify(ANNOTATION_TYPES.map((t) => t.key)), 'annotationType mirrors store keys');
assert(JSON.stringify(vocabularyValues('sceneRelationshipType')) === JSON.stringify(SCENE_RELATIONSHIP_TYPES.map((t) => t.key)), 'relationshipType mirrors store keys');
assert(JSON.stringify(vocabularyValues('chapterStatus')) === JSON.stringify(STATUS_ORDER), 'chapterStatus mirrors STATUS_ORDER');
assert(vocabularyLabel('chapterStatus', 'draft') === STATUS_LABEL.draft, 'chapter labels mirror STATUS_LABEL');

section('StatusBadge — escaped output, dot variant, data hooks');
const chip = StatusBadgeRender({ domain: 'sceneStatus', value: 'needs-work' });
assert(chip.includes('status-badge'), 'chip has its class');
assert(chip.includes('data-domain="sceneStatus"'), 'data-domain hook');
assert(chip.includes('data-value="needs-work"'), 'data-value hook');
assert(chip.includes('>Needs work<'), 'humanized label rendered');
const sneaky = StatusBadgeRender({ domain: 'chapterStatus', value: '"><script>alert(1)</script>' });
assert(!sneaky.includes('<script>'), 'value is escaped inside the badge');
assert(sneaky.includes('&quot;&gt;&lt;script&gt;'), 'escaping actually encoded the angle brackets');
const dot = StatusBadgeRender({ domain: 'chapterStatus', value: 'final', variant: 'dot' });
assert(dot.includes('status-dot dot-final'), 'dot variant reproduces sidebar shape');
assert(dot.includes('>Final<'), 'dot variant carries the label');

console.log(`\nvocabulary.smoketest: ${pass} passed, ${fail} failed${fail ? '' : ' — all green.'}.`);
if (fail) process.exit(1);
