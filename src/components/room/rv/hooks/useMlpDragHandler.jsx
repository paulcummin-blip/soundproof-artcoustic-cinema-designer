/**
 * useMlpDragHandler.js
 *
 * Handles direct dragging of the RSP marker (green dot) in BOTH auto and manual modes.
 *
 * Ownership model (draft/commit separation):
 *   Drag move  → mlpDragInfo (visual draft only, no acoustic recalc)
 *   Mouse up   → setManualRspX_m() + setManualRspY_m() + setRspMode("manual_position") once
 *
 * The marker is always draggable. On first committed drag from AUTO, the mode
 * switches to manual_position and both X and Y are persisted.
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
  setMlpDragInfo,
}) {
  /**
    * Called on every mousemove when dragType === 'mlpMarker'.
    * Converts the canvas position to room X/Y, clamps to room bounds,
    * and writes the draft {x, y} to mlpDragInfo at 1 cm resolution.
    * Does NOT call setManualRspX_m/setManualRspY_m — deferred to mouse-up.
    *
    * @param {string} _draggedItemId  - ignored (always 'mlp-marker-dot')
    * @param {{ x: number, y: number }} roomPos - clamped room coordinates
    */
  const handleMlpDrag = useCallback((_draggedItemId, roomPos) => {
    const roomLen = Number(lengthM) || 6.0;
    const roomWid = Number(widthM) || 4.5;

    // roomPos is already in room coordinates — no conversion needed
    const rawX = Number(roomPos?.x);
    const rawY = Number(roomPos?.y);

    // Clamp to room bounds with a small margin
    const MARGIN = 0.20;
    const clampedX = Math.max(MARGIN, Math.min(roomWid - MARGIN, rawX));
    const clampedY = Math.max(MARGIN, Math.min(roomLen - MARGIN, rawY));

    // 1 cm resolution
    const roundedX = Math.round(clampedX * 100) / 100;
    const roundedY = Math.round(clampedY * 100) / 100;

    // Draft mode: update visual draft only — do NOT write canonical RSP state.
    // The final position is committed once on mouse-up by useMouseUpHandler.
    recordTemporaryP18P19DragMove({
      dragMoveCount: ++temporaryRSPDragMoveCount,
      liveRspCoordinate: { x: roundedX, y: roundedY, z: 1.2 },
      exactStateSetter: "mlpDragInfo (draft)",
    });

    // Stage 1: live proximity dimension guides + draft {x, y} for marker position.
    if (typeof setMlpDragInfo === "function") {
      const guides = computeMlpProximityGuides({
        x: roundedX,
        y: roundedY,
        widthM: roomWid,
        lengthM: roomLen,
      });
      if (guides) setMlpDragInfo({ visible: true, x: roundedX, y: roundedY, ...guides });
    }
  }, [lengthM, widthM, setMlpDragInfo]);

  return { handleMlpDrag };
}