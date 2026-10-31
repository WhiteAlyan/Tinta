// Tinta — CR-06…CR-40 remainder batch (batch 5) smoketest.
//
// Same convention as cr-urgent-batch.smoketest.mjs / quickwins.smoketest.mjs /
// storage-epic.smoketest.mjs: a minimal in-memory localStorage shim, imported
// against the real store.js + the real domain modules, asserting on
// observable behavior. Run with:
//   node cr-batch5.smoketest.mjs
//
// Store-side / pure-logic coverage for the batch that closed the
// CR-06…CR-40 remainder (in report order):
//   CR-06  equal-revision clobber detection (mirror storage-event path by
//          content hash, BroadcastChannel path by session id)
//   CR-09  markdown export: exportable-chapter filter + token stripping;
//          underline runs in the DOCX/EPUB paragraph parser
//   CR-10  Myers O(ND) diff: correctness, large-document latency, the
//          over-budget replace-pair fallback, exact summary counts
//   CR-18  CJK counting: wordCount, Word Check's tokenizer, the style-guide
//          scanner's CJK boundaries (Latin behavior unchanged)
//   CR-20  structurally-plausible corrupt backups get the friendly
//          rejection, not a raw TypeError
//   CR-21  exportTintaProject honors its id parameter
//   CR-22  reorderChapter with an unknown id is a no-op, not a TypeError
//   CR-23  entity delete backs up (and restore rebuilds) its cascade
//          relationships; prototype-key ids can't fabricate backups
//   CR-37  safeFilename keeps non-ASCII titles
//   CR-38  mention chip attribute is single-escaped; resolver sees raw names
//   CR-40  EPUB manifest media-type is allow-listed
//
// Standing gap (same as every prior UI pass): the DOM-bound halves —
// CR-07's watermark comparison in the banner handler, CR-08's
// execCommand-based undo preservation, CR-11/12/14/15/16/24/25/26/27/28/39's
// view-layer behavior — have no jsdom harness in this suite and are pinned
// by code review against the referenced DOM shapes, not executed here.

// ── localStorage shim ───────────────────────────────────────────────────
class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();
globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {} };

const Store = await import('./store.js');
const Format = await import('./format.js');
const Diff = await import('./diff.js');
const WordTools = await import('./wordtools.js');
const Craft = await import('./store-craft.js');
const ManuscriptExport = await import('./manuscriptExport.js');
const FileFns = await import('./file-utils.js');
const TintaPackage = await import('./tintaPackage.js');

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

section('Setup — one project, several chapters in different states');
Store.createProject('Batch Five');
const batchProjectId = Store.getActiveProject().id; // later sections switch away — CR-06 needs to come back
const kept = Store.createChapter('Kept Chapter');
Store.updateChapterContent(kept.id, 'She said **wait** and {{u:never}} moved. Plain words remain.');
const trashed = Store.createChapter('Trashed Chapter');
Store.updateChapterContent(trashed.id, '{{u:secret trashed text}}');
Store.trashChapter(trashed.id);
const archived = Store.createChapter('Archived Chapter');
Store.updateChapterContent(archived.id, 'archived prose');
Store.archiveChapter(archived.id);
const scratch = Store.createChapter('Scratch Notes');
Store.updateChapterContent(scratch.id, 'scratch prose');
Store.updateChapterMeta(scratch.id, { docType: 'research-note' }); // builtin role: 'scratch'

section('CR-18 — wordCount counts CJK characters as words');
assertEqual(Format.wordCount(''), 0, 'empty stays zero');
assertEqual(Format.wordCount('   \n  '), 0, 'whitespace-only stays zero');
assertEqual(Format.wordCount('我的小说'), 4, 'a four-character Chinese title counts as 4, not 1');
assertEqual(Format.wordCount('hello world'), 2, 'Latin counting is unchanged');
assertEqual(Format.wordCount('hello 世界'), 3, 'mixed text: one Latin word + two CJK characters');
assertEqual(Format.wordCount('我叫诺拉，今年十四岁。'), 10, 'CJK punctuation-joined sentence counts per character');
assertEqual(Format.wordCount('**bold** こんにちは'), 6, 'format tokens do not distort the count (1 chunk + 5 kana)');
assertEqual(Format.wordCount('{{img:img_abc}} 写真一枚'), 4, 'image tokens are stripped before counting');

