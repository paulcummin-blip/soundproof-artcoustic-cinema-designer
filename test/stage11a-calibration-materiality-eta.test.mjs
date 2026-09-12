// stage11a-calibration-materiality-eta.test.mjs
// Tests for Stage 11A: calibration-only search, materiality gate, ETA.
//
// Tests:
//   1. Calibration-only search doesn't move positions
//   2. Delay/polarity/trim apply correctly
//   3. No primary-seat regression
//   4. Materiality: level change accepted
//   5. Materiality: >= 1 dB within-level accepted
//   6. Materiality: tiny 0.3 dB win suppressed
//   7. Preview causes zero project mutation
//   8. Cancel causes zero project mutation
//   9. ETA starts as estimating
//   10. ETA uses measured progress rather than fixed countdown

import { isMaterialImprovement } from "../src/components/room/bass/improveBassV2/materialityGate.js";
import { applyCalibrationTuning, isCalibrationApplied, buildCalibrationChangeSummary } from "../src/components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js";
import { computeEta, formatEta, MIN_ETA_SAMPLES } from "../src/components/room/bass/improveBassV2/etaCalculator.js";
import { runCalibrationOnlySearch } from "../src/components/room/bass/improveBassV2/calibrationOnlySearch.js";

let pass = 0;
let fail = 0;

function assert(condition, name) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

// ── Test 1: Calibration-only apply doesn't move positions ────────────────
{
  const instances = [
    { id: "sub-1", model: "sub3-12", enabled: true, position: { x: 1.5, y: 0.3 }, delayMs: 0, gainDb: 0, polarity: 0 },
    { id: "sub-2", model: "sub3-12", enabled: true, position: { x: 4.5, y: 0.3 }, delayMs: 0, gainDb: 0, polarity: 0 },
    { id: "sub-3", model: "sub3-12", enabled: true, position: { x: 1.5, y: 5.7 }, delayMs: 0, gainDb: 0, polarity: 0 },
    { id: "sub-4", model: "sub3-12", enabled: true, position: { x: 4.5, y: 5.7 }, delayMs: 0, gainDb: 0, polarity: 0 },
    { id: "sub-5", model: "sub3-12", enabled: false, position: { x: 3.0, y: 3.0 }, delayMs: 0, gainDb: 0, polarity: 0 },
  ];
  const tuning = [
    { delayMs: 2.5, gainDb: -1.0, polarity: 0 },
    { delayMs: 0, gainDb: 0, polarity: 0 },
    { delayMs: 5.0, gainDb: -0.5, polarity: -1 },
    { delayMs: 0, gainDb: 0, polarity: 0 },
  ];
  const updated = applyCalibrationTuning(instances, tuning);

  // Positions preserved
  assert(updated[0].position.x === 1.5 && updated[0].position.y === 0.3, "Test 1a: Sub 1 position preserved");
  assert(updated[1].position.x === 4.5 && updated[1].position.y === 0.3, "Test 1b: Sub 2 position preserved");
  assert(updated[2].position.x === 1.5 && updated[2].position.y === 5.7, "Test 1c: Sub 3 position preserved");
  assert(updated[3].position.x === 4.5 && updated[3].position.y === 5.7, "Test 1d: Sub 4 position preserved");

  // Disabled sub preserved
  assert(updated[4].enabled === false, "Test 1e: Disabled sub preserved");
  assert(updated.length === 5, "Test 1f: Total instance count preserved");

  // Models preserved
  assert(updated[0].model === "sub3-12", "Test 1g: Model preserved");
}

