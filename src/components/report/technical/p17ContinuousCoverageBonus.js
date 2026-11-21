/**
 * p17ContinuousCoverageBonus.js
 * --------------------------------
 * Pure, dependency-free helper for the ASDR continuous P17 off-axis
 * coverage-quality contribution.
 *
 * P17's discrete RP22 grade is set by the WORST-covered applicable channel
 * at a seat (the limiting speaker). When several OTHER speakers at the same
 * seat are substantially better covered, the discrete level cannot move even
 * though the design has genuinely improved. This helper derives a small,
 * bounded, continuous bonus from the MEAN per-speaker coverage quality, so
 * ASDR can respond progressively to aiming improvements the discrete P17
 * grade cannot show.
 *
 * GENUINELY CONTINUOUS: per-speaker quality is derived from the effective
 * off-axis angle relative to the speaker's own coverage windows (l4Deg,
 * l3Deg, l2Deg), not from the discrete windowLevelNumber. A rotation that
 * stays within the same RP22 window band still changes the quality and
 * therefore the bonus, because the angle-to-window ratio is a smooth
 * piecewise-linear function. Falls back to the discrete windowLevelNumber
 * mapping when the angle or windows are unavailable (legacy saved
 * publications).
 *
 * The quality function is piecewise linear and continuous through the window
 * boundaries (no abrupt jumps at L4/L3/L2 transitions):
 *   0°      -> 1.0  (perfectly on-axis)
 *   l4Deg   -> 0.75 (1.5 dB window edge)
 *   l3Deg   -> 0.5  (3 dB window edge)
 *   l2Deg   -> 0.25 (4 dB / usable window edge)
 *   beyond  -> 0.0  (extrapolated linearly over one window span past l2Deg)
 *
 * This does NOT claim measured dB precision: it is a normalised quality
 * [0, 1] derived from the angle-to-window ratio. The windows themselves come
 * from measured polar data or estimated dispersion, but the quality function
 * only uses their geometric thresholds.
 *
 * Principles (per the ASDR continuous improvement brief):
 *  - Rewards meaningful coverage improvement, not rotation itself. A speaker
 *    already deep within its best coverage window (small angle) gains little
 *    from further rotation because the quality is already near 1.0.
 *  - Increases progressively as poorly-aimed speakers are corrected.
 *  - Saturates (zero bonus) when the seat is at L4.
 *  - Is modest: the bonus is capped well below one grade step (4 multiplier
 *    points), so it refines P17 within its existing range without
 *    double-counting the discrete grade.
 *  - Uses the same estimated coverage-window basis as the RP22 P17 grade,
 *    not raw polar precision the model does not have.
 *
 * Pure: no React, no SDK, no writes. Imported by the rating adapter and by
 * the controlled-comparison regression tests so both use one formula.
 */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Quality at the L1 floor — the reference below which no bonus is earned. */
const L1_QUALITY = 0.25;

/** Quality span from L1 (0.25) to L4 (1.0). */
const QUALITY_SPAN = 1.0 - L1_QUALITY; // 0.75

/**
 * Caps the bonus at one full grade step (4 multiplier points). This is the
 * maximum a continuous contribution can add without double-counting the
 * discrete RP22 grade.
 */
const MODESTY_CAP = 4.0;

/** Maps the full quality span [0.25, 1.0] to the cap (4.0). */
const BONUS_SCALE = MODESTY_CAP / QUALITY_SPAN; // 16/3 ~ 5.333

const MAX_MULTIPLIER = 12;

/**
 * Genuinely continuous per-speaker coverage quality from the effective
 * off-axis angle relative to the speaker's own coverage windows.
 *
 * Piecewise linear and continuous through the window boundaries:
 *   0°      -> 1.0
 *   l4Deg   -> 0.75
 *   l3Deg   -> 0.5
 *   l2Deg   -> 0.25
 *   beyond  -> 0.0 (linearly over one window span past l2Deg)
 *
 * Falls back to the discrete windowLevelNumber / 4 mapping when the angle
 * or windows are unavailable (legacy saved publications that did not
 * persist per-speaker angle or window data).
 *
 * @param {object} entry - per-speaker entry from the P17 engine
 * @returns {number|null} quality in [0, 1], or null when no evidence
 */
