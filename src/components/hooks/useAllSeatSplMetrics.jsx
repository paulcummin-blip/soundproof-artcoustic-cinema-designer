// src/components/hooks/useAllSeatSplMetrics.js
import React from "react";
import { computeAllSeatSplMetrics } from "@/components/utils/spl/centralSplEngine";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

/**
 * Extracted verbatim from RoomDesigner.jsx:
 * - must not change behaviour
 * - must return exactly the same object/shape as the original memo
 */
export function useAllSeatSplMetrics({
  _seatingPositions,
  analysisSpeakers,
  appState,
  mlpAnchorEffective,
  getSpeakerModelMeta: getSpeakerModelMetaProp,
}) {
  const allSeatSplMetrics = React.useMemo(() => {
    const getCanonicalRoleLocal = (role) => {
      const map = { SL: 'SL', LS: 'SL', SR: 'SR', RS: 'SR', SBL: 'SBL', SBR: 'SBR', LW: 'LW', RW: 'RW',
        FL: 'FL', L: 'FL', FC: 'FC', C: 'FC', FR: 'FR', R: 'FR',
        TFL: 'TFL', TFR: 'TFR', TL: 'TL', TML: 'TL', TR: 'TR', TMR: 'TR', TBL: 'TBL', TBR: 'TBR' };
      const r = String(role || '').toUpperCase();
      return map[r] || r;
    };

    // Get global SPL config from appState (same values used by HUD)
    const splConfig = appState?.splConfig || {};
    const screenLoss = Number(splConfig.screenLossDb) || 0;
    const eqHeadroom = Number(splConfig.globalEqHeadroomDb) || 0;
    const roomHeightM = Number(appState?.roomDims?.heightM) || 2.4;
    const roomWidthM  = appState?.roomDims?.widthM  ?? null;
    const roomLengthM = appState?.roomDims?.lengthM ?? null;

    const resolvedGetMeta = getSpeakerModelMetaProp || getSpeakerModelMeta;

    return computeAllSeatSplMetrics({
      seats: _seatingPositions || [],
      placedSpeakers: analysisSpeakers || [],
      heightM: roomHeightM,
      widthM: roomWidthM,
      lengthM: roomLengthM,
      getCanonicalRole: getCanonicalRoleLocal,
      getEffectiveSplInputs: appState?.getEffectiveSplInputs || (() => ({ powerW: 100, sensitivity_dB_1w1m: 87 })),
      getModelDimsM: (model) => {
        const meta = resolvedGetMeta(model);
        if (meta && !meta.notFound) {
          return {
            ...meta,
            sensitivity_db_1w_1m: meta.sensitivity_dB_1w1m || meta.sensitivity || 87,
            power_handling_w: meta.max_power || Infinity,
            max_spl_cont_db_1m: meta.max_spl || null
          };
        }
        return { widthM: 0.27, depthM: 0.082, sensitivity_dB_1w1m: 87 };
      },
      screenLoss_dB: screenLoss,
      eqHeadroom_dB: eqHeadroom,
      mlpPoint: mlpAnchorEffective
    });
  }, [
    _seatingPositions,
    analysisSpeakers,
    appState?.getEffectiveSplInputs,
    appState?.splConfig,
    appState?.roomDims?.heightM,
    appState?.roomDims?.widthM,
    appState?.roomDims?.lengthM,
    mlpAnchorEffective,
    getSpeakerModelMetaProp,
  ]);

  return allSeatSplMetrics;
}