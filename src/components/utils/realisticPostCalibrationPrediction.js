/**
 * Realistic Post-Calibration Prediction
 *
 * Predicts the realistic post-calibration in-room response that a competent
 * modern EQ/calibration system (Trinnov / Dirac / StormAudio / ARC / Lyngdorf)
 * could achieve — without modelling actual PEQ/FIR filters.
 *
 * Core model (per frequency):
 *   error = houseTarget - productAwareRawResponse
 *   if error > 0 (below target):  boost = min(error, +6 dB)
 *   if error < 0 (above target):  cut  = max(error, -15 dB)
 *
 * Constraints:
 *   - Deep narrow nulls (≥10 dB below surroundings, ≤6 Hz wide) are not boosted.
 *   - Boost is further limited by product capability (source-domain headroom
 *     and frequency coverage).
 *   - The product + room maximum curve is a hard ceiling (applied downstream
 *     by capCurveToProductOperatingEnvelope).
 *
 * The correction is derived from the RSP response only. The same correction
 * is applied to all seats (see applyBankToSeats in canonicalBassOptimiser.js).
 */

import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";

const MAX_BOOST_DB = 6;
const MAX_CUT_DB = 15;

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
 * Predict the realistic post-calibration correction curve.
 *
 * @param {object} params
 * @param {Array}  params.rawRspCurve              - Product-aware raw in-room response at RSP (level-normalised)
 * @param {Array}  params.targetCurve              - House target curve
 * @param {Array}  [params.protectedNullRegions]    - Deep narrow null regions (from identifyProtectedNullRegions)
 * @param {Array}  [params.activeSubs]             - Active subwoofer objects
 * @param {number} [params.usableLfHz]             - Usable LF frequency
 * @param {number} [params.requestedSystemOutputDb] - Requested system output (P14 target)
 * @returns {Array} Correction curve [{frequency, spl}] in dB (positive = boost, negative = cut)
 */
export function predictRealisticPostCalibrationCorrection({
  rawRspCurve,
  targetCurve,
  protectedNullRegions = [],
  activeSubs = [],
  usableLfHz = null,
  requestedSystemOutputDb = null,
}) {
  if (!Array.isArray(rawRspCurve) || !rawRspCurve.length) return [];

  return rawRspCurve.map((point) => {
    const frequency = point.frequency;
    const rawSpl = Number(point.spl);
    const targetSpl = interpolateValue(targetCurve, frequency);

    if (!Number.isFinite(rawSpl) || !Number.isFinite(targetSpl)) {
      return { frequency, spl: 0 };
    }

    const errorDb = targetSpl - rawSpl; // positive = below target, negative = above target
    const inProtectedNull = isProtectedFrequency(frequency, protectedNullRegions);

    let correctionDb;
    if (inProtectedNull) {
      // Deep narrow null — do not boost into an extreme acoustic cancellation.
      // The null remains substantially intact in the final response.
      correctionDb = 0;
    } else if (errorDb > 0) {
      // Below target — boost, limited to +6 dB and by product capability.
      const nominalBoost = Math.min(errorDb, MAX_BOOST_DB);
      if (!Array.isArray(activeSubs) || !activeSubs.length) {
        correctionDb = nominalBoost;
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
}