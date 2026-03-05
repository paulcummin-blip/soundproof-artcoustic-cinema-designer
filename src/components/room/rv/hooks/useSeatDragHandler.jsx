import { useCallback } from "react";

/**
 * useSeatDragHandler
 * Handles dragging a seat to a new canvas position,
 * converting canvas coords to room-metres and updating state.
 */
export function useSeatDragHandler({ onSetSeatingPositions, canvasToRoom }) {
  const handleSeatDrag = useCallback((seatId, newCanvasPos) => {
    if (!onSetSeatingPositions) return;
    const { x: roomX, y: roomY } = canvasToRoom(newCanvasPos);
    onSetSeatingPositions(prev =>
      prev.map(seat =>
        seat.id === seatId ? { ...seat, x: roomX, y: roomY } : seat
      )
    );
  }, [onSetSeatingPositions, canvasToRoom]);

  return { handleSeatDrag };
}