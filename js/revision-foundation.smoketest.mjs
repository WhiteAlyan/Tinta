// Tinta — Real Revision Foundation smoketest.
//
// Covers the work this pass actually did, none of which had tests yet:
//   1. Chapter snapshots gain a structured `auto` flag (was previously
//      only inferable from a label string).
//   2. capAutoSnapshots evicts oldest auto snapshots past a cap of 10,
//      never touching manual ones — for both chapters and entities.
//   3. Entities gain their own snapshot mechanism (create/get/restore/
//      delete), parallel to chapters', plus an auto-checkpoint trigger
//      wired into updateEntity.
//   4. Migration backfills entity.snapshots/lastAutoCheckpointAt, and
//      chapter snapshot.auto (recognizing the old 'Auto-checkpoint'
//      label convention), and retroactively caps any already-bloated
//      snapshot list.
//   5. getLastActiveChapter's tie-break fix — prefers recentChapterIds[0]
//      over a raw lastOpenedAt sort, since two chapters can share the
//      exact same millisecond timestamp.
//   6. createSeriesEntity carries the same canonStatus/generation/
//      snapshots/lastAutoCheckpointAt fields createEntity does.
//
// No DOM, no UI — pure store.js logic, same shape as every other
// *.smoketest.mjs. Run with: node revision-foundation.smoketest.mjs

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

// ── 1. createSnapshot — structured auto flag ────────────────────────────
section('createSnapshot — auto flag is structured, not inferred from label');
globalThis.localStorage.clear();
{
  Store.createProject('Snapshot Flags');
  const ch = Store.getActiveProject().chapters[0];
  Store.updateChapterContent(ch.id, 'Some real content.');

  const manual = Store.createSnapshot(ch.id, 'My manual save');
  assertEqual(manual.auto, false, 'default createSnapshot() call is auto: false');

  const auto = Store.createSnapshot(ch.id, 'Auto-checkpoint', true);
  assertEqual(auto.auto, true, 'explicit auto: true is respected');

  // A writer typing the exact string "Auto-checkpoint" as their own
  // manual label is NOT treated as an auto snapshot — the flag, not the
  // label, is authoritative.
  const trickyManual = Store.createSnapshot(ch.id, 'Auto-checkpoint');
  assertEqual(trickyManual.auto, false, 'a manual snapshot labeled exactly "Auto-checkpoint" is still auto: false — the flag decides, not the string');
}

// ── 2. capAutoSnapshots — evicts oldest auto only, never manual ─────────
section('chapter snapshots — capping evicts oldest auto snapshots, leaves manual ones untouched');
globalThis.localStorage.clear();
{
  Store.createProject('Snapshot Cap');
  const ch = Store.getActiveProject().chapters[0];
  Store.updateChapterContent(ch.id, 'Content.');

  const manualIds = [];
  for (let i = 0; i < 5; i++) {
    manualIds.push(Store.createSnapshot(ch.id, `Manual ${i}`).id);
  }
  const autoIds = [];
  for (let i = 0; i < 15; i++) {
    autoIds.push(Store.createSnapshot(ch.id, `Auto ${i}`, true).id);
  }

  const snaps = Store.getSnapshots(ch.id);
  assertEqual(snaps.length, 5 + 10, 'total snapshots = 5 manual + 10 auto (5 oldest auto evicted from 15)');

  manualIds.forEach((id) => {
    assert(snaps.some((s) => s.id === id), `manual snapshot ${id} survives capping regardless of count`);
  });

  const survivingAutoLabels = snaps.filter((s) => s.auto).map((s) => s.label).sort();
  const expectedSurviving = autoIds.slice(5).length; // the 10 newest auto ones
  assertEqual(survivingAutoLabels.length, 10, 'exactly 10 auto snapshots survive');
  assert(!snaps.some((s) => s.label === 'Auto 0'), 'the very oldest auto snapshot ("Auto 0") was evicted');
  assert(!snaps.some((s) => s.label === 'Auto 4'), 'the 5th-oldest auto snapshot ("Auto 4") was evicted (5 evicted total)');
  assert(snaps.some((s) => s.label === 'Auto 5'), 'the 6th auto snapshot ("Auto 5") survives — it\'s within the newest 10');
  assert(snaps.some((s) => s.label === 'Auto 14'), 'the newest auto snapshot survives');
}

