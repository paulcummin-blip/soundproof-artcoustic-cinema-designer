// buildOptimiserPlan.js
// ---------------------------------------------------------------------------
// Builds the persisted ADI Optimisation Plan from an EVALUATED optimiser run.
//
// Rules this builder obeys:
//   - It never invents a recommended value. Every value written here was
//     produced by the optimiser's own confirmed candidates.
//   - A lever's own effect is taken from its OWN confirmed candidate result.
//     When no lever-only evaluation exists, the effect is null and the fact is
//     recorded (rule 6) — the combined candidate's improvement is never
//     attributed to a single lever.
//   - Only levers whose evaluated values actually CHANGE are included.
//   - Unchanged levers are omitted, so an "Applied" state can never be claimed
//     for a lever the optimiser did not propose to change.
// ---------------------------------------------------------------------------

import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_EVIDENCE,
  OPTIMISER_LEVER_ORDER,
  OPTIMISER_PLAN_VERSION,
  POLARITY_NOT_EVALUATED_REASON,
} from "./optimiserPlanConstants.js";
import { existingTradeOff, leverEffectFrom, summariseResult, summariseSeats } from "./optimiserPlanMetrics.js";
import { activeInstances, instanceById, polarityLabel, resolveAppliedMap } from "./optimiserPlanMatching.js";

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 2) => (value == null ? null : Number(Number(value).toFixed(digits)));

/** Human label for an affected subwoofer: its group and its position in it. */
function describeSub(instances, instance) {
  if (!instance) return null;
  const group = instance.legacyGroup === "front" || instance.legacyGroup === "rear"
    ? instance.legacyGroup
    : null;
  if (!group) return instance.id || null;
  const peers = activeInstances(instances).filter((candidate) => candidate?.legacyGroup === group);
  const index = peers.findIndex((candidate) => candidate?.id === instance.id);
  const groupLabel = group === "front" ? "Front" : "Rear";
  return index >= 0 ? `${groupLabel} sub ${index + 1}` : `${groupLabel} sub`;
}

/** Pair a confirmed candidate's per-source tuning with the current instances. */
function pairTuning(tuning, instances) {
  const active = activeInstances(instances);
  const rows = [];
  (Array.isArray(tuning) ? tuning : []).forEach((entry, index) => {
    const instance = entry?.sourceId != null
      ? instanceById(instances, entry.sourceId)
      : active[index] || null;
    if (!instance) return;
    rows.push({ instance, entry });
  });
  return rows;
}

/** Normalised polarity of a tuning entry or subwoofer instance. */
function polarityOf(entry) {
  return Number(entry?.polarity) < 0 || Number(entry?.polarity) === 180 ? -1 : 1;
}

/**
 * The COMBINED candidate's own tuning, paired with the current instances.
 * Every value here is the candidate's own evaluated value. `phaseControlDeg` is
 * persisted only when the candidate states it, and is never exposed as a lever.
 */
function combinedTuning(result, instances) {
  const rows = pairTuning(result?.appliedTuning || result?.tuning || [], instances);
  return rows.map(({ instance, entry }) => {
    const fromPolarity = polarityOf(instance);
    const toPolarity = polarityOf(entry);
    const fromDelayMs = num(instance.delayMs) ?? 0;
    const toDelayMs = num(entry.delayMs) ?? 0;
    const fromGainDb = num(instance.gainDb) ?? 0;
    const toGainDb = num(entry.gainDb) ?? 0;
    return {
      subId: instance.id,
      label: describeSub(instances, instance),
      group: instance.legacyGroup || null,
      fromDelayMs: round(fromDelayMs, 2),
      toDelayMs: round(toDelayMs, 2),
      fromGainDb: round(fromGainDb, 2),
      toGainDb: round(toGainDb, 2),
      fromPolarity,
      toPolarity,
      fromLabel: polarityLabel(fromPolarity),
      toLabel: polarityLabel(toPolarity),
      phaseControlDeg: num(entry.phaseControlDeg),
      changed: fromPolarity !== toPolarity
        || Math.abs(toDelayMs - fromDelayMs) >= 0.1
        || Math.abs(toGainDb - fromGainDb) >= 0.1,
    };
  });
}

function placementChanges({ positionResult, instances }) {
  const coordinates = positionResult?.positionCoordinates || positionResult?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length === 0) return [];
  const active = activeInstances(instances);
  if (active.length !== coordinates.length) return [];
  const changes = [];
  coordinates.forEach((coordinate, index) => {
    const instance = active[index];
    const fromX = num(instance?.position?.x);
    const fromY = num(instance?.position?.y);
    const toX = num(coordinate?.x);
    const toY = num(coordinate?.y);
    if (fromX == null || fromY == null || toX == null || toY == null) return;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distanceM = Math.sqrt(dx * dx + dy * dy);
    if (distanceM < 0.01) return; // no movement — not a change
    changes.push({
      lever: OPTIMISER_LEVER.PLACEMENT,
      subId: instance.id,
      label: describeSub(instances, instance),
      group: instance.legacyGroup || null,
      fromX: round(fromX), fromY: round(fromY),
      toX: round(toX), toY: round(toY),
      distanceMm: Math.round(distanceM * 1000),
      direction: describeDirection(dx, dy),
    });
  });
  return changes;
}

