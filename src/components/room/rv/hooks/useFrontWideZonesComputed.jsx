/**
 * useFrontWideZonesComputed.js
 * Extracted from RoomVisualisation.jsx (Stage 1).
 *
 * Computes the valid placement zones for front-wide speakers using the
 * strict Dolby RP-022 geometry rules.
 */

import { useMemo } from 'react';
import { computeFrontWideZonesStrict } from '@/components/room/utils/frontWideZones';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   mlp: { x:number, y:number }|null,
 *   widthM: number,
 *   lengthM: number,
 *   heightM: number,
 *   placedSpeakers: Array|null,
 *   speakersEpoch: number,
 *   getModelDimsM: (speaker:object) => object|null,
 *   appState_DBG_FW: boolean,
 *   getCanonicalRole: (role:string) => string,
 * }} opts
 * @returns {{ status: string, left?: object, right?: object, [key:string]: any }}
 */
export function useFrontWideZonesComputed({
  mlp,
  widthM,
  lengthM,
  heightM,
  placedSpeakers,
  speakersEpoch,
  getModelDimsM,
  appState_DBG_FW,
  getCanonicalRole,
}) {
  const frontWideZones = useMemo(() => {
    if (!mlp) return { status: 'loading' };

    const W = widthM || 0;
    const L = lengthM || 0;
    if (!(W > 0 && L > 0)) {
      return { status: 'invalid-geom', reason: 'room dims' };
    }

    const sl = placedSpeakers?.find(s => {
      const r = typeof getCanonicalRole === 'function'
        ? getCanonicalRole(s?.role)
        : (s?.role ?? '').toUpperCase();
      return r === 'SL';
    });
    const sr = placedSpeakers?.find(s => {
      const r = typeof getCanonicalRole === 'function'
        ? getCanonicalRole(s?.role)
        : (s?.role ?? '').toUpperCase();
      return r === 'SR';
    });

    if (!sl || !sr) {
      return { status: 'no-sides' };
    }

    let result;
    try {
      result = computeFrontWideZonesStrict({
        mlpPoint: mlp,
        dimensions: { width: widthM, length: lengthM, height: heightM },
        placedSpeakers,
        getModelDimsM,
        rp22BoundDeg: 10,
      }) || { status: 'invalid-geom', reason: 'empty result' };
    } catch (e) {
      result = { status: 'error', reason: 'exception', error: e?.message };
      if (appState_DBG_FW) {
        if (globalThis.__B44_LOGS) console.warn('[FW zones] compute failed', e);
      }
    }

    // Debug hook — mirrors old RoomVisualisation behaviour
    if (typeof window !== 'undefined') {
      window.FW_DBG = result;
      if (appState_DBG_FW) {
        if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
        if (result.status === 'ok') {
          if (globalThis.__B44_LOGS) console.log('[FW] L =', result.left, 'R =', result.right);
        }
      }
    }

    return result;
  }, [
    mlp?.x, mlp?.y,
    widthM, lengthM, heightM,
    placedSpeakers,
    speakersEpoch,
    getModelDimsM,
    appState_DBG_FW,
    getCanonicalRole,
  ]);

  return frontWideZones;
}