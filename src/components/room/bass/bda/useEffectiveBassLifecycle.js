// useEffectiveBassLifecycle.js
//
// GLOBAL DISPLAY OVERRIDE for the Restore Previous Design transaction.
//
// PROBLEM: RestorePreviousDesignBar calls setRestoring(true) synchronously
// in the click handler. BassBackgroundAnalysisOwner also subscribes to
// restoreStateStore and eventually republishes shared.bassLifecycleState =
// RESTORING. But that republish is asynchronous (one React render cycle),
// so for ~300-700 ms the shared context still carries COMPLETE while the
// restore is in flight. Components reading only shared.bassLifecycleState
// (CurrentDesignBar, BassPerformanceStrip, P20SeatStrip, BassHeadlinePills)
// show "Performance is current" during that window — overlapping with
// "Restoring previous design…" from RestorePreviousDesignBar.
//
// FIX: Every visible bass status component subscribes to restoreStateStore
// directly via useIsRestoring (useSyncExternalStore). When setRestoring(true)
// fires, React notifies ALL subscribers on the same synchronous tick — before
// any of them can paint "Performance is current". Each component computes:
//
//   effectiveBassLifecycleState = restoreActive ? RESTORING : shared.bassLifecycleState
//
// and passes that to its display logic (deriveBassDisplayStatus /
// formatOfficialBassResults). No component depends solely on
// BassBackgroundAnalysisOwner eventually publishing RESTORING.
//
// This is a DISPLAY-ONLY override. It does not change restore destination
// semantics, checkpoint capture, restore data/cache logic, target-bank
// generation/persistence, bass maths, grading, ADI, or the graph shell.

import { useIsRestoring } from "./restoreStateStore";
import { BASS_LIFECYCLE_STATE } from "../bassCalculationLifecycle";

/**
 * Pure decision function — extracted for testability without React.
 *
 * @param {boolean} restoreActive - from restoreStateStore.isRestoring()
 * @param {string|null} sharedBassLifecycleState - from useSharedBassResults().bassLifecycleState
 * @returns {string} effective lifecycle state
 */
export function resolveEffectiveBassLifecycleState(restoreActive, sharedBassLifecycleState) {
  if (restoreActive) return BASS_LIFECYCLE_STATE.RESTORING;
  return sharedBassLifecycleState || BASS_LIFECYCLE_STATE.IDLE;
}

/**
 * React hook: global display override for the restore transaction.
 *
 * Subscribe to restoreStateStore so the component re-renders synchronously
 * when setRestoring(true) is called — before BassBackgroundAnalysisOwner
 * republishes shared.bassLifecycleState.
 *
 * @param {string|null} projectId
 * @param {string|null} versionId
 * @param {string|null} sharedBassLifecycleState - from useSharedBassResults().bassLifecycleState
 * @returns {string} effective lifecycle state
 */
export function useEffectiveBassLifecycleState(projectId, versionId, sharedBassLifecycleState) {
  const restoreActive = useIsRestoring(projectId, versionId);
  return resolveEffectiveBassLifecycleState(restoreActive, sharedBassLifecycleState);
}