// resumeView (0.2.7 move-out) — the Resume dashboard ("where was I").
// The 0.3 Welcome Back work extends this module.
//
import * as Store from './store.js';
import { setActiveChapterId, setActiveView } from './context.js';
import { html, q, toBridge } from './dom-utils.js';
import { openAnnotationDrawer } from './drawer.js';
import { requestRender } from './renderBus.js';

export function renderResumeView(project) {
  const panel = document.querySelector('.view-panel[data-view="resume"]');
  const summary = Store.getResumeSummary();
  const lastOpenedLabel = summary.lastOpenedAt
    ? new Date(summary.lastOpenedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'first time opening this project';

// Historical context: see docs/CODEBASE_NOTES.md#jsresumeview-js-17-21

  const lastChapterCard = summary.lastChapter
    ? html`
      <div class="resume-card resume-card-hero" data-resume-action="open-chapter" data-chapter-id="${summary.lastChapter.chapterId}" data-cursor-pos="${summary.lastChapter.lastCursorPos}" data-scroll-top="${summary.lastChapter.lastScrollTop}">
        <div class="resume-card-eyebrow">Where you left off</div>
        <h3 class="resume-card-title">${summary.lastChapter.chapterTitle}</h3>
        <p class="resume-card-sub">${summary.lastChapter.lastOpenedAt ? `Last opened ${new Date(summary.lastChapter.lastOpenedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'Never explicitly opened · most recently updated'}</p>
        <div class="resume-card-cta">↦ Continue writing →</div>
      </div>`
    : html`<div class="resume-card resume-card-empty"><div class="resume-card-eyebrow">Where you left off</div><p class="resume-card-sub">No chapters yet. Create one from the sidebar's + New button.</p></div>`;

  const annotationsList = summary.openAnnotations.length
    ? html`<ul class="resume-list">${summary.openAnnotations.slice(0, 5).map((a) => html`
      <li class="resume-list-item" data-resume-action="open-annotation" data-annotation-id="${a.id}" data-chapter-id="${a.chapterId}">
        <span class="annotation-type-tag anno-type-${a.type}">${Store.getAnnotationTypeLabel(a.type)}</span>
        <span class="resume-list-main">${a.note || '(no note)'}</span>
        <span class="resume-list-meta">${a.chapterTitle}${a.sceneTitle ? ` → ${a.sceneTitle}` : ''}</span>
      </li>`)}</ul>
      ${summary.openAnnotations.length > 5 ? html`<p class="resume-list-more">${summary.openAnnotations.length - 5} more · see all in Annotations →</p>` : ''}`
    : html`<p class="resume-empty-note">Nothing open. You're all caught up.</p>`;

  const questionsList = summary.openStoryQuestions.length
    ? html`<ul class="resume-list">${summary.openStoryQuestions.slice(0, 5).map((q) => html`
      <li class="resume-list-item" data-resume-action="open-question" data-question-id="${q.id}">
        <span class="resume-list-main">❓ ${q.question}</span>
        ${q.payoffSceneId ? html`<span class="resume-list-meta">payoff scene linked</span>` : html`<span class="resume-list-meta">no payoff scene yet</span>`}
      </li>`)}</ul>
      ${summary.openStoryQuestions.length > 5 ? html`<p class="resume-list-more">${summary.openStoryQuestions.length - 5} more · see all in Questions →</p>` : ''}`
    : html`<p class="resume-empty-note">Every story question resolved. No promises outstanding.</p>`;

  const decisionsList = summary.recentDecisions.length
    ? html`<ul class="resume-list">${summary.recentDecisions.map((d) => html`
      <li class="resume-list-item" data-resume-action="open-decision" data-decision-id="${d.id}">
        <span class="resume-list-main">⚖ ${d.decision}</span>
        ${d.reason ? html`<span class="resume-list-meta">${d.reason}</span>` : ''}
      </li>`)}</ul>`
    : html`<p class="resume-empty-note">No decisions logged in the last 7 days.</p>`;

  // Health warnings — only the summary line + counts. Each warning
  // kind has its own click-through to the Health view (with a future
  // per-warning anchor there; for now, just opens Health).
  const healthTotal = summary.healthWarnings.total;
  const healthLine = healthTotal > 0
    ? html`<p class="resume-health-line">${healthTotal} issue${healthTotal === 1 ? '' : 's'} to look at · <button type="button" class="resume-link-button" data-resume-action="open-health">see Health →</button></p>`
    : html`<p class="resume-health-line">No issues flagged. <button type="button" class="resume-link-button" data-resume-action="open-health">See Health →</button></p>`;

  panel.innerHTML = toBridge(html`
    <div class="resume-header">
      <h2>Resume</h2>
      <span class="resume-eyebrow">Since you last opened Tinta · ${lastOpenedLabel}</span>
    </div>

    ${lastChapterCard}

    <div class="resume-section">
      <h3 class="resume-section-title">Open to come back to <span class="resume-section-count">${summary.openAnnotations.length}</span></h3>
      ${annotationsList}
    </div>

    <div class="resume-section">
      <h3 class="resume-section-title">Promises to the reader <span class="resume-section-count">${summary.openStoryQuestions.length}</span></h3>
      ${questionsList}
    </div>

    <div class="resume-section">
      <h3 class="resume-section-title">Decisions in the last 7 days <span class="resume-section-count">${summary.recentDecisions.length}</span></h3>
      ${decisionsList}
    </div>

    <div class="resume-section">
      <h3 class="resume-section-title">Project health</h3>
      ${healthLine}
    </div>
  `);

// Historical context: see docs/CODEBASE_NOTES.md#jsresumeview-js-97-111
  panel.removeEventListener('click', handleResumePanelClick);
  panel.addEventListener('click', handleResumePanelClick);
}

export function handleResumePanelClick(e) {
    const target = e.target.closest('[data-resume-action]');
    if (!target) return;
    const action = target.dataset.resumeAction;
    if (action === 'open-chapter') {
      const chapterId = target.dataset.chapterId;
      const cursorPos = Number(target.dataset.cursorPos || 0);
      const scrollTop = Number(target.dataset.scrollTop || 0);
      setActiveChapterId(chapterId);
      setActiveView('write');
      requestRender();
      // Restore cursor + scroll after the editor renders. Same shape
      // as the editor's own session-memory restore on chapter open,
      // just driven from the dashboard's "continue writing" CTA.
      requestAnimationFrame(() => {
        const ta = q('chapter-editor');
        if (ta) {
          ta.focus();
          ta.setSelectionRange(cursorPos, cursorPos);
          ta.scrollTop = scrollTop;
        }
      });
    } else if (action === 'open-annotation') {
// Historical context: see docs/CODEBASE_NOTES.md#jsresumeview-js-139-142
      openAnnotationDrawer(target.dataset.annotationId);
    } else if (action === 'open-question') {
      setActiveView('questions');
      requestRender();
    } else if (action === 'open-decision') {
      setActiveView('decisions');
      requestRender();
    } else if (action === 'open-health') {
      setActiveView('health');
      requestRender();
    }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsresumeview-js-156-161

