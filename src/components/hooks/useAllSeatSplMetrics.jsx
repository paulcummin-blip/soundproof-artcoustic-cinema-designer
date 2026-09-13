// src/components/hooks/useAllSeatSplMetrics.js
import React from "react";
import { computeAllSeatSplMetrics } from "@/components/utils/spl/centralSplEngine";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { resolveSpeakerSplMeta } from "@/components/utils/spl/speakerSplMeta";
import { logRp22SplDiagnostic } from "@/components/utils/rp22RuntimeDiagnostic";

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

    const _result = computeAllSeatSplMetrics({
      seats: _seatingPositions || [],
      placedSpeakers: analysisSpeakers || [],
      heightM: roomHeightM,
      widthM: roomWidthM,
      lengthM: roomLengthM,
      getCanonicalRole: getCanonicalRoleLocal,
      getEffectiveSplInputs: appState?.getEffectiveSplInputs || (() => ({ powerW: 100, sensitivity_dB_1w1m: 87 })),
      getModelDimsM: (model) => resolveSpeakerSplMeta(model, resolvedGetMeta),
      screenLoss_dB: screenLoss,
      eqHeadroom_dB: eqHeadroom,
      mlpPoint: mlpAnchorEffective
    });

    // ── TEMP DIAG: capture uppers object keys for each seat (read-only) ──
    try {
      const _splDiag = { seats: {} };
      const _seatIds = ["mlp"];
      if (Array.isArray(_seatingPositions)) {
        for (const s of _seatingPositions) {
          if (s?.id) _seatIds.push(s.id);
        }
      }
      for (const sid of _seatIds) {
        const m = _result?.get?.(sid) || _result?.[sid];
        if (m?.uppers) {
          const keys = Object.keys(m.uppers);
          const values = {};
          for (const k of keys) {
            values[k] = m.uppers[k]?.value ?? null;
          }
          _splDiag.seats[sid] = { upperKeys: keys, upperValues: values };
        } else {
          _splDiag.seats[sid] = { upperKeys: [], upperValues: {} };
        }
      }
      logRp22SplDiagnostic(_splDiag);
    } catch (e) {
      // Diagnostics must never crash the app
    }
    // ── END TEMP DIAG ──

    return _result;
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