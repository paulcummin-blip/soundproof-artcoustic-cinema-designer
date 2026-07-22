import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function localShoulderLevel(points, frequency) {
  const left = points.filter((point) => point.frequency >= frequency / 2 ** (2 / 3) && point.frequency <= frequency / 2 ** (1 / 4));
  const right = points.filter((point) => point.frequency >= frequency * 2 ** (1 / 4) && point.frequency <= frequency * 2 ** (2 / 3));
  const leftLevel = median(left.map((point) => point.spl));
  const rightLevel = median(right.map((point) => point.spl));
  return Number.isFinite(leftLevel) && Number.isFinite(rightLevel) ? (leftLevel + rightLevel) / 2 : null;
}

export function deriveResponseAnchoredTarget({ rawCurve, usableLfHz = null, startHz = 20, endHz = 200 }) {
  const rawPoints = (rawCurve || [])
    .map((point) => ({ frequency: Number(point?.frequency), spl: Number(point?.spl) }))
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.spl))
    .sort((a, b) => a.frequency - b.frequency);
  const sharpPeakFrequencies = rawPoints.filter((point) => {
    const left = rawPoints.filter((candidate) => candidate.frequency >= point.frequency / 2 ** (1 / 12)
      && candidate.frequency <= point.frequency / 2 ** (1 / 48));
    const right = rawPoints.filter((candidate) => candidate.frequency >= point.frequency * 2 ** (1 / 48)
      && candidate.frequency <= point.frequency * 2 ** (1 / 12));
    const shoulder = median([...left, ...right].map((candidate) => candidate.spl));
    return Number.isFinite(shoulder) && point.spl - shoulder >= 8;
  }).map((point) => point.frequency);
  const smoothed = applyBassSmoothing(rawCurve, "third")
    .map((point) => ({ frequency: Number(point?.frequency), spl: Number(point?.spl) }))
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.spl))
    .sort((a, b) => a.frequency - b.frequency);
  if (!smoothed.length) return null;
  const availableStartHz = smoothed[0].frequency;
  const availableEndHz = smoothed.at(-1).frequency;
  const lowerHz = Math.max(startHz, availableStartHz, Number.isFinite(Number(usableLfHz)) ? Number(usableLfHz) : startHz);
  const upperHz = Math.min(endHz, availableEndHz);
  const eligible = smoothed.filter((point) => point.frequency >= lowerHz && point.frequency <= upperHz)
    .filter((point) => !sharpPeakFrequencies.some((frequency) => Math.abs(Math.log2(point.frequency / frequency)) <= 1 / 12))
    .filter((point) => {
      const shoulderLevel = localShoulderLevel(smoothed, point.frequency);
      if (!Number.isFinite(shoulderLevel)) return true;
      return shoulderLevel - point.spl < 10 && point.spl - shoulderLevel < 4;
    });
  if (!eligible.length) return null;
  const samples = eligible.map((point, index) => {
    const previous = eligible[index - 1]?.frequency ?? point.frequency / Math.sqrt(eligible[index + 1]?.frequency / point.frequency || 1);
    const next = eligible[index + 1]?.frequency ?? point.frequency * Math.sqrt(point.frequency / eligible[index - 1]?.frequency || 1);
    const weight = Math.max(1e-9, Math.log(next / previous) / 2);
    return { value: point.spl - artcousticHouseCurveOffsetAt(point.frequency), weight };
  }).filter((sample) => Number.isFinite(sample.value) && Number.isFinite(sample.weight));
  const ordered = samples.sort((a, b) => a.value - b.value);
  const halfWeight = ordered.reduce((sum, sample) => sum + sample.weight, 0) / 2;
  let accumulated = 0;
  for (const sample of ordered) {
    accumulated += sample.weight;
    if (accumulated >= halfWeight) return sample.value;
  }
  return ordered.at(-1)?.value ?? null;
}

export const HOUSE_CURVE_P19_START_HZ = 20;
export const HOUSE_CURVE_P19_END_HZ = 120;
export const HOUSE_CURVE_CORRECTION_START_HZ = 20;
export const HOUSE_CURVE_CORRECTION_END_HZ = 200;

export function resolveHouseCurveDomains(frequencyGrid, configuredCorrectionEndHz) {
  const finite = (frequencyGrid || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const availableStartHz = finite[0] ?? null;
  const availableEndHz = finite.at(-1) ?? null;
  const correctionStartHz = Math.max(HOUSE_CURVE_CORRECTION_START_HZ, availableStartHz ?? HOUSE_CURVE_CORRECTION_START_HZ);
  const requestedEnd = Number.isFinite(configuredCorrectionEndHz) ? configuredCorrectionEndHz : availableEndHz;
  const correctionEndHz = Math.min(requestedEnd ?? HOUSE_CURVE_P19_END_HZ, availableEndHz ?? requestedEnd ?? HOUSE_CURVE_P19_END_HZ);
  return {
    p19StartHz: Math.max(HOUSE_CURVE_P19_START_HZ, availableStartHz ?? HOUSE_CURVE_P19_START_HZ),
    p19EndHz: Math.min(HOUSE_CURVE_P19_END_HZ, availableEndHz ?? HOUSE_CURVE_P19_END_HZ),
    correctionStartHz,
    correctionEndHz,
  };
}

export function buildCanonicalAbsoluteHouseCurveTarget({ frequencyGrid, targetAnchorDb, correctionStartHz, correctionEndHz }) {
  if (!Number.isFinite(targetAnchorDb)) return [];
  return (frequencyGrid || [])
    .map(Number)
    .filter((frequency) => Number.isFinite(frequency) && frequency >= correctionStartHz && frequency <= correctionEndHz)
    .sort((a, b) => a - b)
    .filter((frequency, index, values) => index === 0 || frequency > values[index - 1])
    .map((frequency) => ({ frequency, spl: targetAnchorDb + artcousticHouseCurveOffsetAt(frequency) }));
}

export function interpolateCanonicalTarget(targetCurve, frequency) {
  if (!Array.isArray(targetCurve) || !targetCurve.length || !Number.isFinite(frequency)) return null;
  if (frequency <= targetCurve[0].frequency) return targetCurve[0].spl;
  if (frequency >= targetCurve.at(-1).frequency) return targetCurve.at(-1).spl;
  const upperIndex = targetCurve.findIndex((point) => point.frequency >= frequency);
  const low = targetCurve[upperIndex - 1];
  const high = targetCurve[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}

export function requiredCorrectionDb(targetSplDb, currentPostEqSplDb) {
  if (!Number.isFinite(targetSplDb) || !Number.isFinite(currentPostEqSplDb)) return null;
  return targetSplDb - currentPostEqSplDb;
}

export function resolveRequiredCorrectionDb({ targetSplDb, currentPostEqSplDb, protectedNull = false }) {
  const required = requiredCorrectionDb(targetSplDb, currentPostEqSplDb);
  if (!Number.isFinite(required)) return null;
  return protectedNull && required > 0 ? 0 : required;
}