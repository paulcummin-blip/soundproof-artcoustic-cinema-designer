// p19AbsoluteTargetDeviation.js
//
// P19 deviation primitives.
//
// Published Sound Proof P19 compares a calibrated response with the stored
// final calibrated RSP response (Reference EQ). The RSP therefore compares
// Reference EQ with the same Reference EQ and resolves naturally to 0 dB.
//
// The earlier practical target remains available only to the calibration
// optimiser as a target-fit diagnostic. It is not a published P19 authority.
//
// What this helper does:
//   1. Residual calculation: response(f) − T(f), where T(f) is the
//      P14-anchored practical calibration target (absolute, not a floating
//      shape).
//   2. Interpolation against the absolute target via interpolateCanonicalTarget.
//   3. Protected null region exclusion — narrow uncorrectable nulls that a
//      calibrator would not equalise are excluded from the max-abs scan.
//   4. Maximum absolute deviation: max |residual(f)| over the assessment
//      band [P18 F3 → transition].
//   5. Returned diagnostic values: worst frequency, residual curve, level.
//
// This helper sits below both the assessment layer and the optimiser as a
// common utility. The assessment layer and optimiser are consumers, not
// owners, of the metric.

import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";
import { isProtectedSmoothedFrequency } from "@/components/utils/houseCurveFitProtection";
import { levelP19_lfResponse, numericRp22Level } from "@/components/utils/rp22/levels";

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

// Normalize, smooth (1/3-octave), and filter to the assessment band.
function normalizedSmoothedAssessedCurve(curve, startHz, endHz) {
  return applyBassSmoothing(
    (Array.isArray(curve) ? curve : [])
      .filter((point) => finite(point?.frequency) && finite(point?.spl))
      .map((point) => ({ frequency: Number(point.frequency), spl: Number(point.spl) }))
      .sort((a, b) => a.frequency - b.frequency),
    "third"
  ).filter((point) => point.frequency >= startHz && point.frequency <= endHz && finite(point.spl));
}

// Resolve the absolute target level T(f) at a given frequency.
// When a canonical target curve is provided, interpolate it.
// When no target curve is available (tests / fallback), use the house-curve
// shape only so the residual is response − shape (matching the legacy
// residualSpan behaviour for symmetric test curves).
function resolveAbsoluteTargetDb(canonicalTargetCurve, frequency) {
  if (Array.isArray(canonicalTargetCurve) && canonicalTargetCurve.length) {
    const interpolated = interpolateCanonicalTarget(canonicalTargetCurve, frequency);
    if (Number.isFinite(interpolated)) return interpolated;
  }
  const shapeOffset = artcousticHouseCurveOffsetAt(frequency);
  return Number.isFinite(shapeOffset) ? shapeOffset : null;
}

// Core scan: compute residual points, exclude protected nulls, find max abs
// deviation. Returns { maxAbsDeviationDb, worstFrequencyHz, residualCurve }.
function scanMaxAbsoluteDeviation(smoothedAssessedCurve, canonicalTargetCurve, protectedNullRegions) {
  let maxAbsDeviationDb = -Infinity;
  let worstFrequencyHz = null;
  const residualCurve = [];
  const hasProtectedNulls = Array.isArray(protectedNullRegions) && protectedNullRegions.length > 0;

  for (const point of smoothedAssessedCurve) {
    const targetDb = resolveAbsoluteTargetDb(canonicalTargetCurve, point.frequency);
    if (!Number.isFinite(targetDb)) continue;
    const residualDb = point.spl - targetDb;
    if (!Number.isFinite(residualDb)) continue;
    const isProtected = hasProtectedNulls && isProtectedSmoothedFrequency(point.frequency, protectedNullRegions);
    residualCurve.push({ frequency: point.frequency, spl: point.spl, targetDb, residualDb, protected: isProtected });
    if (isProtected) continue;
    const absDeviationDb = Math.abs(residualDb);
    if (absDeviationDb > maxAbsDeviationDb) {
      maxAbsDeviationDb = absDeviationDb;
      worstFrequencyHz = point.frequency;
    }
  }

  if (!Number.isFinite(maxAbsDeviationDb)) return null;
  return { maxAbsDeviationDb, worstFrequencyHz, residualCurve };
}

/**
 * Full P19 evaluation: smooth, assess, scan, grade.
 *
 * This is the calibration target-fit evaluator used by the optimiser and
 * house-curve fitter. Published P19 uses evaluateP19ReferenceEqDeviation.
 *
 * @param {object} params
 * @param {Array}  params.rspPostEqCurve        - post-EQ RSP curve [{frequency, spl}]
 * @param {Array}  params.canonicalTargetCurve   - P14-anchored absolute target T(f)
 * @param {number} params.assessmentStartHz      - assessment band lower bound (P18 F3)
 * @param {number} params.assessmentEndHz       - assessment band upper bound (transition)
 * @param {Array}  [params.protectedNullRegions] - protected null regions to exclude
 * @returns {object|null} P19 result or null when no valid points exist
 */
