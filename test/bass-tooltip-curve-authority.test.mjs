// test/bass-tooltip-curve-authority.test.mjs
//
// Regression tests for the Bass Response tooltip curve authority.
// Tests A–J from the fix specification.
//
// Run: node --experimental-vm-modules test/bass-tooltip-curve-authority.test.mjs
//   or: npx vitest run test/bass-tooltip-curve-authority.test.mjs

import { strict as assert } from "node:assert";
import { resolveTooltipCurveAuthority } from "../src/components/room/bass/bassTooltipCurveAuthority.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

// ── Helper: build a chartData row with per-series SPL values ──
function makeRow(freq, spls) {
  const row = { frequency: freq };
  for (const [id, val] of Object.entries(spls)) {
    row[`spl_${id}`] = val;
  }
  return row;
}

// ── Standard series set for tests ──
const STANDARD_SERIES = [
  { id: "rsp-eq", kind: "post-eq", label: "RSP EQ", color: "#16A34A" },
  { id: "house", kind: "house-curve", label: "House Target", color: "#2563EB" },
  { id: "room", kind: "room-response", label: "Room", color: "#8B7F76" },
  { id: "submax", kind: "maximum-spl", label: "Sub Max", color: "#B45309" },
  { id: "prodmax", kind: "product-maximum", label: "Product Max", color: "#625143" },
];

// ── A. Cursor frequency comes from the chartData row ──
test("A: cursor frequency comes from chartData row.frequency", () => {
  const row = makeRow(113.3, { "rsp-eq": 96.4, "house": 102.6 });
  const result = resolveTooltipCurveAuthority({ row, series: STANDARD_SERIES });
  assert.equal(result.frequency, 113.3);
});

// ── B. Final EQ tooltip SPL comes from Final EQ data ──
test("B: Final EQ tooltip SPL comes from post-eq series data", () => {
  const row = makeRow(100.9, { "rsp-eq": 96.4, "house": 102.9, "room": 95.0 });
  const result = resolveTooltipCurveAuthority({ row, series: STANDARD_SERIES });
  assert.equal(result.responseSpl, 96.4, "response SPL should be from post-eq (rsp-eq) series");
  assert.equal(result.activeCurveLabel, "FINAL EQ RESPONSE");
});

// ── C. House Target tooltip SPL comes from target data ──
test("C: House Target tooltip SPL comes from house-curve series data", () => {
  const row = makeRow(100.9, { "rsp-eq": 96.4, "house": 102.9 });
  const result = resolveTooltipCurveAuthority({ row, series: STANDARD_SERIES });
  assert.equal(result.targetSpl, 102.9, "target SPL should be from house-curve series");
});

// ── D. Response SPL and target SPL are independently calculated ──
test("D: response SPL and target SPL are independently calculated", () => {
  const row = makeRow(113.3, { "rsp-eq": 96.4, "house": 102.6 });
  const result = resolveTooltipCurveAuthority({ row, series: STANDARD_SERIES });
  assert.notEqual(result.responseSpl, result.targetSpl, "response and target must differ");
  assert.equal(result.responseSpl, 96.4);
  assert.equal(result.targetSpl, 102.6);
});

// ── E. Below-target response gives negative delta ──
test("E: below-target response gives negative delta", () => {
  const row = makeRow(113.3, { "rsp-eq": 96.4, "house": 102.6 });
  const result = resolveTooltipCurveAuthority({ row, series: STANDARD_SERIES });
  assert.ok(result.delta < 0, `delta should be negative, got ${result.delta}`);
  assert.equal(result.aboveTarget, false);
  assert.ok(Math.abs(result.delta - (-6.2)) < 0.001, `delta should be -6.2, got ${result.delta}`);
});

// ── F. Above-target response gives positive delta ──
test("F: above-target response gives positive delta", () => {
  const row = makeRow(50.0, { "rsp-eq": 108.5, "house": 105.0 });
  const result = resolveTooltipCurveAuthority({ row, series: STANDARD_SERIES });
  assert.ok(result.delta > 0, `delta should be positive, got ${result.delta}`);
  assert.equal(result.aboveTarget, true);
  assert.ok(Math.abs(result.delta - 3.5) < 0.001, `delta should be +3.5, got ${result.delta}`);
});

// ── G. Selected seat controls response source ──
test("G: real-seat-overlay takes priority over post-eq when present", () => {
  const seriesWithSeat = [
    { id: "rsp-eq", kind: "post-eq", label: "RSP EQ" },
    { id: "R1S2", kind: "real-seat-overlay", label: "R1S2" },
    { id: "house", kind: "house-curve", label: "House Target" },
  ];
  const row = makeRow(100.0, { "rsp-eq": 99.0, "R1S2": 94.0, "house": 102.0 });
  const result = resolveTooltipCurveAuthority({ row, series: seriesWithSeat });
  assert.equal(result.responseSpl, 94.0, "response SPL should come from the seat overlay (R1S2), not post-eq");
  assert.equal(result.activeCurveLabel, "R1S2 RESPONSE");
});

