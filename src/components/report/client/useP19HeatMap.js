/**
 * useP19HeatMap
 * -------------
 * React hook for lazy, background P19 heat-map generation.
 *
 * - Does NOT block the normal bass calculation or report opening.
 * - Shows a clear "generating" state while the map is being computed.
 * - Caches the result by calibration fingerprint + authority version + grid + ear height.
 * - Reuses the cached map on reopen/export if the fingerprint still matches.
 * - Invalidates automatically when the bass/design authority changes.
 *
 * Returns { status, grid, gridN, error }
 *   status: "idle" | "generating" | "ready" | "error"
 */

import { useEffect, useState } from "react";
import {
  generateP19HeatMap,
  HEATMAP_AUTHORITY_VERSION,
  DEFAULT_GRID_N,
} from "./p19HeatMapEngine";
import { buildCacheKey, getCachedMap, setCachedMap } from "./p19HeatMapCache";

export function useP19HeatMap({
  completedBassAuthority,
  roomDims,
  subwooferInstances,
  rsp,
  earHeightM,
  gridN = DEFAULT_GRID_N,
}) {
  const [state, setState] = useState({ status: "idle", grid: null, gridN, error: null });

  const calibrationFingerprint = completedBassAuthority?.currentFingerprint || null;
  const contract = completedBassAuthority?.contract || null;
  const rspPostEqCurve = contract?.roomResponse?.postEqRspCurve || null;
  const selectedCandidate = contract?.selectedCandidate || null;
  const assessmentStartHz = Number.isFinite(Number(selectedCandidate?.assessmentStartHz))
    ? Number(selectedCandidate.assessmentStartHz) : 20;
  const assessmentEndHz = Number.isFinite(Number(selectedCandidate?.assessmentEndHz))
    ? Number(selectedCandidate.assessmentEndHz) : 120;

  const hasInstances = Array.isArray(subwooferInstances) && subwooferInstances.length > 0;
  const hasRoom = Number.isFinite(Number(roomDims?.widthM)) && Number.isFinite(Number(roomDims?.lengthM));
  const hasRsp = rsp && Number.isFinite(Number(rsp?.x)) && Number.isFinite(Number(rsp?.y));

  useEffect(() => {
    if (!calibrationFingerprint || !hasInstances || !hasRoom || !hasRsp) {
      setState({ status: "idle", grid: null, gridN, error: null });
      return;
    }

    const cacheKey = buildCacheKey({ calibrationFingerprint, authorityVersion: HEATMAP_AUTHORITY_VERSION, gridN, earHeightM });
    const cached = getCachedMap(cacheKey);
    if (cached && cached.grid) {
      setState({ status: "ready", grid: cached.grid, gridN: cached.gridN, error: null });
      return;
    }

    setState({ status: "generating", grid: null, gridN, error: null });

    const timeoutId = setTimeout(() => {
      try {
        const result = generateP19HeatMap({
          roomDims,
          subwooferInstances,
          rspPosition: rsp,
          rspPostEqCurve,
          assessmentStartHz,
          assessmentEndHz,
          earHeightM,
          gridN,
        });

        if (result.error) {
          setState({ status: "error", grid: null, gridN, error: result.error });
          return;
        }

        setCachedMap(cacheKey, result);
        setState({ status: "ready", grid: result.grid, gridN: result.gridN, error: null });
      } catch (e) {
        setState({ status: "error", grid: null, gridN, error: e?.message || "generation_failed" });
      }
    }, 80); // Small delay so the loading state renders first

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibrationFingerprint, hasInstances, hasRoom, hasRsp, earHeightM, gridN,
    JSON.stringify(roomDims), JSON.stringify(subwooferInstances), JSON.stringify(rsp),
    rspPostEqCurve?.length, assessmentStartHz, assessmentEndHz]);

  return state;
}