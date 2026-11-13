// combinedElectronicLever.js
// ---------------------------------------------------------------------------
// The plan lever for a combined electronic (crossover + tuning) optimiser
// winner.
//
// The existing plan builder constructs delay, gain, polarity, placement and
// seating levers from EACH lever's own independently evaluated candidate
// (selection.calibrationResult, selection.gainResult, etc.). A combined
// crossover + retune winner is a DIFFERENT candidate: it carries its own
// crossover config and per-source tuning, canonically confirmed as one joint
// change. Without this lever, buildOptimiserPlan returns null when the
// combined electronic winner is selected and no individual lever was material
// — the run is then misclassified as "winning change not retained."
//
// This lever represents the combined electronic winner's COMPLETE payload:
//   - The exact canonically evaluated crossover config (frequency, linking,
//     slopes) — before and after.
//   - The exact per-source tuning (delay, gain, phase, polarity) — before and
//     after.
//   - Per-source model and physical geometry identity (position, height,
//     rotation) so the candidate is reproducible exactly.
//   - Seating and RSP authority snapshot.
//   - Confirmation and design fingerprints.
//   - Positive identity proof (same installed geometry, current fingerprint,
//     complete payload, no physical change).
//
// When identity proof passes (identityProof.valid === true) the lever IS
// actionable: the existing CrossoverRecommendation apply path already writes
// crossover + tuning + recalculate + verify, and the combined electronic apply
// builder (combinedElectronicApply.js) reproduces the same design state update
// from this lever. When identity proof fails the lever is NOT actionable — it
// retains the full evidence for diagnostics but is never offered for Apply.
//
// READ-ONLY: reads the confirmed winner and the current instances. It changes
// no acoustic maths, no scoring, no grading, and no search.
// ---------------------------------------------------------------------------

import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_EVIDENCE,
} from "./optimiserPlanConstants.js";
import { leverEffectFrom } from "./optimiserPlanMetrics.js";
import { activeInstances } from "./optimiserPlanMatching.js";
import { proveCombinedElectronicIdentity } from "./combinedElectronicIdentityProof.js";

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 2) => (value == null ? null : Number(Number(value).toFixed(digits)));

/** Normalised polarity: -1 (inverted) or 1 (normal). */
function polarityOf(entry) {
  return Number(entry?.polarity) < 0 || Number(entry?.polarity) === 180 ? -1 : 1;
}

/** Human label for an affected subwoofer. */
function describeSub(instances, instance) {
  if (!instance) return null;
  const group = instance.legacyGroup === "front" || instance.legacyGroup === "rear"
    ? instance.legacyGroup : null;
  if (!group) return instance.id || null;
  const peers = activeInstances(instances).filter((c) => c?.legacyGroup === group);
  const index = peers.findIndex((c) => c?.id === instance.id);
  const groupLabel = group === "front" ? "Front" : "Rear";
  return index >= 0 ? `${groupLabel} sub ${index + 1}` : `${groupLabel} sub`;
}

/** Pair the winner's per-source tuning with the current instances. */
function pairTuning(tuning, instances) {
  const active = activeInstances(instances);
  const rows = [];
  (Array.isArray(tuning) ? tuning : []).forEach((entry, index) => {
    const instance = entry?.sourceId != null
      ? active.find((inst) => inst.id === entry.sourceId)
      : active[index] || null;
    if (!instance) return;
    rows.push({ instance, entry });
  });
  return rows;
}

/**
 * The per-source tuning changes the winner proposes, with before/after values.
 * Only sources whose tuning actually changed are listed as changes.
 */
