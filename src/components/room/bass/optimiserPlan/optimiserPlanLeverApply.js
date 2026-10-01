// optimiserPlanLeverApply.js
// ---------------------------------------------------------------------------
// Individual lever application for the ADI Optimisation Plan.
//
// One lever at a time, from the SAVED plan: placement, delay, gain or polarity.
// Every builder returns the CURRENT subwooferInstances array with only the
// applied lever's field changed — identity, model, quantity, enabled state and
// every other field are carried through untouched. The array is never replaced
// with a candidate snapshot.
//
// Undo needs no extra state: it writes back the lever's own persisted `from*`
// values, which the plan already stores beside every `to*` value.
//
// PURE: no React, no stores, no calculation. It changes no bass maths, no
// optimiser scoring, no P19/P20 definition, no RP22 grading, no pricing.
// ---------------------------------------------------------------------------

import {
  INDIVIDUAL_EFFECT_NOT_EVALUATED,
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_EVIDENCE,
  OPTIMISER_PLAN_STATUS,
} from "./optimiserPlanConstants.js";
import { normaliseCanonicalPolarity, resolveLeverMatch, resolveSeatingMatch } from "./optimiserPlanMatching.js";
import { PLACEMENT_THEORETICAL_NOTE } from "./placementMoveAuthority.js";

/** Why a lever cannot be applied on its own. */
export const LEVER_APPLY_BLOCK = Object.freeze({
  NO_PLAN: "no_plan",
  PLAN_NOT_CURRENT: "plan_not_current",
  UNKNOWN_LEVER: "unknown_lever",
  NOT_EVALUATED: "not_evaluated",
  COMBINED_ONLY: "combined_only",
  DISABLED: "disabled",
  NO_CHANGES: "no_changes",
  MISSING_SUB: "missing_sub",
  ALREADY_APPLIED: "already_applied",
  /** The design's seat positions are not available to write to. */
  SEATING_POSITIONS_UNAVAILABLE: "seating_positions_unavailable",
  /** An evaluated destination seat position is not a legal position. */
  SEATING_DESTINATION_INVALID: "seating_destination_invalid",
  /** The evaluated movement leaves the practical, wall-based placement envelope. */
  IMPRACTICAL: "impractical",
});

export const LEVER_APPLY_BLOCK_MESSAGE = Object.freeze({
  [LEVER_APPLY_BLOCK.NO_PLAN]:
    "No evaluated optimiser plan is saved for this design yet.",
  [LEVER_APPLY_BLOCK.PLAN_NOT_CURRENT]:
    "This optimiser result belongs to an earlier design state. Re-run the Optimisation Plan before applying any change.",
  [LEVER_APPLY_BLOCK.UNKNOWN_LEVER]:
    "This lever cannot be applied on its own.",
  [LEVER_APPLY_BLOCK.NOT_EVALUATED]: INDIVIDUAL_EFFECT_NOT_EVALUATED,
  [LEVER_APPLY_BLOCK.COMBINED_ONLY]:
    "Evaluated only inside the combined candidate — cannot apply separately.",
  [LEVER_APPLY_BLOCK.DISABLED]:
    "This lever is disabled for this design.",
  [LEVER_APPLY_BLOCK.NO_CHANGES]:
    "This lever proposes no change.",
  [LEVER_APPLY_BLOCK.MISSING_SUB]:
    "An affected subwoofer no longer exists in this design.",
  [LEVER_APPLY_BLOCK.ALREADY_APPLIED]: "Already applied to this design.",
  [LEVER_APPLY_BLOCK.SEATING_POSITIONS_UNAVAILABLE]:
    "The seating positions for this design cannot be read, so the evaluated movement cannot be applied here.",
  [LEVER_APPLY_BLOCK.SEATING_DESTINATION_INVALID]:
    "The evaluated seating movement was not applied: a destination seat position is not a legal position in this room.",
  [LEVER_APPLY_BLOCK.IMPRACTICAL]: PLACEMENT_THEORETICAL_NOTE,
});

