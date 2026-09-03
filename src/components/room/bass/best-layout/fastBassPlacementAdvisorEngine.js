import { prepareModeBank } from "@/bass/core/rewBassEngine";
import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { generateBestSubLayoutCandidateSet } from "@/components/room/bass/best-layout/bestSubLayoutCandidates";
import { selectPracticalRecommendation } from "@/components/room/bass/best-layout/fastBassPlacementPolicy";
import { alignSubsToRSP } from "@/components/room/bass/alignSubsToRSP";

const finite = (value) => Number.isFinite(Number(value));
const mean = (values) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0;
const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));

function smoothCurve(curve, radius = 1) {
  const points = Array.isArray(curve) ? curve : [];
  return points.map((point, index) => {
    const values = points
      .slice(Math.max(0, index - radius), index + radius + 1)
      .map((entry) => Number(entry?.spl))
      .filter(Number.isFinite);
    return { frequency: Number(point?.frequency), spl: mean(values) };
  }).filter((point) => finite(point.frequency) && finite(point.spl));
}

function detectBroadNulls(curve) {
  const smooth = smoothCurve(curve);
  const assessed = smooth.map((point, index) => {
    const shoulders = smooth
      .slice(Math.max(0, index - 4), Math.max(0, index - 1))
      .concat(smooth.slice(index + 2, index + 5))
      .map((entry) => entry.spl)
      .filter(Number.isFinite);
    return { ...point, depthDb: Math.max(0, mean(shoulders) - point.spl) };
  });
  const groups = [];
  let active = [];
  assessed.forEach((point) => {
    if (point.depthDb >= 8) active.push(point);
    else if (active.length) {
      groups.push(active);
      active = [];
    }
  });
  if (active.length) groups.push(active);
  return groups.filter((group) => group.length >= 2).map((group) => {
    const worst = group.reduce((result, point) => point.depthDb > result.depthDb ? point : result);
    return {
      startHz: round(group[0].frequency, 1),
      endHz: round(group[group.length - 1].frequency, 1),
      centreHz: round(worst.frequency, 1),
      depthDb: round(worst.depthDb),
    };
  });
}

function houseCurveCompatibility(curve) {
  const points = smoothCurve(curve).filter((point) => point.frequency >= 20 && point.frequency <= 120);
  if (!points.length) return Number.POSITIVE_INFINITY;
  // A nominal low-frequency rise is used only as a shape reference. The
  // authoritative house-curve, EQ limits and P14/P18 logic are not involved.
  const residuals = points.map((point) => {
    const targetShape = Math.max(0, Math.min(6, 3 * Math.log2(80 / point.frequency)));
    return point.spl - targetShape;
  });
  const offset = mean(residuals);
  return Math.sqrt(mean(residuals.map((value) => (value - offset) ** 2)));
}

function variationMetrics(curves) {
  if (curves.length < 2) return { worstSeatVariationDb: 0, meanSeatVariationDb: 0 };
  const length = Math.min(...curves.map((curve) => curve.length));
  const variations = Array.from({ length }, (_, index) => {
    const values = curves.map((curve) => Number(curve[index]?.spl)).filter(Number.isFinite);
    return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  });
  return {
    worstSeatVariationDb: Math.max(0, ...variations),
    meanSeatVariationDb: mean(variations),
  };
}

function describeConsistency(value, rspOnly) {
  if (rspOnly) return "RSP-only indication";
  if (value <= 4) return "Strong expected consistency";
  if (value <= 7) return "Good expected consistency";
  if (value <= 10) return "Moderate seat variation";
  return "Higher seat-variation risk";
}

function describeNullRisk(count, depth) {
  if (count === 0 && depth < 6) return "Low 30–60 Hz null risk";
  if (count === 0) return "Moderate 30–60 Hz risk";
  return "Elevated 30–60 Hz null risk";
}

