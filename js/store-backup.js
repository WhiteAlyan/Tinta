// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js

// Roadmap #7 — clearUndoHistory joined the import: a full-backup restore
// replaces the entire db, so undo entries recorded before the restore point
// at records that no longer exist (or worse, undo a restore into a mixture
// of two documents). Same treatment recoveryToast's restore got.
import { clearUndoHistory, isCrossTabStale, load, replaceDb, saveNow } from './store-core.js';

export function exportManifest() {
  return JSON.stringify(load(), null, 2);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js

export function exportFullBackup() {
  return JSON.stringify(load(), null, 2);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js
// CR-41 — now async: the persistence decision needs the LANDED result
// (await saveNow()), not the coalesced-flush "accepted" boolean, because
// a failed import must roll the previous db back. Callers await it
// (backup.js's importFullBackupWithImages did not need to await before —
// the old body was fully synchronous — and now does).
export async function importFullBackup(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.projects || Object.keys(parsed.projects).length === 0) {
    throw new Error("That file doesn't look like a Tinta backup.");
  }
  // CR-20 — the old check stopped at "projects is a non-empty object". A
  // structurally plausible backup shaped {"projects":{"p1":"garbage"}}
  // sailed past it, reached migrate()'s legacy field migration, and died
  // on a strict-mode assignment to a string primitive — the writer saw a
  // raw TypeError in the import UI instead of the designed message. Each
  // project record must be an actual record object; anything else is the
  // friendly rejection. (No data loss either way — migrate() throws before
  // any state is touched — but the message should be Tinta's, not the
  // engine's.)
  for (const pid of Object.keys(parsed.projects)) {
    const record = parsed.projects[pid];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error("That file doesn't look like a Tinta backup.");
    }
  }
  if (!parsed.activeProjectId || !parsed.projects[parsed.activeProjectId]) {
    // Dangling/missing active-project pointer — fall back to whatever's in
    // the file rather than rejecting an otherwise-valid backup over this.
    parsed.activeProjectId = Object.keys(parsed.projects)[0];
  }
  // CR-02 fix — a full-backup file is UNTRUSTED INPUT, but until now
  // migrate() kept any grammar object it contained verbatim (it only
  // backfills settings that are MISSING). A crafted or borrowed backup
  // could therefore land with grammar.enabled = true and endpointUrl
  // pointing at any host; the first click of the Grammar button would
  // then POST the full chapter text — plus any stored LanguageTool
  // apiKey and username — to that host (grammarModal.js sends
  // chapter.content untruncated, and the CSP's connect-src https: makes
  // the destination unconstrained). The .tinta project-import path
  // already defends against exactly this by building an empty grammar
  // shell that migrate() backfills with safe defaults; the full-backup
  // path now does the same. grammar.js is the only module in js/ that
  // calls fetch(), so the grammar block is the only network-touching
  // setting a backup can carry — the rest (ambience URL, fonts,
  // background images) are playback/asset choices the CSP constrains
  // (media-src 'self' blob: https: — CR-17 allows https audio for
  // first-party URL playback, but an imported backup's customTrackUrl is
  // still untrusted input, which is why the ambience settings reset below
  // remains: it re-anchors playback to the writer's own choices, not the
  // file's). Deleted rather than emptied:
  // migrate() backfills a missing grammar block with its canonical
  // safe shell (enabled: false, the stock LanguageTool endpoint, no
  // credentials), so a restored session lands in exactly the state a
  // fresh install would — the writer consciously re-enables and re-
  // points the checker from Settings. Cost: re-picking the grammar
  // endpoint after a restore — the same consent-reset price the .tinta
  // path has always paid, and the honest default for a file that may
  // not have come from this machine.
  delete parsed.grammar;
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js
  if (isCrossTabStale()) {
    throw new Error('This tab is paused because another tab just saved. Reload this tab, then try the restore again.');
  }
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js
  const previousDb = load();
  // CR-20 — belt and braces: the per-record validation above catches the
  // reported shape, but migrate() walks every nested field (chapters,
  // entities, settings) and any other structurally plausible garbage
  // should surface as the same friendly rejection, not a TypeError.
  // replaceDb's own designed errors (the schema-downgrade refusal) pass
  // through untouched. migrate() throws BEFORE _db is swapped, so the
  // in-memory db is untouched on this path — no rollback needed.
  let restored;
  try {
    restored = replaceDb(parsed);
  } catch (err) {
    if (/newer version of Tinta/.test(err?.message || '')) throw err;
    throw new Error("That file doesn't look like a Tinta backup.", { cause: err });
  }
  // CR-41 — await the landed result so a failed restore rolls back the
  // previous db instead of optimistically clearing it while the flush is
  // still in flight.
  const ok = await saveNow();
  if (!ok) {
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-backup-js
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
  // Roadmap #7 — the restore landed. Every undo entry still on the stack
  // describes a mutation to the PRE-restore db; undoing now would apply an
  // old-document delta on top of a different document (or silently "undo"
  // the restore itself). Clearing is the honest state: there is nothing to
  // undo *into* — the pre-restore world only exists in the backup file.
  // Only cleared on SUCCESS: the failure path above already rolled the
  // in-memory db back, so its undo history still matches reality.
  clearUndoHistory();
  return restored;
}
