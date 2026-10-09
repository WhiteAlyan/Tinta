// Historical context: see docs/CODEBASE_NOTES.md#jsemptystate-js-1-33
import { raw } from './dom-utils.js';

// Bug-report fix — return a SafeHtml object (via raw()) instead of a plain
// string. When EmptyState() is interpolated into an html`` template
// (e.g. html`${EmptyState({ text: '...' })}`), a plain string gets
// ESCAPED by the template — showing <p class="empty-note"> as text on
// screen. raw() marks the string as already-safe HTML so the template
// inserts it verbatim. The text content itself is still escaped via
// esc() above, so there's no XSS risk — only the wrapper <p> tag is
// inserted as HTML.
export function EmptyState({ icon = '', text = '', className = 'empty-note', actionLabel = '', actionAttrs = '' } = {}) {
  const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const iconHtml = icon ? `<span class="empty-state-icon">${esc(icon)}</span> ` : '';
  const actionHtml = actionLabel
    ? ` <button class="empty-state-action" ${actionAttrs}>${esc(actionLabel)}</button>`
    : '';
  return raw(`<p class="${esc(className)}">${iconHtml}${esc(text)}${actionHtml}</p>`);
}
