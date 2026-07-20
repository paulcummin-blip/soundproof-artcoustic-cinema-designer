// bassFingerprint.js — Deterministic fingerprint of physical inputs that affect
// the detailed bass optimisation. Excludes all presentation-only state (graph
// curves, smoothing, scale, house-curve visibility, Design EQ visibility,
// priority mode, panel state). A fingerprint change marks the stored detailed
// result out of date.

const NUM = (v, d = 6) => {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(d)) : null;
};

export function computeBassFingerprint(inputs) {
  const {
    roomDims, subsForSimulation, rspPosition, seatingPositions,
    surfaceAbsorption, roomDamping, axialQ, modalSourceReferenceMode,
    modalGainScalar, modalDistanceBlend, modalStorageMode, propagationPhaseScale,
    enableRewCoreReflections, rewSourceCurveMode, qStrategy, rewModalBandwidthScale,
    disableReflectionPhaseJitter, disableReflectionCoherenceWeight, disableLateField,
    disableModalPropagationPhase, mute68HzAxialMode, debugDisableModalContribution,
    rewParityFieldMode, overrideConstantAxialQ, overrideAbsorptionAxialQ,
    debugMode200Multiplier, debugModalPhaseConvention, reflectionGainScale,
    debugModalHSign, rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale,
    splConfig, optimisationTransitionHz,
  } = inputs || {};

  const subs = (Array.isArray(subsForSimulation) ? subsForSimulation : [])
    .map((s) => ({
      id: s?.id || null,
      modelKey: s?.modelKey || null,
      x: NUM(s?.x), y: NUM(s?.y), z: NUM(s?.z),
      gainDb: NUM(s?.tuning?.gainDb),
      delayMs: NUM(s?.tuning?.delayMs, 3),
      polarity: s?.tuning?.polarity ?? 0,
    }))
    .sort((a, b) => (a.id || "").localeCompare(b.id || ""));

  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map((s) => ({
      id: s?.id || `${s?.x}-${s?.y}`,
      x: NUM(s?.x), y: NUM(s?.y), z: NUM(s?.z),
    }))
    .sort((a, b) => (a.id || "").localeCompare(b.id || ""));

  const fp = {
    room: { w: NUM(roomDims?.widthM), l: NUM(roomDims?.lengthM), h: NUM(roomDims?.heightM) },
    rsp: rspPosition ? { x: NUM(rspPosition.x), y: NUM(rspPosition.y), z: NUM(rspPosition.z) } : null,
    subs,
    seats,
    absorption: {
      front: NUM(surfaceAbsorption?.front, 4),
      back: NUM(surfaceAbsorption?.back, 4),
      left: NUM(surfaceAbsorption?.left, 4),
      right: NUM(surfaceAbsorption?.right, 4),
      ceiling: NUM(surfaceAbsorption?.ceiling, 4),
      floor: NUM(surfaceAbsorption?.floor, 4),
    },
    roomDamping: NUM(roomDamping, 2),
    axialQ: NUM(axialQ, 3),
    modalSourceReferenceMode: modalSourceReferenceMode || null,
    modalGainScalar: NUM(modalGainScalar, 4),
    modalDistanceBlend: NUM(modalDistanceBlend, 4),
    modalStorageMode: modalStorageMode || null,
    propagationPhaseScale: NUM(propagationPhaseScale, 4),
    enableRewCoreReflections: !!enableRewCoreReflections,
    rewSourceCurveMode: rewSourceCurveMode || null,
    qStrategy: qStrategy || null,
    rewModalBandwidthScale: NUM(rewModalBandwidthScale, 4),
    disableReflectionPhaseJitter: !!disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight: !!disableReflectionCoherenceWeight,
    disableLateField: !!disableLateField,
    disableModalPropagationPhase: !!disableModalPropagationPhase,
    mute68HzAxialMode: !!mute68HzAxialMode,
    debugDisableModalContribution: !!debugDisableModalContribution,
    rewParityFieldMode: rewParityFieldMode || null,
    overrideConstantAxialQ: !!overrideConstantAxialQ,
    overrideAbsorptionAxialQ: !!overrideAbsorptionAxialQ,
    debugMode200Multiplier: NUM(debugMode200Multiplier, 4),
    debugModalPhaseConvention: debugModalPhaseConvention || null,
    reflectionGainScale: NUM(reflectionGainScale, 4),
    debugModalHSign: debugModalHSign || null,
    rewParityModalMagnitudeScale: NUM(rewParityModalMagnitudeScale, 4),
    modalCoherenceMode: modalCoherenceMode || null,
    highOrderAxialScale: NUM(highOrderAxialScale, 4),
    splConfig: {
      globalPowerW: NUM(splConfig?.globalPowerW, 1),
      globalEqHeadroomDb: NUM(splConfig?.globalEqHeadroomDb, 2),
      radiationMode: splConfig?.radiationMode || "half_space",
    },
    transitionHz: NUM(optimisationTransitionHz, 3),
  };

  return JSON.stringify(fp);
}