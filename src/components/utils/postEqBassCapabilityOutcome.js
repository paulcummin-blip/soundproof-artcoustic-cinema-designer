export function buildPostEqBassCapabilityOutcome({
  authority,
  requestedLevel,
  targetAnchorDb,
  scalarP14,
} = {}) {
  const fallbackRequested = Math.max(1, Math.min(4, Math.round(Number(requestedLevel) || 4)));
  const requestedLabel = authority?.requested?.level || `L${fallbackRequested}`;
  const requested = Number(requestedLabel.replace("L", "")) || fallbackRequested;
  const basis = authority?.selectedTargetBasis === "recommended" ? "recommended" : "minimum";
  const assessment = authority?.assessments?.[basis];
  const requestedResult = assessment?.levels?.[requestedLabel];
  const pairedComplete = requestedResult?.status && requestedResult.status !== "INCOMPLETE DATA";
  const achievedLevel = pairedComplete
    ? Number(authority?.achieved?.levelNumber ?? assessment?.achievedLevelNumber) || 0
    : Number(scalarP14?.level) || 0;
  const passesRequestedLevel = pairedComplete ? requestedResult.status === "PASS" : achievedLevel >= requested;
  const requestedTargetSplDb = Number.isFinite(Number(authority?.requested?.targetSplDb))
    ? Number(authority.requested.targetSplDb)
    : Number.isFinite(Number(targetAnchorDb)) ? Number(targetAnchorDb) : null;
  const limitation = passesRequestedLevel ? null : authority?.limitation || {
    primary: "output capability",
    shortfallDb: requestedResult?.shortfallDb ?? null,
    limitingParameter: "P14",
    reason: "Subwoofer output capability limited",
  };
  const achievedLabel = achievedLevel > 0 ? `L${achievedLevel}` : null;

  return {
    requested: { level: requestedLabel, targetSplDb: requestedTargetSplDb },
    achieved: { level: achievedLabel, p14: authority?.achieved?.p14 ?? null, p18: authority?.achieved?.p18 ?? null },
    limitation,
    shortfallDb: limitation?.shortfallDb ?? requestedResult?.shortfallDb ?? null,
    limitingParameter: limitation?.limitingParameter ?? null,
    limitingFrequency: requestedResult?.limitingFrequencyHz ?? null,
    requestedLevel: requested,
    requestedLevelLabel: requestedLabel,
    houseCurveTargetAnchorDb: requestedTargetSplDb,
    achievedP14Level: achievedLevel,
    achievedP14LevelLabel: achievedLabel || "FAIL",
    passesRequestedLevel,
    limitingFrequencyHz: requestedResult?.limitingFrequencyHz ?? null,
    maximumAvailableSplAfterEqDb: requestedResult?.worstCapabilityDb ?? scalarP14?.value ?? null,
    splShortfallDb: limitation?.shortfallDb ?? requestedResult?.shortfallDb ?? null,
    failureMessage: limitation ? `${requestedLabel} was not achieved; capability reached ${achievedLabel || "below L1"}.` : null,
    authorityComplete: !!pairedComplete,
    authoritySource: pairedComplete ? "position-aware-post-eq-capability" : "post-eq-product-capability-fallback",
  };
}