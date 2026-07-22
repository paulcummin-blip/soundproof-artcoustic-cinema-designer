import { formatBassParameterValue } from "@/components/room/bass/bassResultsPresentation";
import { p20SummaryFromResults } from "@/components/room/bass/p20SeatPresentation";
import { isCompletedBassContract } from "@/components/room/bass/completedBassResultStore";

const levelLabel = (level) => level == null ? "—" : Number(level) === 0 ? "FAIL" : `L${Number(level)}`;

export function formatAuthoritativeBassParameter(contract, key) {
  if (!isCompletedBassContract(contract)) return { key, valueText: "—", level: "—", status: "uncalculated" };
  if (key === "p20") {
    const summary = p20SummaryFromResults(contract?.selectedCandidate?.perSeatP20Results);
    return summary
      ? { key, valueText: summary.displayVariationDb, level: summary.level, status: "complete", seatId: summary.seatId }
      : { key, valueText: "—", level: "—", status: "uncalculated" };
  }
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