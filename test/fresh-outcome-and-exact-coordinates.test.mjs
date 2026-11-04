// fresh-outcome-and-exact-coordinates.test.mjs
// ---------------------------------------------------------------------------
// Regression suite for:
//   1. The distinct NON_ACTIONABLE_WINNER terminal outcome (winner exists,
//      placement not practical) — never collapses into NO_USEFUL_IMPROVEMENT.
//   2. Fresh run presentation authority — the fresh run's own terminal outcome
//      is the panel's headline, not a historical applied receipt.
//   3. Exact coordinate preservation — evaluated = saved = Apply, no rounding.
//
// Changes NO acoustic maths, optimiser search, ranking, P14/P18/P19/P20,
// primary-seat safety, geometry generation, or timeouts.
//
// Run: node --import ./test/_alias-register.mjs --test test/fresh-outcome-and-exact-coordinates.test.mjs
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import {
  OPTIMISER_LEVER,
  OPTIMISER_PLAN_STATUS,
  OPTIMISER_TERMINAL_OUTCOME,
  OPTIMISER_WINNER_NON_PRACTICAL_REASON,
} from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import {
  resolvePlanActionability,
} from "../src/components/room/bass/optimiserPlan/optimiserPlanSave.js";
import {
  buildOptimiserRunEvidence,
} from "../src/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import {
  OPTIMISER_OUTCOME,
  OPTIMISER_OUTCOME_LABEL,
  OPTIMISER_PRESENTATION_STATE,
  resolveOptimiserPresentationState,
} from "../src/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import {
  buildOptimiserPlan,
} from "../src/components/room/bass/optimiserPlan/buildOptimiserPlan.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A subwoofer instance at a known position, for placement-change tests. */
function instanceAt(id, x, y, group = "front") {
  return { id, enabled: true, legacyGroup: group, position: { x, y }, delayMs: 0, gainDb: 0, polarity: 1 };
}

/** A position candidate result with the given destination coordinates. */
function positionCandidate(candidateId, coords) {
  return {
    isPositionCandidate: true,
    candidateId,
    candidateKind: "position",
    positionCoordinates: coords,
    appliedTuning: [],
  };
}

// ---------------------------------------------------------------------------
// CASE B — distinct NON_ACTIONABLE_WINNER outcome
// ---------------------------------------------------------------------------

test("E: winner exists + non-actionable placement → NON_ACTIONABLE_WINNER outcome", () => {
  // A plan with a placement lever marked practical=false (theoretical placement).
  // The winner EXISTS — the improvement is real — but the placement is not
  // buildable. This must NOT collapse into NO_USEFUL_IMPROVEMENT.
  const plan = {
    planVersion: 3,
    levers: {
      [OPTIMISER_LEVER.PLACEMENT]: {
        lever: OPTIMISER_LEVER.PLACEMENT,
        evaluated: true,
        notEvaluated: false,
        changes: [{ subId: "sub-1", toX: 0.145, toY: 9.855, fromX: 0.5, fromY: 0.5, distanceMm: 100 }],
        effect: { p20VariationDb: 6.0, p20Level: "L2", p20DeltaDb: -1.5 },
        practical: false,
        theoreticalReason: "Placement is off the mounting wall.",
        validation: { destinationsValid: true },
      },
    },
    baseline: { p20VariationDb: 7.5, p20Level: "L1" },
  };
  const selection = { winner: { candidateId: "winner-1" }, confirmedResults: [] };

  const result = resolvePlanActionability({ plan, selection });

  assert.equal(result.actionable, false, "non-actionable winner must not be actionable");
  assert.equal(
    result.terminalOutcome,
    OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_WINNER,
    "must be NON_ACTIONABLE_WINNER, not NO_USEFUL_IMPROVEMENT",
  );
});

test("F: winner absent + no useful improvement → NO_USEFUL_IMPROVEMENT remains valid", () => {
  const plan = {
    planVersion: 3,
    levers: {},
    baseline: { p20VariationDb: 7.5, p20Level: "L1" },
  };
  const selection = { winner: null, confirmedResults: [] };

  const result = resolvePlanActionability({ plan, selection });

  assert.equal(result.actionable, false);
  assert.equal(
    result.terminalOutcome,
    OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT,
    "no winner stays NO_USEFUL_IMPROVEMENT",
  );
});

