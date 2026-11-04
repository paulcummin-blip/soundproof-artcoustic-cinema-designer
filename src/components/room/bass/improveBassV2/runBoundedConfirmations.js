// runBoundedConfirmations.js
// ---------------------------------------------------------------------------
// Bounded-concurrency runner for INDEPENDENT canonical confirmation jobs.
//
// DESIGN CONTRACT
//   • Candidates may FINISH out of order — downstream ordering stays
//     deterministic. Results are returned in the ORIGINAL job order.
//   • One job failure is ISOLATED — it is recorded at its own index and never
//     cancels otherwise valid siblings. A failure is { ok: false, error }.
//   • Cancellation stops launching queued work: isAborted() is checked before
//     each dispatch. In-flight jobs are terminated by their own abort signal.
//   • NO early winner selection: the caller gets the full result set and runs
//     the existing ranking authority unchanged.
//   • The runFn is the ONLY thing that touches a worker — the runner never
//     posts messages itself, so it carries no worker lifecycle of its own.
//
// INSTRUMENTATION (diagnostic only)
//   candidateCount, maxConcurrency, jobsStarted, jobsCompleted, jobsFailed,
//   peakActive, phaseElapsedMs, sumWorkerMs — all recorded from real events.
//
// This module is SCHEDULING ONLY. It changes no acoustic maths, no candidate
// count, no P14/P18/P19/P20, no ranking and no safety check.
// ---------------------------------------------------------------------------

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Run an array of independent jobs with bounded concurrency.
 *
 * @param {object} opts
 * @param {Array} opts.jobs - Independent jobs, in canonical order.
 * @param {number} opts.maxConcurrency - Max simultaneous in-flight jobs.
 * @param {function} opts.runFn - async (job, index) => { result, workerMs, ... }.
 *   Must resolve with an object; may reject (failure isolation).
 * @param {function} [opts.isAborted] - () => boolean. When true, no new jobs
 *   launch; in-flight jobs settle on their own.
 * @returns {Promise<{ results: Array, stats: object }>}
 *   results[i] = { ok: true, result, workerMs } | { ok: false, error, workerMs: 0 }
 */
export function runBoundedConfirmations({ jobs, maxConcurrency, runFn, isAborted }) {
  const results = new Array(jobs.length);
  const phaseStart = now();
  const stats = {
    candidateCount: jobs.length,
    maxConcurrency,
    jobsStarted: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
    peakActive: 0,
    phaseElapsedMs: 0,
    sumWorkerMs: 0,
  };

  return new Promise((resolve) => {
    if (!jobs.length) {
      stats.phaseElapsedMs = now() - phaseStart;
      resolve({ results: [], stats });
      return;
    }

    let nextIndex = 0;
    let active = 0;
    let settled = false;

    function finish() {
      if (settled) return;
      settled = true;
      stats.phaseElapsedMs = now() - phaseStart;
      stats.sumWorkerMs = results.reduce((sum, r) => sum + (Number(r?.workerMs) || 0), 0);
      resolve({ results, stats });
    }

    function dispatch() {
      // Stop launching when aborted — in-flight jobs settle on their own.
      while (active < maxConcurrency && nextIndex < jobs.length && !(isAborted && isAborted())) {
        const idx = nextIndex;
        nextIndex += 1;
        active += 1;
        stats.jobsStarted += 1;
        if (active > stats.peakActive) stats.peakActive = active;

        runFn(jobs[idx], idx)
          .then((entry) => {
            results[idx] = { ok: true, result: entry?.result ?? null, workerMs: Number(entry?.workerMs) || 0 };
          })
          .catch((error) => {
            results[idx] = { ok: false, error, workerMs: 0 };
            stats.jobsFailed += 1;
          })
          .finally(() => {
            active -= 1;
            stats.jobsCompleted += 1;
            const exhausted = nextIndex >= jobs.length || (isAborted && isAborted());
            if (exhausted && active === 0) {
              finish();
            } else {
              dispatch();
            }
          });
      }

      // All jobs launched and all settled (handles the case where the last
      // dispatch filled the concurrency bound and no more dispatch is needed).
      if (nextIndex >= jobs.length && active === 0 && !settled) {
        finish();
      }
    }

    dispatch();
  });
}