section('CR-18 — Word Check tokenizer sees CJK tokens');
{
  const freq = WordTools.computeWordFrequency('风穿过峡谷，风带着雨。');
  const entries = new Map(freq.entries.map((e) => [e.word, e.count]));
  assertEqual(entries.get('风'), 2, 'repeated CJK character counted');
  assertEqual(entries.get('峡'), 1, 'each CJK character is its own token (峡谷 tokenizes as 峡 + 谷)');
  assertEqual(entries.get('谷'), 1, 'and its pair');
  const latin = WordTools.computeWordFrequency('the cat and the cat');
  const latinEntries = new Map(latin.entries.map((e) => [e.word, e.count]));
  assertEqual(latinEntries.get('cat'), 2, 'Latin tokenization unchanged');
  assert(!latinEntries.has('the'), 'Latin stopwords still excluded');
}

section('CR-18 — style-guide scanner fires on CJK rules (and still on Latin)');
{
  const cjkHits = Craft.scanTextForStyleViolations(
    '他感到十分高兴，但是误差仍在。',
    [{ id: 'r1', incorrect: '误差', preferred: '偏差' }]
  );
  assertEqual(cjkHits.length, 1, 'a CJK rule matches inside CJK prose — \\b never could');
  assertEqual(cjkHits[0].replacements[0], '偏差', 'the preferred replacement is attached');
  const latinHits = Craft.scanTextForStyleViolations(
    'It was very dark. A very dark night.',
    [{ id: 'r2', incorrect: 'very dark', preferred: 'pitch-black' }]
  );
  assertEqual(latinHits.length, 2, 'Latin rules still match twice');
  const noFalseHit = Craft.scanTextForStyleViolations(
    '误差less is not a standalone 误差 occurrence boundary test',
    [{ id: 'r1', incorrect: '误差', preferred: '偏差' }]
  );
  assertEqual(noFalseHit.length, 1, 'CJK rule does not fire inside a Latin word (误差less), still fires standalone');
}

section('CR-09 — markdown export filters non-exportable chapters and strips tokens');
{
  const md = Store.exportProjectText(Store.getActiveProject());
  assert(md.includes('# Kept Chapter'), 'exportable chapter present');
  assert(!md.includes('secret trashed text'), 'trashed chapter excluded');
  assert(!md.includes('# Trashed Chapter'), 'trashed chapter title excluded');
  assert(!md.includes('archived prose'), 'archived chapter excluded');
  assert(!md.includes('scratch prose'), 'scratch-docType chapter excluded');
  assert(!md.includes('**'), 'bold markers stripped — the menu promises prose-only');
  assert(!md.includes('{{u:'), 'underline tokens stripped');
  assert(md.includes('She said wait and never moved.'), 'prose itself survives intact');
  const one = Store.exportChapterText(kept.id);
  assertEqual(one, 'She said wait and never moved. Plain words remain.', 'per-chapter export strips tokens too');
}

section('CR-09 — underline runs are parsed for DOCX/EPUB (no verbatim {{u:…}} leak)');
{
  const paras = ManuscriptExport.parseChapterParagraphs('A {{u:important}} word and **bold** too.');
  const runs = paras[0].runs;
  assert(runs.some((r) => r.underline === true && r.text === 'important'), 'underline run carries its text with underline: true');
  assert(runs.some((r) => r.bold === true && r.text === 'bold'), 'bold still parsed');
  assert(!runs.some((r) => (r.text || '').includes('{{u:')), 'no literal token text survives');
  const mixed = ManuscriptExport.parseChapterParagraphs('{{u:nested **bold**}} tail');
  assert(mixed[0].runs.some((r) => r.underline && r.text.includes('bold')), 'underline inner text captured');
}

section('CR-10 — diffText (Myers O(ND)) correctness');
{
  assertEqual(JSON.stringify(Diff.diffText('same words here', 'same words here')),
    JSON.stringify([{ type: 'equal', text: 'same words here' }]), 'identical text is one equal op');
  const ins = Diff.diffText('one three', 'one two three');
  assertEqual(ins.filter((o) => o.type === 'add').length, 1, 'insert detected');
  assert(ins.some((o) => o.type === 'add' && o.text.includes('two')), 'inserted token present');
  const del = Diff.diffText('a b c', 'a c');
  assert(del.some((o) => o.type === 'remove' && o.text.includes('b')), 'deletion detected');
  const counts = Diff.diffSummary(Diff.diffText('keep x y', 'keep z'));
  assertEqual(counts.added, 1, 'summary counts the added word exactly');
  assertEqual(counts.removed, 2, 'summary counts both removed words exactly');
}

