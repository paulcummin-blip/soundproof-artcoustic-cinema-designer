import { prepareBassSmoothingGrid } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";

export function prepareBassCurveMetricGrid(curve, assessmentStartHz, assessmentEndHz, anchorDb, canonicalTargetCurve = null) {
  const { sorted, bounds } = prepareBassSmoothingGrid(curve, "third");
  const assessedIndices = [];
  const targets = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const frequency = sorted[index].frequency;
    if (frequency < assessmentStartHz || frequency > assessmentEndHz) continue;
    assessedIndices.push(index);
    targets.push(interpolateCanonicalTarget(canonicalTargetCurve, frequency) ?? (anchorDb + artcousticHouseCurveOffsetAt(frequency)));
  }
  return { bounds, assessedIndices, targets };
}

export function calculatePreparedBassCurveMetrics(curve, prepared) {
  if (!prepared?.bounds || !prepared.assessedIndices.length) return null;
  let maxAbsDeviationDb = -Infinity;
  let rmsSum = 0;
  let signedSum = 0;
  let minimumSmoothedSplDb = Infinity;
  let worstFrequencyHz = null;
  const residualPoints = [];
  for (let assessedIndex = 0; assessedIndex < prepared.assessedIndices.length; assessedIndex += 1) {
    const pointIndex = prepared.assessedIndices[assessedIndex];
    const [start, end] = prepared.bounds[pointIndex];
    let sum = 0;
    let count = 0;
    for (let index = start; index < end; index += 1) {
      if (!Number.isFinite(curve[index].spl)) continue;
      sum += curve[index].spl;
      count += 1;
    }
    if (!count) continue;
    const smoothedSplDb = sum / count;
    const deviationDb = smoothedSplDb - prepared.targets[assessedIndex];
    if (!Number.isFinite(deviationDb)) continue;
    const absoluteDeviationDb = Math.abs(deviationDb);
    residualPoints.push({ frequency: curve[pointIndex].frequency, deviationDb, smoothedSplDb });
    signedSum += deviationDb;
    minimumSmoothedSplDb = Math.min(minimumSmoothedSplDb, smoothedSplDb);
    if (absoluteDeviationDb > maxAbsDeviationDb) {
      maxAbsDeviationDb = absoluteDeviationDb;
      worstFrequencyHz = curve[pointIndex].frequency;
    }
    rmsSum += deviationDb ** 2;
  }
  if (!Number.isFinite(maxAbsDeviationDb) || !residualPoints.length) return null;
  const meanSignedResidualDb = signedSum / residualPoints.length;
  const shapeRmsDeviationDb = Math.sqrt(residualPoints.reduce((sum, point) => sum + (point.deviationDb - meanSignedResidualDb) ** 2, 0) / residualPoints.length);
  return {
    maxAbsDeviationDb,
    rmsDeviationDb: Math.sqrt(rmsSum / residualPoints.length),
    meanSignedResidualDb,
    shapeRmsDeviationDb,
    minimumSmoothedSplDb,
    residualPoints,
    worstFrequencyHz,
  };
}