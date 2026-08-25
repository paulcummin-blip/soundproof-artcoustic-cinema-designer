// stage1Fingerprint.js
// Product-independent, P14-independent, EQ-independent fingerprint for Stage 1.
// Includes ONLY inputs that affect geometric placement.

import {
  STAGE1_PLACEMENT_ALGORITHM_VERSION,
  STAGE1_FAMILY_POLICY_VERSION,
} from "./stage1Constants";
import { DEFAULT_BEST_SUB_LAYOUT_PHYSICS } from "../best-layout/bestSubLayoutPhysicsSnapshot";

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

/**
 * Compute the Stage 1 placement fingerprint.
 *
 * Includes: room dimensions, RSP coordinates, seat IDs/coordinates/heights,
 * Primary/Secondary classification, modal physics version, Stage 1 algorithm
 * version, family policy version.
 *
 * Excludes: subwoofer model, cabinet dimensions, P14 target, P18 grading basis,
 * current applied subwoofer positions, graph/UI state.
 *
 * @param {object} params
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {object} params.rspPosition — { x, y, z? }
 * @param {Array} params.seatingPositions — [{ id, x, y, z?, priority? }]
 * @param {object} params.physicsOptions — modal physics options
 * @returns {string|null} fingerprint, or null if inputs are invalid
 */
export function computeStage1Fingerprint({ roomDims, rspPosition, seatingPositions, physicsOptions }) {
  const W = Number(roomDims?.widthM);
  const L = Number(roomDims?.lengthM);
  const H = Number(roomDims?.heightM);
  if (!Number.isFinite(W) || !Number.isFinite(L) || !Number.isFinite(H) || W <= 0 || L <= 0 || H <= 0) return null;

  const hasRsp = Number.isFinite(rspPosition?.x) && Number.isFinite(rspPosition?.y);
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .filter((seat) => Number.isFinite(seat?.x) && Number.isFinite(seat?.y))
    .map((seat) => ({
      id: String(seat.id || `seat-${seat.x}-${seat.y}`),
      x: Math.round(seat.x * 1000) / 1000,
      y: Math.round(seat.y * 1000) / 1000,
      z: Number.isFinite(seat.z) ? Math.round(seat.z * 1000) / 1000 : 1.2,
      priority: seat.priority === "secondary" ? "secondary" : "primary",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (!hasRsp && seats.length === 0) return null;

  // Physics: use provided or default. Only include fields that affect modal
  // physics (not product/EQ/P14 fields — those don't exist in Stage 1 physics).
  const physics = physicsOptions || DEFAULT_BEST_SUB_LAYOUT_PHYSICS;
  const physicsIdentity = {
    surfaceAbsorption: physics.surfaceAbsorption,
    qStrategy: physics.qStrategy,
    roomDamping: physics.roomDamping,
    axialQ: physics.axialQ,
    modalSourceReferenceMode: physics.modalSourceReferenceMode,
    modalGainScalar: physics.modalGainScalar,
    modalDistanceBlend: physics.modalDistanceBlend,
    rewModalBandwidthScale: physics.rewModalBandwidthScale,
    modalCoherenceMode: physics.modalCoherenceMode,
    highOrderAxialScale: physics.highOrderAxialScale,
  };

  const canonical = {
    algorithmVersion: STAGE1_PLACEMENT_ALGORITHM_VERSION,
    familyPolicyVersion: STAGE1_FAMILY_POLICY_VERSION,
    room: { widthM: W, lengthM: L, heightM: H },
    rsp: hasRsp ? { x: Math.round(rspPosition.x * 1000) / 1000, y: Math.round(rspPosition.y * 1000) / 1000, z: Number.isFinite(rspPosition.z) ? Math.round(rspPosition.z * 1000) / 1000 : 1.2 } : null,
    seats,
    physics: physicsIdentity,
  };

  return `stage1:v1:${hash64(stable(canonical))}`;
}