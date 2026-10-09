// Historical context: see docs/CODEBASE_NOTES.md#jsmapview-js-1-23

import * as Store from './store.js';
import * as ImageStore from './imagestore.js';
import { html, raw, toBridge, q } from './dom-utils.js';
import { requestRender } from './renderBus.js';
import { openImageLibrary } from './imageLibrary.js';
import { confirmDialog } from './modal.js';
import { activeMapId, setActiveMapId, setActiveView, setActiveEntityId } from './context.js';
import { EmptyState } from './emptyState.js';

// Tier 4 pass (§11) — Map view state, same "not worth persisting, just
// which one's open right now" shape as activeSketchId back in app.js.
// 0.2.6 Pass 1 — activeMapId moved to context.js (import below).
let selectedMarkerId = null;
// Historical context: see docs/CODEBASE_NOTES.md#jsmapview-js-38-42
let mapImageUrl = null;

// 0.2.6 Pass 1 — setActiveMapId moved to context.js (import below).

export function revokeMapImageUrl() {
  if (mapImageUrl) URL.revokeObjectURL(mapImageUrl);
  mapImageUrl = null;
}

export function renderMapView(project) {
  const panel = document.querySelector('.view-panel[data-view="map"]');
  const maps = Store.getMapList();

  if (!activeMapId || !maps.find((m) => m.id === activeMapId)) {
    setActiveMapId(maps[0]?.id || null);
    selectedMarkerId = null;
  }

  panel.innerHTML = toBridge(html`
    <div class="sketch-layout">
      <div class="sketch-list-col">
        <div class="notes-view-header">
          <h2>Maps</h2>
          <button id="map-new">+ New</button>
        </div>
        <div class="map-list"></div>
      </div>
      <div class="sketch-main-col" id="map-main"></div>
    </div>
  `);

  const listEl = panel.querySelector('.map-list');
  if (maps.length === 0) {
    listEl.innerHTML = toBridge(html`${EmptyState({ text: 'Map your world. Pin characters, locations, and journeys onto an uploaded image — a hand-drawn sketch, a commissioned map, or a scan.' })}`);
  }
  maps.forEach((map) => {
    const item = document.createElement('button');
    item.className = 'notes-entity-item' + (map.id === activeMapId ? ' active' : '');
    // Navigation/Context pass — data-map-id lets the Map Marker drawer's
    // "Open in Map view" button select the matching map row by id, same
    // shape as data-reference-id on References rows.
    item.dataset.mapId = map.id;
    item.textContent = map.name;
    item.addEventListener('click', () => {
      setActiveMapId(map.id);
      selectedMarkerId = null;
      renderMapView(Store.getActiveProject());
    });
    listEl.appendChild(item);
  });

  q('map-new').addEventListener('click', () => {
    const map = Store.createMap({ name: `Map ${maps.length + 1}` });
    setActiveMapId(map.id);
    selectedMarkerId = null;
    renderMapView(Store.getActiveProject());
  });

  renderMapMain(project);
}

