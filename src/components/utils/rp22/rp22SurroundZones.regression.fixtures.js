/**
 * rp22SurroundZones.regression.fixtures
 * --------------------------------------
 * Regression tests for the canonical RP22 Figure 5-11 surround-zone authority.
 *
 * Authority: CEDIA/CTA-RP22 v1.2 Section 5.6.1, Figure 5-11.
 *
 * Covers:
 *   1. Richer Sounds Liverpool fixture (SL/SR/SBL/SBR all INSIDE)
 *   2. Central directly-behind exclusion (SL/SR OUTSIDE behind center)
 *   3. Left/right rearward lateral membership (SL/SR INSIDE behind sides)
 *   4. 500 mm forward extremity boundary
 *   5. Surround Back front boundary (y < listeningBackY OUTSIDE, y == INSIDE)
 *   6. No-Surround-Back (5.x) — side zones not truncated, back zones inactive
 *   7. Side/role orientation enforcement (SL in right → OUTSIDE, SR in left → OUTSIDE)
 *
 * Run with: node --experimental-vm-modules src/components/utils/rp22/rp22SurroundZones.regression.fixtures.js
 * Or import and call runRp22SurroundZonesRegression() from a test runner.
 */

import {
  computeRp22SurroundZones,
  isInsideSurroundRole,
  hasActiveSurroundBack,
} from "./rp22SurroundZones";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const TOL = 0.0001;

