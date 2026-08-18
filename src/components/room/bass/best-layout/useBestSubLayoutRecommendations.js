import { useEffect, useMemo, useRef, useState } from "react";
import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { computeBestSubLayoutFingerprint } from "@/components/room/bass/best-layout/bestSubLayoutFingerprint";
import { useAppState } from "@/components/AppStateProvider";
import { INSTANCE_STATUS } from "@/components/utils/subwooferInstanceCompatibility";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { subHalfExtents } from "@/components/room/rv/utils/subWallOrientation";

export function useBestSubLayoutRecommendations({ roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights, roomElements, currentSubs, finalOptimisedBassResponse }) {
  const appState = useAppState();
  const instanceStatus = appState?.subwooferInstancesStatus ?? INSTANCE_STATUS.UNINITIALISED;
  const isBlocked = instanceStatus === INSTANCE_STATUS.ERROR || instanceStatus === INSTANCE_STATUS.UNINITIALISED;
  const [state, setState] = useState({ status: "idle", result: null, error: null, isUpdating: false, measuredEndToEndMs: null });
  const workerRef = useRef(null), timerRef = useRef(null), requestRef = useRef(0), activeRef = useRef(null);
  // Derive cabinet half-extents from the first enabled instance so candidate
  // wall positions resolve to the same physically valid centre as magnetic
  // drag snapping (getSubPlacementGuideCoordinates parity).
  const cabinetHalfExtents = useMemo(() => {
    const instances = appState?.subwooferInstances;
    if (!Array.isArray(instances) || instances.length === 0) return null;
    const first = instances.find((i) => i?.enabled !== false && i?.model);
    if (!first?.model) return null;
    const meta = getSpeakerModelMeta(first.model);
    if (!meta) return null;
    const w = Number(meta.widthM) || 0.5;
    const d = Number(meta.depthM) || 0.3;
    return subHalfExtents(w, d, 0);
  }, [appState?.subwooferInstances]);

  const fingerprint = useMemo(() => {
    if (isBlocked) return null;
    const validRoom = Number(roomDims?.widthM) > 0 && Number(roomDims?.lengthM) > 0 && Number(roomDims?.heightM) > 0;
    const hasSeats = Array.isArray(seatingPositions) && seatingPositions.some((seat) => Number.isFinite(seat?.x) && Number.isFinite(seat?.y));
    const hasRsp = Number.isFinite(rspPosition?.x) && Number.isFinite(rspPosition?.y);
    return validRoom && physicsOptions && (hasSeats || hasRsp) ? `${computeBestSubLayoutFingerprint({ roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights, roomElements, currentSubs, cabinetHalfExtents })}|post-eq:${finalOptimisedBassResponse?.selectedCandidateId || "none"}:${finalOptimisedBassResponse?.postEqCurveSignature || "none"}` : null;
  }, [isBlocked, roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights, roomElements, currentSubs, cabinetHalfExtents, finalOptimisedBassResponse?.selectedCandidateId, finalOptimisedBassResponse?.postEqCurveSignature]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!fingerprint) { setState((prev) => ({ ...prev, status: "idle", isUpdating: false })); return; }
    const requestId = ++requestRef.current, requestCreatedAt = performance.now();
    activeRef.current = { requestId, fingerprint, requestCreatedAt };
    setState((prev) => ({ ...prev, status: prev.result ? "ready" : "calculating", isUpdating: true, error: null }));
    timerRef.current = setTimeout(() => {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL("./bestSubLayout.worker.js", import.meta.url), { type: "module" });
        workerRef.current.onmessage = (event) => {
          const message = event.data || {}, active = activeRef.current;
          if (!active || message.requestId !== active.requestId || message.fingerprint !== active.fingerprint) return;
          if (message.type === "complete") setState({ status: "ready", result: message.result, error: null, isUpdating: false, measuredEndToEndMs: performance.now() - active.requestCreatedAt });
          else setState((prev) => ({ ...prev, status: "error", error: message.error, isUpdating: false }));
        };
      }
      workerRef.current.postMessage({ requestId, fingerprint, payload: { roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights, roomElements, currentSubs, finalOptimisedBassResponse, cabinetHalfExtents } });
    }, C.debounceMs);
    return () => clearTimeout(timerRef.current);
  }, [fingerprint]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); workerRef.current?.terminate(); }, []);
  return { ...state, fingerprint };
}