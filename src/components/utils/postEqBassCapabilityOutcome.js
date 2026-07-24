export function buildPostEqBassCapabilityOutcome({
  authority,
  requestedLevel,
  targetAnchorDb,
  scalarP14,
} = {}) {
  const requested = Math.max(1, Math.min(4, Math.round(Number(requestedLevel) || 4)));
  const basis = authority?.selectedTargetBasis === "recommended" ? "recommended" : "minimum";
  const assessment = authority?.assessments?.[basis];
  const requestedResult = assessment?.levels?.[`L${requested}`];
  const pairedComplete = requestedResult?.status && requestedResult.status !== "INCOMPLETE DATA";
  const achievedLevel = pairedComplete
    ? Number(assessment?.winningLevelNumber) || 0
    : Number(scalarP14?.level) || 0;
  const passesRequestedLevel = pairedComplete
    ? requestedResult.status === "PASS"
    : achievedLevel >= requested;
  const limitation = passesRequestedLevel
    ? null
    : "Insufficient low-frequency output capability.";

  return {
    requestedLevel: requested,
    requestedLevelLabel: `L${requested}`,
    houseCurveTargetAnchorDb: Number.isFinite(Number(targetAnchorDb)) ? Number(targetAnchorDb) : null,
    achievedP14Level: achievedLevel,
    achievedP14LevelLabel: achievedLevel > 0 ? `L${achievedLevel}` : "FAIL",
    passesRequestedLevel,
    limitingFrequencyHz: requestedResult?.limitingFrequencyHz ?? null,
    maximumAvailableSplAfterEqDb: requestedResult?.worstCapabilityDb ?? scalarP14?.value ?? null,
    splShortfallDb: requestedResult?.shortfallDb ?? null,
    limitation,
    recommendation: limitation
      ? "Increase subwoofer quantity or use higher-output subwoofers."
      : "Selected subwoofer system supports the requested bass target.",
    authorityComplete: !!pairedComplete,
    authoritySource: pairedComplete ? "position-aware-post-eq-capability" : "post-eq-product-capability-fallback",
  };
}