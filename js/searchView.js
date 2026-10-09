// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-1-31

import * as Store from './store.js';
import * as SearchEngine from './search.js';
import { html, raw, toBridge, q, escapeHtml } from './dom-utils.js';
import { showStorageWarning } from './toast.js';
import { requestRender } from './renderBus.js';
import { flashAndScrollTo } from './dom-utils.js';
import { setActiveView, setActiveChapterId } from './context.js';
import { openEntityDrawer, openSceneInspector, openTimelineEventDrawer, openReferenceDrawer } from './drawer.js';
import { confirmDialog } from './modal.js';
import { setActiveMapId, setActiveSystemId } from './context.js';

// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-44-48
let searchQuery = '';
let searchCaseSensitive = false;
let searchReplacement = '';
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-52-56
let searchUseRegex = false;
let searchHiddenCategories = new Set();
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-59-68
let searchQueryCaretPos = null;

// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-71-74
export function applySavedSearch(s) {
  searchQuery = s.query;
  searchCaseSensitive = s.caseSensitive;
  searchUseRegex = s.useRegex;
}

export function renderSearchView(project) {
  const panel = document.querySelector('.view-panel[data-view="search"]');
  const trimmedQuery = searchQuery.trim();
  const results = trimmedQuery ? Store.searchProject(searchQuery, { caseSensitive: searchCaseSensitive, useRegex: searchUseRegex }) : null;
  const total = results ? SearchEngine.countTotalMatches(results) : 0;
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-86-90
  const totalRows = results ? SearchEngine.countResultRows(results) : 0;

  // Quick-wins pass — category filter chips. Only offer a chip for a
  // category that actually has results this query — an empty "Scenes (0)"
  // chip sitting there toggleable does nothing useful.
  const categories = results
    ? [
        { key: 'chapters', label: 'Chapters', count: results.chapters.length },
        { key: 'entities', label: 'Entities', count: results.entities.length },
        { key: 'scenes', label: 'Scenes', count: results.scenes.length },
        { key: 'snippets', label: 'Snippets', count: results.snippets.length },
        { key: 'timelineEvents', label: 'Timeline', count: results.timelineEvents.length },
        { key: 'references', label: 'References', count: results.references.length },
        { key: 'annotations', label: 'Annotations', count: results.annotations.length },
        { key: 'ruleSystems', label: 'Systems', count: results.ruleSystems.length },
        { key: 'maps', label: 'Maps', count: results.maps.length },
      ].filter((c) => c.count > 0)
    : [];
  const showCategory = (key) => !searchHiddenCategories.has(key);

  panel.innerHTML = toBridge(html`
    <div class="search-bar">
      <input type="text" id="search-query" placeholder="Search everything, or filter with type:, tag:, status:, canon:, docType:, part:, folder:, arc:, pov:, updated:, created:…" value="${searchQuery}" autofocus />
      <label class="search-case-toggle">
        <input type="checkbox" id="search-case" ${searchCaseSensitive ? raw('checked') : ''} />
        Case sensitive
      </label>
      <label class="search-case-toggle" title="Treat the query as a regular expression">
        <input type="checkbox" id="search-regex" ${searchUseRegex ? raw('checked') : ''} />
        Regex
      </label>
    </div>

    ${
      !trimmedQuery
        ? html`<p class="empty-note">Type to search across every chapter, entity (including tags), scene, snippet, timeline event, reference, annotation, rule system, and map in this project. Toggle Regex for pattern matching, or filter with field:value tokens, e.g. <code>type:character tag:important</code>, <code>status:draft</code>, <code>updated:&gt;2025-01-01</code>, mixed freely with plain text.</p>`
        : results.regexError
        ? html`<p class="empty-note search-regex-error">Not a valid pattern: ${results.regexError}</p>`
        : results.filterConflict
        ? html`<p class="empty-note search-filter-conflict">These filters can't both apply: ${results.filters.map((f) => html`<code>${f.field}:${f.value}</code>`)} scope to different, non-overlapping kinds of result (e.g. an entity-only field alongside a chapter-only one). Try one filter at a time.</p>`
        : totalRows === 0
        ? html`<p class="empty-note">No matches for "${trimmedQuery}".</p>`
        : html`<p class="search-total">${total > 0 ? html`${total} match${total === 1 ? '' : 'es'}` : html`${totalRows} result${totalRows === 1 ? '' : 's'}`} for "${trimmedQuery}"</p>${
            categories.length > 1
              ? html`<div class="search-category-chips">${categories.map((c) => html`<button type="button" class="search-category-chip${showCategory(c.key) ? raw(' active') : ''}" data-category="${c.key}">${c.label} <span class="search-section-count">${c.count}</span></button>`)}</div>`
              : ''
          }${
            showCategory('chapters') ? renderSearchSection('Chapters', results.chapters, (r) => renderSearchRow(r.title, r.matches.length, r.matches[0]?.snippet, `data-jump-chapter="${r.id}"`)) : ''
          }${
            showCategory('entities') ? renderSearchSection('Entities', results.entities, (r) => renderSearchRow(`${r.name} · ${r.type}${r.tagMatches.length ? ` · #${r.tagMatches.join(' #')}` : ''}`, r.nameMatches.length + r.descMatches.length + r.tagMatches.length, r.descMatches[0]?.snippet, `data-jump-entity="${r.id}"`)) : ''
          }${
            showCategory('scenes') ? renderSearchSection('Scenes', results.scenes, (r) => renderSearchRow(`${r.chapterTitle} → ${r.title}`, r.matchCount, r.snippet, `data-jump-scene-chapter="${r.chapterId}" data-jump-scene="${r.id}"`)) : ''
          }${
            showCategory('snippets') ? renderSearchSection('Snippets', results.snippets, (r) => renderSearchRow('Snippet', r.matches.length, r.matches[0]?.snippet, `data-jump-snippet="${r.id}"`)) : ''
          }${
            showCategory('timelineEvents') ? renderSearchSection('Timeline', results.timelineEvents, (r) => renderSearchRow(r.title, r.titleMatches.length + r.dateMatches.length + r.descMatches.length, (r.descMatches[0] || r.dateMatches[0])?.snippet, `data-jump-event="${r.id}"`)) : ''
          }${
            showCategory('references') ? renderSearchSection('References', results.references, (r) => renderSearchRow(`${r.title} · ${r.refType}`, r.titleMatches.length + r.contentMatches.length + r.annotationMatches.length + r.urlMatches.length + r.sourceMatches.length, (r.contentMatches[0] || r.annotationMatches[0])?.snippet, `data-jump-reference="${r.id}"`)) : ''
          }${
            showCategory('annotations') ? renderSearchSection('Annotations', results.annotations, (r) => renderSearchRow(Store.getAnnotationTypeLabel(r.type), 1, r.note, `data-jump-annotation-chapter="${r.chapterId}"`)) : ''
          }${
            showCategory('ruleSystems') ? renderSearchSection('Systems', results.ruleSystems, (r) => renderSearchRow(r.name, r.matchCount, r.nodeMatches.length ? `Nodes: ${r.nodeMatches.join(', ')}` : '', `data-jump-system="${r.id}"`)) : ''
          }${
            showCategory('maps') ? renderSearchSection('Maps', results.maps, (r) => renderSearchRow(r.name, r.matchCount, r.markerLabels.length ? `Markers: ${r.markerLabels.join(', ')}` : '', `data-jump-map="${r.id}"`)) : ''
          }`
    }

    ${trimmedQuery && !results.regexError ? renderReplacePanel(trimmedQuery) : ''}
  `);

  q('search-query').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    searchQueryCaretPos = e.target.selectionStart;
    renderSearchView(Store.getActiveProject());
  });
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-166-172
  const queryInput = q('search-query');
  queryInput.focus();
  const restorePos = searchQueryCaretPos !== null ? Math.min(searchQueryCaretPos, queryInput.value.length) : queryInput.value.length;
  queryInput.setSelectionRange(restorePos, restorePos);
  searchQueryCaretPos = null;

  q('search-case').addEventListener('change', (e) => {
    searchCaseSensitive = e.target.checked;
    renderSearchView(Store.getActiveProject());
  });
  q('search-regex').addEventListener('change', (e) => {
    searchUseRegex = e.target.checked;
    renderSearchView(Store.getActiveProject());
  });

  panel.querySelectorAll('.search-category-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.category;
      if (searchHiddenCategories.has(key)) searchHiddenCategories.delete(key);
      else searchHiddenCategories.add(key);
      renderSearchView(Store.getActiveProject());
    });
  });

  panel.querySelectorAll('[data-jump-chapter]').forEach((row) => {
    row.addEventListener('click', () => {
      setActiveChapterId(row.dataset.jumpChapter);
      setActiveView('write');
      requestRender();
    });
  });
  panel.querySelectorAll('[data-jump-entity]').forEach((row) => {
    row.addEventListener('click', () => {
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-206-209
      openEntityDrawer(row.dataset.jumpEntity);
    });
  });
  panel.querySelectorAll('[data-jump-scene]').forEach((row) => {
    row.addEventListener('click', () => {
      // Same peek-first reasoning as the entity row above — the Scene
      // Inspector drawer opens here, "Open on Corkboard" is the secondary
      // affordance in the drawer for the writer who wants the full card.
      openSceneInspector(row.dataset.jumpSceneChapter, row.dataset.jumpScene);
    });
  });
  panel.querySelectorAll('[data-jump-snippet]').forEach((row) => {
    row.addEventListener('click', () => {
      setActiveView('snippets');
      requestRender();
      flashAndScrollTo(`.snippet-card[data-snippet="${row.dataset.jumpSnippet}"]`);
    });
  });
  panel.querySelectorAll('[data-jump-event]').forEach((row) => {
    row.addEventListener('click', () => {
      // Timeline event drawer — peek at the event without leaving the
      // search results. The drawer's "Open in Timeline view" button
      // does the old flash-and-scroll jump, same as below for snippets.
      openTimelineEventDrawer(row.dataset.jumpEvent);
    });
  });
  panel.querySelectorAll('[data-jump-reference]').forEach((row) => {
    row.addEventListener('click', () => {
      // Reference drawer — peek at the reference (source, URL, tags,
      // linked entity/chapter/scene). The drawer's "Open in References
      // view" button does the old switch-and-select.
      openReferenceDrawer(row.dataset.jumpReference);
    });
  });
  panel.querySelectorAll('[data-jump-annotation-chapter]').forEach((row) => {
    row.addEventListener('click', () => {
      const chapterId = row.dataset.jumpAnnotationChapter;
      if (chapterId) {
        setActiveChapterId(chapterId);
        setActiveView('write');
        requestRender();
      } else {
        setActiveView('annotations');
        requestRender();
      }
    });
  });
  panel.querySelectorAll('[data-jump-system]').forEach((row) => {
    row.addEventListener('click', () => {
      setActiveSystemId(row.dataset.jumpSystem);
      setActiveView('systems');
      requestRender();
    });
  });
  panel.querySelectorAll('[data-jump-map]').forEach((row) => {
    row.addEventListener('click', () => {
      setActiveMapId(row.dataset.jumpMap);
      setActiveView('map');
      requestRender();
    });
  });

  const replaceBtn = q('search-replace-btn');
  if (replaceBtn) {
    q('search-replacement').addEventListener('input', (e) => {
      searchReplacement = e.target.value;
    });
    replaceBtn.addEventListener('click', async () => {
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-278-281
      const previewPlan = SearchEngine.planChapterReplace(Store.getActiveProject(), trimmedQuery, searchReplacement, { caseSensitive: searchCaseSensitive, useRegex: searchUseRegex });
      const chapterMatches = previewPlan.length;
      const matchTotal = previewPlan.reduce((sum, p) => sum + p.count, 0);
      const modeNote = searchUseRegex ? ' (regex mode)' : '';
      if (!(await confirmDialog({ title: 'Replace across chapters?', message: `Replace ${matchTotal} match${matchTotal === 1 ? '' : 'es'} of "${trimmedQuery}" with "${searchReplacement}" across ${chapterMatches} chapter${chapterMatches === 1 ? '' : 's'}${modeNote}? Each affected chapter is auto-snapshotted first, so this can be undone from its revision history.`, confirmLabel: 'Replace all', danger: true }))) return;
      const plan = Store.replaceInChapters(trimmedQuery, searchReplacement, { caseSensitive: searchCaseSensitive, useRegex: searchUseRegex });
      const count = plan.reduce((sum, p) => sum + p.count, 0);
      renderSearchView(Store.getActiveProject());
      showStorageWarning(`Replaced ${count} match${count === 1 ? '' : 'es'} across ${plan.length} chapter${plan.length === 1 ? '' : 's'}. A snapshot was saved for each one before the change.`);
    });
  }
}

function renderSearchSection(label, rows, renderRow) {
  if (rows.length === 0) return '';
  // .tinta pass — returns SafeHtml so the caller (renderSearchView's main
  // html`` template) can interpolate it directly. renderRow returns
  // SafeHtml too (see renderSearchRow below).
  return html`
    <div class="search-section">
      <h3>${label} <span class="search-section-count">${rows.length}</span></h3>
      ${rows.map(renderRow)}
    </div>
  `;
}

function renderSearchRow(label, matchCount, snippet, dataAttr) {
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-309-315
  return html`
    <div class="search-result-row" ${raw(dataAttr)}>
      <div class="search-result-main">
        <strong>${label}</strong>
        <span class="search-result-count">${matchCount} match${matchCount === 1 ? '' : 'es'}</span>
      </div>
      ${snippet ? html`<div class="search-snippet">${highlightMatches(snippet, searchQuery.trim(), searchCaseSensitive)}</div>` : ''}
    </div>
  `;
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-327-334
function renderReplacePanel(trimmedQuery) {
  const previewPlan = SearchEngine.planChapterReplace(Store.getActiveProject(), trimmedQuery, '', { caseSensitive: searchCaseSensitive, useRegex: searchUseRegex });
  const chapterMatchCount = previewPlan.reduce((sum, p) => sum + p.count, 0);
  // .tinta pass — returns SafeHtml. searchReplacement is user-controlled
  // text interpolated into a <input value="..."> attribute, so it goes
  // through normal interpolation (auto-escaped).
  return html`
    <div class="search-replace-panel">
      <h3>Replace in chapters</h3>
      ${searchUseRegex ? html`<p class="settings-note search-regex-replace-note">Regex replace: capture groups from the pattern are available in the replacement as $1, $2, etc. ($&amp; for the whole match).</p>` : ''}
      <div class="search-replace-row">
        <input type="text" id="search-replacement" placeholder="Replace with…" value="${searchReplacement}" />
        <button id="search-replace-btn" ${chapterMatchCount === 0 ? raw('disabled') : ''}>
          Replace ${chapterMatchCount} match${chapterMatchCount === 1 ? '' : 'es'} in ${previewPlan.length} chapter${previewPlan.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  `;
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js-355-361
function highlightMatches(text, query, caseSensitive) {
  if (!query) return raw(escapeHtml(text));
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let out = '';
  let from = 0;
  let idx;
  while ((idx = haystack.indexOf(needle, from)) !== -1) {
    out += escapeHtml(text.slice(from, idx));
    out += `<mark>${escapeHtml(text.slice(idx, idx + query.length))}</mark>`;
    from = idx + query.length;
  }
  out += escapeHtml(text.slice(from));
  return raw(out);
}

// v0.2.9 — Phase 7b: reset search state on project switch. The search
// query, filters, and caret position shouldn't survive a project switch —
// they're per-project context. Same pattern as notesView's resetEntityTagFilters.
export function resetSearchViewState() {
  searchQuery = '';
  searchCaseSensitive = false;
  searchReplacement = '';
  searchUseRegex = false;
  searchHiddenCategories = new Set();
  searchQueryCaretPos = null;
}

import { registerViewReset } from './viewLifecycle.js';
registerViewReset('search', resetSearchViewState);
