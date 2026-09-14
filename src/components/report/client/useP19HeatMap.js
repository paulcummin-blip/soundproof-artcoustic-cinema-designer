/**
 * useP19HeatMap
 * -------------
 * React hook for lazy, background P19 heat-map generation via a Web Worker.
 *
 * Authority resolution (v2):
 *   - rspPostEqCurve  ← contract.graphPayload.postEqRspCurve
 *   - assessmentStartHz ← contract.assessmentEnvelope.assessmentStartHz
 *   - assessmentEndHz   ← contract.assessmentEnvelope.assessmentEndHz
 *
 * The old hook read from contract.roomResponse.postEqRspCurve and
 * contract.selectedCandidate.assessmentStartHz/EndHz, which are stale/empty
 * on compact contracts — causing a silent fallback to a 20–120 Hz band and
 * a uniformly FAIL map.
 *
 * No fallback: if the completed bass contract exists but the graphPayload
 * or assessmentEnvelope authority cannot be resolved, the hook returns an
 * "error" status with a clear "current bass authority incomplete" message.
 * It is better to show no map than a physically false one.
 *
 * The 30×30 generation runs in a Web Worker so the browser remains
 * interactive. Cancellation: the worker is terminated on unmount, input
 * change, fingerprint change, or supersession (generation ID guard).
 *
 * Cache identity: calibration fingerprint + heatmap authority version +
 * grid size + ear height. Only successful maps from current authority
 * are cached — error/fallback maps are never cached.
 *
 * Returns { status, grid, gridN, error, seatProbes, rspProbe }
 *   status: "idle" | "generating" | "ready" | "error"
 */

import { useEffect, useRef, useState } from "react";
import {
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
  seatPositions = [],
  gridN = DEFAULT_GRID_N,
}) {
  const [state, setState] = useState({
    status: "idle", grid: null, gridN, error: null,
    seatProbes: null, rspProbe: null,
  });
  const generationRef = useRef(0);

  // ── Authority resolution from the completed bass contract ──
  const calibrationFingerprint = completedBassAuthority?.currentFingerprint || null;
  const contract = completedBassAuthority?.contract || null;
  const graphPayload = contract?.graphPayload || null;
  const assessmentEnvelope = contract?.assessmentEnvelope || null;

  const rspPostEqCurve = Array.isArray(graphPayload?.postEqRspCurve) && graphPayload.postEqRspCurve.length > 0
    ? graphPayload.postEqRspCurve : null;
  const assessmentStartHz = Number.isFinite(Number(assessmentEnvelope?.assessmentStartHz))
    ? Number(assessmentEnvelope.assessmentStartHz) : null;
  const assessmentEndHz = Number.isFinite(Number(assessmentEnvelope?.assessmentEndHz))
    ? Number(assessmentEnvelope.assessmentEndHz) : null;

  const hasInstances = Array.isArray(subwooferInstances) && subwooferInstances.length > 0;
  const hasRoom = Number.isFinite(Number(roomDims?.widthM)) && Number.isFinite(Number(roomDims?.lengthM));
  const hasRsp = rsp && Number.isFinite(Number(rsp?.x)) && Number.isFinite(Number(rsp?.y));
  const hasAuthority = !!rspPostEqCurve && assessmentStartHz != null && assessmentEndHz != null;

  // Stable serialisation for dependency comparison
  const roomDimsKey = JSON.stringify(roomDims);
  const subsKey = JSON.stringify(subwooferInstances);
  const rspKey = JSON.stringify(rsp);
  const seatsKey = JSON.stringify(seatPositions);
  const curveLen = rspPostEqCurve?.length || 0;

  useEffect(() => {
    // Prerequisites: design inputs must exist
    if (!calibrationFingerprint || !hasInstances || !hasRoom || !hasRsp) {
      setState({ status: "idle", grid: null, gridN, error: null, seatProbes: null, rspProbe: null });
      return;
    }

    // No fallback: if the completed bass contract exists but the heat-map
    // required authority (graphPayload curves + assessmentEnvelope band)
    // cannot be resolved, show "unavailable" — never a false fallback map.
    if (!hasAuthority) {
      setState({
        status: "error", grid: null, gridN,
        error: "Heat map unavailable — current bass authority incomplete",
        seatProbes: null, rspProbe: null,
      });
      return;
    }

    // Cache check
    const cacheKey = buildCacheKey({
      calibrationFingerprint,
      authorityVersion: HEATMAP_AUTHORITY_VERSION,
      gridN,
      earHeightM,
    });
    const cached = getCachedMap(cacheKey);
    if (cached && cached.grid) {
      setState({
        status: "ready", grid: cached.grid, gridN: cached.gridN, error: null,
        seatProbes: cached.seatProbes || null, rspProbe: cached.rspProbe || null,
      });
      return;
    }

    // Start generation in a Web Worker
    setState({ status: "generating", grid: null, gridN, error: null, seatProbes: null, rspProbe: null });

    const generation = ++generationRef.current;
    const worker = new Worker(
      new URL("./p19HeatMap.worker.js", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event) => {
      const message = event.data || {};
      // Cancellation: ignore stale worker results from a superseded generation
      if (message.generation !== generation) return;

      if (message.type === "complete") {
        const result = message.result;
        if (result.error) {
          setState({
            status: "error", grid: null, gridN,
            error: result.error, seatProbes: null, rspProbe: null,
          });
        } else {
          // Cache only successful maps from current authority
          setCachedMap(cacheKey, result);
          setState({
            status: "ready", grid: result.grid, gridN: result.gridN, error: null,
            seatProbes: result.seatProbes || null, rspProbe: result.rspProbe || null,
          });
        }
      } else {
        setState({
          status: "error", grid: null, gridN,
          error: message.error || "Heat map generation failed",
          seatProbes: null, rspProbe: null,
        });
      }
      worker.terminate();
    };

    worker.onerror = (event) => {
      if (generationRef.current !== generation) return;
      setState({
        status: "error", grid: null, gridN,
        error: event?.message || "Heat map worker failed",
        seatProbes: null, rspProbe: null,
      });
      worker.terminate();
    };

    worker.postMessage({
      generation,
      payload: {
        roomDims,
        subwooferInstances,
        rspPosition: rsp,
        rspPostEqCurve,
        assessmentStartHz,
        assessmentEndHz,
        earHeightM,
        gridN,
        seatPositions,
      },
    });

    // Cancellation: terminate the worker on cleanup (unmount, input change,
    // fingerprint change, or supersession).
    return () => {
      worker.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibrationFingerprint, hasInstances, hasRoom, hasRsp, hasAuthority,
    curveLen, assessmentStartHz, assessmentEndHz, earHeightM, gridN,
    roomDimsKey, subsKey, rspKey, seatsKey]);

  return state;
}