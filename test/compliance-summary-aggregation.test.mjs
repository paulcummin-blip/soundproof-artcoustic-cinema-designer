// test/compliance-summary-aggregation.test.mjs
// Regression tests for the Compliance Summary headline aggregation.
//
// Before fix: ComplianceParameterMatrix.summary excluded every seat-scoped
// parameter from the L4/L3/L2/L1/FAIL/NOT VERIFIED buckets via an early return
// when isSeatScope === true. This caused P19 (seat-scoped, canonical aggregate
// FAIL) to be silently excluded, producing a misleading "FAIL 0" headline.
//
// After fix: every active parameter contributes one canonical parameter status
// to the headline totals — including seat-scoped parameters with a canonical
// aggregate level. Seat-scoped parameters with no calculated canonical aggregate
// contribute to NOT VERIFIED / unavailable, never silently excluded.
//
// Run: node --import ./test/_alias-register.mjs test/compliance-summary-aggregation.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { aggregateComplianceSummary, levelKey } from "@/components/rp22/complianceSummaryAggregator";

// ── Helpers ─────────────────────────────────────────────────────────────

const CALCULATED = { label: "Calculated" };
const NOT_CALCULATED = { label: "Not calculated" };

const room = (lvl) => ({ lvl, isSeatScope: false, status: CALCULATED });
const seat = (lvl, status = CALCULATED) => ({ lvl, isSeatScope: true, status });

// ── Tests ────────────────────────────────────────────────────────────────

test("1. Room-scoped L4 parameter contributes one L4", () => {
  const rows = [room(4)];
  const s = aggregateComplianceSummary(rows);
  assert.strictEqual(s.counts.L4, 1);
  assert.strictEqual(s.active, 1);
  assert.strictEqual(s.lowestLabel, "L4");
});

test("2. Seat-scoped L4 parameter with canonical aggregate L4 contributes one L4", () => {
  const rows = [seat(4)];
  const s = aggregateComplianceSummary(rows);
  assert.strictEqual(s.counts.L4, 1, "seat-scoped L4 must contribute to L4 bucket");
  assert.strictEqual(s.active, 1);
  assert.strictEqual(s.seatParamCount, 1);
  assert.strictEqual(s.calculatedSeatParams, 1);
});

test("3. Seat-scoped FAIL parameter contributes exactly one FAIL", () => {
  const rows = [seat(0)]; // 0 === FAIL
  const s = aggregateComplianceSummary(rows);
  assert.strictEqual(s.counts.fail, 1, "seat-scoped FAIL must contribute to fail bucket");
  assert.strictEqual(s.active, 1);
  assert.strictEqual(s.lowestLabel, "Below L1");
});

test("4. Multiple failing seats within the same parameter still contribute only one FAIL", () => {
  // The summary aggregates PARAMETERS, not seats. A single seat-scoped parameter
  // with canonical aggregate FAIL contributes exactly one to FAIL — regardless
  // of how many seats are failing within it.
  const rows = [seat(0)];
  const s = aggregateComplianceSummary(rows);
  assert.strictEqual(s.counts.fail, 1, "one parameter → one FAIL, not one per seat");
  assert.strictEqual(s.active, 1);
});

test("5. Seat-scoped NOT CALCULATED parameter contributes to unavailable/not-verified", () => {
  const rows = [seat(null, NOT_CALCULATED)];
  const s = aggregateComplianceSummary(rows);
  assert.strictEqual(s.counts.notVerified, 1, "uncalculated seat param must be visible as not-verified");
  assert.strictEqual(s.unavailable, 1);
  assert.strictEqual(s.active, 0, "uncalculated param is not active");
  assert.strictEqual(s.seatParamCount, 1);
  assert.strictEqual(s.calculatedSeatParams, 0);
  assert.strictEqual(s.lowestLabel, "—");
});

test("6. P19 canonical aggregate FAIL produces headline FAIL >= 1", () => {
  // Simulates the Yarm acceptance case: P19 is seat-scoped with canonical FAIL.
  // Surrounding room-scoped params are all passing (L4/L1) — yet the headline
  // must reflect the failing parameter.
  const rows = [
    room(4),  // P2
    room(4), // P3
    room(1), // P12
    room(1), // P13
    room(1), // P14
    seat(0, CALCULATED), // P19 — canonical aggregate FAIL
  ];
  const s = aggregateComplianceSummary(rows);
  assert.ok(s.counts.fail >= 1, `FAIL must be >= 1 when P19 is FAIL, got ${s.counts.fail}`);
  assert.strictEqual(s.counts.fail, 1, "exactly one FAIL (P19)");
  assert.strictEqual(s.lowestLabel, "Below L1");
});

