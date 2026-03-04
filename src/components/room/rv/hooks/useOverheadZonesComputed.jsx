/**
 * useOverheadZonesComputed.js
 * Extracted from RoomVisualisation.jsx (Stage 1).
 *
 * Wraps computeOverheadZones in a stable useMemo with the same dependency
 * list as the original RoomVisualisation memo.
 */

import { useMemo } from 'react';
import { computeOverheadZones } from '@/components/room/utils/overheadZones';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   seatingPositions: Array|null,
 *   heightM: number,
 *   widthM: number,
 *   lengthM: number,
 *   mlpY_m: number,
 *   mlp: { x:number, y:number }|null,
 *   placedSpeakers: Array|null,
 *   getCanonicalRole: (role:string) => string,
 * }} opts
 * @returns {object} result from computeOverheadZones
 */
export function useOverheadZonesComputed({
  seatingPositions,
  heightM,
  widthM,
  lengthM,
  mlpY_m,
  mlp,
  placedSpeakers,
  getCanonicalRole,
}) {
  const overheadZones = useMemo(
    () =>
      computeOverheadZones({
        seatingPositions,
        heightM,
        widthM,
        lengthM,
        mlpY_m,
        mlpPoint: mlp,
        placedSpeakers,
        getCanonicalRole,
      }),
    [
      seatingPositions,
      heightM,
      widthM,
      lengthM,
      mlpY_m,
      mlp,
      placedSpeakers,
      getCanonicalRole,
    ],
  );

  return overheadZones;
}