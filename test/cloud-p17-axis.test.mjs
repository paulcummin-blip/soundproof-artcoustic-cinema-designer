/**
 * cloud-p17-axis.test.mjs
 * -----------------------
 * ACCEPTANCE — SPITFIRE CLOUD 0° AXIS AND BUILT-IN TILT HANDLING.
 *
 * 0° for a ceiling speaker is its ACOUSTIC AXIS, not the ceiling vertical. A product with a
 * built-in tilt (Spitfire Cloud: 22°) has its axis rotated from the ceiling normal toward the
 * RSP, so a listener sitting 22° off ceiling vertical in the direction of tilt is ~0° off the
 * axis — not 22°. The tilt is applied by vector geometry and NEVER subtracted as a scalar from
 * a ceiling-vertical angle, which would double-apply it.
 *
 * PART 1 is NUMERIC. The geometry authority is pure and dependency-free, so its real shipped
 * source is read from disk and evaluated here — the numbers below come from the code that
 * ships, not from a copy of its formulas. No aliases and no cross-boundary imports, so this
 * suite runs under plain `node` like the other contract suites in this folder.
 *
 * PART 2 is the SOURCE CONTRACT: every P17 path must go through that one authority, and no
 * path may subtract the tilt.
 *
 *   TEST 1  the built-in tilt resolves to 22° for Spitfire Cloud
 *   TEST 2  ZERO-AXIS: RSP 22° off ceiling vertical resolves to ~0° off the acoustic axis
 *   TEST 3  a seat further out is not discounted: effective = geometric − tilt
 *   TEST 4  without tilt the axis is the ceiling vertical (a flat ceiling speaker)
 *   TEST 5  a seat directly below a tilted speaker is off-axis — the axis is aimed, not down
 *   TEST 6  the geometric ceiling angle is what is reported, and is never graded
 *   TEST 7  both P17 paths consume the one authority; neither subtracts the tilt
 *
 * Run: node test/cloud-p17-axis.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = (relPath) => readFileSync(join(root, relPath), "utf8");

const AXIS_REL = "src/components/utils/rp22/overheadAcousticAxis.js";
const AXIS = src(AXIS_REL);

// Evaluate the authority's real source (it is pure: no imports, no SDK, no side effects).
const evaluateAuthority = () => {
  const body = AXIS.replace(/\bexport\s+/g, "");
  return new Function(
    `${body}
     return { buildOverheadAimedFrame, aimedAxisOffAxisDeg, aimedFrameOffAxisDeg,
              geometricCeilingAngleDeg, resolveOverheadTiltDeg, getOverheadTiltDeg };`,
  )();
};
const GEO = evaluateAuthority();

const round = (v, d = 2) => Number(Number(v).toFixed(d));
const near = (actual, expected, tolerance, message) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message} (expected ${expected} ± ${tolerance}, got ${round(actual)})`,
  );

const CEILING_M = 2.4;
const EAR_M = 1.2;
const DROP_M = CEILING_M - EAR_M;

/** Place a listener at `angleDeg` from ceiling vertical, in the +X direction, for a speaker at the origin. */
const listenerAtCeilingAngle = (angleDeg, speaker = { x: 0, y: 0, z: CEILING_M }) => ({
  x: speaker.x + DROP_M * Math.tan((angleDeg * Math.PI) / 180),
  y: speaker.y,
  z: EAR_M,
});

// ── PART 1 — NUMERIC ────────────────────────────────────────────────────────

/* TEST 1 — the product's tilt resolves from its own declaration */
{
  const tilt = GEO.resolveOverheadTiltDeg({ builtInTiltDeg: 22, polarModel: { axisTiltDeg: 22 } }, "spitfire-cloud");
  assert.equal(tilt, 22, "Spitfire Cloud's built-in tilt must resolve to 22°");
  assert.equal(GEO.resolveOverheadTiltDeg({ builtInTiltDeg: 5 }, "architect-2-1"), 5,
    "Architect 2-1 must resolve its own 5° tilt");
  assert.equal(GEO.resolveOverheadTiltDeg({}, "mikro"), 0,
    "a model with no tilt must resolve to 0°, never to a guess");
}

/* TEST 2 — ZERO AXIS: 22° geometric → ~0° effective */
{
  const speaker = { x: 0, y: 0, z: CEILING_M };
  const tilt = 22;
  const rsp = listenerAtCeilingAngle(22, speaker);

  const frame = GEO.buildOverheadAimedFrame(speaker, rsp, tilt);
  const seatVec = { x: rsp.x - speaker.x, y: rsp.y - speaker.y, z: rsp.z - speaker.z };

  const geometric = GEO.geometricCeilingAngleDeg(seatVec);
  const effective = GEO.aimedAxisOffAxisDeg(frame, seatVec);

  near(geometric, 22, 0.01, "the RSP must sit 22° from ceiling vertical");
  near(effective, 0, 0.05, "a 22° geometric angle against a 22° tilt must resolve to ~0° effective off-axis");
  assert.ok(effective < 5, `the RSP must be well inside the axis, not treated as 22° off it (got ${round(effective)}°)`);
}

