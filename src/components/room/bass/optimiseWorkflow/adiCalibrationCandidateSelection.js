// adiCalibrationCandidateSelection.js
// ---------------------------------------------------------------------------
// WHICH safe calibration candidate ADI applies, and why the others are not.
//
// Product rule this exists to satisfy:
//
//   A processor-level calibration change — subwoofer delay, group delay,
//   rear-sub offset, gain trim, polarity, all-pass phase — is applied by ADI on
//   its own when the run's OWN confirmed canonical results show that it:
//     • improves P20 materially,
//     • does not materially worsen P19,
//     • does not regress a primary seat,
//     • is not a worse balanced result.
//
//   When more than one confirmed calibration candidate qualifies, the STRONGER
//   one is applied and every other one states WHY it was not. A calibration
//   improvement is never left on the panel without a reason.
//
// This module makes no decision of its own: every candidate is put to
// `resolveCalibrationAutoApply`, the single decision authority, which owns the
// damage, primary-seat, hand-set and materiality rules. All this module does is
// collect the candidates the run itself confirmed (with the tuning it confirmed
// them under) and pick the strongest of those the authority authorised.
//
// It reads values the run already produced. It evaluates no acoustic result,
// changes no scoring threshold, invents no candidate and applies nothing.
// Physical candidates (positions, seating, layout, products) are never read here
// and can never be selected — this module only ever returns processor settings.
//
// Pure: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import {
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
  CALIBRATION_LEVER_LABEL,
  describeCalibrationNotApplied,
  resolveCalibrationAutoApply,
} from "./adiCalibrationAutoApplyAuthority.js";

/** The calibration levers, in the fixed least-intrusive order. */
export const CALIBRATION_CANDIDATE_ORDER = Object.freeze(["delay", "gain", "polarity", "phase"]);

const LABEL = (lever) => CALIBRATION_LEVER_LABEL[lever] || String(lever || "calibration");

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/** Every confirmed option the run retained for one lever, with its tuning. */
function candidatesFromOptions(lever, options) {
  const rows = Array.isArray(options) ? options : [];
  const out = [];
  for (const option of rows) {
    const result = option?.canonical || null;
    if (!result) continue;
    if (option?.validity?.valid === false) continue;
    const tuning = Array.isArray(result.appliedTuning) && result.appliedTuning.length
      ? result.appliedTuning
      : (Array.isArray(option?.tuning) ? option.tuning : []);
    if (!tuning.length) continue;
    out.push({
      lever,
      candidateId: String(result.candidateId || option?.candidateId || ""),
      result,
      tuning,
    });
  }
  return out;
}

/** The candidates the engine itself accepted, when it selected any. */
function acceptedCandidates(selection) {
  return [
    { lever: "delay", result: selection?.calibrationResult || null },
    { lever: "gain", result: selection?.gainResult || null },
    { lever: "polarity", result: selection?.combinedResult || null },
    { lever: "phase", result: selection?.phaseResult || null },
  ]
    .filter((entry) => entry.result && Array.isArray(entry.result.appliedTuning) && entry.result.appliedTuning.length)
    .map((entry) => ({
      lever: entry.lever,
      candidateId: String(entry.result.candidateId || ""),
      result: entry.result,
      tuning: entry.result.appliedTuning,
    }));
}

/**
 * Every CONFIRMED calibration candidate of the run, each with the result the run
 * confirmed and the tuning it confirmed it under. The engine's own accepted
 * result is listed first for its lever; the confirmed options the grouped delay
 * and gain sweeps retained follow. Nothing is re-derived and nothing is invented.
 */
