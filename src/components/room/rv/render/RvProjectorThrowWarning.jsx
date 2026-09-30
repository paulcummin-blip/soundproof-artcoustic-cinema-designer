"use client";

import React from "react";
import {
  THROW_RATIO_WARNING_TEXT,
  THROW_RATIO_WARNING_DETAIL,
} from "@/components/room/rv/utils/projectorThrowRatio";

/**
 * RvProjectorThrowWarning
 *
 * A small amber caution pill drawn near the projector on Plan View when the
 * implied throw ratio falls outside the broad check range. It is a design
 * caution, not an error: it never blocks a drag, saving or the design.
 *
 * The label is a fixed string, so the pill size is fixed and deterministic.
 * Hovering it reveals the fuller explanation; nothing extra is shown permanently.
 * Rendered OUTSIDE RvZoomGroup so the clipPath cannot clip the pill.
 */

const FILL = "#FDF3E2";
const STROKE = "#E0A94A";
const TEXT_FILL = "#8A5300";
const FONT_SIZE = 11;
const TEXT_W = 92;
const GLYPH_W = 9;
const PAD_X = 8;
const PAD_Y = 6;
const GLYPH_GAP = 5;
const BOX_W = PAD_X * 2 + GLYPH_W + GLYPH_GAP + TEXT_W;
const BOX_H = FONT_SIZE + PAD_Y * 2;
const BODY_CLEARANCE_PX = 26;
const SAFE_PAD = 6;
const FADE_MS = 900;

export default function RvProjectorThrowWarning({
  warning,
  meterToCanvasX,
  meterToCanvasY,
  svgW = 1000,
  svgH = 700,
}) {
  if (!warning?.visible) return null;

  const lensX = Number(warning.lensX);
  const lensY = Number(warning.lensY);
  if (!Number.isFinite(lensX) || !Number.isFinite(lensY)) return null;
  if (typeof meterToCanvasX !== "function" || typeof meterToCanvasY !== "function") return null;

  const centerX = meterToCanvasX(lensX);
  const centerY = meterToCanvasY(lensY);
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return null;

  // Placed on the rear-wall side of the projector — the least content-dense part
  // of the plan — so the pill clears the projector body, the screen and the seats.
  const x = Math.max(SAFE_PAD, Math.min(centerX - BOX_W / 2, svgW - BOX_W - SAFE_PAD));
  const y = Math.max(SAFE_PAD, Math.min(centerY + BODY_CLEARANCE_PX, svgH - BOX_H - SAFE_PAD));
  const textX = x + PAD_X + GLYPH_W + GLYPH_GAP;

  return (
    <g
      data-layer="projector-throw-warning"
      style={{ opacity: warning.fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-out` }}
    >
      <title>{THROW_RATIO_WARNING_DETAIL}</title>
      <rect
        x={x}
        y={y}
        width={BOX_W}
        height={BOX_H}
        rx={BOX_H / 2}
        fill={FILL}
        stroke={STROKE}
        strokeWidth={1}
      />
      <path
        d={`M ${x + PAD_X} ${y + BOX_H - PAD_Y} L ${x + PAD_X + GLYPH_W / 2} ${y + PAD_Y} L ${x + PAD_X + GLYPH_W} ${y + BOX_H - PAD_Y} Z`}
        fill={STROKE}
      />
      <text
        x={textX}
        y={y + BOX_H / 2}
        textAnchor="start"
        dominantBaseline="middle"
        fontSize={FONT_SIZE}
        fontWeight={600}
        fill={TEXT_FILL}
        style={{ fontFamily: "Didact Gothic, Century Gothic, sans-serif", userSelect: "none" }}
      >
        {THROW_RATIO_WARNING_TEXT}
      </text>
    </g>
  );
}