// Verification that the Front Elevation draws edge-to-edge face icons at the
// cabinet's true physical footprint (no vertical inflation, no letterbox white).
// Run: node --import ./test/_alias-register.mjs test/front-elevation-edge-to-edge.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { isFrontSpeakerEdgeToEdge } from "@/components/room/front/frontSpeakerArtworkSizing";
import {
  resolveElevationArtwork,
  ELEVATION_ART_FIT_NORMALISED,
  verifyElevationArtAlignment,
} from "@/components/report/elevation/elevationArtAuthority";

// The drawn box height multiplier the Front Elevation now applies.
function hMultFor(modelKey, cabinetLengthMm) {
  return isFrontSpeakerEdgeToEdge(modelKey, cabinetLengthMm) ? 1.0 : 1.20;
}

test("Evolve 3-1 is edge-to-edge, so the box is the true 270×370 mm footprint", () => {
  assert.equal(isFrontSpeakerEdgeToEdge("evolve-3-1"), true);
  assert.equal(hMultFor("evolve-3-1"), 1.0);
  // 370 mm physical height, drawn at 1.0× — no inflation.
  const drawnHeightMm = 370 * hMultFor("evolve-3-1");
  assert.equal(drawnHeightMm, 370);
});

test("Evolve 3-1 crop aspect matches the physical 270:370 cabinet, so it fills edge-to-edge", () => {
  const resolved = resolveElevationArtwork("evolve_3_1");
  assert.equal(resolved.mode, "approved");
  const cropAspect = resolved.box.width / resolved.box.height;
  const physicalAspect = 270 / 370;
  const drift = Math.abs(cropAspect / physicalAspect - 1);
  assert.ok(drift < 0.01, `crop aspect ${cropAspect} vs physical ${physicalAspect} drift ${(drift * 100).toFixed(2)}%`);
  assert.equal(resolved.fitRatio, ELEVATION_ART_FIT_NORMALISED);
  // Strict alignment check the report uses:
  const alignment = verifyElevationArtAlignment("evolve_3_1", 270, 370);
  assert.ok(alignment.pass, `expected alignment to pass: ${alignment.reason}`);
});

test("the old over-tall 1.2× box would have letterboxed the crop with white above and below", () => {
  // Reproduces the PRE-FIX behaviour to document the bug that was fixed.
  const oldHMult = 1.20;
  const oldDrawnHeightMm = 370 * oldHMult; // 444 mm box
  const cropAspect = 730 / 1005; // evolve_3_1 crop
  const boxAspect = 270 / oldDrawnHeightMm;
  // meet scales by width (crop is relatively wider than the over-tall box), so
  // the drawing fills the width but is shorter than the box height → white band.
  const scale = Math.min(270 / 730, oldDrawnHeightMm / 1005);
  const drawnArtHeightMm = 1005 * scale;
  const whiteBandMm = oldDrawnHeightMm - drawnArtHeightMm;
  assert.ok(whiteBandMm > 50, `expected a >50mm white band pre-fix, got ${whiteBandMm.toFixed(1)}mm`);
  assert.ok(boxAspect < cropAspect, "the over-tall box is narrower-aspect than the crop, so meet letterboxes vertically");
});

test("every normalised Q/Evolve/C face icon is now drawn at its true physical height", () => {
  const cases = [
    ["q4-3", null],
    ["q4-5", null],
    ["q8-5", null],
    ["q6-3", null],
    ["evolve-2-1", null],
    ["evolve-3-1", null],
    ["evolve-4-2", null],
    ["evolve-6-3", null],
    ["evolve-8-4", null],
    ["evolve-1-1", null], // vector face icon, fills its viewBox
    ["c4-1", 1222],
    ["c4-1", 1441],
    ["c4-1", 1711],
    ["c4-1", null], // default fallback (still edge-to-edge for box height)
    ["c-1", null],
  ];
  for (const [mk, len] of cases) {
    assert.equal(
      isFrontSpeakerEdgeToEdge(mk, len),
      true,
      `${mk} (len ${len}) should be edge-to-edge`,
    );
    assert.equal(hMultFor(mk, len), 1.0, `${mk} should have hMult 1.0`);
  }
});

test("a model with no face icon keeps the legacy padded inflation (unchanged behaviour)", () => {
  assert.equal(isFrontSpeakerEdgeToEdge("some-generic-speaker"), false);
  assert.equal(hMultFor("some-generic-speaker"), 1.20);
  assert.equal(isFrontSpeakerEdgeToEdge(""), false);
  assert.equal(isFrontSpeakerEdgeToEdge(null), false);
});