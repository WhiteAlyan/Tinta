// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-1-5
import * as ImageStore from './imagestore.js';
import * as ModalShell from './modal.js';
import * as Store from './store.js';
import { setActiveChapterId, setActiveView } from './context.js';
import { bindOutsideClick, escapeAttr, escapeHtml, html, q, toBridge } from './dom-utils.js';
import { openImageLibrary } from './imageLibrary.js';
import { confirmDialog, onModalCloseCleanup, openModal, promptDialog } from './modal.js';
import { firstOpenChapterId, switchToProjectFromLibrary, teardownLiveStateForProjectSwitch } from './projectSwitch.js';


// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-16-19
export function registerLibraryCleanup() {
  onModalCloseCleanup((wasOpen) => {
    libraryCoverUrls.forEach((url) => URL.revokeObjectURL(url));
    libraryCoverUrls = [];
    if (wasOpen) {
      libraryFilters = { storyType: new Set(), genre: new Set(), language: new Set() };
    }
    document.removeEventListener('click', closeLibraryMenusOnOutsideClick);
  });
}
// Cozy pass — object URLs resolved for Library card cover art. Same
// revoke-in-closeModal() reasoning as imageLibraryUrls/bookModeUrls above:
// one cleanup site instead of one per way the Library can be dismissed.
export let libraryCoverUrls = [];
// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-34-41
export let libraryFilters = { storyType: new Set(), genre: new Set(), language: new Set() };

export const LIBRARY_FILTER_FIELDS = [
  { key: 'storyType', label: 'Type' },
  { key: 'genre', label: 'Genre' },
  { key: 'language', label: 'Language' },
];

export function hasActiveLibraryFilters() {
  return LIBRARY_FILTER_FIELDS.some((f) => libraryFilters[f.key].size > 0);
}

// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-54-58
export function matchesLibraryFilters(project) {
  return LIBRARY_FILTER_FIELDS.every((f) => {
    const active = libraryFilters[f.key];
    if (active.size === 0) return true;
    return active.has((project[f.key] || '').trim());
  });
}

export function libraryFilterBarHtml() {
  const groups = LIBRARY_FILTER_FIELDS.map((f) => {
    const values = Store.getDistinctProjectValues(f.key);
    if (!values.length) return ''; // nobody's filled this field in yet — nothing to chip on
    const chips = values
      .map((v) => {
        const active = libraryFilters[f.key].has(v);
        return `<button class="library-filter-chip${active ? ' is-active' : ''}" data-filter-field="${f.key}" data-filter-value="${escapeAttr(v)}">${escapeHtml(v)}</button>`;
      })
      .join('');
    return `<div class="library-filter-group"><span class="library-filter-label">${f.label}</span>${chips}</div>`;
  }).join('');

  if (!groups) return ''; // no metadata anywhere in the Library yet — filter row would just be empty chrome

  return `
    <div class="library-filter-bar" id="library-filter-bar">
      ${groups}
      ${hasActiveLibraryFilters() ? '<button class="library-filter-clear" id="library-filter-clear">Clear filters</button>' : ''}
    </div>
  `;
}

export function openLibrary() {
  const allProjects = Store.listProjects();
  const projects = allProjects.filter(matchesLibraryFilters);
  const activeId = Store.getActiveProject().id;
  const canDelete = allProjects.length > 1;

  const root = ModalShell.openModal({
    title: 'Library',
    className: 'library-drawer',
    body: `
        ${libraryFilterBarHtml()}
        <div class="library-grid" id="library-grid">
          ${
            projects.length
              ? projects.map((p) => libraryCardHtml(p, p.id === activeId, canDelete)).join('')
              : '<p class="library-empty-state">Nothing matches those filters. Try clearing one.</p>'
          }
          <button class="library-new-card" id="library-new-btn">
            <span class="library-new-plus">+</span>
            <span>New novel</span>
          </button>
        </div>
    `,
  });
// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-114-118
  root.querySelector('.modal-backdrop').classList.add('library-backdrop');

  resolveLibraryCovers(projects);
  wireLibraryGrid();
  wireLibraryFilterBar();

  q('library-new-btn').addEventListener('click', () => {
    Store.createProject('Untitled Novel');
    openLibrary(); // refresh in place — same pattern the old switcher used after delete/create
  });
}

