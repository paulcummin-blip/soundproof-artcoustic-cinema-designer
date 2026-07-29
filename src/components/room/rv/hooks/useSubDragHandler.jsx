import { useCallback } from "react";
import { findSymmetrySnap } from "@/components/room/rv/utils/subSymmetrySnap";
import { deriveSubWallOrientation, subHalfExtents } from "@/components/room/rv/utils/subWallOrientation";

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
  setSubSnapState,
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
    const EPS = 0.01;

    // Stage 2B.5 — wall-aware cabinet orientation.
    // Derive cabinet rotation from the raw candidate position, then compute
    // rotation-aware half-extents for 10 mm wall-clearance clamping. Two-pass
    // (re-derive from clamped position) so clamping into a wall zone converges.
    // Physical placement only — does not affect acoustic source or bass sim.
    let _orient = deriveSubWallOrientation({
      x: anchoredX, y: anchoredY, widthM, lengthM, subWidthM: w, subDepthM: d,
    });
    let _ext = subHalfExtents(w, d, _orient.rotationDeg);

    let minX = _ext.halfX + EPS;
    let maxX = widthM - _ext.halfX - EPS;
    let minY = _ext.halfY + EPS;
    let maxY = lengthM - _ext.halfY - EPS;

    let finalX = Math.max(minX, Math.min(maxX, anchoredX));
    let finalY = Math.max(minY, Math.min(maxY, anchoredY));

    // Re-derive orientation from the clamped position (clamping may have moved
    // the sub into a wall zone) and re-clamp once if the rotation changed.
    let finalRot = deriveSubWallOrientation({
      x: finalX, y: finalY, widthM, lengthM, subWidthM: w, subDepthM: d,
    }).rotationDeg;
    if (finalRot !== _orient.rotationDeg) {
      _ext = subHalfExtents(w, d, finalRot);
      minX = _ext.halfX + EPS;
      maxX = widthM - _ext.halfX - EPS;
      minY = _ext.halfY + EPS;
      maxY = lengthM - _ext.halfY - EPS;
      finalX = Math.max(minX, Math.min(maxX, anchoredX));
      finalY = Math.max(minY, Math.min(maxY, anchoredY));
      finalRot = deriveSubWallOrientation({
        x: finalX, y: finalY, widthM, lengthM, subWidthM: w, subDepthM: d,
      }).rotationDeg;
    }

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

    // Stage 2B.4 — drag-time symmetry snap assistance.
    // Snaps the dragged sub to the mirrored position of an enabled partner in
    // the same group when within threshold. No permanent lock, no linked
    // movement; the partner is never moved. Final stored coordinates remain
    // independent.
    let snapResult = null;
    try {
      snapResult = findSymmetrySnap({
        draggedSub: sub,
        draftArray,
        widthM,
        lengthM,
        candidateX: finalX,
        candidateY: finalY,
      });
    } catch (_) { /* snap is best-effort, never blocks drag */ }
    if (snapResult) {
      finalX = snapResult.snappedX;
      finalY = snapResult.snappedY;
    }
    if (typeof setSubSnapState === "function") {
      setSubSnapState(snapResult);
    }

    // Resolve the dragged draft entry by exact stable id (already found above as `sub`)
    const subInDraft = sub;

    if (subInDraft) {
      subInDraft.position.x = finalX;
      subInDraft.position.y = finalY;
      subInDraft.rotationDeg = finalRot;

      setSubDragTick((n) => n + 1);
    }

    // No config commit during mousemove — draft refs are the live render source.
    // commitDraftSubPositions() is called once on mouseup via useMouseUpHandler.
  }, [byId, canvasToRoom, widthM, lengthM, getModelDimsM,
      draggedSubTypeRef, draftFrontSubsRef, draftRearSubsRef,
      setSubDragTick, setSubSnapState]);

  return { handleSubDrag };
}