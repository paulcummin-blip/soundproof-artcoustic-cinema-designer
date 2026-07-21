import { useLayoutEffect, useSyncExternalStore } from "react";
import { createBassAnalysisResult } from "@/components/room/bass/bassAnalysisContract";

let snapshot = { contract: createBassAnalysisResult(), onPriorityChange: null, onRetry: null };
const listeners = new Set();

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => snapshot;

export function publishBassResults(next) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function usePublishBassResults(next) {
  useLayoutEffect(() => publishBassResults(next), [next]);
}

export function useSharedBassResults() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}