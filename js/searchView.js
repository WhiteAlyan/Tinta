// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js

import * as Store from './store.js';
import * as SearchEngine from './search.js';
import * as SearchService from './searchService.js';
import { html, raw, toBridge, q, escapeHtml, escapeAttr } from './dom-utils.js';
import { showStorageWarning } from './toast.js';
import { requestRender } from './renderBus.js';
import { flashAndScrollTo } from './dom-utils.js';
import { setActiveView, setActiveChapterId } from './context.js';
import { openEntityDrawer, openSceneInspector, openTimelineEventDrawer, openReferenceDrawer } from './drawer.js';
import { confirmDialog } from './modal.js';
import { setActiveMapId, setActiveSystemId } from './context.js';

// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js
let searchQuery = '';
let searchCaseSensitive = false;
let searchReplacement = '';
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js
let searchUseRegex = false;
let searchHiddenCategories = new Set();
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js
let searchQueryCaretPos = null;

// CR-43 — the engine call is off the render path. Every render used to
// run searchProject() synchronously over the whole project, once per
// keystroke — which is half of how a user-supplied regex could freeze
// the app. Now a render only paints the last completed outcome; actual
// scanning happens in a debounced, cancellable, budgeted run through
// searchService.js (worker-backed, watchdog-terminated on a hang).
//
// searchResultState holds the last COMPLETED run: { key, query, outcome }.
// The key binds the outcome to the exact inputs that produced it —
// query + case + regex + the store's save revision (getSaveRev), so any
// landed edit invalidates the cache without this view knowing what the
// edit touched. A stale state (key mismatch) is still rendered while a
// newer run is in flight, under an explicit "Searching…" note — the
// standard progressive-search presentation, and it keeps typing fluid
// on big projects instead of blanking the panel between keystrokes.
let searchResultState = null;
let searchRunning = false;
let searchDebounceTimer = null;
let searchGeneration = 0; // bumped on project switch / view reset — in-flight runs older than this are discarded
const SEARCH_DEBOUNCE_MS = 150;

function searchStateKey() {
  return `${searchQuery}\u0000${searchCaseSensitive ? '1' : '0'}\u0000${searchUseRegex ? '1' : '0'}\u0000${Store.getSaveRev()}`;
}

// The render-path pump: reconcile "what should the results be" with
// "what runs are in flight". Safe to call from every render — it
// schedules at most one debounced run and never re-arms while one is
// pending (the pending run picks up the LATEST query/options when it
// fires, which is the debounce behavior a typing writer expects).
function ensureSearchRun() {
  const key = searchStateKey();
  const fresh = searchResultState && searchResultState.key === key;
  if (fresh) return; // results in hand for exactly these inputs

  if (!searchQuery.trim()) {
    // Query emptied (or project reset) — nothing to search. Kill any
    // pending/in-flight work so it can't land after the clear.
    if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
    if (searchRunning) { SearchService.cancelActive(); searchRunning = false; }
    searchResultState = null;
    return;
  }

  if (fresh === false && searchRunning && searchResultState && searchResultState.key !== key) {
    // A run for an older query is still going — supersede it. Its
    // completion would be discarded by the generation/key check anyway;
    // cancelling frees the worker for the newer query immediately.
    SearchService.cancelActive();
    searchRunning = false;
  }

  if (searchDebounceTimer) return; // already pending — it fires with current state
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null;
    executeSearch();
  }, SEARCH_DEBOUNCE_MS);
}

async function executeSearch() {
  const generation = searchGeneration;
  const key = searchStateKey();
  const query = searchQuery;
  const caseSensitive = searchCaseSensitive;
  const useRegex = searchUseRegex;
  searchRunning = true;
  const serviceOutcome = await SearchService.runSearch(Store.getActiveProject(), query, { caseSensitive, useRegex });
  searchRunning = false;
  // Superseded while scanning (kept typing, toggled case/regex, edited
  // the project, switched project, left the view)? Drop it — the next
  // render pumps a fresh run for whatever is current now.
  if (generation !== searchGeneration || key !== searchStateKey()) return;
  if (serviceOutcome.status === 'cancelled') return;
  // Flatten the service outcome into the paintable shape: the engine's
  // result fields at top level (category arrays, regexError, …) plus
  // the service-level stopped flag and replacePlanCounts.
  const outcome = serviceOutcome.status === 'error'
    ? { status: 'error', message: serviceOutcome.message }
    : {
        ...serviceOutcome.results,
        status: 'ok',
        stopped: serviceOutcome.stopped,
        replacePlanCounts: serviceOutcome.replacePlanCounts,
      };
  searchResultState = { key, query: query.trim(), outcome };
  requestRender();
}

