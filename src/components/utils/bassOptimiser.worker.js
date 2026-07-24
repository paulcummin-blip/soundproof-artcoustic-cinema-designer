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
  const { requestId, fingerprint, payload, collectDiagnostics, dispatchedAtMs, identity: requestedIdentity } = e.data || {};
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
    ));
    return;
  }

  try {
    const requestCompatibility = validateOptimiserVersions(e.data, BASS_OPTIMISER_VERSIONS);
    if (!requestCompatibility.valid) throw new Error(`Worker request incompatible: ${requestCompatibility.message}`);
    self.postMessage(createProgressMessage(requestId, fingerprint, { phase: "Worker request received" }, identity));
    const pool = generateCandidatePool({
      rawCurve: payload?.rawCurve || [],
      activeSubs: payload?.activeSubs || [],
      usableLfHz: payload?.usableLfHz ?? null,
      transitionHz: payload?.transitionHz ?? 120,
      correctionEndHz: payload?.correctionEndHz ?? 200,
      requestedLevel: payload?.requestedLevel ?? 4,
      p14TargetBasis: payload?.p14TargetBasis || "minimum",
      perSeatRawCurves: payload?.perSeatRawCurves || [],
      perSourceComplexTransfers: payload?.perSourceComplexTransfers || [],
      normalizedTransferFingerprint: payload?.normalizedTransferFingerprint || null,
      calibrationFingerprint: payload?.calibrationFingerprint || null,
      collectDiagnostics: !!collectDiagnostics,
      onProgress: (progress) => {
        self.postMessage(createProgressMessage(requestId, fingerprint, progress, identity));
      },
    });
    pool.performanceSummary = { ...pool.performanceSummary, workerStartupTimeMs };
    self.postMessage(createProgressMessage(requestId, fingerprint, { phase: "Worker result posted", poolId: pool.poolId }, { ...identity, poolId: pool.poolId }));
    self.postMessage(createCompleteMessage(requestId, fingerprint, pool, { ...identity, poolId: pool.poolId }));
  } catch (err) {
    self.postMessage(createErrorMessage(
      requestId,
      fingerprint,
      err?.message || String(err) || "Unknown worker calculation error",
      identity,
    ));
  }
};