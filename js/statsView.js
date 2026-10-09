// Historical context: see docs/CODEBASE_NOTES.md#jsstatsview-js-1-16
import * as Store from './store.js';
import { html, toBridge } from './dom-utils.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstatsview-js-20-26
function formatWriteTime(ms) {
  if (!ms || ms <= 0) return 'never';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 1) return '<1m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function renderStatsView(project) {
  const panel = document.querySelector('.view-panel[data-view="stats"]');
  const totalWords = Store.getTotalWordCount(project);
  const goal = project.wordGoal || 0;
  const goalPct = goal > 0 ? Math.min(100, Math.round((totalWords / goal) * 100)) : null;
  const streak = Store.getCurrentStreak();

  const statusCounts = { draft: 0, revised: 0, final: 0 };
  project.chapters.forEach((c) => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

  const counts = Store.getDailyWordCounts();
  const days = [];
  const d = new Date();
  for (let i = 29; i >= 0; i--) {
    const dd = new Date(d);
    dd.setDate(d.getDate() - i);
    const pad = (n) => String(n).padStart(2, '0');
    const key = `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`;
    days.push({ key, label: `${dd.getMonth() + 1}/${dd.getDate()}`, count: counts[key] || 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  const chaptersSorted = [...project.chapters].sort((a, b) => a.order - b.order);

  // Craft-tools pass — craft analytics. All three are read-only, computed
  // fresh from fields already stored (scene.pov, chapter content, quote
  // characters) — no schema change, no persistence of their own.
  const povDist = Store.getPovDistribution();
  const maxPov = Math.max(1, ...povDist.map((p) => p.count));
  const dialogue = Store.getDialogueRatio();
  const chapterWords = Store.getChapterWordCounts();
  const maxChapterWords = Math.max(1, ...chapterWords.map((c) => c.words));

  panel.innerHTML = toBridge(html`
    <div class="stats-headline-grid">
      <div class="stats-card">
        <div class="stats-card-value">${totalWords.toLocaleString()}</div>
        <div class="stats-card-label">Total words</div>
        ${goalPct !== null ? html`<div class="stats-goal-bar"><div class="stats-goal-fill" style="width:${goalPct}%"></div></div><div class="stats-goal-note">${goalPct}% of ${goal.toLocaleString()}-word goal</div>` : html`<div class="stats-goal-note">No goal set</div>`}
      </div>
      <div class="stats-card">
        <div class="stats-card-value">${streak}</div>
        <div class="stats-card-label">Day streak</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-value">${project.chapters.length}</div>
        <div class="stats-card-label">Chapters</div>
        <div class="stats-goal-note">${statusCounts.draft} draft · ${statusCounts.revised} revised · ${statusCounts.final} final</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-value">${Object.keys(project.entities).length}</div>
        <div class="stats-card-label">Entities</div>
        <div class="stats-goal-note">${Object.keys(project.relationships).length} relationships · ${Object.keys(project.snippets).length} snippets · ${Object.keys(project.timelineEvents).length} timeline events</div>
      </div>
    </div>

    <div class="stats-chart-section">
      <div class="stats-chart-title">Words added, last 30 days</div>
      <div class="stats-chart">
        ${days.map(
          (d) => html`<div class="stats-bar-col" title="${d.label}: ${d.count} words">
              <div class="stats-bar" style="height:${d.count === 0 ? 1 : Math.max(4, Math.round((d.count / maxDay) * 100))}%"></div>
            </div>`
        )}
      </div>
      <div class="stats-chart-labels"><span>${days[0].label}</span><span>${days[days.length - 1].label}</span></div>
    </div>

    <div class="craft-analytics-grid">
      <div class="stats-chart-section">
        <div class="stats-chart-title">Pacing · words per chapter</div>
        <div class="stats-chart">
          ${chapterWords.length
            ? chapterWords.map(
                (c) => html`<div class="stats-bar-col" title="${c.title}: ${c.words} words">
                <div class="stats-bar" style="height:${c.words === 0 ? 1 : Math.max(4, Math.round((c.words / maxChapterWords) * 100))}%"></div>
              </div>`
              )
            : html`<p class="empty-state-sm">No chapters yet.</p>`}
        </div>
      </div>

      <div class="stats-chart-section">
        <div class="stats-chart-title">Dialogue vs. narration</div>
        ${
          dialogue.totalWords === 0
            ? html`<p class="empty-state-sm">Nothing written yet.</p>`
            : html`
        <div class="dialogue-ratio-bar">
          <div class="dialogue-ratio-fill" style="width:${dialogue.dialoguePct}%" title="Dialogue: ${dialogue.dialogueWords.toLocaleString()} words (${dialogue.dialoguePct}%)"></div>
        </div>
        <div class="dialogue-ratio-legend">
          <span><span class="dialogue-swatch dialogue-swatch-dialogue"></span>Dialogue ${dialogue.dialoguePct}%</span>
          <span><span class="dialogue-swatch dialogue-swatch-narration"></span>Narration ${100 - dialogue.dialoguePct}%</span>
        </div>
        <p class="settings-note">Rough estimate: anything inside quote marks counts as dialogue. Not a precise parse, just a trend.</p>
        `
        }
      </div>

      <div class="stats-chart-section">
        <div class="stats-chart-title">POV distribution</div>
        ${
          povDist.length === 0
            ? html`<p class="empty-state-sm">No scenes with a POV set yet. Set one in a scene's Inspector.</p>`
            : html`<div class="pov-dist-list">${povDist.map(
                (p) => html`<div class="pov-dist-row">
                    <span class="pov-dist-label">${p.pov}</span>
                    <div class="pov-dist-bar-track"><div class="pov-dist-bar-fill" style="width:${Math.round((p.count / maxPov) * 100)}%"></div></div>
                    <span class="pov-dist-count">${p.count}</span>
                  </div>`
              )}</div>`
        }
      </div>
    </div>

    <div class="stats-chapter-table">
      <div class="stats-chapter-row stats-chapter-head">
        <span>Chapter</span><span>Status</span><span>Words</span><span>Target</span><span>Time</span><span>Updated</span>
      </div>
      ${chaptersSorted.map((c) => {
        const wc = Store.wordCount(c.content);
        return html`<div class="stats-chapter-row">
            <span>${c.title}</span>
            <span class="stats-status-badge stats-status-${c.status}">${c.status}</span>
            <span>${wc.toLocaleString()}</span>
            <input type="number" class="stats-target-input" data-chapter-id="${c.id}" min="0" step="500" placeholder="e.g. 50000" value="${c.targetWordCount || ''}" title="Target word count for this chapter" />
            <span title="Cumulative active-typing time in this chapter">${formatWriteTime(c.writeTimeMs)}</span>
            <span>${new Date(c.updatedAt).toLocaleDateString()}</span>
          </div>`;
      })}
    </div>
  `);

// Historical context: see docs/CODEBASE_NOTES.md#jsstatsview-js-170-176
  panel.querySelectorAll('.stats-target-input').forEach((input) => {
    input.addEventListener('change', () => {
      const value = Math.max(0, parseInt(input.value, 10) || 0);
      Store.updateChapterMeta(input.dataset.chapterId, { targetWordCount: value });
      input.value = value || '';
    });
  });
}
