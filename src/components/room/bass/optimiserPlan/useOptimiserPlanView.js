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

import { useEffect, useMemo, useState } from "react";
import { useOptimiserPlanAuthority } from "./optimiserPlanStore.js";
import { useLatestOptimiserRun, resolvePresentationPlan, restoreLatestRunIdentity, planIdentityIsUnverified } from "./optimiserRunAuthority.js";
import { hydrateOptimiserPlan, readPublishedOptimiserPlan } from "./optimiserPlanPersistence.js";
import { resolveOptimiserPlanStatus } from "./resolveOptimiserPlanStatus.js";
import { readOptimiserRunHistory } from "./optimiserRunHistory.js";

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

  // ── RUN IDENTITY RESOLUTION STATE ──
  // 'pending'  — history lookup not yet completed (initial load).
  // 'resolved'  — history lookup completed (row found or confirmed absent).
  // 'failed'    — history lookup threw (network/database error).
  // A modern plan (with run.runId) is NOT presented as current until this is
  // 'resolved' AND the latest run matches. This closes the freshness gap: an
  // older saved plan can never temporarily render as current while the async
  // history read is in flight, and a failed lookup never silently treats an
  // unverified plan as valid.
  const [runIdentityStatus, setRunIdentityStatus] = useState("pending");

  // Restore from the published payload only when this version has no saved plan.
  useEffect(() => {
    if (storedPlan || !projectId || !versionId) return;
    const published = readPublishedOptimiserPlan(completedBassAuthority);
    if (published) hydrateOptimiserPlan(projectId, versionId, published);
  }, [storedPlan, projectId, versionId, completedBassAuthority]);

  // ── ESTABLISH LATEST DURABLE RUN IDENTITY ON LOAD ──
  // The in-memory run store is empty after a page reload. Read the latest
  // OptimiserRunHistory row for this version and restore its run identity, so
  // planIsSupersededByRun can detect a newer run that failed to save: when
  // the history runId differs from the restored plan's runId, the older plan
  // is marked superseded and is not presented as the current recommendation.
  useEffect(() => {
    if (!projectId || !versionId) return;
    let cancelled = false;
    setRunIdentityStatus("pending");
    (async () => {
      try {
        const rows = await readOptimiserRunHistory({ projectId, versionId, limit: 1 });
        if (cancelled) return;
        const latestHistory = Array.isArray(rows) ? rows[0] : null;
        const historyRunId = latestHistory?.run_id || null;
        const historyStartedAt = latestHistory?.started_at || null;
        if (historyRunId) {
          restoreLatestRunIdentity(projectId, versionId, {
            runId: historyRunId,
            startedAt: historyStartedAt,
          });
        }
        setRunIdentityStatus("resolved");
      } catch {
        if (!cancelled) setRunIdentityStatus("failed");
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, versionId]);

  return useMemo(() => {
    const presentation = resolvePresentationPlan({ plan: storedPlan, run: latestRun });
    const effectivePlan = presentation.plan;

    // ── RUN IDENTITY FRESHNESS GATE ──
    // A modern plan (with run.runId) must not be presented as current until its
    // run identity has been verified against the latest durable run. During the
    // history lookup (pending), after a failed lookup, or when no history is
    // found, the plan is suppressed — resolveOptimiserPlanStatus receives null
    // and returns ABSENT, so the UI shows the Run ADI action instead. The saved
    // evidence is retained (never deleted), only withheld from presentation.
    // Legacy plans (no run.runId) are exempt for backward compatibility.
    const identitySuppressed = planIdentityIsUnverified(effectivePlan, latestRun);
    const planForStatus = identitySuppressed ? null : effectivePlan;

    const resolved = resolveOptimiserPlanStatus({
      plan: planForStatus,
      currentDesignFingerprint,
      instances,
      seatingPositions,
    });

    const base = {
      ...resolved,
      runIdentityStatus,
      ...(identitySuppressed ? { identitySuppressed: true } : {}),
    };

    // The superseded run is stated so a surface can say WHY no result is being
    // described; it never carries any of the earlier run's own values.
    if (presentation.superseded) {
      return {
        ...base,
        superseded: true,
        supersededByRunId: presentation.supersededByRunId,
        supersededPlanSavedAt: presentation.supersededPlanSavedAt,
      };
    }

    return {
      ...base,
      terminalTrace: effectivePlan?.terminalTrace?.runId === effectivePlan?.run?.runId
        ? effectivePlan?.terminalTrace || null : null,
    };
  }, [storedPlan, latestRun, currentDesignFingerprint, instances, seatingPositions, runIdentityStatus]);
}