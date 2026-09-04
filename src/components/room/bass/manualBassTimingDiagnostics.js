// manualBassTimingDiagnostics.js
//
// Development-only bounded instrumentation for one manual Calculate Bass
// Performance request. Captures elapsed milliseconds for each lifecycle
// phase: request accepted, authoritative preparation start/complete,
// preparation failure/timeout, optimiser start/complete, final publication,
// and calculating state cleared.
//
// Console/debug-only. Never persisted to project data. Never accumulates
// history — each request creates a fresh trace.

const isDev = () => typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;

export function createManualBassTimingTrace(requestId, fingerprint) {
  const trace = {
    requestId,
    fingerprint,
    acceptedAtMs: null,
    authoritativeStartMs: null,
    authoritativeCompleteMs: null,
    preparationFailMs: null,
    preparationTimeoutMs: null,
    optimiserStartMs: null,
    optimiserCompleteMs: null,
    publicationMs: null,
    calculatingClearedMs: null,
    authoritativeDurationMs: null,
    optimiserDurationMs: null,
    totalDurationMs: null,
  };

  const mark = (key) => {
    trace[key] = performance.now();
    if (isDev()) {
      console.log("[manual-bass-timing]", key, {
        requestId,
        atMs: trace[key].toFixed(1),
      });
    }
  };

  const finish = () => {
    trace.totalDurationMs = performance.now() - (trace.acceptedAtMs || performance.now());
    if (trace.authoritativeCompleteMs && trace.authoritativeStartMs) {
      trace.authoritativeDurationMs = trace.authoritativeCompleteMs - trace.authoritativeStartMs;
    }
    if (trace.optimiserCompleteMs && trace.optimiserStartMs) {
      trace.optimiserDurationMs = trace.optimiserCompleteMs - trace.optimiserStartMs;
    }
    if (isDev()) {
      console.log("[manual-bass-timing]", "SUMMARY", {
        requestId,
        authoritativeMs: trace.authoritativeDurationMs?.toFixed(1),
        optimiserMs: trace.optimiserDurationMs?.toFixed(1),
        totalMs: trace.totalDurationMs?.toFixed(1),
      });
    }
    return trace;
  };

  return { trace, mark, finish };
}