// Historical context: see docs/CODEBASE_NOTES.md#jsmentions-js-1-10
import { MENTION_RE } from './store.js';

// If the caret sits inside an unclosed "[[" on the current line, returns
// { query, start, end } where start/end bound the "[[partial" span (start is
// the index of the opening bracket). Otherwise returns null.
export function getActiveMentionQuery(text, caretPos) {
  const upToCaret = text.slice(0, caretPos);
  const openIdx = upToCaret.lastIndexOf('[[');
  if (openIdx === -1) return null;
  const closeIdx = upToCaret.lastIndexOf(']]');
  if (closeIdx > openIdx) return null; // already closed before the caret
  const fragment = upToCaret.slice(openIdx + 2);
  if (fragment.includes('\n')) return null; // don't span lines
  return { query: fragment, start: openIdx, end: caretPos };
}

// Replaces text[start:end] with "[[entityName]]" and returns the new text
// plus the caret position right after the inserted mention.
export function insertMention(text, start, end, entityName) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const insertion = `[[${entityName}]]`;
  return {
    text: before + insertion + after,
    caret: (before + insertion).length,
  };
}

// Wraps [[mentions]] in styled spans for read-only display (e.g. Outline
// synopsis). `escapeHtml` and `resolver(name)` are injected so this module
// doesn't need to duplicate app.js's escaping or reach into Store directly.
export function renderMentionsHtml(text, resolver, escapeHtml) {
  return escapeHtml(text).replace(MENTION_RE, (whole, name) => {
    const exists = resolver ? resolver(name.trim()) : false;
    const cls = exists ? 'mention mention-resolved' : 'mention mention-unresolved';
    return `<span class="${cls}">${name}</span>`;
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmentions-js-50-58
export function splitParagraphs(text) {
  const boundary = /\n[ \t]*\n[ \t\n]*/g;
  const paragraphs = [];
  let start = 0;
  let match;
  while ((match = boundary.exec(text))) {
    paragraphs.push({ start, end: match.index });
    start = match.index + match[0].length;
  }
  paragraphs.push({ start, end: text.length });
  return paragraphs;
}

// Caret pixel coordinates within a textarea, via a mirrored hidden div.
// Standard "textarea-caret-position" technique, trimmed to what we need.
export function getCaretCoordinates(textarea, position) {
  const div = document.createElement('div');
  const style = getComputedStyle(textarea);
  const properties = [
    'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily',
    'lineHeight', 'letterSpacing', 'textTransform', 'wordSpacing', 'tabSize', 'whiteSpace', 'wordWrap',
  ];

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  document.body.appendChild(div);

  properties.forEach((prop) => { div.style[prop] = style[prop]; });

  div.textContent = textarea.value.substring(0, position);
  const span = document.createElement('span');
  span.textContent = textarea.value.substring(position) || '.';
  div.appendChild(span);

  const rect = textarea.getBoundingClientRect();
  const top = span.offsetTop + parseInt(style.borderTopWidth || '0', 10) - textarea.scrollTop;
  const left = span.offsetLeft + parseInt(style.borderLeftWidth || '0', 10) - textarea.scrollLeft;

  document.body.removeChild(div);

  return {
    top: rect.top + top,
    left: rect.left + left,
    lineHeight: parseInt(style.lineHeight || '20', 10),
  };
}
