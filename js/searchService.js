// Tinta — search service (CR-43).
//
// The main-thread half of the "user regex can't freeze the app" fix.
// Owns backend selection, run tokens, cancellation, and the hard
// watchdog; hands actual scanning to the budgeted engine (search.js)
// through the shared slice runner (searchTaskRunner.js).
//
// Backends, in preference order:
//
//   1. WORKER (js/search-worker.js, module worker) — the normal path.
//      Scanning never touches the main thread. The watchdog arms at
//      engine budget + grace: if no reply arrives in time, the worker
//      is TERMINATED (the only way to interrupt a single catastrophic
//      exec() call — no cooperative check can fire mid-exec) and the
//      next search respawns it lazily. The run resolves with an honest
//      hard-stop outcome, not a hang.
//   2. MAIN-THREAD FALLBACK — when Worker is missing (exotic embedded
//      webviews) or creation/load fails (stale SW shell, odd CSP edge),
//      the same slice runner runs inline with yields between slices.
//      Cooperative budgets still bound the work per iteration; the
//      residual risk (a single exec() hang freezing the main thread) is
//      documented and is precisely why the worker path is the default.
//      Node's smoketests exercise this path for real — Node has no
//      Worker.
//
// Cancellation model: every run gets a monotonic token. cancelActive()
// invalidates the current token (its promise resolves 'cancelled', any
// late reply is dropped) and tells the worker to abort at its next
// slice boundary. The search view cancels whenever a newer debounced
// query supersedes the running one, and on project switch / view reset.
//
// Every exported entry point RESOLVES — never rejects — so callers can
// render every outcome honestly instead of needing a try/catch ladder.

import { buildReplacePlan, SEARCH_TIME_BUDGET_MS } from './search.js';
import { runSlicedSearch, emptyResults } from './searchTaskRunner.js';

// How long past the engine's own budget we wait before concluding the
// worker is stuck inside a single exec() and killing it. Grace, not
// padding: the engine's cooperative stop needs to win the race first so
// partial results survive whenever they can.
const WATCHDOG_GRACE_MS = 1500;

let worker = null;          // lazily created module Worker
let workerBroken = false;   // permanently fallback once creation/load failed
let activeRun = null;       // { token, resolve, op, payload, startedAt, timer, backend }
let seq = 0;                // monotonic run-token source

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function ensureWorker() {
  if (workerBroken) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') {
    workerBroken = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./search-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = handleWorkerMessage;
    worker.onerror = handleWorkerError;
    return worker;
  } catch {
    workerBroken = true;
    worker = null;
    return null;
  }
}

function terminateWorker() {
  if (!worker) return;
  // Drop the handlers first — a dying worker can emit a late
  // error/message and it must not resolve anything.
  worker.onmessage = null;
  worker.onerror = null;
  worker.terminate();
  worker = null;
}

// Stale-reply gate: only the CURRENT run's token may resolve anything.
function isActive(token) {
  return activeRun !== null && activeRun.token === token;
}

function finishRun(token, outcome) {
  if (!isActive(token)) return; // stale reply — drop silently
  clearTimeout(activeRun.timer);
  const { resolve } = activeRun;
  activeRun = null;
  resolve(outcome);
}

function handleWorkerMessage(msg) {
  const data = msg && msg.data ? msg.data : null;
  if (!data || !activeRun || data.token !== activeRun.token) return; // stale
  if (data.kind === 'done') {
    finishRun(data.token, {
      status: 'ok',
      results: data.payload.results,
      stopped: data.payload.stopped,
      replacePlanCounts: data.payload.replacePlanCounts,
      backend: 'worker',
      elapsedMs: nowMs() - activeRun.startedAt,
    });
  } else if (data.kind === 'plan') {
    finishRun(data.token, {
      status: 'ok',
      plan: data.payload.plan,
      stopped: data.payload.stopped,
      backend: 'worker',
      elapsedMs: nowMs() - activeRun.startedAt,
    });
  } else if (data.kind === 'cancelled') {
    // Cooperative abort confirmed. cancelActive() already resolved the
    // promise and cleared activeRun, so this reply finds no active run
    // and hits the stale gate above. No action — documented protocol.
  } else if (data.kind === 'error') {
    finishRun(data.token, {
      status: 'error',
      message: data.message || 'Search worker failed',
      backend: 'worker',
      elapsedMs: nowMs() - activeRun.startedAt,
    });
  }
}

