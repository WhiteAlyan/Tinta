// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-1-39
//
// P2-10 documentation — modal.js and drawer.js implement parallel
// open/close logic for two different overlay concepts:
//   - modal.js (this file): blocking overlays (Library, Settings, etc.)
//     that dim/block the manuscript behind them.
//   - drawer.js: non-blocking inspector/drawer that doesn't dim.
//
// Both implement handleOutsideClick + a teardown that clears innerHTML
// + an outside-click binding pattern + a class toggle for "open". The
// semantics differ enough (modal blocks via backdrop; drawer doesn't)
// that they're not literally interchangeable, but the duplication means
// the same bug class (e.g. P1-6 closeCleanupHooks leak in modal, plus
// the equivalent for drawer's 250ms innerHTML-clear timer at drawer.js:26)
// has to be reasoned about in two places. A shared DismissableOverlay
// helper with { blocks: bool, escapeHandledExternally: bool } would
// unify them; deferred to a focused refactor session because both files
// are large (modal 334 LOC, drawer 995 LOC) and the unification needs
// to preserve the semantic differences, not just dedup the code.

import { q, html, raw, toBridge } from './dom-utils.js';
import * as TTS from './tts.js';

let activeOnClose = null;
// The currently-pending confirmDialog, if any — one at a time, like native.
let activeConfirm = null;
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-47-54
let openGeneration = 0;

function handleOutsideClick(e) {
  const root = q('modal-root');
  if (!root) return;
  const backdrop = root.querySelector('.modal-backdrop');
  if (!backdrop) return;
  // P1-6 fix — route backdrop-dismiss through closeModal(), not teardown()
  // directly. teardown() skips closeCleanupHooks (line 97 only iterates them
  // inside closeModal), so dismissing the Library modal by backdrop-click
  // used to leak libraryCoverUrls object URLs, persist libraryFilters into
  // the next open, and leave closeLibraryMenusOnOutsideClick on document
  // until some unrelated closeModal() fired. closeModal() runs the hooks
  // plus the same teardown() path, so this is a strict superset of the old
  // behavior — the only addition is that confirm dialogs cancel and TTS
  // stops on backdrop dismiss, both of which are correct behavior.
  if (e.target === backdrop) closeModal();
}

function handleEscape(e) {
  // P1-6 (companion) — same fix as handleOutsideClick: route through
  // closeModal() so closeCleanupHooks run on Escape dismiss too. Without
  // this, pressing Escape on the Library modal would leak the same
  // libraryCoverUrls / libraryFilters / document listener that
  // backdrop-dismiss used to leak.
  if (e.key === 'Escape') closeModal();
}

function unbindGlobalListeners() {
  document.removeEventListener('click', handleOutsideClick, { capture: true });
  document.removeEventListener('keydown', handleEscape);
}

