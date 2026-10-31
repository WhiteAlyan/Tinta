// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js

export const COLOR_NAMES = ['red', 'amber', 'green', 'blue', 'purple'];
export const IMAGE_ALIGNMENTS = ['left', 'right', 'center'];

// v0.3 — underline added as {{u:text}} to match the {{color:text}} /
// {{img:id}} pattern. Single-underscore `_text_` would conflict with
// italic in adjacent runs (`*italic* _underline_`), and double-underscore
// `__text__` is sometimes used for bold in other markdown flavors —
// both create ambiguity. The {{u:...}} token is unambiguous.
export const UNDERLINE_TOKEN_PATTERN = /\{\{u:([^}]+?)\}\}/g;

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js
export const IMAGE_TOKEN_PATTERN = /\{\{img:([a-zA-Z0-9_-]+)(?:\|(left|right|center))?\}\}/g;

// Builds a token for the insert-image UI, so the toolbar/library never
// hand-assembles the `{{img:...}}` syntax itself — if the format ever
// changes, this is the one place that needs to.
export function buildImageToken(id, align = null) {
  return align && IMAGE_ALIGNMENTS.includes(align) ? `{{img:${id}|${align}}}` : `{{img:${id}}}`;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js
export function stripImageTokens(text) {
  return (text || '').replace(IMAGE_TOKEN_PATTERN, '');
}

// CR-18 — CJK script coverage shared by every counting/scanning consumer
// (wordCount, Word Check's tokenizer, the style-guide scanner). Ranges:
// hiragana + katakana (\u3040-\u30ff), CJK Ext A (\u3400-\u4dbf), CJK
// Unified (\u4e00-\u9fff), CJK Compatibility (\uf900-\ufaff). Hangul is
// deliberately excluded — Korean prose is space-separated, so the Latin
// whitespace path already counts it.
export const CJK_CHAR_CLASS = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff';
const CJK_CHAR_PATTERN = new RegExp(`[${CJK_CHAR_CLASS}]`);
const CJK_CHAR_PATTERN_GLOBAL = new RegExp(`[${CJK_CHAR_CLASS}]`, 'g');

// True when the string contains at least one CJK character — the cheap
// gate the style-guide scanner uses to pick its boundary strategy.
export function containsCjk(text) {
  return CJK_CHAR_PATTERN.test(text || '');
}

// CR-46 — strip every manuscript-syntax token down to speakable/plain text.
// The Read Aloud modal used to hand `Store.applyPronunciations(chapter.content)`
// straight to speech synthesis, so the browser read the formatting syntax
// aloud: "star star" for **, "brace brace u colon" for {{u:…}}, the raw
// {{img:id}} token, and the [[…]] mention brackets around entity names.
// This is the one stripper for that job, placed next to stripImageTokens()
// because format.js already centralizes the token patterns (one syntax
// change, one edit).
//
// Order matters and is not arbitrary:
//   1. image tokens FIRST — they are deleted outright (an image has no
//      spoken content), and doing it first means a caption-like alt text
//      can never be mistaken for prose.
//   2. underline + color tokens BEFORE the markdown passes — their inner
//      text may itself contain ** or * markers ({{u:**name**}} is legal),
//      and unwrapping the brace token first leaves those markers where the
//      markdown passes below can still find them.
//   3. bold before italic — ** is two asterisks; stripping * first would
//      shred the ** pair into single-asterisk fragments (the same
//      ordering reason renderFormattedHtml's passes run in this order).
//   4. mentions LAST — [[Name]] → Name (brackets removed, entity name
//      spoken plainly; applyPronunciations then still gets its chance on
//      the result).
// Like stripImageTokens, an UNCLOSED token (writer mid-edit) is left as
// literal text — the same parity the renderer shows, so nothing silently
// disappears mid-typing.
export function stripFormattingTokens(text) {
  let out = (text || '');
  out = out.replace(IMAGE_TOKEN_PATTERN, '');
  out = out.replace(UNDERLINE_TOKEN_PATTERN, '$1');
  out = out.replace(new RegExp(`\\{\\{(${COLOR_NAMES.join('|')}):([^}]+?)\\}\\}`, 'g'), '$2');
  out = out.replace(/\*\*([^*]+?)\*\*/g, '$1');
  out = out.replace(/\*([^*]+?)\*/g, '$1');
  out = out.replace(/\[\[([^\][]+)\]\]/g, '$1');
  return out;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js
export function wordCount(text) {
  const stripped = stripImageTokens(text || '');
  // CR-18 — CJK prose used to be nearly invisible: wordCount split on
  // whitespace, so a nine-character Chinese sentence counted as ONE word,
  // and the footer counter, goals, celebrations, sprint WPM, and the DOCX
  // title-page total all inherited the lie. CJK characters are now counted
  // first — one han/kana character ≈ one word, the convention CJK writing
  // tools use — and stripped out before the Latin whitespace pass, so the
  // two scripts contribute independently instead of the CJK text gluing
  // its neighbors into one giant "word".
  const cjkChars = (stripped.match(CJK_CHAR_PATTERN_GLOBAL) || []).length;
  const trimmed = cjkChars ? stripped.replace(CJK_CHAR_PATTERN_GLOBAL, '').trim() : stripped.trim();
  return cjkChars + (trimmed ? trimmed.split(/\s+/).length : 0);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js
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

// CR-38 — the exact inverse of escapeHtml, used when a match has to come
// BACK from the already-escaped string to the writer's raw text. Entity
// order matters: &amp; must resolve LAST so a literal "&amp;lt;" in the
// prose can't round-trip into "<".
function unescapeHtml(str = '') {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js
//
// CR-04 fix — `keepMarkers` switches this function into METRIC-PARITY
// mode for the editor's always-on overlay. The overlay is painted on
// top of a transparent-text textarea whose caret/scroll geometry comes
// from laying out the RAW text; the old overlay output DELETED the
// format markers (**, *, {{u:, {{color:, }}), so any formatted
// paragraph soft-wrapped at different points than the textarea's layout
// of the same characters — the visible caret drifted a full line-height
// from where the writer was reading, and bottom-of-chapter scroll sync
// lost tracking. In keepMarkers mode every marker character stays in
// the output, wrapped in a .fmt-marker span that the overlay CSS makes
// transparent — identical character count, identical advance width.
// (Bold glyphs get the same treatment on the CSS side: faux bold via
// text-stroke, which is visually heavier but metrically identical —
// see .focus-dim-overlay strong in editor-view.css.) Read-only views
// (Book view, exports) keep the default: markers removed, clean prose.
export function renderFormattedHtml(text, { images = {}, keepMarkers = false } = {}) {
  let html = escapeHtml(text || '');
  // Marker characters are emitted verbatim into .fmt-marker spans. The
  // surrounding string is already HTML-escaped above and the markers
  // themselves (**, *, {{u:, }}) contain nothing escapeHtml would have
  // rewritten, so they are safe to interpolate as literal text.
  //
  // Markers are parked behind per-call sentinels (\uE000<idx>\uE001 —
  // Private Use Area code points that never occur in prose and that no
  // format regex can match) and only swapped into real HTML at the very
  // end. Reason: the passes
  // run SEQUENTIALLY (bold, then italic, then underline, then color),
  // and each pass scans the PREVIOUS pass's output. Marker spans
  // contain the very characters later passes match (bold's "**" is two
  // asterisks — the italic pass would match ACROSS a bold marker span,
  // wrapping half of it in <em>). Sentinels contain no *, {, or }
  // characters, so no pass can ever match into them. In default mode
  // (keepMarkers=false) the sentinel resolves to '' — byte-identical
  // to the pre-CR-04 output, so read-only views don't change.
  const markerStore = [];
  const marker = (s) => {
    markerStore.push(keepMarkers ? `<span class="fmt-marker">${s}</span>` : '');
    return `\uE000${markerStore.length - 1}\uE001`;
  };

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js
  html = html.replace(/\*\*([^*]+?)\*\*/g, (_m, inner) => `${marker('**')}<strong>${inner}</strong>${marker('**')}`);
  html = html.replace(/\*([^*]+?)\*/g, (_m, inner) => `${marker('*')}<em>${inner}</em>${marker('*')}`);

  // v0.3 — underline as {{u:text}} (see UNDERLINE_TOKEN_PATTERN comment
  // for why this syntax instead of _text_). Rendered as <u> since the
  // semantic HTML element for underline is genuinely <u> in HTML5
  // (it's been redefined as "unarticulated annotation" which is close
  // enough to "user-marked emphasis" for a writing app).
  html = html.replace(UNDERLINE_TOKEN_PATTERN, (_m, inner) => `${marker('{{u:')}<u>${inner}</u>${marker('}}')}`);

  const colorPattern = new RegExp(`\\{\\{(${COLOR_NAMES.join('|')}):([^}]+?)\\}\\}`, 'g');
  html = html.replace(colorPattern, (_m, colorName, inner) =>
    `${marker(`{{${colorName}:`)}<span class="fmt-color-${colorName}">${inner}</span>${marker('}}')}`);

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
  // Resolve the marker sentinels now that no format pass can match into
  // them anymore (see the marker() comment above).
  html = html.replace(/\uE000(\d+)\uE001/g, (_m, idx) => markerStore[Number(idx)] ?? '');
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
// expects ({ id: { url, caption } }). Both are optional. `keepMarkers`
// is the CR-04 metric-parity switch for the editor overlay — the
// overlay passes true so its output occupies the same width as the
// textarea's raw layout; read-only callers omit it. (Mention chips
// were ALREADY metric-neutral — the [[ ]] brackets stay in the output
// as transparent spans — and the CR-04 pass tightened their CSS to
// box-shadow/outline so padding/border stop adding width too.)
export function renderEditorParagraph(text, { images = {}, mentionResolver = null, keepMarkers = false } = {}) {
  let html = renderFormattedHtml(text, { images, keepMarkers });
  // Mentions: [[name]] → chip with invisible brackets. MENTION_RE is
  // imported by mentions.js from store.js; the regex captures the name
  // between brackets. We do this AFTER renderFormattedHtml so format
  // markers inside the name (e.g. [[**bold name**]]) are rendered
  // before chip wrapping — the chip then shows the formatted name.
  // Brackets stay in the HTML (transparent via .mention-bracket CSS) so
  // overlay character positions match the textarea's.
  html = html.replace(/\[\[([^\][]+)\]\]/g, (whole, name) => {
    // CR-38 — `name` was matched against the ALREADY-escaped text, so it
    // is the ESCAPED form (a writer's "A&B" arrives here as "A&amp;B").
    // Two consequences fixed together: the entity-resolver comparison used
    // to run against that escaped form and miss every name containing
    // & < > ' " (the entity table stores raw names), and the
    // data-mention-name attribute escaped it a SECOND time, producing
    // data-mention-name="A&amp;amp;B" — nothing consumes the attribute
    // today (the click handler re-derives the name from textarea text),
    // but any future consumer would have inherited corrupted names.
    // rawName is the writer's actual text; the attribute escapes it
    // exactly once. The visible chip name keeps `name` as-is: it is
    // interpolated into HTML body context, where its single existing
    // escape is correct.
    const trimmed = name.trim();
    const rawName = unescapeHtml(trimmed);
    const exists = mentionResolver ? Boolean(mentionResolver(rawName)) : false;
    const cls = exists ? 'mention-chip mention-chip-resolved' : 'mention-chip mention-chip-unresolved';
    // The whole span includes the brackets so the chip's clickable
    // area covers the full [[name]] region (matching where the textarea
    // would let you click to "hit" the mention). The .mention-bracket
    // children are transparent per CSS.
    return `<span class="${cls}" data-mention-name="${escapeHtml(rawName)}">` +
           `<span class="mention-bracket">[[</span>` +
           `<span class="mention-chip-name">${name}</span>` +
           `<span class="mention-bracket">]]</span>` +
           `</span>`;
  });
  return html;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js

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
// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js
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

// Historical context: see docs/CODEBASE_NOTES.md#jsformat-js
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
