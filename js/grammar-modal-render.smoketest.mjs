// Tinta — grammar results modal render smoketest (code review P0 3.1 pin).
//
// Purpose: grammarModal.js's results modal was doubly broken and no
// smoketest noticed. It called escapeHtml()/escapeAttr() six times without
// importing them (ReferenceError the moment a check returned results —
// swallowed, because the caller is async), and it built its body as a
// plain string that grammarModalShell routed through toBridge(), which
// would have escaped the entire panel into visible source text even after
// the import was fixed. The render function is now rebuilt on the html``
// tagged template and exported (same convention as historyModals.js's
// renderSnapshotListPane), so this test can pin the whole contract:
//   1. rendering actually happens (no ReferenceError) and produces real
//      markup, not escaped-into-text source;
//   2. checker-supplied strings (category, message, replacement chips) and
//      match ids — all attacker-controlled through a malicious .tinta
//      package or a hostile "custom endpoint" response — are escaped
//      exactly once;
//   3. the <mark class="grammar-flag"> context highlight stays a real tag
//      while the prose around it is escaped.
//
// Same minimal-shim convention as modal.smoketest.mjs (purpose-built DOM
// stubs) and craft-tools.smoketest.mjs (in-memory localStorage for the
// store.js import). Run with: node grammar-modal-render.smoketest.mjs

// ── localStorage shim (store.js is imported by grammarModal.js) ─────────
class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

// ── minimal window/document shims (import-time surface of tts.js et al) ──
const noop = () => {};
globalThis.window = globalThis;
window.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop, media: '' });
window.getComputedStyle = () => ({ getPropertyValue: () => '' });
window.addEventListener = noop;
window.removeEventListener = noop;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, userAgent: 'node', language: 'en' },
  writable: true,
  configurable: true,
});

// ── DOM shim: capture #modal-root's innerHTML; the results modal binds
// grammar-recheck / grammar-settings-link by id right after render, so
// unknown ids get a listener-accepting stub. querySelectorAll returns []
// (dismiss/ignore/chip wiring finds nothing to bind — fine here). ────────
let rootInnerHTML = '';
const modalRootEl = {
  get innerHTML() { return rootInnerHTML; },
  set innerHTML(v) { rootInnerHTML = v; },
  querySelector(sel) { return rootInnerHTML.includes(sel.slice(1)) ? { tagName: 'DIV' } : null; },
  querySelectorAll() { return []; },
};
const bindStub = { addEventListener() {}, removeEventListener() {} };
globalThis.document = {
  getElementById(id) {
    if (id === 'modal-root') return modalRootEl;
    return bindStub;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop, remove: noop, setAttribute: noop }),
};

const { renderGrammarResultsModal } = await import('./grammarModal.js');

// ── test harness (same shape as every other smoketest) ──────────────────
let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function section(title) { console.log(`\n${title}`); }

// ── fixtures ─────────────────────────────────────────────────────────────
// Chapter content: 'In the beggining Elena walked <b>north</b>, past the old mill.'
//   - 'beggining' at offset 7, length 9 (match A)
//   - 'north' at offset 33, length 5, inside a literal <b> tag in the
//     prose — exercises the escaped-context + real-<mark> path (match B)
const chapter = {
  id: 'ch_review_pin',
  title: 'Chapter One',
  content: 'In the beggining Elena walked <b>north</b>, past the old mill.',
};

const matchA = {
  id: 'lt_7_9_0',
  offset: 7,
  length: 9,
  // Hostile "custom endpoint" response — every string below is
  // attacker-controlled when the checker URL points anywhere the writer
  // didn't vet, and the same strings ride in through a malicious .tinta
  // package (style-guide rules are preserved verbatim on import).
  category: '<img src=x onerror=alert(1)>',
  shortMessage: '<script>alert(2)</script>',
  replacements: ['beginning', '"><svg onload=alert(3)>'],
};
const matchB = {
  // Raw-endpoint-supplied ids are attacker-controlled too (S-2's class):
  // the old template interpolated the id unescaped into data-match.
  id: 'evil"><img src=y onerror=alert(4)>',
  offset: 33,
  length: 5,
  category: 'Typo',
  shortMessage: 'Spelling mistake',
  replacements: [],
};

