// Historical context: see docs/CODEBASE_NOTES.md#jsdecisionsview-js-1-15
import * as Store from './store.js';
import { q, html, toBridge } from './dom-utils.js';

export function renderDecisionsView(project) {
  const panel = document.querySelector('.view-panel[data-view="decisions"]');
  const decisions = Store.getDecisionList();

  panel.innerHTML = toBridge(html`
    <div class="snippets-capture decision-log-capture">
      <input type="text" id="decision-input" placeholder="What did you decide?" />
      <input type="text" id="decision-reason-input" placeholder="Why? (optional)" />
      <input type="text" id="decision-alternatives-input" placeholder="What else did you consider? (optional)" />
      <button id="decision-save">+ Log decision</button>
    </div>
    <div class="snippets-list">
      ${
        decisions.length === 0
          ? html`<p class="empty-note">Nothing logged yet. Use this to record why you made a call (which POV, which character dies, which timeline you're sticking with) so future-you doesn't have to reconstruct the reasoning from scratch.</p>`
          : decisions.map(
              (d) => html`
        <div class="snippet-card" data-decision="${d.id}">
          <p><strong>${d.decision}</strong></p>
          ${d.reason ? html`<p class="decision-log-sub">Why: ${d.reason}</p>` : ''}
          ${d.alternatives ? html`<p class="decision-log-sub">Considered: ${d.alternatives}</p>` : ''}
          <div class="snippet-card-footer">
            <span>${new Date(d.createdAt).toLocaleString()}</span>
            <button class="decision-delete-btn" title="Delete">✕</button>
          </div>
        </div>`
            )
      }
    </div>
  `);

  const save = () => {
    const decisionInput = q('decision-input');
    if (!decisionInput.value.trim()) return;
    Store.createDecision({
      decision: decisionInput.value,
      reason: q('decision-reason-input').value,
      alternatives: q('decision-alternatives-input').value,
    });
    renderDecisionsView(Store.getActiveProject());
  };

  q('decision-save').addEventListener('click', save);
  q('decision-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
  });

  panel.querySelectorAll('.decision-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.snippet-card');
      Store.deleteDecision(card.dataset.decision);
      renderDecisionsView(Store.getActiveProject());
    });
  });
}
