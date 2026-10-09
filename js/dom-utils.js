// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-1-42

// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-44-51
class SafeHtml {
  constructor(value) {
    this.value = value;
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-58-64

function escapeHtmlImpl(str = '') {
// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-67-75
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttrImpl(str = '') {
// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-84-90
  return escapeHtmlImpl(str);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-94-110

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    let piece;
    if (v instanceof SafeHtml) {
      piece = v.value;
    } else if (Array.isArray(v)) {
// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-120-123
      const nonNull = v.find((x) => x != null);
      if (nonNull instanceof SafeHtml) {
        piece = v.map((x) => (x instanceof SafeHtml ? x.value : x == null ? '' : escapeHtmlImpl(String(x)))).join('');
      } else {
        piece = v.map((x) => (x == null ? '' : escapeHtmlImpl(String(x)))).join('');
      }
    } else if (v == null) {
      piece = '';
    } else if (typeof v === 'boolean') {
// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-133-136
      piece = '';
    } else {
      piece = escapeHtmlImpl(String(v));
    }
    out += piece + strings[i + 1];
  }
  return new SafeHtml(out);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-146-152
export function raw(htmlString) {
  return new SafeHtml(String(htmlString));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-157-171
export function toBridge(safe) {
  if (safe instanceof SafeHtml) return safe.value;
// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-174-178
  if (typeof safe === 'string') return escapeHtmlImpl(safe);
  if (safe == null) return '';
  return escapeHtmlImpl(String(safe));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-184-191

export function escapeHtml(str = '') {
  return escapeHtmlImpl(str);
}
export function escapeAttr(str = '') {
  return escapeAttrImpl(str);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-200-219
export function safeExternalUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-232-242

export function q(id) {
  return document.getElementById(id);
}
export function qs(selector, root = document) {
  return root.querySelector ? root.querySelector(selector) : null;
}
export function qsa(selector, root = document) {
  return root.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : [];
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-254-266
export function bindOutsideClick(handler, options) {
  document.removeEventListener('click', handler, options);
  document.addEventListener('click', handler, options);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdom-utils-js-272-275
export function capitalize(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── flash-and-scroll (0.2.7 move-out, verbatim from app.js) ───────────────
// Smooth-scrolls to a selector and flash-highlights it — the "you jumped
// here" affordance shared by search results and the write view's jump rows.
export function flashAndScrollTo(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash-highlight');
  setTimeout(() => el.classList.remove('flash-highlight'), 1600);
}
