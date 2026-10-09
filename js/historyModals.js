// historyModals (0.2.7 move-out) — chapter History + entity History modals
// (snapshot lists, diff panes, restore/compare).
//
import * as Diff from './diff.js';
import * as ModalShell from './modal.js';
import * as Store from './store.js';
import { escapeHtml, html, q } from './dom-utils.js';
import { closeModal, confirmDialog, openModal } from './modal.js';
import { renderNotesView } from './notesView.js';
import { renderWriteView } from './writeView.js';

export function openHistoryModal(chapterId, diffAgainstSnapshotId = null) {
  const chapter = Store.getChapter(chapterId);
  const snapshots = Store.getSnapshots(chapterId);

  const diffTarget = diffAgainstSnapshotId ? Store.getSnapshot(chapterId, diffAgainstSnapshotId) : null;

  const root = ModalShell.openModal({
    title: `Revision History · ${escapeHtml(chapter.title)}`,
    className: 'history-modal',
    body: `
        <div class="history-save-row">
          <input type="text" id="snapshot-label" placeholder="Snapshot name (optional)" />
          <button id="snapshot-save">Save Snapshot</button>
        </div>

        ${
          diffTarget
            ? renderDiffPane(diffTarget, chapter)
            : renderSnapshotListPane(snapshots, chapterId)
        }
    `,
  });

  q('snapshot-save').addEventListener('click', () => {
    const label = q('snapshot-label').value;
    Store.createSnapshot(chapterId, label);
    openHistoryModal(chapterId);
  });

  if (diffTarget) {
    q('diff-back')?.addEventListener('click', () => openHistoryModal(chapterId));
    q('diff-restore')?.addEventListener('click', async () => {
      if (!(await ModalShell.confirmDialog({ title: 'Restore this snapshot?', message: `Restore "${diffTarget.label}"? The current text will be auto-snapshotted first, so it isn't lost.`, confirmLabel: 'Restore', danger: false }))) return;
      Store.restoreSnapshot(chapterId, diffTarget.id);
      closeModal();
      renderWriteView(Store.getActiveProject());
    });
  } else {
    root.querySelectorAll('.snapshot-row').forEach((row) => {
      const snapId = row.dataset.snapshot;
      row.querySelector('.snapshot-diff-btn').addEventListener('click', () => openHistoryModal(chapterId, snapId));
      row.querySelector('.snapshot-delete-btn').addEventListener('click', () => {
        Store.deleteSnapshot(chapterId, snapId);
        openHistoryModal(chapterId);
      });
    });
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jshistorymodals-js-61-68
export function renderSnapshotListPane(snapshots, chapterId) {
  if (snapshots.length === 0) {
    return '<p class="empty-note">No snapshots yet. Save one above before a big rewrite, so you can always come back.</p>';
  }
  return `
    <div class="snapshot-list">
      ${snapshots
        .map(
          (s) => `
        <div class="snapshot-row" data-snapshot="${s.id}">
          <div class="snapshot-row-main">
            <strong>${escapeHtml(s.label)}</strong>
            <span class="snapshot-meta">${new Date(s.createdAt).toLocaleString()} · ${s.wordCount} words</span>
          </div>
          <div class="snapshot-row-actions">
            <button class="snapshot-diff-btn">Compare</button>
            <button class="snapshot-delete-btn" title="Delete">✕</button>
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;
}

export function renderDiffPane(snapshot, chapter) {
  const ops = Diff.diffText(snapshot.content, chapter.content);
  const { added, removed } = Diff.diffSummary(ops);

  const html = ops
    .map((op) => {
      const text = escapeHtml(op.text);
      if (op.type === 'add') return `<span class="diff-add">${text}</span>`;
      if (op.type === 'remove') return `<span class="diff-remove">${text}</span>`;
      return `<span class="diff-equal">${text}</span>`;
    })
    .join('');

  return `
    <div class="diff-pane">
      <div class="diff-pane-header">
        <button id="diff-back">← Back to list</button>
        <span class="diff-summary">Comparing "${escapeHtml(snapshot.label)}" → current
          <span class="diff-added-count">+${added}</span>
          <span class="diff-removed-count">-${removed}</span>
        </span>
        <button id="diff-restore">Restore this version</button>
      </div>
      <div class="diff-text">${html}</div>
    </div>
  `;
}

// Historical context: see docs/CODEBASE_NOTES.md#jshistorymodals-js-122-134
export function openEntityHistoryModal(entityId, compareSnapshotId = null) {
  const entity = Store.getEntity(entityId);
  if (!entity) return;
  const snapshots = Store.getEntitySnapshots(entityId);
  const compareSnapshot = compareSnapshotId ? Store.getEntitySnapshot(entityId, compareSnapshotId) : null;

  const root = ModalShell.openModal({
    title: `Revision History · ${escapeHtml(entity.name)}`,
    className: 'history-modal',
    body: `
        ${
          compareSnapshot
            ? ''
            : `<div class="history-save-row">
                <input type="text" id="entity-snapshot-label" placeholder="Snapshot name (optional)" />
                <button id="entity-snapshot-save">Save Snapshot</button>
              </div>`
        }

        ${
          compareSnapshot
            ? renderEntityComparePane(entity, compareSnapshot)
            : snapshots.length === 0
            ? '<p class="empty-note">No snapshots yet. Save one above before a big rewrite, so you can always come back.</p>'
            : `<div class="snapshot-list">
                ${snapshots
                  .map(
                    (s) => `
                  <div class="snapshot-row" data-snapshot="${s.id}">
                    <div class="snapshot-row-main">
                      <strong>${escapeHtml(s.label)}</strong>
                      ${s.auto ? '<span class="entity-status-item-badge">auto</span>' : ''}
                      <span class="snapshot-meta">${new Date(s.createdAt).toLocaleString()}</span>
                    </div>
                    <div class="snapshot-row-actions">
                      <button class="snapshot-diff-btn">Compare</button>
                      <button class="snapshot-delete-btn" title="Delete">✕</button>
                    </div>
                  </div>`
                  )
                  .join('')}
              </div>`
        }
    `,
  });

  if (compareSnapshot) {
    q('entity-compare-back')?.addEventListener('click', () => openEntityHistoryModal(entityId));
    q('entity-compare-restore')?.addEventListener('click', async () => {
      if (!(await ModalShell.confirmDialog({ title: 'Restore this snapshot?', message: `Restore "${compareSnapshot.label}"? The current version will be auto-snapshotted first, so it isn't lost.`, confirmLabel: 'Restore', danger: false }))) return;
      Store.restoreEntitySnapshot(entityId, compareSnapshot.id);
      closeModal();
      renderNotesView(Store.getActiveProject());
    });
    return;
  }

  q('entity-snapshot-save').addEventListener('click', () => {
    const label = q('entity-snapshot-label').value;
    Store.createEntitySnapshot(entityId, label);
    openEntityHistoryModal(entityId);
  });

  root.querySelectorAll('.snapshot-row').forEach((row) => {
    const snapId = row.dataset.snapshot;
    row.querySelector('.snapshot-diff-btn').addEventListener('click', () => openEntityHistoryModal(entityId, snapId));
    row.querySelector('.snapshot-delete-btn').addEventListener('click', () => {
      Store.deleteEntitySnapshot(entityId, snapId);
      openEntityHistoryModal(entityId);
    });
  });
}

export function renderEntityComparePane(entity, snapshot) {
  const changes = Store.getEntitySnapshotChanges(entity.id, snapshot.id);
  const rows = changes.length === 0
    ? '<p class="empty-note">No differences from the current version in any top-level field.</p>'
    : `<div class="entity-compare-list">
        ${changes
          .map(
            (c) => `
          <div class="entity-compare-row">
            <div class="entity-compare-key">${escapeHtml(c.key)}</div>
            <div class="entity-compare-values">
              <span class="diff-remove">${escapeHtml(c.current)}</span>
              <span class="entity-compare-arrow">→</span>
              <span class="diff-add">${escapeHtml(c.snapshot)}</span>
            </div>
          </div>`
          )
          .join('')}
      </div>`;
  return `
    <div class="diff-pane">
      <div class="diff-pane-header">
        <button id="entity-compare-back">← Back to list</button>
        <span class="diff-summary">Comparing "${escapeHtml(snapshot.label)}" → current
          <span class="diff-removed-count">${changes.length} field${changes.length === 1 ? '' : 's'} differ${changes.length === 1 ? 's' : ''}</span>
        </span>
        <button id="entity-compare-restore">Restore this version</button>
      </div>
      ${rows}
    </div>
  `;
}

// Historical context: see docs/CODEBASE_NOTES.md#jshistorymodals-js-241-245

