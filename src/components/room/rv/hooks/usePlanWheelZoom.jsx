import { useCallback, useEffect, useRef } from "react";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4.0;

export function isVisiblePlanPoint(svg, x, y) {
  if (!svg || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const hit = svg.ownerDocument.elementFromPoint(x, y);
  return !!hit && (hit === svg || svg.contains(hit));
}

// All viewport movement remains local UI state, never design/engineering data.
export function usePlanWheelZoom({
  planBoundsRef, svgRef, zoom, panX, panY, viewOffsetPx,
  setZoom, setPanX, setPanY, setViewOffsetPx,
}) {
  const stateRef = useRef({ zoom, panX, panY, viewOffsetPx });
  stateRef.current = { zoom, panX, panY, viewOffsetPx };
  const pointerRef = useRef(null);

  const zoomAt = useCallback((factor, clientX, clientY) => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    // Work in the SVG's own units, as do the existing drag/Measure conversions.
    const point = svg.createSVGPoint();
    point.x = clientX; point.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = point.matrixTransform(ctm.inverse());
    const current = stateRef.current;
    const offset = current.viewOffsetPx || { x: 0, y: 0 };
    const px = local.x - offset.x;
    const py = local.y - offset.y;
    const worldX = (px - current.panX) / current.zoom;
    const worldY = (py - current.panY) / current.zoom;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * factor));
    const nextPanX = px - worldX * nextZoom;
    const nextPanY = py - worldY * nextZoom;
    // Same exponential wheel sensitivity, range and point-under-pointer anchor.
    // Do not clamp the anchor away after a scroll/pan; Reset view is always available.
    stateRef.current = { ...current, zoom: nextZoom, panX: nextPanX, panY: nextPanY };
    setZoom(nextZoom); setPanX(nextPanX); setPanY(nextPanY);
  }, [svgRef, setZoom, setPanX, setPanY]);

  const panBy = useCallback((dx, dy) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return;
    const a = svg.createSVGPoint(), b = svg.createSVGPoint();
    a.x = 0; a.y = 0; b.x = dx; b.y = dy;
    const inverse = ctm.inverse();
    const start = a.matrixTransform(inverse), end = b.matrixTransform(inverse);
    const current = stateRef.current;
    const next = {
      x: (current.viewOffsetPx?.x || 0) + end.x - start.x,
      y: (current.viewOffsetPx?.y || 0) + end.y - start.y,
    };
    stateRef.current = { ...current, viewOffsetPx: next };
    setViewOffsetPx(next);
  }, [svgRef, setViewOffsetPx]);

  useEffect(() => {
    const el = planBoundsRef.current;
    if (!el) return;
    const doc = el.ownerDocument, win = doc.defaultView;
    const touches = new Map();
    let pinch = null, cancelling = false, touchSequence = false;
    const visible = (x, y) => isVisiblePlanPoint(svgRef.current, x, y);
    const invalidate = () => { pointerRef.current = null; };
    const trackPointer = e => {
      if (e.pointerType === 'touch') return;
      pointerRef.current = { x: e.clientX, y: e.clientY, overDrawing: visible(e.clientX, e.clientY) };
    };
    const onOut = e => {
      if (!e.relatedTarget || !svgRef.current?.contains(e.relatedTarget)) invalidate();
    };
    const onWheel = e => {
      const p = pointerRef.current;
      // Fail closed: wheel coordinates/targets alone never establish ownership.
      if (!p?.overDrawing || !visible(p.x, p.y) || !visible(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey) {
        // Browser trackpad pinch. Ordinary scrolling can never enter this path.
        zoomAt(Math.exp(-e.deltaY * 0.001), p.x, p.y);
      } else {
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        panBy(-dx * unit, -dy * unit);
      }
    };
    const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
    const pair = () => {
      const points = [...touches.values()];
      if (points.length !== 2 || points.some(p => !visible(p.x, p.y))) return null;
      const [a,b] = points;
      return { x:(a.x+b.x)/2, y:(a.y+b.y)/2, distance:Math.hypot(a.x-b.x,a.y-b.y) };
    };
    const onDown = e => {
      if (e.pointerType !== 'touch' || !visible(e.clientX,e.clientY)) return;
      touches.set(e.pointerId, {x:e.clientX,y:e.clientY,target:e.target});
      if (touches.size < 2) return; // Existing single-touch selection/drag stays intact.
      touchSequence = true;
      pinch = pair();
      invalidate();
      // End a pending one-finger object/pan gesture before two-finger navigation.
      cancelling = true;
      for (const [id,p] of touches) {
        p.target.dispatchEvent(new win.PointerEvent('pointercancel', {
          bubbles:true, pointerId:id, pointerType:'touch', clientX:p.x, clientY:p.y,
        }));
      }
      cancelling = false;
      stop(e);
    };
    const onMove = e => {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
      touches.set(e.pointerId, {...touches.get(e.pointerId),x:e.clientX,y:e.clientY});
      if (!touchSequence) return;
      stop(e);
      const next = pair();
      if (!next || !pinch) { pinch = null; return; }
      if (pinch.distance > 0 && next.distance > 0) {
        zoomAt(next.distance / pinch.distance, pinch.x, pinch.y);
        panBy(next.x - pinch.x, next.y - pinch.y);
      }
      pinch = next;
    };
    const onEnd = e => {
      if (cancelling || !touches.has(e.pointerId)) return;
      touches.delete(e.pointerId);
      if (touchSequence) stop(e);
      pinch = null;
      if (!touches.size) touchSequence = false;
    };
    const onBlur = () => { invalidate(); touches.clear(); pinch = null; touchSequence = false; };
    // Capture on window sees pointer movement even when child controls stop bubbling.
    win.addEventListener('pointermove', trackPointer, true);
    win.addEventListener('mousemove', trackPointer, true);
    win.addEventListener('pointerover', trackPointer, true);
    win.addEventListener('pointerout', onOut, true);
    win.addEventListener('blur', onBlur);
    win.addEventListener('pointerdown', onDown, true);
    win.addEventListener('pointermove', onMove, true);
    win.addEventListener('pointerup', onEnd, true);
    win.addEventListener('pointercancel', onEnd, true);
    el.addEventListener('wheel', onWheel, {passive:false});
    return () => {
      invalidate();
      win.removeEventListener('pointermove', trackPointer, true);
      win.removeEventListener('mousemove', trackPointer, true);
      win.removeEventListener('pointerover', trackPointer, true);
      win.removeEventListener('pointerout', onOut, true);
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('pointerdown', onDown, true);
      win.removeEventListener('pointermove', onMove, true);
      win.removeEventListener('pointerup', onEnd, true);
      win.removeEventListener('pointercancel', onEnd, true);
      el.removeEventListener('wheel', onWheel);
    };
  }, [planBoundsRef, svgRef, zoomAt, panBy]);

  const zoomStep = useCallback(direction => {
    const svg = svgRef.current, wrapper = planBoundsRef.current;
    if (!svg || !wrapper) return;
    const a = svg.getBoundingClientRect(), b = wrapper.getBoundingClientRect();
    const win = wrapper.ownerDocument.defaultView;
    const left = Math.max(a.left,b.left,0), right = Math.min(a.right,b.right,win.innerWidth);
    const top = Math.max(a.top,b.top,0), bottom = Math.min(a.bottom,b.bottom,win.innerHeight);
    if (right <= left || bottom <= top) return;
    zoomAt(Math.exp(direction * 0.15), (left+right)/2, (top+bottom)/2);
  }, [svgRef, planBoundsRef, zoomAt]);

  const resetView = useCallback(() => {
    stateRef.current = {zoom:1,panX:0,panY:0,viewOffsetPx:{x:0,y:0}};
    setZoom(1); setPanX(0); setPanY(0); setViewOffsetPx({x:0,y:0});
  }, [setZoom,setPanX,setPanY,setViewOffsetPx]);
  const isNonDefault = zoom !== 1 || panX !== 0 || panY !== 0 ||
    !!(viewOffsetPx?.x || viewOffsetPx?.y);
  return {resetView,isNonDefault,zoomIn:()=>zoomStep(1),zoomOut:()=>zoomStep(-1)};
}
