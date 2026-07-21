import { applyBassSmoothing } from "./bassGraphSmoothing";

function interpolate(curve, frequency) {
  if (!curve.length) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  let low = 0;
  let high = curve.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (curve[middle].frequency <= frequency) low = middle; else high = middle;
  }
  const left = curve[low];
  const right = curve[high];
  const ratio = (frequency - left.frequency) / (right.frequency - left.frequency);
  return left.spl + (right.spl - left.spl) * ratio;
}

export function compareDisplayedPreviewAndRefinement(previewCurve, refinedCurve, smoothingMode) {
  const preview = applyBassSmoothing(previewCurve, smoothingMode).filter((point) => Number.isFinite(point.spl));
  const refined = applyBassSmoothing(refinedCurve, smoothingMode).filter((point) => Number.isFinite(point.spl));
  const deltas = preview.map((point) => ({
    frequency: point.frequency,
    deltaDb: Math.abs(point.spl - interpolate(refined, point.frequency)),
  })).filter((point) => Number.isFinite(point.deltaDb));
  if (!deltas.length) return { smoothingMode, maximumDeltaDb: null, frequencyHz: null, movement: "unavailable" };
  const maximum = deltas.reduce((best, point) => point.deltaDb > best.deltaDb ? point : best);
  const maximumIndex = deltas.indexOf(maximum);
  const halfMaximum = maximum.deltaDb * 0.5;
  let leftIndex = maximumIndex;
  let rightIndex = maximumIndex;
  while (leftIndex > 0 && deltas[leftIndex - 1].deltaDb >= halfMaximum) leftIndex--;
  while (rightIndex < deltas.length - 1 && deltas[rightIndex + 1].deltaDb >= halfMaximum) rightIndex++;
  const widthOctaves = rightIndex > leftIndex
    ? Math.log2(deltas[rightIndex].frequency / deltas[leftIndex].frequency)
    : 0;
  return {
    smoothingMode,
    maximumDeltaDb: maximum.deltaDb,
    frequencyHz: maximum.frequency,
    movement: widthOctaves >= 1 / 6 ? "broad response movement" : "narrow null",
    comparedPointCount: deltas.length,
    halfMaximumWidthOctaves: widthOctaves,
  };
}

export function buildPreviewRefinementDeltaTable(previewCurve, refinedCurve) {
  return ["none", "sixth", "third"].map((mode) => compareDisplayedPreviewAndRefinement(previewCurve, refinedCurve, mode));
}