// ── H. Tooltip reads from the chartData row (which reflects smoothing) ──
test("H: tooltip reads from chartData row — smoothing parity is automatic", () => {
  // The chartData row is pre-built by mergeBassGraphSeries with the current
  // smoothing mode. The tooltip reads spl_<id> from that row, so it always
  // matches the displayed (smoothed) curve.
  const smoothedRow = makeRow(80.0, { "rsp-eq": 100.5, "house": 103.0 });
  const result = resolveTooltipCurveAuthority({ row: smoothedRow, series: STANDARD_SERIES });
  assert.equal(result.responseSpl, 100.5, "tooltip SPL must match the row value (smoothed curve)");
});

// ── I. Tooltip value matches plotted curve (same chartData row) ──
test("I: tooltip value matches the plotted curve sample at cursor frequency", () => {
  const row = makeRow(60.0, { "rsp-eq": 101.2, "house": 104.0, "room": 99.8 });
  const result = resolveTooltipCurveAuthority({ row, series: STANDARD_SERIES });
  // The tooltip reads the same spl_<id> that the Line component plots
  assert.equal(result.responseSpl, row["spl_rsp-eq"]);
  assert.equal(result.targetSpl, row["spl_house"]);
});

// ── J. Target cannot overwrite active response SPL ──
test("J: house-curve cannot become the primary response SPL even when closest", () => {
  // Simulate the original bug: cursor is closest to the house-curve line.
  // payload[0].dataKey would be "spl_house", but the tooltip must still
  // report the post-eq response as the primary SPL.
  const row = makeRow(100.9, { "rsp-eq": 96.4, "house": 102.9 });
  const result = resolveTooltipCurveAuthority({
    row,
    series: STANDARD_SERIES,
    fallbackDataKey: "spl_house", // payload[0].dataKey = house curve (closest)
  });
  assert.equal(result.responseSpl, 96.4, "response SPL must come from post-eq, not from the closest (house) curve");
  assert.equal(result.targetSpl, 102.9);
  assert.ok(result.delta < 0, "delta must be negative (response below target)");
  assert.notEqual(result.responseSpl, result.targetSpl, "response must not equal target unless curves intersect");
});

// ── Additional: post-eq priority over other response curves ──
test("post-eq takes priority over room-response, sub-max, and product-max", () => {
  const row = makeRow(80.0, { "rsp-eq": 100.0, "room": 95.0, "submax": 110.0, "prodmax": 105.0, "house": 103.0 });
  const result = resolveTooltipCurveAuthority({ row, series: STANDARD_SERIES });
  assert.equal(result.responseSpl, 100.0, "post-eq should be selected as the active response");
  assert.equal(result.activeCurveLabel, "FINAL EQ RESPONSE");
});

// ── Additional: room-response used when post-eq is absent ──
test("room-response is used when post-eq is absent", () => {
  const seriesNoPostEq = STANDARD_SERIES.filter((s) => s.kind !== "post-eq");
  const row = makeRow(80.0, { "room": 95.0, "house": 103.0 });
  const result = resolveTooltipCurveAuthority({ row, series: seriesNoPostEq });
  assert.equal(result.responseSpl, 95.0);
  assert.equal(result.activeCurveLabel, "ROOM RESPONSE");
});

// ── Additional: non-multi mode fallback (series=[]) ──
test("non-multi mode: falls back to payload dataKey when series is empty", () => {
  const row = { frequency: 80.0, spl: 100.5, splGood: 100.5, splBad: null };
  const result = resolveTooltipCurveAuthority({
    row,
    series: [],
    fallbackDataKey: "splGood",
  });
  assert.equal(result.responseSpl, 100.5);
  assert.equal(result.targetSpl, null, "no house curve in non-multi mode");
});

// ── Additional: equal response and target gives zero delta ──
test("equal response and target gives zero delta with 'Vs target' label", () => {
  const row = makeRow(70.0, { "rsp-eq": 103.0, "house": 103.0 });
  const result = resolveTooltipCurveAuthority({ row, series: STANDARD_SERIES });
  assert.equal(result.delta, 0);
  assert.equal(result.aboveTarget, true); // 0 >= 0
});

// ── Additional: null response SPL handled gracefully ──
test("null response SPL is handled gracefully", () => {
  const row = makeRow(80.0, { "rsp-eq": null, "house": 103.0 });
  const result = resolveTooltipCurveAuthority({ row, series: STANDARD_SERIES });
  assert.equal(result.responseSpl, null);
  assert.equal(result.targetSpl, 103.0);
  assert.equal(result.delta, null);
});

// ── Run all tests ──
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed (${tests.length} total)`);
if (failed > 0) process.exit(1);