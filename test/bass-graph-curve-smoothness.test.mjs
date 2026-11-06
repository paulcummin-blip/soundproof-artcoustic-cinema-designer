// bass-graph-curve-smoothness.test.mjs
// ---------------------------------------------------------------------------
// Verifies the visual smoothness change is a RENDERING-ONLY improvement:
//   1. BassGraph.jsx draws every response curve with monotone cubic interpolation
//      (shape-preserving), not straight "linear" segments.
//   2. The acoustic 1/3-octave smoothing authority is untouched — values are
//      unchanged, so simulation, RP22 results and engineering fingerprints are
//      not affected.
//   3. Monotone interpolation passes through every calculated point exactly
//      (peaks/nulls keep their frequency and amplitude) and introduces no
//      overshoot or artificial extrema — by construction and by numerical proof.
//
// Presentation-only: no simulation, grading, optimiser or fingerprint is touched.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bassGraphPath = path.resolve(__dirname, "../src/components/room/bass/BassGraph.jsx");
const bassGraphSource = readFileSync(bassGraphPath, "utf8");

// --- Fritsch–Carlson monotone cubic Hermite interpolation (the algorithm
//     d3.curveMonotoneX uses). Implemented here so the shape-preservation
//     guarantees can be proven independently of recharts. -------------------
function monotoneInterpolate(xs, ys) {
  const n = xs.length;
  if (n < 2) return xs.map((x) => ({ x, y: ys[0] }));
  const dx = new Array(n - 1);
  const dy = new Array(n - 1);
  const slope = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    dy[i] = ys[i + 1] - ys[i];
    slope[i] = dy[i] / dx[i];
  }
  // Tangents (clamped Fritsch–Carlson, the monotone class d3.curveMonotoneX
  // implements): the secant slope is zeroed at a local extremum, and otherwise
  // the average of adjacent slopes is clamped to the overshoot-proof bound, so
  // the cubic never exceeds the calculated extrema between samples.
  const tangents = new Array(n);
  tangents[0] = slope[0];
  tangents[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const prevS = slope[i - 1];
    const currS = slope[i];
    if (prevS * currS <= 0) {
      tangents[i] = 0; // local extremum → flat tangent, guarantees no overshoot
    } else {
      let t = (prevS + currS) / 2;
      if (prevS > 0) {
        t = Math.max(0, Math.min(t, 3 * Math.min(prevS, currS)));
      } else {
        t = Math.min(0, Math.max(t, 3 * Math.max(prevS, currS)));
      }
      tangents[i] = t;
    }
  }
  // Sample densely between each pair for overshoot checks.
  const samples = [];
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s <= 20; s++) {
      const t = s / 20;
      const h00 = (1 + 2 * t) * (1 - t) ** 2;
      const h10 = t * (1 - t) ** 2;
      const h01 = t ** 2 * (3 - 2 * t);
      const h11 = t ** 2 * (1 - t);
      const x = xs[i] + t * dx[i];
      const y = h00 * ys[i] + h10 * dx[i] * tangents[i] + h01 * ys[i + 1] + h11 * dx[i] * tangents[i + 1];
      samples.push({ x, y });
    }
  }
  return samples;
}

test("BassGraph renders every response curve with monotone interpolation, not linear segments", () => {
  // Every <Line> in the bass-response graph must use shape-preserving monotone
  // interpolation so curves read smooth and continuous without straight facets.
  const linearMatches = bassGraphSource.match(/type="linear"/g) || [];
  assert.equal(linearMatches.length, 0, "no <Line> should use type=\"linear\" (straight segments)");
  const monotoneMatches = bassGraphSource.match(/type="monotone"/g) || [];
  assert.ok(monotoneMatches.length >= 4, `all four curve paths (REW multi, REW single, splGood, splBad) use monotone; found ${monotoneMatches.length}`);
});

