// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-1-40

import * as Store from './store.js';
import { html, raw, toBridge, q, capitalize } from './dom-utils.js';
import { openWorldbuildingDraftModal, activeEntityIdFromGenerator, clearActiveEntityIdFromGenerator } from './generatorModal.js';
import { requestRender } from './renderBus.js';
import { revokeEntityPortraitUrls, resolveEntityAvatar } from './portraits.js';
import { openImageLibrary } from './imageLibrary.js';
import { openEntityTypeManager } from './typeManagers.js';
import { openEntityHistoryModal } from './historyModals.js';
import { tagFilterBarHtml, wireTagFilterBar, filterByTagSet } from './tagFilter.js';
import { setActiveView, setActiveChapterId, setActiveSketchId } from './context.js';
import { entityTypeLabelPlural, entityDotClass, entityColorStyleAttr } from './canvasView.js';
import { confirmDialog } from './modal.js';
import { activeEntityId, setActiveEntityId } from './context.js';
import { vocabularyLabel, vocabularyOrder } from './vocabulary.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-57-65
let entityTagFilters = new Set();

// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-68-74

// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-76-80
export function resetEntityTagFilters() {
  entityTagFilters = new Set();
// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-83-88
  setActiveEntityId(null);
}

// Register with the viewLifecycle registry — every view that owns
// per-view state does this at module-load time, so project-switch's
// resetAllViews() call covers them all without a manual list.
import { registerViewReset } from './viewLifecycle.js';
registerViewReset('notes', resetEntityTagFilters);

