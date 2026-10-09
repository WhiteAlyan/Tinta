// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-1-36

import * as Store from './store.js';
import * as ImageStore from './imagestore.js';
import * as CanvasCore from './canvas.js';
import * as ModalShell from './modal.js';
import { html, raw, toBridge, q, escapeHtml, escapeAttr } from './dom-utils.js';
import { requestRender } from './renderBus.js';
import { revokeEntityPortraitUrls, trackEntityPortraitUrl } from './portraits.js';
import { activeView, setActiveView, setActiveEntityId } from './context.js';
import { closeModal } from './modal.js';

// ── constants (moved verbatim from app.js) ──────────────────────────────
const CANVAS_VB_W = 1000;
const CANVAS_VB_H = 640;
const CANVAS_NODE_R = 26;

// ── view state (moved verbatim; all transient, none persisted) ──────────
let canvasLinkMode = false;
let canvasLinkFromId = null;
let canvasNodeHandles = [];
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-57-61
let canvasHiddenTypes = new Set();
let canvasStatusFilter = '';
// v0.2.9 — Canvas two-track entity model. canvasHiddenEntityIds is a
// transient set of entity IDs the writer has hidden from THIS canvas
// view (via the ✕ button on a node). It does NOT delete the entity
// from the project — the entity still exists in Notes and everywhere
// else. The ✕ on Canvas = "hide from this view" (reversible, Notes
// untouched). Real deletion only happens from Notes.
let canvasHiddenEntityIds = new Set();
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-64-73
let canvasLoadedPresetId = '';

// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-76-84
export function entityTypeLabelPlural(key) {
  const type = Store.getEntityType(key);
  if (!type) return 'Others';
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-88-92
  const builtinPlurals = { character: 'Characters', location: 'Locations', item: 'Items', concept: 'Concepts' };
  return builtinPlurals[key] || `${type.label}s`;
}
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-96-99
export function entityDotClass(typeKey) {
  const type = Store.getEntityType(typeKey);
  return type && !type.builtin ? 'canvas-dot-custom' : `canvas-dot-${typeKey}`;
}
export function entityNodeClass(typeKey) {
  const type = Store.getEntityType(typeKey);
  return type && !type.builtin ? 'canvas-node-custom' : `canvas-node-${typeKey}`;
}
export function entityColorStyleAttr(typeKey) {
  const type = Store.getEntityType(typeKey);
  return type && !type.builtin && type.color ? ` style="--type-color:${escapeAttr(type.color)}"` : '';
}

