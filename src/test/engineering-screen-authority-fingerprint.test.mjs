/**
 * The engineering identity of a design belongs to its ACTIVE display authority
 * ---------------------------------------------------------------------------
 * A screen carries both display branches at once: the active one, and the
 * INACTIVE backup the other mode is restored from (the preset width kept while a
 * manual override is on; the manual geometry kept while a preset is active).
 *
 * The defect this guards: the effective manual width was saved as `screen_size`,
 * restored into the INACTIVE preset backup on load, and hashed into the full
 * engineering fingerprint. A designer who changed nothing therefore saw the
 * version re-identify, which marked the Project Report "Design Updated" and
 * blocked the Proposal Centre.
 *
 * The fixture below is the real Genesis manual-TV design: a 115-inch diagonal
 * 16:9 television (100.23118676932316 in effective width) whose inactive preset
 * backup held 100 in the stored publication the report was generated from, and
 * 100.23118676932316 after the round trip that produced the false update.
 *
 * Pure: no SDK, no database, no writes, no engine run.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';

import { computeEngineeringFingerprint } from '../components/proposal/engineeringAuthority/engineeringFingerprint.js';
import { serializeProject } from '../components/utils/serializeProject.jsx';
import { hydrateProjectIntoAppState } from '../components/utils/hydrateProjectIntoAppState.jsx';
import {
  applyManualOverrideToScreen,
  resolveCanonicalUnsetPreset,
  resolveEffectiveViewableDimsM,
  resolvePresetBackupGeometry,
  screenEngineeringFacts,
} from '../components/models/screen/resolveEffectiveScreen.js';
import { PUBLICATION_CONTRACT_VERSION } from '../../shared/engineeringPublicationContract.js';

/* ── The Genesis manual-TV screen ────────────────────────────────────────── */

const EFFECTIVE_MANUAL_WIDTH_INCHES = 100.23118676932316; // 115" diagonal, 16:9
const EFFECTIVE_MANUAL_WIDTH_M = 2.5458721439408083;
const EFFECTIVE_MANUAL_HEIGHT_M = 1.4320530809667047;

/** The live screen the designer's own save/load produces — inactive preset
 *  backup at its canonical value. */
const genesisScreen = (overrides = {}) => ({
  manualSize: {
    enabled: true,
    displayType: 'tv',
    mode: 'diagonal',
    widthM: 2.55,
    heightM: 1.43,
    diagonalInches: 115,
    aspect: '16:9',
    customAspectW: 16,
    customAspectH: 9,
  },
  presetVisibleWidthInches: 100,
  presetAspectRatio: '16:9',
  presetTvPresetKey: null,
  presetTvWidthMm: null,
  viewableWidthM: EFFECTIVE_MANUAL_WIDTH_M,
  viewableHeightM: EFFECTIVE_MANUAL_HEIGHT_M,
  visibleWidthInches: EFFECTIVE_MANUAL_WIDTH_INCHES,
  aspectRatio: '16:9',
  manualMode: true,
  manualWidthM: EFFECTIVE_MANUAL_WIDTH_M,
  manualHeightM: EFFECTIVE_MANUAL_HEIGHT_M,
  mountMode: 'floating',
  floatDepthM: 0.2,
  showScreenPlane: false,
  showCavity: false,
  showScreenWall: true,
  speakerClearanceM: 0.02,
  heightFromFloorM: 0.5,
  tvPresetKey: null,
  tvWidthMm: null,
  borderThicknessM: 0.08,
  screenPlaneY_m: 0.251,
  ...overrides,
});

const SEATS = [
  { id: 'seat-r1-c1', x: 1.05, y: 3.5, z: 1.2, rowNumber: 1, indexInRow: 1, isPrimary: false, priority: 'secondary', earHeightM: 1.2 },
  { id: 'seat-r1-c2', x: 2.25, y: 3.5, z: 1.2, rowNumber: 1, indexInRow: 2, isPrimary: true, priority: 'primary', earHeightM: 1.2 },
  { id: 'seat-r1-c3', x: 3.45, y: 3.5, z: 1.2, rowNumber: 1, indexInRow: 3, isPrimary: false, priority: 'secondary', earHeightM: 1.2 },
];

