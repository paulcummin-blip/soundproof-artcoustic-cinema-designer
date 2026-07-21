import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function calculateSeatTransferEfficiency(roomCurve, referenceCurve) {
  const referenceByHz = new Map((referenceCurve || []).map((point) => [point.frequency, point.spl]));
  const transfer = (roomCurve || [])
    .filter((point) => point.frequency >= C.efficiency.assessmentStartHz && point.frequency <= C.efficiency.assessmentEndHz)
    .map((point) => {
      const reference = referenceByHz.get(point.frequency);
      return Number.isFinite(point.spl) && Number.isFinite(reference) ? point.spl - reference : null;
    })
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!transfer.length) return null;
  const baselineIndex = Math.min(transfer.length - 1, Math.floor((transfer.length - 1) * C.efficiency.transferBaselinePercentile));
  const baseline = transfer[baselineIndex];
  return mean(transfer.map((value) => Math.min(0, value - baseline)));
}

export function classifyTransferEfficiency(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value >= C.efficiency.strongMinRelativeDb) return "Strong";
  if (value >= C.efficiency.balancedMinRelativeDb) return "Balanced";
  return "Limited";
}

export function summarizeTransferEfficiency(roomCurves, referenceCurves) {
  const perSeat = roomCurves.map((curve, index) => calculateSeatTransferEfficiency(curve, referenceCurves[index] || []));
  const finite = perSeat.filter(Number.isFinite);
  const relativeTransferEfficiencyDb = finite.length ? mean(finite) : null;
  const worstSeatTransferEfficiencyDb = finite.length ? Math.min(...finite) : null;
  return {
    perSeatTransferEfficiencyDb: perSeat,
    relativeTransferEfficiencyDb,
    worstSeatTransferEfficiencyDb,
    transferEfficiencyClass: classifyTransferEfficiency(worstSeatTransferEfficiencyDb),
  };
}