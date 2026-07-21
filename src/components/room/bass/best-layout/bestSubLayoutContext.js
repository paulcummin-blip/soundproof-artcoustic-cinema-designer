import { canonicalizeRoomDims } from "@/components/room/bass/normalizedRoomInputAdapters";

const contextNumber = (value) => Number(value).toFixed(6);

// A stable project ID is authoritative. The geometry fingerprint is the documented
// fallback when the host does not expose a project/design identity.
export function resolveBestSubLayoutContextId({ projectId, roomDims }) {
  const stableId = String(projectId || "").trim();
  if (stableId) return `project:${stableId}`;
  const room = canonicalizeRoomDims(roomDims);
  return room ? `room:${contextNumber(room.widthM)}:${contextNumber(room.lengthM)}:${contextNumber(room.heightM)}` : null;
}