import { useCallback, useEffect, useRef, useState } from "react";
import { publishSeatDragLive } from "@/components/state/seatDragLiveStore";

const SEAT_MARGIN_M = 0.3;

/**
 * useSeatDragHandler
 * Drags ALL seats as one rigid block, forward/backward only (Y-axis).
 *
 * Uses a stable drag baseline (seatDragStartRef) set by useMouseDownHandler on drag start.
 * deltaY = currentCursorRoomY - startCursorY, applied to frozen baseline y values.
 *
 * Draft/commit pattern (same as subwoofer drag):
 *   During pointer movement → writes to draftSeatsRef only + setSeatDragTick
 *   On pointer release       → commitDraftSeatPositions writes to state once
 *
 * Does NOT touch seatingBlockOffset, RSP state, manualRspY_m, mlpY_m,
 * mlpOverride, or trigger any row rebuild during drag.
 */
export function useSeatDragHandler({
  canvasToRoom,
  lengthM,
  seatDragStartRef,
  draftSeatsRef,
  setSeatDragTick,
}) {
  const [isSnapping, setIsSnapping] = useState(false);
  const snapTimerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => () => { if (snapTimerRef.current) clearTimeout(snapTimerRef.current); }, []);

  const handleSeatDrag = useCallback((seatId, newCanvasPos) => {
    if (!draftSeatsRef?.current) return;

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

      // Write to draft ref only — no state writes during drag
      draftSeatsRef.current = draftSeatsRef.current.map(seat => {
        const baseY = baseline.baselineYById[seat.id];
        if (!Number.isFinite(baseY)) return seat;
        return { ...seat, y: baseY + clampedDelta };
      });
      publishSeatDragLive(draftSeatsRef.current);
      setSeatDragTick(n => n + 1);
      return;
    }

    // Fallback (should not be reached during normal drag): direct delta from current position
    const clickedSeat = draftSeatsRef.current.find(s => s.id === seatId);
    if (!clickedSeat) return;

    const currentY = Number(clickedSeat.y ?? clickedSeat.position?.y ?? 0);
    let deltaY = currentCursorY - currentY;

    if (Math.abs(deltaY) < 0.0001) return;

    const minSeatY = Math.min(...draftSeatsRef.current.map(s => Number(s.y ?? s.position?.y ?? 0)));
    const maxSeatY = Math.max(...draftSeatsRef.current.map(s => Number(s.y ?? s.position?.y ?? 0)));

    if (deltaY < 0) {
      deltaY = Math.max(deltaY, SEAT_MARGIN_M - minSeatY);
    } else {
      deltaY = Math.min(deltaY, (roomLen - SEAT_MARGIN_M) - maxSeatY);
    }

    if (Math.abs(deltaY) < 0.0001) return;

    draftSeatsRef.current = draftSeatsRef.current.map(seat => ({
      ...seat,
      y: Number(seat.y ?? seat.position?.y ?? 0) + deltaY,
    }));
    publishSeatDragLive(draftSeatsRef.current);
    setSeatDragTick(n => n + 1);
  }, [canvasToRoom, lengthM, seatDragStartRef, draftSeatsRef, setSeatDragTick]);

  const clearSnap = useCallback(() => {
    if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null; }
    setIsSnapping(false);
  }, []);

  const clearSeatDragBaseline = useCallback(() => {
    if (seatDragStartRef) seatDragStartRef.current = null;
  }, [seatDragStartRef]);

  return { handleSeatDrag, isSnapping, clearSnap, clearSeatDragBaseline };
}