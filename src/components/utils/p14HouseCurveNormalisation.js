const THIRD_OCTAVE_CENTRES_HZ = Object.freeze([
  16, 20, 25, 31.5, 40, 50, 63, 80, 100,
]);

const REQUIRED_EXTENSION_HZ = Object.freeze({
  minimum: Object.freeze({ 1: 35, 2: 30, 3: 20, 4: 18 }),
  recommended: Object.freeze({ 1: 30, 2: 25, 3: 18, 4: 15 }),
});

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
  const basis = targetBasis === "recommended" ? "recommended" : "minimum";
  const selectedLevel = Math.max(1, Math.min(4, Math.round(Number(level) || 4)));
  return REQUIRED_EXTENSION_HZ[basis][selectedLevel];
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