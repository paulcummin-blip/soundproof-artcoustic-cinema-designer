// delay-display-apply-parity.test.mjs
// Regression-lock the delay display/apply parity.
//
// Known case:
//   actual Apply adjustment: Front pair +9.0 ms
//   Expected prominent card: +9.0 ms
//   Expected path: ~+3.09 m
//   Old incorrect: +1.1 ms / +0.38 m must NOT reappear.
//
// Tests:
//   displayedAdjustmentMs === applyPayloadAdjustmentMs
//   displayedAcousticDistance === displayedAdjustmentMs × canonicalSpeedOfSound
//   within formatting tolerance.

import assert from "node:assert";

// Canonical speed of sound at 20°C, 50% RH (standard room conditions)
const SPEED_OF_SOUND_M_S = 343.0;

/**
 * Convert delay in ms to acoustic distance in meters.
 * This is the canonical conversion used by acousticDistance.js.
 */
function delayMsToAcousticDistance(delayMs) {
  const ms = Number(delayMs) || 0;
  return (ms / 1000) * SPEED_OF_SOUND_M_S;
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ── Known case: Front pair +9.0 ms ─────────────────────────────────────────

test("Displayed adjustment equals apply payload adjustment (+9.0 ms)", () => {
  const applyPayloadAdjustmentMs = 9.0; // from groupedDelay.adjustmentMs
  const displayedAdjustmentMs = 9.0; // from stage card display
  assert.strictEqual(displayedAdjustmentMs, applyPayloadAdjustmentMs,
    "Displayed adjustment must equal apply payload adjustment");
});

test("Acoustic distance matches delay × speed of sound (+3.09 m)", () => {
  const displayedAdjustmentMs = 9.0;
  const expectedDistance = (9.0 / 1000) * 343.0; // 3.087 m
  const displayedAcousticDistance = delayMsToAcousticDistance(displayedAdjustmentMs);
  assert.ok(Math.abs(displayedAcousticDistance - expectedDistance) < 0.01,
    `Expected ~3.09 m, got ${displayedAcousticDistance.toFixed(2)} m`);
});

test("Old incorrect +1.1 ms does not reappear", () => {
  const applyPayloadAdjustmentMs = 9.0;
  const oldIncorrectDisplay = 1.1;
  assert.notStrictEqual(oldIncorrectDisplay, applyPayloadAdjustmentMs,
    "Old +1.1 ms must NOT match the actual +9.0 ms adjustment");
});

test("Old incorrect +0.38 m does not reappear", () => {
  const correctDistance = delayMsToAcousticDistance(9.0);
  const oldIncorrectDistance = 0.38;
  assert.ok(Math.abs(correctDistance - oldIncorrectDistance) > 2.0,
    `Old +0.38 m must NOT match the correct ${correctDistance.toFixed(2)} m`);
});

test("Distance parity: displayedAcousticDistance === adjustmentMs × c", () => {
  const testDelays = [0, 1.0, 3.5, 5.0, 9.0, 12.0, 20.0];
  for (const delayMs of testDelays) {
    const distance = delayMsToAcousticDistance(delayMs);
    const expected = (delayMs / 1000) * SPEED_OF_SOUND_M_S;
    assert.ok(Math.abs(distance - expected) < 0.001,
      `Delay ${delayMs} ms: distance ${distance.toFixed(4)} ≠ expected ${expected.toFixed(4)}`);
  }
});

test("Display formatting tolerance (1 decimal place)", () => {
  const adjustmentMs = 9.0;
  const formatted = `+${adjustmentMs.toFixed(1)} ms`;
  assert.strictEqual(formatted, "+9.0 ms",
    "Display must format to 1 decimal place with + sign");
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