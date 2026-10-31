// Historical context: see docs/CODEBASE_NOTES.md#jsdiff-js
//
// CR-10 — this module used to build an (n+1)×(m+1) LCS matrix over the
// word tokens of the whole chapter versus the snapshot: measured at
// 12,000 tokens that was ~0.8 s and ~400 MB per click of Compare, and a
// 15–20k-word SFF chapter projected to multiple gigabytes and a dead tab.
// It now runs Myers' O(ND) shortest-edit algorithm over the token
// streams, with the common prefix/suffix trimmed first (a chapter edit
// rarely touches more than a window of paragraphs, and the trim makes the
// typical revision compare nearly free), and a hard cap on the edit
// distance: past the cap the window is emitted as one honest
// remove+add replace pair instead of freezing the UI — the summary line
// ("+N words, −M words") stays exactly truthful.

function tokenize(text = '') {
  return text.match(/\S+\s*|\s+/g) || [];
}

// Edit-distance budget. trace memory is O(D²) ints (a V snapshot per d),
// so 1,500 caps the worst case around ~9 MB and ~a few tens of
// milliseconds of work; typical revision compares land under d=50.
const MAX_EDIT_DISTANCE = 1500;

// Myers shortest-edit over a[start..endA) vs b[start..endB). Returns the
// middle ops (equal/add/remove) for the window, or null when the edit
// distance exceeds MAX_EDIT_DISTANCE (caller falls back to a replace
// pair). Port of the classic O(ND) formulation: V[k] holds the furthest
// x reached on diagonal k, and every round's V is snapshotted so the
// backtrack can recover the actual path.
function myersWindowOps(a, b, start, endA, endB) {
  const n = endA - start;
  const m = endB - start;
  if (n === 0 && m === 0) return [];
  if (n === 0) return [{ type: 'add', text: b.slice(start, endB).join('') }];
  if (m === 0) return [{ type: 'remove', text: a.slice(start, endA).join('') }];

  const offset = MAX_EDIT_DISTANCE; // k ∈ [-d, d] ⊆ [-MAX, MAX]
  const v = new Int32Array(2 * MAX_EDIT_DISTANCE + 1);
  const trace = [];
  let solved = false;
  for (let d = 0; d <= MAX_EDIT_DISTANCE; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      // Down-move (insertion from b) when k is on the lower edge or the
      // diagonal below reached further than the one above; else a
      // right-move (deletion from a).
      let x;
      if (k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])) {
        x = v[k + 1 + offset];
      } else {
        x = v[k - 1 + offset] + 1;
      }
      let y = x - k;
      // Snake: follow the diagonal while tokens match.
      while (x < n && y < m && a[start + x] === b[start + y]) {
        x++;
        y++;
      }
      v[k + offset] = x;
      if (x >= n && y >= m) {
        solved = true;
        break;
      }
    }
    if (solved) break;
  }
  if (!solved) return null; // over budget — caller emits a replace pair

  // Backtrack the trace from the solution back to (0, 0), emitting ops in
  // reverse. trace[d] is the V state as of the END of round d-1, which is
  // exactly what the predecessor lookups need.
  const ops = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && vd[k - 1 + offset] < vd[k + 1 + offset])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vd[prevK + offset];
    const prevY = prevX - prevK;
    // Diagonal (equal) tokens first — they never consume the d budget.
    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', text: a[start + x - 1] });
      x--;
      y--;
    }
    if (d > 0) {
      // One horizontal or vertical step consumed this round's budget.
      // x unchanged → came down (an added b token); y unchanged → came
      // right (a removed a token).
      if (x === prevX) {
        ops.push({ type: 'add', text: b[start + y - 1] });
        y--;
      } else {
        ops.push({ type: 'remove', text: a[start + x - 1] });
        x--;
      }
    }
  }
  ops.reverse();
  return ops;
}

export function diffText(oldText = '', newText = '') {
  const a = tokenize(oldText);
  const b = tokenize(newText);

  // Trim the common prefix and suffix — everything outside the edited
  // window is equal by construction and costs nothing to emit.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ type: 'equal', text: a[i] });

  const mid = myersWindowOps(a, b, start, endA, endB);
  if (mid) {
    ops.push(...mid);
  } else {
    // Over the edit-distance budget (e.g. a chapter fully rewritten).
    // One truthful replace pair instead of a freeze — mergeAdjacent keeps
    // it to two spans and diffSummary's counts stay exact.
    ops.push({ type: 'remove', text: a.slice(start, endA).join('') });
    ops.push({ type: 'add', text: b.slice(start, endB).join('') });
  }

  for (let i = endA; i < a.length; i++) ops.push({ type: 'equal', text: a[i] });

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
