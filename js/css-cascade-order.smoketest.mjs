// CSS cascade-order linter — guards the class of bug that broke the
// mobile breakpoint.
//
// The bug: css/shell.css opened with
//
//   @media (max-width: 800px) { .sidebar { display: none; } }
//
// BEFORE the base `.sidebar { display: flex; }` rule. Media queries add no
// specificity, so both rules were plain `.sidebar` at equal weight and the
// later one won — the sidebar stayed visible at 390px wide, ate most of
// the screen, and pushed the editor into a strip underneath it.
//
// The trap is nastier than one misplaced rule, because Tinta's CSS is
// split across nine files loaded in document order (index.html). A
// correctly-placed override inside shell.css STILL loses to polish.css,
// which loads later and re-declares .sidebar for the burger-sidebar work.
// The fix therefore had to live at the end of polish.css, and the only way
// to know that is to resolve the cascade across the whole load order.
//
// Rather than pin one hand-written assertion, this file rebuilds the real
// cascade from index.html's <link> order and asserts the winning
// declarations. If someone later adds another `.sidebar { position: ... }`
// to a file that loads after polish.css, this goes red instead of the
// mobile layout silently breaking again.
//
// Pure text analysis — no DOM, no browser. It cannot catch everything a
// real engine would (it ignores !important and inline styles, neither of
// which this codebase uses for layout), and it is deliberately narrow:
// it answers "which rule wins for this selector at this width", not
// "is the CSS correct".
//
// Run with: node css-cascade-order.smoketest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];
function ok(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; failures.push(name); console.log(`  NOT OK - ${name}`); }
}

// ── rebuild the real load order from index.html ─────────────────────────
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf-8');
const cssFiles = [...indexHtml.matchAll(/<link\s+rel="stylesheet"\s+href="(css\/[^"]+)"/g)].map((m) => m[1]);

console.log('CSS cascade-order linter');
console.log(`\nload order from index.html (${cssFiles.length} files)`);
ok('index.html links at least the nine concern-split stylesheets', cssFiles.length >= 9);
ok('shell.css is linked before polish.css (the ordering the fix depends on)',
  cssFiles.indexOf('css/shell.css') < cssFiles.indexOf('css/polish.css'));

// ── a very small CSS reader ─────────────────────────────────────────────
// Strips comments, then walks top-level blocks, tracking whether we're
// inside a max-width media query and what its breakpoint is.
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function readRules(css, sourceName) {
  const out = [];
  const text = stripComments(css);
  let i = 0;

  function readBlock(start) {
    let depth = 0;
    for (let j = start; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') {
        depth--;
        if (depth === 0) return j;
      }
    }
    return text.length;
  }

  function collect(body, mediaMaxWidth, offset) {
    let k = 0;
    while (k < body.length) {
      const brace = body.indexOf('{', k);
      if (brace === -1) break;
      const selector = body.slice(k, brace).trim();
      const close = readBlock(offset + brace) - offset;
      const inner = body.slice(brace + 1, close);
      if (selector.startsWith('@media')) {
        const mw = /max-width:\s*(\d+)px/.exec(selector);
        collect(inner, mw ? Number(mw[1]) : mediaMaxWidth, offset + brace + 1);
      } else if (selector.startsWith('@')) {
        // @supports / @font-face / keyframes — not relevant to this check.
      } else {
        selector.split(',').map((s) => s.trim()).filter(Boolean).forEach((sel) => {
          out.push({ selector: sel, declarations: inner, mediaMaxWidth, source: sourceName });
        });
      }
      k = close + 1;
    }
  }

  collect(text, null, i);
  return out;
}

const allRules = [];
for (const file of cssFiles) {
  const css = readFileSync(resolve(root, file), 'utf-8');
  readRules(css, file).forEach((r) => allRules.push(r));
}

// Specificity, counting ids and classes/attributes/pseudo-classes only —
// enough to rank the selectors this file asks about.
function specificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[a-z-]+(?!\()/g) || []).length;
  return ids * 100 + classes * 10;
}

