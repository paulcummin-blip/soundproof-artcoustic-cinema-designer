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

self.onmessage = (e) => {
  const { requestId, fingerprint, payload, collectDiagnostics } = e.data || {};

  if (!requestId || !fingerprint) {
    self.postMessage(createErrorMessage(
      requestId || null,
      fingerprint || null,
      "Missing requestId or fingerprint in worker request",
    ));
    return;
  }

  try {
    const pool = generateCandidatePool({
      rawCurve: payload?.rawCurve || [],
      activeSubs: payload?.activeSubs || [],
      usableLfHz: payload?.usableLfHz ?? null,
      transitionHz: payload?.transitionHz ?? 120,
      perSeatRawCurves: payload?.perSeatRawCurves || [],
      collectDiagnostics: !!collectDiagnostics,
      onProgress: (progress) => {
        self.postMessage(createProgressMessage(requestId, fingerprint, progress));
      },
    });
    self.postMessage(createCompleteMessage(requestId, fingerprint, pool));
  } catch (err) {
    self.postMessage(createErrorMessage(
      requestId,
      fingerprint,
      err?.message || String(err) || "Unknown worker calculation error",
    ));
  }
};