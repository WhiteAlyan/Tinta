// Roadmap #9 — pure naming/rotation logic for the folder auto-backup,
// split out of autoBackup.js so the smoketest can exercise it in Node
// without importing the File-System-Access side of the module. Nothing
// here touches a handle, a store, or the DOM: strings in, strings out.
//
// The auto-backup used to write ONE fixed-name .tinta per project: every
// save overwrote it, so a mistake made today replaced yesterday's good
// copy with today's bad one — a mirror, not a safety net. Backups now
// carry a local-DATE stamp in the filename: the same day's saves rewrite
// the same dated file (no file spam from the save debounce), and after
// each successful write the folder is rotated down to the newest
// AUTOBACKUP_KEEP dated files for that project. Five dates is a work
// week of history. Only files matching the exact naming pattern are ever
// selected for deletion — manual exports and anything else in the folder
// are untouched.

export const AUTOBACKUP_KEEP = 5;

function pad2(n) { return String(n).padStart(2, '0'); }

// Local date, not UTC — the writer compares a folder's backups against
// their own writing history on the machine they were written on, and
// "today" for a writer starts at their local midnight.
export function autoBackupStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pure selection logic — unit-tested in autoBackup-name.smoketest.mjs.
// Given every filename in the folder and the current project's base name
// (the export filename minus .tinta), return the auto-backup files to
// DELETE: this project's dated backups, oldest first, everything past
// `keep`. Anything not matching the exact
// `<base>-autosave-YYYY-MM-DD.tinta` shape is never selected — a renamed
// project's old backups, manual exports, and unrelated files in the
// folder are all invisible to this function.
export function selectAutoBackupsToRotate(names, base, keep = AUTOBACKUP_KEEP) {
  // Double backslashes are required: this is a template literal STRING
  // handed to new RegExp, so \\d must reach the regex engine as \d.
  const mine = new RegExp(`^${escapeRegExp(base)}-autosave-\\d{4}-\\d{2}-\\d{2}\\.tinta$`);
  const stampOf = (name) => name.slice(base.length + '-autosave-'.length, -'.tinta'.length);
  const dated = names.filter((n) => mine.test(n));
  dated.sort((a, b) => stampOf(a) < stampOf(b) ? -1 : stampOf(a) > stampOf(b) ? 1 : 0);
  return dated.slice(0, Math.max(0, dated.length - keep));
}
