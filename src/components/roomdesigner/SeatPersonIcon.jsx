// SeatPersonIcon.jsx
// Side elevation — clean technical cinema chair icon, no person silhouette.
//
// Reference dimensions (mm → metres):
//   Total depth:        980  = 0.98m
//   Main panel width:   880  = 0.88m
//   Feet span:          780  = 0.78m
//   Side arm height:    600  = 0.60m
//   Seat height:        420  = 0.42m
//   Rear back rise:     280  = 0.28m  (above 600mm side arm)
//   Headrest:           100  = 0.10m  (above 880mm level)
//   Round feet diam:     40  = 0.04m
//
// cx / cy  = listener EAR/HEAD centre — the immovable acoustic anchor.
//            Normally ~1.10m above floor/platform.
//            Chair headrest top sits just below this point (0.99m).
// scale    = px per metre.
// All vertical positions derived from baseY = cy + p(earToBaseM).

import React from "react";

const PRIMARY   = "#213428";
const SECONDARY = "#625143";
const NEUTRAL   = "#DCDBD6";
const BG        = "#F8F8F7";

const SW  = 1.2;                                        // single stroke weight
const PS  = { strokeLinecap: "round", strokeLinejoin: "round" };
const STR = PRIMARY;                                    // main outline colour
const FIL = NEUTRAL;                                    // main panel fill
const FIL2 = BG;                                       // lighter inner fill

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

  const p = (m) => m * scale;

  // Listener reference marker colour
  const dotFill = isRsp ? PRIMARY : SECONDARY;

  // ── Ear-to-floor distance ─────────────────────────────────────────────────
  const earToBaseM = Math.max(0.4, (earHeightM || 1.10) - (platformHeightM || 0));
  const baseY      = cy + p(earToBaseM);      // floor / platform surface

  // ══ VERTICAL KEY POSITIONS (from floor upward) ════════════════════════════
  const feetR        = p(0.020);              // foot radius = 40mm ÷ 2
  const feetBotY     = baseY;                 // feet on floor
  const feetTopY     = baseY - feetR * 2;

  const panelBotY    = feetTopY;              // main panel bottom
  const panelTopY    = baseY - p(0.600);      // side arm top = 600mm
  const seatLineY    = baseY - p(0.420);      // seat cushion top = 420mm

  const backBotY     = seatLineY;             // backrest extends down to seat line
  const backTopY     = baseY - p(0.880);      // 600 + 280 = 880mm
  const headTopY     = baseY - p(0.990);      // 880 + 100 + small gap ≈ 990mm

  // ══ HORIZONTAL KEY POSITIONS ═════════════════════════════════════════════
  // Person faces LEFT (toward screen). Rear of chair = SVG right side.
  //
  // cx sits above the headrest. The headrest top is approx at the ear level.
  // We offset the chair so the headrest rear is ~p(0.05) to the right of cx.
  const backRearX   = cx + p(0.08);           // rear face of chair (outermost)
  const chairFrontX = backRearX - p(0.98);    // front of chair = 980mm back
  const panelFrontX = chairFrontX;            // main panel front = chair front
  const panelRearX  = chairFrontX + p(0.88);  // main panel rear = 880mm

  // Feet positions (780mm span, centred under the 880mm panel)
  const foot1X = chairFrontX + p(0.10);       // front foot
  const foot2X = chairFrontX + p(0.88) - p(0.10); // rear foot

  // Backrest slab:
  //   Width = panelRearX → backRearX ≈ 0.10m
  //   It leans rearward by ~0.05m over 0.38m height
  const backLean  = p(0.040);
  const backFrontBot = panelRearX;            // front face at bottom
  const backRearBot  = backRearX;             // rear face at bottom
  // At headrest top, everything shifts rearward by backLean:
  const backFrontTop = backFrontBot + backLean;
  const backRearTop  = backRearBot  + backLean;

  // Headrest: slightly narrower, same lean continues
  const headExtraLean = p(0.012);
  const hBotFront = backFrontTop;
  const hBotRear  = backRearTop;
  const hTopFront = hBotFront + headExtraLean;
  const hTopRear  = hBotRear  + headExtraLean;

  // ── Main panel rounded-rect path ─────────────────────────────────────────
  // Large rounded rectangle for the sofa side panel.
  const rx = Math.max(2, p(0.025));    // corner radius ≈ 25mm
  const panelW  = panelRearX - panelFrontX;
  const panelH  = panelBotY  - panelTopY;

  // ── Backrest path (angled parallelogram) ─────────────────────────────────
  const backPath = [
    `M ${backFrontBot},${backBotY}`,
    `L ${backRearBot},${backBotY}`,
    `L ${backRearTop},${backTopY}`,
    `L ${backFrontTop},${backTopY}`,
    `Z`,
  ].join(" ");

  // ── Headrest path ────────────────────────────────────────────────────────
  const headPath = [
    `M ${hBotFront},${backTopY}`,
    `L ${hBotRear},${backTopY}`,
    `L ${hTopRear},${headTopY}`,
    `L ${hTopFront},${headTopY}`,
    `Z`,
  ].join(" ");

  // ── Seat-line indicator (subtle dashed line inside panel) ─────────────────
  // Shows the seat cushion top height — matches 420mm reference line.
  const seatLineX1 = panelFrontX + rx;
  const seatLineX2 = panelRearX  - rx * 0.5;

  return (
    <g>
      {/* ── Round feet ──────────────────────────────────────────────────── */}
      <circle
        cx={foot1X} cy={feetBotY - feetR}
        r={feetR}
        fill={FIL} stroke={STR} strokeWidth={SW}
      />
      <circle
        cx={foot2X} cy={feetBotY - feetR}
        r={feetR}
        fill={FIL} stroke={STR} strokeWidth={SW}
      />

      {/* ── Main side panel (large rounded rectangle) ───────────────────── */}
      <rect
        x={panelFrontX} y={panelTopY}
        width={panelW}  height={panelH}
        rx={rx} ry={rx}
        fill={FIL}
        stroke={STR}
        strokeWidth={SW}
        {...PS}
      />

      {/* ── Seat-height indicator line ───────────────────────────────────── */}
      <line
        x1={seatLineX1} y1={seatLineY}
        x2={seatLineX2} y2={seatLineY}
        stroke={SECONDARY}
        strokeWidth={SW * 0.6}
        strokeDasharray="2,2"
        opacity={0.45}
      />

      {/* ── Backrest slab ────────────────────────────────────────────────── */}
      <path
        d={backPath}
        fill={FIL}
        stroke={STR}
        strokeWidth={SW}
        {...PS}
      />

      {/* ── Headrest ─────────────────────────────────────────────────────── */}
      <path
        d={headPath}
        fill={FIL}
        stroke={STR}
        strokeWidth={SW}
        {...PS}
      />

      {/* ── Listener anchor dot at cx/cy (ear reference point) ───────────── */}
      <circle
        cx={cx} cy={cy}
        r={Math.max(1.8, p(0.018))}
        fill={dotFill}
        opacity={0.85}
      />

      {/* ── Row label ────────────────────────────────────────────────────── */}
      {label && (
        <text
          x={cx + p(0.025)}
          y={cy - p(0.030)}
          fontSize={Math.max(6, p(0.060))}
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