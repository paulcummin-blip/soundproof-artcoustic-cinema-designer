/**
 * useEffectiveRsp
 * ---------------
 * Focused hook for computing the effective RSP (Reference Seating Position) Y
 * coordinate from the chosen rspMode and its associated inputs.
 *
 * Phase 1: auto_from_screen implemented.
 * Phase 2: manual_position implemented.
 * Phase 3A: row-derived modes implemented via rowDerivedRspYByMode input.
 *
 * Returns:
 *   { effectiveRspY_m: number|null, rspSourceLabel: string }
 */

import { useMemo } from "react";
import { distanceFor57_5FromWidth } from "@/components/room/seatingUtils";

/**
 * @param {object} params
 * @param {string}      params.rspMode              - e.g. "auto_from_screen"
 * @param {number|null} params.manualRspY_m          - explicit Y when mode is manual_position
 * @param {number}      params.screenFrontPlaneM     - Y of screen front face (metres)
 * @param {number}      params.screenWidthM          - viewable screen width in metres
 * @param {number[]}    params.rowCentersM           - array of row-centre Y values (reserved)
 * @param {object[]}    params.seatingPositions      - seat objects (reserved)
 * @param {number|null} params.currentMlpY_m         - existing mlpY_m, used as fallback
 * @param {object}      params.rowDerivedRspYByMode  - precomputed Y per row-derived mode:
 *                        { front_row_center, middle_row_center, back_row_center, all_rows_average }
 * @returns {{ effectiveRspY_m: number|null, rspSourceLabel: string }}
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
  screenFrontPlaneM,
  screenWidthM,
  rowCentersM,
  seatingPositions,
  currentMlpY_m,
  rowDerivedRspYByMode = {},
}) {
  return useMemo(() => {
    // ── auto_from_screen ────────────────────────────────────────────────────
    if (rspMode === "auto_from_screen") {
      const planeM = Number(screenFrontPlaneM);
      const widthM = Number(screenWidthM);

      if (Number.isFinite(planeM) && Number.isFinite(widthM) && widthM > 0) {
        const dist = distanceFor57_5FromWidth(widthM);
        if (Number.isFinite(dist)) {
          return {
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
      if (Number.isFinite(manualY)) {
        return { effectiveRspY_m: manualY, rspSourceLabel: "Manual RSP" };
      }
      // manualRspY_m not yet set — fall through to currentMlpY_m fallback
    }

    // ── Row-derived modes ────────────────────────────────────────────────────
    if (rspMode in ROW_MODE_LABELS) {
      const precomputed = Number((rowDerivedRspYByMode ?? {})[rspMode]);
      if (Number.isFinite(precomputed)) {
        return {
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
      effectiveRspY_m: fallbackY,
      rspSourceLabel: "Current RSP",
    };
  }, [
    rspMode,
    manualRspY_m,
    screenFrontPlaneM,
    screenWidthM,
    currentMlpY_m,
    rowDerivedRspYByMode,
    // rowCentersM, seatingPositions reserved for future use
  ]);
}