function declaredValue(declarations, prop) {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = re.exec(declarations);
  return m ? m[1].trim() : null;
}

// Which declaration wins for a selector at a given viewport width.
// Ranks by specificity, then by position in the concatenated cascade.
function winner(selectorExact, prop, viewportWidth) {
  let best = null;
  allRules.forEach((rule, index) => {
    if (rule.selector !== selectorExact) return;
    if (rule.mediaMaxWidth !== null && viewportWidth > rule.mediaMaxWidth) return;
    const value = declaredValue(rule.declarations, prop);
    if (value === null) return;
    const spec = specificity(rule.selector);
    if (!best || spec > best.spec || (spec === best.spec && index > best.index)) {
      best = { value, spec, index, source: rule.source };
    }
  });
  return best;
}

// ── 1. THE regression: the mobile sidebar must not be a static panel ────
console.log('\nmobile sidebar (390px viewport) — the original bug');
{
  const pos = winner('.sidebar', 'position', 390);
  ok('.sidebar has a winning position declaration at 390px', pos !== null);
  ok(`.sidebar is taken out of flow at 390px (position: fixed, from ${pos?.source})`,
    pos?.value === 'fixed');

  const transform = winner('.sidebar', 'transform', 390);
  ok('.sidebar is translated off-screen by default at 390px',
    transform?.value === 'translateX(-100%)');

  const openTransform = winner('#app-shell.mobile-nav-open .sidebar', 'transform', 390);
  ok('the drawer slides back in when #app-shell has .mobile-nav-open',
    openTransform?.value === 'translateX(0)');
}

// ── 2. Desktop must be untouched by all of the above ───────────────────
console.log('\ndesktop sidebar (1200px viewport) — unchanged');
{
  const display = winner('.sidebar', 'display', 1200);
  ok('.sidebar is still a flex column on desktop', display?.value === 'flex');

  const pos = winner('.sidebar', 'position', 1200);
  ok('.sidebar is still position: relative on desktop (the burger-rail rule)',
    pos?.value === 'relative');

  const transform = winner('.sidebar', 'transform', 1200);
  ok('.sidebar has no off-screen transform on desktop', transform === null);
}

// ── 3. The drawer control must be reachable, and only on mobile ────────
console.log('\nmobile nav button — visible only below the breakpoint');
{
  ok('.mobile-nav-btn is hidden on desktop', winner('.mobile-nav-btn', 'display', 1200)?.value === 'none');
  ok('.mobile-nav-btn is shown at 390px', winner('.mobile-nav-btn', 'display', 390)?.value === 'inline-flex');
  ok('.mobile-nav-backdrop is hidden on desktop', winner('.mobile-nav-backdrop', 'display', 1200)?.value === 'none');
  ok('the backdrop appears only while the drawer is open',
    winner('#app-shell.mobile-nav-open ~ .mobile-nav-backdrop', 'display', 390)?.value === 'block');
}

// ── 4. The collapsed rail must not strip the drawer's contents ─────────
console.log('\ncollapsed-state interaction — a collapsed desktop rail must not follow onto mobile');
{
  const gridMobile = winner('#app-shell.sidebar-collapsed', 'grid-template-columns', 390);
  ok('a persisted collapsed:true does not narrow the shell to a 56px rail on mobile',
    gridMobile?.value === '1fr');

  const gridDesktop = winner('#app-shell.sidebar-collapsed', 'grid-template-columns', 1200);
  ok('the 56px rail still works on desktop', gridDesktop?.value === '56px 1fr');

  const chapterList = winner('#app-shell.sidebar-collapsed .chapter-list', 'display', 390);
  ok('the chapter list is NOT hidden inside the mobile drawer (the whole point of opening it)',
    chapterList?.value === 'revert');
}