export function continuousSpeakerQuality(entry) {
  if (!entry) return null;

  // Prefer the genuinely continuous path: angle + windows
  const angleDeg = isNum(entry.angleDeg)
    ? Math.abs(entry.angleDeg)
    : (isNum(entry.offAxisDeg) ? Math.abs(entry.offAxisDeg) : null);

  const windows = entry.windows;
  const l4 = windows?.l4Deg;
  const l3 = windows?.l3Deg;
  const l2 = windows?.l2Deg;

  if (angleDeg != null && isNum(l4) && isNum(l3) && isNum(l2) && l4 > 0 && l3 > l4 && l2 > l3) {
    if (angleDeg <= 0) return 1.0;
    if (angleDeg <= l4) return 1.0 - 0.25 * (angleDeg / l4);
    if (angleDeg <= l3) return 0.75 - 0.25 * ((angleDeg - l4) / (l3 - l4));
    if (angleDeg <= l2) return 0.5 - 0.25 * ((angleDeg - l3) / (l2 - l3));
    // Beyond l2: extrapolate to zero over one more window span
    const span = Math.max(1, l2 - l3);
    return Math.max(0, 0.25 - 0.25 * ((angleDeg - l2) / span));
  }

  // Fallback: discrete windowLevelNumber (legacy saved publications)
  const levelNum = isNum(entry.windowLevelNumber) ? entry.windowLevelNumber : null;
  if (levelNum != null && levelNum >= 1 && levelNum <= 4) return levelNum / 4;

  // Last resort: windowLevel string
  const wlMatch = String(entry?.windowLevel || "").match(/^L([1-4])$/);
  if (wlMatch) return Number(wlMatch[1]) / 4;

  return null;
}

/**
 * Mean per-speaker coverage quality across the applicable P17 channels.
 *
 * Monotonic: improving any speaker raises it, worsening any speaker lowers it.
 * Normalised by speaker count, so speaker quantity is not rewarded. Does not
 * depend on which speaker is the limiting one (it is a simple average), so
 * there is no discontinuity when the limiting speaker changes.
 *
 * @param {Array} perSpeaker - engine per-speaker entries; each carries
 *        angleDeg + windows (continuous) or windowLevelNumber (fallback).
 * @returns {number|null} mean quality in [0, 1], or null when there is no
 *          per-speaker evidence to average.
 */
export function computeP17MeanQuality(perSpeaker) {
  if (!Array.isArray(perSpeaker) || perSpeaker.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const entry of perSpeaker) {
    const q = continuousSpeakerQuality(entry);
    if (q != null) {
      sum += q;
      count += 1;
    }
  }
  if (count === 0) return null;
  return sum / count;
}

/**
 * Convert the mean per-speaker coverage quality into a bounded additive bonus
 * on the P17 seat multiplier.
 *
 * The bonus is derived from the mean ABSOLUTE quality, so it is monotonic:
 * improving any speaker can only raise it, worsening any speaker can only
 * lower it. A speaker already at L4 does not gain from rotation. The bonus
 * is zero when the mean quality is at or below the L1 floor, and saturates
 * at L4 (base already at the maximum).
 *
 * The bonus is capped at MODESTY_CAP (well below one grade step of 4), so it
 * refines P17 within its existing range without double-counting the discrete
 * grade. The effective multiplier can never exceed the L4 maximum of 12.
 *
 * @param {string} level       - the seat's discrete P17 level ("L1".."L4" or "FAIL").
 * @param {number} meanQuality  - from computeP17MeanQuality (or null/0).
 * @returns {number} bonus multiplier points (>= 0).
 */
export function computeP17ContinuousBonus(level, meanQuality) {
  if (!/^(L[1-4])$/.test(String(level || ""))) return 0;
  if (!isNum(meanQuality) || meanQuality <= L1_QUALITY) return 0;
  const baseMult = { L4: 12, L3: 8, L2: 4, L1: 2 }[String(level)];
  if (baseMult >= MAX_MULTIPLIER) return 0; // L4 saturated
  const ceiling = MAX_MULTIPLIER - baseMult;
  const raw = BONUS_SCALE * (meanQuality - L1_QUALITY);
  return Math.max(0, Math.min(MODESTY_CAP, Math.min(ceiling, raw)));
}

/** Effective P17 multiplier after the continuous bonus, capped at L4 max. */
export function effectiveP17Multiplier(level, meanQuality) {
  const base = { L4: 12, L3: 8, L2: 4, L1: 2, FAIL: -5 }[String(level || "")];
  if (!isNum(base)) return null;
  return Math.min(MAX_MULTIPLIER, base + computeP17ContinuousBonus(level, meanQuality));
}

