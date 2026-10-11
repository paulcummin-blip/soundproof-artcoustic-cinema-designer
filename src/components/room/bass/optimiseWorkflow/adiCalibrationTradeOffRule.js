// adiCalibrationTradeOffRule.js
// ---------------------------------------------------------------------------
// THE 3:1 CALIBRATION TRADE-OFF RULE.
//
// ADI makes a calibrated judgement about a trade-off; it does not block every
// one. For a processor-level calibration change (delay, gain, polarity, phase)
// the run's own confirmed canonical P19/P20 values are read as:
//
//   improvement = old deviation − new deviation   (only positive counts)
//   damage      = new deviation − old deviation   (only positive counts)
//
// and the rule is:
//
//   improvement ≥ 3 × damage            → APPLY AUTOMATICALLY
//   improvement > damage, under 3:1     → USEFUL, REVIEW REQUIRED (held)
//   damage ≥ improvement                → NOT APPLIED (the trade-off is larger)
//
// Example: P20 ±27 dB → ±10 dB (17 dB better) with P19 ±0 dB → ±1 dB (1 dB
// worse) is 17:1, far above 3:1, so it is applied.
//
// This module reads canonical deviations and nothing else. It changes no P19 or
// P20 threshold, no RP22 grading and no bass maths: the ratio rule decides only
// whether an ALREADY-CONFIRMED improvement may be written without asking. Every
// hard guard (level drop, primary-seat regression, hand-set calibration,
// unconfirmed evidence) belongs to the decision authority and is evaluated
// there, not here.
//
// Pure: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

/** The automatic-application ratio: the improvement must be at least this multiple. */
export const CALIBRATION_TRADEOFF_RATIO = 3;

export const CALIBRATION_TRADEOFF_DECISION = Object.freeze({
  /** improvement ≥ 3 × damage — applied on ADI's own authority. */
  AUTO_APPLY: "apply-improvement-at-least-three-times-the-trade-off",
  /** useful improvement, but under 3:1 — held for the designer's approval. */
  REVIEW_REQUIRED: "review-required-trade-off-within-the-three-times-rule",
  /** damage ≥ improvement — never applied. */
  REJECTED: "reject-trade-off-exceeds-the-improvement",
});

/** The stated badge for a held trade-off, so the panel can label the state. */
export const CALIBRATION_TRADEOFF_REVIEW_LABEL = "Review required";

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round1(value) {
  return value == null ? null : Math.round(Number(value) * 10) / 10;
}

/** old − new, counting only a positive result. Lower is better for both metrics. */
function improvementOf(beforeValue, afterValue) {
  const a = num(beforeValue);
  const b = num(afterValue);
  if (a == null || b == null) return 0;
  return Math.max(0, round1(a - b));
}

/** new − old, counting only a positive result. */
function damageOf(beforeValue, afterValue) {
  const a = num(beforeValue);
  const b = num(afterValue);
  if (a == null || b == null) return 0;
  return Math.max(0, round1(b - a));
}

/**
 * The trade-off a confirmed candidate carries, judged by the 3:1 rule.
 *
 * @param {object} params
 * @param {{p19:{deviationDb:number|null},p20:{deviationDb:number|null}}} params.before
 * @param {{p19:{deviationDb:number|null},p20:{deviationDb:number|null}}} params.after
 * @returns {object|null} null when the candidate worsens nothing on the canonical
 *   deviations — there is no trade-off to judge.
 */
export function assessCalibrationTradeOff({ before = null, after = null } = {}) {
  const p19ImprovementDb = improvementOf(before?.p19?.deviationDb, after?.p19?.deviationDb);
  const p20ImprovementDb = improvementOf(before?.p20?.deviationDb, after?.p20?.deviationDb);
  const p19DamageDb = damageOf(before?.p19?.deviationDb, after?.p19?.deviationDb);
  const p20DamageDb = damageOf(before?.p20?.deviationDb, after?.p20?.deviationDb);

  const improvementDb = Math.max(p19ImprovementDb, p20ImprovementDb);
  const damageDb = Math.max(p19DamageDb, p20DamageDb);
  if (damageDb <= 0) return null;

  const improvedSide = p20ImprovementDb >= p19ImprovementDb ? "P20" : "P19";
  const worsenedSide = p19DamageDb >= p20DamageDb ? "P19" : "P20";
  const ratio = Math.round((improvementDb / damageDb) * 100) / 100;

  const decision = damageDb >= improvementDb
    ? CALIBRATION_TRADEOFF_DECISION.REJECTED
    : improvementDb >= CALIBRATION_TRADEOFF_RATIO * damageDb
      ? CALIBRATION_TRADEOFF_DECISION.AUTO_APPLY
      : CALIBRATION_TRADEOFF_DECISION.REVIEW_REQUIRED;

  return {
    decision,
    ratio,
    ratioRule: CALIBRATION_TRADEOFF_RATIO,
    improvementDb,
    damageDb,
    improvedSide,
    worsenedSide,
    p19ImprovementDb,
    p20ImprovementDb,
    p19DamageDb,
    p20DamageDb,
  };
}

/** Why a trade-off at or above the ratio was applied — stated with the numbers. */
export function describeTradeOffAutoApply(tradeOff) {
  if (!tradeOff) return null;
  return `${tradeOff.improvedSide} improves by ${tradeOff.improvementDb} dB while ${tradeOff.worsenedSide} worsens by ${tradeOff.damageDb} dB — ${tradeOff.ratio}:1, at or above the ${tradeOff.ratioRule}:1 rule, so it is applied automatically.`;
}

/** Why a useful but under-ratio trade-off is held for approval. */
export function describeTradeOffReview(tradeOff) {
  if (!tradeOff) return null;
  return `ADI found a calibration trade-off. ${tradeOff.improvedSide} improves by ${tradeOff.improvementDb} dB, but ${tradeOff.worsenedSide} worsens by ${tradeOff.damageDb} dB. This is useful, but not strong enough for automatic application (${tradeOff.ratio}:1 against the ${tradeOff.ratioRule}:1 rule). Review before applying.`;
}

/** Why a trade-off larger than its own benefit is not applied. */
export function describeTradeOffRejected(tradeOff) {
  if (!tradeOff) return null;
  return `Not applied because the trade-off is larger than the improvement: ${tradeOff.improvedSide} improves by ${tradeOff.improvementDb} dB while ${tradeOff.worsenedSide} worsens by ${tradeOff.damageDb} dB (${tradeOff.ratio}:1 against the ${tradeOff.ratioRule}:1 rule).`;
}