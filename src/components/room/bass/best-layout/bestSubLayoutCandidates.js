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
  x, y, z: placement === "rear" ? heights.rear : heights.front, placement,
  tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
});

function candidate(id, name, placementFamily, placementMode, points, heights) {
  return { id, name, placementFamily, placementMode, sources: points.map((point, index) => source(point.x, point.y, point.placement, index, heights)) };
}

export function generateBestSubLayoutCandidateSet(roomDims, sourceHeights, roomElements = []) {
  const width = Number(roomDims?.widthM), length = Number(roomDims?.lengthM);
  const heights = resolveHeights(sourceHeights);
  const diagnostics = { usedHeightFallback: heights.usedHeightFallback, sourceHeightsM: { front: heights.front, rear: heights.rear } };
  if (!(width > 0) || !(length > 0)) return { candidates: [], diagnostics };
  const inset = Math.min(C.minimumWallClearanceM, width / 4, length / 4);
  const front = inset, rear = length - inset, left = inset, right = width - inset;
  const q1 = width * 0.25, q3 = width * 0.75, midX = width * 0.5, midY = length * 0.5;
  const make = (id, name, family, mode, points) => candidate(id, name, family, mode, points, heights);
  const raw = [
    make("front-centre-1", "Front centre", "Front wall", "Front wall midpoint", [{ x: midX, y: front, placement: "front" }]),
    make("rear-midpoint-1", "Rear midpoint", "Rear wall", "Rear wall midpoint", [{ x: midX, y: rear, placement: "rear" }]),
    make("left-midpoint-1", "Left midpoint", "Side wall", "Left wall midpoint", [{ x: left, y: midY, placement: "left" }]),
    make("right-midpoint-1", "Right midpoint", "Side wall", "Right wall midpoint", [{ x: right, y: midY, placement: "right" }]),
    make("front-rear-midpoint-2", "Front + rear midpoint", "Front + rear", "Front wall midpoint + rear wall midpoint", [{ x: midX, y: front, placement: "front" }, { x: midX, y: rear, placement: "rear" }]),
    make("side-midpoints-2", "Opposite wall midpoints", "Side walls", "Opposite wall midpoint", [{ x: left, y: midY, placement: "left" }, { x: right, y: midY, placement: "right" }]),
    make("front-quarter-2", "Quarter point positions", "Front wall", "Quarter point positions", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }]),
    make("front-rear-pairs-4", "Front pair + rear pair", "Front + rear", "Front pair + rear pair", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }, { x: q1, y: rear, placement: "rear" }, { x: q3, y: rear, placement: "rear" }]),
    make("four-midpoints-4", "Four midpoint positions", "Four walls", "Four midpoint positions", [{ x: midX, y: front, placement: "front" }, { x: midX, y: rear, placement: "rear" }, { x: left, y: midY, placement: "left" }, { x: right, y: midY, placement: "right" }]),
    make("four-corners-4", "Four corner positions", "Four walls", "Four corner positions", [{ x: left, y: front, placement: "front" }, { x: right, y: front, placement: "front" }, { x: left, y: rear, placement: "rear" }, { x: right, y: rear, placement: "rear" }]),
  ];
  const openings = (Array.isArray(roomElements) ? roomElements : []).filter((element) => element?.type === "door");
  const blocked = (item) => openings.some((opening) => {
    const openingWall = opening.wall === "back" ? "rear" : opening.wall;
    if (openingWall !== item.placement) return false;
    const along = ["front", "rear"].includes(item.placement) ? item.x : item.y;
    const wallSpan = ["front", "rear"].includes(item.placement) ? width : length;
    const fractionalStart = Number(opening.x_position);
    const start = Number.isFinite(Number(opening.pos_m)) ? Number(opening.pos_m) : Number.isFinite(fractionalStart) ? fractionalStart * wallSpan : 0;
    const size = Number(opening.length_m ?? opening.width ?? 0.9);
    return along >= start - C.openingClearanceM && along <= start + size + C.openingClearanceM;
  });
  const candidates = raw.filter((layout) => C.allowedSourceCounts.includes(layout.sources.length) && layout.sources.every((item) => !blocked(item)));
  return { candidates, diagnostics: { ...diagnostics, rejectedForOpenings: raw.length - candidates.length } };
}

export function generateBestSubLayoutCandidates(roomDims, sourceHeights) {
  return generateBestSubLayoutCandidateSet(roomDims, sourceHeights).candidates;
}