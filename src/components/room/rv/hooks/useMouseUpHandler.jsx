"use client";

import { useCallback } from "react";
import { sideWallX } from "@/components/room/rv/utils/rvGeometry";
import { recordTemporaryP18P19DragEnd } from "@/components/hooks/useRP22AnalysisEngine";

let temporaryRSPDragEndCount = 0;

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
  _lastValidDraftFrontSubsRef,
  _lastValidDraftRearSubsRef,
  // Seat draft commit
  isDraggingSeatRef,
  draftSeatsRef,
  commitDraftSeatPositions,
  // Speaker draft commit
  isDraggingSpeakerDraftRef,
  draftSpeakersRef,
  commitDraftSpeakerPositions,
}) {
  const handleMouseUp = useCallback((e) => {
    // TEMPORARY P18/P19 trace: RSP uses setManualRspY_m on pointer move; this handler has no separate RSP commit setter.
    if (dragType === "mlpMarker") {
      recordTemporaryP18P19DragEnd({
        dragEndCount: ++temporaryRSPDragEndCount,
        committedRspCoordinate: null,
        exactStateSetter: "none — RSP coordinate is written by setManualRspY_m during pointer move",
      });
    }

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

       // Snapshot final draft positions into held refs before clearing drafts
       if (draftFrontSubsRef.current) {
         _lastValidDraftFrontSubsRef.current = draftFrontSubsRef.current.map(s => ({
           ...s,
           position: { ...s.position }
         }));
       }

       if (draftRearSubsRef.current) {
         _lastValidDraftRearSubsRef.current = draftRearSubsRef.current.map(s => ({
           ...s,
           position: { ...s.position }
         }));
       }

       // Signal BassResponse that dragging ended
       if (typeof window !== 'undefined' && typeof window.__B44_setIsDraggingSub === 'function') {
         window.__B44_setIsDraggingSub(false);
       }

       isDraggingSubRef.current = false;
       draftFrontSubsRef.current = null;
       draftRearSubsRef.current = null;
       }

       // Commit draft seat positions if seats were being dragged
       if (isDraggingSeatRef?.current) {
       if (typeof commitDraftSeatPositions === 'function') {
         commitDraftSeatPositions();
       }
       if (draftSeatsRef) draftSeatsRef.current = null;
       isDraggingSeatRef.current = false;
       }

     // Release pointer capture
     if ((dragType === 'speaker' || dragType === 'projector') && e?.target) {
       try {
         if (typeof e.target.releasePointerCapture === 'function' && e.pointerId) {
           e.target.releasePointerCapture(e.pointerId);
         }
       } catch (err) {
         // Ignore release errors
       }
     }

     // Commit draft speaker positions if speakers were being dragged.
     // Apply final release constraints (overhead zones, front-wide side walls) and
     // positionSource: "user" to the draft, then commit once — no second onSetSpeakers call.
     if (isDraggingSpeakerDraftRef?.current) {
       if (dragType === 'speaker' && draggedItemId && Array.isArray(draftSpeakersRef?.current)) {
         const draftSpk = draftSpeakersRef.current.find(s => s.id === draggedItemId);
         if (draftSpk) {
           const canonicalRole = getCanonicalRole(draftSpk.role);
           const isOverhead = typeof canonicalRole === "string" && canonicalRole.startsWith("T");
           const isFrontWide = canonicalRole === 'LW' || canonicalRole === 'RW';

           let finalPosition = draftSpk.position;

           if (isOverhead && overheadZones?.status === 'ok') {
             let zone = null;
             if (['TFL', 'TFR', 'TFC'].includes(canonicalRole)) zone = overheadZones.front;
             else if (['TML', 'TMR'].includes(canonicalRole)) zone = overheadZones.mid;
             else if (['TRL', 'TRR', 'TRC'].includes(canonicalRole)) zone = overheadZones.rear;

             if (zone && Number.isFinite(finalPosition?.x) && Number.isFinite(finalPosition?.y)) {
               const clampedX = Math.min(Math.max(finalPosition.x, zone.xMin), zone.xMax);
               const clampedY = Math.min(Math.max(finalPosition.y, zone.yMin), zone.yMax);
               finalPosition = { ...finalPosition, x: clampedX, y: clampedY };
             }
           } else if (isFrontWide) {
             const W = widthM || 0;
             const dims = getModelDimsM(draftSpk.model);
             const targetX = sideWallX(W, dims, canonicalRole === 'LW' ? 'L' : 'R');
             if (Number.isFinite(targetX)) {
               finalPosition = { ...finalPosition, x: targetX };
             }
           }

           // Write final position + positionSource into the draft, then commit once
           draftSpeakersRef.current = draftSpeakersRef.current.map(s =>
             s.id === draggedItemId
               ? { ...s, position: finalPosition, positionSource: 'user' }
               : s
           );
         }
       }

       if (typeof commitDraftSpeakerPositions === 'function') {
         commitDraftSpeakerPositions();
       }
     }

     // Clear speaker draft ref after commit
     if (isDraggingSpeakerDraftRef) isDraggingSpeakerDraftRef.current = false;
     if (draftSpeakersRef) draftSpeakersRef.current = null;

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

  }, [dragType, draggedItemId, byId, getCanonicalRole, overheadZones, onSetSpeakers, setDragState, setDragWarning, setTooltip, rsDragLockRef, isDraggingRearRef, isDraggingFW, isDraggingRef, widthM, getModelDimsM, commitDraftSubPositions, isDraggingSeatRef, draftSeatsRef, commitDraftSeatPositions, isDraggingSpeakerDraftRef, draftSpeakersRef, commitDraftSpeakerPositions]);

  return { handleMouseUp };
}