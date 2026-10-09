// Historical context: see docs/CODEBASE_NOTES.md#jsdiff-js-1-7

// Historical context: see docs/CODEBASE_NOTES.md#jsdiff-js-9-12
function tokenize(text = '') {
  return text.match(/\S+\s*|\s+/g) || [];
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdiff-js-17-20
export function diffText(oldText = '', newText = '') {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const n = a.length;
  const m = b.length;

  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: 'remove', text: a[i] });
      i++;
    } else {
      ops.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'remove', text: a[i++] });
  while (j < m) ops.push({ type: 'add', text: b[j++] });

  return mergeAdjacent(ops);
}

// Collapses consecutive ops of the same type into one, so the rendered
// output is a handful of spans instead of one per word.
function mergeAdjacent(ops) {
  const merged = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) {
      last.text += op.text;
    } else {
      merged.push({ ...op });
    }
  }
  return merged;
}

// Quick counts for a summary line ("+120 words, -34 words") without
// rendering the full diff.
export function diffSummary(ops) {
  let added = 0;
  let removed = 0;
  ops.forEach((op) => {
    const words = op.text.trim().split(/\s+/).filter(Boolean).length;
    if (op.type === 'add') added += words;
    if (op.type === 'remove') removed += words;
  });
  return { added, removed };
}
