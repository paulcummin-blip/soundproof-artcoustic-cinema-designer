// bassOptimiser.worker.js — Dedicated Web Worker for the detailed bass optimiser.
// Runs generateCandidatePool() off the main thread. Posts progress and completion
// messages back. All messages carry requestId and fingerprint for race protection.
//
// This file is a Vite worker entry — it must NOT be imported as a normal module.
// Instantiate via: new Worker(new URL("../../utils/bassOptimiser.worker.js", import.meta.url), { type: "module" })

import { generateCandidatePool } from "./bassOperatingEnvelopeOptimiser";
import {
  BASS_OPTIMISER_VERSIONS,
  createCompleteMessage,
  createErrorMessage,
  createProgressMessage,
  validateOptimiserVersions,
} from "../room/bass/bassOptimiserWorkerProtocol";

self.onmessage = (e) => {
  const { requestId, fingerprint, payload, dispatchedAtMs, identity: requestedIdentity, diagnosticToken } = e.data || {};
  const requestedCollectDiagnostics = e.data?.collectDiagnostics === true;
  const requestOrigin = e.data?.origin || "unknown";
  const workerStartupTimeMs = Number.isFinite(dispatchedAtMs) ? Math.max(0, Date.now() - dispatchedAtMs) : 0;
  const identity = {
    ...(requestedIdentity || {}), fingerprint,
    ...BASS_OPTIMISER_VERSIONS,
  };

  if (!requestId || !fingerprint) {
    self.postMessage(createErrorMessage(
      requestId || null,
      fingerprint || null,
      "Missing requestId or fingerprint in worker request",
      identity,
      diagnosticToken || null,
      requestedCollectDiagnostics,
    ));
    return;
  }

  try {
    const requestCompatibility = validateOptimiserVersions(e.data, BASS_OPTIMISER_VERSIONS);
    if (!requestCompatibility.valid) throw new Error(`Worker request incompatible: ${requestCompatibility.message}`);
    self.postMessage(createProgressMessage(requestId, fingerprint, { phase: "Worker request received" }, identity, diagnosticToken || null, requestedCollectDiagnostics));
    const pool = generateCandidatePool({
      rawCurve: payload?.rawCurve || [],
      activeSubs: payload?.activeSubs || [],
      usableLfHz: payload?.usableLfHz ?? null,
      transitionHz: payload?.transitionHz ?? 120,
      correctionEndHz: payload?.correctionEndHz ?? 200,
      perSeatRawCurves: payload?.perSeatRawCurves || [],
      perSourceComplexTransfers: payload?.perSourceComplexTransfers || [],
      normalizedTransferFingerprint: payload?.normalizedTransferFingerprint || null,
      calibrationFingerprint: payload?.calibrationFingerprint || null,
      selectedP14TargetDb: payload?.selectedP14TargetDb ?? 109,
      p14TargetBasis: payload?.p14TargetBasis ?? "minimum",
      p14TargetLevel: payload?.p14TargetLevel ?? 1,
      p18TargetBasis: payload?.p18TargetBasis ?? payload?.p14TargetBasis ?? "minimum",
      selectedP18RequiredExtensionHz: payload?.selectedP18RequiredExtensionHz ?? null,
      collectDiagnostics: requestedCollectDiagnostics,
      onProgress: (progress) => {
        self.postMessage(createProgressMessage(requestId, fingerprint, progress, identity, diagnosticToken || null, requestedCollectDiagnostics));
      },
    });
    pool.performanceSummary = { ...pool.performanceSummary, workerStartupTimeMs };
    pool.__workerTrace__ = { receivedCollectDiagnostics: requestedCollectDiagnostics, receivedDiagnosticToken: diagnosticToken || null, requestOrigin };
    self.postMessage(createProgressMessage(requestId, fingerprint, { phase: "Worker result posted", poolId: pool.poolId }, { ...identity, poolId: pool.poolId }, diagnosticToken || null, requestedCollectDiagnostics));
    self.postMessage(createCompleteMessage(requestId, fingerprint, pool, { ...identity, poolId: pool.poolId }, diagnosticToken || null, requestedCollectDiagnostics));
  } catch (err) {
    self.postMessage(createErrorMessage(
      requestId,
      fingerprint,
      err?.message || String(err) || "Unknown worker calculation error",
      identity,
      diagnosticToken || null,
      requestedCollectDiagnostics,
    ));
  }
};