import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "@/components/room/bass/bassPhysicsDefaults";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";

export const DEFAULT_BEST_SUB_LAYOUT_PHYSICS = Object.freeze(
  buildNormalizedPhysicsOptions(BASS_NORMALIZED_PHYSICS_DEFAULTS),
);

export function createBestSubLayoutPhysicsSnapshot({ contextId, physicsOptions }) {
  const identity = String(contextId || "").trim();
  return identity && physicsOptions ? { contextId: identity, physicsOptions } : null;
}

export function selectBestSubLayoutPhysics(snapshot, contextId) {
  const identity = String(contextId || "").trim();
  return identity && snapshot?.contextId === identity && snapshot?.physicsOptions
    ? snapshot.physicsOptions
    : DEFAULT_BEST_SUB_LAYOUT_PHYSICS;
}