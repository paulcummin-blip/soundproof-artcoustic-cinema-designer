import { useSyncExternalStore } from "react";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "@/components/room/bass/bassPhysicsDefaults";

let snapshot = { physicsOptions: buildNormalizedPhysicsOptions(BASS_NORMALIZED_PHYSICS_DEFAULTS), sourceHeights: null };
const listeners = new Set();

export function publishBestSubLayoutLiveInputs(next) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function clearBestSubLayoutLiveInputs() {
  snapshot = null;
  listeners.forEach((listener) => listener());
}

export function useBestSubLayoutLiveInputs() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => snapshot,
    () => null,
  );
}