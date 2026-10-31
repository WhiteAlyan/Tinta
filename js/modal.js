// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
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

import { q, qs, html, raw, toBridge } from './dom-utils.js';
import * as TTS from './tts.js';
import { trapTabKey, restoreFocus } from './a11y.js';

let activeOnClose = null;
// The currently-pending confirmDialog, if any — one at a time, like native.
let activeConfirm = null;
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
let openGeneration = 0;
// CR-44 — what was focused when the current modal opened. Restored on
// close (see teardown), so dismissing a dialog returns keyboard/screen-
// reader focus to the control that opened it instead of dropping it at
// <body>. Stacking composes naturally: openModal() tears down the
// previous modal first, which restores ITS opener, and the new modal
// then captures that restored element as its own opener.
let lastFocusedBeforeModal = null;

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

function handleKeydown(e) {
  // P1-6 (companion) — same fix as handleOutsideClick: route through
  // closeModal() so closeCleanupHooks run on Escape dismiss too. Without
  // this, pressing Escape on the Library modal would leak the same
  // libraryCoverUrls / libraryFilters / document listener that
  // backdrop-dismiss used to leak.
  if (e.key === 'Escape') {
    closeModal();
    return;
  }
  // CR-13 — blocking modals keep Tab inside their panel (WAI-ARIA dialog
  // pattern). The confirm/prompt/notice dialogs trap on their own capture
  // handlers BEFORE this bubble-phase listener, so a stacked dialog never
  // double-handles the same Tab.
  if (e.key === 'Tab') {
    const root = q('modal-root');
    if (root && trapTabKey(e, qs('.modal-panel', root))) e.preventDefault();
  }
}

function unbindGlobalListeners() {
  document.removeEventListener('click', handleOutsideClick, { capture: true });
  document.removeEventListener('keydown', handleKeydown);
}