export function confirmedCalibrationCandidates({ selection = null } = {}) {
  if (!selection) return [];
  const out = [];
  const seen = new Set();
  const push = (candidate) => {
    if (!candidate || !candidate.tuning.length) return;
    const key = `${candidate.lever}:${candidate.candidateId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };

  acceptedCandidates(selection).forEach(push);
  candidatesFromOptions("delay", selection?.calibrationDiagnostics?.options).forEach(push);
  candidatesFromOptions("gain", selection?.gainDiagnostics?.options).forEach(push);
  return out;
}

/**
 * How strong a candidate's own confirmed improvement is. Read from the decision's
 * canonical before/after values — the metric the product rule names (P20 first,
 * then P19), never a new score. A level gain is counted ahead of a fractional
 * dB gain on the same objective.
 */
function strengthKey(decision) {
  const improvement = decision?.improvement || null;
  return [
    num(improvement?.p20DeltaDb) ?? 0,
    improvement?.p20LevelGain ? 1 : 0,
    num(improvement?.p19DeltaDb) ?? 0,
    improvement?.p19LevelGain ? 1 : 0,
  ];
}

function isStronger(a, b) {
  const ka = strengthKey(a);
  const kb = strengthKey(b);
  for (let index = 0; index < ka.length; index += 1) {
    if (ka[index] !== kb[index]) return ka[index] > kb[index];
  }
  return false;
}

/** The sentence each non-selected lever states. Never null for an improvement. */
function notAppliedStatement({ entry, selected }) {
  const decision = entry.decision;
  if (selected && decision?.decision === CALIBRATION_APPLY_DECISION.APPLIED) {
    // A second safe candidate that is simply weaker than the selected one.
    return describeCalibrationNotApplied(CALIBRATION_APPLY_REASON.STRONGER_CANDIDATE_SELECTED, {
      lever: entry.lever,
      selectedLever: selected.lever,
    });
  }
  const named = describeCalibrationNotApplied(decision?.reason, {
    lever: entry.lever,
    selectedLever: selected?.lever || null,
  });
  // The decision's own statement carries the numbers; the fixed sentence states
  // the rule. Either answers "why not"; a bare "not applied" answers nothing.
  return named || decision?.statement || null;
}

/**
 * The one calibration application plan for a run.
 *
 * @param {object} params
 * @param {object|null} params.baseline - the run's current (baseline) result
 * @param {object|null} [params.selection] - the run's own selection
 * @param {Array} [params.candidates] - override for the candidate list
 * @param {object|null} [params.objectives] - canonical objective winners of the run
 * @param {Array} [params.instances] - current subwoofer instances
 * @param {object|null} [params.appliedCalibration] - persisted Applied Calibration
 * @returns {object} the selected candidate's own decision, plus the per-lever
 *   record of what ADI did with each calibration lever and why.
 */
export function resolveCalibrationApplicationPlan({
  baseline = null,
  selection = null,
  candidates = null,
  objectives = null,
  instances = [],
  appliedCalibration = null,
} = {}) {
  const list = Array.isArray(candidates) ? candidates : confirmedCalibrationCandidates({ selection });

  const evaluated = list.map((candidate) => ({
    ...candidate,
    decision: resolveCalibrationAutoApply({
      baseline,
      // The decision authority reads the candidate's own confirmed tuning; the
      // result is passed with the tuning it was confirmed under.
      candidate: { ...candidate.result, appliedTuning: candidate.tuning },
      objectives,
      instances,
      appliedCalibration,
    }),
  }));

  let selected = null;
  for (const entry of evaluated) {
    if (entry.decision.decision !== CALIBRATION_APPLY_DECISION.APPLIED) continue;
    if (!selected || isStronger(entry.decision, selected.decision)) selected = entry;
  }

  // Keep every confirmed candidate's effective decision, not just one per lever.
  const candidateDecisions = evaluated.map((entry) => {
    const applied = entry === selected;
    const superseded = !applied && selected
      && entry.decision.decision === CALIBRATION_APPLY_DECISION.APPLIED;
    return {
      lever: entry.lever,
      candidateId: entry.candidateId,
      applied,
      decision: superseded ? CALIBRATION_APPLY_DECISION.HOLD : entry.decision.decision,
      reason: superseded ? CALIBRATION_APPLY_REASON.STRONGER_CANDIDATE_SELECTED : entry.decision.reason,
      statement: applied ? entry.decision.statement : notAppliedStatement({ entry, selected }),
      decisionRecord: entry.decision,
    };
  });

  const perLever = {};
  for (const lever of CALIBRATION_CANDIDATE_ORDER) {
    const entries = evaluated.filter((candidate) => candidate.lever === lever);
    const entry = selected?.lever === lever ? selected : entries.reduce((best, candidate) =>
      !best || isStronger(candidate.decision, best.decision) ? candidate : best, null);
    if (!entry) {
      perLever[lever] = null;
      continue;
    }
    const applied = Boolean(selected && entry === selected);
    perLever[lever] = {
      lever,
      applied,
      candidateId: entry.candidateId,
      decision: candidateDecisions.find((candidate) => candidate.lever === lever && candidate.candidateId === entry.candidateId).decision,
      reason: candidateDecisions.find((candidate) => candidate.lever === lever && candidate.candidateId === entry.candidateId).reason,
      // Stated for a lever that improved but was not applied. Null when the lever
      // is the one applied, or when it produced no improvement to hold.
      statement: applied ? null : notAppliedStatement({ entry, selected }),
      decisionRecord: applied ? entry.decision : null,
    };
  }

  // Run-level record: the selected candidate's own decision, or — when nothing
  // was applied — the most informative blocked decision, so the panel states a
  // reason rather than an empty outcome.
  const fallback = selected?.decision
    || evaluated.find((entry) => entry.decision.decision === CALIBRATION_APPLY_DECISION.HOLD)?.decision
    || evaluated[0]?.decision
    || resolveCalibrationAutoApply({ baseline, candidate: null, instances });

  return {
    ...fallback,
    // The selected candidate's tuning is the one applied. When nothing was
    // selected, the held candidate's own tuning is carried for the record only —
    // the apply surface reads `selected`, never this field.
    tuning: selected
      ? selected.tuning
      : (Array.isArray(fallback?.tuning) ? fallback.tuning : []),
    selected: selected
      ? {
        lever: selected.lever,
        candidateId: selected.candidateId,
        tuning: selected.tuning,
        decision: selected.decision,
      }
      : null,
    candidateCount: evaluated.length,
    candidateDecisions,
    perLever,
  };
}

/** The selected candidate's own decision, or null when none was applied. */
export function selectedCalibrationDecision(applicationPlan) {
  return applicationPlan?.selected?.decision || null;
}

export { LABEL as calibrationLeverLabel };