export const LEVER_APPLY_LABEL = Object.freeze({
  [OPTIMISER_LEVER.PLACEMENT]: "Apply placement",
  [OPTIMISER_LEVER.DELAY]: "Apply delay",
  [OPTIMISER_LEVER.GAIN]: "Apply gain",
  [OPTIMISER_LEVER.POLARITY]: "Apply polarity",
  [OPTIMISER_LEVER.SEATING]: "Apply seating",
});

export const LEVER_UNDO_LABEL = Object.freeze({
  [OPTIMISER_LEVER.PLACEMENT]: "Undo placement",
  [OPTIMISER_LEVER.DELAY]: "Undo delay",
  [OPTIMISER_LEVER.GAIN]: "Undo gain",
  [OPTIMISER_LEVER.POLARITY]: "Undo polarity",
  [OPTIMISER_LEVER.SEATING]: "Undo seating",
});

const LEVER_KEYS = new Set(Object.values(OPTIMISER_LEVER));

const blocked = (code) => ({ canApply: false, code, reason: LEVER_APPLY_BLOCK_MESSAGE[code] });

/**
 * Can this lever be applied on its own, right now?
 *
 * Blocked when: no plan, plan not current (missing / stale / unreadable), the
 * lever was never evaluated on its own, its evidence is combined-only, it is
 * disabled, it proposes no change, an affected subwoofer is gone, or it is
 * already applied. The plan fingerprint is what makes a plan current, so a
 * design change disables every Apply control until the plan is re-run.
 */
export function resolveLeverApplyState({
  leverKey,
  lever,
  planStatus,
  applied = false,
  missingSubIds = [],
} = {}) {
  if (!planStatus || planStatus === OPTIMISER_PLAN_STATUS.ABSENT) {
    return blocked(LEVER_APPLY_BLOCK.NO_PLAN);
  }
  if (planStatus !== OPTIMISER_PLAN_STATUS.CURRENT) {
    return blocked(LEVER_APPLY_BLOCK.PLAN_NOT_CURRENT);
  }
  if (!lever || !LEVER_KEYS.has(leverKey)) {
    return blocked(LEVER_APPLY_BLOCK.UNKNOWN_LEVER);
  }
  if (lever.disabled === true) return blocked(LEVER_APPLY_BLOCK.DISABLED);
  // A theoretical placement is never applied from the card. The lever keeps its
  // evidence and its reason; only the offer is withheld.
  if (leverKey === OPTIMISER_LEVER.PLACEMENT && lever.practical === false) {
    return blocked(LEVER_APPLY_BLOCK.IMPRACTICAL);
  }
  if (lever.evaluated !== true || lever.notEvaluated === true || !lever.effect) {
    return blocked(LEVER_APPLY_BLOCK.NOT_EVALUATED);
  }
  const evidence = lever.evidenceStatus || null;
  if (evidence === OPTIMISER_LEVER_EVIDENCE.COMBINED_ONLY
    || evidence === OPTIMISER_LEVER_EVIDENCE.NOT_EVALUATED) {
    return blocked(LEVER_APPLY_BLOCK.COMBINED_ONLY);
  }
  const changes = Array.isArray(lever.changes) ? lever.changes : [];
  if (!changes.length) return blocked(LEVER_APPLY_BLOCK.NO_CHANGES);
  if (leverKey === OPTIMISER_LEVER.SEATING) {
    // A seating movement is offered only when it was canonically evaluated, every
    // destination position is legal, and the exact movement is persisted.
    if (lever.validation?.destinationsValid === false) {
      return blocked(LEVER_APPLY_BLOCK.SEATING_DESTINATION_INVALID);
    }
    const movementKnown = changes.every((change) => change?.seatId != null
      && Number.isFinite(Number(change?.toY)));
    if (!movementKnown) return blocked(LEVER_APPLY_BLOCK.NO_CHANGES);
    if (applied) return blocked(LEVER_APPLY_BLOCK.ALREADY_APPLIED);
    return { canApply: true, code: null, reason: null };
  }
  if (missingSubIds.length) return blocked(LEVER_APPLY_BLOCK.MISSING_SUB);
  if (applied) return blocked(LEVER_APPLY_BLOCK.ALREADY_APPLIED);
  return { canApply: true, code: null, reason: null };
}

