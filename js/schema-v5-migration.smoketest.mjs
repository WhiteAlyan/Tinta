// v0.2.9 schema migration — smoketest for migrate_v4_to_v5.
//
// Verifies that a v4 backup (the current patched version) migrates
// cleanly to v5 with all 7 new fields backfilled to their correct
// defaults. Also verifies that a fresh install (emptyDb) has the right
// defaults from the start, and that the migration doesn't override
// fields that were already set (the passiveRecognition "don't surprise
// existing writers" rule).

import * as Store from './store.js';

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  NOT OK - ${name}`); }
}

const _store = {};
globalThis.localStorage = {
  getItem: (k) => (_store[k] !== undefined ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
};
globalThis.window = { addEventListener: () => {} };

console.log('v0.2.9 schema migration — v4 → v5 backfill');

// ── fresh install (emptyDb) ─────────────────────────────────────────────
localStorage.clear();
Store.load();
const freshDb = Store.getActiveDb();

ok('fresh install has version 5', freshDb.version === 5);
ok('fresh install has writerName = ""', freshDb.writerName === '');
ok('fresh install has workspaceDensity = "normal"', freshDb.workspaceDensity === 'normal');
ok('fresh install has sidebarCollapsed = false', freshDb.sidebarCollapsed === false);
ok('fresh install has typewriterEnabled = false', freshDb.typewriterEnabled === false);
ok('fresh install has onboardingComplete = false', freshDb.onboardingComplete === false);

const freshProject = Store.getActiveProject();
ok('fresh project has mentionStopwords = []', Array.isArray(freshProject.mentionStopwords) && freshProject.mentionStopwords.length === 0);
ok('fresh project has passiveRecognition = true', freshProject.passiveRecognition === true);

// ── existing v4 backup migrating to v5 ──────────────────────────────────
// Build a v4 db (no v5 fields) and import it.
const v4Backup = JSON.stringify({
  version: 4,
  activeProjectId: 'p1',
  theme: 'paper',
  manuscriptFont: 'literata',
  projects: {
    p1: {
      id: 'p1',
      title: 'Existing Novel',
      chapters: [{
        id: 'c1', title: 'Ch 1', order: 0, status: 'draft', content: 'text',
        updatedAt: '2026-01-01T00:00:00.000Z', scenes: [], snapshots: [],
      }],
      entities: {}, relationships: {}, relationshipTypes: {},
      sketches: {}, snippets: {}, timelineEvents: {}, dailyWordCounts: {},
      images: {}, quotes: {},
    },
  },
});

localStorage.clear();
Store.importFullBackup(v4Backup);
const migratedDb = Store.getActiveDb();

ok('migrated v4→v5 has version 5', migratedDb.version === 5);
ok('migrated db has writerName = ""', migratedDb.writerName === '');
ok('migrated db has workspaceDensity = "normal"', migratedDb.workspaceDensity === 'normal');
ok('migrated db has sidebarCollapsed = false', migratedDb.sidebarCollapsed === false);
ok('migrated db has typewriterEnabled = false', migratedDb.typewriterEnabled === false);
// CRITICAL: existing installs skip onboarding (they've already been using Tinta)
ok('migrated db has onboardingComplete = true (skip onboarding for existing installs)', migratedDb.onboardingComplete === true);

const migratedProject = Store.getActiveProject();
ok('migrated project has mentionStopwords = []', Array.isArray(migratedProject.mentionStopwords) && migratedProject.mentionStopwords.length === 0);
// CRITICAL: existing projects get passiveRecognition = false (don't surprise the writer)
ok('migrated project has passiveRecognition = false (don\'t surprise existing writers)', migratedProject.passiveRecognition === false);

// ── the new Store getters/setters work ──────────────────────────────────
Store.setWriterName('Test Writer');
ok('setWriterName/getWriterName round-trip', Store.getWriterName() === 'Test Writer');

Store.setWorkspaceDensity('simple');
ok('setWorkspaceDensity("simple") round-trip', Store.getWorkspaceDensity() === 'simple');

Store.setSidebarCollapsed(true);
ok('setSidebarCollapsed(true) round-trip', Store.getSidebarCollapsed() === true);

Store.setTypewriterEnabled(true);
ok('setTypewriterEnabled(true) round-trip', Store.getTypewriterEnabled() === true);

Store.setOnboardingComplete(true);
ok('setOnboardingComplete(true) round-trip', Store.getOnboardingComplete() === true);

Store.setPassiveRecognition(true);
ok('setPassiveRecognition(true) round-trip', Store.getPassiveRecognition() === true);

Store.addMentionStopword('Will');
ok('addMentionStopword round-trip', Store.getMentionStopwords().includes('will'));

Store.removeMentionStopword('Will');
ok('removeMentionStopword round-trip', !Store.getMentionStopwords().includes('will'));

// ── invalid values are rejected ────────────────────────────────────────
Store.setWorkspaceDensity('invalid');
ok('setWorkspaceDensity("invalid") is rejected, stays "simple"', Store.getWorkspaceDensity() === 'simple');

console.log(`\nschema-v5-migration.smoketest: ${passed} passed, ${failed} failed${failed === 0 ? ' — all green.' : ''}`);
if (failed > 0) process.exit(1);