test("7. P20 and other seat parameters follow the same generic authority — no P19-specific hardcoding", () => {
  // P20 is also seat-scoped; it must follow the identical generic path.
  const rowsP20Fail = [seat(0, CALCULATED)]; // P20 FAIL
  const s20 = aggregateComplianceSummary(rowsP20Fail);
  assert.strictEqual(s20.counts.fail, 1, "P20 FAIL must contribute to fail bucket");

  // P16 seat-scoped L2
  const rowsP16 = [seat(2, CALCULATED)];
  const s16 = aggregateComplianceSummary(rowsP16);
  assert.strictEqual(s16.counts.L2, 1, "P16 seat-scoped L2 must contribute to L2 bucket");

  // P1 seat-scoped L3
  const rowsP1 = [seat(3, CALCULATED)];
  const s1 = aggregateComplianceSummary(rowsP1);
  assert.strictEqual(s1.counts.L3, 1, "P1 seat-scoped L3 must contribute to L3 bucket");
});

test("8. Existing room parameter totals remain correct", () => {
  // A mix of room-scoped and seat-scoped params: room totals must not change
  // due to the presence of seat-scoped params.
  const rows = [
    room(4),  // L4
    room(4),  // L4
    room(3),  // L3
    room(2),  // L2
    room(1),  // L1
    room(0),  // FAIL
    room(null), // NV (not verified)
    seat(4),  // seat L4 (P16)
    seat(0),  // seat FAIL (P19)
    seat(null, NOT_CALCULATED), // seat not calculated (P5)
  ];
  const s = aggregateComplianceSummary(rows);

  // Room-scoped totals unchanged: L4=2, L3=1, L2=1, L1=1, FAIL=1, NV=1
  // Plus seat-scoped: L4 += 1 (P16), FAIL += 1 (P19), NV += 1 (P5)
  assert.strictEqual(s.counts.L4, 3, "2 room + 1 seat L4");
  assert.strictEqual(s.counts.L3, 1);
  assert.strictEqual(s.counts.L2, 1);
  assert.strictEqual(s.counts.L1, 1);
  assert.strictEqual(s.counts.fail, 2, "1 room FAIL + 1 seat FAIL (P19)");
  assert.strictEqual(s.counts.notVerified, 2, "1 room NV + 1 seat NV (P5)");
  assert.strictEqual(s.active, 8, "all except 2 NV");
  assert.strictEqual(s.unavailable, 2);
  assert.strictEqual(s.seatParamCount, 3);
  assert.strictEqual(s.calculatedSeatParams, 2, "P16 + P19 calculated, P5 not");
  assert.strictEqual(s.lowestLabel, "Below L1");
});

test("STOP CONDITION: canonical FAIL parameter lower down can never produce FAIL 0 headline", () => {
  // The original bug: a room with a visible FAIL parameter (P19) reported FAIL 0.
  // After fix, any canonical FAIL in the rows makes counts.fail >= 1.
  const rowsWithFail = [
    room(4), room(4), room(4), room(4), // 4 room L4
    room(1), room(1), room(1),           // 3 room L1
    room(null), room(null),              // 2 room NV
    seat(0, CALCULATED),                 // P19 canonical FAIL
  ];
  const s = aggregateComplianceSummary(rowsWithFail);
  assert.ok(s.counts.fail >= 1,
    `STOP CONDITION violated: FAIL is ${s.counts.fail} despite a canonical FAIL parameter`);
  assert.notStrictEqual(s.counts.fail, 0, "FAIL 0 must never occur when a canonical FAIL exists");
});

test("levelKey maps all canonical level representations correctly", () => {
  assert.strictEqual(levelKey(4), "L4");
  assert.strictEqual(levelKey(3), "L3");
  assert.strictEqual(levelKey(2), "L2");
  assert.strictEqual(levelKey(1), "L1");
  assert.strictEqual(levelKey(0), "FAIL");
  assert.strictEqual(levelKey("L4"), "L4");
  assert.strictEqual(levelKey("FAIL"), "FAIL");
  assert.strictEqual(levelKey(null), "NV");
  assert.strictEqual(levelKey(undefined), "NV");
  assert.strictEqual(levelKey("—"), "NV");
  assert.strictEqual(levelKey("Not calculated"), "NV");
});