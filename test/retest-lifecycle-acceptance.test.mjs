// retest-lifecycle-acceptance.test.mjs
// ---------------------------------------------------------------------------
// Focused acceptance tests for the Bass ADI Re-test lifecycle and terminal
// evidence corrections. Pure-function tests only — React-component behaviour
// (handleStart preflight, latestRunFailed badge) is browser-verified.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveOptimisationPlanRunBlock } from '@/components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js';
import { buildOptimiserRunEvidence } from '@/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js';
import { resolveOptimiserPlanStatus } from '@/components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js';
import { resolvePlanActionability, buildOptimiserResultForSave } from '@/components/room/bass/optimiserPlan/optimiserPlanSave.js';
import { planIsSupersededByRun, resolvePresentationPlan } from '@/components/room/bass/optimiserPlan/optimiserRunAuthority.js';
import {
  resolveOptimiserPresentationState,
  OPTIMISER_PRESENTATION_STATE,
} from '@/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js';
import { serializeOptimiserPlan, hydrateOptimiserPlan } from '@/components/room/bass/optimiserPlan/optimiserPlanPersistence.js';
import { buildSearchStatusEvidence } from '@/components/room/bass/optimiserPlan/searchStatusEvidence.js';
import { buildTestedOptionRows } from '@/components/room/bass/optimiserPlan/adiDesignerSummary.js';
import {
  ADI_ROW_STATUS,
  buildFamilyLedgerRows,
} from '@/components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js';
import { adiTestedSummaryLines } from '@/components/room/bass/optimiserPlan/AdiEngineerDetailsPanel.jsx';
import { OPTIMISER_TERMINAL_OUTCOME, OPTIMISER_PLAN_STATUS } from '@/components/room/bass/optimiserPlan/optimiserPlanConstants.js';

const IDENTITY = {
  projectId: 'p1',
  versionId: 'v1',
  designFingerprint: 'fp-current',
  resultFingerprint: 'fp-current',
  cacheKey: 'fp-current',
};

// ── 1. Readiness rejection before run ID creation ──────────────────────────
test('1: readiness rejection before run ID — resolveOptimisationPlanRunBlock names the block', () => {
  const block = resolveOptimisationPlanRunBlock({
    hasActiveSubModel: false,
    hasCanonicalInstances: false,
  });
  assert.equal(block?.code, 'missing_required_data');
  assert.ok(block?.message);
});

// ── 2. Preflight wait returns false after run ID creation ───────────────────
// Code test: a cancelled preflight produces an EVALUATION_INCOMPLETE receipt
// (not FAILED), so the started run is traceable as cancelled, not an acoustic
// failure. Browser-verify: handleStart saves this receipt before returning.
test('2: cancelled preflight produces an incomplete (not failed) terminal receipt', () => {
  const evidence = buildOptimiserRunEvidence({
    identity: IDENTITY,
    failureReason: 'Optimisation cancelled by the user before completion.',
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
    runIdentity: { runId: 'run-cancel-1', startedAt: '2026-11-12T10:00:00Z' },
  });
  assert.equal(evidence.terminalOutcome, 'evaluation_incomplete');
  assert.equal(evidence.run.outcome, 'evaluation_incomplete');
  assert.equal(evidence.run.runId, 'run-cancel-1');
  assert.equal(evidence.failure, null);
  assert.ok(evidence.run.rejectionReasons.some((r) => r.includes('cancelled')));
});

// ── 3. Explicit cancellation ────────────────────────────────────────────────
test('3: explicit cancellation — outcome is incomplete, not failed', () => {
  const evidence = buildOptimiserRunEvidence({
    identity: IDENTITY,
    failureReason: 'Optimisation cancelled by the user before completion.',
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
    runIdentity: { runId: 'run-cancel-2', startedAt: '2026-11-12T10:01:00Z' },
  });
  assert.notEqual(evidence.terminalOutcome, 'failed');
  assert.equal(evidence.terminalOutcome, 'evaluation_incomplete');
});

// ── 4. Design becomes stale during/after a run ─────────────────────────────
test('4: design fingerprint mismatch resolves STALE', () => {
  const plan = {
    planVersion: 3,
    designFingerprint: 'fp-old',
    terminalOutcome: 'no_useful_improvement',
    run: { runId: 'run-old', outcome: 'no_useful_improvement', terminal: true },
  };
  const view = resolveOptimiserPlanStatus({ plan, currentDesignFingerprint: 'fp-new' });
  assert.equal(view.status, OPTIMISER_PLAN_STATUS.STALE);
  assert.equal(view.run?.runId, 'run-old');
});

