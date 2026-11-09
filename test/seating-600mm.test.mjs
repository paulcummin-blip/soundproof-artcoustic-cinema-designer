// test/seating-600mm.test.mjs
// Source tests for the extended seating candidate generator (±600 mm).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  generateSeatingCandidates,
  getSearchOffsets,
  describeSeatingChange,
} from "../src/components/room/bass/improveBassV2/seatingPositionSearch.js";

const ROOM = { widthM: 3.5, lengthM: 8, heightM: 3 };
const SEATS = [
  { id: "s1", x: 1.75, y: 4.0, z: 1.2, priority: "primary" },
  { id: "s2", x: 1.75, y: 5.8, z: 1.2, priority: "secondary" },
];

describe("seating 600mm extension", () => {
  it("includes ±600 mm in the search offsets", () => {
    const offsets = getSearchOffsets();
    assert.ok(offsets.includes(-600), "Expected -600 in offsets");
    assert.ok(offsets.includes(600), "Expected +600 in offsets");
    assert.ok(offsets.includes(0), "Expected 0 in offsets");
  });

  it("generates a -600 mm candidate (toward screen) for Room D", () => {
    const candidates = generateSeatingCandidates(SEATS, ROOM, "front");
    const minus600 = candidates.find((c) => c.offsetMm === -600);
    assert.ok(minus600, "Expected a -600 mm candidate");
    assert.equal(minus600.direction, "toward screen");
    assert.equal(minus600.offsetM, -0.6);
  });

  it("preserves seat identities, priorities and heights for a 600 mm move", () => {
    const candidates = generateSeatingCandidates(SEATS, ROOM, "front");
    const minus600 = candidates.find((c) => c.offsetMm === -600);
    assert.ok(minus600.valid, `Expected -600 mm to be valid: ${minus600.rejectionReason}`);
    assert.equal(minus600.seatingPositions.length, 2);
    assert.equal(minus600.seatingPositions[0].id, "s1");
    assert.equal(minus600.seatingPositions[0].priority, "primary");
    assert.equal(minus600.seatingPositions[0].z, 1.2);
    // The seat moved 600 mm toward screen: Y = 4.0 - 0.6 = 3.4
    assert.ok(Math.abs(minus600.seatingPositions[0].y - 3.4) < 1e-9);
  });

  it("rejects a -600 mm candidate that would place a seat too close to the screen", () => {
    const closeSeats = [
      { id: "s1", x: 1.75, y: 1.2, z: 1.2, priority: "primary" },
    ];
    const candidates = generateSeatingCandidates(closeSeats, ROOM, "front");
    const minus600 = candidates.find((c) => c.offsetMm === -600);
    assert.ok(!minus600.valid, "Expected -600 mm to be rejected for a seat already near the screen");
    assert.ok(minus600.rejectionReason);
  });

  it("describes the 600 mm forward move correctly", () => {
    const desc = describeSeatingChange(-600);
    assert.ok(desc.includes("600"));
    assert.ok(desc.includes("toward screen"));
  });

  it("does not remove the existing ±500 mm range", () => {
    const offsets = getSearchOffsets();
    for (const expected of [-500, -400, -300, -200, -100, 0, 100, 200, 300, 400, 500]) {
      assert.ok(offsets.includes(expected), `Expected ${expected} in offsets`);
    }
  });
});