function assessCandidate(layout, transfer, rspOnly) {
  const rawCurves = rspOnly
    ? [transfer?.rspCurve]
    : (transfer?.seatCurves || []).map((seat) => seat?.responseData);
  const curves = rawCurves.filter((curve) => Array.isArray(curve) && curve.length > 0);
  const perListener = curves.map((curve, index) => {
    const nulls = detectBroadNulls(curve);
    const priorityNulls = nulls.filter((item) => item.centreHz >= 30 && item.centreHz <= 60);
    return {
      listenerIndex: index,
      nulls,
      priorityNulls,
      houseCurveCompatibilityDb: houseCurveCompatibility(curve),
    };
  });
  const variation = variationMetrics(curves);
  const priorityNulls = perListener.flatMap((listener) => listener.priorityNulls);
  const allNulls = perListener.flatMap((listener) => listener.nulls);
  const houseFit = mean(perListener.map((listener) => listener.houseCurveCompatibilityDb).filter(Number.isFinite));
  const metrics = {
    sourceCount: layout.sources.length,
    seatsAssessed: rspOnly ? 0 : curves.length,
    rspOnly,
    priorityNullCount30To60: priorityNulls.length,
    worstPriorityNullDepthDb: Math.max(0, ...priorityNulls.map((item) => item.depthDb)),
    destructiveBroadNullCount: allNulls.length,
    worstBroadNullDepthDb: Math.max(0, ...allNulls.map((item) => item.depthDb)),
    worstSeatVariationDb: round(variation.worstSeatVariationDb),
    meanSeatVariationDb: round(variation.meanSeatVariationDb),
    houseCurveCompatibilityDb: round(houseFit),
    expectedConsistencyLabel: describeConsistency(variation.worstSeatVariationDb, rspOnly),
    nullRiskLabel: describeNullRisk(priorityNulls.length, Math.max(0, ...priorityNulls.map((item) => item.depthDb))),
    smoothnessLabel: houseFit <= 3 ? "Smooth broad response" : houseFit <= 5 ? "Workable broad response" : "More correction likely",
  };
  return { ...layout, metrics };
}

export function runFastBassPlacementAdvisor({
  roomDims,
  seatingPositions,
  rspPosition,
  physicsOptions,
  sourceHeights,
  roomElements,
  cabinetHalfExtents,
}) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const realSeats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .filter((seat) => finite(seat?.x) && finite(seat?.y));
  const rspOnly = realSeats.length === 0;
  const generated = generateBestSubLayoutCandidateSet(
    roomDims,
    sourceHeights,
    roomElements,
    cabinetHalfExtents,
  );
  const options = {
    ...physicsOptions,
    freqMinHz: 20,
    freqMaxHz: 160,
    smoothing: "none",
    pointsPerOctave: C.previewPointsPerOctave,
  };
  const preparedModes = prepareModeBank(roomDims, options);
  const listeners = {
    rspPosition: rspOnly ? rspPosition : null,
    seatingPositions: rspOnly ? [] : realSeats,
  };
  const assessed = generated.candidates.map((layout) => {
    const sources = rspPosition ? alignSubsToRSP(layout.sources, rspPosition) : layout.sources;
    const transfer = computeNormalizedRoomTransfer({
      roomDims,
      ...listeners,
      subsForSimulation: sources,
      physicsOptions: options,
      preparedModes,
      pointsPerOctave: C.previewPointsPerOctave,
    });
    return assessCandidate({ ...layout, sources }, transfer, rspOnly);
  });
  const recommendations = {
    1: selectPracticalRecommendation(assessed, 1),
    2: selectPracticalRecommendation(assessed, 2),
    4: selectPracticalRecommendation(assessed, 4),
  };
  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    recommendations,
    candidateCount: assessed.length,
    rspOnly,
    diagnostics: generated.diagnostics,
    calculationTimeMs: ended - started,
    authority: "lightweight-placement-advisor",
    grading: "none",
  };
}
