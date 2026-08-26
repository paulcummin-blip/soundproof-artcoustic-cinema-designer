// P18 F3 local 1/3-octave sustained crossing regression fixtures.
//
// Validates that the P18 F3 crossing algorithm:
//   1. Preserves genuine LF extension when a distant modal null exists.
//   2. Does not make weak bass artificially good (poor 1-sub stays poor).
//   3. Makes 2-sub P19/P20 evaluatable (finite P18) instead of null.
//   4. Rejects narrow spikes that would fake deeper extension.
//
// The global sustained walk (OLD algorithm) is included for comparison to
// confirm it would have failed on the pathological cases.

import test from "node:test";
import assert from "node:assert/strict";

// ── 1/3-octave smoothing (matches bassGraphSmoothing.jsx power-domain averaging) ──
function applyBassSmoothingThird(curve) {
  if (!Array.isArray(curve) || curve.length < 3) return curve;
  const sorted = [...curve].sort((a, b) => a.frequency - b.frequency);
  const width = 3;
  return sorted.map(({ frequency, spl }) => {
    const fLow = frequency * Math.pow(2, -0.5 / width);
    const fHigh = frequency * Math.pow(2, 0.5 / width);
    let sumPower = 0;
    let count = 0;
    for (const p of sorted) {
      if (p.frequency < fLow || p.frequency > fHigh) continue;
      sumPower += Math.pow(10, p.spl / 10);
      count++;
    }
    if (count === 0) return { frequency, spl };
    return { frequency, spl: 10 * Math.log10(sumPower / count) };
  });
}

function median(values) {
  if (!values.length) return null;
  const copy = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(copy.length / 2);
  return copy.length % 2 === 0 ? (copy[mid - 1] + copy[mid]) / 2 : copy[mid];
}

// ── Local 1/3-octave sustained crossing (NEW production algorithm) ──
function computeInRoomF3LocalThird(curve) {
  const cleaned = curve
    .filter((p) => Number.isFinite(p.frequency) && Number.isFinite(p.spl))
    .map((p) => ({ frequency: Number(p.frequency), spl: Number(p.spl) }));
  const smoothed = applyBassSmoothingThird(cleaned);
  if (!smoothed.length) return { f3Hz: null, refDb: null, cutoffDb: null };
  const refPoints = smoothed.filter((p) => p.frequency >= 60 && p.frequency <= 200);
  const refValues = (refPoints.length > 0 ? refPoints : smoothed).map((p) => p.spl);
  const refDb = median(refValues);
  if (!Number.isFinite(refDb)) return { f3Hz: null, refDb: null, cutoffDb: null };
  const cutoffDb = refDb - 3;
  const points = smoothed.filter((p) => p.frequency <= 200);
  let f3Hz = null;
  for (let index = 0; index < points.length; index++) {
    if (points[index].spl < cutoffDb) continue;
    const windowEndHz = points[index].frequency * Math.pow(2, 1 / 3);
    let sustained = true;
    for (let j = index; j < points.length; j++) {
      if (points[j].frequency > windowEndHz) break;
      if (points[j].spl < cutoffDb) { sustained = false; break; }
    }
    if (!sustained) continue;
    const previous = points[index - 1];
    if (!previous || previous.spl >= cutoffDb) { f3Hz = points[index].frequency; break; }
    const ratio = (cutoffDb - previous.spl) / (points[index].spl - previous.spl);
    f3Hz = previous.frequency + (points[index].frequency - previous.frequency) * ratio;
    break;
  }
  return { f3Hz, refDb, cutoffDb };
}

// ── Global sustained walk (OLD algorithm — for comparison) ──
function computeInRoomF3GlobalSustained(curve) {
  const cleaned = curve
    .filter((p) => Number.isFinite(p.frequency) && Number.isFinite(p.spl))
    .map((p) => ({ frequency: Number(p.frequency), spl: Number(p.spl) }));
  const smoothed = applyBassSmoothingThird(cleaned);
  if (!smoothed.length) return { f3Hz: null, refDb: null, cutoffDb: null };
  const refPoints = smoothed.filter((p) => p.frequency >= 60 && p.frequency <= 200);
  const refValues = (refPoints.length > 0 ? refPoints : smoothed).map((p) => p.spl);
  const refDb = median(refValues);
  if (!Number.isFinite(refDb)) return { f3Hz: null, refDb: null, cutoffDb: null };
  const cutoffDb = refDb - 3;
  const points = smoothed.filter((p) => p.frequency <= 200);
  let f3Hz = null;
  for (let index = 0; index < points.length; index++) {
    if (points[index].spl < cutoffDb) continue;
    if (points.slice(index).some((p) => p.spl < cutoffDb)) continue;
    const previous = points[index - 1];
    if (!previous || previous.spl >= cutoffDb) { f3Hz = points[index].frequency; break; }
    const ratio = (cutoffDb - previous.spl) / (points[index].spl - previous.spl);
    f3Hz = previous.frequency + (points[index].frequency - previous.frequency) * ratio;
    break;
  }
  return { f3Hz, refDb, cutoffDb };
}

