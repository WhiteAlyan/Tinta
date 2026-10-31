// Tinta — CR-44 accessibility smoketest.
//
// Three gates in one file, because they protect the same contract from
// the same kind of silent drift ("it still LOOKS right"):
//
//   1. Contrast — parses css/base.css's three theme blocks and enforces
//      WCAG ratios per token tier. Text-tier tokens (ink family,
//      accent-deep, status colors) must hold 4.5:1 on BOTH card surfaces
//      (--paper and --bg); the accent/entity dot-and-badge tier holds
//      3:1 (WCAG 1.4.11 non-text + large-text). A future theme tweak
//      that quietly regresses any pair fails this file, not a reader.
//
//   2. Icon-button names — scans js/*.js + index.html for <button>
//      tags carrying a title but no aria-label whose visible content is
//      a bare glyph. Those are invisible to assistive tech (title is a
//      tooltip, not a name). Buttons with real text content are named
//      by that content and are exempt (title stays a tooltip there).
//
//   3. Structure — source-level pins on the CR-13/CR-44 contract:
//      modal panels are labelled dialogs with a tabindex, the drawer is
//      a non-modal dialog, nav tabs and chapter rows carry aria-current,
//      the palette is a combobox, toasts are live regions, and the
//      focus-visible ring exists. Same assertion style as the
//      sw-precache drift test: read the real source, fail loudly.
//
// Plus behavioral unit tests for a11y.js itself (trapTabKey wrapping,
// restoreFocus guards, announce() live-region reuse) against tiny fakes.
//
// Run with: node a11y.smoketest.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function section(title) { console.log(`\n${title}`); }

// ══ 1. contrast audit ═══════════════════════════════════════════════════
section('contrast — three themes, tiered WCAG thresholds');

function relativeLuminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg), l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const baseCss = fs.readFileSync(path.join(ROOT, 'css', 'base.css'), 'utf8');
function themeBlock(fromMarker, toMarker) {
  const start = baseCss.indexOf(fromMarker);
  const end = toMarker ? baseCss.indexOf(toMarker, start) : baseCss.indexOf('*, *::before', start);
  const vars = {};
  for (const m of baseCss.slice(start, end).matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    vars[m[1]] = m[2];
  }
  return vars;
}
const themes = {
  paper: themeBlock('[data-theme="paper"]', '[data-theme="void"]'),
  void: themeBlock('[data-theme="void"]', '[data-theme="sepia"]'),
  sepia: themeBlock('[data-theme="sepia"]', null),
};

// Text tier: 4.5:1 on both card surfaces. Dot/badge tier: 3:1 (non-text
// components and large labels only — real text on this tier goes through
// the 4.5 tokens above).
const TEXT_TIER = ['ink', 'ink-soft', 'ink-faint', 'accent-deep', 'status-draft', 'status-revised', 'status-final'];
const UI_TIER = ['accent', 'entity-character', 'entity-location', 'entity-item', 'entity-concept'];

for (const [name, vars] of Object.entries(themes)) {
  for (const token of TEXT_TIER) {
    for (const surface of ['paper', 'bg']) {
      const r = contrastRatio(vars[token], vars[surface]);
      assert(r >= 4.5, `${name}: --${token} on --${surface} is ${r.toFixed(2)}:1 (needs ≥ 4.5:1 — text tier)`);
    }
  }
  for (const token of UI_TIER) {
    for (const surface of ['paper', 'bg']) {
      const r = contrastRatio(vars[token], vars[surface]);
      assert(r >= 3, `${name}: --${token} on --${surface} is ${r.toFixed(2)}:1 (needs ≥ 3:1 — UI/dot tier)`);
    }
  }
  const editorR = contrastRatio(vars.ink, vars['editor-bg']);
  assert(editorR >= 4.5, `${name}: --ink on --editor-bg is ${editorR.toFixed(2)}:1 (needs ≥ 4.5:1 — the manuscript itself)`);
}

// ══ 2. icon-button name gate ════════════════════════════════════════════
section('icon buttons — every glyph-only button carries aria-label');

const openTagRe = /<button\b(?![^>]*\baria-label=)[^>]*?\btitle="([^"]+)"[^>]*?>/g;
let unnamedIconButtons = 0;

function scanSource(label, src) {
  let m;
  openTagRe.lastIndex = 0;
  while ((m = openTagRe.exec(src)) !== null) {
    // Visible-content check on the same line, up to </button> (same
    // heuristic as the codemod that did the bulk pass): strip nested
    // tags and ${...} template bits; letters/digits mean the button is
    // named by its own text, so title-only is legitimate there.
    const tagEnd = m.index + m[0].length;
    const lineEnd = src.indexOf('\n', m.index);
    const rest = lineEnd > 0 ? src.slice(tagEnd, lineEnd) : src.slice(tagEnd);
    const closeIdx = rest.indexOf('</button>');
    const inner = closeIdx >= 0 ? rest.slice(0, closeIdx) : rest;
    const visible = inner.replace(/<[^>]*>/g, '').replace(/\$\{[^}]*\}/g, '');
    if (!/[A-Za-z0-9]/.test(visible)) {
      unnamedIconButtons++;
      console.error(`  ✗ glyph-only button without aria-label in ${label}: ${m[0].slice(0, 90)}`);
    }
  }
}

