// useBassDetailedCalculation.js — React hook managing the Web Worker lifecycle
// for the detailed bass optimiser. Handles race protection (requestId + fingerprint
// matching), cancellation, elapsed timer, and out-of-date detection.
//
// States: IDLE | CALCULATING | COMPLETE | OUT_OF_DATE | CANCELLED | ERROR

import { useState, useRef, useCallback, useEffect } from "react";

const IS_DEV = false; // Set true to enable structured-clone validation

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

export function useBassDetailedCalculation() {
  const [status, setStatus] = useState("IDLE");
  const [detailedResult, setDetailedResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const workerRef = useRef(null);
  const activeRequestRef = useRef(null);
  const storedFingerprintRef = useRef(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    activeRequestRef.current = null;
  }, []);

  const calculate = useCallback((fingerprint, payload, collectDiagnostics) => {
    if (!fingerprint) return;

    // Terminate any existing worker (race protection / fresh start)
    terminateWorker();
    stopTimer();

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeRequestRef.current = { requestId, fingerprint };
    startTimeRef.current = now();

    setStatus("CALCULATING");
    setProgress({ phase: "Preparing response curves", completedRequests: 0, totalRequests: 0, uniqueCoreFits: 0, bankEvaluations: 0 });
    setError(null);
    setElapsedMs(0);

    // Elapsed timer — updates ~every 200ms, independent of worker progress
    timerRef.current = setInterval(() => {
      setElapsedMs(now() - startTimeRef.current);
    }, 200);

    try {
      const worker = new Worker(
        new URL("../../utils/bassOptimiser.worker.js", import.meta.url),
        { type: "module" }
      );
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const msg = e.data || {};
        const active = activeRequestRef.current;
        // Race protection: ignore stale results
        if (!active || msg.requestId !== active.requestId || msg.fingerprint !== active.fingerprint) return;

        if (msg.type === "progress") {
          setProgress(msg.progress);
        } else if (msg.type === "complete") {
          const transferStart = now();
          let pool = msg.pool;
          if (IS_DEV) {
            try { pool = structuredClone(pool); } catch (err) { console.warn("[BassDetailedCalc] structuredClone failed on result:", err); }
          }
          const transferTimeMs = now() - transferStart;
          const calculationTimeMs = now() - startTimeRef.current;
          storedFingerprintRef.current = fingerprint;
          setDetailedResult({ pool, fingerprint, calculationTimeMs, transferTimeMs });
          setStatus("COMPLETE");
          stopTimer();
          terminateWorker();
        } else if (msg.type === "error") {
          setError(msg.error || "Unknown error");
          setStatus("ERROR");
          stopTimer();
          terminateWorker();
        }
      };

      worker.onerror = (e) => {
        const active = activeRequestRef.current;
        if (!active) return;
        setError(e?.message || "Worker error");
        setStatus("ERROR");
        stopTimer();
        terminateWorker();
      };

      // Structured-clone validation (dev only)
      let safePayload = payload;
      if (IS_DEV) {
        try { safePayload = structuredClone(payload); } catch (err) { console.warn("[BassDetailedCalc] structuredClone failed on payload:", err); }
      }

      worker.postMessage({ requestId, fingerprint, payload: safePayload, collectDiagnostics: !!collectDiagnostics });
    } catch (err) {
      setError(err?.message || String(err) || "Failed to start worker");
      setStatus("ERROR");
      stopTimer();
    }
  }, [terminateWorker, stopTimer]);

  const cancel = useCallback(() => {
    terminateWorker();
    stopTimer();
    setStatus("CANCELLED");
  }, [terminateWorker, stopTimer]);

  const handleFingerprintChange = useCallback((fingerprint) => {
    // Terminate any running worker (physical inputs changed during calculation)
    terminateWorker();
    stopTimer();

    if (!storedFingerprintRef.current) {
      setStatus("IDLE");
    } else if (storedFingerprintRef.current !== fingerprint) {
      setStatus("OUT_OF_DATE");
    } else {
      // Stored fingerprint matches current — result is valid again (e.g. input reverted)
      setStatus("COMPLETE");
    }
  }, [terminateWorker, stopTimer]);

  // Cleanup on unmount — terminate worker and clear timer
  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { status, detailedResult, progress, error, elapsedMs, calculate, cancel, handleFingerprintChange };
}