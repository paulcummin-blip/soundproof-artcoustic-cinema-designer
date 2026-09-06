// improveBassV2WorkerLifecycle.js
// V2 worker call lifecycle: cancellation, per-call watchdog, single-settlement.
//
// Reuses STAGE2_WORKER_TIMEOUT_MS from Stage 2 — no second V2-specific timeout
// constant. The semantics are identical: one worker operation has exceeded the
// allowed execution time.
//
// Settles from exactly one of:
//   1. worker message (complete or worker-reported error)
//   2. abort signal (user cancellation or whole-run timeout)
//   3. per-call watchdog timeout
//
// The single-settlement guard ensures only the first event can resolve/reject.
// Cleanup (timer clear, listener removal) occurs exactly once.

import { STAGE2_WORKER_TIMEOUT_MS } from "../stage2/stage2Constants.js";

// ---------------------------------------------------------------------------
// Typed errors for distinct terminal classification
// ---------------------------------------------------------------------------

/** User cancellation. name = "AbortError" so the engine can classify as cancelled. */
export class V2AbortError extends Error {
  constructor(message = "V2 run aborted") {
    super(message);
    this.name = "AbortError";
  }
}

/** Per-call worker watchdog timeout. name = "TimeoutError". */
export class V2TimeoutError extends Error {
  constructor(message = "V2 worker call timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Whole-run elapsed limit exceeded. name = "V2RunTimeoutError". */
export class V2RunTimeoutError extends Error {
  constructor(message = "V2 whole-run elapsed limit exceeded") {
    super(message);
    this.name = "V2RunTimeoutError";
  }
}

/**
 * Returns true if the error is a fatal lifecycle error that must propagate
 * (user cancellation, per-call timeout, whole-run timeout). Genuine
 * candidate-specific evaluation failures return false and may be swallowed
 * by per-call catch blocks to preserve existing recoverable behaviour.
 */
export function isFatalLifecycleError(err) {
  return err?.name === "AbortError"
    || err?.name === "TimeoutError"
    || err?.name === "V2RunTimeoutError";
}

// ---------------------------------------------------------------------------
// runInWorker — single worker call with cancellation + timeout + single-settle
// ---------------------------------------------------------------------------

/**
 * Run a single V2 worker call with cancellation, per-call watchdog, and
 * single-settlement guarantee.
 *
 * @param {Worker} worker - The V2 worker (single sequential worker)
 * @param {string} phase - "placement" | "confirmation"
 * @param {object} params - Parameters to postMessage to the worker
 * @param {AbortSignal} [signal] - Abort signal for cancellation / whole-run timeout
 * @param {object} [opts] - Optional: { timeoutMs }
 * @returns {Promise} Resolves with worker result, rejects with a typed error.
 */
export function runInWorker(worker, phase, params, signal, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? STAGE2_WORKER_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    let watchdog = null;
    const requestId = `${phase}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    // ── Single-settlement cleanup authority ──────────────────────────────
    // Called exactly once from settle(). Removes all listeners and clears
    // the watchdog timer. Any later event (message, error, abort, timeout)
    // finds settled === true and does nothing.
    function cleanup() {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (signal) signal.removeEventListener("abort", onAbort);
    }

    function settle(fn, value) {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    }

    // ── Terminal event handlers ───────────────────────────────────────────

    function onMessage(event) {
      const data = event.data || {};
      if (data.requestId !== requestId) return;
      if (data.type === "complete") {
        settle(resolve, data.result);
      } else {
        settle(reject, new Error(data.error || data.errorMessage || "Worker failed"));
      }
    }

    function onError() {
      // Worker onerror — uncaught error inside the worker. This is a generic
      // worker failure (not a lifecycle error), so per-call catch blocks may
      // swallow it to preserve existing recoverable behaviour.
      settle(reject, new Error("Worker error"));
    }

    function onAbort() {
      // Terminate the worker immediately — the worker performs synchronous
      // CPU-bound evaluation and cannot be interrupted internally. terminate()
      // is the only primitive that actually stops it.
      try {
        worker.terminate();
      } catch {
        /* ignore — already terminated */
      }
      // Classify by abort reason: V2RunTimeoutError → whole-run timeout;
      // everything else → user cancellation (V2AbortError).
      const reason = signal?.reason;
      if (reason instanceof V2RunTimeoutError) {
        settle(reject, reason);
      } else {
        settle(reject, new V2AbortError(
          typeof reason?.message === "string" ? reason.message : "V2 run aborted",
        ));
      }
    }

    function onTimeout() {
      // Per-call watchdog — one worker operation exceeded the allowed time.
      // Terminate the worker and reject with V2TimeoutError. Because V2 uses
      // one sequential worker, a per-call timeout is fatal to the V2 run.
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
      settle(reject, new V2TimeoutError(`V2 worker ${phase} exceeded ${timeoutMs}ms`));
    }

    // ── Pre-check: signal already aborted before the call starts ──────────
    if (signal?.aborted) {
      onAbort();
      return;
    }

    // ── Register listeners + start watchdog + post message ────────────────
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    if (signal) signal.addEventListener("abort", onAbort);
    watchdog = setTimeout(onTimeout, timeoutMs);

    worker.postMessage({ requestId, phase, ...params });
  });
}