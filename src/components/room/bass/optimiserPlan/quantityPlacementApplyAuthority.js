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

const POSITION_TOLERANCE_M = 0.01;

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
 * Strategy:
 *   - The candidate specifies the exact cabinet positions and quantity.
 *   - Existing instances that match a candidate coordinate are REUSED (their
 *     IDs, models, orientation, height and calibration are preserved; only
 *     their position is updated).
 *   - Additional instances beyond the current count are CREATED from the
 *     current global subwoofer model/height/orientation defaults.
 *   - Excess instances are DISABLED (not deleted) so Undo can restore them
 *     exactly. Disabled instances are excluded from the bass engine.
 *
 * @param {object} params
 * @param {Array} params.coordinates — exact evaluated cabinet positions [{ x, y }]
 * @param {number} params.quantity — target subwoofer quantity
 * @param {Array} params.instances — current subwooferInstances
 * @param {object} [params.defaults] — { model, bottomHeightM, orientation } for new instances
 * @param {Array} [params.frontCoords] — coordinates belonging to the front group (for legacyGroup)
 * @param {Array} [params.rearCoords] — coordinates belonging to the rear group
 * @returns {object} { instances, appliedCount, createdCount, disabledCount }
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
    return { instances: current, appliedCount: 0, createdCount: 0, disabledCount: 0 };
  }

  const usedInstanceIds = new Set();
  const next = [];

  // Match candidate coordinates to existing instances by proximity. A
  // coordinate that matches an existing instance reuses that instance's ID,
  // model, orientation, height and calibration — only its position is updated.
  const matchInstance = (coord, candidates) => {
    for (const instance of candidates) {
      if (usedInstanceIds.has(instance.id)) continue;
      const ix = Number(instance?.position?.x);
      const iy = Number(instance?.position?.y);
      if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
      if (Math.abs(ix - Number(coord.x)) <= POSITION_TOLERANCE_M
        && Math.abs(iy - Number(coord.y)) <= POSITION_TOLERANCE_M) {
        usedInstanceIds.add(instance.id);
        return instance;
      }
    }
    return null;
  };

  // First pass: match each candidate coordinate to an existing instance.
  for (const coord of targetCoords) {
    const matched = matchInstance(coord, current);
    if (matched) {
      next.push({
        ...matched,
        position: { x: Number(coord.x), y: Number(coord.y) },
        enabled: true,
      });
    }
  }

  // Second pass: for unmatched coordinates, create new instances from the
  // defaults. Preserve the model/orientation/height the candidate was
  // evaluated with (from the canonical result's sources, passed via defaults).
  const existingIds = new Set(current.map((i) => i.id));
  let createdCount = 0;
  for (let i = next.length; i < targetCoords.length; i += 1) {
    const coord = targetCoords[i];
    const group = rearCoords && rearCoords.some((c) => Math.abs(c.x - coord.x) < 0.01 && Math.abs(c.y - coord.y) < 0.01)
      ? "rear"
      : (frontCoords && frontCoords.some((c) => Math.abs(c.x - coord.x) < 0.01 && Math.abs(c.y - coord.y) < 0.01) ? "front" : null);
    const id = generateStableId(existingIds, group);
    existingIds.add(id);
    next.push({
      id,
      model: defaults.model || null,
      enabled: true,
      position: { x: Number(coord.x), y: Number(coord.y) },
      bottomHeightM: Number.isFinite(Number(defaults.bottomHeightM)) ? Number(defaults.bottomHeightM) : 0,
      rotationDeg: 0,
      orientation: defaults.orientation || null,
      positionSource: "recommendation",
      legacyGroup: group,
      symmetryLinkId: null,
      gainDb: 0,
      delayMs: 0,
      polarity: 1,
    });
    createdCount += 1;
  }

  // Third pass: disable any existing instances that were not matched or
  // created. They are kept (disabled) so Undo can restore them exactly.
  const nextIds = new Set(next.map((i) => i.id));
  const disabled = [];
  for (const instance of current) {
    if (!nextIds.has(instance.id)) {
      disabled.push({ ...instance, enabled: false });
    }
  }

  const result = [...next, ...disabled];
  return {
    instances: result,
    appliedCount: next.length - createdCount,
    createdCount,
    disabledCount: disabled.length,
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