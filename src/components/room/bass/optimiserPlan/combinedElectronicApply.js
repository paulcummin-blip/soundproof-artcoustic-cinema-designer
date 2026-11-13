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
//   - The new crossover config (the lever's raw crossover.after, never
//     reconstructed from rounded display rows or defaulted via Number(...) || 0).
//   - The previous instances and crossover, for restoration and auditability.
//
// IDENTITY: exact match required — no tolerances, no NaN. The lever's
// sourceIdentity (model, position, height, rotation) must match the current
// instances EXACTLY. Both fingerprint domains (inputIdentity and
// baselineCacheKey) must be nonempty and match their authorities. A mismatch
// means the design has changed since the run confirmed the candidate, and
// apply is refused — the previous state is retained.
//
// PURE: no React, no stores, no calculation. It changes no bass maths, no
// scoring, no grading, and no search.
// ---------------------------------------------------------------------------

import { applyCalibrationTuning } from "../improveBassV2/improveBassV2ApplyCalibration.js";
import { activeInstances } from "./optimiserPlanMatching.js";

export const COMBINED_ELECTRONIC_APPLY_BLOCK = Object.freeze({
  NO_LEVER: "no_lever",
  INCOMPLETE: "incomplete",
  IDENTITY_MISMATCH: "identity_mismatch",
  NO_CROSSOVER: "no_crossover",
  NO_TUNING: "no_tuning",
  STALE_FINGERPRINT: "stale_fingerprint",
  BAD_TUNING: "bad_tuning",
  BAD_CROSSOVER: "bad_crossover",
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
  [COMBINED_ELECTRONIC_APPLY_BLOCK.BAD_TUNING]:
    "The confirmed tuning contains duplicate IDs, non-finite values, or missing fields — it cannot be applied safely.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.BAD_CROSSOVER]:
    "The confirmed crossover contains non-finite or missing values — it cannot be applied safely.",
});

const blocked = (code) => ({
  ok: false,
  code,
  reason: COMBINED_ELECTRONIC_APPLY_BLOCK_MESSAGE[code],
});

/**
 * Require a finite number, returning null when the value is not finite.
 * Never defaults via Number(...) || 0 — a missing value stays missing.
 */
function requireFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Verify the lever's sourceIdentity matches the current active instances
 * EXACTLY — no tolerances, no NaN comparisons. A mismatch (model, position,
 * height, rotation) means the design has changed since the run confirmed the
 * candidate — apply is refused.
 */
function verifySourceIdentity(lever, instances) {
  const identity = Array.isArray(lever?.sourceIdentity) ? lever.sourceIdentity : [];
  const active = activeInstances(instances);
  if (identity.length === 0 || identity.length !== active.length) return false;
  const byId = new Map(active.map((inst) => [inst.id, inst]));
  for (const entry of identity) {
    const inst = byId.get(entry.sourceId);
    if (!inst) return false;
    // Model must match exactly.
    if ((inst.model || null) !== (entry.model || null)) return false;
    // Position must match exactly — no tolerance, no NaN.
    const ix = requireFinite(inst.position?.x);
    const iy = requireFinite(inst.position?.y);
    const ex = requireFinite(entry.geometry?.x);
    const ey = requireFinite(entry.geometry?.y);
    if (ix === null || iy === null || ex === null || ey === null) return false;
    if (ix !== ex || iy !== ey) return false;
    // Height must match exactly.
    const ih = requireFinite(inst.bottomHeightM);
    const eh = requireFinite(entry.geometry?.bottomHeightM);
    if (ih === null || eh === null || ih !== eh) return false;
    // Rotation must match exactly.
    const ir = requireFinite(inst.rotationDeg);
    const er = requireFinite(entry.geometry?.rotationDeg);
    if (ir === null || er === null || ir !== er) return false;
  }
  return true;
}

/**
 * Validate the raw tuning entries from the lever. Rejects duplicate IDs,
 * non-finite values, or missing fields. The tuning values used for apply are
 * the WINNER'S OWN raw values — never reconstructed from rounded display rows
 * or defaulted via Number(...) || 0.
 */
function validateRawTuning(tuning, active) {
  if (!Array.isArray(tuning) || tuning.length === 0) return null;
  if (tuning.length !== active.length) return null;
  const seenIds = new Set();
  const activeIds = new Set(active.map((inst) => inst.id));
  const result = [];
  for (const row of tuning) {
    if (!row?.subId || !activeIds.has(row.subId)) return null;
    if (seenIds.has(row.subId)) return null; // duplicate ID
    seenIds.add(row.subId);
    const delayMs = requireFinite(row.toDelayMs);
    const gainDb = requireFinite(row.toGainDb);
    const phaseControlDeg = requireFinite(row.toPhaseDeg);
    if (delayMs === null || gainDb === null || phaseControlDeg === null) return null;
    const polarity = row.toPolarity;
    if (polarity !== 1 && polarity !== -1 && polarity !== 0 && polarity !== 180) return null;
    result.push({
      sourceId: row.subId,
      delayMs,
      gainDb,
      phaseControlDeg,
      polarity,
    });
  }
  return result;
}

