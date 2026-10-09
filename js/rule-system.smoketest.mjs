// Tinta — Rule-System foundation (Tier 7 pass) smoke test.
// Covers both ruleSystem.js's pure graph logic (cycle detection,
// prerequisite ordering) and store.js's CRUD/cascade-delete/validation
// wired on top of it. Run with: node rule-system.smoketest.mjs

class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Store = await import('./store.js');
const RuleSystem = await import('./ruleSystem.js');

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
Store.getActiveProject();

// ── pure graph logic (no Store) ─────────────────────────────────────────
section('wouldCreateCycle — pure logic, plain fixtures');
{
  const nodes = [
    { id: 'a', requirement: [] },
    { id: 'b', requirement: ['a'] },
    { id: 'c', requirement: ['b'] },
  ];
  assertEqual(RuleSystem.wouldCreateCycle(nodes, 'a', []), false, 'no requirement change is never a cycle');
  assertEqual(RuleSystem.wouldCreateCycle(nodes, 'a', ['c']), true, 'direct-back cycle detected (a would require c, which already requires b, which requires a)');
  assertEqual(RuleSystem.wouldCreateCycle(nodes, 'a', ['b']), true, 'a requiring b (which requires a transitively once a also requires it) is a self-cycle at the root — a cannot require anything that (transitively) requires a');
  assertEqual(RuleSystem.wouldCreateCycle(nodes, 'c', ['a']), false, 'c requiring a directly is fine — a has no requirements, no cycle');
  assertEqual(RuleSystem.wouldCreateCycle(nodes, 'b', ['b']), true, 'a node cannot require itself');
  assertEqual(RuleSystem.wouldCreateCycle(nodes, 'a', ['zzz-not-a-real-node']), false, 'a dangling/unknown requirement id is a dead end, not a crash or false-positive cycle');
}

section('orderByPrerequisite — pure logic');
{
  const nodes = [
    { id: 'fireball', requirement: ['firebolt'] },
    { id: 'firebolt', requirement: [] },
    { id: 'inferno', requirement: ['fireball'] },
  ];
  const ordered = RuleSystem.orderByPrerequisite(nodes);
  const idx = (id) => ordered.findIndex((n) => n.id === id);
  assert(idx('firebolt') < idx('fireball'), 'firebolt (no prereqs) sorts before fireball (requires firebolt)');
  assert(idx('fireball') < idx('inferno'), 'fireball sorts before inferno (requires fireball)');
  assertEqual(ordered.length, 3, 'no nodes lost in ordering');
}

// ── store.js CRUD + validation ──────────────────────────────────────────
section('createRuleSystem / getRuleSystemList');
const magic = Store.createRuleSystem({ name: 'Elemental Magic', source: 'The Ley Lines', resource: 'Mana', channel: 'Somatic gestures' });
assert(!!magic && !!magic.id, 'createRuleSystem returns the new record');
assertEqual(Store.getRuleSystemList().length, 1, 'the new system shows up in the list');
assertEqual(Store.getRuleSystem(magic.id).source, 'The Ley Lines', 'framing fields are stored as given');

section('createSystemNode — basic + missing systemId');
const firebolt = Store.createSystemNode({ systemId: magic.id, name: 'Firebolt', category: 'Elemental', cost: '5 Mana' });
assert(!!firebolt && !!firebolt.id, 'createSystemNode returns the new node');
assertEqual(firebolt.requirement.length, 0, 'a node with no requirement starts with an empty array, not undefined');
const orphanAttempt = Store.createSystemNode({ systemId: 'not-a-real-system', name: 'x' });
assertEqual(orphanAttempt, null, 'createSystemNode with an unknown systemId returns null rather than creating a dangling node');

section('updateSystemNode — valid prerequisite chain');
const fireball = Store.createSystemNode({ systemId: magic.id, name: 'Fireball', requirement: [firebolt.id] });
assertEqual(fireball.requirement[0], firebolt.id, 'requirement is stored on create');
const inferno = Store.createSystemNode({ systemId: magic.id, name: 'Inferno' });
const updated = Store.updateSystemNode(inferno.id, { requirement: [fireball.id] });
assert(!!updated, 'a valid (acyclic) requirement update succeeds');
assertEqual(updated.requirement[0], fireball.id, 'the requirement is applied');