section('CR-10 — novel-scale diff stays fast (was quadratic; 0.8s/~400MB at 12k tokens)');
{
  const base = Array.from({ length: 12000 }, (_, i) => `w${i}`).join(' ');
  const edited = base.replace('w6000', 'CHANGED');
  const t0 = Date.now();
  const ops = Diff.diffText(base, edited);
  const ms = Date.now() - t0;
  assert(ms < 2000, `12k-token diff completes in sane time (took ${ms}ms — the LCS matrix took ~800ms just to allocate)`);
  const changed = ops.filter((o) => o.type !== 'equal');
  assertEqual(changed.length, 2, 'only the edited window produced ops — prefix/suffix trimmed');
  assert(changed.some((o) => o.text.includes('CHANGED')), 'the change itself is in the output');
}

section('CR-10 — over-budget edits fall back to one honest replace pair');
{
  // Two ~1200-token texts with nothing in common: edit distance > the cap.
  const a = Array.from({ length: 1200 }, (_, i) => `a${i}`).join(' ');
  const b = Array.from({ length: 1200 }, (_, i) => `b${i}`).join(' ');
  const ops = Diff.diffText(a, b);
  const nonEqual = ops.filter((o) => o.type !== 'equal');
  assertEqual(nonEqual.length, 2, 'exactly one remove + one add — no freeze, no OOM');
  assertEqual(nonEqual[0].type, 'remove', 'first op removes the old window');
  assertEqual(nonEqual[1].type, 'add', 'second op adds the new window');
  const counts = Diff.diffSummary(ops);
  assertEqual(counts.removed, 1200, 'summary still counts the truth');
  assertEqual(counts.added, 1200, 'both directions');
}

section('CR-21 — exportTintaProject honors its id parameter');
{
  const firstProject = Store.getActiveProject();
  Store.createProject('Second Novel');
  assertEqual(Store.getActiveProject().title, 'Second Novel', 'setup: active switched');
  const exported = await TintaPackage.exportTintaProject(firstProject.id);
  assertEqual(exported.format, 'json', 'image-less project exports the JSON variant');
  const manifest = JSON.parse(await exported.blob.text()).manifest;
  assertEqual(manifest.projectTitle, 'Batch Five', 'manifest describes the REQUESTED project, not the active one');
  assertEqual(manifest.projectId, firstProject.id, 'manifest projectId matches too');
  let threw = null;
  try { await TintaPackage.exportTintaProject('proj_does_not_exist'); } catch (e) { threw = e; }
  assert(threw && /No project with that id/.test(threw.message), 'an unknown id fails with a named error, not silent wrong-project export');
}

section('CR-22 — reorderChapter with an unknown chapter id is a no-op');
{
  let threw = null;
  try { Store.reorderChapter('chap_does_not_exist', 'down'); } catch (e) { threw = e; }
  assertEqual(threw, null, 'no TypeError on unknown id + direction down (the old chapters[-1].order crash)');
  try { Store.reorderChapter('chap_does_not_exist', 'up'); } catch (e) { threw = e; }
  assertEqual(threw, null, 'up direction equally safe');
}

