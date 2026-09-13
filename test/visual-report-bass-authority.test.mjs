// visual-report-bass-authority.test.mjs
// Regression test: Visual Report bass levels must consume the canonical
// RP22 level authority (same fields as Room Designer / Compliance) and
// must NOT independently re-grade raw engineering values.
//
// Confirmed example:
//   P14 selected target: Minimum L3 · 115 dBC
//   available capability: ~118.8 dBC (would independently grade as L4)
//   P18: L2 · 26 Hz
//   P19 seats: L2 / L4 / L2
//   P20 seats: L1 / L4 / L1
//
// The Visual Report must show P14 = L3 (the selected target), NOT L4.
// P18/P19/P20 must consume the authoritative `level` field directly.

import './_alias-register.mjs';
import assert from 'node:assert';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Fixture matching the confirmed example:
//   selectedLevel = 3 (Minimum L3 · 115 dBC)
//   achievedLevel = 4 (capability-derived from 118.8 dBC — must NOT be the headline)
//   achievedCapabilityDb = 118.8
const CONFIRMED_EXAMPLE_AUTHORITY = {
  contract: {
    productAnalysis: {
      parameters: {
        p14: {
          achievedCapabilityDb: 118.8,
          achievedLevel: 4,           // capability-derived — must NOT be the Visual Report headline
          selectedLevel: 3,           // user-selected target — the canonical headline authority
          selectedTargetDb: 115.0,
          requestedTargetDb: 115.0,
          headroomOrShortfallDb: 3.8,
          pass: true,
        },
        p18: { level: 2, value: 26.2, designHz: 26.0 },
        p19: { level: 2, value: 4.95 },
        p20: { level: 1, value: 8.82 },
      },
    },
    selectedCandidate: {
      perSeatP19Results: [
        { seatId: "seat-1", isPrimary: true,  level: 2, variationDbRaw: 4.95, worstFrequencyHz: 35.0 },
        { seatId: "seat-2", isPrimary: false, level: 4, variationDbRaw: 0.15, worstFrequencyHz: 38.0 },
        { seatId: "seat-3", isPrimary: false, level: 2, variationDbRaw: 4.50, worstFrequencyHz: 32.0 },
      ],
      perSeatP20Results: [
        { seatId: "seat-1", isPrimary: true,  level: 1, variationDbRaw: 8.82, worstFrequencyHz: 42.0 },
        { seatId: "seat-2", isPrimary: false, level: 4, variationDbRaw: 0.15, worstFrequencyHz: 45.0 },
        { seatId: "seat-3", isPrimary: false, level: 1, variationDbRaw: 8.50, worstFrequencyHz: 40.0 },
      ],
    },
    metricPublication: { canonicalMetricPublicationValid: true },
  },
  authoritative: true,
};

const SEATING = [
  { id: "seat-1", label: "Seat 1", isPrimary: true },
  { id: "seat-2", label: "Seat 2", isPrimary: false },
  { id: "seat-3", label: "Seat 3", isPrimary: false },
];

// P14: Visual Report headline must be L3 (selected target), not L4 (capability)
test("P14 headline uses selectedLevel (L3), not capability-derived achievedLevel (L4)", () => {
  const result = selectClientBassPerformance(CONFIRMED_EXAMPLE_AUTHORITY, {}, SEATING);
  assert.ok(result, "selector must return a result for an assessed authority");
  assert.ok(result.p14, "P14 must be present");
  assert.strictEqual(result.p14.achievedLevel, 3, "P14 headline level must be L3 (selected target)");
  assert.strictEqual(result.p14.selectedLevel, 3, "P14 selectedLevel must be L3");
  assert.notStrictEqual(result.p14.achievedLevel, 4, "P14 must NOT re-grade 118.8 dBC as L4");
  // Available capability retained as supporting info
  assert.strictEqual(result.p14.achievedCapabilityDb, 118.8, "Available capability dB retained as supporting info");
  assert.strictEqual(result.p14.requestedTargetDb, 115.0, "Target dB retained");
  assert.strictEqual(result.p14.headroomOrShortfallDb, 3.8, "Headroom retained");
});

