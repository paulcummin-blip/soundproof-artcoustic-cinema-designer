/**
 * useP9StaticGuides
 * -----------------
 * Fixed P9 reference guides for .4 overhead layouts.
 *
 * Computes the Y positions at which a SYMMETRICAL pair of overhead rows
 * (front + rear, centred on the RSP) would produce a P9 adjacent-row
 * vertical separation of 50° (L4), 60° (L3), or 80° (L2).
 *
 * The guides are STATIC — they do NOT depend on the current draggable
 * Y positions of TFL/TFR or TRL/TRR.  They depend only on:
 *   - RSP X/Y/Z
 *   - room / ceiling geometry (overhead Z = ceiling height)
 *   - overhead placement-zone geometry (for zone-derived X and Y filtering)
 *
 * Solver:
 *   For each threshold, binary-search the half-offset `d` such that a
 *   synthetic .4 arrangement (front at rspY-d, rear at rspY+d, both at
 *   ceiling Z, left/right X from the zone pieces) produces the target
 *   adjacent-row gap when evaluated by the canonical
 *   computeUpperVerticalAnglesForSeat() helper.
 *
 *   No alternative P9 trigonometry is introduced — the canonical helper
 *   is the sole angle authority.
 *
 * Output shape matches useP9CorridorsComputed so the same renderer
 * (RvP9Corridors) can consume it:
 *   { applicable, state, ranges, boundaries, selectedRow, rows, note }
 *   boundaries: [{ y, level, deg, row }]  — only entries whose Y falls
 *   inside the corresponding overhead placement zone.
 *
 * .6 layouts are NOT handled here (returns not-applicable); the caller
 * falls back to the dynamic corridors for .6.
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

const SEARCH_HIGH_M = 5.0; // max half-offset (5 m either side of RSP)
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
 * Build synthetic .4 speakers for a candidate half-offset.
 *   front row: TFL/TFR at (leftX, rspY - offset, ohZ) / (rightX, rspY - offset, ohZ)
 *   rear  row: TRL/TRR at (leftX, rspY + offset, ohZ) / (rightX, rspY + offset, ohZ)
 */
function buildSyntheticSpeakers({ rspY, offset, ohZ, frontX, rearX }) {
  return [
    { id: "synth-TFL", role: "TFL", position: { x: frontX.leftX, y: rspY - offset, z: ohZ } },
    { id: "synth-TFR", role: "TFR", position: { x: frontX.rightX, y: rspY - offset, z: ohZ } },
    { id: "synth-TRL", role: "TRL", position: { x: rearX.leftX, y: rspY + offset, z: ohZ } },
    { id: "synth-TRR", role: "TRR", position: { x: rearX.rightX, y: rspY + offset, z: ohZ } },
  ];
}

/**
 * Evaluate the canonical P9 adjacent-row gap for a candidate offset.
 * Uses getUpperSpeakersForSeat + computeUpperVerticalAnglesForSeat.
 * Returns maxVerticalGapDeg (max of left/right front↔rear gaps; both are
 * equal because elevation is independent of X).
 */
function evaluateGap({ rspPoint, offset, ohZ, frontX, rearX, roomCenterX, canonicalRoleFn }) {
  const synth = buildSyntheticSpeakers({
    rspY: rspPoint.y,
    offset,
    ohZ,
    frontX,
    rearX,
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
function solveOffset({ targetDeg, rspPoint, ohZ, frontX, rearX, roomCenterX, canonicalRoleFn }) {
  let low = 0;
  let high = SEARCH_HIGH_M;

  for (let i = 0; i < SEARCH_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const gap = evaluateGap({ rspPoint, offset: mid, ohZ, frontX, rearX, roomCenterX, canonicalRoleFn });
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

    // Only .4 layouts — .6 is handled by the dynamic corridors
    const parts = String(dolbyLayout || "").split(".");
    const ohCount = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;
    if (ohCount !== 4) return empty;

    // Canonical overhead Z = ceiling plane
    const ohZ = heightM;
    if (ohZ <= rspZ) return empty; // degenerate: listener at or above ceiling

    const frontZone = overheadZones?.frontZone;
    const rearZone = overheadZones?.backZone;
    if (!frontZone?.active || !rearZone?.active) return empty;

    const frontX = getZoneLeftRightX(frontZone);
    const rearX = getZoneLeftRightX(rearZone);
    if (!frontX || !rearX) return empty;

    const rspPoint = { x: rspX, y: rspY, z: rspZ };
    const canonicalRoleFn = getCanonicalRole || ((role) => String(role || "").toUpperCase());

    // Zone Y extents for filtering (only render guides inside the zone)
    const frontYMin = Math.min(frontZone.y1, frontZone.y2);
    const frontYMax = Math.max(frontZone.y1, frontZone.y2);
    const rearYMin = Math.min(rearZone.y1, rearZone.y2);
    const rearYMax = Math.max(rearZone.y1, rearZone.y2);

    const boundaries = [];

    for (const { level, deg } of P9_THRESHOLDS) {
      const offset = solveOffset({
        targetDeg: deg,
        rspPoint,
        ohZ,
        frontX,
        rearX,
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

    return {
      applicable: true,
      state: "static",
      ranges: [],
      boundaries,
      selectedRow: null,
      rows: [
        { row: "front", state: "static" },
        { row: "rear", state: "static" },
      ],
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