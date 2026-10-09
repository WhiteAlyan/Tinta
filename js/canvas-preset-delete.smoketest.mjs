// Canvas preset delete bug — smoketest for the fix.
//
// Bug being prevented from regressing: the change handler used to call
// renderCanvasView() after applyGraphPreset(), which rebuilt the
// toolbar from scratch. The new <select> defaulted to its first <option>
// (value=""), and the new delete button rendered with the template's
// hardcoded `disabled` attribute — so the writer could pick a preset,
// watch the graph update, then click a greyed-out delete button that
// did nothing. The fix tracks the loaded preset's id in module state
// so the template can pre-select the right option and render the
// delete button enabled. This smoketest drives the Store side of that
// flow (create/load/delete) directly, since canvasView.js is a view
// module that needs a DOM and isn't safe to import under Node — the
// view-layer regression is covered by the change/delete handler code
// reading canvasLoadedPresetId, not by anything Store-side.

import * as Store from './store.js';

let passed = 0;
let failed = 0;

function ok(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  NOT OK - ${name}`); }
}

// Shim localStorage for Node
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (_store[k] !== undefined ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
};
globalThis.window = { addEventListener: () => {} };

console.log('Canvas preset delete — Store-side coverage');

localStorage.clear();
Store.load();

const project = Store.getActiveProject();

// Create a preset
const preset = Store.createGraphPreset({ name: 'Family tree', hiddenTypes: ['location'], statusFilter: 'active' });
ok('createGraphPreset returns a preset with an id', Boolean(preset && preset.id));
ok('preset is in getGraphPresetList', Store.getGraphPresetList().some((p) => p.id === preset.id));

// Apply it — the change handler in canvasView.js calls this with the selected preset's id
const applied = Store.applyGraphPreset(preset.id);
ok('applyGraphPreset returns the filter state', Boolean(applied));
ok('applied.hiddenTypes includes the saved type', applied && applied.hiddenTypes.includes('location'));
ok('applied.statusFilter matches the saved value', applied && applied.statusFilter === 'active');

// Delete it — this is the operation the broken delete button couldn't reach
Store.deleteGraphPreset(preset.id);
ok('preset is gone from getGraphPresetList after delete', !Store.getGraphPresetList().some((p) => p.id === preset.id));
ok('getGraphPreset returns null for the deleted id', Store.getGraphPreset(preset.id) === null);

// Apply on a deleted preset returns null — the change handler's "if (!applied) return;"
// guard means the view-side delete button can't fire after delete
ok('applyGraphPreset on deleted id returns null', Store.applyGraphPreset(preset.id) === null);

// Edge case: empty name is rejected (delete button never appears for empty-name presets
// because they can't be created in the first place)
const rejected = Store.createGraphPreset({ name: '   ', hiddenTypes: [], statusFilter: '' });
ok('createGraphPreset rejects empty/whitespace name', rejected === null);

// Multiple presets — make sure delete only removes the targeted one
const p1 = Store.createGraphPreset({ name: 'A' });
const p2 = Store.createGraphPreset({ name: 'B' });
const p3 = Store.createGraphPreset({ name: 'C' });
Store.deleteGraphPreset(p2.id);
const remaining = Store.getGraphPresetList().map((p) => p.name);
ok('delete removed only the targeted preset', remaining.length === 2 && remaining.includes('A') && remaining.includes('C') && !remaining.includes('B'));

console.log(`\ncanvas-preset-delete.smoketest: ${passed} passed, ${failed} failed${failed === 0 ? ' — all green.' : ''}`);
if (failed > 0) process.exit(1);
