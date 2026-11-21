/**
 * asdrAimingCredit.js
 * -------------------
 * Pure, dependency-light helper for the INDEPENDENT ASDR speaker-aiming credit.
 *
 * This is a design-quality adjustment to the Artcoustic System Design Rating
 * that is SEPARATE from RP22 P17. It rewards genuine improvements in speaker
 * coverage at individual listening positions (especially the outermost
 * secondary seats) that the discrete RP22 P17 grade cannot show because another
 * speaker (often an overhead) limits the parameter grade.
 *
 * MEASUREMENT BASIS — angular benefit vs the canonical wall-flat reference:
 *   For each applicable bed-layer speaker and each physical seat, compare the
 *   speaker's effective off-axis angle in its CURRENT orientation against the
 *   off-axis angle it would have in its CANONICAL WALL-FLAT orientation. The
 *   difference is translated through the speaker's own coverage-window quality
 *   function (the same piecewise-linear [0,1] quality used by the continuous
 *   P17 coverage contribution), so the credit reflects a real coverage
 *   improvement, not the mere act of rotating the speaker.
 *
 *   qualityGain = quality(currentOffAxis) − quality(wallFlatOffAxis)
 *   A speaker flat against the wall has gain 0 (current = reference).
 *   A speaker already well-oriented has a tiny gain (quality already near 1).
 *   A speaker improved from 43° to 13° has a large gain (~0.75).
 *   A change that worsens coverage has a negative gain (earns nothing).
 *
 * NO DOUBLE COUNTING with the existing P17 continuous coverage contribution:
 *   - The coverage contribution measures ABSOLUTE deficiency from the L4 floor
 *     (how far each speaker sits BELOW 0.75 quality). It rewards a seat being
 *     well-covered regardless of how it got there.
 *   - The aiming credit measures the RELATIVE improvement from wall-flat
 *     (quality delta). A speaker placed optimally without aiming (wall-flat
 *     already good) earns coverage credit but ZERO aiming credit. They are
 *     genuinely different functions of the same quality value, with separate
 *     bounds and separate allocations.
 *
 * SEAT-BASED AGGREGATION:
 *   Each physical seat is assessed separately. Primary and secondary seating
 *   contributions are computed independently with their own max allocations.
 *   The per-seat credit is averaged across the seats in the scope (balanced
 *   aggregation), so improving four seats counts more than improving one, and
 *   deterioration at other seats lowers the average (it is never rewarded).
 *
 * NO SPEAKER-COUNT INFLATION:
 *   Within a group (e.g. front wides = LW + RW), the per-seat gain is the BEST
 *   (max) speaker's gain, not the sum. Two front wides do not earn twice one.
 *
 * Properties (per the ASDR aiming credit brief):
 *  - A speaker flat against the wall earns zero aiming credit.
 *  - Already well-oriented side surrounds earn negligible credit.
 *  - Meaningful front-wide improvements can earn up to +5 secondary DPI.
 *  - Meaningful rear-surround improvements can earn up to +3 secondary DPI.
 *  - Credit is never earned merely because a toggle is enabled.
 *  - Identical physical orientations produce identical scores.
 *  - A change that worsens coverage is never rewarded.
 *  - Previous editing history never influences the score.
 *
 * Pure: no React, no SDK, no writes. Imported by the rating adapter and by
 * regression tests so both use one formula.
 */

import { continuousSpeakerQuality } from "./p17ContinuousCoverageBonus";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Maximum aiming credit allocations in RAW ASDR points (displayed DPI × 10).
 *
 * The DPI is round(actualPoints / 10), so a displayed +5 = 50 raw points.
 * These are CEILINGS earned through actual coverage improvement, never
 * automatic rewards. The quality gain ∈ [0, 1] scales linearly up to the cap.
 *
 *               Primary (raw)   Secondary (raw)
 * Front wides     20 (+2)         50 (+5)
 * Side surrounds   0  ( 0)        10 (+1)
 * Rear surrounds   10 (+1)        30 (+3)
 */
