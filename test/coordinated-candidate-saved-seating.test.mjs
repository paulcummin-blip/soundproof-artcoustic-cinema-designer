// coordinated-candidate-saved-seating.test.mjs
// Focused tests for wiring the actual saved Room D seating into the developer
// Run-once handler. Verifies the strict reference validation, field
// preservation (only Y moves), RSP following the moved designated seat, and
// that missing/incorrect live seating fails explicitly rather than falling
// back to synthetic listeners.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRoomDBundle,
  _buildRoomDSeating,
  validateRoomDSavedSeatingReference,
  resolveRoomDDesignatedSeatId,
  ROOM_D_EXPECTED_SEAT_IDS,
  ROOM_D_EXPECTED_X_POSITIONS,
  ROOM_D_EXPECTED_FRONT_EAR_HEIGHT_M,
  ROOM_D_EXPECTED_REAR_EAR_HEIGHT_M,
  ROOM_D_SHIFT_M,
} from "../src/components/room/bass/improveBassV2/coordinatedCandidateFixture.js";

const round3 = (v) => Math.round(v * 1000) / 1000;

// The accepted Room D saved seating: seat-r1-c1..seat-r2-c3, X 1.15/1.75/2.35,
// front row Y 4.0 at 1.2 m ear height, rear row Y 5.8 at 1.7 m ear height.
function makeRoomDSavedSeating() {
  const rows = [
    { rowNumber: 1, y: 4.0, z: 1.2, priority: "primary" },
    { rowNumber: 2, y: 5.8, z: 1.7, priority: "secondary" },
  ];
  const seats = [];
  for (const row of rows) {
    for (let c = 1; c <= 3; c++) {
      seats.push({
        id: `seat-r${row.rowNumber}-c${c}`,
        rowNumber: row.rowNumber,
        priority: row.priority,
        x: ROOM_D_EXPECTED_X_POSITIONS[c - 1],
        y: row.y,
        z: row.z,
        earHeight: row.z,
        platformHeight: 0.4,
      });
    }
  }
  return seats;
}

test("validateRoomDSavedSeatingReference accepts the exact Room D saved seating", () => {
  const ref = validateRoomDSavedSeatingReference(makeRoomDSavedSeating());
  assert.ok(ref.valid, `Expected valid: ${JSON.stringify(ref.issues)}`);
  assert.equal(ref.summary.seatCount, 6);
  assert.deepEqual(ref.summary.seatIds, ROOM_D_EXPECTED_SEAT_IDS);
  assert.deepEqual(ref.summary.xPositions, [1.15, 1.75, 2.35]);
  assert.equal(ref.summary.frontEarHeight, ROOM_D_EXPECTED_FRONT_EAR_HEIGHT_M);
  assert.equal(ref.summary.rearEarHeight, ROOM_D_EXPECTED_REAR_EAR_HEIGHT_M);
});

test("validateRoomDSavedSeatingReference rejects missing seating explicitly", () => {
  const ref = validateRoomDSavedSeatingReference(null);
  assert.ok(!ref.valid);
  assert.ok(ref.issues.some((i) => /No saved seating/i.test(i)));
});

test("validateRoomDSavedSeatingReference rejects wrong seat count", () => {
  const seats = makeRoomDSavedSeating().slice(0, 3);
  const ref = validateRoomDSavedSeatingReference(seats);
  assert.ok(!ref.valid);
  assert.ok(ref.issues.some((i) => /6 saved seats/i.test(i)));
});

test("validateRoomDSavedSeatingReference rejects wrong X positions", () => {
  const seats = makeRoomDSavedSeating();
  seats[0].x = 0.95; // wrong lateral position
  const ref = validateRoomDSavedSeatingReference(seats);
  assert.ok(!ref.valid);
  assert.ok(ref.issues.some((i) => /X positions/i.test(i)));
});

