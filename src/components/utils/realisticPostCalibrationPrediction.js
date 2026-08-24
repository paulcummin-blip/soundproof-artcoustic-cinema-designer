/**
 * Realistic Post-Calibration Prediction
 *
 * Predicts the realistic post-calibration in-room response that a competent
 * modern EQ/calibration system (Trinnov / Dirac / StormAudio / ARC / Lyngdorf)
 * could achieve — without modelling actual PEQ/FIR filters.
 *
 * Core model (per frequency):
 *   M(f)     = Product + room maximum (physical ceiling)
 *   O(f)     = M(f) + globalTrimDb          (global volume trim → operating response)
 *   error    = houseTarget - O(f)            (residual after level normalisation)
 *   if error > 0 (below target):  boost = min(error, +6 dB, -globalTrimDb)
 *   if error < 0 (above target):  cut  = max(error, -15 dB)
 *
 * Constraints:
 *   - globalTrimDb = min(0, median(target - smoothedMaximum)) over the P19 band.
 *   - Deep narrow nulls (≥10 dB below surroundings, ≤6 Hz wide) are not boosted.
 *   - Boost is further limited by product capability (source-domain headroom
 *     and frequency coverage).
 *   - FinalEQ = O(f) + correction, clamped to M(f) (applied downstream).
 *
 * The correction is derived from the RSP response only. The same correction
 * is applied to all seats (see applyBankToSeats in canonicalBassOptimiser.js).
 */

import { isProtectedFrequency, isProtectedSmoothedFrequency } from "@/components/utils/houseCurveFitProtection";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";

const MAX_BOOST_DB = 6;
const MAX_CUT_DB = 15;
const CORRECTION_SMOOTHING_WEIGHTS = Object.freeze([1, 6, 1]);

/**
 * Lightly round the predicted correction envelope without smoothing any
 * acoustic response or changing what the optimiser can achieve.
 *
 * The centre-weighted three-point window only relaxes an existing correction toward
 * zero: it can never add boost, add cut, reverse correction sign, exceed the
 * +6/-15 dB limits, or bridge across a protected cancellation null. Protected
 * null points remain exactly 0 dB correction.
 */
export function smoothPredictedCorrectionEnvelope(correctionCurve, protectedNullRegions = []) {
  if (!Array.isArray(correctionCurve) || correctionCurve.length < 3) {
    return Array.isArray(correctionCurve) ? correctionCurve.map((point) => ({ ...point })) : [];
  }

  const protectedMask = correctionCurve.map((point) =>
    isProtectedFrequency(point?.frequency, protectedNullRegions));
  const radius = Math.floor(CORRECTION_SMOOTHING_WEIGHTS.length / 2);

  return correctionCurve.map((point, index) => {
    const originalDb = Number(point?.spl);
    if (!Number.isFinite(originalDb)) return { ...point };
    if (protectedMask[index]) return { ...point, spl: 0 };

    let weightedTotal = 0;
    let weightTotal = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sampleIndex = index + offset;
      if (sampleIndex < 0 || sampleIndex >= correctionCurve.length) continue;
      const pathStart = Math.min(index, sampleIndex);
      const pathEnd = Math.max(index, sampleIndex);
      let crossesProtectedNull = false;
      for (let pathIndex = pathStart; pathIndex <= pathEnd; pathIndex += 1) {
        if (protectedMask[pathIndex]) { crossesProtectedNull = true; break; }
      }
      if (crossesProtectedNull) continue;
      const sampleDb = Number(correctionCurve[sampleIndex]?.spl);
      if (!Number.isFinite(sampleDb)) continue;
      const weight = CORRECTION_SMOOTHING_WEIGHTS[offset + radius];
      weightedTotal += sampleDb * weight;
      weightTotal += weight;
    }

    if (!weightTotal) return { ...point };
    const averagedDb = weightedTotal / weightTotal;
    // Smooth inward only. This rounds artificial corners without claiming
    // correction that the unsmoothed physical model did not allow.
    const smoothedDb = originalDb > 0
      ? Math.min(originalDb, Math.max(0, averagedDb))
      : originalDb < 0
        ? Math.max(originalDb, Math.min(0, averagedDb))
        : 0;
    return { ...point, spl: smoothedDb };
  });
}

