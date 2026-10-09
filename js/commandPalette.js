// commandPalette (0.2.7 move-out) — the ⌘K quick-switcher (chapters,
// entities, projects, recent activity, commands).
//
import * as Commands from './commands.js';
import * as ModalShell from './modal.js';
import * as Palette from './palette.js';
import * as Store from './store.js';
import { setActiveChapterId, setActiveEntityId, setActiveView } from './context.js';
import { html, q, toBridge } from './dom-utils.js';
import { closeModal, openModal } from './modal.js';
import { firstOpenChapterId, teardownLiveStateForProjectSwitch } from './projectSwitch.js';
import { requestRender } from './renderBus.js';

// Historical context: see docs/CODEBASE_NOTES.md#jscommandpalette-js-14-20

export function openCommandPalette() {
  const activeProject = Store.getActiveProject();
  let selectedIndex = 0;
  let currentResults = [];

  const root = ModalShell.openModal({
    className: 'palette-modal',
    showHeader: false,
    body: `
      <input type="text" id="palette-query" class="palette-input" placeholder="Jump to a chapter, entity, or project…" autocomplete="off" />
      <div id="palette-results" class="palette-results"></div>
    `,
  });
// Historical context: see docs/CODEBASE_NOTES.md#jscommandpalette-js-35-41
  root.querySelector('.modal-backdrop').classList.add('palette-backdrop');

  const input = q('palette-query');
  const resultsEl = q('palette-results');

  // Built once per palette open, not per keystroke — chapters/entities/
  // projects don't change while the palette is up, so there's no reason to
  // re-fetch from Store on every character typed.
  const index = [
// Historical context: see docs/CODEBASE_NOTES.md#jscommandpalette-js-51-54
    ...activeProject.chapters.filter((c) => !c.trashedAt).map((c) => ({
      kind: 'chapter',
      label: c.title,
      sublabel: 'Chapter',
      action: () => {
        setActiveChapterId(c.id);
        setActiveView('write');
      },
    })),
    ...Store.getEntityList().map((e) => ({
      kind: 'entity',
      label: e.name,
      sublabel: e.type,
      action: () => {
        setActiveEntityId(e.id);
        setActiveView('notes');
      },
    })),
    ...Store.listProjects().map((p) => ({
      kind: 'project',
      label: p.title,
      sublabel: p.id === activeProject.id ? 'Current project' : 'Project',
      action: () => {
        if (p.id !== activeProject.id) {
// Historical context: see docs/CODEBASE_NOTES.md#jscommandpalette-js-79-84
          teardownLiveStateForProjectSwitch();
          Store.switchProject(p.id);
          const next = Store.getActiveProject();
          setActiveChapterId(firstOpenChapterId(next));
        }
        setActiveView('write');
      },
    })),
    // Command registry rows (Undo/Redo today) — fuzzy-match alongside
    // chapters/entities/projects. Empty-query default stays recent activity
    // only; commands appear when the writer actually types.
    ...Commands.getPaletteCommands(),
  ];

  function renderResults() {
    const trimmed = input.value.trim();
    if (!trimmed) {
// Historical context: see docs/CODEBASE_NOTES.md#jscommandpalette-js-102-105
      const recent = Store.getRecentActivity();
      currentResults = recent.length
        ? recent.map((r) => ({
            kind: 'recent',
            label: r.chapterTitle,
            sublabel: r.projectTitle,
            action: () => {
// Historical context: see docs/CODEBASE_NOTES.md#jscommandpalette-js-113-118
              if (r.projectId !== activeProject.id) teardownLiveStateForProjectSwitch();
              Store.switchProject(r.projectId);
              setActiveChapterId(r.chapterId);
              setActiveView('write');
            },
          }))
        : index.slice(0, 8);
    } else {
      currentResults = Palette.filterItems(index, trimmed).slice(0, 20);
    }

    selectedIndex = Math.min(selectedIndex, Math.max(currentResults.length - 1, 0));

    resultsEl.innerHTML = toBridge(
      currentResults.length === 0
        ? html`<p class="empty-note palette-empty">No matches.</p>`
        : html`${currentResults.map(
            (r, i) => html`
        <div class="palette-row${i === selectedIndex ? ' active' : ''}" data-index="${i}">
          <span class="palette-kind">${paletteKindLabel(r.kind)}</span>
          <span class="palette-label">${r.label}</span>
          <span class="palette-sublabel">${r.sublabel}</span>
        </div>`
          )}`
    );

    resultsEl.querySelectorAll('.palette-row').forEach((row) => {
      const i = Number(row.dataset.index);
      row.addEventListener('click', () => pick(currentResults[i]));
      // Mouse and keyboard share one selection cursor rather than fighting
      // over two — moving the mouse updates it the same way arrow keys do.
      row.addEventListener('mousemove', () => {
        if (selectedIndex === i) return;
        selectedIndex = i;
        resultsEl.querySelectorAll('.palette-row').forEach((r) => r.classList.toggle('active', Number(r.dataset.index) === i));
      });
    });
  }

  function pick(result) {
    if (!result) return;
    result.action();
    closeModal();
    requestRender();
  }

  input.addEventListener('input', () => {
    selectedIndex = 0;
    renderResults();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
      renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(currentResults[selectedIndex]);
    }
    // Escape isn't handled here — it falls through to the existing global
    // keydown listener, which already calls closeModal().
  });

// Historical context: see docs/CODEBASE_NOTES.md#jscommandpalette-js-187-191

  renderResults();
  input.focus();
}

export function paletteKindLabel(kind) {
  if (kind === 'chapter') return 'Chapter';
  if (kind === 'entity') return 'Entity';
  if (kind === 'project') return 'Project';
  if (kind === 'recent') return 'Recent';
  if (kind === 'command') return 'Command';
  return '';
}