// ── Test 2: Delay/polarity/trim apply correctly ──────────────────────────
{
  const instances = [
    { id: "sub-1", enabled: true, position: { x: 1, y: 1 }, delayMs: 0, gainDb: 0, polarity: 0 },
    { id: "sub-2", enabled: true, position: { x: 2, y: 2 }, delayMs: 0, gainDb: 0, polarity: 0 },
  ];
  const tuning = [
    { delayMs: 3.5, gainDb: -2.0, polarity: -1 },
    { delayMs: 1.0, gainDb: 0, polarity: 0 },
  ];
  const updated = applyCalibrationTuning(instances, tuning);

  assert(updated[0].delayMs === 3.5, "Test 2a: Sub 1 delay applied");
  assert(updated[0].gainDb === -2.0, "Test 2b: Sub 1 trim applied");
  assert(updated[0].polarity === -1, "Test 2c: Sub 1 polarity applied");
  assert(updated[1].delayMs === 1.0, "Test 2d: Sub 2 delay applied");
  assert(updated[1].gainDb === 0, "Test 2e: Sub 2 trim unchanged");
  assert(updated[1].polarity === 1, "Test 2f: Legacy normal 0 is persisted as +1");
}

// ── Test 3: No primary-seat regression ───────────────────────────────────
{
  const current = {
    achievedP19Level: 1, achievedP20Level: 1,
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 0, variationDbRaw: 8.0 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 8.0 }],
  };
  const candidate = {
    achievedP19Level: 2, achievedP20Level: 2,
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.0 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.0 }],
  };
  const result = isMaterialImprovement(current, candidate);
  assert(result.material === true, "Test 3: No regression + level improvement = material");
}

// ── Test 4: Materiality - level change accepted ──────────────────────────
{
  const current = {
    achievedP19Level: 0, achievedP20Level: 1,
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 0, variationDbRaw: 15.0 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 8.0 }],
  };
  const candidate = {
    achievedP19Level: 1, achievedP20Level: 2,
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.5 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 2, variationDbRaw: 4.5 }],
  };
  const result = isMaterialImprovement(current, candidate);
  assert(result.material === true, "Test 4: Level change accepted as material");
  assert(result.reason.includes("Level improvement"), "Test 4b: Reason mentions level improvement");
}

// ── Test 5: Materiality - >= 1 dB within-level accepted ───────────────────
{
  const current = {
    achievedP19Level: 4, achievedP20Level: 4,
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 4, variationDbRaw: 2.5 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 4, variationDbRaw: 2.0 }],
  };
  const candidate = {
    achievedP19Level: 4, achievedP20Level: 4,
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 4, variationDbRaw: 1.0 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 4, variationDbRaw: 0.5 }],
  };
  const result = isMaterialImprovement(current, candidate);
  assert(result.details?.improvement === 1.5, "Test 5b: actual same-level path remains 1.5 dB");
  assert(result.material === true, "Test 5: >= 1.0 dB within-level accepted as material");
}

// ── Test 6: Materiality - tiny 0.3 dB win suppressed ──────────────────────
{
  const current = {
    achievedP19Level: 2, achievedP20Level: 2,
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.5 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.3 }],
  };
  const candidate = {
    achievedP19Level: 2, achievedP20Level: 2,
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.2 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.0 }],
  };
  const result = isMaterialImprovement(current, candidate);
  assert(result.material === false, "Test 6: 0.3 dB cosmetic win suppressed");
}

// ── Test 7: Preview causes zero project mutation ──────────────────────────
{
  const instances = [
    { id: "sub-1", enabled: true, position: { x: 1, y: 1 }, delayMs: 0, gainDb: 0, polarity: 0 },
  ];
  const tuning = [{ delayMs: 5.0, gainDb: -3.0, polarity: -1 }];

  // isCalibrationApplied returns false (not yet applied)
  const applied = isCalibrationApplied(instances, tuning);
  assert(applied === false, "Test 7: Preview does not mutate project state");

  // buildCalibrationChangeSummary doesn't mutate instances
  const summary = buildCalibrationChangeSummary(instances, tuning);
  assert(instances[0].delayMs === 0, "Test 7b: Original instances unchanged after summary");
  assert(instances[0].gainDb === 0, "Test 7c: Original instances unchanged after summary");
}

