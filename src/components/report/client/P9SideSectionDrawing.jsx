/**
 * P9SideSectionDrawing
 * --------------------
 * THE P9 side section: "how P9 is measured".
 *
 * The real room section (floor, ceiling, screen direction, rear direction), the
 * real overhead rows at their real installed positions, and — for a real front
 * seating row point and a real rear seating row point — the rays to those rows
 * with one translucent wedge per ADJACENT row pair. The largest adjacent gap for
 * each row carries the heavier outline; the row's published result is labelled
 * beneath its own listening point.
 *
 * Shared by the screen page (ClientP9Overhead) and the print page
 * (PrintP9Content) so the two can never drift apart.
 *
 * No speaker is moved to make an angle readable and no RSP fan is drawn: P9 is
 * seat-scoped, and the per-seat authority is untouched.
 */

import React from "react";
import { getSeatGradeColors } from "./visualReportSeatStyle";
import {
  P9_SIDE_FONT_FAMILY,
  P9_WEDGE_FILL_OPACITY,
  P9_WEDGE_LIMITING_INK,
  P9_VIEW_CHIP_H,
  P9_VIEW_CHIP_W,
} from "./p9SideSectionGeometry";

const ROOM_EDGE = "#DCDBD6";
const LABEL_MUTED = "#3E4349";
const LABEL_INK = "#1B1A1A";
const ENGINEERING_INK = "#213428";
const CAPTION = "LIMITING GAP";

/** Published P9 levels arrive as L4 or 4 (or Fail); the chip shows a level label. */
function normaliseLevelLabel(level) {
  if (level === 0) return "FAIL";
  const raw = String(level ?? "").trim().toUpperCase();
  if (/^[1-4]$/.test(raw)) return `L${raw}`;
  if (/^L[1-4]$/.test(raw)) return raw;
  if (raw === "FAIL") return "FAIL";
  return null;
}

function formatAngle(angle) {
  return Number.isFinite(Number(angle)) ? `${Number(angle).toFixed(1)}°` : "—";
}

