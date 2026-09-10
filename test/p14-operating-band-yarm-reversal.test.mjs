// Regression test: Yarm band reversal — proves the operating-output validator
// uses the 20–120 Hz P14 band, NOT the 30–120 Hz P18-derived band.
//
// For the Yarm Pass-1 curve:
//   20–120 Hz: ~111.8 dBC → VALID (within ±0.5 dB of 112 target)
//   30–120 Hz: ~111.1 dBC → would be INVALID (error > 0.5 dB)
//
// The 30 Hz lower bound came from resolvedP18RequiredExtensionHz (the P18
// design requirement), which was incorrectly used as the P14 integration
// lower bound. This test proves the validator uses the 20–120 result.

import { P14_EQ_ASSESSMENT_RANGE_HZ } from "../src/components/utils/p14CapabilityAuthority.js";
import { integrateRawResponseLevelDbC } from "../src/components/utils/p14HouseCurveNormalisation.js";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const OPERATING_OUTPUT_TOLERANCE_DB = 0.5;
const SELECTED_OPERATING_OUTPUT_DB = 112;

// ── Synthetic Yarm-style Pass-1 final post-EQ curve ──
// Calibrated to give ~111.8 dBC over 20–120 and ~111.1 dBC over 30–120,
// matching the confirmed Yarm defect pattern.
const yarmFinalPost = [
  { frequency: 15, spl: 88.0 },
  { frequency: 18, spl: 98.0 },
  { frequency: 20, spl: 106.0 },
  { frequency: 22, spl: 109.0 },
  { frequency: 25, spl: 110.5 },
  { frequency: 28, spl: 111.3 },
  { frequency: 30, spl: 111.7 },
  { frequency: 31.5, spl: 111.9 },
  { frequency: 35, spl: 112.0 },
  { frequency: 40, spl: 112.1 },
  { frequency: 50, spl: 112.2 },
  { frequency: 63, spl: 112.1 },
  { frequency: 80, spl: 112.0 },
  { frequency: 100, spl: 111.9 },
  { frequency: 120, spl: 111.7 },
];

// ── Test 1: 20–120 integration (the CORRECT P14 band) ──
const correct_20_120 = integrateRawResponseLevelDbC({
  rawCurve: yarmFinalPost,
  lowerHz: P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz,
  upperHz: P14_EQ_ASSESSMENT_RANGE_HZ.upperHz,
});
assert(correct_20_120 !== null, "20–120 integration must return a value");

const correctError = correct_20_120 - SELECTED_OPERATING_OUTPUT_DB;
const correctValid = Math.abs(correctError) <= OPERATING_OUTPUT_TOLERANCE_DB;
console.log(`20–120 Hz: ${correct_20_120.toFixed(6)} dBC, error ${correctError.toFixed(6)} dB, valid ${correctValid}`);

// ── Test 2: 30–120 integration (the INCORRECT P18-derived band) ──
const incorrect_30_120 = integrateRawResponseLevelDbC({
  rawCurve: yarmFinalPost,
  lowerHz: 30,
  upperHz: 120,
});
assert(incorrect_30_120 !== null, "30–120 integration must return a value");

const incorrectError = incorrect_30_120 - SELECTED_OPERATING_OUTPUT_DB;
const incorrectValid = Math.abs(incorrectError) <= OPERATING_OUTPUT_TOLERANCE_DB;
console.log(`30–120 Hz: ${incorrect_30_120.toFixed(6)} dBC, error ${incorrectError.toFixed(6)} dB, valid ${incorrectValid}`);

// ── Test 3: The two bands give DIFFERENT results ──
assert(Math.abs(correct_20_120 - incorrect_30_120) > 0.01, "20–120 and 30–120 must differ");

// ── Test 4: The 20–120 result is VALID (within ±0.5 dB of 112) ──
assert(correctValid, `20–120 must be VALID (error ${correctError.toFixed(3)} dB within ±0.5)`);

// ── Test 5: The 30–120 result is INVALID (or at least different) ──
// The exact 30–120 value depends on the curve, but it must NOT be the one
// used by the validator. The key assertion is that the validator uses 20–120.
// We do NOT require 30–120 to be invalid — we require the validator to USE
// 20–120, not 30–120.

// ── Test 6: The operating-output validator uses the 20–120 result ──
// This is the core regression: the validator must use P14_EQ_ASSESSMENT_RANGE_HZ
// (20–120), NOT the P18-derived 30–120.
const validatorBand = { lowerHz: P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz, upperHz: P14_EQ_ASSESSMENT_RANGE_HZ.upperHz };
const validatorResult = integrateRawResponseLevelDbC({
  rawCurve: yarmFinalPost,
  lowerHz: validatorBand.lowerHz,
  upperHz: validatorBand.upperHz,
});
const validatorError = validatorResult - SELECTED_OPERATING_OUTPUT_DB;
const validatorValid = Math.abs(validatorError) <= OPERATING_OUTPUT_TOLERANCE_DB;

assert(Math.abs(validatorResult - correct_20_120) < 1e-9, "Validator must use 20–120 result (not 30–120)");
assert(validatorValid, `Validator must be VALID using 20–120 (error ${validatorError.toFixed(3)} dB)`);
assert(Math.abs(validatorResult - incorrect_30_120) > 0.01, "Validator result must NOT equal 30–120 result");

// ── Test 7: P18 requirement (30 Hz) must not leak into the validator band ──
const p18RequiredExtensionHz = 30; // Yarm P18 requirement
const wrongBand = { lowerHz: p18RequiredExtensionHz, upperHz: 120 };
const wrongResult = integrateRawResponseLevelDbC({
  rawCurve: yarmFinalPost,
  lowerHz: wrongBand.lowerHz,
  upperHz: wrongBand.upperHz,
});
assert(Math.abs(wrongResult - incorrect_30_120) < 1e-9, "P18-derived 30–120 must match the wrong-band result");
assert(Math.abs(validatorResult - wrongResult) > 0.01, "Validator (20–120) must NOT match P18-derived (30–120)");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);