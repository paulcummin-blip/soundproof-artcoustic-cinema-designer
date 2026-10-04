import { test } from "vitest";
import { buildOptimiserPlan } from "../components/room/bass/optimiserPlan/buildOptimiserPlan.js";
import { resolveOptimiserPlanStatus } from "../components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import { assessPlacementPlausibility, subwooferGroupCounts } from "../components/room/bass/optimiserPlan/placementPlausibilityAuthority.js";
import { describePlacementMove } from "../components/room/bass/optimiserPlan/placementMoveAuthority.js";

const ROOM = { widthM: 4.4, lengthM: 6.0, heightM: 2.6 };
const IDENTITY = { projectId: "marquee", versionId: "v1", designFingerprint: "fp-current", baseDesignFingerprint: "fp-base", resultFingerprint: "fp-result", engineVersion: "3" };
const INSTANCES = [
  { id: "sub-1", model: "SUB4-12", enabled: true, legacyGroup: "front", position: { x: 1.0, y: 0.15 } },
  { id: "sub-2", model: "SUB4-12", enabled: true, legacyGroup: "front", position: { x: 2.4, y: 0.15 } },
  { id: "sub-3", model: "SUB4-12", enabled: true, legacyGroup: "rear", position: { x: 1.0, y: 5.85 } },
  { id: "sub-4", model: "SUB4-12", enabled: true, legacyGroup: "rear", position: { x: 2.4, y: 5.85 } },
];
const COORDS = [{ x: 0.7, y: 0.15 }, { x: 2.7, y: 0.15 }, { x: 0.7, y: 5.85 }, { x: 2.7, y: 5.85 }];
const run = {
  winner: null,
  currentResult: { achievedP20VariationDb: 16, achievedP20Level: 1, achievedP19VariationDb: 3.2, achievedP19Level: 4, p14AchievedDb: 121, achievedP18Hz: 25 },
  confirmedResults: [{ candidateId: "c1", candidateKind: "placement", isPositionCandidate: true, positionCoordinates: COORDS, achievedP20VariationDb: 13, achievedP20Level: 3, achievedP19VariationDb: 3.0, achievedP19Level: 4, p14AchievedDb: 121, achievedP18Hz: 25 }],
  evaluationIssues: [],
  positionOptimisation: { symmetric: { attempted: true, confirmed: 4 } },
};

test("debug gate", () => {
  const plan = buildOptimiserPlan({ selection: run, baseline: run.currentResult, identity: IDENTITY, instances: INSTANCES, roomDims: ROOM });
  const lever = plan.levers.placement;
  const counts = plan.layoutCounts || subwooferGroupCounts(INSTANCES, ROOM);
  const move = describePlacementMove({ changes: lever.changes, layoutCounts: counts });
  const verdict = assessPlacementPlausibility({ effect: lever.effect, baseline: plan.baseline, move, layoutCounts: counts });
  console.log("COUNT", JSON.stringify(counts));
  console.log("MOVES", JSON.stringify(move.movesByGroup), "practical", move.practical, "unambiguous", move.unambiguous, "label", move.movementLabel);
  console.log("EFFECT", JSON.stringify(lever.effect));
  console.log("BASELINE", JSON.stringify(plan.baseline));
  console.log("VERDICT", JSON.stringify({ c: verdict.credibility, apply: verdict.applyAllowed, imp: verdict.improvementDb, reasons: verdict.reasons, damages: verdict.damages }));
  const view = resolveOptimiserPlanStatus({ plan, currentDesignFingerprint: IDENTITY.designFingerprint, instances: INSTANCES });
  const row = view.levers.find((r) => r.key === "placement");
  console.log("ROW", JSON.stringify({ canApply: row.canApply, plausibility: row.plausibility, verdictLabel: row.verdictLabel, layoutCounts: view.layoutCounts }));
});