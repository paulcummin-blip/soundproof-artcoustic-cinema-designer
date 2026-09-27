// subwooferDraftResetStore.js
//
// Shared signal store for clearing RoomVisualisation draft/last-valid sub
// positions when a restore commits new canonical positions from outside the
// drag flow (e.g. Restore Previous Design).
//
// RoomVisualisation holds draft refs (draftFrontSubsRef, draftRearSubsRef) and
// last-valid draft refs (_lastValidDraftFrontSubsRef, _lastValidDraftRearSubsRef)
// that bridge the gap between commitInstances (writes canonical) and
// useSubwooferSync (derives appState.subwoofers). After a restore, these refs
// still hold the stale moved positions, so the plan view keeps drawing the
// moved position until a page refresh.
//
// restorePreviousDesign fires this signal after committing restored positions.
// RoomVisualisation subscribes and clears its draft/last-valid refs so the plan
// redraws from the restored canonical positions immediately.

import { useEffect, useRef, useSyncExternalStore } from "react";

const signals = new Map(); // key: "projectId::versionId" -> epoch (number)
const listeners = new Set();

const keyFor = (projectId, versionId) => `${projectId}::${versionId}`;

function notify() {
  listeners.forEach((l) => l());
}

/**
 * Fire a draft-reset signal for the given project+version. RoomVisualisation
 * subscribers clear their draft/last-valid refs so the plan redraws from the
 * newly-committed canonical positions.
 */
export function fireSubwooferDraftReset(projectId, versionId) {
  if (!projectId || !versionId) return;
  const key = keyFor(projectId, versionId);
  signals.set(key, (signals.get(key) || 0) + 1);
  notify();
}

/**
 * React hook: subscribe to the draft-reset signal. Calls `onReset` when the
 * signal fires (not on initial mount). The callback is held in a ref so the
 * effect only depends on the epoch and does not re-run on parent re-renders.
 */
export function useSubwooferDraftResetSignal(projectId, versionId, onReset) {
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;
  const epoch = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => signals.get(keyFor(projectId, versionId)) || 0,
    () => signals.get(keyFor(projectId, versionId)) || 0,
  );
  const prevEpoch = useRef(epoch);
  useEffect(() => {
    if (epoch > prevEpoch.current) {
      prevEpoch.current = epoch;
      if (typeof onResetRef.current === "function") onResetRef.current();
    }
  }, [epoch]);
}