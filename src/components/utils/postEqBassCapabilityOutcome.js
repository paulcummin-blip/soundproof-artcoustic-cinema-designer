const finiteLevel = (value) => Number.isFinite(Number(value))
  ? Math.max(0, Math.min(4, Math.round(Number(value))))
  : null;

export function buildPostEqBassCapabilityOutcome({
  authority, requestedLevel, targetAnchorDb, scalarP14,
  achievedP18Level, achievedP18FrequencyHz,
  achievedP19Level, achievedP19VariationDb,
  achievedP20Level, achievedP20VariationDb, p20Available = false,
} = {}) {
  const fallbackRequested = Math.max(1, Math.min(4, Math.round(Number(requestedLevel) || 4)));
  const requestedLabel = authority?.requested?.level || `L${fallbackRequested}`;
  const requested = Number(requestedLabel.replace("L", "")) || fallbackRequested;
  const basis = authority?.selectedTargetBasis === "recommended" ? "recommended" : "minimum";
  const assessment = authority?.assessments?.[basis];
  const requestedResult = assessment?.levels?.[requestedLabel];
  const pairedComplete = requestedResult?.status && requestedResult.status !== "INCOMPLETE DATA";
  const p14Level = pairedComplete
    ? Number(authority?.achieved?.levelNumber ?? assessment?.achievedLevelNumber) || 0
    : Number(scalarP14?.level) || 0;
  const parameterLevels = {
    P14: finiteLevel(p14Level), P18: finiteLevel(achievedP18Level), P19: finiteLevel(achievedP19Level),
    ...(p20Available ? { P20: finiteLevel(achievedP20Level) } : {}),
  };
  const completeLevels = Object.values(parameterLevels).filter(Number.isFinite);
  const achievedLevel = completeLevels.length ? Math.min(...completeLevels) : p14Level;
  const failedParameter = ["P14", "P18", "P19", "P20"]
    .find((key) => Number.isFinite(parameterLevels[key]) && parameterLevels[key] < requested) || null;
  const passesRequestedLevel = !failedParameter && (pairedComplete ? requestedResult.status === "PASS" : achievedLevel >= requested);
  const requestedTargetSplDb = Number.isFinite(Number(authority?.requested?.targetSplDb))
    ? Number(authority.requested.targetSplDb)
    : Number.isFinite(Number(targetAnchorDb)) ? Number(targetAnchorDb) : null;
  const limitation = passesRequestedLevel ? null : {
    primary: failedParameter === "P14" ? "Subwoofer output capability" : `${failedParameter || "Bass"} performance at requested target`,
    shortfallDb: failedParameter === "P14" ? authority?.limitation?.shortfallDb ?? requestedResult?.shortfallDb ?? null : null,
    limitingParameter: failedParameter,
    limitingFrequency: failedParameter === "P14" ? requestedResult?.limitingFrequencyHz ?? null
      : failedParameter === "P18" && Number.isFinite(achievedP18FrequencyHz) ? achievedP18FrequencyHz : null,
    reason: failedParameter === "P14" ? "Subwoofer output capability limited"
      : `${failedParameter || "Bass performance"} does not maintain the requested ${requestedLabel} target.`,
  };
  const achievedLabel = achievedLevel > 0 ? `L${achievedLevel}` : null;

  return {
    requested: { level: requestedLabel, targetSplDb: requestedTargetSplDb },
    achieved: {
      level: achievedLabel,
      p14: authority?.achieved?.p14 ?? null,
      p18: { level: finiteLevel(achievedP18Level), extensionHz: Number.isFinite(achievedP18FrequencyHz) ? achievedP18FrequencyHz : null },
      p19: { level: finiteLevel(achievedP19Level), variationDb: Number.isFinite(achievedP19VariationDb) ? achievedP19VariationDb : null },
      p20: p20Available ? { level: finiteLevel(achievedP20Level), variationDb: Number.isFinite(achievedP20VariationDb) ? achievedP20VariationDb : null } : null,
    },
    limitation,
    shortfallDb: limitation?.shortfallDb ?? null,
    limitingParameter: limitation?.limitingParameter ?? null,
    limitingFrequency: limitation?.limitingFrequency ?? null,
    requestedLevel: requested,
    requestedLevelLabel: requestedLabel,
    houseCurveTargetAnchorDb: requestedTargetSplDb,
    achievedP14Level: p14Level,
    achievedP14LevelLabel: p14Level > 0 ? `L${p14Level}` : "FAIL",
    achievedOverallLevel: achievedLevel,
    achievedOverallLevelLabel: achievedLabel || "FAIL",
    parameterLevels,
    passesRequestedLevel,
    limitingFrequencyHz: limitation?.limitingFrequency ?? null,
    maximumAvailableSplAfterEqDb: requestedResult?.worstCapabilityDb ?? scalarP14?.value ?? null,
    splShortfallDb: limitation?.shortfallDb ?? null,
    failureMessage: limitation ? `${requestedLabel} was not achieved; overall capability reached ${achievedLabel || "below L1"}.` : null,
    authorityComplete: !!pairedComplete,
    authoritySource: pairedComplete ? "position-aware-post-eq-design-authority" : "post-eq-product-capability-fallback",
  };
}