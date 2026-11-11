// test/global-level-alignment-ceiling.test.mjs
//
// Regression test for the P0 global-level-alignment ceiling constraint.
//
// The global level alignment must never select a positive trim that would
// exceed the frequency-dependent usable-output ceiling, even when scalar P14
// headroom would permit it. This is the defect that allowed a +4.5 dB
// alignment in the Cable Smart / Original Design case, which would have
// exceeded the 52.69 Hz ceiling by ~2.34 dB.
//
// Run: node --import ./test/_alias-register.mjs test/global-level-alignment-ceiling.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { performGlobalLevelAlignment } from "@/components/room/bass/globalLevelAlignment";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeCurve(splFn) {
  const curve = [];
  for (let f = 15; f <= 200; f += (f < 50 ? 1 : f < 100 ? 2 : 5)) {
    curve.push({ frequency: f, spl: splFn(f) });
  }
  return curve;
}

// Flat 100 dB response, flat 100 dB target → P19 = 0 at offset 0.
const flatRsp = makeCurve(() => 100);
const flatTarget = makeCurve(() => 100);

// Ceiling 3 dB above the response everywhere → 3 dB of ceiling headroom.
const ceiling3 = makeCurve(() => 103);

// Ceiling that is only 2 dB above the response near 52.69 Hz, but 10 dB elsewhere.
const ceilingBinding52 = makeCurve((f) => (Math.abs(f - 52.69) < 1 ? 102 : 110));

// ── Tests ─────────────────────────────────────────────────────────────────

test("ceiling limits positive trim to the frequency-dependent bound", () => {
  const result = performGlobalLevelAlignment({
    rspPostEqCurve: flatRsp,
    canonicalTargetCurve: flatTarget,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    p14HeadroomDb: 6,
    maximumOutputCurve: ceilingBinding52,
  });
  assert.ok(result.upwardBoundDb <= 2 + 0.01,
    `upwardBoundDb should be <= 2, got ${result.upwardBoundDb}`);
  assert.ok(result.recommendedTrimDb <= 2 + 0.01,
    `recommendedTrimDb should be <= 2, got ${result.recommendedTrimDb}`);
  assert.equal(result.ceilingLimited, true);
  assert.ok(result.bindingFrequencyHz != null, "bindingFrequencyHz should be set");
  assert.ok(Math.abs(result.bindingFrequencyHz - 52.69) < 2,
    `bindingFrequencyHz near 52.69, got ${result.bindingFrequencyHz}`);
});

test("ceiling rejects +4.5 dB alignment when only +2 dB is deliverable", () => {
  const result = performGlobalLevelAlignment({
    rspPostEqCurve: flatRsp,
    canonicalTargetCurve: flatTarget,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    p14HeadroomDb: 4.5,
    maximumOutputCurve: ceilingBinding52,
  });
  assert.ok(result.recommendedTrimDb <= 2 + 0.01,
    `+4.5 dB should be rejected, recommendedTrimDb=${result.recommendedTrimDb}`);
  assert.equal(result.ceilingLimited, true);
});

test("ceiling does not restrict downward trim", () => {
  const highRsp = makeCurve(() => 105);
  const result = performGlobalLevelAlignment({
    rspPostEqCurve: highRsp,
    canonicalTargetCurve: flatTarget,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    p14HeadroomDb: 0,
    maximumOutputCurve: ceiling3,
  });
  assert.ok(result.recommendedTrimDb < 0,
    `should recommend negative trim, got ${result.recommendedTrimDb}`);
  assert.ok(result.alignedP19Db < 5,
    `aligned P19 should improve, got ${result.alignedP19Db}`);
});

test("uses the more restrictive of P14 headroom and ceiling", () => {
  const result = performGlobalLevelAlignment({
    rspPostEqCurve: flatRsp,
    canonicalTargetCurve: flatTarget,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    p14HeadroomDb: 1,
    maximumOutputCurve: ceiling3,
  });
  assert.ok(Math.abs(result.upwardBoundDb - 1) < 0.01,
    `P14 should bind at 1 dB, got ${result.upwardBoundDb}`);
  assert.equal(result.ceilingLimited, false);
});

test("result carries frequency-dependent headroom and binding frequency", () => {
  const result = performGlobalLevelAlignment({
    rspPostEqCurve: flatRsp,
    canonicalTargetCurve: flatTarget,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    p14HeadroomDb: 6,
    maximumOutputCurve: ceilingBinding52,
  });
  assert.ok(result.frequencyDependentHeadroomDb != null);
  assert.ok(result.bindingFrequencyHz != null);
  assert.ok(result.p19WorstFrequencyHz !== undefined,
    "p19WorstFrequencyHz should be present");
});

test("falls back to P14-only when no ceiling is provided", () => {
  const result = performGlobalLevelAlignment({
    rspPostEqCurve: flatRsp,
    canonicalTargetCurve: flatTarget,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    p14HeadroomDb: 4,
    maximumOutputCurve: null,
  });
  assert.ok(Math.abs(result.upwardBoundDb - 4) < 0.01,
    `P14 should bind at 4 dB, got ${result.upwardBoundDb}`);
  assert.equal(result.ceilingLimited, false);
  assert.equal(result.frequencyDependentHeadroomDb, null);
});