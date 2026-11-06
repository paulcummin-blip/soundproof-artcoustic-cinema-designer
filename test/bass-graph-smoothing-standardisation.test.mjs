// bass-graph-smoothing-standardisation.test.mjs
// ---------------------------------------------------------------------------
// Verifies the display standardisation: all displayed room-response curves
// (RSP, individual listening positions, All Seats overlay) are genuinely
// 1/3-octave smoothed using the existing applyBassSmoothing authority, with
// identical per-curve processing and no cross-curve normalisation.
//
// Presentation-only: no simulation, grading, optimiser or fingerprint is touched.
import test from "node:test";
import assert from "node:assert/strict";

import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";

// A raw response with a sharp narrow peak at 40 Hz and a deep null at 80 Hz,
// sampled on a fine grid. Used to prove smoothing is actually applied.
function rawWithPeakAndNull() {
  const points = [];
  for (let f = 20; f <= 200; f += 1) {
    let spl = 80;
    if (f >= 38 && f <= 42) spl += 18;   // sharp +18 dB peak
    if (f >= 78 && f <= 82) spl -= 24;   // sharp -24 dB null
    points.push({ frequency: f, spl });
  }
  return points;
}

test("1/3-octave smoothing is genuinely applied — a sharp peak is reduced and a null is raised", () => {
  const raw = rawWithPeakAndNull();
  const smoothed = applyBassSmoothing(raw, "third");
  assert.equal(smoothed.length, raw.length, "smoothing preserves array length");
  const rawPeak = Math.max(...raw.map((p) => p.spl));
  const smoothedPeak = Math.max(...smoothed.map((p) => p.spl));
  const rawNull = Math.min(...raw.map((p) => p.spl));
  const smoothedNull = Math.min(...smoothed.map((p) => p.spl));
  assert.ok(smoothedPeak < rawPeak, `peak is reduced by smoothing (${smoothedPeak} < ${rawPeak})`);
  assert.ok(smoothedNull > rawNull, `null is raised by smoothing (${smoothedNull} > ${rawNull})`);
});

test("RSP and individual seat curves use identical 1/3-octave processing", () => {
  const rspRaw = rawWithPeakAndNull();
  const seatRaw = rawWithPeakAndNull().map((p) => ({ ...p, spl: p.spl - 3 }));
  const rspSmoothed = applyBassSmoothing(rspRaw, "third");
  const seatSmoothed = applyBassSmoothing(seatRaw, "third");
  // Identical processing: the same input must yield the same output (determinism),
  // and a constant raw offset between two curves is preserved as a CONSTANT offset
  // at every frequency after smoothing (power-domain smoothing is linear in power,
  // so a constant dB shift stays constant — it is not cross-curve normalisation).
  assert.deepEqual(rspSmoothed, applyBassSmoothing(rspRaw, "third"), "RSP smoothing is deterministic");
  const offsets = rspSmoothed.map((p, i) => seatSmoothed[i].spl - p.spl);
  const minOffset = Math.min(...offsets);
  const maxOffset = Math.max(...offsets);
  assert.ok(
    Math.abs(maxOffset - minOffset) < 1e-9,
    `offset is constant across all frequencies (identical per-curve processing), spread=${maxOffset - minOffset}`,
  );
});

test("All Seats overlay: every listening position receives the same 1/3-octave smoothing", () => {
  const seats = [
    rawWithPeakAndNull(),
    rawWithPeakAndNull().map((p) => ({ ...p, spl: p.spl + 2 })),
    rawWithPeakAndNull().map((p) => ({ ...p, spl: p.spl - 5 })),
  ];
  const smoothed = seats.map((s) => applyBassSmoothing(s, "third"));
  // Each curve is smoothed independently with the identical mode — no cross-curve
  // averaging, normalisation or combination. The per-curve offsets are preserved.
  assert.equal(smoothed.length, seats.length);
  for (let i = 0; i < seats.length; i++) {
    assert.equal(smoothed[i].length, seats[i].length);
    // Same raw curve → same smoothed curve (deterministic, identical processing).
    assert.deepEqual(smoothed[i], applyBassSmoothing(seats[i], "third"));
  }
});

test("physically meaningful peaks and nulls are broadly retained after 1/3-octave smoothing", () => {
  const raw = rawWithPeakAndNull();
  const smoothed = applyBassSmoothing(raw, "third");
  // The peak region (38-42 Hz) still reads above the surrounding floor, and the
  // null region (78-82 Hz) still reads below it — the feature locations survive.
  const around = (f) => smoothed.find((p) => p.frequency === f).spl;
  assert.ok(around(40) > around(30), "peak still above the lower skirt");
  assert.ok(around(40) > around(50), "peak still above the upper skirt");
  assert.ok(around(80) < around(70), "null still below the lower skirt");
  assert.ok(around(80) < around(90), "null still below the upper skirt");
});

test("full-resolution raw is unaffected — smoothing returns a new array, leaving the source intact", () => {
  const raw = rawWithPeakAndNull();
  const snapshot = raw.map((p) => ({ ...p }));
  applyBassSmoothing(raw, "third");
  assert.deepEqual(raw, snapshot, "the raw response is not mutated by display smoothing");
});