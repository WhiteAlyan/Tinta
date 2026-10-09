// Historical context: see docs/CODEBASE_NOTES.md#jsrulesystem-js-1-15

// Historical context: see docs/CODEBASE_NOTES.md#jsrulesystem-js-17-28
export function wouldCreateCycle(nodes, nodeId, candidateRequirementIds) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set();

  function reachesTarget(startId) {
    if (startId === nodeId) return true;
    if (visited.has(startId)) return false; // already ruled out, or mid-traversal (guards against unrelated cycles already in the data)
    visited.add(startId);
    const node = byId.get(startId);
    if (!node) return false;
    return (node.requirement || []).some((reqId) => reachesTarget(reqId));
  }

  return (candidateRequirementIds || []).some((reqId) => reachesTarget(reqId));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsrulesystem-js-45-54
export function orderByPrerequisite(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed = new Set();
  const result = [];
  let guard = nodes.length * nodes.length + 1; // generous — this only matters if something is actually stuck

  const remaining = [...nodes];
  while (remaining.length && guard-- > 0) {
    const idx = remaining.findIndex((n) => (n.requirement || []).every((reqId) => placed.has(reqId) || !byId.has(reqId)));
    if (idx === -1) break; // unresolved cycle in the data — bail to the fallback below rather than spin
    const [node] = remaining.splice(idx, 1);
    placed.add(node.id);
    result.push(node);
  }
  // Anything left (a real cycle slipped through some older path, or the
  // guard tripped) — append as-is so no node silently vanishes from the
  // list, just unordered relative to its prerequisites.
  return result.concat(remaining);
}
