import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { summarizeTransferEfficiency } from "@/components/room/bass/best-layout/bestSubLayoutTransferEfficiency";

const round = (value, digits = 3) => Number(Number(value || 0).toFixed(digits));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function smoothLayoutCurve(curve) {
  const radius = C.nullRule.smoothingRadiusBins;
  return curve.map((point, index) => {
    const values = curve.slice(Math.max(0, index - radius), index + radius + 1).map((item) => item.spl).filter(Number.isFinite);
    return { frequency: point.frequency, spl: mean(values) };
  });
}

export function detectBroadNulls(curve) {
  const smooth = smoothLayoutCurve(curve);
  const depths = smooth.map((point, index) => {
    const radius = C.nullRule.shoulderRadiusBins;
    const shoulders = smooth.slice(Math.max(0, index - radius), Math.max(0, index - 1))
      .concat(smooth.slice(index + 2, index + radius + 1)).map((item) => item.spl).filter(Number.isFinite);
    return { ...point, depthDb: Math.max(0, mean(shoulders) - point.spl) };
  });
  const groups = [];
  let active = [];
  depths.forEach((point) => {
    if (point.depthDb >= C.nullRule.destructiveDepthDb) active.push(point);
    else if (active.length) { groups.push(active); active = []; }
  });
  if (active.length) groups.push(active);
  return groups.filter((group) => group.length >= C.nullRule.minimumContiguousBins).map((group) => ({
    startHz: round(group[0].frequency, 1), endHz: round(group[group.length - 1].frequency, 1),
    centreHz: round(group.reduce((best, item) => item.depthDb > best.depthDb ? item : best).frequency, 1),
    depthDb: round(Math.max(...group.map((item) => item.depthDb)), 2), bins: group.length,
  }));
}

function extensionForCurve(curve) {
  const smooth = smoothLayoutCurve(curve);
  const reference = mean(smooth.filter((point) => point.frequency >= C.extension.referenceStartHz && point.frequency <= C.extension.referenceEndHz).map((point) => point.spl));
  const threshold = reference - C.extension.allowedDropDb;
  const candidates = smooth.filter((point) => point.frequency <= C.extension.referenceEndHz);
  return candidates.find((point, index) => candidates.slice(index).every((later) => later.spl >= threshold))?.frequency ?? C.extension.referenceEndHz;
}

export function gradeLayout(metrics, rspOnly) {
  const guardsPass = metrics.perSeat.every((seat) =>
    seat.worstNullDepthDb < C.grades.individualSeatMaxNullDb &&
    seat.extensionHz <= C.grades.individualSeatMaxExtensionHz &&
    seat.relativeTransferEfficiencyDb >= C.efficiency.strongMinRelativeDb
  );
  const aPlus = metrics.destructiveBroadNullCount === 0 && metrics.transferEfficiencyClass === "Strong" && metrics.worstSeatVariationDb <= C.grades.aPlusMaxVariationDb && guardsPass;
  if (aPlus) return rspOnly ? "A+ provisional" : "A+";
  if (metrics.destructiveBroadNullCount === 0 && metrics.worstSeatVariationDb <= C.grades.aMaxVariationDb) return "A";
  if (metrics.destructiveBroadNullCount <= 1 && metrics.worstSeatVariationDb <= C.grades.bMaxVariationDb) return "B";
  return metrics.destructiveBroadNullCount <= 2 ? "C" : "Not recommended";
}