// The outcome to render for THIS render's inputs: fresh when the cache
// matches, else the previous run's outcome (stale, shown while a newer
// run is pending/in-flight), else null.
function outcomeForRender() {
  const key = searchStateKey();
  if (searchResultState && searchResultState.key === key) return searchResultState;
  return null;
}

export function applySavedSearch(s) {
  searchQuery = s.query;
  searchCaseSensitive = s.caseSensitive;
  searchUseRegex = s.useRegex;
}

export function renderSearchView(_project) {
  const panel = document.querySelector('.view-panel[data-view="search"]');
  const trimmedQuery = searchQuery.trim();
  ensureSearchRun();

  const state = outcomeForRender();
  const pending = !!trimmedQuery && !state;
  // Results actually paintable this render: the FRESH state for exactly
  // these inputs, or the previous run's state while a newer run is in
  // flight. Both helpers below take the STATE wrapper ({ key, query,
  // outcome }) — never the bare outcome — so stale renders can label
  // themselves with the query they actually answered. Never paint a
  // stale state when the query is empty — ensureSearchRun clears it,
  // but belt and braces since this is what decides what the writer sees.
  const painted = state || (pending ? searchResultState : null);

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
        : pending
        ? html`<p class="empty-note search-running-note">Searching…</p>${renderOutcomeResults(painted, trimmedQuery, false)}`
        : renderOutcomeResults(painted, trimmedQuery, true)
    }

    ${renderReplacePanel(trimmedQuery, painted)}
  `);

  q('search-query').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    searchQueryCaretPos = e.target.selectionStart;
    renderSearchView(Store.getActiveProject());
  });
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js
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
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js
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

  bindReplaceHandler(panel, trimmedQuery);
}

// CR-43 — the results template, factored out so the "pending" state can
// render the previous run's results under the Searching… note. `fresh`
// controls the pieces that must only ever reflect CURRENT inputs (the
// replace counts and the stop banners): a stale outcome still renders
// its rows, but a stale outcome's stop banner or replace counts would
// describe a query the writer has already moved past.
function renderOutcomeResults(state, trimmedQuery, fresh) {
  if (!state || !state.outcome) return '';
  const results = state.outcome;
  // The label under which these rows were computed — a stale render
  // must say so, not silently present old counts as if they answered
  // the current query.
  const labelFor = fresh ? trimmedQuery : state.query;

  if (results.status === 'error') {
    return html`<p class="empty-note search-regex-error">Search failed: ${results.message || 'unexpected error'}. Try again — if it keeps failing, simplify the query.</p>`;
  }
  if (results.regexError) {
    return html`<p class="empty-note search-regex-error">Not a valid pattern: ${results.regexError}</p>`;
  }
  if (results.filterConflict) {
    return html`<p class="empty-note search-filter-conflict">These filters can't both apply: ${results.filters.map((f) => html`<code>${f.field}:${f.value}</code>`)} scope to different, non-overlapping kinds of result (e.g. an entity-only field alongside a chapter-only one). Try one filter at a time.</p>`;
  }

  const total = SearchEngine.countTotalMatches(results);
  const totalRows = SearchEngine.countResultRows(results);

  if (totalRows === 0) {
    // A hard stop (worker terminated mid-scan) has no rows, but "No
    // matches" would imply a completed scan that found nothing — the
    // stopped note IS the answer, and it's the only thing shown.
    if (results.stopped && results.stopped.hard) {
      return renderStoppedNote(results, fresh);
    }
    return html`<p class="empty-note">No matches for "${labelFor}".</p>${renderStoppedNote(results, fresh)}`;
  }

  const categories = [
    { key: 'chapters', label: 'Chapters', count: results.chapters.length },
    { key: 'entities', label: 'Entities', count: results.entities.length },
    { key: 'scenes', label: 'Scenes', count: results.scenes.length },
    { key: 'snippets', label: 'Snippets', count: results.snippets.length },
    { key: 'timelineEvents', label: 'Timeline', count: results.timelineEvents.length },
    { key: 'references', label: 'References', count: results.references.length },
    { key: 'annotations', label: 'Annotations', count: results.annotations.length },
    { key: 'ruleSystems', label: 'Systems', count: results.ruleSystems.length },
    { key: 'maps', label: 'Maps', count: results.maps.length },
  ].filter((c) => c.count > 0);
  const showCategory = (key) => !searchHiddenCategories.has(key);

  return html`<p class="search-total">${total > 0 ? html`${total} match${total === 1 ? '' : 'es'}` : html`${totalRows} result${totalRows === 1 ? '' : 's'}`} for "${labelFor}"</p>${
      renderStoppedNote(results, fresh)
    }${
      categories.length > 1
        ? html`<div class="search-category-chips">${categories.map((c) => html`<button type="button" class="search-category-chip${showCategory(c.key) ? raw(' active') : ''}" data-category="${c.key}">${c.label} <span class="search-section-count">${c.count}</span></button>`)}</div>`
        : ''
    }${
      showCategory('chapters') ? renderSearchSection('Chapters', results.chapters, (r) => renderSearchRow(r.title, r.matches.length, r.matches[0]?.snippet, { 'data-jump-chapter': r.id })) : ''
    }${
      showCategory('entities') ? renderSearchSection('Entities', results.entities, (r) => renderSearchRow(`${r.name} · ${r.type}${r.tagMatches.length ? ` · #${r.tagMatches.join(' #')}` : ''}`, r.nameMatches.length + r.descMatches.length + r.tagMatches.length, r.descMatches[0]?.snippet, { 'data-jump-entity': r.id })) : ''
    }${
      showCategory('scenes') ? renderSearchSection('Scenes', results.scenes, (r) => renderSearchRow(`${r.chapterTitle} → ${r.title}`, r.matchCount, r.snippet, { 'data-jump-scene-chapter': r.chapterId, 'data-jump-scene': r.id })) : ''
    }${
      showCategory('snippets') ? renderSearchSection('Snippets', results.snippets, (r) => renderSearchRow('Snippet', r.matches.length, r.matches[0]?.snippet, { 'data-jump-snippet': r.id })) : ''
    }${
      showCategory('timelineEvents') ? renderSearchSection('Timeline', results.timelineEvents, (r) => renderSearchRow(r.title, r.titleMatches.length + r.dateMatches.length + r.descMatches.length, (r.descMatches[0] || r.dateMatches[0])?.snippet, { 'data-jump-event': r.id })) : ''
    }${
      showCategory('references') ? renderSearchSection('References', results.references, (r) => renderSearchRow(`${r.title} · ${r.refType}`, r.titleMatches.length + r.contentMatches.length + r.annotationMatches.length + r.urlMatches.length + r.sourceMatches.length, (r.contentMatches[0] || r.annotationMatches[0])?.snippet, { 'data-jump-reference': r.id })) : ''
    }${
      showCategory('annotations') ? renderSearchSection('Annotations', results.annotations, (r) => renderSearchRow(Store.getAnnotationTypeLabel(r.type), 1, r.note, { 'data-jump-annotation-chapter': r.chapterId })) : ''
    }${
      showCategory('ruleSystems') ? renderSearchSection('Systems', results.ruleSystems, (r) => renderSearchRow(r.name, r.matchCount, r.nodeMatches.length ? `Nodes: ${r.nodeMatches.join(', ')}` : '', { 'data-jump-system': r.id })) : ''
    }${
      showCategory('maps') ? renderSearchSection('Maps', results.maps, (r) => renderSearchRow(r.name, r.matchCount, r.markerLabels.length ? `Markers: ${r.markerLabels.join(', ')}` : '', { 'data-jump-map': r.id })) : ''
    }`;
}

