// placement-recommendation.test.mjs
// ---------------------------------------------------------------------------
// The placement recommendation: clear, applyable and undoable.
//
// What is verified here:
//   • placement is explained in installer words, never with coordinates
//   • the recommended move is practical and wall-based; a theoretical option is
//     stated as such and is never offered
//   • a run that confirms no winner but evaluates placement on its own still
//     retains that result, so it can be offered
//   • the placement row says Recommended and states the P20 improvement
//   • Apply moves ONLY the evaluated subwoofer positions, preserving every other
//     field (model, quantity, delay, gain, polarity, disabled state)
//   • Undo restores the exact previous positions
//   • a placement result from an earlier design state shows no Apply, states the
//     mandated copy, and offers one re-run
//   • no banned copy and no decimal dB anywhere
//
// Everything is driven through the real builders (buildOptimiserPlan →
// resolveOptimiserPlanStatus → buildAdiDesignerSummary / the placement
// authority), so what is tested is what the card renders.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";

import { buildOptimiserPlan } from "../components/room/bass/optimiserPlan/buildOptimiserPlan.js";
import {
  leverIsOfferable,
  resolvePlanActionability,
} from "../components/room/bass/optimiserPlan/optimiserPlanSave.js";
import { resolveOptimiserPlanStatus } from "../components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import { buildAdiDesignerSummary } from "../components/room/bass/optimiserPlan/adiDesignerSummary.js";
import {
  buildLeverApplyInstances,
  buildLeverUndoInstances,
  resolveLeverApplyState,
  LEVER_APPLY_BLOCK,
} from "../components/room/bass/optimiserPlan/optimiserPlanLeverApply.js";
import { resolvePlacementRecommendation } from "../components/room/bass/optimiserPlan/placementRecommendationAuthority.js";
import {
  PLACEMENT_APPLIED_MESSAGE,
  PLACEMENT_PREVIEW_UNAVAILABLE,
  PLACEMENT_PREVIOUS_FOUND,
  PLACEMENT_PREVIOUS_FOUND_STALE,
  PLACEMENT_THEORETICAL_NOTE,
  describePlacementChange,
  describePlacementMove,
} from "../components/room/bass/optimiserPlan/placementMoveAuthority.js";
import { OPTIMISER_PLAN_VERSION } from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";

const ROOM = { widthM: 4.4, lengthM: 6.0, heightM: 2.6 };
const IDENTITY = {
  projectId: "marquee",
  versionId: "v1",
  designFingerprint: "fp-current",
  baseDesignFingerprint: "fp-base",
  resultFingerprint: "fp-result",
  engineVersion: "3",
};

/** The open design: two front subs on the front wall, two rear subs on the rear. */
const INSTANCES = [
  { id: "sub-1", model: "SUB4-12", enabled: true, legacyGroup: "front", position: { x: 1.0, y: 0.15 }, delayMs: 2.5, gainDb: -1.5, polarity: 1, bottomHeightM: 0.3, rotationDeg: 0 },
  { id: "sub-2", model: "SUB4-12", enabled: true, legacyGroup: "front", position: { x: 2.4, y: 0.15 }, delayMs: 2.5, gainDb: -1.5, polarity: 1, bottomHeightM: 0.3, rotationDeg: 0 },
  { id: "sub-3", model: "SUB4-12", enabled: true, legacyGroup: "rear", position: { x: 1.0, y: 5.85 }, delayMs: 8.5, gainDb: -2.5, polarity: -1, bottomHeightM: 0.3, rotationDeg: 0 },
  { id: "sub-4", model: "SUB4-12", enabled: true, legacyGroup: "rear", position: { x: 2.4, y: 5.85 }, delayMs: 8.5, gainDb: -2.5, polarity: -1, bottomHeightM: 0.3, rotationDeg: 0 },
  { id: "sub-5", model: "SUB3-12", enabled: false, legacyGroup: "rear", position: { x: 3.6, y: 5.85 } },
];

/** Wider along both walls: a practical, wall-based move. */
const PRACTICAL_COORDS = [
  { x: 0.7, y: 0.15 },
  { x: 2.7, y: 0.15 },
  { x: 0.7, y: 5.85 },
  { x: 2.7, y: 5.85 },
];

/** Into the middle of the room: a theoretical option. */
const THEORETICAL_COORDS = [
  { x: 1.0, y: 3.0 },
  { x: 2.4, y: 3.0 },
  { x: 1.0, y: 5.85 },
  { x: 2.4, y: 5.85 },
];