function handleWorkerError() {
  // Script-level failure (module load failure under a stale SW shell,
  // an unexpected throw outside runSearch's own catch, …). Kill the
  // worker, mark the backend broken, and let the in-flight run fall
  // back to the main thread instead of leaving a dead search view.
  terminateWorker();
  workerBroken = true;
  if (!activeRun) return;
  const { token, resolve, op, payload, startedAt, timer } = activeRun;
  clearTimeout(timer);
  activeRun = null;
  runOnMainThread(token, op, payload).then((outcome) => {
    resolve({
      ...outcome,
      backend: 'main',
      elapsedMs: outcome.elapsedMs != null ? outcome.elapsedMs : nowMs() - startedAt,
    });
  });
}

// The fallback scan. `token` is checked against the live activeRun so a
// cancel (or a superseding run) is observed between slices.
function runOnMainThread(token, op, payload) {
  const options = {
    caseSensitive: payload.caseSensitive,
    useRegex: payload.useRegex,
    ...(payload.budgetMs != null ? { budgetMs: payload.budgetMs } : {}),
  };
  if (op === 'search') {
    return runSlicedSearch({
      project: payload.project,
      query: payload.query,
      options,
      isCancelled: () => !isActive(token),
    }).then(async (run) => {
      if (!isActive(token)) return { status: 'cancelled' };
      if (run.cancelled) return { status: 'cancelled' };
      const replacePlanCounts = await computeReplacePlanCountsSafe(payload, run.stopped);
      if (!isActive(token)) return { status: 'cancelled' };
      return {
        status: 'ok',
        results: run.results,
        stopped: run.stopped,
        replacePlanCounts,
      };
    });
  }
  // replace-plan — budgeted per chapter by the engine; the watchdog
  // doesn't apply on this path (nothing to terminate), which is exactly
  // why the worker path is the default one.
  const { plan, stopped } = buildReplacePlan(payload.project, payload.query, payload.replacement, options);
  return Promise.resolve({ status: 'ok', plan, stopped });
}

// Mirrors the worker's post-search step (see searchTaskRunner.js):
// skipped when the search stopped early, since partial counts would
// understate and the UI must not offer a replace on bad numbers.
async function computeReplacePlanCountsSafe(payload, stopped) {
  if (stopped) return null;
  const bp = buildReplacePlan(payload.project, payload.query, '', {
    caseSensitive: payload.caseSensitive,
    useRegex: payload.useRegex,
    ...(payload.budgetMs != null ? { budgetMs: payload.budgetMs } : {}),
    countsOnly: true,
  });
  return {
    chapterCount: bp.plan.length,
    matchTotal: bp.plan.reduce((sum, p) => sum + p.count, 0),
    stopped: bp.stopped,
  };
}

// The hard watchdog — armed on the WORKER path only. Fired means: no
// reply within budget + grace, i.e. the worker is stuck inside a single
// catastrophic exec() (the true ReDoS case — no cooperative check can
// fire mid-exec) or otherwise wedged. Kill it hard; the next search
// respawns lazily. The run resolves with a hard stop and no partial
// results — partials only survive a COOPERATIVE stop, and that's the
// honest trade.
function armWatchdog(token, op, budgetMs) {
  const budget = budgetMs != null ? budgetMs : SEARCH_TIME_BUDGET_MS;
  return setTimeout(() => {
    if (!isActive(token)) return;
    terminateWorker();
    const { resolve } = activeRun;
    activeRun = null;
    const stopped = { reason: 'time', hard: true, elapsedMs: budget };
    if (op === 'search') {
      resolve({
        status: 'ok',
        results: emptyResults(),
        stopped,
        replacePlanCounts: null,
        backend: 'worker',
        elapsedMs: budget,
      });
    } else {
      resolve({ status: 'ok', plan: [], stopped, backend: 'worker', elapsedMs: budget });
    }
  }, budget + WATCHDOG_GRACE_MS);
}

