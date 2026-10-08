// ---------------------------------------------------------------------------
// TEST   Manual screen configuration — persistence and restore
// WHAT   A designer's manual screen size must survive save, refresh, reopen and
//        version switching, and must never be overwritten by any automatic
//        screen sizing or unrelated UI change. One state update was found
//        resetting it: the manual override lives in screen.manualSize, but the
//        fields the app persists (manualMode / manualWidthM / manualHeightM and
//        the serialized record) were never derived from it, so every save wrote
//        "not manual" and the toggle, the dropdown and the dimensions were lost
//        on reload.
// WHY    A manual screen silently reverting to an automatic size makes RP23
//        viewing angles, screen placement and the client design wrong without
//        the designer's knowledge. Severity: HIGH.
//
// The live authority is screen.manualSize. applyManualOverrideToScreen is the
// single wrapper every screen write passes through; manualScreenConfig is the
// single mapping between that state and what a project stores.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  applyManualOverrideToScreen,
} from '@/components/models/screen/resolveEffectiveScreen';
import {
  manualScreenConfigForPersist,
  manualSizeFromPersisted,
} from '@/components/models/screen/manualScreenConfig';

// A designer's manual entry: 2.57 x 1.46 m.
const MANUAL_WH = {
  enabled: true,
  mode: 'wh',
  widthM: 2.57,
  heightM: 1.46,
  diagonalInches: 100,
  aspect: '16:9',
  customAspectW: 16,
  customAspectH: 9,
};

const AUTO_SCREEN = {
  visibleWidthInches: 100,
  aspectRatio: '16:9',
  mountMode: 'baffle',
  floatDepthM: 0,
  heightFromFloorM: 0.5,
  borderThicknessM: 0.08,
  manualSize: { enabled: false, mode: 'diagonal', diagonalInches: 100, widthM: 0, heightM: 0 },
  tvPresetKey: null,
  tvWidthMm: null,
};

test('TEST 1 — enabling manual override and entering dimensions writes the manual state', () => {
  const next = applyManualOverrideToScreen(AUTO_SCREEN, { ...AUTO_SCREEN, manualSize: MANUAL_WH });

  assert.equal(next.manualMode, true, 'the toggle must be recorded as on');
  assert.equal(next.manualWidthM, 2.57);
  assert.equal(next.manualHeightM, 1.46);
  assert.equal(next.visibleWidthInches, 2.57 / 0.0254, 'the drawing uses the manual width');
  assert.equal(next.viewableWidthM, 2.57);
  assert.equal(next.viewableHeightM, 1.46);
});

test('TEST 2 — save then restore round-trips the complete manual configuration', () => {
  const live = applyManualOverrideToScreen(AUTO_SCREEN, { ...AUTO_SCREEN, manualSize: MANUAL_WH });
  const persisted = manualScreenConfigForPersist(live);

  assert.equal(persisted.enabled, true);
  assert.equal(persisted.mode, 'wh');
  assert.equal(persisted.widthM, 2.57);
  assert.equal(persisted.heightM, 1.46);

  // Restore, exactly as hydration does.
  const restored = manualSizeFromPersisted({ screen_manual_config: persisted, manual_width_m: 2.57, manual_height_m: 1.46, manual_dimensions: true });
  assert.equal(restored.enabled, true);
  assert.equal(restored.mode, 'wh');
  assert.equal(restored.widthM, 2.57);
  assert.equal(restored.heightM, 1.46);

  // Re-serialising the restored state must produce the same record, so a freshly
  // opened project can never be seen as dirty or drift on the next save.
  const again = manualScreenConfigForPersist({ ...live, manualSize: restored });
  assert.deepEqual(again, persisted);
});

test('TEST 3 — an override mode is restored, not re-derived', () => {
  const diagonal = manualScreenConfigForPersist({
    manualSize: { enabled: true, mode: 'diagonal', diagonalInches: 116.6, aspect: '2.35:1', widthM: 2.57, heightM: 1.09 },
  });
  assert.equal(diagonal.mode, 'diagonal');

  const restored = manualSizeFromPersisted({ screen_manual_config: diagonal });
  assert.equal(restored.mode, 'diagonal', 'the Width x Height / Diagonal choice survives');
  assert.equal(restored.diagonalInches, 116.6);
  assert.equal(restored.aspect, '2.35:1');
  assert.deepEqual(manualScreenConfigForPersist({ manualSize: restored }), diagonal);
});

