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

    // Free movement: clamp to room bounds only (no wall pinning).
    const minX = halfW + EPS;
    const maxX = widthM - halfW - EPS;
    const minY = halfD + EPS;
    const maxY = lengthM - halfD - EPS;

    let finalX = Math.max(minX, Math.min(maxX, anchoredX));
    let finalY = Math.max(minY, Math.min(maxY, anchoredY));

    // Safety: if final position is invalid, fallback to previous or center
    if (!Number.isFinite(finalX)) {
      const prevX = sub.position?.x;
      finalX = Number.isFinite(prevX) ? prevX : (minX + maxX) / 2;
    }
    if (!Number.isFinite(finalY)) {
      const prevY = sub.position?.y;
      finalY = Number.isFinite(prevY) ? prevY : (minY + maxY) / 2;
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
    }

    // No config commit during mousemove — draft refs are the live render source.
    // commitDraftSubPositions() is called once on mouseup via useMouseUpHandler.
  }, [byId, canvasToRoom, widthM, lengthM, getModelDimsM,
      draggedSubTypeRef, draftFrontSubsRef, draftRearSubsRef,
      setSubDragTick]);

  return { handleSubDrag };
}