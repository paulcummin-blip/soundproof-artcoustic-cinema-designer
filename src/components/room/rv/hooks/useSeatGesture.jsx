import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isDragPointer, isPrimaryDragStart, primaryButtonHeld } from "@/components/room/rv/utils/rvDragGesture";

// Distance, never elapsed time, distinguishes a seat click from a block drag.
export const SEAT_DRAG_THRESHOLD_PX = 4;

export function useSeatGesture({ handleMouseDown, handleMouseMove, handleMouseUp, handleSeatClick, mode = "hud" }) {
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  const [dimensionSeatId, setDimensionSeatId] = useState(null);
  const pendingRef = useRef(null);
  const listenersRef = useRef(null);
  const activeSeatRef = useRef(null);
  const previousModeRef = useRef(mode);
  const handlersRef = useRef(null);
  handlersRef.current = { handleMouseDown, handleMouseMove, handleMouseUp };

  const detachPointerListeners = useCallback(() => {
    const listeners = listenersRef.current;
    if (!listeners) return;
    window.removeEventListener("pointermove", listeners.onMove);
    window.removeEventListener("pointerup", listeners.onUp);
    window.removeEventListener("pointercancel", listeners.onCancel);
    window.removeEventListener("lostpointercapture", listeners.onCancel);
    window.removeEventListener("blur", listeners.onCancel);
    listenersRef.current = null;
  }, []);

  const endGesture = useCallback(() => {
    detachPointerListeners();
    pendingRef.current = null;
  }, [detachPointerListeners]);

  const handleSeatPointerDown = useCallback((e, seat) => {
    if (!seat?.id || !isPrimaryDragStart(e) || pendingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const pending = {
      seat, seatId: seat.id, startX: e.clientX, startY: e.clientY,
      pointerId: e.pointerId, pointerType: e.pointerType,
      target: e.currentTarget, dragStarted: false,
    };
    pendingRef.current = pending;

    const onCancel = (event) => {
      if (pendingRef.current !== pending || !isDragPointer(pending, event)) return;
      endGesture();
      if (pending.dragStarted) handlersRef.current.handleMouseUp?.(event);
    };

    const onMove = (moveEvent) => {
      if (pendingRef.current !== pending || !isDragPointer(pending, moveEvent)) return;
      if (!primaryButtonHeld(moveEvent)) { onCancel(moveEvent); return; }
      if (pending.dragStarted) return; // Shared pointer handler owns subsequent frames.
      const dx = moveEvent.clientX - pending.startX;
      const dy = moveEvent.clientY - pending.startY;
      if (dx * dx + dy * dy <= SEAT_DRAG_THRESHOLD_PX * SEAT_DRAG_THRESHOLD_PX) return;
      pending.dragStarted = true;
      setDimensionSeatId(null);
      // Freeze the baseline at the original press, not the threshold-crossing
      // frame, and preserve pointer identity. Capture belongs to the shared SVG.
      handlersRef.current.handleMouseDown?.({
        preventDefault() {}, stopPropagation() {},
        clientX: pending.startX, clientY: pending.startY,
        pointerId: pending.pointerId, pointerType: pending.pointerType,
        button: 0, buttons: moveEvent.buttons, isPrimary: true,
        target: pending.target, currentTarget: pending.target,
      }, pending.seatId, "seat");
      // The global capture listener ran before this threshold listener.
      handlersRef.current.handleMouseMove?.(moveEvent);
    };

    const onUp = (event) => {
      if (pendingRef.current !== pending || !isDragPointer(pending, event)) return;
      const active = pendingRef.current;
      endGesture();
      if (active.dragStarted) {
        handlersRef.current.handleMouseUp?.(event);
        return; // Never also activate inspection.
      }
      setSelectedSeatId(active.seatId);
      activeSeatRef.current = active.seat;
      if (mode === "dimensions") {
        setDimensionSeatId(active.seatId);
        return;
      }
      setDimensionSeatId(null);
      handleSeatClick?.(active.seat);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("lostpointercapture", onCancel);
    window.addEventListener("blur", onCancel);
    listenersRef.current = { onMove, onUp, onCancel };
  }, [endGesture, handleSeatClick, mode]);

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
    const pending = pendingRef.current;
    endGesture();
    if (pending?.dragStarted) handlersRef.current.handleMouseUp?.({});
  }, [endGesture]);

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