export function wireLibraryFilterBar() {
  const bar = q('library-filter-bar');
  if (!bar) return;
  bar.querySelectorAll('.library-filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const { filterField, filterValue } = chip.dataset;
      const set = libraryFilters[filterField];
      if (set.has(filterValue)) set.delete(filterValue);
      else set.add(filterValue);
      openLibrary(); // re-render with the narrowed (or widened) shelf
    });
  });
  const clearBtn = q('library-filter-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      LIBRARY_FILTER_FIELDS.forEach((f) => libraryFilters[f.key].clear());
      openLibrary();
    });
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-152-157
export function libraryCardTagsHtml(project) {
  const parts = [project.storyType, project.genre, project.language]
    .map((v) => (v || '').trim())
    .filter(Boolean);
  if (!parts.length) return '';
  return `<div class="library-card-tags">${parts.map((p) => `<span>${escapeHtml(p)}</span>`).join('<span aria-hidden="true">·</span>')}</div>`;
}

export function libraryCardHtml(project, isActive, canDelete) {
  const words = Store.getTotalWordCount(project);
  const goal = project.wordGoal || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((words / goal) * 100)) : null;
  const counts = { draft: 0, revised: 0, final: 0 };
  project.chapters.forEach((c) => {
    if (counts[c.status] !== undefined) counts[c.status] += 1;
  });
  const lastEdited = project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : '';
// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-175-183
  const startedSource = project.startedAt || project.createdAt?.slice(0, 10) || null;
  const startedLabel = startedSource ? formatDateOnly(startedSource) : '';

  return `
    <div class="library-card${isActive ? ' is-active' : ''}" data-project="${project.id}">
      <div class="library-card-menu-wrap">
        <button class="library-card-menu-btn" data-menu-toggle="${project.id}" title="More">⋯</button>
        <div class="library-card-menu hidden" id="library-menu-${project.id}">
          <button class="library-menu-item" data-action="details" data-project="${project.id}">📝 Details</button>
          <button class="library-menu-item" data-action="cover" data-project="${project.id}">🖼 Set cover</button>
          <button class="library-menu-item" data-action="rename" data-project="${project.id}">✎ Rename</button>
          <button class="library-menu-item" data-action="series" data-project="${project.id}">🔗 Series</button>
          ${canDelete ? `<button class="library-menu-item library-menu-danger" data-action="delete" data-project="${project.id}">✕ Delete</button>` : ''}
        </div>
      </div>
      <div class="library-cover" data-cover-for="${project.id}">
        ${
          project.coverImageId
            ? '<span class="library-cover-loading"></span>'
            : `<span class="library-cover-fallback-title">${escapeHtml(project.title)}</span>`
        }
      </div>
      <div class="library-card-body">
        <strong class="library-card-title">${escapeHtml(project.title)}</strong>
        ${project.seriesId && Store.getSeries(project.seriesId) ? `<div class="library-card-series">🔗 ${escapeHtml(Store.getSeries(project.seriesId).title)}</div>` : ''}
        ${libraryCardTagsHtml(project)}
        <div class="library-card-meta">
          <span>${project.chapters.length} chapter${project.chapters.length === 1 ? '' : 's'}</span>
          <span aria-hidden="true">·</span>
          <span>${words.toLocaleString()} words${goal ? ` / ${goal.toLocaleString()}` : ''}</span>
          ${startedLabel ? `<span aria-hidden="true">·</span><span title="${project.startedAt ? 'Story started' : 'Project created'}">Since ${startedLabel}</span>` : ''}
        </div>
        ${pct !== null ? `<div class="library-goal-bar"><div class="library-goal-fill" style="width:${pct}%"></div></div>` : ''}
        <div class="library-card-bottom">
          <span class="library-status-mix" title="${counts.draft} draft · ${counts.revised} revised · ${counts.final} final">
            <span class="status-dot dot-draft"></span>${counts.draft}
            <span class="status-dot dot-revised"></span>${counts.revised}
            <span class="status-dot dot-final"></span>${counts.final}
          </span>
          <span class="library-last-edited">${lastEdited}</span>
        </div>
      </div>
      ${isActive ? '<span class="library-current-badge">Current</span>' : ''}
    </div>
  `;
}

