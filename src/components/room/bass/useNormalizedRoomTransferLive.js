// useNormalizedRoomTransferLive.js — Phase 2B: Live-result hook for the
// normalized room-transfer engine.
//
// Returns the product-independent room response, updated asynchronously via
// a dedicated Web Worker when geometry changes. A short trailing debounce
// (~60 ms) coalesces rapid dragging or editing. Race protection uses a
// monotonically increasing request ID AND a fingerprint ref that is updated
// immediately when the fingerprint changes — stale worker responses are
// discarded even if they complete during the debounce window. The last valid
// result remains visible while a newer result is calculating. Worker failures
// produce a recoverable error state, not a page crash. The worker is
// terminated on unmount.
//
// The fingerprint is truly product-independent: it excludes model key,
// product curve, product capability, product-derived source IDs, requested
// SPL, EQ settings, priority mode, and graph smoothing/display controls.
// Swapping SUB2-12 for SUB3-12 without moving anything produces the same
// fingerprint, queues no worker job, and leaves the displayed curve unchanged.
//
// No valid room, listener or source returns status "idle" (not an exception).
//
// Returned shape:
//   {
//     status,             // "idle" | "calculating" | "ready" | "error"
//     result,             // last valid normalized result (or null)
//     geometryFingerprint,// product-independent fingerprint (or null)
//     requestedAt,        // epoch ms of last worker post, or null
//     completedAt,        // epoch ms of last worker completion, or null
//     calculationDurationMs, // from the engine result, or null
//     errorMessage,       // string or null
//     isUpdating,         // true while a newer result is calculating
//   }

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { computeNormalizedTransferFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";

const DEBOUNCE_MS = 60;

function hasValidListener(rspPosition, seatingPositions) {
  if (rspPosition && Number.isFinite(rspPosition.x) && Number.isFinite(rspPosition.y)) return true;
  if (Array.isArray(seatingPositions) && seatingPositions.some(s => s && Number.isFinite(s.x) && Number.isFinite(s.y))) return true;
  return false;
}

function hasValidSource(subs) {
  return Array.isArray(subs) && subs.length > 0 &&
    subs.some(s => s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z));
}

function hasValidRoom(roomDims) {
  return roomDims && Number.isFinite(roomDims.widthM) && Number.isFinite(roomDims.lengthM) && Number.isFinite(roomDims.heightM);
}

