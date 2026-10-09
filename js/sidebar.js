// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-1-4
import * as ModalShell from './modal.js';
import * as Store from './store.js';
import { activeChapterId, setActiveChapterId, setActiveView } from './context.js';
import { html, toBridge } from './dom-utils.js';
import { openSceneInspector } from './drawer.js';
import { els } from './els.js';
import { requestRender } from './renderBus.js';
import { STATUS_LABEL } from './vocabulary.js';

// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-15-25
export const collapsedActs = new Set();
export const expandedChapterScenes = new Set();

export function renderSidebar(project) {
  // Organization pass — trashed and archived chapters don't belong in the
  // primary list (Trash/Archive get their own view inside the Organize
  // modal).
  const chapters = [...project.chapters]
    .filter((c) => !c.trashedAt && !c.archived)
    .sort((a, b) => a.order - b.order);

// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-37-41
  const arcs = [...new Set(chapters.map((c) => c.arc).filter(Boolean))].sort();
  const prevArc = els.arcFilterSelect?.value || '';
  els.arcFilterBar.style.display = arcs.length > 0 ? '' : 'none';
  if (arcs.length > 0) {
    els.arcFilterSelect.innerHTML = toBridge(html`<option value="">All arcs</option>${arcs.map((a) => html`<option value="${a}" ${a === prevArc ? 'selected' : ''}>${a}</option>`)}`);
    // Reattach listener each render — simpler than tracking whether it's
    // already attached, since renderSidebar always rebuilds the options list.
    els.arcFilterSelect.onchange = () => renderSidebar(project);
  }
  const activeArc = arcs.length > 0 ? els.arcFilterSelect.value : '';

  els.chapterList.innerHTML = '';

  // v0.2.9 — Recent chapters section. project.recentChapterIds is an
  // MRU list (capped at 8 by recordChapterOpened). Surface the top 3
  // (excluding the currently active chapter, which is already
  // highlighted in the list below) as a quick-jump section at the top.
  // Only shows when there are 4+ chapters (below that, the full list is
  // short enough to scan without a Recent section).
  const recentIds = (project.recentChapterIds || []).filter(
    (id) => id !== activeChapterId && chapters.find((c) => c.id === id)
  ).slice(0, 3);
  if (recentIds.length >= 1 && chapters.length >= 4) {
    const recentHeader = document.createElement('li');
    recentHeader.className = 'sb-recent-header';
    recentHeader.textContent = 'Recent';
    els.chapterList.appendChild(recentHeader);
    recentIds.forEach((id) => {
      const ch = chapters.find((c) => c.id === id);
      if (ch) els.chapterList.appendChild(buildChapterListItem(ch));
    });
    const divider = document.createElement('li');
    divider.className = 'sb-recent-divider';
    els.chapterList.appendChild(divider);
  }

// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-55-66
  const useActGroups = !activeArc && arcs.length > 0;
  const visibleChapters = pinnedFirst(chapters.filter((c) => !activeArc || c.arc === activeArc));

  if (!useActGroups) {
    visibleChapters.forEach((chapter) => els.chapterList.appendChild(buildChapterListItem(chapter)));
    return;
  }

// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-75-78
  const groups = [];
  visibleChapters.forEach((chapter) => {
    const arc = chapter.arc || '';
    const last = groups[groups.length - 1];
    if (!last || last.arc !== arc) groups.push({ arc, chapters: [chapter] });
    else last.chapters.push(chapter);
  });
  groups.forEach((group) => els.chapterList.appendChild(buildActGroupItem(group)));
}

// One collapsible Act section: a header button (arc name + caret) and a
// nested <ul> of that group's already-known chapters.
export function buildActGroupItem(group) {
  const li = document.createElement('li');
  li.className = 'sb-act';
  const isOpen = !collapsedActs.has(group.arc);

  const header = document.createElement('button');
  header.className = 'sb-act-header';
  header.innerHTML = toBridge(html`<span class="sb-act-caret${isOpen ? ' open' : ''}">▸</span><span class="sb-act-label">${group.arc || 'Unsorted'}</span>`);
  header.addEventListener('click', () => {
    if (collapsedActs.has(group.arc)) collapsedActs.delete(group.arc);
    else collapsedActs.add(group.arc);
    renderSidebar(Store.getActiveProject());
  });

  const nested = document.createElement('ul');
  nested.className = 'sb-act-chapters';
  nested.hidden = !isOpen;
  pinnedFirst(group.chapters).forEach((chapter) => nested.appendChild(buildChapterListItem(chapter)));

  li.append(header, nested);
  return li;
}

// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-114-118
export function buildChapterListItem(chapter) {
  const li = document.createElement('li');
  li.className = 'sb-chapter' + (chapter.id === activeChapterId ? ' active' : '');

  const row = document.createElement('div');
  row.className = 'sb-chapter-row';

  const dot = document.createElement('span');
  dot.className = `status-dot dot-${chapter.status}`;
  dot.title = STATUS_LABEL[chapter.status];

  const label = document.createElement('span');
  label.className = 'sb-chapter-title';
  label.textContent = chapter.title;

  const wc = document.createElement('span');
  wc.className = 'sb-chapter-wc';
  wc.textContent = Store.wordCount(chapter.content);

// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-138-144
  const favBtn = document.createElement('button');
  favBtn.className = 'sb-chapter-favorite' + (chapter.favorite ? ' active' : '');
  favBtn.title = chapter.favorite ? 'Remove from favorites' : 'Add to favorites';
  favBtn.textContent = chapter.favorite ? '★' : '☆';
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    Store.toggleChapterFavorite(chapter.id);
    requestRender();
  });

  const pinBtn = document.createElement('button');
  pinBtn.className = 'sb-chapter-pin' + (chapter.pinned ? ' active' : '');
  pinBtn.title = chapter.pinned ? 'Unpin' : 'Pin to top';
  pinBtn.textContent = '📌';
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    Store.toggleChapterPin(chapter.id);
    requestRender();
  });

// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-165-170
  const del = document.createElement('button');
  del.className = 'sb-chapter-delete';
  del.title = 'Move to trash';
  del.textContent = '✕';
  del.addEventListener('click', async (e) => {
    // Without this, the click bubbles to the row's own listener below and
    // opens the chapter (in Write view) in the same click that deletes it.
    e.stopPropagation();
    if (!(await ModalShell.confirmDialog({ title: 'Move to trash?', message: `Move "${chapter.title}" to trash? You can restore it from Organize → Trash.`, confirmLabel: 'Move to trash', danger: false }))) return;
    const wasActive = chapter.id === activeChapterId;
    Store.trashChapter(chapter.id);
    if (wasActive) {
      const remaining = [...Store.getActiveProject().chapters].filter((c) => !c.trashedAt && !c.archived).sort((a, b) => a.order - b.order);
      setActiveChapterId(remaining[0]?.id || null);
    }
    requestRender();
  });

  row.append(dot, label, wc, favBtn, pinBtn, del);

// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-191-195
  if (chapter.arc && !useActGroupsHint()) {
    const pill = document.createElement('span');
    pill.className = 'arc-pill';
    pill.textContent = chapter.arc;
    pill.title = `Arc: ${chapter.arc}`;
    row.append(pill);
  }

  row.addEventListener('click', () => {
    setActiveChapterId(chapter.id);
    setActiveView('write');
    requestRender();
  });

  li.appendChild(row);

  // Book-tree sidebar pass — nested scene list. Only added when the
  // chapter actually has scenes (most won't, unless the writer's used the
  // Corkboard) and collapsed by default (see expandedChapterScenes above).
  if (chapter.scenes.length > 0) {
    const isOpen = expandedChapterScenes.has(chapter.id);
    const caret = document.createElement('button');
    caret.className = 'sb-scene-caret' + (isOpen ? ' open' : '');
    caret.title = isOpen ? 'Hide scenes' : `Show ${chapter.scenes.length} scene${chapter.scenes.length === 1 ? '' : 's'}`;
    caret.textContent = '▸';
    caret.addEventListener('click', (e) => {
      e.stopPropagation();
      if (expandedChapterScenes.has(chapter.id)) expandedChapterScenes.delete(chapter.id);
      else expandedChapterScenes.add(chapter.id);
      requestRender();
    });
    row.appendChild(caret);

    if (isOpen) {
      const sceneList = document.createElement('ul');
      sceneList.className = 'sb-scene-list';
      [...chapter.scenes].sort((a, b) => a.order - b.order).forEach((scene) => {
        const sceneLi = document.createElement('li');
        sceneLi.className = 'sb-scene';
        sceneLi.textContent = scene.title;
        sceneLi.addEventListener('click', (e) => {
// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-237-240
          e.stopPropagation();
          setActiveChapterId(chapter.id);
          setActiveView('write');
          requestRender();
          openSceneInspector(chapter.id, scene.id);
        });
        sceneList.appendChild(sceneLi);
      });
      li.appendChild(sceneList);
    }
  }

  return li;
}

// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-256-261
export function pinnedFirst(list) {
  return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}

// Historical context: see docs/CODEBASE_NOTES.md#jssidebar-js-266-271
export function useActGroupsHint() {
  return !!(els.arcFilterBar && els.arcFilterBar.style.display !== 'none' && !els.arcFilterSelect.value);
}
