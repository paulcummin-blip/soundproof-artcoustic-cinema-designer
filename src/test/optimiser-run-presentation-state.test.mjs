// optimiser-run-presentation-state.test.mjs
// ---------------------------------------------------------------------------
// Regression tests for the ADI optimiser run-result contradiction.
//
// The status pill and the body must come from ONE resolved presentation state,
// generic ADI diagnosis must never produce an available recommendation, a
// completed no-winner run must keep its evidence, a rejected candidate must
// never be offered for application, and running the optimiser must not change
// the design.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_EVIDENCE,
  OPTIMISER_PLAN_STATUS,
  OPTIMISER_TERMINAL_OUTCOME,
} from '../components/room/bass/optimiserPlan/optimiserPlanConstants.js';
import { resolveOptimiserPlanStatus } from '../components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js';
import { buildOptimiserRunEvidence } from '../components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js';
import { serializeOptimiserPlan } from '../components/room/bass/optimiserPlan/optimiserPlanPersistence.js';
import {
  OPTIMISER_PRESENTATION_STATE,
  hasApplicableEvaluatedLever,
  resolveOptimiserPresentationState,
} from '../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');
const read = (path) => readFileSync(join(SRC, path), 'utf8');

const FINGERPRINT = 'marquee-home-design-fingerprint';
const GENERIC_ADVICE =
  'Try placement, delay, polarity, gain, or additional or alternative subwoofer positions before applying EQ.';

/** Marquee Home's recorded outcome: full search, no confirmed winner. */
const MARQUEE_RUN = {
  selection: {
    winner: null,
    confirmedResults: [],
    currentResult: {
      candidateId: 'current',
      achievedP20VariationDb: 12.24,
      achievedP20Level: 'L1',
      perSeatP20: [{ seatId: 'seat-r1-c2', variationDbRaw: 12.2436, worstFrequencyHz: 73.4432 }],
    },
  },
  diagnostics: {
    stages: [
      { name: 'Placement', candidatesEvaluated: { confirmed: 9 }, significance: 'none' },
      { name: 'Polarity', candidatesEvaluated: { confirmed: 0 }, significance: 'none' },
      { name: 'Delay', candidatesEvaluated: { confirmed: 4 }, significance: 'none' },
      { name: 'Gain', candidatesEvaluated: { confirmed: 4 }, significance: 'none' },
      { name: 'Phase', candidatesEvaluated: { confirmed: 0 }, significance: 'none' },
      { name: 'Final EQ', candidatesEvaluated: { confirmed: 17 }, significance: 'none' },
    ],
    currentResult: { candidateId: 'current', score: { p20VariationDb: 12.24, p20Level: 'L1' } },
    topCandidatesForWinningStage: [
      { candidateId: 'stage2-provisional-1', candidateKind: 'position', score: { p20VariationDb: 10.34, p20Level: 'L1', p19VariationDb: 4.1 }, polarity: [1] },
      { candidateId: 'stage2-provisional-2', candidateKind: 'position', score: { p20VariationDb: 11.02, p20Level: 'L1', p19VariationDb: 4.4 }, polarity: [1] },
    ],
  },
  identity: {
    projectId: 'marquee-home',
    versionId: 'v1',
    designFingerprint: FINGERPRINT,
    resultFingerprint: 'result-fp-1',
  },
};

const marqueePlanView = () => resolveOptimiserPlanStatus({
  plan: serializeOptimiserPlan(buildOptimiserRunEvidence(MARQUEE_RUN)),
  currentDesignFingerprint: FINGERPRINT,
  instances: [],
});

/** A current plan holding one genuinely evaluated, applicable lever. */
const planWithEvaluatedDelay = () => ({
  planVersion: 2,
  savedAt: '2026-09-30T10:00:00.000Z',
  recordKind: 'plan',
  projectId: 'marquee-home',
  versionId: 'v1',
  designFingerprint: FINGERPRINT,
  resultFingerprint: 'result-fp-2',
  candidateId: 'delay-candidate-1',
  baseline: { p20VariationDb: 12.24 },
  levers: {
    [OPTIMISER_LEVER.DELAY]: {
      lever: OPTIMISER_LEVER.DELAY,
      evidenceStatus: OPTIMISER_LEVER_EVIDENCE.EVALUATED,
      evaluated: true,
      notEvaluated: false,
      sourceCandidateId: 'delay-candidate-1',
      changes: [{ lever: OPTIMISER_LEVER.DELAY, subId: 'sub-rear-right', label: 'Rear sub 2', fromMs: 0, toMs: 4.5 }],
      effect: { p20VariationDb: 9.8, p20DeltaDb: -2.44, worstSeatId: 'seat-r1-c2' },
      reason: 'Aligns the rear subwoofer with the front pair at the RSP.',
      tradeOff: null,
    },
  },
  individualEffectsEvaluated: true,
  leverDecisions: {},
  notes: [],
});

