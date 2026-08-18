import { formatBassParameterValue } from "@/components/room/bass/bassResultsPresentation";
import { isCompletedBassContract } from "@/components/room/bass/completedBassResultPersistence";

const levelLabel = (level) => level == null ? "—" : Number(level) === 0 ? "FAIL" : `L${Number(level)}`;

// C6.2D1: Resolve publication state from the completed bass authority object.
// Do NOT infer authority from structural contract completion — only
// authoritative === true AND canonicalMetricPublicationValid === true means verified.
function resolvePublicationState(completedBassAuthority) {
  const contract = completedBassAuthority?.contract || null;

  // No deterministic reason needed for structurally incomplete contracts
  if (!isCompletedBassContract(contract)) {
    return { contract, publicationVerified: false, publicationRejectionReason: null };
  }

  // C6.2D1A: Deterministic rejection reason with clear precedence.
  // Do not return null for an unverified structurally complete contract.
  let publicationRejectionReason = null;
  if (!completedBassAuthority || typeof completedBassAuthority !== "object") {
    publicationRejectionReason = "completed-authority-missing";
  } else if (completedBassAuthority.authoritative !== true) {
    publicationRejectionReason = "completed-authority-not-authoritative";
  } else if (!contract.metricPublication) {
    publicationRejectionReason = "metric-publication-receipt-missing";
  } else if (contract.metricPublication.canonicalMetricPublicationValid !== true) {
    publicationRejectionReason = contract.metricPublication.publicationRejectionReason || "metric-publication-not-verified";
  }

  return { contract, publicationVerified: publicationRejectionReason === null, publicationRejectionReason };
}

// C6.2D1: P14-specific fields from the corrected contract (Stage C6.2C1).
function buildP14Fields(parameter) {
  return {
    achievedCapabilityDb: Number.isFinite(parameter?.achievedCapabilityDb) ? parameter.achievedCapabilityDb : null,
    requestedTargetDb: Number.isFinite(parameter?.requestedTargetDb) ? parameter.requestedTargetDb : null,
    headroomOrShortfallDb: Number.isFinite(parameter?.headroomOrShortfallDb) ? parameter.headroomOrShortfallDb : null,
    achievedLevel: parameter?.achievedLevel ?? null,
    selectedLevel: parameter?.selectedLevel ?? null,
    pass: parameter?.pass ?? null,
    p14CapabilitySource: parameter?.p14CapabilitySource ?? null,
  };
}

function buildP18Fields(parameter) {
  return {
    designHz: Number.isFinite(parameter?.designHz) ? parameter.designHz : null,
    performanceBand: Number.isFinite(parameter?.performanceBand) ? parameter.performanceBand : null,
    performanceMultiplier: Number.isFinite(parameter?.performanceMultiplier) ? parameter.performanceMultiplier : null,
    qualifiedAtSelectedP14Output: parameter?.qualifiedAtSelectedP14Output !== false,
  };
}

