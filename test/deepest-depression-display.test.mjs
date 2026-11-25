// test/deepest-depression-display.test.mjs
// Focused tests for the always-display actual deepest bass depression policy.
//
// Verifies:
//   - findDeepestDepressionInBand returns the actual deepest depression in the
//     20-80 Hz band even when it is shallower than the 8 dB broad-depression
//     threshold (a 1-2 dB depression is shown, not hidden behind "None >= 8 dB").
//   - The 8 dB threshold in detectFrequencyDefinedDepressions is unchanged:
//     a shallow depression does NOT count as a broad depression / severe null.
//   - findDeepestDepressionInBand returns null only for too-short curves.
//
// Run: node --import ./test/_alias-register.mjs test/deepest-depression-display.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import {
  detectFrequencyDefinedDepressions,
  findDeepestDepressionInBand,
} from "@/components/room/bass/stage1/stage1NullDetector";

// Build a dense curve with a single flat-bottom dip of `depthDb` centred at
// `centreHz`, flat elsewhere, across 15-200 Hz at 1 Hz steps. The dip is kept
// narrow (~8 Hz total) so the 1/2-octave reference shoulders sit on flat
// ground and the measured depth tracks the nominal depth. This is the same
// kind of synthetic curve the screening band consumes.
function curveWithDip(depthDb, centreHz) {
  const points = [];
  const halfWidthHz = 4;
  for (let f = 15; f <= 200; f += 1) {
    const inDip = f >= centreHz - halfWidthHz && f <= centreHz + halfWidthHz;
    points.push({ frequency: f, spl: 100 - (inDip ? depthDb : 0) });
  }
  return points;
}

test("findDeepestDepressionInBand: a 2 dB depression is reported (not hidden behind 8 dB threshold)", () => {
  const curve = curveWithDip(2, 40);
  const deepest = findDeepestDepressionInBand(curve);
  assert.ok(deepest, "expected a deepest depression to be found");
  assert.ok(deepest.depthDb > 0, "depthDb should be positive");
  assert.ok(deepest.depthDb < 8, "the deepest depression is shallower than the 8 dB threshold");
  assert.ok(deepest.centreHz >= 20 && deepest.centreHz <= 80, "centre is inside the 20-80 Hz screening band");
});

test("findDeepestDepressionInBand: a 1 dB depression is reported", () => {
  const curve = curveWithDip(1, 35);
  const deepest = findDeepestDepressionInBand(curve);
  assert.ok(deepest, "expected a deepest depression");
  assert.ok(deepest.depthDb > 0 && deepest.depthDb < 8);
});

test("detectFrequencyDefinedDepressions: 8 dB threshold unchanged — a 2 dB dip is NOT a broad depression", () => {
  const curve = curveWithDip(2, 40);
  const broad = detectFrequencyDefinedDepressions(curve);
  const inBand = broad.filter((d) => d.centreHz >= 20 && d.centreHz <= 80);
  assert.equal(inBand.length, 0, "a 2 dB dip must not qualify as a broad depression (>= 8 dB)");
});

test("detectFrequencyDefinedDepressions: a deep (15 dB) dip still qualifies as a broad depression", () => {
  const curve = curveWithDip(15, 40);
  const broad = detectFrequencyDefinedDepressions(curve);
  const inBand = broad.filter((d) => d.centreHz >= 20 && d.centreHz <= 80);
  assert.ok(inBand.length >= 1, "a deep dip must still be detected as a broad depression (8 dB threshold unchanged)");
});

test("findDeepestDepressionInBand: returns null for a too-short curve", () => {
  assert.equal(findDeepestDepressionInBand([]), null);
  assert.equal(findDeepestDepressionInBand([{ frequency: 40, spl: 100 }]), null);
});

test("findDeepestDepressionInBand: a deeper depression beats a shallower one", () => {
  const shallow = findDeepestDepressionInBand(curveWithDip(2, 40));
  const deep = findDeepestDepressionInBand(curveWithDip(15, 40));
  assert.ok(deep.depthDb > shallow.depthDb, "the deep dip is deeper than the 2 dB dip");
});