import { p18ThresholdHzForLevel } from "@/components/utils/p18ExtensionAuthority";

const THIRD_OCTAVE_CENTRES_HZ = Object.freeze([
  16, 20, 25, 31.5, 40, 50, 63, 80, 100,
]);

const pointValue = (point) => Number(point?.spl ?? point?.offsetDb ?? point?.db);

function interpolateShape(curve, frequency) {
  const points = (curve || [])
    .map((point) => ({ frequency: Number(point?.frequency ?? point?.hz), db: pointValue(point) }))
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.db))
    .sort((a, b) => a.frequency - b.frequency);
  if (!points.length || frequency < points[0].frequency || frequency > points.at(-1).frequency) return null;
  const upperIndex = points.findIndex((point) => point.frequency >= frequency);
  if (upperIndex <= 0) return points[0].db;
  const low = points[upperIndex - 1];
  const high = points[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.db + ((high.db - low.db) * ratio);
}

export function cWeightingCorrectionDb(frequencyHz) {
  const f = Number(frequencyHz);
  if (!Number.isFinite(f) || f <= 0) return null;
  const f2 = f * f;
  const c = ((12200 ** 2) * f2) / ((f2 + (20.6 ** 2)) * (f2 + (12200 ** 2)));
  return 20 * Math.log10(c) + 0.06;
}

export function requiredP14ExtensionHz(targetBasis, level) {
  return p18ThresholdHzForLevel(targetBasis, level);
}

export function normaliseHouseCurveToP14Total({
  houseCurveShape,
  selectedP14TargetDb,
  requiredExtensionHz,
  upperLfeHz = 120,
} = {}) {
  const targetDb = Number(selectedP14TargetDb);
  const lowerHz = Number(requiredExtensionHz);
  const upperHz = Number(upperLfeHz);
  if (!Number.isFinite(targetDb) || !Number.isFinite(lowerHz) || !Number.isFinite(upperHz)) return null;

  const bands = THIRD_OCTAVE_CENTRES_HZ
    .filter((frequency) => frequency >= lowerHz && frequency <= upperHz)
    .map((frequency) => {
      const houseCurveBandDb = interpolateShape(houseCurveShape, frequency);
      const cCorrectionDb = cWeightingCorrectionDb(frequency);
      if (!Number.isFinite(houseCurveBandDb) || !Number.isFinite(cCorrectionDb)) return null;
      return { frequencyHz: frequency, houseCurveBandDb, cWeightingCorrectionDb: cCorrectionDb };
    })
    .filter(Boolean);
  if (!bands.length) return null;

  const relativePower = bands.reduce((sum, band) => (
    sum + (10 ** ((band.houseCurveBandDb + band.cWeightingCorrectionDb) / 10))
  ), 0);
  const relativeIntegratedDb = 10 * Math.log10(relativePower);
  const operatingCurveOffsetDb = targetDb - relativeIntegratedDb;
  const includedThirdOctaveBands = bands.map((band) => ({
    ...band,
    normalisedBandDb: band.houseCurveBandDb + operatingCurveOffsetDb,
    weightedBandDb: band.houseCurveBandDb + operatingCurveOffsetDb + band.cWeightingCorrectionDb,
  }));
  const integratedCWeightedDb = 10 * Math.log10(includedThirdOctaveBands.reduce(
    (sum, band) => sum + (10 ** (band.weightedBandDb / 10)),
    0,
  ));

  return {
    selectedP14TargetDb: targetDb,
    requiredExtensionHz: lowerHz,
    operatingCurveOffsetDb,
    integratedCWeightedDb,
    includedThirdOctaveBands,
  };
}

/**
 * C-weighted integrated level of a raw response curve over the P14 assessment
 * band. Uses the same third-octave band centres and C-weighting as
 * normaliseHouseCurveToP14Total so the raw response and the house-curve target
 * are integrated on the same basis.
 *
 * Returns the integrated dBC value, or null when no valid bands are available.
 */
export function integrateRawResponseLevelDbC({ rawCurve, lowerHz, upperHz = 120 } = {}) {
  const lower = Number(lowerHz);
  const upper = Number(upperHz);
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) return null;
  const bands = THIRD_OCTAVE_CENTRES_HZ
    .filter((frequency) => frequency >= lower && frequency <= upper)
    .map((frequency) => {
      const rawSplDb = interpolateShape(rawCurve, frequency);
      const cCorrectionDb = cWeightingCorrectionDb(frequency);
      if (!Number.isFinite(rawSplDb) || !Number.isFinite(cCorrectionDb)) return null;
      return { frequencyHz: frequency, rawSplDb, cWeightingCorrectionDb: cCorrectionDb };
    })
    .filter(Boolean);
  if (!bands.length) return null;
  const power = bands.reduce((sum, band) =>
    sum + (10 ** ((band.rawSplDb + band.cWeightingCorrectionDb) / 10)), 0);
  return 10 * Math.log10(power);
}

/**
 * Development diagnostic — proves the rendered house curve integrates to the
 * selected P14 target (e.g. 109 dBC for Minimum L1).
 *
 * Returns the exact object specified in the acceptance test:
 *   { selectedP14TargetDb, requiredExtensionHz, includedBands,
 *     operatingOffsetDb, integratedCWeightedDb, errorDb }
 *
 * Acceptance: |errorDb| <= 0.05 dB
 */
export function diagnoseHouseCurveP14Integration({
  houseCurveShape,
  selectedP14TargetDb,
  requiredExtensionHz,
  upperLfeHz = 120,
} = {}) {
  const result = normaliseHouseCurveToP14Total({
    houseCurveShape,
    selectedP14TargetDb,
    requiredExtensionHz,
    upperLfeHz,
  });
  if (!result) {
    return {
      selectedP14TargetDb: Number(selectedP14TargetDb) || null,
      requiredExtensionHz: Number(requiredExtensionHz) || null,
      includedBands: [],
      operatingOffsetDb: null,
      integratedCWeightedDb: null,
      errorDb: null,
    };
  }
  const errorDb = result.integratedCWeightedDb - result.selectedP14TargetDb;
  return {
    selectedP14TargetDb: result.selectedP14TargetDb,
    requiredExtensionHz: result.requiredExtensionHz,
    includedBands: result.includedThirdOctaveBands.map((band) => ({
      frequencyHz: band.frequencyHz,
      normalisedBandDb: band.normalisedBandDb,
      weightedBandDb: band.weightedBandDb,
    })),
    operatingOffsetDb: result.operatingCurveOffsetDb,
    integratedCWeightedDb: result.integratedCWeightedDb,
    errorDb,
  };
}