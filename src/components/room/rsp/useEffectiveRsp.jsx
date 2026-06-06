/**
 * useEffectiveRsp
 * ---------------
 * Focused hook for computing the effective RSP (Reference Seating Position) Y
 * coordinate from the chosen rspMode and its associated inputs.
 *
 * Phase 1: only auto_from_screen is implemented.
 * All other modes return currentMlpY_m as a passthrough fallback so the hook
 * can be wired without changing any existing behaviour.
 *
 * Returns:
 *   { effectiveRspY_m: number|null, rspSourceLabel: string }
 */

import { useMemo } from "react";
import { distanceFor57_5FromWidth } from "@/components/room/seatingUtils";

/**
 * @param {object} params
 * @param {string}      params.rspMode          - e.g. "auto_from_screen"
 * @param {number|null} params.manualRspY_m      - explicit Y when mode is manual_position
 * @param {number}      params.screenFrontPlaneM - Y of screen front face (metres)
 * @param {number}      params.screenWidthM      - viewable screen width in metres
 * @param {number[]}    params.rowCentersM       - array of row-centre Y values (unused in Phase 1)
 * @param {object[]}    params.seatingPositions  - seat objects (unused in Phase 1)
 * @param {number|null} params.currentMlpY_m     - existing mlpY_m, used as fallback
 * @returns {{ effectiveRspY_m: number|null, rspSourceLabel: string }}
 */
export function useEffectiveRsp({
  rspMode,
  manualRspY_m,
  screenFrontPlaneM,
  screenWidthM,
  rowCentersM,
  seatingPositions,
  currentMlpY_m,
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

    // ── Fallback / unsupported modes (Phase 1) ──────────────────────────────
    // Return currentMlpY_m unchanged so wiring this hook has zero behaviour impact
    // for all modes not yet implemented.
    const fallbackY = Number.isFinite(Number(currentMlpY_m))
      ? Number(currentMlpY_m)
      : null;

    return {
      effectiveRspY_m: fallbackY,
      rspSourceLabel: "Current RSP",
    };
  }, [
    rspMode,
    screenFrontPlaneM,
    screenWidthM,
    currentMlpY_m,
    // manualRspY_m, rowCentersM, seatingPositions intentionally not reactive in Phase 1
    // — they will be added in later phases when those modes are implemented.
  ]);
}