// useNormalizedPhysicsOptions.js — React hook that memoizes the product-independent
// normalized physics options using the shared builder. Extracted from BassResponse.jsx
// to reduce file size below 2000 lines. Does not change any physics values.

import { useMemo } from "react";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";

export function useNormalizedPhysicsOptions(params) {
  return useMemo(
    () => buildNormalizedPhysicsOptions(params),
    [
      params.surfaceAbsorption,
      params.qStrategy,
      params.enableRewCoreReflections,
      params.roomDamping,
      params.axialQ,
      params.modalSourceReferenceMode,
      params.modalGainScalar,
      params.modalDistanceBlend,
      params.modalStorageMode,
      params.propagationPhaseScale,
      params.disableReflectionPhaseJitter,
      params.disableReflectionCoherenceWeight,
      params.mute68HzAxialMode,
      params.debugDisableModalContribution,
      params.rewParityFieldMode,
      params.overrideConstantAxialQ,
      params.overrideAbsorptionAxialQ,
      params.debugMode200Multiplier,
      params.reflectionGainScale,
      params.modalCoherenceMode,
      params.highOrderAxialScale,
      params.rewModalBandwidthScale,
    ]
  );
}