function describeDirection(dx, dy) {
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  if (horizontal) return dx > 0 ? "towards the room's right" : "towards the room's left";
  return dy > 0 ? "towards the rear wall" : "towards the screen wall";
}

function tuningChanges({ lever, result, instances, pick }) {
  const rows = pairTuning(result?.appliedTuning || result?.tuning || [], instances);
  const changes = [];
  for (const { instance, entry } of rows) {
    const change = pick({ instance, entry });
    if (change) changes.push(change);
  }
  return changes;
}

function delayChanges(result, instances) {
  return tuningChanges({
    lever: OPTIMISER_LEVER.DELAY,
    result,
    instances,
    pick: ({ instance, entry }) => {
      const fromMs = round(num(instance.delayMs) ?? 0, 2);
      const toMs = round(num(entry.delayMs) ?? 0, 2);
      if (toMs == null || Math.abs(toMs - fromMs) < 0.1) return null;
      return {
        lever: OPTIMISER_LEVER.DELAY,
        subId: instance.id,
        label: describeSub(instances, instance),
        group: instance.legacyGroup || null,
        fromMs, toMs,
      };
    },
  });
}

function gainChanges(result, instances) {
  return tuningChanges({
    lever: OPTIMISER_LEVER.GAIN,
    result,
    instances,
    pick: ({ instance, entry }) => {
      const fromDb = round(num(instance.gainDb) ?? 0, 2);
      const toDb = round(num(entry.gainDb) ?? 0, 2);
      if (toDb == null || Math.abs(toDb - fromDb) < 0.1) return null;
      return {
        lever: OPTIMISER_LEVER.GAIN,
        subId: instance.id,
        label: describeSub(instances, instance),
        group: instance.legacyGroup || null,
        fromDb, toDb,
      };
    },
  });
}

function polarityChanges(result, instances) {
  return tuningChanges({
    lever: OPTIMISER_LEVER.POLARITY,
    result,
    instances,
    pick: ({ instance, entry }) => {
      const from = Number(instance.polarity) < 0 || Number(instance.polarity) === 180 ? -1 : 1;
      const to = Number(entry.polarity) < 0 || Number(entry.polarity) === 180 ? -1 : 1;
      if (from === to) return null;
      return {
        lever: OPTIMISER_LEVER.POLARITY,
        subId: instance.id,
        label: describeSub(instances, instance),
        group: instance.legacyGroup || null,
        from, to,
        fromLabel: polarityLabel(from),
        toLabel: polarityLabel(to),
      };
    },
  });
}

/** Best confirmed PLACEMENT candidate — never the combined winner's tuning. */
function selectPositionResult(selection) {
  const winner = selection?.winner || null;
  if (winner?.isPositionCandidate && (winner.positionCoordinates || winner.coordinates)) return winner;
  const candidates = (selection?.confirmedResults || [])
    .filter((result) => result?.isPositionCandidate && result.candidateKind !== "current")
    .filter((result) => Array.isArray(result.positionCoordinates || result.coordinates));
  return candidates[0] || null;
}

function normaliseDecisions(decisions) {
  const normalised = {};
  for (const leverKey of OPTIMISER_LEVER_ORDER) {
    if (decisions?.[leverKey]?.disabled === true) {
      normalised[leverKey] = { disabled: true, decidedAt: decisions[leverKey].decidedAt || null };
    }
  }
  return normalised;
}

/**
 * Build the plan. Returns null when the run produced no evaluated candidate.
 *
 * @param {object} params
 * @param {object} params.selection - evaluated V2 selection
 * @param {object} [params.baseline] - baseline result (defaults to selection.currentResult)
 * @param {object} params.identity - { projectId, versionId, designFingerprint,
 *   resultFingerprint, cacheKey, baseDesignFingerprint, target, engineVersion }
 * @param {Array} params.instances - current subwooferInstances
 * @param {object} [params.leverDecisions] - persisted designer decisions
 * @param {string[]} [params.notes] - extra factual notes
 * @returns {object|null}
 */
