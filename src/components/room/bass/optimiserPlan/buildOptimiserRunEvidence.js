// buildOptimiserRunEvidence.js
// ---------------------------------------------------------------------------
// The persisted TERMINAL RUN EVIDENCE record for an optimiser run that
// completed WITHOUT producing an actionable plan (no confirmed winner, or a
// technical failure).
//
// The plan builder returns null in that case and everything the run evaluated
// used to be discarded. This record keeps it: how many candidates were
// confirmed, which families were tested, the best attempt per family and the
// current result they are compared with, why no candidate was accepted, and the
// fact that the current design was not changed.
//
// HONEST COUNTS: the optimiser's stage funnel counters describe successive
// stages of the SAME search, so they overlap and are never added together. The
// headline count is the number of candidates that reached full canonical
// confirmation; the per-stage counters are reported separately as stage
// operations.
//
// It reads only values the run already produced (the optimiser selection and
// the diagnostics report the engine already builds). It invents no lever value,
// estimates no metric, recalculates nothing and never scores a candidate. It
// changes no bass maths and no optimiser behaviour.
// ---------------------------------------------------------------------------

import {
  OPTIMISER_LEVER_LABEL,
  OPTIMISER_NO_WINNER_REASON,
  OPTIMISER_PLAN_VERSION,
  OPTIMISER_RECORD_KIND,
  OPTIMISER_TERMINAL_OUTCOME,
} from "./optimiserPlanConstants.js";
import { summariseResult } from "./optimiserPlanMetrics.js";
import {
  OPTIMISER_FAMILY_STATUS,
  OPTIMISER_RUN_FAMILY,
  buildFamilyLedger,
} from "./optimiserRunFamilies.js";

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** The diagnostics stage that evidences each lever family. */
const STAGE_FOR_FAMILY = Object.freeze({
  [OPTIMISER_RUN_FAMILY.PLACEMENT]: "Placement",
  [OPTIMISER_RUN_FAMILY.DELAY]: "Delay",
  [OPTIMISER_RUN_FAMILY.GAIN]: "Gain",
});

const STAGE_NAMES = ["Placement", "Polarity", "Delay", "Gain", "Phase", "Final EQ"];

/** Stated with every stage-operations list so the counters are never read as a total. */
export const STAGE_OPERATIONS_NOTE =
  "Stage counters describe successive stages of the same search and overlap — they are never added together.";

function stageByName(diagnostics, stageName) {
  const stages = Array.isArray(diagnostics?.stages) ? diagnostics.stages : [];
  return stages.find((stage) => String(stage?.name || "").toLowerCase() === stageName.toLowerCase()) || null;
}

/**
 * The numeric counters each stage recorded, reported as operations. Within a
 * stage the counters also overlap (generated → screened → promoted → confirmed),
 * so they are listed as recorded and never summed.
 */
function buildStageOperations(diagnostics) {
  const operations = [];
  for (const stageName of STAGE_NAMES) {
    const stage = stageByName(diagnostics, stageName);
    const counts = stage?.candidatesEvaluated || {};
    const counters = Object.entries(counts)
      .filter(([, value]) => num(value) != null)
      .map(([key, value]) => ({ key, value: num(value) }));
    if (counters.length === 0) continue;
    operations.push({ stage: stageName, counters });
  }
  return operations;
}

/**
 * The honest headline count of candidates the run fully confirmed, and how it
 * was obtained. Never the sum of overlapping stage counters.
 */
function resolveEvaluatedCount(diagnostics, rows) {
  const confirmed = rows.length;
  if (confirmed > 0) {
    return { count: confirmed, basis: "confirmed-records" };
  }
  const stageMax = STAGE_NAMES.reduce((max, name) => {
    const value = num(stageByName(diagnostics, name)?.candidatesEvaluated?.confirmed);
    return value != null && value > max ? value : max;
  }, 0);
  if (stageMax > 0) return { count: stageMax, basis: "stage-confirmed-max" };
  return { count: 0, basis: null };
}

