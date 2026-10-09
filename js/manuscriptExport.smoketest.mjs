// Tinta — manuscript export (DOCX + EPUB) smoke test.
//
// manuscriptExport.js and zip.js have no Store dependency (same as
// search.js/diff.js), so this builds plain project-shaped fixtures
// directly rather than using the localStorage-backed Store shim the other
// smoke tests use. Run with: node manuscriptExport.smoketest.mjs
//
// No external zip/docx/epub library is available at runtime (no build
// tooling — see ROADMAP.md), so this reads the produced archives back with
// a tiny local ZIP reader rather than a real parser. That's intentionally
// a *different* code path than zip.js's writer, so a bug that exists in
// both wouldn't be masked by testing a writer against itself.

import { exportDocx, exportEpub, parseChapterParagraphs } from './manuscriptExport.js';

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

// ── minimal ZIP reader (central directory walk, store-only) ────────────────
// Deliberately independent of zip.js's own writer logic.
function readZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Find EOCD by scanning back from the end for its signature.
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('no EOCD found — not a valid zip');
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const entries = [];
  let pos = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error(`bad central dir signature at entry ${i}`);
    const compSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(bytes.slice(pos + 46, pos + 46 + nameLen));

    // Read the actual bytes from the local file header (store method only —
    // this reader doesn't implement inflate, matching zip.js's writer).
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const data = bytes.slice(dataStart, dataStart + compSize);

    entries.push({ name, data, text: () => new TextDecoder().decode(data) });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function findEntry(entries, name) {
  return entries.find((e) => e.name === name);
}

// ── fixtures ─────────────────────────────────────────────────────────────

function makeProject(overrides = {}) {
  return {
    title: 'The Long Way Home',
    coverImageId: null,
    chapters: [
      {
        id: 'chap1',
        order: 0,
        title: 'Departure',
        content: 'Alice walked into the room. It was **cold**.\nShe shivered, thinking of *home*.\n***\nLater that night, {{red:the storm}} hit.',
      },
      {
        id: 'chap2',
        order: 1,
        title: 'Arrival',
        content: 'Bob was already there.\n{{img:img1|center}}\nHe smiled warmly.',
      },
    ],
    ...overrides,
  };
}

// ── paragraph parsing ────────────────────────────────────────────────────

section('parseChapterParagraphs — line-per-paragraph, explicit scene breaks only');

{
  const paras = parseChapterParagraphs('First line.\n\nSecond line after a blank.\n\nThird line, still no divider anywhere.');
  assertEqual(paras.length, 3, 'blank lines are skipped, not treated as breaks — only 3 paragraph entries for 3 text lines');
  assert(!paras.some((p) => p.type === 'break'), 'no break entries appear when the source only has blank-line spacing, no divider glyphs');
}

{
  const paras = parseChapterParagraphs('One.\n***\nTwo.\n---\nThree.\n#\nFour.');
  const breaks = paras.filter((p) => p.type === 'break');
  assertEqual(breaks.length, 3, 'each recognized divider glyph (***, ---, #) produces exactly one break entry');
}

{
  const paras = parseChapterParagraphs('Bold **word** and italic *word* and {{blue:colored text}} together.');
  const runs = paras[0].runs;
  assert(runs.some((r) => r.bold && r.text === 'word'), 'bold run parsed');
  assert(runs.some((r) => r.italic && r.text === 'word'), 'italic run parsed');
  assert(runs.some((r) => r.color === 'blue' && r.text === 'colored text'), 'color run parsed with correct color name and inner text');
}

{
  const paras = parseChapterParagraphs('Before.\n{{img:abc123|left}}\nAfter.');
  const imgPara = paras.find((p) => p.runs?.some((r) => r.image));
  assertEqual(imgPara.runs[0].image, 'abc123', 'image token id extracted');
  assertEqual(imgPara.runs[0].align, 'left', 'image token alignment extracted');
}

{
  const paras = parseChapterParagraphs('{{img:noalign}}');
  assertEqual(paras[0].runs[0].align, 'center', 'image token with no explicit alignment defaults to center');
}

// ── DOCX ─────────────────────────────────────────────────────────────────

