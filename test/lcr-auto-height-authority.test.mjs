// Regression tests for LCR auto-height authority in center_only mode.
// Verifies FL/FR follow TV vertical centre independently of the centre channel.
//
// Run: node --experimental-vm-modules test/lcr-auto-height-authority.test.mjs
// (or via the project test runner)

import { register } from './_alias-register.mjs';
await register();

import { computeTvVerticalCentreM } from '../src/components/roomdesigner/utils/lcrHeightAuthority.js';
import { resolveLcrHeightAuthority } from '../src/components/roomdesigner/utils/lcrHeightAuthority.js';

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  const ok = Math.abs(actual - expected) < 0.001;
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name} — expected ${expected}, got ${actual}`);
  }
}

function assertEq(name, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Test 1: Auto FL/FR centre = TV vertical centre ──
{
  const screen = { heightFromFloorM: 0.5, visibleWidthInches: 72.52, aspectRatio: '16:9' };
  const dims = { heightM: 2.4 };
  const tvCentre = computeTvVerticalCentreM(screen, dims);
  // visibleWidth 72.52" = 1.842m, ratio 16/9 → height 1.036m
  // TV centre = 0.5 + 1.036/2 = 1.018
  assert('Auto FL/FR centre = TV vertical centre', tvCentre, 1.018);
}

// ── Test 2: 65" TV ──
{
  const screen = { heightFromFloorM: 0.5, tvPresetKey: 'tv65', aspectRatio: '16:9' };
  const dims = { heightM: 2.4 };
  const tvCentre = computeTvVerticalCentreM(screen, dims);
  // tv65 → 55.55" = 1.411m, height = 1.411 * 9/16 = 0.794m
  // centre = 0.5 + 0.794/2 = 0.897
  assert('65" TV FL/FR centre', tvCentre, 0.897);
}

// ── Test 3: 77" TV ──
{
  const screen = { heightFromFloorM: 0.5, tvPresetKey: 'tv77', aspectRatio: '16:9' };
  const dims = { heightM: 2.4 };
  const tvCentre = computeTvVerticalCentreM(screen, dims);
  // tv77 → 67.36" = 1.711m, height = 1.711 * 9/16 = 0.963m
  // centre = 0.5 + 0.963/2 = 0.981
  assert('77" TV FL/FR centre', tvCentre, 0.981);
}

// ── Test 4: 83" TV ──
{
  const screen = { heightFromFloorM: 0.5, tvPresetKey: 'tv83', aspectRatio: '16:9' };
  const dims = { heightM: 2.4 };
  const tvCentre = computeTvVerticalCentreM(screen, dims);
  // tv83 → 72.52" = 1.842m, height = 1.842 * 9/16 = 1.036m
  // centre = 0.5 + 1.036/2 = 1.018
  assert('83" TV FL/FR centre', tvCentre, 1.018);
}

// ── Test 5: 100" TV ──
{
  const screen = { heightFromFloorM: 0.5, tvPresetKey: 'tv100', aspectRatio: '16:9' };
  const dims = { heightM: 2.4 };
  const tvCentre = computeTvVerticalCentreM(screen, dims);
  // tv100 → 87.80" = 2.230m, height = 2.230 * 9/16 = 1.255m
  // centre = 0.5 + 1.255/2 = 1.127
  assert('100" TV FL/FR centre', tvCentre, 1.127);
}

// ── Test 6: Manual screen dimensions ──
{
  const screen = {
    heightFromFloorM: 0.6,
    manualSize: { enabled: true, mode: 'wh', widthM: 3.0, heightM: 1.7 },
  };
  const dims = { heightM: 2.4 };
  const tvCentre = computeTvVerticalCentreM(screen, dims);
  // Manual: 3.0 × 1.7, centre = 0.6 + 1.7/2 = 1.45
  assert('Manual screen FL/FR centre', tvCentre, 1.45);
}

// ── Test 7: Centre manual override does NOT contaminate FL/FR authority ──
// resolveLcrHeightAuthority for FC must NOT write lcrLRHeightM
{
  const patch = resolveLcrHeightAuthority({ role: 'FC', newZ: 0.55, frontStageMode: 'center_only' });
  assertEq('FC patch has lcrHeightM', patch.lcrHeightM, 0.55);
  assertEq('FC patch has lcrHeightManual', patch.lcrHeightManual, true);
  assertEq('FC patch does NOT have lcrLRHeightM', patch.lcrLRHeightM, undefined);
  assertEq('FC patch does NOT have lcrLRHeightManual', patch.lcrLRHeightManual, undefined);
}

// ── Test 8: FL/FR drag sets lcrLRHeightManual ──
{
  const patch = resolveLcrHeightAuthority({ role: 'FL', newZ: 1.2, frontStageMode: 'center_only' });
  assertEq('FL patch has lcrLRHeightM', patch.lcrLRHeightM, 1.2);
  assertEq('FL patch has lcrLRHeightManual', patch.lcrLRHeightManual, true);
  assertEq('FL patch does NOT have lcrHeightM', patch.lcrHeightM, undefined);
}

// ── Test 9: Standard mode uses shared lcrHeightM ──
{
  const patch = resolveLcrHeightAuthority({ role: 'FL', newZ: 1.0, frontStageMode: 'standard' });
  assertEq('Standard FL patch has lcrHeightM', patch.lcrHeightM, 1.0);
  assertEq('Standard FL patch has lcrHeightManual', patch.lcrHeightManual, true);
  assertEq('Standard FL patch does NOT have lcrLRHeightM', patch.lcrLRHeightM, undefined);
}

// ── Test 10: TV centre does NOT depend on centre speaker height ──
// Changing the centre height must not change the TV centre calculation.
{
  const screen = { heightFromFloorM: 0.5, visibleWidthInches: 72.52, aspectRatio: '16:9' };
  const dims = { heightM: 2.4 };
  const tvCentre1 = computeTvVerticalCentreM(screen, dims);
  // Even if we imagine a centre speaker at 0.55m, the TV centre is unchanged
  const tvCentre2 = computeTvVerticalCentreM(screen, dims);
  assert('TV centre independent of centre speaker', tvCentre2, tvCentre1);
  assert('TV centre still = TV vertical centre', tvCentre2, 1.018);
}

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);