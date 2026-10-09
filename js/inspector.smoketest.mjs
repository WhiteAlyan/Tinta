// Tinta — Navigation/Context pass smoke test (universal contextual inspector).
//
// Covers the store-side helper added by this pass — getDependentNodes() —
// plus a contract test for the openContextDrawer dispatcher's kind/payload
// routing (pure-logic only; the DOM open functions themselves aren't
// callable in node, same convention every other pass's smoketest follows).
// Run with: node inspector.smoketest.mjs

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

// ── 1. getDependentNodes — basic shape ──────────────────────────────────
section('getDependentNodes — empty for an unknown node id');
assertEqual(Store.getDependentNodes('does-not-exist').length, 0, 'unknown node id returns empty');

section('getDependentNodes — empty for a node nothing depends on');
const sys = Store.createRuleSystem({ name: 'Elemental Magic' });
const root = Store.createSystemNode({ systemId: sys.id, name: 'Spark' });
assertEqual(Store.getDependentNodes(root.id).length, 0, 'root node has no dependents');

section('getDependentNodes — returns the node that directly requires this one');
const child = Store.createSystemNode({ systemId: sys.id, name: 'Fireball', requirement: [root.id] });
const grandchild = Store.createSystemNode({ systemId: sys.id, name: 'Meteor', requirement: [child.id] });
const depsOfRoot = Store.getDependentNodes(root.id);
assertEqual(depsOfRoot.length, 1, 'exactly one direct dependent of root');
assertEqual(depsOfRoot[0].id, child.id, "root's dependent is Fireball (not Meteor — direct only)");

const depsOfChild = Store.getDependentNodes(child.id);
assertEqual(depsOfChild.length, 1, 'exactly one direct dependent of Fireball');
assertEqual(depsOfChild[0].id, grandchild.id, "Fireball's dependent is Meteor");

section('getDependentNodes — returns multiple when several nodes require this one');
const branch2 = Store.createSystemNode({ systemId: sys.id, name: 'Fire Wall', requirement: [root.id] });
const branch3 = Store.createSystemNode({ systemId: sys.id, name: 'Flame Strike', requirement: [root.id] });
const depsOfRootNow = Store.getDependentNodes(root.id);
assertEqual(depsOfRootNow.length, 3, 'three direct dependents after adding Fire Wall + Flame Strike');
const depNames = depsOfRootNow.map((n) => n.name).sort();
assertEqual(depNames.join(','), 'Fire Wall,Fireball,Flame Strike', 'three dependents sorted by name');

section('getDependentNodes — does not include the node itself');
const depsOfGrandchild = Store.getDependentNodes(grandchild.id);
assertEqual(depsOfGrandchild.length, 0, "Meteor has no dependents and isn't in its own list");

section('getDependentNodes — scoped to the same system (cross-system reqs are not in the data model)');
// Create a second system and a node in it. Even if its requirement array
// somehow held an id from sys (which createSystemNode won't allow in
// practice — systemId is set on create and never changed), the helper
// filters by node.systemId === parent.systemId, so a node from a
// different system would not appear in this one's dependent list.
const sys2 = Store.createRuleSystem({ name: 'Sword Skills' });
const slash = Store.createSystemNode({ systemId: sys2.id, name: 'Slash' });
const depsOfRootAcrossSystems = Store.getDependentNodes(root.id);
assertEqual(depsOfRootAcrossSystems.length, 3, 'no cross-system pollution — Slash is in a different system');
assert(!depsOfRootAcrossSystems.find((n) => n.id === slash.id), 'slash from sys2 is not in root (sys) dependent list');

section('getDependentNodes — reflects a deleted dependent');
Store.deleteSystemNode(branch2.id);
const depsAfterDelete = Store.getDependentNodes(root.id);
assertEqual(depsAfterDelete.length, 2, 'Fire Wall removed → 2 direct dependents remain');
assert(!depsAfterDelete.find((n) => n.id === branch2.id), "Fire Wall's id no longer in the list");

