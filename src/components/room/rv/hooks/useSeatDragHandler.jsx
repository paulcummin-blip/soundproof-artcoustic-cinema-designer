import { useCallback, useEffect, useRef, useState } from "react";

const SEAT_MARGIN_M = 0.3;

/**
 * useSeatDragHandler
 * Drags ALL seats as one rigid block, forward/backward only (Y-axis).
 *
 * Uses a stable drag baseline (seatDragStartRef) set by useMouseDownHandler on drag start.
 * deltaY = currentCursorRoomY - startCursorY, applied to frozen baseline y values.
 * This eliminates feedback/jump caused by applying deltaY against the live (already-updated) seat y.
 *
 * Does NOT touch seatingBlockOffset, RSP state, manualRspY_m, mlpY_m,
 * mlpOverride, or trigger any row rebuild during drag.
 * The RSP marker remains fixed while seats move.
 */
export function useSeatDragHandler({
  onSetSeatingPositions,
  canvasToRoom,
  lengthM,
  seatDragStartRef,
  setSeatingBlockOffset,
  setRowCentersM,
}) {
  const [isSnapping, setIsSnapping] = useState(false);
  const snapTimerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => () => { if (snapTimerRef.current) clearTimeout(snapTimerRef.current); }, []);

  const handleSeatDrag = useCallback((seatId, newCanvasPos) => {
    if (!onSetSeatingPositions) return;

    const { y: currentCursorY } = canvasToRoom(newCanvasPos);
    const roomLen = Number(lengthM) || 6.0;

    // Use stable baseline if available — this is the correct path during drag
    const baseline = seatDragStartRef?.current;
    if (baseline && baseline.baselineYById) {
      const rawDeltaY = currentCursorY - baseline.startCursorY;

      if (Math.abs(rawDeltaY) < 0.0001) return;

      // Clamp so the whole original seat group stays within room bounds
      const baselineYValues = Object.values(baseline.baselineYById);
      const minBaseY = Math.min(...baselineYValues);
      const maxBaseY = Math.max(...baselineYValues);

      let clampedDelta = rawDeltaY;
      if (clampedDelta < 0) {
        clampedDelta = Math.max(clampedDelta, SEAT_MARGIN_M - minBaseY);
      } else {
        clampedDelta = Math.min(clampedDelta, (roomLen - SEAT_MARGIN_M) - maxBaseY);
      }

      onSetSeatingPositions(prev => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;

        const updated = prev.map(seat => {
          const baseY = baseline.baselineYById[seat.id];
          if (!Number.isFinite(baseY)) return seat;
          return { ...seat, y: baseY + clampedDelta };
        });

        // Sync seatingBlockOffset to the new Row 1 Y so the Front Row Distance display stays live.
        // Row 1 seats are identified by rowNumber === 1; fall back to lowest-y seat if none tagged.
        if (setSeatingBlockOffset || setRowCentersM) {
          const row1Seats = updated.filter(s => s.rowNumber === 1);
          const refSeats = row1Seats.length > 0 ? row1Seats : [updated[0]];
          const newRow1Y = Math.round(
            (refSeats.reduce((sum, s) => sum + (Number(s.y) || 0), 0) / refSeats.length) * 100
          ) / 100;

          if (setSeatingBlockOffset && Number.isFinite(newRow1Y)) {
            setSeatingBlockOffset(newRow1Y);
          }

          // Rebuild rowCentersM from the updated seats so the row summary readouts stay in sync.
          if (setRowCentersM) {
            const rowMap = new Map();
            updated.forEach(s => {
              const rn = s.rowNumber;
              if (!Number.isInteger(rn)) return;
              if (!rowMap.has(rn)) rowMap.set(rn, []);
              rowMap.get(rn).push(Number(s.y) || 0);
            });
            if (rowMap.size > 0) {
              const sortedRows = Array.from(rowMap.keys()).sort((a, b) => a - b);
              const centers = sortedRows.map(rn => {
                const ys = rowMap.get(rn);
                const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
                return Math.round(avg * 100) / 100;
              });
              setRowCentersM(centers);
            }
          }
        }

        return updated;
      });

      return;
    }

    // Fallback (should not be reached during normal drag): direct delta from current position
    onSetSeatingPositions(prev => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;

      const clickedSeat = prev.find(s => s.id === seatId);
      if (!clickedSeat) return prev;

      const currentY = Number(clickedSeat.y ?? clickedSeat.position?.y ?? 0);
      let deltaY = currentCursorY - currentY;

      if (Math.abs(deltaY) < 0.0001) return prev;

      const minSeatY = Math.min(...prev.map(s => Number(s.y ?? s.position?.y ?? 0)));
      const maxSeatY = Math.max(...prev.map(s => Number(s.y ?? s.position?.y ?? 0)));

      if (deltaY < 0) {
        deltaY = Math.max(deltaY, SEAT_MARGIN_M - minSeatY);
      } else {
        deltaY = Math.min(deltaY, (roomLen - SEAT_MARGIN_M) - maxSeatY);
      }

      if (Math.abs(deltaY) < 0.0001) return prev;

      return prev.map(seat => ({
        ...seat,
        y: Number(seat.y ?? seat.position?.y ?? 0) + deltaY,
      }));
    });
  }, [onSetSeatingPositions, canvasToRoom, lengthM, seatDragStartRef]);

  const clearSnap = useCallback(() => {
    if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null; }
    setIsSnapping(false);
  }, []);

  const clearSeatDragBaseline = useCallback(() => {
    if (seatDragStartRef) seatDragStartRef.current = null;
  }, [seatDragStartRef]);

  return { handleSeatDrag, isSnapping, clearSnap, clearSeatDragBaseline };
}