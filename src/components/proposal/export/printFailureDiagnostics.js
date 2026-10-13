/** Only timings, stage names, resource states and numeric geometry. */
export function printFailureDiagnostics(error, trace) {
  const latestStarted = trace.marks.filter((mark) => mark.phase === 'started').at(-1)?.operation;
  return {
    kind: 'print_readiness', measurementsAttempted: 0, lastTwoDimensions: [],
    dimensionsChanged: null, pageCount: null, fontReadiness: 'not_checked',
    imageReadiness: 'not_checked', domStillChanging: null, conditionNotMet: 'stage_failed',
    ...error?.readinessDiagnostics,
    blockingStage: error?.readinessDiagnostics?.blockingStage || error?.exportBlockedBy || trace.blockedBy || latestStarted,
    lastCompletedStage: trace.marks.filter((mark) => mark.phase === 'completed').at(-1)?.operation ?? null,
    totalPreparationMs: trace.totalMs,
  };
}