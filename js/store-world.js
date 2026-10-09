// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-1-29

import { escapeRegExp, getActiveProject, load, now, ownGet, save, uid } from './store-core.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-33-50

function makeCalendar(overrides = {}) {
  const monthNames = overrides.monthNames && overrides.monthNames.length
    ? overrides.monthNames
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-56-59
  const rawDays = overrides.daysPerMonth && overrides.daysPerMonth.length ? overrides.daysPerMonth : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const daysPerMonth = monthNames.map((_, i) => (Number.isFinite(rawDays[i]) && rawDays[i] > 0 ? Math.round(rawDays[i]) : 30));
  const weekdayNames = overrides.weekdayNames && overrides.weekdayNames.length
    ? overrides.weekdayNames
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return {
    enabled: true,
    monthNames,
    daysPerMonth,
    weekdayNames,
    daysPerWeek: weekdayNames.length,
    yearSuffix: (overrides.yearSuffix || '').trim(), // e.g. "AR", "CE" — optional, appended after the year number
    createdAt: overrides.createdAt || now(),
    updatedAt: now(),
  };
}

export function getProjectCalendar() {
  return getActiveProject().calendar;
}

export function isCalendarActive() {
  const calendar = getActiveProject().calendar;
  return !!(calendar && calendar.enabled);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-86-93
export function enableCalendar(overrides = {}) {
  const project = getActiveProject();
  project.calendar = makeCalendar({ ...(project.calendar || {}), ...overrides });
  project.updatedAt = now();
  save();
  return project.calendar;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-102-106
export function disableCalendar() {
  const project = getActiveProject();
  if (!project.calendar) return null;
  project.calendar.enabled = false;
  project.calendar.updatedAt = now();
  project.updatedAt = now();
  save();
  return project.calendar;
}

export function isValidCalendarDate(calendar, date) {
  if (!calendar || !date) return false;
  if (typeof date.year !== 'number' || typeof date.month !== 'number' || typeof date.day !== 'number') return false;
  if (date.month < 0 || date.month >= calendar.monthNames.length) return false;
  if (date.day < 1 || date.day > calendar.daysPerMonth[date.month]) return false;
  return true;
}

function calendarYearLength(calendar) {
  return calendar.daysPerMonth.reduce((sum, d) => sum + d, 0);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-129-136
export function calendarDateToAbsoluteDay(calendar, date) {
  const yearLength = calendarYearLength(calendar);
  let dayOfYear = 0;
  for (let m = 0; m < date.month; m++) dayOfYear += calendar.daysPerMonth[m];
  dayOfYear += date.day - 1;
  return date.year * yearLength + dayOfYear;
}

export function absoluteDayToCalendarDate(calendar, absoluteDay) {
  const yearLength = calendarYearLength(calendar);
  const year = Math.floor(absoluteDay / yearLength);
  let remainder = absoluteDay - year * yearLength;
  let month = 0;
  while (month < calendar.daysPerMonth.length - 1 && remainder >= calendar.daysPerMonth[month]) {
    remainder -= calendar.daysPerMonth[month];
    month++;
  }
  return { year, month, day: remainder + 1 };
}

export function compareCalendarDates(calendar, a, b) {
  return calendarDateToAbsoluteDay(calendar, a) - calendarDateToAbsoluteDay(calendar, b);
}

export function daysBetweenCalendarDates(calendar, a, b) {
  return calendarDateToAbsoluteDay(calendar, b) - calendarDateToAbsoluteDay(calendar, a);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-165-171
export function offsetCalendarDate(calendar, date, { years = 0, months = 0, days = 0 } = {}) {
  const monthCount = calendar.monthNames.length;
  const totalMonths = date.month + months;
  const yearCarry = Math.floor(totalMonths / monthCount);
  const month = ((totalMonths % monthCount) + monthCount) % monthCount;
  const year = date.year + years + yearCarry;
  const day = Math.min(date.day, calendar.daysPerMonth[month]);
  let result = { year, month, day };
  if (days !== 0) {
    result = absoluteDayToCalendarDate(calendar, calendarDateToAbsoluteDay(calendar, result) + days);
  }
  return result;
}

export function getWeekdayIndex(calendar, date) {
  const abs = calendarDateToAbsoluteDay(calendar, date);
  return ((abs % calendar.daysPerWeek) + calendar.daysPerWeek) % calendar.daysPerWeek;
}

export function getWeekdayName(calendar, date) {
  return calendar.weekdayNames[getWeekdayIndex(calendar, date)] || '';
}

export function formatCalendarDate(calendar, date, { includeWeekday = false } = {}) {
  if (!calendar || !date) return '';
  const monthName = calendar.monthNames[date.month] || `Month ${date.month + 1}`;
  const yearPart = `${date.year}${calendar.yearSuffix ? ' ' + calendar.yearSuffix : ''}`;
  const base = `${date.day} ${monthName}, ${yearPart}`;
  return includeWeekday ? `${getWeekdayName(calendar, date)}, ${base}` : base;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-203-210
export function formatTimelineEventDate(event) {
  const calendar = getActiveProject().calendar;
  if (event.calendarDate && calendar && calendar.enabled && isValidCalendarDate(calendar, event.calendarDate)) {
    return formatCalendarDate(calendar, event.calendarDate);
  }
  return event.storyDate || '';
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-219-227
export function findCalendarOrderMismatches() {
  const calendar = getActiveProject().calendar;
  if (!calendar || !calendar.enabled) return [];
  const events = getTimelineEventList().filter((e) => e.calendarDate && isValidCalendarDate(calendar, e.calendarDate));
  const mismatches = [];
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    if (compareCalendarDates(calendar, curr.calendarDate, prev.calendarDate) < 0) {
      mismatches.push({ eventId: curr.id, eventTitle: curr.title, afterEventId: prev.id, afterEventTitle: prev.title });
    }
  }
  return mismatches;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-243-250

export function getTimelineEventList() {
  const project = getActiveProject();
  return Object.values(project.timelineEvents).sort((a, b) => a.order - b.order);
}

export function getTimelineEvent(eventId) {
  const project = getActiveProject();
  return ownGet(project.timelineEvents, eventId) || null;
}

export function createTimelineEvent({ title = 'Untitled Event', storyDate = '', calendarDate = null, description = '', chapterId = null } = {}) {
  const project = getActiveProject();
  const order = Object.keys(project.timelineEvents).length;
  const event = {
    id: uid('evt'),
    title,
    storyDate,
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-269-273
    calendarDate,
    description,
    chapterId, // optional — links the event to the chapter it plays out in
    order,
    createdAt: now(),
    updatedAt: now(),
  };
  project.timelineEvents[event.id] = event;
  save();
  return event;
}

export function updateTimelineEvent(eventId, patch) {
  const event = getTimelineEvent(eventId);
  if (!event) return;
  Object.assign(event, patch, { updatedAt: now() });
  save();
}

export function deleteTimelineEvent(eventId) {
  const project = getActiveProject();
  delete project.timelineEvents[eventId];
  // Close the gap left in the order sequence so future inserts/reorders
  // don't accumulate drift — same reasoning as deleteChapter re-indexing.
  Object.values(project.timelineEvents)
    .sort((a, b) => a.order - b.order)
    .forEach((e, i) => (e.order = i));
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-304-309

export function listImages() {
  const project = getActiveProject();
  return Object.values(project.images).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getImage(id) {
  return ownGet(getActiveProject().images, id);
}

export function createImageMeta({ id, caption = '', width = 100 }) {
  const project = getActiveProject();
  const image = { id, caption, width, createdAt: now() };
  project.images[id] = image;
  project.updatedAt = now();
  save();
  return image;
}

export function updateImageMeta(id, patch) {
  const project = getActiveProject();
  const image = project.images[id];
  if (!image) return;
  Object.assign(image, patch);
  project.updatedAt = now();
  save();
}

// Metadata-only delete — does not touch the IndexedDB blob. app.js's
// image-library UI calls this and imagestore.deleteBlob() together, same
// division of responsibility as createImageMeta()/putBlob().
export function deleteImageMeta(id) {
  const project = getActiveProject();
  delete project.images[id];
  project.updatedAt = now();
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-348-352
export function getProjectImageIds(project) {
  return Object.keys(project.images);
}

// ── image reference tracking ───────────────────────────────────────────
//
// ImageStore blobs are keyed globally while image METADATA is per-project,
// so "is this blob still needed?" is a question only the db as a whole can
// answer. Import now mints fresh image ids (see tintaPackage.js), which
// keeps new projects from ever colliding — but a db that already went
// through a double-import before that fix can still hold two projects
// pointing at one blob. These two functions are what keeps a delete in one
// project from silently breaking art in another.

// Every place in the ACTIVE project that references an image id, as
// human-readable labels — this is what the delete confirmation shows the
// writer instead of a vague "some chapter might break" warning.
export function findImageUsage(id, project = getActiveProject()) {
  const places = [];
  if (!id || !project) return places;

  if (project.coverImageId === id) places.push({ kind: 'cover', label: 'Project cover' });

  const token = `{{img:${id}`;
  (project.chapters || []).forEach((chapter) => {
    if ((chapter.content || '').includes(token)) {
      places.push({ kind: 'chapter', id: chapter.id, label: chapter.title || 'Untitled chapter' });
    }
    (chapter.scenes || []).forEach((scene) => {
      if ((scene.content || '').includes(token)) {
        places.push({ kind: 'scene', id: scene.id, label: `Scene: ${scene.title || 'Untitled scene'}` });
      }
    });
  });

  Object.values(project.entities || {}).forEach((entity) => {
    // P2-2 — both primaryImageId (canonical, set by createEntity /
    // setEntityPrimaryImage) and portraitImageId (dead schema, no
    // creator sets it) are checked defensively. Reason: a hand-edited
    // or buggy-source .tinta file might have the old field name set
    // without the new one. Same defensive pattern as tintaPackage.js's
    // collectProjectImageIds (P1-4 fix). If you're sure no external
    // .tinta file in the wild still uses portraitImageId, the second
    // check can be removed; until then, leave it.
    if (entity.primaryImageId === id || entity.portraitImageId === id || (entity.imageIds || []).includes(id)) {
      places.push({ kind: 'entity', id: entity.id, label: `${capitalizeType(entity.type)}: ${entity.name || 'Unnamed'}` });
    }
  });

  Object.values(project.maps || {}).forEach((map) => {
    if (map.imageId === id) places.push({ kind: 'map', id: map.id, label: `Map: ${map.name || 'Untitled map'}` });
  });

  Object.values(project.references || {}).forEach((ref) => {
    if (ref.imageId === id) places.push({ kind: 'reference', id: ref.id, label: `Reference: ${ref.title || 'Untitled'}` });
  });

  return places;
}

function capitalizeType(type = '') {
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Entity';
}

// Whether any project OTHER than the active one still references this
// image id. The image-library delete path checks this before touching the
// shared blob: metadata always goes, the blob only goes when nothing else
// needs it. Orphan-not-dangle, applied to binary assets.
export function isImageUsedByOtherProjects(id) {
  const db = load();
  const activeId = db.activeProjectId;
  return Object.entries(db.projects || {}).some(([projectId, project]) => {
    if (projectId === activeId) return false;
    return findImageUsage(id, project).length > 0 || Boolean(project.images?.[id]);
  });
}

export function reorderTimelineEvent(eventId, direction) {
  const project = getActiveProject();
  const events = Object.values(project.timelineEvents).sort((a, b) => a.order - b.order);
  const idx = events.findIndex((e) => e.id === eventId);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= events.length) return;
  const tmp = events[idx].order;
  events[idx].order = events[swapIdx].order;
  events[swapIdx].order = tmp;
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-369-383

const MAP_TYPES = ['World', 'Regional', 'City', 'Dungeon/Interior'];

export function getMapTypes() {
  return MAP_TYPES;
}

export function getMapList() {
  const project = getActiveProject();
  return Object.values(project.maps).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function getMap(mapId) {
  return ownGet(getActiveProject().maps, mapId) || null;
}

export function createMap({ name = 'New Map', mapType = 'World' } = {}) {
  const project = getActiveProject();
  const map = {
    id: uid('map'),
    name,
    mapType,
    imageId: null,
    markers: [],
    createdAt: now(),
    updatedAt: now(),
  };
  project.maps[map.id] = map;
  project.updatedAt = now();
  save();
  return map;
}

export function updateMap(mapId, patch) {
  const project = getActiveProject();
  const map = project.maps[mapId];
  if (!map) return;
  Object.assign(map, patch, { updatedAt: now() });
  project.updatedAt = now();
  save();
}

export function deleteMap(mapId) {
  const project = getActiveProject();
  if (!project.maps[mapId]) return;
  delete project.maps[mapId];
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-430-434
  Object.values(project.maps).forEach((map) => {
    map.markers.forEach((marker) => {
      if (marker.linkedMapId === mapId) marker.linkedMapId = null;
    });
  });
  project.updatedAt = now();
  save();
}

export function addMarker(mapId, { x = 0.5, y = 0.5, label = 'New marker' } = {}) {
  const map = ownGet(getActiveProject().maps, mapId);
  if (!map) return null;
  const marker = {
    id: uid('mrk'),
    x,
    y,
    label,
    note: '',
    entityId: null, // 🧠-tier link — "this pin is Kessa Vane's home base"
    linkedMapId: null, // optional drill-down — "clicking this pin opens the regional map"
    createdAt: now(),
    updatedAt: now(),
  };
  map.markers.push(marker);
  map.updatedAt = now();
  getActiveProject().updatedAt = now();
  save();
  return marker;
}

export function getMarker(mapId, markerId) {
  const map = ownGet(getActiveProject().maps, mapId);
  return map ? map.markers.find((m) => m.id === markerId) || null : null;
}

export function updateMarker(mapId, markerId, patch) {
  const map = ownGet(getActiveProject().maps, mapId);
  if (!map) return;
  const marker = map.markers.find((m) => m.id === markerId);
  if (!marker) return;
  Object.assign(marker, patch, { updatedAt: now() });
  map.updatedAt = now();
  getActiveProject().updatedAt = now();
  save();
}

export function deleteMarker(mapId, markerId) {
  const map = ownGet(getActiveProject().maps, mapId);
  if (!map) return;
  const before = map.markers.length;
  map.markers = map.markers.filter((m) => m.id !== markerId);
  if (map.markers.length === before) return;
  map.updatedAt = now();
  getActiveProject().updatedAt = now();
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-492-498

const REFERENCE_TYPES = ['Note', 'URL', 'Quote', 'Book/Source', 'Image', 'Screenshot'];

export function getReferenceTypes() {
  return REFERENCE_TYPES;
}

export function getReferenceList() {
  const project = getActiveProject();
  return Object.values(project.references).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getReference(id) {
  return ownGet(getActiveProject().references, id) || null;
}

export function createReference({ refType = 'Note', title = 'Untitled reference' } = {}) {
  const project = getActiveProject();
  const ref = {
    id: uid('ref'),
    refType: REFERENCE_TYPES.includes(refType) ? refType : 'Note',
    title,
    content: '',
    url: '',
    source: '',
    annotation: '',
    tags: [],
    imageId: null,
    entityId: null,
    chapterId: null,
    sceneId: null,
    createdAt: now(),
    updatedAt: now(),
  };
  project.references[ref.id] = ref;
  project.updatedAt = now();
  save();
  return ref;
}

export function updateReference(id, patch) {
  const project = getActiveProject();
  const ref = project.references[id];
  if (!ref) return;
  Object.assign(ref, patch, { updatedAt: now() });
  project.updatedAt = now();
  save();
}

export function deleteReference(id) {
  const project = getActiveProject();
  if (!project.references[id]) return;
  delete project.references[id];
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-552-555
  project.updatedAt = now();
  save();
}

export function getDistinctReferenceTags() {
  const values = new Set();
  Object.values(getActiveProject().references).forEach((r) => (r.tags || []).forEach((t) => {
    const v = (t || '').trim();
    if (v) values.add(v);
  }));
  return [...values].sort((a, b) => a.localeCompare(b));
}

// References attached to a given entity/chapter/scene — the inspector-
// facing counterpart, same "computed from the owning side" shape as
// getSketchesForEntity/getBacklinksFor.
export function getReferencesForEntity(entityId) {
  return getReferenceList().filter((r) => r.entityId === entityId);
}

export function getReferencesForChapter(chapterId) {
  return getReferenceList().filter((r) => r.chapterId === chapterId);
}

export function getReferencesForScene(sceneId) {
  return getReferenceList().filter((r) => r.sceneId === sceneId);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-584-589

export function getPronunciationList() {
  const project = getActiveProject();
  return Object.entries(project.pronunciations || {})
    .map(([word, phonetic]) => ({ word, phonetic }))
    .sort((a, b) => a.word.localeCompare(b.word));
}

export function setPronunciation(word, phonetic) {
  const trimmed = (word || '').trim();
  if (!trimmed) return;
  const project = getActiveProject();
  project.pronunciations[trimmed] = (phonetic || '').trim();
  project.updatedAt = now();
  save();
}

export function deletePronunciation(word) {
  const project = getActiveProject();
  delete project.pronunciations[word];
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-613-618

export function applyPronunciations(text = '') {
  const project = getActiveProject();
  const entries = Object.entries(project.pronunciations || {}).filter(([, phonetic]) => phonetic);
  if (!entries.length) return text;
  entries.sort((a, b) => b[0].length - a[0].length);
  let result = text;
  entries.forEach(([word, phonetic]) => {
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
    result = result.replace(re, phonetic);
  });
  return result;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-633-637

export function getCustomDictionary() {
  const project = getActiveProject();
  return [...(project.customDictionary || [])].sort((a, b) => a.localeCompare(b));
}

export function addToCustomDictionary(word) {
  const trimmed = (word || '').trim().toLowerCase();
  if (!trimmed) return;
  const project = getActiveProject();
  if (!project.customDictionary.includes(trimmed)) {
    project.customDictionary.push(trimmed);
    save();
  }
}

export function removeFromCustomDictionary(word) {
  const project = getActiveProject();
  project.customDictionary = project.customDictionary.filter((w) => w !== word);
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-world-js-660-665
export function isDictionaryIgnored(flaggedText) {
  const project = getActiveProject();
  const target = (flaggedText || '').trim().toLowerCase();
  if (!target) return false;
  return (project.customDictionary || []).includes(target);
}
