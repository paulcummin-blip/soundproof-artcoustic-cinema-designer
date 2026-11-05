// Lifecycle only: the existing bounded scheduler still owns candidate ordering.
// Keep new Worker(new URL(...)) together so Vite bundles the child module and
// its imports. Passing a pre-built URL made production embed unbundled source.
export function createStage1EvaluationPool({
  size, context, signal = null, onProgress = () => {},
  workerFactory = () => new Worker(new URL("./stage1Evaluation.worker.js", import.meta.url), { type: "module" }),
  timeoutMs = 60000,
}) {
  const slots = [];
  const idle = [];
  const waiters = [];
  let stopped = false;
  let failure = null;
  let sequence = 0;
  const report = (event, slot, extra = {}) => onProgress({ event, workerIndex: slot?.index ?? null, ...extra });

  function stop(error = new Error("Stage 1 evaluation pool terminated")) {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener("abort", cancel);
    for (const slot of slots) {
      clearTimeout(slot.timer);
      try { slot.worker.terminate(); } catch { /* already terminated */ }
      slot.pending?.reject(error);
      slot.pending = null;
    }
    idle.length = 0;
    while (waiters.length) waiters.shift().reject(error);
  }
  function cancel() { stop(); }
  function fail(slot, reason) {
    if (stopped) return;
    failure = new Error(reason);
    report("worker_failure", slot, { error: reason, requestId: slot?.pending?.requestId ?? null });
    // Infrastructure failure invalidates this search, unlike an individually
    // non-assessable candidate. Settle every borrower and waiter immediately.
    stop(failure);
  }
  function arm(slot, phase) {
    clearTimeout(slot.timer);
    slot.timer = setTimeout(() => fail(slot, `Stage 1 evaluation worker ${phase} timed out`), timeoutMs);
  }
  function release(slot) {
    if (stopped) return;
    if (waiters.length) waiters.shift().resolve(slot);
    else idle.push(slot);
  }
  function acquire() {
    if (stopped) return Promise.reject(failure || new Error("Stage 1 evaluation pool terminated"));
    if (idle.length) return Promise.resolve(idle.shift());
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  }

  try {
    for (let i = 0; i < size; i += 1) {
      const slot = { index: i, worker: workerFactory(), pending: null, ready: false, timer: null };
      slots.push(slot);
      report("worker_created", slot);
      slot.worker.addEventListener("error", event => fail(slot, event?.message || "Stage 1 evaluation worker failed to load or execute"));
      slot.worker.addEventListener("messageerror", () => fail(slot, "Stage 1 evaluation worker message could not be decoded"));
      slot.worker.addEventListener("message", ({ data = {} }) => {
        if (stopped) return;
        if (!slot.ready) {
          if (data.requestId !== slot.initId) return;
          if (data.type !== "ready") { fail(slot, data.error || "Stage 1 evaluation worker initialisation failed"); return; }
          clearTimeout(slot.timer);
          slot.ready = true;
          report("worker_ready", slot);
          release(slot);
          return;
        }
        const entry = slot.pending;
        if (!entry || data.requestId !== entry.requestId) return;
        if (!["complete", "error"].includes(data.type)) return;
        clearTimeout(slot.timer);
        slot.pending = null;
        report("job_" + data.type, slot, { requestId: entry.requestId, error: data.error || null });
        release(slot);
        if (data.type === "complete") entry.resolve(data.result);
        else entry.reject(new Error(data.error || "Stage 1 candidate evaluation failed"));
      });
      slot.initId = `stage1-pool-init-${i}`;
      arm(slot, "initialisation");
      slot.worker.postMessage({ type: "init", requestId: slot.initId, context });
    }
  } catch (error) {
    fail(null, `Stage 1 evaluation worker dispatch failed: ${error?.message || error}`);
  }
  if (signal) {
    if (signal.aborted) cancel();
    else if (!stopped) signal.addEventListener("abort", cancel, { once: true });
  }

  async function evaluate(candidate) {
    const slot = await acquire();
    if (stopped) throw failure || new Error("Stage 1 evaluation pool terminated");
    return new Promise((resolve, reject) => {
      const requestId = `stage1-eval:${++sequence}`;
      slot.pending = { requestId, resolve, reject };
      arm(slot, "evaluation");
      report("job_posted", slot, { requestId });
      try { slot.worker.postMessage({ type: "evaluate", requestId, candidate }); }
      catch (error) { fail(slot, `Stage 1 evaluation dispatch failed: ${error?.message || error}`); }
    });
  }
  return {
    evaluate,
    terminateAll: stop,
    throwIfFailed() { if (failure) throw failure; },
    get size() { return stopped ? 0 : slots.length; },
  };
}
