// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-1-26

import { createZip } from './zip.js';
import { COLOR_NAMES, IMAGE_TOKEN_PATTERN } from './format.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-31-48

function parseInlineRuns(line) {
  const runs = [];
  // Combined pattern so bold/italic/color/image tokens are all found in
  // left-to-right document order in one pass, rather than four separate
  // regex passes that would need re-merging by position afterward.
  const pattern = new RegExp(
    `\\*\\*([^*]+?)\\*\\*` + // 1: bold
    `|\\*([^*]+?)\\*` + // 2: italic
    `|\\{\\{(${COLOR_NAMES.join('|')}):([^}]+?)\\}\\}` + // 3 color name, 4 color text
    `|${IMAGE_TOKEN_PATTERN.source}`, // 5 image id, 6 align
    'g'
  );
  let last = 0;
  let m;
  while ((m = pattern.exec(line))) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) runs.push({ text: m[2], italic: true });
    else if (m[3] !== undefined) runs.push({ text: m[4], color: m[3] });
    else if (m[5] !== undefined) runs.push({ image: m[5], align: m[6] || 'center' });
    last = pattern.lastIndex;
  }
  if (last < line.length) runs.push({ text: line.slice(last) });
  return runs.length ? runs : [{ text: '' }];
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-76-84
const SCENE_BREAK_LINES = new Set(['***', '* * *', '#', '---', '—', '⁂']);

// Returns an array of paragraph objects: { type: 'text', runs } or
// { type: 'break' } for a scene break.
export function parseChapterParagraphs(content) {
  const lines = (content || '').split('\n');
  const paragraphs = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue; // ordinary spacing, not a break — see SCENE_BREAK_LINES comment
    if (SCENE_BREAK_LINES.has(trimmed)) {
      paragraphs.push({ type: 'break' });
      continue;
    }
    paragraphs.push({ type: 'text', runs: parseInlineRuns(line) });
  }
  return paragraphs;
}