// Cover thumbnails resolve progressively, same reasoning as the Image
// Library grid (renderImageLibraryGrid) — one project's blob loading
// shouldn't block the rest of the shelf from painting.
async function resolveLibraryCovers(projects) {
  projects
    .filter((p) => p.coverImageId)
    .forEach(async (p) => {
      const wrap = document.querySelector(`.library-cover[data-cover-for="${p.id}"]`);
      try {
        const url = await ImageStore.getObjectUrl(p.coverImageId);
        if (!wrap) return; // Library was closed/refreshed before this resolved
        if (url) {
          libraryCoverUrls.push(url);
          wrap.innerHTML = toBridge(html`<img src="${url}" alt="" class="library-cover-img" />`);
        } else {
          wrap.innerHTML = toBridge(html`<span class="library-cover-fallback-title">${p.title}</span>`);
        }
      } catch {
        if (wrap) wrap.innerHTML = toBridge(html`<span class="library-cover-fallback-title">${p.title}</span>`);
      }
    });
}

export function wireLibraryGrid() {
  const grid = q('library-grid');
  if (!grid) return;

  // ── card body click → full switch into that novel's workspace ──────────
  grid.querySelectorAll('.library-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      // The ⋯ button and its popover handle their own clicks (stopPropagation
      // below) — this only fires for clicks on the card itself.
      const projectId = card.dataset.project;
      switchToProjectFromLibrary(projectId);
    });
  });

  // ── per-card ⋯ menu: toggle open/closed, same outside-click/Escape-closes
  // pattern as format-color-menu/details-popover/more-menu ─────────────────
  grid.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.menuToggle;
      const menu = q(`library-menu-${id}`);
      const wasHidden = menu.classList.contains('hidden');
      // Close any other open menu first — only one card's ⋯ menu should be
      // open at a time.
      grid.querySelectorAll('.library-card-menu').forEach((m) => m.classList.add('hidden'));
      menu.classList.toggle('hidden', !wasHidden);
    });
  });
// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-282-293
  bindOutsideClick(closeLibraryMenusOnOutsideClick);
  grid.querySelectorAll('.library-menu-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { action, project: projectId } = item.dataset;
      const project = Store.listProjects().find((p) => p.id === projectId);
      if (!project) return;

      if (action === 'details') {
        openLibraryDetails(project);
        return;
      }

      if (action === 'cover') {
        openImageLibrary({
          mode: 'cover',
          onSelect: () => openLibrary(), // refresh the card grid with the new cover
        });
        return;
      }

      if (action === 'rename') {
        // Dialogs pass — native prompt() → themed promptDialog, same raw
        // string/null contract (cancel stays null; empty falls back to the
        // current title below exactly as before).
        const next = await ModalShell.promptDialog({
          title: 'Rename novel',
          defaultValue: project.title,
          okLabel: 'Rename',
        });
        if (next === null) return; // cancelled
        const title = next.trim() || project.title;
        if (project.id === Store.getActiveProject().id) {
          Store.updateProjectMeta({ title });
        } else {
// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-329-332
          const currentId = Store.getActiveProject().id;
          Store.switchProject(projectId);
          Store.updateProjectMeta({ title });
          Store.switchProject(currentId);
        }
        openLibrary(); // refresh title in place
        return;
      }

      if (action === 'series') {
        openSeriesManager(project);
        return;
      }

      if (action === 'delete') {
        if (!(await ModalShell.confirmDialog({ title: 'Delete this project?', message: `Delete "${project.title}"? This can't be undone: everything in it (chapters, notes, canvas, sketches, timeline, images) goes with it.`, confirmLabel: 'Delete project', danger: true }))) return;
        const wasActive = projectId === Store.getActiveProject().id;
// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-350-353
        const imageIds = Store.getProjectImageIds(project);
        if (project.coverImageId) imageIds.push(project.coverImageId);
        Store.deleteProject(projectId);
        if (imageIds.length) {
          ImageStore.deleteBlobs(imageIds).catch(() => {
            // Best-effort — a stray orphaned blob isn't worth interrupting
            // the delete flow the user already confirmed.
          });
        }
        if (wasActive) {
          teardownLiveStateForProjectSwitch();
          const next = Store.getActiveProject();
          setActiveChapterId(firstOpenChapterId(next));
          setActiveView('write');
        }
        openLibrary(); // refresh the grid in place
      }
    });
  });
}