// ── 5. Genuine technical failure ───────────────────────────────────────────
test('5: genuine technical failure — outcome is FAILED with run ID', () => {
  const evidence = buildOptimiserRunEvidence({
    identity: IDENTITY,
    failureReason: 'Worker failed during canonical confirmation.',
    runIdentity: { runId: 'run-fail-1', startedAt: '2026-11-12T10:02:00Z' },
  });
  assert.equal(evidence.terminalOutcome, 'failed');
  assert.equal(evidence.run.outcome, 'failed');
  assert.equal(evidence.run.runId, 'run-fail-1');
  assert.ok(evidence.run.rejectionReasons.length > 0);
});

// ── 6. Completed optimisation with no useful improvement ─────────────────────
test('6: completed run, no winner — NO_USEFUL_IMPROVEMENT, not failed', () => {
  const evidence = buildOptimiserRunEvidence({
    identity: IDENTITY,
    selection: {
      confirmedResults: [{ candidateId: 'c1', candidateKind: 'calibration', score: { p20VariationDb: -9.5 } }],
      evaluationIssues: [],
      currentResult: { score: { p20VariationDb: -9 } },
    },
    diagnostics: { currentResult: { score: { p20VariationDb: -9 } }, stages: [] },
    runIdentity: { runId: 'run-nouimp-1', startedAt: '2026-11-12T10:03:00Z' },
  });
  assert.equal(evidence.terminalOutcome, 'no_useful_improvement');
  assert.notEqual(evidence.terminalOutcome, 'failed');
  assert.equal(evidence.run.runId, 'run-nouimp-1');
});

// ── 7. Successful actionable recommendation ─────────────────────────────────
test('7: actionable plan — resolvePlanActionability returns actionable', () => {
  const plan = {
    planVersion: 3,
    levers: {
      delay: {
        evaluated: true,
        effect: { p20VariationDb: -8, p20DeltaDb: -1.5 },
        changes: [{ id: 'd1', delayMs: 0.5 }],
        practical: true,
        validation: { destinationsValid: true },
      },
    },
    baseline: { p20VariationDb: -9.5 },
    individualEffectsEvaluated: true,
  };
  const selection = {
    confirmedResults: [{ candidateId: 'c1', candidateKind: 'calibration' }],
    evaluationIssues: [],
    winner: { candidateId: 'c1' },
    currentResult: { score: { p20VariationDb: -9.5 } },
  };
  const actionability = resolvePlanActionability({ plan, selection });
  assert.equal(actionability.actionable, true);
  assert.equal(actionability.terminalOutcome, null);
});

// ── 8. New run supersedes an older failed result ─────────────────────────────
test('8: newer run supersedes older failed record by run ID', () => {
  const oldPlan = {
    savedAt: '2026-11-12T09:00:00Z',
    run: { runId: 'run-old', outcome: 'failed', terminal: true },
  };
  const newRun = { runId: 'run-new', startedAt: '2026-11-12T10:00:00Z' };
  assert.equal(planIsSupersededByRun(oldPlan, newRun), true);
  const presentation = resolvePresentationPlan({ plan: oldPlan, run: newRun });
  assert.equal(presentation.superseded, true);
  assert.equal(presentation.plan, null);
});

// ── 9. Failed heading without matching receipt cannot claim confirmed failure ─
// Code test: latestRunFailed is receipt-backed (planView.run.outcome === failed).
// A superseded plan (planView = null) does not produce a failed badge.
test('9: superseded plan yields no failed outcome for the badge', () => {
  const oldPlan = {
    savedAt: '2026-11-12T09:00:00Z',
    run: { runId: 'run-old', outcome: 'failed', terminal: true },
  };
  const newRun = { runId: 'run-new', startedAt: '2026-11-12T10:00:00Z' };
  const { plan } = resolvePresentationPlan({ plan: oldPlan, run: newRun });
  // The journey reads planView?.run?.outcome — a superseded plan is null.
  assert.equal(plan?.run?.outcome ?? null, null);
});

// ── 10. Run ID and fingerprint survive save and cold reopen ─────────────────
test('10: serialize → hydrate → resolve preserves run ID, fingerprint, evidence', () => {
  const evidence = buildOptimiserRunEvidence({
    identity: IDENTITY,
    failureReason: 'Worker failed.',
    runIdentity: { runId: 'run-persist-1', startedAt: '2026-11-12T10:04:00Z' },
  });
  evidence.searchStatus = buildSearchStatusEvidence({
    phaseDiagnostics: { status: 'completed', confirmed: 2, valid: 2 },
    calibrationDiagnostics: { status: 'completed', confirmed: 1, valid: 1 },
    gainDiagnostics: { status: 'skipped', confirmed: 0 },
    placementGate: false,
    seatingGate: false,
    seatingDiagnostics: { confirmed: 0, tested: 0, status: 'skipped' },
  });
  evidence.firstEvaluationIssue = { stage: 'global', error: 'worker timeout' };
  const serialized = serializeOptimiserPlan(evidence);
  const restored = hydrateOptimiserPlan('p1', 'v1', serialized);
  assert.equal(restored.run.runId, 'run-persist-1');
  assert.equal(restored.designFingerprint, 'fp-current');
  assert.equal(restored.terminalOutcome, 'failed');
  assert.equal(restored.firstEvaluationIssue?.stage, 'global');
  assert.ok(Array.isArray(restored.searchStatus?.categories));
  // resolveOptimiserPlanStatus reads it back with the same identity.
  const view = resolveOptimiserPlanStatus({ plan: restored, currentDesignFingerprint: 'fp-current' });
  assert.equal(view.run?.runId, 'run-persist-1');
  assert.equal(view.status, OPTIMISER_PLAN_STATUS.FAILED);
});

