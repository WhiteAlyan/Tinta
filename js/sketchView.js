// Historical context: see docs/CODEBASE_NOTES.md#jssketchview-js-1-4
import * as ImageStore from './imagestore.js';
import * as ModalShell from './modal.js';
import * as Sketchpad from './sketchpad.js';
import * as Store from './store.js';
import { activeSketchId, setActiveEntityId, setActiveSketchId, setActiveView } from './context.js';
import { html, q, toBridge } from './dom-utils.js';
import { openImageLibrary } from './imageLibrary.js';
import { confirmDialog } from './modal.js';
import { requestRender } from './renderBus.js';
import { showStorageWarning, showToast } from './toast.js';


// Called from render() when the current view isn't Sketch — detaches the
// canvas's pointer listeners so they don't linger on a detached element.
export function detachSketchDrawing() {
  if (sketchDetachDrawing) {
    sketchDetachDrawing();
    sketchDetachDrawing = null;
  }
}
// Historical context: see docs/CODEBASE_NOTES.md#jssketchview-js-25-29
export const SKETCH_COLORS = ['#B08D57', '#9B6B2F', '#4A7C59', '#8B3A3A', '#3A5A8B', '#FFFFFF', '#191825'];

export let sketchDetachDrawing = null;

// Historical context: see docs/CODEBASE_NOTES.md#jssketchview-js-34-38
export let sketchColor = null;
export let sketchWidth = 3;

// Guarantees a visible default pen color for whichever theme is active.
// Falls back to the first swatch if --ink isn't readable for some reason.
export function defaultSketchColor() {
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  return ink || SKETCH_COLORS[0];
}

export function renderSketchView(project) {
  const panel = document.querySelector('.view-panel[data-view="sketch"]');
  const sketches = Store.getSketchList();

  if (!activeSketchId || !sketches.find((s) => s.id === activeSketchId)) {
    setActiveSketchId(sketches[0]?.id || null);
  }

  panel.innerHTML = toBridge(html`
    <div class="sketch-layout">
      <div class="sketch-list-col">
        <div class="notes-view-header">
          <h2>Sketches</h2>
          <button id="sketch-new">+ New</button>
        </div>
        <div class="sketch-list"></div>
      </div>
      <div class="sketch-main-col" id="sketch-main"></div>
    </div>
  `);

  const listEl = panel.querySelector('.sketch-list');
  if (sketches.length === 0) {
    listEl.innerHTML = toBridge(html`<p class="empty-note">No sketches yet: character faces, maps, family trees, or just a scratch board.</p>`);
  }
  sketches.forEach((sketch) => {
    const item = document.createElement('button');
    item.className = 'notes-entity-item' + (sketch.id === activeSketchId ? ' active' : '');
    item.textContent = sketch.title;
    item.addEventListener('click', () => {
      setActiveSketchId(sketch.id);
      renderSketchView(Store.getActiveProject());
    });
    listEl.appendChild(item);
  });

  panel.querySelector('#sketch-new').addEventListener('click', () => {
    const sketch = Store.createSketch({ title: `Sketch ${sketches.length + 1}` });
    setActiveSketchId(sketch.id);
    renderSketchView(Store.getActiveProject());
  });

  renderSketchMain(project);
}

