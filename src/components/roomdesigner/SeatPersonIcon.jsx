// SeatPersonIcon.jsx
// Premium architectural CAD-style cinema seat + person — Side Elevation.
// cx / cy  = SVG pixel coordinates of the listener EAR/HEAD CENTRE (anchor, never moves).
// scale    = px per metre (drawH / roomH).
// earHeightM      = ear height above floor/platform in metres (default 1.10).
// platformHeightM = platform top surface height in metres (default 0).
// All geometry radiates downward from cy. Nothing renders above cy except the
// top arc of the head circle, keeping the ear-height guide line centred on the head.

import React from "react";

const PRIMARY   = "#213428";
const SECONDARY = "#625143";
const NEUTRAL   = "#DCDBD6";
const BG        = "#F8F8F7";

// ── Single consistent stroke weight ──────────────────────────────────────────
const SW = 1.2;

// Common SVG presentation for all path/line/rect shapes
const PS = { strokeLinecap: "round", strokeLinejoin: "round" };

export default function SeatPersonIcon({
  cx,
  cy,
  scale,
  earHeightM      = 1.10,
  platformHeightM = 0,
  label,
  isRsp           = false,
  view            = "side",
}) {
  if (view !== "side") return null;

  // Convert metres → SVG pixels
  const p = (m) => m * scale;

  const stroke   = isRsp ? PRIMARY : SECONDARY;
  const seatFill = isRsp ? "rgba(33,52,40,0.06)" : "rgba(220,219,214,0.50)";

  // Ear-to-platform/floor height (drives accurate vertical grounding)
  const earToBaseM = Math.max(0.4, (earHeightM || 1.10) - (platformHeightM || 0));

  // ── Head ──────────────────────────────────────────────────────────────────
  const headR = Math.max(5, Math.min(18, p(0.105)));

  // ── Vertical key positions ────────────────────────────────────────────────
  // Y increases downward in SVG. All derived from cy (ear anchor).
  const neckTopY  = cy + headR;            // base of head circle
  const neckBotY  = cy + p(0.09);         // neck ends here
  const shoulderY = cy + p(0.17);         // top of seat back
  const seatTopY  = cy + p(0.49);         // top of seat cushion
  const seatBotY  = cy + p(0.61);         // bottom of seat cushion
  const plinthH   = p(0.055);
  const baseY     = cy + p(earToBaseM);   // floor / platform surface

  // ── Horizontal anchors ────────────────────────────────────────────────────
  // SVG left = toward screen (front), SVG right = rear of room.
  // Person faces LEFT.
  const backW      = p(0.185);
  const cushW      = p(0.395);
  const lean       = p(0.042);            // backrest lean rearward (~10°)

  const backRightX  = cx + p(0.08);
  const backLeftX   = backRightX - backW;
  const cushRightX  = backLeftX + backW * 0.28;
  const cushLeftX   = cushRightX - cushW;

  // Armrest bar
  const armH     = p(0.038);
  const armY     = seatTopY - armH * 0.5;
  const armLeftX = backLeftX - p(0.01);
  const armW     = backW + p(0.04);

  // Plinth (full base at floor)
  const plinthLeftX  = cushLeftX  - p(0.02);
  const plinthRightX = backRightX + p(0.04);

  // ── Backrest path — parallelogram (angled ~10° rearward) ─────────────────
  // Bottom corners are at seatBotY; top corners lean right by `lean`.
  const backPath = [
    `M ${backLeftX},${seatBotY}`,
    `L ${backRightX},${seatBotY}`,
    `L ${backRightX + lean},${shoulderY}`,
    `L ${backLeftX  + lean},${shoulderY}`,
    `Z`,
  ].join(" ");

  // ── Headrest — sits at top of angled back, leaned same amount ────────────
  const hrLeft  = backLeftX  + lean * 0.85;
  const hrRight = hrLeft + backW * 0.60;
  const hrTop   = cy - headR + p(0.04);
  const hrBot   = hrTop + p(0.13);
  const headrestPath = [
    `M ${hrLeft},${hrBot}`,
    `L ${hrRight},${hrBot}`,
    `L ${hrRight + lean * 0.15},${hrTop}`,
    `L ${hrLeft  + lean * 0.15},${hrTop}`,
    `Z`,
  ].join(" ");

  // ── Torso — smooth cubic curve from neck to seat ──────────────────────────
  const torsoEndX = backLeftX + lean * 0.5 + backW * 0.42;
  const torsoPath = `M ${cx},${neckBotY} C ${cx},${shoulderY + p(0.08)} ${torsoEndX},${seatTopY - p(0.04)} ${torsoEndX},${seatTopY}`;

  return (
    <g>
      {/* ── Plinth / base ───────────────────────────────────────────────── */}
      <rect
        x={plinthLeftX} y={baseY - plinthH}
        width={plinthRightX - plinthLeftX} height={plinthH}
        fill={seatFill} stroke={stroke} strokeWidth={SW}
        rx={1.5} {...PS}
      />

      {/* ── Seat cushion ─────────────────────────────────────────────────── */}
      <rect
        x={cushLeftX} y={seatTopY}
        width={cushW} height={seatBotY - seatTopY}
        fill={seatFill} stroke={stroke} strokeWidth={SW}
        rx={2.5} {...PS}
      />

      {/* ── Backrest (angled parallelogram) ──────────────────────────────── */}
      <path
        d={backPath}
        fill={seatFill} stroke={stroke} strokeWidth={SW}
        {...PS}
      />

      {/* ── Headrest ─────────────────────────────────────────────────────── */}
      <path
        d={headrestPath}
        fill={seatFill} stroke={stroke} strokeWidth={SW}
        {...PS}
      />

      {/* ── Armrest ──────────────────────────────────────────────────────── */}
      <rect
        x={armLeftX} y={armY}
        width={armW} height={armH}
        fill={seatFill} stroke={stroke} strokeWidth={SW}
        rx={armH / 2} {...PS}
      />

      {/* ── Neck ─────────────────────────────────────────────────────────── */}
      <line
        x1={cx} y1={neckTopY}
        x2={cx} y2={neckBotY}
        stroke={stroke} strokeWidth={SW}
        strokeLinecap="round"
      />

      {/* ── Torso curve ──────────────────────────────────────────────────── */}
      <path
        d={torsoPath}
        fill="none" stroke={stroke} strokeWidth={SW}
        opacity={0.55} {...PS}
      />

      {/* ── Head — ANCHOR at (cx, cy), BG fill for clean legibility ─────── */}
      <circle
        cx={cx} cy={cy} r={headR}
        fill={BG} stroke={stroke} strokeWidth={SW}
      />

      {/* ── Ear accent dot — precise filled circle at anchor ─────────────── */}
      <circle
        cx={cx} cy={cy}
        r={Math.max(1.5, headR * 0.18)}
        fill={isRsp ? PRIMARY : SECONDARY}
        opacity={0.90}
      />

      {/* ── Row label ────────────────────────────────────────────────────── */}
      {label && (
        <text
          x={cx + headR + 5}
          y={cy + 3}
          fontSize={7}
          fill={PRIMARY}
          fontWeight={isRsp ? 700 : 500}
          letterSpacing="0.04em"
        >
          {label}
        </text>
      )}
    </g>
  );
}