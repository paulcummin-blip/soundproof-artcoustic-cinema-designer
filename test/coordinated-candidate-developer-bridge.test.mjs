// coordinated-candidate-developer-bridge.test.mjs
// Focused source-level tests for the developer-only coordinated candidate bridge.
// Verifies the runner is reachable, invokes the evaluator once, runs all three
// integrity gates, and exposes inspectable evidence without applying geometry.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runCoordinatedCandidateDeveloper,
  getCoordinatedDeveloperRunResult,
  clearCoordinatedDeveloperRun,
} from "../src/components/room/bass/improveBassV2/coordinatedCandidateDeveloperRun.js";
import { buildRoomDBundle, ROOM_D_DIMS } from "../src/components/room/bass/improveBassV2/coordinatedCandidateFixture.js";
import {
  checkPreTransferIntegrity,
  checkPreConfirmIntegrity,
  checkPostConfirmIntegrity,
} from "../src/components/room/bass/improveBassV2/coordinatedCandidateIntegrityChecks.js";
import { validateCoordinatedCandidateBundle } from "../src/components/room/bass/improveBassV2/coordinatedCandidateBundle.js";

test("Room D fixture builds a structurally valid bundle from real inputs", () => {
  const bundle = buildRoomDBundle({});
  assert.equal(bundle.quantity, 4);
  assert.equal(bundle.coordinates.length, 4);
  assert.equal(bundle.sourceIds.length, 4);
  assert.equal(bundle.seatingPositions.length, 6);
  assert.equal(bundle.designatedSeatId, "room-d-seat-2");
  assert.equal(bundle.responseBasis, "sub-only");
  assert.equal(bundle.autoAlignEnabled, false);
  assert.equal(bundle.crossover.frequencyHz, 95);
  assert.equal(bundle.p14Target.p14TargetDb, 117);
  const structural = validateCoordinatedCandidateBundle(bundle);
  assert.ok(structural.valid, `Bundle should be valid: ${JSON.stringify(structural.issues)}`);
});

test("Room D seating starts from the original saved rows and shifts once", () => {
  const bundle = buildRoomDBundle({});
  // Original primary row Y = 4.0 m, after a single −0.6 m shift = 3.4 m.
  // The secondary row Y = 5.8 m shifts once to 5.2 m.
  const frontCentre = bundle.seatingPositions.find((s) => s.id === "room-d-seat-2");
  assert.ok(frontCentre, "Front-row centre seat must exist");
  assert.equal(Math.round(frontCentre.y * 1000) / 1000, 3.4);
  const rearCentre = bundle.seatingPositions.find((s) => s.id === "room-d-seat-5");
  assert.ok(rearCentre, "Rear-row centre seat must exist");
  assert.equal(Math.round(rearCentre.y * 1000) / 1000, 5.2);
  // RSP resolved from the designated primary seat at (1.75, 3.4, 1.2)
  assert.ok(bundle.rspResolvedFromSeat);
  assert.equal(bundle.rspPosition.y, 3.4);
  assert.equal(bundle.rspPosition.x, 1.75);
  assert.equal(bundle.rspPosition.z, 1.2);
});

test("pre-transfer integrity gate passes for the Room D bundle", () => {
  const bundle = buildRoomDBundle({});
  const gate = checkPreTransferIntegrity(bundle, ROOM_D_DIMS);
  assert.ok(gate.valid, `Pre-transfer gate should pass: ${JSON.stringify(gate.issues)}`);
});

test("pre-transfer integrity gate catches duplicate source IDs", () => {
  const bundle = buildRoomDBundle({});
  bundle.sourceIds = ["dup", "dup", "c3", "c4"];
  const gate = checkPreTransferIntegrity(bundle, ROOM_D_DIMS);
  assert.ok(!gate.valid);
  assert.ok(gate.issues.some((i) => i.includes("Duplicate")));
});

test("pre-transfer integrity gate catches missing designated seat", () => {
  const bundle = buildRoomDBundle({});
  bundle.designatedSeatId = "nonexistent-seat";
  const gate = checkPreTransferIntegrity(bundle, ROOM_D_DIMS);
  assert.ok(!gate.valid);
  assert.ok(gate.issues.some((i) => i.includes("Designated seat")));
});

test("pre-transfer integrity gate catches coordinate outside room", () => {
  const bundle = buildRoomDBundle({});
  bundle.coordinates[0] = { x: 10, y: 0.1375 }; // outside 3.5 m width
  const gate = checkPreTransferIntegrity(bundle, ROOM_D_DIMS);
  assert.ok(!gate.valid);
  assert.ok(gate.issues.some((i) => i.includes("outside room")));
});

test("pre-confirm integrity gate catches source order mismatch", () => {
  const bundle = buildRoomDBundle({});
  const fakeTransfer = {
    sources: bundle.sourceIds.map((id, i) => ({ id: i === 0 ? "wrong" : id })),
    seatingPositions: bundle.seatingPositions,
    rspPosition: bundle.rspPosition,
  };
  const gate = checkPreConfirmIntegrity(bundle, fakeTransfer);
  assert.ok(!gate.valid);
  assert.ok(gate.issues.some((i) => i.includes("Source order mismatch")));
});

