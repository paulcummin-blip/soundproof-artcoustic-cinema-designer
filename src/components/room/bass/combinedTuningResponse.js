// Shared complex re-summation for ADI and reproduction tests.
// Input transfers are untuned; absolute effective tuning is applied once.
import { tuningPhaseRadians } from "@/bass/core/subwooferPhaseControl";
import { buildCombinedSystemResponse } from "./combinedSystemResponse";

export function tuneComplexTransfers(transfers, tuning) {
  return (transfers || []).map(transfer => {
    const t = tuning?.[transfer.sourceIndex] || {};
    const gain = Math.pow(10, (Number(t.gainDb) || 0) / 20);
    return {
      ...transfer,
      points: transfer.points.map(p => {
        const theta = tuningPhaseRadians(p.frequency, t);
        const c = Math.cos(theta), s = Math.sin(theta);
        return { frequency: p.frequency, re: gain * (p.re * c - p.im * s), im: gain * (p.re * s + p.im * c) };
      }),
    };
  });
}

export function combineTunedResponse(rawTransfer, tuning, crossover) {
  const integration = rawTransfer.integrationTransfers;
  if (!integration?.available) return null;
  const subTransfersBySeat = {};
  for (const t of tuneComplexTransfers(rawTransfer.perSourcePerSeatComplexTransfers, tuning)) {
    (subTransfersBySeat[t.seatId] ||= []).push(t);
  }
  return buildCombinedSystemResponse({
    ...integration, subTransfersBySeat, crossover,
    seats: rawTransfer.seatIds.map(seatId => ({ seatId })),
    primarySeatId: "rsp",
  });
}

export function combinedResponseCurves(combined, seatPriorityMap = []) {
  if (!combined?.available || !combined.combinedBySeat?.rsp) return null;
  const priorities = new Map(seatPriorityMap);
  return {
    rspRawCurve: combined.combinedBySeat.rsp,
    perSeatRawCurves: Object.entries(combined.combinedBySeat)
      .filter(([id]) => id !== "rsp")
      .map(([seatId, responseData]) => ({ seatId, responseData, isPrimary: priorities.get(seatId) !== "secondary" })),
    cancellationComplexTransfers: combined.rspComplexTransfers,
  };
}