function approxEqual(actual, expected, tol = TOL) {
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(actual - expected) <= tol;
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

let passCount = 0;
let failCount = 0;

function assertInside(label, actual) {
  if (actual !== true) {
    console.error(`FAIL: ${label} — expected INSIDE (true), got ${JSON.stringify(actual)}`);
    failCount++;
    return false;
  }
  console.log(`PASS: ${label} — INSIDE`);
  passCount++;
  return true;
}

function assertOutside(label, actual) {
  if (actual !== false) {
    console.error(`FAIL: ${label} — expected OUTSIDE (false), got ${JSON.stringify(actual)}`);
    failCount++;
    return false;
  }
  console.log(`PASS: ${label} — OUTSIDE`);
  passCount++;
  return true;
}

function assertEqual(actual, expected, label) {
  if (!approxEqual(actual, expected)) {
    console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
    failCount++;
    return false;
  }
  console.log(`PASS: ${label} = ${JSON.stringify(actual)}`);
  passCount++;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Richer Sounds Liverpool fixture
// ═══════════════════════════════════════════════════════════════════════════

const LIVERPOOL_DIMS = { widthM: 4.55, lengthM: 5.0, heightM: 2.4 };
const LIVERPOOL_SEATS = [
  { x: 1.075, y: 1.5, z: 1.2 },
  { x: 3.475, y: 2.800634, z: 1.2 },
];
const LIVERPOOL_MLP = { x: 2.275, y: 2.15, z: 1.2 };

const LIVERPOOL_SPEAKERS = [
  { id: "SL-1", role: "SL", model: "evolve-2-1_s", position: { x: 0.051, y: 3.204386, z: 1.55 } },
  { id: "SR-1", role: "SR", model: "evolve-2-1_s", position: { x: 4.499, y: 3.204386, z: 1.55 } },
  { id: "SBL-1", role: "SBL", model: "evolve-3-1_s", position: { x: 1.185965, y: 4.899, z: 1.55 } },
  { id: "SBR-1", role: "SBR", model: "evolve-3-1_s", position: { x: 3.364035, y: 4.899, z: 1.55 } },
];

function runLiverpoolRegression() {
  console.log("\n── Richer Sounds Liverpool Regression ──");
  const zones = computeRp22SurroundZones({
    seatingPositions: LIVERPOOL_SEATS,
    dimensions: LIVERPOOL_DIMS,
    mlpPoint: LIVERPOOL_MLP,
    hasSurroundBack: true,
  });

  let ok = true;

  // Authority bounds
  const ab = zones?.authorityBounds;
  ok = assertEqual(zones.status, "ok", "Liverpool status") && ok;
  ok = assertEqual(ab?.listeningLeftX, 1.075, "Liverpool listeningLeftX") && ok;
  ok = assertEqual(ab?.listeningRightX, 3.475, "Liverpool listeningRightX") && ok;
  ok = assertEqual(ab?.listeningBackY, 2.800634, "Liverpool listeningBackY") && ok;
  ok = assertEqual(ab?.listeningCenterX, 2.275, "Liverpool listeningCenterX") && ok;

  // Side rear cutoff removed — sideLeft.yMax must be roomRearY, NOT listeningBackY
  ok = assertEqual(zones.sideLeft.yMax, 5.0, "Liverpool sideLeft.yMax == roomRearY (not truncated)") && ok;
  ok = assertEqual(zones.sideRight.yMax, 5.0, "Liverpool sideRight.yMax == roomRearY (not truncated)") && ok;

  // Directly-behind exclusion active
  ok = assertEqual(zones.directlyBehindExclusion?.active, true, "Liverpool directlyBehindExclusion active") && ok;

  // Speaker membership
  const sl = isInsideSurroundRole(0.051, 3.204386, "SL", zones);
  ok = assertInside("Liverpool SL inside sideLeft", sl) && ok;

  const sr = isInsideSurroundRole(4.499, 3.204386, "SR", zones);
  ok = assertInside("Liverpool SR inside sideRight", sr) && ok;

  const sbl = isInsideSurroundRole(1.185965, 4.899, "SBL", zones);
  ok = assertInside("Liverpool SBL inside backLeft", sbl) && ok;

  const sbr = isInsideSurroundRole(3.364035, 4.899, "SBR", zones);
  ok = assertInside("Liverpool SBR inside backRight", sbr) && ok;

  // hasActiveSurroundBack
  const hsb = hasActiveSurroundBack(LIVERPOOL_SPEAKERS);
  ok = assertEqual(hsb, true, "Liverpool hasActiveSurroundBack") && ok;

  return ok;
}

// ═══════════════════════════════════════════════════════════════════════════
// Central directly-behind exclusion
// ═══════════════════════════════════════════════════════════════════════════

function runCentralDirectlyBehindRegression() {
  console.log("\n── Central Directly-Behind Exclusion ──");
  const zones = computeRp22SurroundZones({
    seatingPositions: LIVERPOOL_SEATS,
    dimensions: LIVERPOOL_DIMS,
    mlpPoint: LIVERPOOL_MLP,
    hasSurroundBack: true,
  });

  const ab = zones.authorityBounds;
  const behindY = ab.listeningBackY + 0.30; // 3.100634
  const centerX = ab.listeningCenterX; // 2.275

  let ok = true;

  // Point directly behind center — OUTSIDE for both SL and SR
  const slCenter = isInsideSurroundRole(centerX, behindY, "SL", zones);
  ok = assertOutside("Central-behind as SL → OUTSIDE", slCenter) && ok;

  const srCenter = isInsideSurroundRole(centerX, behindY, "SR", zones);
  ok = assertOutside("Central-behind as SR → OUTSIDE", srCenter) && ok;

  // y == listeningBackY must NOT count as behind (exclusive boundary)
  const onBoundary = isInsideSurroundRole(centerX, ab.listeningBackY, "SL", zones);
  // At y == listeningBackY, the exclusion does NOT fire (y > yMin is false).
  // The point is still outside the sideLeft envelope (centerX > listeningLeftX),
  // so this is OUTSIDE — but due to envelope, not exclusion.
  ok = assertOutside("y == listeningBackY at center → OUTSIDE (envelope, not exclusion)", onBoundary) && ok;

  return ok;
}

// ═══════════════════════════════════════════════════════════════════════════
// Left/right rearward lateral membership
// ═══════════════════════════════════════════════════════════════════════════

function runRearwardLateralRegression() {
  console.log("\n── Left/Right Rearward Lateral Membership ──");
  const zones = computeRp22SurroundZones({
    seatingPositions: LIVERPOOL_SEATS,
    dimensions: LIVERPOOL_DIMS,
    mlpPoint: LIVERPOOL_MLP,
    hasSurroundBack: true,
  });

  const ab = zones.authorityBounds;
  const behindY = ab.listeningBackY + 0.30; // 3.100634

  let ok = true;

  // Left rearward lateral — INSIDE for SL
  const slLeft = isInsideSurroundRole(0.5, behindY, "SL", zones);
  ok = assertInside("Left rearward lateral as SL → INSIDE", slLeft) && ok;

  // Right rearward lateral — INSIDE for SR
  const srRight = isInsideSurroundRole(4.0, behindY, "SR", zones);
  ok = assertInside("Right rearward lateral as SR → INSIDE", srRight) && ok;

  // Left rearward lateral — OUTSIDE for SR (wrong side)
  const srLeft = isInsideSurroundRole(0.5, behindY, "SR", zones);
  ok = assertOutside("Left rearward lateral as SR → OUTSIDE (wrong side)", srLeft) && ok;

  // Right rearward lateral — OUTSIDE for SL (wrong side)
  const slRight = isInsideSurroundRole(4.0, behindY, "SL", zones);
  ok = assertOutside("Right rearward lateral as SL → OUTSIDE (wrong side)", slRight) && ok;

  return ok;
}

// ═══════════════════════════════════════════════════════════════════════════
// 500 mm forward extremity
// ═══════════════════════════════════════════════════════════════════════════

function runForwardExtremityRegression() {
  console.log("\n── 500 mm Forward Extremity ──");
  const zones = computeRp22SurroundZones({
    seatingPositions: LIVERPOOL_SEATS,
    dimensions: LIVERPOOL_DIMS,
    mlpPoint: LIVERPOOL_MLP,
    hasSurroundBack: true,
  });

  const ab = zones.authorityBounds;
  const listeningFrontY = ab.listeningFrontY; // 1.5
  const validLeftX = 0.5; // within sideLeft X range [0, 1.075]

  let ok = true;

  // Forward extremity metadata
  ok = assertEqual(zones.forwardExtremity?.p11Inside, true, "forwardExtremity p11Inside") && ok;
  ok = assertEqual(zones.forwardExtremity?.visualTreatment, "faded", "forwardExtremity visualTreatment") && ok;
  ok = assertEqual(zones.forwardExtremity?.yMin, 1.0, "forwardExtremeY = listeningFrontY - 0.5") && ok;

  // Y = listeningFrontY - 0.499 → INSIDE (within 500 mm extremity)
  const insideForward = isInsideSurroundRole(validLeftX, listeningFrontY - 0.499, "SL", zones);
  ok = assertInside("Y = listeningFrontY - 0.499 as SL → INSIDE", insideForward) && ok;

  // Y = listeningFrontY - 0.501 → OUTSIDE (beyond 500 mm extremity)
  const outsideForward = isInsideSurroundRole(validLeftX, listeningFrontY - 0.501, "SL", zones);
  ok = assertOutside("Y = listeningFrontY - 0.501 as SL → OUTSIDE", outsideForward) && ok;

  // Y = listeningFrontY exactly → INSIDE
  const onFrontLine = isInsideSurroundRole(validLeftX, listeningFrontY, "SL", zones);
  ok = assertInside("Y = listeningFrontY as SL → INSIDE", onFrontLine) && ok;

  return ok;
}

// ═══════════════════════════════════════════════════════════════════════════
// Surround Back front boundary
// ═══════════════════════════════════════════════════════════════════════════

function runSurroundBackFrontBoundaryRegression() {
  console.log("\n── Surround Back Front Boundary ──");
  const zones = computeRp22SurroundZones({
    seatingPositions: LIVERPOOL_SEATS,
    dimensions: LIVERPOOL_DIMS,
    mlpPoint: LIVERPOOL_MLP,
    hasSurroundBack: true,
  });

  const ab = zones.authorityBounds;
  const sblX = 1.185965; // valid backLeft X
  const listeningBackY = ab.listeningBackY; // 2.800634

  let ok = true;

  // SBL at y < listeningBackY → OUTSIDE
  const before = isInsideSurroundRole(sblX, listeningBackY - 0.01, "SBL", zones);
  ok = assertOutside("SBL at y < listeningBackY → OUTSIDE", before) && ok;

  // SBL at y == listeningBackY → INSIDE (inclusive)
  const onBoundary = isInsideSurroundRole(sblX, listeningBackY, "SBL", zones);
  ok = assertInside("SBL at y == listeningBackY → INSIDE", onBoundary) && ok;

  // SBR at y < listeningBackY → OUTSIDE
  const sbrX = 3.364035;
  const sbrBefore = isInsideSurroundRole(sbrX, listeningBackY - 0.01, "SBR", zones);
  ok = assertOutside("SBR at y < listeningBackY → OUTSIDE", sbrBefore) && ok;

  // SBR at y == listeningBackY → INSIDE
  const sbrOn = isInsideSurroundRole(sbrX, listeningBackY, "SBR", zones);
  ok = assertInside("SBR at y == listeningBackY → INSIDE", sbrOn) && ok;

  return ok;
}

// ═══════════════════════════════════════════════════════════════════════════
// No-Surround-Back (5.x) — side zones not truncated
// ═══════════════════════════════════════════════════════════════════════════

function runNoSurroundBackRegression() {
  console.log("\n── No-Surround-Back (5.x) Regression ──");
  const zones = computeRp22SurroundZones({
    seatingPositions: LIVERPOOL_SEATS,
    dimensions: LIVERPOOL_DIMS,
    mlpPoint: LIVERPOOL_MLP,
    hasSurroundBack: false,
  });

  let ok = true;

  // Side zones NOT truncated — yMax == roomRearY
  ok = assertEqual(zones.sideLeft.yMax, 5.0, "5.x sideLeft.yMax == roomRearY") && ok;
  ok = assertEqual(zones.sideRight.yMax, 5.0, "5.x sideRight.yMax == roomRearY") && ok;

  // Side zones use same lateral geometry as with SBL/SBR
  ok = assertEqual(zones.sideLeft.xMin, 0, "5.x sideLeft.xMin == roomLeftX") && ok;
  ok = assertEqual(zones.sideLeft.xMax, 1.075, "5.x sideLeft.xMax == listeningLeftX") && ok;
  ok = assertEqual(zones.sideRight.xMin, 3.475, "5.x sideRight.xMin == listeningRightX") && ok;
  ok = assertEqual(zones.sideRight.xMax, 4.55, "5.x sideRight.xMax == roomRightX") && ok;

  // Back zones inactive
  ok = assertEqual(zones.backLeft?.active, false, "5.x backLeft inactive") && ok;
  ok = assertEqual(zones.backRight?.active, false, "5.x backRight inactive") && ok;

  // Directly-behind exclusion still active (SL/SR still can't sit behind center)
  ok = assertEqual(zones.directlyBehindExclusion?.active, true, "5.x directlyBehindExclusion still active") && ok;

  // SL at Liverpool position still INSIDE (side zone not truncated)
  const sl = isInsideSurroundRole(0.051, 3.204386, "SL", zones);
  ok = assertInside("5.x SL at rearward position → INSIDE", sl) && ok;

  // SBL with hasSurroundBack=false → indeterminate (zone inactive)
  const sbl = isInsideSurroundRole(1.185965, 4.899, "SBL", zones);
  ok = assertEqual(sbl, null, "5.x SBL → indeterminate (backLeft inactive)") && ok;

  return ok;
}

// ═══════════════════════════════════════════════════════════════════════════
// Side/role orientation enforcement
// ═══════════════════════════════════════════════════════════════════════════

function runSideRoleOrientationRegression() {
  console.log("\n── Side/Role Orientation Enforcement ──");
  const zones = computeRp22SurroundZones({
    seatingPositions: LIVERPOOL_SEATS,
    dimensions: LIVERPOOL_DIMS,
    mlpPoint: LIVERPOOL_MLP,
    hasSurroundBack: true,
  });

  let ok = true;

  // SL positioned in the right lateral envelope → OUTSIDE
  const slInRight = isInsideSurroundRole(4.0, 2.0, "SL", zones);
  ok = assertOutside("SL in right envelope → OUTSIDE", slInRight) && ok;

  // SR positioned in the left lateral envelope → OUTSIDE
  const srInLeft = isInsideSurroundRole(0.5, 2.0, "SR", zones);
  ok = assertOutside("SR in left envelope → OUTSIDE", srInLeft) && ok;

  // SBL positioned in the right back zone → OUTSIDE
  const sblInRight = isInsideSurroundRole(3.5, 4.0, "SBL", zones);
  ok = assertOutside("SBL in right back zone → OUTSIDE", sblInRight) && ok;

  // SBR positioned in the left back zone → OUTSIDE
  const sbrInLeft = isInsideSurroundRole(1.0, 4.0, "SBR", zones);
  ok = assertOutside("SBR in left back zone → OUTSIDE", sbrInLeft) && ok;

  return ok;
}

// ═══════════════════════════════════════════════════════════════════════════
// Indeterminate state
// ═══════════════════════════════════════════════════════════════════════════

function runIndeterminateRegression() {
  console.log("\n── Indeterminate State ──");

  // No seats → indeterminate
  const noSeats = computeRp22SurroundZones({
    seatingPositions: [],
    dimensions: LIVERPOOL_DIMS,
    mlpPoint: LIVERPOOL_MLP,
    hasSurroundBack: true,
  });

  let ok = true;
  ok = assertEqual(noSeats.status, "indeterminate", "No seats → indeterminate") && ok;
  ok = assertEqual(noSeats.sideLeft, null, "Indeterminate sideLeft null") && ok;
  ok = assertEqual(noSeats.authorityBounds, null, "Indeterminate authorityBounds null") && ok;

  // isInsideSurroundRole with indeterminate zones → null
  const inside = isInsideSurroundRole(1.0, 2.0, "SL", noSeats);
  ok = assertEqual(inside, null, "Indeterminate isInsideSurroundRole → null") && ok;

  return ok;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main runner
// ═══════════════════════════════════════════════════════════════════════════

export function runRp22SurroundZonesRegression() {
  passCount = 0;
  failCount = 0;

  let allPass = true;
  allPass = runLiverpoolRegression() && allPass;
  allPass = runCentralDirectlyBehindRegression() && allPass;
  allPass = runRearwardLateralRegression() && allPass;
  allPass = runForwardExtremityRegression() && allPass;
  allPass = runSurroundBackFrontBoundaryRegression() && allPass;
  allPass = runNoSurroundBackRegression() && allPass;
  allPass = runSideRoleOrientationRegression() && allPass;
  allPass = runIndeterminateRegression() && allPass;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`RP22 Surround Zones Regression: ${passCount} passed, ${failCount} failed`);
  console.log(allPass ? "ALL TESTS PASSED" : "SOME TESTS FAILED");
  console.log(`${"=".repeat(60)}`);

  return allPass;
}

// Fixtures are run by importing runRp22SurroundZonesRegression() from a test runner.