function startRun(op, payload) {
  const token = ++seq;
  const startedAt = nowMs();
  const w = ensureWorker();
  if (w) {
    return new Promise((resolve) => {
      activeRun = { token, resolve, op, payload, startedAt, timer: null, backend: 'worker' };
      activeRun.timer = armWatchdog(token, op, payload.budgetMs);
      w.postMessage({ op, token, payload });
    });
  }
  // Main-thread fallback — still a managed run, so cancelActive() and
  // the stale-run checks behave identically across backends.
  let resolveRun;
  const promise = new Promise((resolve) => { resolveRun = resolve; });
  activeRun = { token, resolve: resolveRun, op, payload, startedAt, timer: null, backend: 'main' };
  runOnMainThread(token, op, payload).then((outcome) => {
    if (!isActive(token)) return; // cancelActive() already resolved it
    clearTimeout(activeRun.timer);
    activeRun = null;
    resolveRun({ ...outcome, backend: 'main', elapsedMs: nowMs() - startedAt });
  });
  return promise;
}

/**
 * Run a full-project search. Resolves:
 *   { status: 'ok'|'cancelled'|'error', results, stopped,
 *     replacePlanCounts, backend, elapsedMs }
 * `stopped` is null when the run completed, else { reason: 'time' |
 * 'matches', hard?, elapsedMs } — hard=true means the watchdog terminated
 * the worker (no partials survived).
 */
export function runSearch(project, query, { caseSensitive = false, useRegex = false, budgetMs } = {}) {
  return startRun('search', { project, query, caseSensitive, useRegex, budgetMs });
}

/**
 * Evaluate the replace plan (counts + per-chapter newContent) under the
 * same budget/watchdog protection. Resolves
 *   { status: 'ok'|'cancelled'|'error', plan, stopped, backend, elapsedMs }
 * A non-null `stopped` means the plan is PARTIAL and the caller must not
 * offer a replace built on it.
 */
export function runReplacePlan(project, query, replacement, { caseSensitive = false, useRegex = false, budgetMs } = {}) {
  return startRun('replace-plan', { project, query, replacement, caseSensitive, useRegex, budgetMs });
}

/**
 * Invalidate the in-flight run (if any): its promise resolves
 * 'cancelled', late replies are dropped, and the worker is told to abort
 * at its next slice boundary. Called by the search view when a newer
 * query supersedes the running one, and on project switch / view reset.
 */
export function cancelActive() {
  if (!activeRun) return;
  const { token, resolve, op, timer, backend } = activeRun;
  clearTimeout(timer);
  activeRun = null;
  if (worker) {
    try { worker.postMessage({ op: 'cancel', token }); } catch { /* dying worker — ignore */ }
  }
  resolve(op === 'search'
    ? { status: 'cancelled', results: null, stopped: null, replacePlanCounts: null, backend, elapsedMs: 0 }
    : { status: 'cancelled', plan: null, stopped: null, backend, elapsedMs: 0 });
}

// Test seam — lets the Node smoketest pin the "superseding run wins"
// rule and lets the browser spec force the fallback deterministically.
// Not used by the app itself.
export function _isWorkerBacked() {
  return !workerBroken && typeof Worker !== 'undefined';
}

// Test-only reset — between smoketest sections the service's backend
// latch and any in-flight run must start clean, exactly like a fresh
// page load. The Node suite uses a fake wedged Worker to drive the
// watchdog path, so `workerBroken` (which correctly latches to fallback
// in a real no-worker session) has to be clearable too.
export function _resetForTests() {
  if (activeRun) {
    clearTimeout(activeRun.timer);
    activeRun = null;
  }
  terminateWorker();
  workerBroken = false;
  worker = null;
}
