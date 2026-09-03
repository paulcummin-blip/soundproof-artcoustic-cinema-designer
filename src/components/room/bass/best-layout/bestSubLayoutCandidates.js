import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";
import { getSubPlacementGuideCoordinates } from "@/components/room/bass/best-layout/subPlacementGuideCoordinates";

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

function candidate(id, name, placementFamily, placementMode, points, heights, practicalTier = 1) {
  return {
    id,
    name,
    placementFamily,
    placementMode,
    practicalTier,
    sources: points.map((point, index) => source(point.x, point.y, point.placement, index, heights)),
  };
}

export function generateBestSubLayoutCandidateSet(roomDims, sourceHeights, roomElements = [], cabinetHalfExtents = null) {
  const width = Number(roomDims?.widthM), length = Number(roomDims?.lengthM);
  const heights = resolveHeights(sourceHeights);
  const diagnostics = { usedHeightFallback: heights.usedHeightFallback, sourceHeightsM: { front: heights.front, rear: heights.rear } };
  if (!(width > 0) || !(length > 0)) return { candidates: [], diagnostics };
  const guide = getSubPlacementGuideCoordinates({ widthM: width, lengthM: length, cabinetHalfExtents });
  if (!guide) return { candidates: [], diagnostics };
  const front = guide.frontY, rear = guide.rearY, left = guide.leftX, right = guide.rightX;
  const q1 = guide.quarterX1, q3 = guide.quarterX3, midX = guide.midX, midY = guide.midY;
  const yq1 = guide.quarterY1, yq3 = guide.quarterY3;
  const t1 = guide.thirdX1, t3 = guide.thirdX3;
  const make = (id, name, family, mode, points, practicalTier = 1) => candidate(id, name, family, mode, points, heights, practicalTier);
  const raw = [
    // 1 sub: practical front/rear starts plus RP22-style side-wall quarter points.
    make("front-centre-1", "Front-wall midpoint", "Front wall", "Front-wall midpoint", [{ x: midX, y: front, placement: "front" }]),
    make("front-quarter-left-1", "Front-wall 1/4", "Front wall", "Front-wall quarter point", [{ x: q1, y: front, placement: "front" }]),
    make("front-quarter-right-1", "Front-wall 3/4", "Front wall", "Front-wall three-quarter point", [{ x: q3, y: front, placement: "front" }]),
    make("rear-midpoint-1", "Rear-wall midpoint", "Rear wall", "Rear-wall midpoint", [{ x: midX, y: rear, placement: "rear" }]),
    make("left-quarter-front-1", "Left-wall 1/4", "Side wall", "Side-wall quarter point", [{ x: left, y: yq1, placement: "left" }], 3),
    make("left-quarter-rear-1", "Left-wall 3/4", "Side wall", "Side-wall three-quarter point", [{ x: left, y: yq3, placement: "left" }], 3),
    make("right-quarter-front-1", "Right-wall 1/4", "Side wall", "Side-wall quarter point", [{ x: right, y: yq1, placement: "right" }], 3),
    make("right-quarter-rear-1", "Right-wall 3/4", "Side wall", "Side-wall three-quarter point", [{ x: right, y: yq3, placement: "right" }], 3),

    // 2 subs: front/rear solutions first; side-wall midpoints are a fallback.
    make("front-rear-midpoint-2", "Front + rear midpoints", "Front + rear", "Front and rear wall midpoints", [{ x: midX, y: front, placement: "front" }, { x: midX, y: rear, placement: "rear" }]),
    make("front-quarter-2", "Front pair at 1/4 + 3/4", "Front wall", "Front-wall quarter points", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }]),
    make("front-thirds-2", "Front pair at 1/3 + 2/3", "Front wall", "Front-wall third points", [{ x: t1, y: front, placement: "front" }, { x: t3, y: front, placement: "front" }]),
    make("rear-quarter-2", "Rear pair at 1/4 + 3/4", "Rear wall", "Rear-wall quarter points", [{ x: q1, y: rear, placement: "rear" }, { x: q3, y: rear, placement: "rear" }], 2),
    make("rear-thirds-2", "Rear pair at 1/3 + 2/3", "Rear wall", "Rear-wall third points", [{ x: t1, y: rear, placement: "rear" }, { x: t3, y: rear, placement: "rear" }], 2),
    make("side-midpoints-2", "Opposing side-wall midpoints", "Side walls", "Opposing side-wall midpoints", [{ x: left, y: midY, placement: "left" }, { x: right, y: midY, placement: "right" }], 3),

    // 4 subs: all credible front/rear families precede the side-wall alternative.
    make("front-rear-pairs-4", "Front + rear pairs at 1/4 + 3/4", "Front + rear", "Front and rear quarter points", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }, { x: q1, y: rear, placement: "rear" }, { x: q3, y: rear, placement: "rear" }]),
    make("front-rear-pairs-third-4", "Front + rear pairs at 1/3 + 2/3", "Front + rear", "Front and rear third points", [{ x: t1, y: front, placement: "front" }, { x: t3, y: front, placement: "front" }, { x: t1, y: rear, placement: "rear" }, { x: t3, y: rear, placement: "rear" }]),
    make("four-corners-4", "Four corners", "Front + rear", "Four room corners", [{ x: left, y: front, placement: "front" }, { x: right, y: front, placement: "front" }, { x: left, y: rear, placement: "rear" }, { x: right, y: rear, placement: "rear" }]),
    make("four-midpoints-4", "Four wall midpoints", "Four walls", "Front, rear and side-wall midpoints", [{ x: midX, y: front, placement: "front" }, { x: midX, y: rear, placement: "rear" }, { x: left, y: midY, placement: "left" }, { x: right, y: midY, placement: "right" }], 3),
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

export function generateBestSubLayoutCandidates(roomDims, sourceHeights, cabinetHalfExtents = null) {
  return generateBestSubLayoutCandidateSet(roomDims, sourceHeights, null, cabinetHalfExtents).candidates;
}