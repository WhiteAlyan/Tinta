// Command/shortcut registry pass (v0.2 Phase 5: UI unification) — contract
// tests for commands.js.
//
// The registry has three consumers (global keydown dispatch, the Settings
// help table, the palette's command rows), and its whole point is that
// those three can't drift apart — so this file pins the contract from both
// ends: structural (every entry is displayable and dispatchable per its
// own flags) and behavioral (handleGlobalShortcut reproduces the old
// inline handler's exact semantics: first-match-wins order, the undo/redo
// text-field guard, per-entry preventDefault behavior, the Book view gate).
//
// Same module-load pattern as nav.smoketest.mjs: a minimal DOM shim so the
// module imports cleanly (commands.js touches document only at dispatch
// time — attachGlobalShortcuts adds a listener, the book-arrow run() looks
// up page buttons via q()).

class ElementShim {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.type = '';
    this.disabled = false;
    this.clicked = 0;
    this.style = {};
  }
  setAttribute() {}
  addEventListener() {}
  removeEventListener() {}
  appendChild() {}
  remove() {}
  click() { this.clicked++; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }; }
}

// Book-arrow dispatch resolves buttons via q() -> document.getElementById.
const bookBtns = {
  'book-next-page-btn': new ElementShim('button'),
  'book-prev-page-btn': new ElementShim('button'),
};

