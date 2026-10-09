// Historical context: see docs/CODEBASE_NOTES.md#jstoast-js-1-39

import { html, toBridge, q } from './dom-utils.js';
import { els } from './els.js';
import * as Store from './store.js';

let toastDismissTimer = null;

function renderToast(bodyHtml, { icon, actionLabel = null, onAction = null, duration }) {
  const root = els.celebrationToastRoot;
  root.innerHTML = toBridge(html`
    <div class="celebration-toast">
      <span class="celebration-toast-icon">${icon}</span>
      <div class="celebration-toast-body">${bodyHtml}</div>
      ${actionLabel ? html`<button class="celebration-toast-action">${actionLabel}</button>` : ''}
      <button class="celebration-toast-dismiss" title="Dismiss">✕</button>
    </div>
  `);
  const dismiss = () => {
    root.innerHTML = '';
  };
  root.querySelector('.celebration-toast-dismiss').addEventListener('click', dismiss);
  if (actionLabel && onAction) {
    root.querySelector('.celebration-toast-action').addEventListener('click', () => {
      dismiss();
      onAction();
    });
  }
  clearTimeout(toastDismissTimer);
  toastDismissTimer = setTimeout(dismiss, duration);
}

// Historical context: see docs/CODEBASE_NOTES.md#jstoast-js-71-76
export function showGoalCelebration(project) {
  const streak = Store.getCurrentStreak();
  renderToast(
    html`<strong>Daily goal hit!</strong><span>${project.wordGoal.toLocaleString()} words${streak > 1 ? html` · ${streak}-day streak` : ''}</span>`,
    { icon: '🎉', duration: 5000 }
  );
}

// Same bottom-right, non-blocking treatment as the goal celebration above,
// via the shared renderToast() shell — written to fit any "thing happened,
// here's an optional next step" moment without a new element.
export function showToast(message, { icon = '✓', actionLabel = null, onAction = null } = {}) {
  renderToast(html`<span>${message}</span>`, { icon, actionLabel, onAction, duration: 6000 });
}

export function showStorageWarning(message, options = {}) {
  const { actionLabel = null, onAction = null, persistent = false } = options;
  els.storageWarningRoot.innerHTML = toBridge(html`
    <div class="storage-warning-banner">
      <span>${message}</span>
      ${actionLabel ? html`<button id="storage-warning-action">${actionLabel}</button>` : ''}
      ${persistent ? '' : html`<button id="storage-warning-dismiss" title="Dismiss">✕</button>`}
    </div>
  `);
  q('storage-warning-dismiss')?.addEventListener('click', () => {
    els.storageWarningRoot.innerHTML = '';
  });
  q('storage-warning-action')?.addEventListener('click', () => onAction?.());
}