test("G: winner ID preserved in NON_ACTIONABLE_WINNER run evidence", () => {
  const selection = {
    winner: { candidateId: "winner-abc-123" },
    confirmedResults: [],
    currentResult: null,
  };
  const evidence = buildOptimiserRunEvidence({
    selection,
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_WINNER,
    failureReason: `${OPTIMISER_WINNER_NON_PRACTICAL_REASON} Placement is off the mounting wall.`,
    runIdentity: { runId: "run-1", startedAt: "2026-01-01T00:00:00Z" },
  });

  assert.equal(evidence.run.winnerCandidateId, "winner-abc-123", "winner ID must be preserved");
  assert.equal(evidence.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_WINNER);
});

test("H: non-practical reason preserved in NON_ACTIONABLE_WINNER evidence", () => {
  const reason = `${OPTIMISER_WINNER_NON_PRACTICAL_REASON} Placement is off the mounting wall.`;
  const evidence = buildOptimiserRunEvidence({
    selection: { winner: { candidateId: "w1" }, confirmedResults: [] },
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_WINNER,
    failureReason: reason,
    runIdentity: { runId: "run-1", startedAt: "2026-01-01T00:00:00Z" },
  });

  assert.ok(
    evidence.run.rejectionReasons.some((r) => r.includes("not practical")),
    "non-practical reason must be in rejection reasons",
  );
  // The generic "no candidate was confirmed" wording must NOT be appended.
  assert.ok(
    !evidence.run.rejectionReasons.some((r) => r.includes("No candidate was confirmed")),
    "generic no-winner wording must NOT appear for NON_ACTIONABLE_WINNER",
  );
});

// ---------------------------------------------------------------------------
// CASE B — visible headline no longer says "no improvement found"
// ---------------------------------------------------------------------------

test("NON_ACTIONABLE_WINNER presentation state resolves to distinct outcome", () => {
  const planView = { status: OPTIMISER_PLAN_STATUS.NON_ACTIONABLE_WINNER };
  const state = resolveOptimiserPresentationState({ planView });

  assert.equal(state.state, OPTIMISER_PRESENTATION_STATE.NON_ACTIONABLE_WINNER);
  assert.equal(state.outcome, OPTIMISER_OUTCOME.NON_ACTIONABLE_WINNER);
  assert.equal(
    state.outcomeLabel,
    OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.NON_ACTIONABLE_WINNER],
  );
  // The headline must NOT say "No Improvement Found".
  assert.ok(
    !state.outcomeLabel.includes("No Improvement"),
    "NON_ACTIONABLE_WINNER headline must not say 'No Improvement Found'",
  );
  assert.ok(
    state.outcomeLabel.includes("Placement Not Practical"),
    "headline must state 'Placement Not Practical'",
  );
});

test("NON_ACTIONABLE_WINNER copy states the improvement was found", () => {
  const planView = { status: OPTIMISER_PLAN_STATUS.NON_ACTIONABLE_WINNER };
  const state = resolveOptimiserPresentationState({ planView });

  assert.ok(
    state.message.includes("better-performing option was found"),
    "message must state a better-performing option was found",
  );
  assert.ok(
    state.message.includes("not practical"),
    "message must state the placement is not practical",
  );
});

// ---------------------------------------------------------------------------
// CASE A — fresh run presentation authority over historical applied receipt
// ---------------------------------------------------------------------------

function makePlanView(status, terminalOutcome = null) {
  return {
    status,
    terminalOutcome,
    run: { runId: "fresh-run-1", terminal: true, evidenceContractVersion: 3 },
    planVersion: 3,
  };
}

