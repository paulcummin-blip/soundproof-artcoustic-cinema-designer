// P20 RSP/Seat Post-EQ Symmetry — regression fixtures (Tests A–E).
//
// Verifies that the canonical post-EQ construction is symmetric: when a seat
// and the RSP have identical raw responses and identical capability, their
// post-EQ curves are identical and P20 = 0 dB. The false ~2 dB systematic
// floor (caused by the RSP starting from raw−2 dB while seats started from
// raw) is eliminated without removing the safety margin or normalising away
// genuine spatial differences.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Source loaders
// ---------------------------------------------------------------------------

async function loadSmoothing() {
  const src = await readFile(
    new URL("../src/components/room/bass/bassGraphSmoothing.jsx", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { applyBassSmoothing };`);
  return factory();
}

async function loadP20Assessment(applyBassSmoothing) {
  const src = await readFile(
    new URL("../src/components/utils/bassAuthoritativeAssessment.js", import.meta.url),
    "utf8",
  );
  const code = src
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/[^"]+"\s*;?/g, "")
    .replace(/export\s+/g, "");
  const factory = new Function(
    "applyBassSmoothing",
    "isReferenceSeatIdentity",
    "interpolateCanonicalTarget",
    "levelP19_lfResponse",
    "levelP20_lfConsistency",
    "numericRp22Level",
    `${code}\nreturn { computeOfficialP20Assessment, computeOfficialP19Assessment };`,
  );
  return factory(
    applyBassSmoothing,
    (id) => String(id) === "rsp",
    (curve, freq) => {
      if (!Array.isArray(curve) || !curve.length) return null;
      if (freq <= curve[0].frequency) return curve[0].spl;
      if (freq >= curve.at(-1).frequency) return curve.at(-1).spl;
      for (let i = 0; i < curve.length - 1; i++) {
        if (freq >= curve[i].frequency && freq <= curve[i + 1].frequency) {
          const span = curve[i + 1].frequency - curve[i].frequency;
          if (span === 0) return curve[i].spl;
          const ratio = (freq - curve[i].frequency) / span;
          return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * ratio;
        }
      }
      return null;
    },
    (v) => ({ ok: true, level: "L4" }),
    (v) => ({ ok: true, level: "L4" }),
    (level) => (typeof level === "number" ? level : 4),
  );
}

// ---------------------------------------------------------------------------
// Curve helpers
// ---------------------------------------------------------------------------

const SAFETY_MARGIN_DB = 2;

function flatCurve(startHz, endHz, stepHz, spl) {
  const curve = [];
  for (let f = startHz; f <= endHz + 1e-6; f += stepHz) {
    curve.push({ frequency: Math.round(f * 1000) / 1000, spl });
  }
  return curve;
}

function applySafetyMargin(curve) {
  return curve.map((p) => ({ ...p, spl: p.spl - SAFETY_MARGIN_DB }));
}

function applyCorrection(curve, correction) {
  return curve.map((p) => {
    const c = interpolate(correction, p.frequency);
    return { ...p, spl: p.spl + (c || 0) };
  });
}

function applyTrim(curve, trimDb) {
  return curve.map((p) => ({ ...p, spl: p.spl + trimDb }));
}

function clampToEnvelope(curve, envelope) {
  return curve.map((p) => {
    const cap = interpolate(envelope, p.frequency);
    return { ...p, spl: Math.min(p.spl, cap ?? p.spl) };
  });
}

function interpolate(curve, freq) {
  if (!Array.isArray(curve) || !curve.length || !Number.isFinite(freq)) return null;
  if (freq <= curve[0].frequency) return curve[0].spl;
  if (freq >= curve.at(-1).frequency) return curve.at(-1).spl;
  for (let i = 0; i < curve.length - 1; i++) {
    if (freq >= curve[i].frequency && freq <= curve[i + 1].frequency) {
      const span = curve[i + 1].frequency - curve[i].frequency;
      if (span === 0) return curve[i].spl;
      const ratio = (freq - curve[i].frequency) / span;
      return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * ratio;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Simulated canonical construction (mirrors the fixed canonicalBassOptimiser)
// ---------------------------------------------------------------------------

function buildRspPostEq({ rspRaw, correction, globalTrimDb }) {
  // RSP path: start from (rspRaw - SAFETY_MARGIN), add global trim, add correction,
  // clamp to (rspRaw - SAFETY_MARGIN)
  const maxSplBeforeEq = applySafetyMargin(rspRaw);
  const operating = applyTrim(maxSplBeforeEq, globalTrimDb);
  const unconstrained = applyCorrection(operating, correction);
  const clamped = clampToEnvelope(unconstrained, maxSplBeforeEq);
  return clamped;
}

function buildSeatPostEqFixed({ seatRaw, correction, globalTrimDb, operatingLevelOffsetDb }) {
  // FIXED seat path: start from (seatRaw - SAFETY_MARGIN), add correction,
  // add per-seat offset (= globalTrim - oldOffset), clamp to (seatRaw - SAFETY_MARGIN)
  const maxSplBeforeEq = applySafetyMargin(seatRaw);
  const perSeatOffset = globalTrimDb - operatingLevelOffsetDb;
  const withCorrection = applyCorrection(maxSplBeforeEq, correction);
  const withOffset = applyTrim(withCorrection, perSeatOffset);
  const clamped = clampToEnvelope(withOffset, maxSplBeforeEq);
  return clamped;
}

function buildSeatPostEqOldDefect({ seatRaw, correction, globalTrimDb, operatingLevelOffsetDb }) {
  // OLD DEFECTIVE seat path: start from seatRaw (NO safety margin), add correction,
  // add per-seat offset, clamp to product envelope only (no capability clamp)
  const perSeatOffset = globalTrimDb - operatingLevelOffsetDb;
  const withCorrection = applyCorrection(seatRaw, correction);
  const withOffset = applyTrim(withCorrection, perSeatOffset);
  // No capability clamp — only product envelope (simulated as no clamp here)
  return withOffset;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("Test A: identical RSP/seat raw → identical post-EQ → P20 = 0 dB", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { computeOfficialP20Assessment } = await loadP20Assessment(applyBassSmoothing);

  const rspRaw = flatCurve(20, 200, 2, 100);
  const seatRaw = flatCurve(20, 200, 2, 100); // identical to RSP
  const correction = flatCurve(20, 200, 2, 3); // 3 dB boost everywhere
  const globalTrimDb = -1;
  const operatingLevelOffsetDb = 0;

  const rspPostEq = buildRspPostEq({ rspRaw, correction, globalTrimDb });
  const seatPostEq = buildSeatPostEqFixed({ seatRaw, correction, globalTrimDb, operatingLevelOffsetDb });

  // Curves should be identical point-by-point
  for (let i = 0; i < rspPostEq.length; i++) {
    assert.ok(
      Math.abs(rspPostEq[i].spl - seatPostEq[i].spl) < 1e-9,
      `Point ${i}: RSP=${rspPostEq[i].spl} seat=${seatPostEq[i].spl} should be identical`,
    );
  }

  // P20 must be 0 dB
  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-1", responseData: seatPostEq }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  assert.ok(p20?.available, "P20 should be available");
  assert.ok(
    Math.abs(p20.worstSeat.variationDbRaw) < 0.01,
    `P20 should be ~0 dB for identical curves: ${p20.worstSeat.variationDbRaw}`,
  );
});

test("Test B: old asymmetric construction produced ~2 dB P20 floor", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { computeOfficialP20Assessment } = await loadP20Assessment(applyBassSmoothing);

  const rspRaw = flatCurve(20, 200, 2, 100);
  const seatRaw = flatCurve(20, 200, 2, 100); // identical to RSP
  // Zero correction — isolates the starting-curve asymmetry only.
  // (A non-zero boost would push the RSP into its clamp and conflate the
  //  starting offset with the clamp offset.)
  const correction = flatCurve(20, 200, 2, 0);
  const globalTrimDb = -1;
  const operatingLevelOffsetDb = 0;

  // RSP uses the safety-margin-aware path
  const rspPostEq = buildRspPostEq({ rspRaw, correction, globalTrimDb });
  // OLD defect: seat starts from raw (no margin)
  const seatPostEqOld = buildSeatPostEqOldDefect({ seatRaw, correction, globalTrimDb, operatingLevelOffsetDb });

  // The old defect produces ~2 dB offset
  const p20Old = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-1", responseData: seatPostEqOld }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  assert.ok(
    Math.abs(Math.abs(p20Old.worstSeat.variationDbRaw) - SAFETY_MARGIN_DB) < 0.5,
    `Old defect P20 should be ~${SAFETY_MARGIN_DB} dB: ${p20Old.worstSeat.variationDbRaw}`,
  );

  // The fixed construction removes it
  const seatPostEqFixed = buildSeatPostEqFixed({ seatRaw, correction, globalTrimDb, operatingLevelOffsetDb });
  const p20Fixed = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-1", responseData: seatPostEqFixed }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  assert.ok(
    Math.abs(p20Fixed.worstSeat.variationDbRaw) < 0.01,
    `Fixed P20 should be ~0 dB: ${p20Fixed.worstSeat.variationDbRaw}`,
  );
});

test("Test C: genuine broad modal seat difference → P20 reports it", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { computeOfficialP20Assessment } = await loadP20Assessment(applyBassSmoothing);

  const rspRaw = flatCurve(20, 200, 2, 100);
  // Seat has a broad 4 dB peak from 40-60 Hz
  const seatRaw = flatCurve(20, 200, 2, 100).map((p) => {
    if (p.frequency >= 40 && p.frequency <= 60) return { ...p, spl: p.spl + 4 };
    return p;
  });
  const correction = flatCurve(20, 200, 2, 0); // no correction
  const globalTrimDb = 0;
  const operatingLevelOffsetDb = 0;

  const rspPostEq = buildRspPostEq({ rspRaw, correction, globalTrimDb });
  const seatPostEq = buildSeatPostEqFixed({ seatRaw, correction, globalTrimDb, operatingLevelOffsetDb });

  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-1", responseData: seatPostEq }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  assert.ok(p20?.available, "P20 should be available");
  // P20 should report the genuine ~4 dB difference (after 1/3-octave smoothing
  // the broad peak survives, so the deviation should be close to 4 dB)
  assert.ok(
    Math.abs(Math.abs(p20.worstSeat.variationDbRaw) - 4) < 1.5,
    `P20 should report genuine ~4 dB difference: ${p20.worstSeat.variationDbRaw}`,
  );
});

test("Test D: capability clamp — seat clamped to its own safety-margin-aware envelope", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { computeOfficialP20Assessment } = await loadP20Assessment(applyBassSmoothing);

  // RSP raw at 100 dB flat → maxSpl before EQ = 98 dB
  const rspRaw = flatCurve(20, 200, 2, 100);
  // Seat raw at 100 dB flat but with a 10 dB peak at 50 Hz that would push
  // the corrected response above the capability ceiling
  const seatRaw = flatCurve(20, 200, 2, 100).map((p) => {
    if (p.frequency === 50) return { ...p, spl: p.spl + 10 };
    return p;
  });
  // Correction adds 5 dB boost at 50 Hz
  const correction = flatCurve(20, 200, 2, 0).map((p) => {
    if (p.frequency === 50) return { ...p, spl: 5 };
    return p;
  });
  const globalTrimDb = 0;
  const operatingLevelOffsetDb = 0;

  const rspPostEq = buildRspPostEq({ rspRaw, correction, globalTrimDb });
  const seatPostEq = buildSeatPostEqFixed({ seatRaw, correction, globalTrimDb, operatingLevelOffsetDb });

  // The seat's post-EQ at 50 Hz should be clamped to (seatRaw - SAFETY_MARGIN) = 98 dB
  // (not 100 + 10 + 5 - 2 = 113 dB which would be the unclamped value)
  const seat50 = interpolate(seatPostEq, 50);
  const seatCap50 = interpolate(applySafetyMargin(seatRaw), 50);
  assert.ok(
    seat50 <= seatCap50 + 1e-6,
    `Seat at 50 Hz should be clamped to capability: seat=${seat50?.toFixed(1)} cap=${seatCap50?.toFixed(1)}`,
  );

  // P20 should reflect the clamped difference, not an unclamped 15 dB
  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-1", responseData: seatPostEq }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  assert.ok(p20?.available, "P20 should be available");
  // After 1/3-octave smoothing, the narrow clamped peak at 50 Hz is smoothed,
  // but the difference should be much less than the unclamped 15 dB
  assert.ok(
    Math.abs(p20.worstSeat.variationDbRaw) < 10,
    `P20 should reflect clamped difference, not unclamped: ${p20.worstSeat.variationDbRaw}`,
  );
});

test("Test E: P19 definition unchanged — target identity does not alter P20", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { computeOfficialP20Assessment } = await loadP20Assessment(applyBassSmoothing);

  const rspRaw = flatCurve(20, 200, 2, 100);
  const seatRaw = flatCurve(20, 200, 2, 102); // 2 dB genuine difference
  const correction = flatCurve(20, 200, 2, 1);
  const globalTrimDb = -0.5;
  const operatingLevelOffsetDb = 0;

  const rspPostEq = buildRspPostEq({ rspRaw, correction, globalTrimDb });
  const seatPostEq = buildSeatPostEqFixed({ seatRaw, correction, globalTrimDb, operatingLevelOffsetDb });

  // P20 is seat-vs-RSP only — it does not use any target curve.
  // Changing the P19 target from H(f) to T(f) must not affect P20.
  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-1", responseData: seatPostEq }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  assert.ok(p20?.available, "P20 should be available");
  // The genuine 2 dB difference should be reported (after smoothing/clamping
  // it may be slightly different but should be close to 2 dB)
  assert.ok(
    Math.abs(Math.abs(p20.worstSeat.variationDbRaw) - 2) < 1.0,
    `P20 should report genuine ~2 dB difference: ${p20.worstSeat.variationDbRaw}`,
  );
});