import { useEffect, useMemo, useRef, useState } from "react";
import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { computeBestSubLayoutFingerprint } from "@/components/room/bass/best-layout/bestSubLayoutFingerprint";

export function useBestSubLayoutRecommendations({ roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights }) {
  const [state, setState] = useState({ status: "idle", result: null, error: null, isUpdating: false, measuredEndToEndMs: null });
  const workerRef = useRef(null), timerRef = useRef(null), requestRef = useRef(0), activeRef = useRef(null);
  const fingerprint = useMemo(() => {
    const validRoom = Number(roomDims?.widthM) > 0 && Number(roomDims?.lengthM) > 0 && Number(roomDims?.heightM) > 0;
    const hasSeats = Array.isArray(seatingPositions) && seatingPositions.some((seat) => Number.isFinite(seat?.x) && Number.isFinite(seat?.y));
    const hasRsp = Number.isFinite(rspPosition?.x) && Number.isFinite(rspPosition?.y);
    return validRoom && physicsOptions && (hasSeats || hasRsp) ? computeBestSubLayoutFingerprint({ roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights }) : null;
  }, [roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights]);

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
      workerRef.current.postMessage({ requestId, fingerprint, payload: { roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights } });
    }, C.debounceMs);
    return () => clearTimeout(timerRef.current);
  }, [fingerprint]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); workerRef.current?.terminate(); }, []);
  return { ...state, fingerprint };
}