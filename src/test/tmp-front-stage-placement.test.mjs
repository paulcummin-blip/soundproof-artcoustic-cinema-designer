/**
 * TEMPORARY verification (removed after the run): the front-stage placement note
 * is stated only from the version's own saved display identity, screen
 * construction and loudspeaker positions.
 *
 * The speaker positions and screen facts below are the real saved values read
 * from the two live projects (Marquee Home, Genesis AV).
 */
import { describe, it, expect } from 'vitest';
import { frontStagePlacementNote } from '../components/models/screen/frontStagePlacementAuthority.js';
import { buildSpeakerDesignRows } from '../components/report/speakerDesign/speakerDesignRows.js';

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

const genesisFL = { role: 'FL', model: 'q6-3', position: { x: 0.4906261741125374, y: 0.12529687156212657 } };
const genesisFR = { role: 'FR', model: 'q6-3', position: { x: 4.149373825887462, y: 0.12529687156212657 } };
const marqueeFL = { role: 'FL', model: 'q8-5', position: { x: 0.7007266030470447, y: 0.18120145938086105 } };
const marqueeFC = { role: 'FC', model: 'q8-5', position: { x: 2.59, y: 0.2 } };
const marqueeFR = { role: 'FR', model: 'q8-5', position: { x: 4.479273396952955, y: 0.18120145938086105 } };

describe('front stage placement', () => {
  it('Genesis: front left and right are stated outside the television', () => {
    const pair = [genesisFL, genesisFR];
    expect(frontStagePlacementNote({ screen: genesisScreen, rowKey: 'FL', speakers: [genesisFL], pairSpeakers: pair }))
      .toBe('Outside the TV');
    expect(frontStagePlacementNote({ screen: genesisScreen, rowKey: 'FR', speakers: [genesisFR], pairSpeakers: pair }))
      .toBe('Outside the TV');
  });

  it('Genesis: a television is never stated as behind a screen, and a pair inside the image is not stated', () => {
    expect(frontStagePlacementNote({
      screen: genesisScreen,
      rowKey: 'FL',
      speakers: [genesisFL],
      pairSpeakers: [genesisFL, genesisFR],
    })).not.toBe('Behind screen');
    expect(frontStagePlacementNote({
      screen: genesisScreen,
      rowKey: 'FL',
      speakers: [{ position: { x: 2.0, y: 0.12 } }],
      pairSpeakers: [{ position: { x: 2.0, y: 0.12 } }, { position: { x: 2.6, y: 0.12 } }],
    })).toBeNull();
  });

  it('Marquee: behind screen is stated from the construction and the positions', () => {
    expect(frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FL', speakers: [marqueeFL] })).toBe('Behind screen');
    expect(frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FC', speakers: [marqueeFC] })).toBe('Behind screen');
    expect(frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FR', speakers: [marqueeFR] })).toBe('Behind screen');
  });

  it('baffle-wall construction alone is not evidence', () => {
    expect(frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FL', speakers: [] })).toBeNull();
    expect(frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FL', speakers: [{ role: 'FL' }] })).toBeNull();
    expect(frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'SL', speakers: [marqueeFL] })).not.toBe('Behind screen');
  });

  it('a loudspeaker placed in front of the screen plane is not stated behind it', () => {
    expect(frontStagePlacementNote({ screen: marqueeScreen, rowKey: 'FL', speakers: [{ position: { x: 0.7, y: 0.55 } }] })).toBeNull();
  });

  it('a floating screen without its own cavity does not establish a placement', () => {
    const floating = { ...marqueeScreen, screen_mount_mode: 'floating', show_cavity: false };
    expect(frontStagePlacementNote({ screen: floating, rowKey: 'FL', speakers: [marqueeFL] })).toBeNull();
    expect(frontStagePlacementNote({ screen: { ...floating, show_cavity: true }, rowKey: 'FL', speakers: [marqueeFL] })).toBe('Behind screen');
  });

  it('no saved display facts and no positions state nothing', () => {
    expect(frontStagePlacementNote({ screen: null, rowKey: 'FL', speakers: [marqueeFL] })).toBeNull();
    expect(frontStagePlacementNote({ rowKey: 'FL' })).toBeNull();
  });

  it('the whole schedule carries the notes: Marquee behind screen, Genesis outside the TV', () => {
    const marqueeRows = buildSpeakerDesignRows({
      placedSpeakers: [marqueeFL, marqueeFC, marqueeFR],
      screen: marqueeScreen,
    }).rows;
    const genesisRows = buildSpeakerDesignRows({
      placedSpeakers: [genesisFL, genesisFR],
      screen: genesisScreen,
    }).rows;
    const noteOf = (rows, position) => rows.find((r) => r.position === position)?.note ?? null;
    expect(noteOf(marqueeRows, 'Front left')).toBe('Behind screen');
    expect(noteOf(marqueeRows, 'Centre')).toBe('Behind screen');
    expect(noteOf(genesisRows, 'Front left')).toBe('Outside the TV');
    expect(noteOf(genesisRows, 'Front right')).toBe('Outside the TV');
  });
});