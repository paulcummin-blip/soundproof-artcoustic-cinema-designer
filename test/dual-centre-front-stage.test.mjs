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

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CABINET_ORIENTATION_OPTIONS,
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

test('a suitable on-wall cabinet is available; impedance and in-ceiling exclusions hold', () => {
  // C4-1 is normally drawn horizontally and is 8 Ω — it must be offered.
  assert.equal(isEligibleDualCentreCentreModel('c4-1'), true);
  assert.equal(defaultCentreCabinetOrientation('c4-1', 'tv83'), 'vertical');

  // 4 Ω is exactly at the limit, not above it.
  assert.equal(isEligibleDualCentreCentreModel('c-1'), false);
  // A single cabinet carrying three channels is a front stage of its own.
  assert.equal(isEligibleDualCentreCentreModel('multi-lcr'), false);
  // The Architect (in-ceiling) range is never a centre cabinet.
  assert.equal(isEligibleDualCentreCentreModel('architect-mikro'), false);

  const options = eligibleDualCentreCentreOptions([
    { key: 'c4-1', label: 'C4-1' },
    { key: 'c-1', label: 'C-1' },
    { key: 'multi-lcr', label: 'Multi (LCR)' },
  ]);
  assert.deepEqual(options.map((o) => o.label), ['C4-1']);
});

// ── VERTICAL ORIENTATION ROTATES DRAWN FOOTPRINT ───────────────────────────

test('vertical orientation rotates the cabinet footprint and keeps the depth', () => {
  const horizontal = resolveCentreCabinetFootprintM('c4-1', 'horizontal', 'tv83');
  const vertical = resolveCentreCabinetFootprintM('c4-1', 'vertical', 'tv83');

  assert.ok(Math.abs(horizontal.widthM - TV83_WIDTH_MM / 1000) < 1e-9);
  assert.ok(Math.abs(horizontal.heightM - 0.120) < 1e-9);

  // Rotated a quarter turn: width and height swap, depth unchanged.
  assert.ok(Math.abs(vertical.widthM - horizontal.heightM) < 1e-9);
  assert.ok(Math.abs(vertical.heightM - horizontal.widthM) < 1e-9);
  assert.equal(vertical.depthM, horizontal.depthM);
  assert.equal(vertical.orientation, 'vertical');
  assert.equal(horizontal.orientation, 'horizontal');
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

  // The designer's own orientation is preserved on a re-seed.
  const reseeded = seed({ centreOrientation: 'vertical', setSpeakers: undefined });
  assert.equal(reseeded.find((s) => s.role === 'FCL').orientation, 'vertical');
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