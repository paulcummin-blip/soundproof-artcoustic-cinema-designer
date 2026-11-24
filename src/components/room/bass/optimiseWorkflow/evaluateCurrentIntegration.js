import { evaluateStage2Confirmation, buildSeatPriorityMap } from "../stage2/stage2CanonicalEvaluation";

// Read the actual, committed integration response through the existing ADI
// confirmation authority. This never changes or republishes ordinary bass.
export function evaluateCurrentIntegration(authoritative) {
  const a = authoritative;
  if (!a?.combinedSystem?.available || a.status !== "ready") return null;
  const req = a.requested;
  return evaluateStage2Confirmation({
    rspRawCurve: a.combinedSystem.combinedBySeat.rsp,
    perSeatRawCurves: a.seatingPositions.map(s => ({seatId:s.id,
      isPrimary:s.priority === "primary", responseData:a.combinedSystem.combinedBySeat[s.id] || []})),
    sources:a.sources, usableLfHz:a.designEqSystemLimits.usableLfHz,
    transitionHz:a.optimisationTransitionHz, seatPriorityMap:[...buildSeatPriorityMap(a.seatingPositions)],
    perSourceRspComplexTransfers:a.perSourceRspComplexTransfers,
    cancellationComplexTransfers:a.combinedSystem.rspComplexTransfers,
    integrationTransfers:a.integrationTransfers, crossover:a.crossover,
  }, {p14TargetBasis:req.p14TargetBasis, p14TargetLevel:req.requestedLevel,
    p14TargetDb:req.selectedP14TargetDb, p18TargetBasis:req.p18TargetBasis});
}
