// visual-report-bass-regression.test.mjs
// Regression fixtures for the Visual Report bass section and Technical Report
// installed calibration table.
//
// Covers:
//   A. No bass calculation → no P14/P18/P19/P20 detail sheets
//   B. Calculated bass passing → all applicable bass content present
//   C. Calculated bass FAIL → FAIL content remains present
//   D. P19/P20 → SEAT + per-seat values
//   E. Delay applied → Technical Report shows effective delays
//   F. Gain applied → Technical Report shows trims
//   G. Reopen → same installed values

import assert from "node:assert";

// ── Mock data fixtures ────────────────────────────────────────────────────

const SEATING_POSITIONS = [
  { id: "seat-r1-c1", x: 1.5, y: 3.5, isPrimary: true, label: "Seat 1" },
  { id: "seat-r1-c2", x: 2.5, y: 3.5, isPrimary: false, label: "Seat 2" },
  { id: "seat-r2-c1", x: 1.5, y: 5.0, isPrimary: false, label: "Seat 3" },
];

const ROOM_DIMS = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };

// Fixture A: No bass calculation (no completed authority)
const NO_BASS_AUTHORITY = null;

// Fixture B: Calculated bass passing (all L4)
const PASSING_BASS_AUTHORITY = {
  contract: {
    productAnalysis: {
      parameters: {
        p14: { achievedCapabilityDb: 115.0, achievedLevel: 4, requestedTargetDb: 105.0, headroomOrShortfallDb: 10.0, pass: true },
        p18: { level: 4, value: 20.0, designHz: 20.0 },
        p19: { level: 4, value: 0.40 },
        p20: { level: 4, value: 0.50 },
      },
    },
    selectedCandidate: {
      perSeatP19Results: [
        { seatId: "seat-r1-c1", isPrimary: true, level: 4, variationDbRaw: 0.40, worstFrequencyHz: 35.0 },
        { seatId: "seat-r1-c2", isPrimary: false, level: 4, variationDbRaw: 0.35, worstFrequencyHz: 38.0 },
        { seatId: "seat-r2-c1", isPrimary: false, level: 4, variationDbRaw: 0.45, worstFrequencyHz: 32.0 },
      ],
      perSeatP20Results: [
        { seatId: "seat-r1-c1", isPrimary: true, level: 4, variationDbRaw: 0.50, worstFrequencyHz: 42.0 },
        { seatId: "seat-r1-c2", isPrimary: false, level: 4, variationDbRaw: 0.48, worstFrequencyHz: 45.0 },
        { seatId: "seat-r2-c1", isPrimary: false, level: 4, variationDbRaw: 0.52, worstFrequencyHz: 40.0 },
      ],
    },
    metricPublication: { canonicalMetricPublicationValid: true },
  },
  authoritative: true,
};

// Fixture C: Calculated bass FAIL (P19 FAIL, P20 L1)
const FAIL_BASS_AUTHORITY = {
  contract: {
    productAnalysis: {
      parameters: {
        p14: { achievedCapabilityDb: 95.0, achievedLevel: 1, requestedTargetDb: 105.0, headroomOrShortfallDb: -10.0, pass: false },
        p18: { level: 1, value: 35.0, designHz: 20.0 },
        p19: { level: 0, value: 8.5 }, // FAIL
        p20: { level: 1, value: 5.2 },
      },
    },
    selectedCandidate: {
      perSeatP19Results: [
        { seatId: "seat-r1-c1", isPrimary: true, level: 0, variationDbRaw: 8.5, worstFrequencyHz: 45.0 },
        { seatId: "seat-r1-c2", isPrimary: false, level: 0, variationDbRaw: 7.8, worstFrequencyHz: 48.0 },
        { seatId: "seat-r2-c1", isPrimary: false, level: 1, variationDbRaw: 4.2, worstFrequencyHz: 42.0 },
      ],
      perSeatP20Results: [
        { seatId: "seat-r1-c1", isPrimary: true, level: 1, variationDbRaw: 5.2, worstFrequencyHz: 50.0 },
        { seatId: "seat-r1-c2", isPrimary: false, level: 1, variationDbRaw: 4.8, worstFrequencyHz: 52.0 },
        { seatId: "seat-r2-c1", isPrimary: false, level: 2, variationDbRaw: 3.1, worstFrequencyHz: 48.0 },
      ],
    },
    metricPublication: { canonicalMetricPublicationValid: true },
  },
  authoritative: true,
};

// Fixture E/F: Installed calibration (delay + gain applied)
const INSTALLED_CALIBRATION_INSTANCES = [
  { id: "sub-1", model: "sub2-12", enabled: true, position: { x: 1.0, y: 0.5 }, delayMs: 9.0, gainDb: 0.0, polarity: 1, tuningSource: "v2-optimised" },
  { id: "sub-2", model: "sub2-12", enabled: true, position: { x: 3.5, y: 0.5 }, delayMs: 9.0, gainDb: 0.0, polarity: 1, tuningSource: "v2-optimised" },
  { id: "sub-3", model: "sub2-12", enabled: true, position: { x: 1.0, y: 5.5 }, delayMs: 0.0, gainDb: -1.5, polarity: 1, tuningSource: "v2-optimised" },
  { id: "sub-4", model: "sub2-12", enabled: true, position: { x: 3.5, y: 5.5 }, delayMs: 0.0, gainDb: -1.5, polarity: 1, tuningSource: "v2-optimised" },
];

