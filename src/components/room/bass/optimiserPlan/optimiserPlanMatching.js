// optimiserPlanMatching.js
// ---------------------------------------------------------------------------
// Pure matching between a saved lever change and the CURRENT design.
//
// Used for two purposes only:
//   - persisting the applied state at save time (rule 4)
//   - re-verifying it on restore (rule 8: never claim Applied unless the saved
//     state still matches the current design)
//
// Tolerances mirror the optimiser's own applied-state matching.
// ---------------------------------------------------------------------------

import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_STATE,
  PLAN_MATCH_TOLERANCE,
} from "./optimiserPlanConstants.js";

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

/** Active (enabled) instances, in canonical order. */
export function activeInstances(instances) {
  return (Array.isArray(instances) ? instances : []).filter((instance) => instance?.enabled !== false);
}

export function instanceById(instances, subId) {
  return activeInstances(instances).find((instance) => instance?.id === subId) || null;
}

/** Canonical persisted polarity is +1 (normal) / -1 (inverted). */
export function normaliseCanonicalPolarity(value) {
  const numeric = Number(value);
  return numeric < 0 || numeric === 180 ? -1 : 1;
}

export function polarityLabel(value) {
  return normaliseCanonicalPolarity(value) < 0 ? "Inverted" : "Normal";
}

function matchesChange(instance, change) {
  if (!instance || !change) return false;
  if (change.lever === OPTIMISER_LEVER.PLACEMENT) {
    const dx = Math.abs(Number(instance.position?.x) - Number(change.toX));
    const dy = Math.abs(Number(instance.position?.y) - Number(change.toY));
    return dx <= PLAN_MATCH_TOLERANCE.POSITION_M && dy <= PLAN_MATCH_TOLERANCE.POSITION_M;
  }
  if (change.lever === OPTIMISER_LEVER.DELAY) {
    const current = num(instance.delayMs) ?? 0;
    return Math.abs(current - Number(change.toMs)) <= PLAN_MATCH_TOLERANCE.DELAY_MS;
  }
  if (change.lever === OPTIMISER_LEVER.GAIN) {
    const current = num(instance.gainDb) ?? 0;
    return Math.abs(current - Number(change.toDb)) <= PLAN_MATCH_TOLERANCE.GAIN_DB;
  }
  if (change.lever === OPTIMISER_LEVER.POLARITY) {
    return normaliseCanonicalPolarity(instance.polarity) === normaliseCanonicalPolarity(change.to);
  }
  return false;
}

/**
 * Resolve one lever against the current design.
 *
 * @param {object} lever - { evaluated, changes, effect }
 * @param {Array} instances - current subwooferInstances
 * @returns {object} { applicable, applied, missingSubIds }
 *   applicable = the affected subwoofers still exist (so the lever can apply)
 *   applied    = every affected value already matches the saved recommendation
 */
export function resolveLeverMatch(lever, instances) {
  const changes = Array.isArray(lever?.changes) ? lever.changes : [];
  if (changes.length === 0) return { applicable: false, applied: false, missingSubIds: [] };

  const missingSubIds = changes
    .filter((change) => !instanceById(instances, change.subId))
    .map((change) => change.subId);

  const applied = missingSubIds.length === 0
    && changes.every((change) => matchesChange(instanceById(instances, change.subId), change));

  return { applicable: missingSubIds.length === 0, applied, missingSubIds };
}

/**
 * The persisted applied snapshot for a whole plan (rule 4).
 * Returns { placement: bool, delay: bool, polarity: bool, gain: bool }.
 */
export function resolveAppliedMap(levers, instances) {
  const applied = {};
  for (const [leverKey, lever] of Object.entries(levers || {})) {
    applied[leverKey] = resolveLeverMatch(lever, instances).applied;
  }
  return applied;
}

/**
 * The lever state shown to the designer, resolved against the current design.
 * Precedence: Disabled > No longer applicable > Applied > Needs re-evaluation.
 */
export function resolveLeverState({ lever, leverKey, instances, disabled, planStale }) {
  if (disabled) return OPTIMISER_LEVER_STATE.DISABLED;
  const match = resolveLeverMatch(lever, instances);
  if (!match.applicable) return OPTIMISER_LEVER_STATE.NO_LONGER_APPLICABLE;
  if (match.applied) return OPTIMISER_LEVER_STATE.APPLIED;
  if (planStale) return OPTIMISER_LEVER_STATE.NEEDS_REEVALUATION;
  return OPTIMISER_LEVER_STATE.NOT_APPLIED;
}