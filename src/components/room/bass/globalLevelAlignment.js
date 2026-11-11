// globalLevelAlignment.js
//
// Global Level Alignment — the final calibration stage before Reference EQ publication.
//
// PURPOSE
//   After the final predicted post-EQ response has been produced by all
//   optimisation stages, a professional calibrator would set the overall
//   subwoofer trim to the best operating level before assessing the finished
//   result. This module determines that optimum global bass trim.
//
//   This is NOT another optimisation stage. It does NOT change placement,
//   phase, delay, polarity, relative subwoofer gain, or EQ. It only shifts the
//   entire response vertically (a single global offset) to minimise the P19
//   metric, exactly as a calibrator would turn the subwoofer trim dial.
//
// METHOD
//   1. Determine available upward headroom from the final P14 result
//      (achieved capability minus requested target).
//   2. Allow downward adjustment without restriction (bounded only by a
//      generous calibration sweep range).
//   3. Sweep a single global offset across the permitted range in 0.25 dB
//      steps.
//   4. For every offset: shift the ENTIRE response vertically — do not alter
//      response shape, EQ, phase, delay, or relative gain.
//   5. Calculate the internal target-fit metric at each offset.
//   6. Select the offset producing the minimum internal target-fit error.
//
// CONSTRAINTS
//   - This stage must never improve P14. It can only use genuine available
//     headroom. If insufficient upward headroom exists, the search is limited
//     accordingly.
//   - The response shape remains mathematically identical — only a vertical
//     translation is permitted.
//   - If no better operating level exists, the recommended trim is exactly
//     0.0 dB and P19 remains unchanged.
//   - No RP22 grading thresholds are altered. No P14 calculations are altered.

import { computeCorrectableP19Diagnostic } from "@/components/utils/bassAuthoritativeAssessment";

const STEP_DB = 0.25;
const DOWNWARD_RANGE_DB = 12; // generous downward sweep (unrestricted by capability)
const HEADROOM_LIMITED_EPSILON_DB = 0.01;
const CEILING_TOLERANCE_DB = 0.05;

function shiftCurve(curve, offsetDb) {
  if (!Array.isArray(curve)) return [];
  if (!Number.isFinite(offsetDb) || offsetDb === 0) return curve;
  return curve.map((point) => ({
    ...point,
    spl: Number.isFinite(point?.spl) ? point.spl + offsetDb : point.spl,
  }));
}

function interpolateCurveDb(curve, frequency) {
  if (!Array.isArray(curve) || !curve.length) return null;
  const sorted = curve[0].frequency <= curve[curve.length - 1].frequency
    ? curve
    : [...curve].sort((a, b) => a.frequency - b.frequency);
  if (frequency < sorted[0].frequency || frequency > sorted[sorted.length - 1].frequency) return null;
  const upperIndex = sorted.findIndex((point) => point.frequency >= frequency);
  if (upperIndex < 0) return null;
  if (upperIndex === 0) return Number.isFinite(sorted[0].spl) ? sorted[0].spl : null;
  const low = sorted[upperIndex - 1];
  const high = sorted[upperIndex];
  const span = high.frequency - low.frequency;
  if (span === 0) return Number.isFinite(low.spl) ? low.spl : null;
  if (!Number.isFinite(low.spl) || !Number.isFinite(high.spl)) return null;
  const ratio = (frequency - low.frequency) / span;
  return low.spl + (high.spl - low.spl) * ratio;
}

/**
 * Compute the maximum positive global offset allowed by the frequency-
 * dependent usable-output ceiling. For each frequency in the response grid,
 * the shifted response must not exceed the ceiling. The binding frequency is
 * the one that most restricts the upward trim.
 *
 * Returns { maxOffsetDb, bindingFrequencyHz } where maxOffsetDb is Infinity
 * when no ceiling constraint applies.
 */
function computeCeilingHeadroomBound(rspPostEqCurve, maximumOutputCurve) {
  if (!Array.isArray(rspPostEqCurve) || !rspPostEqCurve.length
    || !Array.isArray(maximumOutputCurve) || !maximumOutputCurve.length) {
    return { maxOffsetDb: Infinity, bindingFrequencyHz: null };
  }
  let maxOffsetDb = Infinity;
  let bindingFrequencyHz = null;
  for (const point of rspPostEqCurve) {
    if (!Number.isFinite(point?.frequency) || !Number.isFinite(point?.spl)) continue;
    const ceiling = interpolateCurveDb(maximumOutputCurve, point.frequency);
    if (!Number.isFinite(ceiling)) continue;
    const available = ceiling - point.spl;
    if (!Number.isFinite(available)) continue;
    if (available < maxOffsetDb) {
      maxOffsetDb = available;
      bindingFrequencyHz = point.frequency;
    }
  }
  if (!Number.isFinite(maxOffsetDb)) return { maxOffsetDb: Infinity, bindingFrequencyHz: null };
  return { maxOffsetDb, bindingFrequencyHz };
}

