// annotationsView (0.2.7 move-out) — the Annotations dashboard + its two
// filter state vars (moved with the view, same footing as every other view).
//
import * as Store from './store.js';
import { setActiveChapterId, setActiveView } from './context.js';
import { html, q, raw, toBridge } from './dom-utils.js';
import { openSceneInspector } from './drawer.js';
import { requestRender } from './renderBus.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsannotationsview-js-10-14
export let annotationsDashTypeFilter = '';
export let annotationsDashStatusFilter = 'open'; // 'open' | 'resolved' | 'all'

export function renderAnnotationsView(project) {
  const panel = document.querySelector('.view-panel[data-view="annotations"]');
  const all = Store.getAnnotationList();
  const openCount = all.filter((a) => !a.resolved).length;
  const resolvedCount = all.length - openCount;

  const chapterById = new Map(project.chapters.map((c) => [c.id, c]));
  const sceneTitle = (chapterId, sceneId) => {
    if (!sceneId) return null;
    return chapterById.get(chapterId)?.scenes.find((s) => s.id === sceneId)?.title || null;
  };

  const statusFiltered = all.filter((a) =>
    annotationsDashStatusFilter === 'all' ? true : annotationsDashStatusFilter === 'open' ? !a.resolved : a.resolved
  );
  const filtered = annotationsDashTypeFilter
    ? statusFiltered.filter((a) => a.type === annotationsDashTypeFilter)
    : statusFiltered;

// Historical context: see docs/CODEBASE_NOTES.md#jsannotationsview-js-37-42
  const grouped = [...project.chapters]
    .sort((a, b) => a.order - b.order)
    .map((chapter) => ({ chapter, items: filtered.filter((a) => a.chapterId === chapter.id) }))
    .filter((g) => g.items.length > 0);

  const row = (a) => {
    const st = sceneTitle(a.chapterId, a.sceneId);
    return html`
      <div class="annotation-row" data-anno="${a.id}">
        <label class="annotation-resolve-row">
          <input type="checkbox" class="anno-resolve-check" ${a.resolved ? raw('checked') : ''} />
          <span class="annotation-type-tag anno-type-${a.type}">${Store.getAnnotationTypeLabel(a.type)}</span>
          <span class="annotation-note-text">${a.note || html`<span class="empty-state-sm">(no note)</span>`}</span>
        </label>
        ${st ? html`<button class="annotation-scene-tag" data-jump-scene="${a.sceneId}" data-jump-scene-chapter="${a.chapterId}">${st}</button>` : ''}
        <button class="annotation-delete-btn" title="Delete">✕</button>
      </div>`;
  };

  panel.innerHTML = toBridge(html`
    <div class="health-header">
      <h2>Annotations</h2>
      <span class="health-total-note">${openCount === 0 ? 'Nothing open · nicely tended.' : html`${openCount} open item${openCount === 1 ? '' : 's'} across the manuscript`}</span>
    </div>

    <div class="health-section">
      <div class="annotations-dash-filters">
        <div class="annotations-dash-status-toggle">
          <button type="button" class="health-range-btn${annotationsDashStatusFilter === 'open' ? ' active' : ''}" data-status="open">Open (${openCount})</button>
          <button type="button" class="health-range-btn${annotationsDashStatusFilter === 'resolved' ? ' active' : ''}" data-status="resolved">Resolved (${resolvedCount})</button>
          <button type="button" class="health-range-btn${annotationsDashStatusFilter === 'all' ? ' active' : ''}" data-status="all">All (${all.length})</button>
        </div>
        <select id="anno-dash-type-filter">
          <option value="">All types</option>
          ${Store.ANNOTATION_TYPES.map((t) => html`<option value="${t.key}" ${annotationsDashTypeFilter === t.key ? raw('selected') : ''}>${t.label}</option>`)}
        </select>
      </div>

      ${
        grouped.length
          ? grouped.map(
              (g) => html`
        <div class="annotations-dash-chapter-group">
          <button class="annotations-dash-chapter-head" data-jump-chapter="${g.chapter.id}">
            ${g.chapter.title} <span class="health-row-sub">${g.items.length} item${g.items.length === 1 ? '' : 's'}</span>
          </button>
          <div class="annotations-list">${g.items.map(row)}</div>
        </div>`
            )
          : html`<p class="empty-state-sm">${
              all.length === 0
                ? "Nothing flagged anywhere yet. Add a TODO, a research note, a continuity flag, from any chapter's toolbar or the Scene Inspector."
                : 'Nothing matches this filter.'
            }</p>`
      }
    </div>
  `);

  panel.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      annotationsDashStatusFilter = btn.dataset.status;
      renderAnnotationsView(Store.getActiveProject());
    });
  });
  const typeSelect = q('anno-dash-type-filter');
  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      annotationsDashTypeFilter = e.target.value;
      renderAnnotationsView(Store.getActiveProject());
    });
  }

  panel.querySelectorAll('.annotation-row').forEach((rowEl) => {
    const id = rowEl.dataset.anno;
    rowEl.querySelector('.anno-resolve-check').addEventListener('change', (e) => {
      Store.updateAnnotation(id, { resolved: e.target.checked });
      renderAnnotationsView(Store.getActiveProject());
    });
    rowEl.querySelector('.annotation-delete-btn').addEventListener('click', () => {
      Store.deleteAnnotation(id);
      renderAnnotationsView(Store.getActiveProject());
    });
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsannotationsview-js-127-132
  panel.querySelectorAll('[data-jump-chapter]').forEach((btn) => {
    // Scene-tag buttons also carry data-jump-chapter (as the parent
    // chapter) alongside data-jump-scene — handled by the more specific
    // selector below, so skip those here to avoid double-binding.
    if (btn.dataset.jumpScene) return;
    btn.addEventListener('click', () => {
      setActiveChapterId(btn.dataset.jumpChapter);
      setActiveView('write');
      requestRender();
    });
  });
  panel.querySelectorAll('[data-jump-scene]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chapterId = btn.dataset.jumpSceneChapter;
      const sceneId = btn.dataset.jumpScene;
      setActiveChapterId(chapterId);
      setActiveView('write');
      requestRender();
      openSceneInspector(chapterId, sceneId);
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsannotationsview-js-157-162

// Historical context: see docs/CODEBASE_NOTES.md#jsannotationsview-js-164-177


// v0.2.9 — Phase 7b: reset annotations filters on project switch.
export function resetAnnotationsViewState() {
  annotationsDashTypeFilter = '';
  annotationsDashStatusFilter = 'open';
}

import { registerViewReset } from './viewLifecycle.js';
registerViewReset('annotations', resetAnnotationsViewState);
