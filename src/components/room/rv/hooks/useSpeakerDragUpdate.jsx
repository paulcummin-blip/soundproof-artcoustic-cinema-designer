/**
 * useSpeakerDragUpdate.js  (Layer 2)
 *
 * Owns:
 *   - canvas → room coordinate conversion
 *   - calling solveSpeakerDragConstraints (Layer 1)
 *   - applying ref side-effects (slsrModeRef, fwOffsetRef, isDraggingFW, lastInteractionEpoch)
 *   - calling onSetSpeakers with the solved positions
 *
 * Returns:  handleSpeakerDragUpdate(speakerId, newCanvasPos)
 */

import { useCallback } from "react";
import { solveSpeakerDragConstraints } from "@/components/room/rv/utils/solveSpeakerDragConstraints";

export function useSpeakerDragUpdate({
  // lookup
  byId,
  // state updater
  onSetSpeakers,
  // coordinate helpers
  canvasToRoom,
  // refs
  lastInteractionEpoch,
  fwOffsetRef,
  slsrModeRef,
  isDraggingFW,
  // state setter for overhead manual-edit flag
  setHasManualOverheadEdit,
  // drag warning
  setDragWarning,
  // room geometry
  widthM,
  lengthM,
  screenCenterX_m,
  centerX_m,
  // constraint data
  constraintZones,
  frontWideZones,
  overheadZones,
  placedSpeakers,
  seatingPositions,
  mlpDotY_m,
  freeMoveLcr,
  _overlays,
  sideSurroundVisualSpanM,
  rearSurroundVisualLanes,
  mlp,
  // util fns
  getModelDimsM,
  getCanonicalRole,
  getSpeakerDims,
  rsRearCorridor,
  clampOverheadXToSeatSpan,
  nonCrossingClampDirectional,
  fwDeviationLevel,
  horizontalAngleFromMLP,
  isOnSideWall,
  speakerOnWallYFootprint,
  clamp,
  isDraggable,
  isRenderableSpeaker,
  // aiming flags — needed for yaw-aware wall projection in drag solver
  aimFrontWidesAtMLP = false,
  aimSideSurroundsAtMLP = false,
  aimRearSurroundsAtMLP = false,
  lcrAngleInfo = null,
  // constants
  CORNER_CLEAR_M,
  BACKWALL_HYSTERESIS_M,
  SURROUND_WALL_GAP_M,
  SIDE_ALLOW_OVERHANG,
  WALL_BUFFER_M,
  EPS,
  timeNowMs,
}) {
  const handleSpeakerDragUpdate = useCallback(
    (speakerId, newCanvasPos) => {
      if (globalThis.__B44_LOGS)
        console.log("[DRAG] handleSpeakerDragUpdate ENTER", { speakerId });

      if (!onSetSpeakers) return;

      const spk = byId.get(speakerId);
      if (!spk) return;

      const canonicalRole = getCanonicalRole(spk.role);
      const isOverhead = typeof canonicalRole === "string" && canonicalRole.startsWith("T");

      // Overheads bypass the draggable guard
      if (!isOverhead && !isDraggable(spk)) {
        if (globalThis.__B44_LOGS)
          console.log("[DRAG] blocked by isDraggable", { speakerId, role: spk?.role });
        return;
      }

      // ── call pure solver ──────────────────────────────────────────────
      const { finalPositions, additionalUpdates } = solveSpeakerDragConstraints({
        speakerId,
        spk,
        canonicalRole,
        newCanvasPos,
        canvasToRoom,
        widthM,
        lengthM,
        aimFrontWidesAtMLP,
        aimSideSurroundsAtMLP,
        aimRearSurroundsAtMLP,
        lcrAngleInfo,
        placedSpeakers,
        seatingPositions,
        constraintZones,
        frontWideZones,
        overheadZones,
        _overlays,
        sideSurroundVisualSpanM,
        rearSurroundVisualLanes,
        mlp,
        mlpDotY_m,
        freeMoveLcr,
        screenCenterX_m,
        centerX_m,
        getModelDimsM,
        getCanonicalRole,
        getSpeakerDims,
        rsRearCorridor,
        clampOverheadXToSeatSpan,
        nonCrossingClampDirectional,
        fwDeviationLevel,
        horizontalAngleFromMLP,
        isOnSideWall,
        speakerOnWallYFootprint,
        clamp,
        CORNER_CLEAR_M,
        BACKWALL_HYSTERESIS_M,
        SURROUND_WALL_GAP_M,
        SIDE_ALLOW_OVERHANG,
        WALL_BUFFER_M,
        EPS,
        slsrModeCurrent: slsrModeRef.current,
        fwOffsetCurrent: fwOffsetRef.current,
      });

      // ── LCR fallback: solver returns empty when constraintZones are absent ────
      // Instead of leaving the speaker frozen or broken, provide a safe room-geometry
      // clamp so FL/FC/FR stay visible and draggable at all times.
      if (finalPositions.length === 0 && ['FL', 'FC', 'FR'].includes(canonicalRole)) {
        const raw = canvasToRoom(newCanvasPos);
        if (raw && Number.isFinite(raw.x)) {
          const W = widthM || 4.5;
          const halfW = W / 2;
          const buf = WALL_BUFFER_M || 0.01;
          let safeX;
          if (canonicalRole === 'FL')      safeX = Math.max(buf, Math.min(halfW - buf, raw.x));
          else if (canonicalRole === 'FR') safeX = Math.max(halfW + buf, Math.min(W - buf, raw.x));
          else                             safeX = halfW; // FC: always on centerline
          finalPositions.push({
            id: speakerId,
            position: { ...(spk.position || {}), x: safeX },
          });
        }
      }

      // ── apply ref side-effects ────────────────────────────────────────
      if (additionalUpdates.slsrMode !== undefined) {
        slsrModeRef.current = additionalUpdates.slsrMode;
      }
      if (additionalUpdates.fwOffset) {
        const { side, offset } = additionalUpdates.fwOffset;
        fwOffsetRef.current[side] = offset;
        isDraggingFW.current = true;
      }
      if (additionalUpdates.fwPartnerOffset) {
        const { side, offset } = additionalUpdates.fwPartnerOffset;
        fwOffsetRef.current[side] = offset;
      }
      if (additionalUpdates.setHasManualOverheadEdit) {
        setHasManualOverheadEdit(true);
      }

      // ── apply fwMeta to spk.meta in finalPositions ────────────────────
      if (additionalUpdates.fwMeta) {
        const { speakerId: fwId, ...metaFields } = additionalUpdates.fwMeta;
        const target = finalPositions.find(p => p.id === fwId);
        if (target) {
          target.meta = { ...(target.meta || spk.meta || {}), ...metaFields };
        }
        // Also mutate the live spk.meta so calling code sees it (existing behaviour)
        spk.meta = { ...(spk.meta || {}), ...metaFields };
      }

      // ── write to state ────────────────────────────────────────────────
      if (finalPositions.length > 0) {
        if (globalThis.__B44_LOGS)
          console.log("[DRAG] APPLY: calling onSetSpeakers", { speakerId, role: spk?.role, count: finalPositions.length });

        const updatedMap = new Map(finalPositions.map(p => [p.id, p]));

        onSetSpeakers(prev =>
          prev.map(s => {
            const upd = updatedMap.get(s.id);
            if (!upd) return s;
            // Guard: never write a non-finite position — an invalid position causes the speaker
            // to fail isRenderableSpeaker and vanish from the plan view.
            const pos = upd.position;
            if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return s;
            return {
              ...s,
              position: upd.position,
              ...(upd.meta        !== undefined ? { meta: upd.meta }               : {}),
              ...(upd.positionSource !== undefined ? { positionSource: upd.positionSource } : {}),
              ...(upd.isOnRearWall !== undefined ? { isOnRearWall: upd.isOnRearWall } : {}),
            };
          })
        );
      }

      // ── update last-interaction timestamp ─────────────────────────────
      lastInteractionEpoch.current = timeNowMs();

      if (globalThis.__B44_LOGS)
        console.log("[DRAG] handleSpeakerDragUpdate EXIT", { speakerId });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      byId, onSetSpeakers, canvasToRoom, widthM, lengthM, screenCenterX_m, centerX_m,
      constraintZones, frontWideZones, overheadZones, sideSurroundVisualSpanM,
      rearSurroundVisualLanes, mlp, mlpDotY_m, freeMoveLcr,
      getModelDimsM, getCanonicalRole, getSpeakerDims, rsRearCorridor,
      clampOverheadXToSeatSpan, nonCrossingClampDirectional, fwDeviationLevel,
      horizontalAngleFromMLP, isOnSideWall, speakerOnWallYFootprint, clamp,
      isDraggable, setHasManualOverheadEdit,
      // refs are stable – not listed, intentionally
    ]
  );

  return handleSpeakerDragUpdate;
}