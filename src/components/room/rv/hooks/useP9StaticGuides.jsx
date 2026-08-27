/**
 * useP9StaticGuides
 * -----------------
 * Fixed P9 reference guides for .4 and .6 overhead layouts.
 *
 * .4: symmetric front+rear pair centred on RSP. Binary-search the
 *     half-offset d such that the front↔rear adjacent-row gap equals
 *     50° (L4), 60° (L3), or 80° (L2). Emits one front ladder and one
 *     rear ladder, both RSP-anchored.
 *
 * .6: front+mid+rear with mid fixed at RSP (TML/TMR aligned to RSP).
 *     Binary-search the offset d such that the front↔mid gap (and by
 *     symmetry mid↔rear) equals each threshold. Emits one front ladder
 *     (rspY − d), one rear ladder (rspY + d), and a midMarker at rspY
 *     so the renderer can draw the RSP cross-line / Top Middle label.
 *     No 50/60/80 ladder is drawn for the mid row.
 *
 * The guides are STATIC — they do NOT depend on the current draggable
 * Y positions of the overhead speakers. They depend only on:
 *   - RSP X/Y/Z
 *   - room / ceiling geometry (overhead Z = ceiling height)
 *   - overhead placement-zone geometry (for zone-derived X and Y filtering)
 *
 * Solver uses the canonical computeUpperVerticalAnglesForSeat() helper
 * as the sole angle authority — no alternative P9 trigonometry.
 *
 * Output shape (consumed by RvP9Corridors):
 *   { applicable, state, ranges, boundaries, selectedRow, rows, midMarker, note }
 *   boundaries: [{ y, level, deg, row }]  — only entries whose Y falls
 *   inside the corresponding overhead placement zone.
 *   midMarker: { y } | null  — RSP Y for the Top Middle cross-line (.6 only)
 */

import { useMemo } from "react";
import {
  getUpperSpeakersForSeat,
  computeUpperVerticalAnglesForSeat,
} from "@/components/utils/rp22UpperSeatMetrics";

const P9_THRESHOLDS = [
  { level: "L4", deg: 50 },
  { level: "L3", deg: 60 },
  { level: "L2", deg: 80 },
];

// Max half-offset. .6 L2 (80°) offset = dz·tan(80°) can exceed 5 m for
// tall ceilings, so allow up to 8 m; out-of-zone guides are filtered.
const SEARCH_HIGH_M = 8.0;
const SEARCH_ITERATIONS = 30;

/**
 * Derive left/right X from a zone's pieces.
 * Returns the overall min/max X of all piece edges — used as the
 * synthetic speaker X coordinates.  X does not affect the P9 elevation
 * angle (atan2(dz, dy)), so any left-of-centre / right-of-centre pair
 * produces the same gap; the zone extremes are the natural "intended
 * placement" authority.
 */
function getZoneLeftRightX(zone) {
  if (!zone || !zone.active) return null;
  const pieces = Array.isArray(zone.pieces) && zone.pieces.length
    ? zone.pieces
    : [{ x1: zone.x1, x2: zone.x2 }];
  const allX = pieces
    .flatMap((p) => [p.x1, p.x2])
    .filter((v) => Number.isFinite(v));
  if (allX.length < 2) return null;
  return { leftX: Math.min(...allX), rightX: Math.max(...allX) };
}

/**
 * Build synthetic overhead speakers for a candidate offset.
 *   .4: front row at rspY−offset, rear row at rspY+offset (no mid).
 *   .6: front row at rspY−offset, mid row at rspY (midOffset=0),
 *       rear row at rspY+offset.
 */
function buildSyntheticSpeakers({
  rspY,
  frontOffset,
  rearOffset,
  midOffset,
  ohZ,
  frontX,
  rearX,
  midX,
  hasMid,
}) {
  const speakers = [
    { id: "synth-TFL", role: "TFL", position: { x: frontX.leftX, y: rspY - frontOffset, z: ohZ } },
    { id: "synth-TFR", role: "TFR", position: { x: frontX.rightX, y: rspY - frontOffset, z: ohZ } },
    { id: "synth-TRL", role: "TRL", position: { x: rearX.leftX, y: rspY + rearOffset, z: ohZ } },
    { id: "synth-TRR", role: "TRR", position: { x: rearX.rightX, y: rspY + rearOffset, z: ohZ } },
  ];
  if (hasMid) {
    speakers.push(
      { id: "synth-TML", role: "TML", position: { x: midX.leftX, y: rspY + midOffset, z: ohZ } },
      { id: "synth-TMR", role: "TMR", position: { x: midX.rightX, y: rspY + midOffset, z: ohZ } },
    );
  }
  return speakers;
}

/**
 * Evaluate the canonical P9 max vertical gap for a candidate offset.
 * Uses getUpperSpeakersForSeat + computeUpperVerticalAnglesForSeat.
 * For symmetric layouts (.4 and .6 with mid at RSP) all adjacent gaps
 * are equal, so maxVerticalGapDeg is the single relevant gap.
 */
function evaluateGap({
  rspPoint,
  frontOffset,
  rearOffset,
  midOffset,
  ohZ,
  frontX,
  rearX,
  midX,
  hasMid,
  roomCenterX,
  canonicalRoleFn,
}) {
  const synth = buildSyntheticSpeakers({
    rspY: rspPoint.y,
    frontOffset,
    rearOffset,
    midOffset,
    ohZ,
    frontX,
    rearX,
    midX,
    hasMid,
  });
  const upperSpeakers = getUpperSpeakersForSeat(rspPoint, synth, canonicalRoleFn);
  const result = computeUpperVerticalAnglesForSeat(rspPoint, upperSpeakers, roomCenterX);
  return result?.maxVerticalGapDeg ?? null;
}

