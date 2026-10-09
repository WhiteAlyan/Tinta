// P2-7 fix — recovery toast. Non-blocking UI shown on boot if a
// previous session ended with a quota-exceeded save that landed an
// in-memory snapshot in IndexedDB but never reached localStorage.
//
// Flow:
//   1. On boot, app.js init() calls RecoveryToast.maybeShow().
//   2. maybeShow() reads Store.getRecoverySnapshot() (async). If no
//      snapshot exists, returns silently.
//   3. If a snapshot exists, compares snapshot.rev to the disk db's
//      rev. If snapshot.rev <= disk db's rev, the snapshot is stale
//      (the retry timer eventually succeeded before the tab closed)
//      and is silently cleared.
//   4. Otherwise, renders a non-blocking toast at the bottom-right
//      with two buttons: "Restore recovered changes" and "Discard".
//   5. Restore: replaceDb(snapshot) → save() → clearRecoverySnapshot().
//      If save() fails again (still over quota), the snapshot stays
//      in IndexedDB for the next boot and the toast re-renders with
//      an honest "still over quota" message. Either way, dismiss the
//      toast after the action.
//   6. Discard: clearRecoverySnapshot() and dismiss the toast.
//
// The toast is non-blocking so the writer can look at the current
// state before deciding whether to restore. It also auto-stays-open
// until the writer acts — no timeout dismissal, because losing the
// only chance to recover is worse than a lingering UI element.

import * as Store from './store.js';
import { replaceDb, save, isCrossTabStale } from './store-core.js';
import { html, toBridge } from './dom-utils.js';
import { requestRender } from './renderBus.js';

let toastEl = null;

export async function maybeShow() {
  if (toastEl) return; // already showing
  let snapshot;
  try {
    snapshot = await Store.getRecoverySnapshot();
  } catch {
    return; // IndexedDB unavailable — no recovery possible
  }
  if (!snapshot) return; // no snapshot, nothing to do

  // Stale-snapshot check: if the disk db's rev is >= the snapshot's
  // rev, the retry timer eventually succeeded (or the writer manually
  // saved after the snapshot was taken) and the snapshot is stale.
  // Silently clear it and return.
  const diskDb = Store.getActiveDb();
  const diskRev = diskDb?.rev || 0;
  const snapshotRev = snapshot?.rev || 0;
  if (snapshotRev <= diskRev) {
    try { await Store.clearRecoverySnapshot(); } catch {}
    return;
  }

  renderToast({ snapshot, diskRev, snapshotRev });
}

function renderToast({ snapshot, diskRev, snapshotRev }) {
  if (toastEl) return;
  toastEl = document.createElement('div');
  toastEl.id = 'recovery-toast';
  toastEl.className = 'recovery-toast';

  // Figure out a friendly description of what's in the snapshot —
  // the writer needs to decide whether to restore, so show them
  // chapter count + which project the snapshot is for.
  const projects = Object.values(snapshot.projects || {});
  const chapters = projects.reduce((n, p) => n + (p.chapters?.length || 0), 0);
  const projectTitle = projects[0]?.title || 'a project';

  toastEl.innerHTML = toBridge(html`
    <div class="recovery-toast-content">
      <div class="recovery-toast-icon" aria-hidden="true">\u26A0</div>
      <div class="recovery-toast-body">
        <h2 class="recovery-toast-title">Unsaved changes recovered</h2>
        <p class="recovery-toast-desc">
          The last session ended while storage was full. ${chapters} chapter${chapters === 1 ? '' : 'es'} from <em>${projectTitle}</em> were preserved and can be restored.
        </p>
        <p class="recovery-toast-meta">
          Snapshot rev ${snapshotRev} &middot; disk rev ${diskRev} &middot; <a href="#" class="recovery-toast-what" data-action="explain">What does this mean?</a>
        </p>
      </div>
      <div class="recovery-toast-actions">
        <button class="recovery-toast-btn recovery-toast-discard" data-action="discard">Discard</button>
        <button class="recovery-toast-btn recovery-toast-restore" data-action="restore">Restore changes</button>
      </div>
    </div>
  `);

  document.body.appendChild(toastEl);
  // Fade in next frame so the transition runs.
  requestAnimationFrame(() => toastEl.classList.add('visible'));

  toastEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'explain') {
      btn.outerHTML = '<span class="recovery-toast-explain">A previous Tinta session ended while your browser storage was full. Your in-memory work was preserved in a separate IndexedDB store, but never reached the main localStorage database. Restoring will replace your current state with the recovered snapshot — make sure no other tab has unsaved changes first.</span>';
      return;
    }
    if (action === 'discard') {
      try { await Store.clearRecoverySnapshot(); } catch {}
      dismiss();
      return;
    }
    if (action === 'restore') {
      // Cross-tab-stale check — if another tab just saved a higher
      // rev, we can't safely replace the db from this tab without
      // throwing the same "tab paused" error importFullBackup throws.
      if (isCrossTabStale()) {
        showToastError('This tab is paused because another tab just saved. Reload this tab, then try the restore again.');
        return;
      }
      // Replace the in-memory db with the snapshot, then try to save.
      // If save succeeds, the snapshot is now on disk; clear it.
      // If save fails again (still over quota), the snapshot stays
      // in IndexedDB and the writer can manually export the db via
      // File → Export Backup to free up space, then retry on next boot.
      try {
        replaceDb(snapshot);
        const ok = save();
        if (ok) {
          try { await Store.clearRecoverySnapshot(); } catch {}
          dismiss();
          requestRender(); // re-render all views with the restored state
        } else {
          // Save failed — could be quota again or stale. Show an
          // honest message and leave the snapshot for next boot.
          showToastError('Storage is still full. The snapshot stays preserved for next time. Try File → Export Backup to free space, then reload.');
        }
      } catch (err) {
        showToastError(`Could not restore: ${err.message || 'unknown error'}`);
      }
    }
  });
}

function showToastError(message) {
  if (!toastEl) return;
  const existing = toastEl.querySelector('.recovery-toast-error');
  if (existing) existing.remove();
  const errEl = document.createElement('p');
  errEl.className = 'recovery-toast-error';
  errEl.textContent = message;
  toastEl.querySelector('.recovery-toast-body')?.appendChild(errEl);
}

function dismiss() {
  if (!toastEl) return;
  const el = toastEl;
  toastEl = null;
  el.classList.remove('visible');
  setTimeout(() => el.remove(), 250); // match CSS transition
}
