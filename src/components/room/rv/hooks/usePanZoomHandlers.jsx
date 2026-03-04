"use client";

import { useCallback } from "react";

/**
 * Pan handlers extracted from RoomVisualisation.
 * IMPORTANT: This hook does not own any state. It only uses what is passed in.
 */
export function usePanZoomHandlers({
  zoom,
  panStartRef,
  isPanningRef,
  setViewOffsetPx,
}) {
  const onPanPointerDown = useCallback((e) => {
    try {
      if (!(zoom > 1)) return;

      // capture pointer so drag continues even if cursor leaves element
      e.currentTarget?.setPointerCapture?.(e.pointerId);

      isPanningRef.current = true;

      const clientX = e.clientX;
      const clientY = e.clientY;

      // Store starting pointer position and current offset snapshot
      const prev = panStartRef.current || {};
      panStartRef.current = {
        ...prev,
        x: clientX,
        y: clientY,
        // "ox/oy" are the starting offset values
        ox: prev.ox ?? 0,
        oy: prev.oy ?? 0,
      };
    } catch {
      // no-op, avoid crashing pointer events
    }
  }, [zoom, panStartRef, isPanningRef]);

  const onPanPointerMove = useCallback((e) => {
    try {
      if (!(zoom > 1)) return;
      if (!isPanningRef.current) return;

      const start = panStartRef.current;
      if (!start) return;

      const dx = e.clientX - (start.x ?? e.clientX);
      const dy = e.clientY - (start.y ?? e.clientY);

      setViewOffsetPx({
        x: (start.ox ?? 0) + dx,
        y: (start.oy ?? 0) + dy,
      });
    } catch {
      // no-op
    }
  }, [zoom, panStartRef, isPanningRef, setViewOffsetPx]);

  const onPanPointerUp = useCallback((e) => {
    try {
      if (!(zoom > 1)) return;

      isPanningRef.current = false;

      // release capture
      e.currentTarget?.releasePointerCapture?.(e.pointerId);

      // keep final offsets as the new base (so next drag starts from here)
      const start = panStartRef.current || {};
      const endX = e.clientX;
      const endY = e.clientY;

      const dx = endX - (start.x ?? endX);
      const dy = endY - (start.y ?? endY);

      panStartRef.current = {
        ...start,
        x: endX,
        y: endY,
        ox: (start.ox ?? 0) + dx,
        oy: (start.oy ?? 0) + dy,
      };
    } catch {
      // no-op
    }
  }, [zoom, panStartRef, isPanningRef]);

  return {
    onPanPointerDown,
    onPanPointerMove,
    onPanPointerUp,
  };
}