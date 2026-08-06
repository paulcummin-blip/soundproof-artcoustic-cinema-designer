/**
 * p1LevelAuthority
 * ---------------
 * Pure grading authority for RP22 Parameter 1 (Recommended Seating Position).
 *
 * Accepts one numeric distance in metres (the listener's distance from the
 * screen / reference plane) and returns a canonical result object.
 *
 * Canonical thresholds (boundary-inclusive, >= comparisons):
 *   L4:  distance >= 1.5 m
 *   L3:  distance >= 1.2 m
 *   L2:  distance >= 0.8 m
 *   L1:  distance >= 0.5 m
 *   FAIL: distance <  0.5 m
 *
 * No 0.6 m or 0.9 m thresholds. No strict greater-than comparisons.
 * Formatting uses two decimal places and never mutates the grading input.
 */

const THRESHOLDS = [
  { level: "L4", min: 1.5 },
  { level: "L3", min: 1.2 },
  { level: "L2", min: 0.8 },
  { level: "L1", min: 0.5 },
];

/**
 * Grade a single P1 distance value.
 *
 * @param {number|null|undefined} distanceM - distance in metres
 * @returns {{value:number|null, formatted:string|null, level:string|null, status:string, applicable:boolean, source:string}}
 */
export function gradeP1Distance(distanceM) {
  const source = "p1LevelAuthority";

  // Missing, non-finite, or negative input
  if (distanceM === null || distanceM === undefined || typeof distanceM !== "number" || !Number.isFinite(distanceM) || distanceM < 0) {
    return {
      value: null,
      formatted: null,
      level: null,
      status: "no_data",
      applicable: false,
      source,
    };
  }

  // Format to two decimal places (does not change the grading input)
  const formatted = `${distanceM.toFixed(2)}m`;

  // Grade using boundary-inclusive >= comparisons, best-first
  for (const t of THRESHOLDS) {
    if (distanceM >= t.min) {
      return {
        value: distanceM,
        formatted,
        level: t.level,
        status: "ok",
        applicable: true,
        source,
      };
    }
  }

  // distance < 0.5 m
  return {
    value: distanceM,
    formatted,
    level: "FAIL",
    status: "ok",
    applicable: true,
    source,
  };
}

export default gradeP1Distance;