export function formatAuthoritativeBassParameter(completedBassAuthority, key, errorMessage = null) {
  const { contract, publicationVerified, publicationRejectionReason } = resolvePublicationState(completedBassAuthority);
  const safeErrorMessage = typeof errorMessage === "string" && errorMessage.trim() ? errorMessage : null;

  if (!isCompletedBassContract(contract)) {
    return {
      key,
      valueText: safeErrorMessage ? "Bass analysis unavailable" : "—",
      level: "—",
      status: safeErrorMessage ? "error" : "uncalculated",
      isAuthoritative: false,
      publicationRejectionReason: null,
    };
  }

  const parameter = contract?.productAnalysis?.parameters?.[key];

  // C6.2D1A: P20 may return N/A when genuinely not applicable, before the publication gate.
  if (key === "p20" && parameter?.status === "not_applicable") {
    return { key, valueText: "N/A", level: "N/A", status: parameter.status, isAuthoritative: false, publicationRejectionReason: null };
  }

  // C6.2D1A: P14/P18/P19 — publication gate takes precedence over not_applicable.
  if (!publicationVerified) {
    const rawValue = Number.isFinite(Number(parameter?.value)) ? Number(parameter.value) : null;
    const result = {
      key,
      valueText: "NOT VERIFIED",
      level: "NOT VERIFIED",
      status: parameter?.status || "uncalculated",
      isAuthoritative: false,
      publicationRejectionReason,
      // Raw diagnostic values retained (not erased)
      rawValue,
      rawLevel: parameter?.level ?? null,
      detail: key === "p14" || key === "p18" ? parameter?.targetBasisDetail : null,
      targetBasis: key === "p14" || key === "p18" ? parameter?.targetBasis : null,
      targetBasisLabel: key === "p14" || key === "p18" ? (parameter?.targetBasis === "recommended" ? "Recommended" : "Minimum") : null,
    };
    if (key === "p14") Object.assign(result, buildP14Fields(parameter));
    if (key === "p18") Object.assign(result, buildP18Fields(parameter));
    return result;
  }

  // C6.2D1A: P14/P18/P19 — not_applicable only reachable when verified.
  if (parameter?.status === "not_applicable") {
    return { key, valueText: "N/A", level: "N/A", status: parameter.status, isAuthoritative: false, publicationRejectionReason: null };
  }

  // Verified: normal value and level presentation
  if (parameter?.status !== "complete" || parameter?.level == null || !Number.isFinite(Number(parameter?.value))) {
    return { key, valueText: "—", level: "—", status: parameter?.status || "uncalculated", isAuthoritative: true, publicationRejectionReason: null };
  }

  const result = {
    key,
    valueText: formatBassParameterValue(key, parameter.value),
    level: levelLabel(parameter.level),
    status: parameter.status,
    isAuthoritative: true,
    publicationRejectionReason: null,
    rawValue: Number(parameter.value),
    detail: key === "p14" || key === "p18" ? parameter.targetBasisDetail : null,
    targetBasis: key === "p14" || key === "p18" ? parameter.targetBasis : null,
    targetBasisLabel: key === "p14" || key === "p18" ? (parameter.targetBasis === "recommended" ? "Recommended" : "Minimum") : null,
  };
  if (key === "p14") {
    Object.assign(result, buildP14Fields(parameter));
    // P14 design operating point: when the selected target is achieved, the
    // design level is the selected level (RULE 1). Do not promote P14 above
    // the selected level due to unused SPL capability. Only when the target
    // cannot be achieved does the design level fall to the highest achievable
    // level (RULE 2). This feeds both the report level and the scoring rawValue.
    if (parameter.pass === true && parameter.selectedLevel != null) {
      result.level = levelLabel(parameter.selectedLevel);
      if (Number.isFinite(parameter.requestedTargetDb)) {
        result.rawValue = Number(parameter.requestedTargetDb);
        result.valueText = formatBassParameterValue(key, parameter.requestedTargetDb);
      }
    }
  }
  if (key === "p18") Object.assign(result, buildP18Fields(parameter));
  return result;
}

export function buildComplianceBassPresentation({ completedBassAuthority }, errorMessage = null) {
  const { contract, publicationVerified, publicationRejectionReason } = resolvePublicationState(completedBassAuthority);
  const safeErrorMessage = typeof errorMessage === "string" && errorMessage.trim()
    ? errorMessage
    : (typeof completedBassAuthority?.errorMessage === "string" && completedBassAuthority.errorMessage.trim()
      ? completedBassAuthority.errorMessage
      : null);
  const parameters = Object.fromEntries(["p14", "p18", "p19", "p20"].map((key) => [key, formatAuthoritativeBassParameter(completedBassAuthority, key, safeErrorMessage)]));
  return {
    completed: isCompletedBassContract(contract),
    publicationVerified,
    publicationRejectionReason,
    unavailable: !!safeErrorMessage,
    errorMessage: safeErrorMessage,
    resultFingerprint: contract?.job?.resultFingerprint || null,
    selectedCandidateId: contract?.selectedCandidateId || null,
    parameters,
    perSeatP20Results: Array.isArray(contract?.selectedCandidate?.perSeatP20Results) ? contract.selectedCandidate.perSeatP20Results : [],
  };
}

export function buildComplianceBassExportData({ completedBassAuthority }, errorMessage = null) {
  const presentation = buildComplianceBassPresentation({ completedBassAuthority }, errorMessage);
  // C6.2D1A: Removed unused destructured publication fields.
  return {
    ...presentation,
    // C6.2D1: When invalid, do not use the source label "completed-authoritative-bass-result".
    source: presentation.publicationVerified ? "completed-authoritative-bass-result" : "completed-bass-result-not-verified",
    authority: presentation.publicationVerified ? "VALID" : "NOT_VERIFIED",
    independentBassCalculation: false,
  };
}