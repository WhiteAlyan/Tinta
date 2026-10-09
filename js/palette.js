// Historical context: see docs/CODEBASE_NOTES.md#jspalette-js-1-5

// Historical context: see docs/CODEBASE_NOTES.md#jspalette-js-7-11
function scoreMatch(label, query) {
  const text = label.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;

  if (text === q) return 1000;

  const idx = text.indexOf(q);
  if (idx !== -1) return idx === 0 ? 500 - q.length : 250 - idx;

  let ti = 0;
  let run = 0;
  let bestRun = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const found = text.indexOf(q[qi], ti);
    if (found === -1) return -1; // not even a subsequence — no match at all
    run = found === ti ? run + 1 : 1;
    bestRun = Math.max(bestRun, run);
    ti = found + 1;
  }
  // Reward long consecutive runs (a real fuzzy hit), penalize matches
  // spread far across the label (more likely a coincidence).
  return 50 + bestRun * 5 - ti;
}

// Historical context: see docs/CODEBASE_NOTES.md#jspalette-js-37-40
export function filterItems(items, query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return items;
  return items
    .map((item) => ({ item, score: scoreMatch(item.label, trimmed) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.item);
}
