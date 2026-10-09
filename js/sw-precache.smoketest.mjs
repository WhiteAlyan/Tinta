// Tinta — service-worker precache drift smoke test.
//
// Data-safety audit pass. The specific gap this closes: sw.js's
// SHELL_FILES array is a hand-maintained list of every file the offline
// cache precaches, and it has drifted out of sync with the real js/ and
// css/ directories three separate times (per ROADMAP.md's session log) —
// each time silently, since nothing ever re-checked it against the
// filesystem. Adding the two missing files each time fixed that
// occurrence but not the next one, because the actual bug was "nothing
// catches this," not "these specific two files are missing." This test
// is the "nothing catches this" fix: it reads sw.js's own source text
// (no separate hand-maintained list of its own — that would just be a
// second copy of the same drift problem) and fails loudly the moment a
// real js/*.js or css/*.css file exists without a matching SHELL_FILES
// entry, or vice versa.
//
// Run with: node sw-precache.smoketest.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..'); // js/ → repo root

// ── tiny test harness (same convention as every other *.smoketest.mjs) ──
let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function section(title) { console.log(`\n${title}`); }

// ── read sw.js's actual SHELL_FILES array ────────────────────────────────
// Deliberately a text scan, not an import of sw.js itself — sw.js is a
// service worker module that registers `install`/`fetch`/`activate`
// listeners against `self` at load time, which isn't worth shimming just
// to read one array literal. The array's entries are simple quoted
// strings on their own lines (see sw.js), so a line-oriented regex is
// exactly as reliable here as a real parse would be, with far less setup.
const swSource = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const shellFilesMatch = swSource.match(/const SHELL_FILES\s*=\s*\[([\s\S]*?)\];/);
assert(!!shellFilesMatch, 'sw.js: SHELL_FILES array literal found (regex still matches sw.js\'s actual shape)');
const shellFiles = shellFilesMatch
  ? [...shellFilesMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];
assert(shellFiles.length > 10, `sw.js: SHELL_FILES has a plausible number of entries (found ${shellFiles.length})`);

function realFiles(dir, ext) {
  return fs.readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith(ext))
    .map((f) => `./${dir}/${f}`)
    .sort();
}

section('Every real js/*.js file has a SHELL_FILES entry');
const realJs = realFiles('js', '.js').filter((f) => !f.includes('.smoketest.'));
const shellJs = new Set(shellFiles.filter((f) => f.startsWith('./js/')));
realJs.forEach((f) => {
  assert(shellJs.has(f), `${f} exists on disk but is missing from sw.js's SHELL_FILES — this is exactly the drift bug that's happened 3 times before`);
});

section('Every real css/*.css file has a SHELL_FILES entry');
const realCss = realFiles('css', '.css');
const shellCss = new Set(shellFiles.filter((f) => f.startsWith('./css/')));
realCss.forEach((f) => {
  assert(shellCss.has(f), `${f} exists on disk but is missing from sw.js's SHELL_FILES`);
});

section('Every SHELL_FILES js/css entry points at a file that actually exists');
// The other direction — a stale entry (a file renamed or deleted but left
// in SHELL_FILES) isn't the "offline app breaks" bug the sessions above
// hit, but it's still worth catching: it's dead weight in the precache
// and a sign the list was hand-edited without checking either direction.
shellFiles
  .filter((f) => f.startsWith('./js/') || f.startsWith('./css/'))
  .forEach((f) => {
    assert(fs.existsSync(path.join(ROOT, f)), `SHELL_FILES lists ${f}, but no such file exists on disk`);
  });

// P2-13 fix — extend the existence check beyond js/ and css/. The
// original filter at line 77 only verified ./js/ and ./css/ entries
// pointed at real files; the other 9 SHELL_FILES entries (./, index.html,
// manifest.json, 6× fonts/*.woff2, and after P1-14 the 2× icons/*.png)
// were never verified. If manifest.json or a font file got deleted or
// renamed, the offline PWA install would silently break with no signal
// from the smoketest. Now every SHELL_FILES entry is verified to exist
// on disk regardless of which subdirectory it lives in.
section('Every SHELL_FILES entry (fonts/, icons/, manifest, index.html, ./) points at a file that exists');
shellFiles
  .forEach((f) => {
    // './' is the implicit start_url for the SW — it doesn't resolve to
    // a single file, so skip it. Everything else is a real file.
    if (f === './') return;
    assert(fs.existsSync(path.join(ROOT, f)), `SHELL_FILES lists ${f}, but no such file exists on disk`);
  });

// And the reverse direction for fonts/ and icons/ — a real woff2 or
// png dropped in without a SHELL_FILES entry would be the same drift
// bug class that hit js/ and css/ three times before.
section('Every real fonts/*.woff2 and icons/*.png file has a SHELL_FILES entry');
const realFonts = realFiles('fonts', '.woff2');
const realIcons = realFiles('icons', '.png');
const shellFonts = new Set(shellFiles.filter((f) => f.startsWith('./fonts/')));
const shellIcons = new Set(shellFiles.filter((f) => f.startsWith('./icons/')));
realFonts.forEach((f) => {
  assert(shellFonts.has(f), `${f} exists on disk but is missing from sw.js's SHELL_FILES — fonts precache drift`);
});
realIcons.forEach((f) => {
  assert(shellIcons.has(f), `${f} exists on disk but is missing from sw.js's SHELL_FILES — icons precache drift`);
});

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