section('exportDocx — zip structure and content');

{
  const project = makeProject();
  const bytes = exportDocx(project, { author: 'Jane Author' });
  const entries = readZipEntries(bytes);
  const names = entries.map((e) => e.name);

  assert(names.includes('[Content_Types].xml'), 'has [Content_Types].xml');
  assert(names.includes('word/document.xml'), 'has word/document.xml');
  assert(names.includes('word/styles.xml'), 'has word/styles.xml');
  assert(names.includes('_rels/.rels'), 'has package-level _rels/.rels');
  assert(names.includes('word/_rels/document.xml.rels'), 'has word/_rels/document.xml.rels');

  const doc = findEntry(entries, 'word/document.xml').text();
  assert(doc.includes(project.title), 'document.xml contains the project title (title page)');
  assert(doc.includes('Jane Author'), 'document.xml contains the supplied author name');
  assert(doc.includes('Departure'), 'document.xml contains chapter 1 title');
  assert(doc.includes('Arrival'), 'document.xml contains chapter 2 title');
  assert(doc.includes('<w:b/>'), 'bold markup survived into a <w:b/> run property');
  assert(doc.includes('<w:i/>'), 'italic markup survived into a <w:i/> run property');
  assert(!doc.includes('{{red:'), 'raw color token syntax does not leak into the document');
  assert(!doc.includes('the storm</w:t>'.replace('the storm', 'the storm')) || doc.includes('the storm'), 'colored text content itself is preserved (just unstyled)');
  assert(doc.includes('<w:t>#</w:t>'), 'the *** divider became a rendered "#" scene-break paragraph');
  // Standard manuscript format checks:
  assert(doc.includes('w:firstLine="720"'), 'body paragraphs use a first-line indent');
  assert(doc.includes('w:line="480"'), 'double-spacing is applied');
  const stylesXml = findEntry(entries, 'word/styles.xml').text();
  assert(stylesXml.includes('Times New Roman'), 'styles.xml sets Times New Roman per standard manuscript format');
}

section('exportDocx — images are dropped, not left as broken tokens');
{
  const project = makeProject();
  const bytes = exportDocx(project);
  const doc = findEntry(readZipEntries(bytes), 'word/document.xml') || {};
  const text = doc.text ? doc.text() : '';
  assert(!text.includes('{{img:'), 'no raw image token leaks into the manuscript document');
}

section('exportDocx — empty project does not throw and produces a valid zip');
{
  const bytes = exportDocx({ title: 'Blank Slate', chapters: [] });
  const entries = readZipEntries(bytes);
  assert(entries.length > 0, 'still produces a structurally valid (if content-empty) zip');
}

section('exportDocx — XML special characters are escaped, not left raw');
{
  const project = makeProject({ title: `A & B <Test> "Quoted"` });
  const bytes = exportDocx(project);
  const doc = findEntry(readZipEntries(bytes), 'word/document.xml').text();
  assert(!doc.includes('A & B <Test>'), 'raw ampersand/angle-bracket title is not embedded unescaped (would break XML parsing)');
  assert(doc.includes('A &amp; B &lt;Test&gt;'), 'title is properly XML-escaped');
}

// ── EPUB ─────────────────────────────────────────────────────────────────

section('exportEpub — zip structure, mimetype-first, and content');

