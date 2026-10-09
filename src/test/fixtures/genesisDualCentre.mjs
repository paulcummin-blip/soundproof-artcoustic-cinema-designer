/**
 * GENESIS AV — frozen design inputs, read from the live project version
 * (Project 6ac7a0ae9f28aaf668e20ccc / ProjectVersion 6ac7a189d093a8d8a68eec91,
 *  version "Original Design").
 *
 * Captured verbatim so the P4 logical-centre authority can be exercised against
 * the real dual-mono centre design: FL/FR are q6-3, the centre is the PHYSICAL
 * PAIR FCL+FCR (both c4-1) with no `FC` role at all.
 */

export const GENESIS_ROOM = { widthM: 4.64, lengthM: 5.09, heightM: 2.6 };

/** dolby_config 9.1.6, all groups at 100 W, half-space, no EQ headroom. */
export const GENESIS_SPL = {
  lcrW: 100,
  surroundsW: 100,
  overheadsW: 100,
  globalEqHeadroomDb: 0,
  radiationMode: 'half-space',
  perRole: {},
};

export const GENESIS_SPEAKERS = [
  { role: 'SL', model: 'evolve-2-1', position: { x: 0.05100000000000001, y: 3.585144677209761, z: 1.55 } },
  { role: 'SR', model: 'evolve-2-1', position: { x: 4.5889999999999995, y: 3.585144677209761, z: 1.55 } },
  { role: 'SBL', model: 'evolve-2-1', position: { x: 1.2374898609668783, y: 5.039, z: 1.55 } },
  { role: 'SBR', model: 'evolve-2-1', position: { x: 3.4025101390331214, y: 5.039, z: 1.55 } },
  { role: 'LW', model: 'evolve-2-1', position: { x: 0.051, y: 1.648, z: 1.1 } },
  { role: 'RW', model: 'evolve-2-1', position: { x: 4.589, y: 1.648, z: 1.1 } },
  { role: 'FL', model: 'q6-3', position: { x: 0.4906261741125374, y: 0.12529687156212657, z: 1.4611349708257664 } },
  { role: 'FCL', model: 'c4-1', position: { x: 0.950927708361081, y: 0.0605, z: 1.4611349708257664 } },
  { role: 'FCR', model: 'c4-1', position: { x: 3.6890722916389187, y: 0.0605, z: 1.4611349708257664 } },
  { role: 'FR', model: 'q6-3', position: { x: 4.149373825887462, y: 0.12529687156212657, z: 1.4611349708257664 } },
  { role: 'TFL', model: 'architect-2-1', position: { x: 1.28545293104456, y: 2.194437002201992, z: 2.45 } },
  { role: 'TFR', model: 'architect-2-1', position: { x: 3.3545470689554397, y: 2.194437002201992, z: 2.45 } },
  { role: 'TML', model: 'architect-2-1', position: { x: 1.28545293104456, y: 3.4941374890221266, z: 2.45 } },
  { role: 'TMR', model: 'architect-2-1', position: { x: 3.3545470689554397, y: 3.4941374890221266, z: 2.45 } },
  { role: 'TRL', model: 'architect-2-1', position: { x: 1.28545293104456, y: 4.793837975842261, z: 2.45 } },
  { role: 'TRR', model: 'architect-2-1', position: { x: 3.3545470689554397, y: 4.793837975842261, z: 2.45 } },
];

export const GENESIS_SEATS = [
  { id: 'seat-r1-c1', x: 1.42, y: 2.58, z: 1.2 },
  { id: 'seat-r1-c2', x: 2.02, y: 2.58, z: 1.2 },
  { id: 'seat-r1-c3', x: 2.62, y: 2.58, z: 1.2 },
  { id: 'seat-r1-c4', x: 3.2199999999999998, y: 2.58, z: 1.2 },
  { id: 'seat-r2-c1', x: 1.42, y: 4.380000000000001, z: 1.5 },
  { id: 'seat-r2-c2', x: 2.02, y: 4.380000000000001, z: 1.5 },
  { id: 'seat-r2-c3', x: 2.62, y: 4.380000000000001, z: 1.5 },
  { id: 'seat-r2-c4', x: 3.2199999999999998, y: 4.380000000000001, z: 1.5 },
];

/**
 * Manual RSP (rsp_mode = manual_position): y = 3.48 m, x on the room
 * centreline. This is the synthetic "mlp" seat the LCR panel and P12 read.
 */
export const GENESIS_RSP = { x: 2.32, y: 3.48, z: 1.2 };

/** Frozen published per-seat P4 (HUD, before the fix) — the baseline. */
export const GENESIS_P4_PUBLISHED = {
  'seat-r1-c1': '2 dB / L4',
  'seat-r1-c2': '1 dB / L4',
  'seat-r1-c3': '1 dB / L4',
  'seat-r1-c4': '2 dB / L4',
  'seat-r2-c1': '1 dB / L4',
  'seat-r2-c2': '0 dB / L4',
  'seat-r2-c3': '0 dB / L4',
  'seat-r2-c4': '1 dB / L4',
};

export default {
  GENESIS_ROOM,
  GENESIS_SPL,
  GENESIS_SPEAKERS,
  GENESIS_SEATS,
  GENESIS_RSP,
  GENESIS_P4_PUBLISHED,
};