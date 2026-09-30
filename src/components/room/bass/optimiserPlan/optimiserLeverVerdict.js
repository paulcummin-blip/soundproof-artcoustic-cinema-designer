// optimiserLeverVerdict.js
// ---------------------------------------------------------------------------
// What a lever's own evaluated effect actually means, stated plainly.
//
// Product rule: a lever that makes the limiting result worse is NEVER presented
// as an applyable recommendation. Only these outcomes exist:
//
//   Recommended     — improves the limiting result and damages nothing required
//   Trade-off       — improves the limiting result but worsens a named metric
//   Rejected        — makes the limiting result (or seat-to-seat consistency) worse
//   No improvement  — evaluated, nothing worth applying
//   Not tested      — never evaluated, reason stated
//   Not applicable  — no individually evaluated effect exists to apply
//
// READ-ONLY: it reads the effect the optimiser already measured. It evaluates
// nothing, scores nothing, recalculates nothing, and changes no bass maths.
// ---------------------------------------------------------------------------

import { deltaText, deviationText, levelText } from "./optimiserWholeNumberDb.js";

export const OPTIMISER_LEVER_VERDICT = Object.freeze({
  RECOMMENDED: "recommended",
  TRADE_OFF: "trade_off",
  REJECTED: "rejected",
  NO_IMPROVEMENT: "no_improvement",
  NOT_TESTED: "not_tested",
  NOT_APPLICABLE: "not_applicable",
});

export const OPTIMISER_LEVER_VERDICT_LABEL = Object.freeze({
  [OPTIMISER_LEVER_VERDICT.RECOMMENDED]: "Recommended",
  [OPTIMISER_LEVER_VERDICT.TRADE_OFF]: "Trade-off",
  [OPTIMISER_LEVER_VERDICT.REJECTED]: "Rejected — worsens the result",
  [OPTIMISER_LEVER_VERDICT.NO_IMPROVEMENT]: "Tested — no useful improvement",
  [OPTIMISER_LEVER_VERDICT.NOT_TESTED]: "Not tested",
  [OPTIMISER_LEVER_VERDICT.NOT_APPLICABLE]: "Not independently evaluated",
});

/** A change smaller than this is not a change: it is stated as "no meaningful change". */
const MATERIAL_DB = 0.5;

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const levelNumber = (level) => {
  const numeric = num(level);
  if (numeric != null) return numeric;
  const match = String(level ?? "").trim().toUpperCase().match(/^L?([1-4])$/);
  return match ? Number(match[1]) : null;
};

/**
 * Which result is limiting the design.
 *
 * RP22 bass levels run L1 (lowest) to L4 (highest), so the LOWER level number
 * is the limiting one. With no levels published, seat-to-seat consistency (P20)
 * is treated as the limiting factor.
 */
export function resolveLimitingMetric(baseline = null) {
  const p20Level = levelNumber(baseline?.p20Level);
  const p19Level = levelNumber(baseline?.p19Level);
  if (p20Level != null && p19Level != null) {
    return p19Level < p20Level
      ? { key: "p19", label: "seat-to-seat consistency (P19)" }
      : { key: "p20", label: "seat-to-seat consistency (P20)" };
  }
  if (p20Level != null && p19Level == null) return { key: "p20", label: "seat-to-seat consistency (P20)" };
  if (p19Level != null && p20Level == null) return { key: "p19", label: "seat-to-seat consistency (P19)" };
  return { key: "p20", label: "seat-to-seat consistency (P20)" };
}

const worsening = (delta) => delta != null && delta > MATERIAL_DB;
const improving = (delta) => delta != null && delta < -MATERIAL_DB;

/** Human name of a metric, for trade-off copy. */
const metricName = (key) => (key === "p19" ? "P19 consistency" : "P20 consistency");

/**
 * The verdict for one lever, from its OWN evaluated effect.
 *
 * @param {object} params
 * @param {object|null} params.effect - { p19DeltaDb, p20DeltaDb, p14DeltaDb, outputDeltaDb }
 * @param {object|null} [params.baseline] - current P19/P20 headline, to find the limiting metric
 * @param {boolean} [params.tested] - whether the family was evaluated at all
 * @param {string|null} [params.notTestedReason]
 * @returns {{verdict, label, summary, applyAllowed, tested, limitingKey, limitingLabel}}
 */
