// Tinta — search worker (CR-43).
//
// User-supplied regex has no execution limit in JS, so a pattern like
// (a+)+$ against the wrong manuscript line backtracks exponentially and
// used to freeze the whole app — searchProject() ran synchronously on the
// main thread, once per keystroke. This worker moves that work off the
// main thread and adds the two halves of the defense:
//
//   1. COOPERATIVE slices — the search runs one result category per
//      slice (chapters, then entities, then …) via searchTaskRunner.js,
//      yielding between slices so a cancel message can land MID-search
//      and the engine's wall-clock budget (search.js createSearchBudget)
//      is checked at every slice boundary. A slow-but-not-pathological
//      pattern ends as partial results + an honest `stopped` flag.
//   2. The HARD watchdog lives on the main thread (searchService.js) —
//      a single catastrophic exec() call never returns control to this
//      loop, so no in-worker check can fire; the service terminates the
//      worker at budget + grace and respawns it on demand. That is the
//      RE2-style guarantee ("the pattern cannot run unbounded") without
//      RE2's syntax restrictions, which would reject patterns prose
//      writers legitimately use.
//
// This file is deliberately THIN glue over searchTaskRunner.js (shared
// with the main-thread fallback backend) — the slice/merge logic lives
// in exactly one place.
//
// Module worker ({ type: 'module' }) so the engine lives in exactly one
// place: this file imports search.js, it does not copy it. CSP is
// `worker-src 'self'`, which allows a same-origin worker file (it does
// NOT allow blob: workers — that constraint is why this is a real file
// and why it must stay in sw.js's SHELL_FILES for offline use).
//
// Message protocol (request → response):
//   { op: 'search', token, payload: { project, query, caseSensitive, useRegex, budgetMs } }
//     → { kind: 'done', token, payload: { results, stopped, replacePlanCounts } }
//       replacePlanCounts rides along because the Replace button's
//       per-render preview needs the same pattern evaluated across
//       chapters — one worker round-trip instead of a second task, and
//       it inherits the same budget/cancel/watchdog protection.
//   { op: 'replace-plan', token, payload: { project, query, replacement, caseSensitive, useRegex, budgetMs } }
//     → { kind: 'plan', token, payload: { plan, stopped } }
//   { op: 'cancel', token } — aborts the in-flight run with that token
//     at its next slice boundary. Token-scoped so a stale cancel meant
//     for run 1 can't kill run 2 (messages queue in order; the service
//     always cancels the old token before starting the new one).

import { runSlicedSearch, computeReplacePlanCounts } from './searchTaskRunner.js';
import { buildReplacePlan } from './search.js';

let activeToken = null;
let cancelled = false;

function errorPayload(err) {
  return { message: err && err.message ? err.message : String(err) };
}

async function runSearch(msg) {
  const { token, payload } = msg;
  const { project, query, caseSensitive = false, useRegex = false, budgetMs } = payload;
  cancelled = false;
  activeToken = token;

  const options = { caseSensitive, useRegex, ...(budgetMs != null ? { budgetMs } : {}) };
  const run = await runSlicedSearch({
    project,
    query,
    options,
    isCancelled: () => cancelled,
  });
  if (run.cancelled) {
    self.postMessage({ kind: 'cancelled', token });
    return;
  }

  const replacePlanCounts = await computeReplacePlanCounts({
    project, query, options, stopped: run.stopped,
  });

  self.postMessage({ kind: 'done', token, payload: { results: run.results, stopped: run.stopped, replacePlanCounts } });
}

function runReplacePlan(msg) {
  const { token, payload } = msg;
  const { project, query, replacement, caseSensitive = false, useRegex = false, budgetMs } = payload;
  cancelled = false;
  activeToken = token;
  const { plan, stopped } = buildReplacePlan(project, query, replacement, {
    caseSensitive, useRegex,
    ...(budgetMs != null ? { budgetMs } : {}),
  });
  self.postMessage({ kind: 'plan', token, payload: { plan, stopped } });
}

// Guarded so the Node module-load smoketest can import this file: under
// Node there is no worker `self` and no messages can arrive — the
// registration is meaningless there, but an unguarded assignment would
// crash the import. In a real worker the guard is always true.
if (typeof self !== 'undefined') {
  self.onmessage = (msg) => {
    const { op, token } = msg.data || {};
    try {
      if (op === 'search') {
        // Async — its rejections don't route through this catch. The
        // engine never throws for bad patterns (regexError path), so an
        // error here is an unexpected bug; surface it instead of leaving
        // the main thread waiting on a reply that never comes (the
        // service's watchdog would terminate us, but an honest error is
        // cheaper and more diagnosable than a killed worker).
        runSearch(msg.data).catch((err) => {
          self.postMessage({ kind: 'error', token, ...errorPayload(err) });
        });
      } else if (op === 'replace-plan') {
        runReplacePlan(msg.data);
      } else if (op === 'cancel') {
        if (token === activeToken) cancelled = true;
      }
    } catch (err) {
      // Synchronous setup errors (bad payload shape etc.) — same reasoning.
      self.postMessage({ kind: 'error', token, ...errorPayload(err) });
    }
  };
}
