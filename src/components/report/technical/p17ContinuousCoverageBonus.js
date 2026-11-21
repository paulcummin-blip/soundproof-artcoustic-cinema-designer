/**
 * p17ContinuousCoverageBonus.js
 * --------------------------------
 * Pure, dependency-free helper for the ASDR continuous P17 off-axis
 * improvement contribution.
 *
 * P17's discrete RP22 grade is set by the WORST-covered applicable channel
 * at a seat (the limiting speaker). When several OTHER speakers at the same
 * seat are substantially better covered, the discrete level cannot move even
 * though the design has genuinely improved. This helper derives a small,
 * bounded, continuous bonus from the MEAN ABSOLUTE per-speaker coverage
 * quality, so ASDR can respond progressively to aiming improvements the
 * discrete P17 grade cannot show.
 *
 * Why mean absolute quality (not the disparity from the limiting speaker):
 *  - The mean is MONOTONIC: improving any speaker raises it, worsening any
 *    speaker lowers it. The previous disparity formula (mean − limiting)
 *    could INCREASE when the worst speaker became worse, awarding more
 *    points for worse coverage. The mean cannot do this.
 *  - The mean does not depend on WHICH speaker is the limiting one, so there
 *    is no discontinuity when the limiting speaker changes.
 *  - The mean is normalised by speaker count, so speaker quantity is not
 *    rewarded.
 *
 * Principles (per the ASDR continuous improvement brief):
 *  - Rewards meaningful coverage improvement, not rotation itself. A speaker
 *    already within its best coverage window (L4) does not gain from rotation.
 *  - Increases progressively as poorly-aimed speakers are corrected.
 *  - Saturates (zero bonus) when the seat is already at L4.
 *  - Is modest: the bonus is capped well below one grade step (4 multiplier
 *    points), so it refines P17 within its existing range without
 *    double-counting the discrete grade.
 *  - Uses the same estimated coverage-window basis as the RP22 P17 grade
 *    (per-speaker windowLevelNumber), not raw polar precision the model
 *    does not have.
 *
 * Pure: no React, no SDK, no writes. Imported by the rating adapter and by
 * the controlled-comparison regression tests so both use one formula.
 */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Per-speaker coverage quality, normalised to [0.25, 1.0].
 * L4 (windowLevelNumber 4) -> 1.0, L3 -> 0.75, L2 -> 0.5, L1 -> 0.25.
 */
const qualityForLevelNumber = (n) => (isNum(n) && n >= 1 && n <= 4 ? n / 4 : null);

/** Quality at the L1 floor — the reference below which no bonus is earned. */
const L1_QUALITY = 0.25;

/** Quality span from L1 (0.25) to L4 (1.0). */
const QUALITY_SPAN = 1.0 - L1_QUALITY; // 0.75

/**
 * Caps the bonus at one full grade step (4 multiplier points). This is the
 * maximum a continuous contribution can add without double-counting the
 * discrete RP22 grade: a seat at L1 with every other speaker at L4 coverage
 * quality reaches an effective multiplier of 6 (between L2 and L3), never
 * exceeding the next grade boundary by more than the coverage evidence
 * justifies.
 */
const MODESTY_CAP = 4.0;

/** Maps the full quality span [0.25, 1.0] to the cap (4.0). */
const BONUS_SCALE = MODESTY_CAP / QUALITY_SPAN; // 16/3 ≈ 5.333

const MAX_MULTIPLIER = 12;

/**
 * Mean per-speaker coverage quality across the applicable P17 channels.
 *
 * Monotonic: improving any speaker raises it, worsening any speaker lowers it.
 * Normalised by speaker count, so speaker quantity is not rewarded. Does not
 * depend on which speaker is the limiting one (it is a simple average), so
 * there is no discontinuity when the limiting speaker changes.
 *
 * @param {Array} perSpeaker - engine per-speaker entries; each may carry
 *        windowLevelNumber (1..4) or windowLevel.
 * @returns {number|null} mean quality in [0.25, 1.0], or null when there is no
 *          per-speaker evidence to average.
 */
export function computeP17MeanQuality(perSpeaker) {
  if (!Array.isArray(perSpeaker) || perSpeaker.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const entry of perSpeaker) {
    const q = qualityForLevelNumber(
      isNum(entry?.windowLevelNumber) ? entry.windowLevelNumber : entry?.windowLevel
    );
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
 * The bonus is derived from the mean ABSOLUTE quality (not the disparity from
 * the limiting speaker), so it is monotonic: improving any speaker can only
 * raise it, worsening any speaker can only lower it. A speaker already at L4
 * does not gain from rotation (its windowLevelNumber does not change). The
 * bonus is zero when the mean quality is at or below the L1 floor (every
 * speaker at L1), and saturates at L4 (base already at the maximum).
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