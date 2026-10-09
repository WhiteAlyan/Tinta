// Historical context: see docs/CODEBASE_NOTES.md#jsorganizemodal-js-1-4
import * as ModalShell from './modal.js';
import * as Store from './store.js';
import { setActiveChapterId, setActiveView } from './context.js';
import { html, q, raw, toBridge } from './dom-utils.js';
import { closeModal, confirmDialog, openModal } from './modal.js';
import { requestRender } from './renderBus.js';
import { applySavedSearch } from './searchView.js';
// Historical context: see docs/CODEBASE_NOTES.md#jsorganizemodal-js-12-15
let organizeModalTab = 'chapters';


export const ORGANIZE_TABS = [
  { key: 'chapters', label: 'All Chapters' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'recents', label: 'Recents' },
  { key: 'folders', label: 'Folders' },
  { key: 'parts', label: 'Parts' },
  { key: 'collections', label: 'Collections' },
  { key: 'archive', label: 'Archive' },
  { key: 'trash', label: 'Trash' },
  { key: 'savedSearches', label: 'Saved Searches' },
  { key: 'recentlyDeleted', label: 'Recently Deleted' },
  { key: 'quotes', label: 'Quotes' },
];

export function openOrganizeModal() {
  ModalShell.openModal({
    title: 'Organize',
    className: 'organize-modal',
    body: `
        <div class="organize-tabs" id="organize-tabs">
          ${ORGANIZE_TABS.map((t) => `<button class="organize-tab${t.key === organizeModalTab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
        </div>
        <div id="organize-modal-body" class="organize-modal-body"></div>
    `,
  });

  q('organize-tabs').querySelectorAll('.organize-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      organizeModalTab = btn.dataset.tab;
      q('organize-tabs').querySelectorAll('.organize-tab').forEach((b) => b.classList.toggle('active', b === btn));
      renderOrganizeModalBody();
    });
  });

  renderOrganizeModalBody();
}

export function openChapterFromOrganizeModal(chapterId) {
  setActiveChapterId(chapterId);
  setActiveView('write');
  closeModal();
  requestRender();
}

export function renderOrganizeModalBody() {
  const body = q('organize-modal-body');
  if (!body) return; // modal was closed between an async action and this callback
  switch (organizeModalTab) {
    case 'chapters': return renderOrganizeChaptersTab(body);
    case 'favorites': return renderOrganizeFavoritesTab(body);
    case 'recents': return renderOrganizeRecentsTab(body);
    case 'folders': return renderOrganizeFoldersTab(body);
    case 'parts': return renderOrganizePartsTab(body);
    case 'collections': return renderOrganizeCollectionsTab(body);
    case 'archive': return renderOrganizeArchiveTab(body);
    case 'trash': return renderOrganizeTrashTab(body);
    case 'savedSearches': return renderOrganizeSavedSearchesTab(body);
    case 'recentlyDeleted': return renderOrganizeRecentlyDeletedTab(body);
    case 'quotes': return renderOrganizeQuotesTab(body);
  }
}

// A plain "click row to open, chapter title + word count" list is reused
// across several tabs (Favorites, Recents, Archive's row, Trash's row) —
// factored out so each tab only needs to add its own action buttons per row.
export function chapterOpenRowHtml(chapter, extraButtonsHtml = '') {
  return html`
    <div class="organize-row" data-chapter-id="${chapter.id}">
      <span class="organize-row-title">${chapter.title}</span>
      <span class="organize-row-wc">${Store.wordCount(chapter.content)} words</span>
      ${extraButtonsHtml}
    </div>
  `;
}

export function renderOrganizeChaptersTab(body) {
  const chapters = [...Store.getActiveProject().chapters].filter((c) => !c.trashedAt).sort((a, b) => a.order - b.order);
  const folders = Store.getFolders();
  const parts = Store.getParts();

  body.innerHTML = toBridge(html`
    <p class="backup-note">Favorite, pin, and archive live here too; this list is every non-trashed chapter, including archived ones (marked below), so you can find and un-archive something without switching tabs.</p>
    <div class="organize-list">
      ${
        chapters.length
          ? chapters.map((c) => {
// Historical context: see docs/CODEBASE_NOTES.md#jsorganizemodal-js-105-108
              const isContent = Store.getChapterTypeForChapter(c).role === 'content';
              const partSelect = isContent
                ? html`<select class="organize-part-select" data-chapter-id="${c.id}" title="Part">
                    <option value="">No part</option>
                    ${parts.map((p) => html`<option value="${p.id}" ${c.partId === p.id ? raw('selected') : ''}>${p.title}</option>`)}
                  </select>`
                : '';
              return html`
                <div class="organize-row" data-chapter-id="${c.id}">
                  <span class="organize-row-title">${c.title}${c.archived ? html` <span class="organize-badge">archived</span>` : ''}</span>
                  <select class="organize-folder-select" data-chapter-id="${c.id}" title="Folder">
                    <option value="">No folder</option>
                    ${folders.map((f) => html`<option value="${f.id}" ${c.folderId === f.id ? raw('selected') : ''}>${f.name}</option>`)}
                  </select>
                  ${partSelect}
                  <button class="organize-icon-btn organize-fav-btn${c.favorite ? ' active' : ''}" data-chapter-id="${c.id}" title="Favorite">${c.favorite ? '★' : '☆'}</button>
                  <button class="organize-icon-btn organize-pin-btn${c.pinned ? ' active' : ''}" data-chapter-id="${c.id}" title="Pin">📌</button>
                  <button class="organize-icon-btn organize-archive-btn" data-chapter-id="${c.id}" title="${c.archived ? 'Unarchive' : 'Archive'}">${c.archived ? '⤴' : '🗄'}</button>
                </div>
              `;
            })
          : html`<p class="empty-note">No chapters yet.</p>`
      }
    </div>
  `);

  body.querySelectorAll('.organize-row .organize-row-title').forEach((el) => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => openChapterFromOrganizeModal(el.closest('.organize-row').dataset.chapterId));
  });
  body.querySelectorAll('.organize-folder-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      Store.assignChapterToFolder(sel.dataset.chapterId, sel.value || null);
    });
  });
  body.querySelectorAll('.organize-part-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      Store.assignChapterToPart(sel.dataset.chapterId, sel.value || null);
    });
  });
  body.querySelectorAll('.organize-fav-btn').forEach((btn) => {
    btn.addEventListener('click', () => { Store.toggleChapterFavorite(btn.dataset.chapterId); renderOrganizeModalBody(); });
  });
  body.querySelectorAll('.organize-pin-btn').forEach((btn) => {
    btn.addEventListener('click', () => { Store.toggleChapterPin(btn.dataset.chapterId); renderOrganizeModalBody(); });
  });
  body.querySelectorAll('.organize-archive-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chapter = Store.getChapter(btn.dataset.chapterId);
      if (chapter.archived) Store.unarchiveChapter(chapter.id);
      else Store.archiveChapter(chapter.id);
      renderOrganizeModalBody();
    });
  });
}

export function renderOrganizeFavoritesTab(body) {
  const chapters = Store.getFavoriteChapters();
  body.innerHTML = toBridge(html`
    <div class="organize-list">
      ${
        chapters.length
          ? chapters.map((c) => chapterOpenRowHtml(c, html`<button class="organize-icon-btn organize-fav-btn active" data-chapter-id="${c.id}" title="Remove from favorites">★</button>`))
          : html`<p class="empty-note">No favorites yet. Star a chapter from the sidebar or the All Chapters tab.</p>`
      }
    </div>
  `);
  body.querySelectorAll('.organize-row-title').forEach((el) => {
    el.addEventListener('click', () => openChapterFromOrganizeModal(el.closest('.organize-row').dataset.chapterId));
  });
  body.querySelectorAll('.organize-fav-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Store.toggleChapterFavorite(btn.dataset.chapterId);
      renderOrganizeModalBody();
    });
  });
}

export function renderOrganizeRecentsTab(body) {
  const chapters = Store.getRecentChapters();
  body.innerHTML = toBridge(html`
    <p class="backup-note">The last ${chapters.length ? '' : '(up to 10) '}chapters you opened, most recent first.</p>
    <div class="organize-list">
      ${chapters.length ? chapters.map((c) => chapterOpenRowHtml(c)) : html`<p class="empty-note">Nothing opened yet this project.</p>`}
    </div>
  `);
  body.querySelectorAll('.organize-row-title').forEach((el) => {
    el.addEventListener('click', () => openChapterFromOrganizeModal(el.closest('.organize-row').dataset.chapterId));
  });
}

export function renderOrganizeFoldersTab(body) {
  const folders = Store.getFolders();
  body.innerHTML = toBridge(html`
    <div class="organize-create-row">
      <input type="text" id="new-folder-name" placeholder="New folder name" />
      <button id="create-folder-btn">+ Create</button>
    </div>
    <div class="organize-list">
      ${
        folders.length
          ? folders.map((f) => {
              const chapters = Store.getChaptersInFolder(f.id);
              return html`
                <div class="organize-group" data-folder-id="${f.id}">
                  <div class="organize-group-header">
                    <span class="organize-group-name">${f.name}</span>
                    <span class="organize-group-count">${chapters.length}</span>
                    <button class="organize-icon-btn organize-delete-folder-btn" data-folder-id="${f.id}" title="Delete folder (chapters stay, just unassigned)">✕</button>
                  </div>
                  ${chapters.length ? chapters.map((c) => chapterOpenRowHtml(c)) : html`<p class="empty-note">No chapters in this folder yet. Assign one from the All Chapters tab.</p>`}
                </div>
              `;
            })
          : html`<p class="empty-note">No folders yet.</p>`
      }
    </div>
  `);

  q('create-folder-btn').addEventListener('click', () => {
    const input = q('new-folder-name');
    if (Store.createFolder(input.value)) renderOrganizeModalBody();
  });
  body.querySelectorAll('.organize-delete-folder-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await ModalShell.confirmDialog({ title: 'Delete this folder?', message: 'Delete this folder? Chapters inside it are kept; they just lose the folder assignment.', confirmLabel: 'Delete', danger: true }))) return;
      Store.deleteFolder(btn.dataset.folderId);
      renderOrganizeModalBody();
    });
  });
  body.querySelectorAll('.organize-row-title').forEach((el) => {
    el.addEventListener('click', () => openChapterFromOrganizeModal(el.closest('.organize-row').dataset.chapterId));
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsorganizemodal-js-245-248
export function renderOrganizePartsTab(body) {
  const parts = Store.getParts();
  body.innerHTML = toBridge(html`
    <p class="backup-note">Parts are manuscript sequence (Part One, Part Two…); only content chapters can join one. Reorder with the arrows; front/back-matter and scratch chapters stay out on purpose.</p>
    <div class="organize-create-row">
      <input type="text" id="new-part-title" placeholder="New part title" />
      <button id="create-part-btn">+ Create</button>
    </div>
    <div class="organize-list">
      ${
        parts.length
          ? parts.map((p, i) => {
              const chapters = Store.getChaptersInPart(p.id);
              return html`
                <div class="organize-group" data-part-id="${p.id}">
                  <div class="organize-group-header">
                    <button class="organize-icon-btn organize-part-up-btn" data-part-id="${p.id}" title="Move up" ${i === 0 ? raw('disabled') : ''}>↑</button>
                    <button class="organize-icon-btn organize-part-down-btn" data-part-id="${p.id}" title="Move down" ${i === parts.length - 1 ? raw('disabled') : ''}>↓</button>
                    <span class="organize-group-name">${p.title}</span>
                    <span class="organize-group-count">${chapters.length}</span>
                    <button class="organize-icon-btn organize-delete-part-btn" data-part-id="${p.id}" title="Delete part (chapters stay, just unassigned)">✕</button>
                  </div>
                  ${chapters.length ? chapters.map((c) => chapterOpenRowHtml(c)) : html`<p class="empty-note">No chapters in this part yet. Assign one from the All Chapters tab.</p>`}
                </div>
              `;
            })
          : html`<p class="empty-note">No parts yet.</p>`
      }
    </div>
  `);

  q('create-part-btn').addEventListener('click', () => {
    const input = q('new-part-title');
    if (Store.createPart(input.value)) renderOrganizeModalBody();
  });
  body.querySelectorAll('.organize-part-up-btn').forEach((btn) => {
    btn.addEventListener('click', () => { Store.reorderPart(btn.dataset.partId, 'up'); renderOrganizeModalBody(); });
  });
  body.querySelectorAll('.organize-part-down-btn').forEach((btn) => {
    btn.addEventListener('click', () => { Store.reorderPart(btn.dataset.partId, 'down'); renderOrganizeModalBody(); });
  });
  body.querySelectorAll('.organize-delete-part-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await ModalShell.confirmDialog({ title: 'Delete this part?', message: 'Delete this part? Chapters inside it are kept; they just lose the part assignment.', confirmLabel: 'Delete', danger: true }))) return;
      Store.deletePart(btn.dataset.partId);
      renderOrganizeModalBody();
    });
  });
  body.querySelectorAll('.organize-row-title').forEach((el) => {
    el.addEventListener('click', () => openChapterFromOrganizeModal(el.closest('.organize-row').dataset.chapterId));
  });
}

export function renderOrganizeCollectionsTab(body) {
  const collections = Store.getCollections();
  const allChapters = [...Store.getActiveProject().chapters].filter((c) => !c.trashedAt).sort((a, b) => a.order - b.order);

  body.innerHTML = toBridge(html`
    <div class="organize-create-row">
      <input type="text" id="new-collection-name" placeholder="New collection name" />
      <button id="create-collection-btn">+ Create</button>
    </div>
    <div class="organize-list">
      ${
        collections.length
          ? collections.map((coll) => {
              const members = Store.getChaptersInCollection(coll.id);
              const memberIds = new Set(members.map((c) => c.id));
              const addable = allChapters.filter((c) => !memberIds.has(c.id));
              return html`
                <div class="organize-group" data-collection-id="${coll.id}">
                  <div class="organize-group-header">
                    <span class="organize-group-name">${coll.name}</span>
                    <span class="organize-group-count">${members.length}</span>
                    <button class="organize-icon-btn organize-delete-collection-btn" data-collection-id="${coll.id}" title="Delete collection (chapters aren't affected)">✕</button>
                  </div>
                  ${members.map((c) => chapterOpenRowHtml(c, html`<button class="organize-icon-btn organize-remove-from-collection-btn" data-collection-id="${coll.id}" data-chapter-id="${c.id}" title="Remove from collection">✕</button>`))}
                  ${
                    addable.length
                      ? html`
                        <div class="organize-add-row">
                          <select class="organize-add-select" data-collection-id="${coll.id}">
                            <option value="">+ Add a chapter…</option>
                            ${addable.map((c) => html`<option value="${c.id}">${c.title}</option>`)}
                          </select>
                        </div>
                      `
                      : ''
                  }
                </div>
              `;
            })
          : html`<p class="empty-note">No collections yet. Unlike folders, a chapter can belong to any number of collections.</p>`
      }
    </div>
  `);

  q('create-collection-btn').addEventListener('click', () => {
    const input = q('new-collection-name');
    if (Store.createCollection(input.value)) renderOrganizeModalBody();
  });
  body.querySelectorAll('.organize-delete-collection-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await ModalShell.confirmDialog({ title: 'Delete this collection?', message: 'Delete this collection? Chapters inside it are kept.', confirmLabel: 'Delete', danger: true }))) return;
      Store.deleteCollection(btn.dataset.collectionId);
      renderOrganizeModalBody();
    });
  });
  body.querySelectorAll('.organize-remove-from-collection-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Store.removeChapterFromCollection(btn.dataset.collectionId, btn.dataset.chapterId);
      renderOrganizeModalBody();
    });
  });
  body.querySelectorAll('.organize-add-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      if (sel.value) Store.addChapterToCollection(sel.dataset.collectionId, sel.value);
      renderOrganizeModalBody();
    });
  });
  body.querySelectorAll('.organize-row-title').forEach((el) => {
    el.addEventListener('click', () => openChapterFromOrganizeModal(el.closest('.organize-row').dataset.chapterId));
  });
}

export function renderOrganizeArchiveTab(body) {
  const chapters = Store.getArchivedChapters();
  body.innerHTML = toBridge(html`
    <p class="backup-note">Archived chapters are hidden from the sidebar and left out of manuscript export by default, but otherwise untouched.</p>
    <div class="organize-list">
      ${
        chapters.length
          ? chapters.map((c) => chapterOpenRowHtml(c, html`<button class="organize-text-btn organize-unarchive-btn" data-chapter-id="${c.id}">Unarchive</button>`))
          : html`<p class="empty-note">Nothing archived.</p>`
      }
    </div>
  `);
  body.querySelectorAll('.organize-row-title').forEach((el) => {
    el.addEventListener('click', () => openChapterFromOrganizeModal(el.closest('.organize-row').dataset.chapterId));
  });
  body.querySelectorAll('.organize-unarchive-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Store.unarchiveChapter(btn.dataset.chapterId);
      renderOrganizeModalBody();
    });
  });
}

export function renderOrganizeTrashTab(body) {
  const chapters = Store.getTrashedChapters();
  body.innerHTML = toBridge(html`
    <p class="backup-note">Trashed chapters aren't shown anywhere else in the app and don't count toward word totals or chapter numbering, but nothing is actually gone until you delete forever.</p>
    <div class="organize-list">
      ${
        chapters.length
          ? chapters.map((c) => html`
              <div class="organize-row" data-chapter-id="${c.id}">
                <span class="organize-row-title">${c.title}</span>
                <span class="organize-row-wc">${Store.wordCount(c.content)} words</span>
                <button class="organize-text-btn organize-restore-btn" data-chapter-id="${c.id}">Restore</button>
                <button class="organize-text-btn organize-purge-btn" data-chapter-id="${c.id}">Delete forever</button>
              </div>
            `)
          : html`<p class="empty-note">Trash is empty.</p>`
      }
    </div>
  `);
// Historical context: see docs/CODEBASE_NOTES.md#jsorganizemodal-js-418-421
  body.querySelectorAll('.organize-restore-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      Store.restoreChapter(btn.dataset.chapterId);
      renderOrganizeModalBody();
    });
  });
  body.querySelectorAll('.organize-purge-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const chapter = Store.getChapter(btn.dataset.chapterId);
      if (!(await ModalShell.confirmDialog({ title: 'Permanently delete this chapter?', message: `Permanently delete "${chapter.title}"? This really can't be undone.`, confirmLabel: 'Delete forever', danger: true }))) return;
      Store.permanentlyDeleteChapter(btn.dataset.chapterId);
      renderOrganizeModalBody();
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsorganizemodal-js-438-444
export function renderOrganizeRecentlyDeletedTab(body) {
  const backups = Store.getDeletedItemBackups();
  const kindLabel = { entity: 'Entity', ruleSystem: 'Rule system' };
  body.innerHTML = toBridge(html`
    <p class="backup-note">Entities and rule systems don't have a Trash step: deleting one is immediate. This is a short buffer of the last ${backups.length ? 'items' : '20 items'} deleted that way, in case one needs to come back.</p>
    <div class="organize-list">
      ${
        backups.length
          ? backups.map((b) => html`
              <div class="organize-row" data-backup-id="${b.id}">
                <span class="organize-row-title" style="cursor:default">${b.label || '(untitled)'}</span>
                <span class="organize-row-wc">${kindLabel[b.kind] || b.kind} · deleted ${new Date(b.deletedAt).toLocaleString()}</span>
                <button class="organize-text-btn organize-restore-deleted-btn" data-backup-id="${b.id}">Restore</button>
              </div>
            `)
          : html`<p class="empty-note">Nothing recently deleted.</p>`
      }
    </div>
  `);
  body.querySelectorAll('.organize-restore-deleted-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const result = Store.restoreDeletedItem(btn.dataset.backupId);
// Historical context: see docs/CODEBASE_NOTES.md#jsorganizemodal-js-467-472
      if (result) requestRender({ skipModalClose: true });
      renderOrganizeModalBody();
    });
  });
}

