// rewSourceCurves.js — Phase 2A: Shared production source-curve definitions.
//
// Extracted from BassResponse.jsx so the normalized room-transfer engine
// can reuse the EXACT production flat-source definition without importing
// a 2000-line React component. No behaviour change — BassResponse.jsx
// imports these constants from here.

// Agreed REW parity comparison state — do not change without a new sweep.
// propagationPhaseScale 0.10 was chosen by sweep on 2026-06-13 (null centre 40.4 Hz vs REW 40.6 Hz).
export const REW_PARITY_PRESET = {
  rewSourceCurveMode: 'flat_rew_reference',
  modalSourceReferenceMode: 'distance_normalized',
  modalDistanceBlend: 0.55,
  modalGainScalar: 1.0,
  axialQ: 4.0,
  propagationPhaseScale: 0,
  debugMode200Multiplier: 1.00,
  enableRewCoreReflections: true,
  rewParityFieldMode: 'full_field',
};

export const REW_SOURCE_CURVES = {
  product: null,
  // Flat 94 dB source from 15–200 Hz. The 20–200 Hz segment remains unchanged for REW parity;
  // the 15 Hz point permits product-capability composition through the RP22 extension band.
  flat_rew_reference: [
    { hz: 15,  db: 94 },
    { hz: 20,  db: 94 },
    { hz: 50,  db: 94 },
    { hz: 100, db: 94 },
    { hz: 200, db: 94 },
  ],
  flat90: [
    { hz: 15, db: 90 },
    { hz: 200, db: 90 },
  ],
  rew20HzPorted: [
    { hz: 15, db: 78 },
    { hz: 18, db: 84 },
    { hz: 20, db: 87 },
    { hz: 25, db: 90 },
    { hz: 40, db: 90 },
    { hz: 80, db: 90 },
    { hz: 100, db: 89 },
    { hz: 200, db: 89 },
  ],
  // __TEMP_REW_PARITY__ truly flat source across full bass range — tests room model only, no product roll-off
  flat_0_500hz_rew_parity: [
    { hz: 0,   db: 94 },
    { hz: 10,  db: 94 },
    { hz: 20,  db: 94 },
    { hz: 30,  db: 94 },
    { hz: 40,  db: 94 },
    { hz: 50,  db: 94 },
    { hz: 63,  db: 94 },
    { hz: 80,  db: 94 },
    { hz: 100, db: 94 },
    { hz: 120, db: 94 },
    { hz: 160, db: 94 },
    { hz: 200, db: 94 },
    { hz: 300, db: 94 },
    { hz: 500, db: 94 },
  ],
};