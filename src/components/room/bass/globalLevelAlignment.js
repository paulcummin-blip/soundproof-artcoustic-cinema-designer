// globalLevelAlignment.js
//
// Global Level Alignment — the final calibration stage before P19 publication.
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
//   5. Calculate the P19 metric at each offset.
//   6. Select the offset producing the minimum P19 error.
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

import { computeOfficialP19Assessment } from "@/components/utils/bassAuthoritativeAssessment";

const STEP_DB = 0.25;
const DOWNWARD_RANGE_DB = 12; // generous downward sweep (unrestricted by capability)
const HEADROOM_LIMITED_EPSILON_DB = 0.01;

function shiftCurve(curve, offsetDb) {
  if (!Array.isArray(curve)) return [];
  if (!Number.isFinite(offsetDb) || offsetDb === 0) return curve;
  return curve.map((point) => ({
    ...point,
    spl: Number.isFinite(point?.spl) ? point.spl + offsetDb : point.spl,
  }));
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
 * @returns {object} alignment result
 */
export function performGlobalLevelAlignment({
  rspPostEqCurve,
  canonicalTargetCurve,
  assessmentStartHz,
  assessmentEndHz,
  p14HeadroomDb,
  protectedNullRegions = [],
}) {
  // Original P19 at the as-calibrated operating level (offset = 0)
  const originalP19 = computeOfficialP19Assessment({
    rspPostEqCurve,
    canonicalTargetCurve,
    assessmentStartHz,
    assessmentEndHz,
    protectedNullRegions,
  });
  const originalP19Db = Number.isFinite(originalP19?.variationDbRaw)
    ? Number(originalP19.variationDbRaw)
    : null;

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
    };
  }

  // Upward bound: available P14 headroom (can never exceed capability).
  // Global Level Alignment may never increase the response beyond the
  // physically available headroom established by the final P14 result.
  const upwardBoundDb = Math.max(0, headroom);
  // Downward bound: generous calibration range (not constrained by capability)
  const downwardBoundDb = DOWNWARD_RANGE_DB;

  // Sweep from -downwardBound to +upwardBound in 0.25 dB steps.
  // Offset 0 (the as-calibrated level) is always evaluated first as the
  // baseline; ties resolve to the offset closest to zero.
  let bestOffset = 0;
  let bestP19Db = originalP19Db;

  const totalRange = downwardBoundDb + upwardBoundDb;
  const stepCount = Math.round(totalRange / STEP_DB);
  for (let i = 0; i <= stepCount; i++) {
    const offset = -downwardBoundDb + i * STEP_DB;
    if (offset > upwardBoundDb + 1e-9) break;

    const shiftedCurve = shiftCurve(rspPostEqCurve, offset);
    const p19 = computeOfficialP19Assessment({
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
    }
  }

  // Round to nearest step to avoid floating-point drift
  bestOffset = Math.round(bestOffset / STEP_DB) * STEP_DB;

  const improvementDb = Math.max(0, originalP19Db - bestP19Db);
  const aligned = improvementDb > 1e-9;

  // Determine the status message:
  // - If the optimum trim is 0.0 dB, the current operating level is already
  //   optimum — no adjustment is needed.
  // - If the best offset is at the upward bound, the mathematical optimum
  //   would require more gain than the loudspeaker can physically produce.
  //   The published P19 represents the best physically achievable result.
  // - Otherwise, the alignment improved P19 by applying a global trim.
  let statusMessage;
  if (!aligned) {
    statusMessage = "Current operating level already optimum";
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