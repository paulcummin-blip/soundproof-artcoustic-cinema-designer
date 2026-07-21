import { runBestSubLayoutRecommendation } from "@/components/room/bass/best-layout/bestSubLayoutEngine";

self.onmessage = (event) => {
  const { requestId, fingerprint, payload } = event.data || {};
  try {
    self.postMessage({ type: "complete", requestId, fingerprint, result: runBestSubLayoutRecommendation(payload) });
  } catch (error) {
    self.postMessage({ type: "error", requestId, fingerprint, error: error?.message || String(error) });
  }
};