test("A: fresh trade-off → TRADE_OFF outcome (not applied)", () => {
  const planView = makePlanView(OPTIMISER_PLAN_STATUS.CURRENT);
  const state = resolveOptimiserPresentationState({
    planView,
    tradeOff: { isTradeOff: true, headline: "Trade-off found" },
  });
  assert.equal(state.state, OPTIMISER_PRESENTATION_STATE.TRADE_OFF);
  assert.equal(state.outcome, OPTIMISER_OUTCOME.TRADE_OFF);
});

test("B: fresh no useful improvement → NO_IMPROVEMENTS outcome", () => {
  const planView = makePlanView(OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT);
  const state = resolveOptimiserPresentationState({ planView });
  assert.equal(state.state, OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT);
  assert.equal(state.outcome, OPTIMISER_OUTCOME.NO_IMPROVEMENTS);
});

test("C: fresh incomplete → incomplete/error state (not applied)", () => {
  // A fresh run that could not finish is a technical failure of THAT run — the
  // error state — never an applied state and never a bare "re-test" prompt.
  const planView = makePlanView(OPTIMISER_PLAN_STATUS.INCOMPLETE);
  const state = resolveOptimiserPresentationState({ planView });
  assert.equal(state.showApply, false, "incomplete/error must not offer Apply");
  assert.ok(
    state.state === OPTIMISER_PRESENTATION_STATE.FAILED
    || state.state === OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE,
    "must be an incomplete/error state, not applied",
  );
  assert.ok(
    state.outcome === OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE
    || state.outcome === OPTIMISER_OUTCOME.RETEST_NEEDED,
    "must be an error/retest outcome, not applied",
  );
});

test("D: fresh plan available → IMPROVEMENTS_FOUND with showApply (applied state path)", () => {
  // A fresh run that produced an actionable plan — the presentation authority
  // resolves PLAN_AVAILABLE with showApply: true. The applied wording itself
  // comes from the result view model; the presentation state owns the badge.
  const planView = {
    ...makePlanView(OPTIMISER_PLAN_STATUS.CURRENT),
    levers: [
      {
        key: OPTIMISER_LEVER.DELAY,
        evaluated: true,
        changes: [{ subId: "s1", fromMs: 0, toMs: 2.5 }],
        effect: { p20DeltaDb: -1.5, p20VariationDb: 6.0, p20Level: "L2" },
        canApply: true,
      },
    ],
  };
  const state = resolveOptimiserPresentationState({ planView });
  assert.equal(state.showApply, true, "PLAN_AVAILABLE must offer Apply");
  assert.ok(
    state.outcome === OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND
    || state.outcome === OPTIMISER_OUTCOME.PHYSICAL_CHANGE,
    "PLAN_AVAILABLE must resolve to an improvement outcome",
  );
});

// ---------------------------------------------------------------------------
// CASE C — exact coordinate preservation (evaluated = saved = Apply)
// ---------------------------------------------------------------------------

/**
 * Build a plan from a position candidate with fractional coordinates and
 * verify the persisted destination preserves the exact value.
 */
function buildPlanWithCoords(coords, instances) {
  const positionResult = positionCandidate("pos-1", coords);
  const selection = {
    winner: null,
    confirmedResults: [positionResult],
    currentResult: null,
  };
  return buildOptimiserPlan({
    selection,
    instances,
    identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp1" },
    roomDims: { widthM: 5, lengthM: 10, heightM: 3 },
  });
}

test("I: 0.145 remains 0.145 in saved destination coordinates", () => {
  const instances = [instanceAt("sub-1", 0.5, 0.5)];
  const plan = buildPlanWithCoords([{ x: 0.145, y: 5.0 }], instances);
  assert.ok(plan, "plan must be built");
  const placement = plan.levers[OPTIMISER_LEVER.PLACEMENT];
  assert.ok(placement, "placement lever must exist");
  const change = placement.changes[0];
  assert.equal(change.toX, 0.145, "toX must be exactly 0.145, not 0.15");
  assert.equal(change.toY, 5.0, "toY must be exactly 5.0");
});

