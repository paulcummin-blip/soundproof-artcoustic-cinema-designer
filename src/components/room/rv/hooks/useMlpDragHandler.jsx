/**
 * useMlpDragHandler.js
 *
 * Handles direct dragging of the RSP marker (green dot) in manual_position mode.
 *
 * Ownership model (draft/commit separation):
 *   Drag move  → mlpDragInfo (visual draft only, no acoustic recalc)
 *   Mouse up   → setManualRspY_m() once → useEffectiveRsp → mlpY_m → RP22
 *
 * Does NOT touch:
 *   - seatingBlockOffset
 *   - seatingPositions
 *   - rowCentersM
 *   - speaker drag state
 *   - sub drag state
 */
import { useCallback } from "react";
import { computeMlpProximityGuides } from "@/components/room/rv/utils/geometry/computeProximityGuides";
import { recordTemporaryP18P19DragMove } from "@/components/hooks/useRP22AnalysisEngine";

let temporaryRSPDragMoveCount = 0;

export function useMlpDragHandler({
  lengthM,
  widthM,
  mlpDotX_m,
  setMlpDragInfo,
}) {
  /**
   * Called on every mousemove when dragType === 'mlpMarker'.
   * Converts the canvas position to room Y, clamps to room bounds,
   * and writes the draft Y to mlpDragInfo at 1 cm resolution.
   * Does NOT call setManualRspY_m — that is deferred to mouse-up.
   *
   * @param {string} _draggedItemId  - ignored (always 'mlp-marker-dot')
   * @param {{ x: number, y: number }} canvasPos - clamped canvas position
   */
  const handleMlpDrag = useCallback((_draggedItemId, roomPos) => {
    const roomLen = Number(lengthM) || 6.0;

    // roomPos is already in room coordinates — no conversion needed
    const rawY = roomPos.y;

    // Clamp to room bounds with a small margin
    const MARGIN = 0.20;
    const clampedY = Math.max(MARGIN, Math.min(roomLen - MARGIN, rawY));

    // 1 cm resolution
    const rounded = Math.round(clampedY * 100) / 100;

    // Draft mode: update visual draft only — do NOT write canonical RSP state.
    // The final position is committed once on mouse-up by useMouseUpHandler.
    recordTemporaryP18P19DragMove({
      dragMoveCount: ++temporaryRSPDragMoveCount,
      liveRspCoordinate: { x: Number(mlpDotX_m), y: rounded, z: 1.2 },
      exactStateSetter: "mlpDragInfo (draft)",
    });

    // Stage 1: live proximity dimension guides + draft Y for marker position.
    if (typeof setMlpDragInfo === "function") {
      const guides = computeMlpProximityGuides({
        x: Number(mlpDotX_m),
        y: rounded,
        widthM: Number(widthM) || 4.5,
        lengthM: roomLen,
      });
      if (guides) setMlpDragInfo({ visible: true, y: rounded, ...guides });
    }
  }, [lengthM, widthM, mlpDotX_m, setMlpDragInfo]);

  return { handleMlpDrag };
}