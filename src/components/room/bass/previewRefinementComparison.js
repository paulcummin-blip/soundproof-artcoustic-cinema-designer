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
  const span = right.frequency - left.frequency;
  if (span === 0) return left.spl;
  const ratio = (frequency - left.frequency) / span;
  return left.spl + (right.spl - left.spl) * ratio;
}

function normalizedCurve(curve) {
  return (Array.isArray(curve) ? curve : [])
    .filter((point) => Number.isFinite(point?.frequency) && Number.isFinite(point?.spl))
    .slice()
    .sort((a, b) => a.frequency - b.frequency);
}

export function alignPreviewAndRefinement(previewCurve, refinedCurve) {
  const previewSource = normalizedCurve(previewCurve);
  const refinedSource = normalizedCurve(refinedCurve);
  if (!previewSource.length || !refinedSource.length) return { frequencies: [], preview: [], refined: [] };
  const minimumHz = Math.max(previewSource[0].frequency, refinedSource[0].frequency);
  const maximumHz = Math.min(previewSource.at(-1).frequency, refinedSource.at(-1).frequency);
  const frequencies = [...new Set([...previewSource, ...refinedSource]
    .map((point) => point.frequency)
    .filter((frequency) => frequency >= minimumHz && frequency <= maximumHz))]
    .sort((a, b) => a - b);
  const preview = frequencies.map((frequency) => ({ frequency, spl: interpolate(previewSource, frequency) }));
  const refined = frequencies.map((frequency) => ({ frequency, spl: interpolate(refinedSource, frequency) }));
  return { frequencies, preview, refined };
}

function frequencyArrays(curve) {
  return curve.map((point) => point.frequency);
}

export function compareDisplayedPreviewAndRefinement(previewCurve, refinedCurve, smoothingMode) {
  const aligned = alignPreviewAndRefinement(previewCurve, refinedCurve);
  const preview = applyBassSmoothing(aligned.preview, smoothingMode).filter((point) => Number.isFinite(point.spl));
  const refined = applyBassSmoothing(aligned.refined, smoothingMode).filter((point) => Number.isFinite(point.spl));
  const previewFrequencies = frequencyArrays(preview);
  const refinedFrequencies = frequencyArrays(refined);
  if (JSON.stringify(previewFrequencies) !== JSON.stringify(refinedFrequencies)) {
    throw new Error(`Preview/refinement frequency alignment failed: ${JSON.stringify({ previewFrequencies, refinedFrequencies })}`);
  }
  const deltas = preview.map((point, index) => ({
    frequency: point.frequency,
    deltaDb: Math.abs(point.spl - refined[index].spl),
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
    alignedFrequencies: previewFrequencies,
  };
}

export function buildPreviewRefinementDeltaTable(previewCurve, refinedCurve) {
  const rows = ["none", "sixth", "third"].map((mode) => compareDisplayedPreviewAndRefinement(previewCurve, refinedCurve, mode));
  const unsmoothedMaximum = rows[0].maximumDeltaDb;
  const invariantPassed = rows.slice(1).every((row) => row.maximumDeltaDb <= unsmoothedMaximum);
  if (!invariantPassed) {
    const aligned = alignPreviewAndRefinement(previewCurve, refinedCurve);
    throw new Error(`Preview/refinement smoothing invariant failed: ${JSON.stringify({ aligned, rows })}`);
  }
  return rows;
}