export function renderOrganizeSavedSearchesTab(body) {
  const searches = Store.getSavedSearches();
  body.innerHTML = toBridge(html`
    <div class="organize-create-row saved-search-create">
      <input type="text" id="new-saved-search-name" placeholder="Name" />
      <input type="text" id="new-saved-search-query" placeholder="Search text" />
      <label><input type="checkbox" id="new-saved-search-case" /> Case-sensitive</label>
      <label><input type="checkbox" id="new-saved-search-regex" /> Regex</label>
      <button id="create-saved-search-btn">+ Save</button>
    </div>
    <div class="organize-list">
      ${
        searches.length
          ? searches.map((s) => html`
              <div class="organize-row">
                <span class="organize-row-title" style="cursor:default">${s.name}</span>
                <span class="organize-row-wc">“${s.query}”${s.useRegex ? ' · regex' : ''}${s.caseSensitive ? ' · case-sensitive' : ''}</span>
                <button class="organize-text-btn organize-run-search-btn" data-search-id="${s.id}">Run</button>
                <button class="organize-icon-btn organize-delete-search-btn" data-search-id="${s.id}" title="Delete">✕</button>
              </div>
            `)
          : html`<p class="empty-note">No saved searches yet.</p>`
      }
    </div>
  `);

  q('create-saved-search-btn').addEventListener('click', () => {
    const saved = Store.createSavedSearch({
      name: q('new-saved-search-name').value,
      query: q('new-saved-search-query').value,
      caseSensitive: q('new-saved-search-case').checked,
      useRegex: q('new-saved-search-regex').checked,
    });
    if (saved) renderOrganizeModalBody();
  });
  body.querySelectorAll('.organize-run-search-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = searches.find((x) => x.id === btn.dataset.searchId);
      if (!s) return;
      applySavedSearch(s);
      setActiveView('search');
      closeModal();
      requestRender();
    });
  });
  body.querySelectorAll('.organize-delete-search-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      Store.deleteSavedSearch(btn.dataset.searchId);
      renderOrganizeModalBody();
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsorganizemodal-js-532-535
export function renderOrganizeQuotesTab(body) {
  const quotes = Store.getQuoteList();
  body.innerHTML = toBridge(html`
    <p class="backup-note">Lines you've saved from your own writing, most recent first.</p>
    <div class="organize-list">
      ${
        quotes.length
          ? quotes.map((quote) => {
              const sourceChapter = Store.getChapter(quote.chapterId);
              return html`
                <div class="organize-row">
                  <span class="organize-row-title" style="cursor:default">“${quote.text}”</span>
                  <span class="organize-row-wc">${sourceChapter ? sourceChapter.title : 'chapter no longer exists'}</span>
                  ${sourceChapter ? html`<button class="organize-text-btn organize-jump-quote-btn" data-chapter-id="${quote.chapterId}">Open</button>` : ''}
                  <button class="organize-icon-btn organize-delete-quote-btn" data-quote-id="${quote.id}" title="Delete">✕</button>
                </div>
              `;
            })
          : html`<p class="empty-note">No quotes saved yet. Select some text in the editor and click ❝ in the formatting toolbar.</p>`
      }
    </div>
  `);
  body.querySelectorAll('.organize-jump-quote-btn').forEach((btn) => {
    btn.addEventListener('click', () => openChapterFromOrganizeModal(btn.dataset.chapterId));
  });
  body.querySelectorAll('.organize-delete-quote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      Store.deleteQuote(btn.dataset.quoteId);
      renderOrganizeModalBody();
    });
  });
}


// Same #modal-root overlay pattern as the history/export modals above —
// triggered from the sidebar's ▾ button next to the project title input.

// Historical context: see docs/CODEBASE_NOTES.md#jsorganizemodal-js-573-587

// Library metadata pass — which project fields the filter row can chip on, and their
// display labels. Order here is the render order.
