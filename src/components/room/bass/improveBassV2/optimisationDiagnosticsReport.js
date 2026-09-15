// optimisationDiagnosticsReport.js
// Developer/debug ONLY. Pure read-only transform of the V2 engine's existing
// selection + diagnostics data into a structured optimisation report.
//
// This module does NOT alter the optimiser. It only reads data the engine
// already produces (phaseDiagnostics, calibrationDiagnostics, gainDiagnostics,
// funnel, confirmedResults, selection.winner, currentResult) and reshapes it.
//
// Report structure:
//   { runFingerprint, timestamp, stages: [...], winningCandidate: {...} }
//
// Stages (mapped to the engine's real stages):
//   1. Placement   — sub_positions escalation + global candidates
//   2. Polarity    — proxy search polarity component (part of placement proxy)
//   3. Delay       — grouped delay search (calibrationDiagnostics)
//   4. Gain        — grouped gain search (gainDiagnostics)
//   5. Phase       — grouped all-pass phase search (phaseDiagnostics)
//   6. Final EQ    — canonical confirmation (EQ, P14/P18/P19/P20)
//
// Each stage reports:
//   candidatesEvaluated, bestScoreBefore, bestScoreAfter, improvement,
//   significance ("significant" | "negligible" | "none"), winningCandidate