/**
 * Perform the Global Level Alignment sweep.
 *
 * @param {object} params
 * @param {Array}  params.rspPostEqCurve       - canonical post-EQ RSP curve [{frequency, spl}]
 * @param {Array}  params.canonicalTargetCurve  - P19 target curve (practical calibration target)
 * @param {number} params.assessmentStartHz     - P19 assessment band lower bound
 * @param {number} params.assessmentEndHz       - P19 assessment band upper bound
 * @param {number} params.p14HeadroomDb          - available upward headroom from P14 (achieved − target)
 * @param {Array}  [params.maximumOutputCurve]   - frequency-dependent usable-output ceiling [{frequency, spl}]
 * @returns {object} alignment result
 */
export function performGlobalLevelAlignment({
  rspPostEqCurve,
  canonicalTargetCurve,
  assessmentStartHz,
  assessmentEndHz,
  p14HeadroomDb,
  protectedNullRegions = [],
  maximumOutputCurve = null,
}) {
  // Original P19 at the as-calibrated operating level (offset = 0)
  const originalP19 = computeCorrectableP19Diagnostic({
    rspPostEqCurve,
    canonicalTargetCurve,
    assessmentStartHz,
    assessmentEndHz,
    protectedNullRegions,
  });
  const originalP19Db = Number.isFinite(originalP19?.variationDbRaw)
    ? Number(originalP19.variationDbRaw)
    : null;
  const originalP19WorstFrequencyHz = Number.isFinite(originalP19?.worstFrequencyHz)
    ? Number(originalP19.worstFrequencyHz) : null;

  const headroom = Number.isFinite(p14HeadroomDb) ? Number(p14HeadroomDb) : 0;

  if (originalP19Db == null) {
    return {
      recommendedTrimDb: 0,
      originalP19Db: null,
      alignedP19Db: null,
      improvementDb: 0,
      aligned: false,
      p14HeadroomDb: headroom,
      upwardBoundDb: 0,
      downwardBoundDb: 0,
      stepDb: STEP_DB,
      statusMessage: "P19 not available — no assessment band data",
      frequencyDependentHeadroomDb: null,
      bindingFrequencyHz: null,
      ceilingLimited: false,
      p19WorstFrequencyHz: null,
    };
  }

  // ── Frequency-dependent ceiling bound ──
  // The usable-output ceiling M(f) is the frequency-dependent maximum the
  // system can physically deliver after EQ. A positive global trim shifts the
  // ENTIRE response up by the same amount, so the maximum safe positive offset
  // is the minimum of (M(f) - response(f)) across the response grid. This is
  // independent of the scalar P14 headroom: both must be respected.
  const ceilingBound = computeCeilingHeadroomBound(rspPostEqCurve, maximumOutputCurve);
  const frequencyDependentHeadroomDb = Number.isFinite(ceilingBound.maxOffsetDb)
    ? Number(ceilingBound.maxOffsetDb) : null;
  const bindingFrequencyHz = ceilingBound.bindingFrequencyHz;

  // Upward bound: the MORE RESTRICTIVE of scalar P14 headroom and the
  // frequency-dependent ceiling. Both constrain the same positive trim.
  const p14UpwardBound = Math.max(0, headroom);
  const ceilingUpwardBound = (frequencyDependentHeadroomDb != null && Number.isFinite(frequencyDependentHeadroomDb))
    ? Math.max(0, frequencyDependentHeadroomDb)
    : Infinity;
  const upwardBoundDb = Math.min(p14UpwardBound, ceilingUpwardBound);
  const ceilingLimited = frequencyDependentHeadroomDb != null
    && Number.isFinite(frequencyDependentHeadroomDb)
    && frequencyDependentHeadroomDb <= p14UpwardBound + HEADROOM_LIMITED_EPSILON_DB;
  // Downward bound: generous calibration range (not constrained by capability)
  const downwardBoundDb = DOWNWARD_RANGE_DB;

  // Sweep from -downwardBound to +upwardBound in 0.25 dB steps.
  // Offset 0 (the as-calibrated level) is always evaluated first as the
  // baseline; ties resolve to the offset closest to zero.
  let bestOffset = 0;
  let bestP19Db = originalP19Db;
  let bestP19WorstFrequencyHz = originalP19WorstFrequencyHz;

  const totalRange = downwardBoundDb + upwardBoundDb;
  const stepCount = Math.round(totalRange / STEP_DB);
  for (let i = 0; i <= stepCount; i++) {
    const offset = -downwardBoundDb + i * STEP_DB;
    if (offset > upwardBoundDb + 1e-9) break;

    const shiftedCurve = shiftCurve(rspPostEqCurve, offset);
    const p19 = computeCorrectableP19Diagnostic({
      rspPostEqCurve: shiftedCurve,
      canonicalTargetCurve,
      assessmentStartHz,
      assessmentEndHz,
      protectedNullRegions,
    });
    const p19Db = Number.isFinite(p19?.variationDbRaw) ? Number(p19.variationDbRaw) : Infinity;

    // Strictly better (not just equal) — ties stay at the offset closest to zero
    if (p19Db < bestP19Db - 1e-9) {
      bestP19Db = p19Db;
      bestOffset = offset;
      bestP19WorstFrequencyHz = Number.isFinite(p19?.worstFrequencyHz)
        ? Number(p19.worstFrequencyHz) : null;
    }
  }

  // Round to nearest step to avoid floating-point drift
  bestOffset = Math.round(bestOffset / STEP_DB) * STEP_DB;

  const improvementDb = Math.max(0, originalP19Db - bestP19Db);
  const aligned = improvementDb > 1e-9;

  // Determine the status message:
  // - If the optimum trim is 0.0 dB, the current operating level is already
  //   optimum — no adjustment is needed.
  // - If the best offset is at the frequency-dependent ceiling bound, the
  //   mathematical optimum would require more gain than the loudspeaker can
  //   physically deliver at the binding frequency.
  // - If the best offset is at the scalar P14 headroom bound, the system
  //   cannot produce more output without exceeding P14 capability.
  // - Otherwise, the alignment improved P19 by applying a global trim.
  let statusMessage;
  if (!aligned) {
    statusMessage = "Current operating level already optimum";
  } else if (ceilingLimited && upwardBoundDb > 0
    && Math.abs(bestOffset - upwardBoundDb) < HEADROOM_LIMITED_EPSILON_DB) {
    statusMessage = `Limited by frequency-dependent output ceiling at ${Number.isFinite(bindingFrequencyHz) ? bindingFrequencyHz.toFixed(1) : "?"} Hz`;
  } else if (upwardBoundDb > 0 && Math.abs(bestOffset - upwardBoundDb) < HEADROOM_LIMITED_EPSILON_DB) {
    statusMessage = "Limited by available output capability";
  } else {
    statusMessage = `Global trim ${bestOffset > 0 ? "+" : ""}${bestOffset.toFixed(2)} dB applied`;
  }

  return {
    recommendedTrimDb: bestOffset,
    originalP19Db,
    alignedP19Db: bestP19Db,
    improvementDb,
    aligned,
    p14HeadroomDb: headroom,
    upwardBoundDb,
    downwardBoundDb,
    stepDb: STEP_DB,
    statusMessage,
    frequencyDependentHeadroomDb,
    bindingFrequencyHz,
    ceilingLimited,
    p19WorstFrequencyHz: bestP19WorstFrequencyHz,
  };
}

/**
 * Apply a global bass trim to a response curve (vertical translation only).
 * Returns the original curve unchanged when trim is 0 or non-finite.
 */
export function applyGlobalBassTrimToCurve(curve, trimDb) {
  if (!Number.isFinite(trimDb) || trimDb === 0) return curve;
  return shiftCurve(curve, trimDb);
}

// The final calibration trim is a system-wide setting. Every listening
// position receives the same offset; only the room transfer differs by seat.
export function applyGlobalBassTrimToSeatCurves(seatCurves, trimDb) {
  if (!Array.isArray(seatCurves)) return [];
  if (!Number.isFinite(trimDb) || trimDb === 0) return seatCurves;
  return seatCurves.map((seat) => ({
    ...seat,
    responseData: shiftCurve(seat?.responseData, trimDb),
  }));
}