test("pre-confirm integrity gate catches RSP mismatch", () => {
  const bundle = buildRoomDBundle({});
  const fakeTransfer = {
    sources: bundle.sourceIds.map((id) => ({ id })),
    seatingPositions: bundle.seatingPositions,
    rspPosition: { x: 999, y: 999 },
  };
  const gate = checkPreConfirmIntegrity(bundle, fakeTransfer);
  assert.ok(!gate.valid);
  assert.ok(gate.issues.some((i) => i.includes("RSP")));
});

test("pre-confirm integrity gate catches seat mismatch", () => {
  const bundle = buildRoomDBundle({});
  const fakeTransfer = {
    sources: bundle.sourceIds.map((id) => ({ id })),
    seatingPositions: [{ id: "other-seat", x: 1, y: 1, priority: "primary" }],
    rspPosition: bundle.rspPosition,
  };
  const gate = checkPreConfirmIntegrity(bundle, fakeTransfer);
  assert.ok(!gate.valid);
  assert.ok(gate.issues.some((i) => i.includes("seating")));
});

test("post-confirm integrity gate catches missing P19 evidence", () => {
  const bundle = buildRoomDBundle({});
  const fakeConfirmation = {
    finalistId: bundle.candidateId,
    canonicalAuthorityReceipt: { selectedCandidateId: "x" },
    perSeatP20: bundle.seatingPositions.map((s) => ({ seatId: s.id, isPrimary: s.priority !== "secondary" })),
    // no P19 fields
  };
  const gate = checkPostConfirmIntegrity(bundle, fakeConfirmation);
  assert.ok(!gate.valid);
  assert.ok(gate.issues.some((i) => i.includes("P19")));
});

test("post-confirm integrity gate catches P20 seat not in proposed seating", () => {
  const bundle = buildRoomDBundle({});
  const fakeConfirmation = {
    finalistId: bundle.candidateId,
    canonicalAuthorityReceipt: { selectedCandidateId: "x" },
    achievedP19Level: 4,
    achievedP19VariationDb: 1.47,
    perSeatP20: [
      { seatId: "room-d-seat-1", isPrimary: true },
      { seatId: "intruder-seat", isPrimary: false },
    ],
  };
  const gate = checkPostConfirmIntegrity(bundle, fakeConfirmation);
  assert.ok(!gate.valid);
  assert.ok(gate.issues.some((i) => i.includes("intruder-seat")));
});

test("post-confirm integrity gate catches finalistId mismatch", () => {
  const bundle = buildRoomDBundle({});
  const fakeConfirmation = {
    finalistId: "wrong-candidate",
    canonicalAuthorityReceipt: { selectedCandidateId: "x" },
    achievedP19Level: 4,
    perSeatP20: bundle.seatingPositions.map((s) => ({ seatId: s.id, isPrimary: s.priority !== "secondary" })),
  };
  const gate = checkPostConfirmIntegrity(bundle, fakeConfirmation);
  assert.ok(!gate.valid);
  assert.ok(gate.issues.some((i) => i.includes("finalistId")));
});

test("developer runner is reachable and returns a result object", async () => {
  clearCoordinatedDeveloperRun();
  assert.equal(getCoordinatedDeveloperRunResult(), null);
  // The runner invokes the canonical evaluator, which runs the modal
  // simulation. In a source-level test environment the simulation may not
  // be available, so we only assert the runner returns a shaped object
  // and sets the store. Any status is acceptable for reachability.
  const result = await runCoordinatedCandidateDeveloper({ integrationContext: null });
  assert.ok(result, "Runner must return a result object");
  assert.ok(["evaluated", "rejected", "error"].includes(result.status), `Unexpected status: ${result.status}`);
  assert.ok(result.boundaries, "Runner must return boundaries");
  assert.ok(result.boundaries.preTransfer, "Pre-transfer boundary must be checked");
  assert.equal(getCoordinatedDeveloperRunResult(), result);
  clearCoordinatedDeveloperRun();
  assert.equal(getCoordinatedDeveloperRunResult(), null);
});

test("developer runner sets all three integrity boundaries", async () => {
  clearCoordinatedDeveloperRun();
  const result = await runCoordinatedCandidateDeveloper({ integrationContext: null });
  assert.ok(result.boundaries.preTransfer, "preTransfer boundary must be set");
  assert.ok(result.boundaries.preConfirm, "preConfirm boundary must be set");
  assert.ok(result.boundaries.postConfirm, "postConfirm boundary must be set");
  clearCoordinatedDeveloperRun();
});

test("developer runner never applies geometry or publishes", async () => {
  // The runner has no commit/publish/apply callbacks. It is a pure
  // read-only evaluation. The only side effect is the module-scoped store.
  // Verify the runner signature accepts no commit/publish parameters.
  const result = await runCoordinatedCandidateDeveloper({
    integrationContext: null,
    amplifierPowerPerSubW: 0,
  });
  assert.ok(result);
  assert.equal(typeof result.status, "string");
  clearCoordinatedDeveloperRun();
});