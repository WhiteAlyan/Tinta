// Historical context: see docs/CODEBASE_NOTES.md#jssprint-js

// Historical context: see docs/CODEBASE_NOTES.md#jssprint-js
export const DURATION_PRESETS_MIN = [10, 20, 25, 30, 45, 60];

export function elapsedMs(startedAt, now = Date.now()) {
  return Math.max(0, now - startedAt);
}

// For countdown mode only. Open-ended sprints have no remaining time to
// compute — callers should use elapsedMs() instead and check mode first.
export function remainingMs(startedAt, durationMs, now = Date.now()) {
  return Math.max(0, startedAt + durationMs - now);
}

// Historical context: see docs/CODEBASE_NOTES.md#jssprint-js
export function formatClock(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
}

// Historical context: see docs/CODEBASE_NOTES.md#jssprint-js
export function computeWpm(words, elapsedMsValue) {
  if (elapsedMsValue <= 0) return 0;
  const minutes = elapsedMsValue / 60000;
  return Math.round(words / minutes);
}

// Historical context: see docs/CODEBASE_NOTES.md#jssprint-js
export function wordsWritten(currentTotal, baselineTotal) {
  return Math.max(0, currentTotal - baselineTotal);
}
