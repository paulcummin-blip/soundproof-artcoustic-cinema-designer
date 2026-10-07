"use client";

import { useCallback } from "react";

/**
 * Pan handlers extracted from RoomVisualisation.
 * IMPORTANT: This hook does not own any state. It only uses what is passed in.
 *
 * Drag-pan moves the viewport only: it writes the view offset and nothing else,
 * so room geometry, object positions, calculations and saved project data are
 * untouched by panning.
 */

/**
 * Pointer travel (px) past which a gesture counts as a pan and not as a click on
 * the plan. Shared with the plan canvas so a pan never reads as a click.
 */
export const PAN_CLICK_SLOP_PX = 3;
export function usePanZoomHandlers({
  panStartRef,
  isPanningRef,
  viewOffsetPx,
  setViewOffsetPx,
}) {
  const onPanPointerDown = useCallback((e) => {
    try {
      // Panning is not restricted by zoom: empty plan space repositions the
      // drawing at every zoom level, including the fitted default view.

      // capture pointer so drag continues even if cursor leaves element
      e.currentTarget?.setPointerCapture?.(e.pointerId);

      isPanningRef.current = true;

      const clientX = e.clientX;
      const clientY = e.clientY;

      // Store the starting pointer position and the offset actually on screen.
      // The offset is read from the live view state, never from the previous
      // gesture, so a pan that follows a Reset view (or any other offset change)
      // starts from where the drawing really is and cannot jump.
      panStartRef.current = {
        x: clientX,
        y: clientY,
        // "ox/oy" are the starting offset values
        ox: Number(viewOffsetPx?.x) || 0,
        oy: Number(viewOffsetPx?.y) || 0,
      };
    } catch {
      // no-op, avoid crashing pointer events
    }
  }, [panStartRef, isPanningRef, viewOffsetPx]);

  const onPanPointerMove = useCallback((e) => {
    try {
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
  }, [panStartRef, isPanningRef, setViewOffsetPx]);

  const onPanPointerUp = useCallback((e) => {
    try {
      if (!isPanningRef.current) return;

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
  }, [panStartRef, isPanningRef]);

  return {
    onPanPointerDown,
    onPanPointerMove,
    onPanPointerUp,
  };
}