function safeFilenameLocal(title) {
  return (title || 'untitled').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'untitled';
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-108-114

function xmlEscape(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-125-129
function docxRuns(runs) {
  return runs
    .filter((r) => r.text !== undefined && r.text !== '')
    .map((r) => {
      const props = [];
      if (r.bold) props.push('<w:b/>');
      if (r.italic) props.push('<w:i/>');
      const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
      return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(r.text)}</w:t></w:r>`;
    })
    .join('');
}

const DOCX_BODY_PARA = '<w:pPr><w:ind w:firstLine="720"/><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr>';
const DOCX_BREAK_PARA = '<w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/></w:pPr>';
const DOCX_CHAPTER_HEADING_PARA = '<w:pPr><w:jc w:val="center"/><w:spacing w:before="720" w:after="480"/><w:rPr><w:b/></w:rPr></w:pPr>';

// Containers foundation pass — a centered, bold part-title paragraph,
// sized between the title page (sz 32) and a chapter heading (plain bold)
// so it reads as its own structural level in the exported manuscript.
function docxPartHeadingParagraph(title) {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="1440" w:after="720"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${xmlEscape(title)}</w:t></w:r></w:p>`;
}

function docxChapterParagraphs(chapter) {
  const heading = `<w:p>${DOCX_CHAPTER_HEADING_PARA}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xmlEscape(chapter.title)}</w:t></w:r></w:p>`;
  const body = parseChapterParagraphs(chapter.content)
    .map((p) => {
      if (p.type === 'break') {
        return `<w:p>${DOCX_BREAK_PARA}<w:r><w:t>#</w:t></w:r></w:p>`;
      }
      const runXml = docxRuns(p.runs);
// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-162-165
      if (!runXml) return null;
      return `<w:p>${DOCX_BODY_PARA}${runXml}</w:p>`;
    })
    .filter(Boolean);
  return [heading, ...body].join('');
}

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOCX_WORD_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

// 12pt Times New Roman, double-spaced body — the standard manuscript
// format convention agents/editors expect, applied once via the Normal
// style rather than repeated per-run.
const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:rPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
<w:name w:val="Normal"/>
<w:pPr><w:spacing w:line="480" w:lineRule="auto"/></w:pPr>
</w:style>
</w:styles>`;

function docxCoreProps(title, author) {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlEscape(title)}</dc:title>
<dc:creator>${xmlEscape(author || '')}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

const DOCX_APP_PROPS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Tinta</Application></Properties>`;

// Title page: title centered mid-page, author + word count below it, then a
// page break into chapter 1 — the standard first page of a manuscript
// submission, not a designed cover (that's what EPUB's cover is for).
function docxTitlePage(title, author, wordTotal) {
  const authorLine = author
    ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">by ${xmlEscape(author)}</w:t></w:r></w:p>`
    : '';
  return `
<w:p><w:pPr><w:spacing w:before="4320"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${xmlEscape(title)}</w:t></w:r></w:p>
${authorLine}
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="240"/></w:pPr><w:r><w:t xml:space="preserve">${wordTotal.toLocaleString()} words</w:t></w:r></w:p>
<w:p><w:pPr><w:sectPr/></w:pPr></w:p>`;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-237-248
function isExportableChapter(project, chapter) {
// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-250-255
  if (chapter.archived || chapter.trashedAt) return false;
  const type = (project.chapterTypes || []).find((t) => t.key === chapter.docType);
  return !type || type.role !== 'scratch';
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-261-268
function groupExportChaptersByPart(project, chapters) {
  const parts = [...(project.parts || [])].sort((a, b) => a.order - b.order);
  const partIds = new Set(parts.map((p) => p.id));
  const groups = parts.map((part) => ({ part, chapters: chapters.filter((c) => c.partId === part.id) }));
  const unassigned = chapters.filter((c) => !c.partId || !partIds.has(c.partId));
  groups.push({ part: null, chapters: unassigned });
  return groups.filter((g) => g.chapters.length > 0);
}

export function buildDocx(project, { author = '', wordTotal = 0 } = {}) {
  const chapters = [...project.chapters].filter((c) => isExportableChapter(project, c)).sort((a, b) => a.order - b.order);
  const groups = groupExportChaptersByPart(project, chapters);
  const body = groups
    .map(({ part, chapters: groupChapters }) => {
      const heading = part ? docxPartHeadingParagraph(part.title) : '';
      return heading + groupChapters.map(docxChapterParagraphs).join('');
    })
    .join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${docxTitlePage(project.title, author, wordTotal)}
${body}
<w:sectPr>
<w:pgSz w:w="12240" w:h="15840"/>
<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
</w:sectPr>
</w:body>
</w:document>`;

  const entries = [
    { name: '[Content_Types].xml', data: DOCX_CONTENT_TYPES },
    { name: '_rels/.rels', data: DOCX_RELS },
    { name: 'docProps/core.xml', data: docxCoreProps(project.title, author) },
    { name: 'docProps/app.xml', data: DOCX_APP_PROPS },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/styles.xml', data: DOCX_STYLES },
    { name: 'word/_rels/document.xml.rels', data: DOCX_WORD_RELS },
  ];
  return createZip(entries);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-311-318

function epubHtmlEscape(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function epubRunHtml(run) {
  if (run.image !== undefined) {
    return { image: run.image, align: run.align };
  }
  if (!run.text) return '';
  let html = epubHtmlEscape(run.text);
  if (run.color) html = `<span class="c-${run.color}">${html}</span>`;
  if (run.bold) html = `<strong>${html}</strong>`;
  if (run.italic) html = `<em>${html}</em>`;
  return html;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-339-342
function epubChapterXhtml(chapter, imagesById, partTitle = null) {
  const paras = parseChapterParagraphs(chapter.content)
    .map((p) => {
      if (p.type === 'break') return '<p class="scene-break">#</p>';
      // A paragraph can contain at most one image token in practice (an
      // inline illustration on its own line) — render it as a <figure>
      // rather than trying to inline an <img> inside a <p> alongside text.
      const imgRun = p.runs.find((r) => r.image !== undefined);
      if (imgRun && p.runs.every((r) => r.image !== undefined || !r.text)) {
        const img = imagesById[imgRun.image];
        const align = imgRun.align || 'center';
        if (!img) return `<p class="image-missing">[image unavailable]</p>`;
        return `<figure class="fig-${align}"><img src="images/${img.filename}" alt=""/></figure>`;
      }
      const html = p.runs.map(epubRunHtml).join('');
      return html ? `<p>${html}</p>` : '';
    })
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${epubHtmlEscape(chapter.title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
${partTitle ? `<p class="part-label">${epubHtmlEscape(partTitle)}</p>` : ''}
<h1>${epubHtmlEscape(chapter.title)}</h1>
${paras}
</body>
</html>`;
}

const EPUB_CSS = `
body { font-family: Georgia, serif; line-height: 1.5; margin: 1em; }
h1 { text-align: center; font-size: 1.4em; margin-bottom: 1.5em; }
p { margin: 0 0 1em 0; text-indent: 1.5em; }
p.scene-break { text-align: center; text-indent: 0; margin: 1.5em 0; }
p.image-missing { text-align: center; text-indent: 0; font-style: italic; color: #888; }
figure { margin: 1.5em 0; text-align: center; }
figure img { max-width: 100%; }
.fig-left { text-align: left; }
.fig-right { text-align: right; }
.part-label { text-align: center; text-indent: 0; text-transform: uppercase; letter-spacing: 0.15em; font-size: 0.85em; color: #555; margin: 2em 0 0.5em 0; }
.c-red { color: #c0392b; } .c-amber { color: #b8860b; } .c-green { color: #27ae60; }
.c-blue { color: #2980b9; } .c-purple { color: #8e44ad; }
`.trim();

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// `images` is an array of { id, bytes, mime, filename } already resolved by
// the caller. `coverImage` (optional) is one such entry used as the EPUB
// cover.
export function buildEpub(project, { author = '', images = [], coverImage = null } = {}) {
  const chapters = [...project.chapters].filter((c) => isExportableChapter(project, c)).sort((a, b) => a.order - b.order);
  const imagesById = Object.fromEntries(images.map((img) => [img.id, img]));
  const bookId = uid('urn:uuid:tinta');

  // Containers foundation pass — flatten part groups back into a single
  // ordered list (spine/manifest stay one file per chapter, unchanged
  // shape), tagging only each group's first chapter with its part title.
  const groups = groupExportChaptersByPart(project, chapters);
  const orderedWithPartTitle = groups.flatMap(({ part, chapters: groupChapters }) =>
    groupChapters.map((c, i) => ({ chapter: c, partTitle: part && i === 0 ? part.title : null }))
  );

  const chapterFiles = orderedWithPartTitle.map(({ chapter: c, partTitle }, i) => ({
    id: `chap${i + 1}`,
    filename: `chapter-${i + 1}.xhtml`,
    xhtml: epubChapterXhtml(c, imagesById, partTitle),
    title: c.title,
  }));

  const manifestItems = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="styles.css" media-type="text/css"/>',
    ...chapterFiles.map((c) => `<item id="${c.id}" href="${c.filename}" media-type="application/xhtml+xml"/>`),
    // The cover image gets one manifest entry with properties="cover-image"
    // rather than two (one plain, one cover) when it's also referenced
    // inline — a duplicate href pointing at the same file is invalid OPF.
    ...images.map((img) =>
      coverImage && img.id === coverImage.id
        ? `<item id="img-${img.id}" href="images/${img.filename}" media-type="${img.mime}" properties="cover-image"/>`
        : `<item id="img-${img.id}" href="images/${img.filename}" media-type="${img.mime}"/>`
    ),
  ];

  const spineItems = chapterFiles.map((c) => `<itemref idref="${c.id}"/>`);

  const navPoints = chapterFiles
    .map((c) => `<li><a href="${c.filename}">${epubHtmlEscape(c.title)}</a></li>`)
    .join('\n');

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${navPoints}
</ol></nav>
</body>
</html>`;

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${bookId}</dc:identifier>
<dc:title>${epubHtmlEscape(project.title)}</dc:title>
<dc:language>en</dc:language>
${author ? `<dc:creator>${epubHtmlEscape(author)}</dc:creator>` : ''}
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
${coverImage ? `<meta name="cover" content="img-${coverImage.id}"/>` : ''}
</metadata>
<manifest>
${manifestItems.join('\n')}
</manifest>
<spine>
${spineItems.join('\n')}
</spine>
</package>`;

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

  const entries = [
    // mimetype MUST be first and stored (uncompressed) per the EPUB spec —
    // zip.js stores everything uncompressed, so this is automatically
    // satisfied by entry order alone.
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: containerXml },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: navXhtml },
    { name: 'OEBPS/styles.css', data: EPUB_CSS },
    ...chapterFiles.map((c) => ({ name: `OEBPS/${c.filename}`, data: c.xhtml })),
    ...images.map((img) => ({ name: `OEBPS/images/${img.filename}`, data: img.bytes })),
  ];
  return createZip(entries);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsmanuscriptexport-js-486-492

function extToMime(mime) {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

export function docxFilename(project) {
  return `${safeFilenameLocal(project.title)}.docx`;
}

export function epubFilename(project) {
  return `${safeFilenameLocal(project.title)}.epub`;
}

// getImageBytes(id) => Promise<{ bytes: ArrayBuffer, mime: string } | null>
export async function exportEpub(project, { author = '', getImageBytes } = {}) {
  const referencedIds = new Set();
  for (const chapter of project.chapters) {
    if (!isExportableChapter(project, chapter)) continue;
    for (const m of (chapter.content || '').matchAll(IMAGE_TOKEN_PATTERN)) referencedIds.add(m[1]);
  }
  if (project.coverImageId) referencedIds.add(project.coverImageId);

  const images = [];
  for (const id of referencedIds) {
    if (!getImageBytes) continue;
    const resolved = await getImageBytes(id);
    if (!resolved) continue; // deleted/missing image — dropped silently, same as format.js's missing-image placeholder handles it in-app
    const ext = extToMime(resolved.mime);
    images.push({ id, bytes: resolved.bytes, mime: resolved.mime || 'image/png', filename: `${id}.${ext}` });
  }
  const coverImage = project.coverImageId ? images.find((img) => img.id === project.coverImageId) || null : null;

  return buildEpub(project, { author, images, coverImage });
}

export function exportDocx(project, { author = '' } = {}) {
  const wordTotal = project.chapters
    .filter((c) => isExportableChapter(project, c))
    .reduce((sum, c) => sum + (c.content || '').trim().split(/\s+/).filter(Boolean).length, 0);
  return buildDocx(project, { author, wordTotal });
}
