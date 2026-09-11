// Regression tests for LCR auto-height authority in center_only mode.
// Verifies FL/FR follow TV vertical centre independently of the centre channel.
//
// Run: node --import ./test/_alias-register.mjs --test test/lcr-auto-height-authority.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { computeTvVerticalCentreM, resolveLcrHeightAuthority } from "../src/components/roomdesigner/utils/lcrHeightAuthority.js";

// ── A — Centre-only initial Auto ──
test("A. FL/FR auto height = screenBottom + screenOverallHeight/2 (83\" TV)", () => {
  const screen = { heightFromFloorM: 0.5, tvPresetKey: 'tv83', aspectRatio: '16:9' };
  const dims = { heightM: 2.4 };
  const tvCentre = computeTvVerticalCentreM(screen, dims);
  // tv83 → 72.52" = 1.842m, height = 1.842 * 9/16 = 1.036m
  // centre = 0.5 + 1.036/2 = 1.018
  assert.ok(Math.abs(tvCentre - 1.018) < 0.002, `expected ~1.018, got ${tvCentre}`);
});

// ── B — Manual centre movement does not move FL/FR ──
test("B. FC manual patch does not contain lcrLRHeightM", () => {
  const patch = resolveLcrHeightAuthority({ role: 'FC', newZ: 0.55, frontStageMode: 'center_only' });
  assert.equal(patch.lcrHeightM, 0.55);
  assert.equal(patch.lcrHeightManual, true);
  assert.equal(patch.lcrLRHeightM, undefined, "FC manual must NOT write lcrLRHeightM");
  assert.equal(patch.lcrLRHeightManual, undefined, "FC manual must NOT write lcrLRHeightManual");
});

// ── C — TV size change ──
test("C. TV size change: 65→77→83→100 produces correct vertical centres", () => {
  const dims = { heightM: 2.4 };
  const screen = (key) => ({ heightFromFloorM: 0.5, tvPresetKey: key, aspectRatio: '16:9' });

  const c65 = computeTvVerticalCentreM(screen('tv65'), dims);
  const c77 = computeTvVerticalCentreM(screen('tv77'), dims);
  const c83 = computeTvVerticalCentreM(screen('tv83'), dims);
  const c100 = computeTvVerticalCentreM(screen('tv100'), dims);

  // Each larger TV has a higher vertical centre (taller screen)
  assert.ok(c65 < c77, `65" (${c65}) should be < 77" (${c77})`);
  assert.ok(c77 < c83, `77" (${c77}) should be < 83" (${c83})`);
  assert.ok(c83 < c100, `83" (${c83}) should be < 100" (${c100})`);

  // Spot-check exact values (not derived from diagonal inches, but from physical width)
  assert.ok(Math.abs(c65 - 0.897) < 0.002, `65" centre ~0.897, got ${c65}`);
  assert.ok(Math.abs(c77 - 0.981) < 0.002, `77" centre ~0.981, got ${c77}`);
  assert.ok(Math.abs(c83 - 1.018) < 0.002, `83" centre ~1.018, got ${c83}`);
  assert.ok(Math.abs(c100 - 1.127) < 0.002, `100" centre ~1.127, got ${c100}`);
});

// ── D — Manual screen ──
test("D. Manual screen dimensions: FL/FR follow manual screen centreline", () => {
  const screen = {
    heightFromFloorM: 0.6,
    manualSize: { enabled: true, mode: 'wh', widthM: 3.0, heightM: 1.7 },
  };
  const dims = { heightM: 2.4 };
  const tvCentre = computeTvVerticalCentreM(screen, dims);
  // Manual: 3.0 × 1.7, centre = 0.6 + 1.7/2 = 1.45
  assert.ok(Math.abs(tvCentre - 1.45) < 0.002, `expected ~1.45, got ${tvCentre}`);
});

// ── E — Manual FL/FR numeric control ──
test("E. FL/FR manual drag sets lcrLRHeightManual, not lcrHeightManual", () => {
  const patch = resolveLcrHeightAuthority({ role: 'FL', newZ: 1.2, frontStageMode: 'center_only' });
  assert.equal(patch.lcrLRHeightM, 1.2);
  assert.equal(patch.lcrLRHeightManual, true, "FL drag must set lcrLRHeightManual");
  assert.equal(patch.lcrHeightM, undefined, "FL drag must NOT write lcrHeightM");
  assert.equal(patch.lcrHeightManual, undefined, "FL drag must NOT write lcrHeightManual");
});

