import { BEST_SUB_LAYOUT_CONSTANTS } from "@/components/room/bass/best-layout/bestSubLayoutConstants";

const source = (x, y, placement, index) => ({
  id: `layout-source-${index + 1}`,
  x, y, z: BEST_SUB_LAYOUT_CONSTANTS.sourceHeightM,
  placement,
  tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
});

function candidate(id, name, placementFamily, placementMode, points) {
  return {
    id, name, placementFamily, placementMode,
    sources: points.map((point, index) => source(point.x, point.y, point.placement, index)),
  };
}

export function generateBestSubLayoutCandidates(roomDims) {
  const width = Number(roomDims?.widthM);
  const length = Number(roomDims?.lengthM);
  if (!(width > 0) || !(length > 0)) return [];
  const front = 0;
  const rear = length;
  const q1 = width * 0.25;
  const q3 = width * 0.75;
  const mid = width * 0.5;
  const edge = Math.max(0.02, width * 0.02);
  const raw = [
    candidate("front-midpoint-1", "Front midpoint", "Front only", "Midpoint", [{ x: mid, y: front, placement: "front" }]),
    candidate("rear-midpoint-1", "Rear midpoint", "Rear only", "Midpoint", [{ x: mid, y: rear, placement: "rear" }]),
    candidate("front-quarter-2", "Front quarter points", "Front only", "Quarter points", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }]),
    candidate("rear-quarter-2", "Rear quarter points", "Rear only", "Quarter points", [{ x: q1, y: rear, placement: "rear" }, { x: q3, y: rear, placement: "rear" }]),
    candidate("front-rear-midpoint-2", "Front + rear midpoints", "Front + rear", "Midpoint", [{ x: mid, y: front, placement: "front" }, { x: mid, y: rear, placement: "rear" }]),
    candidate("front-corners-2", "Front corners", "Front only", "Corners", [{ x: edge, y: front, placement: "front" }, { x: width - edge, y: front, placement: "front" }]),
    candidate("rear-corners-2", "Rear corners", "Rear only", "Corners", [{ x: edge, y: rear, placement: "rear" }, { x: width - edge, y: rear, placement: "rear" }]),
    candidate("front-rear-quarter-4", "Front + rear quarter points", "Front + rear", "Quarter points", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }, { x: q1, y: rear, placement: "rear" }, { x: q3, y: rear, placement: "rear" }]),
    candidate("front-rear-corners-4", "Front + rear corners", "Front + rear", "Corners", [{ x: edge, y: front, placement: "front" }, { x: width - edge, y: front, placement: "front" }, { x: edge, y: rear, placement: "rear" }, { x: width - edge, y: rear, placement: "rear" }]),
  ];
  const seen = new Set();
  return raw.filter((layout) => {
    const key = layout.sources.map((s) => `${s.x.toFixed(6)},${s.y.toFixed(6)},${s.z.toFixed(6)}`).sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return BEST_SUB_LAYOUT_CONSTANTS.allowedSourceCounts.includes(layout.sources.length) && layout.sources.length <= 4;
  });
}