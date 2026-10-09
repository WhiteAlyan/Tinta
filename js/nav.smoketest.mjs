// Auto-compact fallback pass — contract tests for nav.js's style decision.
//
// The fallback has two halves: a pure decision (effectiveNavStyle) and a
// layout measurement (groupedOverflows, inherently browser-bound — a
// getBoundingClientRect call can't run against a Node shim honestly). This
// file pins the pure half so the contract can't silently drift: an explicit
// user choice of 'compact' always wins, and measurement only ever
// DOWNGRADES 'grouped' to compact — it can never upgrade a user's explicit
// compact choice back to grouped. The nav-sweep Playwright spec
// (tests/03-view-navigation.spec.js) covers the painted half end-to-end at
// real viewport sizes.
//
// Same module-load pattern as module-load.smoketest.mjs: a minimal DOM shim
// so the module imports cleanly (nav.js attaches no listeners at import
// time, but dom-utils.js touches document at call time only — the shim is
// belt-and-suspenders so this file stays loadable if that ever changes).

class ElementShim {
  constructor(tag = 'div') { this.tagName = tag; this.style = {}; }
  setAttribute() {}
  addEventListener() {}
  removeEventListener() {}
  appendChild() {}
  remove() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }; }
}

globalThis.document = {
  createElement: (tag) => new ElementShim(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
  body: new ElementShim('body'),
  documentElement: new ElementShim('html'),
};
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
};

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  if (actual === expected) {
    pass++;
    console.log(`  ok — ${label}`);
  } else {
    fail++;
    console.error(`  FAIL — ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const { effectiveNavStyle, NAV_GROUPS, attachNavTabs } = await import('./nav.js');

console.log('effectiveNavStyle — explicit user choice of compact always wins');
assertEqual(effectiveNavStyle('compact', true), 'compact', 'compact + fits → compact (measurement cannot upgrade)');
assertEqual(effectiveNavStyle('compact', false), 'compact', 'compact + clipped → still compact');

console.log('effectiveNavStyle — grouped is "grouped when it fits"');
assertEqual(effectiveNavStyle('grouped', true), 'grouped', 'grouped + fits → grouped');
assertEqual(effectiveNavStyle('grouped', false), 'compact', 'grouped + clipped → falls back to compact');

console.log('effectiveNavStyle — unknown/missing preference behaves as grouped');
assertEqual(effectiveNavStyle(undefined, true), 'grouped', 'undefined + fits → grouped (grouped is the default)');
assertEqual(effectiveNavStyle(undefined, false), 'compact', 'undefined + clipped → falls back to compact');

console.log('attachNavTabs — wiring contract unchanged');
assertEqual(typeof attachNavTabs, 'function', 'attachNavTabs is still exported and callable');

console.log('NAV_GROUPS — single source of truth stays well-formed');
const keys = NAV_GROUPS.map((g) => g.key);
assertEqual(new Set(keys).size, keys.length, 'group keys are unique');
assertEqual(keys.every(Boolean) && keys.every((k) => typeof k === 'string'), true, 'group keys are non-empty strings');
const viewIds = NAV_GROUPS.flatMap((g) => g.views.map((v) => v.id));
assertEqual(new Set(viewIds).size, viewIds.length, 'view ids are unique across groups (a view in two groups would fight over active state)');
assertEqual(viewIds.every((id) => typeof id === 'string' && id.length > 0), true, 'every view has a non-empty id');
assertEqual(NAV_GROUPS.every((g) => g.views.length > 0), true, 'no empty groups (a collapsed button that opens nothing)');

console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) process.exit(1);
