import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";

function resolveHeights(sourceHeights) {
  const frontValid = Number.isFinite(Number(sourceHeights?.front));
  const rearValid = Number.isFinite(Number(sourceHeights?.rear));
  return {
    front: frontValid ? Number(sourceHeights.front) : C.fallbackSourceHeightM,
    rear: rearValid ? Number(sourceHeights.rear) : C.fallbackSourceHeightM,
    usedHeightFallback: { front: !frontValid, rear: !rearValid },
  };
}

const source = (x, y, placement, index, heights) => ({
  id: `layout-source-${index + 1}`,
  x, y, z: heights[placement], placement,
  tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
});

function candidate(id, name, placementFamily, placementMode, points, heights) {
  return { id, name, placementFamily, placementMode, sources: points.map((point, index) => source(point.x, point.y, point.placement, index, heights)) };
}

export function generateBestSubLayoutCandidateSet(roomDims, sourceHeights) {
  const width = Number(roomDims?.widthM), length = Number(roomDims?.lengthM);
  const heights = resolveHeights(sourceHeights);
  const diagnostics = { usedHeightFallback: heights.usedHeightFallback, sourceHeightsM: { front: heights.front, rear: heights.rear } };
  if (!(width > 0) || !(length > 0)) return { candidates: [], diagnostics };
  const front = 0, rear = length, q1 = width * 0.25, q3 = width * 0.75, mid = width * 0.5, edge = Math.max(0.02, width * 0.02);
  const make = (id, name, family, mode, points) => candidate(id, name, family, mode, points, heights);
  const raw = [
    make("front-midpoint-1", "Front midpoint", "Front only", "Midpoint", [{ x: mid, y: front, placement: "front" }]),
    make("rear-midpoint-1", "Rear midpoint", "Rear only", "Midpoint", [{ x: mid, y: rear, placement: "rear" }]),
    make("front-quarter-2", "Front quarter points", "Front only", "Quarter points", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }]),
    make("rear-quarter-2", "Rear quarter points", "Rear only", "Quarter points", [{ x: q1, y: rear, placement: "rear" }, { x: q3, y: rear, placement: "rear" }]),
    make("front-rear-midpoint-2", "Front + rear midpoints", "Front + rear", "Midpoint", [{ x: mid, y: front, placement: "front" }, { x: mid, y: rear, placement: "rear" }]),
    make("front-corners-2", "Front corners", "Front only", "Corners", [{ x: edge, y: front, placement: "front" }, { x: width - edge, y: front, placement: "front" }]),
    make("rear-corners-2", "Rear corners", "Rear only", "Corners", [{ x: edge, y: rear, placement: "rear" }, { x: width - edge, y: rear, placement: "rear" }]),
    make("front-rear-quarter-4", "Front + rear quarter points", "Front + rear", "Quarter points", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }, { x: q1, y: rear, placement: "rear" }, { x: q3, y: rear, placement: "rear" }]),
    make("front-rear-corners-4", "Front + rear corners", "Front + rear", "Corners", [{ x: edge, y: front, placement: "front" }, { x: width - edge, y: front, placement: "front" }, { x: edge, y: rear, placement: "rear" }, { x: width - edge, y: rear, placement: "rear" }]),
  ];
  const seen = new Set();
  const candidates = raw.filter((layout) => {
    const key = layout.sources.map((item) => [item.x, item.y, item.z].map((value) => value.toFixed(6)).join(",")).sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return C.allowedSourceCounts.includes(layout.sources.length) && layout.sources.length <= 4;
  });
  return { candidates, diagnostics };
}

export function generateBestSubLayoutCandidates(roomDims, sourceHeights) {
  return generateBestSubLayoutCandidateSet(roomDims, sourceHeights).candidates;
}