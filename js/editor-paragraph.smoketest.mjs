// v0.3 — smoketest for Format.renderEditorParagraph.
//
// Verifies the Typora-style editor rendering:
//   1. Bold/italic/underline render as <strong>/<em>/<u>
//   2. {{u:text}} underline token is recognized and rendered
//   3. {{color:text}} still works (didn't regress when underline was added)
//   4. [[mention]] renders as a chip with invisible-bracket structure
//      (mention-chip > mention-bracket + mention-chip-name + mention-bracket)
//   5. Resolved mentions get mention-chip-resolved, unresolved get
//      mention-chip-unresolved, based on the mentionResolver callback
//   6. {{img:id}} with no image in the map shows the "image unavailable"
//      placeholder (verified indirectly via the missing-image class)
//   7. Inline image with a real URL renders an <img> inside a <figure>
//   8. The mention's data-mention-name attribute holds the trimmed name
//      (so the editor's click handler can look it up)
//   9. Format markers inside a mention name are rendered (e.g.
//      [[**bold name**]] — the chip shows the name as bold)
//
// Node-side — renderEditorParagraph is pure (no DOM, no Store).

import { renderEditorParagraph, toggleUnderline, UNDERLINE_TOKEN_PATTERN } from './format.js';

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.error(`  ✗ ${name}${detail ? ` (${detail})` : ''}`); }
}
function section(t) { console.log(`\n${t}`); }

section('renderEditorParagraph — bold/italic/underline');
ok('bold renders as <strong>',
  renderEditorParagraph('**bold**').includes('<strong>bold</strong>'));
ok('italic renders as <em>',
  renderEditorParagraph('*italic*').includes('<em>italic</em>'));
ok('underline token {{u:text}} renders as <u>',
  renderEditorParagraph('{{u:underlined}}').includes('<u>underlined</u>'));
ok('all three in one paragraph render together',
  renderEditorParagraph('**b** *i* {{u:u}}').includes('<strong>b</strong>') &&
  renderEditorParagraph('**b** *i* {{u:u}}').includes('<em>i</em>') &&
  renderEditorParagraph('**b** *i* {{u:u}}').includes('<u>u</u>'));

section('toggleUnderline — wrap and unwrap');
const tu1 = toggleUnderline('hello world', 0, 5);
ok('toggleUnderline wraps "hello" in {{u:hello}}',
  tu1.text === '{{u:hello}} world' && tu1.selStart === 4 && tu1.selEnd === 9,
  `got: ${tu1.text} ${tu1.selStart}-${tu1.selEnd}`);
const tu2 = toggleUnderline('{{u:hello}} world', 4, 9);
ok('toggleUnderline unwraps when selection is inside {{u:...}}',
  tu2.text === 'hello world' && tu2.selStart === 0 && tu2.selEnd === 5,
  `got: ${tu2.text} ${tu2.selStart}-${tu2.selEnd}`);
const tu3 = toggleUnderline('plain', 0, 0);
ok('toggleUnderline with no selection lands cursor between markers',
  tu3.text === '{{u:}}plain' && tu3.selStart === 4 && tu3.selEnd === 4,
  `got: ${tu3.text} ${tu3.selStart}-${tu3.selEnd}`);

section('UNDERLINE_TOKEN_PATTERN — regex shape');
ok('UNDERLINE_TOKEN_PATTERN matches {{u:text}}',
  UNDERLINE_TOKEN_PATTERN.test('{{u:hello}}'));
ok('UNDERLINE_TOKEN_PATTERN matches {{u: with spaces }}',
  /\{\{u:([^}]+?)\}\}/.test('{{u:hello world}}'));
ok('UNDERLINE_TOKEN_PATTERN does not match {{red:text}}',
  !UNDERLINE_TOKEN_PATTERN.test('{{red:hello}}'));
ok('UNDERLINE_TOKEN_PATTERN does not match {{img:id}}',
  !UNDERLINE_TOKEN_PATTERN.test('{{img:abc}}'));

section('renderEditorParagraph — mention chips');
const withMention = renderEditorParagraph('hello [[Alice]] world');
ok('mention renders inside a .mention-chip span',
  withMention.includes('class="mention-chip '));
ok('mention chip has both opening and closing .mention-bracket children',
  withMention.includes('<span class="mention-bracket">[[</span>') &&
  withMention.includes('<span class="mention-bracket">]]</span>'));
ok('mention chip name is wrapped in .mention-chip-name',
  withMention.includes('<span class="mention-chip-name">Alice</span>'));
ok('mention chip carries data-mention-name attribute with trimmed name',
  withMention.includes('data-mention-name="Alice"'));

section('renderEditorParagraph — mention resolver');
const resolved = renderEditorParagraph('[[Alice]] [[Bob]]', {
  mentionResolver: (name) => name === 'Alice' ? { id: 'e1', name: 'Alice' } : null,
});
ok('resolved mention gets mention-chip-resolved class',
  resolved.includes('class="mention-chip mention-chip-resolved"'));
ok('unresolved mention gets mention-chip-unresolved class',
  resolved.includes('class="mention-chip mention-chip-unresolved"'));

section('renderEditorParagraph — format markers inside mention name');
const boldMention = renderEditorParagraph('[[**bold name**]]');
ok('mention with bold name still wraps in chip',
  boldMention.includes('class="mention-chip '));
ok('mention with bold name renders <strong> inside the chip',
  boldMention.includes('<strong>bold name</strong>'));

section('renderEditorParagraph — image tokens');
const withMissingImg = renderEditorParagraph('text {{img:nonexistent}} more');
ok('missing image shows the fmt-image-missing placeholder',
  withMissingImg.includes('class="fmt-image-missing'));
const withRealImg = renderEditorParagraph('{{img:abc|left}}', {
  images: { abc: { url: 'blob:http://localhost/abc', caption: 'A caption' } },
});
ok('real image renders <figure class="fmt-image"> with the URL',
  withRealImg.includes('<figure class="fmt-image fmt-image-left">'));
ok('real image includes the actual <img src=...>',
  withRealImg.includes('src="blob:http://localhost/abc"'));
ok('real image caption renders as <figcaption>',
  withRealImg.includes('<figcaption>A caption</figcaption>'));

section('renderEditorParagraph — combined: mention + bold + image');
const combined = renderEditorParagraph('**bold** and [[Alice]] and {{img:x|right}}', {
  mentionResolver: () => ({ id: 'e1' }),
  images: { x: { url: 'blob:x', caption: '' } },
});
ok('combined paragraph renders all three elements',
  combined.includes('<strong>bold</strong>') &&
  combined.includes('class="mention-chip mention-chip-resolved"') &&
  combined.includes('<figure class="fmt-image fmt-image-right">'));

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail === 0 ? ' — all green.' : ''}`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
