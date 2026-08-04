/**
 * useP9CorridorsComputed
 * ----------------------
 * Pure hook that computes dynamic P9 target corridors for a selected overhead row.
 *
 * Samples candidate Y positions along the room length, moves only the selected
 * overhead row to each candidate Y, and runs the existing production helpers
 * (getUpperSpeakersForSeat + computeUpperVerticalAnglesForSeat) to classify
 * the resulting P9 level at each position. Contiguous positions with the same
 * level are merged into drawable bands.
 *
 * No state writes, no autosave, no full RP22 engine rerun.
 * Memoised from stable inputs for drag responsiveness.
 */

import { useMemo } from "react";
import {
  getUpperSpeakersForSeat,
  computeUpperVerticalAnglesForSeat,
} from "@/components/utils/rp22UpperSeatMetrics";

// P9 thresholds (matching the production helper classification)
const P9_L4_MAX = 50;
const P9_L3_MAX = 60;
const P9_L2_MAX = 80;

const CORRIDOR_COLORS = {
  L4: "#213428",
  L3: "#3E4349",
  L2: "#625143",
  L1: "#4A230F",
};

const SAMPLE_INTERVAL_M = 0.05;

function classifyP9(maxGapDeg) {
  if (!Number.isFinite(maxGapDeg)) return null;
  if (maxGapDeg <= P9_L4_MAX) return "L4";
  if (maxGapDeg <= P9_L3_MAX) return "L3";
  if (maxGapDeg <= P9_L2_MAX) return "L2";
  return "L1";
}

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
      const level = classifyP9(result.maxVerticalGapDeg);

      samples.push({ y, level });
    }

    // Merge contiguous same-level ranges into bands
    const corridors = [];
    let currentBand = null;

    for (const sample of samples) {
      if (sample.level === null) {
        if (currentBand) {
          corridors.push(currentBand);
          currentBand = null;
        }
        continue;
      }
      if (!currentBand || currentBand.level !== sample.level) {
        if (currentBand) corridors.push(currentBand);
        currentBand = {
          yStart: sample.y,
          yEnd: sample.y,
          level: sample.level,
          color: CORRIDOR_COLORS[sample.level],
        };
      } else {
        currentBand.yEnd = sample.y;
      }
    }
    if (currentBand) corridors.push(currentBand);

    return { corridors, applicable: true, note: null };
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