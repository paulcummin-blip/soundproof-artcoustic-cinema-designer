// optimiserPlanFlush.js
// ---------------------------------------------------------------------------
// Explicit save-flush bridge for the ADI Optimisation Plan.
//
// The ADI workflow sets the completed plan in the external optimiser-plan
// store (setOptimiserPlanAuthority) and then needs the EXISTING project save
// queue to persist it into ProjectVersion.design_state.optimiser_plan —
// without relying on incidental React autosave propagation.
//
// This module follows the same registration pattern as electronicPersistence:
// the hydrated save owner (useProjectLoader) registers a handler that calls
// the existing manual save path (with all its hydration, instance and
// concurrency protections). The ADI workflow calls flushProjectSaveForOptimiserPlan
// to explicitly request that save and await its result.
//
// It creates NO second persistence mechanism: the registered handler reuses
// the same single-writer save queue, the same payload builder and the same
// ProjectVersion.update call as autosave and manual save.
// ---------------------------------------------------------------------------

const owners = new Map();
const key = (p, v) => p + "::" + v;

export function registerOptimiserPlanFlush(projectId, versionId, handler) {
  const k = key(projectId, versionId);
  owners.set(k, handler);
  return () => { if (owners.get(k) === handler) owners.delete(k); };
}

export async function flushProjectSaveForOptimiserPlan(projectId, versionId) {
  const owner = owners.get(key(projectId, versionId));
  if (!owner) {
    return {
      success: false,
      error: "The current project is not ready to save the optimiser plan.",
    };
  }
  return owner();
}