test("J: 9.855 remains 9.855 in saved destination coordinates", () => {
  const instances = [instanceAt("sub-1", 5.0, 5.0)];
  const plan = buildPlanWithCoords([{ x: 2.5, y: 9.855 }], instances);
  const placement = plan.levers[OPTIMISER_LEVER.PLACEMENT];
  const change = placement.changes[0];
  assert.equal(change.toY, 9.855, "toY must be exactly 9.855, not 9.86");
});

test("K: 0.1375 remains 0.1375 in saved destination coordinates", () => {
  const instances = [instanceAt("sub-1", 0.5, 0.5)];
  const plan = buildPlanWithCoords([{ x: 0.1375, y: 5.0 }], instances);
  const placement = plan.levers[OPTIMISER_LEVER.PLACEMENT];
  const change = placement.changes[0];
  assert.equal(change.toX, 0.1375, "toX must be exactly 0.1375, not 0.14");
});

test("L: buildOptimiserPlan does not round machine coordinates", () => {
  const coords = [{ x: 0.1375, y: 9.855 }, { x: 0.145, y: 4.845 }];
  // Two-source layout with a position candidate carrying the fractional coords.
  const instances2 = [instanceAt("sub-1", 1.0, 1.0, "front"), instanceAt("sub-2", 4.0, 1.0, "front")];
  const positionResult = positionCandidate("pos-1", coords);
  const plan = buildOptimiserPlan({
    selection: {
      winner: null,
      confirmedResults: [positionResult],
      currentResult: null,
    },
    instances: instances2,
    identity: { projectId: "p1", versionId: "v1", designFingerprint: "fp1" },
    roomDims: { widthM: 5, lengthM: 10, heightM: 3 },
  });
  assert.ok(plan, "plan must be built");
  const placement = plan.levers[OPTIMISER_LEVER.PLACEMENT];
  assert.ok(placement, "placement lever must exist");
  // Each saved destination coordinate must preserve exact precision (not 2 dp).
  assert.equal(placement.changes[0].toX, 0.1375, "toX must be 0.1375 not 0.14");
  assert.equal(placement.changes[0].toY, 9.855, "toY must be 9.855 not 9.86");
  assert.equal(placement.changes[1].toX, 0.145, "toX must be 0.145 not 0.15");
  assert.equal(placement.changes[1].toY, 4.845, "toY must be 4.845 not 4.85");
});

test("N: display formatting does not mutate internal coordinates", () => {
  const instances = [instanceAt("sub-1", 0.5, 0.5)];
  const plan = buildPlanWithCoords([{ x: 0.1375, y: 9.855 }], instances);
  const placement = plan.levers[OPTIMISER_LEVER.PLACEMENT];
  const change = placement.changes[0];
  // The internal value is the exact one; a display layer may round to 2 dp
  // for rendering, but the stored value stays canonical.
  assert.equal(change.toX, 0.1375);
  assert.equal(change.toY, 9.855);
  // Verify that a 2-dp display format would differ from the stored value
  // (proving the stored value has MORE precision than display).
  const displayed = Number(change.toX.toFixed(2));
  assert.notEqual(displayed, change.toX, "display-rounded value must differ from stored");
});

test("O: evaluated = saved = plan coordinate (end-to-end identity)", () => {
  const evaluatedX = 0.1375;
  const evaluatedY = 9.855;
  const instances = [instanceAt("sub-1", 0.5, 0.5)];
  const plan = buildPlanWithCoords([{ x: evaluatedX, y: evaluatedY }], instances);
  const placement = plan.levers[OPTIMISER_LEVER.PLACEMENT];
  const change = placement.changes[0];
  // The exact evaluated value passes through to the saved plan unchanged.
  assert.equal(change.toX, evaluatedX, "saved toX === evaluated toX");
  assert.equal(change.toY, evaluatedY, "saved toY === evaluated toY");
  // The Apply builder reads the same saved value — it is the same object field.
  // (resolveLeverApplyMap / applyPlacement reads plan.levers[PLACEMENT].changes[].toX.)
  const applyDestination = plan.levers[OPTIMISER_LEVER.PLACEMENT].changes[0].toX;
  assert.equal(applyDestination, evaluatedX, "Apply destination === evaluated value");
});