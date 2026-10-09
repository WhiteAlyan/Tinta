// Tinta — dom-utils.js smoketest (html`` tagged template, escape, raw, toBridge).
//
// Pure logic, no DOM. The html`` helper is a string-builder, so it can
// run in node the same way the existing pure-logic smoketests do. The
// DOM-touching helpers (q/qs/qsa) aren't tested here — same convention
// as the rest of the suite (UI helpers covered by manual click-through).
// Run with: node dom-utils.smoketest.mjs

import { html, raw, toBridge, escapeHtml, escapeAttr } from './dom-utils.js';

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

// ── 1. Basic interpolation auto-escapes ─────────────────────────────────
section('basic interpolation — auto-escapes');
assertEqual(toBridge(html`hello`), 'hello', 'no interpolation, no escaping');
assertEqual(toBridge(html`hello ${'world'}`), 'hello world', 'plain string passes through');
assertEqual(toBridge(html`<b>${'a<b>c'}</b>`), '<b>a&lt;b&gt;c</b>', 'angle brackets escaped inside');
assertEqual(toBridge(html`${'<script>alert(1)</script>'}`), '&lt;script&gt;alert(1)&lt;/script&gt;', 'script tag fully escaped');
assertEqual(toBridge(html`${'a&b'}`), 'a&amp;b', 'ampersand escaped');
assertEqual(toBridge(html`attr="${'a"b'}"`), 'attr="a&quot;b"', 'quotes escaped for attribute context (text in attr context — only the " becomes &quot;)');

// ── 2. SafeHtml composition ─────────────────────────────────────────────
section('SafeHtml composition — nested html`` stays unescaped');
const inner = html`<span>${'untrusted<text>'}</span>`;
assertEqual(toBridge(inner), '<span>untrusted&lt;text&gt;</span>', 'inner built correctly');
const outer = html`<div>${inner}</div>`;
assertEqual(toBridge(outer), '<div><span>untrusted&lt;text&gt;</span></div>', 'outer wraps inner without re-escaping inner');

section('SafeHtml composition — arrays of SafeHtml joined without re-escape');
const items = [html`<li>${'a&b'}</li>`, html`<li>${'c<d'}</li>`];
assertEqual(toBridge(html`<ul>${items}</ul>`), '<ul><li>a&amp;b</li><li>c&lt;d</li></ul>', 'array of SafeHtml joined without separator');

section('SafeHtml composition — arrays of plain values all escaped');
const plain = ['a<b', 'c>d', 'e&f'];
assertEqual(toBridge(html`<ul>${plain}</ul>`), '<ul>a&lt;bc&gt;de&amp;f</ul>', 'plain array joined with no separator, each escaped');

// ── 3. null / undefined / boolean handling ───────────────────────────────
section('null/undefined/boolean handling');
assertEqual(toBridge(html`a${null}b`), 'ab', 'null → empty');
assertEqual(toBridge(html`a${undefined}b`), 'ab', 'undefined → empty');
assertEqual(toBridge(html`a${true}b`), 'ab', 'boolean true → empty (not "true")');
assertEqual(toBridge(html`a${false}b`), 'ab', 'boolean false → empty');
assertEqual(toBridge(html`a${0}b`), 'a0b', '0 → "0" (numbers do stringify, only booleans vanish)');
assertEqual(toBridge(html`a${''}b`), 'ab', 'empty string → empty');

section('arrays with null entries');
assertEqual(toBridge(html`<ul>${[null, 'a', undefined, 'b']}</ul>`), '<ul>ab</ul>', 'null/undefined entries in array disappear');

// ── 4. raw — explicit opt-out ──────────────────────────────────────────
section('raw — bypasses escaping');
assertEqual(toBridge(html`<svg>${raw('<circle r="5"/>')}</svg>`), '<svg><circle r="5"/></svg>', 'raw passes through unescaped');
assertEqual(toBridge(html`${raw('<b>trusted</b>')}`), '<b>trusted</b>', 'raw at top level');
assertEqual(toBridge(raw('<i>top</i>')), '<i>top</i>', 'raw works without html`` wrapper');

section('raw with user input is intentionally unsafe — caller responsibility');
// This is a documentation test: the contract is that raw() does NOT
// escape. If a caller passes user input through raw(), that's a bug
// at the call site, not in raw(). Verifying the behavior here so a
// future refactor that "helpfully" adds escaping to raw() gets caught.
const userInput = '<script>x</script>';
assertEqual(toBridge(html`${raw(userInput)}`), '<script>x</script>', 'raw(userInput) does NOT escape — by design');

