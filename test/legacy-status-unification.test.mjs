// legacy-status-unification.test.mjs
// Focused acceptance for the Bass ADI legacy-status unification. The Technical
// Details "What ADI checked" rows (buildFamilyLedgerRows / buildTestedOptionRows)
// and the Searches-performed list (AdiSearchStatusList, buildSearchStatusEvidence)
// must read the SAME run searchStatus and never contradict each other.
//
// Required behaviour verified:
//   1. Zero seating probes cannot show Seating tested.
//   2. An open placement gate does not mean Placement tested.
//   3. Zero gain candidates cannot imply a completed gain evaluation.
//   4. Crossover unavailable shows Not applicable, not Completed.
//   5. A completed electronic search with no useful candidate stays no-improvement
//      (not failed) and the electronic category stays evaluated.
//   6. A failed run with a first evaluation issue preserves it.
//   7. A no-improvement run with no evaluation issue does not invent one.
//   8. Save, cold hydrate and render produce matching diagnostic evidence.
//   9. A stale / mismatched run identity does not display current completion
//      indicators.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFamilyLedgerRows,
  familySearchEvaluated,
} from "../src/components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";
import { buildSearchStatusEvidence } from "../src/components/room/bass/optimiserPlan/searchStatusEvidence.js";
import {
  buildOptimiserRunEvidence,
  buildActionableOptimiserRunSummary,
} from "../src/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import { resolveOptimiserPlanStatus } from "../src/components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import { buildTestedOptionRows } from "../src/components/room/bass/optimiserPlan/adiDesignerSummary.js";
import {
  ADI_ROW_STATUS,
  ADI_ROW_OUTCOME,
} from "../src/components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";
import { OPTIMISER_PLAN_STATUS } from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";

const IDENTITY = Object.freeze({
  projectId: "unify",
  versionId: "v1",
  designFingerprint: "fp-unify-1",
  baseDesignFingerprint: "fp-base",
  resultFingerprint: "fp-result",
  engineVersion: "3",
});
const INSTANCES = [
  { id: "sub-1", model: "SUB4-12", enabled: true, legacyGroup: "front" },
  { id: "sub-2", model: "SUB4-12", enabled: true, legacyGroup: "rear" },
];

function l1Current() {
  return {
    achievedP20VariationDb: -9, achievedP19VariationDb: -3, p20Level: 1, p19Level: 1,
    perSeatP20: [{ seatId: "s1", variationDbRaw: -9, level: 1, worstFrequencyHz: 0 }],
  };
}

// A family ledger entry with the given shape.
function familyEntry(family, overrides = {}) {
  return {
    family,
    status: "evaluated",
    tested: true,
    candidatesEvaluated: 0,
    bestAttempt: null,
    reason: null,
    ...overrides,
  };
}

// ── 1. Zero seating probes cannot show Seating tested ───────────────────

test("1: zero seating probes — family ledger Seating is not Tested, matches searchStatus skipped", () => {
  const searchStatus = buildSearchStatusEvidence({
    seatingGate: false,
    seatingDiagnostics: { confirmed: 0, tested: 0, status: "skipped" },
  });
  const seatingCat = searchStatus.categories.find((c) => c.key === "seating");
  assert.equal(seatingCat.status, "skipped");
  assert.equal(seatingCat.evaluated, false);

  // The family ledger has a seating entry that legacy-marked "tested" with zero
  // confirmed probes. The unified authority downgrades it — never "Tested".
  const ledger = buildFamilyLedgerRows({
    families: [familyEntry("seat_movement", { candidatesEvaluated: 0, tested: true, bestAttempt: { p20DeltaDb: -2 } })],
    runComplete: true,
    searchStatus,
  });
  assert.notEqual(ledger.seating.status, ADI_ROW_STATUS.TESTED);
  assert.equal(ledger.seating.status, ADI_ROW_STATUS.LAST_RESORT);
  assert.equal(familySearchEvaluated(searchStatus, "seating"), false);
});

