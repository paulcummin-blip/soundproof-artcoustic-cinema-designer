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
// FRESHNESS: coordinated alternatives are only presented when the saved
// optimiser plan is confirmed current for the active design. The plan-freshness
// authority is resolveOptimiserPlanStatus — this module reads its `status`
// field and never computes a second fingerprint. A stale, absent, unsupported,
// failed or incomplete plan never surfaces physical recommendations, even when
// historical coordinatedSummary evidence is present.
//
// This module is a pure reader: it reformats persisted evidence, it evaluates
// nothing, and it changes no bass maths, ranking or grading.

import { OPTIMISER_PLAN_STATUS } from "./optimiserPlanConstants.js";

/**
 * The plan statuses that confirm the saved evaluation belongs to the active
 * design and completed successfully. Only these may surface coordinated
 * physical alternatives. Terminal failure/incomplete states and stale/absent/
 * unsupported states are excluded — a failed or stale run's historical evidence
 * is never presented as current advice.
 */
const CURRENT_PLAN_STATUSES = new Set([
  OPTIMISER_PLAN_STATUS.CURRENT,
  OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT,
  OPTIMISER_PLAN_STATUS.NON_ACTIONABLE_WINNER,
]);

/**
 * Decide whether coordinated physical alternatives should be presented for the
 * given resolved plan view. Reuses the existing plan-freshness authority
 * (resolveOptimiserPlanStatus) — never computes a second fingerprint.
 *
 * @param {object|null} planView - resolved plan view from useOptimiserPlanView
 * @returns {boolean}
 */
export function shouldShowCoordinatedAlternatives(planView) {
  if (!planView?.coordinatedSummary) return false;
  return CURRENT_PLAN_STATUSES.has(planView?.status);
}

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

/**
 * Assess whether the persisted confirmed evidence carries enough information
 * for a designer to recreate the evaluated alternative. Returns the missing
 * field names so a card can state what it lacks instead of presenting itself
 * as ready to reproduce.
 *
 * @param {object} confirmed — one entry from coordinatedSummary.confirmedCandidates
 * @returns {{ reproducible: boolean, missing: string[] }}
 */
function assessReproducibility(confirmed) {
  const missing = [];
  if (!confirmed?.selectedSubModel) missing.push("subwooferModel");
  if (!Array.isArray(confirmed?.subwooferInstances) || confirmed.subwooferInstances.length === 0) {
    missing.push("subwooferPositions");
  } else {
    for (const inst of confirmed.subwooferInstances) {
      if (!inst?.position || !Number.isFinite(Number(inst.position.x)) || !Number.isFinite(Number(inst.position.y))) {
        missing.push("subwooferPositions");
        break;
      }
    }
  }
  if (!Array.isArray(confirmed?.seatingPositions) || confirmed.seatingPositions.length === 0) {
    missing.push("seatingPositions");
  }
  if (!Array.isArray(confirmed?.tuning) || confirmed.tuning.length === 0) {
    missing.push("tuning");
  }
  if (!confirmed?.rspAuthority?.rspPosition) {
    missing.push("rspPosition");
  }
  return { reproducible: missing.length === 0, missing };
}

/**
 * Build presentation data for eligible coordinated physical alternatives
 * directly from the PERSISTED coordinated summary — no live selection
 * evaluations required. Eligibility is read from the per-candidate
 * `physicalAlternativeEligible` flag the enrichment step wrote when the run
 * completed, so this works after a cold reopen where the in-memory
 * selection.evaluations are gone.
 *
 * P0-2: a candidate whose persisted evidence is missing essential
 * reproducibility information (subwoofer model, positions, seating, tuning or
 * RSP) is NOT presented as ready to reproduce. The card is suppressed so the
 * designer is never shown an alternative they cannot recreate from the saved
 * advice.
 *
 * @param {object|null} coordinatedSummary — from planView.coordinatedSummary
 * @param {Array} [currentPerSeatP20] — current published per-seat P20 rows
 * @returns {Array} presentation data for eligible, reproducible alternatives
 */
export function selectEligiblePhysicalAlternativesFromSummary(coordinatedSummary, currentPerSeatP20) {
  // currentPerSeatP20 (live values) is no longer used: the per-seat P20
  // comparison uses only the candidate's own saved evidence. Live values
  // from the current bass authority can diverge from the evaluation
  // baseline after the design changes, so mixing them with historical
  // candidate results is unsafe. The "before" column is left null — the
  // card states only what the candidate-owned evidence carries.
  void currentPerSeatP20;
  if (!coordinatedSummary || !Array.isArray(coordinatedSummary.confirmedCandidates)) return [];
  const presentations = [];
  for (const confirmed of coordinatedSummary.confirmedCandidates) {
    if (confirmed?.physicalAlternativeEligible !== true) continue;
    const reproducibility = assessReproducibility(confirmed);
    if (!reproducibility.reproducible) continue;
    const presentation = buildPhysicalAlternativePresentationFromSummary(confirmed);
    if (presentation) presentations.push(presentation);
  }
  return presentations;
}

