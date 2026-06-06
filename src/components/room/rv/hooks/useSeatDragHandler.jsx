import { useCallback, useEffect, useRef, useState } from "react";

const SEAT_MARGIN_M = 0.3;
const SNAP_THRESHOLD_M = 0.03; // ±3 cm snap-to-zero zone

/**
 * useSeatDragHandler
 * Drags ALL seats as one rigid block, forward/backward only (Y-axis).
 *
 * Preferred behaviour (when setSeatingBlockOffset is provided):
 *   - Accumulates the drag deltaY into seatingBlockOffset (rounded to 0.01 m).
 *   - The seating rebuild hook will reposition seats from the updated offset.
 *   - Seats are NOT written directly, preventing drift.
 *   - Snaps to exactly 0.00 when within ±SNAP_THRESHOLD_M of zero.
 *
 * Fallback behaviour (when setSeatingBlockOffset is not available):
 *   - Directly applies deltaY to every seat Y (legacy behaviour preserved).
 */
export function useSeatDragHandler({
  onSetSeatingPositions,
  canvasToRoom,
  lengthM,
  currentSeatingBlockOffset,
  setSeatingBlockOffset,
}) {
  const [isSnapping, setIsSnapping] = useState(false);
  const snapTimerRef = useRef(null);

  // Auto-clear the "RSP aligned" label after 5 seconds
  const triggerSnap = useCallback(() => {
    setIsSnapping(true);
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    snapTimerRef.current = setTimeout(() => setIsSnapping(false), 5000);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { if (snapTimerRef.current) clearTimeout(snapTimerRef.current); }, []);

  const handleSeatDrag = useCallback((seatId, newCanvasPos) => {
    if (!onSetSeatingPositions && !setSeatingBlockOffset) return;

    const { y: targetY } = canvasToRoom(newCanvasPos);
    const roomLen = Number(lengthM) || 6.0;

    // We need the current seat array to compute deltaY and clamping.
    // Use a functional update on seatingPositions to read current state.
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

      // ── Preferred path: update seatingBlockOffset, let rebuild move the seats ──
      if (typeof setSeatingBlockOffset === 'function') {
        const base = Number(currentSeatingBlockOffset) || 0;
        const raw = base + deltaY;

        // Magnetic snap-to-zero within ±SNAP_THRESHOLD_M
        const snapping = Math.abs(raw) <= SNAP_THRESHOLD_M;
        if (snapping) triggerSnap();
        const nextOffset = snapping ? 0 : Math.round(raw * 100) / 100;

        setSeatingBlockOffset(nextOffset);
        // Return prev unchanged — the rebuild hook will recompute seat positions
        return prev;
      }

      // ── Fallback: directly move every seat Y (legacy) ──
      return prev.map(seat => ({
        ...seat,
        y: Number(seat.y ?? seat.position?.y ?? 0) + deltaY,
      }));
    });
  }, [onSetSeatingPositions, canvasToRoom, lengthM, currentSeatingBlockOffset, setSeatingBlockOffset]);

  const clearSnap = useCallback(() => {
    if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null; }
    setIsSnapping(false);
  }, []);

  return { handleSeatDrag, isSnapping, clearSnap };
}