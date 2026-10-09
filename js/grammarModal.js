// Historical context: see docs/CODEBASE_NOTES.md#jsgrammarmodal-js-1-14

import * as Store from './store.js';
import * as Grammar from './grammar.js';
import { activeView, activeChapterId, currentEditorHandle } from './context.js';
import { openModal, teardown } from './modal.js';
import { html, toBridge, q } from './dom-utils.js';

export function openGrammarModal(chapter) {
  const settings = Store.getGrammarSettings();
  if (!settings.enabled) {
    renderGrammarSettingsModal(chapter);
    return;
  }
  renderGrammarLoadingModal(chapter);
  runGrammarCheck(chapter, settings);
}

async function runGrammarCheck(chapter, settings) {
  const result = await Grammar.checkText(chapter.content, settings);
  // The check is async — by the time it resolves, the person may have
  // closed the modal or navigated elsewhere. Bail quietly rather than
  // popping a modal back open over whatever they're doing now.
  if (!q('modal-root').querySelector('.grammar-modal')) return;

  if (!result.ok) {
    renderGrammarErrorModal(chapter, result.error);
    return;
  }
// Historical context: see docs/CODEBASE_NOTES.md#jsgrammarmodal-js-43-46
  const filtered = result.matches.filter((m) => !Store.isDictionaryIgnored(chapter.content.slice(m.offset, m.offset + m.length)));
// Historical context: see docs/CODEBASE_NOTES.md#jsgrammarmodal-js-48-52
  const styleMatches = Store.scanTextForStyleViolations(chapter.content, Store.getStyleGuideRules()).filter(
    (m) => !Store.isDictionaryIgnored(chapter.content.slice(m.offset, m.offset + m.length))
  );
  renderGrammarResultsModal(chapter, [...filtered, ...styleMatches].sort((a, b) => a.offset - b.offset));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsgrammarmodal-js-59-63
function runStyleGuideOnlyCheck(chapter) {
  const styleMatches = Store.scanTextForStyleViolations(chapter.content, Store.getStyleGuideRules()).filter(
    (m) => !Store.isDictionaryIgnored(chapter.content.slice(m.offset, m.offset + m.length))
  );
  renderGrammarResultsModal(chapter, styleMatches);
}

function grammarModalShell(bodyHtml, { title = 'Grammar & Style Check' } = {}) {
// Historical context: see docs/CODEBASE_NOTES.md#jsgrammarmodal-js-72-78
  openModal({ title, className: 'grammar-modal', body: toBridge(bodyHtml) });
}

function renderGrammarLoadingModal(chapter) {
  grammarModalShell(html`<p class="empty-note">Checking "${chapter.title}"…</p>`);
}

function renderGrammarErrorModal(chapter, message) {
  grammarModalShell(html`
    <p class="grammar-error">${message}</p>
    <div class="grammar-error-actions">
      <button id="grammar-retry">↻ Try again</button>
      <button id="grammar-open-settings">⚙ Settings</button>
    </div>
  `);
  q('grammar-retry').addEventListener('click', () => openGrammarModal(chapter));
  q('grammar-open-settings').addEventListener('click', () => renderGrammarSettingsModal(chapter));
}

function renderGrammarSettingsModal(chapter) {
  const s = Store.getGrammarSettings();
  grammarModalShell(
    html`
    <p class="grammar-settings-intro">
      Sends this chapter's text to the endpoint below when you run a check.
      Everything else in Tinta stays fully offline; this is opt-in.
    </p>
    <label class="grammar-field-label grammar-toggle-row">
      <input type="checkbox" id="grammar-enabled" ${s.enabled ? 'checked' : ''} />
      Enable grammar &amp; style check
    </label>
    <label class="grammar-field-label">Backend
      <select id="grammar-format">
        <option value="languagetool" ${s.responseFormat !== 'raw' ? 'selected' : ''}>LanguageTool (public API or self-hosted)</option>
        <option value="raw" ${s.responseFormat === 'raw' ? 'selected' : ''}>Custom endpoint (e.g. Archemedeus)</option>
      </select>
    </label>
    <label class="grammar-field-label">Endpoint URL
      <input type="text" id="grammar-endpoint" value="${s.endpointUrl}" placeholder="https://api.languagetool.org/v2/check" />
    </label>
    <label class="grammar-field-label">Language code
      <input type="text" id="grammar-language" value="${s.language}" placeholder="en-US" />
    </label>
    <details class="grammar-advanced">
      <summary>Advanced (LanguageTool Plus account, optional)</summary>
      <label class="grammar-field-label">Username
        <input type="text" id="grammar-username" value="${s.username}" />
      </label>
      <label class="grammar-field-label">API key
        <input type="password" id="grammar-apikey" value="${s.apiKey}" />
      </label>
    </details>
    <p class="grammar-settings-note">
      "Custom endpoint" expects a POST of <code>{ text, language }</code> as JSON,
      returning <code>{ matches: [...] }</code>: the seam for pointing this at a
      self-hosted checker instead of LanguageTool's schema.
    </p>
    <details class="grammar-advanced">
      <summary>Custom dictionary</summary>
      <p class="settings-note">Words you've told Tinta to stop flagging in this project (usually invented names).</p>
      <ul class="pronunciation-list" id="dictionary-list"></ul>
    </details>
    <details class="grammar-advanced">
      <summary>Style guide</summary>
      <p class="settings-note">Preferred spelling/naming pairs for this project; checked alongside grammar results, and rolled up project-wide on the Health dashboard. Runs entirely offline.</p>
      <ul class="pronunciation-list" id="styleguide-list"></ul>
      <div class="styleguide-add-row">
        <input type="text" id="styleguide-incorrect-input" placeholder="Wrong form, e.g. Traveller" />
        <span class="styleguide-arrow">→</span>
        <input type="text" id="styleguide-preferred-input" placeholder="Preferred, e.g. Traveler" />
        <input type="text" id="styleguide-note-input" placeholder="Note (optional)" />
        <button id="styleguide-add-btn" class="toolbar-btn">+ Add</button>
      </div>
      <button id="styleguide-check-btn" class="grammar-offline-check-btn">Check style guide only (offline)</button>
    </details>
    <div class="grammar-settings-actions">
      <button id="grammar-save">Save &amp; Check</button>
    </div>
  `,
    { title: 'Grammar Check Settings' }
  );
  renderDictionaryList();
  renderStyleGuideList();

  q('styleguide-check-btn').addEventListener('click', () => runStyleGuideOnlyCheck(chapter));

  q('grammar-save').addEventListener('click', () => {
    const patch = {
      enabled: q('grammar-enabled').checked,
      responseFormat: q('grammar-format').value,
      endpointUrl: q('grammar-endpoint').value.trim(),
      language: q('grammar-language').value.trim() || 'en-US',
      username: q('grammar-username').value.trim(),
      apiKey: q('grammar-apikey').value.trim(),
    };
    const updated = Store.setGrammarSettings(patch);
    if (updated.enabled) {
      renderGrammarLoadingModal(chapter);
      runGrammarCheck(chapter, updated);
    } else {
      teardown();
    }
  });
}

function renderDictionaryList() {
  const list = q('dictionary-list');
  if (!list) return;
  const words = Store.getCustomDictionary();
// Historical context: see docs/CODEBASE_NOTES.md#jsgrammarmodal-js-188-191
  list.innerHTML = toBridge(
    words.length
      ? html`${words.map(
          (w) => html`
      <li class="pronunciation-item" data-word="${w}">
        <span>${w}</span>
        <button class="pronunciation-delete-btn" title="Remove">✕</button>
      </li>`
        )}`
      : html`<li class="empty-note">Nothing ignored yet.</li>`
  );

  list.querySelectorAll('.pronunciation-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      Store.removeFromCustomDictionary(btn.closest('.pronunciation-item').dataset.word);
      renderDictionaryList();
    });
  });
}

