// Historical context: see docs/CODEBASE_NOTES.md#jsimagelibrary-js-1-4
import * as Format from './format.js';
import * as ImageStore from './imagestore.js';
import * as ModalShell from './modal.js';
import * as Store from './store.js';
import { activeTextareaEl } from './context.js';
import { html, q, toBridge } from './dom-utils.js';
import { applyFormatToggle } from './editor.js';
import { closeModal, confirmDialog, openModal } from './modal.js';
import { showStorageWarning } from './toast.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsimagelibrary-js-15-20
export let imageLibraryUrls = [];
// Historical context: see docs/CODEBASE_NOTES.md#jsimagelibrary-js-22-28
export let imageLibraryMode = 'insert';
export let imageLibraryOnSelect = null;
// Historical context: see docs/CODEBASE_NOTES.md#jsimagelibrary-js-31-34
export let imageLibraryCurrentImageId = null;
// Cozy pass — set alongside mode === 'entity': which entity the library is
// currently adding gallery images to. Only meaningful in that mode.
export let imageLibraryEntityId = null;

// Historical context: see docs/CODEBASE_NOTES.md#jsimagelibrary-js-40-45

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // generous but not unlimited — IndexedDB doesn't have localStorage's tight quota, but "accept anything" is still asking for trouble.
export const MAX_COVER_IMAGE_BYTES = 50 * 1024 * 1024; // covers are a single hero image per project (not dozens like inline art), so a bigger ceiling is safe.

// Exported for the extracted view modules (v0.2 Pass 3) — mapView.js and
// referencesView.js both open the Image Library for their background/image
// pickers, same shape as the closeModal/capitalize exports above.
export function openImageLibrary(opts = {}) {
  const { mode = 'insert', onSelect = null, entityId = null, title = null, currentImageId = null } = opts;
  imageLibraryMode = mode;
  imageLibraryOnSelect = onSelect;
  imageLibraryEntityId = entityId;
  imageLibraryCurrentImageId = currentImageId;

// Historical context: see docs/CODEBASE_NOTES.md#jsimagelibrary-js-60-71
  ModalShell.openModal({
    title: title || (mode === 'cover' ? 'Set Cover Image' : mode === 'map' ? 'Set Map Background' : 'Image Library'),
    className: 'image-library-modal',
    body: `
      <label id="image-upload-drop" class="image-upload-drop" for="image-upload-input">
        <span>⇧ Click to upload, or drag images here</span>
        <input type="file" id="image-upload-input" accept="image/*" multiple hidden />
      </label>
      <div id="image-library-grid" class="image-library-grid">
        <p class="empty-note">Loading…</p>
      </div>
    `,
    onClose: () => {
      imageLibraryUrls.forEach((url) => URL.revokeObjectURL(url));
      imageLibraryUrls = [];
      imageLibraryMode = 'insert';
      imageLibraryOnSelect = null;
      imageLibraryEntityId = null;
    },
  });

  const dropZone = q('image-upload-drop');
  q('image-upload-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file later
    for (const file of files) await uploadImage(file);
    renderImageLibraryGrid();
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer?.files || []);
    for (const file of files) await uploadImage(file);
    renderImageLibraryGrid();
  });

  renderImageLibraryGrid();
}

export async function uploadImage(file) {
  if (!file.type.startsWith('image/')) {
    showStorageWarning(`"${file.name}" doesn't look like an image (${file.type || 'unknown type'}). Skipped.`);
    return;
  }
  // Cover mode gets a higher ceiling — it's one hero image per project, not
  // dozens of inline illustrations, so the usual per-image cap is overly
  // strict for it specifically.
  const limit = imageLibraryMode === 'cover' ? MAX_COVER_IMAGE_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    showStorageWarning(`"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB, over the ${limit / (1024 * 1024)}MB limit. Skipped.`);
    return;
  }
  const id = 'img_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  try {
    await ImageStore.putBlob(id, file);
    Store.createImageMeta({ id, caption: '', width: 100 });
  } catch (err) {
    showStorageWarning(`Couldn't save "${file.name}": ${err.message || 'unknown error'}.`);
  }
}

