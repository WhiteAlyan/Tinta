// Historical context: see docs/CODEBASE_NOTES.md#jstagfilter-js-1-4
import { html, q, raw } from './dom-utils.js';

// Historical context: see docs/CODEBASE_NOTES.md#jstagfilter-js-7-34
export function tagFilterBarHtml(idPrefix, activeSet, tagOptions, extraStyle = '') {
  if (!tagOptions.length) return '';
  return html`<div class="library-filter-bar" id="${idPrefix}-tag-filter-bar"${extraStyle ? html` style="${raw(extraStyle)}"` : ''}>
    <div class="library-filter-group">
      <span class="library-filter-label">Tags</span>
      ${tagOptions.map((t) => html`<button class="library-filter-chip${activeSet.has(t) ? ' is-active' : ''}" data-tag="${t}">${t}</button>`)}
    </div>
    ${activeSet.size ? html`<button class="library-filter-clear" id="${idPrefix}-tag-filter-clear">Clear</button>` : ''}
  </div>`;
}

export function wireTagFilterBar(idPrefix, activeSet, onChange) {
  const tagBar = q(`${idPrefix}-tag-filter-bar`);
  if (!tagBar) return;
  tagBar.querySelectorAll('.library-filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      if (activeSet.has(tag)) activeSet.delete(tag);
      else activeSet.add(tag);
      onChange();
    });
  });
  const clearBtn = q(`${idPrefix}-tag-filter-clear`);
  if (clearBtn) clearBtn.addEventListener('click', () => { activeSet.clear(); onChange(); });
}

// Historical context: see docs/CODEBASE_NOTES.md#jstagfilter-js-61-64
export function filterByTagSet(list, activeSet, tagsField = 'tags') {
  if (!activeSet.size) return list;
  return list.filter((item) => [...activeSet].every((t) => (item[tagsField] || []).includes(t)));
}
