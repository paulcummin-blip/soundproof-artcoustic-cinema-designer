import { useEffect, useMemo, useRef, useState } from "react";
import { computeBestSubLayoutFingerprint } from "@/components/room/bass/best-layout/bestSubLayoutFingerprint";
import { useAppState } from "@/components/AppStateProvider";
import { INSTANCE_STATUS } from "@/components/utils/subwooferInstanceCompatibility";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { subHalfExtents } from "@/components/room/rv/utils/subWallOrientation";

const ADVISOR_DEBOUNCE_MS = 180;

export function useFastBassPlacementAdvisor({
  roomDims,
  seatingPositions,
  rspPosition,
  physicsOptions,
  sourceHeights,
  roomElements,
}) {
  const appState = useAppState();
  const instanceStatus = appState?.subwooferInstancesStatus ?? INSTANCE_STATUS.UNINITIALISED;
  const blocked = instanceStatus === INSTANCE_STATUS.ERROR
    || instanceStatus === INSTANCE_STATUS.UNINITIALISED;
  const [state, setState] = useState({
    status: "idle",
    result: null,
    error: null,
    measuredEndToEndMs: null,
  });
  const workerRef = useRef(null);
  const requestSequenceRef = useRef(0);

  const cabinetHalfExtents = useMemo(() => {
    const instances = Array.isArray(appState?.subwooferInstances)
      ? appState.subwooferInstances
      : [];
    const first = instances.find((instance) => instance?.enabled !== false && instance?.model);
    const meta = first?.model ? getSpeakerModelMeta(first.model) : null;
    if (!meta) return null;
    return subHalfExtents(Number(meta.widthM) || 0.5, Number(meta.depthM) || 0.3, 0);
  }, [appState?.subwooferInstances]);

  const fingerprint = useMemo(() => {
    const validRoom = Number(roomDims?.widthM) > 0
      && Number(roomDims?.lengthM) > 0
      && Number(roomDims?.heightM) > 0;
    const hasSeats = Array.isArray(seatingPositions)
      && seatingPositions.some((seat) => Number.isFinite(seat?.x) && Number.isFinite(seat?.y));
    const hasRsp = Number.isFinite(rspPosition?.x) && Number.isFinite(rspPosition?.y);
    if (blocked || !validRoom || !physicsOptions || (!hasSeats && !hasRsp)) return null;
    return computeBestSubLayoutFingerprint({
      roomDims,
      seatingPositions,
      rspPosition,
      physicsOptions,
      sourceHeights,
      roomElements,
      currentSubs: [],
      cabinetHalfExtents,
    });
  }, [
    blocked,
    roomDims,
    seatingPositions,
    rspPosition,
    physicsOptions,
    sourceHeights,
    roomElements,
    cabinetHalfExtents,
  ]);

  useEffect(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (!fingerprint) {
      setState({ status: "idle", result: null, error: null, measuredEndToEndMs: null });
      return undefined;
    }

    const requestId = ++requestSequenceRef.current;
    const started = performance.now();
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const worker = new Worker(
        new URL("./fastBassPlacementAdvisor.worker.js", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      setState((previous) => ({
        ...previous,
        status: previous.result ? "refreshing" : "calculating",
        error: null,
      }));
      worker.onmessage = (event) => {
        const message = event.data || {};
        if (cancelled
          || message.requestId !== requestId
          || message.fingerprint !== fingerprint) return;
        if (message.type === "complete") {
          setState({
            status: "ready",
            result: message.result,
            error: null,
            measuredEndToEndMs: performance.now() - started,
          });
        } else {
          setState((previous) => ({
            ...previous,
            status: "error",
            error: message.error || "Placement advice could not be prepared.",
          }));
        }
      };
      worker.postMessage({
        requestId,
        fingerprint,
        payload: {
          roomDims,
          seatingPositions,
          rspPosition,
          physicsOptions,
          sourceHeights,
          roomElements,
          cabinetHalfExtents,
        },
      });
    }, ADVISOR_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [fingerprint]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  return { ...state, fingerprint };
}
