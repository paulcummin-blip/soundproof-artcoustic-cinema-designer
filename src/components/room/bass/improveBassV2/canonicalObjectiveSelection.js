// canonicalObjectiveSelection.js
// ---------------------------------------------------------------------------
// Canonical objective winners for the bass optimiser.
//
// The funnel must be able to name, from CANONICAL confirmed results only:
//
//   bestCanonicalP19       best RSP response versus target
//   bestCanonicalP20       best seat-to-seat consistency
//   bestCanonicalBalanced  best practical compromise between the two
//
// It never changes the final winner rule — `finalRecommendedCandidate` stays
// the selection the engine already produced. This module only makes the
// single-objective alternatives visible, ranked and explainable.
//
// P19 is read from the aggregate RSP authority (never per-seat P19 arrays).
// Pure: no React, no side effects.
// ---------------------------------------------------------------------------

import { readRspP19 } from "./p19Authority.js";

/** A candidate must not make either objective materially worse than baseline. */
export const BALANCED_DAMAGE_THRESHOLD_DB = 1.0;
const TOLERANCE = 1e-9;

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function levelOf(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 4) return value;
  if (value === "FAIL") return 0;
  const match = typeof value === "string" ? value.match(/^L([1-4])$/i) : null;
  return match ? Number(match[1]) : null;
}

function idOf(entry) {
  return String(entry?.result?.candidateId ?? entry?.result?.id ?? "");
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

/** The canonical P19 (aggregate RSP) and P20 values of a confirmed candidate. */
export function canonicalObjectives(result) {
  return {
    result,
    p19: finiteOrNull(result?.achievedP19VariationDb),
    p19Level: readRspP19(result).level,
    p20: finiteOrNull(result?.achievedP20VariationDb),
    p20Level: levelOf(result?.achievedP20Level),
  };
}

/** One entry per candidate id; a duplicate id keeps the better canonical result. */
export function dedupeCandidates(candidates) {
  const byId = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate) continue;
    const id = String(candidate.candidateId ?? candidate.id ?? "");
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) { byId.set(id, candidate); continue; }
    const a = canonicalObjectives(existing);
    const b = canonicalObjectives(candidate);
    const aScore = (a.p19 ?? Infinity) + (a.p20 ?? Infinity);
    const bScore = (b.p19 ?? Infinity) + (b.p20 ?? Infinity);
    if (bScore < aScore) byId.set(id, candidate);
  }
  return [...byId.values()];
}

/**
 * Select the canonical objective winners from confirmed candidates.
 *
 * @param {object} params
 * @param {Array} params.candidates - canonical confirmed results
 * @param {object|null} params.baseline - the current design authority
 */
export function selectCanonicalObjectives({ candidates = [], baseline = null } = {}) {
  const pool = dedupeCandidates(candidates)
    .filter((result) => result && result.candidateKind !== "current" && result.candidateId !== "current");

  const scored = pool
    .map(canonicalObjectives)
    .filter((entry) => entry.p19 != null && entry.p20 != null);

  if (!scored.length) {
    return {
      scoredCount: 0,
      bestCanonicalP19: null, bestCanonicalP20: null, bestCanonicalBalanced: null,
      values: { bestP19: null, bestP20: null, balanced: null },
    };
  }

  const bestP19Value = Math.min(...scored.map((entry) => entry.p19));
  const bestP20Value = Math.min(...scored.map((entry) => entry.p20));
  const baseP19 = finiteOrNull(baseline?.achievedP19VariationDb);
  const baseP20 = finiteOrNull(baseline?.achievedP20VariationDb);

  const byP19 = [...scored].sort((a, b) =>
    (a.p19 - b.p19) || (a.p20 - b.p20) || idOf(a).localeCompare(idOf(b)));
  const byP20 = [...scored].sort((a, b) =>
    (a.p20 - b.p20) || (a.p19 - b.p19) || idOf(a).localeCompare(idOf(b)));

  const balanced = scored.map((entry) => {
    const damagesP19 = baseP19 != null && entry.p19 > baseP19 + BALANCED_DAMAGE_THRESHOLD_DB;
    const damagesP20 = baseP20 != null && entry.p20 > baseP20 + BALANCED_DAMAGE_THRESHOLD_DB;
    const improvesP19 = baseP19 != null && entry.p19 < baseP19 - TOLERANCE;
    const improvesP20 = baseP20 != null && entry.p20 < baseP20 - TOLERANCE;
    return {
      ...entry,
      damagesP19, damagesP20,
      damages: damagesP19 || damagesP20,
      improvesBoth: improvesP19 && improvesP20,
      improvesOne: improvesP19 || improvesP20,
      // Normalised against the best single-objective value: minimising the
      // WORSE of the two ratios is the compromise measure.
      worseRatio: Math.max(
        bestP19Value > 0 ? entry.p19 / bestP19Value : 1,
        bestP20Value > 0 ? entry.p20 / bestP20Value : 1,
      ),
    };
  }).sort((a, b) =>
    (a.damages ? 1 : 0) - (b.damages ? 1 : 0)
    || (b.improvesBoth ? 1 : 0) - (a.improvesBoth ? 1 : 0)
    || (b.improvesOne ? 1 : 0) - (a.improvesOne ? 1 : 0)
    || (a.worseRatio - b.worseRatio)
    || (a.p19 - b.p19) || (a.p20 - b.p20)
    || idOf(a).localeCompare(idOf(b)))[0];

  return {
    // The three winners, their canonical values, and how many candidates were
    // compared. No candidate pool is carried: the ledger owns the per-candidate
    // detail, so the persisted selection stays lean.
    scoredCount: scored.length,
    bestCanonicalP19: byP19[0]?.result || null,
    bestCanonicalP20: byP20[0]?.result || null,
    bestCanonicalBalanced: balanced?.result || null,
    values: {
      bestP19: byP19[0] ? { p19: byP19[0].p19, p20: byP19[0].p20 } : null,
      bestP20: byP20[0] ? { p19: byP20[0].p19, p20: byP20[0].p20 } : null,
      balanced: balanced ? { p19: balanced.p19, p20: balanced.p20, damages: balanced.damages } : null,
    },
  };
}

