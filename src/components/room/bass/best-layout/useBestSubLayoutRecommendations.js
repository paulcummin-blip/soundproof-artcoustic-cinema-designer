import { useEffect, useMemo, useRef, useState } from "react";
import { buildNormalizedPhysicsOptions, buildPreviewPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { BEST_SUB_LAYOUT_CONSTANTS as C, BEST_SUB_LAYOUT_PHYSICS_PARAMS } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { computeBestSubLayoutFingerprint } from "@/components/room/bass/best-layout/bestSubLayoutFingerprint";

export function useBestSubLayoutRecommendations({ roomDims, seatingPositions, rspPosition }) {
  const [state, setState] = useState({ status: "idle", result: null, error: null, isUpdating: false, endToEndMs: null });
  const workerRef = useRef(null);
  const timerRef = useRef(null);
  const requestRef = useRef(0);
  const activeRef = useRef(null);
  const startedRef = useRef(null);
  const physicsOptions = useMemo(() => buildPreviewPhysicsOptions(buildNormalizedPhysicsOptions(BEST_SUB_LAYOUT_PHYSICS_PARAMS)), []);
  const fingerprint = useMemo(() => {
    const validRoom = Number(roomDims?.widthM) > 0 && Number(roomDims?.lengthM) > 0 && Number(roomDims?.heightM) > 0;
    const hasSeats = Array.isArray(seatingPositions) && seatingPositions.some((seat) => Number.isFinite(seat?.x) && Number.isFinite(seat?.y));
    const hasRsp = Number.isFinite(rspPosition?.x) && Number.isFinite(rspPosition?.y);
    return validRoom && (hasSeats || hasRsp) ? computeBestSubLayoutFingerprint({ roomDims, seatingPositions, rspPosition, physicsOptions }) : null;
  }, [roomDims, seatingPositions, rspPosition, physicsOptions]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!fingerprint) { setState((prev) => ({ ...prev, status: "idle", isUpdating: false })); return; }
    const requestId = ++requestRef.current;
    activeRef.current = { requestId, fingerprint };
    startedRef.current = performance.now();
    setState((prev) => ({ ...prev, status: prev.result ? "ready" : "calculating", isUpdating: true, error: null }));
    timerRef.current = setTimeout(() => {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL("./bestSubLayout.worker.js", import.meta.url), { type: "module" });
        workerRef.current.onmessage = (event) => {
          const message = event.data || {};
          const active = activeRef.current;
          if (!active || message.requestId !== active.requestId || message.fingerprint !== active.fingerprint) return;
          if (message.type === "complete") setState({ status: "ready", result: message.result, error: null, isUpdating: false, endToEndMs: performance.now() - startedRef.current });
          else setState((prev) => ({ ...prev, status: "error", error: message.error, isUpdating: false }));
        };
      }
      workerRef.current.postMessage({ requestId, fingerprint, payload: { roomDims, seatingPositions, rspPosition } });
    }, C.debounceMs);
    return () => clearTimeout(timerRef.current);
  }, [fingerprint]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); workerRef.current?.terminate(); }, []);
  return { ...state, fingerprint };
}