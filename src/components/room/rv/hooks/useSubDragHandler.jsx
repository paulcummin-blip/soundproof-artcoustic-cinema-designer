import { useCallback } from "react";
import { findSymmetrySnap } from "@/components/room/rv/utils/subSymmetrySnap";
import { findOpposingAlignmentSnap } from "@/components/room/rv/utils/subOpposingAlignmentSnap";
import { findCoordinateSnap } from "@/components/room/rv/utils/subCoordinateSnap";
import { getSubPlacementGuideCoordinates } from "@/components/room/bass/best-layout/subPlacementGuideCoordinates";
import { deriveSubWallOrientation, subHalfExtents } from "@/components/room/rv/utils/subWallOrientation";
import { publishSubDragLive } from "@/components/state/subDragLiveStore";

// Magnetic snap tolerance — 8 screen pixels converted to room metres via the
// current plan scale. Clamped so zoom extremes do not make snapping unusable.
const SNAP_TOLERANCE_PX = 8;
const SNAP_TOLERANCE_MIN_M = 0.02;
const SNAP_TOLERANCE_MAX_M = 0.15;

/**
 * useSubDragHandler
 *
 * Handles drag movement for subwoofer elements.
 * Extracted from RoomVisualisation.jsx – behaviour is identical.
 *
 * Snapping order (compatible geometric constraints, NOT mutually exclusive):
 *   1. Wall lock (coordinate snap perpendicular) — pins the cabinet to the
 *      wall at 10 mm clearance.
 *   2. Subwoofer alignment (opposing + symmetry) — snaps the ALONG-WALL
 *      position to match a partner. This overrides any along-wall coordinate
 *      snap (quarter / midpoint) because the subwoofer target is more
 *      specific.
 *   3. Interior coordinate snaps (quarter / midpoint) apply on the along-wall
 *      axis only when no subwoofer alignment is within 5 cm.
 *
 * All three snap results are reported independently so the guides can render
 * simultaneously (e.g. a wall-lock line + a symmetry line + an opposing line).
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
  scale,
  rspPointRef,
  // idleCommitTimerRef and commitDraftSubPositions intentionally omitted:
  // config is committed once on mouseup via useMouseUpHandler, not during drag.
}) {
  // targetRoomPos is the canonical final target in room metres: the shared move
  // handler has already converted the pointer and applied the grab offset ONCE.
  // This handler must never convert back to canvas, nor re-apply the offset.
  const handleSubDrag = useCallback((subId, targetRoomPos) => {
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

    // Canonical room-space target, offset already applied upstream.
    const anchoredX = Number(targetRoomPos?.x);
    const anchoredY = Number(targetRoomPos?.y);
    if (!Number.isFinite(anchoredX) || !Number.isFinite(anchoredY)) return;

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

    // ── Magnetic snapping (compatible constraints, applied simultaneously) ──
    //
    // The wall-perpendicular axis is pinned by the coordinate wall snap.
    // The along-wall axis is pinned by the subwoofer alignment (opposing or
    // symmetry) when within 5 cm, otherwise by the coordinate interior snap.
    // These are compatible: wall lock + subwoofer alignment can both hold.

    const toleranceM = Number.isFinite(scale) && scale > 0
      ? Math.max(SNAP_TOLERANCE_MIN_M, Math.min(SNAP_TOLERANCE_MAX_M, SNAP_TOLERANCE_PX / scale))
      : SNAP_TOLERANCE_MIN_M;

    const guideCoordinates = getSubPlacementGuideCoordinates({
      widthM,
      lengthM,
      cabinetHalfExtents: _ext,
      wallClearance: EPS,
    });

    // Pre-snap position (after clamping). Sub snaps evaluate against this so
    // the 5 cm capture reflects the user's actual pointer, not a coordinate-
    // snapped value.
    const clampedX = finalX;
    const clampedY = finalY;

    // 1. Coordinate snap (wall lock + interior positions).
    let coordSnap = null;
    try {
      if (guideCoordinates) {
        coordSnap = findCoordinateSnap({
          candidateX: clampedX,
          candidateY: clampedY,
          guideCoordinates,
          toleranceM,
        });
      }
    } catch (_) { /* snap is best-effort, never blocks drag */ }

    // 2. Subwoofer alignment snaps — ALWAYS evaluated (never suppressed by
    //    the coordinate snap). Both fire independently so both guides can
    //    render simultaneously.
    const rspPoint = rspPointRef?.current ?? null;

    const allPartners = [
      ...(Array.isArray(draftFrontSubsRef.current) ? draftFrontSubsRef.current : []),
      ...(Array.isArray(draftRearSubsRef.current) ? draftRearSubsRef.current : []),
    ];

    let opposingResult = null;
    let symResult = null;

    try {
      opposingResult = findOpposingAlignmentSnap({
        draggedSub: sub,
        allPartners,
        widthM,
        lengthM,
        candidateX: clampedX,
        candidateY: clampedY,
        draggedDims: { widthM: w, depthM: d },
        getModelDimsM,
      });
    } catch (_) { /* snap is best-effort */ }

    try {
      symResult = findSymmetrySnap({
        draggedSub: sub,
        draftArray,
        widthM,
        lengthM,
        candidateX: clampedX,
        candidateY: clampedY,
        draggedDims: { widthM: w, depthM: d },
        getModelDimsM,
        rspPoint,
      });
    } catch (_) { /* snap is best-effort */ }

    // 3. Merge: wall lock (perpendicular) + subwoofer alignment (along-wall).
    let snapX = clampedX;
    let snapY = clampedY;

    // Apply coordinate snap first (perpendicular wall lock + along-wall interior).
    if (coordSnap) {
      if (coordSnap.snapX !== null) snapX = coordSnap.snapX;
      if (coordSnap.snapY !== null) snapY = coordSnap.snapY;
    }

    // Sub snaps override the ALONG-WALL axis only. The perpendicular wall
    // lock is never touched. Pick the closer sub snap on the along-wall axis.
    const draggedWall = deriveSubWallOrientation({
      x: clampedX, y: clampedY, widthM, lengthM, subWidthM: w, subDepthM: d,
    }).wall;
    const alongAxis = (draggedWall === "front" || draggedWall === "rear") ? "x" : "y";

    let chosenSub = null;
    let chosenDist = Infinity;
    if (opposingResult) {
      const dist = alongAxis === "x"
        ? Math.abs(clampedX - opposingResult.snappedX)
        : Math.abs(clampedY - opposingResult.snappedY);
      if (dist < chosenDist) { chosenSub = opposingResult; chosenDist = dist; }
    }
    if (symResult) {
      const dist = alongAxis === "x"
        ? Math.abs(clampedX - symResult.snappedX)
        : Math.abs(clampedY - symResult.snappedY);
      if (dist < chosenDist) { chosenSub = symResult; chosenDist = dist; }
    }

    if (chosenSub) {
      if (alongAxis === "x" && Number.isFinite(chosenSub.snappedX)) {
        snapX = chosenSub.snappedX;
      } else if (alongAxis === "y" && Number.isFinite(chosenSub.snappedY)) {
        snapY = chosenSub.snappedY;
      }
    }

    // 4. Re-validate cabinet bounds for the merged position. The snapped
    //    coordinate must not push the cabinet through a wall. If it would,
    //    keep the clamped position and suppress the sub snaps (not applied).
    const snapOrient = deriveSubWallOrientation({
      x: snapX, y: snapY, widthM, lengthM, subWidthM: w, subDepthM: d,
    });
    const snapExt = subHalfExtents(w, d, snapOrient.rotationDeg);
    const snapMinX = snapExt.halfX + EPS;
    const snapMaxX = widthM - snapExt.halfX - EPS;
    const snapMinY = snapExt.halfY + EPS;
    const snapMaxY = lengthM - snapExt.halfY - EPS;

    if (
      snapX >= snapMinX && snapX <= snapMaxX &&
      snapY >= snapMinY && snapY <= snapMaxY
    ) {
      finalX = snapX;
      finalY = snapY;
      finalRot = snapOrient.rotationDeg;
    } else {
      // Merged position breaches wall clearance — keep clamped, suppress sub
      // snaps so guides do not claim a snap that was not applied.
      opposingResult = null;
      symResult = null;
    }

    // Report ALL active snaps so the guides can render simultaneously.
    if (typeof setSubSnapState === "function") {
      setSubSnapState({
        opposing: opposingResult,
        symmetry: symResult,
        coordinate: coordSnap,
      });
    }

    // Resolve the dragged draft entry by exact stable id (already found above as `sub`)
    const subInDraft = sub;

    if (subInDraft) {
      subInDraft.position.x = finalX;
      subInDraft.position.y = finalY;
      subInDraft.rotationDeg = finalRot;

      setSubDragTick((n) => n + 1);
    }

    // Publish draft sub positions for the advisory room-response preview.
    // The preview reads these transient positions without committing design state.
    publishSubDragLive([
      ...(draftFrontSubsRef.current || []),
      ...(draftRearSubsRef.current || []),
    ]);

    // No config commit during mousemove — draft refs are the live render source.
    // commitDraftSubPositions() is called once on mouseup via useMouseUpHandler.
  }, [byId, widthM, lengthM, getModelDimsM, scale,
      draggedSubTypeRef, draftFrontSubsRef, draftRearSubsRef,
      setSubDragTick, setSubSnapState, rspPointRef]);

  return { handleSubDrag };
}