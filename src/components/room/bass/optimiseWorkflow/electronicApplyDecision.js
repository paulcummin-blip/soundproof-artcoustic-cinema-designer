// electronicApplyDecision.js
// ---------------------------------------------------------------------------
// Builds the durable record of a SEPARATE electronic Apply authorization — the
// one that fires from the run's guarded auto-apply loop
// (resolveCalibrationAutoApply with applyValidatedSimulation: true), NOT the
// overall recommendation winner selection.
//
// A small same-Level improvement can be legitimately applied by that separate
// path even when the overall recommendation selector finds no winner. This
// record captures the exact candidate, the verified receipt, and the actual
// before/after crossover and tuning settings so the saved plan, the
// published recommendation, and the completed UI all agree that the
// adjustment was applied and verified — without inventing an RP22 Level
// upgrade.
//
// Pure: no React, no side effects, no acoustic calculations.

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value, digits = 2) => (value == null ? null : Number(Number(value).toFixed(digits)));

/**
 * Build the electronic Apply decision record from the chosen candidate and the
 * verified receipt produced by performElectronicUpdate.
 *
 * @param {object} params
 * @param {object} params.chosen — { candidate, prepared, decision } from the apply loop
 * @param {object} params.receipt — the verified electronic receipt
 * @param {object} params.baseline — the run's baseline result (pre-apply)
 * @param {string} params.runId — the active run ID
 * @returns {object|null} the electronic apply decision record, or null when
 *   the chosen candidate or receipt is missing
 */
export function buildElectronicApplyDecision({ chosen, receipt, baseline, runId } = {}) {
  if (!chosen || !receipt) return null;
  const candidate = chosen.candidate || null;
  const prepared = chosen.prepared || null;
  const decision = chosen.decision || null;
  if (!candidate || !prepared) return null;

  const beforeSettings = prepared.before || {};
  const afterSettings = {
    instances: prepared.instances || null,
    crossover: prepared.crossover || null,
  };

  // The supporting P19/P20 dB improvement, read from the receipt's verified
  // before/after levels. Never invents a Level upgrade — only carries the
  // actual verified numbers.
  const beforeLevels = receipt.beforeLevels || null;
  const afterLevels = receipt.afterLevels || null;

  return {
    policy: "applyValidatedSimulation",
    candidateId: candidate.candidateId || null,
    candidateOrigin: candidate.candidateOrigin || null,
    candidateKind: candidate.candidateKind || null,
    decision: decision?.decision || "applied",
    reason: decision?.reason || null,
    statement: decision?.statement || null,
    appliedAt: new Date().toISOString(),
    runId: runId || null,
    verified: receipt.status === "verified",
    receipt: {
      runId: receipt.runId || runId || null,
      status: receipt.status || null,
      changes: Array.isArray(receipt.changes) ? receipt.changes : [],
    },
    before: {
      instances: beforeSettings.instances || null,
      crossover: beforeSettings.crossover || null,
    },
    after: {
      instances: afterSettings.instances || null,
      crossover: afterSettings.crossover || null,
    },
    effect: {
      p19VariationDbBefore: num(beforeLevels?.p19VariationDb) ?? null,
      p19VariationDbAfter: num(afterLevels?.p19VariationDb) ?? null,
      p20VariationDbBefore: num(beforeLevels?.p20VariationDb) ?? null,
      p20VariationDbAfter: num(afterLevels?.p20VariationDb) ?? null,
      p19LevelBefore: beforeLevels?.p19Level ?? beforeLevels?.p19 ?? null,
      p19LevelAfter: afterLevels?.p19Level ?? afterLevels?.p19 ?? null,
      p20LevelBefore: beforeLevels?.p20Level ?? beforeLevels?.p20 ?? null,
      p20LevelAfter: afterLevels?.p20Level ?? afterLevels?.p20 ?? null,
      p14DbBefore: num(beforeLevels?.p14Db) ?? null,
      p14DbAfter: num(afterLevels?.p14Db) ?? null,
    },
  };
}

/**
 * Compact summary for diagnostic display. Never invents values.
 */
export function summariseElectronicApplyDecision(decision) {
  if (!decision) return null;
  return {
    policy: decision.policy,
    candidateId: decision.candidateId,
    verified: decision.verified === true,
    runId: decision.runId,
    p19DeltaDb: decision.effect?.p19VariationDbBefore != null && decision.effect?.p19VariationDbAfter != null
      ? round(decision.effect.p19VariationDbAfter - decision.effect.p19VariationDbBefore, 3)
      : null,
    p20DeltaDb: decision.effect?.p20VariationDbBefore != null && decision.effect?.p20VariationDbAfter != null
      ? round(decision.effect.p20VariationDbAfter - decision.effect.p20VariationDbBefore, 3)
      : null,
  };
}