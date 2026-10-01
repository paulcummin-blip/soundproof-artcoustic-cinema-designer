// optimiserRunFamilies.js
// ---------------------------------------------------------------------------
// The PER-FAMILY ledger of a completed optimiser run.
//
// Product rule this exists to satisfy: if ADI tested something, it must tell the
// user what happened. Every family the optimiser can search gets a row stating
// whether it was tested, what the best attempt was, and — when there is no
// attempt — the explicit reason why not.
//
// READ-ONLY: this module reads the run's own selection object and diagnostics
// report. It evaluates nothing, scores nothing, recalculates nothing and never
// invents a value the run did not produce.
// ---------------------------------------------------------------------------

import { POLARITY_NOT_EVALUATED_REASON } from "./optimiserPlanConstants.js";
import { sortFamiliesLeastIntrusive } from "./optimiserLeverOrder.js";
import {
  PHASE_CROSSOVER_REGION_TITLE,
  resolveCrossoverRegionPhaseRow,
} from "./crossoverRegionPhaseAuthority.js";

/** The optimiser families a run can test. */
export const OPTIMISER_RUN_FAMILY = Object.freeze({
  PLACEMENT: "placement",
  DELAY: "delay",
  GAIN: "gain",
  PHASE: "phase",
  POLARITY: "polarity",
  COMBINED: "combined",
  ADDITIONAL_POSITIONS: "additional_positions",
  SUBWOOFER_OPTION: "subwoofer_option",
  SEAT_MOVEMENT: "seat_movement",
});

export const OPTIMISER_FAMILY_LABEL = Object.freeze({
  [OPTIMISER_RUN_FAMILY.PLACEMENT]: "Placement",
  [OPTIMISER_RUN_FAMILY.DELAY]: "Delay",
  [OPTIMISER_RUN_FAMILY.GAIN]: "Gain",
  [OPTIMISER_RUN_FAMILY.PHASE]: "Phase",
  [OPTIMISER_RUN_FAMILY.POLARITY]: "Polarity",
  [OPTIMISER_RUN_FAMILY.COMBINED]: "Combined candidate search",
  [OPTIMISER_RUN_FAMILY.ADDITIONAL_POSITIONS]: "Layout",
  [OPTIMISER_RUN_FAMILY.SUBWOOFER_OPTION]: "Subwoofer option",
  [OPTIMISER_RUN_FAMILY.SEAT_MOVEMENT]: "Seating",
});

/**
 * Stated for the subwoofer-model family. The optimiser searches placement,
 * timing, level, phase and polarity — it does not search a different subwoofer
 * model or quantity, so that option is stated rather than silently omitted.
 */
export const SUBWOOFER_OPTION_NOT_SEARCHED_REASON =
  "Not searched by the optimiser — subwoofer model and quantity are a design decision, not an optimisation lever.";

/** What happened to a family, stated plainly. */
export const OPTIMISER_FAMILY_STATUS = Object.freeze({
  /** Evaluated. The best attempt is retained, and nothing was accepted. */
  REJECTED: "rejected",
  /** Evaluated, but the run retained no attempt value for it. */
  EVALUATED: "evaluated",
  /** Never evaluated in this run. */
  NOT_TESTED: "not_tested",
  /** Explored only inside another family — no standalone evaluation exists. */
  NOT_TESTED_SEPARATELY: "not_tested_separately",
  /** The evaluation itself errored. */
  FAILED: "failed",
  /** Started but did not finish. */
  INCOMPLETE: "incomplete",
});

export const OPTIMISER_FAMILY_STATUS_LABEL = Object.freeze({
  [OPTIMISER_FAMILY_STATUS.REJECTED]: "Tested — best attempt rejected",
  [OPTIMISER_FAMILY_STATUS.EVALUATED]: "Tested",
  [OPTIMISER_FAMILY_STATUS.NOT_TESTED]: "Search did not run in this evaluation",
  [OPTIMISER_FAMILY_STATUS.NOT_TESTED_SEPARATELY]: "No standalone search — evaluated inside the combined candidate",
  [OPTIMISER_FAMILY_STATUS.FAILED]: "Evaluation failed",
  [OPTIMISER_FAMILY_STATUS.INCOMPLETE]: "Evaluation incomplete",
});

/** The reason recorded when a family produced no attempt and never errored. */
export const OPTIMISER_FAMILY_NOT_TESTED_REASON =
  "This search was not started in this run.";

/** The reason recorded for a family that was evaluated but produced no winner. */
export const OPTIMISER_FAMILY_NO_WINNER_REASON =
  "Evaluated, but no candidate from this family was confirmed as a winner.";

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const round2 = (value) => (value == null ? null : Math.round(value * 100) / 100);