export function buildOptimiserPlan({
  selection,
  baseline = null,
  identity = {},
  instances = [],
  leverDecisions = {},
  notes = [],
} = {}) {
  if (!selection || typeof selection !== "object") return null;
  const winner = selection.winner || null;
  if (!winner) return null;

  const baselineResult = baseline || selection.currentResult || null;
  const baselineSummary = summariseResult(baselineResult);

  const levers = {};

  const positionResult = selectPositionResult(selection);
  if (positionResult) {
    const changes = placementChanges({ positionResult, instances });
    if (changes.length > 0) {
      levers[OPTIMISER_LEVER.PLACEMENT] = {
        lever: OPTIMISER_LEVER.PLACEMENT,
        evidenceStatus: OPTIMISER_LEVER_EVIDENCE.EVALUATED,
        evaluated: true,
        notEvaluated: false,
        notEvaluatedReason: null,
        sourceCandidateId: positionResult?.candidateId || null,
        changes,
        effect: leverEffectFrom(positionResult, baselineResult),
        reason: selection?.positionOptimisation?.materialityReason
          || positionResult?.materialityReason || null,
        tradeOff: existingTradeOff(positionResult),
      };
    }
  }

  const polarity = polarityChanges(winner, instances);
  if (polarity.length > 0) {
    levers[OPTIMISER_LEVER.POLARITY] = {
      lever: OPTIMISER_LEVER.POLARITY,
      // No polarity-only evaluation exists in the optimiser: this lever is
      // recorded because the COMBINED candidate inverts it. The exact value is
      // persisted, the effect is never claimed.
      evidenceStatus: OPTIMISER_LEVER_EVIDENCE.COMBINED_ONLY,
      evaluated: false,
      notEvaluated: true,
      notEvaluatedReason: POLARITY_NOT_EVALUATED_REASON,
      sourceCandidateId: winner.candidateId || null,
      changes: polarity,
      effect: null,
      reason: null,
      tradeOff: null,
    };
  }

  if (selection.calibrationResult) {
    const changes = delayChanges(selection.calibrationResult, instances);
    if (changes.length > 0) {
      levers[OPTIMISER_LEVER.DELAY] = {
        lever: OPTIMISER_LEVER.DELAY,
        evidenceStatus: OPTIMISER_LEVER_EVIDENCE.EVALUATED,
        evaluated: true,
        notEvaluated: false,
        notEvaluatedReason: null,
        sourceCandidateId: selection.calibrationResult?.candidateId || null,
        changes,
        effect: leverEffectFrom(selection.calibrationResult, baselineResult),
        reason: selection?.calibrationMaterial?.reason || null,
        tradeOff: existingTradeOff(selection.calibrationResult),
      };
    }
  }

  if (selection.gainResult) {
    const changes = gainChanges(selection.gainResult, instances);
    if (changes.length > 0) {
      levers[OPTIMISER_LEVER.GAIN] = {
        lever: OPTIMISER_LEVER.GAIN,
        evidenceStatus: OPTIMISER_LEVER_EVIDENCE.EVALUATED,
        evaluated: true,
        notEvaluated: false,
        notEvaluatedReason: null,
        sourceCandidateId: selection.gainResult?.candidateId || null,
        changes,
        effect: leverEffectFrom(selection.gainResult, baselineResult),
        reason: selection?.gainMaterial?.reason || null,
        tradeOff: existingTradeOff(selection.gainResult),
      };
    }
  }

  if (Object.keys(levers).length === 0) return null;

  const individualEffectsEvaluated = OPTIMISER_LEVER_ORDER
    .some((leverKey) => levers[leverKey]?.effect != null);

  const planNotes = [...notes];
  if (!individualEffectsEvaluated) {
    planNotes.push(
      "Only the combined candidate was evaluated — individual lever effects were not evaluated.",
    );
  }
  if (levers[OPTIMISER_LEVER.POLARITY] && !levers[OPTIMISER_LEVER.POLARITY].evaluated) {
    planNotes.push(
      "Polarity was evaluated only as part of the combined candidate — it has no individually evaluated effect.",
    );
  }

  const combinedCoordinates = winner.positionCoordinates || winner.coordinates || null;

  return {
    planVersion: OPTIMISER_PLAN_VERSION,
    savedAt: new Date().toISOString(),
    // --- 1. source identity ---
    projectId: identity.projectId || null,
    versionId: identity.versionId || null,
    baseDesignFingerprint: identity.baseDesignFingerprint || null,
    designFingerprint: identity.designFingerprint || null,
    resultFingerprint: identity.resultFingerprint || null,
    cacheKey: identity.cacheKey || identity.designFingerprint || null,
    target: {
      p14TargetDb: num(identity.target?.p14TargetDb),
      targetKey: identity.target?.targetKey || null,
    },
    engineVersion: identity.engineVersion || winner.algorithmVersion || null,
    candidateId: winner.candidateId || null,
    candidateKind: winner.candidateKind || (winner.isPositionCandidate ? "position" : null),
    // --- 2. baseline result ---
    baseline: baselineSummary,
    // --- 3. combined winning candidate ---
    combined: {
      evaluated: true,
      candidateId: winner.candidateId || null,
      coordinates: Array.isArray(combinedCoordinates)
        ? combinedCoordinates.map((coordinate) => ({
          x: round(coordinate?.x),
          y: round(coordinate?.y),
        }))
        : null,
      tuning: combinedTuning(winner, instances),
      effect: leverEffectFrom(winner, baselineResult),
      seats: summariseSeats(winner),
      tradeOff: existingTradeOff(winner),
    },
    levers,
    individualEffectsEvaluated,
    leverDecisions: normaliseDecisions(leverDecisions),
    applied: resolveAppliedMap(levers, instances),
    notes: planNotes,
  };
}

export { describeSub };