function interpolateValue(curve, frequency) {
  if (!Array.isArray(curve) || !curve.length) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  const upperIndex = curve.findIndex((point) => point.frequency >= frequency);
  const low = curve[upperIndex - 1];
  const high = curve[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}

/**
 * Compute the global operating-level trim from the relationship between the
 * Product + room maximum capability and the house target across the P19
 * assessment band.
 *
 *   difference(f) = HouseTarget(f) - ProductRoomMaximum(f)
 *   globalTrimDb  = min(0, median(valid difference(f)))
 *
 * Uses 1/3-octave-smoothed response so isolated modal spikes/nulls do not
 * dominate the master volume decision. Frequencies inside protected
 * cancellation-null regions (including their smoothing skirts) are excluded.
 *
 * @param {object} params
 * @param {Array}  params.maximumCapabilityCurve  - M(f) = Product + room maximum [{frequency, spl}]
 * @param {Array}  params.targetCurve             - House target curve [{frequency, spl}]
 * @param {number} params.assessmentStartHz      - P19 band start
 * @param {number} params.assessmentEndHz        - P19 band end
 * @param {Array}  [params.protectedNullRegions]  - Deep narrow null regions
 * @returns {number} globalTrimDb (≤ 0; 0 when no valid data or positive median)
 */
export function computeGlobalOperatingTrimDb({
  maximumCapabilityCurve, targetCurve, assessmentStartHz, assessmentEndHz,
  protectedNullRegions = [],
}) {
  if (!Array.isArray(maximumCapabilityCurve) || !maximumCapabilityCurve.length) return 0;
  if (!Number.isFinite(assessmentStartHz) || !Number.isFinite(assessmentEndHz)) return 0;
  if (assessmentEndHz <= assessmentStartHz) return 0;

  // 1/3-octave smoothing so isolated modal spikes/nulls do not determine the
  // master volume.
  const smoothedMaximum = applyBassSmoothing(maximumCapabilityCurve, "third");

  const differences = smoothedMaximum
    .filter((point) => Number.isFinite(point?.frequency) && Number.isFinite(point?.spl)
      && point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz
      && !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions))
    .map((point) => {
      const targetSpl = interpolateValue(targetCurve, point.frequency);
      if (!Number.isFinite(targetSpl)) return null;
      return targetSpl - point.spl; // difference = target - maximum
    })
    .filter((diff) => diff !== null && Number.isFinite(diff));

  if (!differences.length) return 0;

  differences.sort((a, b) => a - b);
  const mid = Math.floor(differences.length / 2);
  const median = differences.length % 2 === 0
    ? (differences[mid - 1] + differences[mid]) / 2
    : differences[mid];

  // No positive global gain — the system is already at maximum capability.
  return Math.min(0, median);
}

/**
 * Predict the realistic post-calibration correction curve with a global
 * operating-level normalisation stage.
 *
 * Real-world calibration sequence:
 *   M(f)  = Product + room maximum (physical ceiling)
 *   O(f)  = M(f) + globalTrimDb     (global volume trim → operating response)
 *   error = HouseTarget - O(f)     (residual after level normalisation)
 *   cut  ≤ -15 dB; boost ≤ +6 dB and ≤ available headroom (= -globalTrimDb)
 *   FinalEQ = O(f) + correction, clamped to M(f)
 *
 * The global trim and RSP-derived correction are applied identically to all
 * seats (see applyBankToSeats in canonicalBassOptimiser.js).
 *
 * @param {object} params
 * @param {Array}  params.maximumCapabilityCurve  - M(f) = Product + room maximum [{frequency, spl}]
 * @param {Array}  params.targetCurve             - House target curve [{frequency, spl}]
 * @param {number} params.assessmentStartHz      - P19 band start (for global trim)
 * @param {number} params.assessmentEndHz        - P19 band end (for global trim)
 * @param {Array}  [params.protectedNullRegions]    - Deep narrow null regions
 * @param {Array}  [params.activeSubs]             - Active subwoofer objects
 * @param {number} [params.usableLfHz]             - Usable LF frequency
 * @param {number} [params.requestedSystemOutputDb] - Requested system output (P14 target)
 * @returns {{ correctionCurve: Array, globalTrimDb: number, operatingPreEqCurve: Array }}
 */