function stageByName(diagnostics, name) {
  const stages = Array.isArray(diagnostics?.stages) ? diagnostics.stages : [];
  return stages.find((stage) => String(stage?.name || "").toLowerCase() === name.toLowerCase()) || null;
}

/** The first recorded issue for a family, or null. */
function issueFor(selection, stageNames = []) {
  const issues = Array.isArray(selection?.evaluationIssues) ? selection.evaluationIssues : [];
  const wanted = stageNames.map((name) => name.toLowerCase());
  return issues.find((issue) => wanted.includes(String(issue?.stage || "").toLowerCase())) || null;
}

function issueText(issue) {
  if (!issue) return null;
  if (typeof issue.error === "string" && issue.error) return issue.error;
  const list = Array.isArray(issue.issues) ? issue.issues.filter(Boolean) : [];
  return list.length ? list.join(" · ") : "The evaluation did not complete.";
}

/** The reason the run itself recorded for a stage, when it recorded one. */
function stageReason(stage) {
  return typeof stage?.reason === "string" && stage.reason.trim() ? stage.reason : null;
}

/** Score fields of a family's best evaluated attempt, with nulls preserved. */
function attemptScore(score) {
  if (!score) return null;
  const p19 = num(score.p19VariationDb);
  const p20 = num(score.p20VariationDb);
  if (p19 == null && p20 == null) return null;
  return {
    candidateId: score.candidateId || null,
    p19VariationDb: p19,
    p19Level: score.p19Level ?? null,
    p20VariationDb: p20,
    p20Level: score.p20Level ?? null,
    p18Hz: num(score.p18Hz),
    p14Db: num(score.p14Db),
  };
}

/** The stage's best evaluated attempt, read from its recorded best-after score. */
function bestFromStage(stage) {
  if (!stage) return null;
  const score = attemptScore({ ...(stage.bestScoreAfter || {}), candidateId: stage.winningCandidate?.candidateId || null });
  return score;
}

/** How many candidates of that family were fully confirmed. */
function confirmedCount(stage) {
  const counts = stage?.candidatesEvaluated || {};
  return num(counts.confirmed);
}

/** Build one family record. */
function family({
  key, status, candidatesEvaluated = null, bestAttempt = null, reason = null, accepted = false, current = null,
}) {
  return {
    family: key,
    label: OPTIMISER_FAMILY_LABEL[key],
    status,
    statusLabel: OPTIMISER_FAMILY_STATUS_LABEL[status],
    candidatesEvaluated,
    bestAttempt: bestAttempt
      ? {
        ...bestAttempt,
        p20DeltaDb: current?.p20VariationDb != null && bestAttempt.p20VariationDb != null
          ? round2(bestAttempt.p20VariationDb - current.p20VariationDb) : null,
        p19DeltaDb: current?.p19VariationDb != null && bestAttempt.p19VariationDb != null
          ? round2(bestAttempt.p19VariationDb - current.p19VariationDb) : null,
        p14DeltaDb: current?.p14AchievedDb != null && bestAttempt.p14Db != null
          ? round2(bestAttempt.p14Db - current.p14AchievedDb) : null,
      }
      : null,
    reason,
    // Whether this family was actually evaluated in the run. A family that was
    // never started (or only explored inside another search) is never presented
    // as an evaluated lever.
    tested: status === OPTIMISER_FAMILY_STATUS.REJECTED
      || status === OPTIMISER_FAMILY_STATUS.EVALUATED
      || status === OPTIMISER_FAMILY_STATUS.FAILED
      || status === OPTIMISER_FAMILY_STATUS.INCOMPLETE,
    // Nothing a run produced can be applied until a winner is confirmed.
    accepted,
    applicable: false,
  };
}

/** A lever-shaped family (placement / delay / gain / phase). */
function leverFamily({
  key,
  stageName,
  selection,
  diagnostics,
  current,
  issueStages = [stageName.toLowerCase(), "calibration", "global"],
  reasonFallback = null,
}) {
  const stage = stageByName(diagnostics, stageName);
  const issue = issueFor(selection, issueStages);
  const attempted = confirmedCount(stage) != null ? confirmedCount(stage) > 0 : !!stage?.winningCandidate;
  const best = bestFromStage(stage);

  if (issue) {
    return family({
      key,
      status: OPTIMISER_FAMILY_STATUS.FAILED,
      candidatesEvaluated: confirmedCount(stage),
      bestAttempt: best,
      reason: issueText(issue),
      current,
    });
  }
  if (best) {
    return family({
      key,
      status: OPTIMISER_FAMILY_STATUS.REJECTED,
      candidatesEvaluated: confirmedCount(stage),
      bestAttempt: best,
      reason: OPTIMISER_FAMILY_NO_WINNER_REASON,
      current,
    });
  }
  if (attempted) {
    return family({
      key,
      status: OPTIMISER_FAMILY_STATUS.EVALUATED,
      candidatesEvaluated: confirmedCount(stage),
      reason: stageReason(stage) || reasonFallback
        || "Evaluated — no comparison value was kept for this search.",
      current,
    });
  }
  return family({
    key,
    status: OPTIMISER_FAMILY_STATUS.NOT_TESTED,
    candidatesEvaluated: confirmedCount(stage),
    reason: stageReason(stage) || reasonFallback || OPTIMISER_FAMILY_NOT_TESTED_REASON,
    current,
  });
}