// P18: Visual Report consumes authoritative level directly (L2)
test("P18 consumes authoritative level directly (L2)", () => {
  const result = selectClientBassPerformance(CONFIRMED_EXAMPLE_AUTHORITY, {}, SEATING);
  assert.ok(result.p18, "P18 must be present");
  assert.strictEqual(result.p18.achievedLevel, 2, "P18 level must be L2 (authoritative)");
  assert.strictEqual(result.p18.achievedHz, 26.2, "P18 Hz retained as supporting info");
});

// P19: per-seat authoritative levels consumed directly (L2 / L4 / L2)
test("P19 per-seat levels consumed directly from authority (L2 / L4 / L2)", () => {
  const result = selectClientBassPerformance(CONFIRMED_EXAMPLE_AUTHORITY, {}, SEATING);
  assert.ok(result.p19, "P19 must be present");
  assert.strictEqual(result.p19.achievedLevel, 2, "P19 overall level must be L2 (authoritative)");
  const seats = result.p19.perSeatResults;
  assert.strictEqual(seats.length, 3, "P19 must have 3 per-seat results");
  assert.deepStrictEqual(
    seats.map(s => s.level),
    [2, 4, 2],
    "P19 per-seat levels must be [L2, L4, L2] from authority — not re-derived"
  );
  // Raw ±dB retained as secondary detail only
  assert.strictEqual(seats[0].variationDbRaw, 4.95, "P19 seat-1 raw ±dB retained as secondary detail");
});

// P20: per-seat authoritative levels consumed directly (L1 / L4 / L1)
test("P20 per-seat levels consumed directly from authority (L1 / L4 / L1)", () => {
  const result = selectClientBassPerformance(CONFIRMED_EXAMPLE_AUTHORITY, {}, SEATING);
  assert.ok(result.p20, "P20 must be present");
  assert.strictEqual(result.p20.achievedLevel, 1, "P20 overall level must be L1 (authoritative)");
  const seats = result.p20.perSeatResults;
  assert.strictEqual(seats.length, 3, "P20 must have 3 per-seat results");
  assert.deepStrictEqual(
    seats.map(s => s.level),
    [1, 4, 1],
    "P20 per-seat levels must be [L1, L4, L1] from authority — not re-derived"
  );
  // Raw ±dB retained as secondary detail only
  assert.strictEqual(seats[0].variationDbRaw, 8.82, "P20 seat-1 raw ±dB retained as secondary detail");
});

// No local re-grading: selector does not transform raw dB/Hz into levels
test("No local re-grading — selector passes through canonical levels without threshold logic", () => {
  const result = selectClientBassPerformance(CONFIRMED_EXAMPLE_AUTHORITY, {}, SEATING);
  // P14 achievedLevel is selectedLevel (3), NOT a function of achievedCapabilityDb (118.8)
  assert.strictEqual(result.p14.achievedLevel, result.p14.selectedLevel,
    "P14 headline must equal selectedLevel — no capability re-grade");
  // P18 achievedLevel is the contract level (2), NOT derived from achievedHz (26.2)
  assert.strictEqual(result.p18.achievedLevel, 2,
    "P18 headline must be the canonical level — no Hz re-grade");
  // P19/P20 per-seat levels are the contract per-seat levels, not derived from variationDbRaw
  const p19fromRaw = result.p19.perSeatResults.map(s => s.level);
  assert.deepStrictEqual(p19fromRaw, [2, 4, 2],
    "P19 per-seat levels must be canonical — no raw ±dB re-grade");
  const p20fromRaw = result.p20.perSeatResults.map(s => s.level);
  assert.deepStrictEqual(p20fromRaw, [1, 4, 1],
    "P20 per-seat levels must be canonical — no raw ±dB re-grade");
});

// ── Runner ───────────────────────────────────────────────────────────────
const { selectClientBassPerformance } = await import('@/components/report/client/selectClientBassPerformance');

let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}
console.log(`\n${passed}/${tests.length} passed, ${failed} failed`);
if (failed > 0) process.exit(1);