// Exact-Coordinate P20 Fixture — deterministic unit test where the seat and
// RSP have EXACTLY identical coordinates and raw responses. This is the
// hardest possible test of the RSP-zero-reference principle: when seat and
// RSP are physically coincident, P20 MUST be exactly 0 dB / L4, and the
// final post-EQ curves MUST be identical point-by-point apart from
// floating-point noise.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
    `${code}\nreturn { computeOfficialP20Assessment };`,
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

function applyTrim(curve, trimDb) {
  return curve.map((p) => ({ ...p, spl: p.spl + trimDb }));
}

function applyCorrection(curve, correction) {
  return curve.map((p) => {
    const c = correction.find((cp) => cp.frequency === p.frequency);
    return { ...p, spl: p.spl + (c?.spl || 0) };
  });
}

function clampToEnvelope(curve, envelope) {
  return curve.map((p) => {
    const cap = envelope.find((cp) => cp.frequency === p.frequency);
    return { ...p, spl: Math.min(p.spl, cap?.spl ?? p.spl) };
  });
}

test("EXACT-COORDINATE FIXTURE: coincident seat/RSP → P20 = 0 dB / L4, curves identical", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { computeOfficialP20Assessment } = await loadP20Assessment(applyBassSmoothing);

  // Exactly identical coordinates: seat (1.36, 2.50, 1.20) == RSP (1.36, 2.50, 1.20)
  // Identical raw response (100 dB flat), identical capability
  const rspRaw = flatCurve(20, 200, 2, 100);
  const seatRaw = flatCurve(20, 200, 2, 100); // EXACTLY identical
  // Zero correction + large negative trim so neither curve hits the capability
  // clamp — isolates the offset asymmetry without clamp masking.
  const correction = flatCurve(20, 200, 2, 0);
  const globalTrimDb = -10;
  const operatingLevelOffsetDb = -5.0; // non-zero — must NOT affect P20

  // RSP path (mirrors canonicalBassOptimiser v13)
  const rspMaxSpl = applySafetyMargin(rspRaw);
  const rspOperating = applyTrim(rspMaxSpl, globalTrimDb);
  const rspUnconstrained = applyCorrection(rspOperating, correction);
  const rspPostEq = clampToEnvelope(rspUnconstrained, rspMaxSpl);

  // Seat path (v13 fix: perSeatOffset = globalTrimDb, NO - operatingLevelOffsetDb)
  const seatMaxSpl = applySafetyMargin(seatRaw);
  const seatWithCorrection = applyCorrection(seatMaxSpl, correction);
  const seatWithOffset = applyTrim(seatWithCorrection, globalTrimDb); // just globalTrimDb
  const seatPostEq = clampToEnvelope(seatWithOffset, seatMaxSpl);

  // 1. Point-by-point curves identical apart from floating-point noise
  let maxPointDelta = 0;
  for (let i = 0; i < rspPostEq.length; i++) {
    const delta = Math.abs(rspPostEq[i].spl - seatPostEq[i].spl);
    if (delta > maxPointDelta) maxPointDelta = delta;
  }
  assert.ok(
    maxPointDelta < 1e-9,
    `Curves should be identical point-by-point: max delta = ${maxPointDelta}`,
  );

  // 2. P20 raw deviation ≈ 0 dB
  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-coincident", responseData: seatPostEq }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  assert.ok(p20?.available, "P20 should be available");
  assert.ok(
    Math.abs(p20.worstSeat.variationDbRaw) < 0.01,
    `P20 raw deviation should be ≈ 0 dB: ${p20.worstSeat.variationDbRaw}`,
  );

  // 3. Whole dB = 0 (floored)
  const wholeDb = Math.floor(Math.abs(p20.worstSeat.variationDbRaw));
  assert.equal(wholeDb, 0, `Whole dB should be 0: ${wholeDb}`);

  // 4. Level = L4 (0 dB deviation → L4 pass)
  assert.equal(p20.worstSeat.level, 4, `Level should be L4: L${p20.worstSeat.level}`);

  // 5. Confirm the v12 defect would have produced non-zero P20 here
  const seatV12 = applyTrim(seatWithCorrection, globalTrimDb - operatingLevelOffsetDb);
  const seatV12Clamped = clampToEnvelope(seatV12, seatMaxSpl);
  const p20V12 = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-coincident", responseData: seatV12Clamped }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  assert.ok(
    Math.abs(p20V12.worstSeat.variationDbRaw) > 1.0,
    `v12 defect should have produced non-zero P20: ${p20V12.worstSeat.variationDbRaw}`,
  );
});