function renderStyleGuideList() {
  const list = q('styleguide-list');
  if (!list) return;
  const rules = Store.getStyleGuideRules();
  // Same migration as renderDictionaryList above.
  list.innerHTML = toBridge(
    rules.length
      ? html`${rules.map(
          (r) => html`
      <li class="pronunciation-item" data-rule="${r.id}">
        <span>“${r.incorrect}” → “${r.preferred}”${r.note ? html` <span class="health-row-sub">· ${r.note}</span>` : ''}</span>
        <button class="pronunciation-delete-btn" title="Remove">✕</button>
      </li>`
        )}`
      : html`<li class="empty-note">No style guide rules yet.</li>`
  );

  list.querySelectorAll('.pronunciation-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      Store.deleteStyleGuideRule(btn.closest('.pronunciation-item').dataset.rule);
      renderStyleGuideList();
    });
  });

  const addBtn = q('styleguide-add-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      const incorrectInput = q('styleguide-incorrect-input');
      const preferredInput = q('styleguide-preferred-input');
      const noteInput = q('styleguide-note-input');
      if (!incorrectInput.value.trim() || !preferredInput.value.trim()) return;
      Store.addStyleGuideRule({ incorrect: incorrectInput.value, preferred: preferredInput.value, note: noteInput.value });
      incorrectInput.value = '';
      preferredInput.value = '';
      noteInput.value = '';
      renderStyleGuideList();
    };
  }
}

