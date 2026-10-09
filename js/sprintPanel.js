// Historical context: see docs/CODEBASE_NOTES.md#jssprintpanel-js-1-25

import * as Store from './store.js';
import * as Sprint from './sprint.js';
import { closeModal } from './modal.js';
import { html, toBridge, q } from './dom-utils.js';

let sprintState = { status: 'idle' };
let sprintTickId = null;

export function startSprint({ mode, minutes }) {
  const project = Store.getActiveProject();
  sprintState = {
    status: 'running',
    mode,
    durationMs: mode === 'countdown' ? minutes * 60000 : null,
    startedAt: Date.now(),
    baselineWords: Store.getTotalWordCount(project),
    projectId: project.id,
  };
  q('sprint-btn').classList.add('active');
  if (sprintTickId) clearInterval(sprintTickId);
  sprintTickId = setInterval(sprintTick, 1000);
  sprintTick(); // paint immediately rather than waiting a full second for the first update
}

function sprintTick() {
  if (sprintState.status !== 'running') return;

// Historical context: see docs/CODEBASE_NOTES.md#jssprintpanel-js-54-58
  if (Store.getActiveProject().id !== sprintState.projectId) {
    cancelSprint();
    return;
  }

  const now = Date.now();
  const words = Sprint.wordsWritten(Store.getTotalWordCount(), sprintState.baselineWords);

  if (sprintState.mode === 'countdown') {
    const remaining = Sprint.remainingMs(sprintState.startedAt, sprintState.durationMs, now);
    q('sprint-btn').textContent = `⏱ ${Sprint.formatClock(remaining)}`;
    if (remaining <= 0) {
      endSprint();
      return;
    }
  } else {
    q('sprint-btn').textContent = `⏱ ${Sprint.formatClock(Sprint.elapsedMs(sprintState.startedAt, now))}`;
  }

// Historical context: see docs/CODEBASE_NOTES.md#jssprintpanel-js-78-81
  if (q('modal-root').querySelector('.sprint-modal-active')) {
    renderSprintActivePanel(words, now);
  }
}

// Ends the sprint and shows the summary — the countdown hitting zero and
// clicking "End sprint" early both funnel through here so there's exactly
// one place that computes the final numbers.
function endSprint() {
  const words = Sprint.wordsWritten(Store.getTotalWordCount(), sprintState.baselineWords);
  const elapsed = Sprint.elapsedMs(sprintState.startedAt);
  sprintState = { ...sprintState, status: 'ended', finalWords: words, finalElapsedMs: elapsed };
  stopSprintTimer();
  openSprintModal(); // surface the summary even if the modal wasn't open when time ran out — same "the timer going off is the point" reasoning a kitchen timer has
}

// A project switch mid-sprint, specifically — not a manual end, so no
// summary. See the comment in sprintTick() for why the numbers wouldn't
// mean anything here.
function cancelSprint() {
  stopSprintTimer();
  sprintState = { status: 'idle' };
}

function stopSprintTimer() {
  if (sprintTickId) clearInterval(sprintTickId);
  sprintTickId = null;
  const btn = q('sprint-btn');
  btn.classList.remove('active');
  btn.textContent = '⏱ Sprint';
}

export function openSprintModal() {
  const root = q('modal-root');

  if (sprintState.status === 'running') {
    const words = Sprint.wordsWritten(Store.getTotalWordCount(), sprintState.baselineWords);
    root.innerHTML = toBridge(html`
      <div class="modal-backdrop">
        <div class="modal-panel sprint-modal sprint-modal-active">
          <div class="modal-header">
            <h2>Writing Sprint</h2>
            <button id="modal-close" class="modal-close">✕</button>
          </div>
          <div id="sprint-active-panel"></div>
          <button id="sprint-end-btn" class="sprint-end-btn">End Sprint</button>
        </div>
      </div>
    `);
    renderSprintActivePanel(words, Date.now());
    q('sprint-end-btn').addEventListener('click', endSprint);
  } else if (sprintState.status === 'ended') {
    const minutes = Math.floor(sprintState.finalElapsedMs / 60000);
    const seconds = Math.round((sprintState.finalElapsedMs % 60000) / 1000);
    const wpm = Sprint.computeWpm(sprintState.finalWords, sprintState.finalElapsedMs);
    root.innerHTML = toBridge(html`
      <div class="modal-backdrop">
        <div class="modal-panel sprint-modal">
          <div class="modal-header">
            <h2>Sprint Complete</h2>
            <button id="modal-close" class="modal-close">✕</button>
          </div>
          <div class="sprint-summary-grid">
            <div class="stats-card"><div class="stats-card-value">${sprintState.finalWords.toLocaleString()}</div><div class="stats-card-label">Words written</div></div>
            <div class="stats-card"><div class="stats-card-value">${minutes}:${String(seconds).padStart(2, '0')}</div><div class="stats-card-label">Duration</div></div>
            <div class="stats-card"><div class="stats-card-value">${wpm}</div><div class="stats-card-label">Words / min</div></div>
          </div>
          <button id="sprint-again-btn" class="sprint-end-btn">Start Another Sprint</button>
        </div>
      </div>
    `);
    q('sprint-again-btn').addEventListener('click', () => {
      sprintState = { status: 'idle' };
      openSprintModal();
    });
  } else {
    root.innerHTML = toBridge(html`
      <div class="modal-backdrop">
        <div class="modal-panel sprint-modal">
          <div class="modal-header">
            <h2>Writing Sprint</h2>
            <button id="modal-close" class="modal-close">✕</button>
          </div>
          <p class="sprint-note">Pick a length, or go open-ended and stop whenever. Tracks words added across the whole project this sitting; switch chapters mid-sprint and it keeps counting.</p>
          <div class="sprint-presets">
            ${Sprint.DURATION_PRESETS_MIN.map((m) => html`<button class="sprint-preset-btn" data-minutes="${m}">${m} min</button>`)}
          </div>
          <button id="sprint-open-btn" class="sprint-open-btn">Open-ended (no timer)</button>
        </div>
      </div>
    `);
    root.querySelectorAll('.sprint-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        startSprint({ mode: 'countdown', minutes: Number(btn.dataset.minutes) });
        openSprintModal();
      });
    });
    q('sprint-open-btn').addEventListener('click', () => {
      startSprint({ mode: 'open' });
      openSprintModal();
    });
  }

  q('modal-close').addEventListener('click', closeModal);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
}

function renderSprintActivePanel(words, now) {
  const panel = q('sprint-active-panel');
  if (!panel) return;
  const clock =
    sprintState.mode === 'countdown'
      ? Sprint.formatClock(Sprint.remainingMs(sprintState.startedAt, sprintState.durationMs, now))
      : Sprint.formatClock(Sprint.elapsedMs(sprintState.startedAt, now));
  panel.innerHTML = toBridge(html`
    <div class="sprint-summary-grid">
      <div class="stats-card"><div class="stats-card-value">${clock}</div><div class="stats-card-label">${sprintState.mode === 'countdown' ? 'Time left' : 'Elapsed'}</div></div>
      <div class="stats-card"><div class="stats-card-value">${words.toLocaleString()}</div><div class="stats-card-label">Words this sprint</div></div>
    </div>
  `);
}
