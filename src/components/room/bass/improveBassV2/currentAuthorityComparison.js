// currentAuthorityComparison.js
// ---------------------------------------------------------------------------
// The Current control for V2 winner selection (BLOCKER 1), read from the REAL
// production completed-bass authority contract.
//
// BLOCKER 1: Reads the production contract structure:
//   - Per-seat P20: contract.selectedCandidate.perSeatP20Results
//   - Per-seat P19: contract.selectedCandidate.perSeatP19Results (optional)
//   - Headlines: contract.productAnalysis.parameters.p19/p20/p18/p14
//
// P19 SEMANTICS: P19 is an AGGREGATE RSP result. The aggregate headline is the
// canonical P19 and is REQUIRED — a missing or ungradeable aggregate P19 is a
// genuine failure and is never substituted with 0 dB. Per-seat P19 rows are
// OPTIONAL: an empty collection is valid, is never a reason to reject the
// authority, and never produces a synthetic or Level 0 seat.
//
// P20 remains the per-seat metric: its per-seat rows are required, and its
// headline is read when the contract carries one.
//
// READ-ONLY: no calculation, no grading, no bass maths.
// ---------------------------------------------------------------------------

import { canonicalLevel } from "./confirmedCandidateValidity.js";
import { hasAggregateP19Headline } from "./improveBassV2Fingerprint.js";

/** A finite number, or null. Never coerces null/undefined/"" to 0. */
function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function seatRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((seat) => ({
    seatId: seat.seatId,
    isPrimary: seat.isPrimary || false,
    level: seat.level,
    variationDbRaw: seat.variationDbRaw,
    worstFrequencyHz: seat.worstFrequencyHz,
  }));
}

/**
 * Map the production contract into the Current comparison object used by winner
 * selection, so hasPrimarySeatRegression can consume it with existing names.
 *
 * @param {object|null} currentAuthority - completedBassAuthority
 * @returns {object|null} null when the contract lacks the required authority
 */
export function extractAuthorityForComparison(currentAuthority) {
  if (!currentAuthority?.contract) return null;
  const contract = currentAuthority.contract;
  const selectedCandidate = contract.selectedCandidate || {};

  // Per-seat P20 is the per-seat metric and must exist.
  const perSeatP20Results = Array.isArray(selectedCandidate.perSeatP20Results)
    ? selectedCandidate.perSeatP20Results
    : [];
  if (perSeatP20Results.length === 0) return null;

  // Per-seat P19 is optional — RSP-only P19 designs legitimately carry none.
  const perSeatP19Results = Array.isArray(selectedCandidate.perSeatP19Results)
    ? selectedCandidate.perSeatP19Results
    : [];

  const params = contract.productAnalysis?.parameters || {};
  const p19Param = params.p19 || {};
  const p20Param = params.p20 || {};
  const p18Param = params.p18 || {};

  // The aggregate RSP P19 headline is REQUIRED.
  const achievedP19VariationDb = finiteOrNull(p19Param.variationDbRaw ?? p19Param.value);
  const achievedP19Level = p19Param.level ?? null;
  if (!hasAggregateP19Headline(p19Param) || achievedP19VariationDb == null
    || canonicalLevel(achievedP19Level) == null) return null;

  // P14 achieved capability: read from selectedCandidate (full contract) or
  // from productAnalysis.parameters.p14 (compact contract). In the compact
  // contract, selectedCandidate.achievedP14Db/Level are stripped during
  // compaction, but productAnalysis.parameters.p14 preserves the achieved
  // data in achievedCapabilityDb and achievedLevel (NOT in .value/.level
  // which carry the designer-selected TARGET semantics after buildBassTargetViews).
  const p14Param = params.p14 || {};
  const p14AchievedLevel = selectedCandidate.achievedP14Level
    ?? contract.achievedP14Level
    ?? p14Param.achievedLevel
    ?? null;
  const p14AchievedDb = finiteOrNull(
    selectedCandidate.achievedP14Db
    ?? contract.achievedP14Db
    ?? p14Param.achievedCapabilityDb
    ?? p14Param.availableCapabilityDb
    ?? null,
  );

  return {
    perSeatP19: seatRows(perSeatP19Results),
    perSeatP20: seatRows(perSeatP20Results),
    // P19: the aggregate RSP headline, preserved exactly as published.
    achievedP19VariationDb,
    achievedP19Level,
    p19VariationSource: "aggregate-rsp",
    p19PerSeatAvailable: perSeatP19Results.length > 0,
    achievedP20VariationDb: finiteOrNull(p20Param.variationDbRaw ?? p20Param.value),
    achievedP20Level: p20Param.level ?? null,
    p18AchievedLevel: p18Param.level ?? null,
    achievedP18Hz: finiteOrNull(selectedCandidate.achievedP18FrequencyHz)
      ?? finiteOrNull(p18Param.value),
    p14AchievedLevel,
    p14AchievedDb,
  };
}