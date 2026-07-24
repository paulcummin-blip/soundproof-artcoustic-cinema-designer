import { formatBassParameterValue } from "@/components/room/bass/bassResultsPresentation";
import { isCompletedBassContract } from "@/components/room/bass/completedBassResultPersistence";

const levelLabel = (level) => level == null ? "—" : Number(level) === 0 ? "FAIL" : `L${Number(level)}`;

export function formatAuthoritativeBassParameter(contract, key, errorMessage = null) {
  if (!isCompletedBassContract(contract)) return {
    key,
    valueText: errorMessage ? "Bass analysis unavailable" : "—",
    level: "—",
    status: errorMessage ? "error" : "uncalculated",
  };
  const parameter = contract?.productAnalysis?.parameters?.[key];
  if (parameter?.status === "not_applicable") return { key, valueText: "N/A", level: "N/A", status: parameter.status };
  if (parameter?.status !== "complete" || parameter?.level == null || !Number.isFinite(Number(parameter?.value))) {
    return { key, valueText: "—", level: "—", status: parameter?.status || "uncalculated" };
  }
  return {
    key,
    valueText: formatBassParameterValue(key, parameter.value),
    level: levelLabel(parameter.level),
    status: parameter.status,
    rawValue: Number(parameter.value),
    detail: key === "p14" ? parameter.targetBasisDetail : null,
    targetBasis: key === "p14" ? parameter.targetBasis : null,
    targetBasisLabel: key === "p14" ? (parameter.targetBasis === "recommended" ? "Recommended" : "Minimum") : null,
  };
}

export function buildComplianceBassPresentation(contract, errorMessage = null) {
  const safeErrorMessage = typeof errorMessage === "string" && errorMessage.trim() ? errorMessage : null;
  const parameters = Object.fromEntries(["p14", "p18", "p19", "p20"].map((key) => [key, formatAuthoritativeBassParameter(contract, key, safeErrorMessage)]));
  return {
    completed: isCompletedBassContract(contract),
    unavailable: !!safeErrorMessage,
    errorMessage: safeErrorMessage,
    resultFingerprint: contract?.job?.resultFingerprint || null,
    selectedCandidateId: contract?.selectedCandidateId || null,
    parameters,
    perSeatP20Results: Array.isArray(contract?.selectedCandidate?.perSeatP20Results) ? contract.selectedCandidate.perSeatP20Results : [],
  };
}

export function buildComplianceBassExportData(contract, errorMessage = null) {
  const presentation = buildComplianceBassPresentation(contract, errorMessage);
  return {
    ...presentation,
    source: "completed-authoritative-bass-result",
    independentBassCalculation: false,
  };
}