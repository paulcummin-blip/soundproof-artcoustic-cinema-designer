import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * useSeatGesture — the seat plan interaction model.
 *
 *   single click   → the active mode's information for that seat: its HUD in
 *                    HUD mode, its dimensions in Dimensions mode
 *   drag           → movement past the drag threshold moves the seating block,
 *                    and a release after a drag never activates the seat
 *
 * The seat is the interactive object and its click has exactly one action:
 * there is no separate select step, no double-click requirement and no hold
 * timer. Nothing is delayed waiting for a second click.
 */

export const SEAT_DRAG_THRESHOLD_PX = 4;

export function useSeatGesture({ handleMouseDown, handleSeatClick, mode = "hud" }) {
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  const [dimensionSeatId, setDimensionSeatId] = useState(null);
  const pendingRef = useRef(null);
  const listenersRef = useRef(null);
  // The last seat activated by a click, so a mode switch can show the same seat.
  const activeSeatRef = useRef(null);
  const previousModeRef = useRef(mode);

  const detachPointerListeners = useCallback(() => {
    const listeners = listenersRef.current;
    if (!listeners) return;
    window.removeEventListener("pointermove", listeners.onMove);
    window.removeEventListener("pointerup", listeners.onUp);
    window.removeEventListener("pointercancel", listeners.onCancel);
    listenersRef.current = null;
  }, []);

  const endGesture = useCallback(() => {
    detachPointerListeners();
    pendingRef.current = null;
  }, [detachPointerListeners]);

  // Movement past the drag threshold hands the gesture over to the existing
  // seating-block drag: the whole block moves, and the click never fires.
  const startSeatDrag = useCallback((pending, clientX, clientY) => {
    pending.dragStarted = true;
    setDimensionSeatId((current) => (String(current) === String(pending.seatId) ? null : current));
    if (typeof handleMouseDown !== "function") return;
    handleMouseDown({
      preventDefault() {},
      stopPropagation() {},
      clientX,
      clientY,
      pointerId: pending.pointerId,
      target: null,
    }, pending.seatId, "seat");
  }, [handleMouseDown]);

  const handleSeatPointerDown = useCallback((e, seat) => {
    if (!seat?.id) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();
    endGesture();

    const pending = {
      seat,
      seatId: seat.id,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      dragStarted: false,
    };
    pendingRef.current = pending;

    const onMove = (moveEvent) => {
      if (pendingRef.current !== pending || pending.dragStarted) return;
      const dx = moveEvent.clientX - pending.startX;
      const dy = moveEvent.clientY - pending.startY;
      if (dx * dx + dy * dy <= SEAT_DRAG_THRESHOLD_PX * SEAT_DRAG_THRESHOLD_PX) return;
      startSeatDrag(pending, moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = () => {
      const active = pendingRef.current;
      endGesture();
      if (!active) return;
      // A drag commits on the drag path and never also activates the seat. Every
      // other release is that seat's click, in whichever mode is active.
      if (active.dragStarted) return;

      setSelectedSeatId(active.seatId);
      activeSeatRef.current = active.seat;

      if (mode === "dimensions") {
        // Dimensions mode shows one seat's measurements at a time, so this
        // replaces whatever was shown before.
        setDimensionSeatId(active.seatId);
        return;
      }

      setDimensionSeatId(null);
      if (typeof handleSeatClick === "function") handleSeatClick(active.seat);
    };

    const onCancel = () => { endGesture(); };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    listenersRef.current = { onMove, onUp, onCancel };
  }, [endGesture, startSeatDrag, handleSeatClick, mode]);

  const clearSeatSelection = useCallback(() => {
    setSelectedSeatId(null);
    setDimensionSeatId(null);
    activeSeatRef.current = null;
  }, []);

  // Switching modes keeps the active seat and immediately shows the matching
  // information for it: the HUD in HUD mode, that seat's dimensions in
  // Dimensions mode. No second click is required.
  useEffect(() => {
    if (previousModeRef.current === mode) return;
    previousModeRef.current = mode;
    if (mode === "dimensions") {
      setDimensionSeatId(selectedSeatId);
      return;
    }
    setDimensionSeatId(null);
    const seat = activeSeatRef.current;
    if (seat && typeof handleSeatClick === "function") handleSeatClick(seat);
  }, [mode, selectedSeatId, handleSeatClick]);

  useEffect(() => () => {
    detachPointerListeners();
  }, [detachPointerListeners]);

  const seatGesture = useMemo(() => ({
    onSeatPointerDown: handleSeatPointerDown,
  }), [handleSeatPointerDown]);

  return {
    selectedSeatId,
    dimensionSeatId,
    clearSeatSelection,
    seatGesture,
  };
}

export default useSeatGesture;