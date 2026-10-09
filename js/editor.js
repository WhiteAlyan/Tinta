// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-1-7

import * as Store from './store.js';
import * as Format from './format.js';
import * as Typewriter from './typewriter.js';
import * as ImageStore from './imagestore.js';
import { getActiveMentionQuery, insertMention, getCaretCoordinates, splitParagraphs } from './mentions.js';
import { els } from './els.js';
import { q } from './dom-utils.js';

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-16-27
const POSITION_SAVE_DELAY_MS = 800;

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-30-36
const WRITE_IDLE_MS = 5 * 60 * 1000;

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-39-51
let activeFlush = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => activeFlush?.());
  window.addEventListener('beforeunload', () => activeFlush?.());
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-58-63
let activeUpdateDim = null;
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-65-73
let activeUpdateTypewriterScroll = null;
if (typeof window !== 'undefined') {
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-76-79
  window.addEventListener('resize', () => {
    activeUpdateDim?.();
    activeUpdateTypewriterScroll?.();
  });
}

// P1-7 fix — exported setter so writeView.js's resetWriteViewState
// can null out these module-level slots when the writer leaves the Write
// view. Without this, the three closures keep pointing at the OLD
// editor's textarea / dimOverlay / chapterId after a view switch, so
// the pagehide / beforeunload / resize listeners fire against detached
// DOM and (worse) activeFlush saves stale text to the wrong chapter.
// writeView.js's resetWriteViewState already nulls its own
// currentEditorHandle and lastRenderedChapterId but had no way to reach
// into editor.js's module scope.
export function clearActiveEditor() {
  activeFlush = null;
  activeUpdateDim = null;
  activeUpdateTypewriterScroll = null;
}

