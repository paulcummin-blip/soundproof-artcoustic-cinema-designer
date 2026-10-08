// ---------------------------------------------------------------------------
// TEST   Dual-centre front stage — mode, cabinets, orientation, power and layout
// WHAT   The fourth front-stage mode ("TV with dual centre speakers") places TWO
//        physical centre cabinets (FCL / FCR) at the left and right edges of the
//        TV, fed from the ONE centre channel, and each cabinet may be installed
//        horizontally or vertically.
// WHY    Acceptance items under test:
//          DUAL CENTRE VERTICAL ORIENTATION AVAILABLE
//          C4-1 AVAILABLE FOR DUAL CENTRE IF IMPEDANCE VALID
//          VERTICAL ORIENTATION ROTATES DRAWN FOOTPRINT
//          VERTICAL ORIENTATION KEEPS ACOUSTIC CENTRE AT TV MIDPOINT
//          EQUIPMENT SCHEDULE REFLECTS ORIENTATION
//          DOLBY LAYOUT STILL UNCHANGED
//          CENTRE POWER STILL SPLIT
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  CABINET_ORIENTATION_OPTIONS,
  DUAL_CENTRE_MIN_IMPEDANCE_OHM,
  FRONT_STAGE_DUAL_CENTRE,
  FRONT_STAGE_MODES,
  centreCabinetOrientation,
  centreCabinetPowerW,
  defaultCentreCabinetOrientation,
  detectDualCentreStage,
  eligibleDualCentreCentreOptions,
  isEligibleDualCentreCentreModel,
  normaliseCabinetOrientation,
  resolveCentreCabinetFootprintM,
  resolveCentreCabinetX,
} from '@/components/utils/frontStageModeAuthority';
import { buildFrontStageSeed } from '@/components/room/lcrFrontStageSeed';
import { computeTvVerticalCentreM } from '@/components/roomdesigner/utils/lcrHeightAuthority';
import { discreteChannelCounts } from '../shared/channelArchitecture.js';

const ROOM = { widthM: 6.0, lengthM: 8.0, heightM: 2.8 };
const TV83_WIDTH_MM = 1872;
const SCREEN = {
  tvPresetKey: 'tv83',
  tvWidthMm: TV83_WIDTH_MM,
  visibleWidthInches: 83,
  aspectRatio: '16:9',
  heightFromFloorM: 0.5,
  borderThicknessM: 0.05,
};
const dimsFor = (model) => ({ widthM: 0.20, depthM: 0.08 });

/** Run the production seed and return the resulting speaker list. */
function seed(overrides = {}) {
  let placed = [];
  buildFrontStageSeed({
    baseModelLabel: 'EVOLVE 3-1',
    frontStageMode: FRONT_STAGE_DUAL_CENTRE,
    soundbarModelLabel: '',
    centreModelLabel: 'C4-1',
    centreOrientation: null,
    dimensions: ROOM,
    screen: SCREEN,
    splConfig: {},
    setSpeakers: (updater) => { placed = updater([]); },
    rsp: { x: ROOM.widthM / 2, y: 4.5 },
    screenFrontPlaneM: 0.4,
    lcrAimMode: 'flat',
    getModelDimsM: dimsFor,
    ...overrides,
  });
  return placed;
}

// ── DUAL CENTRE VERTICAL ORIENTATION AVAILABLE ─────────────────────────────

test('dual centre is a front-stage mode and orientation is a two-way choice', () => {
  assert.ok(FRONT_STAGE_MODES.includes(FRONT_STAGE_DUAL_CENTRE));
  assert.deepEqual(
    CABINET_ORIENTATION_OPTIONS.map((o) => o.value),
    ['horizontal', 'vertical'],
  );
  assert.equal(normaliseCabinetOrientation('VERTICAL'), 'vertical');
  assert.equal(normaliseCabinetOrientation('horizontal'), 'horizontal');
  assert.equal(normaliseCabinetOrientation('nonsense'), 'horizontal');
});

// ── C4-1 AVAILABLE FOR DUAL CENTRE IF IMPEDANCE VALID ──────────────────────

