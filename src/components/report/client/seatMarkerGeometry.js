/**
 * seatMarkerGeometry.js
 * ---------------------
 * Shared spacing-aware seat-marker geometry for all Visual Report seat diagrams.
 *
 * Computes one common halo radius from the actual plotted seat centres so that:
 *   - seat centres remain at the true room coordinates (no nudging)
 *   - halos never overlap
 *   - all seats in one diagram use the same radius (no size-based importance)
 *
 * Also provides SVG arc-path helpers for multi-segment performance halos
 * and fixed segment-layout constants for BLA (3-segment) and Timbre (2-segment).
 *
 * This module is PURE JS — no React, no imports from styled authorities — so it
 * is unit-testable in isolation.
 */

// ── Geometry constants ──

/** The "normal" design radius — the cap for how large a halo can grow. */
export const NORMAL_DESIGN_RADIUS_PX = 28;

/**
 * Safe fraction of the minimum seat spacing — keeps a clear visible gap
 * between adjacent halos.  0.42 means two halos whose centres are D px apart
 * will have a gap of D − 2×(0.42×D) = 0.16×D between their outer edges.
 */
export const SAFE_FRACTION = 0.42;

/**
 * Below this halo radius the segmented/semantic halo becomes unreadable.
 * The renderer switches to a compact fallback marker (central disc + Primary
 * keyline only).  The fallback NEVER enlarges back to this threshold — it
 * uses the calculated radius, which is already smaller.
 */
export const READABLE_HALO_THRESHOLD_PX = 14;

/** Central listening-position disc — fixed size, independent of halo radius. */
export const CENTRAL_DISC_R = 4;

/** Gap between central disc and halo inner edge. */
export const HALO_INNER_OFFSET = 3;

/** Primary outer ring stroke width. */
export const PRIMARY_STROKE_WIDTH = 3.5;

// ── Annular band geometry (thin outer performance band) ──

/** Target band thickness at normal report size (px). */
export const BAND_THICKNESS_NORMAL_PX = 6;

/** Minimum band thickness before the compact fallback is preferred (px). */
export const BAND_THICKNESS_MIN_PX = 2.5;

/** Band thickness as a fraction of the envelope radius (for small markers). */
export const BAND_THICKNESS_FRACTION = 0.22;

/** Gap between the performance band outer edge and the Primary keyline inner edge (px). */
export const PRIMARY_GAP_PX = 2.5;

/** Minimum Primary gap (px). */
export const PRIMARY_GAP_MIN_PX = 1.5;

/**
 * Compute the thin annular band geometry from the spacing-safe envelope radius.
 *
 * The envelope radius (from computeHaloRadiusPx) is the FULL outer extent
 * including the Primary keyline.  Everything is drawn INSIDE this envelope so
 * no overlap is possible — the largest Primary marker fits within the
 * spacing-safe marker envelope.
 *
 * Layout (outer → inner):
 *   envelopeR          ← spacing-safe outer edge
 *   primaryKeylineR    ← Primary keyline centre (stroke spans the outer edge)
 *   bandOuterR         ← performance band outer edge (gap below keyline)
 *   bandInnerR         ← performance band inner edge
 *   CENTRAL_DISC_R     ← neutral listening-position disc
 *
 * All seats use the same band size — the Primary keyline space is reserved
 * for every seat so Secondary bands are identical to Primary bands.
 *
 * @param {number} envelopeR - full outer extent from computeHaloRadiusPx
 * @returns {{ bandInnerR:number, bandOuterR:number, primaryKeylineR:number, bandThickness:number, primaryGap:number }}
 */
