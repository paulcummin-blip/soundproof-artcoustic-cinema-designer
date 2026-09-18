import { useEffect, useRef } from 'react';

/**
 * Forensic instrumentation for the Technical Report autoPrint readiness chain.
 *
 * Logs every change to each prerequisite flag with timestamp, old value, and
 * new value. Patches window.print to log when it is called. While
 * isAutoPrintPreparing is true, emits a periodic summary that identifies the
 * first blocking false flag — the one the pipeline is "waiting forever because"
 * of.
 *
 * This is instrumentation only. No gating logic, no side effects on the print
 * pipeline. Pure console logging for diagnosis.
 */

const FLAG_KEYS = [
  'autoPrintRequested',
  'reportReady',
  'completedBassAuthorityReady',
  'designRatingReady',
  'recommendationsReady',
  'analysisResultReady',
  'renderGatePassed',
  'autoPrintTriggered',
  'isPrinting',
  'planCaptureReady',
  'printReady',
  'isAutoPrintPreparing',
  'windowPrintCalled',
  'autoPrintDone',
  'hasPrintedOnce',
];

function ts() {
  return new Date().toISOString();
}

function fmt(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  return JSON.stringify(v);
}

export function useAutoPrintReadinessInstrumentation({
  autoPrintRequested,
  explicitProjectId,
  reportHydrating,
  reportReadyProjectId,
  bassReportPending,
  completedBassAuthority,
  isPrinting,
  printReady,
  hasPrintedOnce,
  autoPrintDone,
  autoPrintTriggeredRef,
  planImageDataUrl,
  planDimsImageDataUrl,
  planSpeakerDimsImageDataUrl,
  roomDesignRating,
  designRecommendations,
  analysisResult,
  showLoadingReport,
}) {
  const prevRef = useRef({});
  const printPatchedRef = useRef(false);
  const windowPrintCalledRef = useRef(false);
  const summaryTimerRef = useRef(null);

  // Compute current readiness flags
  const flags = {
    autoPrintRequested: !!autoPrintRequested,
    reportReady:
      !reportHydrating &&
      !!explicitProjectId &&
      reportReadyProjectId === explicitProjectId,
    completedBassAuthorityReady: !bassReportPending,
    designRatingReady: roomDesignRating != null,
    recommendationsReady: designRecommendations != null,
    analysisResultReady: !!analysisResult && !!analysisResult.gradedParameters,
    renderGatePassed:
      !!analysisResult &&
      !!analysisResult.gradedParameters &&
      !showLoadingReport,
    autoPrintTriggered: !!autoPrintTriggeredRef?.current,
    isPrinting: !!isPrinting,
    planCaptureReady:
      planImageDataUrl !== null &&
      planDimsImageDataUrl !== null &&
      planSpeakerDimsImageDataUrl !== null,
    printReady: !!printReady,
    isAutoPrintPreparing: !!autoPrintRequested && !autoPrintDone,
    windowPrintCalled: windowPrintCalledRef.current,
    autoPrintDone: !!autoPrintDone,
    hasPrintedOnce: !!hasPrintedOnce,
  };

  // Diff and log every flag change
  useEffect(() => {
    const prev = prevRef.current;
    let changed = false;
    for (const key of FLAG_KEYS) {
      const oldVal = prev[key];
      const newVal = flags[key];
      if (oldVal !== newVal) {
        changed = true;
        console.log(
          `[AUTOPRINT-READINESS] ${ts()} ${key}: ${fmt(oldVal)} → ${fmt(newVal)}`
        );
      }
    }
    if (changed) {
      prevRef.current = { ...flags };
    }
  }, [
    autoPrintRequested,
    reportHydrating,
    explicitProjectId,
    reportReadyProjectId,
    bassReportPending,
    completedBassAuthority,
    isPrinting,
    printReady,
    hasPrintedOnce,
    autoPrintDone,
    planImageDataUrl,
    planDimsImageDataUrl,
    planSpeakerDimsImageDataUrl,
    roomDesignRating,
    designRecommendations,
    analysisResult,
    showLoadingReport,
  ]);

  // Patch window.print to log when it is called
  useEffect(() => {
    if (printPatchedRef.current) return;
    printPatchedRef.current = true;
    const orig = window.print.bind(window);
    window.print = function patchedPrint(...args) {
      windowPrintCalledRef.current = true;
      console.log(
        `[AUTOPRINT-READINESS] ${ts()} window.print() CALLED`
      );
      // Also update prevRef so the next diff picks it up
      prevRef.current = { ...prevRef.current, windowPrintCalled: true };
      return orig.apply(this, args);
    };
    return () => {
      window.print = orig;
      printPatchedRef.current = false;
      windowPrintCalledRef.current = false;
    };
  }, []);

  // Periodic "waiting forever because" diagnostic while preparing
  useEffect(() => {
    if (!flags.isAutoPrintPreparing) {
      if (summaryTimerRef.current) {
        clearInterval(summaryTimerRef.current);
        summaryTimerRef.current = null;
      }
      return;
    }

    // Emit immediately
    emitWaitingDiagnostic(flags);

    summaryTimerRef.current = setInterval(() => {
      // Re-read windowPrintCalledRef for the freshest value
      const liveFlags = { ...flags, windowPrintCalled: windowPrintCalledRef.current };
      emitWaitingDiagnostic(liveFlags);
    }, 3000);

    return () => {
      if (summaryTimerRef.current) {
        clearInterval(summaryTimerRef.current);
        summaryTimerRef.current = null;
      }
    };
  }, [
    flags.isAutoPrintPreparing,
    flags.reportReady,
    flags.completedBassAuthorityReady,
    flags.designRatingReady,
    flags.recommendationsReady,
    flags.analysisResultReady,
    flags.renderGatePassed,
    flags.autoPrintTriggered,
    flags.isPrinting,
    flags.planCaptureReady,
    flags.printReady,
    flags.autoPrintDone,
    flags.hasPrintedOnce,
  ]);
}

