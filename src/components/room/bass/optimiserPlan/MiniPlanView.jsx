// MiniPlanView.jsx
// ---------------------------------------------------------------------------
// A compact plan-view SVG showing subwoofer positions inside the room outline.
// Pure presentation — reads subwoofer instance coordinates and room dimensions
// and draws dots. No calculation, no state.
// ---------------------------------------------------------------------------

import React from "react";

/**
 * @param {object} props
 * @param {Array}  props.subwooferInstances — [{ position: { x, y }, ... }]
 * @param {object} props.roomDims — { widthM, lengthM } (meters)
 * @param {number} props.size — SVG pixel size (default 56)
 */
export default function MiniPlanView({
  subwooferInstances = [],
  roomDims = null,
  size = 56,
}) {
  const subs = Array.isArray(subwooferInstances) ? subwooferInstances : [];
  const widthM = Number(roomDims?.widthM) || 6;
  const lengthM = Number(roomDims?.lengthM) || 4.5;
  const pad = 6;
  const inner = size - pad * 2;
  const scaleX = inner / widthM;
  const scaleY = inner / lengthM;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Room outline */}
      <rect
        x={pad}
        y={pad}
        width={inner}
        height={inner}
        fill="#F8F8F7"
        stroke="#C1B6AD"
        strokeWidth="1"
        rx="2"
      />
      {/* Screen wall indicator (top edge) */}
      <line
        x1={pad}
        y1={pad}
        x2={pad + inner}
        y2={pad}
        stroke="#213428"
        strokeWidth="2"
      />
      {/* Subwoofer dots */}
      {subs.map((inst, i) => {
        const x = pad + (Number(inst.position?.x) || 0) * scaleX;
        const y = pad + (Number(inst.position?.y) || 0) * scaleY;
        if (x < pad || x > size - pad || y < pad || y > size - pad) return null;
        return (
          <circle
            key={inst.id || i}
            cx={x}
            cy={y}
            r="2.5"
            fill="#213428"
            stroke="#FFFFFF"
            strokeWidth="0.5"
          />
        );
      })}
    </svg>
  );
}