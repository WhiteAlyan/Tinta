// Historical context: see docs/CODEBASE_NOTES.md#jsfile-utils-js-1-8

export function downloadTextFile(filename, content, mime = 'text/markdown;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Same download-via-object-URL trick as downloadTextFile, just fed raw
// bytes (a Uint8Array, in practice from zip.js's createZip) instead of a
// text string — DOCX/EPUB are both binary zip containers, not text.
export function downloadBinaryFile(filename, bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function safeFilename(title) {
  return (title || 'untitled').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'untitled';
}
