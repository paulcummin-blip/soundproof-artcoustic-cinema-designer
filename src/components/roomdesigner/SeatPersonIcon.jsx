// SeatPersonIcon.jsx
// Artcoustic-style simplified cinema seat + person icon.
// Currently supports: view="side" (Side Elevation).
// cx / cy  = SVG pixel coordinates of the listener EAR/HEAD CENTRE.
// scale    = px per metre (drawH / roomH).
// earHeightM    = ear height above floor/platform in metres (default 1.10).
// platformHeightM = platform top surface height above floor in metres (default 0).
// The head circle is centred exactly at (cx, cy). Nothing extends above cy except
// the top arc of the head circle, ensuring the ear-height line bisects the head.

import React from "react";

const PRIMARY   = "#213428";
const SECONDARY = "#625143";
const NEUTRAL   = "#DCDBD6";

export default function SeatPersonIcon({
  cx,
  cy,
  scale,
  earHeightM    = 1.10,
  platformHeightM = 0,
  label,
  isRsp = false,
  view  = "side",
}) {
  // Only side elevation implemented for now
  if (view !== "side") return null;

  const stroke = isRsp ? PRIMARY : SECONDARY;
  const sw     = isRsp ? 1.4 : 1.0;

  // Convert metres → SVG pixels
  const p = (m) => m * scale;

  // Ear-to-base height in metres (distance from ear down to floor/platform)
  const earToBaseM = Math.max(0.4, (earHeightM || 1.10) - (platformHeightM || 0));

  // ── Head ──────────────────────────────────────────────────────────────────
  // Radius proportional to scale, clamped for legibility
  const headR = Math.max(5, Math.min(18, p(0.105)));

  // ── Vertical key positions (Y increases downward in SVG) ─────────────────
  // All derived from cy (ear anchor) using real-world proportions
  const neckBotY  = cy + p(0.09);   // neck base
  const shoulderY = cy + p(0.17);   // top of seat back / shoulder level
  const torsoEndY = cy + p(0.50);   // where torso meets seat cushion
  const seatTopY  = torsoEndY;
  const seatBotY  = cy + p(0.62);   // bottom of seat cushion
  const baseY     = cy + p(earToBaseM); // floor / platform surface (accurate)
  const baseThick = p(0.06);

  // ── Horizontal bounds ─────────────────────────────────────────────────────
  // SVG convention: LEFT = toward screen (front), RIGHT = rear of room
  const backW  = p(0.20);   // seat back thickness (front-to-back)
  const cushW  = p(0.42);   // seat cushion depth  (front-to-back)
  // Seat back right edge sits slightly behind head centre
  const backRightX = cx + p(0.07);
  const backLeftX  = backRightX - backW;
  // Cushion left (front) edge extends toward screen
  const cushLeftX  = backLeftX - (cushW - backW);
  const fullW      = cushW + backW * 0.3;

  return (
    <g>
      {/* ── Seat base / feet ─────────────────────────────────────── */}
      <rect
        x={cushLeftX}
        y={baseY - baseThick}
        width={fullW}
        height={baseThick}
        fill={NEUTRAL}
        stroke={stroke}
        strokeWidth={sw * 0.8}
        rx={1}
      />

      {/* ── Seat cushion (horizontal) ────────────────────────────── */}
      <rect
        x={cushLeftX}
        y={seatTopY}
        width={cushW}
        height={seatBotY - seatTopY}
        fill={NEUTRAL}
        stroke={stroke}
        strokeWidth={sw}
        rx={2}
      />

      {/* ── Seat back (vertical) ─────────────────────────────────── */}
      <rect
        x={backLeftX}
        y={shoulderY}
        width={backW}
        height={seatBotY - shoulderY}
        fill={NEUTRAL}
        stroke={stroke}
        strokeWidth={sw}
        rx={2}
      />

      {/* ── Headrest (top of seat back, behind head) ─────────────── */}
      <rect
        x={backLeftX + p(0.01)}
        y={cy - headR + p(0.04)}
        width={backW * 0.65}
        height={p(0.16)}
        fill={NEUTRAL}
        stroke={stroke}
        strokeWidth={sw * 0.7}
        rx={1.5}
      />

      {/* ── Torso ────────────────────────────────────────────────── */}
      <line
        x1={cx}
        y1={neckBotY}
        x2={backLeftX + backW * 0.45}
        y2={seatTopY}
        stroke={stroke}
        strokeWidth={Math.max(2, p(0.065))}
        strokeLinecap="round"
        opacity={0.45}
      />

      {/* ── Head circle — ANCHOR at (cx, cy) ─────────────────────── */}
      <circle
        cx={cx}
        cy={cy}
        r={headR}
        fill={NEUTRAL}
        stroke={stroke}
        strokeWidth={isRsp ? 1.6 : 1.1}
      />

      {/* ── Ear dot at exact ear/head anchor ─────────────────────── */}
      <circle
        cx={cx}
        cy={cy}
        r={Math.max(1.5, headR * 0.20)}
        fill={stroke}
        opacity={0.75}
      />

      {/* ── Label ────────────────────────────────────────────────── */}
      {label && (
        <text
          x={cx + headR + 5}
          y={cy + 3}
          fontSize={7.5}
          fill={PRIMARY}
          fontWeight={isRsp ? 700 : 500}
          letterSpacing="0.03em"
        >
          {label}
        </text>
      )}
    </g>
  );
}