// optimiserRecommendationPublication.js
// ---------------------------------------------------------------------------
// ONE PUBLICATION OPERATION for a completed optimiser run.
//
// A run reaches the publication of its recommendation from two places:
//
//   1. the run itself, which publishes the recommendation it generated as soon
//      as the optimiser returns (so the reasoning survives an interruption
//      before the plan exists), keyed by the fingerprint the engine produced;
//   2. the run's saving step, which publishes the SAME recommendation together
//      with the evaluated plan it just built, keyed by the fingerprint of the
//      published bass result.
//
// Both write the same slot of the same record (the recommendation inside the
// completed snapshot for a result fingerprint), serialised through the same
// write queue. So when the two keys are THE SAME KEY, the first write is
// entirely superseded by the second and only costs a full cache read + write
// cycle in the middle of the handoff. When the keys DIFFER, each write lands on
// its own snapshot and both must be kept.
//
// THE RULE THIS MODULE ENFORCES:
//
//   same project · same version · same run · same design · SAME result
//   fingerprint  →  ONE write, carrying exactly what the last write carried
//   different result fingerprints  →  BOTH writes, in their original order
//
// Consolidation is therefore provably state-preserving: the slot ends up with
// the same content it would have had, because the single write is the LAST of
// the two, and the earlier write's snapshot is only dropped when it is the same
// snapshot the later write overwrites anyway.
//
// It never decides what a recommendation says, never re-derives a figure, and
// changes no optimiser maths, ranking, materiality or persistence authority.
// ---------------------------------------------------------------------------

import { publishRecommendation } from "@/components/recommendationEngine";
import { getPublicationAttempts } from "@/components/recommendationEngine/recommendationPersistence";
import {
  RUN_TIMING,
  recordPublicationRetries,
  recordRunTiming,
} from "./optimiserRunTimings.js";

/** Whether the two requests were consolidated into one, or kept separate. */
export const RECOMMENDATION_PUBLICATION_MODE = Object.freeze({
  NONE: "none",
  CONSOLIDATED: "consolidated",
  SEPARATE: "separate",
});

const usable = (value) => (typeof value === "string" && value.trim() ? value : null);

/**
 * WHICH WRITES THIS RUN ACTUALLY NEEDS.
 *
 * @param {object} params
 * @param {string|null} params.runFingerprint - the key the run's own immediate
 *   publication would use
 * @param {string|null} params.savedFingerprint - the key the saving step's
 *   publication uses (the published bass result's own fingerprint)
 * @returns {{mode: string, writes: Array<{fingerprint: string, withPlan: boolean}>, reason: string}}
 */
export function planRecommendationPublication({ runFingerprint = null, savedFingerprint = null } = {}) {
  const run = usable(runFingerprint);
  const saved = usable(savedFingerprint);

  if (run && saved && run === saved) {
    // Same result: the run's own earlier write is the write the saving step
    // overwrites with the plan attached. One write, carrying what the last one
    // carried.
    return {
      mode: RECOMMENDATION_PUBLICATION_MODE.CONSOLIDATED,
      writes: [{ fingerprint: saved, withPlan: true }],
      reason: "same-result-fingerprint",
    };
  }

  if (run && saved) {
    // Different snapshots: both writes are real and both are kept, in the order
    // they have always happened (the run's own first, then the saving step's).
    return {
      mode: RECOMMENDATION_PUBLICATION_MODE.SEPARATE,
      writes: [
        { fingerprint: run, withPlan: false },
        { fingerprint: saved, withPlan: true },
      ],
      reason: "different-result-fingerprints",
    };
  }

  if (saved) {
    return {
      mode: RECOMMENDATION_PUBLICATION_MODE.SEPARATE,
      writes: [{ fingerprint: saved, withPlan: true }],
      reason: "saved-fingerprint-only",
    };
  }

  if (run) {
    // No plan to attach (a run that produced evidence only): exactly the write
    // the run itself has always made.
    return {
      mode: RECOMMENDATION_PUBLICATION_MODE.SEPARATE,
      writes: [{ fingerprint: run, withPlan: false }],
      reason: "run-fingerprint-only",
    };
  }

  return { mode: RECOMMENDATION_PUBLICATION_MODE.NONE, writes: [], reason: "no-fingerprint" };
}

/**
 * PERFORM THE RUN'S PUBLICATION — one operation, however many writes the
 * decision above requires, in order, with the timing milestones recorded around
 * them. Returns what each write did, so a caller can state a real failure.
 */
export async function publishOptimiserRecommendation({
  projectId = null,
  versionId = null,
  recommendation = null,
  plan = null,
  runFingerprint = null,
  savedFingerprint = null,
} = {}) {
  const decision = planRecommendationPublication({ runFingerprint, savedFingerprint });
  if (!recommendation || decision.writes.length === 0) {
    return { ...decision, results: [] };
  }

  const results = [];
  for (const write of decision.writes) {
    recordRunTiming(projectId, versionId, RUN_TIMING.PUBLICATION_STARTED);
    const payload = write.withPlan && plan ? { ...recommendation, optimiserPlan: plan } : { ...recommendation };
    const persisted = await publishRecommendation(projectId, versionId, payload, write.fingerprint);
    recordRunTiming(projectId, versionId, RUN_TIMING.PUBLICATION_COMPLETED);
    recordPublicationRetries(projectId, versionId, getPublicationAttempts(projectId, versionId));
    results.push({ fingerprint: write.fingerprint, withPlan: write.withPlan === true, persisted: persisted === true });
  }

  return { ...decision, results };
}