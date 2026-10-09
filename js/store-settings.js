// Historical context: see docs/CODEBASE_NOTES.md#jsstore-settings-js-1-20

import { load, save } from './store-core.js';

export function getTheme() {
  return load().theme || 'paper';
}

export function setTheme(theme) {
  const db = load();
  db.theme = theme;
  save();
}

export function getManuscriptFont() {
  return load().manuscriptFont || 'literata';
}

export function setManuscriptFont(font) {
  const db = load();
  db.manuscriptFont = font;
  save();
}

export function getCustomFont() {
  return load().customFont;
}

export function setCustomFont(patch) {
  const db = load();
  db.customFont = { ...db.customFont, ...patch };
  save();
  return db.customFont;
}

export function getNavStyle() {
  const style = load().navStyle;
  return style === 'compact' ? 'compact' : 'grouped';
}

export function setNavStyle(style) {
  const db = load();
  db.navStyle = style === 'compact' ? 'compact' : 'grouped';
  save();
}

export function getMotionSettings() {
  return load().motion;
}

export function setMotionSettings(patch) {
  const db = load();
  db.motion = { ...db.motion, ...patch };
  save();
  return db.motion;
}

export function getGrammarSettings() {
  return load().grammar;
}

export function setGrammarSettings(patch) {
  const db = load();
  db.grammar = { ...db.grammar, ...patch };
  save();
  return db.grammar;
}

export function getAmbienceSettings() {
  return load().ambience;
}

export function setAmbienceSettings(patch) {
  const db = load();
  db.ambience = { ...db.ambience, ...patch };
  save();
  return db.ambience;
}

export function getBackgroundSettings() {
  return load().background;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-settings-js-103-107
export function setBackgroundSettings(patch) {
  const db = load();
  const { gradient, ...rest } = patch;
  db.background = { ...db.background, ...rest };
  if (gradient) db.background.gradient = { ...db.background.gradient, ...gradient };
  save();
  return db.background;
}

export function getTtsSettings() {
  return load().tts;
}

export function setTtsSettings(patch) {
  const db = load();
  db.tts = { ...db.tts, ...patch };
  save();
  return db.tts;
}

export function getTypewriterSettings() {
  return load().typewriter;
}

export function setTypewriterSettings(patch) {
  const db = load();
  db.typewriter = { ...db.typewriter, ...patch };
  save();
  return db.typewriter;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-settings-js-139-142

export function getCustomThesaurus() {
  return load().customThesaurus;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-settings-js-148-155
export function addThesaurusEntry(word, synonyms) {
  const key = (word || '').trim().toLowerCase();
  const list = (synonyms || []).map((s) => s.trim()).filter(Boolean);
  if (!key || !list.length) return null;
  const db = load();
  db.customThesaurus[key] = list;
  save();
  return db.customThesaurus;
}

export function deleteThesaurusEntry(word) {
  const db = load();
  const key = (word || '').trim().toLowerCase();
  delete db.customThesaurus[key];
  save();
  return db.customThesaurus;
}

export function getAutosaveDelayMs() {
  const v = load().autosaveDelayMs;
  // P2-8 fix — fallback used to be 600, but emptyDb() (store-core.js:335)
  // and applyLegacyFieldMigrations (store-core.js:384) both set it to 1500.
  // The 600 fallback was dead code (the field is always set by migration),
  // but if migration is ever bypassed — e.g. a hand-crafted db in tests,
  // or a future code path that calls getAutosaveDelayMs before migrate()
  // runs — the UI would silently see a different default than the schema
  // intends. Now the fallback matches the migration default. The old 600
  // value may have been the original default before it was raised to 1500;
  // the tests/14 cross-tab spec still references "the 600ms autosave
  // debounce" in a comment, but the actual assertion is on a saved value
  // not the fallback, so it survives this change.
  return typeof v === 'number' ? v : 1500;
}

export function setAutosaveDelayMs(ms) {
  const db = load();
  db.autosaveDelayMs = ms;
  save();
  return db.autosaveDelayMs;
}

// v0.2.9 — app-level get/set pairs for the new fields.

// writerName — shown on the "Welcome back, [name]" boot screen. Empty
// string means onboarding hasn't completed yet; the welcome screen
// falls back to "Welcome back" without a name.
export function getWriterName() {
  return load().writerName || '';
}
export function setWriterName(name) {
  const db = load();
  db.writerName = (name || '').trim();
  save();
}

// workspaceDensity — 'simple' | 'normal' | 'maximum'. Gates which view
// tabs are visible. 'simple' hides Canvas, Systems, References, Timeline,
// Sketches, Stats, Health, Checklist, Decisions. 'normal' shows
// everything currently visible. 'maximum' adds dev/test surfaces.
export function getWorkspaceDensity() {
  return load().workspaceDensity || 'normal';
}
export function setWorkspaceDensity(density) {
  if (!['simple', 'normal', 'maximum'].includes(density)) return;
  const db = load();
  db.workspaceDensity = density;
  save();
}

// sidebarCollapsed — burger sidebar state. false = expanded (260px with
// labels), true = collapsed (60px icon rail). State persists across
// sessions. Default false (expanded) for existing installs to avoid
// surprising the writer with a layout change on update.
export function getSidebarCollapsed() {
  return load().sidebarCollapsed === true;
}
export function setSidebarCollapsed(collapsed) {
  const db = load();
  db.sidebarCollapsed = Boolean(collapsed);
  save();
}

// typewriterEnabled — gates the 4th focus mode tier. When false, the
// focus cycle is off → focus → zen (3 states). When true, the cycle
// includes typewriter: off → focus → zen → typewriter (4 states).
export function getTypewriterEnabled() {
  return load().typewriterEnabled === true;
}
export function setTypewriterEnabled(enabled) {
  const db = load();
  db.typewriterEnabled = Boolean(enabled);
  save();
}

// onboardingComplete — gates the 3-card onboarding flow. False means
// the writer hasn't completed onboarding yet (new install). True means
// they've gone through it (or they're an existing install migrated
// from v4, which sets this to true in the migration to skip onboarding).
export function getOnboardingComplete() {
  return load().onboardingComplete === true;
}
export function setOnboardingComplete(complete) {
  const db = load();
  db.onboardingComplete = Boolean(complete);
  save();
}