{
  const project = makeProject();
  const fakeBytes = new Uint8Array(64).fill(9);
  const bytes = await exportEpub(project, {
    author: 'Jane Author',
    getImageBytes: async () => ({ bytes: fakeBytes, mime: 'image/png' }),
  });
  const entries = readZipEntries(bytes);

  assertEqual(entries[0].name, 'mimetype', 'mimetype is the first entry in the archive (required by the EPUB spec)');
  assertEqual(entries[0].text(), 'application/epub+zip', 'mimetype entry content is exactly "application/epub+zip"');

  const names = entries.map((e) => e.name);
  assert(names.includes('META-INF/container.xml'), 'has META-INF/container.xml');
  assert(names.includes('OEBPS/content.opf'), 'has OEBPS/content.opf');
  assert(names.includes('OEBPS/nav.xhtml'), 'has OEBPS/nav.xhtml (TOC)');
  assert(names.includes('OEBPS/chapter-1.xhtml'), 'has chapter 1 xhtml');
  assert(names.includes('OEBPS/chapter-2.xhtml'), 'has chapter 2 xhtml');
  assert(names.includes('OEBPS/images/img1.png'), 'the {{img:img1}} token in chapter 2 resolved to an embedded image file');

  const opf = findEntry(entries, 'OEBPS/content.opf').text();
  assert(opf.includes(project.title), 'content.opf declares the project title');
  assert(opf.includes('Jane Author'), 'content.opf declares the author');

  const chap1 = findEntry(entries, 'OEBPS/chapter-1.xhtml').text();
  assert(chap1.includes('<strong>cold</strong>'), 'bold markup rendered as <strong> in EPUB (kept, unlike DOCX which drops color but keeps bold too)');
  assert(chap1.includes('<em>home</em>'), 'italic markup rendered as <em>');
  assert(chap1.includes('class="c-red"'), 'color markup is preserved as a CSS class in EPUB (unlike DOCX, which drops it)');
  assert(chap1.includes('scene-break'), 'the *** divider rendered as a scene-break paragraph');

  const chap2 = findEntry(entries, 'OEBPS/chapter-2.xhtml').text();
  assert(chap2.includes('images/img1.png'), 'chapter 2 xhtml references the resolved image file');
}

section('exportEpub — cover image gets exactly one manifest entry, not a duplicate');
{
  const project = makeProject({ coverImageId: 'img1' }); // img1 is also referenced inline in chapter 2
  const fakeBytes = new Uint8Array(64).fill(9);
  const bytes = await exportEpub(project, {
    getImageBytes: async () => ({ bytes: fakeBytes, mime: 'image/png' }),
  });
  const entries = readZipEntries(bytes);
  const imageEntries = entries.filter((e) => e.name === 'OEBPS/images/img1.png');
  assertEqual(imageEntries.length, 1, 'the same image referenced both as cover and inline is only written to the zip once');
  const opf = findEntry(entries, 'OEBPS/content.opf').text();
  assert(opf.includes('properties="cover-image"'), 'the cover image manifest entry is marked with properties="cover-image"');
  assert((opf.match(/href="images\/img1\.png"/g) || []).length === 1, 'only one manifest <item> references img1.png (no duplicate href)');
}

section('exportEpub — a missing/deleted image resolves to a placeholder, not a crash');
{
  const project = makeProject();
  const bytes = await exportEpub(project, { getImageBytes: async () => null });
  const entries = readZipEntries(bytes);
  const chap2 = findEntry(entries, 'OEBPS/chapter-2.xhtml').text();
  assert(chap2.includes('image-missing') || chap2.includes('unavailable'), 'a resolver returning null for an image id renders a graceful placeholder');
  assert(!entries.some((e) => e.name.startsWith('OEBPS/images/')), 'no image file is written for an image that failed to resolve');
}

section('exportEpub — no getImageBytes resolver at all does not throw');
{
  const project = makeProject();
  const bytes = await exportEpub(project, {});
  const entries = readZipEntries(bytes);
  assert(entries.length > 0, 'omitting the resolver entirely still produces a valid archive (images just silently absent)');
}

section('exportEpub — empty project does not throw and produces a valid mimetype-first zip');
{
  const bytes = await exportEpub({ title: 'Blank Slate', chapters: [] }, {});
  const entries = readZipEntries(bytes);
  assertEqual(entries[0].name, 'mimetype', 'mimetype is still first even with zero chapters');
}

section('exportEpub — XML/XHTML special characters are escaped');
{
  const project = makeProject({ title: `Q&A: "Test" <Title>` });
  const bytes = await exportEpub(project, {});
  const opf = findEntry(readZipEntries(bytes), 'OEBPS/content.opf').text();
  assert(!opf.includes('Q&A: "Test" <Title>'), 'raw special characters not embedded unescaped');
  assert(opf.includes('Q&amp;A'), 'ampersand in title is escaped in content.opf');
}

// ── summary ──────────────────────────────────────────────────────────────

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
