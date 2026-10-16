// AdiAppliedStateLine.jsx
// ---------------------------------------------------------------------------
// THE ONE APPLIED / HELD STATEMENT.
//
// A completed Bass Optimiser run states whether its change is IN THE DESIGN
// (Applied) or held for the designer (Held — not applied). The persisted
// terminal decision is the only authority for that — never the presence of
// tuning settings in some other evidence block, never a candidate ranking.
//
// This component exists so the review dialogs, the card and any future surface
// state it in the same words, from the same value, with the run's own recorded
// reason beside it. It renders NOTHING for a state that is not applied or held
// (a rejected candidate, an unrun search, a stale result), so no surface can
// claim a decision that was never taken.
//
// Presentation only: every value arrives already resolved by the result view
// model.
// ---------------------------------------------------------------------------

import React from "react";
import { OPTIMISER_APPLIED_STATE } from "./optimiserResultViewModel.js";

const APPLIED_STYLE = { color: "#213428" };
const HELD_STYLE = { color: "#8A5A2B" };

export default function AdiAppliedStateLine({ resultModel = null, className = "" }) {
  if (!resultModel) return null;
  const state = resultModel.appliedState;
  const applied = state === OPTIMISER_APPLIED_STATE.APPLIED;
  const held = state === OPTIMISER_APPLIED_STATE.HELD;
  if (!applied && !held) return null;

  return (
    <div className={`space-y-0.5 ${className}`} data-adi-applied-state={state}>
      <div
        className="text-[11px] font-semibold uppercase tracking-wide"
        style={applied ? APPLIED_STYLE : HELD_STYLE}
      >
        {resultModel.appliedStateLabel}
      </div>
      {resultModel.decisionReason ? (
        <div className="text-[11px] text-[#3E4349] leading-relaxed">{resultModel.decisionReason}</div>
      ) : null}
    </div>
  );
}