/**
 * A run that confirmed no single winner — but evaluated placement on its own and
 * measured a 3 dB P20 improvement (16 dB → 13 dB).
 */
const placementRun = (coordinates) => ({
  winner: null,
  currentResult: {
    achievedP20VariationDb: 16,
    achievedP20Level: 1,
    achievedP19VariationDb: 3.2,
    achievedP19Level: 4,
    p14AchievedDb: 121,
    achievedP18Hz: 25,
  },
  confirmedResults: [{
    candidateId: "practical-wall-front-33",
    candidateKind: "placement",
    isPositionCandidate: true,
    positionCoordinates: coordinates,
    achievedP20VariationDb: 13,
    achievedP20Level: 3,
    achievedP19VariationDb: 3.0,
    achievedP19Level: 4,
    p14AchievedDb: 121,
    achievedP18Hz: 25,
  }],
  evaluationIssues: [],
  positionOptimisation: { symmetric: { attempted: true, confirmed: 4 } },
});

const buildPlan = (coordinates) => buildOptimiserPlan({
  selection: placementRun(coordinates),
  baseline: placementRun(coordinates).currentResult,
  identity: IDENTITY,
  instances: INSTANCES,
  roomDims: ROOM,
});

const planViewFor = (plan, fingerprint = IDENTITY.designFingerprint) => resolveOptimiserPlanStatus({
  plan,
  currentDesignFingerprint: fingerprint,
  instances: INSTANCES,
});

const placementPanel = (planView, extra = {}) => resolvePlacementRecommendation({
  planView,
  roomDims: ROOM,
  presentation: { state: "plan_available", statusLabel: "Optimisation plan available", showApply: true },
  ...extra,
});

// ── Placement, in installer words ────────────────────────────────────────────

describe("placement means moving the physical subwoofers", () => {
  const move = describePlacementMove({
    changes: [
      { lever: "placement", subId: "sub-1", group: "front", fromX: 1.0, fromY: 0.15, toX: 0.7, toY: 0.15, distanceMm: 300 },
      { lever: "placement", subId: "sub-2", group: "front", fromX: 2.4, fromY: 0.15, toX: 2.7, toY: 0.15, distanceMm: 300 },
      { lever: "placement", subId: "sub-3", group: "rear", fromX: 1.0, fromY: 5.85, toX: 0.7, toY: 5.85, distanceMm: 300 },
      { lever: "placement", subId: "sub-4", group: "rear", fromX: 2.4, fromY: 5.85, toX: 2.7, toY: 5.85, distanceMm: 300 },
    ],
    roomDims: ROOM,
  });

  it("states the move along each wall, in whole millimetres", () => {
    expect(move.practical).toBe(true);
    expect(move.movementLabel).toContain("front subs wider along the front wall");
    expect(move.movementLabel).toContain("rear subs wider along the rear wall");
    expect(move.movementLabel).toContain("approximately 300 mm");
    expect(move.movementLabel).toContain("toward the nearest side wall");
  });

  it("leads with installer language, never with raw coordinates", () => {
    expect(move.movementLabel).not.toMatch(/\d\.\d/);
    const planLine = describePlacementChange({
      lever: "placement", distanceMm: 300, direction: "towards the room's left", fromX: 1.0, fromY: 0.15, toX: 0.7, toY: 0.15,
    });
    expect(planLine).toContain("300 mm");
    expect(planLine).not.toMatch(/\d\.\d/);
  });

  it("keeps every subwoofer on its own wall", () => {
    expect(move.wallStatement).toMatch(/stay on their own wall/i);
  });

  it("marks a mid-room movement as theoretical", () => {
    const theoretical = describePlacementMove({
      changes: [{ lever: "placement", subId: "sub-1", group: "front", fromX: 1.0, fromY: 0.15, toX: 1.0, toY: 3.0, distanceMm: 2850 }],
      roomDims: ROOM,
    });
    expect(theoretical.practical).toBe(false);
    expect(theoretical.theoreticalReason).toMatch(/leaves the wall/i);
    expect(theoretical.theoreticalReason).toMatch(/middle of the room/i);
  });
});

// ── Retention: an evaluated placement is offered even with no winner ─────────

