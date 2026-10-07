import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * useSeatGesture — the seat plan interaction model.
 *
 *   single click   → open (or move) that seat's HUD immediately
 *   press & hold   → the seat's wall-measurement guides are held on screen;
 *                    releasing still opens that seat's HUD
 *   drag           → movement past the drag threshold drags the seat, and a
 *                    release after a drag never also opens the HUD
 *
 * The seat is the interactive object and its HUD is the single click action:
 * there is no separate select step, no double-click requirement, and no hold
 * needed to read a seat. Nothing is delayed waiting for a second click.
 */

export const SEAT_LONG_PRESS_MS = 1500;
export const SEAT_DRAG_THRESHOLD_PX = 4;

export function useSeatGesture({ handleMouseDown, handleSeatClick }) {
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  const [dimensionSeatId, setDimensionSeatId] = useState(null);
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  const listenersRef = useRef(null);

  const clearLongPressTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const detachPointerListeners = useCallback(() => {
    const listeners = listenersRef.current;
    if (!listeners) return;
    window.removeEventListener("pointermove", listeners.onMove);
    window.removeEventListener("pointerup", listeners.onUp);
    window.removeEventListener("pointercancel", listeners.onCancel);
    listenersRef.current = null;
  }, []);

  const endGesture = useCallback(() => {
    clearLongPressTimer();
    detachPointerListeners();
    pendingRef.current = null;
  }, [clearLongPressTimer, detachPointerListeners]);

  // Movement past the drag threshold hands the gesture over to the existing
  // seat drag. The drag guide carries the same measurements, so the held
  // dimensional guide is dropped to avoid drawing the values twice.
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

    // A deliberate hold shows this seat's measurement guides. It never withholds
    // the HUD: the release below opens it either way.
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current !== pending || pending.dragStarted) return;
      setSelectedSeatId(seat.id);
      setDimensionSeatId(seat.id);
    }, SEAT_LONG_PRESS_MS);

    const onMove = (moveEvent) => {
      if (pendingRef.current !== pending || pending.dragStarted) return;
      const dx = moveEvent.clientX - pending.startX;
      const dy = moveEvent.clientY - pending.startY;
      if (dx * dx + dy * dy <= SEAT_DRAG_THRESHOLD_PX * SEAT_DRAG_THRESHOLD_PX) return;
      clearLongPressTimer();
      startSeatDrag(pending, moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = () => {
      const active = pendingRef.current;
      endGesture();
      if (!active) return;
      // A drag commits on the drag path and never also opens the HUD. Every
      // other release — quick click or the end of a hold — is the seat's click.
      if (active.dragStarted) return;

      setSelectedSeatId(active.seatId);
      setDimensionSeatId((current) => (
        current && String(current) !== String(active.seatId) ? null : current
      ));

      if (typeof handleSeatClick === "function") handleSeatClick(active.seat);
    };

    const onCancel = () => { endGesture(); };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    listenersRef.current = { onMove, onUp, onCancel };
  }, [endGesture, clearLongPressTimer, startSeatDrag, handleSeatClick]);

  const clearSeatDimensionMode = useCallback(() => setDimensionSeatId(null), []);

  useEffect(() => () => {
    clearLongPressTimer();
    detachPointerListeners();
  }, [clearLongPressTimer, detachPointerListeners]);

  const seatGesture = useMemo(() => ({
    onSeatPointerDown: handleSeatPointerDown,
  }), [handleSeatPointerDown]);

  return {
    selectedSeatId,
    dimensionSeatId,
    clearSeatDimensionMode,
    seatGesture,
  };
}

export default useSeatGesture;