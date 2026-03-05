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
  draftFrontSubsRef,
  draftRearSubsRef,
  setSubDragTick,
  idleCommitTimerRef,
  commitDraftSubPositions,
}) {
  const handleSubDrag = useCallback((subId, newCanvasPos) => {
    const sub = byId.get(subId);
    if (!sub) return;

    const subType = draggedSubTypeRef.current || sub._subType;
    const draftArray = subType === 'front' ? draftFrontSubsRef.current : draftRearSubsRef.current;
    if (!draftArray) return;

    const wall = draggedSubWallRef.current;
    if (!wall) return;

    const { x: rawX, y: rawY } = canvasToRoom(newCanvasPos);

    // Robust dimension resolution with safe defaults
    const dims = getModelDimsM(sub.model);
    const w = (Number.isFinite(dims.widthM) && dims.widthM > 0) ? dims.widthM : 0.50;
    const d = (Number.isFinite(dims.depthM) && dims.depthM > 0) ? dims.depthM : 0.30;
    const halfW = w / 2;
    const halfD = d / 2;
    const EPS = 0.01;

    let finalX = rawX;
    let finalY = rawY;

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

    // Update ONLY draft positions (no state setter during drag)
    const m = String(subId).match(/-(\d+)$/);
    const subIndex = m ? Number(m[1]) : 0;
    const subInDraft = draftArray[subIndex];

    if (subInDraft) {
      subInDraft.position.x = finalX;
      subInDraft.position.y = finalY;

      setSubDragTick((n) => n + 1);

      // Paired mirror drag: when exactly 2 subs on same wall, mirror the other
      if (draftArray.length === 2) {
        const otherIndex = subIndex === 0 ? 1 : 0;
        const mirrorX = widthM - finalX;
        const clampedMirrorX = Math.max(halfW + EPS, Math.min(widthM - halfW - EPS, mirrorX));

        if (Number.isFinite(clampedMirrorX) && draftArray[otherIndex]) {
          draftArray[otherIndex].position.x = clampedMirrorX;
          draftArray[otherIndex].position.y = finalY;
        }
      }
    }

    // Reset 200ms idle timer (semi-live commit)
    if (idleCommitTimerRef.current) {
      clearTimeout(idleCommitTimerRef.current);
    }

    idleCommitTimerRef.current = setTimeout(() => {
      commitDraftSubPositions();
    }, 200);
  }, [byId, canvasToRoom, widthM, lengthM, getModelDimsM,
      draggedSubTypeRef, draggedSubWallRef, draftFrontSubsRef, draftRearSubsRef,
      setSubDragTick, idleCommitTimerRef, commitDraftSubPositions]);

  return { handleSubDrag };
}