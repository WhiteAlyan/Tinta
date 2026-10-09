// outlineView (0.2.7 move-out) — the Outline view, extracted verbatim.
//
import * as Store from './store.js';
import { setActiveChapterId, setActiveView } from './context.js';
import { escapeHtml, html, raw, toBridge } from './dom-utils.js';
import { renderMentionsHtml } from './mentions.js';
import { requestRender } from './renderBus.js';

export function renderOutlineView(project) {
  const panel = document.querySelector('.view-panel[data-view="outline"]');
  const chapters = [...project.chapters].sort((a, b) => a.order - b.order);
  const totalWords = chapters.reduce((sum, c) => sum + Store.wordCount(c.content), 0);
  const groups = Store.groupChaptersByPart(chapters);
  const hasParts = groups.some((g) => g.part);

  panel.innerHTML = toBridge(html`
    <div class="outline-header">
      <h2>Outline</h2>
      <p>${chapters.length} chapters · ${totalWords.toLocaleString()} words</p>
    </div>
    <div class="outline-groups"></div>
  `);

  const root = panel.querySelector('.outline-groups');

  const renderChapterLi = (chapter) => {
    const li = document.createElement('li');
    li.className = 'outline-item';
    const rawSynopsis = chapter.scenes.map((s) => s.goal).filter(Boolean).join(' → ');
    const synopsis = rawSynopsis
      ? renderMentionsHtml(rawSynopsis, (name) => !!Store.findEntityByName(name), escapeHtml)
      : '<em>No scene goals yet.</em>';
    li.innerHTML = toBridge(html`
      <div class="outline-item-head">
        <span class="status-dot dot-${chapter.status}"></span>
        <strong>${chapter.title}</strong>
        <span class="outline-wc">${Store.wordCount(chapter.content)} words</span>
      </div>
      <div class="outline-synopsis">${raw(synopsis)}</div>
    `);
    li.addEventListener('click', () => {
      setActiveChapterId(chapter.id);
      setActiveView('write');
      requestRender();
    });
    return li;
  };

  groups.forEach(({ part, chapters: partChapters }) => {
    if (partChapters.length === 0) return;
    // Same "only show structure a project actually opted into" rule as
    // Corkboard's groupChaptersByPart usage above.
    if (part) {
      const header = document.createElement('div');
      header.className = 'outline-part-header';
      header.innerHTML = toBridge(html`<h2>${part.title}</h2>`);
      root.appendChild(header);
    } else if (hasParts) {
      const header = document.createElement('div');
      header.className = 'outline-part-header outline-part-unassigned';
      header.innerHTML = toBridge(html`<h2>Not in a part</h2>`);
      root.appendChild(header);
    }
    const list = document.createElement('ol');
    list.className = 'outline-list';
    partChapters.forEach((chapter) => list.appendChild(renderChapterLi(chapter)));
    root.appendChild(list);
  });
}