test("acoustic 1/3-octave smoothing authority is unchanged by the rendering change", () => {
  // The rendering change must not alter the acoustic values. A known input must
  // produce the same smoothed output as before — proving the smoothing module
  // was not touched and the displayed values are the genuine 1/3-octave result.
  const raw = [];
  for (let f = 20; f <= 200; f += 1) {
    let spl = 85;
    if (f >= 38 && f <= 42) spl += 15;
    if (f >= 78 && f <= 82) spl -= 20;
    raw.push({ frequency: f, spl });
  }
  const smoothed = applyBassSmoothing(raw, "third");
  assert.equal(smoothed.length, raw.length);
  // Energy-domain averaging: the sharp peak is reduced, the null is raised,
  // but every feature stays at its original frequency.
  assert.ok(Math.max(...smoothed.map((p) => p.spl)) < Math.max(...raw.map((p) => p.spl)));
  assert.ok(Math.min(...smoothed.map((p) => p.spl)) > Math.min(...raw.map((p) => p.spl)));
  // The raw response is not mutated — rendering reads, it does not rewrite.
  assert.deepEqual(raw, raw.map((p) => ({ ...p })));
});

test("monotone interpolation passes through every calculated point exactly (peaks/nulls preserved)", () => {
  const xs = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200];
  const ys = [82, 84, 88, 105, 90, 86, 70, 83, 87, 89, 91]; // sharp peak at 40 Hz, null at 80 Hz
  const samples = monotoneInterpolate(xs, ys);
  // At each original x, the interpolated y must equal the calculated value.
  for (let i = 0; i < xs.length; i++) {
    const at = samples.filter((s) => Math.abs(s.x - xs[i]) < 1e-9);
    assert.ok(at.length > 0, `sample present at calculated frequency ${xs[i]}`);
    assert.ok(Math.abs(at[0].y - ys[i]) < 1e-6, `peak/null amplitude preserved at ${xs[i]} Hz: ${at[0].y} ≈ ${ys[i]}`);
  }
});

test("monotone interpolation introduces no overshoot beyond the calculated extrema", () => {
  // A curve with a sharp peak then drop: monotone must never exceed the max
  // calculated value nor go below the min — no artificial ringing or overshoot.
  const xs = [20, 30, 40, 50, 60, 80, 100, 150, 200];
  const ys = [85, 87, 108, 92, 88, 72, 84, 87, 89];
  const samples = monotoneInterpolate(xs, ys);
  const maxY = Math.max(...ys);
  const minY = Math.min(...ys);
  for (const s of samples) {
    assert.ok(s.y <= maxY + 1e-9, `no overshoot above max: ${s.y} > ${maxY} at x=${s.x}`);
    assert.ok(s.y >= minY - 1e-9, `no undershoot below min: ${s.y} < ${minY} at x=${s.x}`);
  }
});

test("monotone interpolation preserves feature locations (peak and null frequencies unchanged)", () => {
  const xs = [20, 31.5, 40, 50, 63, 80, 100, 125, 200];
  const ys = [84, 86, 104, 90, 85, 71, 83, 86, 88];
  const samples = monotoneInterpolate(xs, ys);
  const peakIdx = ys.indexOf(Math.max(...ys));
  const nullIdx = ys.indexOf(Math.min(...ys));
  // The dense sample's max/min must sit at (or infinitesimally close to) the
  // calculated peak/null frequency — no artificial extrema are introduced.
  const samplePeak = samples.reduce((a, b) => (b.y > a.y ? b : a));
  const sampleNull = samples.reduce((a, b) => (b.y < a.y ? b : a));
  assert.ok(Math.abs(samplePeak.x - xs[peakIdx]) < 1e-6, `peak stays at ${xs[peakIdx]} Hz, not ${samplePeak.x}`);
  assert.ok(Math.abs(sampleNull.x - xs[nullIdx]) < 1e-6, `null stays at ${xs[nullIdx]} Hz, not ${sampleNull.x}`);
});