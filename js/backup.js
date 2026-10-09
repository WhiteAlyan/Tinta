// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-1-33

import * as Store from './store.js';
import * as ImageStore from './imagestore.js';
import * as AssetStore from './assetstore.js';
import * as AutoBackup from './autoBackup.js';
import { requestRender } from './renderBus.js';
import { setActiveView, setActiveChapterId } from './context.js';
import { confirmDialog, closeModal } from './modal.js';
import { showStorageWarning } from './toast.js';
import { downloadTextFile, safeFilename } from './file-utils.js';
import * as Theme from './theme.js';
import { html, raw, toBridge, q, escapeHtml } from './dom-utils.js';
import { exportTintaProject, importTintaProject, checkTintaFile } from './tintaPackage.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-48-52
export async function exportFullBackupWithImages() {
  const db = JSON.parse(Store.exportFullBackup());

  // Every image across every project, not just the active one — a full
  // backup restores everything, the same way the JSON side already does.
  const allImageIds = Object.values(db.projects).flatMap((p) => Object.keys(p.images || {}));
  const uniqueIds = [...new Set(allImageIds)];

  const images = {};
  for (const id of uniqueIds) {
    try {
      const blob = await ImageStore.getBlob(id);
      if (!blob) continue; // metadata exists but the blob is already gone — skip it rather than fail the whole export
      images[id] = { mimeType: blob.type || 'application/octet-stream', base64: await blobToBase64(blob) };
    } catch {
      // One bad blob shouldn't sink the entire backup — that image just
      // won't come back on restore, same "skip and move on" as above.
    }
  }

// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-73-81
  let customFont = null;
  if (db.customFont && db.customFont.fileName) {
    try {
      const fontBlob = await AssetStore.getBlob(AssetStore.KEYS.CUSTOM_FONT);
      if (fontBlob) customFont = { mimeType: fontBlob.type || 'application/octet-stream', base64: await blobToBase64(fontBlob) };
    } catch {
      // Blob store unavailable (private-mode quota quirks, transient IDB
      // errors) — export without the font rather than fail the backup.
    }
  }

// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-93-99
  return JSON.stringify({ tintaBackupVersion: 2, db, images, customFont }, null, 2);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]); // strip the "data:...;base64," prefix
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-119-128
export async function importFullBackupWithImages(jsonText) {
  const parsed = JSON.parse(jsonText);
  // Backward compatible with Session 13-18 backups: those were the raw db
  // object at the top level, no `db`/`images` wrapper at all.
  const isBundled = Boolean(parsed && typeof parsed === 'object' && parsed.db && typeof parsed.db === 'object');
  const dbJson = isBundled ? JSON.stringify(parsed.db) : jsonText;
  const images = isBundled ? parsed.images || {} : {};
  const bundledFont = isBundled ? parsed.customFont || null : null;

// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-138-156
  const previousImageIds = Store.listProjects().flatMap((p) => Store.getProjectImageIds(p));
  const incomingIds = new Set(Object.keys(images));

  Store.importFullBackup(dbJson); // existing Session 13 function — validation, migrate(), save()

  const staleIds = [...new Set(previousImageIds)].filter((id) => !incomingIds.has(id));
  if (staleIds.length) {
    // Best-effort, same as deleteProject's sweep — a blob that fails to
    // delete (private-mode quota quirks, transient IDB errors) leaves an
    // inert orphan rather than failing a restore that otherwise succeeded.
    await ImageStore.deleteBlobs(staleIds).catch(() => {});
  }

  const ids = Object.keys(images);
  let restored = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await ImageStore.putBlob(id, base64ToBlob(images[id].base64, images[id].mimeType));
      restored++;
    } catch {
      failed++;
    }
  }

// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-182-203
  let fontRestored = false;
  const incomingFont = Store.getCustomFont();
  if (incomingFont && incomingFont.fileName) {
    if (bundledFont && bundledFont.base64) {
      try {
        const restoredBlob = base64ToBlob(bundledFont.base64, bundledFont.mimeType);
        await AssetStore.putBlob(AssetStore.KEYS.CUSTOM_FONT, restoredBlob);
        fontRestored = true;
// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-212-219
        try {
          await Theme.registerCustomFont(restoredBlob, incomingFont.family);
        } catch {
          // Next load's initCustomFont() re-registers from the now-restored blob.
        }
      } catch {
        // Counted no-op — same best-effort contract as the image loop.
      }
    }
    // else: bundled shape is v1 (predates font bundle) or bundle is missing
    // bytes — leave local font alone, same "don't silently clobber" reasoning
    // as the legacy-backup branch below.
  } else if (isBundled) {
    // isBundled === true means the backup is from a Tinta that knew about
    // customFont and explicitly had none — local wipe is correct, the
    // incoming db genuinely says "no custom font set."
    await AssetStore.deleteBlob(AssetStore.KEYS.CUSTOM_FONT).catch(() => {});
  }
  // else: legacy backup with no opinion — preserve the user's local font.

  return { imageCount: ids.length, restored, failed, fontRestored };
}