export function computeBandGeometry(envelopeR) {
  const bandThickness = Math.max(
    BAND_THICKNESS_MIN_PX,
    Math.min(BAND_THICKNESS_NORMAL_PX, envelopeR * BAND_THICKNESS_FRACTION)
  );
  const primaryGap = Math.max(
    PRIMARY_GAP_MIN_PX,
    Math.min(PRIMARY_GAP_PX, envelopeR * 0.09)
  );
  // Primary keyline centre — its outer edge coincides with the envelope.
  const primaryKeylineR = Math.max(
    CENTRAL_DISC_R + 1,
    envelopeR - PRIMARY_STROKE_WIDTH / 2
  );
  // Band outer edge sits inside the keyline inner edge + gap.
  const bandOuterR = Math.max(
    CENTRAL_DISC_R + HALO_INNER_OFFSET + bandThickness,
    primaryKeylineR - PRIMARY_STROKE_WIDTH / 2 - primaryGap
  );
  const bandInnerR = Math.max(
    CENTRAL_DISC_R + HALO_INNER_OFFSET,
    bandOuterR - bandThickness
  );
  return { bandInnerR, bandOuterR, primaryKeylineR, bandThickness, primaryGap };
}

// ── Segment layouts (SVG angles, degrees, clockwise from 3 o'clock) ──
// In SVG: 0° = right, 90° = down, 180° = left, 270° = up.
// Standard math cos/sin with SVG's flipped y gives clockwise rotation.

/**
 * Three-segment halo (Best Listening Area: P4 / P6 / P10).
 *   TOP         = P4 Screen    (centred at 270° / 12 o'clock)
 *   LOWER LEFT  = P6 Surround   (centred at 150° / 7-8 o'clock)
 *   LOWER RIGHT = P10 Overhead  (centred at 30°  / 4-5 o'clock)
 *
 * Three 90° segments with 30° gaps between them.
 */
export const THREE_SEGMENT_LAYOUT = [
  { key: "p4",  label: "P4 Screen",    startAngle: 225, endAngle: 315 },  // top
  { key: "p10", label: "P10 Overhead",  startAngle: 345, endAngle: 75  },  // lower-right (wraps 0°)
  { key: "p6",  label: "P6 Surround",   startAngle: 105, endAngle: 195 },  // lower-left
];

/**
 * Two-segment halo (Timbre: P16 / P17).
 *   UPPER = P16 Screen               (upper half)
 *   LOWER = P17 Surround & Overhead  (lower half)
 *
 * Two 170° segments with 10° gaps on the left and right.
 */
export const TWO_SEGMENT_LAYOUT = [
  { key: "p16", label: "P16 Screen",                startAngle: 185, endAngle: 355 },  // upper
  { key: "p17", label: "P17 Surround & Overhead",   startAngle: 5,   endAngle: 175 },  // lower
];

/** Legend entries for the three-segment BLA halo (display order: top, lower-left, lower-right). */
export const THREE_SEGMENT_LEGEND = [
  { key: "p4",  label: "Top — P4 Screen" },
  { key: "p6",  label: "Lower-left — P6 Surround" },
  { key: "p10", label: "Lower-right — P10 Overhead" },
];

/** Legend entries for the two-segment Timbre halo. */
export const TWO_SEGMENT_LEGEND = [
  { key: "p16", label: "Upper — P16 Screen" },
  { key: "p17", label: "Lower — P17 Surround & Overhead" },
];

// ── Geometry computation ──

/**
 * Compute the pairwise minimum Euclidean centre-to-centre distance
 * between plotted seat points in pixel space.
 *
 * @param {Array<{px:number, py:number}>} seatPoints - plotted seat centres in px
 * @returns {number} minimum spacing in px, or Infinity if fewer than 2 seats
 */
