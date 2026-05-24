// SeatPersonIcon.jsx
// Simple cinema seat icon + round head — Side Elevation only.
//
// cx / cy  = SVG pixel coordinates of the listener HEAD CENTRE (immovable anchor).
// scale    = px per metre (drawH / roomHeightM).
// earHeightM, platformHeightM = vertical positioning (unchanged from original).
// All geometry anchors to cy (ear position).

import React from "react";

const PRIMARY   = "#213428";
const SECONDARY = "#625143";
const NEUTRAL   = "#DCDBD6";
const BG        = "#F8F8F7";

// Single consistent stroke weight
const SW = 1.1;

// SVG shared props
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

  const p   = (m) => m * scale;
  const str = isRsp ? PRIMARY : SECONDARY;
  const fil = isRsp ? "rgba(33,52,40,0.08)" : "rgba(98,81,67,0.12)";

  // Vertical grounding
  const earToBaseM = Math.max(0.4, (earHeightM || 1.10) - (platformHeightM || 0));
  const baseY      = cy + p(earToBaseM);

  // Head
  const headR = Math.max(5, Math.min(18, p(0.105)));

  // ── Simple seat geometry ──────────────────────────────────────────────────────
  // All measurements relative to cy anchor

  const plinthH    = p(0.070);
  const plinthTopY = baseY - plinthH;

  // Seat cushion
  const seatH      = p(0.135);
  const seatTopY   = baseY - plinthH - seatH;
  const seatBotY   = seatTopY + seatH;

  // Backrest (angled slightly)
  const backW      = p(0.18);
  const backH      = p(0.38);
  const backBotY   = seatTopY;
  const backTopY   = backBotY - backH;
  const backLean   = p(0.035);  // lean angle (rightward at top)

  // Horizontal positions
  const backRearX  = cx + p(0.08);
  const backFrontX = backRearX - backW;
  const seatLeftX  = backFrontX - p(0.32);
  const seatRightX = backRearX + p(0.05);
  const plinthLeftX  = seatLeftX - p(0.015);
  const plinthRightX = seatRightX + p(0.025);

  // ── Plinth / base ────────────────────────────────────────────────────────────
  const plinthPath = [
    `M ${plinthLeftX},${baseY}`,
    `L ${plinthRightX},${baseY}`,
    `L ${plinthRightX},${plinthTopY}`,
    `L ${plinthLeftX},${plinthTopY}`,
    `Z`,
  ].join(" ");

  // ── Seat cushion ─────────────────────────────────────────────────────────────
  const seatPath = [
    `M ${seatLeftX},${seatBotY}`,
    `L ${seatRightX},${seatBotY}`,
    `L ${seatRightX},${seatTopY}`,
    `L ${seatLeftX},${seatTopY}`,
    `Z`,
  ].join(" ");

  // ── Backrest (angled parallelogram) ──────────────────────────────────────────
  const backPath = [
    `M ${backFrontX},${backBotY}`,
    `L ${backRearX},${backBotY}`,
    `L ${backRearX + backLean},${backTopY}`,
    `L ${backFrontX + backLean},${backTopY}`,
    `Z`,
  ].join(" ");

  // ── Armrest accent ──────────────────────────────────────────────────────────
  // Small rounded bar at seat-back junction
  const armY   = seatTopY - p(0.025);
  const armH   = p(0.035);
  const armPath = [
    `M ${backFrontX},${armY + armH}`,
    `L ${backFrontX},${armY}`,
    `L ${backFrontX + backW * 0.6 + backLean * 0.4},${armY}`,
    `L ${backFrontX + backW * 0.6 + backLean * 0.4},${armY + armH}`,
    `Z`,
  ].join(" ");

  return (
    <g>
      {/* ── Plinth ──────────────────────────────────────────────────────────── */}
      <path
        d={plinthPath}
        fill={fil}
        stroke={str}
        strokeWidth={SW}
        {...PS}
      />

      {/* ── Seat cushion ────────────────────────────────────────────────────────*/}
      <path
        d={seatPath}
        fill={fil}
        stroke={str}
        strokeWidth={SW}
        {...PS}
      />

      {/* ── Backrest ────────────────────────────────────────────────────────────*/}
      <path
        d={backPath}
        fill={fil}
        stroke={str}
        strokeWidth={SW}
        {...PS}
      />

      {/* ── Armrest accent ──────────────────────────────────────────────────────*/}
      <path
        d={armPath}
        fill={fil}
        stroke={str}
        strokeWidth={SW * 0.9}
        {...PS}
        opacity={0.75}
      />

      {/* ── Head — perfect circle, centred at (cx, cy) ──────────────────────────*/}
      <circle
        cx={cx} cy={cy} r={headR}
        fill={BG}
        stroke={str}
        strokeWidth={SW}
      />

      {/* ── Ear anchor dot ─────────────────────────────────────────────────────*/}
      <circle
        cx={cx} cy={cy}
        r={Math.max(1.5, headR * 0.20)}
        fill={isRsp ? PRIMARY : SECONDARY}
        opacity={0.92}
      />

      {/* ── Row label ──────────────────────────────────────────────────────────*/}
      {label && (
        <text
          x={cx + headR + 4}
          y={cy + 3.5}
          fontSize={6.5}
          fill={PRIMARY}
          fontWeight={isRsp ? 700 : 500}
          letterSpacing="0.05em"
        >
          {label}
        </text>
      )}
    </g>
  );
}