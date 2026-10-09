// Tinta — empty-state helper smoketest (0.2.6 Pass 5).
//
// Run with: node emptyState.smoketest.mjs
//
// v0.2.9 — EmptyState now returns a SafeHtml object (via raw()) instead
// of a plain string, so it can be interpolated into html`` templates
// without being escaped. The smoketest uses toBridge() to convert the
// SafeHtml back to a string for assertion.

import { EmptyState } from './emptyState.js';
import { toBridge } from './dom-utils.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${msg}`); }
}

// Helper — convert SafeHtml to string for comparison
function asStr(safeHtml) {
  return toBridge(safeHtml);
}

// Byte-for-byte compatibility with the existing `.empty-note` paragraphs
// is the whole point of the default shape — pin it.
assert(
  asStr(EmptyState({ text: 'No references yet.' })) === '<p class="empty-note">No references yet.</p>',
  'default shape matches the established .empty-note paragraph exactly'
);

assert(
  asStr(EmptyState({ icon: '·', text: 'Nothing here.' })).startsWith('<p class="empty-note"><span class="empty-state-icon">·</span> '),
  'icon renders as a prefixed span'
);

const sneaky = asStr(EmptyState({ text: '<script>alert(1)</script>' }));
assert(!sneaky.includes('<script>'), 'text is escaped (script tags cannot survive)');
assert(sneaky.includes('&lt;script&gt;'), 'escaping encoded the angle brackets');

const withAction = asStr(EmptyState({
  text: 'No maps yet.',
  actionLabel: 'Create one',
  actionAttrs: 'data-action="create-map"',
}));
assert(withAction.includes('<button class="empty-state-action" data-action="create-map">Create one</button>'), 'action button renders with attrs');
assert(withAction.includes('No maps yet.'), 'action text precedes button');

const customClass = asStr(EmptyState({ text: 'Custom.', className: 'my-empty' }));
assert(customClass === '<p class="my-empty">Custom.</p>', 'custom className works');

const empty = asStr(EmptyState());
assert(empty === '<p class="empty-note"></p>', 'no args produces an empty .empty-note paragraph');

// v0.2.9 — verify the return value is a SafeHtml object (truthy .value
// property), not a plain string. This is what lets it be interpolated
// into html`` templates without escaping.
const safeHtml = EmptyState({ text: 'test' });
assert(safeHtml && typeof safeHtml === 'object' && typeof safeHtml.value === 'string', 'returns a SafeHtml object (not a plain string)');

console.log(`\nemptyState.smoketest: ${pass} passed, ${fail} failed${fail === 0 ? ' — all green.' : ''}`);
if (fail > 0) process.exit(1);