function candidateRows(diagnostics) {
  return Array.isArray(diagnostics?.topCandidatesForWinningStage)
    ? diagnostics.topCandidatesForWinningStage
    : [];
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
  currentDesignUnchanged = true,
  failureReason = null,
  terminalOutcome = null,
  notes = [],
} = {}) {
  if (!selection && !diagnostics) return null;

  const savedAt = new Date().toISOString();
  const currentSummary = summariseResult(selection?.currentResult || null);
  // The canonical current P20: the authority headline when published, otherwise
  // the worst measured seat. A value the run did not publish stays null — it is
  // never presented as 0.00 dB.
  const currentP20 = num(diagnostics?.currentResult?.score?.p20VariationDb)
    ?? currentSummary?.p20VariationDb
    ?? null;
  const currentP19 = num(diagnostics?.currentResult?.score?.p19VariationDb)
    ?? currentSummary?.p19VariationDb
    ?? null;

  const rows = Array.isArray(selection?.confirmedResults) ? selection.confirmedResults : [];
  const best = selectBestAttempted(candidateRows(diagnostics));
  const winnerCandidateId = selection?.winner?.candidateId || null;

  // ── The per-family ledger: what was tested, the best attempt, and why not ──
  const families = buildFamilyLedger({
    selection,
    diagnostics,
    current: { p20VariationDb: currentP20, p19VariationDb: currentP19 },
  });

  const leverFamilyKeys = Object.keys(STAGE_FOR_FAMILY);
  const leversTested = families
    .filter((entry) => leverFamilyKeys.includes(entry.family))
    .filter((entry) => entry.status === OPTIMISER_FAMILY_STATUS.REJECTED
      || entry.status === OPTIMISER_FAMILY_STATUS.EVALUATED
      || entry.status === OPTIMISER_FAMILY_STATUS.FAILED)
    .map((entry) => ({
      lever: entry.family,
      label: OPTIMISER_LEVER_LABEL[entry.family] || entry.label,
      candidatesEvaluated: entry.candidatesEvaluated,
      status: entry.status,
    }));

  const evaluated = resolveEvaluatedCount(diagnostics, rows);
  const candidatesEvaluated = evaluated.count;
  const resultsRetained = rows.length;

  const baselineValidation = selection?.baselineValidation || null;
  const baselineInvalid = baselineValidation?.valid === false
    || selection?.validationFailed === true;

  // A run that failed to complete every search it started is INCOMPLETE even
  // when some candidates were confirmed — a confirmed candidate is not the same
  // as a finished evaluation.
  const evaluationIssues = Array.isArray(selection?.evaluationIssues) ? selection.evaluationIssues : [];
  const evaluationIncomplete = selection?.evaluationIncomplete === true || evaluationIssues.length > 0;

  const outcome = terminalOutcome
    || (failureReason
      ? OPTIMISER_TERMINAL_OUTCOME.FAILED
      : ((baselineInvalid || evaluationIncomplete)
        ? OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE
        : (candidatesEvaluated > 0
          ? OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT
          : OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE)));

  const rejectionReasons = [];
  if (failureReason) rejectionReasons.push(failureReason);
  if (baselineInvalid) {
    rejectionReasons.push(baselineValidation?.message
      || "The current design could not be validated, so nothing could be compared against it.");
  } else if (outcome === OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE) {
    for (const issue of evaluationIssues.slice(0, 3)) {
      const stage = issue?.stage ? `${issue.stage}: ` : "";
      const detail = typeof issue?.error === "string" && issue.error
        ? issue.error
        : (Array.isArray(issue?.issues) ? issue.issues.filter(Boolean).join(" · ") : null);
      rejectionReasons.push(`${stage}${detail || "the evaluation did not complete."}`);
    }
    if (rejectionReasons.length === 0) {
      rejectionReasons.push("No candidate was confirmed in this run.");
    }
  }
  if (outcome === OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT) {
    rejectionReasons.push(OPTIMISER_NO_WINNER_REASON);
  }

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
    savedAt,
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
      completedAt: savedAt,
      outcome,
      canonicalJobsRun: num(diagnostics?.canonicalJobsRun ?? diagnostics?.runtimeMetrics?.canonicalJobsRun),
      candidatesEvaluated,
      candidatesEvaluatedBasis: evaluated.basis,
      resultsRetained,
      // Per-stage counters, reported as operations. Never summed into a total.
      stageOperations: buildStageOperations(diagnostics),
      stageOperationsNote: STAGE_OPERATIONS_NOTE,
      leversTested,
      families,
      baselineValidation,
      current: {
        p20VariationDb: currentP20,
        p20Source: "canonical",
        p20Level: currentSummary?.p20Level ?? null,
        p19VariationDb: currentP19,
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