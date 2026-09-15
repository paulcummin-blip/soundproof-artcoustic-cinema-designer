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
 * Compute worst/average/best seat variation from a confirmed result's per-seat
 * P19/P20 rows. Lower variation dB is better.
 */
function seatStats(result) {
  if (!result) return null;
  const { p19, p20 } = perSeatRows(result);
  const compute = (seats) => {
    if (!seats.length) return null;
    const variations = seats.map((s) => num(s.variationDbRaw)).filter((v) => v != null);
    if (!variations.length) return null;
    return {
      worst: Math.max(...variations),
      average: variations.reduce((a, b) => a + b, 0) / variations.length,
      best: Math.min(...variations),
      seatCount: variations.length,
    };
  };
  return { p19: compute(p19), p20: compute(p20) };
}

/**
 * Extract winning sub settings (delay, gain, polarity, phase) from a result.
 */
function winningSubSettings(result, instanceIds) {
  const tuning = tuningPerSub(result, instanceIds);
  if (!tuning.length) return null;
  return {
    delay: tuning.map((t) => t.delayMs),
    gain: tuning.map((t) => t.gainDb),
    polarity: tuning.map((t) => t.polarity),
    phase: tuning.map((t) => t.phaseControlDeg),
  };
}

/**
 * Build acoustic performance block (P19/P20 before/after/improvement + seat stats).
 */
function buildAcousticPerformance(beforeScore, afterScore, result) {
  return {
    p19: {
      before: beforeScore?.p19VariationDb ?? null,
      after: afterScore?.p19VariationDb ?? null,
      improvement: (beforeScore?.p19VariationDb != null && afterScore?.p19VariationDb != null)
        ? beforeScore.p19VariationDb - afterScore.p19VariationDb : null,
    },
    p20: {
      before: beforeScore?.p20VariationDb ?? null,
      after: afterScore?.p20VariationDb ?? null,
      improvement: (beforeScore?.p20VariationDb != null && afterScore?.p20VariationDb != null)
        ? beforeScore.p20VariationDb - afterScore.p20VariationDb : null,
    },
    seatStats: seatStats(result),
  };
}

/**
 * Rank confirmed results and return the top N candidate solutions with their
 * tuning settings and scores. Lower P19 variation is better; P20 is tie-break.
 */
function topCandidates(confirmedResults, instanceIds, limit = 10) {
  if (!Array.isArray(confirmedResults) || !confirmedResults.length) return [];
  const scored = confirmedResults
    .filter((r) => r && num(r.achievedP19VariationDb) != null)
    .map((r) => {
      const tuning = tuningPerSub(r, instanceIds);
      return {
        candidateId: r.candidateId || null,
        candidateKind: r.candidateKind || null,
        score: {
          p19VariationDb: num(r.achievedP19VariationDb),
          p20VariationDb: num(r.achievedP20VariationDb),
          p19Level: r.achievedP19Level ?? null,
          p20Level: r.achievedP20Level ?? null,
        },
        delay: tuning.map((t) => t.delayMs),
        gain: tuning.map((t) => t.gainDb),
        polarity: tuning.map((t) => t.polarity),
        phase: tuning.map((t) => t.phaseControlDeg),
      };
    })
    .sort((a, b) => {
      const aP19 = a.score.p19VariationDb;
      const bP19 = b.score.p19VariationDb;
      if (aP19 !== bP19) return aP19 - bP19;
      const aP20 = a.score.p20VariationDb ?? Infinity;
      const bP20 = b.score.p20VariationDb ?? Infinity;
      return aP20 - bP20;
    });
  return scored.slice(0, limit);
}

/**
 * Compute each stage's percentage contribution to the total P19 improvement.
 * Uses the P19 variation delta each stage achieved over the baseline, normalised
 * so all positive contributions sum to 100%.
 */
