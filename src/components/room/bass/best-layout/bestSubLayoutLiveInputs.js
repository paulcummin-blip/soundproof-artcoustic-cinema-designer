import { useSyncExternalStore } from "react";
import { createBestSubLayoutPhysicsSnapshot } from "@/components/room/bass/best-layout/bestSubLayoutPhysicsSnapshot";

let snapshot = null;
const listeners = new Set();

export function publishBestSubLayoutLiveInputs(next) {
  snapshot = createBestSubLayoutPhysicsSnapshot(next);
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