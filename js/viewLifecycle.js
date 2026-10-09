// Historical context: see docs/CODEBASE_NOTES.md#jsviewlifecycle-js-1-28

const viewResets = [];

/**
 * Register a view's reset function. Called at module-load time by each
 * view module that owns per-view state. The reset function MUST:
 *  - clear any active selection ids (setActiveEntityId(null), etc.)
 *  - clear any per-view filter Sets / maps
 *  - NOT call render() — the caller handles that
 *  - NOT throw — a thrown reset in one view shouldn't break the others
 *
 * @param {string} viewId — e.g. 'notes', 'canvas', 'systems'
 * @param {() => void} resetFn
 */
export function registerViewReset(viewId, resetFn) {
  if (typeof resetFn !== 'function') return;
  viewResets.push({ viewId, resetFn });
}

/**
 * Reset every registered view's per-view state. Called by
 * teardownLiveStateForProjectSwitch. Each reset is wrapped in try/catch
 * so one view's failure doesn't skip the others — the same defensive
 * pattern notifySaveError / notifySaveSuccess already use.
 */
export function resetAllViews() {
  viewResets.forEach(({ viewId, resetFn }) => {
    try {
      resetFn();
    } catch (err) {
      // A view's reset throwing shouldn't break the others. Log it so
      // it's not invisible, but don't propagate — project-switch should
      // still complete and clear what it can.
      console.warn(`Tinta: view "${viewId}" reset threw during project switch:`, err);
    }
  });
}
