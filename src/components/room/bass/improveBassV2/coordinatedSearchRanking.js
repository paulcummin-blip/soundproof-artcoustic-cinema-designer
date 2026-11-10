// coordinatedSearchRanking.js
// ---------------------------------------------------------------------------
// Search-specific acoustic qualification and designer-led recommendation.
//
// This module does NOT replace the existing Stage 2, V2, P14, P19 or P20
// ranking authorities. It is a NEW policy layer for the coordinated Bass ADI
// search only:
//
//   1. ACOUSTIC QUALIFICATION: establish physical validity, P14/headroom,
//      P19 at RSP, every seat's P20, cancellation risks, and evidence
//      completeness. A qualified design is credible and safe.
//
//   2. DESIGNER-LED RECOMMENDATION: compare qualified alternatives with the
//      designer's preferred layout. Only recommend an alternative when it
//      delivers a material improvement (existing materiality rules). Prefer
//      simpler solutions when performance is effectively equivalent.
//
// P19 remains the RSP frequency-response result. P20 remains the seat-to-seat
// consistency result with Primary seats prioritised. P14 remains an
// independent output-capability and headroom requirement.
// ---------------------------------------------------------------------------

import { isMaterialImprovement } from "./materialityGate";

/**
 * Convert a coordinated candidate evidence object (from
 * coordinatedCandidateEvidence) into a result-like object that the existing
 * materiality gate (isMaterialImprovement) can consume. The evidence summary
 * uses `variationDb` and `p19.level`; the materiality gate reads
 * `variationDbRaw` and `achievedP19Level`. This adapter bridges that gap
 * without changing either authority.
 */
