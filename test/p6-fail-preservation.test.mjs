// p6-fail-preservation.test.mjs
// Tests that the Visual Report seat-level normalisers preserve valid FAIL
// results (both numeric 0 and string "FAIL") and never convert them to
// null / "—".  This is the shared formatter used by P4/P6/P10 (Best
// Listening Area), P16/P17 (Timbre Consistency), P9 (Overhead), and
// P1 (Recommended Seating Position).
//
// Run: node --import ./test/_alias-register.mjs --test test/p6-fail-preservation.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

// Import the selectors — they export the normaliser indirectly via the
// public selector function.  We exercise the normaliser through the
// selector by feeding a mock analysisResult with perSeatRp22 entries.
const { selectClientBestListeningArea } = await import(
  "../src/components/report/client/selectClientBestListeningArea.js"
);
const { selectClientTimbreConsistency } = await import(
  "../src/components/report/client/selectClientTimbreConsistency.js"
);
const { selectClientP9Overhead } = await import(
  "../src/components/report/client/selectClientP9Overhead.js"
);
const { selectClientRecommendedSeatingPosition } = await import(
  "../src/components/report/client/selectClientRecommendedSeatingPosition.js"
);

// ── Helpers ──

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `seat-${i + 1}`,
    x: 1 + i * 0.5,
    y: 3,
    isPrimary: i === 0,
  }));
}

// Build a perSeatRp22 structure where each seat has the given level for the
// specified parameter ids.  level can be 0 (numeric FAIL), "FAIL", 1-4, "L1"-"L4".
function makePerSeatRp22(seats, paramLevels) {
  const perSeat = {};
  for (const seat of seats) {
    const rp22 = {};
    for (const [pid, level] of Object.entries(paramLevels)) {
      const isFail = level === 0 || String(level).toUpperCase() === "FAIL";
      rp22[pid] = {
        level,
        value: isFail ? null : 5.0,
        valueM: pid === "1" ? 1.2 : undefined,
        status: isFail ? "fail" : "ok",
        applicable: true,
        formatted: isFail ? "FAIL" : "5.0 dB",
      };
    }
    perSeat[seat.id] = { rp22, isPrimary: seat.isPrimary };
  }
  return perSeat;
}

// ── P4/P6/P10 (Best Listening Area) ──

test("P6 numeric 0 FAIL is preserved as 'FAIL' (not dropped to null/—)", () => {
  const seats = makeSeats(5);
  // Simulate the reported project: P6 = FAIL / L2 / L4 / L2 / FAIL
  const p6Levels = ["0", 2, 4, 2, "0"]; // numeric 0 = FAIL
  const perSeat = {};
  for (let i = 0; i < seats.length; i++) {
    const isFail = p6Levels[i] === 0 || p6Levels[i] === "0";
    perSeat[seats[i].id] = {
      rp22: {
        4: { level: 2, value: 5, status: "ok", applicable: true },
        6: { level: p6Levels[i] === "0" ? 0 : p6Levels[i], value: isFail ? null : 5, status: isFail ? "fail" : "ok", applicable: true },
        10: { level: 2, value: 5, status: "ok", applicable: true },
      },
      isPrimary: i === 0,
    };
  }
  const analysisResult = { perSeatRp22: perSeat };
  const result = selectClientBestListeningArea({ analysisResult, seatingPositions: seats, rsp: { x: 2, y: 3 } });
  const p6Values = result.seats.map((s) => s.p6Level);
  assert.deepEqual(p6Values, ["FAIL", "L2", "L4", "L2", "FAIL"],
    `Expected FAIL/L2/L4/L2/FAIL, got ${JSON.stringify(p6Values)}`);
});

test("P6 string 'FAIL' is preserved", () => {
  const seats = makeSeats(3);
  const perSeat = {};
  for (let i = 0; i < seats.length; i++) {
    const isFail = i === 0 || i === 2;
    perSeat[seats[i].id] = {
      rp22: {
        4: { level: 2, value: 5, status: "ok", applicable: true },
        6: { level: isFail ? "FAIL" : 2, value: isFail ? null : 5, status: isFail ? "fail" : "ok", applicable: true },
        10: { level: 2, value: 5, status: "ok", applicable: true },
      },
      isPrimary: i === 0,
    };
  }
  const result = selectClientBestListeningArea({
    analysisResult: { perSeatRp22: perSeat },
    seatingPositions: seats,
    rsp: { x: 2, y: 3 },
  });
  assert.deepEqual(result.seats.map((s) => s.p6Level), ["FAIL", "L2", "FAIL"]);
});