// ── Test 8: Cancel causes zero project mutation ───────────────────────────
{
  // Cancel is handled by the store/engine. Here we verify that
  // applyCalibrationTuning is a pure function that returns a NEW array
  // and does not mutate the input.
  const instances = [
    { id: "sub-1", enabled: true, position: { x: 1, y: 1 }, delayMs: 0, gainDb: 0, polarity: 0 },
  ];
  const tuning = [{ delayMs: 5.0, gainDb: -3.0, polarity: -1 }];
  const updated = applyCalibrationTuning(instances, tuning);

  // Original is unchanged
  assert(instances[0].delayMs === 0, "Test 8a: Original delayMs unchanged");
  assert(instances[0].gainDb === 0, "Test 8b: Original gainDb unchanged");
  assert(instances[0].polarity === 0, "Test 8c: Original polarity unchanged");

  // New array is different
  assert(updated !== instances, "Test 8d: Returns new array (immutable)");
  assert(updated[0].delayMs === 5.0, "Test 8e: New array has applied tuning");
}

// ── Test 9: ETA starts as estimating ─────────────────────────────────────
{
  const eta = computeEta([], 0, 10);
  assert(eta.status === "estimating", "Test 9a: ETA starts as estimating with no samples");
  assert(eta.etaSeconds === null, "Test 9b: ETA seconds null when estimating");

  const eta2 = computeEta([100, 200], 2, 10);
  assert(eta2.status === "estimating", "Test 9c: ETA estimating with < MIN_ETA_SAMPLES");

  const formatted = formatEta("estimating", null);
  assert(formatted === "Estimating time remaining\u2026", "Test 9d: Estimating format correct");
}

// ── Test 10: ETA uses measured progress rather than fixed countdown ───────
{
  // After MIN_ETA_SAMPLES, ETA should be computed from actual times
  const times = [1000, 1200, 1100]; // 3 samples, avg ~1100ms
  const eta = computeEta(times, 3, 10);
  assert(eta.status === "measured", "Test 10a: ETA measured after MIN_ETA_SAMPLES");
  assert(eta.etaSeconds !== null, "Test 10b: ETA seconds computed");
  assert(eta.etaSeconds > 0, "Test 10c: ETA seconds positive");

  // remaining = 10 - 3 = 7 units, avg = 1100ms, eta = 7700ms = 8 sec
  assert(eta.etaSeconds === 8, `Test 10d: ETA computed from measured rate (got ${eta.etaSeconds})`);

  // ETA changes with different rates (not a fixed countdown)
  const fastTimes = [100, 100, 100]; // 3 samples, avg 100ms
  const fastEta = computeEta(fastTimes, 3, 10);
  assert(fastEta.etaSeconds === 1, `Test 10e: ETA reflects faster rate (got ${fastEta.etaSeconds})`);

  const slowTimes = [10000, 10000, 10000]; // 3 samples, avg 10s
  const slowEta = computeEta(slowTimes, 3, 10);
  assert(slowEta.etaSeconds === 70, `Test 10f: ETA reflects slower rate (got ${slowEta.etaSeconds})`);

  // Finalising when complete (only when phase is "finalising")
  const doneEta = computeEta(times, 10, 10, "finalising");
  assert(doneEta.status === "finalising", "Test 10g: ETA finalising when complete");
  // Intermediate phase completion must NOT show finalising
  const midDoneEta = computeEta(times, 10, 10, "confirming_individual");
  assert(midDoneEta.status !== "finalising", "Test 10g2: Intermediate completion not finalising");

  const doneFormatted = formatEta("finalising", null);
  assert(doneFormatted === "Finalising\u2026", "Test 10h: Finalising format correct");

  // Format: under 60 seconds
  const under60 = formatEta("measured", 35);
  assert(under60 === "Approx. 35 sec remaining", `Test 10i: Under-60 format correct (got "${under60}")`);

  // Format: over 60 seconds
  const over60 = formatEta("measured", 80);
  assert(over60 === "Approx. 1 min 20 sec remaining", `Test 10j: Over-60 format correct (got "${over60}")`);
}

