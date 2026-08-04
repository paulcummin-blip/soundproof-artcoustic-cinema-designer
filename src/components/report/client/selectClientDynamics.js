/**
 * selectClientDynamics
 * --------------------
 * Pure selector for the Dynamics pillar (P12, P13, P14).
 *
 * P12 and P13 come directly from analysisResult.gradedParameters.primary.
 * P14 comes directly through the existing bass presentation authority fields.
 *
 * Exposes required, predicted/capability, and headroom ONLY where canonically
 * present. If canonical headroom is absent, returns null — never invents
 * subtraction or threshold computation.
 *
 * @param {Object} analysisResult - from useRP22AnalysisEngine
 * @param {Object} bassPresentation - from buildComplianceBassPresentation
 * @returns {Object} { p12, p13, p14 }
 */
export function selectClientDynamics(analysisResult, bassPresentation) {
  const primary = analysisResult?.gradedParameters?.primary || {};
  const p12Raw = primary[12] || null;
  const p13Raw = primary[13] || null;
  const p14Raw = bassPresentation?.parameters?.p14 || null;

  return {
    p12: normalizeRoomParam(p12Raw),
    p13: normalizeRoomParam(p13Raw),
    p14: p14Raw
      ? {
          valueText: p14Raw.valueText ?? null,
          level: p14Raw.level ?? null,
          status: p14Raw.status ?? null,
          isAuthoritative: p14Raw.isAuthoritative ?? false,
          // Canonically present P14 fields (from buildP14Fields)
          achievedCapabilityDb: p14Raw.achievedCapabilityDb ?? null,
          requestedTargetDb: p14Raw.requestedTargetDb ?? null,
          headroomOrShortfallDb: p14Raw.headroomOrShortfallDb ?? null,
          achievedLevel: p14Raw.achievedLevel ?? null,
          selectedLevel: p14Raw.selectedLevel ?? null,
          pass: p14Raw.pass ?? null,
          targetBasis: p14Raw.targetBasis ?? null,
          targetBasisLabel: p14Raw.targetBasisLabel ?? null,
        }
      : null,
  };
}

function normalizeRoomParam(raw) {
  if (!raw) return null;
  return {
    value: raw.value ?? null,
    formatted: raw.formatted ?? null,
    level: raw.level ?? null,
    status: raw.status ?? null,
  };
}