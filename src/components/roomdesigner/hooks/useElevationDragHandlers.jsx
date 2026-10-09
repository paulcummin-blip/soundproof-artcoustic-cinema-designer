import { useCallback } from "react";
import { safeCanon } from "@/components/room/utils/speakerHelpers";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { detectFrontStageMode, resolveLcrHeightAuthority } from "@/components/roomdesigner/utils/lcrHeightAuthority";
import {
  centreCabinetPartnerRole,
  linkedCentreCabinetPositions,
} from "@/components/utils/dualCentrePairAuthority";

/**
 * Provides drag callbacks for the Front Elevation and Side Elevation views.
 * Extracted from RoomDesigner to keep that file under the line limit.
 *
 * Stage 2: Subwoofer moves commit via the canonical-first commitInstances API.
 * The canonical array is written once, then both CFG mirrors are derived.
 * X updates canonical position.x only. Z (centre height) is converted to
 * bottomHeightM using the targeted instance's own model and the front group
 * orientation. Never store centre z in position.
 */
export function useElevationDragHandlers({
  setSpeakers,
  stableDimensions,
  placedSpeakers,
  appState,
  _frontSubsCfg,
  compat,
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
    const frontStageMode = detectFrontStageMode(placedSpeakers);
    const isCenterOnly = frontStageMode === 'center_only';

    // Dual-centre linked pair: a cabinet drag carries its partner with it.
    // The dragged cabinet moves on the dragged axis only; the partner takes the
    // mirrored position (x reflected about the room centreline, y and z shared).
    const pairPartnerRole = centreCabinetPartnerRole(role);
    let linked = null;
    if (pairPartnerRole) {
      const draggedSpk = placedSpeakers.find(s => safeCanon(s.role) === role);
      const partnerSpk = placedSpeakers.find(s => safeCanon(s.role) === pairPartnerRole);
      linked = linkedCentreCabinetPositions({
        roomWidthM: rW,
        draggedRole: role,
        draggedPosition: {
          ...(draggedSpk?.position || {}),
          ...(axis === 'x' ? { x: newX } : {}),
          ...(axis === 'z' ? { z: newZ } : {}),
        },
        partnerPosition: partnerSpk?.position || {},
      });
    }

    setSpeakers(prev => prev.map(spk => {
      const canon = safeCanon(spk.role);
      const isLcrRole = canon === 'FL' || canon === 'FC' || canon === 'FR';

      if (canon === role) {
        return {
          ...spk,
          positionSource: 'user',
          position: {
            ...spk.position,
            ...(axis === 'x' ? { x: newX } : {}),
            ...(axis === 'z' ? { z: newZ } : {}),
          },
        };
      }
      // The pair's other cabinet takes the mirrored position, so both cabinets
      // move as one pair in the elevation exactly as in Plan View.
      if (linked && canon === pairPartnerRole) {
        return { ...spk, positionSource: 'user', position: linked.partner };
      }
      if (axis === 'x' && role === 'FL' && canon === 'FR') {
        return { ...spk, position: { ...spk.position, x: rW - newX } };
      }
      if (axis === 'x' && role === 'FR' && canon === 'FL') {
        return { ...spk, position: { ...spk.position, x: rW - newX } };
      }
      if (axis === 'z' && isLcrRole) {
        if (allSameModel) {
          return { ...spk, positionSource: 'user', position: { ...spk.position, z: newZ } };
        }
        // In center_only mode, FL and FR are independent — don't sync them.
        // Only sync FL/FR in standard/integrated_lcr modes where matched L/R
        // height is the intended behaviour.
        if (!isCenterOnly && (role === 'FL' || role === 'FR') && (canon === 'FL' || canon === 'FR')) {
          return { ...spk, positionSource: 'user', position: { ...spk.position, z: newZ } };
        }
      }
      return spk;
    }));

    // A centre-cabinet height drag sets the pair's own stored heights only: the
    // LCR height authority belongs to FL/FC/FR and must not be rewritten by a
    // cabinet move.
    if (axis === 'z' && !pairPartnerRole) {
      const patch = resolveLcrHeightAuthority({ role, newZ, frontStageMode });
      appState?.updateGlobalSpl?.(patch);
    }
  }, [setSpeakers, stableDimensions.widthM, stableDimensions.width, placedSpeakers, appState?.updateGlobalSpl]);

  const handleFrontSubMoved = useCallback(({ movedBySubId, axis }) => {
    if (!compat?.hasCanonicalInstances) return;
    const currentInstances = Array.isArray(appState?.subwooferInstances) ? appState.subwooferInstances : [];
    if (currentInstances.length === 0 || !movedBySubId) return;

    const frontOrientation = _frontSubsCfg?.orientation ?? null;

    let changed = false;
    const next = currentInstances.map((inst) => {
      if (!inst || inst.enabled === false || inst.legacyGroup !== 'front') return inst;
      const moved = movedBySubId[inst.id];
      if (!moved) return inst;
      const patch = {};
      if (axis === 'x' && Number.isFinite(Number(moved.x))) {
        patch.position = { ...inst.position, x: Number(moved.x) };
        patch.positionSource = 'user';
      }
      if (axis === 'z' && Number.isFinite(Number(moved.z))) {
        // Convert centre z to bottomHeightM using the instance's own model
        // and the front group orientation. Never store centre z in position.
        const meta = getSpeakerModelMeta(inst.model, frontOrientation) || {};
        const subH = Number(meta.heightM);
        const resolvedH = Number.isFinite(subH) && subH > 0 ? subH : 0.50;
        patch.bottomHeightM = Math.max(0, Number(moved.z) - resolvedH / 2);
      }
      if (Object.keys(patch).length === 0) return inst;
      changed = true;
      return { ...inst, ...patch };
    });

    if (!changed) return;

    // One canonical-first commit: instances once, then both CFG mirrors derived.
    compat.commitInstances(next, {
      front: { placementMode: 'manual', isManual: true },
    });
  }, [compat, appState?.subwooferInstances, _frontSubsCfg, _frontSubsCfg?.orientation]);

  return { handleLcrSpeakerMoved, handleFrontSubMoved };
}