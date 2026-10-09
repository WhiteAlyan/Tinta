// Historical context: see docs/CODEBASE_NOTES.md#jsannotationsmodal-js-1-6

import * as Store from './store.js';
import { requestRender } from './renderBus.js';
import { q, escapeHtml } from './dom-utils.js';
import { openModal } from './modal.js';
import { html, toBridge } from './dom-utils.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsannotationsmodal-js-14-22
export function openAnnotationsModal(chapter) {
  const chapterScenes = chapter.scenes || [];

  openModal({
    title: `Annotations · ${escapeHtml(chapter.title)}`,
    className: 'annotations-modal',
    onClose: () => requestRender(),
    body: toBridge(html`
        <div class="annotations-add-row">
          <select id="anno-type">
            ${Store.ANNOTATION_TYPES.map((t) => html`<option value="${t.key}">${t.label}</option>`)}
          </select>
          <select id="anno-scene">
            <option value="">Whole chapter</option>
            ${chapterScenes.map((s) => html`<option value="${s.id}">${s.title}</option>`)}
          </select>
          <input type="text" id="anno-note" placeholder="What needs attention?" />
          <button id="anno-add" class="toolbar-btn">+ Add</button>
        </div>
        <div class="annotations-list" id="annotations-list"></div>
    `),
  });

  const addNote = () => {
    const note = q('anno-note').value;
    if (!note.trim()) return;
    Store.createAnnotation({ chapterId: chapter.id, sceneId: q('anno-scene').value || null, type: q('anno-type').value, note });
    q('anno-note').value = '';
    renderList();
  };
  q('anno-add').addEventListener('click', addNote);
  q('anno-note').addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });

  renderList();

  function sceneTitle(sceneId) {
    if (!sceneId) return null;
    return chapterScenes.find((s) => s.id === sceneId)?.title || null;
  }

  function renderList() {
    const list = q('annotations-list');
    if (!list) return;
    const items = Store.getAnnotationsForChapter(chapter.id);
    const open = items.filter((a) => !a.resolved);
    const resolved = items.filter((a) => a.resolved);

    const row = (a) => {
      const st = sceneTitle(a.sceneId);
      return html`
      <div class="annotation-row" data-anno="${a.id}">
        <label class="annotation-resolve-row">
          <input type="checkbox" class="anno-resolve-check" ${a.resolved ? 'checked' : ''} />
          <span class="annotation-type-tag anno-type-${a.type}">${Store.getAnnotationTypeLabel(a.type)}</span>
          <span class="annotation-note-text">${a.note || html`<span class="empty-state-sm">(no note)</span>`}</span>
        </label>
        ${st ? html`<span class="annotation-scene-tag">${st}</span>` : ''}
        <button class="annotation-delete-btn" title="Delete">✕</button>
      </div>`;
    };

    list.innerHTML = toBridge(
      items.length
        ? html`
        ${open.length ? html`<div class="annotations-group-label">Open (${open.length})</div>${open.map(row)}` : ''}
        ${resolved.length ? html`<div class="annotations-group-label">Resolved (${resolved.length})</div>${resolved.map(row)}` : ''}
      `
        : html`<p class="empty-state-sm">Nothing flagged in this chapter yet. Add a TODO, a research note, a continuity flag, whatever needs revisiting.</p>`
    );

    list.querySelectorAll('.annotation-row').forEach((rowEl) => {
      const id = rowEl.dataset.anno;
      rowEl.querySelector('.anno-resolve-check').addEventListener('change', (e) => {
        Store.updateAnnotation(id, { resolved: e.target.checked });
        renderList();
      });
      rowEl.querySelector('.annotation-delete-btn').addEventListener('click', () => {
        Store.deleteAnnotation(id);
        renderList();
      });
    });
  }
}
