/**
 * p19HeatMap.worker.js
 * --------------------
 * Web Worker for background P19 heat-map generation.
 *
 * Runs generateP19HeatMap off the main React/render thread so the browser
 * remains interactive during the 30×30 grid computation.
 *
 * Protocol:
 *   In:  { generation: number, payload: { ...generateP19HeatMap args } }
 *   Out: { type: "complete", generation, result }
 *         { type: "error",    generation, error }
 */
import { generateP19HeatMap } from "./p19HeatMapEngine";

self.onmessage = (event) => {
  const { generation, payload } = event.data || {};
  if (!Number.isFinite(generation)) {
    self.postMessage({ type: "error", generation: null, error: "Missing generation" });
    return;
  }
  try {
    const result = generateP19HeatMap(payload || {});
    self.postMessage({ type: "complete", generation, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      generation,
      error: error?.message || String(error) || "P19 heat map generation failed",
    });
  }
};