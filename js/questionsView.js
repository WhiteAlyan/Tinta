// questionsView (0.2.7 move-out) — the Story Questions dashboard, extracted verbatim.
//
import * as Store from './store.js';
import { html, q, raw, toBridge } from './dom-utils.js';

export function renderQuestionsView(project) {
  const panel = document.querySelector('.view-panel[data-view="questions"]');
  const questions = Store.getStoryQuestionList();
  const allScenes = Store.getAllScenesFlat();
  const sceneOptions = (selected) =>
    toBridge(html`<option value="">None</option>${allScenes.map((s) => html`<option value="${s.id}" ${selected === s.id ? 'selected' : ''}>${s.chapterTitle} → ${s.title}</option>`)}`);
  const sceneLabel = (sid) => {
    const s = allScenes.find((sc) => sc.id === sid);
    return s ? `${s.chapterTitle} → ${s.title}` : null;
  };

  const unresolved = questions.filter((q) => !q.resolved);
  const resolved = questions.filter((q) => q.resolved);

  panel.innerHTML = toBridge(html`
    <div class="questions-header">
      <h2>Story Questions</h2>
      <div class="questions-capture">
        <input type="text" id="question-input" placeholder="What promise does the story make here? e.g. Who sent the letter?" />
        <button id="question-add">+ Add</button>
      </div>
    </div>
    ${
      questions.length === 0
        ? html`<p class="empty-note">Nothing tracked yet. Foreshadowing, mysteries, planted objects, promises made to the reader, anything you'll want to make sure pays off later.</p>`
        : html`
    <div class="questions-section">
      <h3>Open (${unresolved.length})</h3>
      ${unresolved.length ? html`<div class="questions-list" id="questions-open"></div>` : html`<p class="empty-state-sm">Nothing open right now.</p>`}
    </div>
    <div class="questions-section">
      <h3>Resolved (${resolved.length})</h3>
      ${resolved.length ? html`<div class="questions-list" id="questions-resolved"></div>` : html`<p class="empty-state-sm">Nothing resolved yet.</p>`}
    </div>`
    }
  `);

  const input = q('question-input');
  const addQuestion = () => {
    if (!input.value.trim()) return;
    Store.createStoryQuestion({ question: input.value });
    renderQuestionsView(Store.getActiveProject());
  };
  q('question-add').addEventListener('click', addQuestion);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addQuestion(); });

  function questionCard(sq) {
    return html`
      <div class="question-card${sq.resolved ? ' resolved' : ''}" data-question="${sq.id}">
        <label class="question-resolve-row">
          <input type="checkbox" class="question-resolve-check" ${sq.resolved ? 'checked' : ''} />
          <span class="question-text">${sq.question}</span>
        </label>
        <div class="question-scene-row">
          <label>Introduced <select class="question-introduced">${raw(sceneOptions(sq.introducedSceneId))}</select></label>
          <label>Pays off <select class="question-payoff">${raw(sceneOptions(sq.payoffSceneId))}</select></label>
        </div>
        <textarea class="question-notes" placeholder="Notes…" rows="2">${sq.notes || ''}</textarea>
        <button class="question-delete-btn" title="Delete">✕</button>
      </div>`;
  }

  q('questions-open') && (q('questions-open').innerHTML = toBridge(html`${unresolved.map(questionCard)}`));
  q('questions-resolved') && (q('questions-resolved').innerHTML = toBridge(html`${resolved.map(questionCard)}`));

  panel.querySelectorAll('.question-card').forEach((card) => {
    const id = card.dataset.question;
    card.querySelector('.question-resolve-check').addEventListener('change', (e) => {
      Store.updateStoryQuestion(id, { resolved: e.target.checked });
      renderQuestionsView(Store.getActiveProject());
    });
    card.querySelector('.question-introduced').addEventListener('change', (e) => {
      Store.updateStoryQuestion(id, { introducedSceneId: e.target.value || null });
    });
    card.querySelector('.question-payoff').addEventListener('change', (e) => {
      Store.updateStoryQuestion(id, { payoffSceneId: e.target.value || null });
    });
    card.querySelector('.question-notes').addEventListener('blur', (e) => {
      Store.updateStoryQuestion(id, { notes: e.target.value });
    });
    card.querySelector('.question-delete-btn').addEventListener('click', () => {
      Store.deleteStoryQuestion(id);
      renderQuestionsView(Store.getActiveProject());
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsquestionsview-js-93-104
