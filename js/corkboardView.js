// Historical context: see docs/CODEBASE_NOTES.md#jscorkboardview-js-1-28
import * as Store from './store.js';
import { els } from './els.js';
import { html, toBridge } from './dom-utils.js';

export function renderCorkboardView(project) {
  const panel = document.querySelector('.view-panel[data-view="corkboard"]');
  // Session 22 — respect the sidebar arc filter in the corkboard too,
  // so a writer filtering to "Act II" in the sidebar sees the same subset
  // when they switch to the corkboard, without a separate filter control.
  const activeArc = els.arcFilterSelect?.value || '';
  const chapters = [...project.chapters]
    .sort((a, b) => a.order - b.order)
    .filter((c) => !activeArc || c.arc === activeArc);
  const groups = Store.groupChaptersByPart(chapters);

  panel.innerHTML = toBridge(html`
    <div class="corkboard-header">
      <h2>Corkboard${activeArc ? html` · ${activeArc}` : ''}</h2>
      <p>Scene cards across ${activeArc ? 'filtered' : 'every'} chapter: goal, conflict, outcome.</p>
    </div>
    <div class="corkboard-chapters"></div>
  `);

  const container = panel.querySelector('.corkboard-chapters');

  groups.forEach(({ part, chapters: partChapters }) => {
    if (partChapters.length === 0) return;
    // Only show a part header when parts actually exist — a project with
    // no parts defined yet renders exactly as it always has, no
    // "Unassigned" clutter for a feature nobody's opted into.
    if (part) {
      const partHeader = document.createElement('div');
      partHeader.className = 'corkboard-part-header';
      partHeader.innerHTML = toBridge(html`<h2>${part.title}</h2>`);
      container.appendChild(partHeader);
    } else if (groups.some((g) => g.part)) {
      const partHeader = document.createElement('div');
      partHeader.className = 'corkboard-part-header corkboard-part-unassigned';
      partHeader.innerHTML = toBridge(html`<h2>Not in a part</h2>`);
      container.appendChild(partHeader);
    }

    partChapters.forEach((chapter) => {
      const group = document.createElement('div');
      group.className = 'corkboard-group';
      group.innerHTML = toBridge(html`
        <div class="corkboard-group-header">
          <span class="status-dot dot-${chapter.status}"></span>
          <h3>${chapter.title}</h3>
          <button class="add-scene-btn" data-chapter="${chapter.id}">+ Scene</button>
        </div>
        <div class="scene-cards" data-chapter="${chapter.id}"></div>
      `);
      container.appendChild(group);

      const cardsEl = group.querySelector('.scene-cards');
      cardsEl.dataset.chapter = chapter.id;
      chapter.scenes
        .sort((a, b) => a.order - b.order)
        .forEach((scene) => cardsEl.appendChild(renderSceneCard(chapter.id, scene)));

      group.querySelector('.add-scene-btn').addEventListener('click', () => {
        Store.createScene(chapter.id, { title: 'New Scene' });
        renderCorkboardView(Store.getActiveProject());
      });

      wireCorkboardDropZone(cardsEl);
    });
  });
}

// Returns the card the dragging card should be inserted BEFORE, based on
// vertical mouse position (grid wraps to rows, so we compare midpoints
// rather than assuming a single-column list). Null means "insert at end".
function getDragAfterElement(container, y) {
  const candidates = [...container.querySelectorAll('.scene-card:not(.dragging)')];
  return candidates.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

// Historical context: see docs/CODEBASE_NOTES.md#jscorkboardview-js-116-120
function wireCorkboardDropZone(cardsEl) {
  cardsEl.addEventListener('dragover', (e) => {
    const dragging = document.querySelector('.scene-card.dragging');
    if (!dragging) return;
    e.preventDefault();
    const after = getDragAfterElement(cardsEl, e.clientY);
    if (after == null) cardsEl.appendChild(dragging);
    else cardsEl.insertBefore(dragging, after);
  });

  cardsEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const sceneId = e.dataTransfer.getData('text/plain');
    if (!sceneId) return;
    const cards = [...cardsEl.querySelectorAll('.scene-card')];
    const newIndex = cards.findIndex((c) => c.dataset.sceneId === sceneId);
    Store.moveScene(sceneId, cardsEl.dataset.chapter, newIndex);
    renderCorkboardView(Store.getActiveProject());
  });
}

function renderSceneCard(chapterId, scene) {
  const card = document.createElement('div');
  card.className = 'scene-card';
  card.dataset.sceneId = scene.id;
  card.innerHTML = toBridge(html`
    <span class="scene-drag-handle" draggable="true" title="Drag to reorder or move to another chapter">⠿</span>
    <input type="text" class="scene-title" value="${scene.title}" />
    <label>Goal <textarea class="scene-field" data-field="goal" rows="2">${scene.goal}</textarea></label>
    <label>Conflict <textarea class="scene-field" data-field="conflict" rows="2">${scene.conflict}</textarea></label>
    <label>Outcome <textarea class="scene-field" data-field="outcome" rows="2">${scene.outcome}</textarea></label>
    <button class="scene-delete" title="Delete scene">✕</button>
  `);

  // Drag lives on a dedicated handle rather than the whole card so mouse
  // interaction with the title input and textareas (selecting text,
  // clicking to focus) is never mistaken for a drag start.
  const handle = card.querySelector('.scene-drag-handle');
  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', scene.id);
    e.dataTransfer.setDragImage(card, 20, 20);
    // Deferred so the drag image is captured before the class changes the
    // card's appearance (opacity), matching native drag-ghost behavior.
    requestAnimationFrame(() => card.classList.add('dragging'));
  });
  handle.addEventListener('dragend', () => card.classList.remove('dragging'));

  card.querySelector('.scene-title').addEventListener('input', (e) => {
    Store.updateScene(chapterId, scene.id, { title: e.target.value });
  });
  card.querySelectorAll('.scene-field').forEach((field) => {
    field.addEventListener('input', (e) => {
      Store.updateScene(chapterId, scene.id, { [e.target.dataset.field]: e.target.value });
    });
  });
  card.querySelector('.scene-delete').addEventListener('click', () => {
    Store.deleteScene(chapterId, scene.id);
    renderCorkboardView(Store.getActiveProject());
  });

  return card;
}
