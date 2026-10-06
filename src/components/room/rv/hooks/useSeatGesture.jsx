import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * useSeatGesture — the seat plan interaction model.
 *
 *   single click   → select the seat only (no guides, no HUD)
 *   double click   → open / move the pinned Seat HUD
 *   press & hold   → enter dimensional mode: the existing wall-measurement
 *                    guides are held on screen, seat stays selected
 *   drag           → unchanged and immediate: movement past the drag threshold
 *                    starts the existing seat drag and cancels the hold
 *
 * Priority (highest first): drag → double-click HUD → long-press dimensions →
 * single-click selection. Selection is applied on the first release, never
 * delayed, so a single click never feels sluggish.
 */

export const SEAT_LONG_PRESS_MS = 1500;
export const SEAT_DRAG_THRESHOLD_PX = 4;
const DOUBLE_CLICK_MS = 350;

export function useSeatGesture({ handleMouseDown, handleSeatClick }) {
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  const [dimensionSeatId, setDimensionSeatId] = useState(null);
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  const listenersRef = useRef(null);
  const lastClickRef = useRef({ seatId: null, time: 0 });

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
      activated: false,
    };
    pendingRef.current = pending;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current !== pending || pending.dragStarted) return;
      pending.activated = true;
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
      // A drag commits on the drag path; a completed hold has already selected.
      if (active.dragStarted || active.activated) return;

      const now = Date.now();
      const last = lastClickRef.current;

      setSelectedSeatId(active.seatId);
      setDimensionSeatId((current) => (
        current && String(current) !== String(active.seatId) ? null : current
      ));

      if (last.seatId === active.seatId && now - last.time <= DOUBLE_CLICK_MS) {
        lastClickRef.current = { seatId: null, time: 0 };
        if (typeof handleSeatClick === "function") handleSeatClick(active.seat);
      } else {
        lastClickRef.current = { seatId: active.seatId, time: now };
      }
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