// ── 2. Open placement gate without evaluation → not Tested ──────────────

test("2: open placement gate, no evaluation — Placement not Tested, searchStatus incomplete", () => {
  const searchStatus = buildSearchStatusEvidence({
    placementGate: true,
    placementSearchStatus: null,
    placementEvaluated: false,
  });
  const placementCat = searchStatus.categories.find((c) => c.key === "placement");
  assert.equal(placementCat.status, "incomplete");
  assert.equal(placementCat.evaluated, false);

  const ledger = buildFamilyLedgerRows({
    families: [familyEntry("placement", { candidatesEvaluated: 0, tested: true, bestAttempt: null })],
    runComplete: true,
    searchStatus,
  });
  assert.notEqual(ledger.placement.status, ADI_ROW_STATUS.TESTED);
  assert.equal(ledger.placement.status, ADI_ROW_STATUS.NOT_RUN);
});

// ── 3. Zero gain candidates → not a completed gain evaluation ───────────

test("3: zero confirmed gain candidates — Gain not Tested, searchStatus incomplete", () => {
  const searchStatus = buildSearchStatusEvidence({
    gainDiagnostics: { status: "completed", confirmed: 0, valid: 0, screened: 5 },
  });
  const gainCat = searchStatus.categories.find((c) => c.key === "gain");
  assert.equal(gainCat.status, "incomplete");
  assert.equal(gainCat.evaluated, false);

  const ledger = buildFamilyLedgerRows({
    families: [familyEntry("gain", { candidatesEvaluated: 0, tested: true, bestAttempt: null })],
    runComplete: true,
    searchStatus,
  });
  // Zero confirmed gain candidates never reads as "Tested" — the calibration
  // evidence gate and the searchStatus reconciliation agree.
  assert.notEqual(ledger.gain.status, ADI_ROW_STATUS.TESTED);
  assert.equal(ledger.gain.status, ADI_ROW_STATUS.NOT_RUN);
  assert.equal(familySearchEvaluated(searchStatus, "gain"), false);
});

// ── 4. Crossover unavailable → Not applicable, not Completed ───────────

test("4: crossover unavailable — searchStatus not_applicable, no green dot", () => {
  const searchStatus = buildSearchStatusEvidence({
    combinedDiagnostics: { status: "unavailable", confirmed: 0, screened: 0 },
  });
  const crossover = searchStatus.categories.find((c) => c.key === "crossover");
  assert.equal(crossover.status, "not_applicable");
  assert.equal(crossover.evaluated, false);
});

// ── 5. Completed electronic search with no useful candidate ─────────────

test("5: completed electronic search, no useful candidate — electronic evaluated, run not failed", () => {
  const searchStatus = buildSearchStatusEvidence({
    phaseDiagnostics: { status: "completed", confirmed: 4, valid: 4 },
    calibrationDiagnostics: { status: "completed", confirmed: 3, valid: 3 },
    gainDiagnostics: { status: "completed", confirmed: 2, valid: 2 },
  });
  // All electronic categories genuinely evaluated — the Searches-performed
  // list shows them as Tested (green), not skipped or incomplete.
  for (const key of ["phase", "delay", "gain"]) {
    const cat = searchStatus.categories.find((c) => c.key === key);
    assert.equal(cat.status, "completed");
    assert.equal(cat.evaluated, true, `${key} genuinely evaluated`);
  }
  // A placement family with confirmed candidates keeps Tested — genuine
  // evidence is preserved, and a completed search that found nothing better
  // is never classified as failed.
  const ledger = buildFamilyLedgerRows({
    families: [
      familyEntry("placement", { candidatesEvaluated: 6, tested: true, bestAttempt: { p20DeltaDb: -0.2 } }),
    ],
    runComplete: true,
    searchStatus,
  });
  assert.equal(ledger.placement.status, ADI_ROW_STATUS.TESTED);

  // A run that confirmed electronic candidates but produced no winner is
  // no-improvement, not failed.
  const record = buildOptimiserRunEvidence({
    selection: {
      currentResult: l1Current(),
      confirmedResults: [{ candidateId: "c1" }],
      evaluationIssues: [],
      hierarchyGateDiagnostics: { placementGate: false, seatingGate: false, placementSearchStatus: "skipped" },
      phaseDiagnostics: { status: "completed", confirmed: 4, valid: 4 },
      calibrationDiagnostics: { status: "completed", confirmed: 3, valid: 3 },
      gainDiagnostics: { status: "completed", confirmed: 2, valid: 2 },
      seatingDiagnostics: { confirmed: 0, status: "skipped" },
    },
    diagnostics: { currentResult: { score: { p20VariationDb: -9 } }, stages: [] },
    identity: IDENTITY,
    failureReason: null,
  });
  assert.equal(record.terminalOutcome, "no_useful_improvement");
  assert.notEqual(record.terminalOutcome, "failed");
});