// ── 3. updateChapterContent — periodic auto-checkpoint trigger ──────────
section('updateChapterContent — auto-checkpoint only fires once the interval has elapsed');
globalThis.localStorage.clear();
{
  Store.createProject('Auto-Checkpoint Timing');
  const ch = Store.getActiveProject().chapters[0];
  Store.updateChapterContent(ch.id, 'First write.');
  assertEqual(Store.getSnapshots(ch.id).length, 0, 'no snapshot on the very first content write (nothing worth checkpointing yet)');

  Store.updateChapterContent(ch.id, 'Second write, moments later.');
  assertEqual(Store.getSnapshots(ch.id).length, 0, 'no snapshot fires immediately after — interval has not elapsed');

  // Roll the checkpoint clock back past the interval to simulate time
  // having passed, same technique the interval logic itself checks
  // against (lastAutoCheckpointAt).
  const db = Store.getActiveDb();
  const project = db.projects[db.activeProjectId];
  const staleChapter = project.chapters.find((c) => c.id === ch.id);
  staleChapter.lastAutoCheckpointAt = new Date(Date.now() - 21 * 60 * 1000).toISOString();
  Store.save();

  Store.updateChapterContent(ch.id, 'Third write, after the interval.');
  const snaps = Store.getSnapshots(ch.id);
  assertEqual(snaps.length, 1, 'exactly one auto-checkpoint fires once 20+ minutes have passed since the last one');
  assertEqual(snaps[0].auto, true, 'the fired checkpoint is flagged auto: true');
  assertEqual(snaps[0].content, 'Second write, moments later.', 'the checkpoint captures content as it was BEFORE this write, not after');
}

// ── 4. Entity snapshots — create/get/restore/delete ─────────────────────
section('entity snapshots — create, list ordering, restore, delete');
globalThis.localStorage.clear();
{
  Store.createProject('Entity Snapshots');
  const ent = Store.createEntity({ name: 'Kessa', type: 'character', description: 'Original description' });

  assertEqual(Store.getEntitySnapshots(ent.id).length, 0, 'a fresh entity has no snapshots yet');

  const snap1 = Store.createEntitySnapshot(ent.id, 'First save');
  await new Promise((r) => setTimeout(r, 5));
  Store.updateEntity(ent.id, { description: 'Revised description' });
  const snap2 = Store.createEntitySnapshot(ent.id, 'Second save');

  assertEqual(snap1.data.description, 'Original description', 'first snapshot captured the original description');
  assertEqual(snap2.data.description, 'Revised description', 'second snapshot captured the revised description');
  assert(!('snapshots' in snap1.data), 'a snapshot\'s captured data does not nest the snapshots array inside itself');

  const list = Store.getEntitySnapshots(ent.id);
  assertEqual(list.length, 2, 'two snapshots exist');
  assertEqual(list[0].id, snap2.id, 'getEntitySnapshots sorts newest-first');

  // Restore — should auto-snapshot the current state first, then apply
  // the old data.
  Store.updateEntity(ent.id, { description: 'A third, worse rewrite' });
  Store.restoreEntitySnapshot(ent.id, snap1.id);
  const restored = Store.getEntity(ent.id);
  assertEqual(restored.description, 'Original description', 'restoreEntitySnapshot rolls the description back to the snapshotted value');

  const afterRestoreList = Store.getEntitySnapshots(ent.id);
  assertEqual(afterRestoreList.length, 3, 'restoring itself creates one more snapshot (the pre-restore safety net) on top of the 2 explicit saves — 3 total, since neither prior updateEntity call was far enough apart to trigger the periodic auto-checkpoint');
  assert(afterRestoreList.some((s) => s.label.startsWith('Before restoring') && s.auto === true), 'a "Before restoring" snapshot was auto-created, flagged auto: true, so restoring is never one-way');

  Store.deleteEntitySnapshot(ent.id, snap2.id);
  assert(!Store.getEntitySnapshots(ent.id).some((s) => s.id === snap2.id), 'deleteEntitySnapshot removes the targeted snapshot');

  assertEqual(Store.restoreEntitySnapshot('nonexistent-id', snap1.id), undefined, 'restoreEntitySnapshot on a nonexistent entity is a safe no-op');
  assertEqual(Store.getEntitySnapshots('nonexistent-id').length, 0, 'getEntitySnapshots on a nonexistent entity returns []');
}

