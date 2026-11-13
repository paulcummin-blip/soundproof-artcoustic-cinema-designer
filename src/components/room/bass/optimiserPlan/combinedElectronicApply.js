// combinedElectronicApply.js
// ---------------------------------------------------------------------------
// Atomic apply contract for a combined electronic (crossover + tuning) plan
// lever.
//
// The combined electronic lever carries the confirmed winner's COMPLETE
// configuration: crossover (frequency, slopes, linking) AND per-source tuning
// (delay, gain, phase, polarity). Apply must write BOTH in one coherent
// update — never one without the other. A partial apply (tuning without
// crossover, or crossover without tuning) would not reproduce the confirmed
// result and must never be offered as "applied."
//
// This module produces the design state update from the lever:
//   - The new subwooferInstances with per-source tuning applied (via the
//     existing applyCalibrationTuning, which handles delay/gain/phase/polarity
//     and stamps tuningSource provenance).
//   - The new crossover config (the lever's `crossover.after`).
//   - The previous instances and crossover, for restoration and auditability.
//
// It reuses the existing applyCalibrationTuning for the tuning write — it
// does NOT build a second tuning engine. It adds the crossover on top, which
// the existing applyCalibrationTuning does not handle.
//
// Identity is re-verified before apply: the lever's sourceIdentity (model,
// position, height, rotation) must match the current instances. A mismatch
// means the design has changed since the run confirmed the candidate, and
// apply is refused — the previous state is retained.
//
// PURE: no React, no stores, no calculation. It changes no bass maths, no
// scoring, no grading, and no search.
// ---------------------------------------------------------------------------

import { applyCalibrationTuning } from "../improveBassV2/improveBassV2ApplyCalibration.js";
import { activeInstances } from "./optimiserPlanMatching.js";

const COORDINATE_TOLERANCE_M = 0.01;
const HEIGHT_TOLERANCE_M = 0.01;
const ROTATION_TOLERANCE_DEG = 1;

/** Why a combined electronic apply cannot proceed. */
export const COMBINED_ELECTRONIC_APPLY_BLOCK = Object.freeze({
  NO_LEVER: "no_lever",
  INCOMPLETE: "incomplete",
  IDENTITY_MISMATCH: "identity_mismatch",
  NO_CROSSOVER: "no_crossover",
  NO_TUNING: "no_tuning",
  STALE_FINGERPRINT: "stale_fingerprint",
});

export const COMBINED_ELECTRONIC_APPLY_BLOCK_MESSAGE = Object.freeze({
  [COMBINED_ELECTRONIC_APPLY_BLOCK.NO_LEVER]:
    "No combined electronic optimisation result is saved for this design.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.INCOMPLETE]:
    "The confirmed configuration is incomplete — missing crossover or tuning settings prevent a complete apply.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH]:
    "The installed subwoofers no longer match the configuration ADI confirmed. Re-run the Optimisation Plan.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.NO_CROSSOVER]:
    "The confirmed crossover configuration is missing — a partial apply is not permitted.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.NO_TUNING]:
    "The confirmed per-source tuning is missing — a partial apply is not permitted.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.STALE_FINGERPRINT]:
    "This optimisation result belongs to an earlier design state. Re-run the Optimisation Plan before applying.",
});

const blocked = (code) => ({
  ok: false,
  code,
  reason: COMBINED_ELECTRONIC_APPLY_BLOCK_MESSAGE[code],
});

/**
 * Verify the lever's sourceIdentity matches the current active instances.
 * A mismatch (model, position, height, rotation) means the design has changed
 * since the run confirmed the candidate — apply is refused.
 */
function verifySourceIdentity(lever, instances) {
  const identity = Array.isArray(lever?.sourceIdentity) ? lever.sourceIdentity : [];
  const active = activeInstances(instances);
  if (identity.length === 0 || identity.length !== active.length) return false;
  const byId = new Map(active.map((inst) => [inst.id, inst]));
  for (const entry of identity) {
    const inst = byId.get(entry.sourceId);
    if (!inst) return false;
    if ((inst.model || null) !== (entry.model || null)) return false;
    const dx = Math.abs(Number(inst.position?.x) - Number(entry.geometry?.x));
    const dy = Math.abs(Number(inst.position?.y) - Number(entry.geometry?.y));
    if (dx > COORDINATE_TOLERANCE_M || dy > COORDINATE_TOLERANCE_M) return false;
    const dh = Math.abs(Number(inst.bottomHeightM) - Number(entry.geometry?.bottomHeightM));
    if (dh > HEIGHT_TOLERANCE_M) return false;
    const dr = Math.abs(Number(inst.rotationDeg) - Number(entry.geometry?.rotationDeg));
    if (dr > ROTATION_TOLERANCE_DEG) return false;
  }
  return true;
}

