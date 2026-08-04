/**
 * useP9CorridorsComputed
 * ----------------------
 * Pure hook that computes the dynamic P9 L4 target line for a selected overhead row.
 *
 * Samples candidate Y positions along the room length, moves only the selected
 * overhead row to each candidate Y, and runs the existing production helpers
 * (getUpperSpeakersForSeat + computeUpperVerticalAnglesForSeat) to find the
 * max vertical gap at each position. The L4-compliant range (gap ≤ 50°) and
 * its boundary crossings are returned for rendering as a target line.
 *
 * No state writes, no autosave, no full RP22 engine rerun.
 * Memoised from stable inputs for drag responsiveness.
 */

import { useMemo } from "react";
import {
  getUpperSpeakersForSeat,
  computeUpperVerticalAnglesForSeat,
} from "@/components/utils/rp22UpperSeatMetrics";

// P9 L4 target threshold (matching the production helper classification)
const P9_L4_MAX = 50;

const SAMPLE_INTERVAL_M = 0.05;

function getOverheadRowFromRole(role) {
  const r = String(role || "").toUpperCase();
  if (r.startsWith("TF")) return "front";
  if (r.startsWith("TM")) return "mid";
  if (r.startsWith("TR") || r.startsWith("TB")) return "rear";
  return null;
}

export function useP9CorridorsComputed({
  selectedOverheadRow,
  rsp,
  placedSpeakers,
  roomDims,
  getCanonicalRole,
  dolbyLayout,
}) {
  return useMemo(() => {
    if (!selectedOverheadRow || !rsp || !Array.isArray(placedSpeakers)) {
      return { corridors: [], applicable: false, note: null };
    }

    const rspX = Number(rsp.x);
    const rspY = Number(rsp.y);
    const rspZ = Number(rsp.z);
    if (!Number.isFinite(rspX) || !Number.isFinite(rspY) || !Number.isFinite(rspZ)) {
      return { corridors: [], applicable: false, note: null };
    }

    const widthM = Number(roomDims?.widthM) || 4.5;
    const lengthM = Number(roomDims?.lengthM) || 6.0;
    const roomCenterX = widthM / 2;

    // Determine overhead count from layout
    const parts = String(dolbyLayout || "").split(".");
    const ohCount = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;

    // .2 layout: single overhead row, P9 not applicable
    if (ohCount === 2) {
      return { corridors: [], applicable: false, note: "Single overhead row — P9 spacing not applicable" };
    }

    // Only .4 and .6 layouts have P9 corridors
    if (ohCount !== 4 && ohCount !== 6) {
      return { corridors: [], applicable: false, note: null };
    }

    // Get overhead speakers with valid positions
    const overheadSpeakers = placedSpeakers.filter(
      (s) =>
        getOverheadRowFromRole(s?.role) !== null &&
        s?.position &&
        Number.isFinite(s.position.x) &&
        Number.isFinite(s.position.y) &&
        Number.isFinite(s.position.z)
    );
    if (overheadSpeakers.length === 0) {
      return { corridors: [], applicable: false, note: null };
    }

    // Check that the selected row has speakers
    const selectedRowSpeakers = overheadSpeakers.filter(
      (s) => getOverheadRowFromRole(s.role) === selectedOverheadRow
    );
    if (selectedRowSpeakers.length === 0) {
      return { corridors: [], applicable: false, note: null };
    }

    // Check that at least one other row exists (for adjacency)
    const otherRowSpeakers = overheadSpeakers.filter(
      (s) => getOverheadRowFromRole(s.role) !== selectedOverheadRow
    );
    if (otherRowSpeakers.length === 0) {
      return { corridors: [], applicable: false, note: null };
    }

    const rspPoint = { x: rspX, y: rspY, z: rspZ };
    const canonicalRoleFn = getCanonicalRole || ((role) => String(role || "").toUpperCase());

    // Sample Y positions along the room length
    const yMin = 0.1;
    const yMax = lengthM - 0.1;
    const samples = [];

    for (let y = yMin; y <= yMax; y += SAMPLE_INTERVAL_M) {
      // Build candidate speakers: move selected row to candidate Y, preserve X and Z
      const candidateSpeakers = placedSpeakers.map((s) => {
        if (getOverheadRowFromRole(s.role) === selectedOverheadRow) {
          return { ...s, position: { ...s.position, y } };
        }
        return s;
      });

      // Run production helpers (no new acoustic maths)
      const upperSpeakers = getUpperSpeakersForSeat(rspPoint, candidateSpeakers, canonicalRoleFn);
      const result = computeUpperVerticalAnglesForSeat(rspPoint, upperSpeakers, roomCenterX);

      samples.push({ y, maxGap: result.maxVerticalGapDeg });
    }

    // Find L4-compliant range and boundary crossings (where maxGap crosses 50°)
    const l4Samples = samples.filter((s) => s.maxGap <= P9_L4_MAX);

    if (l4Samples.length === 0) {
      return { l4Range: null, boundaries: [], applicable: true, note: null };
    }

    const l4Range = {
      yStart: l4Samples[0].y,
      yEnd: l4Samples[l4Samples.length - 1].y,
    };

    // Interpolate boundary crossings where maxGap transitions across 50°
    const boundaries = [];
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      const prevL4 = prev.maxGap <= P9_L4_MAX;
      const currL4 = curr.maxGap <= P9_L4_MAX;
      if (prevL4 !== currL4) {
        const t = (P9_L4_MAX - prev.maxGap) / (curr.maxGap - prev.maxGap);
        boundaries.push(prev.y + t * (curr.y - prev.y));
      }
    }

    return { l4Range, boundaries, applicable: true, note: null };
  }, [
    selectedOverheadRow,
    rsp?.x,
    rsp?.y,
    rsp?.z,
    placedSpeakers,
    roomDims?.widthM,
    roomDims?.lengthM,
    roomDims?.heightM,
    getCanonicalRole,
    dolbyLayout,
  ]);
}