/* TEST 3 — the tilt is not a blanket discount: a seat further out keeps its real angle */
{
  const speaker = { x: 0, y: 0, z: CEILING_M };
  const tilt = 22;
  const rsp = listenerAtCeilingAngle(22, speaker);
  const frame = GEO.buildOverheadAimedFrame(speaker, rsp, tilt);

  const seat = listenerAtCeilingAngle(42, speaker);
  const seatVec = { x: seat.x - speaker.x, y: seat.y - speaker.y, z: seat.z - speaker.z };

  const geometric = GEO.geometricCeilingAngleDeg(seatVec);
  const effective = GEO.aimedAxisOffAxisDeg(frame, seatVec);

  near(geometric, 42, 0.01, "the seat must sit 42° from ceiling vertical");
  near(effective, geometric - tilt, 0.05, "effective off-axis must be geometric − tilt, i.e. the axis is applied once");
  assert.ok(effective > 15, `a seat well outside the tilt direction must not be handed a free discount (got ${round(effective)}°)`);
}

/* TEST 4 — no tilt: the axis IS the ceiling vertical */
{
  const speaker = { x: 0, y: 0, z: CEILING_M };
  const rsp = listenerAtCeilingAngle(30, speaker);
  const frame = GEO.buildOverheadAimedFrame(speaker, rsp, 0);
  const seat = listenerAtCeilingAngle(30, speaker);
  const seatVec = { x: seat.x - speaker.x, y: seat.y - speaker.y, z: seat.z - speaker.z };

  near(GEO.aimedAxisOffAxisDeg(frame, seatVec), GEO.geometricCeilingAngleDeg(seatVec), 0.01,
    "with no built-in tilt the effective angle must equal the geometric ceiling angle");
}

/* TEST 5 — a seat straight below a tilted speaker is off-axis: the axis is aimed, not down */
{
  const speaker = { x: 0, y: 0, z: CEILING_M };
  const rsp = listenerAtCeilingAngle(22, speaker);
  const frame = GEO.buildOverheadAimedFrame(speaker, rsp, 22);
  const directlyBelow = { x: 0, y: 0, z: -DROP_M };

  near(GEO.geometricCeilingAngleDeg(directlyBelow), 0, 0.01, "straight down is 0° from ceiling vertical");
  near(GEO.aimedAxisOffAxisDeg(frame, directlyBelow), 22, 0.05,
    "with a 22° tilt the speaker is 22° off-axis at the point straight below it");
}

/* TEST 6 — the geometric angle is reported, and is a different number from the graded one */
{
  const speaker = { x: 0.5, y: 3.6, z: CEILING_M };
  const rsp = { x: 0, y: 3.0, z: EAR_M };
  const tilt = 22;
  const frame = GEO.buildOverheadAimedFrame(speaker, rsp, tilt);

  const toRsp = { x: rsp.x - speaker.x, y: rsp.y - speaker.y, z: rsp.z - speaker.z };
  const rspGeometric = GEO.geometricCeilingAngleDeg(toRsp);
  const rspEffective = GEO.aimedAxisOffAxisDeg(frame, toRsp);

  assert.ok(rspGeometric > 10, `an off-centre overhead must have a real geometric angle (got ${round(rspGeometric)}°)`);
  near(rspEffective, Math.abs(rspGeometric - tilt), 0.05, "the RSP's effective angle must be |geometric − tilt|");
  assert.notEqual(round(rspGeometric), round(rspEffective),
    "the geometric and effective angles are different quantities and must both be reported");
}

// ── PART 2 — SOURCE CONTRACT ────────────────────────────────────────────────

/* TEST 7 — one authority, and no scalar tilt subtraction anywhere */
{
  const ENGINE = src("src/components/utils/rp22HfOffAxis.jsx");
  const HUD = src("src/components/utils/computeSeatHudMetrics.jsx");

  for (const [name, file] of [["P17 engine", ENGINE], ["seat HUD", HUD]]) {
    assert.match(file, /overheadAcousticAxis/, `${name} must consume the one acoustic-axis authority`);
  }
  assert.match(HUD, /buildOverheadAimedFrame\(sp3, mlp3, tiltDeg\)/,
    "the seat HUD must build the aimed axis by vector geometry");
  assert.match(HUD, /offAxisDeg = frame[\s\S]{0,120}aimedAxisOffAxisDeg\(frame, seatVec\)/,
    "the seat HUD's effective angle must be measured from the aimed acoustic axis");

  // The double-application pattern: subtracting the tilt from an angle that already contains it.
  assert.doesNotMatch(HUD, /offAxisDeg\s*-\s*builtInTilt/, "the tilt must never be subtracted as a scalar");
  assert.doesNotMatch(ENGINE, /offAxisDeg\s*-\s*tiltDeg/, "the tilt must never be subtracted as a scalar");
  assert.doesNotMatch(ENGINE, /Math\.max\(0,\s*offAxisDeg\s*-/, "no clamped scalar tilt discount may remain");

  // The measured path must report the geometric ceiling angle AND the axis basis.
  assert.match(ENGINE, /geometricAngleDeg: quantiseAngleDown\(geometricAngleDeg, 0\.5\)/,
    "the measured path must publish the geometric ceiling angle");
  assert.match(ENGINE, /axisBasis: "acoustic_axis"/, "the overhead path must declare the acoustic-axis basis");
  assert.match(ENGINE, /axisBasis: "wall_normal"/, "the bed-layer path must declare its wall-normal basis");
  assert.match(src("src/components/utils/rp22/p17CoverageWindows.js"), /l4Deg|L4/,
    "coverage windows are untouched by the axis correction");
}

console.log("cloud-p17-axis: all checks passed");