/**
 * Build the complete design state update for a combined electronic apply.
 *
 * Writes BOTH the per-source tuning (via applyCalibrationTuning) AND the
 * crossover config in one coherent update. Returns the new instances, the
 * new crossover, and the previous state for restoration.
 *
 * @param {object} params
 * @param {object} params.lever - the combined electronic plan lever
 * @param {Array} params.instances - current subwooferInstances (ALL, including disabled)
 * @param {object|null} params.currentCrossover - the design's current crossover
 * @param {object} [params.identity] - the run's identity (designFingerprint)
 * @returns {{ ok: boolean, code?: string, reason?: string, instances?: Array, crossover?: object, previousInstances?: Array, previousCrossover?: object }}
 */
export function buildCombinedElectronicApply({
  lever,
  instances,
  currentCrossover,
  identity = {},
} = {}) {
  if (!lever) return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.NO_LEVER);

  // Identity proof must have passed for the lever to be actionable.
  if (lever.identityProof?.valid !== true) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.INCOMPLETE);
  }

  // Stale fingerprint: the lever was confirmed against a different design.
  const leverFingerprint = lever.designFingerprint || lever.cacheKey || null;
  const currentFingerprint = identity.designFingerprint || null;
  if (leverFingerprint && currentFingerprint && leverFingerprint !== currentFingerprint) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.STALE_FINGERPRINT);
  }

  // Complete crossover payload.
  const crossoverAfter = lever.crossover?.after || null;
  if (!crossoverAfter || !Number.isFinite(Number(crossoverAfter.frequencyHz))) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.NO_CROSSOVER);
  }

  // Complete per-source tuning — the winner's own confirmed tuning.
  const tuning = lever.tuning || [];
  if (!Array.isArray(tuning) || tuning.length === 0) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.NO_TUNING);
  }

  // The winner's tuning entries (from the lever's tuning rows carry the
  // winner's `to` values). Reconstruct the tuning array for applyCalibrationTuning.
  const active = activeInstances(instances);
  if (tuning.length !== active.length) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH);
  }

  // Re-verify the installed geometry matches the lever's sourceIdentity.
  if (!verifySourceIdentity(lever, instances)) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH);
  }

  // Build the tuning array in the sourceId-keyed format applyCalibrationTuning expects.
  const tuningToApply = tuning.map((row) => {
    const entry = active.find((inst) => inst.id === row.subId);
    return {
      sourceId: row.subId,
      delayMs: Number(row.toDelayMs) || 0,
      gainDb: Number(row.toGainDb) || 0,
      phaseControlDeg: Number(row.toPhaseDeg) || 0,
      polarity: row.toPolarity,
    };
  });

  // Apply the per-source tuning via the existing, proven applyCalibrationTuning.
  // This stamps tuningSource: "v2-optimised" provenance on each instance.
  let nextInstances;
  try {
    nextInstances = applyCalibrationTuning(instances, tuningToApply, "combined-electronic");
  } catch {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH);
  }

  // The crossover config to write — the lever's confirmed `after` config.
  const nextCrossover = {
    frequencyHz: Number(crossoverAfter.frequencyHz),
    speakerHpSlopeDbPerOct: Number(crossoverAfter.speakerHpSlopeDbPerOct),
    subwooferLpSlopeDbPerOct: Number(crossoverAfter.subwooferLpSlopeDbPerOct),
    linkFrequencies: crossoverAfter.linkFrequencies !== false,
    subwooferFrequencyHz: crossoverAfter.linkFrequencies === false
      ? Number(crossoverAfter.subwooferFrequencyHz)
      : Number(crossoverAfter.frequencyHz),
  };

  return {
    ok: true,
    code: null,
    reason: null,
    instances: nextInstances,
    crossover: nextCrossover,
    // Previous state for restoration and auditability.
    previousInstances: instances,
    previousCrossover: currentCrossover || null,
  };
}

