// Historical context: see docs/CODEBASE_NOTES.md#jstimelineview-js-1-29
import * as Store from './store.js';
import { html, raw, toBridge, q, escapeHtml, escapeAttr } from './dom-utils.js';
import { openModal, confirmDialog, closeModal } from './modal.js';
import { EmptyState } from './emptyState.js';
import { requestRender } from './renderBus.js';
import { setActiveView, setActiveChapterId } from './context.js';

// Historical context: see docs/CODEBASE_NOTES.md#jstimelineview-js-37-42

export function renderTimelineView(project) {
  const panel = document.querySelector('.view-panel[data-view="timeline"]');
  const events = Store.getTimelineEventList();
  const chapters = [...project.chapters].sort((a, b) => a.order - b.order);
  // Calendar pass — entirely optional layer on top of the existing
  // freeform storyDate field. `calendar` is null for every project until
  // someone explicitly sets one up via the Calendar button below.
  const calendar = Store.getProjectCalendar();
  const calendarActive = Store.isCalendarActive();
  const mismatches = calendarActive ? Store.findCalendarOrderMismatches() : [];

  panel.innerHTML = toBridge(html`
    <div class="timeline-header">
      <button id="timeline-new-event">+ New Event</button>
      <button id="timeline-calendar-btn" title="${calendarActive ? 'Edit calendar' : 'Set up a custom calendar (optional)'}">📅 Calendar${calendarActive ? '' : ' (off)'}</button>
    </div>
    ${
      mismatches.length
        ? html`<p class="timeline-cal-warning">⚠ ${mismatches.length} event${mismatches.length === 1 ? '' : 's'} ${mismatches.length === 1 ? 'has' : 'have'} a calendar date earlier than the event before it in your Timeline order, e.g. "${mismatches[0].eventTitle}" is dated before "${mismatches[0].afterEventTitle}" even though it comes after it here. Doesn't block anything; just worth a look.</p>`
        : ''
    }
    ${
      events.length === 0
        ? html`${EmptyState({ text: 'Track when things happen. Story-chronological order, separate from chapter order — flashbacks, parallel threads, and nonlinear structure all live here.' })}`
        : html`<div class="timeline-track">
      ${events.map(
        (ev, i) => html`
        <div class="timeline-event" data-event="${ev.id}">
          <div class="timeline-dot"></div>
          <div class="timeline-event-card">
            <div class="timeline-event-head">
              <input type="text" class="timeline-date-input" value="${ev.storyDate}" placeholder="When (e.g. Day 3, Spring Y412)…" />
              <div class="timeline-reorder">
                <button class="timeline-up-btn" title="Move earlier" ${i === 0 ? raw('disabled') : ''}>▲</button>
                <button class="timeline-down-btn" title="Move later" ${i === events.length - 1 ? raw('disabled') : ''}>▼</button>
              </div>
              <button class="timeline-delete-btn" title="Delete event">✕</button>
            </div>
            ${
              calendarActive
                ? ev.calendarDate
                  ? html`<div class="timeline-calendar-row">
                      <select class="timeline-cal-month">
                        ${calendar.monthNames.map((m, mi) => html`<option value="${mi}" ${mi === ev.calendarDate.month ? raw('selected') : ''}>${m}</option>`)}
                      </select>
                      <input type="number" class="timeline-cal-day" value="${ev.calendarDate.day}" min="1" max="${calendar.daysPerMonth[ev.calendarDate.month] || 31}" />
                      <input type="number" class="timeline-cal-year" value="${ev.calendarDate.year}" placeholder="Year" />
                      <span class="timeline-cal-formatted">${Store.formatCalendarDate(calendar, ev.calendarDate)}</span>
                      <button class="timeline-cal-clear-btn" title="Remove calendar date">✕</button>
                    </div>`
                  : html`<button class="timeline-cal-set-btn">+ Set calendar date</button>`
                : ''
            }
            <input type="text" class="timeline-title-input" value="${ev.title}" placeholder="Event title" />
            <select class="timeline-chapter-select">
              <option value="">Not linked to a chapter</option>
              ${chapters.map((c) => html`<option value="${c.id}" ${c.id === ev.chapterId ? raw('selected') : ''}>${c.title}</option>`)}
            </select>
            ${ev.chapterId ? html`<button class="timeline-open-chapter-btn">↦ Open chapter</button>` : ''}
            <textarea class="timeline-description" placeholder="What happens… ([[Entity Name]] links work here too)" rows="2">${ev.description}</textarea>
          </div>
        </div>`
      )}
    </div>`
    }
  `);

  q('timeline-new-event').addEventListener('click', () => {
    Store.createTimelineEvent({ title: 'Untitled Event' });
    renderTimelineView(Store.getActiveProject());
  });
  q('timeline-calendar-btn').addEventListener('click', () => openCalendarManager());

  panel.querySelectorAll('.timeline-event').forEach((card) => {
    const eventId = card.dataset.event;

    card.querySelector('.timeline-date-input').addEventListener('input', (e) => {
      Store.updateTimelineEvent(eventId, { storyDate: e.target.value });
    });
    card.querySelector('.timeline-title-input').addEventListener('input', (e) => {
      Store.updateTimelineEvent(eventId, { title: e.target.value });
    });
    card.querySelector('.timeline-description').addEventListener('input', (e) => {
      Store.updateTimelineEvent(eventId, { description: e.target.value });
    });
    card.querySelector('.timeline-chapter-select').addEventListener('change', (e) => {
      Store.updateTimelineEvent(eventId, { chapterId: e.target.value || null });
      renderTimelineView(Store.getActiveProject());
    });
    const openChapterBtn = card.querySelector('.timeline-open-chapter-btn');
    if (openChapterBtn) {
      openChapterBtn.addEventListener('click', () => {
        const ev = Store.getTimelineEvent(eventId);
        setActiveChapterId(ev.chapterId);
        setActiveView('write');
        requestRender();
      });
    }
    card.querySelector('.timeline-up-btn').addEventListener('click', () => {
      Store.reorderTimelineEvent(eventId, 'up');
      renderTimelineView(Store.getActiveProject());
    });
    card.querySelector('.timeline-down-btn').addEventListener('click', () => {
      Store.reorderTimelineEvent(eventId, 'down');
      renderTimelineView(Store.getActiveProject());
    });
    card.querySelector('.timeline-delete-btn').addEventListener('click', async () => {
      const ev = Store.getTimelineEvent(eventId);
      if (!(await confirmDialog({ title: 'Delete this event?', message: `Delete "${ev.title}"? This can't be undone.`, confirmLabel: 'Delete', danger: true }))) return;
      Store.deleteTimelineEvent(eventId);
      renderTimelineView(Store.getActiveProject());
    });

