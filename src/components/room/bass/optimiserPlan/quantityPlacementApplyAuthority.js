// quantityPlacementApplyAuthority.js
// ---------------------------------------------------------------------------
// Quantity-aware Apply/Undo authority for the ADI Subwoofer Design
// recommendation.
//
// The existing optimiser-plan lever Apply/Undo (optimiserPlanLeverApply.js)
// changes values on MATCHING current subwoofer instances — it cannot add,
// remove, enable or disable instances to change the subwoofer quantity. The
// three-option recommendation needs the designer to select an option with a
// DIFFERENT sub count (1 → 2, 2 → 4, etc.) and undo it exactly.
//
// This module provides the atomic, snapshot-based authority for that:
//
//   - Apply: writes the exact evaluated cabinet positions AND quantity,
//     preserving models, orientations, heights and unrelated design settings.
//     Creates, enables, disables or removes instances only as required by the
//     chosen option.
//   - Undo: restores the complete previous subwoofer-instance state from the
//     snapshot — exact, including instance IDs, enabled state and calibration.
//   - Stale guard: prevents applying a candidate after room or seating changes
//     have invalidated its fingerprint.
//
// Requirements honoured:
//   - Explicit approval before any design change (the caller gates this).
//   - Apply the exact evaluated cabinet positions and quantity.
//   - Preserve models, orientations, heights and unrelated design settings.
//   - Create/enable/disable/remove instances only as required.
//   - Preserve the complete previous state for exact Undo.
//   - Prevent stale candidates from applying after room/seating changes.
//
// READ-ONLY relative to the bass engine: it reads candidate coordinates and
// current instances. It changes no acoustic physics, no electronic
// optimisation, no RP22 scoring. The authoritative recalculation is triggered
// by the caller after Apply (the existing bass-analysis lifecycle).
// ---------------------------------------------------------------------------

import { generateStableId } from "@/components/utils/stableIdGenerator";
import { coordinatesMatch } from "@/components/room/bass/best-layout/applyRecommendationUtils";

const POSITION_TOLERANCE_M = 0.01;

// Cabinet facing rotation by wall group. Rear-wall cabinets face into the
// room at 180°, front-wall cabinets at 0°. This matches the rotation the
// Stage 2 evaluation assumes for front/rear-wall families and the rotation
// the full-arrangement matcher checks, so an applied rear cabinet is
// physically identical to its predicted P19/P20.
const ROTATION_BY_GROUP = { front: 0, rear: 180 };

function coordMatchesGroup(coord, groupCoords) {
  return Array.isArray(groupCoords)
    && groupCoords.some((c) => Math.abs(Number(c.x) - Number(coord.x)) < 0.01
      && Math.abs(Number(c.y) - Number(coord.y)) < 0.01);
}

function groupForCoord(coord, frontCoords, rearCoords) {
  if (coordMatchesGroup(coord, rearCoords)) return "rear";
  if (coordMatchesGroup(coord, frontCoords)) return "front";
  return null;
}

function rotationForGroup(group) {
  return group === "rear" ? ROTATION_BY_GROUP.rear : ROTATION_BY_GROUP.front;
}

// Cabinet axis orientation (e.g. a horizontal SUB4-12 swaps width/height) for
// a wall group. The candidate option does not carry per-source orientation,
// so it is resolved from the project's front/rear group config — the SAME
// resolution Stage 2 uses (group === "front" ? frontOrientation : rearOrientation).
// Never inferred as a facing rotation.
function groupOrientationForGroup(group, defaults) {
  if (group === "rear") return defaults.rearOrientation ?? defaults.orientation ?? null;
  if (group === "front") return defaults.frontOrientation ?? defaults.orientation ?? null;
  return defaults.orientation ?? null;
}

/**
 * Build a snapshot of the complete current subwoofer-instance state for exact
 * Undo. Captures every instance (enabled and disabled), their IDs, models,
 * positions, heights, orientations, calibration and enabled state.
 *
 * @param {Array} instances — current subwooferInstances
 * @returns {object} deep-cloned snapshot
 */
export function buildInstanceSnapshot(instances) {
  return (Array.isArray(instances) ? instances : []).map((instance) => ({
    ...instance,
    position: instance?.position ? { ...instance.position } : { x: 0, y: 0 },
  }));
}

/**
 * Restore the complete previous subwoofer-instance state from a snapshot.
 * Returns a new array that is an exact deep copy of the snapshot.
 *
 * @param {object} snapshot — from buildInstanceSnapshot
 * @returns {Array} restored instances
 */
export function restoreInstanceSnapshot(snapshot) {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.map((instance) => ({
    ...instance,
    position: instance?.position ? { ...instance.position } : { x: 0, y: 0 },
  }));
}

