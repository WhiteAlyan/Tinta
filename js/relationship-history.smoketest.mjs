// Tinta — Relationship History pass smoke test.
//
// Same convention as calendar/series/map/references.smoketest.mjs: a
// minimal in-memory localStorage shim, imported against the real
// store.js, asserting on observable behavior. Run with:
//   node relationship-history.smoketest.mjs
//
// Covers: history entries are independent of the edge's current-state
// fields, sorting by linked Timeline event order (not creation time),
// graceful handling of entries with no link or a dangling link, CRUD,
// and migration backfill for relationships from before this pass.

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
function section(title) { console.log(`\n${title}`); }

globalThis.localStorage.clear();

section('Setup');

const alice = Store.createEntity({ name: 'Alice', type: 'character' });
const bob = Store.createEntity({ name: 'Bob', type: 'character' });
const rel = Store.createRelationship({ fromId: alice.id, toId: bob.id, label: 'Allies' });
assert(Array.isArray(rel.history) && rel.history.length === 0, 'a freshly created relationship has an empty history array');
assertEqual(Store.getRelationshipHistory(rel.id).length, 0, 'getRelationshipHistory on a fresh relationship returns an empty list');

section('Adding history entries is independent of current-state fields');

Store.updateRelationship(rel.id, { status: 'active', strength: 'close' });
const entry1 = Store.addRelationshipHistoryEntry(rel.id, { label: 'Strangers' });
assert(entry1 !== null, 'addRelationshipHistoryEntry succeeds with just a label');
const relAfter = Store.getRelationship(rel.id);
assertEqual(relAfter.status, 'active', 'adding a history entry does not touch the edge\'s current status');
assertEqual(relAfter.strength, 'close', 'adding a history entry does not touch the edge\'s current strength');

const blankEntry = Store.addRelationshipHistoryEntry(rel.id, { label: '   ' });
assertEqual(blankEntry, null, 'a blank/whitespace-only label is rejected, same as entity status events\' label requirement');
assertEqual(Store.getRelationshipHistory(rel.id).length, 1, 'the rejected blank entry was not added');

section('Sequence — the actual §10 gap this pass closes');

const entry2 = Store.addRelationshipHistoryEntry(rel.id, { label: 'Rivals', status: 'estranged', note: 'The tournament incident.' });
const entry3 = Store.addRelationshipHistoryEntry(rel.id, { label: 'Reconciled', note: 'Years later, at the reunion.' });
const sequence = Store.getRelationshipHistory(rel.id).map((e) => e.label);
assertEqual(sequence.length, 3, 'all three entries are present');
assertEqual(sequence.join(' → '), 'Strangers → Rivals → Reconciled', 'unlinked entries preserve insertion order — the actual "Friends → Rivals → Allies" shape §10 asked for');

section('Timeline-anchored sorting overrides creation order');

// Create two timeline events, then two history entries added in the
// OPPOSITE order to how their linked events fall in story-chronology —
// this is the case that actually tests something: does sorting follow
// the link's real position, or just fall back to insertion order?
const eventLater = Store.createTimelineEvent({ title: 'The Reunion' });
const eventEarlier = Store.createTimelineEvent({ title: 'The Tournament' });
Store.reorderTimelineEvent(eventEarlier.id, 'up'); // now eventEarlier.order < eventLater.order

const relB = Store.createRelationship({ fromId: alice.id, toId: bob.id, label: 'Test edge' });
Store.addRelationshipHistoryEntry(relB.id, { label: 'Reconciled (added first, happens second)', timelineEventId: eventLater.id });
Store.addRelationshipHistoryEntry(relB.id, { label: 'Falling out (added second, happens first)', timelineEventId: eventEarlier.id });
const anchoredSequence = Store.getRelationshipHistory(relB.id).map((e) => e.label);
assertEqual(anchoredSequence[0], 'Falling out (added second, happens first)', 'the entry linked to the story-earlier event sorts first, regardless of which was added to the log first');
assertEqual(anchoredSequence[1], 'Reconciled (added first, happens second)', 'the entry linked to the story-later event sorts second');

section('Dangling link — deleted timeline event degrades gracefully');