// CR-43 — surface "search stopped" honestly. A partial or capped result
// set that LOOKED total would be the worst kind of lie in a search tool
// (the writer can't know what it didn't see). A hard stop (watchdog
// terminated the worker) shows no rows at all — there are none to show.
function renderStoppedNote(results, fresh) {
  if (!fresh || !results.stopped) return '';
  const s = results.stopped;
  if (s.reason === 'matches') {
    return html`<p class="empty-note search-stopped-note">Result cap reached — showing the first matches only. Refine the query or add a filter (type:, status:, part:, …) to narrow it down.</p>`;
  }
  if (s.hard) {
    return html`<p class="empty-note search-stopped-note">Search stopped — this pattern was too expensive to run safely on this project, so it was terminated before it could lock the app up. No results are shown. Anchoring the pattern, or avoiding nested quantifiers like (a+)+, will fix it.</p>`;
  }
  const seconds = Math.max(1, Math.round((s.elapsedMs || 0) / 100) / 10);
  return html`<p class="empty-note search-stopped-note">Search stopped after ${seconds}s — showing the partial results found before the time budget ran out. They may be incomplete; narrowing the query will finish faster.</p>`;
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

function renderSearchRow(label, matchCount, snippet, dataAttrs) {
// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js
  // Code review S-2 fix — dataAttrs is now a { attributeName: value } map
  // instead of a caller-built attribute fragment. The values are store ids
  // that .tinta import preserves verbatim (only project/image ids are
  // remapped), so they're attacker-controlled in a malicious package;
  // escaping them HERE — once, centrally, rather than at each of the nine
  // call sites — means the next category added to this view can't forget.
  // The attribute NAMES are the trusted half of the pair.
  const attrString = Object.entries(dataAttrs || {})
    .map(([name, value]) => `${name}="${escapeAttr(value)}"`)
    .join(' ');
  return html`
    <div class="search-result-row" ${raw(attrString)}>
      <div class="search-result-main">
        <strong>${label}</strong>
        <span class="search-result-count">${matchCount} match${matchCount === 1 ? '' : 'es'}</span>
      </div>
      ${snippet ? html`<div class="search-snippet">${highlightMatches(snippet, searchQuery.trim(), searchCaseSensitive)}</div>` : ''}
    </div>
  `;
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js
// CR-43 — the replace panel now renders from the CURRENT run's
// replacePlanCounts (computed in the same budgeted worker round-trip as
// the results — it used to re-scan every chapter synchronously on every
// render, the second unguarded regex pass per keystroke). While counts
// are unknown (search still running, or it stopped early) the panel is
// read-only with an honest note: a replace button must never be offered
// on counts known to be partial.
function renderReplacePanel(trimmedQuery, painted) {
  const counts = painted && painted.outcome && painted.outcome.status === 'ok' && !painted.outcome.regexError && !painted.outcome.filterConflict && !painted.outcome.stopped
    ? painted.outcome.replacePlanCounts
    : null;
  const regexNote = searchUseRegex
    ? html`<p class="settings-note search-regex-replace-note">Regex replace: capture groups from the pattern are available in the replacement as $1, $2, etc. ($&amp; for the whole match).</p>`
    : '';

  if (!trimmedQuery) return '';

  if (!counts || counts.stopped) {
    const reason = counts && counts.stopped
      ? 'Replace is unavailable: the pattern couldn\'t be evaluated across all chapters within the search time budget, so the affected chapters can\'t be counted. Nothing can be replaced until the pattern is narrowed.'
      : 'Replace becomes available once the search for this query finishes.';
    return html`
      <div class="search-replace-panel">
        <h3>Replace in chapters</h3>
        ${regexNote}
        <p class="settings-note search-replace-pending-note">${reason}</p>
      </div>
    `;
  }

  // .tinta pass — returns SafeHtml. searchReplacement is user-controlled
  // text interpolated into a <input value="..."> attribute, so it goes
  // through normal interpolation (auto-escaped).
  return html`
    <div class="search-replace-panel">
      <h3>Replace in chapters</h3>
      ${regexNote}
      <div class="search-replace-row">
        <input type="text" id="search-replacement" placeholder="Replace with…" value="${searchReplacement}" />
        <button id="search-replace-btn" ${counts.chapterCount === 0 ? raw('disabled') : ''}>
          Replace ${counts.matchTotal} match${counts.matchTotal === 1 ? '' : 'es'} in ${counts.chapterCount} chapter${counts.chapterCount === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  `;
}

// CR-43 — the replace flow evaluates the plan through the search
// service (worker + budget + watchdog — the same user regex can't
// freeze the app through the Replace door either), then hands the
// precomputed plan to the store. The store layer snapshots and assigns;
// no second un-guarded regex pass ever runs on the main thread.
function bindReplaceHandler(panel, trimmedQuery) {
  const replaceBtn = q('search-replace-btn');
  if (!replaceBtn) {
    // The pending/unavailable panel has no button, but its replacement
    // input may exist in the counts panel — it doesn't; both variants
    // are handled above. Nothing to bind.
    return;
  }
  const replacementInput = q('search-replacement');
  if (replacementInput) {
    replacementInput.addEventListener('input', (e) => {
      searchReplacement = e.target.value;
    });
  }
  replaceBtn.addEventListener('click', async () => {
    const project = Store.getActiveProject();
    replaceBtn.disabled = true;
    const planOutcome = await SearchService.runReplacePlan(project, trimmedQuery, searchReplacement, { caseSensitive: searchCaseSensitive, useRegex: searchUseRegex });
    if (planOutcome.status === 'cancelled') {
      renderSearchView(Store.getActiveProject());
      return;
    }
    if (planOutcome.status === 'error' || planOutcome.stopped) {
      replaceBtn.disabled = false;
      showStorageWarning('Replace was stopped before every chapter could be evaluated — the pattern is too expensive to apply safely. Nothing was changed. Narrow the pattern and try again.');
      return;
    }
    const plan = planOutcome.plan;
    const chapterMatches = plan.length;
    const matchTotal = plan.reduce((sum, p) => sum + p.count, 0);
    const modeNote = searchUseRegex ? ' (regex mode)' : '';
    const confirmed = await confirmDialog({ title: 'Replace across chapters?', message: `Replace ${matchTotal} match${matchTotal === 1 ? '' : 'es'} of "${trimmedQuery}" with "${searchReplacement}" across ${chapterMatches} chapter${chapterMatches === 1 ? '' : 's'}${modeNote}? Each affected chapter is auto-snapshotted first, so this can be undone from its revision history.`, confirmLabel: 'Replace all', danger: true });
    if (!confirmed) {
      replaceBtn.disabled = false;
      return;
    }
    Store.applyReplacePlan(plan, { query: trimmedQuery, replacement: searchReplacement, useRegex: searchUseRegex });
    // Force a fresh search — the content these results describe just
    // changed under them (the saveRev bump would also invalidate the
    // cache; clearing here makes the intent explicit).
    searchResultState = null;
    renderSearchView(Store.getActiveProject());
    showStorageWarning(`Replaced ${matchTotal} match${matchTotal === 1 ? '' : 'es'} across ${chapterMatches} chapter${chapterMatches === 1 ? '' : 's'}. A snapshot was saved for each one before the change.`);
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jssearchview-js
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
// CR-43 — also cancels any in-flight search run: its outcome would be
// discarded by the generation check anyway, but cancelling frees the
// worker immediately instead of letting a doomed scan burn budget.
export function resetSearchViewState() {
  searchGeneration++;
  if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
  if (searchRunning) { SearchService.cancelActive(); searchRunning = false; }
  searchQuery = '';
  searchCaseSensitive = false;
  searchReplacement = '';
  searchUseRegex = false;
  searchHiddenCategories = new Set();
  searchQueryCaretPos = null;
  searchResultState = null;
}

import { registerViewReset } from './viewLifecycle.js';
registerViewReset('search', resetSearchViewState);