test("P6 FAIL does NOT become null / '—' (distinct from NOT CALCULATED)", () => {
  const seats = makeSeats(2);
  const perSeat = {
    [seats[0].id]: {
      rp22: {
        4: { level: 2, value: 5, status: "ok", applicable: true },
        6: { level: 0, value: null, status: "fail", applicable: true }, // FAIL
        10: { level: 2, value: 5, status: "ok", applicable: true },
      },
      isPrimary: true,
    },
    [seats[1].id]: {
      rp22: {
        4: { level: 2, value: 5, status: "ok", applicable: true },
        6: { level: null, value: null, status: "no_data", applicable: false }, // NOT CALCULATED
        10: { level: 2, value: 5, status: "ok", applicable: true },
      },
      isPrimary: false,
    },
  };
  const result = selectClientBestListeningArea({
    analysisResult: { perSeatRp22: perSeat },
    seatingPositions: seats,
    rsp: { x: 2, y: 3 },
  });
  assert.equal(result.seats[0].p6Level, "FAIL", "FAIL seat must be 'FAIL'");
  assert.equal(result.seats[1].p6Level, null, "Not-calculated seat must be null");
  assert.notEqual(result.seats[0].p6Level, result.seats[1].p6Level,
    "FAIL and NOT CALCULATED must be distinct");
});

test("P4/P10 numeric 0 FAIL also preserved", () => {
  const seats = makeSeats(1);
  const perSeat = {
    [seats[0].id]: {
      rp22: {
        4: { level: 0, value: null, status: "fail", applicable: true },
        6: { level: 0, value: null, status: "fail", applicable: true },
        10: { level: 0, value: null, status: "fail", applicable: true },
      },
      isPrimary: true,
    },
  };
  const result = selectClientBestListeningArea({
    analysisResult: { perSeatRp22: perSeat },
    seatingPositions: seats,
    rsp: { x: 2, y: 3 },
  });
  assert.equal(result.seats[0].p4Level, "FAIL");
  assert.equal(result.seats[0].p6Level, "FAIL");
  assert.equal(result.seats[0].p10Level, "FAIL");
  assert.equal(result.seats[0].worstLevel, "FAIL");
});

// ── P16/P17 (Timbre Consistency) ──

test("P16/P17 numeric 0 FAIL preserved", () => {
  const seats = makeSeats(2);
  const perSeat = {
    [seats[0].id]: {
      rp22: {
        16: { level: 0, value: null, status: "fail", applicable: true },
        17: { level: 2, value: 3, status: "ok", applicable: true },
      },
      isPrimary: true,
    },
    [seats[1].id]: {
      rp22: {
        16: { level: 2, value: 3, status: "ok", applicable: true },
        17: { level: 0, value: null, status: "fail", applicable: true },
      },
      isPrimary: false,
    },
  };
  const result = selectClientTimbreConsistency({
    analysisResult: { perSeatRp22: perSeat },
    seatingPositions: seats,
  });
  assert.equal(result.seats[0].p16Level, "FAIL");
  assert.equal(result.seats[1].p17Level, "FAIL");
});

// ── P9 (Overhead) ──

test("P9 numeric 0 FAIL preserved (not dropped to null)", () => {
  const seats = makeSeats(2);
  const perSeat = {
    [seats[0].id]: {
      rp22: { 9: { level: 0, value: null, status: "fail", applicable: true } },
      isPrimary: true,
    },
    [seats[1].id]: {
      rp22: { 9: { level: 2, value: 70, status: "ok", applicable: true } },
      isPrimary: false,
    },
  };
  const result = selectClientP9Overhead({
    analysisResult: { perSeatRp22: perSeat },
    seatingPositions: seats,
  });
  assert.equal(result.seats[0].p9Level, "FAIL", "numeric 0 must be FAIL");
  assert.equal(result.seats[1].p9Level, "L2");
});

// ── P1 (Recommended Seating Position) ──

test("P1 numeric 0 FAIL preserved (not dropped from valid list)", () => {
  const seats = makeSeats(2);
  const perSeat = {
    [seats[0].id]: {
      rp22: { 1: { level: 0, valueM: 0.3, status: "fail", applicable: true } },
    },
    [seats[1].id]: {
      rp22: { 1: { level: 2, valueM: 1.0, status: "ok", applicable: true } },
    },
  };
  const result = selectClientRecommendedSeatingPosition({
    analysisResult: { perSeatRp22: perSeat },
    seatingPositions: seats,
    rsp: { x: 2, y: 3 },
  });
  // Both seats should be in the valid list (rank >= 0)
  assert.equal(result.seats.length, 2, "FAIL seat must not be dropped");
  assert.equal(result.seats[0].level, "Below L1", "numeric 0 → 'Below L1' (FAIL display)");
  assert.equal(result.seats[0].rank, 0, "numeric 0 → rank 0 (FAIL rank)");
});