/**
 * Build the design state update to UNDO a combined electronic apply.
 * Writes back the lever's `before` tuning and `before` crossover — the exact
 * state the design was in before the combined apply.
 *
 * @param {object} params
 * @param {object} params.lever - the combined electronic plan lever
 * @param {Array} params.instances - current subwooferInstances (ALL)
 * @returns {{ ok: boolean, code?: string, reason?: string, instances?: Array, crossover?: object }}
 */
export function buildCombinedElectronicUndo({
  lever,
  instances,
} = {}) {
  if (!lever) return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.NO_LEVER);

  const crossoverBefore = lever.crossover?.before || null;
  const tuning = lever.tuning || [];
  if (!Array.isArray(tuning) || tuning.length === 0) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.NO_TUNING);
  }

  const active = activeInstances(instances);
  if (tuning.length !== active.length) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH);
  }

  // Restore the `from` tuning values.
  const tuningToRestore = tuning.map((row) => ({
    sourceId: row.subId,
    delayMs: Number(row.fromDelayMs) || 0,
    gainDb: Number(row.fromGainDb) || 0,
    phaseControlDeg: Number(row.fromPhaseDeg) || 0,
    polarity: row.fromPolarity,
  }));

  let nextInstances;
  try {
    nextInstances = applyCalibrationTuning(instances, tuningToRestore, "combined-electronic-undo");
  } catch {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH);
  }

  // Restore the `before` crossover, or null when none was recorded.
  const nextCrossover = crossoverBefore ? {
    frequencyHz: Number(crossoverBefore.frequencyHz),
    speakerHpSlopeDbPerOct: Number(crossoverBefore.speakerHpSlopeDbPerOct),
    subwooferLpSlopeDbPerOct: Number(crossoverBefore.subwooferLpSlopeDbPerOct),
    linkFrequencies: crossoverBefore.linkFrequencies !== false,
    subwooferFrequencyHz: crossoverBefore.linkFrequencies === false
      ? Number(crossoverBefore.subwooferFrequencyHz)
      : Number(crossoverBefore.frequencyHz),
  } : null;

  return {
    ok: true,
    code: null,
    reason: null,
    instances: nextInstances,
    crossover: nextCrossover,
  };
}

/**
 * Check whether the current design already has the combined electronic
 * configuration applied — both the per-source tuning AND the crossover.
 *
 * @param {object} lever - the combined electronic plan lever
 * @param {Array} instances - current subwooferInstances (ALL)
 * @param {object|null} currentCrossover - the design's current crossover
 * @returns {boolean} true only if ALL tuning AND crossover match
 */
export function isCombinedElectronicApplied(lever, instances, currentCrossover) {
  if (!lever || !Array.isArray(lever.tuning) || !lever.crossover?.after) return false;
  const active = activeInstances(instances);
  if (active.length !== lever.tuning.length) return false;

  // Verify provenance: the instances must carry the combined-electronic
  // tuning source, not merely coincidental value matching.
  if (!active.every((inst) => inst.tuningSource === "v2-optimised")) return false;

  // Tuning match (delay, gain, phase, polarity).
  for (const row of lever.tuning) {
    const inst = active.find((i) => i.id === row.subId);
    if (!inst) return false;
    if (Math.abs((Number(inst.delayMs) || 0) - Number(row.toDelayMs)) > 0.1) return false;
    if (Math.abs((Number(inst.gainDb) || 0) - Number(row.toGainDb)) > 0.1) return false;
    if (Math.abs((Number(inst.phaseControlDeg ?? inst.phaseAdjust) || 0) - Number(row.toPhaseDeg)) > 0.1) return false;
    const instPol = Number(inst.polarity) < 0 || Number(inst.polarity) === 180 ? -1 : 1;
    if (instPol !== row.toPolarity) return false;
  }

  // Crossover match.
  const after = lever.crossover.after;
  if (!currentCrossover) return false;
  if (Number(currentCrossover.frequencyHz) !== Number(after.frequencyHz)) return false;
  if (Number(currentCrossover.speakerHpSlopeDbPerOct) !== Number(after.speakerHpSlopeDbPerOct)) return false;
  if (Number(currentCrossover.subwooferLpSlopeDbPerOct) !== Number(after.subwooferLpSlopeDbPerOct)) return false;
  if ((currentCrossover.linkFrequencies !== false) !== (after.linkFrequencies !== false)) return false;
  if (after.linkFrequencies === false
    && Number(currentCrossover.subwooferFrequencyHz ?? currentCrossover.frequencyHz)
      !== Number(after.subwooferFrequencyHz)) return false;

  return true;
}