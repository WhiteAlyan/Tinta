// exportMenu (0.2.7 move-out) — the per-chapter export menu (md/docx/epub/txt).
//
import * as ImageStore from './imagestore.js';
import * as ModalShell from './modal.js';
import * as Store from './store.js';
import { q } from './dom-utils.js';
import { downloadBinaryFile, downloadTextFile, safeFilename } from './file-utils.js';
import { docxFilename, epubFilename, exportDocx, exportEpub } from './manuscriptExport.js';
import { closeModal, openModal } from './modal.js';
import { showStorageWarning } from './toast.js';

export function openExportMenu(chapterId) {
  const chapter = Store.getChapter(chapterId);
  const project = Store.getActiveProject();

  ModalShell.openModal({
    title: 'Export',
    className: 'export-modal',
    body: `
        <div class="backup-section">
          <h3>Markdown</h3>
          <p class="backup-note">Prose-only, no formatting beyond the text itself. Good for a plain-text backup or pasting elsewhere.</p>
          <div class="export-options">
            <button id="export-chapter-md">This chapter (.md)</button>
            <button id="export-project-md">Whole project (.md)</button>
          </div>
        </div>

        <div class="backup-section">
          <h3>Manuscript</h3>
          <p class="backup-note">Whole project, formatted rather than plain text. Word gets standard manuscript format (Times New Roman, double-spaced, indented paragraphs, a title page), with colors and inline images left out on purpose, since those don't belong in a submission. EPUB is a reading copy instead: it keeps color highlights and embeds your inline images, for loading onto an e-reader.</p>
          <input type="text" id="manuscript-author-input" placeholder="Author name (optional, for the title page/metadata)" />
          <div class="export-options">
            <button id="export-project-docx">Whole project (.docx)</button>
            <button id="export-project-epub">Whole project (.epub)</button>
          </div>
        </div>
    `,
  });

  q('export-chapter-md').addEventListener('click', () => {
    downloadTextFile(`${safeFilename(chapter.title)}.md`, Store.exportChapterText(chapterId));
    closeModal();
  });

  q('export-project-md').addEventListener('click', () => {
    downloadTextFile(`${safeFilename(project.title)}.md`, Store.exportProjectText(project));
    closeModal();
  });

  q('export-project-docx').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const originalLabel = btn.textContent;
    const author = q('manuscript-author-input').value.trim();
    btn.disabled = true;
    btn.textContent = 'Building…';
    try {
      const bytes = exportDocx(project, { author });
      downloadBinaryFile(docxFilename(project), bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      closeModal();
    } catch (err) {
      showStorageWarning(`Word export failed: ${err.message || 'unknown error'}.`);
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

  q('export-project-epub').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const originalLabel = btn.textContent;
    const author = q('manuscript-author-input').value.trim();
    btn.disabled = true;
    btn.textContent = 'Building…'; // resolving every inline/cover image from IndexedDB can take a moment on an image-heavy project
    try {
      const bytes = await exportEpub(project, {
        author,
        getImageBytes: async (id) => {
          const blob = await ImageStore.getBlob(id);
          if (!blob) return null;
          return { bytes: await blob.arrayBuffer(), mime: blob.type || 'image/png' };
        },
      });
      downloadBinaryFile(epubFilename(project), bytes, 'application/epub+zip');
      closeModal();
    } catch (err) {
      showStorageWarning(`EPUB export failed: ${err.message || 'unknown error'}.`);
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsexportmenu-js-93-97

