import { BEST_SUB_LAYOUT_CONSTANTS as C } from "@/components/room/bass/best-layout/bestSubLayoutConstants";

function stable(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function hash64(text) {
  const hash = (seed) => {
    let value = seed;
    for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
    return (value >>> 0).toString(16).padStart(8, "0");
  };
  return hash(0x811c9dc5) + hash(0x40007a67);
}

export function computeBestSubLayoutFingerprint({ roomDims, seatingPositions, rspPosition, physicsOptions, sourceHeights }) {
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : []).map((seat) => ({ x: seat?.x, y: seat?.y, z: seat?.z ?? 1.2 })).sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
  const canonical = {
    version: C.candidateDefinitionVersion,
    room: { widthM: roomDims?.widthM, lengthM: roomDims?.lengthM, heightM: roomDims?.heightM },
    seats,
    rsp: seats.length ? null : { x: rspPosition?.x, y: rspPosition?.y, z: rspPosition?.z ?? 1.2 },
    sourceHeights: {
      front: Number.isFinite(Number(sourceHeights?.front)) ? Number(sourceHeights.front) : C.fallbackSourceHeightM,
      rear: Number.isFinite(Number(sourceHeights?.rear)) ? Number(sourceHeights.rear) : C.fallbackSourceHeightM,
    },
    physics: physicsOptions || {},
  };
  return `layout:v2:${hash64(stable(canonical))}`;
}