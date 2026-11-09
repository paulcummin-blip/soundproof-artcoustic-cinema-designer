// test/coordinated-candidate-bundle.test.mjs
// Source tests for the coordinated candidate bundle: building, validation,
// Stage 2 finalist conversion, and identity integrity.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildCoordinatedCandidateBundle,
  validateCoordinatedCandidateBundle,
  bundleToStage2Finalist,
} from "../src/components/room/bass/improveBassV2/coordinatedCandidateBundle.js";

// Room D known geometry
const ROOM_D = {
  roomDims: { widthM: 3.5, lengthM: 8, heightM: 3 },
  coordinates: [
    { x: 0.665, y: 0.1375 },
    { x: 2.835, y: 0.1375 },
    { x: 0.665, y: 7.8625 },
    { x: 2.835, y: 7.8625 },
  ],
  selectedSubModel: "sub3-12",
  subwooferBottomHeightM: 0.05,
  quantity: 4,
};

// Proposed seating: two rows moved 600mm forward, primary row at Y=3.4
const PROPOSED_SEATS = [
  { id: "seat-1", x: 1.75, y: 3.4, z: 1.2, priority: "primary", rowNumber: 1 },
  { id: "seat-2", x: 0.875, y: 3.4, z: 1.2, priority: "primary", rowNumber: 1 },
  { id: "seat-3", x: 2.625, y: 3.4, z: 1.2, priority: "primary", rowNumber: 1 },
  { id: "seat-4", x: 1.75, y: 5.2, z: 1.2, priority: "secondary", rowNumber: 2 },
  { id: "seat-5", x: 0.875, y: 5.2, z: 1.2, priority: "secondary", rowNumber: 2 },
  { id: "seat-6", x: 2.625, y: 5.2, z: 1.2, priority: "secondary", rowNumber: 2 },
];