/**
 * Identifies the first blocking false flag in the autoPrint readiness chain
 * and logs a single "Waiting forever because: X = false" line.
 *
 * The chain order mirrors the pipeline:
 *   autoPrintRequested → reportReady → completedBassAuthorityReady →
 *   analysisResultReady → renderGatePassed → autoPrintTriggered →
 *   isPrinting → planCaptureReady → printReady → windowPrintCalled
 *
 * If all flags are true but windowPrintCalled is false, logs why print was
 * not called (printLockRef / hasPrintedOnce guards).
 */
function emitWaitingDiagnostic(flags) {
  const chain = [
    ['autoPrintRequested', flags.autoPrintRequested],
    ['reportReady', flags.reportReady],
    ['completedBassAuthorityReady', flags.completedBassAuthorityReady],
    ['analysisResultReady', flags.analysisResultReady],
    ['renderGatePassed', flags.renderGatePassed],
    ['autoPrintTriggered', flags.autoPrintTriggered],
    ['isPrinting', flags.isPrinting],
    ['planCaptureReady', flags.planCaptureReady],
    ['printReady', flags.printReady],
    ['windowPrintCalled', flags.windowPrintCalled],
  ];

  console.log(`[AUTOPRINT-READINESS] ${ts()} === READINESS SNAPSHOT ===`);
  for (const [key, val] of chain) {
    console.log(`[AUTOPRINT-READINESS]   ${key} = ${fmt(val)}`);
  }

  // If window.print was called but isAutoPrintPreparing is still true,
  // the issue is that autoPrintDone was never set or isAutoPrintPreparing
  // was never cleared.
  if (flags.windowPrintCalled) {
    if (!flags.autoPrintDone) {
      console.log(
        `[AUTOPRINT-READINESS] ${ts()} Waiting forever because: autoPrintDone = false (window.print was called but autoPrintDone was never set — check setAutoPrintDone in the print trigger effect)`
      );
    } else {
      console.log(
        `[AUTOPRINT-READINESS] ${ts()} window.print() was called and autoPrintDone=true — isAutoPrintPreparing should clear on next render. If still showing preparation screen, check the isAutoPrintPreparing derivation.`
      );
    }
    return;
  }

  // Find the first false flag in the chain
  for (const [key, val] of chain) {
    if (!val) {
      console.log(
        `[AUTOPRINT-READINESS] ${ts()} Waiting forever because: ${key} = false`
      );
      return;
    }
  }

  // All chain flags true but window.print still not called
  console.log(
    `[AUTOPRINT-READINESS] ${ts()} All readiness flags are true but window.print() was not called — check printLockRef.current, hasPrintedOnce guard, or the setTimeout(250) in the print trigger effect`
  );
}