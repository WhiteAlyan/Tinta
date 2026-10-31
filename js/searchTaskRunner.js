// Tinta — sliced search task runner (CR-43).
//
// The one implementation of "run a search one result category at a time,
// yielding between slices, until the budget says stop or the caller
// cancels." Two hosts share it:
//
//   - js/search-worker.js runs it inside the worker (off the main
//     thread entirely, watchdog-terminated from outside if a single
//     catastrophic exec() never yields);
//   - js/searchService.js runs it on the main thread as the FALLBACK
//     backend when Workers don't exist or fail to start — the yields
//     between slices keep typing and cancel reasonably responsive even
//     there.
//
// Keeping both hosts on this file is deliberate drift-proofing: the
// slice order, the merge rules, and the replace-preview-counts step are
// exactly the things that would silently diverge if the two backends
// each hand-rolled their loop.

import { searchProject, buildReplacePlan } from './search.js';

// Keep in sync with search.js's ALL_CATEGORIES — slice order is also
// render-priority order (chapters first, maps last).
export const SEARCH_CATEGORIES = ['chapters', 'entities', 'scenes', 'snippets', 'timelineEvents', 'references', 'annotations', 'ruleSystems', 'maps'];

export function emptyResults() {
  return {
    chapters: [], entities: [], scenes: [], snippets: [], timelineEvents: [],
    references: [], annotations: [], ruleSystems: [], maps: [],
    regexError: null, filterConflict: false, filters: [], stopped: null,
  };
}

export function mergeResults(target, part) {
  for (const cat of SEARCH_CATEGORIES) {
    if (Array.isArray(part[cat]) && part[cat].length > 0) {
      target[cat] = Array.isArray(target[cat]) && target[cat].length > 0
        ? target[cat].concat(part[cat])
        : part[cat];
    }
  }
  // Metadata (filters / regexError / filterConflict) is identical across
  // slices — any slice's copy is the run's copy.
  target.regexError = part.regexError;
  target.filterConflict = part.filterConflict;
  target.filters = part.filters;
}

// Default yield — a macrotask, so queued messages/timers get their turn.
// Both hosts can pass their own (the worker yields the same way).
const defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Run one search as category slices.
 *
 * @param {object} params
 * @param {object} params.project — the full active project (plain data;
 *   structured-clone safe for the worker, direct for the fallback).
 * @param {string} params.query
 * @param {object} [params.options] — caseSensitive / useRegex / budgetMs,
 *   passed straight through to searchProject.
 * @param {() => boolean} params.isCancelled — polled between slices; when
 *   true the run aborts and returns { cancelled: true }.
 * @param {() => Promise<void>} [params.yieldFn] — how to give the event
 *   loop a turn between slices.
 * @returns {Promise<{ cancelled: boolean, results: object, stopped: object|null }>}
 */
export async function runSlicedSearch({ project, query, options = {}, isCancelled = () => false, yieldFn = defaultYield }) {
  const results = emptyResults();
  let stopped = null;
  for (const cat of SEARCH_CATEGORIES) {
    if (isCancelled()) return { cancelled: true, results, stopped };
    const part = searchProject(project, query, { ...options, onlyCategories: [cat] });
    mergeResults(results, part);
    if (part.stopped) { stopped = part.stopped; break; }
    // Yield so (a) a queued cancel is observed before the next slice and
    // (b) the host stays responsive mid-search (worker messages, timers).
    await yieldFn();
  }
  if (isCancelled()) return { cancelled: true, results, stopped };
  results.stopped = stopped;
  return { cancelled: false, results, stopped };
}

/**
 * Replace-preview counts for the current query/mode — replacement-
 * independent, so they ride along with a search instead of needing their
 * own task. Skipped when the search itself stopped early: counts from a
 * partial run would understate, and the UI must not offer a replace
 * built on numbers it knows are wrong.
 */
export async function computeReplacePlanCounts({ project, query, options = {}, stopped }) {
  if (stopped) return null;
  const bp = buildReplacePlan(project, query, '', { ...options, countsOnly: true });
  return {
    chapterCount: bp.plan.length,
    matchTotal: bp.plan.reduce((sum, p) => sum + p.count, 0),
    stopped: bp.stopped,
  };
}
