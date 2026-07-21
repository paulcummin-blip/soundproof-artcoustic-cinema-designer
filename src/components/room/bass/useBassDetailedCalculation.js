import { useCallback, useEffect, useSyncExternalStore } from "react";
import { bassBackgroundAnalysisStore } from "@/components/room/bass/bassBackgroundAnalysisStore";

const LEGACY_STATUS = {
  idle: "IDLE", queued: "QUEUED", calculating: "CALCULATING",
  ready: "COMPLETE", stale: "OUT_OF_DATE", error: "ERROR",
};

export function useBassDetailedCalculation({ fingerprint, payload, valid, collectDiagnostics = false } = {}) {
  const lifecycle = useSyncExternalStore(
    bassBackgroundAnalysisStore.subscribe,
    bassBackgroundAnalysisStore.getSnapshot,
    bassBackgroundAnalysisStore.getSnapshot,
  );

  useEffect(() => {
    bassBackgroundAnalysisStore.updateInputs({ valid, fingerprint, payload, collectDiagnostics });
  }, [valid, fingerprint, payload, collectDiagnostics]);

  useEffect(() => () => bassBackgroundAnalysisStore.dispose(), []);

  const calculate = useCallback((nextFingerprint = fingerprint, nextPayload = payload, diagnostics = collectDiagnostics) => (
    bassBackgroundAnalysisStore.requestManual({ fingerprint: nextFingerprint, payload: nextPayload, collectDiagnostics: diagnostics, force: true })
  ), [fingerprint, payload, collectDiagnostics]);

  const cancel = useCallback(() => bassBackgroundAnalysisStore.dispose(), []);

  return {
    lifecycle,
    status: LEGACY_STATUS[lifecycle.status] || "IDLE",
    detailedResult: lifecycle.status === "ready" && lifecycle.resultFingerprint === lifecycle.currentCalibrationFingerprint ? lifecycle.result : null,
    progress: lifecycle.progress,
    error: lifecycle.errorMessage,
    elapsedMs: lifecycle.elapsedMs || 0,
    calculate,
    cancel,
    handleFingerprintChange: () => {},
  };
}