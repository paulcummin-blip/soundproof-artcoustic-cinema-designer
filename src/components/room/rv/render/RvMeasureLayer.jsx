import React, { useState } from 'react';
import { clientToRoom } from '@/components/room/rv/utils/rvPointerToRoom';

// Mounted only while Measure is on. All points are temporary room metres;
// nothing is passed to project state, geometry setters or storage.
export default function RvMeasureLayer({
  svgRef, roomRect, scale, viewOffsetPx, zoom, panX, panY, svgW, svgH,
}) {
  const [pointA, setPointA] = useState(null);
  const [pointB, setPointB] = useState(null);
  const [cursor, setCursor] = useState(null);
  const stop = (event) => { event.preventDefault(); event.stopPropagation(); };
  const readPoint = (event) => clientToRoom({
    svgElement: svgRef.current, clientX: event.clientX, clientY: event.clientY,
    roomRect, scale, viewOffsetPx,
  });
  const onClick = (event) => {
    stop(event);
    if (event.button !== 0 || pointB) return;
    const point = readPoint(event);
    if (!point) return;
    if (!pointA) { setPointA(point); setCursor(point); }
    else { setPointB(point); setCursor(point); }
  };
  const onMove = (event) => {
    event.stopPropagation();
    if (pointA && !pointB) {
      const point = readPoint(event);
      if (point) setCursor(point);
    }
  };

  // Draw in root SVG space so labels and end ticks keep their usual size at
  // every plan zoom. This is the same transform as rvZoomTransform.
  const z = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1;
  const toView = (point) => ({
    x: (roomRect.x + point.x * scale) * z + (Number(panX) || 0) + (Number(viewOffsetPx?.x) || 0),
    y: (roomRect.y + point.y * scale) * z + (Number(panY) || 0) + (Number(viewOffsetPx?.y) || 0),
  });
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
    : 'Measurement fixed · toggle Measure off/on to restart';

  return (
    <g data-layer="plan-measure" data-measure-state={!pointA ? 'ready' : pointB ? 'fixed' : 'live'}>
      {/* Topmost hit surface prevents all object selection, dragging and pan
          gestures, including compatibility mouse events and double clicks. */}
      <rect
        data-measure-surface="true"
        x={0} y={0} width={svgW} height={svgH}
        fill="transparent" pointerEvents="all"
        style={{ cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={stop} onPointerUp={stop} onPointerCancel={stop}
        onMouseDown={stop} onMouseUp={stop}
        onClick={onClick} onDoubleClick={stop}
        onPointerMove={onMove} onContextMenu={stop}
      />
      <g pointerEvents="none" style={{ userSelect: 'none' }}>
        <rect x={8} y={8} width={Math.min(svgW - 16, instruction.length * 5.5 + 18)}
          height={22} rx={4} fill="#F8F8F7" stroke="#DCDBD6" />
        <text x={17} y={22} fontSize={10} fontWeight={600} fill="#213428">{instruction}</text>
        {a && b && <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="#3E6B4F" strokeWidth={1} strokeDasharray="3,3" />
          {[a, b].map((point, index) => <g key={index}>
            <line x1={point.x - tickX} y1={point.y - tickY}
              x2={point.x + tickX} y2={point.y + tickY} stroke="#3E6B4F" strokeWidth={1} />
            <circle cx={point.x} cy={point.y} r={2.5} fill="#3E6B4F" />
            <text x={point.x + 7} y={point.y - 7} fontSize={10} fontWeight={600}
              fill="#213428">{index ? 'B' : 'A'}</text>
          </g>)}
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
