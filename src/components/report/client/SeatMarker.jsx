/**
 * SeatMarker — shared compact spacing-aware seat marker for Visual Reports.
 *
 * Renders three independent visual signals:
 *   1. POSITION     — neutral central disc at the true seat coordinate
 *   2. PERFORMANCE  — semantic halo (single colour OR multi-segment ring)
 *   3. PRIORITY     — optional bold dark outer ring (Primary only)
 *
 * These three concepts are never merged:
 *   - A Secondary seat may show a higher grade than a Primary seat.
 *   - Grade colour never implies priority.
 *   - All seats in one diagram use the same haloRadius (computed by the
 *     shared geometry module from actual seat spacing).
 *
 * Props:
 *   cx, cy        — seat centre in SVG px
 *   haloRadius    — computed common halo radius in px
 *   isPrimary     — whether to show the bold Primary outer ring
 *   segments      — array of { key, level, startAngle, endAngle } for multi-segment
 *   singleLevel   — level string for single-parameter pages (L1-L4, FAIL, null)
 *   fallback      — force compact fallback (no segments)
 *
 * When haloRadius < READABLE_HALO_THRESHOLD_PX, the marker automatically
 * switches to the compact fallback: central disc + thin ring + Primary keyline.
 * The fallback NEVER enlarges the radius — it uses the calculated (small)
 * radius so no overlap is introduced.
 */

import React from "react";
import { getSeatGradeColors } from "./visualReportSeatStyle";
import {
  CENTRAL_DISC_R,
  HALO_INNER_OFFSET,
  PRIMARY_STROKE_WIDTH,
  READABLE_HALO_THRESHOLD_PX,
  buildRingSegmentPath,
  computeBandGeometry,
} from "./seatMarkerGeometry";

const NEUTRAL_DISC_FILL = "#625143";
const NEUTRAL_DISC_STROKE = "#F8F8F7";
const PRIMARY_RING_COLOR = "#213428";
const FALLBACK_RING_COLOR = "#D9D5CE";

export default function SeatMarker({
  cx,
  cy,
  haloRadius,
  isPrimary,
  segments,
  singleLevel,
  fallback,
}) {
  const useFallback = fallback || haloRadius < READABLE_HALO_THRESHOLD_PX;

  // ── Fallback: compact marker, no segments ──
  // The fallback uses the existing compact treatment (neutral thin ring +
  // centre disc + Primary keyline).  It NEVER turns bands into filled wedges.
  if (useFallback) {
    const fallbackR = Math.max(CENTRAL_DISC_R + HALO_INNER_OFFSET + 2, haloRadius);
    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={fallbackR}
          fill="none"
          stroke={FALLBACK_RING_COLOR}
          strokeWidth={1.5}
        />
        <circle
          cx={cx}
          cy={cy}
          r={CENTRAL_DISC_R}
          fill={NEUTRAL_DISC_FILL}
          stroke={NEUTRAL_DISC_STROKE}
          strokeWidth={1}
        />
        {isPrimary && (
          <circle
            cx={cx}
            cy={cy}
            r={fallbackR + PRIMARY_STROKE_WIDTH / 2}
            fill="none"
            stroke={PRIMARY_RING_COLOR}
            strokeWidth={PRIMARY_STROKE_WIDTH}
          />
        )}
      </g>
    );
  }

  // ── Thin annular band geometry ──
  // The envelope radius (haloRadius) is the FULL outer extent including the
  // Primary keyline.  The performance band sits inside as a narrow ring near
  // the outer edge, leaving the centre neutral and visually dominant.
  const { bandInnerR, bandOuterR, primaryKeylineR, bandThickness } =
    computeBandGeometry(haloRadius);

  // ── Multi-segment thin annular band (BLA: 3 arcs, Timbre: 2 arcs) ──
  // Narrow ring segments near the outer edge — NOT filled wedges from centre.
  // The neutral centre remains visually dominant.
  if (segments && segments.length > 0) {
    return (
      <g>
        {segments.map((seg) => {
          const grade = getSeatGradeColors(seg.level);
          const path = buildRingSegmentPath(
            cx,
            cy,
            bandInnerR,
            bandOuterR,
            seg.startAngle,
            seg.endAngle
          );
          return (
            <path
              key={seg.key}
              d={path}
              fill={grade.fill}
              stroke={grade.border}
              strokeWidth={0.6}
            />
          );
        })}
        {/* Central listening-position disc */}
        <circle
          cx={cx}
          cy={cy}
          r={CENTRAL_DISC_R}
          fill={NEUTRAL_DISC_FILL}
          stroke={NEUTRAL_DISC_STROKE}
          strokeWidth={1}
        />
        {/* Primary outer keyline — at the envelope edge, independent of grade */}
        {isPrimary && (
          <circle
            cx={cx}
            cy={cy}
            r={primaryKeylineR}
            fill="none"
            stroke={PRIMARY_RING_COLOR}
            strokeWidth={PRIMARY_STROKE_WIDTH}
          />
        )}
      </g>
    );
  }

  // ── Single-level thin annular band (P9: one continuous narrow band) ──
  const grade = getSeatGradeColors(singleLevel);
  const bandMidR = (bandInnerR + bandOuterR) / 2;
  return (
    <g>
      {/* Thin annular band filled with the grade colour */}
      <circle
        cx={cx}
        cy={cy}
        r={bandMidR}
        fill="none"
        stroke={grade.fill}
        strokeWidth={bandThickness}
      />
      {/* Thin outer outline in the grade border colour */}
      <circle
        cx={cx}
        cy={cy}
        r={bandOuterR}
        fill="none"
        stroke={grade.border}
        strokeWidth={0.8}
      />
      {/* Central listening-position disc */}
      <circle
        cx={cx}
        cy={cy}
        r={CENTRAL_DISC_R}
        fill={NEUTRAL_DISC_FILL}
        stroke={NEUTRAL_DISC_STROKE}
        strokeWidth={1}
      />
      {/* Primary outer keyline — at the envelope edge, independent of grade */}
      {isPrimary && (
        <circle
          cx={cx}
          cy={cy}
          r={primaryKeylineR}
          fill="none"
          stroke={PRIMARY_RING_COLOR}
          strokeWidth={PRIMARY_STROKE_WIDTH}
        />
      )}
    </g>
  );
}

/**
 * PositionMarker — compact spacing-aware position-only marker for P1 / RP23.
 *
 * Uses the shared spacing-aware halo radius but does NOT render a
 * performance halo.  The background distance/viewing zones carry the
 * level information; this marker shows position and priority only.
 *
 * Props:
 *   cx, cy        — seat centre in SVG px
 *   haloRadius    — computed common halo radius in px
 *   isPrimary     — whether to show the bold Primary outer ring
 */
export function PositionMarker({ cx, cy, haloRadius, isPrimary }) {
  const discR = Math.max(5, haloRadius * 0.4);
  const primaryRingR = haloRadius;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={discR}
        fill={isPrimary ? PRIMARY_RING_COLOR : NEUTRAL_DISC_FILL}
        stroke={NEUTRAL_DISC_STROKE}
        strokeWidth={1.5}
      />
      {isPrimary && (
        <circle
          cx={cx}
          cy={cy}
          r={primaryRingR}
          fill="none"
          stroke={PRIMARY_RING_COLOR}
          strokeWidth={PRIMARY_STROKE_WIDTH}
        />
      )}
    </g>
  );
}