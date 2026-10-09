// Historical context: see docs/CODEBASE_NOTES.md#jsbookview-js-1-4
import * as Format from './format.js';
import * as ImageStore from './imagestore.js';
import * as Store from './store.js';
import { activeChapterId, activeView, setActiveChapterId } from './context.js';
import { html, q, raw, toBridge } from './dom-utils.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsbookview-js-11-15
export let bookModeUrls = [];

export const BOOK_COLUMN_WIDTH = 430;
export const BOOK_COLUMN_GAP = 40;
export const BOOK_SPREAD_STEP = 2 * (BOOK_COLUMN_WIDTH + BOOK_COLUMN_GAP); // one spread = 2 columns

export function revokeBookModeUrls() {
  bookModeUrls.forEach((url) => URL.revokeObjectURL(url));
  bookModeUrls = [];
}


export async function renderBookView(project) {
  const panel = document.querySelector('.view-panel[data-view="book"]');
  revokeBookModeUrls();

  const chapter = Store.getChapter(activeChapterId);
  if (!chapter) {
    panel.innerHTML = toBridge(html`<div class="empty-state">Nothing open yet. Pick a chapter from the sidebar to read it here.</div>`);
    return;
  }

  const sortedChapters = [...project.chapters].sort((a, b) => a.order - b.order);
  const idx = sortedChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = sortedChapters[idx - 1] || null;
  const nextChapter = sortedChapters[idx + 1] || null;

  panel.innerHTML = toBridge(html`
    <div class="book-toolbar">
      <div class="book-toolbar-side book-toolbar-left">
        <button id="book-prev-chapter-btn" class="toolbar-btn" ${prevChapter ? '' : raw('disabled')} title="${prevChapter ? prevChapter.title : 'No previous chapter'}">‹‹ Chapter</button>
      </div>
      <h2 class="book-chapter-title">${chapter.title}</h2>
      <div class="book-toolbar-side book-toolbar-right">
        <button id="book-next-chapter-btn" class="toolbar-btn" ${nextChapter ? '' : raw('disabled')} title="${nextChapter ? nextChapter.title : 'No next chapter'}">Chapter ››</button>
        <span id="book-page-indicator" class="book-page-indicator">Loading…</span>
        <button id="book-prev-page-btn" class="toolbar-btn" disabled title="Previous page (←)">‹ Page</button>
        <button id="book-next-page-btn" class="toolbar-btn" disabled title="Next page (→)">Page ›</button>
      </div>
    </div>
    <div class="book-spread-wrap">
      <div id="book-spread" class="book-spread"><p class="empty-note">Loading…</p></div>
    </div>
  `);

  q('book-prev-chapter-btn')?.addEventListener('click', () => {
    setActiveChapterId(prevChapter.id);
    renderBookView(Store.getActiveProject());
  });
  q('book-next-chapter-btn')?.addEventListener('click', () => {
    setActiveChapterId(nextChapter.id);
    renderBookView(Store.getActiveProject());
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsbookview-js-70-73
  const imageIds = Format.extractImageIds(chapter.content);
  const images = {};
  await Promise.all(
    imageIds.map(async (id) => {
      const meta = Store.getImage(id);
      if (!meta) return; // deleted image still referenced in text — renders as missing placeholder, not an error
      try {
        const url = await ImageStore.getObjectUrl(id);
        if (url) {
          bookModeUrls.push(url);
          images[id] = { url, caption: meta.caption };
        }
      } catch {
        // Leave unresolved — renderFormattedHtml() shows a missing-image
        // placeholder for any id not in the map, same as a deleted one.
      }
    })
  );

  // The view may have moved on while images were resolving (fast chapter
  // switching, or navigating away entirely) — don't paginate into a panel
  // nobody's looking at anymore, and don't stomp on whatever's rendering now.
  if (activeView !== 'book' || activeChapterId !== chapter.id) return;

  const spread = q('book-spread');
  if (!spread) return;
  spread.innerHTML = toBridge(
    chapter.content.trim()
      ? raw(Format.renderFormattedHtml(chapter.content, { images }))
      : html`<p class="empty-note">Nothing written here yet. Come back once this chapter has some pages.</p>`
  );

  setupBookPagination(spread, chapter.id, chapter.lastReadSpread || 0);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsbookview-js-109-125
export function setupBookPagination(spread, chapterId, initialSpread = 0) {
  requestAnimationFrame(() => {
    const totalWidth = spread.scrollWidth;
    const totalColumns = Math.max(1, Math.round(totalWidth / (BOOK_COLUMN_WIDTH + BOOK_COLUMN_GAP)));
    const totalSpreads = Math.max(1, Math.ceil(totalColumns / 2));
    let currentSpread = Math.max(0, Math.min(initialSpread, totalSpreads - 1));

    const indicator = q('book-page-indicator');
    const prevBtn = q('book-prev-page-btn');
    const nextBtn = q('book-next-page-btn');
    if (!indicator || !prevBtn || !nextBtn) return; // navigated away during this frame

    function updateControls() {
      const firstPage = currentSpread * 2 + 1;
      const lastPage = Math.min(firstPage + 1, totalColumns);
      indicator.textContent = totalColumns <= 1 ? 'Page 1 of 1' : `Page ${firstPage}${lastPage > firstPage ? '–' + lastPage : ''} of ${totalColumns}`;
      prevBtn.disabled = currentSpread === 0;
      nextBtn.disabled = currentSpread >= totalSpreads - 1;
    }

    // Jump straight to the restored position, no smooth-scroll animation
    // — this is "reopen where I was," not a page turn the reader should
    // watch happen.
    if (currentSpread > 0) spread.scrollLeft = currentSpread * BOOK_SPREAD_STEP;

    prevBtn.addEventListener('click', () => {
      currentSpread = Math.max(0, currentSpread - 1);
      spread.scrollTo({ left: currentSpread * BOOK_SPREAD_STEP, behavior: 'smooth' });
      updateControls();
      Store.updateChapterReadPosition(chapterId, currentSpread);
    });
    nextBtn.addEventListener('click', () => {
      currentSpread = Math.min(totalSpreads - 1, currentSpread + 1);
      spread.scrollTo({ left: currentSpread * BOOK_SPREAD_STEP, behavior: 'smooth' });
      updateControls();
      Store.updateChapterReadPosition(chapterId, currentSpread);
    });

    updateControls();
  });
}

// renderSnippetsView extracted to snippetsView.js (v0.2 Pass 3) — see that
// file's header comment for why it was picked second, after Stats.

// Historical context: see docs/CODEBASE_NOTES.md#jsbookview-js-171-180

// Historical context: see docs/CODEBASE_NOTES.md#jsbookview-js-182-186

// Historical context: see docs/CODEBASE_NOTES.md#jsbookview-js-188-195

// Historical context: see docs/CODEBASE_NOTES.md#jsbookview-js-197-200

// Historical context: see docs/CODEBASE_NOTES.md#jsbookview-js-153-160
export function resetBookViewState() {
  revokeBookModeUrls();
}

import { registerViewReset } from './viewLifecycle.js';
registerViewReset('book', resetBookViewState);
