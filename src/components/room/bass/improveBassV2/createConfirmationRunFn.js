// createConfirmationRunFn.js
// ---------------------------------------------------------------------------
// Factory for the runFn closure passed to runBoundedConfirmations.
//
// All four V2 confirmation phases (phase, calibration-delay, grouped-gain,
// position-escalation) share IDENTICAL plumbing around each canonical
// confirmation call:
//   • time the worker call
//   • record it through the run's metrics ledger
//   • rethrow fatal worker-lifecycle errors (abort / timeout) so they escape
//     the bounded runner's failure-isolation
//   • resolve { result, workerMs } on success, { result: null, error } on
//     candidate-level failure
//
// This module is SCHEDLING/INSTRUMENTATION ONLY. It changes no acoustic maths,
// no candidate count, no P14/P18/P19/P20, no ranking and no safety. The engine
// supplies the per-phase label and transferKey via callbacks so phase-specific
// identity stays with the phase that owns it.
// ---------------------------------------------------------------------------

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Build a runFn for runBoundedConfirmations.
 *
 * @param {object} opts
 * @param {object} opts.pool - A v2ConfirmationPool (has runConfirmation(job, signal)).
 * @param {object} opts.controller - AbortController whose signal cancels in-flight work.
 * @param {object} opts.metrics - V2RuntimeMetrics instance (recordWorkerCall, addStage).
 * @param {function} opts.isFatalLifecycleError - (err) => boolean; true rethrows.
 * @param {function} [opts.labelFor] - (job, index) => string for metrics.recordWorkerCall.
 *   Defaults to "confirmation".
 * @param {function} [opts.transferKeyFor] - (job, index) => string for the metrics
 *   transferKey field. Defaults to "current".
 * @returns {function} async (job, index) => { result, workerMs } | { result: null, workerMs, error }
 */
export function createConfirmationRunFn({
  pool,
  controller,
  metrics,
  isFatalLifecycleError,
  labelFor = () => "confirmation",
  transferKeyFor = () => "current",
}) {
  return async function runFn(job, index) {
    const t0 = now();
    const label = labelFor(job, index);
    const transferKey = transferKeyFor(job, index);
    try {
      const response = await pool.runConfirmation(job, controller.signal);
      const workerMs = now() - t0;
      metrics.recordWorkerCall("confirmation", label, workerMs, false, {
        startedAt: t0,
        endedAt: now(),
        tuning: job.tuning,
        transferKey,
      });
      return { result: response ?? null, workerMs };
    } catch (err) {
      // Fatal lifecycle errors (abort, hard timeout) MUST escape the bounded
      // runner's per-job failure isolation — they are not a candidate failure.
      if (isFatalLifecycleError(err)) throw err;
      return { result: null, workerMs: now() - t0, error: err };
    }
  };
}