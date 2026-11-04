// v2ConfirmationPool.js
// ---------------------------------------------------------------------------
// A bounded pool of V2 Improve Bass Response workers dedicated to PARALLEL
// canonical confirmation calls.
//
// WHY THIS EXISTS
//   The V2 engine uses ONE sequential worker for its search phases (grouped
//   phase / delay / gain, placement, seating-batch, crossover-integration).
//   Those phases are sequential by design — each builds on the previous
//   result. Canonical confirmations, by contrast, are INDEPENDENT candidate
//   evaluations: the same rawTransfer + a different tuning, evaluated through
//   the same canonical EQ/P14/P18/P19/P20 chain. Running them on one worker
//   is the proven performance bottleneck (31–37 s of serial confirmation in
//   Rooms B/C).
//
//   This pool creates N workers from the SAME worker module, each initialised
//   with the SAME integration context, so any confirmation job can be
//   dispatched to any idle pool worker.
//
// WHAT IT DOES NOT DO
//   • It does NOT change the canonical evaluator, the equations, the tuning
//     values, the candidate count, P14/P18/P19/P20, ranking or safety.
//   • It does NOT parallelise search phases — those stay on the single worker.
//   • It does NOT write to the database. Confirmation is calculation-only.
//
// CANCELLATION
//   The pool's abort signal listener terminates ALL pool workers the instant
//   the run is cancelled or the whole-run deadline expires. Queued
//   confirmations never launch (the bounded runner checks isAborted before
//   dispatching each job). In-flight confirmations are terminated by
//   runInWorker's own onAbort handler.
// ---------------------------------------------------------------------------

import { runInWorker } from "./improveBassV2WorkerLifecycle.js";

/**
 * Create a pool of V2 workers for parallel canonical confirmations.
 *
 * @param {object} opts
 * @param {string} opts.workerUrl - Worker module URL (same as the single worker)
 * @param {number} opts.size - Pool size (max concurrency). Start at 3.
 * @param {*} [opts.integrationContext] - Sent to every pool worker so any
 *   confirmation job can run on any worker.
 * @param {AbortSignal} [opts.signal] - On abort, all pool workers terminate.
 * @returns {{ acquire: function, release: function, runConfirmation: function, terminateAll: function, size: number }}
 */
export function createConfirmationPool({ workerUrl, size, integrationContext = null, signal = null }) {
  const workers = [];
  const idleIndices = [];
  const waiters = [];
  let terminated = false;

  for (let i = 0; i < size; i += 1) {
    const worker = new Worker(workerUrl, { type: "module" });
    workers.push(worker);
    idleIndices.push(i);
    // Fire-and-forget: the worker processes this FIRST (postMessage is FIFO),
    // so the first confirmation job dispatched to this worker finds the
    // integration context already set. The response is harmlessly ignored
    // (no matching requestId listener).
    if (integrationContext) {
      try {
        worker.postMessage({
          requestId: `pool-init-${i}-${Date.now()}`,
          phase: "integration-context",
          context: integrationContext,
        });
      } catch {
        /* worker failed to accept setup — will surface on first job */
      }
    }
  }

  if (signal) {
    if (signal.aborted) {
      terminateAll();
    } else {
      signal.addEventListener("abort", terminateAll, { once: true });
    }
  }

  function terminateAll() {
    if (terminated) return;
    terminated = true;
    for (const w of workers) {
      try { w.terminate(); } catch { /* already dead */ }
    }
    workers.length = 0;
    idleIndices.length = 0;
    while (waiters.length) waiters.shift()(null);
  }

  function acquire() {
    return new Promise((resolve) => {
      if (terminated) { resolve(null); return; }
      if (idleIndices.length > 0) {
        resolve(workers[idleIndices.shift()]);
        return;
      }
      waiters.push(resolve);
    });
  }

  function release(worker) {
    if (terminated) return;
    const idx = workers.indexOf(worker);
    if (idx < 0) return; // worker was removed (errored / terminated)
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter(worker);
    } else {
      idleIndices.push(idx);
    }
  }

  /**
   * Run one canonical confirmation on an idle pool worker.
   * Returns the raw worker result (same as runInWorker).
   */
  async function runConfirmation(params, jobSignal) {
    const worker = await acquire();
    if (!worker) throw new Error("Confirmation pool terminated");
    try {
      return await runInWorker(worker, "confirmation", params, jobSignal);
    } finally {
      release(worker);
    }
  }

  return {
    acquire,
    release,
    runConfirmation,
    terminateAll,
    get size() { return terminated ? 0 : workers.length; },
  };
}