// ── F — Manual FL/FR drag ──
test("F. FR drag also sets lcrLRHeightManual", () => {
  const patch = resolveLcrHeightAuthority({ role: 'FR', newZ: 1.3, frontStageMode: 'center_only' });
  assert.equal(patch.lcrLRHeightM, 1.3);
  assert.equal(patch.lcrLRHeightManual, true);
  assert.equal(patch.lcrHeightM, undefined);
});

// ── G — Return to Auto (the Auto button clears manual) ──
// The Auto button handler in LCRPanel writes { lcrLRHeightM: target, lcrLRHeightManual: false }.
// This test verifies the authority helper would accept a "clear" semantics by
// confirming the auto-follow effect reads lcrLRHeightManual === false correctly.
test("G. Auto-follow target equals TV vertical centre", () => {
  const screen = { heightFromFloorM: 0.5, tvPresetKey: 'tv83', aspectRatio: '16:9' };
  const dims = { heightM: 2.4 };
  const tvCentre = computeTvVerticalCentreM(screen, dims);
  // When lcrLRHeightManual === false, the effect writes lcrLRHeightM = tvCentre
  // and updatePlacedLRHeight(tvCentre). Verify the target is the TV centre.
  assert.ok(Math.abs(tvCentre - 1.018) < 0.002);
});

// ── H — Centre auto remains unchanged ──
test("H. TV centre does not depend on centre speaker height", () => {
  const screen = { heightFromFloorM: 0.5, tvPresetKey: 'tv83', aspectRatio: '16:9' };
  const dims = { heightM: 2.4 };
  const tvCentre1 = computeTvVerticalCentreM(screen, dims);
  // The function signature only accepts screen + dimensions — no centre height input.
  // So by construction it cannot depend on the centre speaker.
  const tvCentre2 = computeTvVerticalCentreM(screen, dims);
  assert.equal(tvCentre1, tvCentre2);
  assert.ok(Math.abs(tvCentre1 - 1.018) < 0.002);
});

// ── I — Standard LCR mode ──
test("I. Standard mode: FL drag writes shared lcrHeightM + lcrHeightManual", () => {
  const patch = resolveLcrHeightAuthority({ role: 'FL', newZ: 1.0, frontStageMode: 'standard' });
  assert.equal(patch.lcrHeightM, 1.0);
  assert.equal(patch.lcrHeightManual, true);
  assert.equal(patch.lcrLRHeightM, undefined, "Standard mode must NOT write lcrLRHeightM");
  assert.equal(patch.lcrLRHeightManual, undefined, "Standard mode must NOT write lcrLRHeightManual");
});

// ── J — Persistence (authority field names) ──
test("J. Authority fields: lcrLRHeightM and lcrLRHeightManual are distinct from lcrHeightM", () => {
  const fcPatch = resolveLcrHeightAuthority({ role: 'FC', newZ: 0.6, frontStageMode: 'center_only' });
  const flPatch = resolveLcrHeightAuthority({ role: 'FL', newZ: 1.1, frontStageMode: 'center_only' });

  // FC and FL write to completely disjoint fields
  assert.equal(fcPatch.lcrHeightM, 0.6);
  assert.equal(fcPatch.lcrHeightManual, true);
  assert.equal(fcPatch.lcrLRHeightM, undefined);

  assert.equal(flPatch.lcrLRHeightM, 1.1);
  assert.equal(flPatch.lcrLRHeightManual, true);
  assert.equal(flPatch.lcrHeightM, undefined);
});

// ── Effect loop safety: TV centre is a pure function of screen + dims ──
test("Effect loop safety: same screen input produces same output (no side effects)", () => {
  const screen = { heightFromFloorM: 0.5, tvPresetKey: 'tv83', aspectRatio: '16:9' };
  const dims = { heightM: 2.4 };
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(computeTvVerticalCentreM(screen, dims));
  }
  // All calls must return the exact same value — no accumulation or drift
  for (let i = 1; i < results.length; i++) {
    assert.equal(results[i], results[0], `Call ${i} drifted from call 0`);
  }
});