export function renderNotesView(project) {
  const panel = document.querySelector('.view-panel[data-view="notes"]');
  const entities = Store.getEntityList();
  const activeSeries = Store.getSeriesForActiveProject();
  const seriesEntities = Store.getSeriesEntityList();

  revokeEntityPortraitUrls();

  // Generator engine, domains pass — pick up an entity the generator
  // modal just committed, same "module-level flag, read on next render"
  // shape as activeEntityId's own fallback logic just below.
  if (activeEntityIdFromGenerator) {
    setActiveEntityId(activeEntityIdFromGenerator);
    clearActiveEntityIdFromGenerator();
  }

  if (!activeEntityId && entities.length) setActiveEntityId(entities[0].id);
  if (activeEntityId && !Store.getEntity(activeEntityId)) setActiveEntityId(entities[0]?.id || null);

// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-117-121
  const filterFn = (list) => filterByTagSet(list, entityTagFilters);
  const filteredEntities = filterFn(entities);
  const filteredSeriesEntities = filterFn(seriesEntities);
  const tagOptions = Store.getDistinctEntityTags();

  panel.innerHTML = toBridge(html`
    <div class="notes-layout">
      <div class="notes-sidebar">
        <div class="notes-add">
          <input type="text" id="new-entity-name" class="notes-add-name" placeholder="New entity name…" />
          <select id="new-entity-type" class="status-select">
            ${Store.getEntityTypes().map((t) => html`<option value="${t.key}">${t.label}</option>`)}
          </select>
          ${
            activeSeries
              ? html`<select id="new-entity-scope" class="status-select" title="Where should this entity live?">
                  <option value="project">This book</option>
                  <option value="series">🔗 ${activeSeries.title}</option>
                </select>`
              : ''
          }
          <button id="new-entity-btn" class="add-scene-btn">+ Add</button>
          <button id="generate-entity-btn" class="add-scene-btn generate-entity-btn" title="Generate a starter draft for the selected type">🎲</button>
        </div>
        <button id="manage-entity-types-btn" class="wt-menu-item" style="text-align:left; padding-left:0;">⚙ Manage entity types…</button>
        ${tagFilterBarHtml('entity', entityTagFilters, tagOptions, 'margin-top:var(--space-3);')}
        <div class="notes-groups"></div>
        ${activeSeries ? html`<div class="notes-groups notes-shared-groups"></div>` : ''}
      </div>
      <div class="notes-detail"></div>
    </div>
  `);

  wireTagFilterBar('entity', entityTagFilters, () => renderNotesView(Store.getActiveProject()));
  q('manage-entity-types-btn').addEventListener('click', () => openEntityTypeManager());

// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-158-162
  function renderEntityGroup(groupsEl, items, { shared }) {
    let anyGroup = false;
    Store.getEntityTypes().forEach((typeDef) => {
      const type = typeDef.key;
      const typeItems = items.filter((e) => e.type === type);
      if (!typeItems.length) return;
      anyGroup = true;

      const group = document.createElement('div');
      group.className = 'notes-group';
      group.innerHTML = toBridge(html`<h4>${entityTypeLabelPlural(type)}</h4>`);

      const ul = document.createElement('ul');
      ul.className = 'notes-entity-list';
      typeItems.forEach((entity) => {
        const li = document.createElement('li');
        li.className = 'notes-entity-item' + (entity.id === activeEntityId ? ' active' : '');
        li.dataset.entityId = entity.id;
        const portraitId = Store.getEntityPortraitId(entity);
        const parent = entity.parentId ? Store.getEntity(entity.parentId) : null;
        li.innerHTML = toBridge(html`
          <span class="notes-entity-avatar${portraitId ? '' : html` is-dot ${entityDotClass(entity.type)}`}"${portraitId ? '' : raw(entityColorStyleAttr(entity.type))}></span>
          <span class="notes-entity-name">
            <span class="notes-entity-name-text">${shared ? '🔗 ' : ''}${entity.name}</span>
            ${parent ? html`<span class="drawer-subtitle" style="display:block;font-size:var(--text-2xs);">in ${parent.name}</span>` : ''}
          </span>
          <button class="notes-entity-delete" title="Delete ${entity.name}">✕</button>
        `);
        li.addEventListener('click', () => {
          setActiveEntityId(entity.id);
          renderNotesView(Store.getActiveProject());
        });
// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-195-202
        li.querySelector('.notes-entity-delete').addEventListener('click', async (e) => {
          e.stopPropagation();
// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-205-211
          const warning = shared
            ? `Delete "${entity.name}" from ${activeSeries.title}? This removes it from every book in the series, not just this one. Existing [[mentions]] in any book's text won't be removed.`
            : `Delete "${entity.name}"? Existing [[mentions]] in your text won't be removed.`;
          if (!(await confirmDialog({ title: 'Delete this entity?', message: warning, confirmLabel: 'Delete', danger: true }))) return;
          if (shared) Store.deleteSeriesEntity(entity.id);
          else Store.deleteEntity(entity.id);
          if (activeEntityId === entity.id) setActiveEntityId(null);
          renderNotesView(Store.getActiveProject());
        });
        ul.appendChild(li);
        if (portraitId) resolveEntityAvatar(li.querySelector('.notes-entity-avatar'), portraitId);
      });
      group.appendChild(ul);
      groupsEl.appendChild(group);
    });
    return anyGroup;
  }

  const groupsEl = panel.querySelector('.notes-groups');
  const anyGroup = renderEntityGroup(groupsEl, filteredEntities, { shared: false });

  if (!anyGroup) {
    groupsEl.innerHTML = toBridge(html`<p class="empty-state-sm">Nobody's here yet. Add a character, location, item, or concept, then link it into your manuscript anywhere with <code>[[double brackets]]</code>.</p>`);
  }

  if (activeSeries) {
    const sharedGroupsEl = panel.querySelector('.notes-shared-groups');
    const header = document.createElement('h4');
    header.className = 'notes-shared-heading';
    header.textContent = `🔗 Shared · ${activeSeries.title}`;
    sharedGroupsEl.appendChild(header);
    const anySharedGroup = renderEntityGroup(sharedGroupsEl, filteredSeriesEntities, { shared: true });
    if (!anySharedGroup) {
      const empty = document.createElement('p');
      empty.className = 'empty-state-sm';
      empty.textContent = 'Nothing shared yet. Add a new one as "' + activeSeries.title + '" above, or promote one of this book\'s own entities from its detail panel.';
      sharedGroupsEl.appendChild(empty);
    }
  }

  q('new-entity-btn').addEventListener('click', () => {
    const nameInput = q('new-entity-name');
    const typeSelect = q('new-entity-type');
    const scopeSelect = q('new-entity-scope');
    const name = nameInput.value.trim();
    if (!name) return;
    const entity = scopeSelect && scopeSelect.value === 'series'
      ? Store.createSeriesEntity({ name, type: typeSelect.value })
      : Store.createEntity({ name, type: typeSelect.value });
    setActiveEntityId(entity.id);
    renderNotesView(Store.getActiveProject());
  });
  q('new-entity-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') q('new-entity-btn').click();
  });

  // Generator engine, domains pass — generate a starter draft for
  // whichever type is currently selected in the same dropdown "+ Add"
  // uses, rather than a separate type picker of its own.
  q('generate-entity-btn').addEventListener('click', () => {
    openWorldbuildingDraftModal(q('new-entity-type').value);
  });

  renderEntityDetail(panel);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-278-288