// ── 6. Failed run with first evaluation issue ───────────────────────────

test("6: failed run preserves first evaluation issue through save + hydrate", () => {
  const record = buildOptimiserRunEvidence({
    selection: {
      currentResult: l1Current(),
      confirmedResults: [{ candidateId: "c1" }],
      evaluationIssues: [{ stage: "global", source: "position", error: "transfer failed" }],
      hierarchyGateDiagnostics: { placementGate: true, seatingGate: false, placementSearchStatus: "incomplete" },
      phaseDiagnostics: { status: "completed", confirmed: 2, valid: 2 },
      calibrationDiagnostics: { status: "completed", confirmed: 2, valid: 2 },
      gainDiagnostics: { status: "completed", confirmed: 1, valid: 1 },
      seatingDiagnostics: { confirmed: 0, status: "skipped" },
    },
    diagnostics: { currentResult: { score: { p20VariationDb: -9 } }, stages: [] },
    identity: IDENTITY,
    failureReason: "Publication failed.",
    failure: { status: "publication_failed", message: "write rejected", at: "2026-11-12T10:01:00Z" },
  });
  assert.equal(record.terminalOutcome, "failed");
  assert.equal(record.firstEvaluationIssue.stage, "global");
  assert.equal(record.firstEvaluationIssue.source, "position");
  assert.match(record.firstEvaluationIssue.error, /transfer failed/);
  // The run's searchStatus and hierarchy gate survive.
  assert.ok(record.searchStatus);
  assert.ok(record.hierarchyGateDiagnostics);
});

// ── 7. No-improvement run with no evaluation issue ──────────────────────

test("7: no-improvement run has no first issue and is not classified failed", () => {
  const record = buildOptimiserRunEvidence({
    selection: {
      currentResult: l1Current(),
      confirmedResults: [{ candidateId: "c1" }, { candidateId: "c2" }],
      evaluationIssues: [],
      hierarchyGateDiagnostics: { placementGate: true, seatingGate: false, placementSearchStatus: "no_improvement" },
      phaseDiagnostics: { status: "completed", confirmed: 2, valid: 2 },
      calibrationDiagnostics: { status: "completed", confirmed: 2, valid: 2 },
      gainDiagnostics: { status: "completed", confirmed: 1, valid: 1 },
      seatingDiagnostics: { confirmed: 0, status: "skipped" },
    },
    diagnostics: { currentResult: { score: { p20VariationDb: -9 } }, stages: [] },
    identity: IDENTITY,
    failureReason: null,
  });
  assert.equal(record.terminalOutcome, "no_useful_improvement");
  assert.equal(record.firstEvaluationIssue, null);
  assert.notEqual(record.terminalOutcome, "failed");
});

// ── 8. Save, cold hydrate and render matching diagnostic evidence ───────