/** The design the plan belongs to: one rear subwoofer at 0.0 ms delay. */
const PLAN_INSTANCES = [{ id: 'sub-rear-right', delayMs: 0, gainDb: 0, polarity: 1, enabled: true }];

const planViewFor = (plan, instances = PLAN_INSTANCES) => resolveOptimiserPlanStatus({
  plan,
  currentDesignFingerprint: FINGERPRINT,
  instances,
});

describe('TEST 1: generic advice with no saved plan', () => {
  it('resolves to Optimisation required with no Recommendation available label and no Apply', () => {
    const planView = planViewFor(null);
    // Generic diagnosis is passed as diagnosis only — it can never make a
    // change available.
    const state = resolveOptimiserPresentationState({
      planView,
      actionable: { available: false, reason: GENERIC_ADVICE },
    });

    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.NO_RUN);
    expect(state.statusLabel).toBe('Optimisation required');
    expect(state.showApply).toBe(false);
    expect(state.statusLabel).not.toBe('Recommendation available');
    expect(state.actionLabel).toBe('Run Optimisation Plan');
  });

  it('never renders the ADI recommendation pill outside the available state', () => {
    const source = read('components/room/bass/optimiseWorkflow/AdiRecommendation.jsx');
    expect(source.includes('OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE')).toBe(true);
    // The generic card (which carries the ADI pill) is only reached when the
    // canonical resolver says a change is available.
    expect(source).toMatch(
      /optimiserPresentation\.state !== OPTIMISER_PRESENTATION_STATE\.PLAN_AVAILABLE[\s\S]{0,400}<AdiOptimisationJourney/,
    );
  });
});

describe('TEST 2: completed run with no credible winner', () => {
  it('resolves to No useful improvement found with the run evidence and no Apply', () => {
    const planView = marqueePlanView();
    const state = resolveOptimiserPresentationState({ planView, actionable: { available: false } });

    expect(planView.status).toBe(OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT);
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT);
    expect(state.statusLabel).toBe('No useful improvement found');
    expect(state.showApply).toBe(false);

    const evidence = state.evidence;
    expect(evidence).toBeTruthy();
    expect(evidence.candidatesEvaluated).toBe(34);
    expect(evidence.resultsRetained).toBe(0);
    expect(evidence.leversTested.map((lever) => lever.lever)).toContain(OPTIMISER_LEVER.PLACEMENT);
    expect(evidence.leversTested.map((lever) => lever.lever)).toContain(OPTIMISER_LEVER.DELAY);
    expect(evidence.leversTested.map((lever) => lever.lever)).toContain(OPTIMISER_LEVER.GAIN);
    expect(evidence.bestAttempted.p20VariationDb).toBe(10.34);
    expect(evidence.bestAttempted.validationPassed).toBe(false);
    expect(evidence.bestAttempted.acceptedForApply).toBe(false);
    expect(evidence.rejectionReasons.length).toBeGreaterThan(0);
    expect(evidence.designUnchanged).toBe(true);
    expect(evidence.winnerCandidateId).toBe(null);
    expect(evidence.actionablePlanProduced).toBe(false);
  });

  it('shows the evidence but offers no Apply control in the card', () => {
    const block = read('components/room/bass/optimiserPlan/OptimiserRunEvidenceBlock.jsx');
    expect(block.includes('Best attempted')).toBe(true);
    expect(block.includes('cannot be applied')).toBe(true);
    expect(/onApply|applyHandler|<button/.test(block)).toBe(false);
  });
});

