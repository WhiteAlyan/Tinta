// a11y.js — CR-44 shared accessibility primitives.
//
// Three jobs, all of them small, all of them needed by more than one
// overlay layer (which is why they live here and not inside modal.js):
//
//   1. Focus trapping — a blocking modal must keep Tab inside itself
//      (WAI-ARIA dialog pattern). modal.js's shell, and its three
//      stacked dialog helpers (confirm/prompt/notice), all call
//      trapTabKey() from their keydown handlers.
//   2. Focus restoration — an overlay remembers what was focused when
//      it opened and hands focus back when it closes, so keyboard and
//      screen-reader users aren't dumped at <body> after dismissing a
//      dialog (the CR-13 report's core complaint).
//   3. Announcements — one polite aria-live region for "the view
//      changed" style updates that are visible to sighted users as a
//      whole-panel swap but are otherwise silent to assistive tech.
//
// Every function is defensive about a missing/mocked DOM: the Node
// smoketests exercise modal.js against a purpose-built shim whose
// containers don't implement querySelectorAll, and the overlay code
// must survive that (same convention as modal.js's optional-call
// stopPropagation shims).

// ── focus trapping ──────────────────────────────────────────────────────

// The selector that defines "can receive focus inside an overlay".
// Deliberately mirrors what a browser's sequential navigation would
// reach: real controls plus the two tabindex paths. Elements start out
// collected but get filtered per-candidate below (display:none and
// disabled controls are skipped), because a selector can't express
// those cheaply and the overlays contain plenty of both.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isVisible(el) {
  // offsetParent is null for display:none subtrees (and for fixed-
  // positioned elements — none of the app's controls are, so the false
  // positive risk is acceptable in exchange for zero layout reads in
  // the common case). getClientRects covers the fixed-position case.
  if (typeof el.getClientRects === 'function') {
    return el.getClientRects().length > 0;
  }
  return true; // shim elements without geometry — treat as visible
}

// Collect the focusable elements inside `container`, visible first.
export function focusableIn(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);
}

// Call from a keydown handler: if `e` is a Tab inside a blocking
// overlay, wrap it at the overlay's edges. Returns true when the event
// was handled (the caller should preventDefault); false when it was
// left alone (no container, no focusables, or not a Tab).
export function trapTabKey(e, container) {
  if (!e || e.key !== 'Tab') return false;
  const focusables = focusableIn(container);
  if (!focusables.length) return false;

  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey) {
    // Backwards Tab from the first control (or from outside everything,
    // e.g. focus on the panel itself) → wrap to the last control.
    if (!active || !focusables.includes(active) || active === first) {
      last.focus();
      return true;
    }
  } else {
    // Forwards Tab from the last control (or from outside) → wrap to
    // the first control.
    if (!active || !focusables.includes(active) || active === last) {
      first.focus();
      return true;
    }
  }
  return false; // ordinary in-range Tab — let the browser move focus
}

// ── focus restoration ───────────────────────────────────────────────────

// Best-effort focus restore. A closed overlay's opener may have been
// re-rendered away in the meantime (the app re-renders freely); a
// detached node can't take focus, so it's skipped rather than thrown.
export function restoreFocus(el) {
  if (!el || typeof el.focus !== 'function') return false;
  if (typeof el.isConnected === 'boolean' && !el.isConnected) return false;
  try {
    el.focus({ preventScroll: true });
  } catch {
    // Shims (and some exotic elements) don't accept options — retry bare.
    try { el.focus(); } catch { return false; }
  }
  return true;
}

// ── announcements ───────────────────────────────────────────────────────

// One polite live region for the whole app, created lazily and reused.
// role="status" (an implicit aria-live="polite" + atomic region) is the
// right register for view switches and saved-state notes: they should
// be spoken when the writer pauses, never interrupt mid-sentence, and
// never steal focus. Assertive emergencies (storage loss) use
// role="alert" directly on their own banner markup in toast.js instead
// of routing through here.
let liveRegion = null;

export function announce(message) {
  if (typeof document === 'undefined' || !message) return;
  const text = String(message);
  if (!liveRegion || !liveRegion.isConnected) {
    liveRegion = document.getElementById('a11y-live');
    if (!liveRegion) {
      liveRegion = document.createElement('span');
      liveRegion.id = 'a11y-live';
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      // Visually hidden but fully rendered — sr-only styling lives in
      // polish.css (.a11y-live); inline styles here keep the region
      // correct even if the stylesheet fails to load.
      liveRegion.style.cssText =
        'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
        'border:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap;';
      (document.body || document.documentElement).appendChild(liveRegion);
    }
  }
  // Text swap, not insert: replacing identical text is a no-op for some
  // screen readers, so the region is cleared first, then repopulated on
  // the next task — the standard re-announcement trick for repeated
  // identical messages ("Write view" twice in a row must speak twice).
  liveRegion.textContent = '';
  setTimeout(() => {
    if (liveRegion) liveRegion.textContent = text;
  }, 30);
}