/**
 * Has the room or seating changed since the candidate was evaluated? The
 * candidate fingerprint encodes the room, seating and RSP identity. When it
 * no longer matches the current design fingerprint, the candidate is stale
 * and must not be applied.
 *
 * @param {string} candidateFingerprint — the candidate's design fingerprint
 * @param {string} currentFingerprint — the current design fingerprint
 * @returns {boolean}
 */
export function isCandidateStale(candidateFingerprint, currentFingerprint) {
  if (!candidateFingerprint || !currentFingerprint) return true;
  return candidateFingerprint !== currentFingerprint;
}

/**
 * Build the next subwooferInstances array for an evaluated candidate option,
 * preserving models, orientations, heights and unrelated design settings.
 *
 * Strategy (explicit one-to-one assignment):
 *   - The candidate specifies the exact cabinet positions and quantity.
 *   - Each candidate coordinate is assigned to exactly ONE existing
 *     compatible instance by proximity (one-to-one; an existing instance is
 *     never reused for two candidate positions). The matched instance keeps
 *     its ID, model, orientation, height and calibration; only its position,
 *     enabled state and wall-group rotation are updated.
 *   - A candidate coordinate with NO matching existing instance gets a NEW
 *     instance created for IT — regardless of that coordinate's index. The
 *     created instance is built from the candidate's evaluated model, height
 *     and per-group orientation (passed via defaults).
 *   - Existing instances that were neither matched nor created are DISABLED
 *     (not deleted) so Undo can restore them exactly. Disabled instances are
 *     excluded from the bass engine.
 *   - The complete proposed arrangement is validated against the candidate
 *     using the existing authoritative unordered per-group position matcher
 *     (coordinatesMatch). If the built enabled instances do not exactly match
 *     the evaluated candidate, Apply is rejected: the original instances are
 *     returned unchanged and `valid` is false so the caller commits nothing.
 *
 * This corrects the previous defect where the creation loop started at
 * `next.length` and indexed into `targetCoords` from there, treating the
 * number of matched instances as the index of the next unmatched coordinate.
 * When matches were partial and not at the beginning (e.g. candidate
 * positions 2–4 matched, position 1 missing) that loop re-created an already
 * matched coordinate and never created the missing one — producing a
 * partial, duplicated arrangement that was still committed.
 *
 * @param {object} params
 * @param {Array} params.coordinates — exact evaluated cabinet positions [{ x, y, placement }]
 * @param {number} params.quantity — target subwoofer quantity
 * @param {Array} params.instances — current subwooferInstances
 * @param {object} [params.defaults] — { model, bottomHeightM, frontOrientation, rearOrientation, orientation } for new/matched instances
 * @param {Array} [params.frontCoords] — coordinates belonging to the front group (for legacyGroup)
 * @param {Array} [params.rearCoords] — coordinates belonging to the rear group
 * @returns {object} { instances, appliedCount, createdCount, disabledCount, valid, error }
 */