describe('TEST 3: incomplete or unsaved run', () => {
  it('resolves to Evaluation incomplete with a precise reason and a re-run', () => {
    const unsaved = resolveOptimiserPresentationState({
      planView: planViewFor(null),
      actionable: { available: false },
      planPersisted: false,
    });
    expect(unsaved.state).toBe(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE);
    expect(unsaved.statusLabel).toBe('Evaluation incomplete');
    expect(unsaved.message).toMatch(/could not be saved/);
    expect(unsaved.actionLabel).toBe('Re-run Optimisation Plan');
    expect(unsaved.showApply).toBe(false);

    const unreadable = resolveOptimiserPresentationState({
      planView: resolveOptimiserPlanStatus({
        plan: { planVersion: 1, designFingerprint: FINGERPRINT, levers: {} },
        currentDesignFingerprint: FINGERPRINT,
      }),
      actionable: { available: false },
    });
    expect(unreadable.state).toBe(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE);
    expect(unreadable.statusLabel).toBe('Evaluation incomplete');
    expect(unreadable.statusLabel).not.toBe('Recommendation available');
  });

  it('resolves an incomplete terminal run record to Evaluation incomplete with its evidence', () => {
    const record = buildOptimiserRunEvidence({
      selection: { winner: null, confirmedResults: [], currentResult: null },
      diagnostics: { stages: [{ name: 'Placement', candidatesEvaluated: { confirmed: 3 } }] },
      identity: { projectId: 'p', versionId: 'v', designFingerprint: FINGERPRINT },
    });
    expect(record.terminalOutcome).toBe(OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE);

    const state = resolveOptimiserPresentationState({
      planView: resolveOptimiserPlanStatus({ plan: record, currentDesignFingerprint: FINGERPRINT }),
      actionable: { available: false },
    });
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE);
    expect(state.evidence.candidatesEvaluated).toBe(3);
    expect(state.showApply).toBe(false);
  });
});

describe('TEST 4: current evaluated lever', () => {
  it('resolves to Optimisation plan available with a usable Apply action', () => {
    const planView = planViewFor(planWithEvaluatedDelay());
    const state = resolveOptimiserPresentationState({ planView, actionable: { available: false } });

    expect(planView.status).toBe(OPTIMISER_PLAN_STATUS.CURRENT);
    expect(hasApplicableEvaluatedLever(planView)).toBe(true);
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE);
    expect(state.statusLabel).toBe('Optimisation plan available');
    expect(state.showApply).toBe(true);
    expect(state.showPlan).toBe(true);

    const lever = planView.levers[0];
    expect(lever.key).toBe(OPTIMISER_LEVER.DELAY);
    expect(lever.evaluated).toBe(true);
    expect(lever.changes[0].fromMs).toBe(0);
    expect(lever.changes[0].toMs).toBe(4.5);
    expect(lever.reason).toBeTruthy();
    expect(lever.effect.p20DeltaDb).toBe(-2.44);
  });
});

describe('TEST 5: combined-only lever', () => {
  it('displays the combined evidence without an individual Apply action', () => {
    const plan = planWithEvaluatedDelay();
    plan.levers[OPTIMISER_LEVER.POLARITY] = {
      lever: OPTIMISER_LEVER.POLARITY,
      evidenceStatus: OPTIMISER_LEVER_EVIDENCE.COMBINED_ONLY,
      evaluated: false,
      notEvaluated: true,
      notEvaluatedReason: 'No polarity-only evaluation exists — the polarity value comes from the combined candidate.',
      sourceCandidateId: 'combined-1',
      changes: [{ lever: OPTIMISER_LEVER.POLARITY, subId: 'sub-rear-right', from: 1, to: -1, fromLabel: 'Normal', toLabel: 'Inverted' }],
      effect: null,
      reason: null,
      tradeOff: null,
    };
    const planView = planViewFor(plan);

    const polarity = planView.levers.find((lever) => lever.key === OPTIMISER_LEVER.POLARITY);
    expect(polarity.evaluated).toBe(false);
    expect(polarity.notEvaluated).toBe(true);
    expect(polarity.effect).toBe(null);
    expect(polarity.canApply).toBe(false);
    // The combined value is visible, but it is never claimed as independently validated.
    expect(polarity.evidenceLabel).toBe('Combined candidate only — no individual evaluation');
    expect(polarity.stateLabel).not.toBe('Applied');
  });
});

