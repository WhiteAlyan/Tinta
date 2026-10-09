// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-1-36

import * as Store from './store.js';
import { html, raw, toBridge, q, bindOutsideClick } from './dom-utils.js';
import { attachEditor, applyFormatToggle, cycleFocusMode, clearActiveEditor } from './editor.js';
import * as Format from './format.js';
import { requestRender } from './renderBus.js';
import { setActiveTextareaEl } from './context.js';
import { renderSidebar } from './sidebar.js';
import { updateFocusButtons } from './editor.js';
import { openChapterTypeManager } from './typeManagers.js';
import { openHistoryModal } from './historyModals.js';
import { openExportMenu } from './exportMenu.js';
import { flashAndScrollTo } from './dom-utils.js';
import { activeChapterId, setActiveView, setActiveChapterId } from './context.js';
import { els } from './els.js';
import { currentEditorHandle, setCurrentEditorHandle } from './context.js';
import { STATUS_LABEL, STATUS_ORDER, vocabularyLabel, vocabularyOrder } from './vocabulary.js';
import { showToast, showGoalCelebration } from './toast.js';
import { openEntityDrawer } from './drawer.js';
import { openWordCheckModal, openThesaurusModal } from './wordCheckModal.js';
import { openGrammarModal } from './grammarModal.js';
import { openReadAloudModal } from './readAloud.js';
import { openAnnotationsModal } from './annotationsModal.js';

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-61-79
let lastRenderedChapterId = null;

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-82-89
function closeToolbarPopovers() {
  q('details-popover')?.classList.add('hidden');
  q('more-menu')?.classList.add('hidden');
  q('bookmarks-popover')?.classList.add('hidden');
}