test('TEST 4 — unrelated screen writes keep the manual configuration', () => {
  const live = applyManualOverrideToScreen(AUTO_SCREEN, { ...AUTO_SCREEN, manualSize: MANUAL_WH });

  // Changing anything else on the screen (mount mode, setback, border, cavity)
  // must not disturb the manual override.
  const afterUnrelatedChange = applyManualOverrideToScreen(live, {
    ...live,
    mountMode: 'floating',
    floatDepthM: 0.2,
    borderThicknessM: 0.12,
  });

  assert.equal(afterUnrelatedChange.manualSize.enabled, true);
  assert.equal(afterUnrelatedChange.manualMode, true);
  assert.equal(afterUnrelatedChange.manualWidthM, 2.57);
  assert.equal(afterUnrelatedChange.manualHeightM, 1.46);
  assert.equal(afterUnrelatedChange.visibleWidthInches, 2.57 / 0.0254);
});

test('TEST 5 — disabling manual override resumes automatic sizing deliberately', () => {
  const live = applyManualOverrideToScreen(AUTO_SCREEN, { ...AUTO_SCREEN, manualSize: MANUAL_WH });
  const disabled = applyManualOverrideToScreen(live, {
    ...live,
    manualSize: { ...MANUAL_WH, enabled: false },
  });

  assert.equal(disabled.manualMode, false);
  assert.equal(disabled.manualWidthM, 0);
  assert.equal(disabled.manualHeightM, 0);
  assert.equal(disabled.visibleWidthInches, 100, 'the preset width is restored');
  assert.equal(disabled.viewableWidthM, undefined, 'the manual geometry is released');

  // The entered values stay in the control, so re-enabling restores them.
  assert.equal(disabled.manualSize.widthM, 2.57);
  assert.equal(disabled.manualSize.heightM, 1.46);
});

test('TEST 6 — projects saved with the flat fields only still restore', () => {
  const restored = manualSizeFromPersisted({ manual_dimensions: true, manual_width_m: 2.57, manual_height_m: 1.46 });
  assert.equal(restored.enabled, true);
  assert.equal(restored.mode, 'wh');
  assert.equal(restored.widthM, 2.57);
  assert.equal(restored.heightM, 1.46);

  const projectWithNoOverride = manualSizeFromPersisted({ manual_dimensions: false, manual_width_m: 0, manual_height_m: 0 });
  assert.equal(projectWithNoOverride, undefined, 'no override means no manual state');
});

test('TEST 7 — an override switched on before dimensions are entered stays on', () => {
  const pending = { enabled: true, mode: 'wh', widthM: 0, heightM: 0 };
  const next = applyManualOverrideToScreen(AUTO_SCREEN, { ...AUTO_SCREEN, manualSize: pending });

  assert.equal(next.manualMode, true, 'the toggle is the designer’s choice and is not silently dropped');
  assert.equal(next.manualWidthM, 0);
  assert.equal(next.visibleWidthInches, 100, 'with no dimensions the automatic width still applies');

  const persisted = manualScreenConfigForPersist(next);
  assert.equal(persisted.enabled, true);
  const restored = manualSizeFromPersisted({ screen_manual_config: persisted });
  assert.equal(restored.enabled, true);
  assert.equal(restored.mode, 'wh');
});

test('TEST 8 — the manual override is the authority over a TV preset', () => {
  const withTv = { ...AUTO_SCREEN, tvPresetKey: 'tv83', tvWidthMm: 1872 };
  const live = applyManualOverrideToScreen(withTv, { ...withTv, manualSize: MANUAL_WH });

  assert.equal(live.manualMode, true);
  assert.equal(live.visibleWidthInches, 2.57 / 0.0254);
  assert.equal(live.presetTvPresetKey, 'tv83', 'the preset is preserved behind the override');

  const disabled = applyManualOverrideToScreen(live, { ...live, manualSize: { ...MANUAL_WH, enabled: false } });
  assert.equal(disabled.manualMode, false);
  assert.equal(disabled.tvPresetKey, 'tv83', 'the preset returns when the override is switched off');
});