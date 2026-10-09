// Historical context: see docs/CODEBASE_NOTES.md#jshealthview-js-1-26
import * as Store from './store.js';
import { html, raw, toBridge, escapeAttr } from './dom-utils.js';
import { requestRender } from './renderBus.js';
import { openTarget } from './targets.js';

// Historical context: see docs/CODEBASE_NOTES.md#jshealthview-js-32-36
let healthChangesRange = 'week';

// Historical context: see docs/CODEBASE_NOTES.md#jshealthview-js-39-42

// Historical context: see docs/CODEBASE_NOTES.md#jshealthview-js-44-47
function healthChangesSinceIso(range) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === 'week') d.setDate(d.getDate() - 6);
  if (range === 'month') d.setDate(d.getDate() - 29);
  return d.toISOString();
}

export function renderHealthView(project) {
  const panel = document.querySelector('.view-panel[data-view="health"]');
  const report = Store.getProjectHealthReport();
  const changes = Store.getChangesSince(healthChangesSinceIso(healthChangesRange));
  const totalTouched = changes.chaptersChanged.length + changes.entitiesAdded.length + changes.entitiesChanged.length + changes.relationshipsAdded + changes.timelineEventsAdded.length + changes.scenesTouched.length;

  panel.innerHTML = toBridge(html`
    <div class="health-header">
      <h2>Project Health</h2>
      <span class="health-total-note">${report.totalIssues === 0 ? 'No issues found · nicely tended.' : `${report.totalIssues} item${report.totalIssues === 1 ? '' : 's'} worth a look`}</span>
    </div>

    <div class="health-section">
      <div class="health-changes-head">
        <h3>What's changed</h3>
        <div class="health-range-toggle">
          <button type="button" class="health-range-btn${healthChangesRange === 'today' ? ' active' : ''}" data-range="today">Today</button>
          <button type="button" class="health-range-btn${healthChangesRange === 'week' ? ' active' : ''}" data-range="week">This week</button>
          <button type="button" class="health-range-btn${healthChangesRange === 'month' ? ' active' : ''}" data-range="month">This month</button>
        </div>
      </div>
      ${
        totalTouched === 0
          ? html`<p class="empty-state-sm">Nothing touched in this window.</p>`
          : html`<div class="health-changes-grid">
              ${changes.chaptersChanged.length ? html`<div class="health-changes-item"><strong>${changes.chaptersChanged.length}</strong> chapter${changes.chaptersChanged.length === 1 ? '' : 's'} edited <span class="health-row-sub">${changes.chaptersChanged.map((c) => c.title).join(', ')}</span></div>` : ''}
              ${changes.entitiesAdded.length ? html`<div class="health-changes-item"><strong>${changes.entitiesAdded.length}</strong> new entit${changes.entitiesAdded.length === 1 ? 'y' : 'ies'} <span class="health-row-sub">${changes.entitiesAdded.map((e) => e.name).join(', ')}</span></div>` : ''}
              ${changes.entitiesChanged.length ? html`<div class="health-changes-item"><strong>${changes.entitiesChanged.length}</strong> entit${changes.entitiesChanged.length === 1 ? 'y' : 'ies'} edited</div>` : ''}
              ${changes.relationshipsAdded ? html`<div class="health-changes-item"><strong>${changes.relationshipsAdded}</strong> new relationship${changes.relationshipsAdded === 1 ? '' : 's'}</div>` : ''}
              ${changes.timelineEventsAdded.length ? html`<div class="health-changes-item"><strong>${changes.timelineEventsAdded.length}</strong> new timeline event${changes.timelineEventsAdded.length === 1 ? '' : 's'}</div>` : ''}
              ${changes.scenesTouched.length ? html`<div class="health-changes-item"><strong>${changes.scenesTouched.length}</strong> scene${changes.scenesTouched.length === 1 ? '' : 's'} touched</div>` : ''}
            </div>
            <p class="settings-note">Chapter word counts are current totals for chapters edited in this window, not an added/removed delta; Tinta doesn't keep a word-level history outside manual snapshots.</p>`
      }
    </div>

    <div class="health-section">
      <h3>Continuity (${report.continuityIssues.length})</h3>
      <p class="settings-note">Entities appearing after a status change you've marked as ending their appearances. See each entity's "Status timeline" in Notes. Two signals: a <code>[[mention]]</code> in the chapter (solid), or the chapter's own scene naming them as POV (a looser text match, marked "possible").</p>
      ${
        report.continuityIssues.length
          ? html`<div class="health-list">${report.continuityIssues.map(
              (c) =>
                html`<button class="health-row" data-jump-chapter="${c.chapterId}"><span>${c.entityName} appears in ${c.chapterTitle}${c.sceneTitle ? ` → ${c.sceneTitle}` : ''} · after “${c.statusLabel}”${c.kind === 'pov' ? html` <em>(possible: POV field)</em>` : ''}</span></button>`
            )}</div>`
          : html`<p class="empty-state-sm">Nothing flagged; either no status timelines are set yet, or nothing contradicts them.</p>`
      }
    </div>

    <div class="health-section">
      <h3>Style guide (${report.styleGuideIssues.length})</h3>
      <p class="settings-note">Spelling/naming drift against your project's style guide. Manage the rule list from Grammar Check → Settings → Style guide.</p>
      ${
        report.styleGuideIssues.length
          ? html`<div class="health-list">${report.styleGuideIssues.map(
              (s) =>
                html`<button class="health-row" data-jump-chapter="${s.chapterId}"><span>${s.chapterTitle} <span class="health-row-sub">${s.count}× · prefers “${s.preferred}”</span></span></button>`
            )}</div>`
          : html`<p class="empty-state-sm">Nothing flagged; either no style guide rules are set yet, or nothing violates them.</p>`
      }
    </div>

    <div class="health-section">
      <h3>Orphaned entities (${report.orphanedEntities.length})</h3>
      <p class="settings-note">Never mentioned, never related to anything, no children nested under them. Genuinely untouched.</p>
      ${
        report.orphanedEntities.length
          ? html`<div class="health-list">${report.orphanedEntities.map((e) => html`<button class="health-row" data-jump-entity="${e.id}">${e.name} <span class="health-row-sub">${Store.getEntityType(e.type)?.label || e.type}</span></button>`)}</div>`
          : html`<p class="empty-state-sm">None. Everything you've created is connected to something.</p>`
      }
    </div>

    <div class="health-section">
      <h3>Dangling mentions (${report.danglingMentions.length})</h3>
      <p class="settings-note"><code>[[Mentions]]</code> in your prose that don't resolve to any entity: a typo, a renamed entity, or one you haven't created yet.</p>
      ${
        report.danglingMentions.length
          ? html`<div class="health-list">${report.danglingMentions.map((m) => html`<button class="health-row" data-jump-chapter="${m.chapterId || ''}" data-jump-event="${m.eventId ? '1' : ''}">[[${m.name}]] <span class="health-row-sub">${m.chapterTitle || m.eventTitle || ''}${m.sceneTitle ? ` → ${m.sceneTitle}` : ''}</span></button>`)}</div>`
          : html`<p class="empty-state-sm">None. Every mention resolves to something real.</p>`
      }
    </div>

    <div class="health-section">
      <h3>Orphaned timeline events (${report.orphanedTimelineEvents.length})</h3>
      <p class="settings-note">Linked to a chapter that's since been deleted.</p>
      ${
        report.orphanedTimelineEvents.length
          ? html`<div class="health-list">${report.orphanedTimelineEvents.map((e) => html`<button class="health-row" data-jump-timeline="1">${e.title}</button>`)}</div>`
          : html`<p class="empty-state-sm">None.</p>`
      }
    </div>

    <div class="health-section">
      <h3>Unresolved story questions (${report.unresolvedQuestions.length})</h3>
      ${
        report.unresolvedQuestions.length
          ? html`<div class="health-list">${report.unresolvedQuestions.map((q) => html`<button class="health-row" data-jump-questions="1">${q.question}</button>`)}</div>`
          : html`<p class="empty-state-sm">None open right now.</p>`
      }
    </div>

    <div class="health-section">
      <h3>Unused rule systems (${report.unusedRuleSystems.length})</h3>
      <p class="settings-note">Created but never given a single node, so nothing here yet for canon status or search to surface.</p>
      ${
        report.unusedRuleSystems.length
          ? html`<div class="health-list">${report.unusedRuleSystems.map((s) => html`<button class="health-row" data-jump-system="${s.id}">${s.name}</button>`)}</div>`
          : html`<p class="empty-state-sm">None. Every system has at least one node.</p>`
      }
    </div>

    <div class="health-section">
      <h3>Duplicate references (${report.duplicateReferences.length})</h3>
      <p class="settings-note">Same type and title showing up more than once in the research vault.</p>
      ${
        report.duplicateReferences.length
          ? html`<div class="health-list">${report.duplicateReferences.map((r) => html`<button class="health-row" data-jump-reference="${r.id}">${r.title} <span class="health-row-sub">${r.refType}</span></button>`)}</div>`
          : html`<p class="empty-state-sm">None. No repeated titles in the same category.</p>`
      }
    </div>

    <div class="health-section">
      <h3>Dead links (${report.deadLinks.length})</h3>
      <p class="settings-note">A map marker or reference pointing at something that no longer exists. Shouldn't normally happen, flagged here just in case.</p>
      ${
        report.deadLinks.length
          ? html`<div class="health-list">${report.deadLinks.map((d) => html`<button class="health-row" ${d.mapId ? raw(`data-jump-map="${escapeAttr(d.mapId)}"`) : raw(`data-jump-reference="${escapeAttr(d.refId)}"`)}>${d.label || '(untitled)'} <span class="health-row-sub">${d.kind}</span></button>`)}</div>`
          : html`<p class="empty-state-sm">None.</p>`
      }
    </div>
  `);

  panel.querySelectorAll('.health-range-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      healthChangesRange = btn.dataset.range;
      renderHealthView(Store.getActiveProject());
    });
  });
// Historical context: see docs/CODEBASE_NOTES.md#jshealthview-js-194-197
  panel.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-jump-entity], [data-jump-chapter], [data-jump-timeline], [data-jump-questions], [data-jump-system], [data-jump-reference], [data-jump-map]');
    if (!jump) return;
    const ds = jump.dataset;
    if (ds.jumpEntity != null) { openTarget({ type: 'entity', id: ds.jumpEntity }, { render: requestRender }); return; }
    if (ds.jumpChapter != null) {
      // Dangling-mention rows borrow data-jump-chapter as a vehicle; when
      // the mention actually points at a timeline event, jump there.
      if (ds.jumpEvent) { openTarget({ type: 'timeline', id: 'unused' }, { render: requestRender }); return; }
      if (!ds.jumpChapter) return;
      openTarget({ type: 'chapter', id: ds.jumpChapter }, { render: requestRender });
      return;
    }
    if (ds.jumpTimeline != null) { openTarget({ type: 'timeline', id: 'unused' }, { render: requestRender }); return; }
    if (ds.jumpQuestions != null) { openTarget({ type: 'questions', id: 'unused' }, { render: requestRender }); return; }
    if (ds.jumpSystem != null) { openTarget({ type: 'system', id: ds.jumpSystem }, { render: requestRender }); return; }
    if (ds.jumpReference != null) { openTarget({ type: 'reference', id: ds.jumpReference }, { render: requestRender }); return; }
    if (ds.jumpMap != null) { openTarget({ type: 'map', id: ds.jumpMap }, { render: requestRender }); return; }
  });
}
