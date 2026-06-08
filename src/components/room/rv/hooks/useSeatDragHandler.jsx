import { useCallback, useEffect, useRef, useState } from "react";

const SEAT_MARGIN_M = 0.3;

/**
 * useSeatDragHandler
 * Drags ALL seats as one rigid block, forward/backward only (Y-axis).
 *
 * Directly updates seatingPositions by applying deltaY to every seat.
 * Does NOT touch seatingBlockOffset, RSP state, manualRspY_m, mlpY_m,
 * mlpOverride, or trigger any row rebuild during drag.
 * The RSP marker remains fixed while seats move.
 */
export function useSeatDragHandler({
  onSetSeatingPositions,
  canvasToRoom,
  lengthM,
}) {
  const [isSnapping, setIsSnapping] = useState(false);
  const snapTimerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => () => { if (snapTimerRef.current) clearTimeout(snapTimerRef.current); }, []);

  const handleSeatDrag = useCallback((seatId, newCanvasPos) => {
    if (!onSetSeatingPositions) return;

    const { y: targetY } = canvasToRoom(newCanvasPos);
    const roomLen = Number(lengthM) || 6.0;

    onSetSeatingPositions(prev => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;

      const clickedSeat = prev.find(s => s.id === seatId);
      if (!clickedSeat) return prev;

      const currentY = Number(clickedSeat.y ?? clickedSeat.position?.y ?? 0);
      let deltaY = targetY - currentY;

      if (Math.abs(deltaY) < 0.0001) return prev;

      // Clamp so the whole block stays within room bounds
      const minSeatY = Math.min(...prev.map(s => Number(s.y ?? s.position?.y ?? 0)));
      const maxSeatY = Math.max(...prev.map(s => Number(s.y ?? s.position?.y ?? 0)));

      if (deltaY < 0) {
        deltaY = Math.max(deltaY, SEAT_MARGIN_M - minSeatY);
      } else {
        deltaY = Math.min(deltaY, (roomLen - SEAT_MARGIN_M) - maxSeatY);
      }

      if (Math.abs(deltaY) < 0.0001) return prev;

      // Directly move every seat Y — preserve all other fields exactly
      return prev.map(seat => ({
        ...seat,
        y: Number(seat.y ?? seat.position?.y ?? 0) + deltaY,
      }));
    });
  }, [onSetSeatingPositions, canvasToRoom, lengthM]);

  const clearSnap = useCallback(() => {
    if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null; }
    setIsSnapping(false);
  }, []);

  return { handleSeatDrag, isSnapping, clearSnap };
}