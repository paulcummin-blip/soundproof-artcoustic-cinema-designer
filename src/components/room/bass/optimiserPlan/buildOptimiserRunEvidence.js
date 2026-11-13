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
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_LABEL,
  OPTIMISER_NO_WINNER_REASON,
  OPTIMISER_PLAN_VERSION,
  OPTIMISER_RECORD_KIND,
  OPTIMISER_TERMINAL_OUTCOME,
  OPTIMISER_WINNER_NON_PRACTICAL_REASON,
} from "./optimiserPlanConstants.js";
import { summariseResult } from "./optimiserPlanMetrics.js";
import {
  OPTIMISER_FAMILY_STATUS,
  OPTIMISER_RUN_FAMILY,
  buildFamilyLedger,
} from "./optimiserRunFamilies.js";
import { buildCalibrationEvidence } from "./optimiserCalibrationEvidence.js";
import { buildCoordinatedSummary } from "./coordinatedSummary.js";
import { buildSearchStatusEvidence } from "./searchStatusEvidence.js";

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

/**
 * The terminal failure, in the shape the record keeps it: what failed, its
 * category, the publication error verbatim and when it happened. A failure the
 * run did not record is null — never an empty object that reads as one.
 */
function normalisedFailure(failure) {
  if (!failure || typeof failure !== "object") return null;
  return {
    status: failure.status || "publication_failed",
    category: failure.category || null,
    message: failure.message || null,
    publicationError: failure.publicationError || null,
    attempts: Number.isFinite(Number(failure.attempts)) ? Number(failure.attempts) : null,
    at: failure.at || null,
    runId: failure.runId || null,
  };
}

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

/**
 * Build the compact run summary saved alongside an actionable plan.
 *
 * This uses only counters the completed optimiser already produced. It does not
 * score, select or alter a candidate. The full no-winner evidence record below
 * remains separate because its rejection wording is not truthful for a winner.
 */