describe("a run that confirmed no winner still offers its placement result", () => {
  const plan = buildPlan(PRACTICAL_COORDS);

  it("retains exactly the evaluated positions", () => {
    expect(plan).toBeTruthy();
    const lever = plan.levers.placement;
    expect(lever.evaluated).toBe(true);
    expect(lever.practical).toBe(true);
    expect(lever.changes).toHaveLength(4);
    expect(lever.changes.map((change) => change.toX)).toEqual([0.7, 2.7, 0.7, 2.7]);
    expect(lever.effect.p20DeltaDb).toBe(-3);
  });

  it("makes the run actionable on that one change, and nothing else", () => {
    const actionability = resolvePlanActionability({ plan, selection: placementRun(PRACTICAL_COORDS) });
    expect(actionability.actionable).toBe(true);
    expect(actionability.offerableLevers).toEqual(["placement"]);
    expect(leverIsOfferable(plan.levers.placement, plan.baseline)).toBe(true);
    // No combined candidate is claimed, and no other lever is invented.
    expect(plan.combined).toBeNull();
    expect(Object.keys(plan.levers)).toEqual(["placement"]);
  });

  it("says Recommended and states the improvement, in whole dB", () => {
    const summary = buildAdiDesignerSummary({
      planView: planViewFor(plan),
      presentation: { state: "plan_available", statusLabel: "Optimisation plan available", showApply: true },
      instances: INSTANCES,
      roomDims: ROOM,
      seatCount: 4,
    });
    const row = summary.rows.find((candidate) => candidate.key === "placement");
    expect(row.status).toBe("Recommended");
    expect(row.outcome).toContain("front subs wider along the front wall");
    expect(row.outcome).toMatch(/3 dB/);
    expect(summary.actions.canApply).toBe(true);
    expect(summary.actions.applyLabel).toBe("Apply placement");
  });

  it("states P20, P19, output/headroom and extension as expected rows", () => {
    const panel = placementPanel(planViewFor(plan));
    expect(panel.kind).toBe("recommended");
    expect(panel.status).toBe("Recommended");
    expect(panel.summary).toBe("ADI found that moving the subwoofers improves seat-to-seat bass consistency by 3 dB.");
    const byLabel = Object.fromEntries(panel.expected.map((row) => [row.label, row.value]));
    expect(byLabel.P20).toBe("±16 dB → ±13 dB");
    expect(byLabel.P19).toBe("remains L4 / no meaningful change");
    expect(byLabel["Output / headroom"]).toBe("no meaningful loss");
    expect(byLabel.Extension).toBe("unchanged");
    expect(panel.canApply).toBe(true);
    expect(panel.applyLabel).toBe("Apply placement");
    expect(panel.canUndo).toBe(false);
  });

  it("says that no preview exists rather than implying one does", () => {
    const panel = placementPanel(planViewFor(plan));
    expect(panel.notice).toBe(PLACEMENT_PREVIEW_UNAVAILABLE);
  });

  it("carries no decimals and no banned copy", () => {
    const panel = placementPanel(planViewFor(plan));
    const copy = JSON.stringify(panel);
    expect(copy).not.toMatch(/\d\.\d/);
    expect(copy).not.toMatch(/re-run to apply|no applicable change was kept|improvement found but not offered/i);
  });
});

// ── Apply and Undo ───────────────────────────────────────────────────────────