export async function openBackupModal() {
  const root = q('modal-root');
  const sizeKb = Math.round(Store.estimateDbSizeBytes() / 1024);
// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-246-249
  const fsApiSupported = AutoBackup.isAutoBackupSupported();

  root.innerHTML = toBridge(html`
    <div class="modal-backdrop">
      <div class="modal-panel backup-modal">
        <div class="modal-header">
          <h2>Backup &amp; Restore</h2>
          <button id="modal-close" class="modal-close">✕</button>
        </div>

        <div class="backup-section">
          <h3>Export</h3>
          <p class="backup-note">Everything, every project: chapters, entities, relationships, sketches, snippets, timeline, revision history, image files, and your uploaded custom font too. Roughly ${sizeKb} KB of text right now, plus image and font bytes on top. Different from the per-chapter/per-project markdown export, which is prose-only and can't be restored from.</p>
          <button id="backup-export-btn">⇩ Export full backup (.json)</button>
        </div>

        <div class="backup-section">
          <h3>Portable project (.tinta)</h3>
          <p class="backup-note">A single, self-contained file for the active novel: chapters, worldbuilding, and images bundled together. Move it to another laptop, email it to a collaborator, or keep it as a snapshot. Importing it on the other side adds it as a new project (doesn't overwrite anything).</p>
          <button id="tinta-export-btn">⇩ Export "${Store.getActiveProject().title}" as .tinta</button>
          <p class="backup-note" style="margin-top: var(--space-3);">Import a .tinta file from another Tinta:</p>
          <input type="file" id="tinta-import-input" accept=".tinta,application/json,application/zip" />
          <div id="tinta-import-report"></div>
          <div id="tinta-import-error" class="backup-import-error"></div>
        </div>

        ${
          fsApiSupported
            ? html`<div class="backup-section">
                <h3>Auto-backup to folder</h3>
                <p class="backup-note">Pick a folder once and Tinta writes a fresh .tinta of the active project to it on every save: a live snapshot you can pull into another machine, restore from a crash, or hand off to an editor without thinking about it. The first write of each session asks permission; that's the browser, not us.</p>
                <p class="backup-note" id="tinta-autobackup-status">Checking…</p>
                <button id="tinta-autobackup-pick">Pick folder…</button>
                <button id="tinta-autobackup-clear" style="display:none">Stop auto-backup</button>
                <button id="tinta-autobackup-now" style="display:none">Save .tinta to folder now</button>
              </div>`
            : html`<div class="backup-section">
                <h3>Auto-backup to folder</h3>
                <p class="backup-note">Your browser doesn't support the File System Access API, so Tinta can't auto-write a .tinta to a folder for you. Use the manual .tinta export above (Chromium-based browsers: Chrome, Edge, Brave, Arc; Firefox and Safari don't support it yet).</p>
              </div>`
        }

        <div class="backup-section">
          <h3>Restore (full backup)</h3>
          <p class="backup-note">Importing a full backup replaces everything currently saved in this browser: every project, not just the active one. This can't be undone. Backups made before images were included in the export (Session 18 and earlier) still import fine; they just won't have any pictures to restore. The same goes for backups from before the custom font was bundled in — Settings will tell you when the font needs re-uploading.</p>
          <input type="file" id="backup-import-input" accept="application/json,.json" />
          <div id="backup-import-error" class="backup-import-error"></div>
        </div>
      </div>
    </div>
  `);

  q('modal-close').addEventListener('click', closeModal);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });

  q('backup-export-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing backup…'; // base64-encoding every image can take a moment on a project with a lot of them
    try {
      const project = Store.getActiveProject();
      const json = await exportFullBackupWithImages();
      downloadTextFile(`tinta-backup-${safeFilename(project.title)}-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json;charset=utf-8');
    } catch (err) {
      showStorageWarning(`Backup export failed: ${err.message || 'unknown error'}.`);
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-324-328
  q('tinta-export-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing .tinta…';
    try {
      const result = await exportTintaProject();
// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-336-348
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showStorageWarning(`.tinta export failed: ${err.message || 'unknown error'}.`);
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-365-379
  q('tinta-import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const errorEl = q('tinta-import-error');
    const reportEl = q('tinta-import-report');
    errorEl.textContent = '';
    reportEl.innerHTML = '';

    let check;
    try {
      check = await checkTintaFile(file);
    } catch (err) {
      errorEl.textContent = `Couldn't read this file: ${err.message || 'unknown error'}.`;
      e.target.value = '';
      return;
    }

    const runImport = async () => {
      try {
        const result = await importTintaProject(file);
        const next = Store.getActiveProject();
        setActiveChapterId(next.chapters[0]?.id || null);
        setActiveView('write');
        closeModal();
        requestRender();
        const imageNote = result.imageCount > 0
          ? `, including ${result.restoredImages} of ${result.imageCount} image${result.imageCount === 1 ? '' : 's'}${result.failedImages > 0 ? ` (${result.failedImages} couldn't be restored)` : ''}.`
          : '.';
        showStorageWarning(`Imported "${result.projectTitle}" as a new project${imageNote}`);
      } catch (err) {
        errorEl.textContent = err.message || 'Import failed.';
        e.target.value = '';
      }
    };

    if (!check.valid) {
      reportEl.innerHTML = toBridge(html`
        <div class="tinta-check-report tinta-check-invalid">
          <p><strong>This file can't be imported:</strong></p>
          <ul>${raw(check.errors.map((err) => `<li>${escapeHtml(err.message)}</li>`).join(''))}</ul>
        </div>
      `);
      e.target.value = '';
      return;
    }

    const s = check.summary;
    reportEl.innerHTML = toBridge(html`
      <div class="tinta-check-report tinta-check-valid">
        <p>Ready to import <strong>"${s?.projectTitle || 'this project'}"</strong> · ${s?.chapterCount ?? '?'} chapter${s?.chapterCount === 1 ? '' : 's'}, ${s?.entityCount ?? '?'} entit${s?.entityCount === 1 ? 'y' : 'ies'}${s?.imageCount ? `, ${s.imageCount} image${s.imageCount === 1 ? '' : 's'}` : ''}.</p>
        ${check.warnings.length > 0 ? html`<ul class="tinta-check-warnings">${raw(check.warnings.map((w) => `<li>${escapeHtml(w.message)}</li>`).join(''))}</ul>` : ''}
        <button id="tinta-import-confirm-btn">Import "${s?.projectTitle || 'project'}"</button>
      </div>
    `);
    q('tinta-import-confirm-btn').addEventListener('click', runImport);
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-437-441
  const autoPickBtn = q('tinta-autobackup-pick');
  const autoClearBtn = q('tinta-autobackup-clear');
  const autoNowBtn = q('tinta-autobackup-now');
  const autoStatusEl = q('tinta-autobackup-status');

  if (autoPickBtn) {
    // Refresh the auto-backup status line on render — the persisted
    // folder handle is async to read.
    const refreshAutoStatus = async () => {
      const handle = await AutoBackup.getBackupFolderHandle();
      if (!handle) {
        autoStatusEl.textContent = 'No folder picked yet.';
        autoPickBtn.style.display = '';
        autoClearBtn.style.display = 'none';
        autoNowBtn.style.display = 'none';
      } else {
        autoStatusEl.textContent = `Backing up to: ${handle.name}`;
        autoPickBtn.style.display = 'none';
        autoClearBtn.style.display = '';
        autoNowBtn.style.display = '';
      }
    };
    refreshAutoStatus();

    autoPickBtn.addEventListener('click', async () => {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await AutoBackup.setBackupFolderHandle(handle);
// Historical context: see docs/CODEBASE_NOTES.md#jsbackup-js-470-473
        refreshAutoStatus();
        // Trigger one immediate .tinta write so the writer sees
        // something in the folder right away rather than waiting for
        // the next autosave debounce.
        const result = await AutoBackup.writeTintaToBackupFolder();
        if (!result.ok) {
          showStorageWarning(`Picked the folder, but couldn't write the first .tinta to it: ${result.error}`);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          showStorageWarning(`Couldn't pick a folder: ${err.message || 'unknown error'}.`);
        }
        // AbortError is the writer canceling the picker — silent.
      }
    });

    autoClearBtn.addEventListener('click', async () => {
      await AutoBackup.clearBackupFolderHandle();
      refreshAutoStatus();
    });

    autoNowBtn.addEventListener('click', async () => {
      const result = await AutoBackup.writeTintaToBackupFolder();
      if (result.ok) {
        showStorageWarning(`Wrote ${result.filename} to your backup folder.`);
      } else {
        showStorageWarning(`Couldn't write .tinta to folder: ${result.error}`);
      }
    });
  }

  q('backup-import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const errorEl = q('backup-import-error');
    errorEl.textContent = '';

    if (!(await confirmDialog({ title: 'Restore this backup?', message: 'This replaces everything currently saved in this browser. Continue?', confirmLabel: 'Replace everything', danger: true }))) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { imageCount, restored, failed, fontRestored } = await importFullBackupWithImages(String(reader.result));
        const next = Store.getActiveProject();
        setActiveChapterId(next.chapters[0]?.id || null);
        setActiveView('write');
        closeModal();
        requestRender();
        if (imageCount > 0) {
          showStorageWarning(
            failed > 0
              ? `Backup restored. ${restored} of ${imageCount} images came back; ${failed} couldn't be restored.${fontRestored ? ' Your custom font came back too.' : ''}`
              : `Backup restored, including ${restored} image${restored === 1 ? '' : 's'}${fontRestored ? ' and your custom font' : ''}.`
          );
        } else if (fontRestored) {
          showStorageWarning('Backup restored, including your custom font.');
        }
      } catch (err) {
        errorEl.textContent = err.message || 'Import failed.';
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      errorEl.textContent = "Couldn't read that file.";
      e.target.value = '';
    };
    reader.readAsText(file);
  });
}
