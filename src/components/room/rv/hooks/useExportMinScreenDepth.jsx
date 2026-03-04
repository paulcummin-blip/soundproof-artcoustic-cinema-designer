/**
 * useExportMinScreenDepth.js
 * Extracted from RoomVisualisation.jsx (Stage 1).
 *
 * Computes the minimum screen depth required for the export snapshot so that
 * the PDF render uses the correct (fully-computed) value rather than the
 * default state value.
 */

import { useMemo } from 'react';
import { computeMinimumScreenDepthM } from '@/components/room/rv/utils/rvGeometry';

// ─── Inline sub-role guard (duplicated from rvGeometry to keep this file self-contained) ──

function isSubRole(role) {
  if (!role) return false;
  const r = role.toUpperCase();
  return r === 'SW' || r === 'SUB' || r.startsWith('SW') || r.startsWith('SUB');
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   exportMode: string|null,
 *   placedSpeakers: Array|null,
 *   frontSubs: Array|null,
 *   aimAtMLP: boolean,
 *   lcrAngleInfo: { L?: number, R?: number }|null,
 *   screenVisibleWidthInches: number|null,
 *   getModelDimsM: (speaker:object) => object|null,
 *   getCanonicalRole: (role:string) => string,
 * }} opts
 * @returns {number|null}
 */
export function useExportMinScreenDepth({
  exportMode,
  placedSpeakers,
  frontSubs,
  aimAtMLP,
  lcrAngleInfo,
  screenVisibleWidthInches, // kept for dependency-list parity with old memo
  getModelDimsM,
  getCanonicalRole,
}) {
  const exportMinScreenDepthM = useMemo(() => {
    // Only compute in the 'dimensions' export mode — same condition as old code.
    if (exportMode !== 'dimensions') return null;

    // Same front-object selection rule as the live effect in RoomVisualisation.
    const frontObjectsToCalculate = [
      ...(placedSpeakers || []),
      ...(frontSubs || []),
    ].filter(s => {
      const r = typeof getCanonicalRole === 'function'
        ? getCanonicalRole(s?.role)
        : (s?.role ?? '').toUpperCase();
      return (
        r === 'FL' || r === 'FC' || r === 'FR' ||
        r === 'L'  || r === 'C'  || r === 'R'  ||
        isSubRole(r)
      );
    });

    try {
      const value = computeMinimumScreenDepthM({
        frontObjects: frontObjectsToCalculate,
        getDims: getModelDimsM,
        lcrAngles: { L: lcrAngleInfo?.L ?? 0, R: lcrAngleInfo?.R ?? 0 },
        aimAtMLP: !!aimAtMLP,
      });

      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }, [
    exportMode,
    placedSpeakers,
    frontSubs,
    aimAtMLP,
    lcrAngleInfo?.L,
    lcrAngleInfo?.R,
    screenVisibleWidthInches,
    getModelDimsM,
    getCanonicalRole,
  ]);

  return exportMinScreenDepthM;
}