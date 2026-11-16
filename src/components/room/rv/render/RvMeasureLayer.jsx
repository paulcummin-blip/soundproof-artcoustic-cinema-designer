import React, { useState, useRef, useCallback, useMemo } from 'react';
import { clientToRoom } from '@/components/room/rv/utils/rvPointerToRoom';
import {
  buildSnapReferences,
  findSnap,
  elementPlanRectM,
  distToSegment,
  SNAP_TOLERANCE_M,
} from '@/components/room/rv/utils/measureSnapping';

// Mounted only while Measure is on. All points are temporary room metres;
// nothing is passed to project state, geometry setters or storage. The
// component unmounts on Measure-off, so toggling off/on starts fresh.
export default function RvMeasureLayer({
  svgRef, roomRect, scale, viewOffsetPx, zoom, panX, panY, svgW, svgH,
  widthM, lengthM, speakers, seats, roomElements,
}) {
  const [pointA, setPointA] = useState(null);
  const [pointB, setPointB] = useState(null);
  const [cursor, setCursor] = useState(null);
  // dragMode: null | 'A' | 'B' | 'line'
  const [dragMode, setDragMode] = useState(null);
  const [snapA, setSnapA] = useState(null);
  const [snapB, setSnapB] = useState(null);
  const [snapCursor, setSnapCursor] = useState(null);
  const dragOffsetRef = useRef(null);
  const dragOccurredRef = useRef(false);

  const z = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1;
  const sc = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : 1;

  const refs = useMemo(() => {
    const elementRects = Array.isArray(roomElements)
      ? roomElements.map((el) => elementPlanRectM(el, { widthM, lengthM })).filter(Boolean)
      : [];
    return buildSnapReferences({ widthM, lengthM, speakers, seats, elementRects });
  }, [widthM, lengthM, speakers, seats, roomElements]);

  const readPoint = useCallback((event) => clientToRoom({
    svgElement: svgRef.current, clientX: event.clientX, clientY: event.clientY,
    roomRect, scale, viewOffsetPx,
  }), [svgRef, roomRect, scale, viewOffsetPx]);

  // Root-SVG-space transform (same as rvZoomTransform) so labels and handles
  // keep a constant size at every plan zoom.
  const toView = (point) => ({
    x: (roomRect.x + point.x * scale) * z + (Number(panX) || 0) + (Number(viewOffsetPx?.x) || 0),
    y: (roomRect.y + point.y * scale) * z + (Number(panY) || 0) + (Number(viewOffsetPx?.y) || 0),
  });

  const stop = (event) => { event.preventDefault(); event.stopPropagation(); };

  // Hit radii in room metres, scaled so the grab area is a constant ~12 px on
  // screen regardless of zoom. Snapping tolerance stays a fixed 5 cm in room
  // coordinates, so it behaves consistently at every zoom level.
  const hitRadiusM = 12 / (sc * z);
  const lineHitM = 6 / (sc * z);

  const hitTest = (p) => {
    if (!pointA || !pointB) return null;
    const dA = Math.hypot(p.x - pointA.x, p.y - pointA.y);
    const dB = Math.hypot(p.x - pointB.x, p.y - pointB.y);
    if (dA <= hitRadiusM && dA <= dB) return 'A';
    if (dB <= hitRadiusM) return 'B';
    const { dist } = distToSegment(p.x, p.y, pointA.x, pointA.y, pointB.x, pointB.y);
    if (dist <= lineHitM) return 'line';
    return null;
  };

  const capture = (event) => {
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* noop */ }
  };
  const release = (event) => {
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* noop */ }
  };

  const onPointerDown = (event) => {
    stop(event);
    if (event.button !== 0) return;
    const point = readPoint(event);
    if (!point) return;
    dragOccurredRef.current = false;
    if (pointA && pointB) {
      const hit = hitTest(point);
      if (hit === 'A' || hit === 'B') {
        setDragMode(hit);
        capture(event);
      } else if (hit === 'line') {
        setDragMode('line');
        dragOffsetRef.current = { dx: point.x - pointA.x, dy: point.y - pointA.y };
        capture(event);
      }
    }
  };

  const onPointerMove = (event) => {
    event.stopPropagation();
    const point = readPoint(event);
    if (!point) return;

    if (dragMode === 'A') {
      const snap = findSnap(point, refs);
      setPointA(snap ? snap.point : point);
      setSnapA(snap);
      dragOccurredRef.current = true;
    } else if (dragMode === 'B') {
      const snap = findSnap(point, refs);
      setPointB(snap ? snap.point : point);
      setSnapB(snap);
      dragOccurredRef.current = true;
    } else if (dragMode === 'line') {
      const rawA = { x: point.x - dragOffsetRef.current.dx, y: point.y - dragOffsetRef.current.dy };
      const snap = findSnap(rawA, refs);
      const newA = snap ? snap.point : rawA;
      const dx = newA.x - pointA.x;
      const dy = newA.y - pointA.y;
      setPointA(newA);
      setPointB((pb) => ({ x: pb.x + dx, y: pb.y + dy }));
      setSnapA(snap);
      dragOccurredRef.current = true;
    } else if (pointA && !pointB) {
      const snap = findSnap(point, refs);
      setCursor(snap ? snap.point : point);
      setSnapCursor(snap);
    }
  };

  const onPointerUp = (event) => {
    event.stopPropagation();
    if (dragMode) {
      setDragMode(null);
      setSnapA(null);
      setSnapB(null);
      release(event);
      return;
    }
    if (dragOccurredRef.current) return;
    const point = readPoint(event);
    if (!point) return;
    const snap = findSnap(point, refs);
    const placed = snap ? snap.point : point;
    if (!pointA) {
      setPointA(placed);
      setCursor(placed);
      setSnapCursor(null);
    } else if (!pointB) {
      setPointB(placed);
      setSnapCursor(null);
    }
  };

  // --- Rendering ---
  const end = pointB || cursor;
  const a = pointA && toView(pointA);
  const b = end && toView(end);
  const distance = pointA && end ? Math.hypot(end.x - pointA.x, end.y - pointA.y) : 0;
  const label = distance.toFixed(2) + ' m';
  const dx = a && b ? b.x - a.x : 0;
  const dy = a && b ? b.y - a.y : 0;
  const span = Math.hypot(dx, dy);
  const tickX = span > 0 ? -dy / span * 5 : 0;
  const tickY = span > 0 ? dx / span * 5 : 5;
  const labelX = a && b ? Math.max(40, Math.min(svgW - 40, (a.x + b.x) / 2)) : 40;
  const labelY = a && b ? Math.max(42, Math.min(svgH - 16, (a.y + b.y) / 2 - 14)) : 42;
  const instruction = !pointA ? 'Measure: click point A'
    : !pointB ? 'Move pointer · click point B'
    : 'Drag endpoints or the line to edit · toggle Measure off/on to restart';

  const snapped = (ref) => ref != null;
  const handleColor = (active) => active ? '#2E7D5B' : '#3E6B4F';
  const snapMarker = (ref, viewPoint) => {
    if (!ref) return null;
    return (
      <g key={'snap-' + (viewPoint ? 'p' : '')}>
        <circle cx={viewPoint.x} cy={viewPoint.y} r={7} fill="none"
          stroke="#2E7D5B" strokeWidth={1.5} opacity={0.9} />
        <circle cx={viewPoint.x} cy={viewPoint.y} r={1.5} fill="#2E7D5B" />
      </g>
    );
  };

  return (
    <g data-layer="plan-measure" data-measure-state={!pointA ? 'ready' : pointB ? 'fixed' : 'live'}>
      {/* Topmost hit surface prevents all object selection, dragging and pan
          gestures, including compatibility mouse events and double clicks. */}
      <rect
        data-measure-surface="true"
        x={0} y={0} width={svgW} height={svgH}
        fill="transparent" pointerEvents="all"
        style={{ cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseDown={stop} onMouseUp={stop}
        onClick={stop} onDoubleClick={stop}
        onContextMenu={stop}
      />
      <g pointerEvents="none" style={{ userSelect: 'none' }}>
        <rect x={8} y={8} width={Math.min(svgW - 16, instruction.length * 5.5 + 18)}
          height={22} rx={4} fill="#F8F8F7" stroke="#DCDBD6" />
        <text x={17} y={22} fontSize={10} fontWeight={600} fill="#213428">{instruction}</text>
        {a && b && <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="#3E6B4F" strokeWidth={1} strokeDasharray="3,3" />
          {[{ p: a, key: 'A', snap: snapA, live: dragMode === 'A' },
            { p: b, key: 'B', snap: snapB, live: dragMode === 'B' }].map((end) => (
            <g key={end.key}>
              {/* snap highlight ring */}
              {snapped(end.snap) && (
                <circle cx={end.p.x} cy={end.p.y} r={9} fill="none"
                  stroke="#2E7D5B" strokeWidth={2} opacity={0.85} />
              )}
              {/* draggable handle (visible) */}
              <circle cx={end.p.x} cy={end.p.y} r={5}
                fill="#FFFFFF" stroke={handleColor(end.live)} strokeWidth={2} />
              {/* snap reference marker */}
              {snapped(end.snap) && snapMarker(end.snap, toView(end.snap.point))}
              <line x1={end.p.x - tickX} y1={end.p.y - tickY}
                x2={end.p.x + tickX} y2={end.p.y + tickY}
                stroke="#3E6B4F" strokeWidth={1} />
              <text x={end.p.x + 8} y={end.p.y - 8} fontSize={10} fontWeight={600}
                fill="#213428">{end.key}</text>
            </g>
          ))}
          {/* snap marker for the drawing cursor preview */}
          {pointA && !pointB && snapped(snapCursor) && snapMarker(snapCursor, toView(snapCursor.point))}
          <rect x={labelX - 36} y={labelY - 10} width={72} height={20}
            rx={4} fill="#F8F8F7" stroke="#DCDBD6" />
          <text data-measure-distance={distance} x={labelX} y={labelY}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fontWeight={600} fill="#213428">{label}</text>
        </>}
      </g>
    </g>
  );
}