export function predictRealisticPostCalibrationCorrection({
  maximumCapabilityCurve,
  targetCurve,
  assessmentStartHz,
  assessmentEndHz,
  protectedNullRegions = [],
  activeSubs = [],
  usableLfHz = null,
  requestedSystemOutputDb = null,
}) {
  if (!Array.isArray(maximumCapabilityCurve) || !maximumCapabilityCurve.length) {
    return { correctionCurve: [], globalTrimDb: 0, operatingPreEqCurve: [] };
  }

  // ── Stage 1: Global operating-level normalisation ──
  const globalTrimDb = computeGlobalOperatingTrimDb({
    maximumCapabilityCurve, targetCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions,
  });

  // ── Stage 2: Operating response O(f) = M(f) + globalTrimDb ──
  const operatingPreEqCurve = maximumCapabilityCurve.map((point) => ({
    frequency: point.frequency,
    spl: Number.isFinite(point.spl) ? point.spl + globalTrimDb : point.spl,
  }));

  // Available boost headroom = M(f) - O(f) = -globalTrimDb (constant across frequency)
  const availableBoostHeadroomDb = Math.max(0, -globalTrimDb);

  // ── Stage 3: Realistic EQ correction from O(f) ──
  const rawCorrectionCurve = maximumCapabilityCurve.map((point) => {
    const frequency = point.frequency;
    const operatingSpl = Number.isFinite(point.spl) ? point.spl + globalTrimDb : null;
    const targetSpl = interpolateValue(targetCurve, frequency);

    if (!Number.isFinite(operatingSpl) || !Number.isFinite(targetSpl)) {
      return { frequency, spl: 0 };
    }

    const errorDb = targetSpl - operatingSpl; // positive = below target, negative = above
    const inProtectedNull = isProtectedFrequency(frequency, protectedNullRegions);

    let correctionDb;
    if (inProtectedNull) {
      // Deep narrow null — the global trim still applies (system-wide level),
      // but frequency-specific correction is ~0 dB. The null remains intact.
      correctionDb = 0;
    } else if (errorDb > 0) {
      // Below target — boost, limited to +6 dB, available physical headroom,
      // and product capability.
      const nominalBoost = Math.min(errorDb, MAX_BOOST_DB, availableBoostHeadroomDb);
      if (!Array.isArray(activeSubs) || !activeSubs.length) {
        correctionDb = Math.max(0, nominalBoost);
      } else {
        const allowance = getSourceDomainBoostAllowance({
          frequency,
          requestedBoostDb: nominalBoost,
          activeSubs,
          usableLfHz,
          maxBoostDb: MAX_BOOST_DB,
          requestedSystemOutputDb,
        });
        correctionDb = Math.max(0, Math.min(nominalBoost, Number(allowance.allowedBoostDb) || 0));
      }
    } else {
      // Above target — cut, limited to -15 dB.
      correctionDb = Math.max(errorDb, -MAX_CUT_DB);
    }

    return { frequency, spl: correctionDb };
  });

  // ── Stage 4: Light correction-envelope smoothing ──
  // Only the predicted gain envelope is rounded. M(f), O(f), the house target,
  // protected nulls and all RP22 assessment curves remain untouched.
  const correctionCurve = smoothPredictedCorrectionEnvelope(rawCorrectionCurve, protectedNullRegions);

  return { correctionCurve, rawCorrectionCurve, globalTrimDb, operatingPreEqCurve };
}