/**
 * Can this lever be undone? Undo uses the plan's own persisted previous values,
 * so it stays available while the plan is stale — which is exactly the state an
 * apply leaves the plan in. It is offered only when the saved recommendation is
 * what the design currently holds.
 */
export function resolveLeverUndoState({ lever, applied = false, missingSubIds = [], planReadable = false } = {}) {
  const changes = Array.isArray(lever?.changes) ? lever.changes : [];
  if (!planReadable || !changes.length) return { canUndo: false };
  if (missingSubIds.length) return { canUndo: false };
  return { canUndo: applied === true };
}

/** The values to write for one change, in the requested direction. */
function leverValues(change, direction) {
  if (change.lever === OPTIMISER_LEVER.PLACEMENT) {
    return direction === "from"
      ? { x: Number(change.fromX), y: Number(change.fromY) }
      : { x: Number(change.toX), y: Number(change.toY) };
  }
  if (change.lever === OPTIMISER_LEVER.DELAY) {
    return { delayMs: Number(direction === "from" ? change.fromMs : change.toMs) };
  }
  if (change.lever === OPTIMISER_LEVER.GAIN) {
    return { gainDb: Number(direction === "from" ? change.fromDb : change.toDb) };
  }
  if (change.lever === OPTIMISER_LEVER.POLARITY) {
    return {
      polarity: normaliseCanonicalPolarity(direction === "from" ? change.from : change.to),
    };
  }
  return null;
}

/** Write ONE lever's values onto an instance; every other field is preserved. */
function withLeverValues(instance, change, values) {
  if (!values || !instance) return instance;
  if (change.lever === OPTIMISER_LEVER.PLACEMENT) {
    if (!Number.isFinite(values.x) || !Number.isFinite(values.y)) return instance;
    return { ...instance, position: { ...instance.position, x: values.x, y: values.y } };
  }
  if (change.lever === OPTIMISER_LEVER.DELAY) {
    return Number.isFinite(values.delayMs) ? { ...instance, delayMs: values.delayMs } : instance;
  }
  if (change.lever === OPTIMISER_LEVER.GAIN) {
    return Number.isFinite(values.gainDb) ? { ...instance, gainDb: values.gainDb } : instance;
  }
  if (change.lever === OPTIMISER_LEVER.POLARITY) {
    return { ...instance, polarity: values.polarity };
  }
  return instance;
}

function buildInstances({ leverKey, lever, instances, direction }) {
  const list = Array.isArray(instances) ? instances : [];
  const changes = Array.isArray(lever?.changes) ? lever.changes : [];
  if (!LEVER_KEYS.has(leverKey) || !changes.length) {
    return {
      ok: false,
      code: LEVER_APPLY_BLOCK.NO_CHANGES,
      reason: LEVER_APPLY_BLOCK_MESSAGE[LEVER_APPLY_BLOCK.NO_CHANGES],
      instances: list,
      affectedSubIds: [],
    };
  }

  const missingSubIds = changes
    .filter((change) => !list.some((instance) => instance?.id === change.subId))
    .map((change) => change.subId);
  if (missingSubIds.length) {
    return {
      ok: false,
      code: LEVER_APPLY_BLOCK.MISSING_SUB,
      reason: LEVER_APPLY_BLOCK_MESSAGE[LEVER_APPLY_BLOCK.MISSING_SUB],
      instances: list,
      affectedSubIds: [],
    };
  }

  const bySubId = new Map(changes.map((change) => [change.subId, change]));
  const next = list.map((instance) => {
    const change = bySubId.get(instance?.id);
    if (!change) return instance;
    return withLeverValues(instance, change, leverValues(change, direction));
  });

  return {
    ok: true,
    code: null,
    reason: null,
    instances: next,
    affectedSubIds: changes.map((change) => change.subId),
  };
}

/**
 * Write ONE seating movement onto the seat positions.
 *
 * Only the seat's length coordinate is written, and only for the seats the run
 * evaluated. Every other field — seat id, lateral position, row, priority, ear
 * and platform heights — is carried through untouched. Undo writes back the
 * lever's own persisted previous coordinate, so it restores the exact positions.
 */
