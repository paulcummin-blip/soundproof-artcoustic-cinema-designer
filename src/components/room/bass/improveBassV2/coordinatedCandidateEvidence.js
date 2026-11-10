// coordinatedCandidateEvidence.js
// Summarise the genuine post-EQ evidence from a canonically confirmed result
// into a compact, designer-facing evidence object.
//
// This module REFORMATS values already present on the confirmed result — it
// never recalculates, re-grades, or estimates a value that is not there.
// There is no Overall P20 parameter; Primary and Secondary are supplementary
// seat-group summaries derived from the individual-seat P20 rows.

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Derive the Primary and Secondary seat-group P20 summaries from the
 * individual-seat P20 rows. These are supplementary summaries — there is no
 * Overall P20 parameter.
 *
 * Primary = worst (highest) variation among primary seats.
 * Secondary = worst (highest) variation among secondary seats.
 *
 * @param {Array} perSeatP20 — from the confirmed result
 * @returns {{ primary: object|null, secondary: object|null }}
 */
export function deriveSeatGroupP20Summaries(perSeatP20) {
  const seats = Array.isArray(perSeatP20) ? perSeatP20 : [];
  const primarySeats = seats.filter((s) => s.isPrimary);
  const secondarySeats = seats.filter((s) => !s.isPrimary);

  const worstOf = (group) => {
    if (!group.length) return null;
    let worst = null;
    for (const seat of group) {
      const variation = num(seat?.variationDbRaw ?? seat?.wholeDbDeviation);
      if (variation == null) continue;
      if (!worst || variation > worst.variationDb) {
        worst = {
          seatId: seat.seatId ?? null,
          variationDb: variation,
          level: num(seat?.level),
          worstFrequencyHz: num(seat?.worstFrequencyHz),
        };
      }
    }
    return worst;
  };

  return {
    primary: worstOf(primarySeats),
    secondary: worstOf(secondarySeats),
  };
}

/**
 * Summarise the post-EQ evidence from a canonically confirmed result.
 *
 * @param {object} confirmation — from evaluateStage2ConfirmationWithTuning
 * @param {object} meta — { candidateId, responseBasis, crossover, tuning }
 * @returns {object} compact evidence object
 */
export function summariseCoordinatedEvidence(confirmation, meta = {}) {
  const summaries = deriveSeatGroupP20Summaries(confirmation?.perSeatP20);

  return {
    candidateId: meta.candidateId || confirmation?.candidateId || null,
    p19: {
      level: num(confirmation?.achievedP19Level),
      variationDb: num(confirmation?.achievedP19VariationDb),
    },
    p20Primary: summaries.primary,
    p20Secondary: summaries.secondary,
    perSeatP20: (Array.isArray(confirmation?.perSeatP20) ? confirmation.perSeatP20 : []).map((seat) => ({
      seatId: seat.seatId ?? null,
      isPrimary: Boolean(seat.isPrimary),
      variationDb: num(seat?.variationDbRaw ?? seat?.wholeDbDeviation),
      level: num(seat?.level),
      worstFrequencyHz: num(seat?.worstFrequencyHz),
    })),
    perSeatP19: (Array.isArray(confirmation?.perSeatP19) ? confirmation.perSeatP19 : []).map((seat) => ({
      seatId: seat.seatId ?? null,
      isPrimary: Boolean(seat.isPrimary),
      deviationDb: num(seat?.wholeDbDeviation ?? seat?.variationDbRaw),
      level: num(seat?.level),
      worstFrequencyHz: num(seat?.worstFrequencyHz),
    })),
    p14: {
      achievedDb: num(confirmation?.p14AchievedDb),
      targetDb: num(confirmation?.p14TargetDb),
      headroomDb: num(confirmation?.p14HeadroomDb),
    },
    p18: {
      achievedHz: num(confirmation?.achievedP18Hz),
      assessmentStartHz: num(confirmation?.assessmentStartHz),
      assessmentEndHz: num(confirmation?.assessmentEndHz),
    },
    tuning: Array.isArray(meta.tuning) ? meta.tuning : confirmation?.appliedTuning || null,
    crossover: meta.crossover || confirmation?.crossover || null,
    responseBasis: meta.responseBasis || confirmation?.responseBasis || "sub-only",
    receipt: confirmation?.canonicalAuthorityReceipt || null,
    // Applied EQ filter bank (the bass correction filters the canonical pipeline
    // selected). Compact per-filter descriptors only — never the full coefficient
    // arrays. Empty when unavailable.
    appliedEq: extractEqFilters(confirmation?.finalOptimisedBassResponse?.eqFilterBank),
    sharedCancellations: null, // filled by the caller after this summary
    // Genuine post-EQ curves from the canonical result's
    // finalOptimisedBassResponse. Empty arrays when unavailable — never
    // invented from headline metrics.
    postEqRspCurve: extractCurve(confirmation?.finalOptimisedBassResponse?.postEqRspCurve),
    postEqPerSeatCurves: extractPerSeatCurves(confirmation?.finalOptimisedBassResponse?.postEqPerSeatCurves),
  };
}

function extractCurve(curve) {
  if (!Array.isArray(curve)) return [];
  return curve.map((p) => ({ ...p }));
}

/**
 * Extract a compact descriptor of each applied EQ filter from the canonical
 * filter bank. Carries the filter type, frequency, gain and Q (where present)
 * so the developer evidence can show what the pipeline applied without
 * duplicating the full coefficient arrays.
 */
function extractEqFilters(filterBank) {
  if (!Array.isArray(filterBank)) return [];
  return filterBank.map((f) => ({
    type: f?.type ?? f?.filterType ?? null,
    frequencyHz: num(f?.frequency ?? f?.frequencyHz ?? f?.fc),
    gainDb: num(f?.gain ?? f?.gainDb),
    q: num(f?.q ?? f?.quality),
  }));
}

function extractPerSeatCurves(curves) {
  if (!Array.isArray(curves)) return [];
  return curves.map((seat) => ({
    seatId: seat?.seatId ?? null,
    responseData: Array.isArray(seat?.responseData)
      ? seat.responseData.map((p) => ({ ...p }))
      : [],
  }));
}