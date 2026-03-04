// src/components/hooks/useFrontWideZones.js
import React from "react";
import { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones";
import { safeCanon } from "@/components/room/utils/speakerHelpers";

/**
 * Extracted verbatim from RoomDesigner.jsx:
 * - must not change behaviour
 * - must return exactly the same object/shape as the original memo
 */
export function useFrontWideZones({
  enableFrontWides,
  mlpAnchorEffective,
  stableDimensions,
  placedSpeakers,
  getSpeakerModelMeta,
  SHOW_DEBUG_LOGS,
}) {
  const frontWideZones = React.useMemo(() => {
    if (!enableFrontWides) {
      const result = { status: 'disabled' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
      }
      return result;
    }

    if (!mlpAnchorEffective) {
      const result = { status: 'no-mlp' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
      }
      return result;
    }

    const W = stableDimensions.width || 0;
    const L = stableDimensions.length || 0;
    if (!(W > 0 && L > 0)) {
      const result = { status: 'invalid-geom', reason: 'room dims' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
      }
      return result;
    }

    const sl = placedSpeakers?.find((s) => safeCanon(s?.role) === 'SL');
    const sr = placedSpeakers?.find((s) => safeCanon(s?.role) === 'SR');

    if (!sl || !sr) {
      const result = { status: 'no-sides' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
      }
      return result;
    }

    let result;
    try {
      const getModelDims = (modelId) => getSpeakerModelMeta(modelId) || {};

      result = computeFrontWideZonesStrict({
        mlpPoint: mlpAnchorEffective,
        dimensions: stableDimensions,
        placedSpeakers,
        getModelDims,
        rp22BoundDeg: 10
      }) || { status: 'invalid-geom', reason: 'empty result' };
    } catch (e) {
      result = { status: 'invalid-geom', reason: 'exception', error: e.message };
      if (typeof window !== 'undefined' && window.DBG_FW && SHOW_DEBUG_LOGS) {
        if (globalThis.__B44_LOGS) console.warn('[FW zones] compute failed', e);
      }
    }

    if (typeof window !== 'undefined') {
      window.FW_DBG = result;
      if (SHOW_DEBUG_LOGS && window.DBG_FW) {
        if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
        if (result.status === 'ok') {
          if (globalThis.__B44_LOGS) console.log('[FW] L =', result.left, 'R =', result.right);
        }
      }
    }

    return result;
  }, [
    enableFrontWides,
    mlpAnchorEffective,
    stableDimensions,
    placedSpeakers,
    getSpeakerModelMeta,
    SHOW_DEBUG_LOGS,
  ]);

  return frontWideZones;
}