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
  const q1 = guide.quarterX1, q3 = guide.quarterX3, midX = guide.midX;
  const t1 = guide.thirdX1, t3 = guide.thirdX3;
  const make = (id, name, family, mode, points, practicalTier = 1) => candidate(id, name, family, mode, points, heights, practicalTier);
  const centreOffsetX = width / 12;
  const cx1 = midX - centreOffsetX;
  const cx2 = midX + centreOffsetX;
  const raw = [
    // 1 sub: front/rear wall centre only. No side-wall positions — an installer
    // would never default a single subwoofer to the middle of a side wall.
    make("front-centre-1", "Front-wall centre", "Front wall", "Front-wall centre", [{ x: midX, y: front, placement: "front" }]),
    make("rear-centre-1", "Rear-wall centre", "Rear wall", "Rear-wall centre", [{ x: midX, y: rear, placement: "rear" }]),

    // 2 subs: practical front/rear wall layouts only.
    make("front-quarter-2", "Front-wall 1/4 points", "Front wall", "Front-wall quarter points", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }]),
    make("front-corners-2", "Front-wall corners", "Front wall", "Front-wall corners", [{ x: left, y: front, placement: "front" }, { x: right, y: front, placement: "front" }]),
    make("front-thirds-2", "Front-wall 1/3 points", "Front wall", "Front-wall third points", [{ x: t1, y: front, placement: "front" }, { x: t3, y: front, placement: "front" }]),
    make("front-rear-centre-2", "Front + rear centres", "Front + rear", "Front and rear wall centres", [{ x: midX, y: front, placement: "front" }, { x: midX, y: rear, placement: "rear" }]),

    // 4 subs: practical front/rear wall layouts only. No side-wall centres,
    // no mid-wall locations, no floating room positions — every subwoofer sits
    // on either the front wall or the rear wall.
    make("four-corners-4", "Front + rear corners", "Front + rear", "Front and rear wall corners", [{ x: left, y: front, placement: "front" }, { x: right, y: front, placement: "front" }, { x: left, y: rear, placement: "rear" }, { x: right, y: rear, placement: "rear" }]),
    make("front-rear-pairs-4", "Front + rear 1/4 points", "Front + rear", "Front and rear quarter points", [{ x: q1, y: front, placement: "front" }, { x: q3, y: front, placement: "front" }, { x: q1, y: rear, placement: "rear" }, { x: q3, y: rear, placement: "rear" }]),
    make("front-rear-pairs-third-4", "Front + rear 1/3 points", "Front + rear", "Front and rear third points", [{ x: t1, y: front, placement: "front" }, { x: t3, y: front, placement: "front" }, { x: t1, y: rear, placement: "rear" }, { x: t3, y: rear, placement: "rear" }]),
    make("front-rear-centres-4", "Front + rear centres", "Front + rear", "Front and rear wall centres", [{ x: cx1, y: front, placement: "front" }, { x: cx2, y: front, placement: "front" }, { x: cx1, y: rear, placement: "rear" }, { x: cx2, y: rear, placement: "rear" }]),
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