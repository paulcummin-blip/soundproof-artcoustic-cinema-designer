// normalizedRoomTransfer.worker.js — Phase 2B: Dedicated Web Worker for the
// normalized room-transfer engine. Runs computeNormalizedRoomTransfer off
// the main thread. All messages carry generation, fingerprint and quality
// for two-stage race protection.
//
// This file is a Vite worker entry — it must NOT be imported as a normal
// module. Instantiate via:
//   new Worker(new URL("./normalizedRoomTransfer.worker.js", import.meta.url), { type: "module" })
//
// The worker does NOT contain a second copy of the acoustic maths — it
// imports computeNormalizedRoomTransfer from the existing engine.
//
// Both the preview worker and the refinement worker use this same entry
// point. The caller decides which physics options to send (preview vs
// refinement) and sets quality accordingly.

import { computeNormalizedRoomTransfer } from "./normalizedRoomTransferEngine.js";

self.onmessage = (e) => {
  const { generation, fingerprint, quality, payload } = e.data || {};

  if (!fingerprint || !Number.isFinite(generation)) {
    self.postMessage({
      type: "error",
      generation: Number.isFinite(generation) ? generation : null,
      fingerprint: fingerprint || null,
      quality: quality || null,
      error: "Missing generation or fingerprint in worker request",
    });
    return;
  }

  try {
    const result = computeNormalizedRoomTransfer(payload || {});

    if (result && result.status === "error") {
      self.postMessage({
        type: "error",
        generation,
        fingerprint,
        quality,
        error: result.errorMessage || "Engine returned error status",
      });
    } else {
      self.postMessage({ type: "complete", generation, fingerprint, quality, result });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      generation,
      fingerprint,
      quality,
      error: err?.message || String(err) || "Unknown worker calculation error",
    });
  }
};