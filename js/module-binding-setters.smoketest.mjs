// ESM binding assignment bug — smoketest for the fix.
//
// Bug being prevented from regressing: notesView.js / systemsView.js
// assigned to imported `let` bindings (activeEntityId, activeSystemId)
// directly instead of going through the setters. ES module imported
// bindings are read-only from importers — only the owning module can
// reassign them — so those assignments threw `TypeError: Assignment to
// constant variable.` at runtime when the writer switched projects
// (leaving a stale id pointing at the previous project's record) or
// deleted the currently-selected entity.
//
// The fix was two-sided:
//   (a) projectSwitch.js#teardownLiveStateForProjectSwitch now calls
//       setActiveEntityId/SystemId/MapId/ReferenceId/SketchId(null)
//       so stale ids don't survive a project switch in the first place.
//   (b) notesView.js / systemsView.js use the setters instead of direct
//       assignment for the defensive "is the active id still valid?"
//       fallbacks.
//
// This smoketest verifies both halves: (1) the setters are exported
// from context.js as the only sanctioned write path, (2) importing
// the bindings and calling the setters works (no throw), (3) the
// projectSwitch teardown function actually invokes every setActive*
// setter (so a stale id can't survive a project switch even if a view
// module's defensive fallback has a regression).

import * as Context from './context.js';

let passed = 0;
let failed = 0;

function ok(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  NOT OK - ${name}`); }
}

console.log('ESM binding assignment — context.js setters are the only write path');

// 1. All the active* bindings are exported as `let` from context.js
ok('activeView is exported', Context.activeView !== undefined);
ok('activeChapterId is exported', Context.activeChapterId !== undefined);
ok('activeEntityId is exported', Context.activeEntityId !== undefined);
ok('activeSketchId is exported', Context.activeSketchId !== undefined);
ok('activeMapId is exported', Context.activeMapId !== undefined);
ok('activeReferenceId is exported', Context.activeReferenceId !== undefined);
ok('activeSystemId is exported', Context.activeSystemId !== undefined);

// 2. All the setActive* setters are exported from context.js
ok('setActiveView is exported', typeof Context.setActiveView === 'function');
ok('setActiveChapterId is exported', typeof Context.setActiveChapterId === 'function');
ok('setActiveEntityId is exported', typeof Context.setActiveEntityId === 'function');
ok('setActiveSketchId is exported', typeof Context.setActiveSketchId === 'function');
ok('setActiveMapId is exported', typeof Context.setActiveMapId === 'function');
ok('setActiveReferenceId is exported', typeof Context.setActiveReferenceId === 'function');
ok('setActiveSystemId is exported', typeof Context.setActiveSystemId === 'function');

// 3. Setters mutate the live binding (read-back reflects the write)
Context.setActiveEntityId('ent_test_1');
ok('setActiveEntityId mutates the live binding', Context.activeEntityId === 'ent_test_1');
Context.setActiveSystemId('sys_test_1');
ok('setActiveSystemId mutates the live binding', Context.activeSystemId === 'sys_test_1');
Context.setActiveMapId('map_test_1');
ok('setActiveMapId mutates the live binding', Context.activeMapId === 'map_test_1');
Context.setActiveReferenceId('ref_test_1');
ok('setActiveReferenceId mutates the live binding', Context.activeReferenceId === 'ref_test_1');
Context.setActiveSketchId('sketch_test_1');
ok('setActiveSketchId mutates the live binding', Context.activeSketchId === 'sketch_test_1');

// 4. Direct assignment would throw — verified by ESM semantics, but
// let's confirm the setter path itself doesn't throw under realistic
// usage (null is the project-switch teardown's primary value)
let threw = false;
try {
  Context.setActiveEntityId(null);
  Context.setActiveSystemId(null);
  Context.setActiveMapId(null);
  Context.setActiveReferenceId(null);
  Context.setActiveSketchId(null);
} catch (err) {
  threw = true;
}
ok('setters accept null (the project-switch teardown value) without throwing', !threw);

// 5. Reset to defaults for any other test that might run after this one
Context.setActiveEntityId(null);
Context.setActiveSystemId(null);
Context.setActiveMapId(null);
Context.setActiveReferenceId(null);
Context.setActiveSketchId(null);
Context.setActiveChapterId(null);
Context.setActiveView('write');

// 6. projectSwitch.js's teardownLiveStateForProjectSwitch actually
// imports every setActive* and uses them — this is the regression
// guard for "did someone forget to clear a binding on project switch?"
// Architecture note: the viewLifecycle refactor moved the setActiveX(null)
// calls out of projectSwitch.js and into each view module's registered
// reset function (notesView.resetEntityTagFilters, systemsView.resetSystemsViewState,
// mapView.resetMapViewState, referencesView.resetReferenceTagFilters,
// sketchView.resetSketchViewState, writeView.resetWriteViewState).
// projectSwitch.js now calls resetAllViews() which dispatches to each
// registered reset. So we check the VIEW MODULES for the setter calls,
// not projectSwitch.js.
const projectSwitchSrc = await import('fs').then((fs) => fs.promises.readFile(new URL('./projectSwitch.js', import.meta.url), 'utf8'));
ok('projectSwitch.js imports resetAllViews from viewLifecycle', projectSwitchSrc.includes('resetAllViews'));
ok('projectSwitch.js teardownLiveStateForProjectSwitch calls resetAllViews()', projectSwitchSrc.includes('resetAllViews();'));

// Each view module's reset function should call the corresponding
// setActiveX(null) — that's the actual contract the registry relies on.
const viewChecks = [
  ['notesView.js', 'setActiveEntityId(null)'],
  ['systemsView.js', 'setActiveSystemId(null)'],
  ['mapView.js', 'setActiveMapId(null)'],
  ['referencesView.js', 'setActiveReferenceId(null)'],
  ['sketchView.js', 'setActiveSketchId(null)'],
];
for (const [file, setterCall] of viewChecks) {
  const src = await import('fs').then((fs) => fs.promises.readFile(new URL('./' + file, import.meta.url), 'utf8'));
  ok(`${file} reset function calls ${setterCall}`, src.includes(setterCall));
  ok(`${file} registers with viewLifecycle`, src.includes('registerViewReset'));
}

// 7. notesView.js / systemsView.js source code no longer contains
// direct `activeEntityId =` / `activeSystemId =` assignments
const notesViewSrc = await import('fs').then((fs) => fs.promises.readFile(new URL('./notesView.js', import.meta.url), 'utf8'));
ok('notesView.js does not contain direct `activeEntityId =` assignment', !/[^.]activeEntityId\s*=\s*[^=]/.test(notesViewSrc.replace(/\/\/.*$/gm, '')));

const systemsViewSrc = await import('fs').then((fs) => fs.promises.readFile(new URL('./systemsView.js', import.meta.url), 'utf8'));
ok('systemsView.js does not contain direct `activeSystemId =` assignment', !/[^.]activeSystemId\s*=\s*[^=]/.test(systemsViewSrc.replace(/\/\/.*$/gm, '')));

console.log(`\nmodule-binding-setters.smoketest: ${passed} passed, ${failed} failed${failed === 0 ? ' — all green.' : ''}`);
if (failed > 0) process.exit(1);
