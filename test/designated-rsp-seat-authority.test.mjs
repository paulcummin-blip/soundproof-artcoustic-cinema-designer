// Designated-RSP-Seat Authority — live acceptance test.
//
// Verifies the seat-bound RSP contract:
//   1. buildAuthoritativeRspPosition with a designated seat returns the
//      seat's EXACT x/y/z and carries designatedRspSeatId.
//   2. buildAuthoritativeRspPosition without a designated seat returns the
//      free-floating synthetic coordinates with designatedRspSeatId = null.
//   3. When the canonical RSP uses the designated seat's exact coordinates,
//      the RSP and seat raw/post-EQ curves are identical → P20 = 0 dB / L4
//      for that seat (naturally, no hardcoding).
//   4. Other seats (non-coincident) produce genuine non-zero P20 results.
//   5. Clearing designatedRspSeatId returns the RSP to free-floating mode
//      and the formerly-bound seat becomes a normal non-zero seat.
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

async function loadAuthoritativeRspPosition() {
  const src = await readFile(
    new URL("../src/components/room/bass/authoritativeRspPosition.js", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { buildAuthoritativeRspPosition };`);
  return factory();
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

// Simulate the v13 post-EQ construction for a seat given its raw curve.
// Mirrors canonicalBassOptimiser: maxSpl = raw - 2 dB, then + correction,
// then + globalTrim, then clamp to maxSpl.
function buildPostEqCurve(rawCurve, correction, globalTrimDb) {
  const maxSpl = applySafetyMargin(rawCurve);
  const withCorrection = applyCorrection(maxSpl, correction);
  const withOffset = applyTrim(withCorrection, globalTrimDb);
  return clampToEnvelope(withOffset, maxSpl);
}

test("DESIGNATED RSP SEAT: buildAuthoritativeRspPosition returns exact seat coordinates", async () => {
  const { buildAuthoritativeRspPosition } = await loadAuthoritativeRspPosition();

  const roomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
  const designatedSeat = { id: "seat-2", x: 2.25, y: 3.50, z: 1.20 };

  // Seat-bound: designated seat wins, mlpY_m/mlpX_m are ignored.
  const rspBound = buildAuthoritativeRspPosition(roomDims, 2.99, 2.30, designatedSeat);
  assert.equal(rspBound.id, "rsp");
  assert.equal(rspBound.x, designatedSeat.x, "RSP X must equal designated seat X");
  assert.equal(rspBound.y, designatedSeat.y, "RSP Y must equal designated seat Y");
  assert.equal(rspBound.z, designatedSeat.z, "RSP Z must equal designated seat Z");
  assert.equal(rspBound.designatedRspSeatId, "seat-2", "designatedRspSeatId must be set");
  assert.equal(rspBound.__isSyntheticRsp, true);

  // Free-floating: no designated seat → synthetic point from mlpY_m / centreline.
  const rspFree = buildAuthoritativeRspPosition(roomDims, 3.20, null, null);
  assert.equal(rspFree.x, 2.25, "Free-floating RSP X = room centreline");
  assert.equal(rspFree.y, 3.20, "Free-floating RSP Y = mlpY_m");
  assert.equal(rspFree.z, 1.2);
  assert.equal(rspFree.designatedRspSeatId, null, "Free-floating RSP has null designatedRspSeatId");

  // Free-floating with explicit mlpX_m.
  const rspFreeX = buildAuthoritativeRspPosition(roomDims, 3.20, 2.00, null);
  assert.equal(rspFreeX.x, 2.00, "Free-floating RSP X = explicit mlpX_m when provided");
  assert.equal(rspFreeX.designatedRspSeatId, null);
});

test("DESIGNATED RSP SEAT: Seat 2 bound → P20 = 0 / L4; Seats 1 & 3 non-zero", async () => {
  const { buildAuthoritativeRspPosition } = await loadAuthoritativeRspPosition();
  const { applyBassSmoothing } = await loadSmoothing();
  const { computeOfficialP20Assessment } = await loadP20Assessment(applyBassSmoothing);

  // Row 1: 3 seats. Seat 2 is the designated RSP (centre).
  const seats = [
    { id: "seat-1", x: 1.45, y: 3.50, z: 1.20 },
    { id: "seat-2", x: 2.25, y: 3.50, z: 1.20 },
    { id: "seat-3", x: 3.05, y: 3.50, z: 1.20 },
  ];
  const roomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
  const designatedSeat = seats[1];

  // Canonical RSP = designated seat's exact coordinates.
  const rspPosition = buildAuthoritativeRspPosition(roomDims, 3.50, 2.25, designatedSeat);
  assert.equal(rspPosition.x, designatedSeat.x);
  assert.equal(rspPosition.y, designatedSeat.y);
  assert.equal(rspPosition.z, designatedSeat.z);

  // Build raw curves. The RSP and Seat 2 have IDENTICAL raw curves (they are
  // the same physical point). Seats 1 and 3 have different raw curves (they
  // are at different positions, so different modal excitation).
  const rspRaw = flatCurve(20, 200, 2, 100);
  const seat2Raw = flatCurve(20, 200, 2, 100); // identical to RSP
  const seat1Raw = flatCurve(20, 200, 2, 97);  // different (lower SPL)
  const seat3Raw = flatCurve(20, 200, 2, 103); // different (higher SPL)

  const correction = flatCurve(20, 200, 2, 0);
  const globalTrimDb = -10;

  const rspPostEq = buildPostEqCurve(rspRaw, correction, globalTrimDb);
  const seat2PostEq = buildPostEqCurve(seat2Raw, correction, globalTrimDb);
  const seat1PostEq = buildPostEqCurve(seat1Raw, correction, globalTrimDb);
  const seat3PostEq = buildPostEqCurve(seat3Raw, correction, globalTrimDb);

  // Seat 2 (designated RSP) → P20 = 0 dB / L4
  const p20Seat2 = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-2", responseData: seat2PostEq }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  assert.ok(p20Seat2?.available, "P20 for Seat 2 should be available");
  assert.ok(
    Math.abs(p20Seat2.worstSeat.variationDbRaw) < 0.01,
    `Seat 2 P20 raw should be ≈ 0 dB: ${p20Seat2.worstSeat.variationDbRaw}`,
  );
  assert.equal(Math.floor(Math.abs(p20Seat2.worstSeat.variationDbRaw)), 0, "Seat 2 whole dB = 0");
  assert.equal(p20Seat2.worstSeat.level, 4, "Seat 2 level = L4");

  // Seats 1 and 3 → genuine non-zero P20
  const p20Seat1 = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-1", responseData: seat1PostEq }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  assert.ok(
    Math.abs(p20Seat1.worstSeat.variationDbRaw) > 1.0,
    `Seat 1 P20 should be genuinely non-zero: ${p20Seat1.worstSeat.variationDbRaw}`,
  );

  const p20Seat3 = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-3", responseData: seat3PostEq }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  assert.ok(
    Math.abs(p20Seat3.worstSeat.variationDbRaw) > 1.0,
    `Seat 3 P20 should be genuinely non-zero: ${p20Seat3.worstSeat.variationDbRaw}`,
  );
});

test("DESIGNATED RSP SEAT: Clearing binding → Seat 2 becomes normal non-zero seat", async () => {
  const { buildAuthoritativeRspPosition } = await loadAuthoritativeRspPosition();
  const { applyBassSmoothing } = await loadSmoothing();
  const { computeOfficialP20Assessment } = await loadP20Assessment(applyBassSmoothing);

  const roomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
  const seat2 = { id: "seat-2", x: 2.25, y: 3.50, z: 1.20 };

  // After clearing: designatedRspSeatId = null → free-floating RSP.
  // The RSP moves to a different Y (e.g. 3.20 from manual_position).
  const rspFree = buildAuthoritativeRspPosition(roomDims, 3.20, null, null);
  assert.equal(rspFree.designatedRspSeatId, null, "Cleared RSP has null designatedRspSeatId");
  assert.notEqual(rspFree.y, seat2.y, "Free-floating RSP Y differs from Seat 2 Y");

  // Now the RSP and Seat 2 have DIFFERENT coordinates and DIFFERENT raw curves.
  const rspRaw = flatCurve(20, 200, 2, 100);
  const seat2Raw = flatCurve(20, 200, 2, 96); // different — no longer coincident
  const correction = flatCurve(20, 200, 2, 0);
  const globalTrimDb = -10;

  const rspPostEq = buildPostEqCurve(rspRaw, correction, globalTrimDb);
  const seat2PostEq = buildPostEqCurve(seat2Raw, correction, globalTrimDb);

  const p20Seat2 = computeOfficialP20Assessment({
    rspPostEqCurve: rspPostEq,
    perSeatPostEqCurves: [{ seatId: "seat-2", responseData: seat2PostEq }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  assert.ok(
    Math.abs(p20Seat2.worstSeat.variationDbRaw) > 1.0,
    `After unbind, Seat 2 P20 should be genuinely non-zero: ${p20Seat2.worstSeat.variationDbRaw}`,
  );
  // The whole-dB value must be non-zero (no longer forced to 0 by coincidence).
  const wholeDb = Math.floor(Math.abs(p20Seat2.worstSeat.variationDbRaw));
  assert.ok(wholeDb > 0, `After unbind, Seat 2 whole dB should be > 0: ${wholeDb}`);
});