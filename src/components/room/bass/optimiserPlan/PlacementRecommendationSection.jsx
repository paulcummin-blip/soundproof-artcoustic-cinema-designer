// PlacementRecommendationSection.jsx
// ---------------------------------------------------------------------------
// Wires the placement recommendation panel to the saved plan:
//
//   plan view + presentation + the last apply/undo
//        → the resolved placement recommendation
//        → the panel, with Apply placement / Undo placement / Re-run
//
// The panel itself renders nothing until a resolution exists, so this section
// can be dropped into any surface that reads the same plan. It carries no
// calculation: every value comes from the saved optimiser evidence.
// ---------------------------------------------------------------------------

import React, { useMemo } from "react";
import PlacementRecommendationPanel from "./PlacementRecommendationPanel.jsx";
import { resolvePlacementRecommendation } from "./placementRecommendationAuthority.js";
import { OPTIMISER_LEVER } from "./optimiserPlanConstants.js";

export default function PlacementRecommendationSection({
  planView = null,
  roomDims = null,
  presentation = null,
  leverOutcome = null,
  busy = false,
  onApplyLever = null,
  onUndoLever = null,
  onRerun = null,
  className = "",
}) {
  const placement = useMemo(
    () => resolvePlacementRecommendation({
      planView,
      roomDims,
      presentation,
      appliedLever: leverOutcome?.appliedLever ?? null,
      appliedDirection: leverOutcome?.direction ?? null,
    }),
    [planView, roomDims, presentation, leverOutcome],
  );

  const lever = (planView?.levers || [])
    .find((row) => (row?.key ?? row?.lever) === OPTIMISER_LEVER.PLACEMENT) || null;
  const showsApply = placement?.kind === "recommended" && placement.canApply === true;
  const showsUndo = placement?.kind === "applied" && placement.canUndo === true;

  return (
    <PlacementRecommendationPanel
      className={className}
      placement={placement}
      busy={busy}
      onApply={showsApply && lever && typeof onApplyLever === "function" ? () => onApplyLever(lever) : null}
      onUndo={showsUndo && lever && typeof onUndoLever === "function" ? () => onUndoLever(lever) : null}
      onRerun={onRerun}
    />
  );
}