import { useCallback, useEffect, useRef } from "react";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4.0;

// elementFromPoint uses the rendered, clipped viewport, not the oversized
// layout rectangle. It also excludes menus and controls covering the SVG.
export function isVisiblePlanPoint(svg, x, y) {
  if (!svg || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const hit = svg.ownerDocument.elementFromPoint(x, y);
  return !!hit && (hit === svg || svg.contains(hit));
}

/**
 * Direct mouse/trackpad zoom for the Plan View.
 *
 * Wheel and pinch gestures zoom only over the visible drawing. Browser
 * hit-testing respects every clipping/scrolling ancestor and any overlay;
 * the full SVG rectangle alone does not describe its visible viewport.
 * Outside the drawing, ordinary scrolling remains unconsumed.
 *
 * Zoom range: 0.6×–4.0×. Drag-pan (via usePanZoomHandlers) is independent of
 * zoom: the drawing can be repositioned by dragging empty plan space at any
 * zoom level, and a pan offsets the one zoom transform on top of the zoom pan.
 *
 * Returns:
 *   resetView  — restores zoom=1, pan=0, viewOffset=0
 *   isNonDefault — true when the viewport differs from the fitted default
 */
export function usePlanWheelZoom({
  planBoundsRef,
  svgRef,
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

    const doc = el.ownerDocument;
    // A wheel sequence can retain its initial target/coordinates after the
    // pointer moves. Independently observe pointer movement, including exits
    // from this document, so that a latched sequence cannot keep zooming.
    let pointer = null;
    const onPointerMove = (event) => { pointer = { x: event.clientX, y: event.clientY }; };
    const onPointerOut = (event) => { if (!event.relatedTarget) pointer = { outside: true }; };
    const onBlur = () => { pointer = { outside: true }; };

    const onWheel = (e) => {
      const svgEl = svgRef?.current;
      if (!svgEl || !isVisiblePlanPoint(svgEl, e.clientX, e.clientY)) return;
      if (pointer && (pointer.outside || !isVisiblePlanPoint(svgEl, pointer.x, pointer.y))) return;
      const svgRect = svgEl.getBoundingClientRect();
      if (svgRect.width <= 0 || svgRect.height <= 0) return;

      // Consume wheel/pinch only over the visible drawing — prevents page
      // scroll and browser pinch-zoom while zooming.
      e.preventDefault();
      e.stopPropagation();

      const { zoom: curZoom, panX: curPanX, panY: curPanY } = stateRef.current;
      const rect = svgRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      // World point under cursor (in unzoomed content coordinates)
      const worldX = (px - curPanX) / curZoom;
      const worldY = (py - curPanY) / curZoom;

      // Original wheel/pinch sensitivity and pointer anchoring.
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

    doc.addEventListener("pointermove", onPointerMove, true);
    doc.addEventListener("pointerout", onPointerOut, true);
    doc.defaultView?.addEventListener("blur", onBlur);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      doc.removeEventListener("pointermove", onPointerMove, true);
      doc.removeEventListener("pointerout", onPointerOut, true);
      doc.defaultView?.removeEventListener("blur", onBlur);
    };
  }, [planBoundsRef, svgRef, setZoom, setPanX, setPanY]);

  // Temporary read-only wheel audit; removed after runtime validation.
  useEffect(() => {
    const el = planBoundsRef.current;
    const doc = el?.ownerDocument;
    if (!doc) return;
    const rect = (node) => node?.getBoundingClientRect().toJSON();
    const describe = (node) => node?.tagName ? node.tagName + (node.getAttribute?.("class") ? "." + node.getAttribute("class") : "") : "window";
    const record = (event) => {
      const before = { ...stateRef.current };
      const data = { x: event.clientX, y: event.clientY, deltaY: event.deltaY, ctrlKey: event.ctrlKey,
        target: describe(event.target), path: event.composedPath().map(describe),
        hit: describe(doc.elementFromPoint(event.clientX, event.clientY)),
        wrapper: rect(el), svg: rect(svgRef.current), before,
        scrolls: [...doc.querySelectorAll("*")].filter(n => n.scrollTop).map(n => ({node:describe(n),top:n.scrollTop})) };
      requestAnimationFrame(() => console.info("[plan-wheel-audit]", JSON.stringify({...data, after:{...stateRef.current}, prevented:event.defaultPrevented})));
    };
    doc.addEventListener("wheel", record, {capture:true, passive:true});
    return () => doc.removeEventListener("wheel",record,true);
  }, [planBoundsRef, svgRef]);

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