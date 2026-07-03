// liveBassAuditOptions.js
// Pure shared constants/helpers for bass diagnostic panels — no React, no component imports.
// Extracted from LiveModalContributorAudit.jsx so other diagnostic engines (e.g.
// multiModeInteractionAuditEngine.jsx) can depend on these without importing a .jsx component file.
// No physics/graph changes — values are identical to the originals.

// Identical to REW_SOURCE_CURVES.flat_rew_reference in BassResponse.jsx — the
// source curve actually used by the live graph (flat 94 dB reference).
export const LIVE_SOURCE_CURVE = [
  { hz: 20, db: 94 },
  { hz: 50, db: 94 },
  { hz: 100, db: 94 },
  { hz: 200, db: 94 },
];

// Identical option set BassResponse.jsx passes to simulateBassResponseRewCore
// when rewSourceCurveMode === 'flat_rew_reference' && rewParityFieldMode === 'full_field'
// (the current default/live state — dev panel that could change these is hidden).
export function buildLiveEngineOptions(frequencyHz, surfaceAbsorption) {
  return {
    enableReflections: false,
    enableModes: true,
    surfaceAbsorption,
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    // Mode generation must use the same fMax as the production bass graph (20-200 Hz) so
    // higher-frequency modes can still contribute their resonant tails at the evaluated
    // frequency — matching the production modal set exactly. The evaluated frequency itself
    // stays pinned to frequencyHz via freqMinHz/freqMaxHz above.
    modeGenerationFMaxHz: 200,
    smoothing: 'none',
    modalSourceReferenceMode: 'distance_normalized',
    modalGainScalar: 1.0,
    axialQ: 4.0,
    modalStorageMode: 'none',
    propagationPhaseScale: 0,
    pureDeterministicModalSum: true,
    disableReflectionPhaseJitter: false,
    disableReflectionCoherenceWeight: false,
    disableLateField: true,
    disableModalPropagationPhase: true,
    debugInvertModalVector: false,
    debugModalPhaseConvention: 'normal',
    mute68HzAxialMode: false,
    debugDisableModalContribution: false,
    overrideConstantAxialQ: false,
    overrideAbsorptionAxialQ: false,
    debugMode200Multiplier: 1.0,
    debugReflectionOrder: 1,
    reflectionGainScale: 1.0,
    debugModalHSign: 'normal',
    rewParityModalMagnitudeScale: 1.0,
    modalCoherenceMode: 'coherent',
    highOrderAxialScale: 1.0,
    qStrategy: 'production',
  };
}