// ── 5. No dead declarations — the shape of the original bug ────────────
// The original rule wasn't wrong, it was DEAD: a media-scoped declaration
// that a later, equally-specific, unconditional rule overrode at every
// width the media query covered. Detect that shape generally rather than
// string-matching the one instance, so the next one is caught too.
//
// (An earlier version of this check sliced shell.css at the first
// `.sidebar {` and scanned above it. That was itself buggy — reintroducing
// the dead rule made it the first match, so the scan looked at an empty
// prefix and passed. Mutation-testing this file is what surfaced it.)
console.log('\nno dead declarations (a media rule an unconditional later rule overrides)');
{
  function findDeadDeclarations(selectorExact, prop) {
    const dead = [];
    const candidates = allRules
      .map((rule, index) => ({ ...rule, index }))
      .filter((rule) => rule.selector === selectorExact && declaredValue(rule.declarations, prop) !== null);

    candidates.forEach((rule) => {
      if (rule.mediaMaxWidth === null) return; // unconditional rules can't be dead this way
      const shadowed = candidates.some((other) =>
        other.index > rule.index &&
        other.mediaMaxWidth === null && // applies at every width, including inside rule's range
        specificity(other.selector) >= specificity(rule.selector));
      if (shadowed) dead.push(`${rule.source} → ${selectorExact} { ${prop} } is overridden at every width by a later unconditional rule`);
    });
    return dead;
  }

  const deadSidebarDisplay = findDeadDeclarations('.sidebar', 'display');
  if (deadSidebarDisplay.length) deadSidebarDisplay.forEach((d) => console.log(`      ${d}`));
  ok('.sidebar has no dead display declaration (the original 800px bug)', deadSidebarDisplay.length === 0);

  const deadSidebarPosition = findDeadDeclarations('.sidebar', 'position');
  ok('.sidebar has no dead position declaration', deadSidebarPosition.length === 0);

  const deadMain = findDeadDeclarations('.main', 'grid-column');
  ok('.main has no dead grid-column declaration (the sibling case shell.css already got right)', deadMain.length === 0);

  // And the functional assertion the dead rule was trying to make: the
  // drawer must still be a rendered flex column when it slides in, never
  // display:none.
  ok('.sidebar still renders (display: flex) at 390px so the open drawer has contents',
    winner('.sidebar', 'display', 390)?.value === 'flex');

  // P2-14 fix — guard the exact bug P1-11 fixed. polish.css:776 used
  // to declare an unconditional `.sidebar { overflow: hidden }` that
  // silently killed shell.css:25's `.sidebar { overflow-y: auto }`,
  // so the sidebar couldn't scroll vertically when its content
  // exceeded the viewport. The original cascade-order smoketest
  // guarded `display`, `position`, and `grid-column` for .sidebar
  // but never `overflow-y` — exactly the property where the bug
  // lived. Now the winner at desktop width must be `auto` (from
  // shell.css), and there must be no dead declaration of overflow
  // or overflow-y on .sidebar at any width.
  ok('.sidebar overflow-y wins as auto at desktop (shell.css, not the polish.css unconditional override)',
    winner('.sidebar', 'overflow-y', 1200)?.value === 'auto');

  const deadSidebarOverflowY = findDeadDeclarations('.sidebar', 'overflow-y');
  if (deadSidebarOverflowY.length) deadSidebarOverflowY.forEach((d) => console.log(`      ${d}`));
  ok('.sidebar has no dead overflow-y declaration (the P1-11 regression — polish.css used to kill shell.css overflow-y: auto)',
    deadSidebarOverflowY.length === 0);

  // overflow (shorthand) is a separate property — the P1-11 bug was
  // specifically the shorthand `overflow: hidden` setting overflow-y
  // implicitly. Cover both spellings.
  const deadSidebarOverflow = findDeadDeclarations('.sidebar', 'overflow');
  if (deadSidebarOverflow.length) deadSidebarOverflow.forEach((d) => console.log(`      ${d}`));
  ok('.sidebar has no dead overflow declaration (the shorthand form of the same bug class)',
    deadSidebarOverflow.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed${failed ? '' : ' — all green'}.`);
if (failed > 0) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