function grammarMatchContext(content, match) {
  const CONTEXT_PAD = 40;
  const start = Math.max(0, match.offset - CONTEXT_PAD);
  const end = Math.min(content.length, match.offset + match.length + CONTEXT_PAD);
  const before = content.slice(start, match.offset);
  const flagged = content.slice(match.offset, match.offset + match.length);
  const after = content.slice(match.offset + match.length, end);
  return `${start > 0 ? '…' : ''}${escapeHtml(before)}<mark class="grammar-flag">${escapeHtml(flagged)}</mark>${escapeHtml(after)}${end < content.length ? '…' : ''}`;
}

function renderGrammarResultsModal(chapter, matches) {
  grammarModalShell(`
    <div class="grammar-results-header">
      <span class="grammar-results-count">${matches.length === 0 ? 'No issues found' : `${matches.length} item${matches.length === 1 ? '' : 's'} found`}</span>
      <div class="grammar-results-actions">
        <button id="grammar-recheck">↻ Re-check</button>
        <button id="grammar-settings-link">⚙ Settings</button>
      </div>
    </div>
    ${
      matches.length === 0
        ? '<p class="empty-note">Nothing flagged, nice and clean.</p>'
        : `<div class="grammar-match-list">
      ${matches
        .map(
          (m) => `
        <div class="grammar-match-card" data-match="${m.id}">
          <div class="grammar-match-head">
            <span class="grammar-category-tag">${escapeHtml(m.category)}</span>
            <div class="grammar-match-head-actions">
              <button class="grammar-ignore-btn" title="Never flag this word again in this project">Ignore word</button>
              <button class="grammar-dismiss-btn" title="Dismiss">✕</button>
            </div>
          </div>
          <p class="grammar-match-message">${escapeHtml(m.shortMessage)}</p>
          <p class="grammar-match-context">${grammarMatchContext(chapter.content, m)}</p>
          ${
            m.replacements.length
              ? `<div class="grammar-replacements">
                ${m.replacements.map((r) => `<button class="grammar-replacement-chip" data-value="${escapeAttr(r)}">${escapeHtml(r)}</button>`).join('')}
              </div>`
              : ''
          }
        </div>`
        )
        .join('')}
    </div>`
    }
  `);

  q('grammar-recheck').addEventListener('click', () => openGrammarModal(chapter));
  q('grammar-settings-link').addEventListener('click', () => renderGrammarSettingsModal(chapter));

  q('modal-root').querySelectorAll('.grammar-dismiss-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.grammar-match-card').remove();
    });
  });

  q('modal-root').querySelectorAll('.grammar-ignore-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.grammar-match-card');
      const matchId = card.dataset.match;
      const match = matches.find((m) => m.id === matchId);
      if (!match) return;
      const flagged = chapter.content.slice(match.offset, match.offset + match.length);
      Store.addToCustomDictionary(flagged);
// Historical context: see docs/CODEBASE_NOTES.md#jsgrammarmodal-js-319-323
      q('modal-root').querySelectorAll('.grammar-match-card').forEach((otherCard) => {
        const otherMatch = matches.find((m) => m.id === otherCard.dataset.match);
        if (otherMatch && chapter.content.slice(otherMatch.offset, otherMatch.offset + otherMatch.length).trim().toLowerCase() === flagged.trim().toLowerCase()) {
          otherCard.remove();
        }
      });
    });
  });

  q('modal-root').querySelectorAll('.grammar-replacement-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.grammar-match-card');
      const matchId = card.dataset.match;
      const match = matches.find((m) => m.id === matchId);
      if (!match) return;
      applyGrammarReplacement(chapter.id, match, btn.dataset.value);
// Historical context: see docs/CODEBASE_NOTES.md#jsgrammarmodal-js-340-344
      openGrammarModal(Store.getChapter(chapter.id));
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsgrammarmodal-js-350-357
function applyGrammarReplacement(chapterId, match, replacement) {
  const chapter = Store.getChapter(chapterId);
  if (!chapter) return;
  const before = chapter.content.slice(0, match.offset);
  const after = chapter.content.slice(match.offset + match.length);
  const newContent = before + replacement + after;

  const textarea = q('chapter-editor');
  if (activeView === 'write' && activeChapterId === chapterId && textarea) {
    textarea.value = newContent;
    textarea.dispatchEvent(new Event('input'));
// Historical context: see docs/CODEBASE_NOTES.md#jsgrammarmodal-js-369-372
    currentEditorHandle?.flush();
  } else {
    Store.updateChapterContent(chapterId, newContent);
  }
}
