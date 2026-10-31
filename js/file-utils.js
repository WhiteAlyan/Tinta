// Historical context: see docs/CODEBASE_NOTES.md#jsfile-utils-js

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

// CR-37 — the old [^\w\- ]+ strip was ASCII-only: \w matches [A-Za-z0-9_]
// in JS without the u flag, so every CJK and accented character was
// deleted and a project titled 我的小说 exported as untitled.md.
// \p{L}/\p{N} with the u flag keep letters and numbers from any script;
// only characters genuinely unsafe in a filename are stripped.
export function safeFilename(title) {
  return (title || 'untitled').trim().replace(/[^\p{L}\p{N}\-_ ]+/gu, '').replace(/\s+/g, '-').toLowerCase() || 'untitled';
}
