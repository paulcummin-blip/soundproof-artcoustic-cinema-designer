/**
 * useEffectiveRsp
 * ---------------
 * Focused hook for computing the effective RSP (Reference Seating Position)
 * from the chosen rspMode and its associated inputs.
 *
 * Thin memoised wrapper around the pure computeEffectiveRsp() authority,
 * which is shared with project hydration (hydrateProjectIntoAppState) so
 * the first hydration-ready render produces the same RSP as the settled
 * state — no transient rsp:null fingerprint.
 *
 * Stage B1: Returns both X and Y coordinates.
 *   AUTO / row-derived / MANUAL: X = room centreline (roomWidthM / 2)
 *   MANUAL drag is Y-axis only — manualRspX_m is ignored (schema-compatible only).
 *
 * Returns:
 *   { effectiveRspX_m: number|null, effectiveRspY_m: number|null, rspSourceLabel: string }
 */

import { useMemo } from "react";
import { computeEffectiveRsp } from "./computeEffectiveRsp";

export { computeEffectiveRsp };

export function useEffectiveRsp(params) {
  return useMemo(
    () => computeEffectiveRsp(params),
    [
      params?.rspMode,
      params?.manualRspY_m,
      params?.manualRspX_m,
      params?.roomWidthM,
      params?.screenFrontPlaneM,
      params?.screenWidthM,
      params?.currentMlpY_m,
      params?.rowDerivedRspYByMode,
      params?.designatedRspSeat?.id,
      params?.designatedRspSeat?.x,
      params?.designatedRspSeat?.y,
      // rowCentersM, seatingPositions reserved for future use
    ]
  );
}