// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js-1-24

import { isCrossTabStale, load, replaceDb, save } from './store-core.js';

export function exportManifest() {
  return JSON.stringify(load(), null, 2);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js-32-36

export function exportFullBackup() {
  return JSON.stringify(load(), null, 2);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js-42-45
export function importFullBackup(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.projects || Object.keys(parsed.projects).length === 0) {
    throw new Error("That file doesn't look like a Tinta backup.");
  }
  if (!parsed.activeProjectId || !parsed.projects[parsed.activeProjectId]) {
    // Dangling/missing active-project pointer — fall back to whatever's in
    // the file rather than rejecting an otherwise-valid backup over this.
    parsed.activeProjectId = Object.keys(parsed.projects)[0];
  }
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js-61-66
  if (isCrossTabStale()) {
    throw new Error('This tab is paused because another tab just saved. Reload this tab, then try the restore again.');
  }
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js-70-76
  const previousDb = load();
  const restored = replaceDb(parsed);
  const ok = save();
  if (!ok) {
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js-81-85
    replaceDb(previousDb);
    // P2-1 fix — the old "storage may be full" message was misleading
    // when the actual failure was a cross-tab-stale race. The
    // isCrossTabStale() check at line 32 narrows the race window but
    // doesn't eliminate it: a storage event from another tab can fire
    // between that check and the save() call, setting _crossTabStale
    // mid-flight. Now branch on the live state so the writer gets an
    // accurate diagnosis — "tab paused" tells them to reload and try
    // again, "storage full" tells them to clean up.
    if (isCrossTabStale()) {
      throw new Error('This tab was paused mid-restore because another tab just saved. Reload this tab, then try the restore again. Your current project was not changed.');
    }
    throw new Error('The backup was read, but saving it locally failed (storage may be full). Your current project was not changed.');
  }
  return restored;
}