// ── Test 11: Calibration-only search returns null for missing data ────────
{
  const result = runCalibrationOnlySearch(null);
  assert(result === null, "Test 11a: Null raw transfer returns null");

  const result2 = runCalibrationOnlySearch({ perSourcePerSeatComplexTransfers: [] });
  assert(result2 === null, "Test 11b: Empty transfers returns null");

  const result3 = runCalibrationOnlySearch({
    perSourcePerSeatComplexTransfers: [{ seatId: "rsp", points: [{ frequency: 20, re: 1, im: 0 }] }],
    sources: [{ yNorm: 0.5 }],
  });
  assert(result3 !== null, "Test 11c: Single source returns default tuning");
  assert(result3.bestTuning[0].delayMs === 0, "Test 11d: Single source has zero tuning");
}

// ── Test 12: isCalibrationApplied detects matching tuning ─────────────────
{
  const instances = [
    { id: "sub-1", enabled: true, position: { x: 1, y: 1 }, delayMs: 2.5, gainDb: -1.0, polarity: 0 },
    { id: "sub-2", enabled: true, position: { x: 2, y: 2 }, delayMs: 0, gainDb: 0, polarity: -1 },
  ];
  const tuning = [
    { delayMs: 2.5, gainDb: -1.0, polarity: 0 },
    { delayMs: 0, gainDb: 0, polarity: -1 },
  ];
  assert(isCalibrationApplied(instances, tuning) === true, "Test 12a: Matching tuning detected as applied");

  const wrongTuning = [
    { delayMs: 5.0, gainDb: -1.0, polarity: 0 },
    { delayMs: 0, gainDb: 0, polarity: -1 },
  ];
  assert(isCalibrationApplied(instances, wrongTuning) === false, "Test 12b: Non-matching tuning detected as not applied");
}

// ── Test 13: Headroom-only improvement is NOT material ────────────────────
{
  const current = {
    achievedP19Level: 2, achievedP20Level: 2,
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.0 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.0 }],
    p14HeadroomDb: 3.0,
  };
  const candidate = {
    achievedP19Level: 2, achievedP20Level: 2,
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.0 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 1, variationDbRaw: 5.0 }],
    p14HeadroomDb: 5.0, // +2 dB headroom, nothing else changes
  };
  const result = isMaterialImprovement(current, candidate);
  assert(result.material === false, "Test 13: Headroom-only improvement is NOT material (headroom is not standalone materiality)");
}

// ── Test 14: Severe null reduction >= 3 dB is material ───────────────────
{
  const current = {
    achievedP19Level: 2, achievedP20Level: 2,
    perSeatP19: [
      { seatId: "rsp", isPrimary: true, level: 1, variationDbRaw: 5.0 },
      { seatId: "s1", isPrimary: false, level: 0, variationDbRaw: 12.0 },
    ],
    perSeatP20: [
      { seatId: "rsp", isPrimary: true, level: 1, variationDbRaw: 5.0 },
      { seatId: "s1", isPrimary: false, level: 1, variationDbRaw: 10.0 },
    ],
  };
  const candidate = {
    achievedP19Level: 2, achievedP20Level: 2,
    perSeatP19: [
      { seatId: "rsp", isPrimary: true, level: 1, variationDbRaw: 5.0 },
      { seatId: "s1", isPrimary: false, level: 0, variationDbRaw: 8.5 }, // 3.5 dB null reduction
    ],
    perSeatP20: [
      { seatId: "rsp", isPrimary: true, level: 1, variationDbRaw: 5.0 },
      { seatId: "s1", isPrimary: false, level: 1, variationDbRaw: 7.0 },
    ],
  };
  const result = isMaterialImprovement(current, candidate);
  assert(result.material === true, "Test 14: Severe null reduction 3.5 dB = material");
}

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);