export function renderCanvasView(project) {
  const panel = document.querySelector('.view-panel[data-view="canvas"]');
  const entities = Store.getEntityList();

  // Old SVG nodes are about to be wiped via innerHTML — drop any drag
  // listeners bound to them first.
  canvasNodeHandles.forEach((h) => h.destroy());
  canvasNodeHandles = [];
  revokeEntityPortraitUrls();

  const relStatuses = [...new Set(Store.getRelationshipList().map((r) => (r.status || '').trim()).filter(Boolean))];

  const presets = Store.getGraphPresetList();

  panel.innerHTML = toBridge(html`
    <div class="canvas-toolbar">
      <h2>Relationship Canvas</h2>
      <div class="canvas-toolbar-right">
        ${relStatuses.length ? html`
        <select id="canvas-status-filter" title="Show only relationships with this status">
          <option value="">All statuses</option>
          ${relStatuses.map((s) => html`<option value="${s}" ${canvasStatusFilter === s ? raw('selected') : ''}>${s}</option>`)}
        </select>` : ''}
        <select id="canvas-preset-select" title="Load a saved graph view">
          <option value="">${presets.length ? 'Load preset…' : 'No presets saved'}</option>
          ${presets.map((p) => html`<option value="${p.id}"${canvasLoadedPresetId === p.id ? raw(' selected') : ''}>${p.name}</option>`)}
        </select>
        <button id="canvas-preset-save-btn" class="toolbar-btn" title="Save the current filters and layout as a preset">💾 Save view</button>
        ${presets.length ? html`<button id="canvas-preset-delete-btn" class="toolbar-btn" title="Delete the selected preset"${canvasLoadedPresetId ? '' : raw(' disabled')}>🗑</button>` : ''}
        <span class="canvas-hint">${canvasHintText()}</span>
        <button id="canvas-add-entity-btn" class="toolbar-btn" title="Add a new entity to the canvas">+ Entity</button>
        ${canvasHiddenEntityIds.size > 0 ? html`<button id="canvas-show-all-btn" class="toolbar-btn" title="Show entities hidden from this canvas">👁 Show all (${canvasHiddenEntityIds.size})</button>` : ''}
        <button id="canvas-link-btn" class="add-scene-btn${canvasLinkMode ? ' active' : ''}">${canvasLinkMode ? '✕ Cancel link' : '+ Link'}</button>
      </div>
    </div>
    <div class="canvas-legend">
      ${Store.getEntityTypes().map((t) => html`<button type="button" class="canvas-legend-item${canvasHiddenTypes.has(t.key) ? ' hidden-type' : ''}" data-type="${t.key}" title="Click to show/hide ${entityTypeLabelPlural(t.key)}"><span class="canvas-dot ${entityDotClass(t.key)}"${raw(entityColorStyleAttr(t.key))}></span>${entityTypeLabelPlural(t.key)}</button>`)}
    </div>
    <div class="canvas-stage"></div>
  `);

  q('canvas-link-btn').addEventListener('click', () => {
    canvasLinkMode = !canvasLinkMode;
    canvasLinkFromId = null;
    renderCanvasView(Store.getActiveProject());
  });

  q('canvas-status-filter')?.addEventListener('change', (e) => {
    canvasStatusFilter = e.target.value;
    renderCanvasView(Store.getActiveProject());
  });

// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-164-169
  const presetSelect = q('canvas-preset-select');
  const presetDeleteBtn = q('canvas-preset-delete-btn');
  presetSelect?.addEventListener('change', () => {
    if (!presetSelect.value) {
      canvasLoadedPresetId = '';
      if (presetDeleteBtn) presetDeleteBtn.disabled = true;
      return;
    }
    const applied = Store.applyGraphPreset(presetSelect.value);
    if (!applied) return;
    canvasHiddenTypes = new Set(applied.hiddenTypes);
    canvasStatusFilter = applied.statusFilter || '';
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-182-187
    canvasLoadedPresetId = presetSelect.value;
    renderCanvasView(Store.getActiveProject());
  });
  presetDeleteBtn?.addEventListener('click', async () => {
    if (!canvasLoadedPresetId) return;
    if (!(await ModalShell.confirmDialog({ title: 'Delete this preset?', message: 'Delete this saved graph view? This only removes the preset, not any entities or relationships.', confirmLabel: 'Delete', danger: true }))) return;
    Store.deleteGraphPreset(canvasLoadedPresetId);
    canvasLoadedPresetId = ''; // gone — dropdown returns to "Load preset…", delete button re-disables
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-123-126
    requestAnimationFrame(() => renderCanvasView(Store.getActiveProject()));
  });
  q('canvas-preset-save-btn').addEventListener('click', async () => {
    // Dialogs pass — native prompt() → themed promptDialog, same truthy/
    // trim guard below (empty or whitespace-only still aborts silently).
    const name = await ModalShell.promptDialog({
      title: 'Name this view',
      message: 'e.g. "Family tree", "Faction map"',
      placeholder: 'View name',
      okLabel: 'Save view',
    });
    if (!name || !name.trim()) return;
    const existing = Store.getGraphPresetList().find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      Store.updateGraphPreset(existing.id, { hiddenTypes: canvasHiddenTypes, statusFilter: canvasStatusFilter });
      // Stay loaded on the just-updated preset so the writer sees the
      // delete button enabled for it immediately, rather than having to
      // re-pick it from the dropdown.
      canvasLoadedPresetId = existing.id;
    } else {
      const created = Store.createGraphPreset({ name, hiddenTypes: canvasHiddenTypes, statusFilter: canvasStatusFilter });
      if (created) canvasLoadedPresetId = created.id;
    }
    // Bug-report fix — same rAF wrap as the other post-await renders.
    requestAnimationFrame(() => renderCanvasView(Store.getActiveProject()));
  });

  // v0.2.9 — "Show all" button: clears canvasHiddenEntityIds so every
  // entity is visible on the canvas again. Only rendered when there are
  // hidden entities (see the template above).
  q('canvas-show-all-btn')?.addEventListener('click', () => {
    canvasHiddenEntityIds.clear();
    renderCanvasView(Store.getActiveProject());
  });

// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-222-229
  q('canvas-add-entity-btn')?.addEventListener('click', async () => {
    const name = await ModalShell.promptDialog({
      title: 'Add entity to canvas',
      message: 'Name the entity. It will be created in the active project and placed on the canvas.',
      placeholder: 'e.g. Mara, The Citadel, The Old Crown',
      okLabel: 'Add',
    });
    if (!name || !name.trim()) return;
    const types = Store.getEntityTypes();
    const firstType = types[0]?.key || 'character';
    Store.createEntity({ name: name.trim(), type: firstType });
    // Bug-report fix — same rAF wrap as the other post-await renders.
    requestAnimationFrame(() => renderCanvasView(Store.getActiveProject()));
  });

  panel.querySelectorAll('.canvas-legend-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      if (canvasHiddenTypes.has(type)) canvasHiddenTypes.delete(type);
      else canvasHiddenTypes.add(type);
      renderCanvasView(Store.getActiveProject());
    });
  });

  const stage = panel.querySelector('.canvas-stage');

  if (!entities.length) {
    stage.innerHTML = toBridge(html`<div class="empty-state">Draw how they relate. Click "+ Entity" above to add a character, location, or item — then click two nodes to link them.</div>`);
    return;
  }
  if (canvasHiddenTypes.size && entities.every((e) => canvasHiddenTypes.has(e.type))) {
    stage.innerHTML = toBridge(html`<div class="empty-state">Every type is hidden. Click a legend chip to bring entities back.</div>`);
    return;
  }

  // Assign default positions for any entity that's never been placed, then
  // re-read so canvasX/canvasY are current.
  const newPositions = CanvasCore.computeDefaultLayout(entities, CANVAS_VB_W, CANVAS_VB_H);
  newPositions.forEach((p) => Store.setEntityPosition(p.id, p.x, p.y));
  // Positions are computed/stored for every entity regardless of filter
  // state (so nothing jumps around when a filter is cleared) — the type
  // filter only affects what gets drawn, via `positioned` below.
  // v0.2.9 — also filter out individually-hidden entities (the ✕ button
  // on a node adds to canvasHiddenEntityIds). This is separate from the
  // type filter — a type filter hides ALL entities of a type; the
  // individual hide lets the writer remove just one node from the canvas
  // without affecting anything else.
  const positioned = Store.getEntityList().filter((e) => !canvasHiddenTypes.has(e.type) && !canvasHiddenEntityIds.has(e.id));

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${CANVAS_VB_W} ${CANVAS_VB_H}`);
  svg.setAttribute('class', 'canvas-svg');
  stage.appendChild(svg);

  const defs = document.createElementNS(svgNS, 'defs');
  const edgeLayer = document.createElementNS(svgNS, 'g');
  const nodeLayer = document.createElementNS(svgNS, 'g');
  svg.append(defs, edgeLayer, nodeLayer);

  const posById = {};
  positioned.forEach((e) => { posById[e.id] = { x: e.canvasX, y: e.canvasY }; });

  function editRelationship(rel) {
    openRelationshipEditModal(rel, drawEdges);
  }

  function drawEdges() {
    edgeLayer.innerHTML = '';
    const rels = Store.getRelationshipList();
    const pairCounts = {};

    rels.forEach((rel) => {
      const a = posById[rel.fromId];
      const b = posById[rel.toId];
      if (!a || !b) return; // hidden by the type filter, or (shouldn't happen) a stale reference
      if (canvasStatusFilter && (rel.status || '') !== canvasStatusFilter) return;

      const pairKey = [rel.fromId, rel.toId].sort().join('|');
      const idx = pairCounts[pairKey] || 0;
      pairCounts[pairKey] = idx + 1;

      // Offset repeat edges between the same pair perpendicular to the line
      // so they don't just draw on top of each other.
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const bend = idx * 20;
      const cx = mx + nx * bend;
      const cy = my + ny * bend;

      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`);
      path.setAttribute('class', 'canvas-edge');
      path.addEventListener('click', () => editRelationship(rel));
      edgeLayer.appendChild(path);

      if (Store.getRelationshipLabel(rel)) {
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', cx);
        text.setAttribute('y', cy);
        text.setAttribute('class', 'canvas-edge-label');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = Store.getRelationshipLabel(rel);
        text.addEventListener('click', () => editRelationship(rel));
        edgeLayer.appendChild(text);
      }
    });
  }

  function handleNodeClick(entityId) {
    if (canvasLinkMode) {
      handleLinkClick(entityId);
      return;
    }
    // Seam 3 — was a direct `activeEntityId = entityId; activeView = 'notes';`
    // back when this was the same file; now through the same setters the
    // Map view's marker → entity jump uses. Identical effect.
    setActiveEntityId(entityId);
    setActiveView('notes');
    requestRender();
  }

// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-351-354
  async function handleLinkClick(entityId) {
    if (!canvasLinkFromId) {
      canvasLinkFromId = entityId;
      renderCanvasView(Store.getActiveProject());
      return;
    }
    if (canvasLinkFromId === entityId) {
      canvasLinkFromId = null; // clicked the same node again — deselect
      renderCanvasView(Store.getActiveProject());
      return;
    }
    const fromName = Store.getEntity(canvasLinkFromId)?.name || '?';
    const toName = Store.getEntity(entityId)?.name || '?';
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-368-371
    const label = await ModalShell.promptDialog({
      title: 'Relationship label',
      message: `${fromName} → ${toName}`,
      placeholder: 'e.g. mentor of, allied with',
      okLabel: 'Link',
    });
    if (label !== null) {
      Store.createRelationship({ fromId: canvasLinkFromId, toId: entityId, label });
    }
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-381-387
    canvasLinkFromId = null;
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-389-397
    requestAnimationFrame(() => renderCanvasView(Store.getActiveProject()));
  }

  function drawNodes() {
    nodeLayer.innerHTML = '';
    defs.innerHTML = ''; // clipPaths are per-entity and rebuilt alongside the nodes each draw
    positioned.forEach((entity) => {
      const pos = posById[entity.id];
      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('class', 'canvas-node');
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      g.dataset.x = pos.x;
      g.dataset.y = pos.y;

      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('r', CANVAS_NODE_R);
      circle.setAttribute('class', `canvas-node-circle ${entityNodeClass(entity.type)}` + (canvasLinkFromId === entity.id ? ' canvas-node-selected' : ''));
      const nodeType = Store.getEntityType(entity.type);
      if (nodeType && !nodeType.builtin && nodeType.color) circle.style.setProperty('--type-color', nodeType.color);
      g.appendChild(circle);

// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-419-422
      const portraitId = Store.getEntityPortraitId(entity);
      if (portraitId) {
        const clipId = `canvas-clip-${entity.id}`;
        const clipPath = document.createElementNS(svgNS, 'clipPath');
        clipPath.setAttribute('id', clipId);
        const clipCircle = document.createElementNS(svgNS, 'circle');
        clipCircle.setAttribute('r', CANVAS_NODE_R);
        clipPath.appendChild(clipCircle);
        defs.appendChild(clipPath);

        const image = document.createElementNS(svgNS, 'image');
        image.setAttribute('x', -CANVAS_NODE_R);
        image.setAttribute('y', -CANVAS_NODE_R);
        image.setAttribute('width', CANVAS_NODE_R * 2);
        image.setAttribute('height', CANVAS_NODE_R * 2);
        image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        image.setAttribute('clip-path', `url(#${clipId})`);
        g.appendChild(image);
        resolveCanvasPortraitImage(image, portraitId);
      }

      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('class', 'canvas-node-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('y', CANVAS_NODE_R + 16);
      label.textContent = entity.name;
      g.appendChild(label);

// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-451-457
      const delBtn = document.createElementNS(svgNS, 'g');
      delBtn.setAttribute('class', 'canvas-node-delete');
      delBtn.setAttribute('transform', `translate(${CANVAS_NODE_R - 2}, ${-CANVAS_NODE_R + 2})`);
      const delCircle = document.createElementNS(svgNS, 'circle');
      delCircle.setAttribute('r', 8);
      delCircle.setAttribute('class', 'canvas-node-delete-bg');
      const delX = document.createElementNS(svgNS, 'text');
      delX.setAttribute('class', 'canvas-node-delete-x');
      delX.setAttribute('text-anchor', 'middle');
      delX.setAttribute('dy', '0.32em');
      delX.textContent = '✕';
      delBtn.appendChild(delCircle);
      delBtn.appendChild(delX);
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        // v0.2.9 — Canvas ✕ = "Hide from this canvas" (NOT delete).
        // The entity stays in Notes and everywhere else. This is the
        // two-track model: Canvas manages visibility, Notes manages
        // lifecycle. The wording is unambiguous to prevent the
        // "I thought I was just hiding it but it deleted everything"
        // confusion the writer reported.
        const ok = await ModalShell.confirmDialog({
          title: 'Hide from canvas?',
          message: `Hide "${entity.name}" from this canvas view? The entity stays in your Notes and everywhere else — this only removes the node from this graph. Click "Show all" in the toolbar to bring it back.`,
          confirmLabel: 'Hide from canvas',
          danger: false,
        });
        if (!ok) return;
        canvasHiddenEntityIds.add(entity.id);
        requestAnimationFrame(() => renderCanvasView(Store.getActiveProject()));
      });
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-484-488
      delBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
      g.appendChild(delBtn);

      nodeLayer.appendChild(g);

      const handle = CanvasCore.attachNodeDrag(g, svg, {
        onMove: (x, y) => {
          g.setAttribute('transform', `translate(${x}, ${y})`);
          g.dataset.x = x;
          g.dataset.y = y;
          posById[entity.id] = { x, y };
          drawEdges();
        },
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-504-508
        onDragEnd: (x, y) => {
          Store.setEntityPosition(entity.id, x, y);
          Store.flushPendingPositionSave?.();
        },
        onClick: () => handleNodeClick(entity.id),
      });
      canvasNodeHandles.push(handle);
    });
  }

  drawEdges();
  drawNodes();
}

