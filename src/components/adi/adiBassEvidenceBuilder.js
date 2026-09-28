// adiBassEvidenceBuilder.js
// ---------------------------------------------------------------------------
// ADI — Canonical Bass Evidence Builder
//
// ONE shared helper that converts a completed bass contract into the evidence
// shape ADI's problem detector (identifyProblem) expects. Both the publication
// path (OptimiseAndCalculate) and the display path (AdiRecommendation) use this
// same helper so they never diverge.
//
// The evidence shape:
//   {
//     p14AchievedDb,     achievedP18Hz,
//     perSeatP19,        perSeatP20,
//     p19Aggregate,      p20Aggregate,
//     p20Deviations,     p20WorstSeat,   p20Spread,    p20MaxDeviation,
//     rp22Levels: { p14, p18, p19, p20 },
//     seatIds,
//   }
//
// Source for seat consistency: contract.bassResult.seatResults.P20
// (NEVER per-seat P19 — P19 is RSP-only and seatResults.P19 is always empty).
//
// This module is PURE: no React, no side effects.
// ---------------------------------------------------------------------------

/**
 * Build canonical ADI bass evidence from a completed bass contract.
 *
 * @param {object} completedBassAuthority - the authority wrapper, or null
 * @returns {object|null} canonical evidence, or null if no contract exists
 */
export function buildAdiBassEvidence(completedBassAuthority) {
  const contract = completedBassAuthority?.contract || completedBassAuthority || null;
  if (!contract) return null;

  const bassResult = contract.bassResult || contract.finalOptimisedBassResponse || null;
  const parameters = contract.productAnalysis?.parameters || {};
  const selectedCandidate = contract.selectedCandidate || {};

  // ── Per-seat P20 (the canonical seat-consistency source) ──
  const perSeatP20 = extractPerSeatP20(bassResult, selectedCandidate);
  // ── Per-seat P19 (RSP-only — synthesised from the aggregate) ──
  const perSeatP19 = extractPerSeatP19(bassResult, parameters);

  // ── P14 achieved dB ──
  const p14AchievedDb = extractP14AchievedDb(contract, selectedCandidate, parameters);
  // ── P18 achieved Hz ──
  const achievedP18Hz = extractAchievedP18Hz(contract, selectedCandidate, parameters);

  // ── P19 / P20 aggregates (RSP) ──
  const p19Aggregate = extractP19Aggregate(bassResult, parameters);
  const p20Aggregate = extractP20Aggregate(bassResult, parameters);

  // ── P20 deviations, worst seat, spread ──
  const p20Deviations = perSeatP20
    .map((s) => Math.abs(Number(s?.variationDbRaw) || 0))
    .filter((v) => Number.isFinite(v));
  const p20WorstSeat = perSeatP20.length
    ? perSeatP20.reduce((worst, s) =>
        Math.abs(Number(s?.variationDbRaw) || 0) > Math.abs(Number(worst?.variationDbRaw) || 0)
          ? s : worst, perSeatP20[0])
    : null;
  const p20MaxDeviation = p20Deviations.length ? Math.max(...p20Deviations) : 0;
  const p20Spread = p20Deviations.length >= 2
    ? Math.max(...p20Deviations) - Math.min(...p20Deviations)
    : 0;

  // ── RP22 levels ──
  const rp22Levels = {
    p14: extractLevel(parameters.p14?.achievedLevel ?? parameters.p14?.level),
    p18: extractLevel(parameters.p18?.level),
    p19: extractLevel(p19Aggregate?.level ?? parameters.p19?.level),
    p20: extractLevel(p20Aggregate?.level ?? parameters.p20?.level),
  };

  const seatIds = perSeatP20.map((s) => String(s?.seatId || '')).filter(Boolean);

  return {
    p14AchievedDb,
    achievedP18Hz,
    perSeatP19,
    perSeatP20,
    p19Aggregate,
    p20Aggregate,
    p20Deviations,
    p20WorstSeat,
    p20Spread,
    p20MaxDeviation,
    rp22Levels,
    seatIds,
  };
}

// ── Extractors ──

function extractPerSeatP20(bassResult, selectedCandidate) {
  const fromSeatResults = bassResult?.seatResults?.P20;
  if (Array.isArray(fromSeatResults) && fromSeatResults.length) return fromSeatResults;
  const fromCandidate = selectedCandidate?.perSeatP20Results;
  if (Array.isArray(fromCandidate) && fromCandidate.length) return fromCandidate;
  if (Array.isArray(bassResult?.perSeatP20) && bassResult.perSeatP20.length) return bassResult.perSeatP20;
  return [];
}

function extractPerSeatP19(bassResult, parameters) {
  // P19 is RSP-only — seatResults.P19 is always empty. Synthesise a
  // single-element array from the P19 aggregate so identifyProblem's
  // worstSeatP19 can still find the RSP P19 result.
  const fromSeatResults = bassResult?.seatResults?.P19;
  if (Array.isArray(fromSeatResults) && fromSeatResults.length) return fromSeatResults;
  const p19Param = parameters.p19 || null;
  if (!p19Param) return [];
  const variationDbRaw = Number.isFinite(Number(p19Param.value))
    ? Number(p19Param.value)
    : (Number.isFinite(Number(p19Param.variationDbRaw)) ? Number(p19Param.variationDbRaw) : 0);
  return [{
    seatId: p19Param.seatId || 'RSP',
    variationDbRaw,
    level: p19Param.level ?? 0,
    worstFrequencyHz: Number(p19Param.worstFrequencyHz) || 0,
    isPrimary: true,
  }];
}

function extractP14AchievedDb(contract, selectedCandidate, parameters) {
  const raw = selectedCandidate.achievedP14Db
    ?? contract.achievedP14Db
    ?? parameters.p14?.achievedCapabilityDb
    ?? parameters.p14?.availableCapabilityDb
    ?? parameters.p14?.achievedDb
    ?? null;
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
}

function extractAchievedP18Hz(contract, selectedCandidate, parameters) {
  const raw = selectedCandidate.achievedP18FrequencyHz
    ?? contract.achievedP18Hz
    ?? parameters.p18?.value
    ?? parameters.p18?.achievedHz
    ?? null;
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
}

function extractP19Aggregate(bassResult, parameters) {
  if (bassResult?.P19) return bassResult.P19;
  if (parameters.p19) return parameters.p19;
  return null;
}

function extractP20Aggregate(bassResult, parameters) {
  if (bassResult?.P20) return bassResult.P20;
  if (parameters.p20) return parameters.p20;
  return null;
}

function extractLevel(value) {
  if (value == null) return null;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.min(4, n));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : null;
}