// test/coordinated-candidate-rsp.test.mjs
// Source tests for the proposed RSP resolution from the designated seat.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveProposedRspFromSeat,
  designatedSeatExists,
} from "../src/components/room/bass/improveBassV2/coordinatedCandidateRsp.js";

const PROPOSED_SEATS = [
  { id: "seat-1", x: 1.75, y: 3.4, z: 1.2, priority: "primary" },
  { id: "seat-2", x: 0.875, y: 3.4, z: 1.2, priority: "primary" },
  { id: "seat-3", x: 2.625, y: 3.4, z: 1.2, priority: "primary" },
  { id: "seat-4", x: 1.75, y: 5.2, z: 1.2, priority: "secondary" },
];

describe("coordinated candidate RSP — Room D", () => {
  it("resolves RSP from the designated primary seat's exact coordinates", () => {
    const result = resolveProposedRspFromSeat({
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      roomWidthM: 3.5,
    });

    assert.equal(result.resolvedFromSeat, true);
    assert.equal(result.designatedSeatId, "seat-1");
    assert.equal(result.seat.id, "seat-1");
    assert.deepEqual(result.rspPosition, { x: 1.75, y: 3.4, z: 1.2 });
  });

  it("preserves the exact seat ID and coordinates in the identity", () => {
    const result = resolveProposedRspFromSeat({
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-2",
      roomWidthM: 3.5,
    });

    assert.equal(result.seat.id, "seat-2");
    assert.equal(result.rspPosition.x, 0.875);
    assert.equal(result.rspPosition.y, 3.4);
  });

  it("does not merely translate the stored RSP independently", () => {
    // The RSP must come from the SEAT, not from a fallback RSP that was
    // translated by the seating offset. Pass a fallback that would produce
    // a different result if it were used.
    const result = resolveProposedRspFromSeat({
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "seat-1",
      fallbackRsp: { x: 9.99, y: 9.99, z: 9.99 },
      roomWidthM: 3.5,
    });

    assert.equal(result.resolvedFromSeat, true);
    assert.deepEqual(result.rspPosition, { x: 1.75, y: 3.4, z: 1.2 });
  });

  it("falls back to centreline + first primary seat Y when designated seat is missing", () => {
    const result = resolveProposedRspFromSeat({
      seatingPositions: PROPOSED_SEATS,
      designatedSeatId: "nonexistent",
      fallbackRsp: { x: null, y: 3.4, z: 1.2 },
      roomWidthM: 3.5,
    });

    assert.equal(result.resolvedFromSeat, false);
    assert.equal(result.seat, null);
    assert.equal(result.rspPosition.x, 1.75); // centreline
    assert.equal(result.rspPosition.y, 3.4); // fallback Y
  });

  it("confirms the designated seat exists in the proposed seating", () => {
    assert.equal(designatedSeatExists(PROPOSED_SEATS, "seat-1"), true);
    assert.equal(designatedSeatExists(PROPOSED_SEATS, "nonexistent"), false);
    assert.equal(designatedSeatExists([], "seat-1"), false);
    assert.equal(designatedSeatExists(PROPOSED_SEATS, null), false);
  });
});