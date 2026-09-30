// buildOptimiserRunEvidence.js
// ---------------------------------------------------------------------------
// The persisted TERMINAL RUN EVIDENCE record for an optimiser run that
// completed WITHOUT producing an actionable plan (no confirmed winner, or a
// technical failure).
//
// The plan builder returns null in that case and everything the run evaluated
// used to be discarded. This record keeps it: how many candidates were
// evaluated, which controls were tested, the best attempted result and the
// current result it is compared with, why no candidate was accepted, and the
// fact that the current design was not changed.
//
// It reads only values the run already produced (the optimiser selection and
// the diagnostics report the engine already builds). It invents no lever value,
// estimates no metric, recalculates nothing and never scores a candidate. It
// changes no bass maths and no optimiser behaviour.
// ---------------------------------------------------------------------------

import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_LABEL,
  OPTIMISER_NO_WINNER_REASON,
  OPTIMISER_PLAN_VERSION,
  OPTIMISER_RECORD_KIND,
  OPTIMISER_TERMINAL_OUTCOME,
} from "./optimiserPlanConstants.js";
import { summariseResult } from "./optimiserPlanMetrics.js";

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

/** The diagnostics stage that evidences each lever. */
const STAGE_FOR_LEVER = Object.freeze({
  [OPTIMISER_LEVER.PLACEMENT]: "Placement",
  [OPTIMISER_LEVER.POLARITY]: "Polarity",
  [OPTIMISER_LEVER.DELAY]: "Delay",
  [OPTIMISER_LEVER.GAIN]: "Gain",
});

const STAGE_NAMES = ["Placement", "Polarity", "Delay", "Gain", "Phase", "Final EQ"];

function stageByName(diagnostics, stageName) {
  const stages = Array.isArray(diagnostics?.stages) ? diagnostics.stages : [];
  return stages.find((stage) => String(stage?.name || "").toLowerCase() === stageName.toLowerCase()) || null;
}

