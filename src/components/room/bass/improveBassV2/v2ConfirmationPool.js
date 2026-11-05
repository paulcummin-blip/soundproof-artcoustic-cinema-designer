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

import { runInWorker, V2AbortError, V2WorkerError, isFatalLifecycleError } from "./improveBassV2WorkerLifecycle.js";

// Keep URL construction inside new Worker so Vite bundles the worker's imports.
function createConfirmationWorker() {
  return new Worker(new URL("./improveBassV2.worker.js", import.meta.url), { type: "module" });
}

export function createConfirmationPool({
  createWorker = createConfirmationWorker, size, integrationContext = null,
  // Includes loading the worker module graph, not acoustic computation.
  // Live preview measured 4.8–6.9 s for healthy startup (context handling <1 ms).
  // Keep a bounded startup allowance with headroom; evaluation deadlines are unchanged.
  signal = null, startupTimeoutMs = 15000,
}) {
  const workers = [];
  const idle = [];
  const waiters = [];
  const controller = new AbortController();
  let terminated = false;
  let terminalError = null;

  function terminateAll(reason = new V2AbortError()) {
    if (terminated) return;
    terminated = true;
    terminalError = reason;
    controller.abort(reason);
    for (const worker of workers) {
      try { worker.terminate(); } catch { /* already stopped */ }
    }
    idle.length = 0;
    while (waiters.length) waiters.shift()(null);
    signal?.removeEventListener("abort", onAbort);
  }
  function onAbort() {
    terminateAll(isFatalLifecycleError(signal?.reason) ? signal.reason : new V2AbortError());
  }
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();

  // Listen before startup can fail, and require acknowledgement before work.
  // Catch immediately: pool creation can precede the first confirmation.
  const startups = [];
  try {
    for (let i = 0; i < size && !terminated; i += 1) {
      const worker = createWorker();
      workers.push(worker);
      startups.push(runInWorker(worker, "integration-context", { context: integrationContext },
        controller.signal, { timeoutMs: startupTimeoutMs })
        .then(() => { if (!terminated) idle.push(worker); })
        .catch(error => {
          terminateAll(isFatalLifecycleError(error) ? error : new V2WorkerError(error.message));
        }));
    }
  } catch (error) {
    terminateAll(new V2WorkerError(error.message));
  }
  const ready = Promise.all(startups);
  async function ensureReady() {
    await ready;
    if (terminated) throw terminalError;
  }
  function acquire() {
    return new Promise(resolve => {
      if (terminated) resolve(null);
      else if (idle.length) resolve(idle.shift());
      else waiters.push(resolve);
    });
  }
  function release(worker) {
    if (terminated) return;
    if (waiters.length) waiters.shift()(worker);
    else idle.push(worker);
  }
  async function runConfirmation(params, jobSignal) {
    const abortJob = () => terminateAll(
      isFatalLifecycleError(jobSignal?.reason) ? jobSignal.reason : new V2AbortError());
    jobSignal?.addEventListener("abort", abortJob, { once: true });
    if (jobSignal?.aborted) abortJob();
    let worker;
    try {
      await ensureReady();
      worker = await acquire();
      if (!worker) throw terminalError || new V2AbortError();
      return await runInWorker(worker, "confirmation", params, controller.signal);
    } catch (error) {
      if (isFatalLifecycleError(error)) terminateAll(error);
      throw error;
    } finally {
      jobSignal?.removeEventListener("abort", abortJob);
      if (worker) release(worker);
    }
  }
  return { acquire, release, ensureReady, runConfirmation, terminateAll,
    get size() { return terminated ? 0 : workers.length; } };
}