// v0.2.9 — fuzzy match for the mention popup. Returns true if every
// character of `query` appears in `text` in order (not necessarily
// contiguous). Same algorithm as VS Code's quick-open: "mra" matches
// "Mara" because m, r, a appear in order. Simple, fast, no deps.
function fuzzyMatch(text, query) {
  if (!query) return true;
  let qi = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

function escapeHtmlForOverlay(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-93-99
export function applyFormatToggle(textarea, result) {
  textarea.value = result.text;
  textarea.focus();
  textarea.setSelectionRange(result.selStart, result.selEnd);
  textarea.dispatchEvent(new Event('input'));
}

export function attachEditor({ textarea, chapterId, onSave, onWordCount, onMentionClick }) {
  let saveTimer = null;
  let positionTimer = null;
  let lastSavedValue = textarea.value;
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-111-115
  let writeSessionStart = null;
  let writeIdleTimer = null;
  const popup = createMentionPopup(textarea);
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-119-125
  const dimOverlay = textarea.parentElement?.querySelector('.focus-dim-overlay') || null;

  // v0.3 — image URL cache for the always-on formatted overlay. Maps
  // image id → object URL string (or null if lookup failed). Lives at
  // editor-handle scope so it survives across re-renders but is
  // discarded on chapter switch (the editor is re-attached). New image
  // IDs discovered during a render trigger an async getObjectUrl fetch;
  // when the fetch resolves, a re-render is scheduled so the image
  // appears. Until then, the placeholder `[image loading…]` shows.
  const imageUrlCache = new Map();
  let imageReRenderScheduled = false;
  function scheduleImageReRender() {
    if (imageReRenderScheduled) return;
    imageReRenderScheduled = true;
    requestAnimationFrame(() => {
      imageReRenderScheduled = false;
      updateDimOverlay();
    });
  }
  async function ensureImageUrls(ids) {
    let needsReRender = false;
    await Promise.all(ids.map(async (id) => {
      if (imageUrlCache.has(id)) return;
      imageUrlCache.set(id, null); // mark as "loading" so we don't re-fetch
      try {
        const url = await ImageStore.getObjectUrl(id);
        imageUrlCache.set(id, url);
        if (url) needsReRender = true;
      } catch {
        // leave as null — renderEditorParagraph will show the
        // "image unavailable" placeholder, same as a missing image
      }
    }));
    if (needsReRender) scheduleImageReRender();
  }
  function buildImagesMap(text) {
    // Scan for image IDs in the text and resolve them via the cache.
    // Missing IDs trigger an async fetch that will re-render when ready.
    const ids = Format.extractImageIds(text);
    if (ids.length > 0) ensureImageUrls(ids);
    const images = {};
    for (const id of ids) {
      const url = imageUrlCache.get(id);
      if (url) {
        // Caption lookup is best-effort — the active project's images
        // catalog has the caption. If the cache or project is missing,
        // caption is empty (still renders the image, just no figcaption).
        const meta = Store.getActiveProject()?.images?.[id];
        images[id] = { url, caption: meta?.caption || '' };
      }
      // Missing IDs are intentionally omitted — renderFormattedHtml's
      // IMAGE_TOKEN_PATTERN handler shows "[image unavailable]" for them.
    }
    return images;
  }

  function isFocusModeActive() {
    const level = textarea.closest('#app-shell')?.dataset.focusLevel;
    return level === 'zen' || level === 'typewriter';
  }

  // v0.3 — Typora-style always-on rendering. The overlay always shows;
  // the textarea's own text is transparent (caret visible via
  // caret-color). For the current paragraph (containing the caret),
  // render raw escaped text so the writer sees the markdown they're
  // typing. For all other paragraphs, render via Format.renderEditorParagraph
  // — formatted bold/italic/underline/color, inline images, and
  // mention chips with invisible brackets. Focus mode (zen/typewriter)
  // layers its dimming on top: current paragraph full opacity, others
  // at 0.3 — same as before, just now on top of formatted rendering
  // instead of raw text.
  function updateDimOverlay() {
    if (!dimOverlay) return;
    const gutter = textarea.offsetWidth - textarea.clientWidth;
    dimOverlay.style.paddingRight = `${4 + gutter}px`;
    const text = textarea.value;
    const caret = textarea.selectionStart;
    const paragraphs = splitParagraphs(text);
    const focusMode = isFocusModeActive();
    const images = buildImagesMap(text);
    const mentionResolver = (name) => Store.findEntityByName(name);
    let html = '';
    paragraphs.forEach((p, i) => {
      const isCurrent = caret >= p.start && caret <= p.end;
      // dim class only applied in focus mode — outside focus mode, all
      // paragraphs at full opacity.
      const cls = isCurrent
        ? 'fd-paragraph'
        : (focusMode ? 'fd-paragraph dimmed' : 'fd-paragraph');
      const paraText = text.slice(p.start, p.end);
      const paraHtml = isCurrent
        ? escapeHtmlForOverlay(paraText)
        : Format.renderEditorParagraph(paraText, { images, mentionResolver });
      html += `<span class="${cls}">${paraHtml}</span>`;
      if (i < paragraphs.length - 1) {
        // Between-paragraph whitespace (blank lines) — render as
        // escaped text so the visual gap between paragraphs matches
        // the textarea's. renderEditorParagraph would turn \n into
        // <br> which is wrong for the inter-paragraph region.
        html += escapeHtmlForOverlay(text.slice(p.end, paragraphs[i + 1].start));
      }
    });
    dimOverlay.innerHTML = html;
    // innerHTML resets scrollTop to 0, so it has to be reapplied every
    // repaint, not just on the dedicated 'scroll' listener below.
    dimOverlay.scrollTop = textarea.scrollTop;
  }

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-176-182
  function updateTypewriterScroll() {
    if (textarea.closest('#app-shell')?.dataset.focusLevel !== 'typewriter') return;
    const { top, lineHeight } = getCaretCoordinates(textarea, textarea.selectionStart);
    const rect = textarea.getBoundingClientRect();
    const target = rect.top + rect.height / 2 - lineHeight / 2;
    const delta = top - target;
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-189-193
    if (Math.abs(delta) < lineHeight / 2) return;
    textarea.scrollTop += delta;
  }

  function scheduleSave() {
    clearStatus();
    if (saveTimer) clearTimeout(saveTimer);
    const delay = Store.getAutosaveDelayMs();
    if (delay <= 0) return; // 'off' — rely on flush() at blur/switch/unload only
    saveTimer = setTimeout(() => {
      // The watermark only advances on a persist that actually landed. If
      // it advanced on a failed write, flush() below would see
      // `textarea.value === lastSavedValue`, conclude there was nothing to
      // save, and silently drop the writer's prose at blur/unload — while
      // the footer said "Saved". Store's own retry timer keeps trying in
      // the background; the footer just stops lying in the meantime.
      const persisted = Store.updateChapterContent(chapterId, textarea.value);
      if (persisted) {
        lastSavedValue = textarea.value;
        onSave?.('saved');
      } else {
        onSave?.('error');
      }
    }, delay);
  }

  function schedulePositionSave() {
    if (positionTimer) clearTimeout(positionTimer);
    positionTimer = setTimeout(flushPosition, POSITION_SAVE_DELAY_MS);
  }

  function flushPosition() {
    if (positionTimer) clearTimeout(positionTimer);
    Store.updateChapterPosition(chapterId, {
      cursorPos: textarea.selectionStart,
      scrollTop: textarea.scrollTop,
    });
  }

  function clearStatus() {
    onSave?.('editing');
  }

  function updateWordCount() {
    onWordCount?.(Store.wordCount(textarea.value));
  }

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-231-234
  function closeWriteSession() {
    if (writeIdleTimer) clearTimeout(writeIdleTimer);
    writeIdleTimer = null;
    if (writeSessionStart === null) return;
    Store.addChapterWriteTime(chapterId, Date.now() - writeSessionStart);
    writeSessionStart = null;
  }

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-243-247
  function noteWriteActivity() {
    if (writeSessionStart === null) writeSessionStart = Date.now();
    if (writeIdleTimer) clearTimeout(writeIdleTimer);
    writeIdleTimer = setTimeout(closeWriteSession, WRITE_IDLE_MS);
  }

  function flush() {
    if (saveTimer) clearTimeout(saveTimer);
    if (textarea.value !== lastSavedValue) {
      // Same contract as scheduleSave(): a failed flush must leave the
      // watermark where it was, so the next flush (or Store's retry) still
      // has this text queued as unsaved rather than assuming it's done.
      const persisted = Store.updateChapterContent(chapterId, textarea.value);
      if (persisted) {
        lastSavedValue = textarea.value;
        onSave?.('saved');
      } else {
        onSave?.('error');
      }
    }
    flushPosition();
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-262-267
    closeWriteSession();
  }

  textarea.addEventListener('input', () => {
    scheduleSave();
    schedulePositionSave();
    updateWordCount();
    noteWriteActivity();
    popup.update();
    updateDimOverlay();
    updateTypewriterScroll();
  });
  textarea.addEventListener('keydown', popup.handleKeydown);
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-281-288
  textarea.addEventListener('keydown', (e) => {
    const settings = Store.getTypewriterSettings();
    if (!settings.enabled) return;
    if (e.key === 'Enter') {
      Typewriter.playBell(settings.volume, settings.style);
    } else {
      Typewriter.playClick(settings.volume, settings.style);
    }
  });
  // Session 17 — Ctrl/Cmd+B / Ctrl/Cmd+I as shortcuts for the same toggle
  // the toolbar buttons drive, sharing applyFormatToggle rather than a
  // separate inline implementation.
  // v0.3 — Ctrl/Cmd+U added for underline ({{u:text}}). Note: Ctrl+U in
  // browsers is "view source" by default; preventDefault on it is fine
  // inside a writing app (the writer isn't viewing source).
  textarea.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key === 'b') {
      e.preventDefault();
      applyFormatToggle(textarea, Format.toggleBold(textarea.value, textarea.selectionStart, textarea.selectionEnd));
    } else if (key === 'i') {
      e.preventDefault();
      applyFormatToggle(textarea, Format.toggleItalic(textarea.value, textarea.selectionStart, textarea.selectionEnd));
    } else if (key === 'u') {
      e.preventDefault();
      applyFormatToggle(textarea, Format.toggleUnderline(textarea.value, textarea.selectionStart, textarea.selectionEnd));
    }
  });
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-312-315
  textarea.addEventListener('click', () => {
    popup.hide();
    schedulePositionSave();
    updateDimOverlay();
    updateTypewriterScroll();
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-321-330
    if (!onMentionClick) return;
    const pos = textarea.selectionStart;
    const hit = Store.extractMentions(textarea.value).find((m) => pos >= m.index && pos <= m.index + m.length);
    if (hit) onMentionClick(hit.name);
  });
  textarea.addEventListener('keyup', () => {
    schedulePositionSave();
    updateDimOverlay();
    updateTypewriterScroll();
  });
  textarea.addEventListener('scroll', () => {
    popup.hide();
    schedulePositionSave();
    if (dimOverlay) dimOverlay.scrollTop = textarea.scrollTop;
  });

  // Flush pending save on blur/unload so nothing's lost.
  textarea.addEventListener('blur', () => {
    flush();
    popup.hide();
  });

  activeFlush = flush;
  activeUpdateDim = updateDimOverlay;
  activeUpdateTypewriterScroll = updateTypewriterScroll;
  updateWordCount();
  restorePosition(textarea, chapterId);
  updateDimOverlay();
  updateTypewriterScroll();

  return { flush, destroy: popup.destroy };
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-364-370
function restorePosition(textarea, chapterId) {
  const chapter = Store.getChapter(chapterId);
  if (!chapter) return;
  const pos = Math.min(chapter.lastCursorPos || 0, textarea.value.length);
  textarea.selectionStart = textarea.selectionEnd = pos;
  requestAnimationFrame(() => {
    textarea.scrollTop = chapter.lastScrollTop || 0;
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-378-381
    activeUpdateDim?.();
    activeUpdateTypewriterScroll?.();
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-387-397
// v0.2.9 — Typewriter is now opt-in. The default cycle is off → focus → zen
// (3 states, self-explanatory). When the writer enables Typewriter in
// Settings → Identity, it's added back as a 4th state. This prevents
// writers who don't want the typewriter scroll behavior from landing
// on it by accident.
const ALL_FOCUS_LEVELS = ['off', 'focus', 'zen', 'typewriter'];
const DEFAULT_FOCUS_LEVELS = ['off', 'focus', 'zen'];

export function cycleFocusMode(shellEl) {
  const levels = Store.getTypewriterEnabled() ? ALL_FOCUS_LEVELS : DEFAULT_FOCUS_LEVELS;
  const current = getFocusLevel(shellEl);
  // If the current level isn't in the cycle (e.g. typewriter was on,
  // then disabled in Settings while typewriter mode is active), fall
  // back to 'off' before cycling.
  const idx = levels.indexOf(current);
  const next = levels[((idx === -1 ? 0 : idx) + 1) % levels.length];
  return setFocusLevel(shellEl, next);
}

export function setFocusLevel(shellEl, level) {
  shellEl.dataset.focusLevel = ALL_FOCUS_LEVELS.includes(level) ? level : 'off';
  // Force an immediate repaint rather than waiting for the next keydown/
  // click — switching levels should take visual effect right away, not on
  // the next keystroke.
  activeUpdateDim?.();
  activeUpdateTypewriterScroll?.();
  return shellEl.dataset.focusLevel;
}

export function getFocusLevel(shellEl) {
  return shellEl.dataset.focusLevel || 'off';
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-418-421

function createMentionPopup(textarea) {
  const popup = document.createElement('div');
  popup.className = 'mention-popup';
  popup.style.display = 'none';
  document.body.appendChild(popup);

  let items = [];
  let selectedIndex = 0;
  let currentRange = null; // { start, end } indices into textarea.value

  function hide() {
    popup.style.display = 'none';
    items = [];
    currentRange = null;
  }

  function renderItems() {
    popup.innerHTML = '';
    items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'mention-popup-item' + (i === selectedIndex ? ' active' : '');
      row.textContent = item.label;
      // preventDefault on mousedown keeps the textarea focused so 'blur'
      // never fires between clicking a suggestion and it being applied.
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        select(i);
      });
      popup.appendChild(row);
    });
  }

  function select(i) {
    const item = items[i];
    if (!item || !currentRange) return hide();
    let name = item.name;
    if (item.create) {
      const entity = Store.createEntity({ name: item.name });
      name = entity.name;
    }
    const { text, caret } = insertMention(textarea.value, currentRange.start, currentRange.end, name);
    textarea.value = text;
    textarea.selectionStart = textarea.selectionEnd = caret;
    hide();
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
  }

  function update() {
    const pos = textarea.selectionStart;
    const active = getActiveMentionQuery(textarea.value, pos);
    if (!active) return hide();

    const query = active.query.trim();
    const entities = Store.getEntityList();
    // v0.2.9 — fuzzy match instead of exact substring. Typing "Mra"
    // now matches "Mara" (characters in order, not necessarily contiguous).
    // Falls back to showing all entities when no query (just typed "[[".
    const matches = query
      ? entities.filter((e) => fuzzyMatch(e.name.toLowerCase(), query.toLowerCase()))
      : entities;

    items = matches.slice(0, 6).map((e) => ({ name: e.name, label: `${e.name}  ·  ${e.type}` }));

    const exact = entities.some((e) => e.name.toLowerCase() === query.toLowerCase());
    if (query && !exact) {
      items.push({ name: query, label: `+ Create "${query}"`, create: true });
    }
    if (!items.length) return hide();

    currentRange = { start: active.start, end: active.end };
    selectedIndex = 0;
    renderItems();

    const coords = getCaretCoordinates(textarea, pos);
    popup.style.left = `${coords.left}px`;
    popup.style.top = `${coords.top + coords.lineHeight + 4}px`;
    popup.style.display = 'block';
  }

  function handleKeydown(e) {
    if (popup.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      renderItems();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      renderItems();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      select(selectedIndex);
    } else if (e.key === 'Escape') {
      hide();
    }
  }

  return {
    update,
    hide,
    handleKeydown,
    destroy: () => popup.remove(),
  };
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js-526-534
// P1-8 fix — used to be a `const FOCUS_LEVEL_TOOLTIP` object baked at
// module-load time. The 'off' and 'zen' branches referenced
// Store.getTypewriterEnabled() at first import, so if the writer toggled
// "Typewriter enabled" in Settings and came back to Write, the footer
// button's tooltip still referenced pre-toggle typewriter availability.
// Now a per-call function reads live state at call time. Behavior of the
// button itself was already correct (it cycles through live
// Store.getTypewriterEnabled()); only the tooltip lied. Kept as a named
// export so existing imports keep working — callers that just read the
// object now get a function they need to invoke, but a grep shows no
// external consumers (only updateFocusButtons uses it).
export function getFocusLevelTooltip(level) {
  const tw = Store.getTypewriterEnabled();
  switch (level) {
    case 'off':  return 'Focus mode · click to cycle Focus / Zen' + (tw ? ' / Typewriter' : '');
    case 'focus': return 'Focus · sidebar hidden. Click for Zen.';
    case 'zen':   return 'Zen · most UI hidden. Click for ' + (tw ? 'Typewriter.' : 'off.');
    case 'typewriter': return 'Typewriter · centered current line. Click to turn off.';
    default: return '';
  }
}
export function updateFocusButtons() {
  const level = getFocusLevel(els.shell);
  const footerBtn = q('focus-toggle-footer');
  if (footerBtn) {
    footerBtn.classList.toggle('active', level !== 'off');
    footerBtn.title = getFocusLevelTooltip(level);
  }
}