// ── 11. Failed presentation receives the correct matching evidence ───────────
test('11: FAILED presentation branch forwards evidence', () => {
  const planView = {
    status: OPTIMISER_PLAN_STATUS.FAILED,
    planVersion: 3,
    terminalOutcome: 'failed',
    run: {
      runId: 'run-fail-ev',
      outcome: 'failed',
      terminal: true,
      evidenceContractVersion: 3,
      rejectionReasons: ['Worker failed.'],
      families: [],
    },
  };
  const presentation = resolveOptimiserPresentationState({
    planView,
    runStatus: 'idle',
  });
  assert.equal(presentation.state, OPTIMISER_PRESENTATION_STATE.FAILED);
  assert.equal(presentation.evidence?.runId, 'run-fail-ev');
  assert.ok(Array.isArray(presentation.evidence?.rejectionReasons));
});

// ── 12. Zero seating probes cannot display Tested or Considered ──────────────
test('12a: zero seating probes — buildTestedOptionRows returns LAST_RESORT, not TESTED', () => {
  const planView = {
    planVersion: 3,
    searchStatus: buildSearchStatusEvidence({
      seatingDiagnostics: { confirmed: 0, tested: 0, status: 'skipped' },
    }),
    levers: {},
    run: { families: [] },
  };
  const rows = buildTestedOptionRows(planView, { runComplete: true });
  const seating = rows.find((r) => r.key === 'seating');
  assert.ok(seating, 'seating row exists');
  assert.notEqual(seating.status, ADI_ROW_STATUS.TESTED);
  assert.equal(seating.status, ADI_ROW_STATUS.LAST_RESORT);
});

test('12b: LAST_RESORT is not in EVALUATED_STATUS — adiTestedSummaryLines says "not tested"', () => {
  const rows = [{ key: 'seating', label: 'Seating', status: ADI_ROW_STATUS.LAST_RESORT, outcome: 'Seating is the last resort...' }];
  const lines = adiTestedSummaryLines(rows);
  assert.equal(lines[0].state, 'not tested');
});

// ── 13. A genuine seating search still displays Completed ────────────────────
test('13: genuine seating search — buildTestedOptionRows returns TESTED', () => {
  const planView = {
    planVersion: 3,
    searchStatus: buildSearchStatusEvidence({
      seatingGate: true,
      seatingDiagnostics: { confirmed: 3, tested: 10, status: 'completed' },
    }),
    levers: {},
    run: { families: [{ family: 'seating', tested: true, candidatesEvaluated: 3, status: 'evaluated', bestAttempt: { p20VariationDb: -7 } }] },
  };
  const rows = buildTestedOptionRows(planView, { runComplete: true });
  const seating = rows.find((r) => r.key === 'seating');
  assert.equal(seating.status, ADI_ROW_STATUS.TESTED);
});

test('13b: buildSearchStatusEvidence — confirmed seating probes → completed/evaluated', () => {
  const status = buildSearchStatusEvidence({
    seatingGate: true,
    seatingDiagnostics: { confirmed: 3, tested: 10, status: 'completed' },
  });
  const seating = status.categories.find((c) => c.key === 'seating');
  assert.equal(seating.status, 'completed');
  assert.equal(seating.evaluated, true);
});

// ── 14. Calibration auto-Apply and physical safety guards remain unchanged ───
// This is verified by the existing non-intrusive-hierarchy-gate and acceptance
// suites. Here we confirm the searchStatus evidence builder still classifies a
// gated-out placement search as skipped (the physical gate is untouched).
test('14: placement gate closed — searchStatus placement is skipped', () => {
  const status = buildSearchStatusEvidence({
    phaseDiagnostics: { status: 'completed', confirmed: 2, valid: 2 },
    calibrationDiagnostics: { status: 'completed', confirmed: 1, valid: 1 },
    gainDiagnostics: { status: 'completed', confirmed: 1, valid: 1 },
    placementGate: false,
    seatingGate: false,
    seatingDiagnostics: { confirmed: 0, tested: 0, status: 'skipped' },
  });
  const placement = status.categories.find((c) => c.key === 'placement');
  assert.equal(placement.status, 'skipped');
  assert.equal(placement.evaluated, false);
});