export function evaluateP19AbsoluteTargetDeviation({
  rspPostEqCurve,
  canonicalTargetCurve,
  assessmentStartHz,
  assessmentEndHz,
  protectedNullRegions = [],
}) {
  const smoothedAssessedCurve = normalizedSmoothedAssessedCurve(rspPostEqCurve, assessmentStartHz, assessmentEndHz);
  if (!smoothedAssessedCurve.length) return null;

  const scan = scanMaxAbsoluteDeviation(smoothedAssessedCurve, canonicalTargetCurve, protectedNullRegions);
  if (!scan) return null;

  const { maxAbsDeviationDb, worstFrequencyHz, residualCurve } = scan;
  const level = numericRp22Level(levelP19_lfResponse(maxAbsDeviationDb));

  return {
    variationDbRaw: maxAbsDeviationDb,
    totalRspToTargetDifferenceDbRaw: maxAbsDeviationDb,
    displayVariationDb: maxAbsDeviationDb,
    level,
    worstFrequencyHz,
    maxAbsDeviationDb,
    residualCurve,
    sourceCurve: smoothedAssessedCurve,
  };
}

/**
 * Published P19 evaluation against the stored Reference EQ.
 *
 * Both curves receive the same normalisation and 1/3-octave smoothing before
 * comparison. Equal stored curves therefore remain mathematically identical;
 * no RSP override or forced grade is needed.
 */
export function evaluateP19ReferenceEqDeviation({
  responseCurve,
  referenceEqCurve,
  assessmentStartHz,
  assessmentEndHz,
  protectedNullRegions = [],
}) {
  const smoothedResponse = normalizedSmoothedAssessedCurve(responseCurve, assessmentStartHz, assessmentEndHz);
  const smoothedReferenceEq = normalizedSmoothedAssessedCurve(referenceEqCurve, assessmentStartHz, assessmentEndHz);
  if (!smoothedResponse.length || !smoothedReferenceEq.length) return null;

  const scan = scanMaxAbsoluteDeviation(smoothedResponse, smoothedReferenceEq, protectedNullRegions);
  if (!scan) return null;

  const { maxAbsDeviationDb, worstFrequencyHz, residualCurve } = scan;
  const level = numericRp22Level(levelP19_lfResponse(maxAbsDeviationDb));
  return {
    variationDbRaw: maxAbsDeviationDb,
    totalRspToTargetDifferenceDbRaw: maxAbsDeviationDb,
    displayVariationDb: maxAbsDeviationDb,
    level,
    worstFrequencyHz,
    maxAbsDeviationDb,
    residualCurve,
    sourceCurve: smoothedResponse,
    referenceEqCurve: smoothedReferenceEq,
  };
}

/**
 * Low-level max-abs scan from pre-computed residual points.
 *
 * Used by the house-curve fitter's summarizeSeatMetrics, which already has
 * smoothed+assessed residual points with deviationDb pre-computed. This
 * function applies protected null exclusion and finds max |deviationDb|.
 *
 * This guarantees the fitter's rspMaxDeviationDb and worstSeatMaxDeviationDb
 * use exactly the same exclusion + max-abs logic as the published P19.
 *
 * @param {Array}  residualPoints              - pre-computed points [{frequency, deviationDb, ...}]
 * @param {Array}  [protectedNullRegions]      - protected null regions to exclude
 * @returns {object|null} { maxAbsDeviationDb, worstFrequencyHz } or null
 */
export function scanMaxAbsoluteDeviationFromResidualPoints(residualPoints, protectedNullRegions = []) {
  if (!Array.isArray(residualPoints) || !residualPoints.length) return null;
  let maxAbsDeviationDb = -Infinity;
  let worstFrequencyHz = null;
  const hasProtectedNulls = Array.isArray(protectedNullRegions) && protectedNullRegions.length > 0;

  for (const point of residualPoints) {
    if (!finite(point?.frequency) || !finite(point?.deviationDb)) continue;
    if (hasProtectedNulls && isProtectedSmoothedFrequency(point.frequency, protectedNullRegions)) continue;
    const absDeviationDb = Math.abs(Number(point.deviationDb));
    if (absDeviationDb > maxAbsDeviationDb) {
      maxAbsDeviationDb = absDeviationDb;
      worstFrequencyHz = point.frequency;
    }
  }

  if (!Number.isFinite(maxAbsDeviationDb)) return null;
  return { maxAbsDeviationDb, worstFrequencyHz };
}