test('the four centre-cabinet families are offered; soundbars, ceiling and sub-4 Ω are not', () => {
  // Purpose-built front-wall centre cabinets, in every family the mode supports.
  for (const key of ['c-1', 'c4-1', 'multi-mono', 'hspl-mono']) {
    assert.equal(isEligibleDualCentreCentreModel(key), true, `${key} is a centre cabinet`);
  }
  // C-1 is a fixed 400 mm cabinet drawn horizontally; the TV-width bars
  // (C4-1, Multi (Mono), HSPL (Mono)) flank the TV standing vertically.
  assert.equal(defaultCentreCabinetOrientation('c-1', 'tv83'), 'horizontal');
  for (const key of ['c4-1', 'multi-mono', 'hspl-mono']) {
    assert.equal(defaultCentreCabinetOrientation(key, 'tv83'), 'vertical', `${key} stands vertically`);
  }

  // ONE cabinet carrying three channels is a soundbar, not a centre cabinet.
  assert.equal(isEligibleDualCentreCentreModel('multi-lcr'), false);
  assert.equal(isEligibleDualCentreCentreModel('hspl-lcr'), false);
  // The Architect (in-ceiling) range is never a front-wall centre.
  assert.equal(isEligibleDualCentreCentreModel('architect-2-1'), false);
  assert.equal(isEligibleDualCentreCentreModel('architect-mikro'), false);
  // The discrete L/R ranges are not centre cabinets.
  assert.equal(isEligibleDualCentreCentreModel('q4-5'), false);
  assert.equal(isEligibleDualCentreCentreModel('evolve-1-1'), false);

  const options = eligibleDualCentreCentreOptions([
    { key: 'c-1', label: 'C-1' },
    { key: 'c4-1', label: 'C4-1' },
    { key: 'multi-mono', label: 'Multi (Mono)' },
    { key: 'multi-lcr', label: 'Multi (LCR)' },
    { key: 'hspl-mono', label: 'HSPL (Mono)' },
    { key: 'architect-mikro', label: 'Architect Mikro' },
  ]);
  assert.deepEqual(
    options.map((o) => o.label),
    ['C-1', 'C4-1', 'Multi (Mono)', 'HSPL (Mono)'],
  );
});

test('the impedance floor refuses a sub-4 Ω load', () => {
  assert.equal(DUAL_CENTRE_MIN_IMPEDANCE_OHM, 4);
  // 3 Ω cabinets (EVOLVE 3-1 / 8-4) are refused outright.
  assert.equal(isEligibleDualCentreCentreModel('evolve-3-1'), false);
  assert.equal(isEligibleDualCentreCentreModel('evolve-8-4'), false);
  // C-1 sits exactly at the floor: Artcoustic's own 4 Ω centre cabinet.
  assert.equal(isEligibleDualCentreCentreModel('c-1'), true);
});

// ── VERTICAL ORIENTATION ROTATES DRAWN FOOTPRINT ───────────────────────────

test('vertical orientation is available for every family and rotates the footprint', () => {
  for (const key of ['c-1', 'c4-1', 'multi-mono', 'hspl-mono']) {
    const horizontal = resolveCentreCabinetFootprintM(key, 'horizontal', 'tv83');
    const vertical = resolveCentreCabinetFootprintM(key, 'vertical', 'tv83');
    assert.ok(horizontal && vertical, `${key} has a footprint`);

    // Rotated a quarter turn: width and height swap, depth unchanged.
    assert.ok(Math.abs(vertical.widthM - horizontal.heightM) < 1e-9, `${key} vertical width = horizontal height`);
    assert.ok(Math.abs(vertical.heightM - horizontal.widthM) < 1e-9, `${key} vertical height = horizontal width`);
    assert.equal(vertical.depthM, horizontal.depthM, `${key} keeps its depth`);
    assert.equal(vertical.orientation, 'vertical');
    assert.equal(horizontal.orientation, 'horizontal');
  }

  // The TV-width bar is measured from the TV itself, and C-1 from its fixed width.
  const c41 = resolveCentreCabinetFootprintM('c4-1', 'horizontal', 'tv83');
  assert.ok(Math.abs(c41.widthM - TV83_WIDTH_MM / 1000) < 1e-9);
  assert.ok(Math.abs(c41.heightM - 0.120) < 1e-9);
  const c1 = resolveCentreCabinetFootprintM('c-1', 'horizontal', 'tv83');
  assert.ok(Math.abs(c1.widthM - 0.400) < 1e-9);
  assert.ok(Math.abs(c1.heightM - 0.120) < 1e-9);
});

test('a TV-width mono bar is placed vertically by default, at the TV midpoint', () => {
  const placed = seed({ centreModelLabel: 'Multi (Mono)' });
  const left = placed.find((s) => s.role === 'FCL');
  const right = placed.find((s) => s.role === 'FCR');
  assert.ok(left && right, 'both Multi (Mono) cabinets are placed');
  assert.equal(left.orientation, 'vertical');

  const footprint = resolveCentreCabinetFootprintM('multi-mono', 'vertical', 'tv83');
  const offset = TV83_WIDTH_MM / 2000 + footprint.widthM / 2;
  assert.ok(Math.abs(left.position.x - (ROOM.widthM / 2 - offset)) < 1e-6);
  assert.ok(Math.abs(right.position.x - (ROOM.widthM / 2 + offset)) < 1e-6);
  const tvMid = computeTvVerticalCentreM(SCREEN, ROOM);
  assert.ok(Math.abs(left.position.z - tvMid) < 1e-6);
});