export function renderSketchMain(project) {
  const mainEl = q('sketch-main');
  const sketch = activeSketchId ? Store.getSketch(activeSketchId) : null;

  if (!sketchColor) sketchColor = defaultSketchColor();
  const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--sketch-grid').trim();

  if (sketchDetachDrawing) {
    sketchDetachDrawing();
    sketchDetachDrawing = null;
  }

  if (!sketch) {
    mainEl.innerHTML = toBridge(html`<div class="empty-state">Nothing open yet. Select a sketch, or start a fresh one.</div>`);
    return;
  }

  mainEl.innerHTML = toBridge(html`
    <div class="sketch-toolbar">
      <input type="text" id="sketch-title" class="entity-name-input" value="${sketch.title}" />
      <select id="sketch-mode">
        <option value="freeform" ${sketch.mode === 'freeform' ? 'selected' : ''}>Freeform</option>
        <option value="map" ${sketch.mode === 'map' ? 'selected' : ''}>Map</option>
      </select>
      ${sketch.mode === 'map' ? html`
      <select id="sketch-grid">
        <option value="square" ${sketch.gridStyle === 'square' ? 'selected' : ''}>Square grid</option>
        <option value="hex" ${sketch.gridStyle === 'hex' ? 'selected' : ''}>Hex grid</option>
      </select>` : ''}
      <div class="sketch-colors">
        ${SKETCH_COLORS.map((c) => html`<button class="sketch-color-swatch${c === sketchColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></button>`)}
        <input type="color" id="sketch-color-wheel" class="sketch-color-wheel" value="${sketchColor}" title="Pick any color" />
      </div>
      <select id="sketch-width">
        <option value="2" ${sketchWidth === 2 ? 'selected' : ''}>Thin</option>
        <option value="3" ${sketchWidth === 3 ? 'selected' : ''}>Medium</option>
        <option value="6" ${sketchWidth === 6 ? 'selected' : ''}>Thick</option>
      </select>
      <button id="sketch-undo" title="Undo last stroke">↺ Undo</button>
      <button id="sketch-clear" title="Clear canvas">✕ Clear</button>
      <button id="sketch-save-image" title="Save this sketch as an image you can insert into chapters, entities, or use as a cover">🖼 Save as Image</button>
      <button id="sketch-delete" title="Delete this sketch">Delete</button>
    </div>
    <div class="sketch-links-row">
      <span class="sketch-links-label">Linked to:</span>
      <div class="sketch-links-chips" id="sketch-links-chips"></div>
      <select id="sketch-link-add">
        <option value="">+ Link entity…</option>
        ${Store.getEntityList()
          .filter((e) => !(sketch.linkedEntityIds || []).includes(e.id))
          .map((e) => html`<option value="${e.id}">${e.name}</option>`)}
      </select>
    </div>
    <div class="sketch-canvas-wrap">
      <canvas id="sketch-canvas"></canvas>
    </div>
  `);

  const canvasEl = q('sketch-canvas');
  Sketchpad.fitCanvasToElement(canvasEl);
  Sketchpad.renderSketch(canvasEl, sketch, { gridColor });

  sketchDetachDrawing = Sketchpad.attachDrawing(canvasEl, {
    getColor: () => sketchColor,
    getWidth: () => Number(sketchWidth),
    onStrokeMove: (points) => {
      Sketchpad.renderSketch(canvasEl, sketch, {
        gridColor,
        liveStroke: { color: sketchColor, width: Number(sketchWidth), points },
      });
    },
    onStrokeComplete: (stroke) => {
      Store.addStroke(sketch.id, stroke);
      Sketchpad.renderSketch(canvasEl, Store.getSketch(sketch.id), { gridColor });
    },
  });

  q('sketch-title').addEventListener('input', (e) => {
    Store.updateSketchMeta(sketch.id, { title: e.target.value });
  });
  q('sketch-title').addEventListener('blur', () => renderSketchView(Store.getActiveProject()));

  q('sketch-mode').addEventListener('change', (e) => {
    Store.updateSketchMeta(sketch.id, { mode: e.target.value });
    renderSketchMain(Store.getActiveProject());
  });

  q('sketch-grid')?.addEventListener('change', (e) => {
    Store.updateSketchMeta(sketch.id, { gridStyle: e.target.value });
    renderSketchMain(Store.getActiveProject());
  });

  document.querySelectorAll('.sketch-color-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      sketchColor = btn.dataset.color;
      renderSketchMain(Store.getActiveProject());
    });
  });

  q('sketch-color-wheel').addEventListener('input', (e) => {
    sketchColor = e.target.value;
// Historical context: see docs/CODEBASE_NOTES.md#jssketchview-js-195-198
    document.querySelectorAll('.sketch-color-swatch.active').forEach((b) => b.classList.remove('active'));
  });

  q('sketch-width').addEventListener('change', (e) => {
    sketchWidth = Number(e.target.value);
  });

  q('sketch-undo').addEventListener('click', () => {
    Store.undoLastStroke(sketch.id);
    renderSketchMain(Store.getActiveProject());
  });

  q('sketch-clear').addEventListener('click', async () => {
    if (!(await ModalShell.confirmDialog({ title: 'Clear this sketch?', message: 'Clear this sketch? This can\'t be undone.', confirmLabel: 'Clear', danger: true }))) return;
    Store.clearSketch(sketch.id);
    renderSketchMain(Store.getActiveProject());
  });

  q('sketch-delete').addEventListener('click', async () => {
    if (!(await ModalShell.confirmDialog({ title: 'Delete this sketch?', message: `Delete "${sketch.title}"? This can't be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    Store.deleteSketch(sketch.id);
    setActiveSketchId(null);
    renderSketchView(Store.getActiveProject());
  });

  q('sketch-save-image').addEventListener('click', () => saveSketchAsImage(sketch, canvasEl));

  renderSketchLinkChips(sketch);
  q('sketch-link-add').addEventListener('change', (e) => {
    if (!e.target.value) return;
    Store.linkSketchToEntity(sketch.id, e.target.value);
    renderSketchMain(Store.getActiveProject());
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jssketchview-js-234-237
export function renderSketchLinkChips(sketch) {
  const wrap = q('sketch-links-chips');
  if (!wrap) return;
  const linked = (sketch.linkedEntityIds || []).map((id) => Store.getEntity(id)).filter(Boolean);
  wrap.innerHTML = toBridge(
    linked.length
      ? html`${linked.map(
          (e) => html`
      <span class="sketch-link-chip" data-entity="${e.id}">
        ${e.name}
        <button class="sketch-link-remove" title="Unlink">✕</button>
      </span>`
        )}`
      : html`<span class="empty-note">Not linked to anything yet.</span>`
  );

  wrap.querySelectorAll('.sketch-link-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      if (e.target.closest('.sketch-link-remove')) return;
      setActiveEntityId(chip.dataset.entity);
      setActiveView('notes');
      requestRender();
    });
  });
  wrap.querySelectorAll('.sketch-link-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      Store.unlinkSketchFromEntity(sketch.id, btn.closest('.sketch-link-chip').dataset.entity);
      renderSketchMain(Store.getActiveProject());
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jssketchview-js-270-277
export function saveSketchAsImage(sketch, canvasEl) {
  canvasEl.toBlob((blob) => {
    if (!blob) {
      showStorageWarning(`Couldn't export "${sketch.title}" as an image. Try again.`);
      return;
    }
    const id = 'img_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    ImageStore.putBlob(id, blob)
      .then(() => {
        Store.createImageMeta({ id, caption: sketch.title, width: 100 });
        showToast(`Saved "${sketch.title}" to your Image Library.`, {
          icon: '🖼',
          actionLabel: 'Insert…',
          onAction: () => openImageLibrary({ mode: 'insert' }),
        });
      })
      .catch((err) => {
        showStorageWarning(`Couldn't save "${sketch.title}": ${err.message || 'unknown error'}.`);
      });
  }, 'image/png');
}

// 0.2.6 de-hub pass — capitalize moved to dom-utils.js, imported above.

// Historical context: see docs/CODEBASE_NOTES.md#jssketchview-js-302-305

// Historical context: see docs/CODEBASE_NOTES.md#jssketchview-js-307-315


// Historical context: see docs/CODEBASE_NOTES.md#jssketchview-js-283-292
export function resetSketchViewState() {
  setActiveSketchId(null);
  detachSketchDrawing();
}

import { registerViewReset } from './viewLifecycle.js';
registerViewReset('sketch', resetSketchViewState);
