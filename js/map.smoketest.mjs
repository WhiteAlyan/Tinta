// Tinta — geography/map (§11) smoke test.
//
// Same convention as calendar.smoketest.mjs and series.smoketest.mjs: a
// minimal in-memory localStorage shim, imported against the real
// store.js (no mocking of store internals), asserting on observable
// behavior. Run with: node map.smoketest.mjs
//
// Covers the store-layer surface only (map/marker CRUD, orphan-not-dangle
// cleanup on entity/map deletion, migration backfill for pre-§11 saves).
// The DOM rendering in app.js (renderMapView/renderMapCanvas/pin
// placement) has no automated coverage here — same gap the Calendar pass
// left for its own UI, consistent rather than a regression specific to
// this feature.

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

section('Setup — a fresh project starts with an empty map catalog');
const project = Store.getActiveProject();
assert(project.maps && typeof project.maps === 'object', 'project.maps exists on a freshly-created project');
assertEqual(Store.getMapList().length, 0, 'no maps yet');
assert(Array.isArray(Store.getMapTypes()) && Store.getMapTypes().includes('World'), 'getMapTypes returns the built-in type list');

section('Map CRUD');
const world = Store.createMap({ name: 'Ashvale', mapType: 'World' });
assert(!!world.id, 'createMap returns a map with an id');
assertEqual(world.markers.length, 0, 'a new map starts with no markers');
assertEqual(Store.getMapList().length, 1, 'getMapList sees the new map');
assertEqual(Store.getMap(world.id).name, 'Ashvale', 'getMap resolves by id');
assertEqual(Store.getMap('nope'), null, 'getMap returns null for an unknown id');

Store.updateMap(world.id, { name: 'Ashvale Continent', imageId: 'img_1' });
assertEqual(Store.getMap(world.id).name, 'Ashvale Continent', 'updateMap patches name');
assertEqual(Store.getMap(world.id).imageId, 'img_1', 'updateMap patches imageId');

const city = Store.createMap({ name: 'Havenport', mapType: 'City' });
assertEqual(Store.getMapList().length, 2, 'second map exists alongside the first');
// getMapList is sorted oldest-first (see store.js) — Ashvale was created before Havenport.
assertEqual(Store.getMapList()[0].id, world.id, 'getMapList sorts oldest-first');

section('Marker CRUD — normalized coordinates, defaults');
const marker = Store.addMarker(world.id, { x: 0.25, y: 0.6, label: 'Havenport' });
assert(!!marker.id, 'addMarker returns a marker with an id');
assertEqual(marker.entityId, null, 'a new marker has no entity link by default');
assertEqual(marker.linkedMapId, null, 'a new marker has no map drill-down link by default');
assertEqual(Store.getMap(world.id).markers.length, 1, 'the marker was actually attached to the map');
assertEqual(Store.getMarker(world.id, marker.id).label, 'Havenport', 'getMarker resolves by mapId+markerId');
assertEqual(Store.getMarker(world.id, 'nope'), null, 'getMarker returns null for an unknown marker id');
assertEqual(Store.addMarker('nope', { x: 0, y: 0 }), null, 'addMarker on an unknown map id is a no-op that returns null');

Store.updateMarker(world.id, marker.id, { note: 'A port city, three days by ship from the capital.' });
assertEqual(Store.getMarker(world.id, marker.id).note, 'A port city, three days by ship from the capital.', 'updateMarker patches note');

section('Marker ↔ entity link, and orphan-not-dangle on entity deletion');
const kessa = Store.createEntity({ name: 'Kessa Vane', type: 'character' });
Store.updateMarker(world.id, marker.id, { entityId: kessa.id });
assertEqual(Store.getMarker(world.id, marker.id).entityId, kessa.id, 'marker now links to the entity');

Store.deleteEntity(kessa.id);
assertEqual(
  Store.getMarker(world.id, marker.id).entityId,
  null,
  'deleting the linked entity orphans the marker (clears entityId) rather than deleting the marker or leaving a dangling id'
);
assertEqual(Store.getMap(world.id).markers.length, 1, 'the marker itself survives the entity deletion — only the link is cleared');

section('Marker ↔ map drill-down link, and orphan-not-dangle on map deletion');
Store.updateMarker(world.id, marker.id, { linkedMapId: city.id });
assertEqual(Store.getMarker(world.id, marker.id).linkedMapId, city.id, 'marker now drills down into the city map');

Store.deleteMap(city.id);
assertEqual(Store.getMapList().length, 1, 'the deleted map is actually gone');
assertEqual(
  Store.getMarker(world.id, marker.id).linkedMapId,
  null,
  'deleting a map that a marker drilled down into clears the link (orphan-not-dangle) rather than leaving a reference to a map that no longer exists'
);

section('Marker deletion');
const secondMarker = Store.addMarker(world.id, { x: 0.5, y: 0.5, label: 'Temp' });
assertEqual(Store.getMap(world.id).markers.length, 2, 'two markers now on the map');
Store.deleteMarker(world.id, secondMarker.id);
assertEqual(Store.getMap(world.id).markers.length, 1, 'deleteMarker removes exactly the one marker');
assertEqual(Store.getMarker(world.id, secondMarker.id), null, 'the deleted marker no longer resolves');
Store.deleteMarker(world.id, 'nope'); // should not throw
assert(true, 'deleteMarker on an unknown marker id is a silent no-op, not a crash');

section('Map deletion cascades to its own markers');
Store.deleteMap(world.id);
assertEqual(Store.getMapList().length, 0, 'no maps remain');
assertEqual(Store.getMap(world.id), null, 'the deleted map no longer resolves');

section('Migration — a pre-§11 backup (no project.maps at all) backfills cleanly');
{
  // _db is cached after the first load() (see store.js) — mutating
  // getActiveProject()'s live object and calling switchProject/
  // createProject would just hand back the same cached reference without
  // re-running migrate(). importFullBackup() is the one public entry
  // point that re-runs migrate() against genuinely fresh parsed JSON, the
  // same as opening a real backup file exported before this pass existed
  // — so build a legacy-shaped snapshot from the current (already-clean)
  // db, strip `maps` off its project the way a real pre-§11 file would be
  // missing it, and import that.
  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  delete legacyDb.projects[legacyProjectId].maps;
  assert(legacyDb.projects[legacyProjectId].maps === undefined, 'sanity check — the field really is gone in the legacy snapshot');

  Store.importFullBackup(JSON.stringify(legacyDb));
  assert(Store.getActiveProject().maps && typeof Store.getActiveProject().maps === 'object', 'importing a backup missing `maps` backfills it to {} rather than throwing');
  assertEqual(Store.getMapList().length, 0, 'the backfilled catalog is empty, not populated with garbage');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
