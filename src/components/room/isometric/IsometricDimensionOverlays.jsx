// IsometricDimensionOverlays.jsx
//
// HTML/SVG dimension lines overlaid on the Isometric View 3D canvas.
// Renders three overall room dimensions (Width, Length, Height) as clean
// architectural annotation OUTSIDE the room shell, driven by the same
// overlays.ROOM_DIMS toggle that controls Plan View dimensions.
//
// The overlays are projected from 3D room coordinates to screen space using the
// current camera, so they track the room boundaries during orbit/zoom/resize.
// They use restrained grey lines and small clear text in metres — matching the
// existing Sound Proof drawing style.

import React, { useMemo, useRef, useEffect, useState } from "react";
import { Vector3 } from "three";

const DIM_COLOR = "#6B7280";
const DIM_LINE_WIDTH = 1;
const TEXT_STYLE = {
  fontFamily: "Didact Gothic, sans-serif",
  fontSize: "12px",
  fontWeight: 600,
  fill: "#3E4349",
};

// Format metres to 2 decimal places, stripping trailing zeros.
function formatM(m) {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n.toFixed(2)} m`;
}

// Project a 3D room point to screen pixel coordinates via the live camera/renderer.
function project(point3, camera, renderer) {
  if (!camera || !renderer) return null;
  const v = point3.clone().project(camera);
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  return {
    x: (v.x * 0.5 + 0.5) * w,
    y: (-v.y * 0.5 + 0.5) * h,
  };
}

export default function IsometricDimensionOverlays({ roomDims, cameraRef, rendererRef }) {
  const overlayRef = useRef(null);
  const [tick, setTick] = useState(0);

  // Re-render the overlay whenever the camera changes (orbit/zoom/pan) or the
  // canvas resizes. We poll the controls "change" by subscribing to a lightweight
  // rAF check — simpler than threading event listeners, and cheap since the
  // overlay is a few SVG elements.
  useEffect(() => {
    let raf;
    let lastKey = "";
    const check = () => {
      raf = requestAnimationFrame(check);
      const cam = cameraRef.current;
      const rend = rendererRef.current;
      if (!cam || !rend) return;
      // Build a cheap identity key from camera position + zoom + canvas size.
      const key = `${cam.position.x.toFixed(3)},${cam.position.y.toFixed(3)},${cam.position.z.toFixed(3)},${cam.zoom.toFixed(3)},${rend.domElement.clientWidth}x${rend.domElement.clientHeight}`;
      if (key !== lastKey) {
        lastKey = key;
        setTick((t) => t + 1);
      }
    };
    check();
    return () => cancelAnimationFrame(raf);
  }, [cameraRef, rendererRef]);

  const { widthM, lengthM, heightM } = roomDims;
  const W = widthM || 0;
  const L = lengthM || 0;
  const H = heightM || 0;

  // Compute the six anchor points for the three dimension lines, projected to
  // screen space. The lines are placed OUTSIDE the room shell:
  //   Width  — along the front-bottom edge, offset slightly below the floor
  //   Length — along the right-bottom edge, offset slightly outside the right wall
  //   Height — along the front-right vertical edge, offset slightly outside
  const dims = useMemo(() => {
    if (W <= 0 || L <= 0 || H <= 0) return null;
    const cam = cameraRef.current;
    const rend = rendererRef.current;
    if (!cam || !rend) return null;

    // Small offsets so dimension lines sit just outside the room shell.
    const offW = 0.35; // width line offset below floor (room Z = -0.35)
    const offL = 0.35; // length line offset beyond right wall (room X = W + 0.35)
    const offH = 0.35; // height line offset beyond front wall (room Y = -0.35)

    // Build 3D points (room X, room Z→Three.js Y, room Y→Three.js Z).
    const mk = (x, roomZ, roomY) => new Vector3(x, roomZ, roomY);

    // Width dimension: horizontal line below the front edge of the room.
    const wStart = mk(0, -offW, 0);
    const wEnd = mk(W, -offW, 0);
    const wLabel = mk(W / 2, -offW, 0);

    // Length dimension: horizontal line outside the right wall, along depth.
    const lStart = mk(W + offL, 0, 0);
    const lEnd = mk(W + offL, 0, L);
    const lLabel = mk(W + offL, 0, L / 2);

    // Height dimension: vertical line outside the front-right corner.
    const hStart = mk(W + offH, 0, -offH);
    const hEnd = mk(W + offH, H, -offH);
    const hLabel = mk(W + offH, H / 2, -offH);

    const proj = (p) => project(p, cam, rend);
    return {
      width: { start: proj(wStart), end: proj(wEnd), label: proj(wLabel), value: formatM(W) },
      length: { start: proj(lStart), end: proj(lEnd), label: proj(lLabel), value: formatM(L) },
      height: { start: proj(hStart), end: proj(hEnd), label: proj(hLabel), value: formatM(H) },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, L, H, tick]);

  if (!dims) return null;

  // Helper to render a dimension line with end ticks and a label.
  const renderDim = (key, d) => {
    if (!d?.start || !d?.end || !d?.label) return null;
    const { start, end, label, value } = d;
    // Tick mark length (perpendicular nubs at each end).
    const tickLen = 6;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len; // perpendicular
    const ny = dx / len;

    return (
      <g key={key}>
        {/* Main dimension line */}
        <line
          x1={start.x} y1={start.y} x2={end.x} y2={end.y}
          stroke={DIM_COLOR} strokeWidth={DIM_LINE_WIDTH}
        />
        {/* End ticks */}
        <line
          x1={start.x - nx * tickLen} y1={start.y - ny * tickLen}
          x2={start.x + nx * tickLen} y2={start.y + ny * tickLen}
          stroke={DIM_COLOR} strokeWidth={DIM_LINE_WIDTH}
        />
        <line
          x1={end.x - nx * tickLen} y1={end.y - ny * tickLen}
          x2={end.x + nx * tickLen} y2={end.y + ny * tickLen}
          stroke={DIM_COLOR} strokeWidth={DIM_LINE_WIDTH}
        />
        {/* Label — centered on the line, offset perpendicular for readability */}
        <text
          x={label.x + nx * 12}
          y={label.y - ny * 12 + 4}
          textAnchor="middle"
          style={TEXT_STYLE}
        >
          {value}
        </text>
      </g>
    );
  };

  return (
    <svg
      ref={overlayRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      {renderDim("width", dims.width)}
      {renderDim("length", dims.length)}
      {renderDim("height", dims.height)}
    </svg>
  );
}