export function renderWriteView(project) {
  const panel = document.querySelector('.view-panel[data-view="write"]');
  const chapter = project.chapters.find((c) => c.id === activeChapterId);

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-100-105
  const motion = Store.getMotionSettings();
// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-107-112
  const chapterActuallyChanged = chapter && chapter.id !== lastRenderedChapterId;
  const isChapterSwitch = motion.chapterTransitions && chapterActuallyChanged;
  lastRenderedChapterId = chapter ? chapter.id : null;
  if (chapterActuallyChanged) Store.recordChapterOpened(chapter.id);

  // The old textarea is about to be replaced via innerHTML — flush any
  // pending debounced save first, or a fast chapter switch mid-typing loses
  // whatever hadn't autosaved yet. Also tears down its mention popup element.
  if (currentEditorHandle) {
    currentEditorHandle.flush?.();
    currentEditorHandle.destroy?.();
    setCurrentEditorHandle(null);
  }

  if (!chapter) {
    panel.innerHTML = toBridge(html`<div class="empty-state">A blank page, waiting. Create a chapter to start writing.</div>`);
    setActiveTextareaEl(null);
    return;
  }

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-133-141
  const chapterDocType = Store.getChapterTypeForChapter(chapter);
  const chapterNumber = Store.getContentChapterNumber(chapter);
  const chapterNumberLabel =
    chapterDocType.role === 'content'
      ? chapterNumber
        ? `${chapterDocType.key === 'chapter' ? 'CHAPTER' : chapterDocType.label.toUpperCase()} ${String(chapterNumber).padStart(2, '0')}`
        : ''
      : chapterDocType.label.toUpperCase();

  // Quick-wins pass — bookmark star state for this chapter + the full
  // project-wide list for the jump popover, and a count of unresolved
  // annotations touching this chapter for the toolbar badge.
  const chapterBookmark = Store.getBookmarkForChapter(chapter.id, null);
  const allBookmarks = Store.getBookmarkList();
  const openAnnotationCount = Store.getAnnotationsForChapter(chapter.id).filter((a) => !a.resolved).length;

  panel.innerHTML = toBridge(html`
    <div class="write-toolbar">
      <div class="write-toolbar-spacer"></div>

      <div class="write-toolbar-right">
        <div class="wt-popover-group">
          <button id="details-btn" class="toolbar-btn-icon" title="Chapter details: status, POV, arc">≡</button>
          <div id="details-popover" class="wt-popover hidden">
            <label class="wt-popover-field">
              <span>Status</span>
              <select id="status-select" class="status-select">
                ${vocabularyOrder('chapterStatus').map((s) => html`<option value="${s}" ${s === chapter.status ? raw('selected') : ''}>${vocabularyLabel('chapterStatus', s)}</option>`)}
              </select>
            </label>
            <label class="wt-popover-field">
              <span>Document type</span>
              <select id="doctype-select" class="status-select">
                ${Store.getChapterTypes().map((t) => html`<option value="${t.key}" ${t.key === chapter.docType ? raw('selected') : ''}>${t.label}</option>`)}
              </select>
            </label>
            <button id="manage-doctypes-btn" class="wt-menu-item" style="text-align:left; padding-left:0;">⚙ Manage document types…</button>
            <label class="wt-popover-field">
              <span>POV character</span>
              <input type="text" id="pov-input" class="pov-input" placeholder="POV character" value="${chapter.povCharacter}" />
            </label>
            <label class="wt-popover-field">
              <span>Arc / act</span>
              <input type="text" id="arc-input" class="arc-input" placeholder="Arc / act" value="${chapter.arc || ''}" />
            </label>
          </div>
        </div>
        <button id="history-btn" class="toolbar-btn-icon" title="Revision history">🕐</button>
        <button id="grammar-btn" class="toolbar-btn-icon" title="Grammar & style check">✓</button>
        <button id="bookmark-toggle-btn" class="toolbar-btn-icon${chapterBookmark ? ' active' : ''}" title="${chapterBookmark ? 'Remove bookmark' : 'Bookmark this chapter'}">${chapterBookmark ? '★' : '☆'}</button>
        <div class="wt-popover-group">
          <button id="bookmarks-list-btn" class="toolbar-btn-icon" title="Jump to a bookmark">🔖${allBookmarks.length ? html`<span class="toolbar-btn-badge">${allBookmarks.length}</span>` : ''}</button>
          <div id="bookmarks-popover" class="wt-popover hidden">
            ${
              allBookmarks.length === 0
                ? html`<p class="empty-state-sm">No bookmarks yet. Click ☆ to bookmark this chapter.</p>`
                : allBookmarks.map(
                    (b) => html`<div class="bookmark-row" data-jump-bookmark-chapter="${b.chapterId}" data-jump-bookmark-scene="${b.sceneId || ''}">
                        <span>${b.label}</span>
                        <button class="bookmark-remove-btn" data-remove-bookmark="${b.id}" title="Remove">✕</button>
                      </div>`
                  )
            }
          </div>
        </div>
        <div class="wt-popover-group">
          <button id="annotations-btn" class="toolbar-btn-icon" title="Annotations: TODOs, notes, continuity flags">🏷${openAnnotationCount ? html`<span class="toolbar-btn-badge">${openAnnotationCount}</span>` : ''}</button>
        </div>
        <button id="export-btn" class="toolbar-btn-icon" title="Export">⇩</button>
        <div class="wt-popover-group">
          <button id="more-btn" class="toolbar-btn-icon" title="More tools">⋯</button>
          <div id="more-menu" class="wt-popover wt-menu hidden">
            <button id="wordcheck-btn" class="wt-menu-item">📊 Word Check</button>
            <button id="thesaurus-btn" class="wt-menu-item">🔤 Names &amp; Archeshic Records</button>
            <button id="readaloud-btn" class="wt-menu-item">🔊 Read Aloud</button>
            <button id="import-btn" class="wt-menu-item">⇪ Import .txt / .md</button>
          </div>
        </div>
        <input type="file" id="import-file-input" accept=".txt,.md" style="display:none" />
      </div>
    </div>
    <div class="chapter-heading${isChapterSwitch ? ' chapter-enter' : ''}">
      <div class="chapter-number-label">${chapterNumberLabel}</div>
      <input type="text" id="chapter-title-input" class="chapter-title-input" value="${chapter.title}" />
      <div class="chapter-heading-divider" aria-hidden="true"><span></span><i>❖</i><span></span></div>
    </div>
    <div class="format-toolbar">
      <button id="format-bold-btn" class="format-btn" title="Bold (Ctrl/Cmd+B)"><strong>B</strong></button>
      <button id="format-italic-btn" class="format-btn" title="Italic (Ctrl/Cmd+I)"><em>I</em></button>
      <button id="format-underline-btn" class="format-btn" title="Underline (Ctrl/Cmd+U)"><u>U</u></button>
      <div class="format-color-group">
        <button id="format-color-btn" class="format-btn" title="Highlight color">🎨</button>
        <div id="format-color-menu" class="format-color-menu hidden">
          ${Format.COLOR_NAMES.map((c) => html`<button class="format-swatch fmt-color-${c}" data-color="${c}" title="${c}"></button>`)}
        </div>
      </div>
      <button id="save-quote-btn" class="format-btn" title="Save selected text as a quote">❝</button>
    </div>
    <div class="editor-stack${isChapterSwitch ? ' chapter-enter' : ''}">
      <div id="focus-dim-overlay" class="focus-dim-overlay" aria-hidden="true"></div>
      <textarea id="chapter-editor" class="chapter-editor" placeholder="Begin writing…">${chapter.content}</textarea>
    </div>
    <div class="write-footer">
      <span id="save-status" class="save-status">Saved</span>
      <span id="word-count" class="word-count-display">${Store.wordCount(chapter.content)} words</span>
      <button id="focus-toggle-footer" class="focus-toggle-footer" title="Focus mode">Focus ⛶</button>
    </div>
  `);

  els.saveStatus = q('save-status');
  els.wordCount = q('word-count');

  const textarea = q('chapter-editor');
  setActiveTextareaEl(textarea);
// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-255-260
  setCurrentEditorHandle(attachEditor({
    textarea,
    chapterId: chapter.id,
    onSave: (state) => {
      // Three states, not two. 'error' means Store.save() reported that the
      // write did not land (cross-tab staleness, quota, localStorage
      // unreachable). Store retries in the background and its own
      // onSaveError banner explains the cause — the footer's job here is
      // simply never to claim "Saved" for text that isn't.
      els.saveStatus.textContent = state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved' : 'Editing…';
      els.saveStatus.classList.toggle('is-editing', state === 'editing');
      els.saveStatus.classList.toggle('is-save-error', state === 'error');
      if (state === 'saved') {
        renderSidebar(project); // refresh word count dot
        if (Store.checkGoalCelebration(project)) showGoalCelebration(project);
      }
    },
    onWordCount: (count) => {
      els.wordCount.textContent = `${count} words`;
    },
    onMentionClick: (name) => {
      const entity = Store.findEntityByName(name);
      if (entity) openEntityDrawer(entity.id);
    },
  }));

  q('chapter-title-input').addEventListener('input', (e) => {
    Store.updateChapterMeta(chapter.id, { title: e.target.value });
    renderSidebar(Store.getActiveProject());
  });

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-286-292
  const footerFocusBtn = q('focus-toggle-footer');
  updateFocusButtons();
  footerFocusBtn.addEventListener('click', () => {
    cycleFocusMode(els.shell);
    updateFocusButtons();
  });

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-300-303
  q('format-bold-btn').addEventListener('click', () => {
    applyFormatToggle(textarea, Format.toggleBold(textarea.value, textarea.selectionStart, textarea.selectionEnd));
  });
  q('format-italic-btn').addEventListener('click', () => {
    applyFormatToggle(textarea, Format.toggleItalic(textarea.value, textarea.selectionStart, textarea.selectionEnd));
  });
  // v0.3 — Underline button. Same shape as Bold/Italic. Format.toggleUnderline
  // wraps the selection in {{u:...}}.
  q('format-underline-btn').addEventListener('click', () => {
    applyFormatToggle(textarea, Format.toggleUnderline(textarea.value, textarea.selectionStart, textarea.selectionEnd));
  });
  q('format-color-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    q('format-color-menu').classList.toggle('hidden');
  });
  q('format-color-menu').querySelectorAll('.format-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyFormatToggle(textarea, Format.toggleColor(textarea.value, textarea.selectionStart, textarea.selectionEnd, btn.dataset.color));
      q('format-color-menu').classList.add('hidden');
    });
  });
// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-320-325
  q('save-quote-btn').addEventListener('click', () => {
    const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim();
    if (!selected) {
      showToast('Select some text first to save it as a quote', { icon: '❝' });
      return;
    }
    Store.createQuote({ text: selected, chapterId: chapter.id });
    showToast('Saved as a quote', { icon: '❝' });
  });

  q('status-select').addEventListener('change', (e) => {
    Store.updateChapterMeta(chapter.id, { status: e.target.value });
    renderSidebar(Store.getActiveProject());
  });

  q('doctype-select').addEventListener('change', (e) => {
    Store.updateChapterMeta(chapter.id, { docType: e.target.value });
    renderWriteView(Store.getActiveProject()); // heading label depends on docType — needs a full re-render, not just the sidebar
  });
  q('manage-doctypes-btn').addEventListener('click', () => openChapterTypeManager());

  q('pov-input').addEventListener('input', (e) => {
    Store.updateChapterMeta(chapter.id, { povCharacter: e.target.value });
  });

  // Session 22 — arc / act label. Saves on input (debounced via updateChapterArc);
  // re-renders the sidebar so the arc pill appears immediately after typing.
  q('arc-input').addEventListener('input', (e) => {
    Store.updateChapterArc(chapter.id, e.target.value);
    renderSidebar(Store.getActiveProject());
  });

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-358-366
  const detailsPopover = q('details-popover');
  const moreMenu = q('more-menu');
  const bookmarksPopover = q('bookmarks-popover');
  // closeToolbarPopovers is module-level now — see the scope-bug note
  // above closeToolbarPopoversOnOutsideClick below.
  q('details-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = detailsPopover.classList.contains('hidden');
    closeToolbarPopovers();
    detailsPopover.classList.toggle('hidden', !willOpen);
  });
  q('more-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = moreMenu.classList.contains('hidden');
    closeToolbarPopovers();
    moreMenu.classList.toggle('hidden', !willOpen);
  });
// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-384-390
  bindOutsideClick(closeToolbarPopoversOnOutsideClick);

  // Session 22 — import. The hidden file input does the actual file-picking;
  // the visible button clicks it. File reading and chapter creation happen in
  // the 'change' handler so there's no stale-closure issue with chapter.id.
  q('import-btn').addEventListener('click', () => {
    closeToolbarPopovers();
    q('import-file-input').click();
  });
  q('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = ev.target.result || '';
      const { title, content } = parseImportedFile(file.name, raw);
      const newChapter = Store.importChapterFromText(title, content);
      // Switch Write view to the new chapter so the writer sees what was imported.
      setActiveChapterId(newChapter.id);
      setActiveView('write');
      requestRender();
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported if needed.
    e.target.value = '';
  });

  q('history-btn').addEventListener('click', () => openHistoryModal(chapter.id));
  q('wordcheck-btn').addEventListener('click', () => { closeToolbarPopovers(); openWordCheckModal(chapter); });
  q('thesaurus-btn').addEventListener('click', () => { closeToolbarPopovers(); openThesaurusModal(); });
  q('grammar-btn').addEventListener('click', () => openGrammarModal(chapter));
  q('readaloud-btn').addEventListener('click', () => { closeToolbarPopovers(); openReadAloudModal(chapter); });
  q('export-btn').addEventListener('click', () => openExportMenu(chapter.id));

  // Quick-wins pass — bookmark star toggle, bookmarks jump popover,
  // annotations modal.
  q('bookmark-toggle-btn').addEventListener('click', () => {
    if (chapterBookmark) {
      Store.deleteBookmark(chapterBookmark.id);
    } else {
      Store.createBookmark({ chapterId: chapter.id, label: chapter.title });
    }
    renderWriteView(Store.getActiveProject());
  });

  q('bookmarks-list-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = bookmarksPopover.classList.contains('hidden');
    closeToolbarPopovers();
    bookmarksPopover.classList.toggle('hidden', !willOpen);
  });
  panel.querySelectorAll('[data-jump-bookmark-chapter]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.bookmark-remove-btn')) return;
      setActiveChapterId(row.dataset.jumpBookmarkChapter);
      setActiveView('write');
      requestRender();
      if (row.dataset.jumpBookmarkScene) {
        flashAndScrollTo(`.scene-card[data-scene-id="${row.dataset.jumpBookmarkScene}"]`);
      }
    });
  });
  panel.querySelectorAll('[data-remove-bookmark]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Store.deleteBookmark(btn.dataset.removeBookmark);
      renderWriteView(Store.getActiveProject());
    });
  });

  q('annotations-btn').addEventListener('click', () => { closeToolbarPopovers(); openAnnotationsModal(chapter); });
}

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-464-468
function closeToolbarPopoversOnOutsideClick(e) {
  if (!e.target.closest('.wt-popover-group')) closeToolbarPopovers();
}

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-473-482
function parseImportedFile(filename, raw) {
  const baseName = filename.replace(/\.[^.]+$/, '').trim() || 'Imported Chapter';
  const isMd = filename.toLowerCase().endsWith('.md');

  if (isMd) {
    // Find the first non-empty line and check if it's a heading.
    const lines = raw.split('\n');
    const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
    if (firstNonEmpty !== -1) {
      const headingMatch = lines[firstNonEmpty].match(/^#{1,2}\s+(.+)/);
      if (headingMatch) {
        const title = headingMatch[1].trim();
        // Strip the heading line (and any immediately following blank line)
        // so the editor content doesn't start with the title repeated.
        const rest = lines.slice(firstNonEmpty + 1);
        const contentStart = rest.findIndex((l) => l.trim().length > 0);
        const content = contentStart === -1 ? '' : rest.slice(contentStart).join('\n').trimEnd();
        return { title, content };
      }
    }
  }

  return { title: baseName, content: raw.trimEnd() };
}

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-508-515

// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-517-520


// Historical context: see docs/CODEBASE_NOTES.md#jswriteview-js-389-396
export function resetWriteViewState() {
  lastRenderedChapterId = null;
  setActiveTextareaEl(null);
  if (currentEditorHandle) {
    currentEditorHandle.flush?.();
    currentEditorHandle.destroy?.();
    setCurrentEditorHandle(null);
  }
  // P1-7 fix — also null out editor.js's module-level slots so the
  // pagehide / beforeunload / resize listeners (which capture
  // activeFlush / activeUpdateDim / activeUpdateTypewriterScroll by
  // reference) don't fire against detached DOM or save stale text to the
  // wrong chapter after a view switch. The resize listener at
  // editor.js:29 stays registered for the session (cheap; short-circuits
  // when active* are null), but the closures it calls are now no-ops
  // until a new editor is attached.
  clearActiveEditor();
}

import { registerViewReset } from './viewLifecycle.js';
registerViewReset('write', resetWriteViewState);