function bindGlobalListeners() {
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-75-80
  unbindGlobalListeners();
  document.addEventListener('click', handleOutsideClick, { capture: true });
  document.addEventListener('keydown', handleEscape);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-86-92
export function teardown() {
  const root = q('modal-root');
  if (!root) return false;
  const wasOpen = root.innerHTML.trim() !== '';
  const cb = activeOnClose;
  const generationBeforeCb = openGeneration;
  activeOnClose = null;
  if (wasOpen && typeof cb === 'function') cb();
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-101-105
  if (openGeneration !== generationBeforeCb) return wasOpen;
  root.innerHTML = '';
  unbindGlobalListeners();
  return wasOpen;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-112-137
export function openModal({ title = '', body = '', className = '', showHeader = true, onClose = null } = {}) {
  const root = q('modal-root');
  if (!root) return null;
  // Closing whatever's open first (running ITS onClose) means stacking
  // a second openModal() call on top of an unclosed first one can never
  // leak the first modal's onClose or listeners.
  teardown();
  openGeneration++;
  activeOnClose = onClose;

  const headerHtml = showHeader
    ? html`<div class="modal-header"><h2>${raw(title)}</h2><button id="modal-close" class="modal-close">✕</button></div>`
    : '';

  root.innerHTML = toBridge(html`
    <div class="modal-backdrop">
      <div class="modal-panel${className ? ' ' + className : ''}">
        ${headerHtml}
        ${raw(body)}
      </div>
    </div>
  `);

  const closeBtn = q('modal-close');
  // P1-6 (companion) — same fix: X-button dismiss goes through closeModal()
  // so closeCleanupHooks run on this path too.
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal());
  bindGlobalListeners();
  return root;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-167-193
const closeCleanupHooks = [];

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-196-200
export function onModalCloseCleanup(fn) {
  closeCleanupHooks.push(fn);
}

export function closeModal() {
  const modalRoot = q('modal-root');
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-207-210
  const wasOpen = modalRoot ? modalRoot.innerHTML.trim() !== '' : false;
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-94-102
  if (activeConfirm) activeConfirm.finish(activeConfirm.cancelledValue);
  if (TTS.isSpeaking() || TTS.isPaused()) TTS.stop();
  closeCleanupHooks.forEach((fn) => fn(wasOpen));
  teardown();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-217-252
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  // Supersede any pending dialog first — its awaiter gets that dialog's
  // own cancelled value (false for a confirm/notice, null for a prompt).
  if (activeConfirm) activeConfirm.finish(activeConfirm.cancelledValue);

  return new Promise((resolve) => {
    let root = q('confirm-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'confirm-root';
      document.body.appendChild(root);
    }

    const previouslyFocused = document.activeElement;
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation?.();
        finish(false);
      } else if (e.key === 'Enter' && !e.target?.closest?.('button')) {
        // Enter confirms only when focus isn't already on one of the two
        // buttons — on a button, the native click path fires and this
        // handler must not double-resolve.
        e.preventDefault();
        e.stopPropagation?.();
        finish(true);
      }
    };
    const outsideHandler = (e) => {
      if (e.target === root.querySelector('.confirm-backdrop')) finish(false);
    };

    function finish(result) {
      activeConfirm = null;
      document.removeEventListener('keydown', escapeHandler, { capture: true });
      document.removeEventListener('click', outsideHandler, { capture: true });
      root.innerHTML = '';
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-290-295
      try {
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          previouslyFocused.focus();
        }
      } catch { /* element was detached during the await */ }
      resolve(result);
    }

    // StopPropagation is a no-op on the smoketest's flat listener shims —
    // optional-call keeps both worlds honest.
    root.innerHTML = toBridge(html`
      <div class="modal-backdrop confirm-backdrop">
        <div class="modal-panel confirm-panel" role="alertdialog" aria-modal="true" aria-label="${title}">
          <h2 class="confirm-title">${title}</h2>
          <p class="confirm-message">${message}</p>
          <div class="confirm-actions">
            <button id="confirm-cancel-btn" class="toolbar-btn">${cancelLabel}</button>
            <button id="confirm-ok-btn" class="toolbar-btn${danger ? ' confirm-btn-danger' : ''}">${confirmLabel}</button>
          </div>
        </div>
      </div>
    `);

    root.querySelector('#confirm-cancel-btn').addEventListener('click', () => finish(false));
    root.querySelector('#confirm-ok-btn').addEventListener('click', () => finish(true));

    // Capture phase: fires before every bubble-phase keydown listener in
    // the app (modal.js's Escape teardown, the command registry's global
    // dispatch), and stopPropagation keeps them from seeing this one.
    document.addEventListener('keydown', escapeHandler, { capture: true });
    document.addEventListener('click', outsideHandler, { capture: true });

    const okBtn = root.querySelector('#confirm-ok-btn');
    const cancelBtn = root.querySelector('#confirm-cancel-btn');
    (danger ? cancelBtn : okBtn).focus();

    activeConfirm = { finish, cancelledValue: false };
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-336-350

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-352-357
export function promptDialog({ title = 'Your answer', message = '', defaultValue = '', placeholder = '', okLabel = 'Save', cancelLabel = 'Cancel' } = {}) {
  if (activeConfirm) activeConfirm.finish(activeConfirm.cancelledValue);

  return new Promise((resolve) => {
    let root = q('confirm-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'confirm-root';
      document.body.appendChild(root);
    }

    const previouslyFocused = document.activeElement;
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation?.();
        finish(null);
      } else if (e.key === 'Enter' && !e.target?.closest?.('button')) {
        // Enter confirms from anywhere that isn't a button (the input,
        // mostly) — on a button the native click path already fired.
        e.preventDefault();
        e.stopPropagation?.();
        finish(inputEl ? inputEl.value : '');
      }
    };
    const outsideHandler = (e) => {
      if (e.target === root.querySelector('.confirm-backdrop')) finish(null);
    };

    function finish(result) {
      activeConfirm = null;
      document.removeEventListener('keydown', escapeHandler, { capture: true });
      document.removeEventListener('click', outsideHandler, { capture: true });
      root.innerHTML = '';
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-392-397
      try {
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          previouslyFocused.focus();
        }
      } catch { /* element was detached during the await */ }
      resolve(result);
    }

    root.innerHTML = toBridge(html`
      <div class="modal-backdrop confirm-backdrop">
        <div class="modal-panel confirm-panel" role="dialog" aria-modal="true" aria-label="${title}">
          <h2 class="confirm-title">${title}</h2>
          ${message ? html`<p class="confirm-message">${message}</p>` : ''}
          <input id="confirm-input" class="confirm-input" type="text" value="${defaultValue}" placeholder="${placeholder}" aria-label="${title}" />
          <div class="confirm-actions">
            <button id="confirm-cancel-btn" class="toolbar-btn">${cancelLabel}</button>
            <button id="confirm-ok-btn" class="toolbar-btn">${okLabel}</button>
          </div>
        </div>
      </div>
    `);

    const inputEl = root.querySelector('#confirm-input');
    root.querySelector('#confirm-cancel-btn').addEventListener('click', () => finish(null));
    root.querySelector('#confirm-ok-btn').addEventListener('click', () => finish(inputEl.value));

    document.addEventListener('keydown', escapeHandler, { capture: true });
    document.addEventListener('click', outsideHandler, { capture: true });

    inputEl.focus();
    inputEl.select?.(); // native prompt preselects the default — same affordance

    activeConfirm = { finish, cancelledValue: null };
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-434-437
export function noticeDialog({ title = 'Notice', message = '', okLabel = 'OK' } = {}) {
  if (activeConfirm) activeConfirm.finish(activeConfirm.cancelledValue);

  return new Promise((resolve) => {
    let root = q('confirm-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'confirm-root';
      document.body.appendChild(root);
    }

    const previouslyFocused = document.activeElement;
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation?.();
        finish(false);
      } else if (e.key === 'Enter' && !e.target?.closest?.('button')) {
        e.preventDefault();
        e.stopPropagation?.();
        finish(true);
      }
    };
    const outsideHandler = (e) => {
      if (e.target === root.querySelector('.confirm-backdrop')) finish(false);
    };

    function finish(result) {
      activeConfirm = null;
      document.removeEventListener('keydown', escapeHandler, { capture: true });
      document.removeEventListener('click', outsideHandler, { capture: true });
      root.innerHTML = '';
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js-470-475
      try {
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          previouslyFocused.focus();
        }
      } catch { /* element was detached during the await */ }
      resolve(result);
    }

    root.innerHTML = toBridge(html`
      <div class="modal-backdrop confirm-backdrop">
        <div class="modal-panel confirm-panel" role="alertdialog" aria-modal="true" aria-label="${title}">
          <h2 class="confirm-title">${title}</h2>
          <p class="confirm-message">${message}</p>
          <div class="confirm-actions">
            <button id="notice-ok-btn" class="toolbar-btn">${okLabel}</button>
          </div>
        </div>
      </div>
    `);

    root.querySelector('#notice-ok-btn').addEventListener('click', () => finish(true));

    document.addEventListener('keydown', escapeHandler, { capture: true });
    document.addEventListener('click', outsideHandler, { capture: true });

    root.querySelector('#notice-ok-btn').focus();

    activeConfirm = { finish, cancelledValue: false };
  });
}
