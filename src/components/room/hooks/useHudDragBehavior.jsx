import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Manages all HUD drag, position, and visibility behaviour.
 * Extracted from RoomVisualisation to reduce file size.
 */
export function useHudDragBehavior({ planBoundsRef }) {
  const [hudPinnedSeatId, setHudPinnedSeatId] = useState(null);
  const [hudHiddenWhenPinned, setHudHiddenWhenPinned] = useState(false);
  const [hudPinnedOffsetPx, setHudPinnedOffsetPx] = useState(null);
  const [hudBasePosPx, setHudBasePosPx] = useState(null);
  const hudElRef = useRef(null);

  const isHudPinned = Boolean(hudPinnedSeatId);
  const hudPosition = hudBasePosPx;

  // 'h' key toggles HUD visibility when pinned
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!isHudPinned) return;
      if (e.key === 'h' || e.key === 'H') {
        setHudHiddenWhenPinned(v => !v);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isHudPinned]);

  // Reset offset when unpinned
  useEffect(() => {
    if (!isHudPinned) {
      setHudPinnedOffsetPx(null);
      setHudHiddenWhenPinned(false);
    }
  }, [isHudPinned]);

  // Default offset when newly pinned
  useEffect(() => {
    if (isHudPinned && hudPinnedOffsetPx == null) {
      setHudPinnedOffsetPx({ x: 24, y: 24 });
    }
  }, [isHudPinned, hudPinnedOffsetPx]);

  const clampHudOffset = useCallback((x, y) => {
    const hud = hudElRef.current;
    const host = planBoundsRef.current;
    if (!hud || !host) return { x, y };

    const hudRect = hud.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const hudW = hudRect.width;
    const hudH = hudRect.height;

    return {
      x: Math.max(0, Math.min(Math.max(0, hostRect.width - hudW), x)),
      y: Math.max(0, Math.min(Math.max(0, hostRect.height - hudH), y)),
    };
  }, [planBoundsRef]);

  const onHudHeaderMouseDown = useCallback((event) => {
    if (!planBoundsRef.current) return;
    if (!hudBasePosPx && !hudPosition) return;
    event.preventDefault();

    const startBase = hudBasePosPx || hudPosition || { x: 20, y: 20 };
    const startMouseX = event.clientX;
    const startMouseY = event.clientY;

    const handleMove = (moveEvent) => {
      const dx = moveEvent.clientX - startMouseX;
      const dy = moveEvent.clientY - startMouseY;
      const clamped = clampHudOffset(startBase.x + dx, startBase.y + dy);
      setHudBasePosPx(clamped);
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [clampHudOffset, hudBasePosPx, hudPosition, planBoundsRef]);

  const placeHudForSeat = useCallback(({ seatX_px, seatY_px, hudW_px, hudH_px, canvasRect, padding = 8 }) => {
    if (!canvasRect) return { x: seatX_px + 14, y: seatY_px };
    const seatOnLeft = seatX_px < (canvasRect.x + canvasRect.width / 2);
    const targetX = seatOnLeft ? (seatX_px + 14) : (seatX_px - hudW_px - 14);
    const targetY = seatY_px - Math.min(24, hudH_px / 2);
    return {
      x: Math.max(canvasRect.x + padding, Math.min(canvasRect.x + canvasRect.width - padding - hudW_px, targetX)),
      y: Math.max(canvasRect.y + padding, Math.min(canvasRect.y + canvasRect.height - padding - hudH_px, targetY)),
    };
  }, []);

  return {
    hudPinnedSeatId, setHudPinnedSeatId,
    hudHiddenWhenPinned, setHudHiddenWhenPinned,
    hudPinnedOffsetPx, setHudPinnedOffsetPx,
    hudBasePosPx, setHudBasePosPx,
    hudElRef,
    isHudPinned,
    hudPosition,
    clampHudOffset,
    onHudHeaderMouseDown,
    placeHudForSeat,
  };
}