describe("apply moves only the evaluated positions, and undo restores them", () => {
  const plan = buildPlan(PRACTICAL_COORDS);
  const view = planViewFor(plan);
  const lever = view.levers.find((row) => row.key === "placement");

  it("is applyable exactly once", () => {
    expect(lever.canApply).toBe(true);
    expect(lever.canUndo).toBe(false);
    expect(resolveLeverApplyState({
      leverKey: "placement",
      lever: plan.levers.placement,
      planStatus: "current",
      applied: false,
      missingSubIds: [],
    }).canApply).toBe(true);
  });

  it("writes only x/y, preserving model, delay, gain, polarity and disabled state", () => {
    const result = buildLeverApplyInstances({ leverKey: "placement", lever: plan.levers.placement, instances: INSTANCES });
    expect(result.ok).toBe(true);
    const byId = Object.fromEntries(result.instances.map((instance) => [instance.id, instance]));
    expect([byId["sub-1"].position.x, byId["sub-1"].position.y]).toEqual([0.7, 0.15]);
    expect([byId["sub-4"].position.x, byId["sub-4"].position.y]).toEqual([2.7, 5.85]);
    for (const original of INSTANCES) {
      const next = byId[original.id];
      expect(next.model).toBe(original.model);
      expect(next.enabled).toBe(original.enabled);
      expect(next.legacyGroup).toBe(original.legacyGroup);
      expect(next.delayMs).toBe(original.delayMs);
      expect(next.gainDb).toBe(original.gainDb);
      expect(next.polarity).toBe(original.polarity);
      expect(next.bottomHeightM).toBe(original.bottomHeightM);
      expect(next.rotationDeg).toBe(original.rotationDeg);
    }
    // The disabled instance keeps its position untouched.
    expect(byId["sub-5"].position).toEqual({ x: 3.6, y: 5.85 });
  });

  it("restores the exact previous positions and nothing else", () => {
    const applied = buildLeverApplyInstances({ leverKey: "placement", lever: plan.levers.placement, instances: INSTANCES });
    const undone = buildLeverUndoInstances({ leverKey: "placement", lever: plan.levers.placement, instances: applied.instances });
    expect(undone.ok).toBe(true);
    const byId = Object.fromEntries(undone.instances.map((instance) => [instance.id, instance]));
    for (const original of INSTANCES) {
      expect(byId[original.id].position).toEqual(original.position);
      expect(byId[original.id].delayMs).toBe(original.delayMs);
      expect(byId[original.id].gainDb).toBe(original.gainDb);
      expect(byId[original.id].polarity).toBe(original.polarity);
      expect(byId[original.id].model).toBe(original.model);
    }
  });

  it("reports Applied with Undo available once the design holds the positions", () => {
    const appliedInstances = buildLeverApplyInstances({
      leverKey: "placement",
      lever: plan.levers.placement,
      instances: INSTANCES,
    }).instances;
    const appliedView = resolveOptimiserPlanStatus({
      plan,
      currentDesignFingerprint: identityFingerprintAfterApply(),
      instances: appliedInstances,
    });
    const appliedLever = appliedView.levers.find((row) => row.key === "placement");
    expect(appliedLever.state).toBe("applied");
    expect(appliedLever.canApply).toBe(false);
    expect(appliedLever.canUndo).toBe(true);
    expect(appliedLever.undoLabel).toBe("Undo placement");

    const panel = resolvePlacementRecommendation({
      planView: appliedView,
      roomDims: ROOM,
      presentation: { state: "stale", showApply: false },
      appliedLever: "placement",
      appliedDirection: "to",
    });
    expect(panel.kind).toBe("applied");
    expect(panel.message).toBe(PLACEMENT_APPLIED_MESSAGE);
    expect(panel.canUndo).toBe(true);
    expect(panel.canApply).toBe(false);
  });
});

/** A design fingerprint that differs once placement has been applied. */
function identityFingerprintAfterApply() {
  return "fp-after-placement";
}

// ── Stale: no Apply, one re-run, the mandated copy ───────────────────────────

describe("a placement result from an earlier design state is not applied", () => {
  const plan = buildPlan(PRACTICAL_COORDS);
  const staleView = planViewFor(plan, "fp-changed-since-evaluation");

  it("blocks Apply and says why", () => {
    const lever = staleView.levers.find((row) => row.key === "placement");
    expect(staleView.status).toBe("stale");
    expect(lever.canApply).toBe(false);
    expect(lever.applyBlockedReason).toMatch(/re-run/i);
  });

  it("states the mandated copy and offers exactly one action", () => {
    const panel = resolvePlacementRecommendation({
      planView: staleView,
      roomDims: ROOM,
      presentation: { state: "stale", showApply: false },
    });
    expect(panel.kind).toBe("previous");
    expect(panel.notice).toBe(PLACEMENT_PREVIOUS_FOUND_STALE);
    expect(panel.canApply).toBe(false);
    expect(panel.canRerun).toBe(true);
    expect(panel.rerunLabel).toBe("Bass Optimiser");
    expect(JSON.stringify(panel)).not.toMatch(/re-run to apply|no applicable change was kept/i);
  });

  it("still states the measured improvement in whole dB", () => {
    const panel = resolvePlacementRecommendation({
      planView: staleView,
      roomDims: ROOM,
      presentation: { state: "stale", showApply: false },
    });
    expect(panel.summary).toMatch(/better by 3 dB/);
    const p20 = panel.expected.find((row) => row.label === "P20");
    expect(p20.value).toMatch(/3 dB/);
  });
});

// ── An improvement whose positions were not kept ─────────────────────────────

