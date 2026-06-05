import { useCallback } from "react";

const SEAT_MARGIN_M = 0.3;

/**
 * useSeatDragHandler
 * Drags ALL seats as one rigid block, forward/backward only (Y-axis).
 * X values are never changed. Clamped so no seat exits the room.
 */
export function useSeatDragHandler({ onSetSeatingPositions, canvasToRoom, lengthM }) {
  const handleSeatDrag = useCallback((seatId, newCanvasPos) => {
    if (!onSetSeatingPositions) return;

    const { y: targetY } = canvasToRoom(newCanvasPos);
    const roomLen = Number(lengthM) || 6.0;

    onSetSeatingPositions(prev => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;

      // Find the clicked seat to compute the per-frame deltaY
      const clickedSeat = prev.find(s => s.id === seatId);
      if (!clickedSeat) return prev;

      const currentY = Number(clickedSeat.y ?? clickedSeat.position?.y ?? 0);
      let deltaY = targetY - currentY;

      if (Math.abs(deltaY) < 0.0001) return prev;

      // Find the extremes of the current seating block
      const minSeatY = Math.min(...prev.map(s => Number(s.y ?? s.position?.y ?? 0)));
      const maxSeatY = Math.max(...prev.map(s => Number(s.y ?? s.position?.y ?? 0)));

      // Clamp the delta so the whole block stays within room bounds
      if (deltaY < 0) {
        // Moving toward screen wall
        deltaY = Math.max(deltaY, SEAT_MARGIN_M - minSeatY);
      } else {
        // Moving toward back wall
        deltaY = Math.min(deltaY, (roomLen - SEAT_MARGIN_M) - maxSeatY);
      }

      if (Math.abs(deltaY) < 0.0001) return prev;

      // Apply deltaY to every seat's Y; never touch X
      return prev.map(seat => ({
        ...seat,
        y: Number(seat.y ?? seat.position?.y ?? 0) + deltaY,
      }));
    });
  }, [onSetSeatingPositions, canvasToRoom, lengthM]);

  return { handleSeatDrag };
}