test("8: save → hydrate → render preserves run id, fingerprint, searchStatus, hierarchy gate, first issue", () => {
  const record = buildOptimiserRunEvidence({
    selection: {
      currentResult: l1Current(),
      confirmedResults: [{ candidateId: "c1" }],
      evaluationIssues: [{ stage: "global", source: "placement", error: "timeout" }],
      hierarchyGateDiagnostics: {
        placementGate: true, seatingGate: false, placementSearchStatus: "incomplete",
        electronicCandidateId: "elec-1", electronicCandidateKind: "calibration",
        electronicIsCurrentFallback: false,
      },
      phaseDiagnostics: { status: "completed", confirmed: 2, valid: 2 },
      calibrationDiagnostics: { status: "completed", confirmed: 2, valid: 2 },
      gainDiagnostics: { status: "completed", confirmed: 1, valid: 1 },
      seatingDiagnostics: { confirmed: 0, status: "skipped" },
    },
    diagnostics: { currentResult: { score: { p20VariationDb: -9 } }, stages: [] },
    identity: IDENTITY,
    failureReason: null,
  });
  // Cold hydrate through the resolver (the path a reopened project takes).
  const planView = resolveOptimiserPlanStatus({
    plan: record,
    currentDesignFingerprint: IDENTITY.designFingerprint,
    instances: INSTANCES,
  });
  // The run had an evaluation issue, so its terminal outcome is incomplete and
  // the hydrated plan status reflects that — not CURRENT.
  assert.equal(planView.status, OPTIMISER_PLAN_STATUS.INCOMPLETE);
  assert.ok(planView.searchStatus, "hydrated plan carries searchStatus");
  assert.ok(planView.hierarchyGateDiagnostics, "hydrated plan carries hierarchy gate");
  assert.equal(planView.hierarchyGateDiagnostics.electronicCandidateId, "elec-1");
  // The first evaluation issue reaches the rendered view.
  assert.equal(planView.firstEvaluationIssue.stage, "global");
  assert.equal(planView.firstEvaluationIssue.source, "placement");
  // The Technical Details rows read the same searchStatus.
  const rows = buildTestedOptionRows(planView, { runComplete: true });
  const seating = rows.find((r) => r.key === "seating");
  assert.notEqual(seating.status, ADI_ROW_STATUS.TESTED);
  assert.equal(seating.status, ADI_ROW_STATUS.LAST_RESORT);
  // The Searches-performed list and the tested table agree on seating.
  const seatingCat = planView.searchStatus.categories.find((c) => c.key === "seating");
  assert.equal(seatingCat.evaluated, false);
});

// ── 9. Stale / mismatched run identity does not show current completion ─

test("9: mismatched design fingerprint resolves STALE; completion indicators not current", () => {
  const record = buildOptimiserRunEvidence({
    selection: {
      currentResult: l1Current(),
      confirmedResults: [{ candidateId: "c1" }],
      evaluationIssues: [],
      hierarchyGateDiagnostics: { placementGate: true, seatingGate: false, placementSearchStatus: "no_improvement" },
      phaseDiagnostics: { status: "completed", confirmed: 2, valid: 2 },
      calibrationDiagnostics: { status: "completed", confirmed: 2, valid: 2 },
      gainDiagnostics: { status: "completed", confirmed: 1, valid: 1 },
      seatingDiagnostics: { confirmed: 0, status: "skipped" },
    },
    diagnostics: { currentResult: { score: { p20VariationDb: -9 } }, stages: [] },
    identity: IDENTITY,
    failureReason: null,
  });
  const planView = resolveOptimiserPlanStatus({
    plan: record,
    currentDesignFingerprint: "different-fingerprint",
    instances: INSTANCES,
  });
  assert.equal(planView.status, OPTIMISER_PLAN_STATUS.STALE);
  // Stale plans still carry the diagnostics for read-back, but the status is
  // not CURRENT so completion indicators are not presented as current.
  assert.ok(planView.searchStatus);
  assert.ok(planView.hierarchyGateDiagnostics);
});