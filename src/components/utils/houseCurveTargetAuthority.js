import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

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