/**
 * Build the complete per-family ledger of a run.
 *
 * @param {object} params
 * @param {object|null} params.selection - the V2 optimiser selection
 * @param {object|null} params.diagnostics - the engine's diagnostics report
 * @param {object|null} [params.current] - current P19/P20 headline, for deltas
 * @returns {Array} one record per family, in the order the optimiser searches them
 */
export function buildFamilyLedger({ selection = null, diagnostics = null, current = null } = {}) {
  const families = [];

  families.push(leverFamily({
    key: OPTIMISER_RUN_FAMILY.PLACEMENT,
    stageName: "Placement",
    selection,
    diagnostics,
    current,
  }));
  families.push(leverFamily({
    key: OPTIMISER_RUN_FAMILY.DELAY,
    stageName: "Delay",
    selection,
    diagnostics,
    current,
  }));
  families.push(leverFamily({
    key: OPTIMISER_RUN_FAMILY.GAIN,
    stageName: "Gain",
    selection,
    diagnostics,
    current,
  }));

  // ── Phase / crossover-region alignment ── lever 3.
  // The engine's phase search is a subwoofer-only all-pass referenced at 80 Hz,
  // so the speaker/sub crossover region itself is NOT evaluated. The row states
  // that plainly and keeps the sub-only attempt as evidence, labelled as exactly
  // what it is — it is never presented as crossover-region alignment.
  const phaseStage = stageByName(diagnostics, "Phase");
  const phaseIssue = issueFor(selection, ["phase"]);
  const phaseBest = bestFromStage(phaseStage);
  const phaseCount = confirmedCount(phaseStage);
  const phaseAttempted = phaseCount != null ? phaseCount > 0 : !!phaseStage?.winningCandidate;
  const crossoverRegion = resolveCrossoverRegionPhaseRow({ subPhaseTested: phaseAttempted });
  families.push({
    ...family({
      key: OPTIMISER_RUN_FAMILY.PHASE,
      status: phaseIssue
        ? OPTIMISER_FAMILY_STATUS.FAILED
        : OPTIMISER_FAMILY_STATUS.NOT_TESTED,
      candidatesEvaluated: phaseCount,
      bestAttempt: phaseBest,
      reason: phaseIssue ? issueText(phaseIssue) : crossoverRegion.reason,
      current,
    }),
    label: PHASE_CROSSOVER_REGION_TITLE,
    statusLabel: phaseIssue
      ? OPTIMISER_FAMILY_STATUS_LABEL[OPTIMISER_FAMILY_STATUS.FAILED]
      : crossoverRegion.stateLabel,
    // A retained attempt here is subwoofer-only phase, never crossover alignment.
    bestAttemptScope: phaseBest ? "subwoofer_phase_only" : null,
    crossoverRegion,
  });

  // ── Polarity ── explored inside the per-candidate delay/polarity/trim proxy
  // search. No standalone polarity-only evaluation exists, and that is stated
  // rather than presented as an evaluated lever.
  const polarityStage = stageByName(diagnostics, "Polarity");
  const proxySearches = num(polarityStage?.candidatesEvaluated?.proxySearches) ?? null;
  const combinedAttempt = selection?.combinedResult
    ? attemptScore({
      ...(selection.combinedResult.score || {}),
      ...(selection.combinedResult.achievedP19VariationDb != null ? { p19VariationDb: selection.combinedResult.achievedP19VariationDb } : {}),
      ...(selection.combinedResult.achievedP20VariationDb != null ? { p20VariationDb: selection.combinedResult.achievedP20VariationDb } : {}),
      p19Level: selection.combinedResult.achievedP19Level ?? null,
      p20Level: selection.combinedResult.achievedP20Level ?? null,
      p18Hz: selection.combinedResult.achievedP18Hz ?? null,
      p14Db: selection.combinedResult.p14AchievedDb ?? null,
      candidateId: selection.combinedResult.candidateId || null,
    })
    : null;
  families.push(family({
    key: OPTIMISER_RUN_FAMILY.POLARITY,
    status: OPTIMISER_FAMILY_STATUS.NOT_TESTED_SEPARATELY,
    candidatesEvaluated: proxySearches,
    bestAttempt: combinedAttempt,
    reason: POLARITY_NOT_EVALUATED_REASON,
    current,
  }));

  // ── Combined ── the combined candidate search.
  const combinedIssue = issueFor(selection, ["combined"]);
  families.push(family({
    key: OPTIMISER_RUN_FAMILY.COMBINED,
    status: combinedIssue
      ? OPTIMISER_FAMILY_STATUS.FAILED
      : (combinedAttempt ? OPTIMISER_FAMILY_STATUS.REJECTED : OPTIMISER_FAMILY_STATUS.NOT_TESTED),
    candidatesEvaluated: null,
    bestAttempt: combinedAttempt,
    reason: combinedIssue
      ? issueText(combinedIssue)
      : (combinedAttempt ? OPTIMISER_FAMILY_NO_WINNER_REASON : OPTIMISER_FAMILY_NOT_TESTED_REASON),
    current,
  }));

  // ── Additional / alternative positions ── the positional escalation phases.
  const positionOpt = selection?.positionOptimisation || null;
  const positionPhases = positionOpt
    ? [positionOpt.symmetric, positionOpt.asymmetricPair, positionOpt.individual].filter((phase) => phase?.attempted)
    : [];
  const positionConfirmed = positionPhases.reduce((sum, phase) => sum + (num(phase.confirmed) || 0), 0);
  const positionAttempt = bestFromStage(stageByName(diagnostics, "Placement"));
  families.push(family({
    key: OPTIMISER_RUN_FAMILY.ADDITIONAL_POSITIONS,
    status: positionPhases.length
      ? (positionAttempt ? OPTIMISER_FAMILY_STATUS.REJECTED : OPTIMISER_FAMILY_STATUS.EVALUATED)
      : OPTIMISER_FAMILY_STATUS.NOT_TESTED,
    candidatesEvaluated: positionPhases.length ? positionConfirmed : null,
    bestAttempt: positionPhases.length ? positionAttempt : null,
    reason: positionPhases.length
      ? (positionAttempt ? OPTIMISER_FAMILY_NO_WINNER_REASON : "Evaluated — no comparison value was kept for this search.")
      : OPTIMISER_FAMILY_NOT_TESTED_REASON,
    current,
  }));

  // ── Subwoofer model / quantity ── never searched by the optimiser. Stated so
  // a dealer can see the option was considered and left to the designer.
  families.push(family({
    key: OPTIMISER_RUN_FAMILY.SUBWOOFER_OPTION,
    status: OPTIMISER_FAMILY_STATUS.NOT_TESTED,
    candidatesEvaluated: null,
    bestAttempt: null,
    reason: SUBWOOFER_OPTION_NOT_SEARCHED_REASON,
    current,
  }));

  // ── Seat movement ── the seating-position search, always last resort.
  const seatingIssue = issueFor(selection, ["seating"]);
  const seatingResult = selection?.seatingResult || null;
  const seatingAttempt = seatingResult
    ? attemptScore({
      p19VariationDb: seatingResult.achievedP19VariationDb,
      p19Level: seatingResult.achievedP19Level ?? null,
      p20VariationDb: seatingResult.achievedP20VariationDb,
      p20Level: seatingResult.achievedP20Level ?? null,
      p18Hz: seatingResult.achievedP18Hz ?? null,
      p14Db: seatingResult.p14AchievedDb ?? null,
      candidateId: seatingResult.candidateId || null,
    })
    : null;
  const seatingTested = !!seatingResult
    || num(selection?.seatingDiagnostics?.confirmed) > 0
    || selection?.seatingMaterial != null;
  families.push(family({
    key: OPTIMISER_RUN_FAMILY.SEAT_MOVEMENT,
    status: seatingIssue
      ? OPTIMISER_FAMILY_STATUS.FAILED
      : (seatingAttempt
        ? OPTIMISER_FAMILY_STATUS.REJECTED
        : (seatingTested ? OPTIMISER_FAMILY_STATUS.EVALUATED : OPTIMISER_FAMILY_STATUS.NOT_TESTED)),
    candidatesEvaluated: num(selection?.seatingDiagnostics?.confirmed),
    bestAttempt: seatingAttempt,
    reason: seatingIssue
      ? issueText(seatingIssue)
      : (seatingAttempt ? OPTIMISER_FAMILY_NO_WINNER_REASON
        : (seatingTested
          ? "Evaluated — no comparison value was kept for this search."
          : "Not searched — listener movement is a last resort, tried only once the electronic and placement options are exhausted.")),
    current,
  }));

  // Least-intrusive first: delay, gain, phase, polarity, placement, layout,
  // subwoofer option, seating. Searches that are not a lever (the combined
  // candidate) are reported last.
  return sortFamiliesLeastIntrusive(families);
}