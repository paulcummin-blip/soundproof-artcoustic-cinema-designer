// Preserve the canonical placement evaluator's terminal verdict at the V2 handoff.
// No geometry is reinterpreted and no acoustic evidence is manufactured here.
export function currentPlacementFailure(rawTransfer) {
  if (rawTransfer?.physicalRejection?.passed !== false) return null;
  const rejection = rawTransfer.physicalRejection;
  const reason = (rejection.violations || []).filter(Boolean).join(", ")
    || rejection.reason || "cabinet-boundary-violation";
  return {
    status: "error",
    code: "CURRENT_PLACEMENT_REJECTED",
    error: `Current subwoofer placement was rejected (${reason}). Check the saved subwoofer positions and room dimensions before re-testing.`,
    physicalRejection: rejection,
  };
}