export function renderImageLibraryGrid() {
  const grid = q('image-library-grid');
  if (!grid) return; // modal was closed before an async upload finished
  const images = Store.listImages();

  if (images.length === 0) {
    grid.innerHTML = toBridge(html`<p class="empty-note">No images yet. Upload one above.</p>`);
    return;
  }

  const isCoverMode = imageLibraryMode === 'cover';
  const isEntityMode = imageLibraryMode === 'entity';
  const isMapMode = imageLibraryMode === 'map';
  const currentCoverId = isCoverMode ? Store.getActiveProject().coverImageId : null;
  const galleryEntity = isEntityMode ? Store.getEntity(imageLibraryEntityId) : null;

  grid.innerHTML = toBridge(html`${images.map((img) => {
      const inGallery = isEntityMode && galleryEntity?.imageIds.includes(img.id);
      const isCurrentMapImage = isMapMode && img.id === imageLibraryCurrentImageId;
      const isHighlighted = img.id === currentCoverId || inGallery || isCurrentMapImage;
      const actionButton = isCoverMode
        ? html`<button class="image-cover-btn">${img.id === currentCoverId ? '✓ Current cover' : 'Set as Cover'}</button>`
        : isEntityMode
          ? html`<button class="image-entity-add-btn">${inGallery ? '✓ In gallery' : '+ Add to gallery'}</button>`
          : isMapMode
            ? html`<button class="image-map-select-btn">${isCurrentMapImage ? '✓ Current background' : 'Use as background'}</button>`
            : html`
        <select class="image-align-select">
          <option value="center">Center</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
        <button class="image-insert-btn">Insert</button>`;
      return html`
    <div class="image-card${isHighlighted ? ' is-current-cover' : ''}" data-image="${img.id}">
      <div class="image-thumb-wrap"><span class="image-thumb-loading">Loading…</span></div>
      <input type="text" class="image-caption-input" placeholder="Caption" value="${img.caption}" />
      <div class="image-card-row">
        ${actionButton}
        <button class="image-delete-btn" title="Delete image">✕</button>
      </div>
    </div>`;
    })}`);

  // Thumbnails resolve progressively — each card gets its <img> as soon as
  // its own blob loads, rather than blocking the whole grid on all of them.
  images.forEach(async (img) => {
    const thumbWrap = grid.querySelector(`.image-card[data-image="${img.id}"] .image-thumb-wrap`);
    try {
      const url = await ImageStore.getObjectUrl(img.id);
// Historical context: see docs/CODEBASE_NOTES.md#jsimagelibrary-js-188-193
      if (url) imageLibraryUrls.push(url);
      if (!thumbWrap) return; // grid was re-rendered before this resolved
      if (url) {
        thumbWrap.innerHTML = toBridge(html`<img src="${url}" alt="${img.caption}" class="image-thumb" />`);
      } else {
        thumbWrap.innerHTML = toBridge(html`<span class="image-thumb-missing">Blob missing</span>`);
      }
    } catch {
      if (thumbWrap) thumbWrap.innerHTML = toBridge(html`<span class="image-thumb-missing">Failed to load</span>`);
    }
  });

  grid.querySelectorAll('.image-card').forEach((card) => {
    const id = card.dataset.image;

    card.querySelector('.image-caption-input').addEventListener('change', (e) => {
      Store.updateImageMeta(id, { caption: e.target.value });
    });

    if (isCoverMode) {
      card.querySelector('.image-cover-btn').addEventListener('click', () => {
        Store.setCoverImage(id);
// Historical context: see docs/CODEBASE_NOTES.md#jsimagelibrary-js-216-219
        const onSelect = imageLibraryOnSelect;
        closeModal();
        if (onSelect) onSelect(id);
      });
    } else if (isEntityMode) {
// Historical context: see docs/CODEBASE_NOTES.md#jsimagelibrary-js-225-230
      card.querySelector('.image-entity-add-btn').addEventListener('click', () => {
        Store.addEntityImage(imageLibraryEntityId, id);
        renderImageLibraryGrid();
        imageLibraryOnSelect?.(id);
      });
    } else if (isMapMode) {
      // Same single-select-then-close shape as cover mode above — a map
      // has exactly one background image at a time.
      card.querySelector('.image-map-select-btn').addEventListener('click', () => {
        const onSelect = imageLibraryOnSelect;
        closeModal();
        if (onSelect) onSelect(id);
      });
    } else {
      card.querySelector('.image-insert-btn').addEventListener('click', async () => {
        if (!activeTextareaEl) {
          showStorageWarning('Open a chapter in Write view first, then insert an image.');
          return;
        }
        const align = card.querySelector('.image-align-select').value;
        const token = Format.buildImageToken(id, align === 'center' ? null : align);
        const ta = activeTextareaEl;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? ta.value.length;
        const newText = ta.value.slice(0, start) + token + ta.value.slice(end);
        applyFormatToggle(ta, { text: newText, selStart: start + token.length, selEnd: start + token.length });
        closeModal();
      });
    }

    card.querySelector('.image-delete-btn').addEventListener('click', async () => {
      // The old confirmation shrugged at broken references ("any chapter
      // still referencing it will show a broken-image placeholder"). That's
      // a safe fallback, not an informed choice — a writer can't weigh a
      // delete they can't see the consequences of. Show exactly where the
      // image is used, then let them decide.
      const usage = Store.findImageUsage(id);
      const usageList = usage.slice(0, 8).map((u) => `\n  • ${u.label}`).join('');
      const overflow = usage.length > 8 ? `\n  • …and ${usage.length - 8} more` : '';
      const message = usage.length
        ? `Used in ${usage.length} place${usage.length === 1 ? '' : 's'}:${usageList}${overflow}\n\nDeleting it leaves a broken-image placeholder in each of those. This can't be undone.`
        : 'Nothing currently references this image, so deleting it is safe.';
      if (!(await ModalShell.confirmDialog({ title: 'Delete this image?', message, confirmLabel: 'Delete', danger: true }))) return;

      // Metadata always goes — it's this project's own record. The BLOB is
      // shared storage, so it only goes when no other project still points
      // at it. Imports mint fresh image ids now, so collisions can't be
      // created going forward; this guard protects dbs that already
      // double-imported before that fix landed.
      const sharedWithOtherProject = Store.isImageUsedByOtherProjects(id);
      Store.deleteImageMeta(id);
      if (!sharedWithOtherProject) await ImageStore.deleteBlob(id);
      renderImageLibraryGrid();
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsimagelibrary-js-270-284
