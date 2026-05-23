// SeatPersonIcon.jsx
// Premium architectural CAD silhouette — Side Elevation only.
//
// cx / cy  = SVG pixel coordinates of the listener EAR/HEAD CENTRE.
//            This is the immovable geometric anchor. Everything derives from it.
// scale    = px per metre (drawH / roomHeightM from SideElevation).
// All vertical geometry radiates DOWNWARD from cy.
// Person faces LEFT (toward screen in SVG space).

import React from "react";

const PRIMARY   = "#213428";
const SECONDARY = "#625143";
const NEUTRAL   = "#DCDBD6";
const BG        = "#F8F8F7";

// ── One consistent stroke weight throughout ───────────────────────────────────
const SW = 1.1;

// Shared SVG presentation (applied to every path / circle)
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

  // Fills: chair body gets visual mass, person silhouette slightly lighter
  const chairFill  = isRsp ? "rgba(33,52,40,0.10)"  : "rgba(98,81,67,0.09)";
  const bodyFill   = isRsp ? "rgba(33,52,40,0.22)"  : "rgba(98,81,67,0.19)";

  // Ear-to-floor/platform height → controls vertical grounding
  const earToBaseM = Math.max(0.4, (earHeightM || 1.10) - (platformHeightM || 0));

  // ── Head radius — clamped for small/large scale legibility ───────────────────
  const headR = Math.max(5, Math.min(18, p(0.105)));

  // ══ VERTICAL KEY POSITIONS (all downward from cy) ═══════════════════════════
  const baseY      = cy + p(earToBaseM);   // floor / platform surface
  const plinthH    = p(0.075);
  const plinthTopY = baseY - plinthH;
  const seatBotY   = cy + p(0.63);         // underside of seat cushion
  const seatTopY   = cy + p(0.49);         // top surface of seat cushion
  const cushH      = seatBotY - seatTopY;
  const shoulderY  = cy + p(0.17);         // shoulder / top of backrest slab
  const backTopY   = cy + p(0.045);        // headrest top (just below head centre)

  // ══ HORIZONTAL KEY POSITIONS ═════════════════════════════════════════════════
  // Person faces LEFT (screen side). Rear = SVG right.
  const lean        = p(0.050);             // backrest recline lean (rightward at top)
  const backW       = p(0.210);             // backrest slab thickness
  const cushW       = p(0.450);             // seat cushion depth (front-to-back)

  const backRearX   = cx + p(0.095);        // rear face of backrest at seat level
  const backFrontX  = backRearX - backW;    // front face of backrest at seat level
  const cushFrontX  = backFrontX - cushW;   // front edge of seat cushion
  const plinthFrontX = cushFrontX - p(0.018);
  const plinthRearX  = backRearX  + p(0.040);

  // ══ CHAIR SILHOUETTE — single closed path ════════════════════════════════════
  //
  // Traced clockwise starting from plinth front-bottom.
  // Rear face runs straight up; backrest angles rearward (lean) as it rises.
  // Headrest top is gently curved.  Seat-to-back junction is a smooth Q arc.
  // Seat front edge is rounded. The entire shape is one SVG fill = visual mass.
  //
  const chairPath = [
    // ── Plinth bottom edge ───────────────────────────────────────────────────
    `M ${plinthFrontX},${baseY}`,
    `L ${plinthRearX},${baseY}`,
    // ── Rear face up to backrest ─────────────────────────────────────────────
    `L ${plinthRearX},${seatBotY}`,
    `L ${backRearX},${seatBotY}`,
    // ── Angled rear face of backrest rising to headrest ──────────────────────
    `L ${backRearX + lean},${backTopY}`,
    // ── Curve over headrest top ───────────────────────────────────────────────
    `Q ${backRearX + lean * 0.4},${backTopY - p(0.045)} ${backFrontX + lean * 0.85},${backTopY - p(0.018)}`,
    // ── Angled front face of headrest / backrest down to seat junction ────────
    `L ${backFrontX + lean},${backTopY}`,
    `L ${backFrontX},${seatBotY}`,
    // ── Smooth curve from back into seat top surface ─────────────────────────
    `Q ${backFrontX - p(0.01)},${seatTopY + cushH * 0.15} ${backFrontX - p(0.035)},${seatTopY}`,
    // ── Seat top surface toward front ────────────────────────────────────────
    `L ${cushFrontX + p(0.028)},${seatTopY}`,
    // ── Rounded front-top corner of seat ────────────────────────────────────
    `Q ${cushFrontX},${seatTopY} ${cushFrontX},${seatTopY + p(0.030)}`,
    // ── Seat front face ──────────────────────────────────────────────────────
    `L ${cushFrontX},${seatBotY - p(0.022)}`,
    // ── Rounded front-bottom corner of seat ─────────────────────────────────
    `Q ${cushFrontX},${seatBotY} ${cushFrontX + p(0.022)},${seatBotY}`,
    // ── Seat underside back to plinth top ───────────────────────────────────
    `L ${plinthFrontX},${seatBotY}`,
    // ── Plinth front face back to start ─────────────────────────────────────
    `L ${plinthFrontX},${baseY}`,
    `Z`,
  ].join(" ");

  // ── Armrest — thin integrated protrusion at the seat/backrest junction ───────
  // Reads as a subtle rail rather than a separate block.
  const armY   = seatTopY - p(0.030);
  const armH   = p(0.042);
  const armPath = [
    `M ${backFrontX - p(0.005)},${armY + armH}`,
    `L ${backFrontX + p(0.005)},${armY}`,
    `L ${backFrontX + backW * 0.55 + lean * 0.5},${armY}`,
    `Q ${backFrontX + backW * 0.55 + lean * 0.5 + p(0.02)},${armY} ${backFrontX + backW * 0.55 + lean * 0.5 + p(0.02)},${armY + armH * 0.5}`,
    `L ${backFrontX + p(0.005) + p(0.02)},${armY + armH}`,
    `Z`,
  ].join(" ");

  // ══ BODY SILHOUETTE — single closed path ═════════════════════════════════════
  //
  // Natural reclined cinema posture. Spine tilts with chair lean.
  // Front edge curves outward (shoulder forward); rear edge rests on backrest.
  // Thighs extend toward the screen (left).
  // Body is a FILLED silhouette — no stick-figure lines.
  //
  const neckW       = p(0.035);   // half-width at neck
  const shFwdProj   = p(0.038);   // how far the front shoulder projects forward
  const torsoW      = p(0.060);   // half-width of torso mid-point

  // Spine centre at hip (where back meets seat), follows backrest lean
  const hipX        = backFrontX + lean * 0.45 + backW * 0.50;
  const hipY        = seatTopY + cushH * 0.18;

  // Thigh end (front of visible thigh on seat)
  const thighEndX   = cushFrontX + p(0.18);
  const thighTopY   = seatTopY + cushH * 0.20;
  const thighBotY   = seatTopY + cushH * 0.60;

  const bodyPath = [
    // ── Front (screen-side) edge ─────────────────────────────────────────────
    // Start: front of neck base
    `M ${cx - neckW},${cy + headR + p(0.008)}`,
    // Front shoulder projection (curves outward toward screen)
    `C ${cx - neckW - shFwdProj},${shoulderY} ${hipX - torsoW},${hipY - p(0.12)} ${hipX - torsoW},${hipY}`,
    // Hip front → transition onto thigh (nearly horizontal)
    `C ${hipX - torsoW - p(0.02)},${hipY + p(0.03)} ${thighEndX + p(0.02)},${thighTopY} ${thighEndX},${thighTopY}`,
    // ── Thigh end (leg tip, near front of seat) ──────────────────────────────
    `Q ${thighEndX - p(0.025)},${(thighTopY + thighBotY) * 0.5} ${thighEndX},${thighBotY}`,
    // ── Rear (backrest-side) edge ─────────────────────────────────────────────
    // Back along underside of thigh → hip rear
    `C ${thighEndX + p(0.02)},${thighBotY} ${hipX + torsoW * 0.3},${hipY + cushH * 0.15} ${hipX + torsoW * 0.3},${hipY}`,
    // Hip rear → shoulder rear (follows backrest lean, curves gently)
    `C ${hipX + torsoW * 0.3},${hipY - p(0.10)} ${cx + neckW + p(0.008)},${shoulderY + p(0.02)} ${cx + neckW},${cy + headR + p(0.008)}`,
    // ── Close at rear of neck base ───────────────────────────────────────────
    `Z`,
  ].join(" ");

  return (
    <g>
      {/* ── CHAIR SILHOUETTE — single flowing shape ──────────────────────── */}
      <path
        d={chairPath}
        fill={chairFill}
        stroke={str}
        strokeWidth={SW}
        {...PS}
      />

      {/* ── ARMREST — subtle integrated rail ─────────────────────────────── */}
      <path
        d={armPath}
        fill={chairFill}
        stroke={str}
        strokeWidth={SW * 0.85}
        {...PS}
        opacity={0.80}
      />

      {/* ── BODY SILHOUETTE — natural reclined posture ────────────────────── */}
      <path
        d={bodyPath}
        fill={bodyFill}
        stroke={str}
        strokeWidth={SW}
        {...PS}
      />

      {/* ── HEAD — perfect circle, ALWAYS centred at (cx, cy) ─────────────── */}
      <circle
        cx={cx} cy={cy} r={headR}
        fill={BG}
        stroke={str}
        strokeWidth={SW}
      />

      {/* ── EAR ANCHOR DOT — precise filled accent at the immovable anchor ── */}
      <circle
        cx={cx} cy={cy}
        r={Math.max(1.5, headR * 0.20)}
        fill={isRsp ? PRIMARY : SECONDARY}
        opacity={0.92}
      />

      {/* ── LABEL ─────────────────────────────────────────────────────────── */}
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