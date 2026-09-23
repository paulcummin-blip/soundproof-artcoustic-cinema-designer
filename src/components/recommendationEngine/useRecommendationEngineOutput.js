// useRecommendationEngineOutput.js
// ---------------------------------------------------------------------------
// React hook for reading the Recommendation Engine output from the
// persistence store with referentially-stable snapshots.
//
// The persistence store's getRecommendation() returns a new object literal
// when the store is empty — the same useSyncExternalStore contract violation
// that caused React #185 in the recommendation authority store. This hook
// wraps getRecommendation with a stable empty-state reference so the
// snapshot is referentially stable when nothing has changed.
//
// This is a read-only consumer. It never modifies the engine output.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react';
import { subscribeRecommendation, getRecommendation } from './recommendationPersistence.js';

const EMPTY_OUTPUT = { recommendation: null, resultFingerprint: null, publishedAt: null };

/**
 * Subscribe to the Recommendation Engine output for a project/version.
 *
 * @param {string} projectId
 * @param {string} versionId
 * @returns {{ recommendation: object|null, resultFingerprint: string|null, publishedAt: string|null }}
 */
export function useRecommendationEngineOutput(projectId, versionId) {
  return useSyncExternalStore(
    subscribeRecommendation,
    () => {
      const result = getRecommendation(projectId, versionId);
      if (!result || (!result.recommendation && !result.resultFingerprint && !result.publishedAt)) {
        return EMPTY_OUTPUT;
      }
      return result;
    },
    () => EMPTY_OUTPUT,
  );
}