function renderMapMain(project) {
  const mainEl = q('map-main');
  const map = activeMapId ? Store.getMap(activeMapId) : null;
  revokeMapImageUrl();

  if (!map) {
    mainEl.innerHTML = toBridge(html`<div class="empty-state">Nothing open yet. Select a map, or start a fresh one.</div>`);
    return;
  }

  mainEl.innerHTML = toBridge(html`
    <div class="sketch-toolbar">
      <input type="text" id="map-name" class="entity-name-input" value="${map.name}" />
      <select id="map-type">
        ${Store.getMapTypes().map((t) => html`<option value="${t}" ${t === map.mapType ? 'selected' : ''}>${t}</option>`)}
      </select>
      <button id="map-set-image">🖼 ${map.imageId ? 'Change Background' : 'Set Background'}</button>
      <button id="map-delete">Delete</button>
    </div>
    <div class="map-canvas-wrap" id="map-canvas-wrap"></div>
  `);

  q('map-name').addEventListener('input', (e) => {
    Store.updateMap(map.id, { name: e.target.value });
  });
  q('map-name').addEventListener('blur', () => renderMapView(Store.getActiveProject()));

  q('map-type').addEventListener('change', (e) => {
    Store.updateMap(map.id, { mapType: e.target.value });
  });

  q('map-set-image').addEventListener('click', () => {
    openImageLibrary({
      mode: 'map',
      title: 'Set Map Background',
      currentImageId: map.imageId,
      onSelect: (imageId) => {
        Store.updateMap(map.id, { imageId });
        renderMapMain(Store.getActiveProject());
      },
    });
  });

  q('map-delete').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Delete this map?', message: `Delete "${map.name}"? This can't be undone. (Its background image stays in your Image Library.)`, confirmLabel: 'Delete', danger: true }))) return;
    Store.deleteMap(map.id);
    setActiveMapId(null);
    selectedMarkerId = null;
    renderMapView(Store.getActiveProject());
  });

  renderMapCanvas(map);
}

function renderMapCanvas(map) {
  const wrap = q('map-canvas-wrap');
  if (!wrap) return;

  if (!map.imageId) {
    wrap.innerHTML = toBridge(html`
      <div class="map-no-image">No background image yet.<br/>Click "Set Background" above to upload a map, or pick one already in your Image Library.</div>
    `);
    return;
  }

  wrap.innerHTML = toBridge(html`<p class="empty-note">Loading map…</p>`);

  ImageStore.getObjectUrl(map.imageId)
    .then((url) => {
// Historical context: see docs/CODEBASE_NOTES.md#jsmapview-js-173-183
      if (url) mapImageUrl = url;
      if (q('map-canvas-wrap') !== wrap) return; // view moved on before this resolved
      if (!url) {
        wrap.innerHTML = toBridge(html`<div class="map-no-image">This map's background image is missing (it may have been deleted from the Image Library). Set a new one above.</div>`);
        return;
      }
      wrap.innerHTML = toBridge(html`
        <div class="map-image-stage" id="map-image-stage">
          <img src="${url}" alt="${map.name}" id="map-image" draggable="false" />
        </div>
      `);
      const stage = q('map-image-stage');

// Historical context: see docs/CODEBASE_NOTES.md#jsmapview-js-197-200
      const img = q('map-image');
      const drawPins = () => renderMapPins(map, stage);
      if (img.complete) drawPins();
      else img.addEventListener('load', drawPins, { once: true });

      // Clicking empty space on the map drops a new marker there;
      // clicking an existing pin is handled by its own listener in
      // renderMapPins and stops propagation so this doesn't also fire.
      stage.addEventListener('click', (e) => {
        const rect = img.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        const marker = Store.addMarker(map.id, { x, y, label: 'New marker' });
        selectedMarkerId = marker.id;
        renderMapMain(Store.getActiveProject());
      });
    })
    .catch(() => {
      if (q('map-canvas-wrap') === wrap) {
        wrap.innerHTML = toBridge(html`<div class="map-no-image">Couldn't load this map's background image.</div>`);
      }
    });
}

function renderMapPins(map, stage) {
  // Clear any previously drawn pins/editor without touching the <img>
  // itself (a fresh renderMapCanvas() call already handles that case —
  // this fn only re-runs pin placement after the image's own load event).
  stage.querySelectorAll('.map-pin').forEach((el) => el.remove());
  const existingEditor = q('map-marker-editor');
  if (existingEditor) existingEditor.remove();

  map.markers.forEach((marker) => {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'map-pin' + (marker.id === selectedMarkerId ? ' is-selected' : '');
    pin.style.left = `${marker.x * 100}%`;
    pin.style.top = `${marker.y * 100}%`;
    pin.title = marker.label;
// Historical context: see docs/CODEBASE_NOTES.md#jsmapview-js-241-244
    pin.innerHTML = toBridge(html`📍<span class="map-pin-label">${marker.label}</span>`);
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedMarkerId = marker.id;
      renderMapMain(Store.getActiveProject());
    });
    stage.appendChild(pin);
  });

  const selected = selectedMarkerId ? map.markers.find((m) => m.id === selectedMarkerId) : null;
  if (selected) renderMarkerEditor(map, selected);
}

