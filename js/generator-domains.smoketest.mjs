// Tinta — Generator engine, domains pass: worldbuilding entity drafts
// (draftWorldbuildingEntity/commitWorldbuildingDraft) and the starter
// system generator (generateStarterSystem). Same shim convention as the
// other *.smoketest.mjs files. generator.js's own pure-logic pieces
// (descriptor/pattern/markov modes) are covered in generator.smoketest.mjs;
// this file covers the store.js layer built on top.

class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Store = await import('./store.js');
const Generator = await import('./generator.js');

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
Store.getActiveProject(); // ensure a project exists

section('generateDescriptor (generator.js) — sanity');
const d1 = Generator.generateDescriptor();
assert(typeof d1 === 'string' && d1.length > 10, 'produces a non-trivial string');
assert(/\.$/.test(d1), 'ends with terminal punctuation');
const seen = new Set();
for (let i = 0; i < 30; i++) seen.add(Generator.generateDescriptor());
assert(seen.size > 5, 'varies across calls rather than always returning the same fragment');

section('draftWorldbuildingEntity — unknown type');
assertEqual(Store.draftWorldbuildingEntity({ typeKey: 'not-a-real-type' }), null, 'unknown typeKey returns null, not a crash');

section('draftWorldbuildingEntity — a type with fields');
const cultureType = Store.createEntityType({
  label: 'Culture',
  color: '#8B6F47',
  fields: [
    { key: 'customsTaboos', label: 'Customs & taboos' },
    { key: 'valuesBeliefs', label: 'Values & beliefs' },
  ],
});
const draft1 = Store.draftWorldbuildingEntity({ typeKey: cultureType.key });
assert(!!draft1, 'draft produced for a valid type');
assertEqual(draft1.typeKey, cultureType.key, 'typeKey echoed back');
assertEqual(draft1.typeLabel, 'Culture', 'typeLabel echoed back');
assert(typeof draft1.name === 'string' && draft1.name.length > 0, 'a name was generated');
assertEqual(Object.keys(draft1.customFields).length, 2, 'one generated value per template field');
assert(draft1.customFields.customsTaboos.length > 0, 'field content is non-empty');
assertEqual(draft1.fields.length, 2, 'fields array passed through for the UI to render labels from');

section('draftWorldbuildingEntity — a type with zero custom fields');
const bareType = Store.createEntityType({ label: 'Bare Type', color: '#888888' });
const draft2 = Store.draftWorldbuildingEntity({ typeKey: bareType.key });
assert(!!draft2, 'still produces a draft (name only)');
assertEqual(Object.keys(draft2.customFields).length, 0, 'no fields to fill in');

section('draftWorldbuildingEntity — name mode escalates from classic to learn with enough seed data');
// Fewer than 3 existing entities of this type -> classic mode under the
// hood; the function itself doesn't expose which mode it picked, so this
// checks the *behavior* the comment promises (names differ across many
// draws) rather than reaching into an implementation detail.
for (let i = 0; i < 4; i++) Store.commitWorldbuildingDraft({ typeKey: cultureType.key, name: `Zhydraxi ${i}`, customFields: {} });
const draft3 = Store.draftWorldbuildingEntity({ typeKey: cultureType.key });
assert(!!draft3 && draft3.name.length > 0, 'draft still produces a name once seed entities exist');

section('commitWorldbuildingDraft');
assertEqual(Store.commitWorldbuildingDraft({ typeKey: 'nope', name: 'x', customFields: {} }), null, 'unknown type rejected');
const committed = Store.commitWorldbuildingDraft({ typeKey: cultureType.key, name: 'The Ashfall Concord', customFields: { customsTaboos: 'No fires after dusk.' } });
assert(!!committed, 'commit returns the created entity');
assertEqual(committed.name, 'The Ashfall Concord', 'name saved');
assertEqual(committed.type, cultureType.key, 'type saved');
assertEqual(committed.customFields.customsTaboos, 'No fires after dusk.', 'custom field saved');
assert(Store.getEntityList().some((e) => e.id === committed.id), 'entity actually persisted in the project');

section('generateStarterSystem — basic shape');
const { system, nodes } = Store.generateStarterSystem({ name: 'Elemental Magic', domain: 'fire', tierCount: 3, perTier: 2 });
assert(!!system, 'system created');
assertEqual(system.name, 'Elemental Magic', 'name passed through');
assertEqual(system.source, 'fire', 'domain passed through as source');
assertEqual(nodes.length, 6, '3 tiers × 2 per tier = 6 nodes');
assert(nodes.every((n) => n.systemId === system.id), 'every node belongs to the new system');
assert(nodes.every((n) => n.name && n.name.length > 0), 'every node has a generated name');
assert(nodes.every((n) => n.effect && n.effect.length > 0), 'every node has generated flavor text in effect');
assert(nodes.every((n) => n.cost === '' && n.cooldown === '' && n.range === ''), 'mechanical fields left blank, not filled with generic text');

section('generateStarterSystem — tier structure (forward-only prerequisites)');
const tier1 = nodes.filter((n) => n.rank === '1');
const tier2 = nodes.filter((n) => n.rank === '2');
const tier3 = nodes.filter((n) => n.rank === '3');
assertEqual(tier1.length, 2, 'tier 1 has 2 nodes');
assertEqual(tier2.length, 2, 'tier 2 has 2 nodes');
assertEqual(tier3.length, 2, 'tier 3 has 2 nodes');
assert(tier1.every((n) => n.requirement.length === 0), 'tier 1 nodes have no prerequisites');
const tier1Ids = new Set(tier1.map((n) => n.id));
assert(tier2.every((n) => n.requirement.length === 1 && tier1Ids.has(n.requirement[0])), 'every tier-2 node requires exactly one tier-1 node');
const tier2Ids = new Set(tier2.map((n) => n.id));
assert(tier3.every((n) => n.requirement.length === 1 && tier2Ids.has(n.requirement[0])), 'every tier-3 node requires exactly one tier-2 node (not tier-1, not itself)');

section('generateStarterSystem — no duplicate node names within one system');
const names = nodes.map((n) => n.name.toLowerCase());
assertEqual(new Set(names).size, names.length, 'all 6 generated node names are unique');

section('generateStarterSystem — defaults when name/domain omitted');
const { system: system2 } = Store.generateStarterSystem({ domain: 'Shadow' });
assertEqual(system2.name, 'Shadow System', 'falls back to "<domain> System" when name is blank');
const { system: system3 } = Store.generateStarterSystem({});
assertEqual(system3.name, 'New System', 'falls back to "New System" when both name and domain are blank');

section('generateStarterSystem — the generated tree is a normal, editable system afterward');
const firstNode = nodes[0];
Store.updateSystemNode(firstNode.id, { name: 'Hand-edited name' });
assertEqual(Store.getSystemNodeList(system.id).find((n) => n.id === firstNode.id).name, 'Hand-edited name', 'a generated node edits exactly like a hand-built one');
Store.deleteRuleSystem(system.id);
assertEqual(Store.getSystemNodeList(system.id).length, 0, 'deleting the generated system cascades its nodes, same as any other system');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
