// Historical context: see docs/CODEBASE_NOTES.md#jsgeneratormodal-js-1-26

import * as Store from './store.js';
import { requestRender } from './renderBus.js';
import { q, escapeHtml, escapeAttr } from './dom-utils.js';
import { openModal, teardown, noticeDialog } from './modal.js';

export let activeEntityIdFromGenerator = null;
export function clearActiveEntityIdFromGenerator() { activeEntityIdFromGenerator = null; }

export let activeSystemIdFromGenerator = null;
export function clearActiveSystemIdFromGenerator() { activeSystemIdFromGenerator = null; }

export function openWorldbuildingDraftModal(typeKey) {
// Historical context: see docs/CODEBASE_NOTES.md#jsgeneratormodal-js-40-44
  let languageEntityId = '';
  let draft = Store.draftWorldbuildingEntity({ typeKey });
  if (!draft) { teardown(); return; }
  const languageEntities = Store.getLanguageEntities();

  function paint() {
// Historical context: see docs/CODEBASE_NOTES.md#jsgeneratormodal-js-51-56
    const root = openModal({
      title: `Generate a ${escapeHtml(draft.typeLabel)}`,
      className: 'generator-modal',
      body: `
          <p class="settings-note">A starting point, not a finished entity. Edit anything below, or reroll for a different draft. Nothing is saved until you use it.</p>
          ${
            languageEntities.length
              ? `<label class="grammar-field-label">Seed the name from a Language
                  <select id="draft-language">
                    <option value="">Don't use a language (default)</option>
                    ${languageEntities.map((l) => `<option value="${escapeAttr(l.id)}" ${languageEntityId === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
                  </select>
                </label>
                <p class="settings-note">Pulls invented-sounding words out of that Language entity's own fields to shape the generated name; needs a few written already to have anything to learn from.</p>`
              : ''
          }
          <label class="grammar-field-label">Name
            <input type="text" id="draft-name" value="${escapeAttr(draft.name)}" />
          </label>
          ${draft.nameSource === 'language' ? '<p class="settings-note draft-name-source-note">↳ Named using words drawn from the selected Language.</p>' : ''}
          ${
            draft.fields.length
              ? draft.fields
                  .map(
                    (f) => `<label class="grammar-field-label">${escapeHtml(f.label)}
                      <textarea class="draft-field" data-field="${escapeAttr(f.key)}" rows="2">${escapeHtml(draft.customFields[f.key] || '')}</textarea>
                    </label>`
                  )
                  .join('')
              : '<p class="empty-state-sm">This type has no custom fields defined yet, just a generated name.</p>'
          }
          <div class="generator-modal-actions">
            <button id="draft-reroll" class="toolbar-btn">🎲 Reroll all</button>
            <button id="draft-use">Use this draft</button>
          </div>
          <div class="namegen-seed-row">
            <span class="namegen-seed-label">Seed: <code>${escapeHtml(draft.seed)}</code></span>
            <button id="draft-copy-seed" class="namegen-seed-btn" title="Copy this seed">⧉ Copy</button>
            <input type="text" id="draft-seed-input" class="namegen-seed-input" placeholder="Paste a seed to reproduce a draft…" />
            <button id="draft-use-seed" class="namegen-seed-btn" title="Reroll using the seed above">↳ Use</button>
          </div>
      `,
    });

    const languageSelect = q('draft-language');
    if (languageSelect) {
      languageSelect.addEventListener('change', () => {
        languageEntityId = languageSelect.value;
        draft = Store.draftWorldbuildingEntity({ typeKey, languageEntityId: languageEntityId || null });
        paint();
      });
    }

    q('draft-reroll').addEventListener('click', () => {
      draft = Store.draftWorldbuildingEntity({ typeKey, languageEntityId: languageEntityId || null });
      paint();
    });

    q('draft-copy-seed').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(draft.seed);
      } catch {
        // Non-essential — the seed is still visible/selectable in the UI.
      }
    });

    q('draft-use-seed').addEventListener('click', () => {
      const typed = q('draft-seed-input').value.trim();
      if (!typed) return;
      draft = Store.draftWorldbuildingEntity({ typeKey, languageEntityId: languageEntityId || null, seed: typed });
      paint();
    });
    q('draft-seed-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') q('draft-use-seed').click();
    });

    q('draft-use').addEventListener('click', () => {
      const name = q('draft-name').value.trim();
      if (!name) return;
      const customFields = {};
      root.querySelectorAll('.draft-field').forEach((el) => { customFields[el.dataset.field] = el.value; });
      const entity = Store.commitWorldbuildingDraft({ typeKey, name, customFields, seed: draft.seed });
      teardown();
      if (entity) activeEntityIdFromGenerator = entity.id;
      requestRender();
    });
  }

  paint();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsgeneratormodal-js-148-155
const STARTER_SYSTEM_DOMAIN_PRESETS = ['Magic', 'Skill tree', 'Technology', 'Martial arts', 'Cyberware', 'Cosmic Laws'];

export function openStarterSystemModal() {
  const root = openModal({
    title: 'Generate a starter system',
    className: 'generator-modal',
    body: `
        <p class="settings-note">Seeds a tiered node tree you can edit node-by-node afterward: a starting skeleton, not a finished system. Only name/rank/category/effect are generated; cost, cooldown, and the other mechanical fields are left blank on purpose since generic filler there would be misleading rather than useful. Works just as well for a technology tree as a magic system, since it's the same prerequisite-chain shape either way.</p>
        <label class="grammar-field-label">System name
          <input type="text" id="starter-name" placeholder="e.g. Elemental Magic, Cyberware" />
        </label>
        <label class="grammar-field-label">Domain / flavor
          <input type="text" id="starter-domain" placeholder="e.g. fire, hacking, swordsmanship" />
        </label>
        <div class="starter-domain-presets">
          ${STARTER_SYSTEM_DOMAIN_PRESETS.map((d) => `<button type="button" class="wt-menu-item starter-domain-preset-btn" data-domain="${escapeAttr(d)}">${escapeHtml(d)}</button>`).join('')}
        </div>
        <div class="relationship-field-row">
          <label class="grammar-field-label">Tiers
            <input type="number" id="starter-tiers" value="3" min="1" max="8" />
          </label>
          <label class="grammar-field-label">Nodes per tier
            <input type="number" id="starter-per-tier" value="2" min="1" max="6" />
          </label>
        </div>
        <label class="grammar-field-label">Seed (optional)
          <input type="text" id="starter-seed" placeholder="Leave blank for a random one; it'll be saved either way" />
        </label>
        <div class="generator-modal-actions">
          <button id="starter-generate">Generate</button>
        </div>
    `,
  });

  root.querySelectorAll('.starter-domain-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      q('starter-domain').value = btn.dataset.domain;
      if (!q('starter-name').value.trim()) q('starter-name').value = `${btn.dataset.domain} System`;
    });
  });

  q('starter-generate').addEventListener('click', async () => {
    const name = q('starter-name').value.trim();
    const domain = q('starter-domain').value.trim();
    const tierCount = Math.max(1, Math.min(8, Number(q('starter-tiers').value) || 3));
    const perTier = Math.max(1, Math.min(6, Number(q('starter-per-tier').value) || 2));
    const typedSeed = q('starter-seed').value.trim();
    const { system, seed } = Store.generateStarterSystem({ name, domain, tierCount, perTier, seed: typedSeed || null });
    teardown();
    activeSystemIdFromGenerator = system.id;
    requestRender();
// Historical context: see docs/CODEBASE_NOTES.md#jsgeneratormodal-js-207-215
    await noticeDialog({
      title: 'System generated',
      message: `Generated with seed: ${seed}\n\nSame system name/domain/tiers + this seed reproduces the exact same tree.`,
      okLabel: 'Got it',
    });
  });
}
