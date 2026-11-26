import { evaluateStage2Confirmation, buildSeatPriorityMap } from "../stage2/stage2CanonicalEvaluation";

// Read the actual, committed integration response through the existing ADI
// confirmation authority. This never changes or republishes ordinary bass.
export function evaluateCurrentIntegration(authoritative, correctabilityAssessment = null) {
  const a = authoritative;
  // Completing publication clears the manual request, which returns status to
  // idle. The simulation's identity-checked completion signal remains true.
  // Never assess an incomplete or superseded simulation merely because curves exist.
  if (!a?.simulationReady || !a?.combinedSystem?.available ||
      !["ready", "idle"].includes(a.status)) return null;
  const req = a.requested;
  return evaluateStage2Confirmation({
    rspRawCurve: a.combinedSystem.combinedBySeat.rsp,
    perSeatRawCurves: a.seatingPositions.map(s => ({seatId:s.id,
      isPrimary:s.priority !== "secondary", responseData:a.combinedSystem.combinedBySeat[s.id] || []})),
    sources:a.sources, usableLfHz:a.designEqSystemLimits.usableLfHz,
    transitionHz:a.optimisationTransitionHz, seatPriorityMap:[...buildSeatPriorityMap(a.seatingPositions)],
    perSourceRspComplexTransfers:a.perSourceRspComplexTransfers,
    cancellationComplexTransfers:a.combinedSystem.rspComplexTransfers,
    integrationTransfers:a.integrationTransfers, crossover:a.crossover,
  }, {p14TargetBasis:req.p14TargetBasis, p14TargetLevel:req.requestedLevel,
    p14TargetDb:req.selectedP14TargetDb, p18TargetBasis:req.p18TargetBasis, correctabilityAssessment});
}

