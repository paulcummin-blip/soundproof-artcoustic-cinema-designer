"use client";

import { useCallback } from "react";
import { sideWallX } from "@/components/room/rv/utils/rvGeometry";

export function useMouseUpHandler({
  dragType,
  draggedItemId,
  byId,
  getCanonicalRole,
  overheadZones,
  onSetSpeakers,
  setDragState,
  setDragWarning,
  setTooltip,
  rsDragLockRef,
  isDraggingRearRef,
  isDraggingFW,
  isDraggingSubRef,
  isAnyDraggingRef,
  isDraggingSpeakerRef,
  dragOffsetRoomRef,
  draggedSubWallRef,
  draggedSubTypeRef,
  draftFrontSubsRef,
  draftRearSubsRef,
  idleCommitTimerRef,
  isDraggingRef, // props.isDraggingRef
  widthM,
  getModelDimsM,
  commitDraftSubPositions,
}) {
  const handleMouseUp = useCallback((e) => {
    // Signal to RoomDesigner that dragging ended
    if (isDraggingRef) {
      isDraggingRef.current = false;
    }

    // Commit draft sub positions if sub was being dragged (BEFORE clearing drag state)
     if (isDraggingSubRef.current) {
       // Cancel idle timer
       if (idleCommitTimerRef.current) {
         clearTimeout(idleCommitTimerRef.current);
         idleCommitTimerRef.current = null;
       }

       // Commit final positions immediately on release
       commitDraftSubPositions();

       // Signal BassResponse that dragging ended
       if (typeof window !== 'undefined' && typeof window.__B44_setIsDraggingSub === 'function') {
         window.__B44_setIsDraggingSub(false);
       }

       isDraggingSubRef.current = false;
       // DO NOT clear draft refs yet — let the next render use committed state first
       // They will be cleared after dragging state is set to false
     }

     // Release pointer capture
     if (dragType === 'speaker' && e?.target) {
       try {
         if (typeof e.target.releasePointerCapture === 'function' && e.pointerId) {
           e.target.releasePointerCapture(e.pointerId);
         }
       } catch (err) {
         // Ignore release errors
       }
     }

     // [B44 PROMPT 4] Clamp overheads to RP22 zones after drag ends
     if (dragType === 'speaker' && draggedItemId) {
      const spk = byId.get(draggedItemId);
      if (spk) {
        const canonicalRole = getCanonicalRole(spk.role);
        const isOverhead = typeof canonicalRole === "string" && canonicalRole.startsWith("T");
        const isFrontWide = canonicalRole === 'LW' || canonicalRole === 'RW';

        if (isOverhead && overheadZones?.status === 'ok') {
          let zone = null;
          if (['TFL', 'TFR', 'TFC'].includes(canonicalRole)) {
            zone = overheadZones.front;
          } else if (['TML', 'TMR'].includes(canonicalRole)) {
            zone = overheadZones.mid;
          } else if (['TRL', 'TRR', 'TRC'].includes(canonicalRole)) {
            zone = overheadZones.rear;
          }

          if (zone && Number.isFinite(spk.position?.x) && Number.isFinite(spk.position?.y)) {
            const clampedX = Math.min(Math.max(spk.position.x, zone.xMin), zone.xMax);
            const clampedY = Math.min(Math.max(spk.position.y, zone.yMin), zone.yMax);

            if (Math.abs(clampedX - spk.position.x) > 0.001 || Math.abs(clampedY - spk.position.y) > 0.001) {
              onSetSpeakers(prev => prev.map(s =>
                s.id === draggedItemId
                  ? { ...s, position: { ...s.position, x: clampedX, y: clampedY }, positionSource: 'user' }
                  : s
              ));
            } else {
              onSetSpeakers(prev => prev.map(s =>
                s.id === draggedItemId
                  ? { ...s, positionSource: 'user' }
                  : s
              ));
            }
          } else {
            onSetSpeakers(prev => prev.map(s =>
              s.id === draggedItemId
                ? { ...s, positionSource: 'user' }
                : s
            ));
          }
        } else if (isFrontWide) {
          const W = widthM || 0;
          const dims = getModelDimsM(spk.model);
          const targetX = sideWallX(W, dims, canonicalRole === 'LW' ? 'L' : 'R');
          onSetSpeakers(prev => prev.map(s =>
            s.id === draggedItemId
              ? { ...s, position: { ...s.position, x: targetX }, positionSource: 'user' }
              : s
          ));
        } else {
          onSetSpeakers(prev => prev.map(s =>
            s.id === draggedItemId
              ? { ...s, positionSource: 'user' }
              : s
          ));
        }
      }
    }

    isAnyDraggingRef.current = false;

    setDragState({
      dragging: false,
      draggedItemId: null,
      dragType: null,
    });
    setDragWarning({ show: false });
    setTooltip({ show: false });
    rsDragLockRef.current = null;
    isDraggingRearRef.current = 0;
    isDraggingFW.current = false;
    isDraggingSpeakerRef.current = false;
    dragOffsetRoomRef.current = { x: 0, y: 0 };
    draggedSubWallRef.current = null;
    draggedSubTypeRef.current = null;

  }, [dragType, draggedItemId, byId, getCanonicalRole, overheadZones, onSetSpeakers, setDragState, setDragWarning, setTooltip, rsDragLockRef, isDraggingRearRef, isDraggingFW, isDraggingRef, widthM, getModelDimsM, commitDraftSubPositions]);

  return { handleMouseUp };
}