import { useEffect, useRef } from 'react';

/**
 * Technical Report autoPrint state-machine diagnostics.
 *
 * Accepts a single immutable `autoPrintState` snapshot object. Logs every
 * field transition, emits a periodic wait report while preparing, patches
 * window.print to log when called, and identifies the first blocking
 * condition in the readiness chain.
 *
 * Instrumentation only — no gating logic, no side effects on the pipeline.
 */

// ── Helpers ─────────────────────────────────────────────────────────────

function ts() {
  const d = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function fmt(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  return JSON.stringify(v);
}

// Ordered readiness chain — first false flag is the blocking condition.
const CHAIN = [
  'autoPrintRequested',
  'reportReady',
  'designReviewHandoffReady',
  'analysisResultReady',
  'engineeringSummaryReady',
  'renderGatePassed',
  'autoPrintTriggered',
  'isPrinting',
  'planCaptureReady',
  'autoPrintDone',
];

/**
 * Logs a single AUTOPRINT BLOCKED line for an early return in the state machine.
 * Call this at every `return` in the autoPrint effect that exits without
 * progressing the pipeline.
 */
export function logAutoPrintBlock(reason, line) {
  console.log(`[AUTOPRINT] ${ts()} BLOCKED  Reason: ${reason}  Return: RP22Report.jsx line ${line}`);
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useAutoPrintReadinessInstrumentation(autoPrintState) {
  const prevRef = useRef({});
  const printPatchedRef = useRef(false);
  const windowPrintCalledRef = useRef(false);
  const summaryTimerRef = useRef(null);
  const stateRef = useRef(autoPrintState);

  // Keep latest snapshot in a ref for the periodic timer
  stateRef.current = autoPrintState;

  // ── 1. Log every transition ───────────────────────────────────────────
  useEffect(() => {
    const prev = prevRef.current;
    const now = autoPrintState;
    let changed = false;
    for (const key of Object.keys(now)) {
      if (prev[key] !== now[key]) {
        changed = true;
        console.log(`[AUTOPRINT] ${ts()} ${key}  ${fmt(prev[key])} → ${fmt(now[key])}`);
      }
    }
    if (changed) {
      prevRef.current = { ...now };
    }
  }, [autoPrintState]);

  // ── 2. Monkey-patch window.print ──────────────────────────────────────
  useEffect(() => {
    if (printPatchedRef.current) return;
    printPatchedRef.current = true;
    const orig = window.print.bind(window);
    window.print = function patchedPrint(...args) {
      windowPrintCalledRef.current = true;
      console.log(`[AUTOPRINT] ${ts()} window.print() called`);
      return orig.apply(this, args);
    };
    return () => {
      window.print = orig;
      printPatchedRef.current = false;
      windowPrintCalledRef.current = false;
    };
  }, []);

  // ── 3. Periodic wait report while preparing ───────────────────────────
  useEffect(() => {
    if (!autoPrintState.isAutoPrintPreparing) {
      if (summaryTimerRef.current) {
        clearInterval(summaryTimerRef.current);
        summaryTimerRef.current = null;
      }
      return;
    }

    const emit = () => {
      const snap = stateRef.current;
      const printCalled = windowPrintCalledRef.current;

      // Full snapshot
      console.log(`[AUTOPRINT] ${ts()} === SNAPSHOT ===`);
      for (const key of Object.keys(snap)) {
        console.log(`[AUTOPRINT]   ${key} = ${fmt(snap[key])}`);
      }

      // If window.print was already called, check why we're still preparing
      if (printCalled) {
        console.log(`[AUTOPRINT] ${ts()} window.print() was called — if still preparing, autoPrintDone was not set or isAutoPrintPreparing did not clear.`);
        return;
      }

      // Find first unmet prerequisite in the chain
      for (const key of CHAIN) {
        const val = snap[key];
        if (val === false) {
          console.log(`[AUTOPRINT] ${ts()} Waiting because: ${key} = false`);
          return;
        }
      }

      // The engineering summary is the sole positive-blocking authority gate.
      if (snap.authoritySummaryPending === true) {
        console.log(`[AUTOPRINT] ${ts()} Waiting because: authoritySummaryPending = true`);
        return;
      }

      // All chain flags true but window.print not called
      console.log(`[AUTOPRINT] ${ts()} All readiness gates passed. window.print() NOT invoked.`);
    };

    emit();
    summaryTimerRef.current = setInterval(emit, 3000);

    return () => {
      if (summaryTimerRef.current) {
        clearInterval(summaryTimerRef.current);
        summaryTimerRef.current = null;
      }
    };
  }, [autoPrintState.isAutoPrintPreparing]);
}