// viewLifecycle registry — smoketest that asserts every view module
// that owns per-view state registers itself with viewLifecycle.js.
//
// Bug this guards against: sketchView was the one view module that owned
// per-view state (activeSketchId + sketchDetachDrawing) but never
// registered, leaving a stale-id landmine across project switches —
// same bug class as the original audit's #1 (notesView/systemsView
// direct-assignment throws). The fix was to add the registration, but
// the next view module that grows state and forgets to register would
// silently reintroduce the same gap. This smoketest walks every file
// that imports from context.js (the canonical view-state seam) and
// asserts each one registers its reset function with viewLifecycle.js.
//
// What counts as "owns per-view state":
// - imports an active*Id binding from context.js (e.g. activeEntityId)
// - exports a render*View function (the view-render pattern)
// Both signals together = a view module that should register.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  NOT OK - ${name}`); }
}

console.log('viewLifecycle registration — every view module registers its reset');

// Read every .js file in js/ and check which ones look like view modules.
const viewModules = [];
const jsFiles = readdirSync(__dirname).filter((f) => f.endsWith('.js'));
for (const name of jsFiles) {
  const filePath = resolve(__dirname, name);
  const src = readFileSync(filePath, 'utf8');
  // A view module: exports a render*View function (sync OR async) AND
  // imports an active*Id from context.js. The async case (bookView.js's
  // `export async function renderBookView`) was missed by the original
  // regex, letting bookView slip through without a registration check.
  const rendersView = /export\s+(?:async\s+)?function\s+render\w+View/.test(src);
  const importsActiveId = /import\s+\{[^}]*active\w*Id[^}]*\}\s+from\s+['"]\.\/context\.js['"]/.test(src);
  if (rendersView && importsActiveId) {
    viewModules.push({ file: name, src });
  }
}

ok('found at least 4 view modules (notes/canvas/map/systems/etc.)', viewModules.length >= 4);

// Print what we found, for visibility
console.log('  view modules found:');
for (const v of viewModules) console.log(`    - ${v.file}`);

// Each one should register with viewLifecycle.js
for (const { file, src } of viewModules) {
  const registers = /registerViewReset\s*\(\s*['"][^'"]+['"]/.test(src);
  ok(`${file} registers with viewLifecycle.js`, registers);
}

// Also verify resetAllViews + registerViewReset are exported, and the
// registry is defensively wrapped in try/catch (one view's reset throwing
// shouldn't break the others).
const viewLifecycleSrc = readFileSync(resolve(__dirname, 'viewLifecycle.js'), 'utf8');
ok('viewLifecycle.js exports resetAllViews', /export\s+function\s+resetAllViews/.test(viewLifecycleSrc));
ok('viewLifecycle.js exports registerViewReset', /export\s+function\s+registerViewReset/.test(viewLifecycleSrc));
ok('viewLifecycle.js has try/catch around reset calls (defensive)', /try\s*\{[^}]*resetFn\(\)[^}]*\}\s*catch/.test(viewLifecycleSrc));

console.log(`\nviewLifecycle-registration.smoketest: ${passed} passed, ${failed} failed${failed === 0 ? ' — all green.' : ''}`);
if (failed > 0) process.exit(1);