// ── Curve builder: linear interpolation between control points ──
function buildCurve(controlPoints, freqMin = 10, freqMax = 200, step = 0.5) {
  const sorted = controlPoints.slice().sort((a, b) => a.f - b.f);
  const curve = [];
  for (let f = freqMin; f <= freqMax; f += step) {
    let spl;
    if (f <= sorted[0].f) spl = sorted[0].spl;
    else if (f >= sorted[sorted.length - 1].f) spl = sorted[sorted.length - 1].spl;
    else {
      for (let i = 0; i < sorted.length - 1; i++) {
        if (f >= sorted[i].f && f <= sorted[i + 1].f) {
          const span = sorted[i + 1].f - sorted[i].f;
          if (span === 0) { spl = sorted[i].spl; break; }
          const ratio = (f - sorted[i].f) / span;
          spl = sorted[i].spl + (sorted[i + 1].spl - sorted[i].spl) * ratio;
          break;
        }
      }
    }
    curve.push({ frequency: f, spl });
  }
  return curve;
}

// ── Test cases matching confirmed diagnostic fixtures ──
// Dips are wide and deep enough to survive 1/3-octave smoothing below cutoff.

test("4-sub RP22_C: deep bass with distant modal null → local preserves LF extension", () => {
  // Flat 120 dB baseline. Wide dip at 90-130 Hz at 108 dB (12 dB deep).
  // refDb ≈ 120, cutoff ≈ 117. Distant dip stays below cutoff after smoothing.
  // Local should preserve the deep bass; global should fail or jump to ~130 Hz.
  const curve = buildCurve([
    { f: 10, spl: 120 }, { f: 90, spl: 120 }, { f: 95, spl: 108 }, { f: 125, spl: 108 }, { f: 130, spl: 120 }, { f: 200, spl: 120 },
  ]);
  const local = computeInRoomF3LocalThird(curve);
  const global = computeInRoomF3GlobalSustained(curve);
  assert.ok(local.f3Hz !== null, "local F3 must be finite");
  assert.ok(local.f3Hz <= 20, `local F3 should be ≤20 Hz (deep bass preserved), got ${local.f3Hz}`);
  // Global should be erased by the distant dip (null or very high).
  assert.ok(global.f3Hz === null || global.f3Hz > 80,
    `global F3 should be null or >80 Hz (distant dip erases extension), got ${global.f3Hz}`);
});

test("2-sub eba612: LF rolloff with near dip → local gives finite F3, global gives null", () => {
  // Rolloff 124→128 at 28 Hz, 130 at 60 Hz. Deep dip at 42-59 Hz at 112 dB.
  // Dip starts at 42 Hz so 1/3-octave smoothing at 35 Hz (edge of local window
  // [28, 35.3]) does not pick it up. Second dip at 115-135 Hz at 120 dB.
  // refDb ≈ 130, cutoff ≈ 127. Both dips below cutoff after smoothing.
  const curve = buildCurve([
    { f: 10, spl: 124 }, { f: 27, spl: 126 }, { f: 28, spl: 128 },
    { f: 42, spl: 128 }, { f: 46, spl: 112 }, { f: 55, spl: 112 }, { f: 59, spl: 128 },
    { f: 60, spl: 130 }, { f: 115, spl: 130 }, { f: 120, spl: 120 }, { f: 130, spl: 120 }, { f: 135, spl: 130 }, { f: 200, spl: 130 },
  ]);
  const local = computeInRoomF3LocalThird(curve);
  const global = computeInRoomF3GlobalSustained(curve);
  assert.ok(local.f3Hz !== null, "local F3 must be finite (2-sub P19/P20 evaluatable)");
  assert.ok(local.f3Hz > 20 && local.f3Hz <= 35,
    `local F3 should be ~25-30 Hz, got ${local.f3Hz}`);
  assert.ok(global.f3Hz === null || global.f3Hz > 50,
    `global F3 should be null or >50 Hz (dips prevent low crossing), got ${global.f3Hz}`);
});