// Historical context: see docs/CODEBASE_NOTES.md#jstimelineview-js-157-161
    const setBtn = card.querySelector('.timeline-cal-set-btn');
    if (setBtn) {
      setBtn.addEventListener('click', () => {
        Store.updateTimelineEvent(eventId, { calendarDate: { year: 0, month: 0, day: 1 } });
        renderTimelineView(Store.getActiveProject());
      });
    }
    const clearBtn = card.querySelector('.timeline-cal-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        Store.updateTimelineEvent(eventId, { calendarDate: null });
        renderTimelineView(Store.getActiveProject());
      });
    }
    const monthSelect = card.querySelector('.timeline-cal-month');
    if (monthSelect) {
      monthSelect.addEventListener('change', (e) => {
        const ev = Store.getTimelineEvent(eventId);
        Store.updateTimelineEvent(eventId, { calendarDate: { ...ev.calendarDate, month: parseInt(e.target.value, 10) } });
        renderTimelineView(Store.getActiveProject());
      });
    }
    const dayInput = card.querySelector('.timeline-cal-day');
    if (dayInput) {
      dayInput.addEventListener('change', (e) => {
        const ev = Store.getTimelineEvent(eventId);
        const day = Math.max(1, parseInt(e.target.value, 10) || 1);
        Store.updateTimelineEvent(eventId, { calendarDate: { ...ev.calendarDate, day } });
        renderTimelineView(Store.getActiveProject());
      });
    }
    const yearInput = card.querySelector('.timeline-cal-year');
    if (yearInput) {
      yearInput.addEventListener('change', (e) => {
        const ev = Store.getTimelineEvent(eventId);
        const year = parseInt(e.target.value, 10) || 0;
        Store.updateTimelineEvent(eventId, { calendarDate: { ...ev.calendarDate, year } });
        renderTimelineView(Store.getActiveProject());
      });
    }
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jstimelineview-js-205-210
function parseCalendarMonthsInput(text) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const monthNames = [];
  const daysPerMonth = [];
  lines.forEach((line) => {
    const [namePart, daysPart] = line.split(',').map((s) => (s || '').trim());
    if (!namePart) return;
    monthNames.push(namePart);
    const days = parseInt(daysPart, 10);
    daysPerMonth.push(Number.isFinite(days) && days > 0 ? days : 30);
  });
  return { monthNames, daysPerMonth };
}

