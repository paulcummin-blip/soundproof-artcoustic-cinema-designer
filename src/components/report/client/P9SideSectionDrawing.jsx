/**
 * P9SideSectionDrawing
 * --------------------
 * THE P9 side section: the real room section (floor, ceiling, screen direction,
 * rear direction), the real overhead rows at their real installed positions, the
 * real RSP, and the P9 adjacent-row angles measured from that RSP.
 *
 * Shared by the screen page (ClientP9Overhead) and the print page
 * (PrintP9Content) so the two can never drift apart.
 *
 * Every ray and every arc originates at the RSP. No speaker is moved to make an
 * angle readable. P9 itself remains seat-scoped — this drawing explains the RSP
 * geometry and the per-seat authority is untouched.
 */

import React from "react";
import { getSeatGradeColors } from "./visualReportSeatStyle";
import { P9_SIDE_FONT_FAMILY } from "./p9SideSectionGeometry";

const MUTED = "#625143";
const INK = "#3E4349";
const LIMITING_INK = "#4A230F";
const RSP_INK = "#213428";
const ROOM_EDGE = "#C1B6AD";

const CHIP_W = 152;
const CHIP_H = 54;
const LIMITING_TITLE = "LARGEST ADJACENT GAP";
const CHIP_SCOPE = "measured from the RSP";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Published P9 levels arrive as L4 or 4 (or Fail); the chip shows a level label. */
function normaliseLevelLabel(level) {
  if (level === 0) return "FAIL";
  const raw = String(level ?? "").trim().toUpperCase();
  if (/^[1-4]$/.test(raw)) return `L${raw}`;
  if (/^L[1-4]$/.test(raw)) return raw;
  if (raw === "FAIL") return "FAIL";
  if (raw === "N/A" || raw === "NA") return "N/A";
  return null;
}

