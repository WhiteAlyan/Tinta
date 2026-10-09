// Historical context: see docs/CODEBASE_NOTES.md#jswordcheckmodal-js-1-5

import * as Store from './store.js';
import * as WordTools from './wordtools.js';
import { html, toBridge, q, escapeHtml } from './dom-utils.js';
import { openModal } from './modal.js';

// ── word check ──────────────────────────────────────────────────────────

export function openWordCheckModal(chapter) {
  const { total, entries } = WordTools.computeWordFrequency(chapter.content);

  openModal({
    title: `Word Check · ${escapeHtml(chapter.title)}`,
    className: 'wordcheck-modal',
    body: toBridge(
      total === 0
        ? html`<p class="empty-note">Nothing to check yet. Write something first.</p>`
        : html`
        <p class="wordcheck-summary">${total.toLocaleString()} words · top repeated words below, common function words excluded</p>
        <div class="wordcheck-table">
          ${entries.map(
              (e) => html`
            <div class="wordcheck-row${e.overused ? ' is-overused' : ''}">
              <span class="wc-word">${e.word}${e.crutch ? html` <span class="wc-crutch-tag">crutch</span>` : ''}</span>
              <span class="wc-bar"><span class="wc-bar-fill" style="width:${Math.min(100, e.share * 2000)}%"></span></span>
              <span class="wc-count">${e.count}</span>
            </div>`
            )}
        </div>
        <p class="wordcheck-legend">Highlighted rows appear often enough relative to chapter length that they're worth a second look, not necessarily wrong, just worth knowing about.</p>
        `
    ),
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jswordcheckmodal-js-41-52

let nameGenMode = 'classic';
let nameGenType = '';

export function openThesaurusModal() {
  nameGenMode = 'classic';
  nameGenType = '';
  const result = Store.generateEntityNames({ mode: nameGenMode, type: nameGenType || null, count: 8 });
  renderThesaurusModal(result);
}

function renderThesaurusModal(nameResult) {
  const custom = Store.getCustomThesaurus();
  const customWords = Object.keys(custom).sort();
  const entityTypes = Store.getEntityTypes();

// Historical context: see docs/CODEBASE_NOTES.md#jswordcheckmodal-js-69-73
  const root = openModal({
    title: 'Names &amp; Archeshic Records',
    className: 'thesaurus-modal',
    body: toBridge(html`
        <div class="thesaurus-section">
          <div class="thesaurus-section-head">
            <span class="sb-label">Name Generator</span>
            <button id="names-reroll">↻ New names</button>
          </div>
          <div class="namegen-controls">
            <div class="namegen-mode-toggle" role="group" aria-label="Name generator mode">
              <button type="button" class="namegen-mode-btn${nameGenMode === 'classic' ? ' active' : ''}" data-mode="classic">Classic</button>
              <button type="button" class="namegen-mode-btn${nameGenMode === 'learn' ? ' active' : ''}" data-mode="learn">Learn from this project</button>
            </div>
            ${
              nameGenMode === 'learn'
                ? html`<select id="namegen-type-select" class="namegen-type-select" title="Only learn from names of this entity type">
                    <option value=""${nameGenType === '' ? ' selected' : ''}>All types</option>
                    ${entityTypes.map((t) => html`<option value="${t.key}"${nameGenType === t.key ? ' selected' : ''}>${t.label}</option>`)}
                  </select>`
                : ''
            }
          </div>
          ${
            nameResult.fellBack
              ? html`<p class="thesaurus-hint namegen-fallback-note">Not enough named ${nameGenType ? (Store.getEntityType(nameGenType)?.label.toLowerCase() || 'entities') : 'entities'} yet to learn from (need at least 3); showing classic names instead. Name a few more, then try "Learn from this project" again.</p>`
              : nameGenMode === 'learn'
              ? html`<p class="thesaurus-hint">Trained on this project's own names; reroll for more in the same style.</p>`
              : ''
          }
          <div class="name-chip-list">
            ${nameResult.names.map((n) => html`<span class="name-chip">${n}</span>`)}
          </div>
          <div class="namegen-seed-row">
            <span class="namegen-seed-label">Seed: <code>${nameResult.seed}</code></span>
            <button id="namegen-copy-seed" class="namegen-seed-btn" title="Copy this seed">⧉ Copy</button>
            <input type="text" id="namegen-seed-input" class="namegen-seed-input" placeholder="Paste a seed to reproduce it…" />
            <button id="namegen-use-seed" class="namegen-seed-btn" title="Regenerate using the seed above">↳ Use</button>
          </div>
        </div>

        <div class="thesaurus-section">
          <span class="sb-label">Archeshic Records</span>
          <input type="text" id="thesaurus-input" placeholder="Look up a word (e.g. said, looked, big)…" list="thesaurus-known-words" />
          <datalist id="thesaurus-known-words">
            ${WordTools.thesaurusEntries(custom).map((w) => html`<option value="${w}"></option>`)}
          </datalist>
          <div id="thesaurus-result" class="thesaurus-result"></div>
          <p class="thesaurus-hint">Small, curated list of common overused words, not a full dictionary. Try: ${WordTools.thesaurusEntries(custom).slice(0, 6).join(', ')}…</p>
        </div>

        <div class="thesaurus-section">
          <span class="sb-label">Add a word</span>
          <p class="thesaurus-hint" style="margin-top: 0; margin-bottom: 8px;">
            A word already in the curated list above? Adding it here replaces
            its synonyms with yours for lookup purposes.
          </p>
          <div class="thesaurus-add-row">
            <input type="text" id="thesaurus-add-word" placeholder="Word" />
            <input type="text" id="thesaurus-add-synonyms" placeholder="Synonyms, comma separated" />
            <button id="thesaurus-add-btn">+ Add</button>
          </div>
          ${
            customWords.length
              ? html`<div class="thesaurus-custom-list">
                  ${customWords.map(
                      (w) => html`
                    <span class="custom-thesaurus-chip" data-word="${w}">
                      ${w}: ${custom[w].join(', ')}
                      <button class="custom-thesaurus-remove" data-word="${w}" title="Remove">✕</button>
                    </span>`
                    )}
                </div>`
              : html`<p class="thesaurus-hint">Nothing added yet; anything you add here shows up in the lookup above, and in the suggestions as you type.</p>`
          }
        </div>
    `),
  });

  function reroll(seed = null) {
    const result = Store.generateEntityNames({ mode: nameGenMode, type: nameGenType || null, count: 8, seed });
    renderThesaurusModal(result);
  }

  q('names-reroll').addEventListener('click', () => reroll());

  q('namegen-copy-seed').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(nameResult.seed);
    } catch {
      // Clipboard permission denied or unavailable — the seed is still
      // visible and selectable in the UI, so this fails quietly rather
      // than interrupting with an error for something non-essential.
    }
  });

  q('namegen-use-seed').addEventListener('click', () => {
    const typed = q('namegen-seed-input').value.trim();
    if (!typed) return;
    reroll(typed);
  });
  q('namegen-seed-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') q('namegen-use-seed').click();
  });

  root.querySelectorAll('.namegen-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      nameGenMode = btn.dataset.mode;
      reroll();
    });
  });

  const typeSelect = q('namegen-type-select');
  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      nameGenType = e.target.value;
      reroll();
    });
  }

  q('thesaurus-input').addEventListener('input', (e) => {
    const synonyms = WordTools.lookupSynonyms(e.target.value, Store.getCustomThesaurus());
    const resultEl = q('thesaurus-result');
    if (!e.target.value.trim()) {
      resultEl.innerHTML = '';
    } else if (synonyms) {
      resultEl.innerHTML = toBridge(html`${synonyms.map((s) => html`<span class="synonym-chip">${s}</span>`)}`);
    } else {
      resultEl.innerHTML = toBridge(html`<span class="empty-note">No entry for that word yet.</span>`);
    }
  });

  q('thesaurus-add-btn').addEventListener('click', () => {
    const word = q('thesaurus-add-word').value;
    const synonyms = q('thesaurus-add-synonyms').value.split(',');
    const updated = Store.addThesaurusEntry(word, synonyms);
    if (!updated) return; // empty word or no synonyms left after trimming — nothing to save
    renderThesaurusModal(nameResult); // keep the same name-generator batch, just refresh the records section
  });

  root.querySelectorAll('.custom-thesaurus-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      Store.deleteThesaurusEntry(btn.dataset.word);
      renderThesaurusModal(nameResult);
    });
  });
}