export function resolveLeverVerdict({
  effect = null,
  baseline = null,
  tested = true,
  notTestedReason = null,
} = {}) {
  const limiting = resolveLimitingMetric(baseline);

  const base = {
    tested,
    limitingKey: limiting.key,
    limitingLabel: limiting.label,
    applyAllowed: false,
  };

  if (!tested) {
    return {
      ...base,
      verdict: OPTIMISER_LEVER_VERDICT.NOT_TESTED,
      label: OPTIMISER_LEVER_VERDICT_LABEL[OPTIMISER_LEVER_VERDICT.NOT_TESTED],
      summary: notTestedReason || "This lever was not evaluated in this run.",
    };
  }

  const p20Delta = num(effect?.p20DeltaDb);
  const p19Delta = num(effect?.p19DeltaDb);
  const p14Delta = num(effect?.p14DeltaDb);

  if (p20Delta == null && p19Delta == null) {
    return {
      ...base,
      verdict: OPTIMISER_LEVER_VERDICT.NOT_APPLICABLE,
      label: OPTIMISER_LEVER_VERDICT_LABEL[OPTIMISER_LEVER_VERDICT.NOT_APPLICABLE],
      summary: "No individually evaluated result exists for this lever, so it is not offered for separate application.",
    };
  }

  const worsensP20 = worsening(p20Delta);
  const worsensP19 = worsening(p19Delta);
  const hurtsP14 = p14Delta != null && p14Delta < -MATERIAL_DB;
  const improvesP20 = improving(p20Delta);
  const improvesP19 = improving(p19Delta);

  // Rejected: seat-to-seat consistency gets worse, or the limiting metric does.
  if (worsensP20 || (limiting.key === "p19" && worsensP19)) {
    const metric = worsensP20 ? "seat-to-seat consistency" : "P19 consistency";
    const delta = worsensP20 ? p20Delta : p19Delta;
    return {
      ...base,
      verdict: OPTIMISER_LEVER_VERDICT.REJECTED,
      label: OPTIMISER_LEVER_VERDICT_LABEL[OPTIMISER_LEVER_VERDICT.REJECTED],
      summary: `Rejected — worsens ${metric} by ${deltaText(delta)}.`,
    };
  }

  const limitingImproved = limiting.key === "p19" ? improvesP19 : improvesP20;
  const otherWorsened = limiting.key === "p19" ? worsensP20 : worsensP19;

  if (limitingImproved && (otherWorsened || hurtsP14)) {
    const damaged = otherWorsened
      ? metricName(limiting.key === "p19" ? "p20" : "p19")
      : "available output headroom";
    const damagedDelta = otherWorsened ? (limiting.key === "p19" ? p20Delta : p19Delta) : p14Delta;
    return {
      ...base,
      verdict: OPTIMISER_LEVER_VERDICT.TRADE_OFF,
      label: OPTIMISER_LEVER_VERDICT_LABEL[OPTIMISER_LEVER_VERDICT.TRADE_OFF],
      summary: `Trade-off — improves ${limiting.label} but worsens ${damaged} by ${deltaText(Math.abs(damagedDelta))}.`,
      applyAllowed: true,
    };
  }

  if (limitingImproved || improvesP20 || improvesP19) {
    return {
      ...base,
      verdict: OPTIMISER_LEVER_VERDICT.RECOMMENDED,
      label: OPTIMISER_LEVER_VERDICT_LABEL[OPTIMISER_LEVER_VERDICT.RECOMMENDED],
      summary: `Recommended — improves ${limiting.label} with no required metric made worse.`,
      applyAllowed: true,
    };
  }

  return {
    ...base,
    verdict: OPTIMISER_LEVER_VERDICT.NO_IMPROVEMENT,
    label: OPTIMISER_LEVER_VERDICT_LABEL[OPTIMISER_LEVER_VERDICT.NO_IMPROVEMENT],
    summary: "Tested — the best attempt produced no useful improvement, so nothing is offered for application.",
  };
}

/**
 * One-line description of a lever's evaluated effect, in whole numbers.
 * Null when the effect carries no P19/P20 value at all.
 */
export function describeLeverEffect(effect = null) {
  if (!effect) return null;
  const p20 = deviationText(effect.p20VariationDb);
  const p20Delta = deltaText(effect.p20DeltaDb);
  if (p20) {
    const result = p20Delta && p20Delta !== "no meaningful change"
      ? `${p20} (${p20Delta})`
      : p20;
    return `P20 ${result}`;
  }
  const p19 = deviationText(effect.p19VariationDb);
  if (p19) {
    const p19Delta = deltaText(effect.p19DeltaDb);
    return p19Delta && p19Delta !== "no meaningful change" ? `P19 ${p19} (${p19Delta})` : `P19 ${p19}`;
  }
  const level = levelText(effect.p20Level ?? effect.p19Level);
  return level ? `Graded ${level}` : null;
}