import { useCallback, useEffect, useRef } from "react";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4.0;

// Smooth zoom settling: after a zoom gesture ends, the view eases to the next
// 5% zoom increment in the last gesture direction. The anchor point under the
// pointer (or canvas centre for the buttons) stays fixed throughout, so the
// drawing never shifts. A new zoom gesture cancels any in-flight settle.
const SNAP_STEP = 0.05;
// Quiet period after the last zoom input before the gentle settle begins.
const SETTLE_DELAY_MS = 500;
// The settle eases towards the nearest 5% increment over ~700ms. The movement
// is small (at most half a 5% step) and uses a smoothstep curve with zero
// velocity at both ends, so the correction reads as a natural finish rather
// than a visible snap.
const SETTLE_DURATION_MS = 700;
const snapNearest = z => {
  const r = Math.round(z / SNAP_STEP);
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, r * SNAP_STEP));
};
const isSnapped = z => {
  const v = snapNearest(z);
  return Math.abs(z - v) < 1e-6;
};

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
  // Settle state: last zoom anchor and the in-flight animation.
  const gestureAnchorRef = useRef(null);
  const rafRef = useRef(null);
  const settleTimeoutRef = useRef(null);

  // Absolute zoom to a target value, keeping the world point under (clientX,
  // clientY) anchored. Self-consistent across frames: once pan is set for an
  // anchor at a given zoom, recomputing at that zoom returns the same world
  // point, so the anchor never drifts during the settle animation.
  const applyZoomAt = useCallback((targetZoom, clientX, clientY) => {
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
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
    const nextPanX = px - worldX * nextZoom;
    const nextPanY = py - worldY * nextZoom;
    // Same exponential wheel sensitivity, range and point-under-pointer anchor.
    // Do not clamp the anchor away after a scroll/pan; Reset view is always available.
    stateRef.current = { ...current, zoom: nextZoom, panX: nextPanX, panY: nextPanY };
    setZoom(nextZoom); setPanX(nextPanX); setPanY(nextPanY);
  }, [svgRef, setZoom, setPanX, setPanY]);

  const zoomAt = useCallback((factor, clientX, clientY) => {
    applyZoomAt(stateRef.current.zoom * factor, clientX, clientY);
  }, [applyZoomAt]);

  // Cancel any pending or running settle. Called when a new zoom gesture
  // starts, and when a new settle supersedes an old one.
  const cancelSettle = useCallback(() => {
    if (settleTimeoutRef.current) { clearTimeout(settleTimeoutRef.current); settleTimeoutRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  // Ease the zoom from its current value to targetZoom over SETTLE_DURATION_MS,
  // keeping the anchor fixed. Smoothstep (3t²−2t³) has zero velocity at both
  // ends, so the correction starts gently, moves smoothly and decelerates to
  // rest with no abrupt start or stop — the finishing correction is almost
  // imperceptible. No overshoot, bounce or elastic terms are used.
  const animateZoomTo = useCallback((targetZoom, clientX, clientY) => {
    cancelSettle();
    const start = stateRef.current.zoom;
    if (!Number.isFinite(targetZoom) || Math.abs(targetZoom - start) < 1e-6) return;
    const t0 = performance.now();
    const tick = (now) => {
      if (rafRef.current === null) return; // superseded/cancelled
      const t = Math.min(1, (now - t0) / SETTLE_DURATION_MS);
      const eased = t * t * (3 - 2 * t);
      applyZoomAt(start + (targetZoom - start) * eased, clientX, clientY);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [applyZoomAt, cancelSettle]);

  // After the gesture goes quiet for SETTLE_DELAY_MS, settle gently to the
  // nearest 5% increment. If already on an increment, nothing happens. The
  // anchor is preserved so the drawing never drifts.
  const requestSettle = useCallback((anchor) => {
    if (!anchor) return;
    if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = setTimeout(() => {
      settleTimeoutRef.current = null;
      const z = stateRef.current.zoom;
      if (isSnapped(z)) return;
      const target = snapNearest(z);
      animateZoomTo(target, anchor.x, anchor.y);
    }, SETTLE_DELAY_MS);
  }, [animateZoomTo]);

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
        const f = Math.exp(-e.deltaY * 0.001);
        zoomAt(f, p.x, p.y);
        gestureAnchorRef.current = { x: p.x, y: p.y };
        // A new zoom gesture interrupts any in-flight settle, then re-arms it.
        cancelSettle();
        requestSettle(gestureAnchorRef.current);
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
      cancelSettle();
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
        const f = next.distance / pinch.distance;
        zoomAt(f, pinch.x, pinch.y);
        panBy(next.x - pinch.x, next.y - pinch.y);
        gestureAnchorRef.current = { x: pinch.x, y: pinch.y };
        cancelSettle();
      }
      pinch = next;
    };
    const onEnd = e => {
      if (cancelling || !touches.has(e.pointerId)) return;
      touches.delete(e.pointerId);
      if (touchSequence) stop(e);
      pinch = null;
      if (!touches.size) {
        touchSequence = false;
        requestSettle(gestureAnchorRef.current);
      }
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
      cancelSettle();
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
  }, [planBoundsRef, svgRef, zoomAt, panBy, cancelSettle, requestSettle]);

  const zoomStep = useCallback(direction => {
    const svg = svgRef.current, wrapper = planBoundsRef.current;
    if (!svg || !wrapper) return;
    const a = svg.getBoundingClientRect(), b = wrapper.getBoundingClientRect();
    const win = wrapper.ownerDocument.defaultView;
    const left = Math.max(a.left,b.left,0), right = Math.min(a.right,b.right,win.innerWidth);
    const top = Math.max(a.top,b.top,0), bottom = Math.min(a.bottom,b.bottom,win.innerHeight);
    if (right <= left || bottom <= top) return;
    const cx = (left+right)/2, cy = (top+bottom)/2;
    // Buttons ease to the next 5% increment in the requested direction,
    // anchored at the visible canvas centre, using the same settle animation
    // as gesture-driven zoom.
    const z = stateRef.current.zoom;
    const r = Math.round(z / SNAP_STEP) + direction;
    const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, r * SNAP_STEP));
    animateZoomTo(target, cx, cy);
  }, [svgRef, planBoundsRef, animateZoomTo]);

  const resetView = useCallback(() => {
    cancelSettle();
    stateRef.current = {zoom:1,panX:0,panY:0,viewOffsetPx:{x:0,y:0}};
    setZoom(1); setPanX(0); setPanY(0); setViewOffsetPx({x:0,y:0});
  }, [setZoom,setPanX,setPanY,setViewOffsetPx,cancelSettle]);
  const isNonDefault = zoom !== 1 || panX !== 0 || panY !== 0 ||
    !!(viewOffsetPx?.x || viewOffsetPx?.y);
  return {resetView,isNonDefault,zoomIn:()=>zoomStep(1),zoomOut:()=>zoomStep(-1)};
}