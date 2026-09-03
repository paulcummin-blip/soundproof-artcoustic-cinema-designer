import { runFastBassPlacementAdvisor } from "@/components/room/bass/best-layout/fastBassPlacementAdvisorEngine";

self.onmessage = (event) => {
  const { requestId, fingerprint, payload } = event.data || {};
  try {
    const result = runFastBassPlacementAdvisor(payload);
    self.postMessage({ type: "complete", requestId, fingerprint, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      fingerprint,
      error: error?.message || String(error),
    });
  }
};
