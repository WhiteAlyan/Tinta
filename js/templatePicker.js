// templatePicker (0.2.7 move-out) — the +New-from-template picker; refreshes
// the Organize modal body in place when opened from there.
//
import * as ModalShell from './modal.js';
import * as Store from './store.js';
import { activeChapterId, setActiveChapterId, setActiveView } from './context.js';
import { escapeAttr, escapeHtml } from './dom-utils.js';
import { openSceneInspector } from './drawer.js';
import { closeModal, openModal } from './modal.js';
import { requestRender } from './renderBus.js';

export function openTemplatePicker() {
  const templates = Store.getDocumentTemplates();
  const activeChapter = activeChapterId ? Store.getChapter(activeChapterId) : null;

  const root = ModalShell.openModal({
    title: 'New from Template',
    className: 'export-modal',
    body: `
        <p class="backup-note">Chapter templates create a new chapter. Scene templates add a scene to your current chapter${activeChapter ? ` (“${escapeHtml(activeChapter.title)}”)` : '. Open or create a chapter first'}.</p>
        <div class="template-list">
          ${templates.map((t) => templateRowHtml(t, activeChapter)).join('')}
        </div>
    `,
  });

  root.querySelectorAll('.template-use-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      const templateId = btn.dataset.templateId;
      const template = Store.getDocumentTemplate(templateId);
      if (!template) return;
      if (template.appliesTo === 'chapter') {
        const chapter = Store.createChapterFromTemplate(templateId);
        if (!chapter) return;
        setActiveChapterId(chapter.id);
        setActiveView('write');
        closeModal();
        requestRender();
      } else {
        if (!activeChapterId) return; // button is disabled in this case, but guard anyway
        const scene = Store.createSceneFromTemplate(activeChapterId, templateId);
        if (!scene) return;
        setActiveView('write');
        closeModal();
        requestRender();
        openSceneInspector(activeChapterId, scene.id);
      }
    });
  });
}

export function templateRowHtml(template, activeChapter) {
  const disabled = template.appliesTo === 'scene' && !activeChapter;
  const icon = template.appliesTo === 'chapter' ? '📄' : '🎬';
  const preview = template.appliesTo === 'chapter'
    ? (template.content || '').slice(0, 60).replace(/\n/g, ' ')
    : (template.sceneFields?.notes || template.sceneFields?.goal || '').slice(0, 60).replace(/\n/g, ' ');
  return `
    <div class="template-row">
      <span class="template-row-icon">${icon}</span>
      <div class="template-row-body">
        <span class="template-row-name">${escapeHtml(template.name)}</span>
        ${preview ? `<span class="template-row-preview">${escapeHtml(preview)}${preview.length >= 60 ? '…' : ''}</span>` : ''}
      </div>
      <span class="template-row-tag">${template.appliesTo}</span>
      <button class="template-use-btn" data-template-id="${escapeAttr(template.id)}" ${disabled ? 'disabled title="Open or create a chapter first"' : ''}>Use</button>
    </div>
  `;
}

// Historical context: see docs/CODEBASE_NOTES.md#jstemplatepicker-js-71-82