export function buildQuantityApplyInstances({
  coordinates,
  quantity,
  instances,
  defaults = {},
  frontCoords = null,
  rearCoords = null,
}) {
  const current = Array.isArray(instances) ? instances : [];
  const targetCoords = (Array.isArray(coordinates) ? coordinates : []).slice(0, Math.max(0, Number(quantity) || 0));
  if (targetCoords.length === 0) {
    return { instances: current, appliedCount: 0, createdCount: 0, disabledCount: 0, valid: true, error: null };
  }

  // ---- First pass: explicit one-to-one assignment.
  // For each candidate coordinate, find a single compatible existing instance
  // at that position. usedInstanceIds guarantees no existing instance is ever
  // assigned to two candidate positions. Unmatched coordinates are recorded
  // explicitly so they are created for themselves, not for an index inferred
  // from the match count.
  const usedInstanceIds = new Set();
  const assignments = targetCoords.map((coord) => {
    for (const instance of current) {
      if (usedInstanceIds.has(instance.id)) continue;
      const ix = Number(instance?.position?.x);
      const iy = Number(instance?.position?.y);
      if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
      if (Math.abs(ix - Number(coord.x)) <= POSITION_TOLERANCE_M
        && Math.abs(iy - Number(coord.y)) <= POSITION_TOLERANCE_M) {
        usedInstanceIds.add(instance.id);
        return { kind: "match", instance };
      }
    }
    return { kind: "create" };
  });

  // ---- Second pass: build the enabled arrangement in candidate order.
  // Matched coordinates reuse their instance (ID, model, calibration, height
  // preserved; position, enabled, wall-group rotation and orientation updated
  // from the candidate). Unmatched coordinates get a new instance created for
  // that exact coordinate.
  const existingIds = new Set(current.map((i) => i.id));
  let createdCount = 0;
  const next = [];

  for (let i = 0; i < targetCoords.length; i += 1) {
    const coord = targetCoords[i];
    const group = groupForCoord(coord, frontCoords, rearCoords);
    const assignment = assignments[i];
    if (assignment.kind === "match") {
      const matched = assignment.instance;
      next.push({
        ...matched,
        position: { x: Number(coord.x), y: Number(coord.y) },
        enabled: true,
        rotationDeg: rotationForGroup(group),
        orientation: groupOrientationForGroup(group, defaults) ?? matched.orientation ?? null,
      });
    } else {
      const id = generateStableId(existingIds, group);
      existingIds.add(id);
      next.push({
        id,
        model: defaults.model || null,
        enabled: true,
        position: { x: Number(coord.x), y: Number(coord.y) },
        bottomHeightM: Number.isFinite(Number(defaults.bottomHeightM)) ? Number(defaults.bottomHeightM) : 0,
        rotationDeg: rotationForGroup(group),
        orientation: groupOrientationForGroup(group, defaults),
        positionSource: "recommendation",
        legacyGroup: group,
        symmetryLinkId: null,
        gainDb: 0,
        delayMs: 0,
        polarity: 1,
      });
      createdCount += 1;
    }
  }

  // ---- Third pass: disable any existing instances that were neither matched
  // nor created. They are kept (disabled) so Undo can restore them exactly.
  const nextIds = new Set(next.map((i) => i.id));
  const disabled = [];
  for (const instance of current) {
    if (!nextIds.has(instance.id)) {
      disabled.push({ ...instance, enabled: false });
    }
  }

  // ---- Validation: the built enabled arrangement must exactly match the
  // evaluated candidate (one-to-one, per wall group). Reuse the existing
  // authoritative unordered per-group position matcher — never a second,
  // inconsistent definition of arrangement identity. On mismatch, reject
  // Apply: return the original instances unchanged so the caller commits
  // nothing, calculates nothing and publishes nothing for a partial result.
  const builtSources = next.map((inst) => ({
    x: Number(inst.position.x),
    y: Number(inst.position.y),
    placement: inst.legacyGroup === "rear" ? "rear" : "front",
  }));
  const candidateSources = targetCoords.map((c) => ({
    x: Number(c.x),
    y: Number(c.y),
    placement: (groupForCoord(c, frontCoords, rearCoords) === "rear") ? "rear" : "front",
  }));

  if (!coordinatesMatch(builtSources, candidateSources, POSITION_TOLERANCE_M)) {
    return {
      instances: current,
      appliedCount: 0,
      createdCount: 0,
      disabledCount: 0,
      valid: false,
      error: "arrangement-mismatch",
    };
  }

  const result = [...next, ...disabled];
  return {
    instances: result,
    appliedCount: next.length - createdCount,
    createdCount,
    disabledCount: disabled.length,
    valid: true,
    error: null,
  };
}

/**
 * Build the provenance record for a quantity-aware Apply, so the design can
 * remember which candidate was applied and support exact Undo.
 *
 * @param {object} params
 * @param {object} params.snapshot — the previous instance state (for Undo)
 * @param {string} params.candidateId — the applied candidate's identity
 * @param {number} params.quantity — the applied quantity
 * @param {Array} params.coordinates — the applied coordinates
 * @param {string} params.candidateFingerprint — the candidate's design fingerprint
 * @returns {object} provenance record
 */
export function buildQuantityApplyProvenance({
  snapshot,
  candidateId,
  quantity,
  coordinates,
  candidateFingerprint,
}) {
  return {
    appliedAt: new Date().toISOString(),
    candidateId: candidateId || null,
    quantity: Number(quantity) || null,
    coordinates: Array.isArray(coordinates) ? coordinates.map((c) => ({ x: Number(c.x), y: Number(c.y) })) : [],
    candidateFingerprint: candidateFingerprint || null,
    previousInstances: snapshot,
  };
}

/**
 * Resolve whether a quantity-aware Apply can proceed, and why not if not.
 *
 * @param {object} params
 * @param {string} params.candidateFingerprint
 * @param {string} params.currentFingerprint
 * @param {Array} params.coordinates
 * @param {number} params.quantity
 * @returns {object} { canApply, blockReason }
 */
export function resolveQuantityApplyState({
  candidateFingerprint,
  currentFingerprint,
  coordinates,
  quantity,
}) {
  if (isCandidateStale(candidateFingerprint, currentFingerprint)) {
    return { canApply: false, blockReason: "stale-candidate-room-or-seating-changed" };
  }
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return { canApply: false, blockReason: "no-coordinates" };
  }
  if (![1, 2, 4].includes(Number(quantity))) {
    return { canApply: false, blockReason: "unsupported-quantity" };
  }
  return { canApply: true, blockReason: null };
}