function buildPhysicalAlternativePresentationFromSummary(confirmed) {
  if (!confirmed) return null;
  const candidateId = confirmed.candidateId || null;
  const placementId = confirmed.placementId || null;
  const quantity = num(confirmed.quantity);
  const offsetMm = num(confirmed.offsetMm);
  const rspAuthority = confirmed.rspAuthority || null;

  const p14Db = num(confirmed.p14Db);
  const p19Level = confirmed.p19Level || null;
  const p19VariationDb = num(confirmed.p19VariationDb);
  const perSeatP20 = Array.isArray(confirmed.perSeatP20) ? confirmed.perSeatP20 : [];

  // Per-seat P20 comparison using ONLY the candidate's own saved evidence.
  // The "before" (baseline) column is null — we do not mix in current live
  // seating values, which may not match the evaluation baseline after the
  // design changes. The card states only what the candidate-owned evidence
  // carries.
  const seatComparisons = perSeatP20.map((seat) => {
    return {
      seatId: seat.seatId,
      isPrimary: Boolean(seat.isPrimary),
      beforeLevel: null,
      beforeVariationDb: null,
      afterLevel: seat.level ?? null,
      afterVariationDb: num(seat.variationDbRaw),
      worstFrequencyHz: num(seat.worstFrequencyHz),
    };
  });

  const primarySeats = perSeatP20.filter((s) => s.isPrimary);
  const secondarySeats = perSeatP20.filter((s) => !s.isPrimary);
  const materialityOutcome = confirmed.materialityOutcome || null;
  const materialImprovement = materialityOutcome?.material === true
    ? (materialityOutcome?.reason || "Material improvement")
    : null;

  const remainingCompromises = perSeatP20
    .filter((s) => num(s.level) != null && num(s.level) <= 2)
    .map((s) => ({
      seatId: s.seatId,
      isPrimary: Boolean(s.isPrimary),
      level: s.level,
      variationDb: num(s.variationDbRaw),
    }));

  const installedQuantity = num(confirmed.installedQuantity);
  const quantityChange = (installedQuantity != null && quantity != null)
    ? quantity - installedQuantity
    : null;

  // P0-2: the exact evaluated configuration, read from the same confirmed
  // candidate. Nothing invented — if a field is absent it stays absent and
  // the reproducibility assessment in selectEligiblePhysicalAlternativesFromSummary
  // suppresses the card.
  const subwooferInstances = Array.isArray(confirmed.subwooferInstances)
    ? confirmed.subwooferInstances.map((inst) => ({
        id: inst?.id || null,
        model: inst?.model || null,
        position: {
          x: num(inst?.position?.x),
          y: num(inst?.position?.y),
          z: num(inst?.position?.z),
        },
        bottomHeightM: num(inst?.bottomHeightM),
        rotationDeg: num(inst?.rotationDeg),
        orientation: inst?.orientation ?? null,
      }))
    : [];
  const seatingPositions = Array.isArray(confirmed.seatingPositions)
    ? confirmed.seatingPositions.map((seat) => ({
        id: seat?.id || null,
        x: num(seat?.x),
        y: num(seat?.y),
        z: num(seat?.z),
        priority: seat?.priority ?? null,
        rowNumber: seat?.rowNumber ?? null,
      }))
    : [];
  const tuning = Array.isArray(confirmed.tuning)
    ? confirmed.tuning.map((t) => ({
        sourceId: t?.sourceId || null,
        delayMs: num(t?.delayMs),
        gainDb: num(t?.gainDb),
        polarity: t?.polarity ?? null,
        phaseControlDeg: num(t?.phaseControlDeg ?? t?.phaseAdjust),
      }))
    : [];
  const crossover = confirmed.crossover || null;

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
    materialityRule: materialityOutcome?.rule || null,
    remainingCompromises,
    installationComplexity: {
      quantityChange,
      seatingOffsetMm: offsetMm,
      isCrossQuantity: confirmed.isCrossQuantity === true,
    },
    // Reproducibility: the exact evaluated configuration.
    selectedSubModel: confirmed.selectedSubModel || null,
    subwooferInstances,
    seatingPositions,
    tuning,
    crossover,
    frontOrientation: confirmed.frontOrientation ?? null,
    rearOrientation: confirmed.rearOrientation ?? null,
    displayed: false,
  };
}