function buildTuningChanges(winner, instances) {
  const rows = pairTuning(winner?.appliedTuning || winner?.tuning, instances);
  return rows.map(({ instance, entry }) => {
    const fromDelayMs = num(instance.delayMs) ?? 0;
    const toDelayMs = num(entry.delayMs) ?? 0;
    const fromGainDb = num(instance.gainDb) ?? 0;
    const toGainDb = num(entry.gainDb) ?? 0;
    const fromPhase = num(instance.phaseControlDeg ?? instance.phaseAdjust) ?? 0;
    const toPhase = num(entry.phaseControlDeg ?? entry.phaseAdjust) ?? 0;
    const fromPolarity = polarityOf(instance);
    const toPolarity = polarityOf(entry);
    const changed =
      Math.abs(toDelayMs - fromDelayMs) >= 0.1
      || Math.abs(toGainDb - fromGainDb) >= 0.1
      || Math.abs(toPhase - fromPhase) >= 0.1
      || fromPolarity !== toPolarity;
    return {
      subId: instance.id,
      label: describeSub(instances, instance),
      group: instance.legacyGroup || null,
      fromDelayMs: round(fromDelayMs, 2),
      toDelayMs: round(toDelayMs, 2),
      fromGainDb: round(fromGainDb, 2),
      toGainDb: round(toGainDb, 2),
      fromPhaseDeg: round(fromPhase, 1),
      toPhaseDeg: round(toPhase, 1),
      fromPolarity,
      toPolarity,
      changed,
    };
  });
}

/**
 * The crossover change the winner proposes, with before/after config.
 * `before` is null when the current design's crossover is not available —
 * the change is still recorded from the winner's own confirmed config.
 */
function buildCrossoverChange(winner, currentCrossover) {
  const after = winner?.crossover || null;
  if (!after || typeof after !== "object") return null;
  const before = currentCrossover || null;
  return {
    before: before ? {
      frequencyHz: num(before.frequencyHz),
      speakerHpSlopeDbPerOct: num(before.speakerHpSlopeDbPerOct),
      subwooferLpSlopeDbPerOct: num(before.subwooferLpSlopeDbPerOct),
      linkFrequencies: before.linkFrequencies !== false,
      subwooferFrequencyHz: before.linkFrequencies === false
        ? num(before.subwooferFrequencyHz)
        : num(before.frequencyHz),
    } : null,
    after: {
      frequencyHz: num(after.frequencyHz),
      speakerHpSlopeDbPerOct: num(after.speakerHpSlopeDbPerOct),
      subwooferLpSlopeDbPerOct: num(after.subwooferLpSlopeDbPerOct),
      linkFrequencies: after.linkFrequencies !== false,
      subwooferFrequencyHz: after.linkFrequencies === false
        ? num(after.subwooferFrequencyHz)
        : num(after.frequencyHz),
    },
  };
}

/**
 * Per-source identity snapshot: model, physical geometry, and source id.
 * This makes the candidate reproducible exactly — the apply path can verify
 * the installed geometry matches before writing tuning + crossover.
 */
function buildSourceIdentity(winner, instances) {
  const rows = pairTuning(winner?.appliedTuning || winner?.tuning, instances);
  return rows.map(({ instance, entry }) => ({
    sourceId: instance.id,
    model: instance.model || null,
    label: describeSub(instances, instance),
    group: instance.legacyGroup || null,
    geometry: {
      x: round(num(instance.position?.x), 3),
      y: round(num(instance.position?.y), 3),
      bottomHeightM: round(num(instance.bottomHeightM), 3),
      rotationDeg: round(num(instance.rotationDeg), 1),
    },
  }));
}

/**
 * Build the combined electronic lever for a combined crossover + tuning winner.
 *
 * Returns null when the winner is not a combined electronic candidate (no
 * crossover, or a physical/seating combined candidate). When the winner IS a
 * combined electronic candidate, the lever is always built — even when
 * identity proof fails — so the plan never returns null and the run is never
 * misclassified as "winning change not retained." The identity proof result
 * is carried on the lever so the terminal evidence can state the exact reason.
 *
 * The lever is actionable (offerable for Apply) ONLY when identity proof
 * passes — same geometry, current fingerprint, complete payload, no physical
 * change. When proof fails, actionable is false and the lever is retained
 * for diagnostics only.
 *
 * @param {object} params
 * @param {object|null} params.winner - selection.winner (the confirmed result)
 * @param {Array} params.instances - current subwooferInstances
 * @param {object|null} params.baselineResult - the baseline result for effect
 * @param {object} [params.identity] - the run's identity (designFingerprint)
 * @param {object|null} [params.currentCrossover] - the design's current crossover
 * @param {Array} [params.seatingPositions] - current seating positions snapshot
 * @param {object} [params.rspAuthority] - { rspMode, manualRspY_m, manualRspX_m, designated_rsp_seat_id }
 * @returns {object|null} the lever, or null when the winner is not combined electronic
 */
