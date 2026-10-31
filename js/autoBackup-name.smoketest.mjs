// Tinta — auto-backup naming + rotation smoketest (roadmap #9).
//
// Pure-logic test of autoBackupName.js: the dated-stamp format and the
// rotation selection. No DOM, no File System Access, no store — the
// handle-touching side in autoBackup.js is deliberately not imported.
// Run with: node autoBackup-name.smoketest.mjs

import { AUTOBACKUP_KEEP, autoBackupStamp, selectAutoBackupsToRotate } from './autoBackupName.js';

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  assert(a === b, `${msg} — expected ${b}, got ${a}`);
}
function section(title) { console.log(`\n${title}`); }

section('autoBackupStamp — local-date format, zero-padded');
// Months are 0-indexed in the Date constructor: month 9 = October.
assertEqual(autoBackupStamp(new Date(2026, 9, 31)), '2026-10-31', 'October 31 2026 stamps as 2026-10-31');
assertEqual(autoBackupStamp(new Date(2026, 0, 5)), '2026-01-05', 'January 5 stamps zero-padded as 2026-01-05');
assertEqual(autoBackupStamp(new Date(2026, 11, 1)), '2026-12-01', 'December 1 stamps as 2026-12-01');

section('selectAutoBackupsToRotate — keeps the newest five dated backups, deletes the oldest first');
{
  const base = 'My_Novel';
  const names = [
    'My_Novel.tinta',                        // manual export — never touched
    'My_Novel-autosave-2026-10-24.tinta',    // oldest dated backup
    'My_Novel-autosave-2026-10-25.tinta',
    'My_Novel-autosave-2026-10-26.tinta',
    'My_Novel-autosave-2026-10-27.tinta',
    'My_Novel-autosave-2026-10-28.tinta',
    'My_Novel-autosave-2026-10-29.tinta',
    'My_Novel-autosave-2026-10-30.tinta',    // newest dated backup
    'Other_Novel-autosave-2026-10-30.tinta', // a DIFFERENT project's backup — never touched
    'Old_Name-autosave-2026-10-01.tinta',    // pre-rename leftovers — never touched
    'notes.txt',                              // unrelated file — never touched
  ];
  const toDelete = selectAutoBackupsToRotate(names, base);
  assertDeepEqual(
    toDelete,
    ['My_Novel-autosave-2026-10-24.tinta', 'My_Novel-autosave-2026-10-25.tinta'],
    'with 7 dated backups and keep=5, exactly the two oldest are selected, oldest first'
  );
}

section('selectAutoBackupsToRotate — boundaries: exactly at the cap and one over');
{
  const base = 'My_Novel';
  const five = [
    'My_Novel-autosave-2026-10-26.tinta',
    'My_Novel-autosave-2026-10-27.tinta',
    'My_Novel-autosave-2026-10-28.tinta',
    'My_Novel-autosave-2026-10-29.tinta',
    'My_Novel-autosave-2026-10-30.tinta',
  ];
  assertDeepEqual(selectAutoBackupsToRotate(five, base), [], 'exactly AUTOBACKUP_KEEP dated backups — nothing is selected');
  const six = [...five, 'My_Novel-autosave-2026-10-31.tinta'];
  assertDeepEqual(
    selectAutoBackupsToRotate(six, base),
    ['My_Novel-autosave-2026-10-26.tinta'],
    'one over the cap — only the oldest is selected'
  );
  assertEqual(AUTOBACKUP_KEEP, 5, 'the cap is 5, the rotation the review suggested');
}

section('selectAutoBackupsToRotate — the base name is matched literally, regex metacharacters included');
{
  const base = 'C++_Novel_(v2)_100%';
  const names = [
    'C++_Novel_(v2)_100%-autosave-2026-10-30.tinta',
    'C++_Novel_(v2)_100%-autosave-2026-10-29.tinta',
    'C++_Novel_(v2)_100%-autosave-2026-10-28.tinta',
    'C++_Novel_(v2)_100%-autosave-2026-10-27.tinta',
    'C++_Novel_(v2)_100%-autosave-2026-10-26.tinta',
    'C++_Novel_(v2)_100%-autosave-2026-10-25.tinta',
  ];
  assertDeepEqual(
    selectAutoBackupsToRotate(names, base),
    ['C++_Novel_(v2)_100%-autosave-2026-10-25.tinta'],
    'a base full of regex metacharacters neither crashes nor over-matches'
  );
}

section('selectAutoBackupsToRotate — a custom keep is honored');
{
  const base = 'My_Novel';
  const names = [
    'My_Novel-autosave-2026-10-28.tinta',
    'My_Novel-autosave-2026-10-29.tinta',
    'My_Novel-autosave-2026-10-30.tinta',
  ];
  assertDeepEqual(
    selectAutoBackupsToRotate(names, base, 2),
    ['My_Novel-autosave-2026-10-28.tinta'],
    'keep=2 over three dated backups selects exactly the oldest'
  );
}

section('selectAutoBackupsToRotate — strict shape: wrong stamp shape is never selected');
{
  const base = 'My_Novel';
  const names = [
    'My_Novel-autosave-2026-10-30.tinta',     // correct shape
    'My_Novel-autosave-2026-10-30-123456.tinta', // a second-resolution stamp from another scheme — not this module's
    'My_Novel-autosave-not-a-date.tinta',
    'My_Novel-autosave-2026-10-30.tinta.bak',
  ];
  assertDeepEqual(
    selectAutoBackupsToRotate(names, base, AUTOBACKUP_KEEP),
    [],
    'only exact <base>-autosave-YYYY-MM-DD.tinta files are rotation candidates — nothing at the cap means nothing selected'
  );
}

console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}
