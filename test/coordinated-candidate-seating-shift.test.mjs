// coordinated-candidate-seating-shift.test.mjs
// Focused tests for the Room D coordinated-candidate seating shift.
// Verifies the −600 mm move is applied exactly once from the original saved
// rows (4.0 / 5.8 m) to the proposed rows (3.4 / 5.2 m), that the RSP resolves
// to (1.75, 3.4, 1.2), that seat identities and priorities are preserved, that
// an already-shifted saved layout is NOT shifted a second time, and that an
// unexpected saved seating geometry is rejected explicitly.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRoomDBundle,
  _buildRoomDSeating,
  ROOM_D_ORIGINAL_ROW_Y,
  ROOM_D_SHIFT_M,
  ROOM_DESIGNATED_SEAT_ID,
} from "../src/components/room/bass/improveBassV2/coordinatedCandidateFixture.js";

const round3 = (v) => Math.round(v * 1000) / 1000;

function makeSavedSeating(rowY) {
  // Two rows of 3 seats, laterally symmetric about the 1.75 m centreline,
  // matching the canonical Room D layout but at the caller-supplied row Y.
  const seats = [];
  let seatIndex = 0;
  for (let row = 0; row < rowY.length; row++) {
    for (const offset of [-0.8, 0, 0.8]) {
      seatIndex += 1;
      seats.push({
        id: `room-d-seat-${seatIndex}`,
        rowNumber: row + 1,
        priority: row === 0 ? "primary" : "secondary",
        x: 1.75 + offset,
        y: rowY[row],
        z: 1.2,
        earHeight: 1.2,
        platformHeight: 0.4,
      });
    }
  }
  return seats;
}

test("original rows 4.0 / 5.8 m become 3.4 / 5.2 m after a single shift", () => {
  const seats = _buildRoomDSeating();
  const primary = seats.filter((s) => s.priority === "primary");
  const secondary = seats.filter((s) => s.priority === "secondary");
  for (const s of primary) assert.equal(round3(s.y), 3.4);
  for (const s of secondary) assert.equal(round3(s.y), 5.2);
});

test("RSP resolves to (1.75, 3.4, 1.2) from the designated primary seat", () => {
  const bundle = buildRoomDBundle({});
  assert.equal(bundle.rspResolvedFromSeat, true);
  assert.equal(bundle.rspSeat.id, ROOM_DESIGNATED_SEAT_ID);
  assert.deepEqual(
    { x: round3(bundle.rspPosition.x), y: round3(bundle.rspPosition.y), z: round3(bundle.rspPosition.z) },
    { x: 1.75, y: 3.4, z: 1.2 },
  );
});

test("the −600 mm offset is applied exactly once (no double shift)", () => {
  // The original primary row is 4.0 m. A single −0.6 m shift lands at 3.4 m.
  // The old double-shift bug produced 2.8 m (4.0 − 0.6 − 0.6).
  const seats = _buildRoomDSeating();
  const frontCentre = seats.find((s) => s.id === "room-d-seat-2");
  assert.equal(round3(frontCentre.y), 3.4);
  assert.notEqual(round3(frontCentre.y), 2.8);
  // Confirm the shift magnitude against the canonical original.
  const original = ROOM_D_ORIGINAL_ROW_Y[0];
  assert.equal(round3(original - frontCentre.y), ROOM_D_SHIFT_M);
});

test("seat identities, row membership and priorities are unchanged by the shift", () => {
  const original = makeSavedSeating(ROOM_D_ORIGINAL_ROW_Y);
  const moved = _buildRoomDSeating(original);
  assert.equal(moved.length, original.length);
  for (let i = 0; i < original.length; i++) {
    assert.equal(moved[i].id, original[i].id);
    assert.equal(moved[i].rowNumber, original[i].rowNumber);
    assert.equal(moved[i].priority, original[i].priority);
    assert.equal(moved[i].x, original[i].x);
    assert.equal(moved[i].z, original[i].z);
    assert.equal(moved[i].earHeight, original[i].earHeight);
    assert.equal(moved[i].platformHeight, original[i].platformHeight);
    // Only y moved, by exactly −0.6 m.
    assert.equal(round3(original[i].y - moved[i].y), ROOM_D_SHIFT_M);
  }
});

test("an already-shifted saved layout is rejected, not shifted a second time", () => {
  const alreadyShifted = makeSavedSeating([3.4, 5.2]);
  assert.throws(
    () => _buildRoomDSeating(alreadyShifted),
    /input mismatch/i,
    "An already-shifted layout must be rejected with an input-mismatch error, not shifted again",
  );
});

test("unexpected saved seating geometry fails explicitly", () => {
  const wrong = makeSavedSeating([3.0, 6.0]);
  assert.throws(
    () => _buildRoomDSeating(wrong),
    /input mismatch/i,
    "A saved layout that does not match the original Room D rows must be rejected",
  );
  // The error message must name the expected rows so the failure is explicit.
  let caught = null;
  try { _buildRoomDSeating(wrong); } catch (err) { caught = err; }
  assert.ok(caught);
  assert.match(caught.message, /5\.8/);
  assert.match(caught.message, /original Room D rows/);
});

test("saved seating matching the original rows is accepted and shifted once", () => {
  const saved = makeSavedSeating(ROOM_D_ORIGINAL_ROW_Y);
  const moved = _buildRoomDSeating(saved);
  const frontCentre = moved.find((s) => s.id === "room-d-seat-2");
  assert.equal(round3(frontCentre.y), 3.4);
  const rearCentre = moved.find((s) => s.id === "room-d-seat-5");
  assert.equal(round3(rearCentre.y), 5.2);
});

test("the bundle preserves the four-sub geometry, alignment state and 95 Hz crossover", () => {
  const bundle = buildRoomDBundle({});
  assert.equal(bundle.quantity, 4);
  assert.equal(bundle.coordinates.length, 4);
  assert.equal(bundle.autoAlignEnabled, false);
  assert.equal(bundle.crossover.frequencyHz, 95);
  assert.equal(bundle.selectedSubModel, "sub3-12");
  assert.equal(bundle.subwooferBottomHeightM, 0.05);
});