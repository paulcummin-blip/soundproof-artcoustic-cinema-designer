/**
 * useActualScreenFrontY.js
 * Extracted from RoomVisualisation.jsx (Stage 1).
 *
 * Computes the actual front-plane Y position of the screen in room metres,
 * taking into account the screen mount mode and the minimum depth required
 * for speakers to clear the screen face.
 */

import { useMemo } from 'react';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   effectiveMinScreenDepthM: number,
 *   screenFloatDepthM: number|null|undefined,
 *   screenPlaneMode: string|null,
 * }} opts
 * @returns {number}
 */
export function useActualScreenFrontY({
  effectiveMinScreenDepthM,
  screenFloatDepthM,
  screenPlaneMode,
}) {
  const actualScreenFrontY = useMemo(() => {
    const floatDepthM = Number(screenFloatDepthM) || 0.0;

    // effectiveMinScreenDepthM already includes the 1 cm gap; don't add it again.
    const minDepthForSpeakersToClear = effectiveMinScreenDepthM;

    if (screenPlaneMode === 'autoTight') {
      return minDepthForSpeakersToClear;
    }

    return Math.max(floatDepthM, minDepthForSpeakersToClear);
  }, [effectiveMinScreenDepthM, screenFloatDepthM, screenPlaneMode]);

  return actualScreenFrontY;
}