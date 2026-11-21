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
 * bounded, continuous bonus from the margin between the average per-speaker
 * coverage quality and the limiting speaker's quality, so ASDR can respond
 * progressively to aiming improvements the discrete P17 grade cannot show.
 *
 * Principles (per the ASDR continuous improvement brief):
 *  - Rewards meaningful coverage improvement, not rotation itself.
 *  - Increases progressively as poorly-aimed speakers are corrected.
 *  - Saturates (zero bonus) when the seat is already at L4.
 *  - Normalises across applicable speakers (mean, not sum) so speaker
 *    quantity is not rewarded.
 *  - Is modest: a poor-performing limiting group cannot be hidden, because
 *    the bonus is capped well below the gap to L4.
 *  - Uses the same estimated coverage-window basis as the RP22 P17 grade
 *    (per-speaker windowLevelNumber), not raw polar precision the model
 *    does not have.
 *
 * Pure: no React, no SDK, no writes. Imported by the rating adapter and by
 * the controlled-comparison regression tests so both use one formula.
 */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Per-speaker coverage quality, normalised to [0,1].
 * L4 (windowLevelNumber 4) -> 1.0, L3 -> 0.75, L2 -> 0.5, L1 -> 0.25.
 */
const qualityForLevelNumber = (n) => (isNum(n) && n >= 1 && n <= 4 ? n / 4 : null);

/**
 * Compute the continuous improvement margin for one seat's P17 result.
 *
 * The margin is max(0, mean(per-speaker quality) - limiting-speaker quality).
 * It is >= 0 because the limiting speaker is the worst-covered channel, so the
 * average can only be at or above it. A zero margin means every applicable
 * speaker is at the same coverage level as the limiting one (no improvement to
 * recognise) or no per-speaker evidence is available.
 *
 * @param {Array}  perSpeaker          - engine per-speaker entries; each may
 *        carry windowLevelNumber (1..4).
 * @param {number} seatLevelNumber     - the seat's limiting coverage level
 *        number (1..4) — the worst-covered channel's window level.
 * @returns {number|null} margin in [0, 0.75], or null when there is no
 *          per-speaker evidence to average.
 */
export function computeP17ContinuousMargin(perSpeaker, seatLevelNumber) {
  if (!Array.isArray(perSpeaker) || perSpeaker.length === 0) return null;
  const qLimit = qualityForLevelNumber(seatLevelNumber);
  if (qLimit == null) return null;

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
  const qAvg = sum / count;
  return Math.max(0, qAvg - qLimit);
}

/** Maximum bonus in multiplier points (keeps the contribution modest). */
const BONUS_SCALE = 4.0;
const MODESTY_CAP = 2.0;
const MAX_MULTIPLIER = 12;

/**
 * Convert a continuous margin into a bounded additive bonus on the P17 seat
 * multiplier. Returns 0 for L4 (saturated), FAIL/indeterminate, non-positive
 * margins, or missing evidence. The bonus can never lift a seat above the L4
 * maximum contribution.
 *
 * @param {string} level  - the seat's discrete P17 level ("L1".."L4" or "FAIL").
 * @param {number} margin - from computeP17ContinuousMargin (or null/0).
 * @returns {number} bonus multiplier points (>= 0).
 */
export function computeP17ContinuousBonus(level, margin) {
  if (!/^(L[1-4])$/.test(String(level || ""))) return 0;
  if (!isNum(margin) || margin <= 0) return 0;
  const baseMult = { L4: 12, L3: 8, L2: 4, L1: 2 }[String(level)];
  if (baseMult >= MAX_MULTIPLIER) return 0; // L4 saturated
  const ceiling = MAX_MULTIPLIER - baseMult;
  const raw = margin * BONUS_SCALE;
  return Math.max(0, Math.min(MODESTY_CAP, Math.min(ceiling, raw)));
}

/** Effective P17 multiplier after the continuous bonus, capped at L4 max. */
export function effectiveP17Multiplier(level, margin) {
  const base = { L4: 12, L3: 8, L2: 4, L1: 2, FAIL: -5 }[String(level || "")];
  if (!isNum(base)) return null;
  return Math.min(MAX_MULTIPLIER, base + computeP17ContinuousBonus(level, margin));
}