section('updateSystemNode — cycle rejected');
const cycleAttempt = Store.updateSystemNode(firebolt.id, { requirement: [inferno.id] });
assertEqual(cycleAttempt, null, 'firebolt <- inferno would close a cycle (firebolt <- fireball <- inferno already) and is rejected');
assertEqual(Store.getSystemNode(firebolt.id).requirement.length, 0, 'the rejected update did not partially apply — firebolt still has no requirement');

section('updateSystemNode — self-requirement silently dropped, not rejected wholesale');
const selfRefResult = Store.updateSystemNode(firebolt.id, { requirement: [firebolt.id], cost: '6 Mana' });
assert(!!selfRefResult, 'a patch containing a self-reference still succeeds for its other fields');
assertEqual(selfRefResult.requirement.length, 0, 'the self-reference itself is silently dropped, not stored');
assertEqual(selfRefResult.cost, '6 Mana', 'the rest of the patch (cost) still applied');

section('updateSystemNode — evolvesInto self-reference rejected');
const evoAttempt = Store.updateSystemNode(fireball.id, { evolvesInto: fireball.id });
assertEqual(evoAttempt, null, 'a node cannot evolve into itself');

section('getSystemNodeList — ordered by prerequisite, scoped to one system');
{
  const otherSystem = Store.createRuleSystem({ name: 'Cyberware' });
  Store.createSystemNode({ systemId: otherSystem.id, name: 'Optic implant' });
  const list = Store.getSystemNodeList(magic.id);
  assertEqual(list.length, 3, 'only this system\'s nodes are returned (firebolt, fireball, inferno) — not Cyberware\'s');
  const idx = (id) => list.findIndex((n) => n.id === id);
  assert(idx(firebolt.id) < idx(fireball.id), 'firebolt sorts before fireball in the real store-backed list too');
}

section('deleteSystemNode — cascade orphans references, keeps sibling nodes');
{
  Store.deleteSystemNode(firebolt.id);
  assertEqual(Store.getSystemNode(firebolt.id), null, 'the deleted node is gone');
  const survivingFireball = Store.getSystemNode(fireball.id);
  assert(!!survivingFireball, 'fireball itself survives firebolt\'s deletion');
  assertEqual(survivingFireball.requirement.length, 0, 'fireball\'s requirement pointing at the deleted firebolt is cleaned up, not left dangling');
}

section('deleteRuleSystem — cascades to every node in that system');
{
  const doomed = Store.createRuleSystem({ name: 'Doomed system' });
  const n1 = Store.createSystemNode({ systemId: doomed.id, name: 'a' });
  const n2 = Store.createSystemNode({ systemId: doomed.id, name: 'b', requirement: [n1.id] });
  Store.deleteRuleSystem(doomed.id);
  assertEqual(Store.getRuleSystem(doomed.id), null, 'the system itself is gone');
  assertEqual(Store.getSystemNode(n1.id), null, 'its nodes are gone too');
  assertEqual(Store.getSystemNode(n2.id), null, 'including nodes that referenced each other within the doomed system');
  assert(!!Store.getRuleSystem(magic.id), 'an unrelated system (Elemental Magic) is untouched');
}

section('Migration — importing a pre-pass backup backfills ruleSystems/systemNodes');
{
  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  delete legacyDb.projects[legacyProjectId].ruleSystems;
  delete legacyDb.projects[legacyProjectId].systemNodes;
  Store.importFullBackup(JSON.stringify(legacyDb));
  const healed = Store.getActiveProject();
  assert(healed.ruleSystems && typeof healed.ruleSystems === 'object', 'importing a backup missing `ruleSystems` backfills it to {} rather than throwing');
  assert(healed.systemNodes && typeof healed.systemNodes === 'object', 'importing a backup missing `systemNodes` backfills it to {} rather than throwing');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