function renderMarkerEditor(map, marker) {
  const mainEl = q('map-main');
  if (!mainEl) return;
  const entities = Store.getEntityList();
  const otherMaps = Store.getMapList().filter((m) => m.id !== map.id);

  const editor = document.createElement('div');
  editor.className = 'map-marker-editor';
  editor.id = 'map-marker-editor';
  editor.innerHTML = toBridge(html`
    <div class="map-marker-editor-row">
      <input type="text" id="marker-label" class="entity-name-input" value="${marker.label}" placeholder="Marker name" />
      <button id="marker-delete" class="map-marker-delete-btn" title="Remove this marker">✕ Remove pin</button>
    </div>
    <textarea id="marker-note" class="map-marker-note" placeholder="What's here?" rows="2">${marker.note}</textarea>
    <div class="map-marker-editor-row">
      <select id="marker-entity-link">
        <option value="">Not linked to an entity</option>
        ${entities.map((e) => html`<option value="${e.id}" ${e.id === marker.entityId ? raw('selected') : ''}>${e.name} (${e.type})</option>`)}
      </select>
      ${
        otherMaps.length
          ? html`<select id="marker-map-link">
              <option value="">Doesn't open another map</option>
              ${otherMaps.map((m) => html`<option value="${m.id}" ${m.id === marker.linkedMapId ? raw('selected') : ''}>Opens: ${m.name}</option>`)}
            </select>`
          : ''
      }
    </div>
    ${marker.entityId ? html`<button id="marker-jump-entity" class="timeline-open-chapter-btn">↦ Open entity</button>` : ''}
    ${marker.linkedMapId ? html`<button id="marker-jump-map" class="timeline-open-chapter-btn">↦ Open linked map</button>` : ''}
  `);
  mainEl.appendChild(editor);

  q('marker-label').addEventListener('input', (e) => {
    Store.updateMarker(map.id, marker.id, { label: e.target.value });
    // Live-update the pin's own label/title without a full re-render, so
    // typing doesn't fight the input for focus the way renderMapMain()
    // rebuilding everything on every keystroke would.
    const pin = document.querySelector(`.map-pin.is-selected`);
    if (pin) {
      pin.title = e.target.value;
      pin.querySelector('.map-pin-label').textContent = e.target.value;
    }
  });
  q('marker-label').addEventListener('blur', () => renderMapMain(Store.getActiveProject()));

  q('marker-note').addEventListener('change', (e) => {
    Store.updateMarker(map.id, marker.id, { note: e.target.value });
  });

  q('marker-entity-link').addEventListener('change', (e) => {
    Store.updateMarker(map.id, marker.id, { entityId: e.target.value || null });
    renderMapMain(Store.getActiveProject());
  });

  q('marker-map-link')?.addEventListener('change', (e) => {
    Store.updateMarker(map.id, marker.id, { linkedMapId: e.target.value || null });
    renderMapMain(Store.getActiveProject());
  });

  q('marker-delete').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Remove this marker?', message: `Remove "${marker.label}"? This can't be undone.`, confirmLabel: 'Remove', danger: true }))) return;
    Store.deleteMarker(map.id, marker.id);
    selectedMarkerId = null;
    renderMapMain(Store.getActiveProject());
  });

  q('marker-jump-entity')?.addEventListener('click', () => {
    setActiveEntityId(marker.entityId);
    setActiveView('notes');
    requestRender();
  });

  q('marker-jump-map')?.addEventListener('click', () => {
    setActiveMapId(marker.linkedMapId);
    selectedMarkerId = null;
    renderMapView(Store.getActiveProject());
  });
}

// Project-switch reset — clears per-view transient state.
import { registerViewReset } from "./viewLifecycle.js";
export function resetMapViewState() {
  setActiveMapId(null);
  selectedMarkerId = null;
}
registerViewReset("map", resetMapViewState);

