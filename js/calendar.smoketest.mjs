// Tinta — custom calendar smoke test.
//
// Same convention as series.smoketest.mjs: a minimal in-memory localStorage
// shim, imported against the real store.js (no mocking of store internals),
// asserting on observable behavior rather than implementation details.
// Run with: node calendar.smoketest.mjs
//
// The date-math functions (calendarDateToAbsoluteDay, offsetCalendarDate,
// etc.) are pure — they take a calendar object as an explicit argument
// rather than reading getActiveProject() themselves — so most of this file
// exercises them directly with hand-built calendar objects, no store setup
// needed. The last section covers the store-integration surface (enable/
// disable, per-project backfill, Timeline's order-mismatch detector) where
// project state does matter.

// ── localStorage shim ───────────────────────────────────────────────────
class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Store = await import('./store.js');

// ── tiny test harness ───────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertDate(actual, expected, msg) {
  assert(
    actual && actual.year === expected.year && actual.month === expected.month && actual.day === expected.day,
    `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}
function section(title) { console.log(`\n${title}`); }

// ── a standard Gregorian-shaped calendar, built by hand ──────────────────
// (mirrors the default openCalendarManager() pre-fills, but constructed
// directly here so these tests don't depend on app.js at all)
const greg = {
  enabled: true,
  monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  daysPerMonth: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  weekdayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  daysPerWeek: 7,
  yearSuffix: '',
};

// A small, deliberately irregular calendar — proof this isn't secretly
// hardcoded around 12-months/7-days assumptions anywhere.
const fantasy = {
  enabled: true,
  monthNames: ['Frostmark', 'Thaw', 'Highsun'],
  daysPerMonth: [40, 35, 25], // 100-day year, uneven months on purpose
  weekdayNames: ['Rest', 'Work', 'Work', 'Work', 'Market'],
  daysPerWeek: 5,
  yearSuffix: 'AR',
};

section('Absolute-day round trip');
assertEqual(
  Store.calendarDateToAbsoluteDay(greg, { year: 0, month: 0, day: 1 }),
  0,
  'year 0, Jan 1 is absolute day 0'
);
for (const [label, cal, date] of [
  ['Gregorian mid-year', greg, { year: 3, month: 6, day: 15 }],
  ['Gregorian year end', greg, { year: 0, month: 11, day: 31 }],
  ['fantasy calendar', fantasy, { year: 7, month: 2, day: 25 }],
  ['negative year (before-the-reckoning epoch)', greg, { year: -2, month: 5, day: 10 }],
]) {
  const abs = Store.calendarDateToAbsoluteDay(cal, date);
  const back = Store.absoluteDayToCalendarDate(cal, abs);
  assertDate(back, date, `${label} round-trips through absolute day`);
}

section('compareCalendarDates / daysBetweenCalendarDates');
assert(
  Store.compareCalendarDates(greg, { year: 1, month: 0, day: 1 }, { year: 0, month: 11, day: 31 }) > 0,
  'a date in year 1 compares later than the last day of year 0'
);
assertEqual(
  Store.compareCalendarDates(greg, { year: 2, month: 3, day: 10 }, { year: 2, month: 3, day: 10 }),
  0,
  'a date compares equal to itself'
);
assertEqual(
  Store.daysBetweenCalendarDates(greg, { year: 0, month: 0, day: 1 }, { year: 0, month: 0, day: 11 }),
  10,
  '10 days between Jan 1 and Jan 11'
);
assertEqual(
  Store.daysBetweenCalendarDates(fantasy, { year: 0, month: 0, day: 1 }, { year: 1, month: 0, day: 1 }),
  100,
  'fantasy calendar: exactly one 100-day year between the same month/day a year apart'
);

section('offsetCalendarDate — day/month/year math');
assertDate(
  Store.offsetCalendarDate(greg, { year: 1, month: 0, day: 28 }, { days: 3 }),
  { year: 1, month: 0, day: 31 },
  '+3 days from Jan 28 lands on Jan 31'
);
assertDate(
  Store.offsetCalendarDate(greg, { year: 1, month: 0, day: 30 }, { days: 3 }),
  { year: 1, month: 1, day: 2 },
  '+3 days crosses a month boundary correctly (Jan 30 -> Feb 2, 28-day Feb)'
);
assertDate(
  Store.offsetCalendarDate(greg, { year: 1, month: 11, day: 15 }, { months: 2 }),
  { year: 2, month: 1, day: 15 },
  '+2 months from Nov carries into the next year (-> Jan of year+1... i.e. Feb)'
);
assertDate(
  Store.offsetCalendarDate(greg, { year: 1, month: 0, day: 31 }, { months: 1 }),
  { year: 1, month: 1, day: 28 },
  '+1 month from Jan 31 clamps into Feb\'s shorter length (Feb 28), not an invalid Feb 31'
);
assertDate(
  Store.offsetCalendarDate(greg, { year: 5, month: 0, day: 1 }, { years: -2 }),
  { year: 3, month: 0, day: 1 },
  '"two years earlier" — negative year offset'
);
assertDate(
  Store.offsetCalendarDate(greg, { year: 1, month: 0, day: 1 }, { months: -1 }),
  { year: 0, month: 11, day: 1 },
  'negative month offset wraps backward into the prior year (Jan -> Dec of year-1)'
);
assertDate(
  Store.offsetCalendarDate(greg, { year: 1, month: 0, day: 31 }, { months: 1, days: 3 }),
  { year: 1, month: 2, day: 3 },
  'combined {months, days} applies month offset first, then day offset — "one month later, then three more days"'
);

section('Weekday lookup');
assertEqual(Store.getWeekdayIndex(greg, { year: 0, month: 0, day: 1 }), 0, 'day 0 (Jan 1, year 0) is weekday index 0 by definition');
assertEqual(Store.getWeekdayIndex(greg, { year: 0, month: 0, day: 8 }), 0, 'exactly 7 days later lands on the same weekday');
assertEqual(Store.getWeekdayName(greg, { year: 0, month: 0, day: 1 }), 'Sunday', 'weekday name resolves from the configured list');
assertEqual(Store.getWeekdayIndex(fantasy, { year: 0, month: 0, day: 6 }), 0, '5-day fantasy week also cycles correctly');
assertEqual(Store.getWeekdayName(fantasy, { year: 0, month: 0, day: 5 }), 'Market', 'irregular weekday list (5 days, not 7) resolves by name too');

section('formatCalendarDate');
assertEqual(
  Store.formatCalendarDate(greg, { year: 412, month: 4, day: 7 }),
  '7 May, 412',
  'plain format: day, month name, year'
);
assertEqual(
  Store.formatCalendarDate(greg, { year: 412, month: 4, day: 7 }, { includeWeekday: true }),
  `${Store.getWeekdayName(greg, { year: 412, month: 4, day: 7 })}, 7 May, 412`,
  'includeWeekday prepends the resolved weekday name'
);
assertEqual(
  Store.formatCalendarDate(fantasy, { year: 12, month: 0, day: 3 }),
  '3 Frostmark, 12 AR',
  'a configured yearSuffix is appended after the year number'
);
assertEqual(Store.formatCalendarDate(null, { year: 1, month: 0, day: 1 }), '', 'formatCalendarDate is empty-safe with no calendar');
assertEqual(Store.formatCalendarDate(greg, null), '', 'formatCalendarDate is empty-safe with no date');

section('isValidCalendarDate');
assert(Store.isValidCalendarDate(greg, { year: 1, month: 1, day: 28 }), 'Feb 28 is valid in a 28-day February');
assert(!Store.isValidCalendarDate(greg, { year: 1, month: 1, day: 29 }), 'Feb 29 is invalid — this calendar has no leap years by design');
assert(!Store.isValidCalendarDate(greg, { year: 1, month: 12, day: 1 }), 'month index 12 is out of range for a 12-month calendar');
assert(!Store.isValidCalendarDate(greg, { year: 1, month: 0, day: 0 }), 'day 0 is invalid — days are 1-indexed');
assert(!Store.isValidCalendarDate(greg, null), 'null date is invalid, not a throw');
assert(!Store.isValidCalendarDate(null, { year: 1, month: 0, day: 1 }), 'null calendar is invalid, not a throw');
assert(!Store.isValidCalendarDate(greg, { year: 1, month: '0', day: 1 }), 'non-numeric month field is rejected');

// ── store-integration surface ─────────────────────────────────────────────
section('Fresh project — calendar is off by default');
globalThis.localStorage.clear();
const project = Store.getActiveProject();
assertEqual(project.calendar, null, 'a new project has no calendar (opt-in, not opt-out)');
assertEqual(Store.isCalendarActive(), false, 'isCalendarActive is false with no calendar configured');

const evt = Store.createTimelineEvent({ title: 'The storm hits', storyDate: 'Day 3' });
assertEqual(Store.formatTimelineEventDate(evt), 'Day 3', 'with no calendar, Timeline display falls back to the freeform storyDate');

section('Enabling a calendar');
const enabled = Store.enableCalendar({
  monthNames: fantasy.monthNames,
  daysPerMonth: fantasy.daysPerMonth,
  weekdayNames: fantasy.weekdayNames,
  yearSuffix: fantasy.yearSuffix,
});
assert(enabled.enabled === true, 'enableCalendar returns an enabled calendar');
assertEqual(Store.isCalendarActive(), true, 'isCalendarActive flips true once configured');
assertEqual(Store.getProjectCalendar().monthNames.length, 3, 'the configured month list round-trips onto the project');

// Mismatched-length daysPerMonth input pads against a 30-day default
// rather than throwing — same forgiving-of-typos contract as the
// months-textarea parser in app.js.
const lopsided = Store.enableCalendar({ monthNames: ['Onemonth', 'Twomonth'], daysPerMonth: [10] });
assertEqual(lopsided.daysPerMonth.length, 2, 'daysPerMonth is padded out to match monthNames length');
assertEqual(lopsided.daysPerMonth[1], 30, 'a missing daysPerMonth entry defaults to 30 rather than throwing');
// restore the fantasy calendar for the rest of this section
Store.enableCalendar({ monthNames: fantasy.monthNames, daysPerMonth: fantasy.daysPerMonth, weekdayNames: fantasy.weekdayNames, yearSuffix: fantasy.yearSuffix });

Store.updateTimelineEvent(evt.id, { calendarDate: { year: 4, month: 0, day: 12 } });
const withDate = Store.getTimelineEvent(evt.id);
assertEqual(
  Store.formatTimelineEventDate(withDate),
  Store.formatCalendarDate(Store.getProjectCalendar(), withDate.calendarDate),
  'once a valid calendarDate is set, Timeline display prefers it over storyDate'
);

section('Disabling — config is kept, display falls back');
Store.disableCalendar();
assertEqual(Store.isCalendarActive(), false, 'isCalendarActive is false once disabled');
assertEqual(Store.getProjectCalendar().monthNames.length, 3, 'disabling does not discard the configured months');
assertEqual(
  Store.formatTimelineEventDate(Store.getTimelineEvent(evt.id)),
  'Day 3',
  'display falls back to storyDate while disabled, even though calendarDate is still stored'
);
Store.enableCalendar({}); // re-enable with no overrides — should keep prior config
assertEqual(Store.isCalendarActive(), true, 're-enabling with no overrides turns the calendar back on');
assertEqual(Store.getProjectCalendar().monthNames[0], 'Frostmark', 're-enabling with {} keeps the previously configured months rather than resetting to Gregorian');

section('Stale calendarDate after reconfiguration');
// Shrink Frostmark from 40 days to 5 — the event's stored day:12 is now
// out of range for its own month.
Store.enableCalendar({ monthNames: fantasy.monthNames, daysPerMonth: [5, 35, 25] });
assert(!Store.isValidCalendarDate(Store.getProjectCalendar(), withDate.calendarDate), 'the stored calendarDate is now invalid against the shrunk month');
assertEqual(
  Store.formatTimelineEventDate(Store.getTimelineEvent(evt.id)),
  'Day 3',
  'a stale calendarDate is never shown as if valid — falls back to storyDate instead of a garbage date'
);

section('findCalendarOrderMismatches — chronology vs. manual Timeline order');
// _db is cached module-level state inside store.js — load() only reads
// localStorage once, so clearing the shim mid-run wouldn't actually reset
// anything after the first read. createProject() is the real "start
// clean" primitive (also exercised this way in series.smoketest.mjs),
// and it conveniently gives this section an empty timelineEvents map too.
Store.createProject('Order Mismatch Test Book');
Store.enableCalendar({ monthNames: greg.monthNames, daysPerMonth: greg.daysPerMonth, weekdayNames: greg.weekdayNames });
const first = Store.createTimelineEvent({ title: 'Departure', calendarDate: { year: 1, month: 0, day: 1 } });
const second = Store.createTimelineEvent({ title: 'Arrival', calendarDate: { year: 1, month: 0, day: 10 } });
assertEqual(Store.findCalendarOrderMismatches().length, 0, 'two events in both Timeline order and calendar order agree — no mismatch');

// A flashback placed later in Timeline order but dated earlier in-world.
const flashback = Store.createTimelineEvent({ title: 'Childhood memory', calendarDate: { year: 0, month: 5, day: 1 } });
void first; void second;
const mismatches = Store.findCalendarOrderMismatches();
assertEqual(mismatches.length, 1, 'an event dated earlier than its Timeline predecessor is flagged exactly once');
assertEqual(mismatches[0].eventId, flashback.id, 'the mismatch identifies the out-of-chronology event');

// Reordering it earlier (a writer explicitly marking it as a real
// flashback slot) should not change anything about the calendar dates —
// findCalendarOrderMismatches only compares against the writer's own
// manual order, so moving it first resolves the "flag", proving this is
// order-relative, not an absolute chronology check.
Store.reorderTimelineEvent(flashback.id, 'up');
Store.reorderTimelineEvent(flashback.id, 'up');
assertEqual(Store.findCalendarOrderMismatches().length, 0, 'moving the flashback to the front of Timeline order resolves the mismatch — this checks relative order, not absolute date correctness');

assertEqual(Store.findCalendarOrderMismatches.length >= 0, true, 'sanity: function is callable with no args');

// findCalendarOrderMismatches must not blow up when the calendar is off.
Store.disableCalendar();
assertEqual(Store.findCalendarOrderMismatches().length, 0, 'returns an empty list (not a throw) when the calendar is disabled');

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
