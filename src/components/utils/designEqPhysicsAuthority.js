import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";

const finite = (value) => Number.isFinite(Number(value));

// Peak classification threshold (dB). Response residuals above this value
// are treated as modal peaks (cut-only). Small positive deviations below
// this threshold remain eligible for normal corrective boost so broad
// deficits below the house curve are not blocked by minor local variation.
const PEAK_CLASSIFICATION_THRESHOLD_DB = 2.5;

export function curveSplAt(curve, frequency) {
  const points = (Array.isArray(curve) ? curve : []).filter((point) => finite(point?.frequency) && finite(point?.spl));
  if (!points.length || !finite(frequency)) return null;
  if (frequency <= points[0].frequency) return Number(points[0].spl);
  if (frequency >= points.at(-1).frequency) return Number(points.at(-1).spl);
  const upperIndex = points.findIndex((point) => Number(point.frequency) >= Number(frequency));
  const low = points[upperIndex - 1];
  const high = points[upperIndex];
  const ratio = (Number(frequency) - Number(low.frequency)) / (Number(high.frequency) - Number(low.frequency));
  return Number(low.spl) + (Number(high.spl) - Number(low.spl)) * ratio;
}

export function classifyEqCorrectionRegion({ frequency, rawSpl, currentSpl, targetSpl, protectedNull = false,
  widthOctaves = null, requestedGainDb = null, permittedBoostDb = null }) {
  const rawResidualDb = finite(rawSpl) && finite(targetSpl) ? Number(rawSpl) - Number(targetSpl) : null;
  const currentResidualDb = finite(currentSpl) && finite(targetSpl) ? Number(currentSpl) - Number(targetSpl) : rawResidualDb;
  if (protectedNull) return { classification: "Null", expectedAction: "Protect", rawResidualDb, currentResidualDb,
    reason: "Deep narrow cancellation region is protected from corrective EQ." };
  // Width-aware peak classification (Sound Proof design prediction mode):
  // A local raw peak inside a broad deficit should not veto corrective boost.
  // Broad regions (>= 1/3 octave) are evaluated by the resulting corrected
  // response, not by a single raw sample. Only narrow (high-Q) positive
  // residuals above the threshold are treated as true modal peaks (cut-only).
  // This preserves narrow peak protection while allowing broad deficits to
  // receive boost up to the +6 dB EQ limit, predicting what a competent
  // cinema calibrator would achieve.
  const isBroadRegion = finite(widthOctaves) && widthOctaves >= 1 / 3;
  const trendShowsPeak = finite(currentResidualDb) && currentResidualDb > PEAK_CLASSIFICATION_THRESHOLD_DB;
  const rawPeakVetoesBoost = finite(rawResidualDb) && rawResidualDb > PEAK_CLASSIFICATION_THRESHOLD_DB
    && !isBroadRegion;
  if (trendShowsPeak || rawPeakVetoesBoost) {
    return { classification: "Peak", expectedAction: "Cut", rawResidualDb, currentResidualDb,
      reason: "Positive response residual exceeds the peak threshold and may only receive attenuation." };
  }
  const narrowDeepDeficit = finite(currentResidualDb) && currentResidualDb <= -10 && finite(widthOctaves) && widthOctaves < 1 / 3;
  if (narrowDeepDeficit) return { classification: "Null", expectedAction: "Protect", rawResidualDb, currentResidualDb,
    reason: "Deep narrow deficit is treated as likely destructive cancellation." };
  return { classification: "Valley", expectedAction: "Boost within +6 dB limit", rawResidualDb, currentResidualDb,
    reason: "Broad response deficit may receive correction within the fixed EQ boost limit." };
}

export function validatePhysicalEqAction(classification, appliedCorrectionDb) {
  const correction = Number(appliedCorrectionDb);
  if (!finite(correction) || Math.abs(correction) <= 0.05) return { passed: true, actualAction: "No material change" };
  const actualAction = correction < 0 ? "Cut" : "Boost";
  if (classification === "Peak" && correction > 0) return { passed: false, actualAction, reason: "Positive gain is forbidden at a modal peak." };
  if (classification === "Null") return { passed: false, actualAction, reason: "Corrective EQ is forbidden inside a protected null." };
  return { passed: true, actualAction };
}

export function findAggregatePeakBoostViolations(rawCurve, postEqCurve, targetCurve) {
  return (Array.isArray(rawCurve) ? rawCurve : []).map((point) => {
    const targetSpl = interpolateCanonicalTarget(targetCurve, point.frequency);
    const finalSpl = curveSplAt(postEqCurve, point.frequency);
    const rawResidualDb = finite(targetSpl) ? Number(point.spl) - Number(targetSpl) : null;
    const aggregateCorrectionDb = finite(finalSpl) ? Number(finalSpl) - Number(point.spl) : null;
    return { frequencyHz: Number(point.frequency), rawSpl: Number(point.spl), targetSpl, rawResidualDb, aggregateCorrectionDb };
  }).filter((point) => finite(point.rawResidualDb)
    && point.rawResidualDb > PEAK_CLASSIFICATION_THRESHOLD_DB
    && finite(point.aggregateCorrectionDb) && point.aggregateCorrectionDb > 0.05);
}

export function buildFilterDecisionDiagnostics(filters, rawCurve, postEqCurve, targetCurve, protectedNullRegions = []) {
  return (Array.isArray(filters) ? filters : []).filter((filter) => filter?.enabled).map((filter) => {
    const frequency = Number(filter.frequencyHz);
    const beforeEqSpl = curveSplAt(rawCurve, frequency);
    const targetSpl = interpolateCanonicalTarget(targetCurve, frequency);
    const finalSpl = curveSplAt(postEqCurve, frequency);
    const protectedNull = isProtectedFrequency(frequency, protectedNullRegions);
    const authority = classifyEqCorrectionRegion({
      frequency, rawSpl: beforeEqSpl, currentSpl: beforeEqSpl, targetSpl, protectedNull,
      widthOctaves: filter.widthOctaves, requestedGainDb: filter.gainDb,
    });
    const aggregateCorrectionAtFrequencyDb = finite(finalSpl) && finite(beforeEqSpl) ? finalSpl - beforeEqSpl : null;
    const action = validatePhysicalEqAction(authority.classification, aggregateCorrectionAtFrequencyDb);
    return {
      frequencyHz: frequency,
      gainDb: Number(filter.gainDb),
      Q: Number(filter.Q),
      filterType: filter.type || "Peak",
      classification: authority.classification,
      beforeEqSpl,
      targetSpl,
      expectedAction: authority.expectedAction,
      actualAction: action.actualAction,
      finalSpl,
      decision: action.passed ? "Accepted" : "Rejected",
      reason: action.reason || filter.reason || authority.reason,
      aggregateCorrectionAtFrequencyDb,
    };
  });
}