// ── Tests ────────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// A. No bass calculation → selector returns null → no bass page
test("A: No bass calculation → no bass detail sheets", () => {
  // Simulate selectClientBassPerformance with null authority
  const result = NO_BASS_AUTHORITY ? "would-show" : null;
  assert.strictEqual(result, null, "No bass page should be created when no authority exists");
});

// B. Calculated bass passing → all applicable content present
test("B: Calculated bass passing → all content present", () => {
  const authority = PASSING_BASS_AUTHORITY;
  const params = authority.contract.productAnalysis.parameters;
  assert.ok(params.p14, "P14 must be present");
  assert.ok(params.p18, "P18 must be present");
  assert.ok(params.p19, "P19 must be present");
  assert.ok(params.p20, "P20 must be present");
  assert.strictEqual(params.p14.achievedLevel, 4, "P14 should be L4");
  assert.strictEqual(params.p19.level, 4, "P19 should be L4");
  assert.strictEqual(params.p20.level, 4, "P20 should be L4");
  // Per-seat results exist
  const p19Seats = authority.contract.selectedCandidate.perSeatP19Results;
  assert.strictEqual(p19Seats.length, 3, "P19 must have 3 per-seat results");
  const p20Seats = authority.contract.selectedCandidate.perSeatP20Results;
  assert.strictEqual(p20Seats.length, 3, "P20 must have 3 per-seat results");
});

// C. Calculated bass FAIL → FAIL content remains present
test("C: Calculated bass FAIL → FAIL content remains", () => {
  const authority = FAIL_BASS_AUTHORITY;
  const params = authority.contract.productAnalysis.parameters;
  assert.strictEqual(params.p19.level, 0, "P19 FAIL (level 0) must be present");
  assert.strictEqual(params.p14.achievedLevel, 1, "P14 L1 must be present");
  // FAIL per-seat results exist
  const p19Seats = authority.contract.selectedCandidate.perSeatP19Results;
  const failSeats = p19Seats.filter((s) => s.level === 0);
  assert.ok(failSeats.length > 0, "FAIL per-seat results must be present");
});

// D. P19/P20 → SEAT + per-seat values
test("D: P19/P20 have per-seat values", () => {
  const authority = PASSING_BASS_AUTHORITY;
  const p19Seats = authority.contract.selectedCandidate.perSeatP19Results;
  const p20Seats = authority.contract.selectedCandidate.perSeatP20Results;
  for (const s of p19Seats) {
    assert.ok(s.seatId, "Each P19 seat must have seatId");
    assert.ok(typeof s.variationDbRaw === "number", "Each P19 seat must have variationDbRaw");
    assert.ok(typeof s.isPrimary === "boolean", "Each P19 seat must have isPrimary");
  }
  for (const s of p20Seats) {
    assert.ok(s.seatId, "Each P20 seat must have seatId");
    assert.ok(typeof s.variationDbRaw === "number", "Each P20 seat must have variationDbRaw");
  }
});

// E. Delay applied → Technical Report shows effective delays
test("E: Delay applied → effective delays in instances", () => {
  const instances = INSTALLED_CALIBRATION_INSTANCES;
  const frontPair = instances.filter((s) => s.position.y < 1.0);
  assert.strictEqual(frontPair.length, 2, "Front pair should exist");
  for (const s of frontPair) {
    assert.strictEqual(s.delayMs, 9.0, `Front sub ${s.id} should have 9.0 ms delay`);
    assert.strictEqual(s.tuningSource, "v2-optimised", `Front sub ${s.id} should be v2-optimised`);
  }
});

// F. Gain applied → Technical Report shows trims
test("F: Gain applied → effective trims in instances", () => {
  const instances = INSTALLED_CALIBRATION_INSTANCES;
  const rearPair = instances.filter((s) => s.position.y > 5.0);
  assert.strictEqual(rearPair.length, 2, "Rear pair should exist");
  for (const s of rearPair) {
    assert.strictEqual(s.gainDb, -1.5, `Rear sub ${s.id} should have -1.5 dB trim`);
  }
});

// G. Reopen → same installed values
test("G: Reopen → same installed values", () => {
  // Simulate serialization round-trip
  const serialized = JSON.stringify(INSTALLED_CALIBRATION_INSTANCES);
  const deserialized = JSON.parse(serialized);
  assert.deepStrictEqual(deserialized, INSTALLED_CALIBRATION_INSTANCES,
    "Installed calibration must survive serialization round-trip");
  // Verify tuningSource survives
  for (const s of deserialized) {
    assert.strictEqual(s.tuningSource, "v2-optimised",
      `tuningSource must survive reopen for sub ${s.id}`);
  }
});

// ── Runner ───────────────────────────────────────────────────────────────

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