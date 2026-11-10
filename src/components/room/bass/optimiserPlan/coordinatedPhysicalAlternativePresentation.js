// coordinatedPhysicalAlternativePresentation.js
// Pure presentation authority for coordinated physical alternatives.
//
// A coordinated physical alternative is a Phase 9B candidate that moves BOTH
// seating and subwoofer positions. It is presented SEPARATELY from the
// calibration winner — it never replaces the calibration recommendation and
// never auto-applies.
//
// ELIGIBILITY: a confirmed coordinated candidate is eligible for presentation
// as a physical alternative when the existing candidate validation, physical
// safety, protected-primary-seat protection and materiality checks ALL pass.
// Those checks run in selectConfirmedRecommendations; this module reads their
// outcome from the selection.evaluations array and the coordinated summary.
//
// This module is a pure reader: it reformats persisted evidence, it evaluates
// nothing, and it changes no bass maths, ranking or grading.

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Find the selection evaluation for a candidate ID.
 * @param {Array} evaluations — from selectConfirmedRecommendations
 * @param {string} candidateId
 * @returns {object|null}
 */
function findEvaluation(evaluations, candidateId) {
  if (!Array.isArray(evaluations) || !candidateId) return null;
  return evaluations.find((e) => String(e?.candidateId) === String(candidateId)) || null;
}

/**
 * Determine whether a confirmed coordinated candidate is eligible for
 * physical-alternative presentation based on its selection evaluation.
 *
 * Eligible: status === "material" (validation + safety + protected-primary
 * + materiality all passed).
 *
 * @param {object} evaluation — the candidate's entry in selection.evaluations
 * @returns {boolean}
 */
export function isPhysicalAlternativeEligible(evaluation) {
  if (!evaluation) return false;
  return evaluation.status === "material";
}

/**
 * Build the presentation data for one coordinated physical alternative.
 * Returns null when the candidate is not eligible.
 *
 * @param {object} confirmedEntry — from coordinatedDiagnostics.confirmed
 * @param {object} evaluation — from selection.evaluations
 * @param {object|null} [currentResult] — the current/baseline published result
 * @returns {object|null} presentation data or null
 */
export function buildPhysicalAlternativePresentation(confirmedEntry, evaluation, currentResult = null) {
  if (!confirmedEntry) return null;
  if (!isPhysicalAlternativeEligible(evaluation)) return null;

  const candidateId = confirmedEntry.candidateId || null;
  const placementId = confirmedEntry.placementId || null;
  const quantity = num(confirmedEntry.quantity);
  const offsetMm = num(confirmedEntry.offsetMm);
  const rspAuthority = confirmedEntry.rspAuthority || null;

  // P14 and P19 from the confirmed evidence.
  const p14Db = num(confirmedEntry.p14Db);
  const p19Level = confirmedEntry.p19Level || null;
  const p19VariationDb = num(confirmedEntry.p19VariationDb);

  // Per-seat P20 from the confirmed evidence.
  const perSeatP20 = Array.isArray(confirmedEntry.perSeatP20) ? confirmedEntry.perSeatP20 : [];
  const primarySeats = perSeatP20.filter((s) => s.isPrimary);
  const secondarySeats = perSeatP20.filter((s) => !s.isPrimary);

  // Current baseline per-seat P20 for comparison.
  const currentPerSeatP20 = Array.isArray(currentResult?.perSeatP20) ? currentResult.perSeatP20 : [];
  const currentBySeat = new Map(currentPerSeatP20.map((s) => [String(s.seatId), s]));

  // Build per-seat P20 comparison rows.
  const seatComparisons = perSeatP20.map((seat) => {
    const before = currentBySeat.get(String(seat.seatId));
    return {
      seatId: seat.seatId,
      isPrimary: Boolean(seat.isPrimary),
      beforeLevel: before?.level ?? null,
      beforeVariationDb: num(before?.variationDbRaw ?? before?.wholeDbDeviation),
      afterLevel: seat.level ?? null,
      afterVariationDb: num(seat.variationDbRaw),
      worstFrequencyHz: num(seat.worstFrequencyHz),
    };
  });

  // Material improvement summary.
  const materiality = evaluation?.materiality || null;
  const materialImprovement = materiality?.material === true ? (materiality?.reason || "Material improvement") : null;

  // Remaining compromises: seats that are still poor (L1/L2) after the change.
  const remainingCompromises = perSeatP20
    .filter((s) => num(s.level) != null && num(s.level) <= 2)
    .map((s) => ({
      seatId: s.seatId,
      isPrimary: Boolean(s.isPrimary),
      level: s.level,
      variationDb: num(s.variationDbRaw),
    }));

  // Installation complexity: subwoofer quantity change and seating move.
  const installedQuantity = num(confirmedEntry.installedQuantity);
  const quantityChange = (installedQuantity != null && quantity != null)
    ? quantity - installedQuantity
    : null;

  return {
    candidateId,
    placementId,
    quantity,
    offsetMm,
    rspAuthority,
    p14: { achievedDb: p14Db },
    p19: { level: p19Level, variationDb: p19VariationDb },
    perSeatP20Comparisons: seatComparisons,
    primaryP20Summary: summarizeWorst(primarySeats),
    secondaryP20Summary: summarizeWorst(secondarySeats),
    materialImprovement,
    materialityRule: materiality?.rule || null,
    remainingCompromises,
    installationComplexity: {
      quantityChange,
      seatingOffsetMm: offsetMm,
      isCrossQuantity: confirmedEntry.isCrossQuantity === true,
    },
    // Whether the alternative was actually displayed — set by the UI layer.
    displayed: false,
  };
}

function summarizeWorst(seats) {
  if (!seats || seats.length === 0) return null;
  let worst = null;
  for (const seat of seats) {
    const variation = num(seat.variationDbRaw);
    if (variation == null) continue;
    if (!worst || variation > worst.variationDb) {
      worst = {
        seatId: seat.seatId ?? null,
        variationDb: variation,
        level: seat.level ?? null,
        worstFrequencyHz: num(seat.worstFrequencyHz),
      };
    }
  }
  return worst;
}

/**
 * Build presentation data for ALL eligible coordinated physical alternatives
 * from a completed run's coordinated summary and selection evaluations.
 *
 * @param {object|null} coordinatedSummary — from buildCoordinatedSummary
 * @param {Array} evaluations — from selectConfirmedRecommendations
 * @param {object|null} [currentResult] — the current/baseline published result
 * @returns {Array} presentation data for eligible alternatives
 */
export function selectEligiblePhysicalAlternatives(coordinatedSummary, evaluations, currentResult = null) {
  if (!coordinatedSummary || !Array.isArray(coordinatedSummary.confirmedCandidates)) return [];
  const evals = Array.isArray(evaluations) ? evaluations : [];
  const presentations = [];
  for (const confirmed of coordinatedSummary.confirmedCandidates) {
    const evaluation = findEvaluation(evals, confirmed.candidateId);
    const presentation = buildPhysicalAlternativePresentation(confirmed, evaluation, currentResult);
    if (presentation) presentations.push(presentation);
  }
  return presentations;
}