globalThis.document = {
  createElement: (tag) => new ElementShim(tag),
  getElementById: (id) => bookBtns[id] || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
  activeElement: null,
  body: new ElementShim('body'),
  documentElement: new ElementShim('html'),
};
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const { COMMANDS, SHORTCUT_GROUP_ORDER, handleGlobalShortcut, getPaletteCommands, attachGlobalShortcuts, shortcutKeyLabel, commandKeysLabel, isMacPlatform } = await import('./commands.js');

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ok - ${msg}`); }
  else { fail++; console.error(`  FAIL - ${msg}`); }
}

// Synthetic keydown event.
function key(keyName, { mod = false, shift = false } = {}) {
  const pdCalls = [];
  return { key: keyName, metaKey: mod, ctrlKey: false, shiftKey: shift, preventDefault: () => pdCalls.push(1), _pdCalls: pdCalls };
}

// Fresh ctx recording which command ran.
function makeCtx() {
  const calls = [];
  return {
    calls,
    openCommandPalette: () => calls.push('palette'),
    performUndo: () => calls.push('undo'),
    performRedo: () => calls.push('redo'),
    closeModal: () => calls.push('closeModal'),
    closeDrawer: () => calls.push('closeDrawer'),
    closeNavFlyout: () => calls.push('closeFlyout'),
    getFocusLevel: () => 'off',
    setFocusLevel: () => calls.push('focusOff'),
    updateFocusButtons: () => calls.push('focusButtons'),
    focusShell: null,
    cancelCanvasLinkMode: () => calls.push('cancelLinkMode'),
    getActiveView: () => 'write',
    closeOverlays: () => calls.push('closeOverlays'),
  };
}

// ── 1. registry structural contract ─────────────────────────────────────
console.log('Registry contract');

const ids = COMMANDS.map((c) => c.id);
assert(new Set(ids).size === ids.length, 'command ids are unique');
assert(ids.length >= 11, `registry has the full entry set (${ids.length} entries)`);

for (const c of COMMANDS) {
  assert(!!c.id && !!c.label && !!c.desc && !!c.group && Array.isArray(c.keys), `${c.id}: id/label/desc/group/keys all present`);
  assert(SHORTCUT_GROUP_ORDER.includes(c.group), `${c.id}: group "${c.group}" is in SHORTCUT_GROUP_ORDER`);
  if (c.match) {
    assert(typeof c.run === 'function', `${c.id}: dispatchable entry has a run()`);
    assert(['before', 'when-ran', false].includes(c.pd), `${c.id}: pd is a known mode`);
  } else {
    assert(typeof c.scope === 'string' && c.scope.length > 0, `${c.id}: metadata-only entry names its owning surface (scope: "${c.scope}")`);
    assert(c.run === null, `${c.id}: metadata-only entry has run: null (dispatch stays with its surface)`);
  }
}

const groupsRendered = new Set(COMMANDS.map((c) => c.group));
assert(groupsRendered.size === SHORTCUT_GROUP_ORDER.length, 'SHORTCUT_GROUP_ORDER covers every group actually used (no dead headers)');

// ── 2. dispatch semantics ───────────────────────────────────────────────
console.log('Dispatch semantics');

// Mod+K — pd BEFORE run (the address-bar race the old comment described).
{
  const ctx = makeCtx();
  const e = key('k', { mod: true });
  assert(handleGlobalShortcut(e, ctx) === true, 'Mod+K dispatches');
  assert(e._pdCalls.length === 1 && ctx.calls.join() === 'palette', 'Mod+K: preventDefault fires before the palette opens');
}

// Undo / redo split, including the shift-exactness that keeps Mod+Shift+Z
// from falling through into undo (first-match-wins, exact shift match).
{
  const ctx = makeCtx();
  handleGlobalShortcut(key('z', { mod: true }), ctx);
  assert(ctx.calls.join() === 'undo', 'Mod+Z performs undo');
}
{
  const ctx = makeCtx();
  const e = key('z', { mod: true, shift: true });
  handleGlobalShortcut(e, ctx);
  assert(ctx.calls.join() === 'redo' && e._pdCalls.length === 1, 'Mod+Shift+Z performs redo (and only redo) with pd');
}
{
  const ctx = makeCtx();
  const e = key('y', { mod: true });
  handleGlobalShortcut(e, ctx);
  assert(ctx.calls.join() === 'redo' && e._pdCalls.length === 1, 'Mod+Y performs redo (Windows convention)');
}

// Text-field guard: while typing, the browser's native undo wins — no
// interception, no preventDefault (this is the load-bearing guard).
{
  const ctx = makeCtx();
  document.activeElement = { tagName: 'TEXTAREA' };
  const e = key('z', { mod: true });
  handleGlobalShortcut(e, ctx);
  assert(ctx.calls.length === 0 && e._pdCalls.length === 0, 'Mod+Z inside a textarea is left to native undo');
  document.activeElement = { tagName: 'INPUT', type: 'search' };
  const e2 = key('y', { mod: true });
  handleGlobalShortcut(e2, ctx);
  assert(ctx.calls.length === 0, 'Mod+Y inside a search input is left alone too');
  document.activeElement = null;
}

// Escape — closes overlays, never preventDefaults (old behavior: the
// browser's own Escape semantics stay untouched).
{
  const ctx = makeCtx();
  const e = key('Escape');
  handleGlobalShortcut(e, ctx);
  assert(ctx.calls.join() === 'closeOverlays' && e._pdCalls.length === 0, 'Escape closes overlays without preventDefault');
}

// Book arrows — gated on the active view AND the button existing/enabled.
{
  const ctx = makeCtx();
  ctx.getActiveView = () => 'book';
  const e = key('ArrowRight');
  handleGlobalShortcut(e, ctx);
  assert(bookBtns['book-next-page-btn'].clicked === 1 && e._pdCalls.length === 1, 'ArrowRight in Book mode turns the page');
  handleGlobalShortcut(key('ArrowLeft'), ctx);
  assert(bookBtns['book-prev-page-btn'].clicked === 1, 'ArrowLeft turns back a page');
}
{
  const ctx = makeCtx(); // getActiveView defaults to 'write'
  const before = bookBtns['book-next-page-btn'].clicked;
  const e = key('ArrowRight');
  handleGlobalShortcut(e, ctx);
  assert(bookBtns['book-next-page-btn'].clicked === before && ctx.calls.length === 0, 'Book arrows are inert outside Book view');
}
{
  const ctx = makeCtx();
  ctx.getActiveView = () => 'book';
  const btn = bookBtns['book-next-page-btn'];
  const before = btn.clicked; // earlier tests clicked it — assert no NEW click
  btn.disabled = true;
  const e = key('ArrowRight');
  handleGlobalShortcut(e, ctx);
  assert(btn.clicked === before && e._pdCalls.length === 0, 'a disabled page button is not force-clicked, and nothing else fires');
  btn.disabled = false;
}

// No claim, no harm: an unbound key reports false and touches nothing.
{
  const ctx = makeCtx();
  assert(handleGlobalShortcut(key('F9'), ctx) === false && ctx.calls.length === 0, 'unbound keys fall through untouched');
  assert(handleGlobalShortcut(key('k'), ctx) === false, 'plain K (no Mod) is not the palette');
  assert(handleGlobalShortcut(key('z', { shift: true }), ctx) === false, 'plain Shift+Z (no Mod) is not undo/redo');
}

// ── 3. palette rows ─────────────────────────────────────────────────────
console.log('Palette rows');

assert(getPaletteCommands().length === 0, 'no palette rows before attachGlobalShortcuts');

const ctx = makeCtx();
attachGlobalShortcuts(ctx);
const rows = getPaletteCommands();
assert(rows.length === 2, `runnable palette-flagged entries exposed (${rows.length}: Undo + Redo)`);
assert(rows.every((r) => r.kind === 'command' && r.label && r.sublabel && typeof r.action === 'function'), 'palette rows carry kind/label/sublabel/action');
{
  const ctx2 = makeCtx();
  getPaletteCommands().length; // registry rows are bound to the FIRST ctx on purpose? no — see below
}
// Rows must run against the bound ctx (attach is the binding point).
{
  const fresh = makeCtx();
  attachGlobalShortcuts(fresh);
  const freshRows = getPaletteCommands();
  freshRows.find((r) => r.label === 'Undo').action();
  assert(fresh.calls.join() === 'undo', 'palette row action runs against the bound ctx');
}

// ── 4. display helpers ──────────────────────────────────────────────────
console.log('Display helpers');

assert(shortcutKeyLabel('Mod') === (isMacPlatform() ? '⌘' : 'Ctrl'), 'Mod renders as the platform modifier glyph');
assert(commandKeysLabel(COMMANDS.find((c) => c.id === 'edit.undo')) === shortcutKeyLabel('Mod') + '+Z', 'commandKeysLabel joins with +');
assert(typeof isMacPlatform() === 'boolean', 'isMacPlatform returns a boolean (shim-safe)');

console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail) process.exit(1);