function buildSeatingPositions({ lever, seatingPositions, direction }) {
  const list = Array.isArray(seatingPositions) ? seatingPositions : [];
  const changes = Array.isArray(lever?.changes) ? lever.changes : [];
  if (!changes.length) {
    return {
      ok: false,
      code: LEVER_APPLY_BLOCK.NO_CHANGES,
      reason: LEVER_APPLY_BLOCK_MESSAGE[LEVER_APPLY_BLOCK.NO_CHANGES],
      seatingPositions: list,
      affectedSeatIds: [],
    };
  }
  if (!list.length) {
    return {
      ok: false,
      code: LEVER_APPLY_BLOCK.SEATING_POSITIONS_UNAVAILABLE,
      reason: LEVER_APPLY_BLOCK_MESSAGE[LEVER_APPLY_BLOCK.SEATING_POSITIONS_UNAVAILABLE],
      seatingPositions: list,
      affectedSeatIds: [],
    };
  }

  const bySeatId = new Map(changes.map((change) => [String(change.seatId), change]));
  const touched = [];
  const next = list.map((seat) => {
    const change = seat?.id == null ? null : bySeatId.get(String(seat.id));
    if (!change) return seat;
    const value = Number(direction === "from" ? change.fromY : change.toY);
    if (!Number.isFinite(value)) return seat;
    touched.push(String(seat.id));
    return { ...seat, y: value };
  });

  if (touched.length === 0) {
    return {
      ok: false,
      code: LEVER_APPLY_BLOCK.SEATING_POSITIONS_UNAVAILABLE,
      reason: LEVER_APPLY_BLOCK_MESSAGE[LEVER_APPLY_BLOCK.SEATING_POSITIONS_UNAVAILABLE],
      seatingPositions: list,
      affectedSeatIds: [],
    };
  }

  return { ok: true, code: null, reason: null, seatingPositions: next, affectedSeatIds: touched };
}

/** Apply the evaluated seating movement. */
export function buildSeatingApplyPositions({ lever, seatingPositions }) {
  return buildSeatingPositions({ lever, seatingPositions, direction: "to" });
}

/** Restore the exact seat positions the movement started from. */
export function buildSeatingUndoPositions({ lever, seatingPositions }) {
  return buildSeatingPositions({ lever, seatingPositions, direction: "from" });
}

/** Apply ONE lever's proposed values. */
export function buildLeverApplyInstances({ leverKey, lever, instances }) {
  return buildInstances({ leverKey, lever, instances, direction: "to" });
}

/** Revert ONE lever to its persisted previous values. */
export function buildLeverUndoInstances({ leverKey, lever, instances }) {
  return buildInstances({ leverKey, lever, instances, direction: "from" });
}

/**
 * Per-lever apply/undo availability for the plan status view. Applied state is
 * re-derived from the design itself, never trusted from stored flags.
 */
export function resolveLeverApplyMap({ levers = {}, planStatus, instances = [], seatingPositions = [] } = {}) {
  const map = {};
  const readable = planStatus === OPTIMISER_PLAN_STATUS.CURRENT
    || planStatus === OPTIMISER_PLAN_STATUS.STALE;
  for (const [leverKey, lever] of Object.entries(levers || {})) {
    const match = leverKey === OPTIMISER_LEVER.SEATING
      ? resolveSeatingMatch(lever, seatingPositions)
      : resolveLeverMatch(lever, instances);
    const apply = resolveLeverApplyState({
      leverKey,
      lever,
      planStatus,
      applied: match.applied,
      missingSubIds: match.missingSubIds,
    });
    const undo = resolveLeverUndoState({
      lever,
      applied: match.applied,
      missingSubIds: match.missingSubIds,
      planReadable: readable,
    });
    map[leverKey] = {
      canApply: apply.canApply,
      applyBlockedReason: apply.canApply ? null : apply.reason,
      applyBlockedCode: apply.code,
      canUndo: undo.canUndo,
      applyLabel: LEVER_APPLY_LABEL[leverKey] || null,
      undoLabel: LEVER_UNDO_LABEL[leverKey] || null,
    };
  }
  return map;
}