const SPEAKERS = [
  { id: 'lcr-l', role: 'lcr', model: 'c4-1', position: { x: 1.0, y: 0.35, z: 1.2 } },
  { id: 'lcr-c', role: 'lcr', model: 'c4-1', position: { x: 2.25, y: 0.35, z: 1.2 } },
  { id: 'lcr-r', role: 'lcr', model: 'c4-1', position: { x: 3.5, y: 0.35, z: 1.2 } },
];

const SUBS = [
  { id: 'sub-1', model: 'sub3-12', enabled: true, position: { x: 0.9, y: 0.6 }, bottomHeightM: 0.1, rotationDeg: 0, positionSource: 'manual', legacyGroup: null, symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
  { id: 'sub-2', model: 'sub3-12', enabled: true, position: { x: 3.6, y: 0.6 }, bottomHeightM: 0.1, rotationDeg: 0, positionSource: 'manual', legacyGroup: null, symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
];

/** The design state the Room Designer hands to the fingerprint. */
const designState = ({ screen = genesisScreen(), ...overrides } = {}) => ({
  name: 'Genesis AV',
  versionName: 'Original Design',
  roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
  roomOrientation: 'length_front',
  screenWall: 'front',
  seatingPositions: SEATS,
  rowSpacingM: 1.8,
  seatsPerRowByRow: [3],
  seatingBlockOffset: 0,
  mlpBasis: 'middle',
  linkEarPlatformHeights: true,
  selectedSpeakersByRole: { lcr: [{ role: 'lcr', model: 'c4-1' }], lcr_centre: { role: 'lcr_centre', model: 'c4-1' } },
  globalSurroundModel: 's-1',
  sevenBedLayoutType: 'rears',
  enableFrontWides: false,
  extraSurroundCount: 2,
  overheadGlobalModel: null,
  overheadFrontOverride: null,
  overheadMidOverride: null,
  overheadRearOverride: null,
  useFrontGlobal: true,
  useMidGlobal: true,
  useRearGlobal: true,
  subwooferInstances: SUBS,
  screen,
  screenFrontPlaneM: 0.251,
  lcrAimMode: 'angled',
  rspMode: 'auto_from_screen',
  manualRspX_m: null,
  manualRspY_m: null,
  designatedRspSeatId: null,
  splConfig: { globalPowerW: 100, globalEqHeadroomDb: 0, radiationMode: 'half_space' },
  targetSpl: 85,
  assumedP15Level: null,
  assumedP21Level: null,
  acousticTreatmentEnabled: false,
  selectedAbfuserQty: 0,
  aimFrontWidesAtMLP: false,
  aimRearSurroundsAtMLP: false,
  aimSideSurroundsAtMLP: false,
  ...overrides,
});

/** The app's own version stamps, so the contract branch is exercised exactly as
 *  the Room Designer exercises it. */
const FINGERPRINT_VERSIONS = Object.freeze({
  engineVersion: '1.1',
  rp22Version: '21',
  algorithmVersion: '1',
  instanceAuthorityVersion: 1,
  summarySchemaVersion: 1,
  publicationContractVersion: PUBLICATION_CONTRACT_VERSION,
  bassFingerprint: 'cal:v8:fixture',
});

const fingerprintOf = (state) => computeEngineeringFingerprint(state, { ...FINGERPRINT_VERSIONS });

/* ── The round trip: save → load, with no writes anywhere ────────────────── */

/** Mirrors the app's own screen setter: every screen write resolves through the
 *  effective-screen authority. */
const makeHarness = () => {
  const state = { screen: genesisScreen() };
  const setters = new Proxy({}, {
    get: (_target, key) => {
      if (typeof key !== 'string' || !key.startsWith('set')) return undefined;
      const field = key.slice(3, 4).toLowerCase() + key.slice(4);
      return (value) => {
        const next = typeof value === 'function' ? value(state[field]) : value;
        state[field] = field === 'screen' ? applyManualOverrideToScreen(state[field], next) : next;
      };
    },
  });
  return { state, setters };
};

const roundTrip = (state) => {
  const record = serializeProject(state);
  const { state: hydrated, setters } = makeHarness();
  hydrateProjectIntoAppState(record, setters, setters);
  return { record, hydrated };
};

/* ── 4. Non-writing round trip ───────────────────────────────────────────── */

test('4. genesis manual-TV design survives save → load with its engineering identity intact', () => {
  const original = designState();
  const { hydrated } = roundTrip(original);
  const loaded = designState({ screen: hydrated.screen });

  assert.equal(fingerprintOf(loaded), fingerprintOf(original),
    'the effective design is the same design after a round trip, so its identity is the same');

  // The effective display is unchanged, and still the display the design states.
  assert.deepEqual(resolveEffectiveViewableDimsM(loaded.screen), resolveEffectiveViewableDimsM(original.screen));
  assert.equal(resolveEffectiveViewableDimsM(loaded.screen).widthM, EFFECTIVE_MANUAL_WIDTH_M);
  assert.equal(loaded.screen.manualSize.displayType, 'tv');
  assert.equal(loaded.screen.manualSize.diagonalInches, 115);

  // Seating, speaker layout and sub layout are unchanged.
  assert.deepEqual(loaded.seatingPositions.map((seat) => [seat.id, seat.x, seat.y, seat.z, seat.priority]),
    original.seatingPositions.map((seat) => [seat.id, seat.x, seat.y, seat.z, seat.priority]));
  assert.deepEqual(hydrated.selectedSpeakersByRole, original.selectedSpeakersByRole);
  assert.deepEqual(loaded.screen.manualSize, original.screen.manualSize);

  const subFacts = (subs) => (subs || []).map((sub) => [
    sub.id, sub.model, sub.position?.x, sub.position?.y, sub.gainDb, sub.delayMs, sub.polarity, sub.enabled,
  ]);
  assert.deepEqual(subFacts(hydrated.subwooferInstances), subFacts(original.subwooferInstances));
});

test('4b. the round trip never writes the effective manual width into the inactive preset backup', () => {
  const { record, hydrated } = roundTrip(designState());

  // The persisted record still states the effective width (it is the active
  // display), and no preset is stated at all.
  assert.equal(Number(record.screen_size), EFFECTIVE_MANUAL_WIDTH_INCHES);
  assert.equal(record.tv_preset_key, null);
  assert.equal(record.tv_width_mm, null);

  // The restored inactive backup carries the preset the design states — and the
  // design states none, so it is the canonical unset preset, not the manual width.
  assert.equal(hydrated.screen.presetVisibleWidthInches, resolveCanonicalUnsetPreset().visibleWidthInches);
  assert.equal(hydrated.screen.presetVisibleWidthInches, 100);
  assert.notEqual(hydrated.screen.presetVisibleWidthInches, hydrated.screen.visibleWidthInches);
  assert.equal(resolvePresetBackupGeometry({ tvPresetKey: null, tvWidthMm: null }).visibleWidthInches, 100);
});

/* ── 5. Inactive backup mutation ─────────────────────────────────────────── */

test('5. changing ONLY the inactive preset backup leaves the engineering fingerprint unchanged', () => {
  const canonical = fingerprintOf(designState());

  // Every value the round trip, a session restore or a stale screen write could
  // leave in the inactive backup — including the effective manual width itself.
  const mutants = [
    { presetVisibleWidthInches: EFFECTIVE_MANUAL_WIDTH_INCHES },
    { presetVisibleWidthInches: 87.8 },
    { presetVisibleWidthInches: 0 },
    { presetVisibleWidthInches: null },
    { presetVisibleWidthInches: EFFECTIVE_MANUAL_WIDTH_INCHES, presetAspectRatio: '1.76:1' },
    { presetVisibleWidthInches: EFFECTIVE_MANUAL_WIDTH_INCHES, presetTvPresetKey: 'tv100', presetTvWidthMm: 2230 },
    { presetAspectRatio: '4:3', presetTvPresetKey: 'tv65', presetTvWidthMm: 1410 },
  ];

  for (const mutant of mutants) {
    assert.equal(
      fingerprintOf(designState({ screen: genesisScreen(mutant) })),
      canonical,
      `the inactive preset backup ${JSON.stringify(mutant)} must not be design authority`,
    );
  }

  // The pre-leak identity is exactly the identity a design with no leaked value
  // has, so the stored publication the Project Report was generated from is the
  // identity this design reports again.
  assert.equal(fingerprintOf(designState({ screen: genesisScreen({ presetVisibleWidthInches: 100 }) })), canonical);
});

test('5b. the same is true of the inactive MANUAL backup while a preset is active', () => {
  const presetScreen = {
    manualSize: { enabled: false, displayType: 'tv' },
    tvPresetKey: 'tv100',
    tvWidthMm: 2230,
    visibleWidthInches: 87.8,
    aspectRatio: '16:9',
    manualMode: false,
    manualWidthM: 0,
    manualHeightM: 0,
    mountMode: 'floating',
    heightFromFloorM: 0.5,
  };
  const canonical = fingerprintOf(designState({ screen: presetScreen }));

  const leakedManualBackup = {
    ...presetScreen,
    manualMode: true,
    manualWidthM: 2.5458721439408083,
    manualHeightM: 1.4320530809667047,
    manualSize: { enabled: false, displayType: 'tv', mode: 'wh', widthM: 2.55, heightM: 1.43, diagonalInches: 100 },
  };

  assert.equal(fingerprintOf(designState({ screen: leakedManualBackup })), canonical,
    'an inactive manual backup must not be design authority while a preset is active');
  // The display type is authority and survives the canonicalisation.
  assert.equal(screenEngineeringFacts(leakedManualBackup).manualSize.displayType, 'tv');
  assert.equal(screenEngineeringFacts(leakedManualBackup).manualWidthM, 0);
});

/* ── 6. A genuine active display change still changes identity ───────────── */

test('6. a real change to the ACTIVE display does change the engineering fingerprint', () => {
  const canonical = fingerprintOf(designState());

  const changes = {
    'a larger diagonal (120 in)': genesisScreen({
      manualSize: { ...genesisScreen().manualSize, diagonalInches: 120, widthM: 2.66, heightM: 1.5 },
      visibleWidthInches: 120 * (16 / Math.sqrt(16 ** 2 + 9 ** 2)),
      manualWidthM: 2.6597, manualHeightM: 1.4959,
    }),
    'an entered width change': genesisScreen({ manualSize: { ...genesisScreen().manualSize, widthM: 2.7, heightM: 1.52 } }),
    'a display type change (TV → projection screen)': genesisScreen({
      manualSize: { ...genesisScreen().manualSize, displayType: 'projector_screen' },
    }),
    'a screen height change': genesisScreen({ heightFromFloorM: 0.75 }),
  };

  for (const [label, screen] of Object.entries(changes)) {
    assert.notEqual(fingerprintOf(designState({ screen })), canonical, `${label} must change the design identity`);
  }

  // And a genuine change to another part of the design still changes it too.
  assert.notEqual(fingerprintOf(designState({ roomDims: { widthM: 5.0, lengthM: 6.0, heightM: 2.4 } })), canonical);
});

/* ── 7. Preset mode ──────────────────────────────────────────────────────── */

test('7. an active preset is authority; an inactive manual backup is not', () => {
  const preset = (overrides) => ({
    manualSize: { enabled: false, displayType: 'tv' },
    tvPresetKey: 'tv100',
    tvWidthMm: 2230,
    visibleWidthInches: 87.8,
    aspectRatio: '16:9',
    manualMode: false,
    manualWidthM: 0,
    manualHeightM: 0,
    screenPlaneY_m: 0.251,
    ...overrides,
  });
  const canonical = fingerprintOf(designState({ screen: preset() }));

  assert.notEqual(fingerprintOf(designState({ screen: preset({ tvPresetKey: 'tv77', tvWidthMm: 1718, visibleWidthInches: 67.36 }) })),
    canonical, 'changing the active preset changes the design identity');
  assert.notEqual(fingerprintOf(designState({ screen: preset({ tvWidthMm: 2240, visibleWidthInches: 88.19 }) })),
    canonical, 'changing the active preset width in millimetres changes the design identity');

  // Only the INACTIVE manual branch is mutated. In preset mode the preset backup
  // holds the active preset's own geometry, so it is not an inactive input.
  const leakedManualBackup = preset({
    manualMode: true,
    manualWidthM: 2.5458721439408083,
    manualHeightM: 1.4320530809667047,
    manualSize: { enabled: false, displayType: 'tv', mode: 'wh', widthM: 2.55, heightM: 1.43, diagonalInches: 100 },
  });
  assert.equal(fingerprintOf(designState({ screen: leakedManualBackup })), canonical,
    'an inactive manual backup cannot change the design identity while a preset is active');
});