describe("coordinated candidate bundle — Room D", () => {
  it("builds a bundle with candidate-owned source IDs for 4 SUB3-12 cabinets", () => {
    const bundle = buildCoordinatedCandidateBundle({
      candidateId: "room-d-4sub-600mm",
      quantity: ROOM_D.quantity,
      coordinates: ROOM_D.coordinates,
      selectedSubModel: ROOM_D.selectedSubModel,
      subwooferBottomHeightM: ROOM_D.subwooferBottomHeightM,
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      roomWidthM: ROOM_D.roomDims.widthM,
      crossover: { frequencyHz: 95, linkFrequencies: true },
      autoAlignEnabled: false,
      responseBasis: "combined-lcr-sub",
      p14Target: { p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117, p18TargetBasis: "minimum" },
    });

    assert.equal(bundle.candidateId, "room-d-4sub-600mm");
    assert.equal(bundle.quantity, 4);
    assert.equal(bundle.sourceIds.length, 4);
    assert.equal(new Set(bundle.sourceIds).size, 4, "source IDs must be unique");
    assert.equal(bundle.instances.length, 4);
    assert.equal(bundle.coordinates.length, 4);
    assert.equal(bundle.designatedSeatId, "seat-1");
    assert.equal(bundle.rspResolvedFromSeat, true);
    assert.deepEqual(bundle.rspPosition, { x: 1.75, y: 3.4, z: 1.2 });
  });

  it("preserves seat identities, row membership, priorities and heights", () => {
    const bundle = buildCoordinatedCandidateBundle({
      candidateId: "room-d-4sub-600mm",
      quantity: ROOM_D.quantity,
      coordinates: ROOM_D.coordinates,
      selectedSubModel: ROOM_D.selectedSubModel,
      subwooferBottomHeightM: ROOM_D.subwooferBottomHeightM,
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      roomWidthM: ROOM_D.roomDims.widthM,
      p14Target: { p14TargetDb: 117 },
    });

    assert.equal(bundle.seatingPositions.length, 6);
    assert.equal(bundle.seatingPositions[0].id, "seat-1");
    assert.equal(bundle.seatingPositions[0].priority, "primary");
    assert.equal(bundle.seatingPositions[0].rowNumber, 1);
    assert.equal(bundle.seatingPositions[3].priority, "secondary");
    assert.equal(bundle.seatingPositions[3].rowNumber, 2);
  });

  it("resolves RSP from the designated seat, not by translating stored RSP", () => {
    const bundle = buildCoordinatedCandidateBundle({
      candidateId: "room-d-4sub-600mm",
      quantity: ROOM_D.quantity,
      coordinates: ROOM_D.coordinates,
      selectedSubModel: ROOM_D.selectedSubModel,
      subwooferBottomHeightM: ROOM_D.subwooferBottomHeightM,
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      roomWidthM: ROOM_D.roomDims.widthM,
      p14Target: { p14TargetDb: 117 },
    });

    assert.equal(bundle.rspResolvedFromSeat, true);
    assert.equal(bundle.rspSeat.id, "seat-1");
    assert.equal(bundle.rspPosition.x, 1.75);
    assert.equal(bundle.rspPosition.y, 3.4);
    assert.equal(bundle.rspPosition.z, 1.2);
  });

  it("validates a complete Room D bundle as valid", () => {
    const bundle = buildCoordinatedCandidateBundle({
      candidateId: "room-d-4sub-600mm",
      quantity: ROOM_D.quantity,
      coordinates: ROOM_D.coordinates,
      selectedSubModel: ROOM_D.selectedSubModel,
      subwooferBottomHeightM: ROOM_D.subwooferBottomHeightM,
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      roomWidthM: ROOM_D.roomDims.widthM,
      crossover: { frequencyHz: 95, linkFrequencies: true },
      responseBasis: "combined-lcr-sub",
      p14Target: { p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117, p18TargetBasis: "minimum" },
    });

    const result = validateCoordinatedCandidateBundle(bundle);
    assert.equal(result.valid, true, `Expected valid, issues: ${result.issues.join("; ")}`);
    assert.equal(result.issues.length, 0);
  });

  it("rejects a bundle with mismatched coordinates count", () => {
    const bundle = buildCoordinatedCandidateBundle({
      candidateId: "bad-bundle",
      quantity: 4,
      coordinates: [{ x: 0.665, y: 0.1375 }, { x: 2.835, y: 0.1375 }],
      selectedSubModel: ROOM_D.selectedSubModel,
      subwooferBottomHeightM: ROOM_D.subwooferBottomHeightM,
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      roomWidthM: ROOM_D.roomDims.widthM,
      p14Target: { p14TargetDb: 117 },
    });

    const result = validateCoordinatedCandidateBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes("Coordinates count")));
  });

  it("rejects a bundle whose designated seat is not in proposed seating", () => {
    const bundle = buildCoordinatedCandidateBundle({
      candidateId: "bad-bundle",
      quantity: ROOM_D.quantity,
      coordinates: ROOM_D.coordinates,
      selectedSubModel: ROOM_D.selectedSubModel,
      subwooferBottomHeightM: ROOM_D.subwooferBottomHeightM,
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "nonexistent-seat",
      roomWidthM: ROOM_D.roomDims.widthM,
      p14Target: { p14TargetDb: 117 },
    });

    const result = validateCoordinatedCandidateBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes("Designated seat") && i.includes("not found")));
  });

  it("rejects a combined-lcr-sub bundle without a crossover", () => {
    const bundle = buildCoordinatedCandidateBundle({
      candidateId: "bad-bundle",
      quantity: ROOM_D.quantity,
      coordinates: ROOM_D.coordinates,
      selectedSubModel: ROOM_D.selectedSubModel,
      subwooferBottomHeightM: ROOM_D.subwooferBottomHeightM,
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      roomWidthM: ROOM_D.roomDims.widthM,
      responseBasis: "combined-lcr-sub",
      crossover: null,
      p14Target: { p14TargetDb: 117 },
    });

    const result = validateCoordinatedCandidateBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes("crossover")));
  });

  it("rejects a bundle with no P14 target", () => {
    const bundle = buildCoordinatedCandidateBundle({
      candidateId: "bad-bundle",
      quantity: ROOM_D.quantity,
      coordinates: ROOM_D.coordinates,
      selectedSubModel: ROOM_D.selectedSubModel,
      subwooferBottomHeightM: ROOM_D.subwooferBottomHeightM,
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      roomWidthM: ROOM_D.roomDims.widthM,
      p14Target: null,
    });

    const result = validateCoordinatedCandidateBundle(bundle);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes("P14 target")));
  });

  it("converts the bundle to a Stage 2 finalist with cabinet_centre coordinates", () => {
    const bundle = buildCoordinatedCandidateBundle({
      candidateId: "room-d-4sub-600mm",
      quantity: ROOM_D.quantity,
      coordinates: ROOM_D.coordinates,
      selectedSubModel: ROOM_D.selectedSubModel,
      subwooferBottomHeightM: ROOM_D.subwooferBottomHeightM,
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      roomWidthM: ROOM_D.roomDims.widthM,
      p14Target: { p14TargetDb: 117 },
    });

    const finalist = bundleToStage2Finalist(bundle, ROOM_D.roomDims);
    assert.equal(finalist.id, "room-d-4sub-600mm");
    assert.equal(finalist.familyId, "coordinated-candidate");
    assert.equal(finalist.sources.length, 4);
    assert.equal(finalist.sources[0].coordinateSpace, "cabinet_centre");
    // Verify normalised coordinates round-trip back to the physical coordinates
    const W = ROOM_D.roomDims.widthM;
    const L = ROOM_D.roomDims.lengthM;
    assert.ok(Math.abs(finalist.sources[0].xNorm * W - ROOM_D.coordinates[0].x) < 1e-9);
    assert.ok(Math.abs(finalist.sources[0].yNorm * L - ROOM_D.coordinates[0].y) < 1e-9);
  });

  it("does not substitute installed source identities for candidate-owned identities", () => {
    const bundle = buildCoordinatedCandidateBundle({
      candidateId: "room-d-4sub-600mm",
      quantity: ROOM_D.quantity,
      coordinates: ROOM_D.coordinates,
      selectedSubModel: ROOM_D.selectedSubModel,
      subwooferBottomHeightM: ROOM_D.subwooferBottomHeightM,
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      roomWidthM: ROOM_D.roomDims.widthM,
      p14Target: { p14TargetDb: 117 },
    });

    // All source IDs must start with the candidate-owned prefix, never an
    // installed instance ID
    for (const id of bundle.sourceIds) {
      assert.ok(id.startsWith("coord-room-d-4sub-600mm-src-"), `Expected candidate-owned ID, got ${id}`);
    }
  });
});