test("validateRoomDSavedSeatingReference rejects wrong rear-row ear height", () => {
  const seats = makeRoomDSavedSeating();
  seats[3].z = 1.2; // rear row should be 1.7
  const ref = validateRoomDSavedSeatingReference(seats);
  assert.ok(!ref.valid);
  assert.ok(ref.issues.some((i) => /Rear-row ear height/i.test(i)));
});

test("resolveRoomDDesignatedSeatId returns seat-r1-c2 (front-row centre)", () => {
  const id = resolveRoomDDesignatedSeatId(makeRoomDSavedSeating());
  assert.equal(id, "seat-r1-c2");
});

test("buildRoomDBundle uses the saved seat identities and designated seat when savedSeating is supplied", () => {
  const bundle = buildRoomDBundle({ savedSeating: makeRoomDSavedSeating() });
  assert.equal(bundle.seatingPositions.length, 6);
  assert.deepEqual(
    bundle.seatingPositions.map((s) => s.id),
    ROOM_D_EXPECTED_SEAT_IDS,
  );
  assert.equal(bundle.designatedSeatId, "seat-r1-c2");
  assert.ok(bundle.rspResolvedFromSeat, "RSP must resolve from the saved designated seat");
  assert.equal(bundle.rspSeat.id, "seat-r1-c2");
});

test("only Y moves — X, Z, ear height, row membership and priority are preserved", () => {
  const saved = makeRoomDSavedSeating();
  const moved = _buildRoomDSeating(saved);
  assert.equal(moved.length, saved.length);
  for (let i = 0; i < saved.length; i++) {
    assert.equal(moved[i].id, saved[i].id, `id preserved for ${saved[i].id}`);
    assert.equal(moved[i].x, saved[i].x, `x preserved for ${saved[i].id}`);
    assert.equal(moved[i].z, saved[i].z, `z preserved for ${saved[i].id}`);
    assert.equal(moved[i].earHeight, saved[i].earHeight, `earHeight preserved for ${saved[i].id}`);
    assert.equal(moved[i].rowNumber, saved[i].rowNumber, `rowNumber preserved for ${saved[i].id}`);
    assert.equal(moved[i].priority, saved[i].priority, `priority preserved for ${saved[i].id}`);
    assert.equal(round3(saved[i].y - moved[i].y), ROOM_D_SHIFT_M, `only Y moved by -0.6 m for ${saved[i].id}`);
  }
});

test("proposed RSP follows the moved designated seat to (1.75, 3.4, 1.2)", () => {
  const bundle = buildRoomDBundle({ savedSeating: makeRoomDSavedSeating() });
  assert.deepEqual(
    { x: round3(bundle.rspPosition.x), y: round3(bundle.rspPosition.y), z: round3(bundle.rspPosition.z) },
    { x: 1.75, y: 3.4, z: 1.2 },
  );
});

test("synthetic fallback is not used when saved seating is supplied — no room-d-seat-* identities", () => {
  const bundle = buildRoomDBundle({ savedSeating: makeRoomDSavedSeating() });
  const synthetic = bundle.seatingPositions.some((s) => /room-d-seat-/.test(s.id));
  assert.ok(!synthetic, "No synthetic room-d-seat-* identities should be present");
  assert.equal(bundle.designatedSeatId, "seat-r1-c2");
});

test("synthetic fallback still works when no savedSeating is supplied (unit-test path)", () => {
  const bundle = buildRoomDBundle({});
  assert.equal(bundle.designatedSeatId, "room-d-seat-2");
  assert.ok(bundle.seatingPositions.some((s) => /room-d-seat-/.test(s.id)));
});

test("four-sub geometry, auto-align OFF and 95 Hz crossover are preserved with saved seating", () => {
  const bundle = buildRoomDBundle({ savedSeating: makeRoomDSavedSeating() });
  assert.equal(bundle.quantity, 4);
  assert.equal(bundle.coordinates.length, 4);
  assert.equal(bundle.autoAlignEnabled, false);
  assert.equal(bundle.crossover.frequencyHz, 95);
  assert.equal(bundle.subwooferBottomHeightM, 0.05);
  assert.equal(bundle.selectedSubModel, "sub3-12");
});