function canvasHintText() {
  if (!canvasLinkMode) return 'Drag to arrange · click a node to open it in Notes';
  return canvasLinkFromId ? 'Click a second entity to link…' : 'Click an entity to start a link…';
}

// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-528-533
async function resolveCanvasPortraitImage(imageEl, imageId) {
  try {
    const url = await ImageStore.getObjectUrl(imageId);
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-537-541
    if (url) trackEntityPortraitUrl(url);
    if (!imageEl.isConnected) return; // canvas re-rendered before this resolved
    if (url) {
      imageEl.setAttribute('href', url);
      imageEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
    }
  } catch {
    // Leave the type-colored circle showing through — same reasoning as
    // resolveEntityAvatar's catch block.
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-554-559
function openRelationshipEditModal(rel, onDone) {
  const from = Store.getEntity(rel.fromId);
  const to = Store.getEntity(rel.toId);
  const currentLabel = Store.getRelationshipLabel(rel);
  const history = Store.getRelationshipHistory(rel.id);
  const timelineEvents = Store.getTimelineEventList();

  const root = ModalShell.openModal({
    title: `${escapeHtml(from?.name || '?')} ↔ ${escapeHtml(to?.name || '?')}`,
    className: 'relationship-modal',
    body: `
        <label class="grammar-field-label">Label
          <input type="text" id="rel-label" value="${escapeAttr(currentLabel)}" placeholder="e.g. Rivals, Mentor, Siblings" />
        </label>
        <div class="relationship-field-row">
          <label class="grammar-field-label">Status
            <input type="text" id="rel-status" value="${escapeAttr(rel.status || '')}" placeholder="active, estranged, deceased…" />
          </label>
          <label class="grammar-field-label">Strength
            <input type="text" id="rel-strength" value="${escapeAttr(rel.strength || '')}" placeholder="close, strained, 1-5…" />
          </label>
        </div>
        <div class="relationship-field-row">
          <label class="grammar-field-label">Start
            <input type="text" id="rel-start" value="${escapeAttr(rel.startDate || '')}" placeholder="story-time label" />
          </label>
          <label class="grammar-field-label">End
            <input type="text" id="rel-end" value="${escapeAttr(rel.endDate || '')}" placeholder="story-time label" />
          </label>
        </div>
        <label class="grammar-field-label">Notes
          <textarea id="rel-notes" class="relationship-notes" rows="3" placeholder="History, context, how this changed over time…">${escapeHtml(rel.notes || '')}</textarea>
        </label>

        <div class="relationship-history-section">
          <h3 class="relationship-history-heading">History <span class="relationship-history-hint">(how this changed over time, in order)</span></h3>
          ${
            history.length === 0
              ? '<p class="empty-note">No past states logged yet. The fields above are just the current snapshot; add an entry below for what this relationship used to be.</p>'
              : `<ul class="relationship-history-list">
                  ${history
                    .map((h) => {
                      const linkedEvent = h.timelineEventId ? Store.getTimelineEvent(h.timelineEventId) : null;
                      return `<li class="relationship-history-item" data-entry="${h.id}">
                        <div class="relationship-history-item-head">
                          <strong>${escapeHtml(h.label)}</strong>
                          ${linkedEvent ? `<span class="relationship-history-when">${escapeHtml(linkedEvent.title)}${linkedEvent.storyDate ? ` · ${escapeHtml(linkedEvent.storyDate)}` : ''}</span>` : h.timelineEventId ? '<span class="relationship-history-when relationship-history-dangling">linked event deleted</span>' : ''}
                          <button class="relationship-history-delete-btn" title="Remove this entry">✕</button>
                        </div>
                        ${h.status || h.strength ? `<div class="relationship-history-meta">${[h.status, h.strength].filter(Boolean).join(' · ')}</div>` : ''}
                        ${h.note ? `<div class="relationship-history-note">${escapeHtml(h.note)}</div>` : ''}
                      </li>`;
                    })
                    .join('')}
                </ul>`
          }
          <div class="relationship-history-add">
            <input type="text" id="rel-history-label" placeholder="e.g. Rivals, Estranged, Reconciled…" />
            <select id="rel-history-event">
              <option value="">Not linked to a Timeline event</option>
              ${timelineEvents.map((e) => `<option value="${escapeAttr(e.id)}">${escapeHtml(e.title)}${e.storyDate ? ` (${escapeHtml(e.storyDate)})` : ''}</option>`).join('')}
            </select>
            <input type="text" id="rel-history-note" placeholder="Note for this entry (optional)" />
            <button id="rel-history-add-btn" class="add-scene-btn">+ Add to history</button>
          </div>
        </div>

        <div class="relationship-modal-actions">
          <button id="rel-delete" class="relationship-delete-btn">Delete relationship</button>
          <button id="rel-save">Save</button>
        </div>
    `,
  });

  q('rel-delete').addEventListener('click', async () => {
    if (!(await ModalShell.confirmDialog({ title: 'Delete this relationship?', message: `Delete the relationship between ${from?.name || '?'} and ${to?.name || '?'}?`, confirmLabel: 'Delete', danger: true }))) return;
    Store.deleteRelationship(rel.id);
    closeModal();
    onDone?.();
  });

  q('rel-history-add-btn').addEventListener('click', () => {
    const label = q('rel-history-label').value.trim();
    if (!label) return;
    Store.addRelationshipHistoryEntry(rel.id, {
      label,
      timelineEventId: q('rel-history-event').value || null,
      note: q('rel-history-note').value.trim(),
    });
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-649-652
    openRelationshipEditModal(Store.getRelationship(rel.id), onDone);
  });

  root.querySelectorAll('.relationship-history-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entryId = btn.closest('.relationship-history-item').dataset.entry;
      Store.deleteRelationshipHistoryEntry(rel.id, entryId);
      openRelationshipEditModal(Store.getRelationship(rel.id), onDone);
    });
  });

  q('rel-save').addEventListener('click', async () => {
    const trimmedLabel = q('rel-label').value.trim();
    if (trimmedLabel !== currentLabel) {
      if (trimmedLabel === '') {
        Store.deleteRelationship(rel.id);
        closeModal();
        onDone?.();
        return;
      }
      const usageCount = Store.getRelationshipTypeUsageCount(rel.typeId);
      if (usageCount <= 1) {
        Store.renameRelationshipType(rel.typeId, trimmedLabel);
      } else {
// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-677-681
        const propagate = await ModalShell.confirmDialog({
          title: 'Rename everywhere?',
          message: `"${currentLabel}" is also used by ${usageCount - 1} other relationship${usageCount - 1 === 1 ? '' : 's'}. Rename all of them to "${trimmedLabel}" too, or just this one? The rest keep "${currentLabel}".`,
          confirmLabel: 'Rename everywhere',
          cancelLabel: 'Only this one',
        });
        if (propagate) {
          Store.renameRelationshipType(rel.typeId, trimmedLabel);
        } else {
          Store.detachRelationshipToLabel(rel.id, trimmedLabel);
        }
      }
    }
    Store.updateRelationship(rel.id, {
      status: q('rel-status').value.trim(),
      strength: q('rel-strength').value.trim(),
      startDate: q('rel-start').value.trim(),
      endDate: q('rel-end').value.trim(),
      notes: q('rel-notes').value.trim(),
    });
    closeModal();
    onDone?.();
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-707-711
export function cancelCanvasLinkMode() {
  if (!canvasLinkMode) return;
  canvasLinkMode = false;
  canvasLinkFromId = null;
  if (activeView === 'canvas') requestRender();
}

// Historical context: see docs/CODEBASE_NOTES.md#jscanvasview-js-719-722
export function resetCanvasViewState() {
  canvasLinkMode = false;
  canvasLinkFromId = null;
  canvasHiddenTypes = new Set();
  canvasStatusFilter = '';
  canvasLoadedPresetId = '';
  canvasHiddenEntityIds = new Set(); // v0.2.9 — clear hidden entities too
}

import { registerViewReset } from './viewLifecycle.js';
registerViewReset('canvas', resetCanvasViewState);
