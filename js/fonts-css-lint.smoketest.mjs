// fonts.css URL linter — smoketest that every url(...) in fonts.css
// points at a file that actually exists in fonts/.
//
// Bug this guards against: bug #7 from the audit — six @font-face rules
// declared weights (Fraunces 400, Fraunces 500, Inter 500, Inter 600,
// JetBrains Mono 500, Literata 500) that pointed at weight files that
// didn't exist (Fraunces 400 → fraunces-300.woff2, etc.). The browser
// was fake-bold-synthesizing from the wrong weight file. The fix was
// to drop the lying rules. This smoketest parses fonts.css, extracts
// every url(...), and verifies each one resolves to a real file in
// fonts/. Same shape as sw-precache.smoketest.mjs — same shape as the
// kind of check that would have caught bug #7 instantly.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fontsCssPath = resolve(__dirname, '../css/fonts.css');
const fontsDir = resolve(__dirname, '../fonts');

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  NOT OK - ${name}`); }
}

console.log('fonts.css URL linter — every url(...) points at a real file');

ok('css/fonts.css exists', existsSync(fontsCssPath));
ok('fonts/ directory exists', existsSync(fontsDir));

const css = readFileSync(fontsCssPath, 'utf8');

// Extract every url(...) — capture the path inside the parens.
const urlMatches = [...css.matchAll(/url\(\s*([^)]+?)\s*\)/g)];
ok('at least one url(...) declaration found', urlMatches.length > 0);

const referencedFiles = new Set();
for (const m of urlMatches) {
  let path = m[1].trim();
  // Strip quotes if present
  path = path.replace(/^['"]/, '').replace(/['"]$/, '');
  // Skip data: URIs (not used today, but defensive)
  if (path.startsWith('data:')) continue;
  // The paths in fonts.css are like ../fonts/foo.woff2 — resolve relative
  // to the css/ directory.
  const resolved = resolve(dirname(fontsCssPath), path);
  referencedFiles.add({ path, resolved });
}

let allFound = true;
for (const { path, resolved } of referencedFiles) {
  const exists = existsSync(resolved);
  ok(`url(${path}) → file exists`, exists);
  if (!exists) allFound = false;
}

// Bonus check: every @font-face declares font-display: swap (the
// pattern this app uses for self-hosted webfonts, per fonts.css's
// header comment).
const faceBlocks = css.match(/@font-face\s*\{[^}]+\}/g) || [];
ok('at least one @font-face block found', faceBlocks.length > 0);
for (const block of faceBlocks) {
  // Extract the family name for a more readable assertion message
  const familyMatch = block.match(/font-family:\s*['"]?([^'";]+)['"]?\s*;/);
  const weightMatch = block.match(/font-weight:\s*(\d+)/);
  const family = familyMatch ? familyMatch[1] : '(unknown)';
  const weight = weightMatch ? weightMatch[1] : '(unknown)';
  ok(`@font-face ${family} ${weight} declares font-display: swap`, /font-display:\s*swap/.test(block));
}

// Bonus check 2: no @font-face rule declares a weight for a file that
// doesn't match it (the bug #7 regression — e.g. font-weight: 500 but
// src: url(...-400.woff2)). Verify by extracting the weight and the
// file basename; if the file basename ends in -NNN.woff2, then weight
// should match NNN.
for (const block of faceBlocks) {
  const familyMatch = block.match(/font-family:\s*['"]?([^'";]+)['"]?\s*;/);
  const weightMatch = block.match(/font-weight:\s*(\d+)/);
  const urlMatch = block.match(/url\(\s*[^)]+?([\w-]+)-(\d+)\.woff2/);
  if (!familyMatch || !weightMatch || !urlMatch) continue;
  const family = familyMatch[1];
  const declaredWeight = weightMatch[1];
  const fileWeight = urlMatch[2];
  ok(`@font-face ${family} ${declaredWeight} → file's weight suffix matches (${fileWeight})`, declaredWeight === fileWeight);
}

console.log(`\nfonts-css-lint.smoketest: ${passed} passed, ${failed} failed${failed === 0 ? ' — all green.' : ''}`);
if (failed > 0) process.exit(1);