export function buildActionableOptimiserRunSummary({
  selection = null,
  diagnostics = null,
  runIdentity = null,
} = {}) {
  // RUN IDENTITY BELONGS TO THE RUN, not to the winner. An actionable plan can
  // exist without a safe winner — a standalone placement lever that clears the
  // materiality gate is offered on its own. The run summary (and the run id it
  // carries) must be produced for every actionable plan, so the save
  // acknowledgement handshake (acknowledgeOptimiserPlanSave reads plan.run.runId)
  // fires and the completed run is never discarded as a 60s timeout. The winner
  // is nullable on the summary; the run is not.
  const rows = Array.isArray(selection.confirmedResults) ? selection.confirmedResults : [];
  const evaluated = resolveEvaluatedCount(diagnostics, rows);
  // A winning run states the same per-family evidence a terminal run does: what
  // each family was tested for and what happened. Without it the ledger below the
  // card would show an evaluated family as "Not evaluated".
  const currentSummary = summariseResult(selection?.currentResult || null);
  const families = buildFamilyLedger({
    selection,
    diagnostics,
    current: {
      p20VariationDb: num(diagnostics?.currentResult?.score?.p20VariationDb)
        ?? currentSummary?.p20VariationDb
        ?? null,
      p19VariationDb: num(diagnostics?.currentResult?.score?.p19VariationDb)
        ?? currentSummary?.p19VariationDb
        ?? null,
    },
  });
  const completedAt = new Date().toISOString();
  return {
    runId: runIdentity?.runId || null,
    startedAt: runIdentity?.startedAt || null,
    supersededRunId: runIdentity?.supersededRunId || null,
    evidenceContractVersion: OPTIMISER_PLAN_VERSION,
    terminal: true,
    completedAt,
    outcome: "actionable_plan_produced",
    families,
    canonicalJobsRun: num(selection.canonicalJobsRun
      ?? diagnostics?.canonicalJobsRun
      ?? diagnostics?.runtimeMetrics?.canonicalJobsRun),
    candidatesEvaluated: evaluated.count,
    candidatesEvaluatedBasis: evaluated.basis,
    resultsRetained: rows.length,
    winnerCandidateId: selection?.winner?.candidateId || null,
    actionablePlanProduced: true,
    rejectionReasons: [],
    // Running the plan evaluates evidence only. Applying a lever is a separate,
    // explicit designer action.
    designUnchanged: true,
    // Phase 9B coordinated physical search summary — always present so a
    // completed run states what happened to Phase 9B explicitly.
    coordinatedSummary: buildCoordinatedSummary(selection?.coordinatedDiagnostics),
    // The hierarchy gate decision and per-category search status, preserved
    // for every actionable plan so a reopened plan states the same gate
    // decision and the same search evidence instead of re-deriving either.
    hierarchyGateDiagnostics: selection?.hierarchyGateDiagnostics || null,
    searchStatus: buildSearchStatusEvidence({
      phaseDiagnostics: selection?.phaseDiagnostics || null,
      calibrationDiagnostics: selection?.calibrationDiagnostics || null,
      gainDiagnostics: selection?.gainDiagnostics || null,
      combinedDiagnostics: selection?.combinedDiagnostics || null,
      placementGate: selection?.hierarchyGateDiagnostics?.placementGate || false,
      seatingGate: selection?.hierarchyGateDiagnostics?.seatingGate || false,
      placementEvaluated: Boolean((selection?.confirmedResults || [])
        .some((r) => r?.isPositionCandidate && r?.candidateKind !== "current"
          && (r?.positionCoordinates || r?.coordinates))),
      placementSearchStatus: selection?.hierarchyGateDiagnostics?.placementSearchStatus || null,
      seatingDiagnostics: selection?.seatingDiagnostics || null,
    }),
  };
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
  // A terminal failure that is not a design statement: a run whose result could
  // not be PUBLISHED. Persisted with the run so the panel states the real cause
  // and offers the retry, rather than a run that never ends.
  failure = null,
  terminalOutcome = null,
  notes = [],
  baselineParity = null,
  // The run's own calibration decision: what ADI applied, or held and why.
  calibrationDecision = null,
  decisionApplied = false,
  // Identity minted at click time. It is persisted with every terminal record so
  // refresh/reopen can distinguish a fresh run's own technical failure from a
  // legacy saved artifact that genuinely needs a re-test.
  runIdentity = null,
} = {}) {
  // The baseline-parity record travels with the evidence: a run that stopped for
  // want of a matching published authority still saves WHY, so the block is
  // diagnosable and nothing can be applied from it.
  const parityRecord = baselineParity || identity?.baselineParity || null;
  if (!selection && !diagnostics && !parityRecord && !failureReason && !runIdentity) return null;

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
  // as a finished evaluation. Terminal candidate rejections (NON_ASSESSABLE:
  // P18 F3 at/above the room transition) are NOT run failures and must not
  // make the run incomplete or appear as raw missing-field errors.
  const rawEvaluationIssues = Array.isArray(selection?.evaluationIssues) ? selection.evaluationIssues : [];
  const evaluationIssues = rawEvaluationIssues.filter((issue) => {
    if (!issue) return false;
    if (issue.nonAssessable === true && issue.nonAssessableBaseline !== true) return false;
    if (typeof issue.error === "string" && issue.error.trim()) return true;
    if (Array.isArray(issue.issues) && issue.issues.some(Boolean)) return true;
    return false;
  });
  const evaluationIncomplete = selection?.evaluationIncomplete === true || evaluationIssues.length > 0;

  // NON_ASSESSABLE candidates (P18 F3 at/above the room transition → no valid
  // P19/P20 assessment band) are terminal candidate rejections retained as
  // DIAGNOSTIC EVIDENCE. They never made the run incomplete and never carry
  // fabricated P19/P20 — only the identity, P18, transition and reason that
  // explain the rejection. Engineering Mode may show these; normal dealer
  // workflow never sees raw validator errors for them.
  // Computed here (before the outcome) because a run whose ONLY candidates were
  // non-assessable still evaluated work: it is NO_USEFUL_IMPROVEMENT, not
  // EVALUATION_INCOMPLETE. Non-assessable candidates are excluded from
  // confirmedResults, so candidatesEvaluated alone would read 0 and mislabel
  // a complete run as incomplete.
  const nonAssessableCandidates = (Array.isArray(selection?.nonAssessableCandidates)
    ? selection.nonAssessableCandidates
    : []).map((entry) => ({
      candidateId: entry?.candidateId ?? null,
      candidateKind: entry?.candidateKind ?? null,
      stage: entry?.stage ?? null,
      status: "non-assessable",
      reason: entry?.reason ?? null,
      achievedP18Hz: num(entry?.achievedP18Hz),
      transitionHz: num(entry?.transitionHz),
      // P14 operating-point rejection evidence (null for a band rejection):
      // the requested + achieved P14 dB and the explicit reason. Engineering
      // Mode states these; P18/P19/P20 are never fabricated for this rejection.
      p14AchievedDb: num(entry?.p14AchievedDb),
      p14TargetDb: num(entry?.p14TargetDb),
      p14NotAchievedReason: entry?.p14NotAchievedReason ?? null,
    }));
  const nonAssessableCount = nonAssessableCandidates.length;

  // The FIRST genuine evaluation issue, with its stage/source, so a terminal
  // record can explain why an incomplete or failed run ended that way. A
  // completed acoustic search that found no worthwhile improvement has no
  // first issue and is never confused with a genuine technical failure.
  const firstEvaluationIssue = evaluationIssues.length > 0
    ? (() => {
      const issue = evaluationIssues[0];
      return {
        stage: issue?.stage || null,
        source: issue?.source || null,
        error: typeof issue?.error === "string" && issue.error ? issue.error : null,
        issues: Array.isArray(issue?.issues) ? issue.issues.filter(Boolean) : [],
      };
    })()
    : null;

  const outcome = terminalOutcome
    || (failureReason
      ? OPTIMISER_TERMINAL_OUTCOME.FAILED
      : ((baselineInvalid || evaluationIncomplete)
        ? OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE
        : ((candidatesEvaluated > 0 || nonAssessableCount > 0)
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
  // Only append the generic "no ranking winner" wording when the outcome is
  // genuinely NO_USEFUL_IMPROVEMENT (no winner at all) AND the reason does not
  // already describe a ranking winner that exists but is not practical. The
  // NON_ACTIONABLE_WINNER outcome is a distinct terminal state — a winner exists,
  // the improvement is real, the movement is not buildable — so the generic
  // "no candidate was confirmed" wording is never appended to it. The
  // NON_ACTIONABLE_ELECTRONIC outcome is likewise distinct: a confirmed
  // electronic improvement exists but crossover apply is not yet supported.
  if (outcome === OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT
    && !failureReason?.startsWith?.(OPTIMISER_WINNER_NON_PRACTICAL_REASON)) {
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

  // The calibration levers' own evidence for a run that produced no actionable
  // plan: a run that states a calibration lever found nothing must keep the
  // counts and the best candidate that prove it.
  const calibrationEvidence = buildCalibrationEvidence({
    selection,
    baseline: selection?.currentResult || null,
    calibrationDecision,
    decisionApplied,
  });

  // The combined electronic winner's evidence, retained for diagnostics when
  // the run's only result is a non-actionable combined crossover + tuning
  // improvement. The plan builder constructs a COMBINED_ELECTRONIC lever from
  // the winner; the terminal evidence preserves a compact version here so a
  // reopened run states the exact evaluated configuration without fabricating
  // a plan. Null when the winner is not a combined electronic candidate.
  const combinedElectronicResult = (selection?.winner?.combinedFrom?.crossover === true)
    ? {
      candidateId: selection.winner.candidateId || null,
      candidateOrigin: selection.winner.candidateOrigin || null,
      effect: null,
      crossover: selection.winner.crossover || null,
      identityProof: selection.winner.identityProof || null,
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
    engineRevision: identity.engineRevision || null,
    // --- terminal outcome ---
    terminalOutcome: outcome,
    // --- terminal failure, when the run ended in one ---
    failure: normalisedFailure(failure),
    baselineParity: parityRecord,
    run: {
      runId: runIdentity?.runId || null,
      startedAt: runIdentity?.startedAt || null,
      supersededRunId: runIdentity?.supersededRunId || null,
      evidenceContractVersion: OPTIMISER_PLAN_VERSION,
      terminal: true,
      completedAt: savedAt,
      outcome,
      failure: normalisedFailure(failure),
      canonicalJobsRun: num(selection?.canonicalJobsRun
        ?? diagnostics?.canonicalJobsRun
        ?? diagnostics?.runtimeMetrics?.canonicalJobsRun),
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
      // Terminal non-assessable candidate rejections — diagnostic evidence only,
      // available to Engineering Mode via the run evidence block. Never P19/P20,
      // never a run failure.
      nonAssessableCandidates,
      designUnchanged: currentDesignUnchanged === true,
    },
    // Terminal non-assessable candidate rejections, kept as diagnostic evidence.
    // Never read as engineering values, never P19/P20, never a run failure.
    nonAssessableCandidates,
    // No levers: a rejected candidate is never presented as an available change.
    levers: {},
    // The combined electronic winner's compact evidence, retained for
    // diagnostics when the run's only result is a non-actionable crossover +
    // tuning improvement. Null when the winner is not combined electronic.
    combinedElectronicResult,
    // What the calibration searches themselves produced, so "no useful
    // calibration improvement" is a statement the saved record can prove.
    calibrationEvidence,
    calibrationDecision: calibrationDecision || null,
    decisionApplied: decisionApplied === true,
    individualEffectsEvaluated: false,
    leverDecisions: {},
    applied: {},
    notes: Array.isArray(notes) ? notes : [],
    // The run's compact cross-quantity audit trail, retained with the terminal
    // evidence so a completed run that produced no actionable plan can still be
    // diagnosed from saved evidence. Identity + outcome labels only — no
    // response arrays, curves or tuning payloads.
    crossQuantityAudit: selection?.crossQuantityAudit || null,
    // Phase 9B coordinated physical search summary — always present so a
    // completed run states what happened to Phase 9B explicitly, whether it
    // produced an actionable plan or not.
    coordinatedSummary: buildCoordinatedSummary(selection?.coordinatedDiagnostics),
    // The hierarchy gate decision this run reached: electronics completion,
    // the confirmed electronic levels (P19 RSP, P20 Primary, P20 Secondary),
    // the electronic candidate the gate assessed (or an explicit Current
    // fallback), the placement gate and its terminal search status, and the
    // seating gate. Preserved for every terminal outcome so the record can
    // explain why its gates opened or closed.
    hierarchyGateDiagnostics: selection?.hierarchyGateDiagnostics || null,
    // Per-category search status (Phase/Delay/Gain/Crossover/Placement/Seating)
    // built from the run's own diagnostics. A green "tested" dot appears ONLY
    // for a genuinely completed evaluation — never merely because a gate
    // opened, candidates were generated or a stage was entered.
    searchStatus: buildSearchStatusEvidence({
      phaseDiagnostics: selection?.phaseDiagnostics || null,
      calibrationDiagnostics: selection?.calibrationDiagnostics || null,
      gainDiagnostics: selection?.gainDiagnostics || null,
      combinedDiagnostics: selection?.combinedDiagnostics || null,
      placementGate: selection?.hierarchyGateDiagnostics?.placementGate || false,
      seatingGate: selection?.hierarchyGateDiagnostics?.seatingGate || false,
      placementEvaluated: Boolean((selection?.confirmedResults || [])
        .some((r) => r?.isPositionCandidate && r?.candidateKind !== "current"
          && (r?.positionCoordinates || r?.coordinates))),
      placementSearchStatus: selection?.hierarchyGateDiagnostics?.placementSearchStatus || null,
      seatingDiagnostics: selection?.seatingDiagnostics || null,
    }),
    // The first genuine evaluation issue, with its stage/source. Null for a
    // run that completed its acoustic search and found nothing worth applying
    // — that is NO_USEFUL_IMPROVEMENT, never a technical failure.
    firstEvaluationIssue,
  };
}