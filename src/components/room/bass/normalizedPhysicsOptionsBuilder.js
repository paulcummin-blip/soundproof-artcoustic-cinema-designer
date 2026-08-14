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
// Allen–Berkley is the complete room field. The corrected path therefore
// disables the separate image field and uses the sealed-room zero mode plus
// the signed cosine-mode multiplicity validated by the B7 REW fixture.
//
// Phase 2B two-stage: buildPreviewPhysicsOptions() produces the interactive-preview
// physics — identical to the refinement physics except enableReflections is forced
// off. This disables the expensive image-source refinement while keeping the same
// modal/direct engine, modal frequencies, source summation, phase, seat handling
// and source-position physics. Late-field is already disabled in the base builder.

export function buildNormalizedPhysicsOptions(params) {
  const p = params || {};
  return {
    surfaceAbsorption: p.surfaceAbsorption,
    enableReflections: p.qStrategy === "ab_corrected" ? false : p.enableRewCoreReflections,
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
    rewSourceCurveMode: "flat_rew_reference",
    rewParityFieldMode: p.qStrategy === "ab_corrected" ? "modes_only" : p.rewParityFieldMode,
    abApplyModeMultiplicity: p.qStrategy === "ab_corrected",
    roomIsSealed: p.qStrategy === "ab_corrected",
    abMidbandQScale: 1,
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

// Preview physics: identical to refinement physics except reflections are disabled.
// The modal/direct acoustic engine, modal frequencies, source summation, phase,
// seat handling and source-position physics are unchanged. Only the expensive
// image-source reflection refinement is turned off for interactive speed.
export function buildPreviewPhysicsOptions(refinementPhysicsOptions) {
  return {
    ...refinementPhysicsOptions,
    enableReflections: false,
  };
}