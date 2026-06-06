/**
 * useMlpDragHandler.js
 *
 * Handles direct dragging of the RSP marker (green dot) in manual_position mode.
 *
 * Ownership model:
 *   Drag marker → setManualRspY_m()
 *   manualRspY_m → useEffectiveRsp → effectiveRspY_m → mlpY_m → marker position
 *
 * Does NOT touch:
 *   - seatingBlockOffset
 *   - seatingPositions
 *   - rowCentersM
 *   - speaker drag state
 *   - sub drag state
 */
import { useCallback } from "react";

export function useMlpDragHandler({
  canvasToRoom,
  lengthM,
  setManualRspY_m,
  dragOffsetRoomRef,
}) {
  /**
   * Called on every mousemove when dragType === 'mlpMarker'.
   * Converts the canvas position to room Y, clamps to room bounds,
   * and writes to manualRspY_m at 1 cm resolution.
   *
   * @param {string} _draggedItemId  - ignored (always 'mlp-marker-dot')
   * @param {{ x: number, y: number }} canvasPos - clamped canvas position
   */
  const handleMlpDrag = useCallback((_draggedItemId, canvasPos) => {
    if (typeof setManualRspY_m !== "function") return;
    if (!canvasToRoom) return;

    const roomPos = canvasToRoom(canvasPos);
    const roomLen = Number(lengthM) || 6.0;

    // Apply initial cursor-to-marker offset to prevent jump on drag start
    const offsetY = Number(dragOffsetRoomRef?.current?.y) || 0;
    const rawY = roomPos.y + offsetY;

    // Clamp to room bounds with a small margin
    const MARGIN = 0.20;
    const clampedY = Math.max(MARGIN, Math.min(roomLen - MARGIN, rawY));

    // 1 cm resolution
    const rounded = Math.round(clampedY * 100) / 100;

    setManualRspY_m(rounded);
  }, [canvasToRoom, lengthM, setManualRspY_m]);

  return { handleMlpDrag };
}