describe('TEST 6: stale plan', () => {
  it('resolves to Re-evaluation required with Apply disabled', () => {
    const planView = resolveOptimiserPlanStatus({
      plan: planWithEvaluatedDelay(),
      currentDesignFingerprint: 'a-different-design-fingerprint',
      instances: PLAN_INSTANCES,
    });
    const state = resolveOptimiserPresentationState({ planView, actionable: { available: true } });

    expect(planView.status).toBe(OPTIMISER_PLAN_STATUS.STALE);
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.STALE);
    expect(state.statusLabel).toBe('Re-evaluation required');
    expect(state.showApply).toBe(false);
    expect(state.actionLabel).toBe('Re-run Optimisation Plan');
  });

  it('reads the plan without ever writing the design', () => {
    const resolver = read('components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js');
    const presentation = read('components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js');
    for (const source of [resolver, presentation]) {
      expect(/commitInstances|commitSeating|update\(|bulkUpdate|applyCalibrationTuning|setOptimiserPlanAuthority/.test(source)).toBe(false);
    }
  });
});

describe('TEST 7: persistence', () => {
  it('keeps the terminal run evidence through a save/restore round trip', () => {
    const record = buildOptimiserRunEvidence(MARQUEE_RUN);
    const serialised = serializeOptimiserPlan(record);
    expect(serialised.terminalOutcome).toBe(OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
    expect(serialised.run.bestAttempted.p20VariationDb).toBe(10.34);
    expect(serialised.run.designUnchanged).toBe(true);

    // Refresh and reopen both read the same restored record.
    const restored = JSON.parse(JSON.stringify(serialised));
    const planView = resolveOptimiserPlanStatus({
      plan: restored,
      currentDesignFingerprint: FINGERPRINT,
      instances: [],
    });
    expect(planView.status).toBe(OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT);
    expect(planView.run.candidatesEvaluated).toBe(34);

    const state = resolveOptimiserPresentationState({ planView, actionable: { available: false } });
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT);
    expect(state.showApply).toBe(false);

    // The actionable path round-trips too.
    const planRoundTrip = resolveOptimiserPlanStatus({
      plan: serializeOptimiserPlan(planWithEvaluatedDelay()),
      currentDesignFingerprint: FINGERPRINT,
      instances: PLAN_INSTANCES,
    });
    expect(planRoundTrip.status).toBe(OPTIMISER_PLAN_STATUS.CURRENT);
    expect(resolveOptimiserPresentationState({ planView: planRoundTrip }).state)
      .toBe(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE);
  });

  it('states the outcome from the saved record instead of a default empty state', () => {
    const hook = read('components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js');
    expect(hook.includes('buildOptimiserRunEvidence')).toBe(true);
    expect(hook).toMatch(/optimiserPlan \|\| runEvidence/);
    expect(read('components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx').includes('buildOptimiserRunEvidence')).toBe(true);
    expect(read('components/room/bass/optimiserPlan/optimiserPlanPersistence.js')).toMatch(/terminalOutcome: plan\.terminalOutcome/);
  });
});

describe('TEST 8: no mutation during evaluation', () => {
  it('runs the optimiser without touching placement, delay, polarity or gain', () => {
    const hook = read('components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js');
    for (const mutator of ['commitInstances', 'commitSeating', 'applyCalibrationTuning', 'buildOptimisedInstances', 'applyCalibration']) {
      expect(hook.includes(mutator)).toBe(false);
    }
    // The only writes are the saved result and the published recommendation.
    expect((hook.match(/^\s+setOptimiserPlanAuthority\(/gm) || []).length).toBe(1);
    expect((hook.match(/await publishRecommendation\(/g) || []).length).toBe(1);
    expect(hook.includes('buildLeverApplyInstances')).toBe(false);
  });

  it('applies a lever only through the explicit Apply handler', () => {
    const card = read('components/room/bass/optimiseWorkflow/AdiRecommendation.jsx');
    expect(card).toMatch(/commitLeverChange/);
    expect(card).toMatch(/handleApplyLever/);
    const planStatus = read('components/room/bass/optimiserPlan/OptimisationPlanStatus.jsx');
    expect(planStatus).toMatch(/onClick=\{\(\) => onApplyLever\(lever\)\}/);
    expect(planStatus).toMatch(/onClick=\{\(\) => onUndoLever\(lever\)\}/);
  });
});