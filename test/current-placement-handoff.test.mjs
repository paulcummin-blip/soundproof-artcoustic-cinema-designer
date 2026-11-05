import test from "node:test";
import assert from "node:assert/strict";
import { evaluateStage2Placement } from "../src/components/room/bass/stage2/stage2CanonicalEvaluation.js";
import { currentPlacementFailure } from "../src/components/room/bass/improveBassV2/currentPlacementEvidence.js";
import { classifyCandidateAssessability } from "../src/components/room/bass/improveBassV2/confirmedCandidateValidity.js";

const roomDims = { widthM: 3.53, lengthM: 5.24, heightM: 2.4 };
const seats = [1.72, 2.32, 2.92, 3.52].map((x, i) => ({
  id: `seat-r1-c${i + 1}`, x, y: 2.2994650034533173, z: 1.2,
  priority: i === 1 || i === 2 ? "primary" : "secondary",
}));
function evaluate(xs) {
  return evaluateStage2Placement({
    finalist: { id: "current-design", familyId: "current", sources: xs.map((x, i) => ({
      xNorm: x / roomDims.widthM, yNorm: 3.3925 / roomDims.lengthM,
      coordinateSpace: "cabinet_centre", sourceId: `sub-rear-${i+1}`,
      modelKey: "sub3-12", bottomHeightM: 0.05,
    })) },
    roomDims, seatingPositions: seats, rspPosition: { x: 1.765, y: 2.924, z: 1.2 },
    selectedSubModel: "sub3-12", amplifierPowerPerSubW: 1000, subwooferBottomHeightM: 0.05,
  });
}
test("live Yarm geometry preserves physical rejection across the worker boundary", () => {
  const produced = evaluate([0.31, 4.93]);
  const received = structuredClone(produced);
  assert.deepEqual(received.physicalRejection.violations, ["right-wall-intersection"]);
  assert.equal(received.perSourcePerSeatComplexTransfers, undefined);
  const terminal = currentPlacementFailure(received);
  assert.equal(terminal.code, "CURRENT_PLACEMENT_REJECTED");
  assert.match(terminal.error, /right-wall-intersection/);
  assert.match(terminal.error, /positions and room dimensions/);
  assert.doesNotMatch(terminal.error, /seat-response|missing/);
  assert.equal(terminal.physicalRejection, received.physicalRejection);
  // Individual alternative rejection semantics remain unchanged.
  assert.equal(classifyCandidateAssessability(received).reason, "PHYSICAL_PLACEMENT_REJECTED");
});
test("valid Current retains all genuine source/receiver evidence unchanged", () => {
  const produced = evaluate([0.31, 3.22]);
  const before = JSON.stringify(produced);
  assert.equal(currentPlacementFailure(produced), null);
  assert.equal(produced.sources.length, 2);
  assert.deepEqual(produced.seatIds, ["rsp", ...seats.map(s=>s.id)]);
  assert.equal(produced.perSourcePerSeatComplexTransfers.length, 10);
  assert.ok(produced.perSourcePerSeatComplexTransfers.every(t => t.points.length === 360));
  assert.equal(JSON.stringify(produced), before);
});
test("absent evidence is never relabelled as a physical rejection", () => {
  assert.equal(currentPlacementFailure(null), null);
  assert.equal(currentPlacementFailure({ sources: [], perSourcePerSeatComplexTransfers: [] }), null);
});
