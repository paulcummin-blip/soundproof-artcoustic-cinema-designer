/**
 * TEMPORARY verification (deleted after the run): the front-stage placement note
 * is stated only from the version's own saved display identity, screen
 * construction and loudspeaker positions.
 *
 * The speaker positions and screen facts below are the real saved values read
 * from the two live projects (Marquee Home, Genesis AV).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontStagePlacementNote } from '../components/models/screen/frontStagePlacementAuthority.js';

// ── Marquee Home: 170" wide 2.35:1 projection screen, baffle wall ──────────
const marqueeScreen = {
  screen_size: 170,
  aspect_ratio: '2.35:1',
  manual_dimensions: false,
  screen_mount_mode: 'baffle',
  show_cavity: false,
  screen_front_plane_m: 0.362,
};

// ── Genesis AV: 115" TV, baffle wall, dual centre cabinets ────────────────
const genesisScreen = {
  screen_size: 100.23118676932316,
  aspect_ratio: '16:9',
  manual_dimensions: true,
  manual_width_m: 2.55,
  screen_mount_mode: 'baffle',
  show_cavity: false,
  screen_front_plane_m: 0.251,
  manualSize: { enabled: true, displayType: 'tv', diagonalInches: 115 },
};

const genesisFL = { role: 'FL', position: { x: 0.4906261741125374, y: 0.12529687156212657, z: 1.4611349708257664 } };
const genesisFR = { role: 'FR', position: { x: 4.149373825887462, y: 0.12529687156212657, z: 1.4611349708257664 } };

const marqueeFL = { role: 'FL', position: { x: 0.7007266030470447, y: 0.18120145938086105, z: 1.558723404255319 } };
const marqueeFC = { role: 'FC', position: { x: 2.59, y: 0.2, z: 1.558723404255319 } };
const marqueeFR = { role: 'FR', position: { x: 4.479273396952955, y: 0.18120145938086105, z: 1.558723404255319 } };

test('Genesis: front left and right are stated outside the television', () => {
  assert.equal(
    frontStagePlacementNote({ screen: genesisScreen, rowKey: 'FL', speakers: [genesisFL] }),
    'Outside the TV',
  );
  assert.equal(
    frontStagePlacementNote({ screen: genesisScreen, rowKey: 'FR', speakers: [genesisFR] }),
    'Outside the TV',
  );
});

test('Genesis: a television is never stated as behind a screen', () => {
  assert.notEqual(
    frontStagePlacementNote({ screen: genesisScreen, rowKey: 'FL', speakers: [genesisFL] }),
    'Behind screen',
  );
});

test('A left/right pair inside the television image is not stated outside it', () => {
  const insideFL = { position: { x: 2.0, y: 0.12 } };
  const insideFR = { position: { x: 2.6, y: 0.12 } };
  assert.equal(
    frontStagePlacementNote({ screen: genesisScreen, rowKey: 'FL', speakers: [insideFL, insideFR] }),
    null,
  );
});

test('Marquee: behind screen is stated from the construction and the positions', () => {
  assert.equal(
    frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FL', speakers: [marqueeFL] }),
    'Behind screen',
  );
  assert.equal(
    frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FC', speakers: [marqueeFC] }),
    'Behind screen',
  );
  assert.equal(
    frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FR', speakers: [marqueeFR] }),
    'Behind screen',
  );
});

test('Baffle-wall construction alone is not evidence', () => {
  assert.equal(
    frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FL', speakers: [] }),
    null,
  );
  assert.equal(
    frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FL', speakers: [{ role: 'FL' }] }),
    null,
  );
});

test('A loudspeaker placed in front of the screen plane is not stated behind it', () => {
  const inFront = { position: { x: 0.7, y: 0.55 } };
  assert.equal(
    frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FL', speakers: [inFront] }),
    null,
  );
});

test('A floating screen without its own cavity does not establish a placement', () => {
  const floating = { ...marqueeScreen, screen_mount_mode: 'floating', show_cavity: false };
  assert.equal(
    frontStagePlacementNote({ screen: floating, rowKey: 'FL', speakers: [marqueeFL] }),
    null,
  );
  const floatingWithCavity = { ...floating, show_cavity: true };
  assert.equal(
    frontStagePlacementNote({ screen: floatingWithCavity, rowKey: 'FL', speakers: [marqueeFL] }),
    'Behind screen',
  );
});

test('No saved display facts and no positions state nothing', () => {
  assert.equal(frontStagePlacementNote({ screen: null, rowKey: 'FL', speakers: [marqueeFL] }), null);
  assert.equal(frontStagePlacementNote({ rowKey: 'FL' }), null);
});