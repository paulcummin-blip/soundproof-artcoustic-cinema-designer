import { formatBassParameterValue } from "@/components/room/bass/bassParameterValueFormatter";
import { isCompletedBassContract } from "@/components/room/bass/completedBassResultPersistence";

const levelLabel = (level) => level == null ? "—" : Number(level) === 0 ? "FAIL" : `L${Number(level)}`;

// RP22 P20 does not define Level 1. Sound Proof grades >4 dB as L1 (not FAIL)
// since P20 is not applicable at Level 1. Only level 0 displays as "FAIL".
const p20LevelLabel = (level) => level == null ? "—" : Number(level) === 0 ? "FAIL" : `L${Number(level)}`;

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

export function formatAuthoritativeBassParameter(completedBassAuthority, key, errorMessage = null, noP14TargetSelected = false) {
  // P14 target genuinely unselected — no calculation has been requested.
  // Show a neutral "Select Bass Target" state. Old completed authority from
  // a previous target selection is NOT surfaced as current.
  if (noP14TargetSelected) {
    return {
      key,
      valueText: "Select Bass Target",
      level: "—",
      status: "unselected",
      isAuthoritative: false,
      publicationRejectionReason: null,
    };
  }

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
    level: key === "p20" ? p20LevelLabel(parameter.level) : levelLabel(parameter.level),
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
    // P14 is the USER-SELECTED target. The level and value always reflect the
    // user's selection (e.g. Minimum L1 · 109 dBC), never the available
    // capability. Available capability is retained separately for the
    // "Available capability" detail and feasibility assessment. When the
    // target is not achievable, the level stays at the selected level and
    // "Target not achievable" is appended to the detail.
    const selectedLevel = parameter?.selectedLevel;
    const selectedTargetDb = parameter?.selectedTargetDb ?? parameter?.requestedTargetDb;
    if (Number.isFinite(selectedLevel) && selectedLevel > 0) {
      result.level = levelLabel(selectedLevel);
    }
    if (Number.isFinite(selectedTargetDb)) {
      result.rawValue = Number(selectedTargetDb);
      result.valueText = formatBassParameterValue(key, selectedTargetDb);
    }
    if (parameter?.pass === false && Number.isFinite(parameter?.achievedCapabilityDb)) {
      result.detail = result.detail
        ? `${result.detail} · Target not achievable`
        : "Target not achievable";
    }
  }
  if (key === "p18") Object.assign(result, buildP18Fields(parameter));
  return result;
}

export function buildComplianceBassPresentation({ completedBassAuthority }, errorMessage = null, noP14TargetSelected = false) {
  const { contract, publicationVerified, publicationRejectionReason } = resolvePublicationState(completedBassAuthority);
  const safeErrorMessage = typeof errorMessage === "string" && errorMessage.trim()
    ? errorMessage
    : (typeof completedBassAuthority?.errorMessage === "string" && completedBassAuthority.errorMessage.trim()
      ? completedBassAuthority.errorMessage
      : null);
  const parameters = Object.fromEntries(["p14", "p18", "p19", "p20"].map((key) => [key, formatAuthoritativeBassParameter(completedBassAuthority, key, safeErrorMessage, noP14TargetSelected)]));
  // Per-seat arrays are publication-gated: only expose official-looking
  // per-seat L1/L2/L3/L4 results when the contract is canonically published.
  // When NOT_VERIFIED / UPDATING, return empty arrays so the UI shows a
  // consistent non-verified state — never mixed verified/unverified per-seat.
  const perSeatP19Results = publicationVerified && Array.isArray(contract?.selectedCandidate?.perSeatP19Results)
    ? contract.selectedCandidate.perSeatP19Results
    : [];
  const perSeatP20Results = publicationVerified && Array.isArray(contract?.selectedCandidate?.perSeatP20Results)
    ? contract.selectedCandidate.perSeatP20Results
    : [];
  return {
    completed: isCompletedBassContract(contract),
    publicationVerified,
    publicationRejectionReason,
    unavailable: !!safeErrorMessage,
    errorMessage: safeErrorMessage,
    p14TargetUnselected: noP14TargetSelected,
    resultFingerprint: contract?.job?.resultFingerprint || null,
    selectedCandidateId: contract?.selectedCandidateId || null,
    parameters,
    perSeatP19Results,
    perSeatP20Results,
  };
}

export function buildComplianceBassExportData({ completedBassAuthority }, errorMessage = null, noP14TargetSelected = false) {
  const presentation = buildComplianceBassPresentation({ completedBassAuthority }, errorMessage, noP14TargetSelected);
  // C6.2D1A: Removed unused destructured publication fields.
  return {
    ...presentation,
    // C6.2D1: When invalid, do not use the source label "completed-authoritative-bass-result".
    source: presentation.publicationVerified ? "completed-authoritative-bass-result" : "completed-bass-result-not-verified",
    authority: presentation.publicationVerified ? "VALID" : "NOT_VERIFIED",
    independentBassCalculation: false,
  };
}