/**
 * State, in plain engineering language, what the final recommendation favours
 * and what it gives up against the best single-objective candidate.
 *
 * @param {object} params
 * @param {object|null} params.finalCandidate - the engine's chosen winner
 * @param {object|null} params.objectives - selectCanonicalObjectives() output
 */
export function explainFinalSelection({ finalCandidate = null, objectives = null } = {}) {
  if (!finalCandidate) {
    return {
      objective: "none",
      objectiveLabel: "No recommendation",
      reason: "No candidate reached a material improvement over the current design.",
      tradeOff: null,
      values: null,
    };
  }

  const values = canonicalObjectives(finalCandidate);
  const isBestP19 = !!objectives?.bestCanonicalP19 && objectives.bestCanonicalP19 === finalCandidate;
  const isBestP20 = !!objectives?.bestCanonicalP20 && objectives.bestCanonicalP20 === finalCandidate;
  const isBalanced = !!objectives?.bestCanonicalBalanced && objectives.bestCanonicalBalanced === finalCandidate;

  let objective = "practical";
  let objectiveLabel = "Practical intervention ordering";
  if (isBestP19 && isBestP20) {
    objective = "both";
    objectiveLabel = "Improves RSP response and seat consistency";
  } else if (isBalanced) {
    objective = "balanced";
    objectiveLabel = "Balanced RSP response / seat consistency compromise";
  } else if (isBestP19) {
    objective = "rsp";
    objectiveLabel = "RSP response quality (P19)";
  } else if (isBestP20) {
    objective = "consistency";
    objectiveLabel = "Seat-to-seat consistency (P20)";
  }

  const reasonByObjective = {
    both: "It is the best confirmed candidate for both objectives.",
    balanced: "It is the best confirmed compromise between RSP response and seat-to-seat consistency.",
    rsp: "It gives the best confirmed RSP response versus target.",
    consistency: "It gives the best confirmed seat-to-seat consistency.",
    practical: "It is a material confirmed improvement, selected ahead of the single-objective candidates by the established intervention ordering.",
  };

  const bestP19 = objectives?.values?.bestP19;
  const bestP20 = objectives?.values?.bestP20;
  const sacrifices = [];
  if (bestP19 && values.p19 != null && values.p19 > bestP19.p19 + TOLERANCE) {
    sacrifices.push(`accepts ${round1(values.p19 - bestP19.p19)} dB more RSP deviation than the best P19 candidate`);
  }
  if (bestP20 && values.p20 != null && values.p20 > bestP20.p20 + TOLERANCE) {
    sacrifices.push(`accepts ${round1(values.p20 - bestP20.p20)} dB more seat-to-seat deviation than the best P20 candidate`);
  }

  return {
    objective,
    objectiveLabel,
    reason: reasonByObjective[objective],
    tradeOff: sacrifices.length
      ? `It ${sacrifices.join(" and ")}.`
      : "It gives up nothing material against the best single-objective candidate.",
    values: { p19: values.p19, p19Level: values.p19Level, p20: values.p20, p20Level: values.p20Level },
  };
}