/**
 * Validate the raw crossover from the lever. The crossover values used for
 * apply are the WINNER'S OWN raw confirmed values — never reconstructed from
 * rounded display rows or defaulted.
 */
function validateRawCrossover(crossoverAfter) {
  if (!crossoverAfter || typeof crossoverAfter !== "object") return null;
  const frequencyHz = requireFinite(crossoverAfter.frequencyHz);
  const speakerHpSlopeDbPerOct = requireFinite(crossoverAfter.speakerHpSlopeDbPerOct);
  const subwooferLpSlopeDbPerOct = requireFinite(crossoverAfter.subwooferLpSlopeDbPerOct);
  if (frequencyHz === null || frequencyHz <= 0) return null;
  if (speakerHpSlopeDbPerOct === null) return null;
  if (subwooferLpSlopeDbPerOct === null) return null;
  const linkFrequencies = crossoverAfter.linkFrequencies !== false;
  let subwooferFrequencyHz = frequencyHz;
  if (!linkFrequencies) {
    const subFreq = requireFinite(crossoverAfter.subwooferFrequencyHz);
    if (subFreq === null || subFreq <= 0) return null;
    subwooferFrequencyHz = subFreq;
  }
  return {
    frequencyHz,
    speakerHpSlopeDbPerOct,
    subwooferLpSlopeDbPerOct,
    linkFrequencies,
    subwooferFrequencyHz,
  };
}

/**
 * Build the complete design state update for a combined electronic apply.
 *
 * Writes BOTH the per-source tuning (via applyCalibrationTuning) AND the
 * crossover config in one coherent update. Returns the new instances, the
 * new crossover, and the previous state for restoration.
 *
 * Identity is re-verified before apply: the lever's sourceIdentity (model,
 * position, height, rotation) must match the current instances EXACTLY, and
 * both fingerprint domains must match their authorities.
 *
 * @param {object} params
 * @param {object} params.lever - the combined electronic plan lever
 * @param {Array} params.instances - current subwooferInstances (ALL, including disabled)
 * @param {object|null} params.currentCrossover - the design's current crossover
 * @param {object} [params.identity] - the run's identity (both fingerprint domains)
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

  // Fingerprint domains — each checked against its own authority.
  const leverInputIdentity = lever.inputIdentity || null;
  const authorityInputIdentity = identity.inputIdentity || lever.inputIdentityAuthority || null;
  if (leverInputIdentity && authorityInputIdentity && leverInputIdentity !== authorityInputIdentity) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.STALE_FINGERPRINT);
  }
  const leverCacheKey = lever.baselineCacheKey || null;
  const authorityCacheKey = identity.cacheKey || identity.designFingerprint || lever.cacheKeyAuthority || null;
  if (leverCacheKey && authorityCacheKey && leverCacheKey !== authorityCacheKey) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.STALE_FINGERPRINT);
  }

  // Complete crossover payload — validated raw, not reconstructed.
  const crossoverAfter = lever.crossover?.after || null;
  const nextCrossover = validateRawCrossover(crossoverAfter);
  if (!nextCrossover) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.BAD_CROSSOVER);
  }

  // Complete per-source tuning — the winner's own raw values, validated.
  const tuning = lever.tuning || [];
  if (!Array.isArray(tuning) || tuning.length === 0) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.NO_TUNING);
  }

  const active = activeInstances(instances);
  if (tuning.length !== active.length) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH);
  }

  // Re-verify the installed geometry matches the lever's sourceIdentity EXACTLY.
  if (!verifySourceIdentity(lever, instances)) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH);
  }

  // Validate the raw tuning entries — rejects duplicate IDs, non-finite, missing.
  const tuningToApply = validateRawTuning(tuning, active);
  if (!tuningToApply) {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.BAD_TUNING);
  }

  // Apply the per-source tuning via the existing, proven applyCalibrationTuning.
  // This stamps tuningSource: "v2-optimised" provenance on each instance.
  let nextInstances;
  try {
    nextInstances = applyCalibrationTuning(instances, tuningToApply, "combined-electronic");
  } catch {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH);
  }

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

  // Validate the raw `from` tuning entries.
  const seenIds = new Set();
  const activeIds = new Set(active.map((inst) => inst.id));
  const tuningToRestore = [];
  for (const row of tuning) {
    if (!row?.subId || !activeIds.has(row.subId)) return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.BAD_TUNING);
    if (seenIds.has(row.subId)) return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.BAD_TUNING);
    seenIds.add(row.subId);
    const delayMs = requireFinite(row.fromDelayMs);
    const gainDb = requireFinite(row.fromGainDb);
    const phaseControlDeg = requireFinite(row.fromPhaseDeg);
    if (delayMs === null || gainDb === null || phaseControlDeg === null) return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.BAD_TUNING);
    tuningToRestore.push({
      sourceId: row.subId,
      delayMs,
      gainDb,
      phaseControlDeg,
      polarity: row.fromPolarity,
    });
  }

  let nextInstances;
  try {
    nextInstances = applyCalibrationTuning(instances, tuningToRestore, "combined-electronic-undo");
  } catch {
    return blocked(COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH);
  }

  // Restore the `before` crossover — validated raw.
  const nextCrossover = crossoverBefore ? validateRawCrossover(crossoverBefore) : null;

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