export function assessLayoutResult(layout, transferResult, directReferenceResult, rspOnly) {
  const curves = rspOnly ? [transferResult.rspCurve] : transferResult.seatCurves.map((seat) => seat.responseData);
  const referenceCurves = rspOnly ? [directReferenceResult.rspCurve] : directReferenceResult.seatCurves.map((seat) => seat.responseData);
  const efficiency = summarizeTransferEfficiency(curves, referenceCurves);
  const perSeat = curves.map((curve, index) => {
    const nulls = detectBroadNulls(curve);
    return {
      seatIndex: index,
      nulls,
      worstNullDepthDb: Math.max(0, ...nulls.map((item) => item.depthDb)),
      extensionHz: extensionForCurve(curve),
      relativeTransferEfficiencyDb: efficiency.perSeatTransferEfficiencyDb[index],
    };
  });
  const length = Math.min(...curves.map((curve) => curve.length));
  const variations = Array.from({ length }, (_, index) => {
    const values = curves.map((curve) => curve[index]?.spl).filter(Number.isFinite);
    return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  });
  const metrics = {
    sourceCount: layout.sources.length,
    placementFamily: layout.placementFamily,
    coordinates: layout.sources.map(({ x, y, z, placement }) => ({ x, y, z, placement })),
    realSeatsAssessed: rspOnly ? 0 : curves.length,
    rspOnly,
    destructiveBroadNullCount: perSeat.reduce((sum, seat) => sum + seat.nulls.length, 0),
    worstSeatBroadNullDepthDb: Math.max(0, ...perSeat.map((seat) => seat.worstNullDepthDb)),
    worstSeatVariationDb: Math.max(0, ...variations),
    meanSeatVariationDb: mean(variations),
    lowestReliableNormalizedFrequencyHz: Math.max(...perSeat.map((seat) => seat.extensionHz)),
    relativeTransferEfficiencyDb: efficiency.relativeTransferEfficiencyDb,
    worstSeatTransferEfficiencyDb: efficiency.worstSeatTransferEfficiencyDb,
    transferEfficiencyClass: efficiency.transferEfficiencyClass,
    perSeat,
  };
  metrics.overallGrade = gradeLayout(metrics, rspOnly);
  metrics.rankingScore = round(1000000 - metrics.destructiveBroadNullCount * 100000 - metrics.worstSeatBroadNullDepthDb * 5000 - metrics.worstSeatVariationDb * 500 - metrics.lowestReliableNormalizedFrequencyHz * 20 + (metrics.worstSeatTransferEfficiencyDb ?? -100) * 10 - metrics.sourceCount, 3);
  metrics.rankingReason = metrics.destructiveBroadNullCount === 0
    ? `No destructive broad nulls; ${metrics.transferEfficiencyClass.toLowerCase()} corrected relative transfer efficiency.`
    : `${metrics.destructiveBroadNullCount} broad null${metrics.destructiveBroadNullCount === 1 ? "" : "s"}; ranked by worst-seat protection first.`;
  return { ...layout, metrics };
}

export function compareRankedLayouts(a, b) {
  const A = a.metrics, B = b.metrics, tolerance = C.tieTolerance;
  if (A.destructiveBroadNullCount !== B.destructiveBroadNullCount) return A.destructiveBroadNullCount - B.destructiveBroadNullCount;
  if (Math.abs(A.worstSeatBroadNullDepthDb - B.worstSeatBroadNullDepthDb) > tolerance.nullDepthDb) return A.worstSeatBroadNullDepthDb - B.worstSeatBroadNullDepthDb;
  if (Math.abs(A.worstSeatVariationDb - B.worstSeatVariationDb) > tolerance.variationDb) return A.worstSeatVariationDb - B.worstSeatVariationDb;
  if (Math.abs(A.lowestReliableNormalizedFrequencyHz - B.lowestReliableNormalizedFrequencyHz) > tolerance.extensionHz) return A.lowestReliableNormalizedFrequencyHz - B.lowestReliableNormalizedFrequencyHz;
  if (Math.abs(A.worstSeatTransferEfficiencyDb - B.worstSeatTransferEfficiencyDb) > tolerance.efficiencyDb) return B.worstSeatTransferEfficiencyDb - A.worstSeatTransferEfficiencyDb;
  if (A.sourceCount !== B.sourceCount) return A.sourceCount - B.sourceCount;
  return a.id.localeCompare(b.id);
}