// ── 5. toBridge defensive behavior ──────────────────────────────────────
section('toBridge — defensive against accidental plain-string passthrough');
assertEqual(toBridge('plain string'), 'plain string', 'plain string with no special chars → unchanged');
assertEqual(toBridge('<b>plain</b>'), '&lt;b&gt;plain&lt;/b&gt;', 'plain string with HTML chars → escaped (not inserted raw)');
assertEqual(toBridge(null), '', 'null → empty');
assertEqual(toBridge(undefined), '', 'undefined → empty');
assertEqual(toBridge(42), '42', 'number → escaped string of number');
assertEqual(toBridge({}), '[object Object]', 'object → its toString, escaped'); // objects pass through escapeHtml(String(x)), same as the html`` path

// ── 6. escapeHtml / escapeAttr backward-compat re-exports ──────────────
section('escapeHtml / escapeAttr — backward-compat shape');
assertEqual(escapeHtml('a&b<c>d"e\'f'), 'a&amp;b&lt;c&gt;d&quot;e&#39;f', 'escapeHtml does all 5 replaces (same shape as escapeAttr now — see html`` comment)');
assertEqual(escapeHtml(''), '', 'escapeHtml empty string');
assertEqual(escapeHtml(null), 'null', 'escapeHtml(null) → "null" (JS default param only triggers on undefined, not null — matches app.js old behavior)');
assertEqual(escapeHtml(undefined), '', 'escapeHtml(undefined) → "" (default param kicked in — matches app.js old behavior)');
assertEqual(escapeAttr('a&b<c>d"e\'f'), 'a&amp;b&lt;c&gt;d&quot;e&#39;f', 'escapeAttr does the same 5-replace as escapeHtml');
assertEqual(escapeAttr(''), '', 'escapeAttr empty string');

// ── 7. Multiple interpolations, mixed SafeHtml + plain ─────────────────
section('mixed SafeHtml + plain interpolation');
const name = 'Kade & Mira';
const tagline = 'a<><>danger';
const card = html`<div class="card"><h2>${name}</h2><p>${tagline}</p>${html`<small>${'note: x&y'}</small>`}</div>`;
assertEqual(
  toBridge(card),
  '<div class="card"><h2>Kade &amp; Mira</h2><p>a&lt;&gt;&lt;&gt;danger</p><small>note: x&amp;y</small></div>',
  'mixed plain (escaped) + SafeHtml (preserved) composes correctly'
);

// ── 8. XSS regression suite (real attack patterns) ────────────────────
section('XSS regression — common attack patterns all neutralized');
const attacks = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(1)</script>',
  "';alert(1);//",
  '<svg/onload=alert(1)>',
  'javascript:alert(1)',
  '<iframe src="javascript:alert(1)">',
  '<a href="javascript:alert(1)">click</a>',
  'data:text/html,<script>alert(1)</script>',
  '<style>*{background:url(javascript:alert(1))}</style>',
];
attacks.forEach((attack, i) => {
  // Each attack pattern, when interpolated into a html`` template,
  // must not contain a literal '<' or '>' from the attack — every
  // angle bracket has to have been replaced by &lt;/&gt;. The "quotes"
  // attack patterns also have to be neutralized in attribute context.
  const escaped = toBridge(html`<div>${attack}</div>`);
  // Strip the wrapper to check just the user-controlled portion
  const userPortion = escaped.slice('<div>'.length, -'</div>'.length);
  assert(!userPortion.includes('<'), `attack #${i} (${attack.slice(0, 30)}…) — no literal '<' after escaping`);
  assert(!userPortion.includes('>'), `attack #${i} (${attack.slice(0, 30)}…) — no literal '>' after escaping`);

  // Attribute-context check — the same attack in an attribute value
  const attrEscaped = toBridge(html`<a title="${attack}">x</a>`);
  const attrPortion = attrEscaped.match(/title="([^"]*)"/)[1];
  assert(!attrPortion.includes('"'), `attack #${i} in attr — no unescaped quote (would break out of attribute)`);
  assert(!attrPortion.includes('>'), `attack #${i} in attr — no unescaped '>' (would break out of tag)`);
});

// ── 9. Performance: large template still works ─────────────────────────
section('performance — large template builds correctly');
const many = Array.from({ length: 1000 }, (_, i) => html`<li>item ${i}: <b>${`<a&${i}>`}</b></li>`);
const big = toBridge(html`<ul>${many}</ul>`);
assert(big.startsWith('<ul><li>item 0: <b>&lt;a&amp;0&gt;</b></li>'), 'big template first item correct');
assert(big.endsWith('</ul>'), 'big template closes ul');
assert(big.length > 40000, `big template is the expected order of magnitude (~42k chars, got ${big.length})`);

// ── summary ────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}
