// stage1EvaluationPool.js
// ---------------------------------------------------------------------------
// Bounded pool of Stage 1 candidate-evaluation workers. Each worker is
// initialised with the SAME room/source context, so any candidate job can run
// on any idle pool worker.
//
// The PROVEN SCHEDULER — runBoundedConfirmations — owns dispatch ordering,
// peak-concurrency caps, failure isolation and cancellation. This module owns
// ONLY worker lifecycle and the per-call message round-trip.
//
// SCHEDULING + LIFECYCLE ONLY. No acoustic maths, no candidate count, no
// ranking, no safety. Calculation-only — no database writes.
//
// CANCELLATION
//   The pool's abort signal (from the Stage 1 run's AbortController) terminates
//   ALL pool workers the instant the run is cancelled or completes. Queued
//   evaluations never launch (runBoundedConfirmations checks isAborted before
//   dispatching each job). In-flight evaluations reject as their worker is
//   terminated, and runBoundedConfirmations records them as isolated failures.
// ---------------------------------------------------------------------------

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Create a bounded pool of Stage 1 evaluation workers.
 *
 * @param {object} opts
 * @param {string} opts.workerUrl - Worker module URL (stage1Evaluation.worker.js)
 * @param {number} opts.size - Pool size (max concurrency). Start at 3.
 * @param {object} opts.context - Shared room/source context sent to every
 *   pool worker on init ({ roomDims, rspPosition, seatingPositions, physicsOptions }).
 * @param {AbortSignal} [opts.signal] - On abort, all pool workers terminate.
 * @returns {{ evaluate: function, terminateAll: function, size: number }}
 */
export function createStage1EvaluationPool({ workerUrl, size, context, signal = null }) {
  const workers = [];
  const idleIndices = [];
  const waiters = [];
  const pending = new Map(); // requestId -> { resolve, reject, worker }
  let terminated = false;

  for (let i = 0; i < size; i += 1) {
    const worker = new Worker(workerUrl, { type: "module" });
    worker.addEventListener("message", (event) => {
      const data = event.data || {};
      // The init "ready" response has no matching pending entry — ignore it.
      const entry = pending.get(data.requestId);
      if (!entry) return;
      pending.delete(data.requestId);
      release(entry.worker);
      if (data.type === "complete") entry.resolve(data.result);
      else entry.reject(new Error(data.error || "Stage 1 evaluation worker failed"));
    });
    worker.addEventListener("error", () => {
      // Uncaught worker error — fail any pending call on this worker. The
      // worker itself stays alive (module workers survive onmessage errors;
      // the worker's own try/catch replies a typed error for those).
      for (const [rid, entry] of pending) {
        if (entry.worker === worker) {
          pending.delete(rid);
          entry.reject(new Error("Stage 1 evaluation worker error"));
        }
      }
    });
    workers.push(worker);
    idleIndices.push(i);
    try {
      worker.postMessage({
        type: "init",
        requestId: `stage1-pool-init-${i}-${Date.now()}`,
        context,
      });
    } catch {
      /* worker failed to accept setup — surfaces on first job */
    }
  }

  if (signal) {
    if (signal.aborted) terminateAll();
    else signal.addEventListener("abort", terminateAll, { once: true });
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
    for (const [, entry] of pending) {
      entry.reject(new Error("Stage 1 evaluation pool terminated"));
    }
    pending.clear();
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
   * Evaluate one candidate on an idle pool worker.
   * Resolves with the evaluated candidate object (or null for an incomplete
   * transfer). Rejects on worker error or pool termination.
   */
  async function evaluate(candidate) {
    const worker = await acquire();
    if (!worker) throw new Error("Stage 1 evaluation pool terminated");
    const requestId = `stage1-eval:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject, worker });
      try {
        worker.postMessage({ requestId, type: "evaluate", candidate });
      } catch (err) {
        pending.delete(requestId);
        release(worker);
        reject(err);
      }
    });
  }

  return {
    evaluate,
    terminateAll,
    get size() { return terminated ? 0 : workers.length; },
  };
}