function evidenceToResult(evidence) {
  if (!evidence) return null;
  const perSeatP20 = Array.isArray(evidence.perSeatP20)
    ? evidence.perSeatP20.map((seat) => ({
        ...seat,
        variationDbRaw: seat.variationDbRaw ?? seat.variationDb ?? 0,
      }))
    : [];
  return {
    ...evidence,
    perSeatP20,
    perSeatP19: Array.isArray(evidence.perSeatP19)
      ? evidence.perSeatP19.map((seat) => ({
          ...seat,
          variationDbRaw: seat.deviationDb ?? seat.variationDbRaw ?? 0,
        }))
      : [],
    achievedP19Level: evidence.p19?.level,
    achievedP19VariationDb: evidence.p19?.variationDb,
    achievedP20VariationDb: evidence.p20Primary?.variationDb ?? evidence.achievedP20VariationDb,
    achievedP20Level: evidence.p20Primary?.level,
  };
}

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const LEVEL_TO_NUMBER = { FAIL: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

function levelNum(level) {
  if (Number.isFinite(Number(level))) return Math.max(0, Math.min(4, Number(level)));
  const match = String(level || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

/**
 * ACOUSTIC QUALIFICATION: check whether a candidate is physically valid,
// has adequate P14/headroom, complete canonical evidence, and no
 * disqualifying safety issues.
 *
 * @param {object} evidence — from coordinatedCandidateEvidence
 * @param {object} options — { p14Passes, physicalRejection }
 * @returns {{ qualified: boolean, issues: string[], safety: object }}
 */
export function qualifyCandidate(evidence, options = {}) {
  const issues = [];

  if (!evidence) {
    return { qualified: false, issues: ["No evidence"], safety: { p14: false, physical: false } };
  }

  if (options.physicalRejection) {
    issues.push(`Physical rejection: ${options.physicalRejection}`);
  }

  const p14 = evidence.p14 || {};
  const p14Passes = options.p14Passes !== false
    && num(p14.achievedDb) != null
    && num(p14.targetDb) != null
    && num(p14.achievedDb) >= num(p14.targetDb);
  if (!p14Passes) {
    issues.push("P14 output capability insufficient — smooth response cannot compensate");
  }

  if (!evidence.perSeatP20 || evidence.perSeatP20.length === 0) {
    issues.push("No individual-seat P20 results");
  }

  if (evidence.p19?.level == null && evidence.p19?.variationDb == null) {
    issues.push("No P19 evidence");
  }

  if (!evidence.receipt?.selectedCandidateId) {
    issues.push("Canonical receipt missing selectedCandidateId");
  }

  const cancellations = Array.isArray(evidence.sharedCancellations)
    ? evidence.sharedCancellations
    : [];
  const hasSeriousCancellation = cancellations.some(
    (c) => c && (c.severity === "serious" || c.severity === "severe"),
  );

  return {
    qualified: issues.length === 0,
    issues,
    safety: {
      p14: p14Passes,
      physical: !options.physicalRejection,
      seriousCancellation: hasSeriousCancellation,
    },
  };
}

/**
 * DESIGNER-LED RECOMMENDATION: compare a qualified alternative with the
 * baseline (designer's preferred layout) and decide whether the alternative
 * is worth recommending.
 *
 * Uses the existing materiality gate (level changes, ≥1.0 dB same-level
 * improvements, severe null reduction). Does not recommend physical changes
 * based on cosmetic differences below 1.0 dB within the same RP22 level.
 *
 * @param {object} baselineEvidence — the designer's current configuration evidence
 * @param {object} candidateEvidence — the alternative configuration evidence
 * @returns {{ recommended: boolean, reason: string, materiality: object, comparison: object }}
 */
export function compareWithBaseline(baselineEvidence, candidateEvidence) {
  if (!baselineEvidence || !candidateEvidence) {
    return { recommended: false, reason: "Missing baseline or candidate evidence",
      materiality: null, comparison: null };
  }

  const baselineResult = evidenceToResult(baselineEvidence);
  const candidateResult = evidenceToResult(candidateEvidence);
  const materiality = isMaterialImprovement(baselineResult, candidateResult);

  const comparison = buildComparison(baselineEvidence, candidateEvidence);

  if (!materiality.material) {
    return {
      recommended: false,
      reason: materiality.reason || "No material improvement over the preferred layout",
      materiality,
      comparison,
    };
  }

  const p19Regression = hasP19Regression(baselineEvidence, candidateEvidence);
  if (p19Regression.regressed) {
    return {
      recommended: false,
      reason: `P19 regression: ${p19Regression.reason}`,
      materiality,
      comparison,
    };
  }

  const primaryP20Regression = hasPrimaryP20Regression(baselineEvidence, candidateEvidence);
  if (primaryP20Regression.regressed) {
    return {
      recommended: false,
      reason: `Primary P20 regression: ${primaryP20Regression.reason}`,
      materiality,
      comparison,
    };
  }

  return {
    recommended: true,
    reason: materiality.reason,
    materiality,
    comparison,
  };
}

/**
 * Build a structured comparison between baseline and candidate evidence.
 * Pure reporting — no scoring, no threshold.
 */
function buildComparison(baseline, candidate) {
  return {
    p19: {
      baselineLevel: num(baseline.p19?.level),
      candidateLevel: num(candidate.p19?.level),
      levelDelta: levelNum(candidate.p19?.level) - levelNum(baseline.p19?.level),
      baselineVariationDb: num(baseline.p19?.variationDb),
      candidateVariationDb: num(candidate.p19?.variationDb),
    },
    p20Primary: {
      baselineLevel: num(baseline.p20Primary?.level),
      candidateLevel: num(candidate.p20Primary?.level),
      levelDelta: levelNum(candidate.p20Primary?.level) - levelNum(baseline.p20Primary?.level),
      baselineVariationDb: num(baseline.p20Primary?.variationDb),
      candidateVariationDb: num(candidate.p20Primary?.variationDb),
    },
    p20Secondary: {
      baselineLevel: num(baseline.p20Secondary?.level),
      candidateLevel: num(candidate.p20Secondary?.level),
      levelDelta: levelNum(candidate.p20Secondary?.level) - levelNum(baseline.p20Secondary?.level),
    },
    p14: {
      baselineAchievedDb: num(baseline.p14?.achievedDb),
      candidateAchievedDb: num(candidate.p14?.achievedDb),
    },
  };
}

function hasP19Regression(baseline, candidate) {
  const baseLevel = levelNum(baseline.p19?.level);
  const candLevel = levelNum(candidate.p19?.level);
  if (candLevel < baseLevel) {
    return { regressed: true, reason: `P19 dropped L${baseLevel} → L${candLevel}` };
  }
  return { regressed: false };
}

function hasPrimaryP20Regression(baseline, candidate) {
  const baseLevel = levelNum(baseline.p20Primary?.level);
  const candLevel = levelNum(candidate.p20Primary?.level);
  if (candLevel < baseLevel) {
    return { regressed: true, reason: `Primary P20 dropped L${baseLevel} → L${candLevel}` };
  }
  return { regressed: false };
}

/**
 * COMPLEXITY PREFERENCE: when several configurations deliver equivalent
 * meaningful performance, prefer the simpler solution.
 *
 * Equivalence is defined as: same Primary P20 level, same P19 level, and
 * within-level differences below the 1.0 dB materiality threshold.
 *
 * @param {object} a — first candidate evidence
 * @param {object} b — second candidate evidence
 * @returns {number} negative if a is preferred (simpler), positive if b preferred
 */
export function preferSimpler(a, b) {
  const aQty = num(a?.quantity) ?? Infinity;
  const bQty = num(b?.quantity) ?? Infinity;

  const aP20 = levelNum(a?.p20Primary?.level);
  const bP20 = levelNum(b?.p20Primary?.level);
  const aP19 = levelNum(a?.p19?.level);
  const bP19 = levelNum(b?.p19?.level);

  const sameP20 = aP20 === bP20;
  const sameP19 = aP19 === bP19;

  if (sameP20 && sameP19) {
    const aVar = Math.abs(num(a?.p20Primary?.variationDb) ?? 0);
    const bVar = Math.abs(num(b?.p20Primary?.variationDb) ?? 0);
    const withinThreshold = Math.abs(aVar - bVar) < 1.0;
    if (withinThreshold) {
      return aQty - bQty;
    }
  }

  return 0;
}

/**
 * Check whether two qualified candidates are genuinely distinct options.
 * Candidates are distinct if they differ in quantity, physical placement
 * family, or seating position. This prevents presenting near-identical
 * alternatives as separate options.
 *
 * @param {object} a — first candidate meta
 * @param {object} b — second candidate meta
 * @returns {boolean} true if genuinely distinct
 */
export function areDistinctOptions(a, b) {
  if (!a || !b) return true;

  if (num(a.quantity) !== num(b.quantity)) return true;

  const aSeats = JSON.stringify(a.seatingPositions || []);
  const bSeats = JSON.stringify(b.seatingPositions || []);
  if (aSeats !== bSeats) return true;

  const aCoords = JSON.stringify(a.coordinates || []);
  const bCoords = JSON.stringify(b.coordinates || []);
  if (aCoords !== bCoords) return true;

  return false;
}