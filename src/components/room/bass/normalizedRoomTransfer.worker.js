// normalizedRoomTransfer.worker.js — Phase 2B: Dedicated Web Worker for the
// normalized room-transfer engine. Runs computeNormalizedRoomTransfer off
// the main thread. All messages carry requestId and fingerprint for race
// protection.
//
// This file is a Vite worker entry — it must NOT be imported as a normal
// module. Instantiate via:
//   new Worker(new URL("./normalizedRoomTransfer.worker.js", import.meta.url), { type: "module" })
//
// The worker does NOT contain a second copy of the acoustic maths — it
// imports computeNormalizedRoomTransfer from the existing engine.

import { computeNormalizedRoomTransfer } from "./normalizedRoomTransferEngine.js";

self.onmessage = (e) => {
  const { requestId, fingerprint, payload } = e.data || {};

  if (!requestId || !fingerprint) {
    self.postMessage({
      type: "error",
      requestId: requestId || null,
      fingerprint: fingerprint || null,
      error: "Missing requestId or fingerprint in worker request",
    });
    return;
  }

  try {
    const result = computeNormalizedRoomTransfer(payload || {});

    if (result && result.status === "error") {
      self.postMessage({
        type: "error",
        requestId,
        fingerprint,
        error: result.errorMessage || "Engine returned error status",
      });
    } else {
      self.postMessage({ type: "complete", requestId, fingerprint, result });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      requestId,
      fingerprint,
      error: err?.message || String(err) || "Unknown worker calculation error",
    });
  }
};