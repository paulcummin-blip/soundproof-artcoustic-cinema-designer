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
//
// ONE RUN OWNS THE PANEL: a saved record is only handed to the presentation when
// it belongs to the LATEST run started for this design version. Starting a new
// run supersedes the previous one — the old record is kept as history but is not
// presented at all, so no earlier run can decide the badge, the headline, the
// next action, the recommendation or the failure state. See
// optimiserRunAuthority.js.
// ---------------------------------------------------------------------------

import { useEffect, useMemo } from "react";
import { useOptimiserPlanAuthority } from "./optimiserPlanStore.js";
import { useLatestOptimiserRun, resolvePresentationPlan } from "./optimiserRunAuthority.js";
import { hydrateOptimiserPlan, readPublishedOptimiserPlan } from "./optimiserPlanPersistence.js";
import { resolveOptimiserPlanStatus } from "./resolveOptimiserPlanStatus.js";

export function useOptimiserPlanView({
  projectId = null,
  versionId = null,
  completedBassAuthority = null,
  currentDesignFingerprint = null,
  instances = [],
  seatingPositions = [],
} = {}) {
  const storedPlan = useOptimiserPlanAuthority(projectId, versionId);
  // The latest run started for this design version (if any). A record saved before
  // that run began is the previous run's result: history, not the panel's subject.
  const latestRun = useLatestOptimiserRun(projectId, versionId);

  // Restore from the published payload only when this version has no saved plan.
  useEffect(() => {
    if (storedPlan || !projectId || !versionId) return;
    const published = readPublishedOptimiserPlan(completedBassAuthority);
    if (published) hydrateOptimiserPlan(projectId, versionId, published);
  }, [storedPlan, projectId, versionId, completedBassAuthority]);

  return useMemo(() => {
    const presentation = resolvePresentationPlan({ plan: storedPlan, run: latestRun });
    const resolved = resolveOptimiserPlanStatus({
      plan: presentation.plan,
      currentDesignFingerprint,
      instances,
      seatingPositions,
    });
    // The superseded run is stated so a surface can say WHY no result is being
    // described; it never carries any of the earlier run's own values.
    return presentation.superseded
      ? {
        ...resolved,
        superseded: true,
        supersededByRunId: presentation.supersededByRunId,
        supersededPlanSavedAt: presentation.supersededPlanSavedAt,
      }
      : resolved;
  }, [storedPlan, latestRun, currentDesignFingerprint, instances, seatingPositions]);
}