import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { summarizeTransferEfficiency } from "@/components/room/bass/best-layout/bestSubLayoutTransferEfficiency";
import { houseCurveP19Level } from "@/components/utils/houseCurveFitterCore";
import { levelP20_lfConsistency, numericRp22Level } from "@/components/utils/rp22/levels";

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
  const p19 = metrics.p19Level;
  const p20 = metrics.p20Level;
  if (rspOnly) return "Provisional";
  if (p19 === 4 && p20 === 4) return "A++";
  if ((p19 === 4 && p20 >= 3) || (p20 === 4 && p19 >= 3)) return "A+";
  if (p19 >= 3 && p20 >= 3) return "A";
  if (p19 >= 2 && p20 >= 2) return "B";
  if (p19 >= 1 && p20 >= 1) return "C";
  return "Not recommended";
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
  metrics.p19Level = rspOnly ? null : houseCurveP19Level(metrics.meanSeatVariationDb);
  metrics.p20Level = rspOnly ? null : numericRp22Level(levelP20_lfConsistency(metrics.worstSeatVariationDb));
  metrics.combinedConsistencyLevel = (metrics.p19Level || 0) + (metrics.p20Level || 0);
  metrics.placementGrade = gradeLayout(metrics, rspOnly);
  metrics.overallGrade = metrics.placementGrade;
  metrics.rankingScore = round(metrics.combinedConsistencyLevel * 1000000 - metrics.worstSeatVariationDb * 1000 - metrics.destructiveBroadNullCount * 100 + (metrics.worstSeatTransferEfficiencyDb ?? -100), 3);
  metrics.rankingReason = rspOnly
    ? "Provisional placement guidance based on the reference seating position."
    : `P19 L${metrics.p19Level} and P20 L${metrics.p20Level}; recommended for bass consistency across the listening area.`;
  return { ...layout, metrics };
}

export function applyFinalOptimisedAuthorityToLayout(layoutAssessment, finalResponse) {
  const p19 = finalResponse?.finalSeatVariationData?.p19;
  const p20 = finalResponse?.finalSeatVariationData?.p20;
  if (!layoutAssessment?.metrics || !finalResponse?.selectedCandidateId || p19?.candidateId !== finalResponse.selectedCandidateId || p20?.candidateId !== finalResponse.selectedCandidateId) return layoutAssessment;
  const metrics = {
    ...layoutAssessment.metrics,
    p19Level: Number.isFinite(p19.level) ? p19.level : layoutAssessment.metrics.p19Level,
    p20Level: Number.isFinite(p20.level) ? p20.level : layoutAssessment.metrics.p20Level,
    meanSeatVariationDb: Number.isFinite(p19.variationDb) ? p19.variationDb : layoutAssessment.metrics.meanSeatVariationDb,
    worstSeatVariationDb: Number.isFinite(p20.variationDb) ? p20.variationDb : layoutAssessment.metrics.worstSeatVariationDb,
    selectedCandidateId: finalResponse.selectedCandidateId,
    filterBankSignature: finalResponse.filterBankSignature,
    responseAuthority: "final-post-eq",
  };
  metrics.combinedConsistencyLevel = (metrics.p19Level || 0) + (metrics.p20Level || 0);
  metrics.placementGrade = gradeLayout(metrics, false);
  metrics.overallGrade = metrics.placementGrade;
  metrics.rankingReason = `P19 ${metrics.p19Level > 0 ? `L${metrics.p19Level}` : "FAIL"} and P20 ${metrics.p20Level > 0 ? `L${metrics.p20Level}` : "FAIL"}; final selected post-EQ candidate.`;
  return { ...layoutAssessment, metrics };
}

export function compareRankedLayouts(a, b) {
  const A = a.metrics, B = b.metrics, tolerance = C.tieTolerance;
  if (A.combinedConsistencyLevel !== B.combinedConsistencyLevel) return B.combinedConsistencyLevel - A.combinedConsistencyLevel;
  const aFloor = Math.min(A.p19Level || 0, A.p20Level || 0), bFloor = Math.min(B.p19Level || 0, B.p20Level || 0);
  if (aFloor !== bFloor) return bFloor - aFloor;
  if (Math.abs(A.worstSeatVariationDb - B.worstSeatVariationDb) > tolerance.variationDb) return A.worstSeatVariationDb - B.worstSeatVariationDb;
  if (A.destructiveBroadNullCount !== B.destructiveBroadNullCount) return A.destructiveBroadNullCount - B.destructiveBroadNullCount;
  if (Math.abs(A.worstSeatTransferEfficiencyDb - B.worstSeatTransferEfficiencyDb) > tolerance.efficiencyDb) return B.worstSeatTransferEfficiencyDb - A.worstSeatTransferEfficiencyDb;
  if (A.sourceCount !== B.sourceCount) return A.sourceCount - B.sourceCount;
  return a.id.localeCompare(b.id);
}