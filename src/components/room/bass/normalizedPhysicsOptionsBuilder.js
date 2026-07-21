// normalizedPhysicsOptionsBuilder.js — Shared builder for the product-independent
// normalized physics options. Used by both the live hook (useNormalizedPhysicsOptions)
// and the verification fixtures. Mirrors the production flat-source path options
// (flat_rew_reference mode in BassResponse.jsx) without duplicating unexplained
// debug constants.
//
// The returned options force the same flat-source behaviour the production path
// uses when rewSourceCurveMode === 'flat_rew_reference':
//   pureDeterministicModalSum: true, disableLateField: true,
//   disableModalPropagationPhase: true, debugReflectionOrder: 1,
//   debugModalPhaseConvention: 'normal', debugModalHSign: 'normal',
//   rewParityModalMagnitudeScale: 1.0.
//
// enableReflections follows the same ab_corrected override as the production path.

export function buildNormalizedPhysicsOptions(params) {
  const p = params || {};
  return {
    surfaceAbsorption: p.surfaceAbsorption,
    enableReflections: p.qStrategy === "ab_corrected" ? true : p.enableRewCoreReflections,
    enableModes: true,
    roomDamping: p.roomDamping,
    axialQ: p.axialQ,
    modalSourceReferenceMode: p.modalSourceReferenceMode,
    modalGainScalar: p.modalGainScalar,
    modalDistanceBlend: p.modalDistanceBlend,
    modalStorageMode: p.modalStorageMode,
    propagationPhaseScale: p.propagationPhaseScale,
    pureDeterministicModalSum: true,
    disableReflectionPhaseJitter: p.disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight: p.disableReflectionCoherenceWeight,
    disableLateField: true,
    disableModalPropagationPhase: true,
    mute68HzAxialMode: p.mute68HzAxialMode,
    debugDisableModalContribution: p.debugDisableModalContribution,
    rewParityFieldMode: p.rewParityFieldMode,
    overrideConstantAxialQ: p.overrideConstantAxialQ,
    overrideAbsorptionAxialQ: p.overrideAbsorptionAxialQ,
    debugMode200Multiplier: p.debugMode200Multiplier,
    debugModalPhaseConvention: "normal",
    debugReflectionOrder: 1,
    reflectionGainScale: p.reflectionGainScale,
    debugModalHSign: "normal",
    rewParityModalMagnitudeScale: 1.0,
    modalCoherenceMode: p.modalCoherenceMode,
    highOrderAxialScale: p.highOrderAxialScale,
    qStrategy: p.qStrategy,
    rewModalBandwidthScale: p.rewModalBandwidthScale,
  };
}