function stageContributions(stages, beforeScore, winnerScore) {
  const totalP19Improvement = (beforeScore?.p19VariationDb != null && winnerScore?.p19VariationDb != null)
    ? Math.max(0, beforeScore.p19VariationDb - winnerScore.p19VariationDb)
    : 0;
  if (totalP19Improvement <= 0) {
    return stages.map((s) => ({ name: s.name, contributionPercent: 0 }));
  }
  const stageImprovements = stages.map((s) => {
    const delta = s.improvement?.p19VarDelta;
    return { name: s.name, improvement: delta != null ? Math.max(0, delta) : 0 };
  });
  const totalStageImprovement = stageImprovements.reduce((sum, s) => sum + s.improvement, 0);
  if (totalStageImprovement <= 0) {
    return stages.map((s) => ({ name: s.name, contributionPercent: 0 }));
  }
  return stageImprovements.map((s) => ({
    name: s.name,
    contributionPercent: Math.round((s.improvement / totalStageImprovement) * 100),
  }));
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
    acousticPerformance: buildAcousticPerformance(beforeScore, placementScore || winnerScore, placementBest || winner),
    winningSubSettings: winningSubSettings(placementBest || winner, instanceIds),
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
    acousticPerformance: buildAcousticPerformance(beforeScore, winnerScore, winner),
    winningSubSettings: winningSubSettings(winner, instanceIds),
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
    acousticPerformance: buildAcousticPerformance(beforeScore, delayScore, delayResult),
    winningSubSettings: winningSubSettings(delayResult, instanceIds),
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
    acousticPerformance: buildAcousticPerformance(beforeScore, gainScore, gainResult),
    winningSubSettings: winningSubSettings(gainResult, instanceIds),
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
    acousticPerformance: buildAcousticPerformance(beforeScore, phaseScore, phaseResult),
    winningSubSettings: winningSubSettings(phaseResult, instanceIds),
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
    acousticPerformance: buildAcousticPerformance(beforeScore, finalEqScore, winner),
    winningSubSettings: winningSubSettings(winner, instanceIds),
  };

  const allStages = [placementStage, polarityStage, delayStage, gainStage, phaseStage, finalEqStage];

  // Identify the winning stage = the stage that produced the final winner.
  const winningStageName = winner?.candidateKind === "position"
    ? "Placement"
    : winner ? "Final EQ" : null;

  // Top 10 candidate solutions from the winning stage's candidate pool.
  // For Placement, use position candidates; for calibration stages, use
  // confirmedResults (all fully-evaluated candidates).
  const topCandidatesPool = winningStageName === "Placement"
    ? confirmedResults.filter((r) => r?.isPositionCandidate)
    : confirmedResults;
  const topCandidatesForWinningStage = topCandidates(topCandidatesPool, instanceIds, 10);

  // Stage contribution to the total P19 improvement.
  const stageContributionBreakdown = stageContributions(allStages, beforeScore, winnerScore);

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
    stages: allStages,
    winningStage: winningStageName,
    topCandidatesForWinningStage,
    stageContributions: stageContributionBreakdown,
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
    // Stage summary table — P19/P20 before/after/Δ + seat stats
    console.table(report.stages.map((s) => {
      const ap = s.acousticPerformance || {};
      const p19Seats = ap.seatStats?.p19;
      const p20Seats = ap.seatStats?.p20;
      return {
        Stage: s.name,
        "P19 Before": ap.p19?.before ?? "—",
        "P19 After": ap.p19?.after ?? "—",
        "P19 Δ": ap.p19?.improvement ?? "—",
        "P20 Before": ap.p20?.before ?? "—",
        "P20 After": ap.p20?.after ?? "—",
        "P20 Δ": ap.p20?.improvement ?? "—",
        "P19 Worst": p19Seats?.worst ?? "—",
        "P19 Avg": p19Seats?.average?.toFixed(2) ?? "—",
        "P19 Best": p19Seats?.best ?? "—",
        "P20 Worst": p20Seats?.worst ?? "—",
        "P20 Avg": p20Seats?.average?.toFixed(2) ?? "—",
        "P20 Best": p20Seats?.best ?? "—",
        Significance: s.significance,
      };
    }));

    // Winning sub settings per stage
    console.groupCollapsed("%cWinning sub settings per stage", "color:#3E4349;font-weight:600");
    for (const s of report.stages) {
      const ws = s.winningSubSettings;
      if (!ws) continue;
      console.log(`${s.name}:`, {
        delay: ws.delay,
        gain: ws.gain,
        polarity: ws.polarity,
        phase: ws.phase,
      });
    }
    console.groupEnd();

    // Top 10 candidate solutions for the winning stage
    if (report.topCandidatesForWinningStage?.length) {
      console.groupCollapsed(
        `%cTop 10 candidates (winning stage: ${report.winningStage || "?"})`,
        "color:#3E4349;font-weight:600",
      );
      console.table(report.topCandidatesForWinningStage.map((c, i) => ({
        Rank: i + 1,
        Id: c.candidateId ?? "—",
        Kind: c.candidateKind ?? "—",
        "P19 Var": c.score.p19VariationDb?.toFixed(3) ?? "—",
        "P20 Var": c.score.p20VariationDb?.toFixed(3) ?? "—",
        "P19 Lvl": c.score.p19Level ?? "—",
        "P20 Lvl": c.score.p20Level ?? "—",
        Delay: JSON.stringify(c.delay),
        Gain: JSON.stringify(c.gain),
        Polarity: JSON.stringify(c.polarity),
        Phase: JSON.stringify(c.phase),
      })));
      console.groupEnd();
    }

    // Stage contribution breakdown
    if (report.stageContributions?.length) {
      console.groupCollapsed("%cStage contributions to final result", "color:#213428;font-weight:600");
      console.table(report.stageContributions.map((c) => ({
        Stage: c.name,
        "Contribution %": c.contributionPercent,
      })));
      console.groupEnd();
    }

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