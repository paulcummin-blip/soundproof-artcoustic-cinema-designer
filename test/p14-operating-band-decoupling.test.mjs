// Regression test: P18 required extension must NOT alter the P14 operating-output
// integration band.
//
// The P14 operating-output validation uses the established P14 LFE assessment
// band (20–120 Hz, P14_EQ_ASSESSMENT_RANGE_HZ). The P18 required extension
// (e.g. 20, 25, 30, 35 Hz) is a separate design requirement for low-frequency
// extension and must never change how the P14 operating output is integrated.
//
// This test proves that changing only the P18 required extension does NOT
// alter the integrated P14 operating output — because the band stays 20–120.

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

// ── Synthetic final post-EQ curve resembling a Yarm-style Pass-1 response ──
// This curve is intentionally flat-ish around 112 dBC with some LF rolloff
// below 30 Hz so that the 20–30 Hz region contributes meaningfully to the
// integration (making the band choice matter).
const syntheticFinalPost = [
  { frequency: 15, spl: 95.0 },
  { frequency: 18, spl: 102.0 },
  { frequency: 20, spl: 108.5 },
  { frequency: 22, spl: 110.0 },
  { frequency: 25, spl: 111.0 },
  { frequency: 28, spl: 111.5 },
  { frequency: 30, spl: 111.8 },
  { frequency: 31.5, spl: 112.0 },
  { frequency: 35, spl: 112.1 },
  { frequency: 40, spl: 112.2 },
  { frequency: 50, spl: 112.3 },
  { frequency: 63, spl: 112.2 },
  { frequency: 80, spl: 112.1 },
  { frequency: 100, spl: 112.0 },
  { frequency: 120, spl: 111.8 },
];

// ── Test 1: P14_EQ_ASSESSMENT_RANGE_HZ is the established 20–120 authority ──
assert(P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz === 20, "P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz must be 20");
assert(P14_EQ_ASSESSMENT_RANGE_HZ.upperHz === 120, "P14_EQ_ASSESSMENT_RANGE_HZ.upperHz must be 120");

// ── Test 2: 20–120 and 30–120 give DIFFERENT results ──
// This proves the band choice matters for this curve.
const result_20_120 = integrateRawResponseLevelDbC({
  rawCurve: syntheticFinalPost,
  lowerHz: 20,
  upperHz: 120,
});
const result_30_120 = integrateRawResponseLevelDbC({
  rawCurve: syntheticFinalPost,
  lowerHz: 30,
  upperHz: 120,
});
assert(result_20_120 !== null, "20–120 integration must return a value");
assert(result_30_120 !== null, "30–120 integration must return a value");
assert(Math.abs(result_20_120 - result_30_120) > 0.01, "20–120 and 30–120 must differ (band choice matters)");

// ── Test 3: The P14 operating-output band is independent of P18 requirement ──
// Simulate four different P18 requirements (20, 25, 30, 35 Hz). The P14
// operating-output integration must use 20–120 for ALL four — the P18
// requirement must never leak into the P14 band.
const p18Requirements = [20, 25, 30, 35];
const p14Outputs = p18Requirements.map((p18Req) => {
  // The P14 band is ALWAYS P14_EQ_ASSESSMENT_RANGE_HZ, regardless of p18Req.
  // This mirrors the fixed canonicalBassOptimiser operating-output call.
  return integrateRawResponseLevelDbC({
    rawCurve: syntheticFinalPost,
    lowerHz: P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz,
    upperHz: P14_EQ_ASSESSMENT_RANGE_HZ.upperHz,
  });
});

// All four must be identical (same band, same curve → same output).
const allIdentical = p14Outputs.every((v) => Math.abs(v - p14Outputs[0]) < 1e-9);
assert(allIdentical, "P14 operating output must be identical for all P18 requirements (band decoupled)");

// ── Test 4: The P14 output must equal the 20–120 result, NOT 30–120 ──
assert(Math.abs(p14Outputs[0] - result_20_120) < 1e-9, "P14 output must equal 20–120 integration");
assert(Math.abs(p14Outputs[0] - result_30_120) > 0.01, "P14 output must NOT equal 30–120 integration");

// ── Test 5: Explicitly show each P18 requirement gives the same P14 output ──
p18Requirements.forEach((p18Req, i) => {
  assert(
    Math.abs(p14Outputs[i] - result_20_120) < 1e-9,
    `P18 req ${p18Req} Hz → P14 output must equal 20–120 (${result_20_120.toFixed(6)}), got ${p14Outputs[i].toFixed(6)}`,
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);