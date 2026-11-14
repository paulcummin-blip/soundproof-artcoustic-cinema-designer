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

export function useLeverApplyActions({
  commitInstances = null,
  commitSeating = null,
  currentInstances = [],
  seatingPositions = [],
  appState = null,
  onRecalculate = null,
  shared = null,
} = {}) {
  const [leverApplyBusy, setLeverApplyBusy] = useState(null);

  const commitLeverChange = useCallback((lever, direction = "to") => {
    if (!lever?.key) return;

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
      if (typeof onRecalculate === "function") {
        onRecalculate({ previousCacheKey: shared?.cacheKey || null });
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
    if (typeof onRecalculate === "function") {
      onRecalculate({ previousCacheKey: shared?.cacheKey || null });
    }
  }, [commitInstances, commitSeating, currentInstances, seatingPositions, appState, onRecalculate, shared]);

  const handleApplyLever = useCallback((lever) => {
    setLeverApplyBusy(lever?.key || null);
    try {
      commitLeverChange(lever, "to");
    } finally {
      setLeverApplyBusy(null);
    }
  }, [commitLeverChange]);

  const handleUndoLever = useCallback((lever) => {
    setLeverApplyBusy(lever?.key || null);
    try {
      commitLeverChange(lever, "from");
    } finally {
      setLeverApplyBusy(null);
    }
  }, [commitLeverChange]);

  return { handleApplyLever, handleUndoLever, leverApplyBusy };
}