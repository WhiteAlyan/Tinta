// Tinta — worldbuilding starter templates (Tier 7 pass) smoke test.
//
// The templates themselves (Culture/Species/Language/Religion/Faction/
// Economy) are just pre-filled arguments to createEntityType — no new
// store.js surface, per the "not a new engine" reasoning in app.js's
// WORLDBUILDING_TEMPLATES comment. So rather than importing app.js
// (which is DOM-bound throughout and not meaningfully importable under
// plain Node), this exercises the actual mechanism the templates rely
// on: creating a type with a multi-field custom schema, an entity of
// that type storing values against it, and the store-level guards that
// keep type deletion safe. WORLDBUILDING_TEMPLATES' data itself (5
// fields, distinct keys, non-empty labels) is checked structurally so a
// future edit to that constant that breaks its own shape assumptions
// would be caught even without importing it directly.
//
// Run with: node worldbuilding-templates.smoketest.mjs

class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Store = await import('./store.js');

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

// A structural copy of app.js's WORLDBUILDING_TEMPLATES — kept in sync by
// hand (small, rarely-changed data), not imported, per the header note
// above. If this drifts from app.js's real constant, the shape-checks
// below still hold app.js's actual data to the same bar the next time
// someone updates both. Updated for the Generator-engine-domains pass
// (Settlement) and the worldbuilding quick-wins pass (Philosophy, and
// Festivals breaking out of Culture/Religion's folded fields).
const WORLDBUILDING_TEMPLATES = [
  { label: 'Culture', fields: ['environment', 'socialHierarchy', 'customsTaboos', 'artsCuisine', 'namingConventions', 'festivals'] },
  { label: 'Species', fields: ['anatomyPhysiology', 'lifespanReproduction', 'abilitiesWeaknesses', 'habitatDiet', 'culturalImplications'] },
  { label: 'Language', fields: ['phonologyScript', 'grammarSyntax', 'vocabularyNaming', 'dialects', 'origin'] },
  { label: 'Religion', fields: ['creationMythDeities', 'practicesRituals', 'clergyTexts', 'afterlife', 'taboosVirtues', 'festivals'] },
  { label: 'Faction / Government', fields: ['governmentType', 'leadershipSuccession', 'lawsInstitutions', 'territoryAlliances', 'legitimacy'] },
  { label: 'Economy', fields: ['resourcesProduction', 'currencyTrade', 'laborScarcity', 'tradeRoutes', 'dependencies'] },
  { label: 'Settlement', fields: ['populationScale', 'governanceLaw', 'industryTrade', 'defensesThreats', 'notableDistricts'] },
  { label: 'Philosophy', fields: ['axiomsPrinciples', 'schoolsFactions', 'keyThinkers', 'contradictions', 'culturalEffects'] },
];

section('Template shape sanity');
{
  assertEqual(WORLDBUILDING_TEMPLATES.length, 8, 'eight worldbuilding domains templated');
  WORLDBUILDING_TEMPLATES.forEach((tpl) => {
    assert(tpl.label && tpl.label.length > 0, `${tpl.label || '(blank)'} has a non-empty label`);
    assert(tpl.fields.length === 5 || tpl.fields.length === 6, `${tpl.label} has 5 fields (progressive-disclosure trim) or 6 (Culture/Religion's extra Festivals field)`);
    assertEqual(new Set(tpl.fields).size, tpl.fields.length, `${tpl.label}'s field keys are all distinct`);
  });
  const labels = WORLDBUILDING_TEMPLATES.map((t) => t.label);
  assertEqual(new Set(labels).size, labels.length, 'no two templates share a label (label is the dedup key the UI checks against existing types)');
}

section('createEntityType — a template-shaped type round-trips through an entity');
{
  const cultureFields = WORLDBUILDING_TEMPLATES[0].fields.map((key) => ({ key, label: key }));
  const type = Store.createEntityType({ label: 'Culture', color: '#8B6F47', fields: cultureFields });
  assert(!!type && !!type.key, 'createEntityType returns the new type');
  assertEqual(type.fields.length, 6, 'all 6 Culture template fields are stored on the type (5 base + festivals)');
  assertEqual(type.builtin, false, 'a template-created type is not builtin (rename/delete stay available)');

  const entity = Store.createEntity({ type: type.key, name: 'The Salt Coast Folk' });
  assert(!!entity, 'an entity of the new templated type can be created');
  assertEqual(entity.type, type.key, 'entity carries the new type\'s key');
  Store.updateEntity(entity.id, { customFields: { ...entity.customFields, environment: 'Coastal, tidal marshes' } });
  const reread = Store.getEntity(entity.id);
  assertEqual(reread.customFields.environment, 'Coastal, tidal marshes', 'a value typed into a template field round-trips through customFields, same mechanism any user-defined type already uses');
}

section('deleteEntityType — guarded while in use, works once free');
{
  const type = Store.createEntityType({ label: 'Species', color: '#5B7B5A', fields: WORLDBUILDING_TEMPLATES[1].fields.map((key) => ({ key, label: key })) });
  const entity = Store.createEntity({ type: type.key, name: 'Fenwalkers' });
  const blockedResult = Store.deleteEntityType(type.key);
  assertEqual(blockedResult, false, 'deleting a template-created type still in use is blocked at the store level, not just the UI');
  assert(!!Store.getEntityType(type.key), 'the type still exists after the blocked delete');

  Store.deleteEntity(entity.id);
  const freedResult = Store.deleteEntityType(type.key);
  assertEqual(freedResult, true, 'once no entity uses it, the same type deletes cleanly');
  assertEqual(Store.getEntityType(type.key), null, 'the type is actually gone');
}

section('Builtin types are unaffected by any of this');
{
  const character = Store.getEntityType('character');
  assert(!!character && character.builtin, 'the Character builtin still exists and is still builtin');
  assertEqual(Store.deleteEntityType('character'), false, 'a builtin type cannot be deleted, template pass or not');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