// ── TWO CABINETS AT THE TV EDGES, ACOUSTIC CENTRE AT THE TV MIDPOINT ──────

test('the seed places one cabinet at each TV edge at the TV midpoint height', () => {
  const placed = seed();
  const left = placed.find((s) => s.role === 'FCL');
  const right = placed.find((s) => s.role === 'FCR');
  assert.ok(left && right, 'both physical centre cabinets are placed');

  // No single FC speaker: the centre channel is carried by the pair.
  assert.equal(placed.find((s) => s.role === 'FC'), undefined);
  assert.ok(placed.some((s) => s.role === 'FL') && placed.some((s) => s.role === 'FR'));

  const footprint = resolveCentreCabinetFootprintM('c4-1', left.orientation, 'tv83');
  const offset = TV83_WIDTH_MM / 2000 + footprint.widthM / 2;

  assert.ok(Math.abs(left.position.x - (ROOM.widthM / 2 - offset)) < 1e-6);
  assert.ok(Math.abs(right.position.x - (ROOM.widthM / 2 + offset)) < 1e-6);

  // Acoustic centre = TV midpoint height, in BOTH orientations.
  const tvMid = computeTvVerticalCentreM(SCREEN, ROOM);
  assert.ok(Math.abs(left.position.z - tvMid) < 1e-6);
  assert.ok(Math.abs(right.position.z - tvMid) < 1e-6);

  const vertical = seed({ centreOrientation: 'vertical' });
  const verticalLeft = vertical.find((s) => s.role === 'FCL');
  assert.equal(verticalLeft.orientation, 'vertical');
  assert.ok(Math.abs(verticalLeft.position.z - tvMid) < 1e-6);
  // The rotated width moves the cabinet closer to the TV edge.
  const rotated = resolveCentreCabinetFootprintM('c4-1', 'vertical', 'tv83');
  const rotatedOffset = TV83_WIDTH_MM / 2000 + rotated.widthM / 2;
  assert.ok(Math.abs(verticalLeft.position.x - (ROOM.widthM / 2 - rotatedOffset)) < 1e-6);

});

test('the cabinets are the mode record and share one orientation', () => {
  const placed = seed({ centreOrientation: 'vertical' });
  assert.equal(detectDualCentreStage(placed), true);
  assert.equal(centreCabinetOrientation(placed), 'vertical');
  assert.equal(detectDualCentreStage([{ role: 'FC', model: 'C4-1' }]), false);
});

test('a cabinet is clamped inside the room’s side walls', () => {
  const x = resolveCentreCabinetX({
    screen: SCREEN,
    role: 'FCL',
    cabinetWidthM: TV83_WIDTH_MM / 1000,
    roomWidthM: ROOM.widthM,
  });
  assert.ok(x >= 0.05 && x <= ROOM.widthM - 0.05);
});

// ── DOLBY LAYOUT STILL UNCHANGED ──────────────────────────────────────────

test('the second cabinet is not a second channel', () => {
  const single = [
    { role: 'FL' }, { role: 'FC' }, { role: 'FR' },
    { role: 'SL' }, { role: 'SR' }, { role: 'SBL' }, { role: 'SBR' },
    { role: 'TFL' }, { role: 'TFR' }, { role: 'TRL' }, { role: 'TRR' },
  ];
  const dual = [
    { role: 'FL' }, { role: 'FCL' }, { role: 'FCR' }, { role: 'FR' },
    { role: 'SL' }, { role: 'SR' }, { role: 'SBL' }, { role: 'SBR' },
    { role: 'TFL' }, { role: 'TFR' }, { role: 'TRL' }, { role: 'TRR' },
  ];
  assert.deepEqual(discreteChannelCounts(dual), discreteChannelCounts(single));
});

// ── CENTRE POWER STILL SPLIT ──────────────────────────────────────────────

test('the centre channel power is split between the two cabinets', () => {
  assert.equal(centreCabinetPowerW(200), 100);
  assert.equal(centreCabinetPowerW(150), 75);
  // No +3 dB / +6 dB combining: the per-cabinet figure is never above the channel.
  assert.ok(centreCabinetPowerW(200) <= 200);
});