export function buildCombinedElectronicLever({
  winner,
  instances,
  baselineResult,
  identity = {},
  currentCrossover = null,
  seatingPositions = null,
  rspAuthority = null,
} = {}) {
  if (!winner) return null;
  // Only a combined crossover integration candidate gets this lever.
  if (winner.combinedFrom?.crossover !== true) return null;
  if (!winner.crossover) return null;

  const identityProof = proveCombinedElectronicIdentity({ winner, instances, identity });
  const effect = leverEffectFrom(winner, baselineResult);
  const tuning = buildTuningChanges(winner, instances);
  const crossover = buildCrossoverChange(winner, currentCrossover);
  const sourceIdentity = buildSourceIdentity(winner, instances);
  const changes = tuning.filter((row) => row.changed);

  // The lever is actionable ONLY when identity proof passes: same geometry,
  // current fingerprint, complete payload, no physical change. A combined
  // electronic candidate whose identity cannot be proven is retained as
  // evidence but never offered for automatic Apply — a partial apply
  // (tuning without crossover, or against a different geometry) would not
  // reproduce the confirmed result.
  const actionable = identityProof.valid === true;

  return {
    lever: OPTIMISER_LEVER.COMBINED_ELECTRONIC,
    evidenceStatus: OPTIMISER_LEVER_EVIDENCE.EVALUATED,
    evaluated: true,
    notEvaluated: false,
    notEvaluatedReason: null,
    sourceCandidateId: winner.candidateId || null,
    // The measured improvement, read from the canonically confirmed result.
    effect,
    // Actionable when identity proof passes — the apply path can reproduce
    // the complete configuration (crossover + per-source tuning) against the
    // installed geometry. Not actionable when proof fails: retained for
    // diagnostics, never offered for automatic Apply.
    actionable,
    reason: actionable
      ? "Combined crossover and electronic tuning improvement, confirmed on the installed geometry."
      : "This combined crossover and tuning improvement could not be verified against the current design. Review the evaluated settings in Technical Details.",
    // Positive identity proof: same geometry, current fingerprint, complete
    // payload. When proof fails, the lever still exists (so the plan is not
    // null) but carries the issues for the terminal evidence to state.
    identityProof,
    // The complete crossover change (before/after).
    crossover,
    // The complete per-source tuning (before/after), including unchanged rows
    // so Technical Details can show the full evaluated configuration.
    tuning,
    // Only changed rows, for the plan's `changes` contract.
    changes: changes.length > 0 || crossover ? changes : [],
    // Per-source model and physical geometry identity — makes the candidate
    // reproducible exactly. The apply path verifies these match before writing.
    sourceIdentity,
    // The winning candidate's own origin and retune flags.
    candidateOrigin: winner.candidateOrigin || null,
    combinedFrom: winner.combinedFrom || null,
    // Seating and RSP authority snapshot at confirmation time.
    seatingAuthority: Array.isArray(seatingPositions)
      ? seatingPositions.map((seat) => ({
        id: seat?.id ?? null,
        y: round(num(seat?.y ?? seat?.y_m), 3),
        isPrimary: Boolean(seat?.isPrimary),
      }))
      : null,
    rspAuthority: rspAuthority ? {
      rspMode: rspAuthority.rspMode || null,
      manualRspY_m: round(num(rspAuthority.manualRspY_m), 3),
      manualRspX_m: round(num(rspAuthority.manualRspX_m), 3),
      designated_rsp_seat_id: rspAuthority.designated_rsp_seat_id || null,
    } : null,
    // Confirmation and design fingerprints — the run's own identity, so a
    // reopened plan states which design the candidate was confirmed against.
    designFingerprint: identity.designFingerprint || null,
    resultFingerprint: identity.resultFingerprint || null,
    cacheKey: identity.cacheKey || identity.designFingerprint || null,
  };
}