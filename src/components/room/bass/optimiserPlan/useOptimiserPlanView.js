// useOptimiserPlanView.js
// ---------------------------------------------------------------------------
// The single read path for the restored Optimisation Plan.
//
// Order of authority:
//   1. the plan saved with the open design version (in-memory authority, itself
//      hydrated from design_state.optimiser_plan)
//   2. the plan saved with the PUBLISHED result (proposal / report / history),
//      hydrated into the authority when the version copy is absent
//
// It never recomputes the recommendation (rule 1). Staleness is decided by the
// caller-supplied current design fingerprint (rules 2, 3, 9).
// ---------------------------------------------------------------------------

import { useEffect, useMemo } from "react";
import { useOptimiserPlanAuthority } from "./optimiserPlanStore.js";
import { hydrateOptimiserPlan, readPublishedOptimiserPlan } from "./optimiserPlanPersistence.js";
import { resolveOptimiserPlanStatus } from "./resolveOptimiserPlanStatus.js";

export function useOptimiserPlanView({
  projectId = null,
  versionId = null,
  completedBassAuthority = null,
  currentDesignFingerprint = null,
  instances = [],
} = {}) {
  const storedPlan = useOptimiserPlanAuthority(projectId, versionId);

  // Restore from the published payload only when this version has no saved plan.
  useEffect(() => {
    if (storedPlan || !projectId || !versionId) return;
    const published = readPublishedOptimiserPlan(completedBassAuthority);
    if (published) hydrateOptimiserPlan(projectId, versionId, published);
  }, [storedPlan, projectId, versionId, completedBassAuthority]);

  return useMemo(
    () => resolveOptimiserPlanStatus({
      plan: storedPlan,
      currentDesignFingerprint,
      instances,
    }),
    [storedPlan, currentDesignFingerprint, instances],
  );
}