// useLeverApplyActions.js
// ---------------------------------------------------------------------------
// Apply / Undo actions for individual optimiser levers, reused by the ADI
// results panel. This is the SAME commit path AdiRecommendation uses: it writes
// one lever's own field through the existing buildLeverApplyInstances /
// buildSeatingApplyPositions builders, then triggers the shared recalculation.
//
// It performs no calculation of its own and introduces no second apply
// mechanism. Combined-electronic (crossover) changes are NOT applied here —
// they remain the guarded auto-apply workflow's responsibility.
//
// APPLY PROVENANCE: when the designer applies or undoes a confirmed
// recommendation, a durable record is appended to the plan's
// `appliedLeverRecords` (via optimiserApplyProvenance). The record carries the
// run ID, lever key, before/after values, source and resulting design
// fingerprints, and — after the recalculation completes — the verified
// P19/P20 levels. This is the ONLY authority that proves ADI applied the
// recommendation; coordinate matching alone is never accepted as proof.
// ---------------------------------------------------------------------------

import { useCallback, useState } from "react";
import {
  buildLeverApplyInstances,
  buildLeverUndoInstances,
  buildSeatingApplyPositions,
  buildSeatingUndoPositions,
  buildSeatingRspUpdate,
} from "../optimiserPlan/optimiserPlanLeverApply.js";
import { OPTIMISER_LEVER } from "../optimiserPlan/optimiserPlanConstants.js";
import {
  recordLeverAppliedPending,
  completeLeverApplyVerification,
  completeLeverUndoVerification,
} from "../optimiserPlan/optimiserApplyProvenance.js";