export function useNormalizedRoomTransferLive({ roomDims, rspPosition, seatingPositions, subsForSimulation, physicsOptions }) {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [requestedAt, setRequestedAt] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [calculationDurationMs, setCalculationDurationMs] = useState(null);

  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  // The latest requested fingerprint — updated IMMEDIATELY when the fingerprint
  // changes, before the debounce. An in-flight worker response must match this
  // to be accepted.
  const currentFingerprintRef = useRef(null);
  // The active posted request { requestId, fingerprint }. Set when the worker
  // is posted, cleared immediately when a newer fingerprint supersedes it.
  const activeRequestRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastValidResultRef = useRef(null);
  const lastValidFingerprintRef = useRef(null);

  // Compute the product-independent fingerprint. Returns null for invalid
  // inputs (no valid room, listener, or source).
  const geometryFingerprint = useMemo(() => {
    if (!hasValidRoom(roomDims)) return null;
    if (!hasValidSource(subsForSimulation)) return null;
    if (!hasValidListener(rspPosition, seatingPositions)) return null;

    const po = physicsOptions || {};
    return computeNormalizedTransferFingerprint({
      roomDims,
      rspPosition,
      seatingPositions,
      sources: subsForSimulation,
      surfaceAbsorption: po.surfaceAbsorption,
      roomDamping: po.roomDamping,
      axialQ: po.axialQ,
      modalSourceReferenceMode: po.modalSourceReferenceMode,
      modalGainScalar: po.modalGainScalar,
      modalDistanceBlend: po.modalDistanceBlend,
      modalStorageMode: po.modalStorageMode,
      propagationPhaseScale: po.propagationPhaseScale,
      enableRewCoreReflections: po.enableReflections,
      qStrategy: po.qStrategy,
      rewModalBandwidthScale: po.rewModalBandwidthScale,
      disableReflectionPhaseJitter: po.disableReflectionPhaseJitter,
      disableReflectionCoherenceWeight: po.disableReflectionCoherenceWeight,
      disableLateField: po.disableLateField,
      disableModalPropagationPhase: po.disableModalPropagationPhase,
      mute68HzAxialMode: po.mute68HzAxialMode,
      debugDisableModalContribution: po.debugDisableModalContribution,
      rewParityFieldMode: po.rewParityFieldMode,
      overrideConstantAxialQ: po.overrideConstantAxialQ,
      overrideAbsorptionAxialQ: po.overrideAbsorptionAxialQ,
      debugMode200Multiplier: po.debugMode200Multiplier,
      debugModalPhaseConvention: po.debugModalPhaseConvention,
      reflectionGainScale: po.reflectionGainScale,
      debugModalHSign: po.debugModalHSign,
      rewParityModalMagnitudeScale: po.rewParityModalMagnitudeScale,
      modalCoherenceMode: po.modalCoherenceMode,
      highOrderAxialScale: po.highOrderAxialScale,
    });
  }, [roomDims, rspPosition, seatingPositions, subsForSimulation, physicsOptions]);

  // Lazily create the worker (reused across calculations). Terminated on
  // unmount by the cleanup effect.
  const ensureWorker = useCallback(() => {
    if (!workerRef.current && typeof Worker !== "undefined") {
      workerRef.current = new Worker(
        new URL("./normalizedRoomTransfer.worker.js", import.meta.url),
        { type: "module" }
      );
      workerRef.current.onmessage = (e) => {
        const msg = e.data || {};
        const active = activeRequestRef.current;
        // Race protection: accept a response only when BOTH its request ID
        // AND fingerprint match the latest active request, AND the active
        // request is still the current fingerprint. This prevents an old
        // request completing during the debounce from becoming "ready".
        if (!active) return;
        if (msg.requestId !== active.requestId) return;
        if (msg.fingerprint !== active.fingerprint) return;
        if (active.fingerprint !== currentFingerprintRef.current) return;

        if (msg.type === "complete") {
          lastValidResultRef.current = msg.result;
          lastValidFingerprintRef.current = active.fingerprint;
          setResult(msg.result);
          setCompletedAt(Date.now());
          setCalculationDurationMs(msg.result?.calculationDurationMs ?? null);
          setErrorMessage(null);
          setStatus("ready");
        } else if (msg.type === "error") {
          setErrorMessage(msg.error || "Unknown error");
          setStatus("error");
        }
      };
      workerRef.current.onerror = (e) => {
        // Only surface the error if it belongs to the current request.
        const active = activeRequestRef.current;
        if (!active || active.fingerprint !== currentFingerprintRef.current) return;
        setErrorMessage(e?.message || "Worker error");
        setStatus("error");
      };
    }
    return workerRef.current;
  }, []);

  // Debounced effect: when the fingerprint changes, invalidate any in-flight
  // request IMMEDIATELY (before the debounce), then start a worker after a
  // short trailing debounce. The last valid result remains visible while the
  // newer result is calculating (status "calculating", result unchanged).
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // IMMEDIATELY invalidate any in-flight worker response by incrementing the
    // request token and storing the new fingerprint. An old request completing
    // during the 60 ms debounce will fail the requestId/fingerprint match in
    // onmessage and be discarded — it must never become "ready".
    const newRequestId = ++requestIdRef.current;
    currentFingerprintRef.current = geometryFingerprint;
    activeRequestRef.current = null;

    if (!geometryFingerprint) {
      setStatus("idle");
      return;
    }

    // Same fingerprint as the last completed result — no work needed.
    if (lastValidFingerprintRef.current === geometryFingerprint && lastValidResultRef.current) {
      setStatus("ready");
      setResult(lastValidResultRef.current);
      return;
    }

    // Mark as calculating (previous result stays visible via `result` state).
    setStatus("calculating");

    const fp = geometryFingerprint;
    const payload = { roomDims, rspPosition, seatingPositions, subsForSimulation, physicsOptions };

    debounceTimerRef.current = setTimeout(() => {
      const worker = ensureWorker();
      if (!worker) return;
      // Guard: a newer fingerprint may have superseded us during the debounce.
      if (currentFingerprintRef.current !== fp) return;

      activeRequestRef.current = { requestId: newRequestId, fingerprint: fp };
      setRequestedAt(Date.now());
      worker.postMessage({ requestId: newRequestId, fingerprint: fp, payload });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryFingerprint]);

  // Cleanup on unmount — terminate worker and clear timer.
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  return {
    status,
    result,
    geometryFingerprint,
    requestedAt,
    completedAt,
    calculationDurationMs,
    errorMessage,
    isUpdating: status === "calculating",
  };
}