test("2-sub c9750d: deep bass with small near dip → local preserves LF extension", () => {
  // Flat 120 dB. Dip at 21-24 Hz at 108 dB (12 dB deep). Dip at 65-82 Hz at 108 dB.
  // refDb ≈ 120, cutoff ≈ 117. Both dips below cutoff after smoothing.
  // Small dip at 21 Hz is outside the 1/3-octave window [15, 18.9].
  const curve = buildCurve([
    { f: 10, spl: 120 }, { f: 21, spl: 120 }, { f: 22.5, spl: 108 }, { f: 24, spl: 120 },
    { f: 65, spl: 120 }, { f: 73, spl: 108 }, { f: 82, spl: 120 }, { f: 200, spl: 120 },
  ]);
  const local = computeInRoomF3LocalThird(curve);
  const global = computeInRoomF3GlobalSustained(curve);
  assert.ok(local.f3Hz !== null, "local F3 must be finite");
  assert.ok(local.f3Hz <= 20, `local F3 should be ≤20 Hz, got ${local.f3Hz}`);
  assert.ok(global.f3Hz === null || global.f3Hz > 60,
    `global F3 should be null or >60 Hz, got ${global.f3Hz}`);
});

test("1-sub eba612: poor extension with deep near dip → local stays poor (~50-70 Hz)", () => {
  // Rolloff 110→122 at 28 Hz. Deep wide dip at 30-62 Hz at 104 dB (18 dB deep).
  // Second dip at 80-105 Hz at 110 dB (12 dB deep).
  // refDb ≈ 122, cutoff ≈ 119. Both dips below cutoff after smoothing.
  // Crossing at ~27 Hz rejected (dip at 30 Hz within window [27, 34]).
  // Next crossing at 62 Hz accepted (dip at 80 outside window [62, 78]).
  const curve = buildCurve([
    { f: 10, spl: 110 }, { f: 27, spl: 118 }, { f: 28, spl: 122 },
    { f: 30, spl: 122 }, { f: 35, spl: 104 }, { f: 57, spl: 104 }, { f: 62, spl: 122 },
    { f: 80, spl: 122 }, { f: 85, spl: 110 }, { f: 100, spl: 110 }, { f: 105, spl: 122 }, { f: 200, spl: 122 },
  ]);
  const local = computeInRoomF3LocalThird(curve);
  const global = computeInRoomF3GlobalSustained(curve);
  assert.ok(local.f3Hz !== null, "local F3 must be finite");
  assert.ok(local.f3Hz > 45 && local.f3Hz < 80,
    `local F3 should stay poor (~50-70 Hz), got ${local.f3Hz}`);
  assert.ok(global.f3Hz === null || global.f3Hz > 80,
    `global F3 should be null or >80 Hz, got ${global.f3Hz}`);
});

test("Narrow spike: low spike removed by 1/3-octave smoothing", () => {
  // Baseline 90 dB (below cutoff). Spike at 15 Hz at 96 dB (6 dB above baseline).
  // Rise to 95 dB at 30 Hz. refDb = 95, cutoff = 92.
  // After smoothing, spike at 15 Hz drops below cutoff → F3 at real extension (~30 Hz).
  const curve = buildCurve([
    { f: 10, spl: 90 }, { f: 14, spl: 90 }, { f: 15, spl: 96 }, { f: 16, spl: 90 },
    { f: 29, spl: 90 }, { f: 30, spl: 95 }, { f: 200, spl: 95 },
  ]);
  const local = computeInRoomF3LocalThird(curve);
  assert.ok(local.f3Hz !== null, "local F3 must be finite");
  assert.ok(local.f3Hz > 25,
    `narrow spike at 15 Hz must not fake extension, F3 should be >25 Hz, got ${local.f3Hz}`);
});

test("P18 reference remains 60-200 Hz median (METHOD A, no transition cap)", () => {
  const curve = buildCurve([
    { f: 10, spl: 100 }, { f: 60, spl: 120 }, { f: 200, spl: 120 },
  ]);
  const local = computeInRoomF3LocalThird(curve);
  assert.ok(local.refDb > 119 && local.refDb < 121,
    `refDb should be ~120 (60-200 Hz median), got ${local.refDb}`);
  assert.ok(local.cutoffDb > 116 && local.cutoffDb < 118,
    `cutoffDb should be ~117 (refDb - 3), got ${local.cutoffDb}`);
});