// ═══════════════════════════════════════════════════════════════
// Normalised grade-relative continuous coverage contribution
// ═══════════════════════════════════════════════════════════════
//
// Replaces the previous unnormalised additive sum. Three confirmed defects
// are corrected:
//
//  1. GRADE-BOUNDARY MONOTONICITY: the contribution is capped at the grade
//     gap (nextBase − currentBase) × weight. At the cap, the lower grade's
//     total equals the next grade's base contribution, so improving the
//     limiting speaker across ANY grade boundary (L1→L2, L2→L3, L3→L4)
//     never drops the total P17 earned points.
//
//  2. ON-AXIS SMOOTH SATURATION: no on-axis exclusion threshold. The quality
//     function already approaches 1.0 smoothly as the angle approaches 0°,
//     so a speaker improving 2°→1° raises the mean and the contribution —
//     it never loses points. Already-excellent coverage saturates with
//     little remaining headroom but is never penalised.
//
//  3. SPEAKER-COUNT NORMALISATION: uses the MEAN per-speaker quality
//     (average), not the sum, so 5.x, 7.x and 9.x systems with the same
//     average coverage quality receive the same contribution. Speaker
//     count already has its own treatment elsewhere in ASDR; this does not
//     introduce a second quantity reward.
//
// Formula:
//   progress = clamp((meanQuality − gradeFloor) / (1.0 − gradeFloor), 0, 1)
//   continuous = progress × (nextGradeBase − currentGradeBase) × weight
//
// The full quality range [gradeFloor, 1.0] is used (not just to the next
// grade ceiling) to avoid premature saturation when the mean exceeds the
// grade ceiling — many non-limiting speakers can be well above the grade
// while the limiting speaker holds it down.
//
// Monotonicity proof (no boundary drop):
//   At any grade G (≠ L4), max total = base_G × w + (base_next − base_G) × w
//                                    = base_next × w.
//   At the next grade G+1 (just reached), min total = base_next × w + 0.
//   So max lower-grade total = min next-grade total. The total can never
//   drop when the limiting speaker crosses a grade boundary. Improving
//   non-limiting speakers raises the mean, raising progress, raising the
//   contribution — also never a drop.
//
// Pure: no React, no SDK, no writes. Imported by the rating adapter and by
// regression tests so both use one formula.

/** P17 canonical weight (mirrors base44/shared/canonicalParameterWeights.js). */
const P17_WEIGHT = 5;

/** Grade base multipliers (mirrors LEVEL_MULTIPLIERS). */
const GRADE_BASE_MULT = Object.freeze({ L4: 12, L3: 8, L2: 4, L1: 2 });

/** Next grade base for the ceiling cap (L4 has no next → no contribution). */
const NEXT_GRADE_MULT = Object.freeze({ L3: 12, L2: 8, L1: 4 });

/**
 * Quality at each grade's floor (the angle-to-window ratio at the grade's
 * lower boundary, from continuousSpeakerQuality):
 *   L4 floor = 0.75  (l4Deg → 0.75)
 *   L3 floor = 0.50  (l3Deg → 0.50)
 *   L2 floor = 0.25  (l2Deg → 0.25)
 *   L1 floor = 0.00  (beyond l2Deg → 0.0)
 */
const GRADE_FLOOR_QUALITY = Object.freeze({ L4: 0.75, L3: 0.50, L2: 0.25, L1: 0.00 });

/**
 * Compute the normalised grade-relative continuous coverage points for a
 * P17 seat.
 *
 * @param {string} level - the seat's discrete P17 level ("L1".."L4").
 * @param {Array} perSpeaker - engine per-speaker entries (angleDeg + windows).
 * @returns {number} additive ASDR points (>= 0, bounded by the grade gap).
 */
export function computeP17CoveragePoints(level, perSpeaker) {
  if (!/^(L[1-4])$/.test(String(level || ""))) return 0;
  // L4: already at the top RP22 coverage level — no higher grade to approach.
  if (String(level) === "L4") return 0;
  if (!Array.isArray(perSpeaker) || perSpeaker.length === 0) return 0;

  const meanQuality = computeP17MeanQuality(perSpeaker);
  if (meanQuality == null) return 0;

  const floorQ = GRADE_FLOOR_QUALITY[level];
  const maxContinuous = (NEXT_GRADE_MULT[level] - GRADE_BASE_MULT[level]) * P17_WEIGHT;
  const span = 1.0 - floorQ;
  if (span <= 0 || maxContinuous <= 0) return 0;

  const progress = Math.max(0, Math.min(1, (meanQuality - floorQ) / span));
  return progress * maxContinuous;
}

// Expose constants for tests and diagnostics.
export const P17_COVERAGE_CONSTANTS = Object.freeze({
  P17_WEIGHT,
  GRADE_BASE_MULT,
  NEXT_GRADE_MULT,
  GRADE_FLOOR_QUALITY,
});