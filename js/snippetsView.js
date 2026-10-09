// Historical context: see docs/CODEBASE_NOTES.md#jssnippetsview-js-1-23
import * as Store from './store.js';
import { html, raw, toBridge, q, bindOutsideClick } from './dom-utils.js';

let activeSnippetCategory = '';

export function renderSnippetsView(project) {
  const panel = document.querySelector('.view-panel[data-view="snippets"]');
  const allSnippets = Store.getSnippetList();
  const snippets = activeSnippetCategory ? allSnippets.filter((s) => s.category === activeSnippetCategory) : allSnippets;
  const orderedChapters = [...project.chapters].sort((a, b) => a.order - b.order);
  const entityTypes = Store.getEntityTypes();

// Historical context: see docs/CODEBASE_NOTES.md#jssnippetsview-js-36-43
  function promoteMenu(snippetId) {
    return html`
      <div class="snippet-promote-menu wt-popover hidden" id="snippet-promote-${snippetId}">
        <div class="wt-popover-field">
          <span>New entity</span>
          <select class="promote-entity-type status-select">
            ${entityTypes.map((t) => html`<option value="${t.key}">${t.label}</option>`)}
          </select>
          <button class="wt-menu-item promote-go-btn" data-promote="entity" data-snippet="${snippetId}">→ Go</button>
        </div>
        <div class="wt-popover-field">
          <span>New scene in</span>
          <select class="promote-scene-chapter status-select">
            ${orderedChapters.map((c) => html`<option value="${c.id}">${c.title}</option>`)}
          </select>
          <button class="wt-menu-item promote-go-btn" data-promote="scene" data-snippet="${snippetId}">→ Go</button>
        </div>
        <button class="wt-menu-item promote-go-btn" data-promote="timeline" data-snippet="${snippetId}">→ New timeline event</button>
        <button class="wt-menu-item promote-go-btn" data-promote="decision" data-snippet="${snippetId}">→ Log as decision</button>
        <div class="wt-popover-field">
          <span>New annotation in</span>
          <select class="promote-annotation-chapter status-select">
            ${orderedChapters.map((c) => html`<option value="${c.id}">${c.title}</option>`)}
          </select>
          <select class="promote-annotation-type status-select">
            ${Store.ANNOTATION_TYPES.map((t) => html`<option value="${t.key}">${t.label}</option>`)}
          </select>
          <button class="wt-menu-item promote-go-btn" data-promote="annotation" data-snippet="${snippetId}">→ Go</button>
        </div>
      </div>`;
  }

  panel.innerHTML = toBridge(html`
    <div class="snippets-capture">
      <textarea id="snippet-input" placeholder="Jot down a line, a scene idea, a 'what if'… press Ctrl/Cmd+Enter to save" rows="3"></textarea>
      <select id="snippet-category-input" class="status-select">
        <option value="">Uncategorized</option>
        ${Store.SNIPPET_CATEGORIES.map((c) => html`<option value="${c.key}">${c.label}</option>`)}
      </select>
      <button id="snippet-save">+ Save Idea</button>
    </div>
    <div class="library-filter-bar">
      <span class="library-filter-label">Category</span>
      <button class="library-filter-chip${activeSnippetCategory === '' ? ' is-active' : ''}" data-filter-category="">All</button>
      ${Store.SNIPPET_CATEGORIES.map((c) => html`<button class="library-filter-chip${activeSnippetCategory === c.key ? ' is-active' : ''}" data-filter-category="${c.key}">${c.label}</button>`)}
    </div>
    <div class="snippets-list">
      ${
        snippets.length === 0
          ? html`<p class="empty-note">${allSnippets.length === 0 ? "Nothing captured yet. Ideas parked here don't derail whatever chapter you're writing." : 'Nothing in this category yet.'}</p>`
          : snippets.map(
              (s) => html`
        <div class="snippet-card" data-snippet="${s.id}">
          <p>${s.text}</p>
          <div class="snippet-card-footer">
            <span>${new Date(s.createdAt).toLocaleString()}</span>
            <select class="snippet-category-select status-select" data-snippet="${s.id}">
              <option value="">Uncategorized</option>
              ${Store.SNIPPET_CATEGORIES.map((c) => html`<option value="${c.key}" ${s.category === c.key ? raw('selected') : ''}>${c.label}</option>`)}
            </select>
            <div class="wt-popover-group">
              <button class="wt-menu-item snippet-promote-btn" data-menu-toggle="${s.id}">⇢ Promote</button>
              ${promoteMenu(s.id)}
            </div>
            <button class="snippet-delete-btn" title="Delete">✕</button>
          </div>
        </div>`
            )
      }
    </div>
  `);

  const input = q('snippet-input');
  const save = () => {
    if (!input.value.trim()) return;
    Store.createSnippet(input.value, q('snippet-category-input').value);
    renderSnippetsView(Store.getActiveProject());
  };

  q('snippet-save').addEventListener('click', save);
  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
  });

  panel.querySelectorAll('[data-filter-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSnippetCategory = btn.dataset.filterCategory;
      renderSnippetsView(Store.getActiveProject());
    });
  });

  panel.querySelectorAll('.snippet-category-select').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      Store.updateSnippetCategory(sel.dataset.snippet, e.target.value);
      renderSnippetsView(Store.getActiveProject());
    });
  });

  panel.querySelectorAll('.snippet-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.snippet-card');
      Store.deleteSnippet(card.dataset.snippet);
      renderSnippetsView(Store.getActiveProject());
    });
  });

// Historical context: see docs/CODEBASE_NOTES.md#jssnippetsview-js-150-153
  panel.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.menuToggle;
      const menu = q(`snippet-promote-${id}`);
      const wasHidden = menu.classList.contains('hidden');
      panel.querySelectorAll('.snippet-promote-menu').forEach((m) => m.classList.add('hidden'));
      menu.classList.toggle('hidden', !wasHidden);
    });
  });
// Historical context: see docs/CODEBASE_NOTES.md#jssnippetsview-js-164-170
  bindOutsideClick(closeSnippetMenusOnOutsideClick);

  panel.querySelectorAll('.promote-go-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { promote, snippet: snippetId } = btn.dataset;
      const card = btn.closest('.snippet-card');
      if (promote === 'entity') {
        const type = card.querySelector('.promote-entity-type').value;
        Store.promoteSnippetToEntity(snippetId, type);
      } else if (promote === 'scene') {
        const chapterId = card.querySelector('.promote-scene-chapter').value;
        if (!chapterId) return;
        Store.promoteSnippetToScene(snippetId, chapterId);
      } else if (promote === 'timeline') {
        Store.promoteSnippetToTimelineEvent(snippetId);
      } else if (promote === 'decision') {
        Store.promoteSnippetToDecision(snippetId);
      } else if (promote === 'annotation') {
        const chapterId = card.querySelector('.promote-annotation-chapter').value;
        const type = card.querySelector('.promote-annotation-type').value;
        if (!chapterId) return;
        Store.promoteSnippetToAnnotation(snippetId, chapterId, type);
      }
      renderSnippetsView(Store.getActiveProject());
    });
  });
}

function closeSnippetMenusOnOutsideClick(e) {
  if (e.target.closest('.wt-popover-group')) return;
  document.querySelectorAll('.snippet-promote-menu').forEach((m) => m.classList.add('hidden'));
}
