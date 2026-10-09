// Historical context: see docs/CODEBASE_NOTES.md#jsreferencesview-js-1-22

import * as Store from './store.js';
import { html, raw, toBridge, q } from './dom-utils.js';
import { confirmDialog } from './modal.js';
import { activeReferenceId, setActiveReferenceId } from './context.js';
import { openImageLibrary } from './imageLibrary.js';
import { resolveEntityAvatar } from './portraits.js';
import { tagFilterBarHtml, wireTagFilterBar, filterByTagSet } from './tagFilter.js';
import { EmptyState } from './emptyState.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsreferencesview-js-33-37
let referenceTagFilters = new Set();

// 0.2.6 Pass 1 — setActiveReferenceId moved to context.js (import below).

// Historical context: see docs/CODEBASE_NOTES.md#jsreferencesview-js-42-46
export function resetReferenceTagFilters() {
  referenceTagFilters = new Set();
  // Clear the active reference id — same reasoning as notesView's reset:
  // the previous project's selected reference doesn't exist in the next
  // project, and the defensive fallback would otherwise fire.
  setActiveReferenceId(null);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsreferencesview-js-55-58
import { registerViewReset } from './viewLifecycle.js';
registerViewReset('references', resetReferenceTagFilters);

export function renderReferencesView(project) {
  const panel = document.querySelector('.view-panel[data-view="references"]');
  const allRefs = Store.getReferenceList();

  if (!activeReferenceId || !allRefs.find((r) => r.id === activeReferenceId)) {
    setActiveReferenceId(allRefs[0]?.id || null);
  }

  const tagOptions = Store.getDistinctReferenceTags();
  const filteredRefs = filterByTagSet(allRefs, referenceTagFilters);

  panel.innerHTML = toBridge(html`
    <div class="sketch-layout">
      <div class="sketch-list-col">
        <div class="notes-view-header">
          <h2>References</h2>
          <button id="reference-new">+ New</button>
        </div>
        ${tagFilterBarHtml('reference', referenceTagFilters, tagOptions)}
        <div class="map-list" id="reference-list"></div>
      </div>
      <div class="sketch-main-col" id="reference-main"></div>
    </div>
  `);

  const listEl = q('reference-list');
  if (filteredRefs.length === 0) {
    listEl.innerHTML = toBridge(
      allRefs.length
        ? html`${EmptyState({ text: 'No references match the selected tags.' })}`
        : html`${EmptyState({ text: 'Gather your research. URLs, quotes, citations, images — anything you collected while researching, linkable to a character, scene, or chapter.' })}`
    );
  }
  filteredRefs.forEach((ref) => {
    const item = document.createElement('button');
    item.className = 'notes-entity-item' + (ref.id === activeReferenceId ? ' active' : '');
// Historical context: see docs/CODEBASE_NOTES.md#jsreferencesview-js-98-104
    item.dataset.referenceId = ref.id;
    item.innerHTML = toBridge(html`<span class="reference-type-tag">${ref.refType}</span> ${ref.title}`);
    item.addEventListener('click', () => {
      setActiveReferenceId(ref.id);
      renderReferencesView(Store.getActiveProject());
    });
    listEl.appendChild(item);
  });

  wireTagFilterBar('reference', referenceTagFilters, () => renderReferencesView(Store.getActiveProject()));

  q('reference-new').addEventListener('click', () => {
    const ref = Store.createReference({ refType: 'Note', title: `Reference ${allRefs.length + 1}` });
    setActiveReferenceId(ref.id);
    renderReferencesView(Store.getActiveProject());
  });

  renderReferenceMain(project);
}

function renderReferenceMain(project) {
  const mainEl = q('reference-main');
  const ref = activeReferenceId ? Store.getReference(activeReferenceId) : null;

  if (!ref) {
    mainEl.innerHTML = toBridge(html`<div class="empty-state">Nothing open yet. Select a reference, or start a fresh one.</div>`);
    return;
  }

  const entities = Store.getEntityList();
  const scenes = Store.getAllScenesFlat();
  const chapters = project.chapters;
  const isImageType = ref.refType === 'Image' || ref.refType === 'Screenshot';

  mainEl.innerHTML = toBridge(html`
    <div class="sketch-toolbar">
      <input type="text" id="reference-title" class="entity-name-input" value="${ref.title}" />
      <select id="reference-type">
        ${Store.getReferenceTypes().map((t) => html`<option value="${t}" ${t === ref.refType ? raw('selected') : ''}>${t}</option>`)}
      </select>
      <button id="reference-delete">Delete</button>
    </div>

    ${
      isImageType
        ? html`<div class="reference-image-row">
            <button id="reference-set-image">🖼 ${ref.imageId ? 'Change Image' : 'Set Image'}</button>
            <div class="reference-image-preview" id="reference-image-preview"></div>
          </div>`
        : ''
    }

    <label class="grammar-field-label">${ref.refType === 'Quote' ? 'Quote text' : ref.refType === 'Book/Source' ? 'Citation' : 'Content / notes'}
      <textarea id="reference-content" rows="4" placeholder="${ref.refType === 'Quote' ? 'The words themselves…' : 'What is this, in its own words?'}">${ref.content}</textarea>
    </label>
    <label class="grammar-field-label">URL <input type="text" id="reference-url" value="${ref.url}" placeholder="https://…" /></label>
    <label class="grammar-field-label">Source / attribution <input type="text" id="reference-source" value="${ref.source}" placeholder="Where this came from" /></label>
    <label class="grammar-field-label">Your notes on it
      <textarea id="reference-annotation" rows="3" placeholder="Why this matters for the story, distinct from the source's own words above">${ref.annotation}</textarea>
    </label>
    <label class="grammar-field-label">Tags <input type="text" id="reference-tags" value="${(ref.tags || []).join(', ')}" placeholder="Comma-separated" /></label>

    <div class="entity-meta-row">
      <label class="grammar-field-label">Linked entity
        <select id="reference-entity-link">
          <option value="">Not linked</option>
          ${entities.map((e) => html`<option value="${e.id}" ${e.id === ref.entityId ? raw('selected') : ''}>${e.name} (${e.type})</option>`)}
        </select>
      </label>
      <label class="grammar-field-label">Linked chapter
        <select id="reference-chapter-link">
          <option value="">Not linked</option>
          ${chapters.map((c) => html`<option value="${c.id}" ${c.id === ref.chapterId ? raw('selected') : ''}>${c.title}</option>`)}
        </select>
      </label>
    </div>
    <label class="grammar-field-label">Linked scene
      <select id="reference-scene-link">
        <option value="">Not linked</option>
        ${scenes.map((s) => html`<option value="${s.id}" ${s.id === ref.sceneId ? raw('selected') : ''}>${s.chapterTitle} · ${s.title}</option>`)}
      </select>
    </label>
  `);

  if (isImageType && ref.imageId) {
    resolveEntityAvatar(q('reference-image-preview'), ref.imageId);
  }

  q('reference-title').addEventListener('input', (e) => {
    Store.updateReference(ref.id, { title: e.target.value });
// Historical context: see docs/CODEBASE_NOTES.md#jsreferencesview-js-195-198
    const item = document.querySelector('.sketch-list-col .notes-entity-item.active');
    if (item) item.innerHTML = toBridge(html`<span class="reference-type-tag">${ref.refType}</span> ${e.target.value}`);
  });

  q('reference-type').addEventListener('change', (e) => {
    Store.updateReference(ref.id, { refType: e.target.value });
    renderReferencesView(Store.getActiveProject());
  });

  q('reference-set-image')?.addEventListener('click', () => {
    openImageLibrary({
      mode: 'map', // same single-select-then-close shape references need too — no reference-specific mode required
      title: 'Set Reference Image',
      currentImageId: ref.imageId,
      onSelect: (imageId) => {
        Store.updateReference(ref.id, { imageId });
        renderReferenceMain(Store.getActiveProject());
      },
    });
  });

  q('reference-content').addEventListener('change', (e) => Store.updateReference(ref.id, { content: e.target.value }));
  q('reference-url').addEventListener('change', (e) => Store.updateReference(ref.id, { url: e.target.value }));
  q('reference-source').addEventListener('change', (e) => Store.updateReference(ref.id, { source: e.target.value }));
  q('reference-annotation').addEventListener('change', (e) => Store.updateReference(ref.id, { annotation: e.target.value }));
  q('reference-tags').addEventListener('change', (e) => {
    Store.updateReference(ref.id, { tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) });
    renderReferencesView(Store.getActiveProject()); // refreshes the sidebar's Tags filter chip list
  });
  q('reference-entity-link').addEventListener('change', (e) => Store.updateReference(ref.id, { entityId: e.target.value || null }));
  q('reference-chapter-link').addEventListener('change', (e) => Store.updateReference(ref.id, { chapterId: e.target.value || null }));
  q('reference-scene-link').addEventListener('change', (e) => Store.updateReference(ref.id, { sceneId: e.target.value || null }));

  q('reference-delete').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Delete this reference?', message: `Delete "${ref.title}"? This can't be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    Store.deleteReference(ref.id);
    setActiveReferenceId(null);
    renderReferencesView(Store.getActiveProject());
  });
}
