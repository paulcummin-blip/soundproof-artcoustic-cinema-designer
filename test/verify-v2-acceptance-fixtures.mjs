// verify-v2-acceptance-fixtures.mjs
// Validates Room B/C acceptance fixtures for V2 safety suite compatibility.
// Checks that fixtures with per-seat P19/P20 data include isPrimary on every entry.
//
// Run: node --test test/verify-v2-acceptance-fixtures.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FIXTURE_DIR = path.resolve("experiments/improve-bass-v2");

function loadFixtures() {
  const files = fs.readdirSync(FIXTURE_DIR).filter(
    (f) => f.startsWith("room-") && f.endsWith(".json"),
  );
  const fixtures = [];
  for (const file of files) {
    const fullPath = path.join(FIXTURE_DIR, file);
    const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    fixtures.push({ file, data });
  }
  return fixtures;
}

function collectPerSeatArrays(data) {
  const results = [];
  const visit = (obj, location) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj.perSeatP19)) {
      results.push({ location: location + ".perSeatP19", arr: obj.perSeatP19 });
    }
    if (Array.isArray(obj.perSeatP20)) {
      results.push({ location: location + ".perSeatP20", arr: obj.perSeatP20 });
    }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
        visit(obj[key], location ? location + "." + key : key);
      }
    }
  };
  visit(data, "");
  return results;
}

test("All Room B/C fixtures with per-seat P19/P20 have isPrimary on every entry", () => {
  const fixtures = loadFixtures();
  assert.ok(fixtures.length > 0, "No fixtures found");

  let checkedEntries = 0;
  let fixturesWithPerSeat = 0;
  const missing = [];

  for (const { file, data } of fixtures) {
    const perSeatArrays = collectPerSeatArrays(data);
    if (perSeatArrays.length > 0) fixturesWithPerSeat++;

    for (const { location, arr } of perSeatArrays) {
      for (let i = 0; i < arr.length; i++) {
        checkedEntries++;
        if (!("isPrimary" in arr[i])) {
          missing.push(`${file}:${location}[${i}] (seatId=${arr[i].seatId})`);
        }
      }
    }
  }

  assert.ok(
    fixturesWithPerSeat > 0,
    "At least one fixture must have per-seat P19/P20 data",
  );
  assert.ok(
    missing.length === 0,
    `Missing isPrimary in ${missing.length} entries:\n${missing.slice(0, 10).join("\n")}`,
  );
});

test("Room B and Room C each have at least one fixture with complete per-seat data", () => {
  const fixtures = loadFixtures();
  const roomBHasPerSeat = fixtures.some(({ file, data }) => {
    if (!file.startsWith("room-b-")) return false;
    return collectPerSeatArrays(data).length > 0;
  });
  const roomCHasPerSeat = fixtures.some(({ file, data }) => {
    if (!file.startsWith("room-c-")) return false;
    return collectPerSeatArrays(data).length > 0;
  });
  assert.ok(roomBHasPerSeat, "Room B must have at least one fixture with per-seat data");
  assert.ok(roomCHasPerSeat, "Room C must have at least one fixture with per-seat data");
});

test("isPrimary values match seat priority from geometry", () => {
  const fixtures = loadFixtures();
  let verified = 0;
  for (const { file, data } of fixtures) {
    const seats = data.geometry?.seatingPositions || [];
    if (seats.length === 0) continue;
    const seatPriorityMap = new Map();
    for (const seat of seats) {
      seatPriorityMap.set(seat.id, seat.priority === "primary");
    }
    const perSeatArrays = collectPerSeatArrays(data);
    for (const { arr } of perSeatArrays) {
      for (const entry of arr) {
        if ("isPrimary" in entry) {
          const expected = seatPriorityMap.get(entry.seatId);
          if (expected !== undefined) {
            assert.equal(
              entry.isPrimary,
              expected,
              `${file}: seatId=${entry.seatId} isPrimary=${entry.isPrimary} but priority says ${expected}`,
            );
            verified++;
          }
        }
      }
    }
  }
  assert.ok(verified > 0, "At least one isPrimary value must be verified against geometry");
});