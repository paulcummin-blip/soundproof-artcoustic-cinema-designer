import { formatBassParameterValue } from "@/components/room/bass/bassResultsPresentation";
import { isCompletedBassContract } from "@/components/room/bass/completedBassResultPersistence";

const levelLabel = (level) => level == null ? "—" : Number(level) === 0 ? "FAIL" : `L${Number(level)}`;

export function formatAuthoritativeBassParameter(contract, key) {
  if (!isCompletedBassContract(contract)) return { key, valueText: "—", level: "—", status: "uncalculated" };
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

export function buildComplianceBassPresentation(contract) {
  const parameters = Object.fromEntries(["p14", "p18", "p19", "p20"].map((key) => [key, formatAuthoritativeBassParameter(contract, key)]));
  return {
    completed: isCompletedBassContract(contract),
    resultFingerprint: contract?.job?.resultFingerprint || null,
    selectedCandidateId: contract?.selectedCandidateId || null,
    parameters,
    perSeatP20Results: contract?.selectedCandidate?.perSeatP20Results || [],
  };
}

export function buildComplianceBassExportData(contract) {
  const presentation = buildComplianceBassPresentation(contract);
  return {
    ...presentation,
    source: "completed-authoritative-bass-result",
    independentBassCalculation: false,
  };
}