// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js

import * as Store from './store.js';
import * as Format from './format.js';
import * as Typewriter from './typewriter.js';
import * as ImageStore from './imagestore.js';
import { getActiveMentionQuery, insertMention, getCaretCoordinates, splitParagraphs } from './mentions.js';
import { els } from './els.js';
import { q } from './dom-utils.js';

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
const POSITION_SAVE_DELAY_MS = 800;

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
const WRITE_IDLE_MS = 5 * 60 * 1000;

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
let activeFlush = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => activeFlush?.());
  window.addEventListener('beforeunload', () => activeFlush?.());
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
let activeUpdateDim = null;
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
let activeUpdateTypewriterScroll = null;
if (typeof window !== 'undefined') {
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
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

// CR-05 fix — IME composition guard. During a Chinese/Japanese/Korean
// composition every keystroke of the candidate string arrives as a
// keydown with isComposing=true (keyCode 229 on legacy Safari/IE), and
// the keystrokes that COMMIT the composition (Enter) or navigate
// candidate windows (arrows) are ordinary keys as far as the DOM is
// concerned. Without a guard the mention popup swallowed Enter/Tab and
// the arrows mid-composition (inserting its first fuzzy match on top
// of the text being committed), the typewriter sounds clicked through
// every candidate navigation, and Ctrl+B/I/U toggles could fire
// mid-composition. Standard fix: early-return on isComposing / 229 in
// every textarea keydown handler. isComposing on the event is the
// modern signal; keyCode 229 covers Safari builds that don't set it.
function isImeComposing(e) {
  return e.isComposing === true || e.keyCode === 229;
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
// CR-08 — the one sanctioned way to programmatically rewrite a textarea's
// value. Assigning `.value` directly clears the browser's native undo
// stack in Chromium, Firefox, and WebKit — and the app-level undo
// deliberately refuses to run inside a textarea (commands.js
// isTextEditingField) because native undo is supposed to own prose
// history. Net effect used to be that one Ctrl+B invalidated the writer's
// entire Ctrl+Z history, contradicting the shortcut list's own promise.
//
// The undo-preserving path is execCommand('insertText') on a selection:
// it flows through the same editing pipeline as typing, so the native
// stack records it as one undoable step. setRangeText was considered and
// rejected — it bypasses undo (and in some engines clears the buffer
// outright). We locate the minimal replaced span by trimming the common
// prefix/suffix of the old and new values (exact for every wrap/insert
// edit the app performs), select it, and insert. If the engine rejects or
// mangles the edit (checked by comparing the resulting value), we fall
// back to the historical value assignment: losing undo history for that
// one operation is strictly better than losing prose.
export function applyTextareaEdit(textarea, newText, newSelStart, newSelEnd) {
  const oldText = textarea.value;
  if (newText === oldText) {
    textarea.setSelectionRange(newSelStart, newSelEnd);
    return;
  }
  // Minimal edit span: skip the shared prefix, then the shared suffix.
  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText[start] === newText[start]) start++;
  let endOld = oldText.length;
  let endNew = newText.length;
  while (endOld > start && endNew > start && oldText[endOld - 1] === newText[endNew - 1]) {
    endOld--;
    endNew--;
  }
  const inserted = newText.slice(start, endNew);
  // eslint 10 no-useless-assignment — always assigned inside the try before
  // any read; the initializer would be dead.
  let usedExecCommand;
  textarea.focus();
  try {
    textarea.setSelectionRange(start, endOld);
    usedExecCommand =
      typeof document !== 'undefined' &&
      typeof document.execCommand === 'function' &&
      document.execCommand('insertText', false, inserted) === true;
  } catch {
    usedExecCommand = false;
  }
  if (!usedExecCommand || textarea.value !== newText) {
    // Fallback — tests, exotic embeds, or an engine that mangled the
    // insertion (insertText has known newline quirks in old WebKit).
    textarea.value = newText;
  }
  textarea.setSelectionRange(newSelStart, newSelEnd);
  // execCommand fires its own input event mid-call (before the caret is
  // moved to its final position); this one runs with the final value AND
  // the final selection, which is what every listener assumes. The
  // duplicate pass through the save scheduler is coalesced there.
  textarea.dispatchEvent(new Event('input'));
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
export function applyFormatToggle(textarea, result) {
  // CR-08 — routes through applyTextareaEdit so toggling bold/italic/
  // underline/color preserves the native undo stack instead of wiping it.
  applyTextareaEdit(textarea, result.text, result.selStart, result.selEnd);
}

export function attachEditor({ textarea, chapterId, onSave, onWordCount, onMentionClick }) {
  let saveTimer = null;
  let positionTimer = null;
  let lastSavedValue = textarea.value;
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
  let writeSessionStart = null;
  let writeIdleTimer = null;
  const popup = createMentionPopup(textarea);
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
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
  // CR-39 — the caret position the overlay last rendered. The input event
  // and keyup both used to call updateDimOverlay() unconditionally, so
  // every printable keystroke ran the full-document paragraph regex, the
  // per-mention entity lookups and the whole-innerHTML overlay parse TWICE,
  // plus the mirror-div layout thrash in updateTypewriterScroll. keyup now
  // refreshes only when the caret actually moved without an input event
  // (arrow keys, Home/End, page navigation).
  const lastOverlayCaret = { start: -1, end: -1 };
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
    // CR-39 — remember the caret this pass rendered, so the keyup handler
    // can skip its redundant second pass after printable input.
    lastOverlayCaret.start = textarea.selectionStart;
    lastOverlayCaret.end = textarea.selectionEnd;
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
        // CR-04 fix — keepMarkers: true puts renderEditorParagraph in
        // metric-parity mode: format markers stay in the output as
        // transparent .fmt-marker spans, so this paragraph occupies the
        // same width as the textarea's raw layout of the same characters.
        // Without it the overlay soft-wrapped formatted paragraphs at
        // different points than the textarea (markers deleted + real bold
        // glyphs), which is what dragged the caret a line off and broke
        // bottom-of-chapter scroll sync.
        : Format.renderEditorParagraph(paraText, { images, mentionResolver, keepMarkers: true });
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

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
  function updateTypewriterScroll() {
    if (textarea.closest('#app-shell')?.dataset.focusLevel !== 'typewriter') return;
    // CR-39 — record the caret here too: this mirror-div measurement is
    // the expensive half of the duplicated keystroke work.
    lastOverlayCaret.start = textarea.selectionStart;
    lastOverlayCaret.end = textarea.selectionEnd;
    const { top, lineHeight } = getCaretCoordinates(textarea, textarea.selectionStart);
    const rect = textarea.getBoundingClientRect();
    const target = rect.top + rect.height / 2 - lineHeight / 2;
    const delta = top - target;
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
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

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
  function closeWriteSession() {
    if (writeIdleTimer) clearTimeout(writeIdleTimer);
    writeIdleTimer = null;
    if (writeSessionStart === null) return;
    Store.addChapterWriteTime(chapterId, Date.now() - writeSessionStart);
    writeSessionStart = null;
  }

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
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
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
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
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
  textarea.addEventListener('keydown', (e) => {
    if (isImeComposing(e)) return; // CR-05 — no typewriter clicks mid-composition
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
    // CR-05 — same composition guard: a format toggle triggered while
    // the IME is mid-composition rewrites textarea.value underneath the
    // composition, cancelling it and losing the buffered input.
    if (isImeComposing(e)) return;
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
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
  textarea.addEventListener('click', () => {
    popup.hide();
    schedulePositionSave();
    updateDimOverlay();
    updateTypewriterScroll();
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
    if (!onMentionClick) return;
    const pos = textarea.selectionStart;
    const hit = Store.extractMentions(textarea.value).find((m) => pos >= m.index && pos <= m.index + m.length);
    if (hit) onMentionClick(hit.name);
  });
  // CR-39 — keyup fires for every printable key AFTER the input event has
  // already refreshed the overlay at the same caret. Only caret movement
  // that produces no input event (arrows, Home/End, PgUp/PgDn) needs the
  // second pass — gate both refreshes on the selection actually having
  // moved since the last rendered overlay state.
  function refreshOverlayIfCaretMoved() {
    if (textarea.selectionStart === lastOverlayCaret.start && textarea.selectionEnd === lastOverlayCaret.end) return;
    updateDimOverlay();
    updateTypewriterScroll();
  }

  textarea.addEventListener('keyup', () => {
    schedulePositionSave();
    refreshOverlayIfCaretMoved();
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

  return {
    flush,
    destroy: popup.destroy,
    // CR-07 — the watermark: the last editor value whose persist actually
    // LANDED. It only advances on a true return from
    // Store.updateChapterContent, so after a save refused as cross-tab
    // stale it still holds the last-known-good text — exactly what the
    // conflict banner needs to distinguish "editor has unsaved work" from
    // "editor matches what landed". Comparing against the live chapter
    // object was wrong: updateChapterContent mutates that object BEFORE
    // save() is attempted, so the comparison saw the refused text as
    // already-saved and degraded the rescue banner to the plain reload
    // variant.
    getLastSavedValue: () => lastSavedValue,
    getValue: () => textarea.value,
  };
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
function restorePosition(textarea, chapterId) {
  const chapter = Store.getChapter(chapterId);
  if (!chapter) return;
  const pos = Math.min(chapter.lastCursorPos || 0, textarea.value.length);
  textarea.selectionStart = textarea.selectionEnd = pos;
  requestAnimationFrame(() => {
    textarea.scrollTop = chapter.lastScrollTop || 0;
// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
    activeUpdateDim?.();
    activeUpdateTypewriterScroll?.();
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
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

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js

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
    // CR-08 — insert through the undo-preserving edit path; a direct
    // value assignment wiped the writer's whole native undo history.
    // applyTextareaEdit focuses the textarea and fires the input event.
    applyTextareaEdit(textarea, text, caret, caret);
    hide();
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
    // CR-05 fix — guard FIRST: while a composition is active the popup
    // must not intercept Enter/Tab (they commit the composition) or the
    // arrow keys (they navigate IME candidates). Previously an IME user
    // typing an entity name inside [[...]] had the popup insert its
    // first fuzzy match on top of the composition being committed.
    if (isImeComposing(e)) return;
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

// Historical context: see docs/CODEBASE_NOTES.md#jseditor-js
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
