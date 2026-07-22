// bassOptimiser.worker.js — Dedicated Web Worker for the detailed bass optimiser.
// Runs generateCandidatePool() off the main thread. Posts progress and completion
// messages back. All messages carry requestId and fingerprint for race protection.
//
// This file is a Vite worker entry — it must NOT be imported as a normal module.
// Instantiate via: new Worker(new URL("../../utils/bassOptimiser.worker.js", import.meta.url), { type: "module" })

import { generateCandidatePool } from "./bassOperatingEnvelopeOptimiser";
import {
  createCompleteMessage,
  createErrorMessage,
  createProgressMessage,
} from "../room/bass/bassOptimiserWorkerProtocol";
import { BASS_RESULT_SCHEMA_VERSION, HOUSE_CURVE_ENGINE_VERSION } from "../room/bass/bassResultAuthority";

self.onmessage = (e) => {
  const { requestId, fingerprint, payload, collectDiagnostics, dispatchedAtMs, identity: requestedIdentity } = e.data || {};
  const workerStartupTimeMs = Number.isFinite(dispatchedAtMs) ? Math.max(0, Date.now() - dispatchedAtMs) : 0;
  const identity = {
    ...(requestedIdentity || {}), fingerprint,
    engineVersion: HOUSE_CURVE_ENGINE_VERSION,
    resultSchemaVersion: BASS_RESULT_SCHEMA_VERSION,
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
    if (requestedIdentity?.engineVersion !== HOUSE_CURVE_ENGINE_VERSION) throw new Error(`Worker engine-version mismatch: requested ${requestedIdentity?.engineVersion || "missing"}, worker ${HOUSE_CURVE_ENGINE_VERSION}`);
    if (requestedIdentity?.resultSchemaVersion !== BASS_RESULT_SCHEMA_VERSION) throw new Error(`Worker result-schema mismatch: requested ${requestedIdentity?.resultSchemaVersion ?? "missing"}, worker ${BASS_RESULT_SCHEMA_VERSION}`);
    self.postMessage(createProgressMessage(requestId, fingerprint, { phase: "Worker request received" }, identity));
    const pool = generateCandidatePool({
      rawCurve: payload?.rawCurve || [],
      activeSubs: payload?.activeSubs || [],
      usableLfHz: payload?.usableLfHz ?? null,
      transitionHz: payload?.transitionHz ?? 120,
      correctionEndHz: payload?.correctionEndHz ?? 200,
      targetAnchorDb: payload?.targetAnchorDb ?? null,
      targetAnchorSource: payload?.targetAnchorSource || null,
      perSeatRawCurves: payload?.perSeatRawCurves || [],
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