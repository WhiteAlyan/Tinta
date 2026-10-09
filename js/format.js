// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js-1-19

export const COLOR_NAMES = ['red', 'amber', 'green', 'blue', 'purple'];
export const IMAGE_ALIGNMENTS = ['left', 'right', 'center'];

// v0.3 — underline added as {{u:text}} to match the {{color:text}} /
// {{img:id}} pattern. Single-underscore `_text_` would conflict with
// italic in adjacent runs (`*italic* _underline_`), and double-underscore
// `__text__` is sometimes used for bold in other markdown flavors —
// both create ambiguity. The {{u:...}} token is unambiguous.
export const UNDERLINE_TOKEN_PATTERN = /\{\{u:([^}]+?)\}\}/g;

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js-24-27
export const IMAGE_TOKEN_PATTERN = /\{\{img:([a-zA-Z0-9_-]+)(?:\|(left|right|center))?\}\}/g;

// Builds a token for the insert-image UI, so the toolbar/library never
// hand-assembles the `{{img:...}}` syntax itself — if the format ever
// changes, this is the one place that needs to.
export function buildImageToken(id, align = null) {
  return align && IMAGE_ALIGNMENTS.includes(align) ? `{{img:${id}|${align}}}` : `{{img:${id}}}`;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js-37-40
export function stripImageTokens(text) {
  return (text || '').replace(IMAGE_TOKEN_PATTERN, '');
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js-45-50
export function wordCount(text) {
  const trimmed = stripImageTokens(text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js-57-63
export function extractImageIds(text) {
  const ids = [];
  const seen = new Set();
  for (const match of (text || '').matchAll(IMAGE_TOKEN_PATTERN)) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

// ── rendering (plain text → HTML) ───────────────────────────────────────

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js-88-98
export function renderFormattedHtml(text, { images = {} } = {}) {
  let html = escapeHtml(text || '');

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js-102-105
  html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+?)\*/g, '<em>$1</em>');

  // v0.3 — underline as {{u:text}} (see UNDERLINE_TOKEN_PATTERN comment
  // for why this syntax instead of _text_). Rendered as <u> since the
  // semantic HTML element for underline is genuinely <u> in HTML5
  // (it's been redefined as "unarticulated annotation" which is close
  // enough to "user-marked emphasis" for a writing app).
  html = html.replace(UNDERLINE_TOKEN_PATTERN, '<u>$1</u>');

  const colorPattern = new RegExp(`\\{\\{(${COLOR_NAMES.join('|')}):([^}]+?)\\}\\}`, 'g');
  html = html.replace(colorPattern, '<span class="fmt-color-$1">$2</span>');

  html = html.replace(IMAGE_TOKEN_PATTERN, (match, id, align) => {
    const image = images[id];
    const alignClass = `fmt-image-${align || 'center'}`;
    if (!image) {
      return `<span class="fmt-image-missing ${alignClass}">[image unavailable]</span>`;
    }
    const caption = image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : '';
    return `<figure class="fmt-image ${alignClass}"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.caption || '')}">${caption}</figure>`;
  });

  // Chapter content is plain text from a textarea, not HTML — real line
  // breaks need to become <br> for this to look right outside a <textarea>
  // (this is meant for read-only display, not round-tripped back into one).
  html = html.replace(/\n/g, '<br>');
  return html;
}

// v0.3 — Typora-style editor rendering. Takes a paragraph's raw text,
// renders it as formatted HTML (bold/italic/underline/color/images) AND
// resolves [[mentions]] to styled chips. Used by the always-on editor
// overlay for paragraphs OTHER than the current one (the current
// paragraph renders raw escaped text so the user can see what they're
// typing). Mention chips preserve caret-position alignment by keeping
// the [[ and ]] brackets in the rendered output but styling them as
// transparent — they occupy the same width as in the textarea, so the
// overlay's character positions match the textarea's. The chip's
// background covers just the entity name, not the brackets.
//
// `mentionResolver(name) → entity | null` determines resolved vs
// unresolved styling. `images` is the same map renderFormattedHtml
// expects ({ id: { url, caption } }). Both are optional.
export function renderEditorParagraph(text, { images = {}, mentionResolver = null } = {}) {
  let html = renderFormattedHtml(text, { images });
  // Mentions: [[name]] → chip with invisible brackets. MENTION_RE is
  // imported by mentions.js from store.js; the regex captures the name
  // between brackets. We do this AFTER renderFormattedHtml so format
  // markers inside the name (e.g. [[**bold name**]]) are rendered
  // before chip wrapping — the chip then shows the formatted name.
  // Brackets stay in the HTML (transparent via .mention-bracket CSS) so
  // overlay character positions match the textarea's.
  html = html.replace(/\[\[([^\[\]]+)\]\]/g, (whole, name) => {
    const trimmed = name.trim();
    const exists = mentionResolver ? Boolean(mentionResolver(trimmed)) : false;
    const cls = exists ? 'mention-chip mention-chip-resolved' : 'mention-chip mention-chip-unresolved';
    // The whole span includes the brackets so the chip's clickable
    // area covers the full [[name]] region (matching where the textarea
    // would let you click to "hit" the mention). The .mention-bracket
    // children are transparent per CSS.
    return `<span class="${cls}" data-mention-name="${escapeHtml(trimmed)}">` +
           `<span class="mention-bracket">[[</span>` +
           `<span class="mention-chip-name">${name}</span>` +
           `<span class="mention-bracket">]]</span>` +
           `</span>`;
  });
  return html;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js-129-133

function toggleSymmetricWrap(text, start, end, marker) {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const m = marker.length;

  const alreadyWrapped = before.endsWith(marker) && after.startsWith(marker);
  if (alreadyWrapped) {
    const newText = before.slice(0, before.length - m) + selected + after.slice(m);
    return { text: newText, selStart: start - m, selEnd: end - m };
  }

  const newText = before + marker + selected + marker + after;
  // No selection (just a cursor) — land the cursor *between* the markers
  // so typing continues formatted, rather than after the closing marker.
  return selected
    ? { text: newText, selStart: start + m, selEnd: end + m }
    : { text: newText, selStart: start + m, selEnd: start + m };
}

export function toggleBold(text, start, end) {
  return toggleSymmetricWrap(text, start, end, '**');
}

export function toggleItalic(text, start, end) {
// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js-160-164
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (before.endsWith('**') || after.startsWith('**')) {
    const selected = text.slice(start, end);
    const newText = before + '*' + selected + '*' + after;
    return selected
      ? { text: newText, selStart: start + 1, selEnd: end + 1 }
      : { text: newText, selStart: start + 1, selEnd: start + 1 };
  }
  return toggleSymmetricWrap(text, start, end, '*');
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js-177-182
export function toggleColor(text, start, end, colorName) {
  if (!COLOR_NAMES.includes(colorName)) return { text, selStart: start, selEnd: end };

  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  const openPattern = new RegExp(`\\{\\{(${COLOR_NAMES.join('|')}):$`);
  const openMatch = before.match(openPattern);
  const closedAfter = after.startsWith('}}');

  if (openMatch && closedAfter) {
    const openLen = openMatch[0].length;
    const newText = before.slice(0, before.length - openLen) + selected + after.slice(2);
    return { text: newText, selStart: start - openLen, selEnd: end - openLen };
  }

  const open = `{{${colorName}:`;
  const close = '}}';
  const newText = before + open + selected + close + after;
  return selected
    ? { text: newText, selStart: start + open.length, selEnd: end + open.length }
    : { text: newText, selStart: start + open.length, selEnd: start + open.length };
}

// v0.3 — underline toggle. Same shape as toggleColor but for {{u:text}}
// (no color name in the token, just the literal 'u'). The detection
// regex checks for {{u: immediately before the selection and }} right
// after — if both are present, the toggle unwraps; otherwise it wraps.
export function toggleUnderline(text, start, end) {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  const openMatch = before.match(/\{\{u:$/);
  const closedAfter = after.startsWith('}}');

  if (openMatch && closedAfter) {
    const openLen = openMatch[0].length; // 4: '{{u:'
    const newText = before.slice(0, before.length - openLen) + selected + after.slice(2);
    return { text: newText, selStart: start - openLen, selEnd: end - openLen };
  }

  const open = '{{u:';
  const close = '}}';
  const newText = before + open + selected + close + after;
  return selected
    ? { text: newText, selStart: start + open.length, selEnd: end + open.length }
    : { text: newText, selStart: start + open.length, selEnd: start + open.length };
}