export function closeLibraryMenusOnOutsideClick(e) {
  if (e.target.closest('.library-card-menu-wrap')) return;
  document.querySelectorAll('.library-card-menu').forEach((m) => m.classList.add('hidden'));
}

// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-380-389
export function openLibraryDetails(project) {
  const typeOptions = Store.getDistinctProjectValues('storyType');
  const genreOptions = Store.getDistinctProjectValues('genre');
  const langOptions = Store.getDistinctProjectValues('language');

  const datalist = (id, values) =>
    values.length ? `<datalist id="${id}">${values.map((v) => `<option value="${escapeAttr(v)}"></option>`).join('')}</datalist>` : '';

// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-398-402
  ModalShell.openModal({
    title: `Details · ${escapeHtml(project.title)}`,
    className: 'library-details-modal',
    body: `
        <label class="grammar-field-label">Story type
          <input type="text" id="details-storytype" list="details-storytype-list" value="${escapeAttr(project.storyType)}" placeholder="Fiction, Fanfic, Nonfiction, Poetry…" />
        </label>
        ${datalist('details-storytype-list', typeOptions)}
        <label class="grammar-field-label">Genre
          <input type="text" id="details-genre" list="details-genre-list" value="${escapeAttr(project.genre)}" placeholder="Fantasy, Romance, Thriller…" />
        </label>
        ${datalist('details-genre-list', genreOptions)}
        <label class="grammar-field-label">Language
          <input type="text" id="details-language" list="details-language-list" value="${escapeAttr(project.language)}" placeholder="English, Tagalog, Taglish…" />
        </label>
        ${datalist('details-language-list', langOptions)}
        <label class="grammar-field-label">Story started
          <input type="date" id="details-started" value="${project.startedAt ? escapeAttr(project.startedAt) : ''}" max="${new Date().toISOString().slice(0, 10)}" />
        </label>
        <p class="settings-note" style="margin-top: -8px;">When the story itself began, not when you added it to Tinta. Leave blank to just show when this project was created here instead.</p>
        <label class="grammar-field-label">Blurb / synopsis
          <textarea id="details-blurb" rows="6" placeholder="What's this one about?">${escapeHtml(project.blurb)}</textarea>
        </label>
        <div class="grammar-settings-actions">
          <button id="details-save">Save</button>
        </div>
    `,
    onClose: () => openLibrary(),
  });

  q('details-save').addEventListener('click', () => {
    const patch = {
      storyType: q('details-storytype').value.trim(),
      genre: q('details-genre').value.trim(),
      language: q('details-language').value.trim(),
      startedAt: q('details-started').value || null,
      blurb: q('details-blurb').value,
    };
// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-441-444
    if (project.id === Store.getActiveProject().id) {
      Store.updateProjectMeta(patch);
    } else {
      const currentId = Store.getActiveProject().id;
      Store.switchProject(project.id);
      Store.updateProjectMeta(patch);
      Store.switchProject(currentId);
    }
// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-453-459
    ModalShell.teardown();
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-464-474
export function withProjectContext(project, fn) {
  const currentId = Store.getActiveProject().id;
  const needsSwitch = project.id !== currentId;
  if (needsSwitch) Store.switchProject(project.id);
  const result = fn();
  if (needsSwitch) Store.switchProject(currentId);
  return result;
}

export function openSeriesManager(project) {
  const series = project.seriesId ? Store.getSeries(project.seriesId) : null;
  const otherSeries = Store.listSeries().filter((s) => s.id !== project.seriesId);
  let entityCount = 0;

  let body;
  if (!series) {
    body = `
      <p class="drawer-subtitle">"${escapeHtml(project.title)}" is a standalone novel right now.</p>
      ${
        otherSeries.length
          ? `<label class="grammar-field-label">Join an existing series
              <select id="series-join-select" class="status-select">
                ${otherSeries.map((s) => `<option value="${s.id}">${escapeHtml(s.title)} (${s.memberProjectIds.length} book${s.memberProjectIds.length === 1 ? '' : 's'})</option>`).join('')}
              </select>
            </label>
            <button id="series-join-btn" class="add-scene-btn">Join series</button>
            <div style="margin:var(--space-4) 0; text-align:center; color:var(--ink-3);">or</div>`
          : ''
      }
      <label class="grammar-field-label">Start a new series
        <input type="text" id="series-new-name" placeholder="e.g. The Ashvale Chronicles" />
      </label>
      <button id="series-new-btn" class="add-scene-btn">Create series &amp; add this book</button>
    `;
  } else {
    const members = series.memberProjectIds
      .map((id) => Store.listProjects().find((p) => p.id === id))
      .filter(Boolean);
    entityCount = withProjectContext(project, () => Store.getSeriesEntityList().length);
    body = `
      <label class="grammar-field-label">Series name
        <input type="text" id="series-rename-input" value="${escapeAttr(series.title)}" />
      </label>
      <p class="drawer-subtitle" style="margin-top:var(--space-3);">${entityCount} shared entit${entityCount === 1 ? 'y' : 'ies'}. Add or promote entities from the Notes view.</p>
      <div class="notes-group" style="margin-top:var(--space-3);">
        <h4>Books in this series</h4>
        <ul class="notes-entity-list">
          ${members.map((m) => `<li class="notes-entity-item">${escapeHtml(m.title)}${m.id === project.id ? ' <span class="drawer-subtitle">(this book)</span>' : ''}</li>`).join('')}
        </ul>
      </div>
      <button id="series-leave-btn" class="wt-menu-item library-menu-danger" style="text-align:left; padding-left:0; margin-top:var(--space-3);">Remove "${escapeHtml(project.title)}" from this series</button>
      ${
        members.length <= 1
          ? `<button id="series-delete-btn" class="wt-menu-item library-menu-danger" style="text-align:left; padding-left:0;">Delete series entirely (${entityCount} shared entit${entityCount === 1 ? 'y' : 'ies'} will be lost)</button>`
          : ''
      }
    `;
  }

  ModalShell.openModal({
    title: `Series · ${escapeHtml(project.title)}`,
    body,
  });

  if (!series) {
    if (q('series-join-btn')) {
      q('series-join-btn').addEventListener('click', () => {
        const seriesId = q('series-join-select').value;
        withProjectContext(project, () => Store.addActiveProjectToSeries(seriesId));
        openSeriesManager(Store.listProjects().find((p) => p.id === project.id));
      });
    }
    q('series-new-btn').addEventListener('click', () => {
      const name = q('series-new-name').value.trim();
      if (!name) return;
      const newSeries = Store.createSeries(name);
      withProjectContext(project, () => Store.addActiveProjectToSeries(newSeries.id));
      openSeriesManager(Store.listProjects().find((p) => p.id === project.id));
    });
  } else {
    q('series-rename-input').addEventListener('change', (e) => {
      Store.renameSeries(series.id, e.target.value);
    });
    q('series-leave-btn').addEventListener('click', async () => {
      if (!(await ModalShell.confirmDialog({ title: 'Leave this series?', message: `Remove "${project.title}" from "${series.title}"? Shared entities stay with the series for its other books.`, confirmLabel: 'Remove book', danger: false }))) return;
      withProjectContext(project, () => Store.removeActiveProjectFromSeries());
      openLibrary();
    });
    const deleteBtn = q('series-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!(await ModalShell.confirmDialog({ title: 'Delete this series?', message: `Delete "${series.title}" entirely? Its ${entityCount} shared entit${entityCount === 1 ? 'y' : 'ies'} can't be recovered. Member books themselves are untouched.`, confirmLabel: 'Delete series', danger: true }))) return;
        Store.deleteSeries(series.id);
        openLibrary();
      });
    }
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jslibrary-js-574-593

export function formatDateOnly(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}