section('CR-23 — entity delete backs up its cascade; restore rebuilds the edges');
{
  const e1 = Store.createEntity({ name: 'Mara', type: 'character' });
  const e2 = Store.createEntity({ name: 'Odera', type: 'character' });
  const rel = Store.createRelationship({ fromId: e1.id, toId: e2.id, label: 'rival' });
  Store.updateRelationship(rel.id, { status: 'estranged', notes: 'since the siege' });
  const beforeBackupCount = Store.getDeletedItemBackups().length;
  Store.deleteEntity(e1.id);
  assertEqual(Store.getEntity(e1.id), null, 'entity gone');
  assertEqual(Store.getRelationshipsForEntity(e2.id).length, 0, 'cascade removed the edge');
  const backups = Store.getDeletedItemBackups();
  assertEqual(backups.length, beforeBackupCount + 1, 'one new backup');
  const backup = backups[0];
  assert(backup.extra && Array.isArray(backup.extra.relationships) && backup.extra.relationships.length === 1,
    'backup captured the cascade edge (the old backup held only the entity record)');
  const restored = Store.restoreDeletedItem(backup.id);
  assert(restored && restored.kind === 'entity', 'restore returns the new entity handle');
  const newEdges = Store.getRelationshipsForEntity(restored.id);
  assertEqual(newEdges.length, 1, 'the cascade edge was rebuilt on restore (undo used to leave a relationship-less orphan)');
  assertEqual(Store.getRelationshipLabel(newEdges[0]), 'rival', 'edge label preserved (resolved from the type at capture time — the type itself was garbage-collected by the cascade)');
  assertEqual(newEdges[0].status, 'estranged', 'freeform fields preserved');
  assertEqual(newEdges[0].notes, 'since the siege', 'notes preserved');
  const otherEnd = newEdges[0].fromId === restored.id ? newEdges[0].toId : newEdges[0].fromId;
  assertEqual(otherEnd, e2.id, 'the surviving endpoint is the real Odera record');
}

section('CR-23 — prototype-key ids cannot fabricate a backup');
{
  const before = Store.getDeletedItemBackups().length;
  Store.deleteEntity('constructor');
  assertEqual(Store.getDeletedItemBackups().length, before, "deleteEntity('constructor') archives nothing (ownGet lookup)");
  Store.deleteEntity('toString');
  assertEqual(Store.getDeletedItemBackups().length, before, 'same for toString');
}

section('CR-37 — safeFilename keeps non-ASCII titles');
{
  assertEqual(FileFns.safeFilename('我的小说'), '我的小说', 'a Chinese title survives (was: untitled)');
  assertEqual(FileFns.safeFilename('Émigré'), 'émigré', 'accented letters survive');
  assertEqual(FileFns.safeFilename('A&B: "Chapter 1"?'), 'ab-chapter-1', 'genuinely unsafe characters are still stripped');
  assertEqual(FileFns.safeFilename(''), 'untitled', 'empty falls back');
  assert(FileFns.safeFilename('我的 小说 第二卷').includes('我的'), 'spaces + CJK coexist');
}

section('CR-40 — EPUB manifest media-type is allow-listed');
{
  const project = Store.getActiveProject();
  const fakeBytes = new Uint8Array([1, 2, 3, 4]);
  const bytes = ManuscriptExport.buildEpub(project, {
    author: '',
    images: [{ id: 'img_x1', bytes: fakeBytes, mime: 'image/jpeg" onload="alert(1)', filename: 'x.jpg' }],
    coverImage: null,
  });
  const text = new TextDecoder().decode(bytes); // zip.js stores entries uncompressed — the OPF is readable plaintext
  assert(text.includes('media-type="application/octet-stream"'), 'hostile mime replaced by the binary fallback');
  assert(!text.includes('onload'), 'the hostile payload never reaches the OPF');
  const good = ManuscriptExport.buildEpub(project, {
    author: '',
    images: [{ id: 'img_x2', bytes: fakeBytes, mime: 'image/jpeg', filename: 'y.jpg' }],
    coverImage: null,
  });
  const goodText = new TextDecoder().decode(good);
  assert(goodText.includes('media-type="image/jpeg"'), 'legitimate mime passes through unchanged');
}

section('CR-38 — mention chip attribute is single-escaped; resolver sees raw names');
{
  // The chip pass lives in renderEditorParagraph (renderFormattedHtml is
  // markers/images only — see format.js's own comment).
  const html = Format.renderEditorParagraph('See [[A&B]] now.');
  assert(html.includes('data-mention-name="A&amp;B"'), 'attribute holds the once-escaped name (was double-escaped)');
  assert(!html.includes('amp;amp'), 'no double-escape artifact anywhere');
  assert(html.includes('>A&amp;B</span>'), 'the visible chip name still renders as A&B');
  let resolverSaw = null;
  Format.renderEditorParagraph('See [[N<y]] now.', {
    mentionResolver: (name) => { resolverSaw = name; return true; },
  });
  assertEqual(resolverSaw, 'N<y', 'the resolver receives the raw writer text, not the escaped form');
  const alice = Format.renderEditorParagraph('See [[Alice]] now.');
  assert(alice.includes('data-mention-name="Alice"'), 'the existing editor-paragraph pin still holds for plain names');
}