const jsDir = path.join(ROOT, 'js');
for (const file of fs.readdirSync(jsDir).sort()) {
  if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;
  if (file.includes('smoketest')) continue; // test shims may fake markup
  scanSource(`js/${file}`, fs.readFileSync(path.join(jsDir, file), 'utf8'));
}
scanSource('index.html', fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
assert(unnamedIconButtons === 0, `every glyph-only titled button has an accessible name (found ${unnamedIconButtons} unnamed)`);

// ══ 3. structure pins ═══════════════════════════════════════════════════
section('structure — the CR-13/CR-44 contract is actually in the source');

const modalSrc = fs.readFileSync(path.join(jsDir, 'modal.js'), 'utf8');
assert(modalSrc.includes('role="dialog" aria-modal="true" tabindex="-1"'), 'openModal panel: role=dialog + aria-modal + tabindex=-1');
assert(modalSrc.includes('id="modal-title"'), 'openModal header h2 has id=modal-title (aria-labelledby target)');
assert(modalSrc.includes('aria-labelledby="modal-title"'), 'openModal panel is labelled by its title');
assert(modalSrc.includes('aria-label="Close"') && modalSrc.includes('id="modal-close"'), 'modal close button is named');
assert(modalSrc.includes('trapTabKey'), 'modal keydown path traps Tab');
assert(modalSrc.includes('restoreFocus(lastFocusedBeforeModal)'), 'modal close restores opener focus');

const drawerSrc = fs.readFileSync(path.join(jsDir, 'drawer.js'), 'utf8');
// Non-modal dialog: role=dialog WITHOUT aria-modal (the drawer deliberately
// doesn't block the manuscript behind it).
assert(/class="drawer-panel" role="dialog" tabindex="-1"/.test(drawerSrc), 'drawer panel: role=dialog + tabindex=-1 (no aria-modal — non-blocking by design)');
assert(drawerSrc.includes("aria-label=\"Close\"") && drawerSrc.includes('id="drawer-close"'), 'drawer close button is named');
assert(drawerSrc.includes("panel.setAttribute('aria-label', label)"), 'drawer panel is labelled from its .drawer-title');
assert(drawerSrc.includes('restoreFocus(lastFocusedBeforeDrawer)'), 'drawer close restores opener focus');

const navSrc = fs.readFileSync(path.join(jsDir, 'nav.js'), 'utf8');
assert((navSrc.match(/aria-current="page"/g) || []).length >= 2, 'nav: aria-current="page" in BOTH paint paths (grouped + compact)');
assert(navSrc.includes("e.key === 'Escape'") && navSrc.includes('closeFlyoutAndRefocus'), 'nav flyout: Escape closes and refocuses the toggle');

const sidebarSrc = fs.readFileSync(path.join(jsDir, 'sidebar.js'), 'utf8');
assert(sidebarSrc.includes("row.setAttribute('role', 'button')"), 'sidebar chapter row is keyboard-reachable (role=button)');
assert(sidebarSrc.includes("row.setAttribute('tabindex', '0')"), 'sidebar chapter row has tabindex=0');
assert(sidebarSrc.includes("row.setAttribute('aria-current'"), 'sidebar active chapter carries aria-current');
assert(sidebarSrc.includes("header.setAttribute('aria-expanded'"), 'act group headers expose aria-expanded');

const paletteSrc = fs.readFileSync(path.join(jsDir, 'commandPalette.js'), 'utf8');
assert(paletteSrc.includes('role="combobox"') && paletteSrc.includes('aria-controls="palette-results"'), 'palette input is a combobox pointing at its listbox');
assert(paletteSrc.includes('role="listbox"') && paletteSrc.includes('role="option"'), 'palette results are a listbox of options');
assert(paletteSrc.includes('aria-activedescendant'), 'palette announces the highlighted option via aria-activedescendant');

const toastSrc = fs.readFileSync(path.join(jsDir, 'toast.js'), 'utf8');
assert(toastSrc.includes('role="status"'), 'toasts are polite live regions (role=status)');
assert(toastSrc.includes('role="alert"'), 'storage warnings are assertive (role=alert)');
assert((toastSrc.match(/aria-label="Dismiss"/g) || []).length === 2, 'both toast dismiss buttons are named');

const appSrc = fs.readFileSync(path.join(jsDir, 'app.js'), 'utf8');
assert(appSrc.includes("announce("), 'app.js announces view changes through the live region');
assert(appSrc.includes("sidebarToggle.setAttribute('aria-expanded'"), 'sidebar toggle exposes aria-expanded');

const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert(indexSrc.includes('aria-label="Quick switcher'), 'shell palette button is named');

const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
assert(swSrc.includes("'./js/a11y.js'"), 'a11y.js is precached in sw.js SHELL_FILES (offline shell completeness)');

const polishSrc = fs.readFileSync(path.join(ROOT, 'css', 'polish.css'), 'utf8');
assert(polishSrc.includes(':focus-visible'), 'a themed :focus-visible ring exists (keyboard focus visibility)');

// ══ 4. a11y.js behavior ═════════════════════════════════════════════════
section('a11y.js — trapTabKey / restoreFocus / announce behavior');

const { trapTabKey, restoreFocus, announce } = await import('./a11y.js');

function fakeFocusable(name) {
  return { name, focus(opts) { this.lastFocusOpts = opts; this.focused = (this.focused || 0) + 1; } };
}
function fakeContainer(items) {
  return { querySelectorAll: () => items };
}

{
  const a = fakeFocusable('a'), b = fakeFocusable('b'), c = fakeFocusable('c');
  const container = fakeContainer([a, b, c]);
  globalThis.document = { activeElement: null };
  // Tab on the last control wraps to the first.
  let e = { key: 'Tab', shiftKey: false };
  assert(trapTabKey(e, container) === true, 'trapTabKey: forward Tab on the last control is handled');
  assert(a.focused === 1, 'trapTabKey: forward wrap focused the FIRST control');
  // Tab on the first control with Shift wraps to the last.
  globalThis.document.activeElement = a;
  e = { key: 'Tab', shiftKey: true };
  assert(trapTabKey(e, container) === true, 'trapTabKey: backward Tab on the first control is handled');
  assert(c.focused === 1, 'trapTabKey: backward wrap focused the LAST control');
  // Tab in the middle is left alone (focus IS in the list, not at an edge).
  globalThis.document.activeElement = b;
  e = { key: 'Tab', shiftKey: false };
  assert(trapTabKey(e, container) === false, 'trapTabKey: in-range Tab is left to the browser');
  // Non-Tab keys are never handled.
  assert(trapTabKey({ key: 'Escape' }, container) === false, 'trapTabKey: non-Tab keys are ignored');
  // Empty/missing container never traps.
  assert(trapTabKey({ key: 'Tab' }, fakeContainer([])) === false, 'trapTabKey: no focusables → not handled');
  assert(trapTabKey({ key: 'Tab' }, null) === false, 'trapTabKey: null container → not handled');
  // Focus outside the list (e.g. on the panel itself) wraps back in.
  globalThis.document.activeElement = null;
  e = { key: 'Tab', shiftKey: false };
  assert(trapTabKey(e, container) === true && a.focused === 2, 'trapTabKey: focus outside the list wraps to the first control');
}

{
  const connected = fakeFocusable('connected');
  connected.isConnected = true;
  assert(restoreFocus(connected) === true && connected.focused === 1, 'restoreFocus: focuses a connected element');
  const detached = fakeFocusable('detached');
  detached.isConnected = false;
  assert(restoreFocus(detached) === false && !detached.focused, 'restoreFocus: skips a detached element (no throw)');
  assert(restoreFocus(null) === false, 'restoreFocus: null is a safe no-op');
  const noOpts = fakeFocusable('no-opts');
  noOpts.isConnected = true;
  noOpts.focus = function () { this.focused = (this.focused || 0) + 1; };
  assert(restoreFocus(noOpts) === true && noOpts.focused === 1, 'restoreFocus: tolerates focus() without an options argument');
}

{
  // announce() against a fake document — the region is created once,
  // reused after, and re-announces identical text via the clear-then-set
  // trick.
  const created = [];
  const region = {
    id: '', style: {}, textContent: '',
    setAttribute(k, v) { this[k] = v; },
    isConnected: true,
  };
  globalThis.document = {
    getElementById: (id) => (id === 'a11y-live' && created.length ? region : null),
    createElement: () => { created.push(region); region.id = 'a11y-live'; return region; },
    body: { appendChild: () => {} },
  };
  announce('Write view');
  assert(created.length === 1, 'announce: creates exactly one live region on first use');
  assert(region.role === 'status' && region['aria-live'] === 'polite', 'announce: region is a polite status region');
  assert(region.textContent === '', 'announce: text is cleared immediately (re-announcement setup)');
  await new Promise((r) => setTimeout(r, 60));
  assert(region.textContent === 'Write view', 'announce: message lands on the region (async)');
  announce('Write view');
  assert(region.textContent === '', 'announce: identical repeat message is cleared first — it will be spoken again');
  await new Promise((r) => setTimeout(r, 60));
  assert(region.textContent === 'Write view', 'announce: repeated message lands again');
  // Reuse path — no second region even after the module cached it.
  announce('Corkboard view');
  assert(created.length === 1, 'announce: the cached region is reused, never duplicated');
  await new Promise((r) => setTimeout(r, 60));
  assert(region.textContent === 'Corkboard view', 'announce: new message replaces the old');
}

// ── summary ───────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail === 0 ? ' — all green.' : ''}`);
if (fail) {
  failures.forEach((f) => console.error(`  FAIL: ${f}`));
  process.exit(1);
}
