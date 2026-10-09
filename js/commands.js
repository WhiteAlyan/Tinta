// Historical context: see docs/CODEBASE_NOTES.md#jscommands-js-1-39

import { q } from './dom-utils.js';

// Stable group display order for the Settings table — pinned explicitly so
// reordering entries in COMMANDS can't silently reorder section headers.
export const SHORTCUT_GROUP_ORDER = ['Navigation', 'Editing', 'Writing', 'Views'];

// Historical context: see docs/CODEBASE_NOTES.md#jscommands-js-47-70
export const COMMANDS = [
  // Undo/redo entries below share isTextEditingField() — see its comment for
  // why the guard is load-bearing, not a nicety.
  // ── global: dispatched by handleGlobalShortcut ──
  {
    id: 'palette.open', label: 'Command palette', desc: 'Open the command palette',
    group: 'Navigation', keys: ['Mod', 'K'], match: { mod: true, key: 'k' },
    pd: 'before', palette: false, run: (ctx) => ctx.openCommandPalette(),
  },
  {
    id: 'chrome.closeOverlay', label: 'Close overlay', desc: 'Close the open modal, menu, or popover',
    group: 'Navigation', keys: ['Esc'], match: { key: 'Escape' },
    pd: false, palette: false,
    run: (ctx) => { ctx.closeOverlays(); return true; },
  },
  {
    id: 'edit.undo', label: 'Undo', desc: 'Undo the last project action (native undo keeps working while you type)',
    group: 'Editing', keys: ['Mod', 'Z'], match: { mod: true, shift: false, key: 'z' },
    pd: 'when-ran', palette: true,
    run: (ctx) => {
      if (isTextEditingField()) return false;
      ctx.performUndo();
      return true;
    },
  },
  {
    id: 'edit.redo', label: 'Redo', desc: 'Redo the last undone project action (outside text fields, same as Undo)',
    group: 'Editing', keys: ['Mod', 'Shift', 'Z'], match: { mod: true, shift: true, key: 'z' },
    pd: 'when-ran', palette: true,
    run: (ctx) => {
      if (isTextEditingField()) return false;
      ctx.performRedo();
      return true;
    },
  },
  {
    id: 'edit.redo.alt', label: 'Redo', desc: 'Windows-convention redo, same as Mod+Shift+Z',
    group: 'Editing', keys: ['Mod', 'Y'], match: { mod: true, key: 'y' },
    pd: 'when-ran', palette: false,
    run: (ctx) => {
      if (isTextEditingField()) return false;
      ctx.performRedo();
      return true;
    },
  },
  {
    id: 'book.turnPage', label: 'Turn the page', desc: 'Turn the page (in Book / Read mode)',
    group: 'Views', keys: ['←', '→'], match: { keys: ['ArrowLeft', 'ArrowRight'] },
    pd: false, palette: false, when: (ctx) => ctx.getActiveView() === 'book',
    run: (ctx, e) => {
// Historical context: see docs/CODEBASE_NOTES.md#jscommands-js-121-124
      const btn = q(e.key === 'ArrowRight' ? 'book-next-page-btn' : 'book-prev-page-btn');
      if (!btn || btn.disabled) return false;
      e.preventDefault();
      btn.click();
      return true;
    },
  },

  // ── metadata-only: behavior stays with its owning surface (boundary, see
  //    the module header). The help table documents these from here so it
  //    can't drift; the scope field names where the listener actually lives.
  {
    id: 'palette.navigate', label: 'Move through suggestions',
    desc: 'Move through suggestions (command palette, @mentions)',
    group: 'Navigation', keys: ['↑', '↓'], scope: 'palette',
    palette: false, run: null,
  },
  {
    id: 'palette.pick', label: 'Pick the highlighted suggestion',
    desc: 'Pick the highlighted suggestion',
    group: 'Navigation', keys: ['Enter', 'Tab'], scope: 'palette',
    palette: false, run: null,
  },
  {
    id: 'editor.bold', label: 'Toggle bold', desc: 'Toggle bold (in the chapter editor)',
    group: 'Editing', keys: ['Mod', 'B'], scope: 'editor',
    palette: false, run: null,
  },
  {
    id: 'editor.italic', label: 'Toggle italic', desc: 'Toggle italic (in the chapter editor)',
    group: 'Editing', keys: ['Mod', 'I'], scope: 'editor',
    palette: false, run: null,
  },
  {
    id: 'snippets.quickSave', label: 'Quick-save a snippet',
    desc: 'Quick-save a new snippet (in the Snippets panel)',
    group: 'Writing', keys: ['Mod', 'Enter'], scope: 'snippets',
    palette: false, run: null,
  },
];

// ── display helpers (moved here from app.js — the help table and palette
//    sublabels are registry consumers and this is registry-shaped data) ──

export function isMacPlatform() {
  if (typeof navigator === 'undefined') return false; // Node smoketest shims
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
}

const isMac = isMacPlatform;

// 'Mod' is a stand-in for whichever modifier the current platform actually
// uses — Cmd on Mac, Ctrl everywhere else — so COMMANDS' keys arrays don't
// have to hardcode one and be wrong for half of everyone reading them.
export function shortcutKeyLabel(key) {
  return key === 'Mod' ? (isMac() ? '⌘' : 'Ctrl') : key;
}

// '⌘Z'-style compact label for palette sublabels.
export function commandKeysLabel(entry) {
  return entry.keys.map((k) => shortcutKeyLabel(k)).join('+');
}

// ── global dispatch ─────────────────────────────────────────────────────

let boundCtx = null;

// Historical context: see docs/CODEBASE_NOTES.md#jscommands-js-192-203
function isTextEditingField() {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  return !!active && (
    active.tagName === 'TEXTAREA' ||
    (active.tagName === 'INPUT' && ['text', 'search', 'url', 'email'].includes(active.type))
  );
}

function matchCombo(e, m) {
  if (m.mod && !(e.metaKey || e.ctrlKey)) return false;
  if (m.shift !== undefined && !!e.shiftKey !== !!m.shift) return false;
  if (m.keys) return m.keys.includes(e.key);
// Historical context: see docs/CODEBASE_NOTES.md#jscommands-js-216-219
  return e.key.toLowerCase() === m.key.toLowerCase();
}

// Historical context: see docs/CODEBASE_NOTES.md#jscommands-js-223-227
export function handleGlobalShortcut(e, ctx = boundCtx) {
  if (!ctx) return false;
  for (const entry of COMMANDS) {
    if (!entry.match || typeof entry.run !== 'function') continue; // metadata-only entries
    if (entry.when && !entry.when(ctx)) continue;
    if (!matchCombo(e, entry.match)) continue;
    if (entry.pd === 'before') e.preventDefault();
    const handled = entry.run(ctx, e);
    if (entry.pd === 'when-ran' && handled) e.preventDefault();
    return true;
  }
  return false;
}

// Historical context: see docs/CODEBASE_NOTES.md#jscommands-js-242-245
export function attachGlobalShortcuts(ctx) {
  boundCtx = ctx;
  document.addEventListener('keydown', (e) => handleGlobalShortcut(e, ctx));
}

// Historical context: see docs/CODEBASE_NOTES.md#jscommands-js-251-254
export function getPaletteCommands() {
  if (!boundCtx) return [];
  return COMMANDS.filter((c) => c.palette && typeof c.run === 'function').map((c) => ({
    kind: 'command',
    label: c.label,
    sublabel: commandKeysLabel(c),
    action: () => { c.run(boundCtx, null); },
  }));
}
