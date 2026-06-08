import { useCallback } from "react";
import { safeCanon } from "@/components/room/utils/speakerHelpers";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

/**
 * Provides drag callbacks for the Front Elevation and Side Elevation views.
 * Extracted from RoomDesigner to keep that file under the line limit.
 */
export function useElevationDragHandlers({
  setSpeakers,
  setSubwoofers,
  stableDimensions,
  placedSpeakers,
  appState,
  _frontSubsCfg,
}) {
  const handleLcrSpeakerMoved = useCallback(({ role, newX, newZ, axis }) => {
    const rW = stableDimensions.widthM || stableDimensions.width || 4.5;

    const getModel = (r) => {
      const spk = placedSpeakers.find(s => safeCanon(s.role) === r);
      return spk?.model || null;
    };
    const flModel = getModel('FL');
    const fcModel = getModel('FC');
    const frModel = getModel('FR');
    const allSameModel = flModel && fcModel && frModel && flModel === fcModel && fcModel === frModel;

    setSpeakers(prev => prev.map(spk => {
      const canon = safeCanon(spk.role);
      const isLcrRole = canon === 'FL' || canon === 'FC' || canon === 'FR';

      if (canon === role) {
        return {
          ...spk,
          position: {
            ...spk.position,
            ...(axis === 'x' ? { x: newX } : {}),
            ...(axis === 'z' ? { z: newZ } : {}),
          },
        };
      }
      if (axis === 'x' && role === 'FL' && canon === 'FR') {
        return { ...spk, position: { ...spk.position, x: rW - newX } };
      }
      if (axis === 'x' && role === 'FR' && canon === 'FL') {
        return { ...spk, position: { ...spk.position, x: rW - newX } };
      }
      if (axis === 'z' && isLcrRole) {
        if (allSameModel) {
          return { ...spk, position: { ...spk.position, z: newZ } };
        }
        if ((role === 'FL' || role === 'FR') && (canon === 'FL' || canon === 'FR')) {
          return { ...spk, position: { ...spk.position, z: newZ } };
        }
      }
      return spk;
    }));

    if (axis === 'z') {
      appState?.updateGlobalSpl?.({ lcrHeightM: newZ });
    }
  }, [setSpeakers, stableDimensions.widthM, stableDimensions.width, placedSpeakers, appState?.updateGlobalSpl]);

  const handleFrontSubMoved = useCallback(({ index, newX, newZ, axis }) => {
    const roomW = stableDimensions.widthM || stableDimensions.width || 4.5;

    setSubwoofers(prev => {
      if (!Array.isArray(prev)) return prev;
      const frontSubs = prev.filter(s => s?.group === 'front');
      const isPaired = frontSubs.length === 2;
      let frontCount = -1;
      return prev.map(sub => {
        if (sub?.group !== 'front') return sub;
        frontCount++;
        if (axis === 'x' && isPaired) {
          const mirrorX = roomW - newX;
          const thisX = frontCount === index ? newX : mirrorX;
          return { ...sub, position: { ...(sub.position || {}), x: thisX } };
        }
        if (axis === 'z' && isPaired) {
          return { ...sub, position: { ...(sub.position || {}), z: newZ } };
        }
        if (frontCount !== index) return sub;
        return { ...sub, position: { ...(sub.position || {}), ...(axis === 'x' ? { x: newX } : {}), ...(axis === 'z' ? { z: newZ } : {}) } };
      });
    });

    if (axis === 'x' && typeof appState?.setFrontSubsCfg === 'function') {
      appState.setFrontSubsCfg(prev => {
        const frontCount = (appState?.subwoofers || []).filter(s => s?.group === 'front').length;
        const isPaired = frontCount === 2;
        const positions = Array.isArray(prev?.positions) ? [...prev.positions] : [];
        if (isPaired) {
          while (positions.length < 2) positions.push({});
          const mirrorX = roomW - newX;
          positions[index] = { ...(positions[index] || {}), x: newX };
          positions[1 - index] = { ...(positions[1 - index] || {}), x: mirrorX };
        } else {
          while (positions.length <= index) positions.push({});
          positions[index] = { ...(positions[index] || {}), x: newX };
        }
        return { ...prev, positions, isManual: true };
      });
    }

    if (axis === 'z' && typeof appState?.setFrontSubsCfg === 'function') {
      const model = _frontSubsCfg?.model || '';
      const orientation = _frontSubsCfg?.orientation;
      const meta = getSpeakerModelMeta(model, orientation) || {};
      const subH = Number(meta.heightM);
      const resolvedH = Number.isFinite(subH) && subH > 0 ? subH : 0.50;
      const bottomHeightM = Math.max(0, newZ - resolvedH / 2);
      appState.setFrontSubsCfg(prev => ({ ...prev, bottomHeightM }));
    }
  }, [setSubwoofers, appState?.setFrontSubsCfg, _frontSubsCfg, _frontSubsCfg?.orientation, stableDimensions.widthM, stableDimensions.width, appState?.subwoofers]);

  return { handleLcrSpeakerMoved, handleFrontSubMoved };
}