const AIMING_ALLOCATIONS = Object.freeze({
  primary: Object.freeze({ frontWide: 20, sideSurround: 0, rearSurround: 10 }),
  secondary: Object.freeze({ frontWide: 50, sideSurround: 10, rearSurround: 30 }),
});

/** Map a canonical speaker role to its aiming-credit group (or null). */
function groupForRole(role) {
  const r = String(role || "").trim().toUpperCase();
  if (r === "LW" || r === "RW") return "frontWide";
  if (r === "SBL" || r === "SBR") return "rearSurround";
  if (r === "SL" || r === "SR" || /^SL\d+$/.test(r) || /^SR\d+$/.test(r)) return "sideSurround";
  return null;
}

/** Coverage-window quality at a given off-axis angle. Null when no evidence. */
function qualityAt(offAxisDeg, windows) {
  if (!isNum(offAxisDeg) || !windows) return null;
  return continuousSpeakerQuality({ angleDeg: Math.abs(offAxisDeg), windows });
}

/**
 * Per-speaker quality gain from the wall-flat reference to the current
 * orientation. Positive = aiming improved coverage. Negative = worsened.
 * Null when the wall-flat reference or windows are unavailable (legacy).
 */
function speakerAimingGain(entry) {
  if (!entry) return null;
  const windows = entry.windows;
  const currentOffAxis = isNum(entry.angleDeg) ? Math.abs(entry.angleDeg) : null;
  const wallFlatOffAxis = isNum(entry.wallFlatOffAxisDeg) ? Math.abs(entry.wallFlatOffAxisDeg) : null;
  if (currentOffAxis == null || wallFlatOffAxis == null) return null;
  const qCurrent = qualityAt(currentOffAxis, windows);
  const qWallFlat = qualityAt(wallFlatOffAxis, windows);
  if (qCurrent == null || qWallFlat == null) return null;
  return qCurrent - qWallFlat;
}

/**
 * Compute the per-seat ASDR aiming credit (raw points) for one seat.
 *
 * For each applicable speaker group, the per-seat gain is the BEST speaker's
 * quality gain in that group (max, not sum — no speaker-count inflation). The
 * gain is clamped at 0 (a net-worsening group earns nothing) and scaled by the
 * group's raw-point allocation for the seat's priority scope. The total is the
 * sum across groups, bounded by the sum of the applicable allocations.
 *
 * @param {Array}  perSpeaker    - per-speaker entries from the P17 engine
 * @param {string} seatPriority - "primary" | "secondary"
 * @returns {number} per-seat aiming credit in raw ASDR points (≥ 0)
 */
export function computeSeatAimingPoints(perSpeaker, seatPriority) {
  if (!Array.isArray(perSpeaker) || perSpeaker.length === 0) return 0;
  const scope = seatPriority === "secondary" ? "secondary" : "primary";
  const alloc = AIMING_ALLOCATIONS[scope];

  const groups = { frontWide: [], sideSurround: [], rearSurround: [] };
  for (const entry of perSpeaker) {
    const group = groupForRole(entry?.role);
    if (group) groups[group].push(entry);
  }

  let total = 0;
  for (const groupName of Object.keys(groups)) {
    if (alloc[groupName] === 0) continue; // group earns nothing in this scope
    const speakers = groups[groupName];
    if (speakers.length === 0) continue;

    // Per-seat group gain: the strongest aiming improvement at this seat from
    // any speaker in the group. Max (not sum) so two speakers do not earn twice
    // one. Negative when every speaker in the group worsened at this seat.
    let bestGain = null;
    for (const spk of speakers) {
      const gain = speakerAimingGain(spk);
      if (gain != null) {
        bestGain = bestGain == null ? gain : Math.max(bestGain, gain);
      }
    }
    if (bestGain == null) continue; // no aiming evidence for this group here

    // Clamp at 0: a net-worsening group earns no credit. A group with mixed
    // improvement/deterioration nets lower than a uniformly-improving one.
    total += Math.max(0, bestGain) * alloc[groupName];
  }

  return total;
}

export const AIMING_CREDIT_CONSTANTS = Object.freeze({
  AIMING_ALLOCATIONS,
});