// Tinta — theme.js smoketest.
//
// theme.js is mostly DOM-bound (document.documentElement, canvas,
// createImageBitmap) and has never had a Node smoketest before this one —
// see docs/ROADMAP.md's testing section on why Playwright specs in
// tests/ have never actually run in this sandbox. This file covers the
// one piece of theme.js that IS pure, DOM-free logic:
// computeBackgroundImageTargetSize(), the sizing decision behind finding
// #13's fix (a custom background image used to be stored and decoded at
// whatever resolution the person's photo happened to be — a 4000×3000
// phone photo sat in memory as a full-resolution body-level layer for the
// entire session).
//
// prepareBackgroundImage() itself (the function that actually calls
// createImageBitmap/canvas/toBlob) is NOT exercised here — that needs a
// real browser, which this sandbox doesn't have. What's tested is the
// arithmetic it depends on: given real dimensions, does it correctly
// decide whether to resize, and does the resize preserve aspect ratio.
// That's the part most likely to hide an off-by-one or a stretched image.
//
// Run with: node theme.smoketest.mjs

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { computeBackgroundImageTargetSize, MAX_BACKGROUND_IMAGE_DIMENSION } = await import('./theme.js');

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

// ── within bounds — stored as-is ─────────────────────────────────────────
section('computeBackgroundImageTargetSize — images already within bounds need no resize');
assertEqual(computeBackgroundImageTargetSize(1920, 1080), null, 'a normal 1920×1080 photo is well within bounds');
assertEqual(computeBackgroundImageTargetSize(100, 100), null, 'a tiny image is within bounds');
assertEqual(
  computeBackgroundImageTargetSize(MAX_BACKGROUND_IMAGE_DIMENSION, MAX_BACKGROUND_IMAGE_DIMENSION),
  null,
  'exactly AT the limit on both axes is within bounds (inclusive boundary, not exclusive)'
);
assertEqual(
  computeBackgroundImageTargetSize(MAX_BACKGROUND_IMAGE_DIMENSION, 500),
  null,
  'exactly at the limit on one axis, comfortably under on the other'
);

// ── over bounds — resized, aspect ratio preserved ────────────────────────
section('computeBackgroundImageTargetSize — oversized images are downscaled with aspect ratio preserved');
{
  const result = computeBackgroundImageTargetSize(MAX_BACKGROUND_IMAGE_DIMENSION + 1, 500);
  assert(result !== null, 'one pixel over the limit on the wide axis still triggers a resize');
  assertEqual(result.width, MAX_BACKGROUND_IMAGE_DIMENSION, 'width is clamped to the max');
  // At a 1-pixel excess the scale factor is ~0.9996 — height (499.8...)
  // correctly rounds right back to 500. Asserting a STRICT decrease here
  // would be wrong, not the implementation: <= is the honest claim for
  // this specific tiny-excess case; the dramatic 4000×3000 case below is
  // what actually proves proportional scaling works.
  assert(result.height <= 500, 'height does not increase');
}
{
  // A 4000×3000 (12MP, 4:3) phone photo — the case the fix exists for.
  const result = computeBackgroundImageTargetSize(4000, 3000);
  assert(result !== null, 'a 4000×3000 photo triggers a resize');
  assertEqual(result.width, MAX_BACKGROUND_IMAGE_DIMENSION, 'width (the longer edge) is clamped to the max');
  assertEqual(result.height, Math.round(3000 * (MAX_BACKGROUND_IMAGE_DIMENSION / 4000)), 'height scales by the exact same ratio as width');
  // 4:3 aspect ratio must survive the resize — check within a fraction of
  // a pixel of rounding tolerance, not exact float equality.
  const originalRatio = 4000 / 3000;
  const resizedRatio = result.width / result.height;
  assert(Math.abs(originalRatio - resizedRatio) < 0.01, `aspect ratio preserved: was ${originalRatio.toFixed(4)}, is ${resizedRatio.toFixed(4)}`);
}
{
  // Tall orientation — the LONGER edge is height, not width, this time.
  // A resize function that assumes "width is always the constrained
  // axis" would get this backwards.
  const result = computeBackgroundImageTargetSize(3000, 4000);
  assert(result !== null, 'a 3000×4000 portrait photo triggers a resize');
  assertEqual(result.height, MAX_BACKGROUND_IMAGE_DIMENSION, 'height (the longer edge here) is clamped to the max, not width');
  assertEqual(result.width, Math.round(3000 * (MAX_BACKGROUND_IMAGE_DIMENSION / 4000)), 'width scales by the same ratio as height');
}
{
  // Square, both axes over the limit by the same amount.
  const result = computeBackgroundImageTargetSize(5000, 5000);
  assert(result !== null, 'an oversized square image triggers a resize');
  assertEqual(result.width, MAX_BACKGROUND_IMAGE_DIMENSION, 'square image: width clamped to max');
  assertEqual(result.height, MAX_BACKGROUND_IMAGE_DIMENSION, 'square image: height clamped to max too (stays square)');
}

// ── custom maxDimension parameter is honored, not hardcoded ─────────────
section('computeBackgroundImageTargetSize — the maxDimension parameter actually changes the bound');
{
  assertEqual(computeBackgroundImageTargetSize(1000, 1000, 2000), null, 'within a custom (non-default) bound is still null');
  const result = computeBackgroundImageTargetSize(1000, 1000, 500);
  assert(result !== null, 'over a custom (tighter) bound still triggers a resize');
  assertEqual(result.width, 500, 'resized to the CUSTOM bound, not the module default');
  assertEqual(result.height, 500, 'both axes respect the custom bound');
}

console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
