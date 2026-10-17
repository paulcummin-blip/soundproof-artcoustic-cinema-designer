"use client";

import { useCallback, useRef, useState } from "react";
import { getMlpGrab } from "@/components/state/mlpGrabStore";
import { usePanZoomHandlers } from "@/components/room/rv/hooks/usePanZoomHandlers";

/**
 * useRvPlanPan — the Plan View's canvas panning gesture.
 *
 * Empty plan space is the pan surface: holding it and moving repositions the
 * whole drawing. This is the plan's original pan mechanism, unchanged; the only
 * thing it does not do is require the view to be zoomed in, so the fitted
 * default view pans too.
 *
 * Objects keep their own gestures because they are rendered above the pan
 * surface, so a seat, speaker, subwoofer or room element never sees a pan. The
 * guards below only cover what hit-testing cannot express: a live object drag, a
 * live plan gesture, and the RSP placement mode, which owns the whole plan.
 *
 * Panning writes the viewport offset and nothing else — room geometry, object
 * positions, calculations and saved project data are untouched, and the offset
 * is view state that is never saved with the design.
 *
 * Panning dismisses nothing and carries no click token: the Seat HUD is
 * dismissed by the press that starts an interaction outside the seat and the
 * HUD (see seatHudSelectionAuthority), and a release is never read as a
 * click-away.
 */
export function useRvPlanPan({
  viewOffsetPx,
  setViewOffsetPx,
  isDraggingSpeakerRef,
  dragging,
}) {
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  // Reactive so the pan surface's grab → grabbing cursor follows the gesture.
  const [isPanning, setIsPanning] = useState(false);

  const {
    onPanPointerDown: hookOnPanDown,
    onPanPointerMove: hookOnPanMove,
    onPanPointerUp: hookOnPanUp,
  } = usePanZoomHandlers({
    panStartRef,
    isPanningRef,
    viewOffsetPx,
    setViewOffsetPx,
  });

  const onPanPointerDown = useCallback((e) => {
    // Never pan if the event was already handled (sub/speaker drag)
    if (e.defaultPrevented) return;

    // Never pan while an object drag or any other plan gesture is live
    if (isDraggingSpeakerRef.current) return;
    if (dragging) return;

    // RSP placement mode owns the whole plan while it is active
    if (getMlpGrab()) return;

    // Left click only
    if (e.button !== 0) return;

    // Avoid modifier conflicts
    if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;

    // Only proceed if the pan surface itself is the hit element
    if (e.currentTarget !== e.target) return;

    setIsPanning(true);
    hookOnPanDown(e);
  }, [hookOnPanDown, isDraggingSpeakerRef, dragging]);

  const onPanPointerMove = useCallback((e) => {
    hookOnPanMove(e);
  }, [hookOnPanMove]);

  const onPanPointerUp = useCallback((e) => {
    setIsPanning(false);
    hookOnPanUp(e);
  }, [hookOnPanUp]);

  return {
    onPanPointerDown,
    onPanPointerMove,
    onPanPointerUp,
    isPanning,
  };
}

export default useRvPlanPan;