export function computeMinSeatSpacingPx(seatPoints) {
  if (!Array.isArray(seatPoints) || seatPoints.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < seatPoints.length; i++) {
    for (let j = i + 1; j < seatPoints.length; j++) {
      const dx = seatPoints[i].px - seatPoints[j].px;
      const dy = seatPoints[i].py - seatPoints[j].py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * Compute the common halo radius for all seats in one diagram.
 *
 *   haloRadius = min(normalDesignRadius, safeFraction × minSeatSpacing)
 *
 * The radius is the SAME for every seat — different sizes would imply
 * different importance.  The radius never exceeds the safe fraction of
 * the minimum spacing, so adjacent halos always have a visible gap.
 *
 * IMPORTANT: this function does NOT apply a minimum floor.  If the
 * calculated radius is below READABLE_HALO_THRESHOLD_PX, the caller
 * must switch to the compact fallback marker — the radius is never
 * artificially enlarged (that would reintroduce overlap).
 *
 * @param {Array<{px:number, py:number}>} seatPoints - plotted seat centres in px
 * @param {Object} [options]
 * @param {number} [options.normalDesignRadius=NORMAL_DESIGN_RADIUS_PX]
 * @param {number} [options.safeFraction=SAFE_FRACTION]
 * @returns {number} common halo radius in px (may be below READABLE_HALO_THRESHOLD_PX)
 */
export function computeHaloRadiusPx(seatPoints, options = {}) {
  const normalDesignRadius = options.normalDesignRadius ?? NORMAL_DESIGN_RADIUS_PX;
  const safeFraction = options.safeFraction ?? SAFE_FRACTION;
  const minSpacing = computeMinSeatSpacingPx(seatPoints);
  const safeRadius = safeFraction * minSpacing;
  return Math.min(normalDesignRadius, safeRadius);
}

/**
 * Determine whether the halo is large enough for segmented/semantic rendering,
 * or whether the compact fallback should be used.
 *
 * @param {number} haloRadiusPx - computed common halo radius
 * @returns {boolean} true when the halo is readable (>= threshold)
 */
export function isHaloReadable(haloRadiusPx) {
  return haloRadiusPx >= READABLE_HALO_THRESHOLD_PX;
}

// ── SVG arc-path helpers ──

/**
 * Build an SVG path string for a ring segment (annular arc).
 *
 * The segment runs clockwise from startAngle to endAngle (in degrees,
 * SVG convention: 0° = right, 90° = down).  Handles wrap-around (e.g.
 * startAngle=345, endAngle=75).
 *
 * @param {number} cx - centre x
 * @param {number} cy - centre y
 * @param {number} innerR - inner radius of the ring
 * @param {number} outerR - outer radius of the ring
 * @param {number} startAngleDeg - start angle in degrees
 * @param {number} endAngleDeg - end angle in degrees
 * @returns {string} SVG path d attribute
 */
export function buildRingSegmentPath(cx, cy, innerR, outerR, startAngleDeg, endAngleDeg) {
  // Normalise sweep to a positive clockwise value
  let sweepDeg = endAngleDeg - startAngleDeg;
  if (sweepDeg < 0) sweepDeg += 360;

  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = ((startAngleDeg + sweepDeg) * Math.PI) / 180;

  const x1 = cx + outerR * Math.cos(startRad);
  const y1 = cy + outerR * Math.sin(startRad);
  const x2 = cx + outerR * Math.cos(endRad);
  const y2 = cy + outerR * Math.sin(endRad);
  const x3 = cx + innerR * Math.cos(endRad);
  const y3 = cy + innerR * Math.sin(endRad);
  const x4 = cx + innerR * Math.cos(startRad);
  const y4 = cy + innerR * Math.sin(startRad);

  const largeArc = sweepDeg > 180 ? 1 : 0;

  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${outerR.toFixed(2)} ${outerR.toFixed(2)} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${innerR.toFixed(2)} ${innerR.toFixed(2)} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    "Z",
  ].join(" ");
}

/**
 * Look up a segment's angle range from a layout by key.
 *
 * @param {Array} layout - segment layout array (THREE_SEGMENT_LAYOUT or TWO_SEGMENT_LAYOUT)
 * @param {string} key - segment key to find
 * @returns {{startAngle:number, endAngle:number}|null}
 */
export function findSegmentAngles(layout, key) {
  const seg = layout.find((s) => s.key === key);
  if (!seg) return null;
  return { startAngle: seg.startAngle, endAngle: seg.endAngle };
}