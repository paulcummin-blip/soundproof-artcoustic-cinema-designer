import { simulateAuthoritativeBassResponse } from "./authoritativeBassResponseEngine";

self.onmessage = (event) => {
  const { generation, payload } = event.data || {};
  if (!Number.isFinite(generation)) {
    self.postMessage({ type: "error", generation: null, error: "Missing simulation generation" });
    return;
  }

  try {
    const result = simulateAuthoritativeBassResponse(payload || {});
    self.postMessage({ type: "complete", generation, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      generation,
      error: error?.message || String(error) || "Authoritative bass simulation failed",
    });
  }
};
