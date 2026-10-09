// checklistView (0.2.7 move-out) — the Completion Checklist dashboard, extracted verbatim.
//
import * as Store from './store.js';
import { setActiveChapterId, setActiveView } from './context.js';
import { html, toBridge } from './dom-utils.js';
import { requestRender } from './renderBus.js';

export const CHECKLIST_JUMP_VIEW = {
  orphanedEntities: 'health',
  danglingMentions: 'health',
  continuity: 'health',
  styleGuide: 'health',
  storyQuestions: 'questions',
};

export function renderChecklistView(project) {
  const panel = document.querySelector('.view-panel[data-view="checklist"]');
  const checklist = Store.getCompletionChecklist();

  function renderItem(item) {
    const jumpView = CHECKLIST_JUMP_VIEW[item.key];
    return html`
      <div class="checklist-item${item.pass ? ' is-pass' : ''}" data-item="${item.key}">
        <span class="checklist-item-icon">${item.pass ? '✓' : '○'}</span>
        <div class="checklist-item-body">
          <div class="checklist-item-label">${item.label}</div>
          ${item.pass ? '' : html`<div class="checklist-item-detail">${item.detail}</div>`}
          ${
            !item.pass && item.chapters && item.chapters.length
              ? html`<div class="checklist-item-chapters">${item.chapters.map((c) => html`<button class="checklist-chip" data-jump-chapter="${c.id}">${c.title}</button>`)}</div>`
              : ''
          }
        </div>
        ${!item.pass && jumpView ? html`<button class="checklist-item-jump" data-jump-view="${jumpView}">View →</button>` : ''}
      </div>
    `;
  }

  const blocking = checklist.items.filter((i) => i.blocking);
  const info = checklist.items.filter((i) => !i.blocking);

  const totalItems = checklist.items.length;
  const passedItems = checklist.items.filter((i) => i.pass).length;
  const progressPct = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;

  panel.innerHTML = toBridge(html`
    <div class="health-header">
      <h2>Completion Checklist</h2>
      <span class="health-total-note">${checklist.readyToPublish ? 'Everything that matters checks out.' : html`${checklist.blockingCount} item${checklist.blockingCount === 1 ? '' : 's'} to fix before this is ready`}</span>
    </div>

    <div class="checklist-progress-bar" title="${passedItems} of ${totalItems} complete">
      <div class="checklist-progress-fill" style="width: ${progressPct}%"></div>
    </div>
    <p class="health-total-note" style="margin: -8px 0 16px;">${passedItems} of ${totalItems} complete (${progressPct}%)</p>

    <div class="checklist-banner ${checklist.readyToPublish ? 'checklist-banner-ready' : 'checklist-banner-notready'}">
      ${checklist.readyToPublish ? '✓ Ready to publish, as far as Tinta can tell.' : '○ Not quite there yet. See the flagged items below.'}
    </div>

    <div class="health-section">
      <h3>Before you publish</h3>
      <div class="checklist-list">${blocking.map(renderItem)}</div>
    </div>

    <div class="health-section">
      <h3>Worth a look</h3>
      <p class="settings-note">Informational, not blocking, since not every draft needs these to be "done."</p>
      <div class="checklist-list">${info.map(renderItem)}</div>
    </div>
  `);

  panel.querySelectorAll('[data-jump-chapter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveChapterId(btn.dataset.jumpChapter);
      setActiveView('write');
      requestRender();
    });
  });
  panel.querySelectorAll('[data-jump-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveView(btn.dataset.jumpView);
      requestRender();
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jschecklistview-js-79-95