section('CR-20 — structurally plausible corrupt backups get the friendly rejection');
{
  const cases = [
    JSON.stringify({ projects: { p1: 'garbage' }, activeProjectId: 'p1' }),
    JSON.stringify({ projects: { p1: 42 }, activeProjectId: 'p1' }),
    JSON.stringify({ projects: { p1: null }, activeProjectId: 'p1' }),
    JSON.stringify({ projects: { p1: ['ch1'] }, activeProjectId: 'p1' }),
  ];
  for (const json of cases) {
    let threw = null;
    try { await Store.importFullBackup(json); } catch (e) { threw = e; }
    assert(threw && threw.message === "That file doesn't look like a Tinta backup.",
      `rejected with the designed message (got: ${threw ? threw.message : 'no throw'})`);
  }
}

// ── CR-06 — equal-revision clobber detection ────────────────────────────
// Deliberately LAST: flagging stale is terminal for the module instance in
// the same way save-truthfulness.smoketest.mjs documents (the real recovery
// is a page reload), so everything above must run against a healthy store.
section('CR-06 — mirror storage-event path: equal-rev arbitration by content');
{
  // CR-21's section switched the active project to create its comparison
  // target — the CR-06 write must land against the batch project.
  Store.switchProject(batchProjectId);
  // Land a real write so the mirror-hash watermark exists.
  const chapter = Store.getChapter(kept.id);
  Store.updateChapterContent(chapter.id, chapter.content + ' And a bit more.');
  const landed = globalThis.localStorage.getItem('tinta:db');
  assert(Boolean(landed), 'mirror write landed (local backend in this shim)');

  const conflicts = [];
  Store.onCrossTabConflict((detail) => conflicts.push(detail));

  // Same bytes at the same rev = a benign echo of our own state.
  Store._simulateStorageEvent(landed);
  assertEqual(Store.isCrossTabStale(), false, 'identical bytes at the same rev do NOT flag stale');
  assertEqual(conflicts.length, 0, 'no conflict notification for the echo');

  // Divergent bytes at the same rev = two tabs landed the same rev; one
  // physically overwrote the other. This was invisible before CR-06.
  const tampered = JSON.stringify({ ...JSON.parse(landed), marker: 'peer-tab-state' });
  Store._simulateStorageEvent(tampered);
  assertEqual(Store.isCrossTabStale(), true, 'different bytes at the same rev DO flag stale');
  assertEqual(conflicts.length, 1, 'the conflict fired');
  assertEqual(conflicts[0].equalRev, true, 'the detail names it as an equal-rev clobber');
  assertEqual(conflicts[0].incomingRev, conflicts[0].ourRev, 'revs genuinely are equal');

  // Lower-rev writes stay ignored (unchanged behavior).
  const older = JSON.stringify({ ...JSON.parse(landed), rev: 1 });
  Store._simulateStorageEvent(older);
  assertEqual(conflicts.length, 1, 'a lower incoming rev still never fires (unchanged)');
}

section('CR-06 — BroadcastChannel path: equal-rev + foreign session id');
{
  // Same module instance is already stale from the section above — the
  // handler logic itself is stateless per call, so exercise it via the
  // test hook and assert on notification behavior only.
  const conflicts = [];
  Store.onCrossTabConflict((detail) => conflicts.push(detail));
  const rev = Store.getSaveRev();
  Store._simulateCrossTabFlush(rev); // defaults to a foreign test sid
  assertEqual(conflicts.length, 1, 'a peer flush at OUR rev from a different session flags the clobber');
  assertEqual(conflicts[0].equalRev, true, 'and reports it as equal-rev');
  Store._simulateCrossTabFlush(rev + 5, 'another-peer');
  assertEqual(conflicts.length, 2, 'a strictly higher peer rev still flags (unchanged)');
  assert(!('equalRev' in conflicts[1]), 'the higher-rev conflict is NOT labeled equal-rev');
}

// ── done ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail ? ' — FAILURES ABOVE' : ' — all green'}.`);
if (fail) process.exit(1);
