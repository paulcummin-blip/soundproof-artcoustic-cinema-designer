// optimiserPlanPersistence.js
// ---------------------------------------------------------------------------
// Persistence bridge for the ADI Optimisation Plan.
//
// Two storage locations, both already existing plumbing:
//
//   1. design_state.optimiser_plan  (ProjectVersion)
//      The designer-facing record for the open version. Restored on project /
//      version reopen, and it survives target-level changes — it is only ever
//      shown as Stale, never deleted silently.
//
//   2. the published recommendation payload
//      (ProjectAnalysisCache → completed_by_fingerprint[fp].recommendation)
//      Written by publishRecommendation alongside the recommendation, so a
//      proposal, its history, and duplicated proposals inherit the evaluated
//      optimiser result with the fingerprint it belongs to.
//
// This module performs no calculation of any kind. It serialises, hydrates,
// and reads.
// ---------------------------------------------------------------------------

import { setOptimiserPlanAuthority } from "./optimiserPlanStore.js";

/**
 * Serialise a plan into a plain, JSON-safe object for design_state.
 * Raw transfers and other optimisation scratch data are deliberately not part
 * of the plan object, so nothing oversized is ever written.
 */
export function serializeOptimiserPlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  return {
    // Schema version of the persisted evidence. Absent/older versions are
    // reported as unavailable by the reader, never reinterpreted.
    planVersion: Number(plan.planVersion) || null,
    savedAt: plan.savedAt || null,
    // --- source identity ---
    projectId: plan.projectId || null,
    versionId: plan.versionId || null,
    baseDesignFingerprint: plan.baseDesignFingerprint || null,
    designFingerprint: plan.designFingerprint || null,
    resultFingerprint: plan.resultFingerprint || null,
    cacheKey: plan.cacheKey || null,
    target: plan.target || null,
    engineVersion: plan.engineVersion || null,
    candidateId: plan.candidateId || null,
    candidateKind: plan.candidateKind || null,
    baseline: plan.baseline || null,
    combined: plan.combined || null,
    levers: plan.levers || {},
    individualEffectsEvaluated: plan.individualEffectsEvaluated === true,
    leverDecisions: plan.leverDecisions || {},
    applied: plan.applied || {},
    notes: Array.isArray(plan.notes) ? plan.notes : [],
  };
}

/**
 * Restore a plan from persisted state into the in-memory authority.
 * Fingerprint comparison is NOT done here — the reader resolves staleness
 * against the current design, so the saved plan is never rewritten on load.
 */
export function hydrateOptimiserPlan(projectId, versionId, persistedPlan) {
  if (!projectId || !versionId || !persistedPlan || typeof persistedPlan !== "object") return null;
  if (!persistedPlan.designFingerprint && !persistedPlan.resultFingerprint) return null;
  const plan = serializeOptimiserPlan(persistedPlan);
  setOptimiserPlanAuthority(projectId, versionId, plan);
  return plan;
}

/**
 * Read the plan saved with a published result (proposal / report / history).
 * Returns null when the published payload carries no optimiser result.
 */
export function readPublishedOptimiserPlan(completedBassAuthority) {
  const plan = completedBassAuthority?.contract?.recommendation?.optimiserPlan || null;
  if (!plan || typeof plan !== "object") return null;
  return plan;
}