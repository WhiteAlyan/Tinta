// typeManagers (0.2.7 move-out) — the chapter-type and entity-type manager
// modals. Starter templates come from worldTemplates.js.
//
import * as ModalShell from './modal.js';
import * as Store from './store.js';
import { escapeAttr, escapeHtml, q } from './dom-utils.js';
import { closeModal, confirmDialog, openModal } from './modal.js';
import { renderNotesView } from './notesView.js';
import { requestRender } from './renderBus.js';
import { WORLDBUILDING_TEMPLATES } from './worldTemplates.js';

// Historical context: see docs/CODEBASE_NOTES.md#jstypemanagers-js-12-19

export const CHAPTER_TYPE_ROLE_LABEL = { content: 'Content', frontmatter: 'Front matter', backmatter: 'Back matter', scratch: 'Scratch (excluded from export)' };

export function openChapterTypeManager() {
  const project = Store.getActiveProject();
  const types = Store.getChapterTypes();

// Historical context: see docs/CODEBASE_NOTES.md#jstypemanagers-js-27-36
  const root = ModalShell.openModal({
    title: 'Document types',
    className: 'entity-type-manager-modal',
    body: `
        <p class="settings-note">What kind of document each chapter-slot is: an ordinary Chapter, front/back matter like a Dedication or Appendix, or Scratch material (Author/Research notes) that's excluded from manuscript export automatically. Role controls behavior; label is just what you see.</p>
        <div class="entity-type-list">
          ${types.map((t) => {
            const inUse = project.chapters.some((c) => c.docType === t.key);
            return `
            <div class="entity-type-row" data-type-key="${escapeAttr(t.key)}">
              <span class="entity-type-row-label">${escapeHtml(t.label)}${t.builtin ? '<span class="is-builtin">Built-in</span>' : ''} <span class="health-row-sub">${CHAPTER_TYPE_ROLE_LABEL[t.role] || t.role}</span></span>
              ${
                t.builtin
                  ? ''
                  : `<button class="library-menu-item library-menu-danger chapter-type-delete-btn" ${inUse ? 'disabled title="Still in use by at least one chapter: reassign or delete those first."' : ''}>✕ Delete</button>`
              }
            </div>`;
          }).join('')}
        </div>
        <div class="entity-type-new-row">
          <input type="text" id="new-doctype-label" placeholder="New type name (e.g. Prelude, Map Key)…" />
          <select id="new-doctype-role" class="status-select">
            ${Object.entries(CHAPTER_TYPE_ROLE_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
          <button id="new-doctype-add-btn" class="add-scene-btn">+ Add</button>
        </div>
    `,
  });

  const closeToWrite = () => { ModalShell.teardown(); requestRender(); };
  q('modal-close').addEventListener('click', closeToWrite);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeToWrite();
  });

  root.querySelectorAll('.chapter-type-delete-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const key = e.target.closest('.entity-type-row').dataset.typeKey;
      const type = Store.getChapterType(key);
      if (!(await ModalShell.confirmDialog({ title: 'Delete this document type?', message: `Delete the "${type.label}" document type? This can't be undone.`, confirmLabel: 'Delete', danger: true }))) return;
      Store.deleteChapterType(key);
      openChapterTypeManager();
    });
  });

  q('new-doctype-add-btn').addEventListener('click', () => {
    const labelInput = q('new-doctype-label');
    const label = labelInput.value.trim();
    if (!label) return;
    Store.createChapterType({ label, role: q('new-doctype-role').value });
    openChapterTypeManager();
  });
  q('new-doctype-label').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') q('new-doctype-add-btn').click();
  });
}

export function openEntityTypeManager() {
  const project = Store.getActiveProject();
  const types = Store.getEntityTypes();

// Historical context: see docs/CODEBASE_NOTES.md#jstypemanagers-js-98-103
  const root = ModalShell.openModal({
    title: 'Entity types',
    className: 'entity-type-manager-modal',
    body: `
        <p class="settings-note">The four defaults (Character, Location, Item, Concept) are always here. Add your own (Deity, Species, Faction, whatever your worldbuilding needs) with a color and any custom fields you want every entity of that type to have.</p>
        <div class="entity-type-list">
          ${types.map((t) => {
            const inUse = Object.values(project.entities).some((e) => e.type === t.key);
            return `
            <div class="entity-type-row" data-type-key="${escapeAttr(t.key)}">
              <span class="entity-type-color-dot" style="background:${t.builtin ? `var(--entity-${t.key})` : escapeAttr(t.color)}"></span>
              <span class="entity-type-row-label">${escapeHtml(t.label)}${t.builtin ? '<span class="is-builtin">Built-in</span>' : t.fields.length ? `<span class="is-builtin">${t.fields.length} custom field${t.fields.length === 1 ? '' : 's'}</span>` : ''}</span>
              ${
                t.builtin
                  ? ''
                  : `<button class="library-menu-item library-menu-danger entity-type-delete-btn" ${inUse ? 'disabled title="Still in use by at least one entity: reassign or delete those first."' : ''}>✕ Delete</button>`
              }
            </div>`;
          }).join('')}
        </div>
        <div class="entity-type-new-row">
          <input type="text" id="new-type-label" placeholder="New type name (e.g. Deity, Species, Faction)…" />
          <input type="color" id="new-type-color" value="#8B6F47" title="Color" />
          <button id="new-type-add-btn" class="add-scene-btn">+ Add</button>
        </div>
        ${(() => {
          const existingLabels = new Set(types.map((t) => t.label));
          const available = WORLDBUILDING_TEMPLATES.filter((tpl) => !existingLabels.has(tpl.label));
          if (!available.length) return '';
          return `
          <div class="entity-type-templates">
            <p class="settings-note">Or start from a worldbuilding template: ${available.length} field${available.length === 1 ? '' : 's'} each, prefilled and ready to edit or ignore:</p>
            <div class="entity-type-template-row">
              ${available.map((tpl) => `<button class="wt-menu-item entity-type-template-btn" data-template="${escapeAttr(tpl.label)}">+ ${escapeHtml(tpl.label)}</button>`).join('')}
            </div>
          </div>`;
        })()}
    `,
  });

  q('modal-close').addEventListener('click', () => closeTypeManagerToNotes());
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeTypeManagerToNotes();
  });

  root.querySelectorAll('.entity-type-delete-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const key = e.target.closest('.entity-type-row').dataset.typeKey;
      const type = Store.getEntityType(key);
      if (!(await ModalShell.confirmDialog({ title: 'Delete this type?', message: `Delete the "${type.label}" type? This can't be undone.`, confirmLabel: 'Delete', danger: true }))) return;
      Store.deleteEntityType(key);
      openEntityTypeManager();
    });
  });

  q('new-type-add-btn').addEventListener('click', () => {
    const labelInput = q('new-type-label');
    const label = labelInput.value.trim();
    if (!label) return;
    Store.createEntityType({ label, color: q('new-type-color').value });
    openEntityTypeManager();
  });
  q('new-type-label').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') q('new-type-add-btn').click();
  });

  root.querySelectorAll('.entity-type-template-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = WORLDBUILDING_TEMPLATES.find((t) => t.label === btn.dataset.template);
      if (!tpl) return;
      Store.createEntityType({ label: tpl.label, color: tpl.color, fields: tpl.fields });
      openEntityTypeManager();
    });
  });

  function closeTypeManagerToNotes() {
    closeModal();
    renderNotesView(Store.getActiveProject());
  }
}

