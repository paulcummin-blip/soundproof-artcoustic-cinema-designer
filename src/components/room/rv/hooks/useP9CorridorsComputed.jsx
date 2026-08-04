/**
 * useP9CorridorsComputed
 * ----------------------
 * Pure hook that computes the dynamic P9 L4 target line for a selected overhead row.
 *
 * Samples candidate Y positions along the room length, moves only the selected
 * overhead row to each candidate Y, and runs the existing production helpers
 * (getUpperSpeakersForSeat + computeUpperVerticalAnglesForSeat) to find the
 * relevant vertical gap at each position.
 *
 * Pair-specific authority:
 *   .4 layout (front + rear):
 *     selected front → front ↔ rear gap
 *     selected rear  → front ↔ rear gap
 *   .6 layout (front + mid + rear):
 *     selected front → front ↔ mid gap only
 *     selected rear  → mid ↔ rear gap only
 *     selected mid   → max(front ↔ mid, mid ↔ rear)
 *
 * Returns a stable result contract:
 *   { applicable, state, ranges, boundaries, selectedRow, note }
 *   state: "single_row" | "no_l4" | "all_l4" | "bounded_l4" | null
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

// Extract the row pair from a gap's pair string.
// Format: "SIDE | rowName1 [roles] ... ↔ rowName2 [roles] ..."
function getRowPairFromGap(gap) {
  if (!gap || !gap.pair) return null;
  const parts = gap.pair.split("↔");
  if (parts.length !== 2) return null;
  const row1Match = parts[0].match(/(\w+)\s+\[/);
  const row2Match = parts[1].match(/(\w+)\s+\[/);
  if (!row1Match || !row2Match) return null;
  return [row1Match[1], row2Match[1]];
}

// Determine the relevant gap degree from the helper result, based on the
// selected row and overhead count. Uses the existing result.gaps — no
// duplicate angle maths.
function getRelevantGapDeg(result, selectedRow, ohCount) {
  if (!result || !Array.isArray(result.gaps)) return null;

  let relevantPairs;
  if (ohCount === 4) {
    // .4: front ↔ rear only
    relevantPairs = [["front", "rear"]];
  } else if (ohCount === 6) {
    if (selectedRow === "front") {
      relevantPairs = [["front", "mid"]];
    } else if (selectedRow === "rear") {
      relevantPairs = [["mid", "rear"]];
    } else if (selectedRow === "mid") {
      relevantPairs = [["front", "mid"], ["mid", "rear"]];
    } else {
      return null;
    }
  } else {
    return null;
  }

  const norm = (p) => [...p].sort().join("|");
  const targetSet = new Set(relevantPairs.map(norm));

  const relevantGaps = [];
  for (const gap of result.gaps) {
    const pair = getRowPairFromGap(gap);
    if (!pair) continue;
    if (targetSet.has(norm(pair))) {
      if (Number.isFinite(gap.deg)) {
        relevantGaps.push(gap.deg);
      }
    }
  }

  if (relevantGaps.length === 0) return null;
  return Math.max(...relevantGaps);
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
    const empty = { applicable: false, state: null, ranges: [], boundaries: [], selectedRow: null, note: null };

    if (!selectedOverheadRow || !rsp || !Array.isArray(placedSpeakers)) {
      return empty;
    }

    const rspX = Number(rsp.x);
    const rspY = Number(rsp.y);
    const rspZ = Number(rsp.z);
    if (!Number.isFinite(rspX) || !Number.isFinite(rspY) || !Number.isFinite(rspZ)) {
      return empty;
    }

    const widthM = Number(roomDims?.widthM) || 4.5;
    const lengthM = Number(roomDims?.lengthM) || 6.0;
    const roomCenterX = widthM / 2;

    // Determine overhead count from layout
    const parts = String(dolbyLayout || "").split(".");
    const ohCount = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;

    // .2 layout: single overhead row, P9 not applicable
    if (ohCount === 2) {
      return { applicable: false, state: "single_row", ranges: [], boundaries: [], selectedRow: selectedOverheadRow, note: "Single overhead row — P9 spacing not applicable" };
    }

    // Only .4 and .6 layouts have P9 corridors
    if (ohCount !== 4 && ohCount !== 6) {
      return empty;
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
      return empty;
    }

    // Check that the selected row has speakers
    const selectedRowSpeakers = overheadSpeakers.filter(
      (s) => getOverheadRowFromRole(s.role) === selectedOverheadRow
    );
    if (selectedRowSpeakers.length === 0) {
      return empty;
    }

    // Check that at least one other row exists (for adjacency)
    const otherRowSpeakers = overheadSpeakers.filter(
      (s) => getOverheadRowFromRole(s.role) !== selectedOverheadRow
    );
    if (otherRowSpeakers.length === 0) {
      return empty;
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

      // Use pair-specific gap, not global maxVerticalGapDeg
      const relevantGapDeg = getRelevantGapDeg(result, selectedOverheadRow, ohCount);

      samples.push({ y, gap: relevantGapDeg });
    }

    // Only consider samples with finite gap values
    const validSamples = samples.filter((s) => Number.isFinite(s.gap));
    if (validSamples.length === 0) {
      return { applicable: true, state: "no_l4", ranges: [], boundaries: [], selectedRow: selectedOverheadRow, note: null };
    }

    const l4Samples = validSamples.filter((s) => s.gap <= P9_L4_MAX);

    // All samples L4
    if (l4Samples.length === validSamples.length) {
      const ranges = [{ yStart: validSamples[0].y, yEnd: validSamples[validSamples.length - 1].y }];
      return { applicable: true, state: "all_l4", ranges, boundaries: [], selectedRow: selectedOverheadRow, note: null };
    }

    // No L4 samples
    if (l4Samples.length === 0) {
      return { applicable: true, state: "no_l4", ranges: [], boundaries: [], selectedRow: selectedOverheadRow, note: null };
    }

    // Bounded L4 — find compliant ranges (consecutive L4 samples)
    // Does not assume first-to-last compliant samples form one range.
    const ranges = [];
    let rangeStart = null;
    for (let i = 0; i < validSamples.length; i++) {
      const s = validSamples[i];
      const isL4 = s.gap <= P9_L4_MAX;
      if (isL4 && rangeStart === null) {
        rangeStart = s.y;
      } else if (!isL4 && rangeStart !== null) {
        ranges.push({ yStart: rangeStart, yEnd: validSamples[i - 1].y });
        rangeStart = null;
      }
    }
    if (rangeStart !== null) {
      ranges.push({ yStart: rangeStart, yEnd: validSamples[validSamples.length - 1].y });
    }

    // Interpolate boundary crossings with numerical safety
    const boundaries = [];
    for (let i = 1; i < validSamples.length; i++) {
      const prev = validSamples[i - 1];
      const curr = validSamples[i];
      const prevL4 = prev.gap <= P9_L4_MAX;
      const currL4 = curr.gap <= P9_L4_MAX;
      if (prevL4 !== currL4) {
        const denom = curr.gap - prev.gap;
        let yBoundary;
        if (Number.isFinite(denom) && Math.abs(denom) > 1e-9) {
          const t = (P9_L4_MAX - prev.gap) / denom;
          yBoundary = prev.y + t * (curr.y - prev.y);
        } else {
          // Denominator is zero or non-finite — use midpoint as fallback
          yBoundary = (prev.y + curr.y) / 2;
        }
        // Guard: interpolated Y must be finite and within candidate domain
        if (Number.isFinite(yBoundary) && yBoundary >= yMin && yBoundary <= yMax) {
          boundaries.push(yBoundary);
        }
      }
    }

    return { applicable: true, state: "bounded_l4", ranges, boundaries, selectedRow: selectedOverheadRow, note: null };
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