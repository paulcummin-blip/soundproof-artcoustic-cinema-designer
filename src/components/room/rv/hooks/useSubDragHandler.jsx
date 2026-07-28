import { useCallback } from "react";

/**
 * useSubDragHandler
 *
 * Handles drag movement for subwoofer elements.
 * Extracted from RoomVisualisation.jsx – behaviour is identical.
 *
 * Returns: { handleSubDrag }
 */
export function useSubDragHandler({
  byId,
  canvasToRoom,
  widthM,
  lengthM,
  getModelDimsM,
  draggedSubTypeRef,
  draggedSubWallRef,
  dragOffsetRoomRef,
  draftFrontSubsRef,
  draftRearSubsRef,
  setSubDragTick,
  // idleCommitTimerRef and commitDraftSubPositions intentionally omitted:
  // config is committed once on mouseup via useMouseUpHandler, not during drag.
}) {
  const handleSubDrag = useCallback((subId, newCanvasPos) => {
    // subId is the sub's stable canonical id (or a generated front-sub-N/rear-sub-N
    // id when seeding from CFG fallback). Resolve the dragged draft entry by exact
    // stable id, not group index.
    let draftArray = null;
    let sub = null;
    if (Array.isArray(draftFrontSubsRef.current)) {
      sub = draftFrontSubsRef.current.find(s => s?.id === subId);
      if (sub) draftArray = draftFrontSubsRef.current;
    }
    if (!sub && Array.isArray(draftRearSubsRef.current)) {
      sub = draftRearSubsRef.current.find(s => s?.id === subId);
      if (sub) draftArray = draftRearSubsRef.current;
    }
    if (!sub || !draftArray) return;

    const wall = draggedSubWallRef.current;
    if (!wall) return;

    const { x: rawX, y: rawY } = canvasToRoom(newCanvasPos);

    // Apply pointer-to-sub offset captured at drag start so the sub moves
    // relative to where it was clicked, not snapping its centre to the pointer.
    const offsetX = dragOffsetRoomRef?.current?.x ?? 0;
    const offsetY = dragOffsetRoomRef?.current?.y ?? 0;
    const anchoredX = rawX + offsetX;
    const anchoredY = rawY + offsetY;

    // Robust dimension resolution with safe defaults
    const dims = getModelDimsM(sub.model);
    const w = (Number.isFinite(dims.widthM) && dims.widthM > 0) ? dims.widthM : 0.50;
    const d = (Number.isFinite(dims.depthM) && dims.depthM > 0) ? dims.depthM : 0.30;
    const halfW = w / 2;
    const halfD = d / 2;
    const EPS = 0.01;

    let finalX = anchoredX;
    let finalY = anchoredY;

    // Pin to wall using center-safe positioning (account for sub depth/width)
    if (wall === 'front') {
      finalY = halfD + EPS;
      finalX = Math.max(halfW + EPS, Math.min(widthM - halfW - EPS, rawX));
    } else if (wall === 'rear') {
      // Rear-specific corner-safe clamping
      const minX = halfW + EPS;
      const maxX = widthM - halfW - EPS;
      const rearPinnedY = lengthM - halfD - EPS;

      finalY = rearPinnedY;
      finalX = Math.max(minX, Math.min(maxX, rawX));

      // Safety: if finalX is invalid, fallback to previous or center
      if (!Number.isFinite(finalX)) {
        const prevX = sub.position?.x;
        finalX = Number.isFinite(prevX) ? prevX : (minX + maxX) / 2;
      }
    } else if (wall === 'left') {
      finalX = halfW + EPS;
      finalY = Math.max(halfD + EPS, Math.min(lengthM - halfD - EPS, rawY));
    } else if (wall === 'right') {
      finalX = widthM - halfW - EPS;
      finalY = Math.max(halfD + EPS, Math.min(lengthM - halfD - EPS, rawY));
    }

    // Final validation: never write invalid positions
    if (!Number.isFinite(finalX) || !Number.isFinite(finalY)) {
      return;
    }

    // Resolve the dragged draft entry by exact stable id (already found above as `sub`)
    const subInDraft = sub;

    if (subInDraft) {
      subInDraft.position.x = finalX;
      subInDraft.position.y = finalY;

      setSubDragTick((n) => n + 1);

      // Paired mirror drag: when exactly 2 subs on same wall, mirror the other
      // by excluding the dragged stable id.
      if (draftArray.length === 2) {
        const other = draftArray.find(s => s?.id !== subId);
        const mirrorX = widthM - finalX;
        const clampedMirrorX = Math.max(halfW + EPS, Math.min(widthM - halfW - EPS, mirrorX));

        if (other && Number.isFinite(clampedMirrorX)) {
          other.position.x = clampedMirrorX;
          other.position.y = finalY;
        }
      }
    }

    // No config commit during mousemove — draft refs are the live render source.
    // commitDraftSubPositions() is called once on mouseup via useMouseUpHandler.
  }, [byId, canvasToRoom, widthM, lengthM, getModelDimsM,
      draggedSubTypeRef, draggedSubWallRef, draftFrontSubsRef, draftRearSubsRef,
      setSubDragTick]);

  return { handleSubDrag };
}