// ── 5. updateEntity — auto-checkpoint trigger, same interval as chapters ─
section('updateEntity — auto-checkpoint only fires once the interval has elapsed');
globalThis.localStorage.clear();
{
  Store.createProject('Entity Auto-Checkpoint Timing');
  const ent = Store.createEntity({ name: 'Dorn', type: 'character', description: 'v1' });
  assertEqual(Store.getEntitySnapshots(ent.id).length, 0, 'no snapshot yet');

  Store.updateEntity(ent.id, { description: 'v2' });
  assertEqual(Store.getEntitySnapshots(ent.id).length, 0, 'no auto-checkpoint fires immediately after creation — interval has not elapsed');

  const db = Store.getActiveDb();
  const project = db.projects[db.activeProjectId];
  const staleEntity = project.entities[ent.id];
  staleEntity.lastAutoCheckpointAt = new Date(Date.now() - 21 * 60 * 1000).toISOString();
  Store.save();

  Store.updateEntity(ent.id, { description: 'v3' });
  const snaps = Store.getEntitySnapshots(ent.id);
  assertEqual(snaps.length, 1, 'exactly one auto-checkpoint fires once 20+ minutes have passed');
  assertEqual(snaps[0].auto, true, 'the fired checkpoint is flagged auto: true');
  assertEqual(snaps[0].data.description, 'v2', 'the checkpoint captures state as it was BEFORE this update, not after');
  assertEqual(Store.getEntity(ent.id).description, 'v3', 'the actual update still applies normally');
}

// ── 6. capAutoSnapshots applies to entities too ──────────────────────────
section('entity snapshots — capping evicts oldest auto snapshots, leaves manual ones untouched');
globalThis.localStorage.clear();
{
  Store.createProject('Entity Snapshot Cap');
  const ent = Store.createEntity({ name: 'Vell', type: 'character' });

  for (let i = 0; i < 3; i++) Store.createEntitySnapshot(ent.id, `Manual ${i}`);
  for (let i = 0; i < 15; i++) Store.createEntitySnapshot(ent.id, `Auto ${i}`, true);

  const snaps = Store.getEntitySnapshots(ent.id);
  assertEqual(snaps.length, 3 + 10, 'total = 3 manual + 10 auto (5 oldest auto evicted)');
  assert(!snaps.some((s) => s.label === 'Auto 0'), 'oldest auto snapshot evicted');
  assert(snaps.some((s) => s.label === 'Auto 14'), 'newest auto snapshot survives');
  assert(snaps.some((s) => s.label === 'Manual 0'), 'oldest manual snapshot is NOT evicted regardless of auto-snapshot volume');
}

// ── 7. Migration — backfills entity snapshot fields + auto flag ─────────
section('Migration — a pre-Real-Revision-Foundation backup backfills entity snapshots and chapter snapshot.auto');
globalThis.localStorage.clear();
{
  Store.createProject('Migration Check');
  const ent = Store.createEntity({ name: 'Legacy Entity', type: 'character' });
  const ch = Store.getActiveProject().chapters[0];
  Store.updateChapterContent(ch.id, 'Chapter body.');
  Store.createSnapshot(ch.id, 'A pre-existing manual snapshot');
  Store.createSnapshot(ch.id, 'Auto-checkpoint'); // old label-only convention, no structured flag yet

  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProjectId = legacyDb.activeProjectId;
  const legacyProject = legacyDb.projects[legacyProjectId];

  // Strip the fields this pass introduced, simulating a genuinely old save.
  const legacyEntity = legacyProject.entities[ent.id];
  delete legacyEntity.snapshots;
  delete legacyEntity.lastAutoCheckpointAt;
  legacyProject.chapters.forEach((c) => {
    (c.snapshots || []).forEach((s) => { delete s.auto; });
  });

  assert(legacyEntity.snapshots === undefined, 'sanity check — entity.snapshots really is gone in the legacy fixture');
  assert(legacyProject.chapters[0].snapshots.every((s) => s.auto === undefined), 'sanity check — snapshot.auto really is gone in the legacy fixture');

  Store.importFullBackup(JSON.stringify(legacyDb));
  const healed = Store.getActiveProject();

  const healedEntity = healed.entities[ent.id];
  assert(Array.isArray(healedEntity.snapshots), 'migration backfills entity.snapshots to [] rather than throwing');
  assertEqual(healedEntity.snapshots.length, 0, 'backfilled entity.snapshots is empty, not populated with garbage');
  assert(typeof healedEntity.lastAutoCheckpointAt === 'string', 'migration backfills entity.lastAutoCheckpointAt to a timestamp string');

  const healedChapter = healed.chapters.find((c) => c.id === ch.id);
  const manualSnap = healedChapter.snapshots.find((s) => s.label === 'A pre-existing manual snapshot');
  const oldAutoLabeledSnap = healedChapter.snapshots.find((s) => s.label === 'Auto-checkpoint');
  assertEqual(manualSnap.auto, false, 'a legacy snapshot with an ordinary label backfills auto: false');
  assertEqual(oldAutoLabeledSnap.auto, true, 'a legacy snapshot labeled exactly "Auto-checkpoint" backfills auto: true, preserving the old label-based signal');
}