export default function P9SideSectionDrawing({ geometry, className, style }) {
  if (!geometry) return null;

  const { svgW, svgH, toPx, lengthM, heightM, rows, views } = geometry;

  const floorLeft = toPx(0, 0);
  const floorRight = toPx(lengthM, 0);
  const ceilingLeft = toPx(0, heightM);
  const ceilingRight = toPx(lengthM, heightM);

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className={className}
      style={style}
      role="img"
      aria-label="P9 side section: the installed overhead speaker rows, with the vertical angles between adjacent rows drawn from a front-row listening point and a rear-row listening point"
    >
      <rect width={svgW} height={svgH} fill="#F8F8F7" rx="12" />

      {/* ── Room section: floor, ceiling, screen direction, rear direction ── */}
      <line x1={floorLeft.px} y1={floorLeft.py} x2={floorRight.px} y2={floorRight.py} stroke={ROOM_EDGE} strokeWidth={2} />
      <text x={floorLeft.px + 4} y={floorLeft.py + 16} fill={LABEL_MUTED} fontSize={10} fontFamily={P9_SIDE_FONT_FAMILY} letterSpacing="0.08em">
        FLOOR
      </text>

      <line x1={ceilingLeft.px} y1={ceilingLeft.py} x2={ceilingRight.px} y2={ceilingRight.py} stroke={ROOM_EDGE} strokeWidth={2} strokeDasharray="6 4" />
      <text x={ceilingRight.px - 4} y={ceilingLeft.py - 8} fill={LABEL_MUTED} fontSize={10} textAnchor="end" fontFamily={P9_SIDE_FONT_FAMILY} letterSpacing="0.08em">
        CEILING
      </text>

      <line x1={ceilingLeft.px} y1={ceilingLeft.py} x2={floorLeft.px} y2={floorLeft.py} stroke={ROOM_EDGE} strokeWidth={2} />
      <line x1={ceilingRight.px} y1={ceilingRight.py} x2={floorRight.px} y2={floorRight.py} stroke={ROOM_EDGE} strokeWidth={2} />

      <text x={ceilingLeft.px + 6} y={(ceilingLeft.py + floorLeft.py) / 2} fill={LABEL_MUTED} fontSize={10} fontFamily={P9_SIDE_FONT_FAMILY} letterSpacing="0.06em">
        SCREEN
      </text>
      <text x={ceilingRight.px - 6} y={(ceilingRight.py + floorRight.py) / 2} fill={LABEL_MUTED} fontSize={10} textAnchor="end" fontFamily={P9_SIDE_FONT_FAMILY} letterSpacing="0.06em">
        REAR
      </text>

      {/* ── Adjacent-row wedges: the two gaps each row's own point sees ── */}
      {views.map((view) => (
        <g key={`${view.key}-wedges`}>
          {view.wedges.map((wedge) => (
            <path
              key={`${view.key}-fill-${wedge.fromRowName}-${wedge.toRowName}`}
              d={wedge.sectorPath}
              fill={wedge.fill}
              fillOpacity={P9_WEDGE_FILL_OPACITY}
              stroke="none"
            />
          ))}
        </g>
      ))}

      {/* ── Rays: listening point → each overhead row's real acoustic centre ── */}
      {views.map((view) => (
        <g key={`${view.key}-rays`}>
          {view.rays.map((ray) => (
            <line
              key={`${view.key}-ray-${ray.rowName}`}
              x1={view.px.px}
              y1={view.px.py}
              x2={ray.px.px}
              y2={ray.px.py}
              stroke={ray.color}
              strokeWidth={1.4}
              strokeOpacity={0.45}
            />
          ))}
        </g>
      ))}

      {/* ── Arc of every adjacent pair; only the limiting gap is heavy, solid ── */}
      {views.map((view) => (
        <g key={`${view.key}-arcs`}>
          {view.wedges.map((wedge) => (
            <path
              key={`${view.key}-arc-${wedge.fromRowName}-${wedge.toRowName}`}
              d={wedge.arcPath}
              fill="none"
              stroke={wedge.isLimiting ? P9_WEDGE_LIMITING_INK : wedge.fill}
              strokeWidth={wedge.isLimiting ? 2.6 : 1.2}
              strokeOpacity={wedge.isLimiting ? 0.95 : 0.6}
              strokeDasharray={wedge.isLimiting ? undefined : "3 4"}
            />
          ))}
        </g>
      ))}

      {/* ── The limiting gap of each row, named ── */}
      {views.map((view) => (
        <text
          key={`${view.key}-pair`}
          x={view.limitingWedge.captionPx.x}
          y={view.limitingWedge.captionPx.y}
          fill={P9_WEDGE_LIMITING_INK}
          fontSize={8.5}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily={P9_SIDE_FONT_FAMILY}
          letterSpacing="0.06em"
        >
          {view.limitingWedge.label}
        </text>
      ))}

      {/* ── Real installed overhead speakers, at their real positions ── */}
      {rows.map((row) => (
        <g key={`p9-row-${row.rowName}`}>
          {row.speakers.map((spk) => (
            <circle
              key={`${row.rowName}-${spk.px.px.toFixed(1)}-${spk.px.py.toFixed(1)}`}
              cx={spk.px.px}
              cy={spk.px.py}
              r={6}
              fill={row.color}
              stroke="#F8F8F7"
              strokeWidth={1.5}
            />
          ))}
          <text
            x={row.px.px}
            y={row.px.py - 12}
            fill={row.color}
            fontSize={9}
            textAnchor="middle"
            fontFamily={P9_SIDE_FONT_FAMILY}
            letterSpacing="0.1em"
          >
            {row.displayName}
          </text>
          <text
            x={row.px.px}
            y={row.px.py - 24}
            fill={LABEL_MUTED}
            fontSize={9}
            textAnchor="middle"
            fontFamily={P9_SIDE_FONT_FAMILY}
          >
            {row.roleLabel}
          </text>
        </g>
      ))}

      {/* ── Each seating row's own listening point and published result ── */}
      {views.map((view) => {
        const levelText = view.hasResult ? normaliseLevelLabel(view.level) : null;
        const grade = levelText ? getSeatGradeColors(levelText) : null;
        const chip = view.chip;
        return (
          <g key={`${view.key}-point`}>
            <circle cx={view.px.px} cy={view.px.py} r={9.5} fill="none" stroke={ENGINEERING_INK} strokeWidth={2} />
            <circle cx={view.px.px} cy={view.px.py} r={4} fill={ENGINEERING_INK} />

            <text
              x={view.px.px}
              y={view.px.py + 20}
              fill={LABEL_INK}
              fontSize={10}
              fontWeight={600}
              textAnchor="middle"
              fontFamily={P9_SIDE_FONT_FAMILY}
              letterSpacing="0.08em"
            >
              {String(view.label || "").toUpperCase()}
            </text>

            {chip && (
              <g>
                <rect
                  x={chip.x - P9_VIEW_CHIP_W / 2}
                  y={chip.y - P9_VIEW_CHIP_H / 2}
                  width={P9_VIEW_CHIP_W}
                  height={P9_VIEW_CHIP_H}
                  rx={6}
                  fill="#FFFFFF"
                  stroke={P9_WEDGE_LIMITING_INK}
                  strokeWidth={1.5}
                />
                <text
                  x={chip.x}
                  y={chip.y - P9_VIEW_CHIP_H / 2 + 11}
                  fill={P9_WEDGE_LIMITING_INK}
                  fontSize={7.5}
                  textAnchor="middle"
                  fontFamily={P9_SIDE_FONT_FAMILY}
                  letterSpacing="0.12em"
                >
                  {CAPTION}
                </text>
                <text
                  x={chip.x - (grade ? 24 : 0)}
                  y={chip.y + 6}
                  fill={P9_WEDGE_LIMITING_INK}
                  fontSize={15}
                  fontWeight={700}
                  textAnchor="middle"
                  fontFamily={P9_SIDE_FONT_FAMILY}
                >
                  {formatAngle(view.angle)}
                </text>
                {grade && (
                  <>
                    <rect
                      x={chip.x + 4}
                      y={chip.y - 4}
                      width={38}
                      height={16}
                      rx={4}
                      fill={grade.fill}
                      stroke={grade.border}
                      strokeWidth={1}
                    />
                    <text
                      x={chip.x + 23}
                      y={chip.y + 7.5}
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
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}