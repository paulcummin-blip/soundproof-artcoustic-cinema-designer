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

    // Stage 2B.6 — magnetic coordinate snap (wall / quarter / midpoint / corner).
    // Runs BEFORE symmetry snap so the designer's explicit target wins.
    // Uses the same canonical coordinate authority as the Placement Guide
    // candidate generation (getSubPlacementGuideCoordinates), ensuring
    // manual magnetic snaps equal Apply-Layout coordinates.
    const toleranceM = Number.isFinite(scale) && scale > 0
      ? Math.max(SNAP_TOLERANCE_MIN_M, Math.min(SNAP_TOLERANCE_MAX_M, SNAP_TOLERANCE_PX / scale))
      : SNAP_TOLERANCE_MIN_M;

    const guideCoordinates = getSubPlacementGuideCoordinates({
      widthM,
      lengthM,
      cabinetHalfExtents: _ext,
      wallClearance: EPS,
    });

    let coordSnap = null;
    try {
      if (guideCoordinates) {
        coordSnap = findCoordinateSnap({
          candidateX: finalX,
          candidateY: finalY,
          guideCoordinates,
          toleranceM,
        });
      }
    } catch (_) { /* snap is best-effort, never blocks drag */ }

    if (coordSnap) {
      finalX = coordSnap.x;
      finalY = coordSnap.y;
    }

    // Stage 2B.4 — drag-time symmetry snap assistance.
    // Stage 2B.7 — drag-time opposing-wall alignment snap.
    //
    // Both are drag-time magnetic snaps that fire only when no coordinate snap
    // is active (coordinate snap wins). The two are mutually exclusive in
    // practice — a sub near a wall either opposes a sub on the far wall or
    // mirrors a partner on the same wall — but both candidates are evaluated
    // and the one with the smaller capture distance wins to avoid flickering.
    //
    // Neither snap moves the partner, locks the pair, or links movement.
    // Cabinet 10 mm wall clearance is re-validated after snap: if the snapped
    // coordinate would push the dragged sub's cabinet through a wall, the snap
    // is rejected and the sub stays at its clamped position.
    let snapResult = coordSnap;
    if (!coordSnap) {
      const rspPoint = rspPointRef?.current ?? null;

      // Build combined partner list from both draft arrays for opposing search.
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
          candidateX: finalX,
          candidateY: finalY,
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
          candidateX: finalX,
          candidateY: finalY,
          draggedDims: { widthM: w, depthM: d },
          getModelDimsM,
          rspPoint,
        });
      } catch (_) { /* snap is best-effort */ }

      // Pick the closest snap to avoid flickering between competing targets.
      // Opposing alignment and symmetry never share an axis for the same wall,
      // so this is a safe tiebreak.
      const opposingDist = opposingResult
        ? (opposingResult.axis === "x"
            ? Math.abs(finalX - opposingResult.snappedX)
            : Math.abs(finalY - opposingResult.snappedY))
        : Infinity;
      const symDist = symResult
        ? (symResult.axis === "x"
            ? Math.abs(finalX - symResult.snappedX)
            : Math.abs(finalY - symResult.snappedY))
        : Infinity;

      let chosen = null;
      if (opposingResult && symResult) {
        chosen = opposingDist <= symDist ? opposingResult : symResult;
      } else {
        chosen = opposingResult || symResult;
      }

      if (chosen) {
        const snapX = chosen.snappedX;
        const snapY = chosen.snappedY;

        // Re-validate cabinet bounds: the snapped coordinate must not push the
        // dragged sub's cabinet through a wall. Reject the snap entirely if it
        // would; the sub stays at its pre-snap clamped position.
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
          // Re-derive rotation from the snapped position for consistency.
          finalRot = snapOrient.rotationDeg;
          snapResult = chosen;
        }
        // else: snap rejected — cabinet would breach wall clearance.
      }
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