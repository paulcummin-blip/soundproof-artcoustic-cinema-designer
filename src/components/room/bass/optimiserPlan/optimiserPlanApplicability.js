// optimiserPlanApplicability.js
// ---------------------------------------------------------------------------
// Does the saved plan actually OFFER a change, and is that change usable?
//
// Two pure predicates, read by the presentation authority and by anything that
// needs the same answer. They are extracted here so the presentation authority
// stays one readable decision tree rather than growing a second responsibility.
//
// They rank nothing, score nothing and apply nothing: a lever is "offered" when
// the plan itself recorded a change on it that is applicable, evaluated and
// visible. Presentation only — no threshold, no materiality rule and no
// engineering value is decided here.
// ---------------------------------------------------------------------------

import { OPTIMISER_PLAN_STATUS } from "./optimiserPlanConstants.js";
import { CALIBRATION_LEVER_KEYS } from "./adiPanelSections.js";

/**
 * Is the change this plan offers a PHYSICAL one — a move of seats, subwoofers or
 * layout — rather than an electronic adjustment?
 *
 * Read from the plan's own lever records: the offered change is physical when
 * every applicable, evaluated change is a non-calibration lever. When a
 * calibration change is also applicable the panel presents the adjustment first
 * (least intrusive first), so that is not this outcome.
 *
 * Presentation only: no lever is ranked, scored or re-evaluated here.
 */
export function offersPhysicalChangeOnly(planView) {
  if (!planView || planView.status !== OPTIMISER_PLAN_STATUS.CURRENT) return false;
  const levers = Array.isArray(planView.levers) ? planView.levers : [];
  const offered = levers.filter((lever) => lever.canApply === true
    && lever.evaluated === true
    && lever.effect != null
    && Array.isArray(lever.changes)
    && lever.changes.length > 0);
  if (!offered.length) return false;
  return offered.every((lever) => !CALIBRATION_LEVER_KEYS.includes(String(lever?.key ?? lever?.lever ?? "")));
}

/**
 * Is there at least one lever row that was genuinely evaluated, whose current
 * and proposed values are visible, and whose own Apply action is usable?
 */
export function hasApplicableEvaluatedLever(planView) {
  if (!planView || planView.status !== OPTIMISER_PLAN_STATUS.CURRENT) return false;
  const levers = Array.isArray(planView.levers) ? planView.levers : [];
  return levers.some((lever) => lever.canApply === true
    && lever.evaluated === true
    && lever.effect != null
    && Array.isArray(lever.changes)
    && lever.changes.length > 0);
}