function bindGlobalListeners() {
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
  unbindGlobalListeners();
  document.addEventListener('click', handleOutsideClick, { capture: true });
  document.addEventListener('keydown', handleKeydown);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
export function teardown() {
  const root = q('modal-root');
  if (!root) return false;
  const wasOpen = root.innerHTML.trim() !== '';
  const cb = activeOnClose;
  const generationBeforeCb = openGeneration;
  activeOnClose = null;
  if (wasOpen && typeof cb === 'function') cb();
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
  if (openGeneration !== generationBeforeCb) return wasOpen;
  root.innerHTML = '';
  unbindGlobalListeners();
  // CR-13 — hand focus back to whatever opened the modal, but only when
  // this teardown is a genuine close (wasOpen). The openModal()-stacking
  // path reaches this line too, and restoring there is exactly right: the
  // new modal then captures the restored element as its own opener, so
  // closing a stacked dialog walks back down the stack one step.
  if (wasOpen) {
    restoreFocus(lastFocusedBeforeModal);
    lastFocusedBeforeModal = null;
  }
  return wasOpen;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
// Roadmap #6 — escape-by-default body contract. toBridge() is the whole
// change: SafeHtml (html``/raw()) passes through verbatim; a plain string
// is now escaped like any other interpolated value instead of being
// injected raw. Before this, ANY openModal caller that passed a plain
// string containing user-controlled data was a stored-XSS sink by default
// (the S-1 settingsModal stopword class); the caller had to know to
// escape. Now the unsafe thing is the opt-in: pre-built markup must arrive
// as SafeHtml (html`` or raw()), which keeps the escaping bridge's rule —
// "escaped unless the caller explicitly says otherwise" — true at the modal
// boundary too. Callers that legitimately pass pre-built HTML strings were
// migrated to raw(...) in the same pass.
export function openModal({ title = '', body = '', className = '', showHeader = true, onClose = null } = {}) {
  const root = q('modal-root');
  if (!root) return null;
  // Closing whatever's open first (running ITS onClose) means stacking
  // a second openModal() call on top of an unclosed first one can never
  // leak the first modal's onClose or listeners. teardown() also restores
  // the previous modal's opener focus (see its tail), which the capture
  // below then picks up — that composition is what makes stacked modals
  // restore focus in the right order.
  teardown();
  openGeneration++;
  activeOnClose = onClose;
  // CR-13 — remember the opener for focus restoration on close. Captured
  // AFTER teardown() so a stacked modal records the element focus just
  // returned to, not whatever happened to be focused inside the modal
  // it's replacing.
  lastFocusedBeforeModal = document.activeElement || null;

  const headerHtml = showHeader
    ? html`<div class="modal-header"><h2 id="modal-title">${raw(title)}</h2><button id="modal-close" class="modal-close" type="button" title="Close" aria-label="Close">✕</button></div>`
    : '';

  // CR-13 — the panel is a real dialog now: role/aria-modal for the
  // blocking semantics the backdrop already imposes visually, labelled by
  // its header title, and tabindex="-1" so it can take programmatic
  // focus. With no header (the command palette), a plain-string title
  // still names it; callers that focus a specific control right after
  // open (the palette focuses its input) simply override this panel
  // focus, which is the sanctioned pattern.
  const labelled = showHeader && title ? ' aria-labelledby="modal-title"' : '';
  const fallbackLabel = !showHeader && title ? ` aria-label="${toBridge(title)}"` : '';

  root.innerHTML = toBridge(html`
    <div class="modal-backdrop">
      <div class="modal-panel${className ? ' ' + className : ''}" role="dialog" aria-modal="true" tabindex="-1"${raw(labelled + fallbackLabel)}>
        ${headerHtml}
        ${body}
      </div>
    </div>
  `);

  const closeBtn = q('modal-close');
  // P1-6 (companion) — same fix: X-button dismiss goes through closeModal()
  // so closeCleanupHooks run on this path too.
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal());
  bindGlobalListeners();

  // CR-13 — move focus into the dialog (APG: focus the container). The
  // guard keeps the Node smoketest shims (no panel node, no focus()) and
  // no-op'd states honest; callers that immediately focus a specific
  // field simply win, which is what the palette has always done.
  const panel = qs('.modal-panel', root);
  if (panel && typeof panel.focus === 'function') {
    try { panel.focus({ preventScroll: true }); } catch { panel.focus(); }
  }
  return root;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
const closeCleanupHooks = [];

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
export function onModalCloseCleanup(fn) {
  closeCleanupHooks.push(fn);
}

export function closeModal() {
  const modalRoot = q('modal-root');
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
  const wasOpen = modalRoot ? modalRoot.innerHTML.trim() !== '' : false;
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
  if (activeConfirm) activeConfirm.finish(activeConfirm.cancelledValue);
  if (TTS.isSpeaking() || TTS.isPaused()) TTS.stop();
  closeCleanupHooks.forEach((fn) => fn(wasOpen));
  teardown();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
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
      } else if (e.key === 'Tab' && trapTabKey(e, root.querySelector('.confirm-panel'))) {
        // CR-13 — the dialog is aria-modal; Tab must stay inside it. The
        // panel resolves to null on the Node shim (no .confirm-panel
        // support there), where trapTabKey returns false and nothing is
        // prevented — same optional-call honesty as stopPropagation?.().
        e.preventDefault();
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
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
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

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
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
      } else if (e.key === 'Tab' && trapTabKey(e, root.querySelector('.confirm-panel'))) {
        // CR-13 — same in-dialog Tab trap as confirmDialog.
        e.preventDefault();
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
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
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

// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
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
      } else if (e.key === 'Tab' && trapTabKey(e, root.querySelector('.confirm-panel'))) {
        // CR-13 — same in-dialog Tab trap as confirmDialog.
        e.preventDefault();
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
// Historical context: see docs/CODEBASE_NOTES.md#jsmodal-js
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