/**
 * Binary-search the half-offset that produces a target P9 gap.
 * Gap is monotonically increasing with offset (0° at offset=0 → 180° at
 * offset→∞), so a standard binary search converges quickly.
 */
function solveOffset({
  targetDeg,
  rspPoint,
  ohZ,
  frontX,
  rearX,
  midX,
  hasMid,
  roomCenterX,
  canonicalRoleFn,
}) {
  let low = 0;
  let high = SEARCH_HIGH_M;

  for (let i = 0; i < SEARCH_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const gap = evaluateGap({
      rspPoint,
      frontOffset: mid,
      rearOffset: mid,
      midOffset: 0,
      ohZ,
      frontX,
      rearX,
      midX,
      hasMid,
      roomCenterX,
      canonicalRoleFn,
    });
    if (!Number.isFinite(gap)) return null;
    // gap increases with offset: if gap < target, need larger offset
    if (gap < targetDeg) low = mid;
    else high = mid;
  }

  const offset = (low + high) / 2;
  if (!Number.isFinite(offset) || offset <= 0 || offset >= SEARCH_HIGH_M) return null;
  return offset;
}

export function useP9StaticGuides({
  rsp,
  roomDims,
  dolbyLayout,
  overheadZones,
  getCanonicalRole,
}) {
  return useMemo(() => {
    const empty = {
      applicable: false,
      state: null,
      ranges: [],
      boundaries: [],
      selectedRow: null,
      rows: [],
      midMarker: null,
      note: null,
    };

    if (!rsp || !overheadZones) return empty;

    const rspX = Number(rsp.x);
    const rspY = Number(rsp.y);
    const rspZ = Number(rsp.z);
    if (!Number.isFinite(rspX) || !Number.isFinite(rspY) || !Number.isFinite(rspZ)) {
      return empty;
    }

    const widthM = Number(roomDims?.widthM) || 4.5;
    const heightM = Number(roomDims?.heightM) || 2.4;
    const roomCenterX = widthM / 2;

    const parts = String(dolbyLayout || "").split(".");
    const ohCount = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;
    const hasMid = ohCount === 6;
    // .4 and .6 use the RSP-anchored static guide; .2 is not applicable.
    if (ohCount !== 4 && ohCount !== 6) return empty;

    // Canonical overhead Z = ceiling plane
    const ohZ = heightM;
    if (ohZ <= rspZ) return empty; // degenerate: listener at or above ceiling

    const frontZone = overheadZones?.frontZone;
    const rearZone = overheadZones?.backZone;
    if (!frontZone?.active || !rearZone?.active) return empty;

    const frontX = getZoneLeftRightX(frontZone);
    const rearX = getZoneLeftRightX(rearZone);
    if (!frontX || !rearX) return empty;

    let midX = null;
    if (hasMid) {
      const midZone = overheadZones?.midZone;
      if (!midZone?.active) return empty;
      midX = getZoneLeftRightX(midZone);
      if (!midX) return empty;
    }

    const rspPoint = { x: rspX, y: rspY, z: rspZ };
    const canonicalRoleFn = getCanonicalRole || ((role) => String(role || "").toUpperCase());

    // Zone Y extents for filtering (only render guides inside the zone)
    const frontYMin = Math.min(frontZone.y1, frontZone.y2);
    const frontYMax = Math.max(frontZone.y1, frontZone.y2);
    const rearYMin = Math.min(rearZone.y1, rearZone.y2);
    const rearYMax = Math.max(rearZone.y1, rearZone.y2);

    const boundaries = [];

    for (const { level, deg } of P9_THRESHOLDS) {
      // P9 is the angle between the front and rear overhead directions at
      // the listener. For both .4 and .6 the helper solves the symmetric
      // front↔rear gap (mid is a visual anchor at RSP, not part of the
      // gap measurement), so the solver always uses the front+rear pair.
      const offset = solveOffset({
        targetDeg: deg,
        rspPoint,
        ohZ,
        frontX,
        rearX,
        midX: null,
        hasMid: false,
        roomCenterX,
        canonicalRoleFn,
      });
      if (!Number.isFinite(offset)) continue;

      const frontY = rspY - offset;
      const rearY = rspY + offset;

      // Only include a guide where its Y falls inside the corresponding zone
      if (frontY >= frontYMin && frontY <= frontYMax) {
        boundaries.push({ y: frontY, level, deg, row: "front" });
      }
      if (rearY >= rearYMin && rearY <= rearYMax) {
        boundaries.push({ y: rearY, level, deg, row: "rear" });
      }
    }

    const rows = [
      { row: "front", state: "static" },
      { row: "rear", state: "static" },
    ];

    // .6: Top Middle is fixed at RSP — no 50/60/80 ladder, just a cross-line.
    const midMarker = hasMid ? { y: rspY } : null;

    return {
      applicable: true,
      state: "static",
      ranges: [],
      boundaries,
      selectedRow: null,
      rows,
      midMarker,
      note: null,
    };
  }, [
    rsp?.x,
    rsp?.y,
    rsp?.z,
    roomDims?.widthM,
    roomDims?.lengthM,
    roomDims?.heightM,
    dolbyLayout,
    overheadZones,
    getCanonicalRole,
  ]);
}