// ── 2. getDependentNodes — does not save ────────────────────────────────
section('getDependentNodes — pure read, does not mutate');
const beforeJson = JSON.stringify(Store.getActiveProject());
Store.getDependentNodes(root.id);
Store.getDependentNodes(child.id);
Store.getDependentNodes('unknown-id');
const afterJson = JSON.stringify(Store.getActiveProject());
assertEqual(beforeJson, afterJson, 'project JSON identical before/after three getDependentNodes calls');

// ── 3. openContextDrawer dispatcher routing contract ───────────────────
// The dispatcher lives in drawer.js and routes kind → open* function.
// drawer.js imports app.js (circular import — see app.js:34-42), and
// app.js's top-level code touches the DOM at module load (it's a
// browser-only module). So we can't import drawer.js directly in node
// without a DOM. Instead, we test the routing contract against the
// function's source — verifying the case statement maps each kind to
// the right function name and the right payload shape.
//
// This is a *contract* test, not a runtime test. It catches regressions
// like "someone added a new kind but forgot the case", "someone
// renamed a payload field", "someone swapped two cases". Runtime
// behavior is verified manually by opening each drawer kind in the
// browser, same as the existing entity/scene drawers have always been.

section('openContextDrawer routing contract — source-verified');
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const drawerSrc = readFileSync(join(__dirname, 'drawer.js'), 'utf8');

// The dispatcher must handle these six kinds — one per open function
// the pass added or already had.
const expectedKinds = ['entity', 'scene', 'reference', 'ruleNode', 'mapMarker', 'timelineEvent'];
for (const kind of expectedKinds) {
  const caseRegex = new RegExp(`case\\s+'${kind}'\\s*:`);
  assert(caseRegex.test(drawerSrc), `dispatcher has a case for kind "${kind}"`);
}

// Each kind must dispatch to an open function with a known name and
// accept the right payload fields.
const routing = [
  { kind: 'entity', fnName: 'openEntityDrawer', payloadFields: ['entityId'] },
  { kind: 'scene', fnName: 'openSceneInspector', payloadFields: ['chapterId', 'sceneId'] },
  { kind: 'reference', fnName: 'openReferenceDrawer', payloadFields: ['referenceId'] },
  { kind: 'ruleNode', fnName: 'openRuleNodeDrawer', payloadFields: ['systemId', 'nodeId'] },
  { kind: 'mapMarker', fnName: 'openMapMarkerDrawer', payloadFields: ['mapId', 'markerId'] },
  { kind: 'timelineEvent', fnName: 'openTimelineEventDrawer', payloadFields: ['eventId'] },
];
for (const { kind, fnName, payloadFields } of routing) {
  // The case body must call fnName(...)
  const callRegex = new RegExp(`case\\s+'${kind}'\\s*:[\\s\\S]*?return\\s+${fnName}\\(`);
  assert(callRegex.test(drawerSrc), `case "${kind}" returns ${fnName}(...)`);
  // Each payload field must be referenced as `payload.<field>` somewhere
  // in the dispatcher's case body for this kind.
  for (const field of payloadFields) {
    const fieldRegex = new RegExp(`case\\s+'${kind}'\\s*:[\\s\\S]*?payload\\.${field}`);
    assert(fieldRegex.test(drawerSrc), `case "${kind}" references payload.${field}`);
  }
  // The open function itself must be exported.
  const exportRegex = new RegExp(`export\\s+function\\s+${fnName}\\s*\\(`);
  assert(exportRegex.test(drawerSrc), `${fnName} is exported from drawer.js`);
}

section('openContextDrawer — default case returns null for unknown kind');
// The dispatcher's default must return null (not throw, not undefined)
// so a future call site that passes a stale kind from a saved layout or
// similar doesn't crash — just silently no-ops.
const defaultRegex = /default:\s*return\s+null\s*;/;
assert(defaultRegex.test(drawerSrc), 'dispatcher default returns null');

// ── summary ────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}