const eventStillLive = Store.createTimelineEvent({ title: 'Still exists' });
const eventToDelete = Store.createTimelineEvent({ title: 'Will be deleted' });
Store.reorderTimelineEvent(eventStillLive.id, 'up'); // eventStillLive now earlier in story-order than eventToDelete
const relC = Store.createRelationship({ fromId: alice.id, toId: bob.id, label: 'Test edge 2' });
Store.addRelationshipHistoryEntry(relC.id, { label: 'Properly anchored', timelineEventId: eventStillLive.id });
Store.addRelationshipHistoryEntry(relC.id, { label: 'Will go dangling', timelineEventId: eventToDelete.id });
Store.addRelationshipHistoryEntry(relC.id, { label: 'Never anchored' });
Store.deleteTimelineEvent(eventToDelete.id);
const afterDelete = Store.getRelationshipHistory(relC.id);
assert(afterDelete.every((e) => e.label), 'getRelationshipHistory does not throw or drop entries when a linked timeline event has been deleted');
assertEqual(afterDelete.length, 3, 'all three entries still present after the linked event was deleted');
assertEqual(afterDelete[0].label, 'Properly anchored', 'the entry with a still-valid link sorts before any dangling/unanchored entry');
const lastTwo = afterDelete.slice(1).map((e) => e.label).sort();
assertEqual(JSON.stringify(lastTwo), JSON.stringify(['Never anchored', 'Will go dangling']), 'both the dangling-link entry and the never-anchored entry end up after the properly-anchored one — visible, not dropped, same as entity status events\' handling of a dangling link');

section('Per-entry notes — resolves the §10 "one note per state" gap');

const entryWithNote = Store.getRelationshipHistory(rel.id).find((e) => e.label === 'Rivals');
assertEqual(entryWithNote.note, 'The tournament incident.', 'each history entry carries its own note, independent of the edge-level notes field');
Store.updateRelationship(rel.id, { notes: 'General ongoing notes about this pair.' });
const relWithBothNoteKinds = Store.getRelationship(rel.id);
assertEqual(relWithBothNoteKinds.notes, 'General ongoing notes about this pair.', 'the edge-level notes field still works independently');
assertEqual(Store.getRelationshipHistory(rel.id).find((e) => e.label === 'Rivals').note, 'The tournament incident.', 'setting the edge-level notes did not overwrite the per-entry note');

section('Update and delete a history entry');

Store.updateRelationshipHistoryEntry(rel.id, entry2.id, { note: 'Updated note.' });
assertEqual(Store.getRelationshipHistory(rel.id).find((e) => e.id === entry2.id).note, 'Updated note.', 'updateRelationshipHistoryEntry patches the right entry');

Store.deleteRelationshipHistoryEntry(rel.id, entry1.id);
const afterEntryDelete = Store.getRelationshipHistory(rel.id).map((e) => e.id);
assert(!afterEntryDelete.includes(entry1.id), 'deleteRelationshipHistoryEntry removes only the targeted entry');
assertEqual(afterEntryDelete.length, 2, 'the other two entries remain');

section('Deleting the relationship itself takes its history with it');

Store.deleteRelationship(relB.id);
assertEqual(Store.getRelationship(relB.id), null, 'the relationship is gone');
assertEqual(Store.getRelationshipHistory(relB.id).length, 0, 'getRelationshipHistory on a deleted relationship returns an empty list, not an error');

section('Migration — importing a pre-pass backup backfills relationship.history');

// Same pattern as the other smoke tests' migration sections: load()
// memoizes into a module-level _db and returns early on a second call
// (`if (_db) return _db;`), so it can't be used to simulate a fresh boot
// mid-test. exportFullBackup/importFullBackup is the real round-trip that
// actually re-runs migrate() against a given JSON blob.
const legacyDb = JSON.parse(Store.exportFullBackup());
const legacyProjectId = legacyDb.activeProjectId;
const legacyProject = legacyDb.projects[legacyProjectId];
const survivingRelId = Object.keys(legacyProject.relationships)[0];
Object.values(legacyProject.relationships).forEach((r) => { delete r.history; });
assert(legacyProject.relationships[survivingRelId].history === undefined, 'setup: history really is gone in the simulated legacy backup');

Store.importFullBackup(JSON.stringify(legacyDb));
const healedProject = Store.getActiveProject();
const healedRel = healedProject.relationships[survivingRelId];
assert(Array.isArray(healedRel.history), 'migrate() backfills a missing history array on import');
assert(!!healedProject.entities[alice.id], 'no data loss — a pre-existing entity survived the round trip');

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