// Historical context: see docs/CODEBASE_NOTES.md#jstimelineview-js-225-230
function openCalendarManager() {
  const calendar = Store.getProjectCalendar();
  const monthsText = calendar
    ? calendar.monthNames.map((n, i) => `${n}, ${calendar.daysPerMonth[i]}`).join('\n')
    : ['January, 31', 'February, 28', 'March, 31', 'April, 30', 'May, 31', 'June, 30', 'July, 31', 'August, 31', 'September, 30', 'October, 31', 'November, 30', 'December, 31'].join('\n');
  const weekdaysText = calendar ? calendar.weekdayNames.join(', ') : 'Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday';
  const yearSuffix = calendar ? calendar.yearSuffix : '';

  openModal({
    title: 'Custom Calendar',
    body: `
      <p class="drawer-subtitle">Optional: Timeline events can keep using freeform dates like "Day 3" without this. Setting one up unlocks real date math on events that opt into it: proper chronological ordering, and a heads-up when an event's date runs earlier than the one before it.</p>
      <label class="grammar-field-label">Months (one per line: name, days)
        <textarea id="calendar-months-input" rows="6">${escapeHtml(monthsText)}</textarea>
      </label>
      <label class="grammar-field-label">Weekday names (comma-separated)
        <input type="text" id="calendar-weekdays-input" value="${escapeAttr(weekdaysText)}" />
      </label>
      <label class="grammar-field-label">Year suffix (optional, e.g. "AR")
        <input type="text" id="calendar-year-suffix-input" value="${escapeAttr(yearSuffix)}" />
      </label>
      <button id="calendar-save-btn" class="add-scene-btn">${calendar ? 'Save changes' : 'Enable calendar'}</button>
      ${
        calendar
          ? calendar.enabled
            ? '<button id="calendar-toggle-btn" class="wt-menu-item library-menu-danger" style="text-align:left; padding-left:0; margin-top:var(--space-3);">Turn off calendar (keeps this setup; Timeline goes back to freeform-only)</button>'
            : '<button id="calendar-toggle-btn" class="add-scene-btn" style="margin-top:var(--space-3);">Turn calendar back on</button>'
          : ''
      }
    `,
  });

  q('calendar-save-btn').addEventListener('click', () => {
    const { monthNames, daysPerMonth } = parseCalendarMonthsInput(q('calendar-months-input').value);
    const weekdayNames = q('calendar-weekdays-input').value.split(',').map((s) => s.trim()).filter(Boolean);
    const yearSuffixVal = q('calendar-year-suffix-input').value.trim();
    Store.enableCalendar({ monthNames, daysPerMonth, weekdayNames, yearSuffix: yearSuffixVal });
    closeModal();
    renderTimelineView(Store.getActiveProject());
  });

  const toggleBtn = q('calendar-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (calendar.enabled) Store.disableCalendar();
      else Store.enableCalendar({});
      closeModal();
      renderTimelineView(Store.getActiveProject());
    });
  }
}
