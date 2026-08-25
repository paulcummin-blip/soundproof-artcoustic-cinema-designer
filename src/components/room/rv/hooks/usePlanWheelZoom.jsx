import { useCallback, useEffect, useRef } from "react";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4.0;

/**
 * Direct mouse/trackpad zoom for the Plan View.
 *
 * Attaches a non-passive wheel listener to the plan container so wheel/pinch
 * events over the plan zoom the drawing (centred on the pointer) instead of
 * scrolling the page. Normal page scrolling continues outside the plan
 * because the listener is scoped to the plan element only.
 *
 * Zoom range: 0.6×–4.0×. Drag-pan (via usePanZoomHandlers) remains active once
 * zoomed in (zoom > 1).
 *
 * Returns:
 *   resetView  — restores zoom=1, pan=0, viewOffset=0
 *   isNonDefault — true when the viewport differs from the fitted default
 */
export function usePlanWheelZoom({
  planBoundsRef,
  zoom,
  panX,
  panY,
  viewOffsetPx,
  setZoom,
  setPanX,
  setPanY,
  setViewOffsetPx,
}) {
  // Refs to avoid stale closures in the non-passive wheel listener
  const stateRef = useRef({ zoom, panX, panY });
  stateRef.current = { zoom, panX, panY };

  useEffect(() => {
    const el = planBoundsRef.current;
    if (!el) return;

    const onWheel = (e) => {
      // Always consume wheel events over the plan — prevents page scroll and
      // browser pinch-zoom while the pointer is over the drawing.
      e.preventDefault();
      e.stopPropagation();

      const { zoom: curZoom, panX: curPanX, panY: curPanY } = stateRef.current;
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      // World point under cursor (in unzoomed content coordinates)
      const worldX = (px - curPanX) / curZoom;
      const worldY = (py - curPanY) / curZoom;

      // Smooth exponential zoom — works for mouse wheel (large deltaY) and
      // trackpad pinch (ctrlKey=true, small deltaY).
      const factor = Math.exp(-e.deltaY * 0.001);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, curZoom * factor));

      // New pan to keep the world point under the cursor fixed
      let newPanX = px - worldX * newZoom;
      let newPanY = py - worldY * newZoom;

      // Light pan clamp — prevent the plan from disappearing entirely
      const panLimit = Math.max(rect.width, rect.height) * Math.max(0, newZoom - 1);
      if (panLimit > 0) {
        newPanX = Math.max(-panLimit, Math.min(panLimit, newPanX));
        newPanY = Math.max(-panLimit, Math.min(panLimit, newPanY));
      } else {
        newPanX = 0;
        newPanY = 0;
      }

      setZoom(newZoom);
      setPanX(newPanX);
      setPanY(newPanY);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [planBoundsRef, setZoom, setPanX, setPanY]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setViewOffsetPx({ x: 0, y: 0 });
  }, [setZoom, setPanX, setPanY, setViewOffsetPx]);

  const isNonDefault =
    zoom !== 1 ||
    panX !== 0 ||
    panY !== 0 ||
    (viewOffsetPx && (viewOffsetPx.x !== 0 || viewOffsetPx.y !== 0));

  return { resetView, isNonDefault };
}