export default function P9SideSectionDrawing({ geometry, levelLabel, className, style }) {
  if (!geometry) return null;

  const { svgW, svgH, toPx, lengthM, heightM, rsp, rays, gaps, limitingGap } = geometry;

  const floorLeft = toPx(0, 0);
  const floorRight = toPx(lengthM, 0);
  const ceilingLeft = toPx(0, heightM);
  const ceilingRight = toPx(lengthM, heightM);
  const frontWallTop = ceilingLeft;
  const frontWallBottom = floorLeft;
  const rearWallTop = ceilingRight;
  const rearWallBottom = floorRight;

  const levelText = normaliseLevelLabel(levelLabel);
  const grade = levelText ? getSeatGradeColors(levelText) : null;

  const chip = limitingGap
    ? {
      x: clamp(limitingGap.chipPx.x, CHIP_W / 2 + 8, svgW - CHIP_W / 2 - 8),
      y: clamp(limitingGap.chipPx.y, CHIP_H + 12, svgH - 12),
    }
    : null;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className={className}
      style={style}
      role="img"
      aria-label="P9 side section: overhead speaker rows and the vertical angles between them, measured from the reference seating position"
    >
      <rect width={svgW} height={svgH} fill="#F8F8F7" rx="12" />

      {/* ── Room section: floor, ceiling, screen direction, rear direction ── */}
      <line x1={floorLeft.px} y1={floorLeft.py} x2={floorRight.px} y2={floorRight.py} stroke={ROOM_EDGE} strokeWidth={2} />
      <text x={floorLeft.px + 4} y={floorLeft.py + 16} fill={MUTED} fontSize={10} fontFamily={P9_SIDE_FONT_FAMILY} letterSpacing="0.08em">
        FLOOR
      </text>

      <line x1={ceilingLeft.px} y1={ceilingLeft.py} x2={ceilingRight.px} y2={ceilingRight.py} stroke={ROOM_EDGE} strokeWidth={2} strokeDasharray="6 4" />
      <text x={ceilingRight.px - 4} y={ceilingLeft.py - 8} fill={MUTED} fontSize={10} textAnchor="end" fontFamily={P9_SIDE_FONT_FAMILY} letterSpacing="0.08em">
        CEILING
      </text>

      <line x1={frontWallTop.px} y1={frontWallTop.py} x2={frontWallBottom.px} y2={frontWallBottom.py} stroke={ROOM_EDGE} strokeWidth={2} />
      <line x1={rearWallTop.px} y1={rearWallTop.py} x2={rearWallBottom.px} y2={rearWallBottom.py} stroke={ROOM_EDGE} strokeWidth={2} />

      <text x={frontWallTop.px + 6} y={(frontWallTop.py + frontWallBottom.py) / 2} fill={MUTED} fontSize={10} fontFamily={P9_SIDE_FONT_FAMILY} letterSpacing="0.06em">
        SCREEN
      </text>
      <text x={rearWallTop.px - 6} y={(rearWallTop.py + rearWallBottom.py) / 2} fill={MUTED} fontSize={10} textAnchor="end" fontFamily={P9_SIDE_FONT_FAMILY} letterSpacing="0.06em">
        REAR
      </text>

      {/* ── Rays: RSP → each overhead row's real acoustic centre ── */}
      {rays.map((ray) => (
        <line
          key={`p9-ray-${ray.rowName}`}
          x1={rsp.px.px}
          y1={rsp.px.py}
          x2={ray.px.px}
          y2={ray.px.py}
          stroke={ray.color}
          strokeWidth={1.6}
          strokeOpacity={0.4}
        />
      ))}

      {/* ── Real installed overhead speakers, at their real positions ── */}
      {rays.map((ray) => (
        <g key={`p9-row-speakers-${ray.rowName}`}>
          {ray.speakers.map((spk) => (
            <circle
              key={`${ray.rowName}-${spk.px.px.toFixed(1)}-${spk.px.py.toFixed(1)}`}
              cx={spk.px.px}
              cy={spk.px.py}
              r={7}
              fill={ray.color}
              stroke="#F8F8F7"
              strokeWidth={1.5}
            />
          ))}
        </g>
      ))}

      {/* ── Angular arcs: adjacent rows only, all centred on the RSP ── */}
      {gaps.map((gap) => (
        <path
          key={`p9-gap-${gap.fromRowName}-${gap.toRowName}`}
          d={gap.path}
          fill="none"
          stroke={gap.isLimiting ? LIMITING_INK : MUTED}
          strokeWidth={gap.isLimiting ? 3 : 1.5}
          strokeOpacity={gap.isLimiting ? 0.95 : 0.55}
          strokeDasharray={gap.isLimiting ? "6 4" : "4 4"}
        />
      ))}

      {/* ── Row labels: role pair + that row's actual angle from the RSP ── */}
      {rays.map((ray) => (
        <g key={`p9-row-label-${ray.rowName}`}>
          <text
            x={ray.px.px}
            y={ray.px.py - 24}
            fill={ray.color}
            fontSize={10}
            textAnchor="middle"
            fontFamily={P9_SIDE_FONT_FAMILY}
            letterSpacing="0.06em"
          >
            {ray.roleLabel}
          </text>
          <text
            x={ray.px.px}
            y={ray.px.py - 12}
            fill={MUTED}
            fontSize={9}
            textAnchor="middle"
            fontFamily={P9_SIDE_FONT_FAMILY}
          >
            {`${Math.round(ray.elevDeg)}° from RSP`}
          </text>
        </g>
      ))}

      {/* ── Adjacent-row gap values: the P9 quantities ── */}
      {gaps.map((gap) => (
        <g key={`p9-gap-label-${gap.fromRowName}-${gap.toRowName}`}>
          <text
            x={gap.degreesPx.x}
            y={gap.degreesPx.y}
            fill={gap.isLimiting ? LIMITING_INK : INK}
            fontSize={gap.isLimiting ? 15 : 12}
            fontWeight={gap.isLimiting ? 700 : 600}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={P9_SIDE_FONT_FAMILY}
          >
            {`${Math.round(gap.deg)}°`}
          </text>
          <text
            x={gap.pairPx.x}
            y={gap.pairPx.y}
            fill={gap.isLimiting ? LIMITING_INK : MUTED}
            fontSize={9}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={P9_SIDE_FONT_FAMILY}
            letterSpacing="0.08em"
          >
            {gap.label}
          </text>
        </g>
      ))}

      {/* ── The limiting gap, stated ── */}
      {chip && (
        <g>
          <rect
            x={chip.x - CHIP_W / 2}
            y={chip.y - CHIP_H + 10}
            width={CHIP_W}
            height={CHIP_H}
            rx={6}
            fill="#FFFFFF"
            stroke={LIMITING_INK}
            strokeWidth={1.5}
          />
          <text
            x={chip.x}
            y={chip.y - CHIP_H + 24}
            fill={LIMITING_INK}
            fontSize={8.5}
            textAnchor="middle"
            fontFamily={P9_SIDE_FONT_FAMILY}
            letterSpacing="0.12em"
          >
            {LIMITING_TITLE}
          </text>
          <text
            x={chip.x - (grade ? 24 : 0)}
            y={chip.y - CHIP_H + 42}
            fill={LIMITING_INK}
            fontSize={15}
            fontWeight={700}
            textAnchor="middle"
            fontFamily={P9_SIDE_FONT_FAMILY}
          >
            {`${Math.round(limitingGap.deg)}°`}
          </text>
          {grade && (
            <>
              <rect
                x={chip.x + 4}
                y={chip.y - CHIP_H + 31}
                width={38}
                height={16}
                rx={4}
                fill={grade.fill}
                stroke={grade.border}
                strokeWidth={1}
              />
              <text
                x={chip.x + 23}
                y={chip.y - CHIP_H + 42.5}
                fill={grade.text}
                fontSize={10}
                fontWeight={600}
                textAnchor="middle"
                fontFamily={P9_SIDE_FONT_FAMILY}
              >
                {levelText}
              </text>
            </>
          )}
          <text
            x={chip.x}
            y={chip.y - CHIP_H + 56}
            fill={MUTED}
            fontSize={7.5}
            textAnchor="middle"
            fontFamily={P9_SIDE_FONT_FAMILY}
            letterSpacing="0.06em"
          >
            {CHIP_SCOPE}
          </text>
        </g>
      )}

      {/* ── RSP at its real position and ear height ── */}
      <g>
        <circle cx={rsp.px.px} cy={rsp.px.py} r={10} fill="none" stroke={RSP_INK} strokeWidth={2} />
        <circle cx={rsp.px.px} cy={rsp.px.py} r={4} fill={RSP_INK} />
        <text
          x={rsp.px.px - 14}
          y={rsp.px.py + 1}
          fill={RSP_INK}
          fontSize={11}
          fontWeight={600}
          textAnchor="end"
          dominantBaseline="middle"
          fontFamily={P9_SIDE_FONT_FAMILY}
          letterSpacing="0.08em"
        >
          RSP
        </text>
        <text
          x={rsp.px.px - 14}
          y={rsp.px.py + 14}
          fill={MUTED}
          fontSize={8.5}
          textAnchor="end"
          dominantBaseline="middle"
          fontFamily={P9_SIDE_FONT_FAMILY}
        >
          {`${rsp.z.toFixed(2)} m ear height`}
        </text>
      </g>
    </svg>
  );
}