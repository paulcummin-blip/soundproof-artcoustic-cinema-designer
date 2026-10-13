import { frameRunner, readinessNow, withDeadline, PRINT_READINESS_BUDGET_MS, PRINT_READINESS_STABLE_FRAMES } from './readinessContract.js';

/** Observe only structural activity and numeric geometry; never retain DOM or copy. */
export async function observeLayoutStability(target, win, measure, {
  frames = PRINT_READINESS_STABLE_FRAMES, budgetMs = PRINT_READINESS_BUDGET_MS.layout,
  diagnostics = {},
} = {}) {
  const deadline = readinessNow() + budgetMs;
  const frame = frameRunner(win);
  let mutations = 0;
  let previousMutations = 0;
  let stable = 0;
  let previous = null;
  const Observer = win?.MutationObserver;
  const observer = Observer && target ? new Observer(() => { mutations += 1; }) : null;
  observer?.observe(target, { subtree: true, childList: true, attributes: true, characterData: true });
  Object.assign(diagnostics, { measurementsAttempted: 0, lastTwoDimensions: [], dimensionsChanged: null,
    domStillChanging: false, mutationBatches: 0, stableFrames: 0, requiredStableFrames: frames,
    pageCount: target?.querySelectorAll?.('.pp-page, .pp-cover')?.length ?? null,
    conditionNotMet: null });
  const sample = () => {
    const signature = measure(target);
    const [width, height, scrollHeight, scrollWidth] = signature.split('|').slice(0, 4).map(Number);
    diagnostics.measurementsAttempted += 1;
    diagnostics.lastTwoDimensions = [...diagnostics.lastTwoDimensions, { width, height, scrollHeight, scrollWidth }].slice(-2);
    diagnostics.domStillChanging = mutations !== previousMutations;
    diagnostics.mutationBatches = mutations;
    if (previous !== null) {
      diagnostics.dimensionsChanged = signature !== previous;
      stable = signature === previous && !diagnostics.domStillChanging ? stable + 1 : 0;
    }
    previous = signature;
    previousMutations = mutations;
    diagnostics.stableFrames = stable;
  };
  try {
    sample();
    while (frame && stable < frames && readinessNow() < deadline) {
      try { await withDeadline(frame(), Math.max(0, deadline - readinessNow())); }
      catch (error) {
        if (!error?.printReadinessTimeout) throw error;
        diagnostics.domStillChanging = mutations !== previousMutations;
        diagnostics.mutationBatches = mutations;
        diagnostics.conditionNotMet = 'animation_frame_deadline_exceeded';
        return false;
      }
      if (readinessNow() >= deadline) break;
      sample();
    }
    if (stable >= frames) return true;
    diagnostics.conditionNotMet = diagnostics.domStillChanging ? 'print_dom_still_mutating'
      : diagnostics.dimensionsChanged ? 'layout_dimensions_still_changing' : 'insufficient_stable_frames';
    return false;
  } finally { observer?.disconnect(); }
}