describe("a placement improvement saved without its positions", () => {
  const view = {
    status: "incomplete",
    levers: [],
    baseline: { p20VariationDb: 18, p20Level: 1, p19VariationDb: 3, p19Level: 4 },
    run: {
      families: [{
        family: "placement",
        status: "rejected",
        tested: true,
        candidatesEvaluated: 4,
        bestAttempt: { p20VariationDb: 14.52, p19VariationDb: 0.39, p20DeltaDb: -3.91, p19DeltaDb: -0.62 },
      }],
    },
  };

  it("states the mandated copy and the value, and offers no Apply", () => {
    const panel = resolvePlacementRecommendation({
      planView: view,
      roomDims: ROOM,
      presentation: { state: "evaluation_incomplete", showApply: false },
    });
    expect(panel.kind).toBe("previous");
    expect(panel.notice).toBe(PLACEMENT_PREVIOUS_FOUND);
    expect(panel.notice).toBe("Previous result found a possible improvement. Re-run ADI on the current design before applying any change.");
    expect(panel.canApply).toBe(false);
    expect(panel.canRerun).toBe(true);
    const p20 = panel.expected.find((row) => row.label === "P20");
    expect(p20.value).toMatch(/better by 3 dB/);
    expect(JSON.stringify(panel)).not.toMatch(/re-run to apply|no applicable change was kept|\d\.\d/);
  });

  it("says nothing at all when no placement improvement was measured", () => {
    const quiet = resolvePlacementRecommendation({
      planView: { ...view, run: { families: [{ family: "placement", status: "not_tested", tested: false }] } },
      roomDims: ROOM,
      presentation: { state: "evaluation_incomplete", showApply: false },
    });
    expect(quiet).toBeNull();
  });
});

// ── Theoretical options are never offered ────────────────────────────────────

describe("a theoretical placement is stated, never offered", () => {
  const plan = buildPlan(THEORETICAL_COORDS);

  it("retains the evidence and marks it theoretical", () => {
    expect(plan.levers.placement.practical).toBe(false);
    expect(plan.levers.placement.theoreticalReason).toMatch(/leaves the wall/i);
    // Only the subwoofers that actually move are retained: the rear pair is
    // unchanged in this candidate, so it is not a change.
    expect(plan.levers.placement.changes).toHaveLength(2);
    expect(plan.levers.placement.changes.every((change) => change.group === "front")).toBe(true);
  });

  it("cannot be applied, and says why", () => {
    expect(leverIsOfferable(plan.levers.placement, plan.baseline)).toBe(false);
    const applyState = resolveLeverApplyState({
      leverKey: "placement",
      lever: plan.levers.placement,
      planStatus: "current",
      applied: false,
      missingSubIds: [],
    });
    expect(applyState.canApply).toBe(false);
    expect(applyState.code).toBe(LEVER_APPLY_BLOCK.IMPRACTICAL);
    expect(applyState.reason).toBe(PLACEMENT_THEORETICAL_NOTE);
    const view = planViewFor(plan);
    const lever = view.levers.find((row) => row.key === "placement");
    expect(lever.canApply).toBe(false);
    expect(lever.applyBlockedReason).toBe(PLACEMENT_THEORETICAL_NOTE);
  });

  it("runs no action at all on the plan, and states the note instead", () => {
    const actionability = resolvePlanActionability({ plan, selection: placementRun(THEORETICAL_COORDS) });
    expect(actionability.actionable).toBe(false);
    expect(actionability.reason).toContain(PLACEMENT_THEORETICAL_NOTE);
  });

  it("stays out of the designer's default view, and is stated in the plan details", () => {
    const panel = placementPanel(planViewFor(plan));
    expect(panel.kind).toBeNull();
    expect(panel.theoretical).toBe(true);
    expect(panel.theoreticalNote).toContain(PLACEMENT_THEORETICAL_NOTE);

    const summary = buildAdiDesignerSummary({
      planView: planViewFor(plan),
      presentation: { state: "no_useful_improvement", showApply: false },
      instances: INSTANCES,
      roomDims: ROOM,
      seatCount: 4,
    });
    const row = summary.rows.find((candidate) => candidate.key === "placement");
    expect(row.status).toBe("Tested");
    expect(row.outcome).toContain(PLACEMENT_THEORETICAL_NOTE);
    expect(summary.actions.canApply).toBe(false);
  });
});

// ── The plan carries the same numbers the panel states ───────────────────────

describe("the persisted plan is what every surface reads", () => {
  it("records the plan version, the evaluated positions and the physical move", () => {
    const plan = buildPlan(PRACTICAL_COORDS);
    expect(plan.planVersion).toBe(OPTIMISER_PLAN_VERSION);
    expect(plan.levers.placement.movementLabel).toContain("front wall");
    expect(plan.levers.placement.movementLabel).not.toMatch(/\d\.\d/);
    expect(plan.levers.placement.sourceCandidateId).toBe("practical-wall-front-33");
    expect(plan.individualEffectsEvaluated).toBe(true);
  });
});