export function useLeverApplyActions({
  commitInstances = null,
  commitSeating = null,
  currentInstances = [],
  seatingPositions = [],
  appState = null,
  onRecalculate = null,
  shared = null,
  planRunId = null,
  latestRunId = null,
  runIdentityStatus = "pending",
  projectId = null,
  versionId = null,
} = {}) {
  const [leverApplyBusy, setLeverApplyBusy] = useState(null);

  const commitLeverChange = useCallback(async (lever, direction = "to") => {
    if (!lever?.key) return;

    // ── RUN-ID FRESHNESS GATE (DURABLE BOUNDARY) ──
    // A lever from a modern plan (with run.runId) may only be applied when the
    // run identity has been resolved AND matches the latest known run. This is
    // the durable boundary: the button state is presentation only, and a stale
    // or unverified plan is blocked here regardless of coordinate matching.
    //
    // latestRunId is null when the in-memory run store is empty (after a page
    // reload, before the history read completes, or when the history read found
    // no rows or failed). In all those cases the plan's identity is unverified
    // and the apply is blocked. Legacy plans (no planRunId) are exempt.
    if (planRunId && (!latestRunId || latestRunId !== planRunId)) return;

    const sourceDesignFingerprint = shared?.cacheKey || null;

    if (lever.key === OPTIMISER_LEVER.SEATING) {
      if (!commitSeating) return;
      const result = direction === "from"
        ? buildSeatingUndoPositions({ lever, seatingPositions })
        : buildSeatingApplyPositions({ lever, seatingPositions });
      if (!result.ok) return;
      const rspUpdate = buildSeatingRspUpdate({
        seatingPositions,
        nextSeatingPositions: result.seatingPositions,
        rspMode: appState?.rspMode,
        manualRspY_m: appState?.manualRspY_m,
      });
      if (!rspUpdate.ok
        || (rspUpdate.manualRspY_m !== null && typeof appState?.setManualRspY_m !== "function")) return;
      try {
        commitSeating(result.seatingPositions);
      } catch {
        return;
      }
      if (rspUpdate.manualRspY_m !== null) appState.setManualRspY_m(rspUpdate.manualRspY_m);

      // Record the apply provenance BEFORE the recalculation, so a reload
      // mid-recalc preserves the "applied — verifying" state.
      if (projectId && versionId && direction === "to") {
        recordLeverAppliedPending(projectId, versionId, {
          runId: planRunId, leverKey: lever.key, direction, lever,
          sourceDesignFingerprint,
          affectedIds: result.affectedSeatIds || [],
        });
      }

      if (typeof onRecalculate === "function") {
        const verification = await onRecalculate({ previousCacheKey: sourceDesignFingerprint });
        // Update the provenance with the verified levels (or incomplete).
        if (projectId && versionId && direction === "to") {
          completeLeverApplyVerification(projectId, versionId, planRunId, lever.key, {
            status: verification?.action === "verified" ? "verified" : "incomplete",
            resultingDesignFingerprint: verification?.fingerprint || null,
            calculationFingerprint: verification?.fingerprint || null,
            levels: verification?.levels || null,
            failureReason: verification?.action !== "verified" ? (verification?.reason || "Recalculation did not complete") : null,
          });
        } else if (projectId && versionId && direction === "from") {
          // Undo: mark the applied record as undone with its own verification.
          completeLeverUndoVerification(projectId, versionId, planRunId, lever.key, {
            status: verification?.action === "verified" ? "verified" : "incomplete",
            calculationFingerprint: verification?.fingerprint || null,
            levels: verification?.levels || null,
            failureReason: verification?.action !== "verified" ? (verification?.reason || "Recalculation did not complete") : null,
          });
        }
      }
      return;
    }

    if (!commitInstances) return;
    const result = direction === "from"
      ? buildLeverUndoInstances({ leverKey: lever.key, lever, instances: currentInstances })
      : buildLeverApplyInstances({ leverKey: lever.key, lever, instances: currentInstances });
    if (!result.ok) return;
    try {
      commitInstances(
        result.instances,
        lever.key === OPTIMISER_LEVER.PLACEMENT
          ? { front: { placementMode: "manual", isManual: true }, rear: { placementMode: "manual", isManual: true } }
          : undefined,
      );
    } catch {
      return;
    }

    // Record the apply provenance BEFORE the recalculation.
    if (projectId && versionId && direction === "to") {
      recordLeverAppliedPending(projectId, versionId, {
        runId: planRunId, leverKey: lever.key, direction, lever,
        sourceDesignFingerprint,
        affectedIds: result.affectedSubIds || [],
      });
    }

    if (typeof onRecalculate === "function") {
      const verification = await onRecalculate({ previousCacheKey: sourceDesignFingerprint });
      if (projectId && versionId && direction === "to") {
        completeLeverApplyVerification(projectId, versionId, planRunId, lever.key, {
          status: verification?.action === "verified" ? "verified" : "incomplete",
          resultingDesignFingerprint: verification?.fingerprint || null,
          calculationFingerprint: verification?.fingerprint || null,
          levels: verification?.levels || null,
          failureReason: verification?.action !== "verified" ? (verification?.reason || "Recalculation did not complete") : null,
        });
      } else if (projectId && versionId && direction === "from") {
        // Undo: mark the applied record as undone with its own verification.
        completeLeverUndoVerification(projectId, versionId, planRunId, lever.key, {
          status: verification?.action === "verified" ? "verified" : "incomplete",
          calculationFingerprint: verification?.fingerprint || null,
          levels: verification?.levels || null,
          failureReason: verification?.action !== "verified" ? (verification?.reason || "Recalculation did not complete") : null,
        });
      }
    }
  }, [commitInstances, commitSeating, currentInstances, seatingPositions, appState, onRecalculate, shared, planRunId, latestRunId, runIdentityStatus, projectId, versionId]);

  const handleApplyLever = useCallback((lever) => {
    setLeverApplyBusy(lever?.key || null);
    // The commit is async but the button just needs to reflect busy state
    // during the synchronous commit; the recalculation runs in the background.
    Promise.resolve(commitLeverChange(lever, "to")).finally(() => {
      setLeverApplyBusy(null);
    });
  }, [commitLeverChange]);

  const handleUndoLever = useCallback((lever) => {
    setLeverApplyBusy(lever?.key || null);
    Promise.resolve(commitLeverChange(lever, "from")).finally(() => {
      setLeverApplyBusy(null);
    });
  }, [commitLeverChange]);

  return { handleApplyLever, handleUndoLever, leverApplyBusy };
}