// ── 7b. Migration — retroactively caps an already-bloated snapshot list ─
section('Migration — retroactively caps a pre-existing snapshot list that already exceeds the auto cap');
globalThis.localStorage.clear();
{
  Store.createProject('Bloated Snapshots');
  const ch = Store.getActiveProject().chapters[0];
  Store.updateChapterContent(ch.id, 'Body.');

  const legacyDb = JSON.parse(Store.exportFullBackup());
  const legacyProject = legacyDb.projects[legacyDb.activeProjectId];
  const legacyChapter = legacyProject.chapters[0];
  // Simulate 20 auto snapshots that accumulated under the old, uncapped
  // behavior — bypassing createSnapshot entirely, since this fixture
  // represents data saved before capAutoSnapshots existed at all.
  legacyChapter.snapshots = Array.from({ length: 20 }, (_, i) => ({
    id: `legacy-snap-${i}`,
    label: `Old auto ${i}`,
    content: 'x',
    wordCount: 1,
    createdAt: new Date(Date.now() - (20 - i) * 1000).toISOString(),
    auto: true,
  }));

  Store.importFullBackup(JSON.stringify(legacyDb));
  const healedChapter = Store.getActiveProject().chapters.find((c) => c.id === legacyChapter.id);
  assertEqual(healedChapter.snapshots.length, 10, 'a pre-existing bloated auto-snapshot list is capped to 10 retroactively on import, not just going forward');
  assert(healedChapter.snapshots.some((s) => s.label === 'Old auto 19'), 'the newest of the old auto snapshots survives capping');
  assert(!healedChapter.snapshots.some((s) => s.label === 'Old auto 0'), 'the oldest of the old auto snapshots was evicted retroactively');
}

// ── 8. createSeriesEntity — carries the same new fields as createEntity ──
section('createSeriesEntity — includes canonStatus/generation/snapshots/lastAutoCheckpointAt like createEntity');
globalThis.localStorage.clear();
{
  Store.createProject('Series Entity Fields');
  const series = Store.createSeries('My Series');
  Store.addActiveProjectToSeries(series.id);
  const seriesEnt = Store.createSeriesEntity({ name: 'A Series Character', type: 'character' });
  assert(!!seriesEnt, 'createSeriesEntity succeeds once a series exists');
  assertEqual(seriesEnt.canonStatus, 'canon', 'series entity defaults canonStatus to "canon", matching createEntity\'s foundational-pass default');
  assertEqual(seriesEnt.generation, null, 'series entity has a generation field, defaulting to null');
  assert(Array.isArray(seriesEnt.snapshots), 'series entity has a snapshots array from creation, matching createEntity');
  assertEqual(seriesEnt.snapshots.length, 0, 'series entity starts with no snapshots');
  assert(typeof seriesEnt.lastAutoCheckpointAt === 'string', 'series entity has a lastAutoCheckpointAt timestamp from creation');

  // And the snapshot mechanism itself should work on a series entity —
  // getEntity() resolves both project- and series-owned entities through
  // the same lookup, so createEntitySnapshot should too.
  const snap = Store.createEntitySnapshot(seriesEnt.id, 'Series entity snapshot');
  assert(!!snap, 'createEntitySnapshot works on a series-owned entity, not just project-owned ones');
  assertEqual(Store.getEntitySnapshots(seriesEnt.id).length, 1, 'the snapshot is retrievable through the same series-aware lookup');
}

