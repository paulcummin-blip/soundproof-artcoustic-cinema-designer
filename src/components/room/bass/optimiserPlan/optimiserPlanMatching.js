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
  // Seating changes address seat positions, never subwoofer instances.
  if (change.lever === OPTIMISER_LEVER.SEATING) return false;
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
export function resolveLeverMatch(lever, instances, seatingPositions = []) {
  const changes = Array.isArray(lever?.changes) ? lever.changes : [];
  if (changes.length === 0) return { applicable: false, applied: false, missingSubIds: [] };

  // A seating lever is matched against the seat positions, never the subwoofers.
  if (changes.every((change) => change?.lever === OPTIMISER_LEVER.SEATING)) {
    return resolveSeatingMatch(lever, seatingPositions);
  }

  const missingSubIds = changes
    .filter((change) => !instanceById(instances, change.subId))
    .map((change) => change.subId);

  const applied = missingSubIds.length === 0
    && changes.every((change) => matchesChange(instanceById(instances, change.subId), change));

  return { applicable: missingSubIds.length === 0, applied, missingSubIds };
}

/** Canonical seat id for matching, as a string. */
const seatKey = (seat) => (seat?.id == null ? null : String(seat.id));

/** Flat seat length coordinate: app state uses `y`, legacy rows use `y_m`. */
function seatLengthM(seat) {
  const value = Number(seat?.y ?? seat?.y_m);
  return Number.isFinite(value) ? value : null;
}

/**
 * Resolve a SEATING lever against the current seat positions.
 *
 * `positionsKnown` is false when the design's seat positions are not available
 * here. That is never reported as Applied: an unverifiable match is stated as
 * unverified, while the Apply/Undo path (which writes persisted values) stays
 * available. A seat that is no longer present is not treated as a missing
 * subwoofer — the destination rows simply cannot be confirmed.
 */
export function resolveSeatingMatch(lever, seatingPositions = []) {
  const changes = Array.isArray(lever?.changes) ? lever.changes : [];
  if (changes.length === 0) {
    return { applicable: false, applied: false, missingSubIds: [], positionsKnown: false };
  }
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  if (seats.length === 0) {
    return { applicable: true, applied: false, missingSubIds: [], positionsKnown: false };
  }
  const byId = new Map();
  seats.forEach((seat) => {
    const key = seatKey(seat);
    if (key) byId.set(key, seat);
  });

  let known = true;
  let applied = true;
  for (const change of changes) {
    const seat = change?.seatId != null ? byId.get(String(change.seatId)) : null;
    if (!seat) {
      known = false;
      applied = false;
      continue;
    }
    const current = seatLengthM(seat);
    const target = Number(change?.toY);
    if (current == null || !Number.isFinite(target)
      || Math.abs(current - target) > PLAN_MATCH_TOLERANCE.POSITION_M) {
      applied = false;
    }
  }

  return { applicable: true, applied: applied && known, missingSubIds: [], positionsKnown: known };
}

/**
 * The persisted applied snapshot for a whole plan (rule 4).
 * Returns { placement: bool, delay: bool, polarity: bool, gain: bool, seating: bool }.
 */
export function resolveAppliedMap(levers, instances, seatingPositions = []) {
  const applied = {};
  for (const [leverKey, lever] of Object.entries(levers || {})) {
    applied[leverKey] = resolveLeverMatch(lever, instances, seatingPositions).applied;
  }
  return applied;
}

/**
 * The lever state shown to the designer, resolved against the current design.
 * Precedence: Disabled > No longer applicable > Applied > Needs re-evaluation.
 */
export function resolveLeverState({
  lever, leverKey, instances, seatingPositions = [], disabled, planStale,
}) {
  if (disabled) return OPTIMISER_LEVER_STATE.DISABLED;
  const match = resolveLeverMatch(lever, instances, seatingPositions);
  if (!match.applicable) return OPTIMISER_LEVER_STATE.NO_LONGER_APPLICABLE;
  if (match.applied) return OPTIMISER_LEVER_STATE.APPLIED;
  if (planStale) return OPTIMISER_LEVER_STATE.NEEDS_REEVALUATION;
  return OPTIMISER_LEVER_STATE.NOT_APPLIED;
}