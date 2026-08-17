const finiteLevel = (value) => Number.isFinite(Number(value))
  ? Math.max(0, Math.min(4, Math.round(Number(value))))
  : null;

// P18 required-extension assessment from bassDesignPhilosophyAuthority.
// P14 is the only user-selected numbered target. P18 is independently graded
// from the achieved extension at that P14 operating level; this assessment only
// determines whether P18 reaches the selected basis' L1 floor.
export function buildPostEqBassCapabilityOutcome({
  authority, requestedLevel, targetAnchorDb, scalarP14,
  achievedP18Level, achievedP18FrequencyHz,
  achievedP19Level, achievedP19VariationDb,
  achievedP20Level, achievedP20VariationDb, p20Available = false,
  p18RequiredExtensionAssessment = null,
} = {}) {
  const fallbackRequested = Math.max(1, Math.min(4, Math.round(Number(requestedLevel) || 4)));
  const requestedLabel = authority?.requested?.level || `L${fallbackRequested}`;
  const requested = Number(requestedLabel.replace("L", "")) || fallbackRequested;
  const basis = authority?.selectedTargetBasis === "recommended" ? "recommended" : "minimum";
  const assessment = authority?.assessments?.[basis];
  const requestedResult = assessment?.levels?.[requestedLabel];
  const pairedComplete = requestedResult?.status && requestedResult.status !== "INCOMPLETE DATA";
  const scalarComplete = Number.isFinite(Number(scalarP14?.value));
  const authorityAchievedValue = authority?.achieved?.levelNumber
    ?? (authority?.achieved?.level ? Number(String(authority.achieved.level).replace("L", "")) : null)
    ?? scalarP14?.level;
  const p14Level = authorityAchievedValue == null ? 0 : finiteLevel(authorityAchievedValue) ?? 0;
  const p18RequiredPass = p18RequiredExtensionAssessment?.passes;
  const independentP18Level = finiteLevel(achievedP18Level) ?? 0;
  const p18Pass = p18RequiredPass != null ? p18RequiredPass : independentP18Level >= 1;
  const parameterLevels = {
    P14: finiteLevel(p14Level),
    P18: independentP18Level,
    P19: finiteLevel(achievedP19Level),
    ...(p20Available ? { P20: finiteLevel(achievedP20Level) } : {}),
  };
  const achievedLevel = p14Level;
  const p14Failed = achievedLevel < requested;
  const p18Failed = !p18Pass;
  const failedParameter = p14Failed ? "P14" : (p18Failed ? "P18" : null);
  const passesRequestedLevel = !p14Failed && !p18Failed;
  const requestedTargetSplDb = Number.isFinite(Number(authority?.requested?.targetSplDb))
    ? Number(authority.requested.targetSplDb)
    : Number.isFinite(Number(targetAnchorDb)) ? Number(targetAnchorDb) : null;
  const limitation = passesRequestedLevel ? null : {
    primary: failedParameter === "P14" ? "Subwoofer output capability"
      : failedParameter === "P18" ? "Low-frequency extension at selected operating level"
      : `${failedParameter || "Bass"} performance at requested target`,
    shortfallDb: failedParameter === "P14"
      ? authority?.limitation?.shortfallDb ?? requestedResult?.shortfallDb
        ?? (Number.isFinite(requestedTargetSplDb) && scalarComplete ? Math.max(0, requestedTargetSplDb - Number(scalarP14.value)) : null)
      : failedParameter === "P18" && p18RequiredExtensionAssessment
        ? (Number.isFinite(p18RequiredExtensionAssessment.shortfallHz) ? Math.abs(p18RequiredExtensionAssessment.shortfallHz) : null)
        : null,
    limitingParameter: failedParameter,
    limitingFrequency: failedParameter === "P14" ? requestedResult?.limitingFrequencyHz ?? scalarP14?.limitingFrequency ?? null
      : failedParameter === "P18" && p18RequiredExtensionAssessment
        ? p18RequiredExtensionAssessment.achievedExtensionHz ?? achievedP18FrequencyHz ?? null
        : (failedParameter === "P18" && Number.isFinite(achievedP18FrequencyHz) ? achievedP18FrequencyHz : null),
    reason: failedParameter === "P14" ? "Subwoofer output capability limited"
      : failedParameter === "P18" ? `System does not maintain the selected operating level down to ${p18RequiredExtensionAssessment?.requiredExtensionHz ?? "the required"} Hz.`
      : `${failedParameter || "Bass performance"} does not maintain the requested ${requestedLabel} target.`,
  };
  const achievedLabel = achievedLevel > 0 ? `L${achievedLevel}` : null;

  return {
    requested: { level: requestedLabel, targetSplDb: requestedTargetSplDb, targetBasis: basis },
    achieved: {
      level: achievedLabel,
      p14: authority?.achieved?.p14 ?? (scalarComplete ? {
        capabilityDb: Number(scalarP14.value),
        minimumLevel: finiteLevel(scalarP14.minimumLevel),
        recommendedLevel: finiteLevel(scalarP14.recommendedLevel),
        limitingFrequencyHz: scalarP14.limitingFrequency ?? null,
        headroomConsumedByEqDb: scalarP14.headroomConsumedByEqDb ?? null,
      } : null),
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
    failureMessage: p14Failed
      ? `${requestedLabel} P14 output was not achieved; P14 capability reached ${achievedLabel || "below L1"}.`
      : p18Failed
        ? `P14 output achieved at ${requestedLabel}; P18 did not reach the selected basis' Level 1 boundary at that operating level.`
        : null,
    authorityComplete: !!pairedComplete || scalarComplete,
    authoritySource: pairedComplete ? "position-aware-post-eq-design-authority" : "post-eq-product-capability-authority",
    p18RequiredExtensionAssessment: p18RequiredExtensionAssessment || null,
    p14Pass: !p14Failed,
    p18Pass: !p18Failed,
  };
}