// ── 9. getLastActiveChapter — genuine same-millisecond tie ──────────────
section('getLastActiveChapter — recentChapterIds breaks a genuine same-millisecond lastOpenedAt tie');
globalThis.localStorage.clear();
{
  Store.createProject('Tie Break');
  const chA = Store.createChapter('Chapter A');
  const chB = Store.createChapter('Chapter B');

  // Open A then B through the real call path first, so recentChapterIds
  // reflects "B was opened after A" the normal way...
  Store.recordChapterOpened(chA.id);
  Store.recordChapterOpened(chB.id);

  // ...then force a genuine tie on lastOpenedAt — the exact scenario a
  // 5ms setTimeout gap (as used elsewhere in these smoketests) cannot
  // reproduce, but rapid real-world chapter-switching can.
  const db = Store.getActiveDb();
  const project = db.projects[db.activeProjectId];
  const tieTimestamp = '2025-01-01T00:00:00.000Z';
  project.chapters.forEach((c) => { if (c.id === chA.id || c.id === chB.id) c.lastOpenedAt = tieTimestamp; });
  // Put A earlier in the chapters array than B (already true here, since
  // it was created first) — a raw stable sort on a tie would silently
  // keep A, which is exactly the bug this fix corrects.
  Store.save();

  const result = Store.getLastActiveChapter(project);
  assertEqual(result.chapterId, chB.id, 'returns B (the actually-most-recently-opened chapter per recentChapterIds), not A (which a tied lastOpenedAt sort would incorrectly keep)');

  // If recentChapterIds is empty or doesn't resolve, falls back to the
  // lastOpenedAt sort as before.
  project.recentChapterIds = [];
  Store.save();
  const fallbackResult = Store.getLastActiveChapter(Store.getActiveProject());
  assert(!!fallbackResult, 'falls back to the lastOpenedAt sort when recentChapterIds is empty, rather than returning null');
}

// ── 10. getEntitySnapshotChanges — restore-preview-consistency pass ──────
// Deliberately a shallow, top-level comparison (see the function's own
// comment in store.js for why a deep structural diff was scoped out) —
// these checks confirm it reports the right set of changed keys with
// readable before/after summaries, not a field-by-field content diff.
section('getEntitySnapshotChanges — shallow top-level comparison for the restore-preview UI');
globalThis.localStorage.clear();
{
  Store.createProject('Compare Pass');
  const ent = Store.createEntity({ name: 'Orin', type: 'character', description: 'A quiet blacksmith.' });
  ent.tags = ['minor'];
  Store.save();
  const snap = Store.createEntitySnapshot(ent.id, 'Before rewrite');

  // No changes yet — snapshot matches current exactly.
  const noChanges = Store.getEntitySnapshotChanges(ent.id, snap.id);
  assertEqual(noChanges.length, 0, 'a snapshot taken of the current state reports zero changes against itself');

  // Change a scalar field, an array field, and leave one untouched.
  Store.updateEntity(ent.id, { description: 'A renowned swordsmith.' });
  const liveEnt = Store.getEntity(ent.id);
  liveEnt.tags = ['major', 'plot-relevant'];
  Store.save();

  const changes = Store.getEntitySnapshotChanges(ent.id, snap.id);
  const keys = changes.map((c) => c.key);
  assert(keys.includes('description'), 'reports description as changed');
  assert(keys.includes('tags'), 'reports tags as changed');
  assert(!keys.includes('name'), 'does not report name — it was never touched');
  assert(!keys.includes('id') && !keys.includes('createdAt') && !keys.includes('snapshots'), 'never reports internal bookkeeping keys (id/createdAt/snapshots)');

  const descChange = changes.find((c) => c.key === 'description');
  assertEqual(descChange.current, 'A renowned swordsmith.', 'description change shows the current value');
  assertEqual(descChange.snapshot, 'A quiet blacksmith.', 'description change shows the snapshotted value');

  const tagsChange = changes.find((c) => c.key === 'tags');
  assert(tagsChange.current.includes('2') && tagsChange.snapshot.includes('1'), 'array-valued fields report a count summary, not a deep diff of the array contents — by design');

  assertEqual(changes[0].key, 'description', 'name/description sort first when present, ahead of alphabetical fields');

  // Long string values are truncated for display, not dumped in full.
  const longEnt = Store.createEntity({ name: 'Vale', type: 'location', description: 'x'.repeat(200) });
  const longSnap = Store.createEntitySnapshot(longEnt.id, 'Long text');
  Store.updateEntity(longEnt.id, { description: 'y'.repeat(200) });
  const longChanges = Store.getEntitySnapshotChanges(longEnt.id, longSnap.id);
  const longDescChange = longChanges.find((c) => c.key === 'description');
  assert(longDescChange.current.length <= 80, 'long field values are truncated for the compare view, not shown in full');

  assertEqual(Store.getEntitySnapshotChanges('nonexistent-id', snap.id).length, 0, 'getEntitySnapshotChanges on a nonexistent entity returns []');
  assertEqual(Store.getEntitySnapshotChanges(ent.id, 'nonexistent-snap').length, 0, 'getEntitySnapshotChanges on a nonexistent snapshot returns []');
}

// ── summary ────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}
