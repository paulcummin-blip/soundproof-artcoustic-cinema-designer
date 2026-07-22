export function retargetCandidateForRequest(candidate, request) {
  const requestedToleranceDb = request.p19.p19ToleranceDb;
  const diagnostics = Array.isArray(candidate.designEqWorstResidualDiagnostics)
    ? candidate.designEqWorstResidualDiagnostics.map((diag) => {
        const requiredBoostToP19ToleranceDb = diag.signedResidualDb < 0
          ? Math.max(0, Math.abs(diag.signedResidualDb) - requestedToleranceDb)
          : 0;
        return {
          ...diag,
          requiredBoostToP19ToleranceDb,
          p19ToleranceCapabilityLimited: diag.signedResidualDb < 0
            && requiredBoostToP19ToleranceDb > diag.remainingPointBoostDb,
        };
      })
    : candidate.designEqWorstResidualDiagnostics;
  const meetsRequestedEnvelope = candidate.achievedP14Level >= request.p14.value
    && candidate.achievedP18Level >= request.p18.value
    && candidate.achievedP19Level >= request.p19.value;
  const rejectionReason = [
    candidate.achievedP14Level < request.p14.value && `P14 ${candidate.p14TargetBasis === "recommended" ? "Recommended" : "Minimum"} target not maintained after EQ headroom`,
    candidate.achievedP18Level < request.p18.value && `P18 extension does not reach the requested ${request.p18.p18LimitHz} Hz boundary`,
    candidate.achievedP19Level < request.p19.value && `P19 variation exceeds ±${requestedToleranceDb} dB between ${candidate.assessmentStartHz}–${candidate.assessmentEndHz} Hz`,
  ].filter(Boolean).join("; ");
  return {
    ...candidate,
    requestedP14Level: request.p14.level,
    requestedP18Level: request.p18.level,
    requestedP19Level: request.p19.level,
    requestedTargetSpl: candidate.requestedTargetSpl,
    requestedP19ToleranceDb: requestedToleranceDb,
    designEqWorstResidualDiagnostics: diagnostics,
    meetsRequestedEnvelope,
    rejectionReason,
  };
}