/** How many candidates that stage evaluated — read, never derived. */
function stageEvaluatedCount(diagnostics, stageName) {
  const stage = stageByName(diagnostics, stageName);
  if (!stage) return 0;
  const counts = stage.candidatesEvaluated || {};
  return Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function candidateRows(diagnostics) {
  return Array.isArray(diagnostics?.topCandidatesForWinningStage)
    ? diagnostics.topCandidatesForWinningStage
    : [];
}

const normalisePolarity = (value) => (Number(value) < 0 || Number(value) === 180 ? -1 : 1);

/**
 * Polarity has no independent evaluation of its own, so it is only reported as
 * tested when an evaluated candidate actually inverted it against the design.
 */
function polarityEvidenced(rows, currentPolarity) {
  const base = Array.isArray(currentPolarity) ? currentPolarity : [];
  return rows.some((row) => {
    const values = Array.isArray(row?.polarity) ? row.polarity : null;
    if (!values) return false;
    return values.some((value, index) => normalisePolarity(value) !== normalisePolarity(base[index] ?? 1));
  });
}

/** The best ATTEMPTED candidate result — the lowest evaluated P20 of the run. */
function selectBestAttempted(rows) {
  let best = null;
  for (const row of rows) {
    const p20 = num(row?.score?.p20VariationDb);
    if (p20 == null) continue;
    if (!best || p20 < best.p20VariationDb) {
      best = {
        candidateId: row?.candidateId || null,
        candidateKind: row?.candidateKind || null,
        p20VariationDb: p20,
        p20Level: row?.score?.p20Level ?? null,
        p19VariationDb: num(row?.score?.p19VariationDb),
      };
    }
  }
  return best;
}

/**
 * Build the terminal run-evidence record.
 *
 * @param {object} params
 * @param {object|null} params.selection - the V2 optimiser selection
 * @param {object|null} params.diagnostics - the engine's own diagnostics report
 * @param {object} [params.identity] - { projectId, versionId, designFingerprint,
 *   resultFingerprint, cacheKey, baseDesignFingerprint, engineVersion }
 * @param {Array} [params.currentPolarity] - current per-sub polarity
 * @param {boolean} [params.currentDesignUnchanged] - the run wrote no design field
 * @param {string|null} [params.failureReason] - stated technical failure
 * @param {string|null} [params.terminalOutcome] - explicit outcome override
 * @param {string[]} [params.notes]
 * @returns {object|null} null when there is nothing at all to record
 */
export function buildOptimiserRunEvidence({
  selection = null,
  diagnostics = null,
  identity = {},
  currentPolarity = [],
  currentDesignUnchanged = true,
  failureReason = null,
  terminalOutcome = null,
  notes = [],
} = {}) {
  if (!selection && !diagnostics) return null;

  const currentSummary = summariseResult(selection?.currentResult || null);
  const currentP20 = num(diagnostics?.currentResult?.score?.p20VariationDb)
    ?? currentSummary?.p20VariationDb
    ?? null;

  const rows = candidateRows(diagnostics);
  const best = selectBestAttempted(rows);
  const winnerCandidateId = selection?.winner?.candidateId || null;

  const leversTested = [];
  for (const lever of [
    OPTIMISER_LEVER.PLACEMENT,
    OPTIMISER_LEVER.POLARITY,
    OPTIMISER_LEVER.DELAY,
    OPTIMISER_LEVER.GAIN,
  ]) {
    const evaluated = stageEvaluatedCount(diagnostics, STAGE_FOR_LEVER[lever]);
    if (lever === OPTIMISER_LEVER.POLARITY) {
      if (!polarityEvidenced(rows, currentPolarity)) continue;
    } else if (evaluated <= 0) continue;
    leversTested.push({
      lever,
      label: OPTIMISER_LEVER_LABEL[lever],
      candidatesEvaluated: evaluated,
    });
  }

  const stageTotal = STAGE_NAMES.reduce((sum, name) => sum + stageEvaluatedCount(diagnostics, name), 0);
  const candidatesEvaluated = stageTotal || rows.length;
  const resultsRetained = Array.isArray(selection?.confirmedResults)
    ? selection.confirmedResults.length
    : rows.length;

  const outcome = terminalOutcome
    || (failureReason
      ? OPTIMISER_TERMINAL_OUTCOME.FAILED
      : (best && candidatesEvaluated > 0
        ? OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT
        : OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE));

  const rejectionReasons = [];
  if (failureReason) rejectionReasons.push(failureReason);
  if (outcome === OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT) rejectionReasons.push(OPTIMISER_NO_WINNER_REASON);

  const bestAttempted = best
    ? {
      candidateId: best.candidateId,
      candidateKind: best.candidateKind,
      p20VariationDb: best.p20VariationDb,
      p20Level: best.p20Level,
      p19VariationDb: best.p19VariationDb,
      p20DeltaDb: currentP20 != null ? Math.round((best.p20VariationDb - currentP20) * 100) / 100 : null,
      improvedOverCurrent: currentP20 != null ? best.p20VariationDb < currentP20 : null,
      // A candidate that produced no confirmed winner was never accepted.
      validationPassed: false,
      acceptedForApply: false,
    }
    : null;

  return {
    recordKind: OPTIMISER_RECORD_KIND.RUN_EVIDENCE,
    planVersion: OPTIMISER_PLAN_VERSION,
    savedAt: new Date().toISOString(),
    // --- source identity ---
    projectId: identity.projectId || null,
    versionId: identity.versionId || null,
    baseDesignFingerprint: identity.baseDesignFingerprint || null,
    designFingerprint: identity.designFingerprint || null,
    resultFingerprint: identity.resultFingerprint || null,
    cacheKey: identity.cacheKey || identity.designFingerprint || null,
    engineVersion: identity.engineVersion || null,
    // --- terminal outcome ---
    terminalOutcome: outcome,
    run: {
      completedAt: new Date().toISOString(),
      outcome,
      canonicalJobsRun: num(diagnostics?.canonicalJobsRun ?? diagnostics?.runtimeMetrics?.canonicalJobsRun),
      candidatesEvaluated,
      resultsRetained,
      leversTested,
      current: {
        p20VariationDb: currentP20,
        p20Level: currentSummary?.p20Level ?? null,
        worstSeatId: currentSummary?.worstSeatId ?? null,
        worstFrequencyHz: currentSummary?.worstFrequencyHz ?? null,
      },
      bestAttempted,
      winnerCandidateId,
      actionablePlanProduced: false,
      rejectionReasons,
      designUnchanged: currentDesignUnchanged === true,
    },
    // No levers: a rejected candidate is never presented as an available change.
    levers: {},
    individualEffectsEvaluated: false,
    leverDecisions: {},
    applied: {},
    notes: Array.isArray(notes) ? notes : [],
  };
}