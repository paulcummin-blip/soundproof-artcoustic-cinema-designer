// coordinated-rsp-authority.test.mjs
// Tests for the Phase 9B coordinated RSP authority validation.
//
// Tests:
//   1. Seat-bound RSP with a valid designated seat → valid, RSP follows seat
//   2. Manual-position RSP without a designated seat → valid, RSP is free-floating
//   3. Seat-bound RSP with a missing designated seat ID → invalid
//   4. Seat-bound RSP with an invalid (non-existent) designated seat ID → invalid
//   5. Seat-bound RSP where the engine RSP was resolved from a different seat → invalid
//   6. RSP with a stale designatedRspSeatId that doesn't match the seating → invalid
//   7. attachRspAuthority records the mode, seat ID and actual XYZ

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCoordinatedRspAuthority,
  attachRspAuthority,
} from "../src/components/room/bass/improveBassV2/coordinatedRspAuthority.js";

const SEATS = [
  { id: "seat-r1-c1", x: 1.15, y: 4.0, z: 1.2, priority: "primary" },
  { id: "seat-r1-c2", x: 1.75, y: 4.0, z: 1.2, priority: "primary" },
  { id: "seat-r1-c3", x: 2.35, y: 4.0, z: 1.2, priority: "primary" },
  { id: "seat-r2-c1", x: 1.15, y: 5.8, z: 1.7, priority: "secondary" },
  { id: "seat-r2-c2", x: 1.75, y: 5.8, z: 1.7, priority: "secondary" },
  { id: "seat-r2-c3", x: 2.35, y: 5.8, z: 1.7, priority: "secondary" },
];

const SEAT_BOUND_RSP = {
  id: "rsp",
  x: 1.75,
  y: 4.0,
  z: 1.2,
  designatedRspSeatId: "seat-r1-c2",
  __isSyntheticRsp: true,
};

const MANUAL_RSP = {
  id: "rsp",
  x: 0,
  y: 4.6,
  z: 1.2,
  designatedRspSeatId: null,
  __isSyntheticRsp: true,
};

test("seat_bound with valid designated seat — valid", () => {
  const result = validateCoordinatedRspAuthority({
    rspMode: "seat_bound",
    designatedRspSeatId: "seat-r1-c2",
    seatingPositions: SEATS,
    rspPosition: SEAT_BOUND_RSP,
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.designatedRspSeatId, "seat-r1-c2");
});

test("manual_position without designated seat — valid", () => {
  const result = validateCoordinatedRspAuthority({
    rspMode: "manual_position",
    designatedRspSeatId: null,
    seatingPositions: SEATS,
    rspPosition: MANUAL_RSP,
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.designatedRspSeatId, null);
});

test("seat_bound with missing designated seat ID — invalid", () => {
  const result = validateCoordinatedRspAuthority({
    rspMode: "seat_bound",
    designatedRspSeatId: null,
    seatingPositions: SEATS,
    rspPosition: MANUAL_RSP,
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.includes("designated_rsp_seat_id is missing")));
});

test("seat_bound with non-existent designated seat ID — invalid", () => {
  const result = validateCoordinatedRspAuthority({
    rspMode: "seat_bound",
    designatedRspSeatId: "seat-r9-c1",
    seatingPositions: SEATS,
    rspPosition: { ...SEAT_BOUND_RSP, designatedRspSeatId: "seat-r9-c1" },
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.includes("not in the seating layout")));
});

test("seat_bound where engine RSP resolved from a different seat — invalid", () => {
  const result = validateCoordinatedRspAuthority({
    rspMode: "seat_bound",
    designatedRspSeatId: "seat-r1-c2",
    seatingPositions: SEATS,
    rspPosition: { ...SEAT_BOUND_RSP, designatedRspSeatId: "seat-r1-c1" },
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.includes("resolved from a different seat")));
});

test("RSP with stale designatedRspSeatId not in seating — invalid", () => {
  const result = validateCoordinatedRspAuthority({
    rspMode: "manual_position",
    designatedRspSeatId: null,
    seatingPositions: SEATS,
    rspPosition: { ...MANUAL_RSP, designatedRspSeatId: "seat-old-removed" },
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.includes("not in the seating layout")));
});

test("attachRspAuthority records mode, seat ID and actual XYZ", () => {
  const authority = validateCoordinatedRspAuthority({
    rspMode: "seat_bound",
    designatedRspSeatId: "seat-r1-c2",
    seatingPositions: SEATS,
    rspPosition: SEAT_BOUND_RSP,
  });
  assert.equal(authority.valid, true);

  const result = { candidateId: "test" };
  attachRspAuthority(result, authority, -600);

  assert.equal(result.rspAuthority.rspMode, "seat_bound");
  assert.equal(result.rspAuthority.designatedRspSeatId, "seat-r1-c2");
  // The evaluated RSP Y is the original (4.0) + offset (-0.6) = 3.4
  assert.equal(result.rspAuthority.evaluatedRspPosition.y, 3.4);
  assert.equal(result.rspAuthority.evaluatedRspPosition.x, 1.75);
  assert.equal(result.rspAuthority.evaluatedRspPosition.z, 1.2);
});

test("attachRspAuthority for manual mode — translated RSP", () => {
  const authority = validateCoordinatedRspAuthority({
    rspMode: "manual_position",
    designatedRspSeatId: null,
    seatingPositions: SEATS,
    rspPosition: MANUAL_RSP,
  });
  assert.equal(authority.valid, true);

  const result = { candidateId: "test" };
  attachRspAuthority(result, authority, -600);

  assert.equal(result.rspAuthority.rspMode, "manual_position");
  assert.equal(result.rspAuthority.designatedRspSeatId, null);
  // The evaluated RSP Y is the manual (4.6) + offset (-0.6) = 4.0
  assert.ok(Math.abs(result.rspAuthority.evaluatedRspPosition.y - 4.0) < 1e-6,
    `expected ~4.0, got ${result.rspAuthority.evaluatedRspPosition.y}`);
  assert.equal(result.rspAuthority.evaluatedRspPosition.x, 0);
});

test("non-finite RSP position — invalid", () => {
  const result = validateCoordinatedRspAuthority({
    rspMode: "manual_position",
    designatedRspSeatId: null,
    seatingPositions: SEATS,
    rspPosition: { x: NaN, y: 4.6, z: 1.2 },
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.includes("non-finite")));
});