/**
 * useEffectiveRsp
 * ---------------
 * Focused hook for computing the effective RSP (Reference Seating Position)
 * from the chosen rspMode and its associated inputs.
 *
 * Stage B1: Now returns both X and Y coordinates.
 *   AUTO / row-derived: X = room centreline (roomWidthM / 2)
 *   MANUAL: X = manualRspX_m (if finite), else room centreline
 *
 * Returns:
 *   { effectiveRspX_m: number|null, effectiveRspY_m: number|null, rspSourceLabel: string }
 */

import { useMemo } from "react";
import { distanceFor57_5FromWidth } from "@/components/room/seatingUtils";

/**
 * @param {object} params
 * @param {string}      params.rspMode              - e.g. "auto_from_screen"
 * @param {number|null} params.manualRspY_m          - explicit Y when mode is manual_position
 * @param {number|null} params.manualRspX_m          - explicit X when mode is manual_position
 * @param {number}      params.roomWidthM            - room width in metres (for centreline X)
 * @param {number}      params.screenFrontPlaneM     - Y of screen front face (metres)
 * @param {number}      params.screenWidthM          - viewable screen width in metres
 * @param {number[]}    params.rowCentersM           - array of row-centre Y values (reserved)
 * @param {object[]}    params.seatingPositions      - seat objects (reserved)
 * @param {number|null} params.currentMlpY_m         - existing mlpY_m, used as fallback
 * @param {object}      params.rowDerivedRspYByMode  - precomputed Y per row-derived mode
 * @returns {{ effectiveRspX_m: number|null, effectiveRspY_m: number|null, rspSourceLabel: string }}
 */
/** Maps row-derived rspMode values to their display label. */
const ROW_MODE_LABELS = {
  front_row_center:  "Front Row Centre",
  middle_row_center: "Middle Row Centre",
  back_row_center:   "Back Row Centre",
  all_rows_average:  "All Rows Average",
};

export function useEffectiveRsp({
  rspMode,
  manualRspY_m,
  manualRspX_m,
  roomWidthM,
  screenFrontPlaneM,
  screenWidthM,
  rowCentersM,
  seatingPositions,
  currentMlpY_m,
  rowDerivedRspYByMode = {},
}) {
  return useMemo(() => {
    const centrelineX = Number.isFinite(Number(roomWidthM)) ? Number(roomWidthM) / 2 : null;

    // ── auto_from_screen ────────────────────────────────────────────────────
    if (rspMode === "auto_from_screen") {
      const planeM = Number(screenFrontPlaneM);
      const widthM = Number(screenWidthM);

      if (Number.isFinite(planeM) && Number.isFinite(widthM) && widthM > 0) {
        const dist = distanceFor57_5FromWidth(widthM);
        if (Number.isFinite(dist)) {
          return {
            effectiveRspX_m: centrelineX,
            effectiveRspY_m: planeM + dist,
            rspSourceLabel: "Auto from screen",
          };
        }
      }

      // Inputs not yet finite — fall through to fallback below
    }

    // ── manual_position ─────────────────────────────────────────────────────
    if (rspMode === "manual_position") {
      const manualY = Number(manualRspY_m);
      const manualX = Number(manualRspX_m);
      if (Number.isFinite(manualY)) {
        return {
          effectiveRspX_m: Number.isFinite(manualX) ? manualX : centrelineX,
          effectiveRspY_m: manualY,
          rspSourceLabel: "Manual RSP",
        };
      }
      // manualRspY_m not yet set — fall through to currentMlpY_m fallback
    }

    // ── Row-derived modes ────────────────────────────────────────────────────
    if (rspMode in ROW_MODE_LABELS) {
      const precomputed = Number((rowDerivedRspYByMode ?? {})[rspMode]);
      if (Number.isFinite(precomputed)) {
        return {
          effectiveRspX_m: centrelineX,
          effectiveRspY_m: precomputed,
          rspSourceLabel: ROW_MODE_LABELS[rspMode],
        };
      }
      // Precomputed value not yet available — fall through to currentMlpY_m fallback
    }

    // ── Fallback / unsupported modes ─────────────────────────────────────────
    // Return currentMlpY_m unchanged so wiring has zero behaviour impact
    // for modes whose inputs are not yet computed.
    const fallbackY = Number.isFinite(Number(currentMlpY_m))
      ? Number(currentMlpY_m)
      : null;

    return {
      effectiveRspX_m: centrelineX,
      effectiveRspY_m: fallbackY,
      rspSourceLabel: "Current RSP",
    };
  }, [
    rspMode,
    manualRspY_m,
    manualRspX_m,
    roomWidthM,
    screenFrontPlaneM,
    screenWidthM,
    currentMlpY_m,
    rowDerivedRspYByMode,
    // rowCentersM, seatingPositions reserved for future use
  ]);
}