// ── 1. The render itself — the P0 crash, pinned ─────────────────────────
section('results modal renders real markup (was: ReferenceError before anything showed)');
renderGrammarResultsModal(chapter, [matchA, matchB]);
assert(rootInnerHTML.includes('grammar-modal'), 'modal shell rendered with the grammar-modal class');
assert(rootInnerHTML.includes('<div class="grammar-match-card"'), 'match cards render as real markup');
assert(!rootInnerHTML.includes('&lt;div'), 'body NOT escaped-into-text (the second stacked bug: plain-string body through toBridge)');
assert(rootInnerHTML.includes('2 items found'), 'header counts two matches');
assert(rootInnerHTML.includes('id="grammar-recheck"') && rootInnerHTML.includes('id="grammar-settings-link"'), 'header action buttons present');

// ── 2. Checker/package-supplied strings escape exactly once ─────────────
section('hostile category / message / replacement strings escape exactly once');
assert(!rootInnerHTML.includes('<img src=x') && !rootInnerHTML.includes('<img src=y'), 'no <img> tag from category or id ever lands unescaped');
assert(rootInnerHTML.includes('&lt;img src=x'), 'hostile category appears as escaped text');
assert(!rootInnerHTML.includes('<script>'), 'no <script> from shortMessage lands unescaped');
assert(rootInnerHTML.includes('&lt;script&gt;alert(2)&lt;/script&gt;'), 'hostile message appears as escaped text');
assert(!rootInnerHTML.includes('<svg'), 'no <svg> from a replacement value lands unescaped');
assert(rootInnerHTML.includes('data-value="&quot;&gt;&lt;svg onload=alert(3)&gt;"'), 'hostile replacement escapes INSIDE the data-value attribute (no attribute breakout)');
assert(rootInnerHTML.includes('>beginning</button>'), 'benign replacement chip label renders');
assert(rootInnerHTML.includes('data-match="evil&quot;&gt;&lt;img'), 'hostile match id escapes INSIDE data-match (no attribute breakout)');
assert(!rootInnerHTML.includes('onerror=alert(1)') || rootInnerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'), 'handlers only ever reachable as inert escaped text');

// ── 3. Context highlight: real <mark>, escaped prose around it ──────────
// The before-segment regression pin: a first draft of the html`` rebuild
// dropped ${before} from the template (ESLint's unused-var warning caught
// it) — context showed only the text AFTER the flagged word. This asserts
// the full assembly: leading ellipsis, before-text, mark, after-text.
section('context highlight keeps the real <mark> tag while escaping surrounding prose');
assert(rootInnerHTML.includes('<mark class="grammar-flag">north</mark>'), 'flagged word wrapped in a real grammar-flag <mark>');
assert(rootInnerHTML.includes('In the beggining Elena walked &lt;b&gt;<mark class="grammar-flag">north</mark>'), 'text BEFORE the flagged word renders (escaped), immediately before the mark');
assert(rootInnerHTML.includes('</mark>&lt;/b&gt;, past the old mill.'), 'text AFTER the flagged word renders (escaped) — no trailing ellipsis at end of content');
assert(rootInnerHTML.includes('&lt;b&gt;'), 'literal <b> tag in the prose is escaped around the highlight');
assert(rootInnerHTML.includes('grammar-match-context'), 'context paragraph present');

// ── 4. Empty result set ──────────────────────────────────────────────────
section('zero matches renders the clean empty state, no cards');
renderGrammarResultsModal(chapter, []);
assert(rootInnerHTML.includes('No issues found') && rootInnerHTML.includes('Nothing flagged, nice and clean.'), 'empty state copy renders');
assert(!rootInnerHTML.includes('grammar-match-card'), 'no match cards on the empty path');

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}