const SIGNIFICANCE = {
  SIGNIFICANT: "significant",
  NEGIGLIBLE: "negligible",
  NONE: "none",
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function levelNum(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : null;
}

/**
 * Extract a canonical score snapshot from a confirmed result.
 * Lower variation dB is better; higher level is better.
 */
function scoreSnapshot(result) {
  if (!result) return null;
  return {
    p19VariationDb: num(result.achievedP19VariationDb),
    p19Level: result.achievedP19Level ?? null,
    p20VariationDb: num(result.achievedP20VariationDb),
    p20Level: result.achievedP20Level ?? null,
    p14Level: result.p14AchievedLevel ?? null,
    p14Db: num(result.p14AchievedDb),
    p18Level: result.p18AchievedLevel ?? null,
    p18Hz: num(result.achievedP18Hz),
  };
}

/**
 * Compute the improvement delta between two score snapshots.
 * Positive dB delta = variation reduced (better). Level delta = levels gained.
 */
function improvementDelta(before, after) {
  if (!before || !after) return null;
  const p19VarDelta = (Number.isFinite(before.p19VariationDb) && Number.isFinite(after.p19VariationDb))
    ? before.p19VariationDb - after.p19VariationDb : null;
  const p20VarDelta = (Number.isFinite(before.p20VariationDb) && Number.isFinite(after.p20VariationDb))
    ? before.p20VariationDb - after.p20VariationDb : null;
  const p19LevelDelta = (levelNum(before.p19Level) != null && levelNum(after.p19Level) != null)
    ? levelNum(after.p19Level) - levelNum(before.p19Level) : null;
  const p20LevelDelta = (levelNum(before.p20Level) != null && levelNum(after.p20Level) != null)
    ? levelNum(after.p20Level) - levelNum(before.p20Level) : null;
  return { p19VarDelta, p20VarDelta, p19LevelDelta, p20LevelDelta };
}

/**
 * Classify significance from the engine's materiality boolean + validity.
 * significant = material improvement (engine materiality gate passed)
 * negligible  = valid result but not material
 * none       = no valid result / skipped / no improvement
 */
function classifySignificance(material, hasValidResult) {
  if (material) return SIGNIFICANCE.SIGNIFICANT;
  if (hasValidResult) return SIGNIFICANCE.NEGIGLIBLE;
  return SIGNIFICANCE.NONE;
}

/**
 * Extract per-sub tuning (gain, delay, polarity, phase) from a confirmed
 * result's appliedTuning array.
 */
function tuningPerSub(result, instanceIds) {
  const tuning = result?.appliedTuning || result?.tuning || [];
  if (!Array.isArray(tuning) || !tuning.length) return [];
  const ids = Array.isArray(instanceIds) ? instanceIds : tuning.map((_, i) => `sub-${i + 1}`);
  return tuning.map((t, i) => ({
    sourceId: t.sourceId || ids[i] || `sub-${i + 1}`,
    gainDb: num(t.gainDb) ?? 0,
    delayMs: num(t.delayMs) ?? 0,
    polarity: num(t.polarity) ?? 0,
    phaseControlDeg: num(t.phaseControlDeg) ?? 0,
  }));
}

/**
 * Extract per-seat P19/P20 rows from a confirmed result.
 */
function perSeatRows(result) {
  if (!result) return { p19: [], p20: [] };
  const extract = (arr) => (Array.isArray(arr) ? arr.map((s) => ({
    seatId: s.seatId,
    isPrimary: !!s.isPrimary,
    level: s.level ?? null,
    variationDbRaw: num(s.variationDbRaw),
    worstFrequencyHz: num(s.worstFrequencyHz),
  })) : []);
  return {
    p19: extract(result.perSeatP19),
    p20: extract(result.perSeatP20),
  };
}

/**
 * Build the full winning-candidate detail (tuning + resulting metrics).
 */
function buildWinningCandidateDetail(result, instanceIds) {
  if (!result) return null;
  const tuning = tuningPerSub(result, instanceIds);
  return {
    candidateId: result.candidateId || null,
    candidateKind: result.candidateKind || null,
    gainPerSub: tuning.map((t) => t.gainDb),
    delayPerSub: tuning.map((t) => t.delayMs),
    polarityPerSub: tuning.map((t) => t.polarity),
    phasePerSub: tuning.map((t) => t.phaseControlDeg),
    resultingP14: {
      level: result.p14AchievedLevel ?? null,
      db: num(result.p14AchievedDb),
    },
    resultingP18: {
      level: result.p18AchievedLevel ?? null,
      hz: num(result.achievedP18Hz),
    },
    resultingPerSeatP19: perSeatRows(result).p19,
    resultingPerSeatP20: perSeatRows(result).p20,
  };
}

/**
 * Sum the placement funnel across all escalation phases.
 * `evaluationCounts` mixes the calibration diagnostics (key "calibration")
 * with the placement funnel keys (symmetric, asymmetricPair, individual).
 * Only the placement-phase keys carry generated/screened/promotedToV2 fields.
 */
const PLACEMENT_FUNNEL_KEYS = ["symmetric", "asymmetricPair", "individual"];
function sumFunnel(evaluationCounts) {
  if (!evaluationCounts || typeof evaluationCounts !== "object") {
    return { generated: 0, screened: 0, promotedToV2: 0, confirmed: 0 };
  }
  let generated = 0, screened = 0, promotedToV2 = 0, confirmed = 0;
  for (const key of PLACEMENT_FUNNEL_KEYS) {
    const f = evaluationCounts[key];
    if (!f) continue;
    generated += Number(f.generated) || 0;
    screened += Number(f.screened) || 0;
    promotedToV2 += Number(f.promotedToV2) || 0;
    confirmed += Number(f.confirmed) || 0;
  }
  return { generated, screened, promotedToV2, confirmed };
}

/**
 * Pick the best position candidate from confirmedResults (position candidates).
 */
function bestPositionCandidate(confirmedResults, currentResult) {
  const positionResults = (Array.isArray(confirmedResults) ? confirmedResults : [])
    .filter((r) => r && r.isPositionCandidate && r.candidateKind !== "current");
  if (!positionResults.length || !currentResult) return null;
  // Best = lowest P19 variation dB (canonical), tie-break lowest P20
  let best = null;
  for (const r of positionResults) {
    const p19 = num(r.achievedP19VariationDb);
    if (p19 == null) continue;
    if (!best) { best = r; continue; }
    const bestP19 = num(best.achievedP19VariationDb);
    const bestP20 = num(best.achievedP20VariationDb);
    const rP20 = num(r.achievedP20VariationDb);
    if (p19 < bestP19 || (p19 === bestP19 && rP20 != null && bestP20 != null && rP20 < bestP20)) {
      best = r;
    }
  }
  return best;
}

/**
 * Build the full optimisation diagnostics report from the engine selection.
 *
 * @param {object} selection - engine selection object
 * @param {object} context - { instanceIds, runFingerprint, runtimeMetrics }
 * @returns {object} structured report
 */
export function buildOptimisationDiagnosticsReport(selection, context = {}) {
  if (!selection) return null;

  const instanceIds = context.instanceIds || [];
  const currentResult = selection.currentResult || null;
  const beforeScore = scoreSnapshot(currentResult);
  const funnel = sumFunnel(selection.evaluationCounts || selection.funnel);
  const confirmedResults = Array.isArray(selection.confirmedResults) ? selection.confirmedResults : [];
  const winner = selection.winner || null;
  const winnerScore = scoreSnapshot(winner);

  // ── Stage 1: Placement ──────────────────────────────────────────────
  const placementBest = bestPositionCandidate(confirmedResults, currentResult);
  const placementScore = scoreSnapshot(placementBest);
  const placementMaterial = !!selection.positionOptimisation?.materialSubImprovementFound
    || !!winner?.isPositionCandidate;
  const placementStage = {
    name: "Placement",
    candidatesEvaluated: {
      generated: funnel.generated,
      screened: funnel.screened,
      promotedToV2: funnel.promotedToV2,
      confirmed: funnel.confirmed,
    },
    bestScoreBefore: beforeScore,
    bestScoreAfter: placementScore || winnerScore,
    improvement: improvementDelta(beforeScore, placementScore || winnerScore),
    significance: classifySignificance(placementMaterial, !!placementBest),
    winningCandidate: placementBest ? buildWinningCandidateDetail(placementBest, instanceIds) : null,
  };

  // ── Stage 2: Polarity (proxy search polarity component) ─────────────
  // Polarity is explored as part of the per-candidate proxy search
  // (searchDelayPolarityTrim), not as a standalone stage. Report the polarity
  // values from the overall winner's tuning and the count of proxy searches.
  const proxySearchCount = context.runtimeMetrics?.proxySearchCount ?? 0;
  const winnerPolarity = winner ? tuningPerSub(winner, instanceIds).map((t) => t.polarity) : [];
  const polarityHasNonZero = winnerPolarity.some((p) => p !== 0);
  const polarityStage = {
    name: "Polarity",
    candidatesEvaluated: {
      proxySearches: proxySearchCount,
      note: "Polarity is explored jointly with delay/trim in the per-candidate proxy search (searchDelayPolarityTrim). No standalone polarity stage exists in V2.",
    },
    bestScoreBefore: beforeScore,
    bestScoreAfter: winnerScore,
    improvement: improvementDelta(beforeScore, winnerScore),
    significance: polarityHasNonZero ? SIGNIFICANCE.SIGNIFICANT : SIGNIFICANCE.NONE,
    winningCandidate: winner ? {
      polarityPerSub: winnerPolarity,
    } : null,
  };

  // ── Stage 3: Delay (grouped delay search) ───────────────────────────
  const delayResult = selection.calibrationResult || null;
  const delayScore = scoreSnapshot(delayResult);
  const delayMaterial = selection.calibrationMaterial?.material === true;
  const delayDiag = selection.calibrationDiagnostics || {};
  const delayStage = {
    name: "Delay",
    candidatesEvaluated: {
      coarse: num(delayDiag.coarseCount) ?? 0,
      fine: num(delayDiag.fineCount) ?? 0,
      retained: num(delayDiag.retained) ?? 0,
      confirmed: num(delayDiag.confirmed) ?? 0,
      valid: num(delayDiag.valid) ?? 0,
    },
    bestScoreBefore: beforeScore,
    bestScoreAfter: delayScore,
    improvement: improvementDelta(beforeScore, delayScore),
    significance: classifySignificance(delayMaterial, !!delayResult),
    winningCandidate: delayResult ? buildWinningCandidateDetail(delayResult, instanceIds) : null,
  };

  // ── Stage 4: Gain (grouped gain search) ─────────────────────────────
  const gainResult = selection.gainResult || null;
  const gainScore = scoreSnapshot(gainResult);
  const gainMaterial = selection.gainMaterial?.material === true;
  const gainDiag = selection.gainDiagnostics || {};
  const gainStage = {
    name: "Gain",
    candidatesEvaluated: {
      coarse: num(gainDiag.coarseCount) ?? 0,
      fine: num(gainDiag.fineCount) ?? 0,
      retained: num(gainDiag.retained) ?? 0,
      confirmed: num(gainDiag.confirmed) ?? 0,
      valid: num(gainDiag.valid) ?? 0,
    },
    bestScoreBefore: beforeScore,
    bestScoreAfter: gainScore,
    improvement: improvementDelta(beforeScore, gainScore),
    significance: classifySignificance(gainMaterial, !!gainResult),
    winningCandidate: gainResult ? buildWinningCandidateDetail(gainResult, instanceIds) : null,
  };

  // ── Stage 5: Phase (grouped all-pass phase search) ──────────────────
  const phaseResult = selection.phaseResult || null;
  const phaseScore = scoreSnapshot(phaseResult);
  const phaseMaterial = selection.phaseMaterial?.material === true;
  const phaseDiag = selection.phaseDiagnostics || {};
  const phaseStage = {
    name: "Phase",
    candidatesEvaluated: {
      tested: num(phaseDiag.tested) ?? num(phaseDiag.optionCount) ?? 0,
      retained: num(phaseDiag.retained) ?? 0,
      confirmed: num(phaseDiag.confirmed) ?? 0,
      valid: num(phaseDiag.valid) ?? 0,
    },
    bestScoreBefore: beforeScore,
    bestScoreAfter: phaseScore,
    improvement: improvementDelta(beforeScore, phaseScore),
    significance: classifySignificance(phaseMaterial, !!phaseResult),
    winningCandidate: phaseResult ? buildWinningCandidateDetail(phaseResult, instanceIds) : null,
  };

  // ── Stage 6: Final EQ (canonical confirmation) ─────────────────────
  // The canonical confirmation applies the EQ pool and produces the final
  // P14/P18/P19/P20 authority for every confirmed candidate.
  const finalEqScore = winnerScore;
  const finalEqMaterial = !!winner;
  const finalEqStage = {
    name: "Final EQ",
    candidatesEvaluated: {
      confirmed: confirmedResults.length,
      currentRecalculations: context.runtimeMetrics?.currentRecalculations ?? 0,
    },
    bestScoreBefore: beforeScore,
    bestScoreAfter: finalEqScore,
    improvement: improvementDelta(beforeScore, finalEqScore),
    significance: classifySignificance(finalEqMaterial, !!winner),
    winningCandidate: winner ? buildWinningCandidateDetail(winner, instanceIds) : null,
  };

  return {
    runFingerprint: context.runFingerprint || null,
    timestamp: new Date().toISOString(),
    totalDurationMs: context.runtimeMetrics?.totalWallClockMs ?? null,
    currentResult: currentResult ? {
      candidateId: currentResult.candidateId || "current",
      score: beforeScore,
      perSeatP19: perSeatRows(currentResult).p19,
      perSeatP20: perSeatRows(currentResult).p20,
    } : null,
    stages: [placementStage, polarityStage, delayStage, gainStage, phaseStage, finalEqStage],
    winningCandidate: winner ? buildWinningCandidateDetail(winner, instanceIds) : null,
    runtimeMetrics: context.runtimeMetrics || null,
  };
}

/**
 * Log the report to the developer console. Safe — never throws.
 */
export function logOptimisationDiagnosticsReport(report) {
  try {
    if (!report) return;
    console.groupCollapsed(
      `%c[V2-OPT-DIAGNOSTICS] ${report.runFingerprint || "(no-fp)"} · ${report.totalDurationMs ?? "?"}ms`,
      "color:#213428;font-weight:600",
    );
    console.table(report.stages.map((s) => ({
      Stage: s.name,
      Candidates: JSON.stringify(s.candidatesEvaluated),
      "Before P19": s.bestScoreBefore?.p19VariationDb ?? "—",
      "After P19": s.bestScoreAfter?.p19VariationDb ?? "—",
      "P19 Δ": s.improvement?.p19VarDelta ?? "—",
      "Before P20": s.bestScoreBefore?.p20VariationDb ?? "—",
      "After P20": s.bestScoreAfter?.p20VariationDb ?? "—",
      "P20 Δ": s.improvement?.p20VarDelta ?? "—",
      Significance: s.significance,
    })));
    if (report.winningCandidate) {
      console.groupCollapsed("%cWinning candidate", "color:#3E4349;font-weight:600");
      console.log("candidateId:", report.winningCandidate.candidateId);
      console.log("candidateKind:", report.winningCandidate.candidateKind);
      console.log("gainPerSub:", report.winningCandidate.gainPerSub);
      console.log("delayPerSub:", report.winningCandidate.delayPerSub);
      console.log("polarityPerSub:", report.winningCandidate.polarityPerSub);
      console.log("phasePerSub:", report.winningCandidate.phasePerSub);
      console.log("resultingP14:", report.winningCandidate.resultingP14);
      console.log("resultingP18:", report.winningCandidate.resultingP18);
      console.log("resultingPerSeatP19:", report.winningCandidate.resultingPerSeatP19);
      console.log("resultingPerSeatP20:", report.winningCandidate.resultingPerSeatP20);
      console.groupEnd();
    }
    console.groupEnd();
  } catch {
    // Diagnostics must never break the engine.
  }
}