let entityFieldSaveTimer = null;
let entityFieldSavePending = null; // { entityId, patch } — the merged, not-yet-written edit

export function flushEntityFieldSave() {
  if (entityFieldSaveTimer) clearTimeout(entityFieldSaveTimer);
  entityFieldSaveTimer = null;
  if (!entityFieldSavePending) return;
  const { entityId, patch } = entityFieldSavePending;
  entityFieldSavePending = null;
  Store.updateEntity(entityId, patch);
  Store.markGenerationEdited('entity', entityId);
}

function scheduleEntityFieldSave(entityId, patch) {
// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-303-306
  if (entityFieldSavePending && entityFieldSavePending.entityId !== entityId) flushEntityFieldSave();
  entityFieldSavePending = {
    entityId,
    patch: { ...(entityFieldSavePending?.patch || {}), ...patch },
  };
  if (entityFieldSaveTimer) clearTimeout(entityFieldSaveTimer);
  const delay = Store.getAutosaveDelayMs();
  if (delay <= 0) { flushEntityFieldSave(); return; } // 'off' — write immediately, same as scheduleSave()
  entityFieldSaveTimer = setTimeout(flushEntityFieldSave, delay);
}

function renderEntityDetail(panel) {
// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-319-324
  flushEntityFieldSave();
  const detail = panel.querySelector('.notes-detail');
  const entity = activeEntityId ? Store.getEntity(activeEntityId) : null;

  if (!entity) {
    detail.innerHTML = toBridge(html`<div class="empty-state">Nothing selected yet. Pick an entity from the list, or create one, to see its details and backlinks here.</div>`);
    return;
  }

  const backlinks = Store.getBacklinksFor(entity.id);
  const linkedSketches = Store.getSketchesForEntity(entity.id);
  const portraitId = Store.getEntityPortraitId(entity);
  const typeDef = Store.getEntityType(entity.type);
// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-338-344
  const parentCandidates = Store.getEntityList().filter((e) => e.id !== entity.id && !Store.wouldCreateCycle(entity.id, e.id));
  const activeSeries = Store.getSeriesForActiveProject();
  const isShared = Store.isSeriesEntity(entity.id);

  detail.innerHTML = toBridge(html`
    <div class="notes-detail-header">
      <span class="entity-portrait${portraitId ? '' : ` is-dot ${entityDotClass(entity.type)}`}"${portraitId ? '' : raw(entityColorStyleAttr(entity.type))}></span>
      <input type="text" id="entity-name-input" class="entity-name-input" value="${entity.name}" />
      <select id="entity-type-select" class="status-select">
        ${Store.getEntityTypes().map((t) => html`<option value="${t.key}" ${t.key === entity.type ? raw('selected') : ''}>${t.label}</option>`)}
      </select>
      <button id="entity-history-btn" class="toolbar-btn-icon" title="Revision history · snapshots + restore">🕐</button>
    </div>
    ${
      activeSeries
        ? html`<div class="entity-share-row">
            <span class="entity-share-status">${isShared ? `🔗 Shared across ${activeSeries.title}` : 'Local to this book'}</span>
            <button id="entity-share-toggle-btn" class="toolbar-btn">${isShared ? '📕 Move to this book only' : `🔗 Share with ${activeSeries.title}`}</button>
          </div>`
        : ''
    }
    <textarea id="entity-description" class="entity-description" placeholder="Description, backstory, notes…">${entity.description}</textarea>

    <div class="entity-meta-row">
      <label class="grammar-field-label">Parent
        <select id="entity-parent-select">
          <option value="">None (top-level)</option>
          ${parentCandidates.map((p) => html`<option value="${p.id}" ${p.id === entity.parentId ? raw('selected') : ''}>${p.name}</option>`)}
        </select>
      </label>
      <label class="grammar-field-label">Aliases
        <input type="text" id="entity-aliases-input" value="${(entity.aliases || []).join(', ')}" placeholder="Nicknames, titles… comma-separated" />
      </label>
      <label class="grammar-field-label">Canon status
        <select id="entity-canon-select">
          ${vocabularyOrder('canonStatus').map((s) => html`<option value="${s}" ${s === entity.canonStatus ? raw('selected') : ''}>${vocabularyLabel('canonStatus', s)}</option>`)}
        </select>
      </label>
      <label class="grammar-field-label">Authority source
        <select id="entity-authority-select">
          ${Store.getAuthoritySources().map((s) => html`<option value="${s}" ${s === entity.authoritySource ? raw('selected') : ''}>${s}</option>`)}
        </select>
      </label>
    </div>
    ${
      entity.generation
        ? html`<p class="settings-note entity-generation-badge">🎲 Generated by ${entity.generation.generatorName}${entity.generation.edited ? ' · edited since' : ' · not yet reviewed'}</p>`
        : ''
    }
    <label class="grammar-field-label" style="display:block; margin-top: var(--space-4);">Tags
      <input type="text" id="entity-tags-input" value="${(entity.tags || []).join(', ')}" placeholder="Comma-separated; powers the Tags filter in the sidebar" />
    </label>
    ${
      typeDef && typeDef.fields.length
        ? html`<div class="entity-custom-fields">
            ${typeDef.fields.map((f) => html`
              <div class="entity-custom-field-row">
                <label class="grammar-field-label">${f.label}
                  <input type="text" data-custom-field="${f.key}" value="${entity.customFields?.[f.key] || ''}" />
                </label>
              </div>
            `)}
          </div>`
        : ''
    }

    <div class="entity-status-section">
      <div class="entity-status-header">
        <h4>Status timeline</h4>
        <span class="entity-status-hint" title="Anchors a status label to a point in the Timeline's story order, so continuity checking knows what shouldn't happen after it.">for continuity checking</span>
      </div>
      <div class="entity-status-list" id="entity-status-list"></div>
      <div class="entity-status-add-row">
        <input type="text" id="entity-status-label-input" placeholder="Status label, e.g. Deceased, Captured, Reunited…" />
        <select id="entity-status-event-select"></select>
        <label class="entity-status-blocks-label">
          <input type="checkbox" id="entity-status-blocks-checkbox" />
          Ends appearances
        </label>
        <button id="entity-status-add-btn" class="toolbar-btn">+ Add</button>
      </div>
    </div>

    <div class="entity-gallery">
      <div class="entity-gallery-header">
        <h4>Gallery</h4>
        <button id="entity-gallery-add-btn" class="add-scene-btn">+ Add image</button>
      </div>
      <div class="entity-gallery-grid">
        ${entity.imageIds.length ? '' : html`<p class="empty-state-sm">No images yet: portraits, location photos, item references, whatever helps you picture it.</p>`}
      </div>
    </div>
    <div class="notes-backlinks">
      <h4>Appears in (${backlinks.length})</h4>
      ${backlinks.length
        ? html`<ul class="backlink-list"></ul>`
        : html`<p class="empty-state-sm">Not mentioned anywhere yet. Use <code>[[${entity.name}]]</code> in a chapter or scene field to link it here.</p>`}
    </div>
    <div class="notes-backlinks">
      <h4>Linked sketches (${linkedSketches.length})</h4>
      ${linkedSketches.length
        ? html`<ul class="backlink-list">${linkedSketches.map((s) => html`<li class="backlink-item entity-sketch-link" data-sketch="${s.id}"><span class="backlink-loc">Sketch</span><span class="backlink-snippet">${s.title}</span></li>`)}</ul>`
        : html`<p class="empty-state-sm">No sketches attached; link one from the Sketch view's "Link entity" dropdown.</p>`}
    </div>
  `);

  if (portraitId) resolveEntityAvatar(detail.querySelector('.entity-portrait'), portraitId);

  renderEntityStatusList(panel, entity.id);

  if (entity.imageIds.length) {
    const galleryGrid = detail.querySelector('.entity-gallery-grid');
    entity.imageIds.forEach((imageId) => {
      const thumb = document.createElement('div');
      thumb.className = 'entity-gallery-thumb' + (imageId === portraitId ? ' is-primary' : '');
      thumb.dataset.imageId = imageId;
      thumb.innerHTML = toBridge(html`
        <span class="entity-gallery-thumb-img"><span class="image-thumb-loading">Loading…</span></span>
        <div class="entity-gallery-thumb-row">
          <button class="entity-gallery-star" title="${imageId === portraitId ? 'Portrait image' : 'Set as portrait'}">${imageId === portraitId ? '★' : '☆'}</button>
          <button class="entity-gallery-remove" title="Remove from gallery">✕</button>
        </div>
      `);
      galleryGrid.appendChild(thumb);
      resolveEntityAvatar(thumb.querySelector('.entity-gallery-thumb-img'), imageId);
      thumb.querySelector('.entity-gallery-star').addEventListener('click', () => {
        Store.setEntityPrimaryImage(entity.id, imageId);
        renderEntityDetail(panel);
      });
      thumb.querySelector('.entity-gallery-remove').addEventListener('click', () => {
        Store.removeEntityImage(entity.id, imageId);
        renderEntityDetail(panel);
      });
    });
  }

  detail.querySelectorAll('.entity-sketch-link').forEach((li) => {
    li.addEventListener('click', () => {
      setActiveSketchId(li.dataset.sketch);
      setActiveView('sketch');
      requestRender();
    });
  });

  detail.querySelector('#entity-gallery-add-btn').addEventListener('click', () => {
    openImageLibrary({
      mode: 'entity',
      entityId: entity.id,
      title: `Add images · ${entity.name}`,
      onSelect: () => renderEntityDetail(panel),
    });
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-498-503
  const shareToggleBtn = detail.querySelector('#entity-share-toggle-btn');
  if (shareToggleBtn) {
    shareToggleBtn.addEventListener('click', async () => {
      if (isShared) {
        const warning = `Move "${entity.name}" out of ${activeSeries.title} and into this book only? Other books in the series will lose access to it; any [[mentions]] or relationships pointing at it in their text will be left unresolved, the same as if it had been deleted from their perspective.`;
        if (!(await confirmDialog({ title: 'Move out of the series?', message: warning, confirmLabel: 'Move', danger: true }))) return;
        Store.demoteEntityToProject(entity.id);
      } else {
        const warning = `Share "${entity.name}" with ${activeSeries.title}? Every book in the series will be able to see and edit it from here on.`;
        if (!(await confirmDialog({ title: 'Share with the series?', message: warning, confirmLabel: 'Share' }))) return;
        Store.promoteEntityToSeries(entity.id);
      }
      renderNotesView(Store.getActiveProject());
    });
  }

  if (backlinks.length) {
    const ul = detail.querySelector('.backlink-list');
    backlinks.forEach((bl) => {
      const li = document.createElement('li');
      li.className = 'backlink-item';
      const label = bl.eventId
        ? `Timeline → ${bl.eventTitle}`
        : bl.sceneTitle
          ? `${bl.chapterTitle} → ${bl.sceneTitle} (${bl.field})`
          : `${bl.chapterTitle} (${bl.field})`;
      li.innerHTML = toBridge(html`
        <span class="backlink-loc">${label}</span>
        <span class="backlink-snippet">${bl.snippet}</span>
      `);
      li.addEventListener('click', () => {
        if (bl.eventId) {
          setActiveView('timeline');
        } else {
          setActiveChapterId(bl.chapterId);
          setActiveView('write');
        }
        requestRender();
      });
      ul.appendChild(li);
    });
  }

  detail.querySelector('#entity-name-input').addEventListener('input', (e) => {
    scheduleEntityFieldSave(entity.id, { name: e.target.value });
    // Patch the sidebar label directly rather than a full re-render, so the
    // name input doesn't lose focus/caret position mid-keystroke.
    const li = panel.querySelector(`.notes-entity-item[data-entity-id="${entity.id}"]`);
    const nameEl = li?.querySelector('.notes-entity-name-text');
    if (nameEl) nameEl.textContent = e.target.value;
  });
  detail.querySelector('#entity-type-select').addEventListener('change', (e) => {
    Store.updateEntity(entity.id, { type: e.target.value });
    Store.markGenerationEdited('entity', entity.id);
    renderNotesView(Store.getActiveProject());
  });
  detail.querySelector('#entity-history-btn').addEventListener('click', () => openEntityHistoryModal(entity.id));
  detail.querySelector('#entity-description').addEventListener('input', (e) => {
    scheduleEntityFieldSave(entity.id, { description: e.target.value });
  });
// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-564-571
  const splitCsv = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  detail.querySelector('#entity-canon-select').addEventListener('change', (e) => {
    Store.setCanonStatus('entity', entity.id, e.target.value);
  });
  detail.querySelector('#entity-authority-select').addEventListener('change', (e) => {
    Store.setAuthoritySource('entity', entity.id, e.target.value);
  });
  detail.querySelector('#entity-parent-select').addEventListener('change', (e) => {
    Store.updateEntity(entity.id, { parentId: e.target.value || null });
    Store.markGenerationEdited('entity', entity.id);
    renderNotesView(Store.getActiveProject());
  });
  detail.querySelector('#entity-aliases-input').addEventListener('change', (e) => {
    Store.updateEntity(entity.id, { aliases: splitCsv(e.target.value) });
    Store.markGenerationEdited('entity', entity.id);
  });
  detail.querySelector('#entity-tags-input').addEventListener('change', (e) => {
    Store.updateEntity(entity.id, { tags: splitCsv(e.target.value) });
    Store.markGenerationEdited('entity', entity.id);
    renderNotesView(Store.getActiveProject()); // refreshes the sidebar's Tags filter chip list
  });
  detail.querySelectorAll('[data-custom-field]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const key = e.target.dataset.customField;
      Store.updateEntity(entity.id, { customFields: { ...entity.customFields, [key]: e.target.value } });
      Store.markGenerationEdited('entity', entity.id);
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsnotesview-js-602-607
function renderEntityStatusList(panel, entityId) {
  const detail = panel.querySelector('.notes-detail');
  const listEl = detail?.querySelector('#entity-status-list');
  const eventSelect = detail?.querySelector('#entity-status-event-select');
  if (!listEl || !eventSelect) return;

  const statusEvents = Store.getEntityStatusEvents(entityId);
  const timelineEvents = Store.getTimelineEventList();

  listEl.innerHTML = toBridge(
    statusEvents.length
      ? html`${statusEvents.map((se) => {
          const event = Store.getTimelineEvent(se.timelineEventId);
          return html`<div class="entity-status-item" data-status-event="${se.id}">
            <span class="entity-status-item-label">${se.label}</span>
            <span class="entity-status-item-anchor">${event ? html`as of “${event.title}”` : html`<em>linked event was deleted</em>`}</span>
            ${se.blocksAppearance ? html`<span class="entity-status-item-badge">ends appearances</span>` : ''}
            <button class="entity-status-item-delete" title="Remove">✕</button>
          </div>`;
        })}`
      : html`<p class="empty-state-sm">No status changes tracked yet. Add one below to let continuity checking know what shouldn't happen after it.</p>`
  );

  eventSelect.innerHTML = toBridge(
    timelineEvents.length
      ? html`${timelineEvents.map((e) => html`<option value="${e.id}">${e.title}${e.storyDate ? html` (${e.storyDate})` : ''}</option>`)}`
      : html`<option value="">No timeline events yet. Add one in Timeline first</option>`
  );

  listEl.querySelectorAll('.entity-status-item-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      Store.deleteEntityStatusEvent(entityId, btn.closest('.entity-status-item').dataset.statusEvent);
      renderEntityStatusList(panel, entityId);
    });
  });

  const addBtn = detail.querySelector('#entity-status-add-btn');
  addBtn.onclick = () => {
    const labelInput = detail.querySelector('#entity-status-label-input');
    const blocksCheckbox = detail.querySelector('#entity-status-blocks-checkbox');
    if (!labelInput.value.trim() || !eventSelect.value) return;
    Store.addEntityStatusEvent(entityId, {
      label: labelInput.value,
      timelineEventId: eventSelect.value,
      blocksAppearance: blocksCheckbox.checked,
    });
    labelInput.value = '';
    blocksCheckbox.checked = false;
    renderEntityStatusList(panel, entityId);
  };
}

