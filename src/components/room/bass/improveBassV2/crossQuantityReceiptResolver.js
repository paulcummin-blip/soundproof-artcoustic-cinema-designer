// crossQuantityReceiptResolver.js
// ---------------------------------------------------------------------------
// Read-only resolver for a cross-quantity audit receipt reference.
//
// A cross-quantity audit receipt stores the `selectedCandidateId` of the
// canonical authority receipt the candidate confirmed against. This resolver
// follows that reference into the run's retained confirmed results and returns
// the candidate's processing settings, response basis, P14/headroom outcome,
// P19 at RSP, and the individual-seat P20 evidence — plus Primary and Secondary
// summaries DERIVED from those individual-seat P20 results.
//
// It invents no value. An Overall P20 is never produced: P20 is per-seat, and
// the only summaries are the Primary and Secondary scopes derived from the
// per-seat rows' own `isPrimary` flag. A missing or invalid receipt returns an
// explicit unavailable result, so a cold-reopen reader states "unavailable"
// instead of guessing.
//
// Pure: no store, no fetch, no calculation. It reads only the evidence handed
// to it.
// ---------------------------------------------------------------------------

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const text = (value) => (value === null || value === undefined ? null : String(value));

/**
 * Resolve one receipt reference against retained confirmed results.
 *
 * @param {string|null} receiptRef — canonicalAuthorityReceipt.selectedCandidateId
 * @param {object} sources
 * @param {Array<object>} [sources.confirmedResults] — the run's retained confirmed
 *   candidate results (live after a run; absent on cold reopen)
 * @returns {object} { status: "available"|"unavailable", ... }
 */
export function resolveCrossQuantityReceipt(receiptRef, { confirmedResults = [] } = {}) {
  const ref = text(receiptRef);
  if (!ref) return { status: "unavailable", reason: "no_receipt_ref", receiptRef: null };

  const results = Array.isArray(confirmedResults) ? confirmedResults : [];
  const match = results.find((r) => {
    const id = r?.canonicalAuthorityReceipt?.selectedCandidateId;
    return id != null && String(id) === ref;
  });

  if (!match) {
    return { status: "unavailable", reason: "receipt_not_retained", receiptRef: ref };
  }

  const receipt = match.canonicalAuthorityReceipt || null;
  const perSeatP20 = Array.isArray(match.perSeatP20) ? match.perSeatP20 : [];

  // Primary and Secondary summaries DERIVED from the individual-seat P20 rows.
  // Each row carries its own `isPrimary` flag (set at canonical evaluation from
  // the candidate's seat-priority map), so no separate seating input is needed.
  // The summary states the worst (largest absolute) variation in each scope, the
  // seat that owns it and the level — never an invented Overall P20.
  const primarySummary = deriveScopeSummary(perSeatP20.filter((r) => r?.isPrimary === true));
  const secondarySummary = deriveScopeSummary(perSeatP20.filter((r) => r?.isPrimary !== true));

  return {
    status: "available",
    receiptRef: ref,
    candidateId: text(match.candidateId) || null,
    // The canonical receipt itself — identity only, no response arrays.
    canonicalReceipt: {
      selectedCandidateId: text(receipt?.selectedCandidateId) || null,
      filterBankSignature: text(receipt?.filterBankSignature) || null,
      correctionCurveSignature: text(receipt?.correctionCurveSignature) || null,
      postEqCurveSignature: text(receipt?.postEqCurveSignature) || null,
      poolId: text(receipt?.poolId) || null,
    },
    // Processing settings — the per-source tuning the candidate was confirmed
    // against. Compact: sourceId + the four levers only.
    processingSettings: compactTuning(match.appliedTuning),
    // Response basis — the operating output and assessment band the candidate
    // was evaluated inside.
    responseBasis: {
      operatingOutputDb: num(match.operatingOutputDb),
      assessmentStartHz: num(match.assessmentStartHz),
      assessmentEndHz: num(match.assessmentEndHz),
      p14TargetBasis: text(match.p14TargetBasis),
      p14TargetLevel: num(match.p14TargetLevel),
    },
    // P14 / headroom outcome — the operating-point pass and the margin.
    p14Headroom: {
      requestedP14Pass: match.requestedP14Pass === true,
      p14TargetDb: num(match.p14TargetDb),
      p14AchievedDb: num(match.p14AchievedDb),
      p14HeadroomDb: num(match.p14HeadroomDb),
      p14ShortfallDb: num(match.p14ShortfallDb),
      p14NotAchievedReason: text(match.p14NotAchievedReason),
      physicalValidation: match.physicalValidation || null,
    },
    // P19 at RSP — the canonical headline P19 is the RSP raw deviation.
    p19AtRsp: {
      achievedP19VariationDb: num(match.achievedP19VariationDb),
      achievedP19Level: num(match.achievedP19Level) ?? text(match.achievedP19Level),
    },
    // Individual-seat P20 evidence — compact rows only, no response curves.
    perSeatP20: perSeatP20.map(compactP20Row),
    // Scope summaries derived from perSeatP20. Null when a scope has no rows.
    primarySummary,
    secondarySummary,
  };
}

function compactTuning(appliedTuning) {
  if (!Array.isArray(appliedTuning)) return [];
  return appliedTuning.map((entry) => ({
    sourceId: text(entry?.sourceId) || null,
    delayMs: num(entry?.delayMs),
    gainDb: num(entry?.gainDb),
    polarity: entry?.polarity === -1 || entry?.polarity === "-1" ? -1 : 1,
    phase: num(entry?.phase),
  }));
}

function compactP20Row(row) {
  return {
    seatId: text(row?.seatId) || null,
    isPrimary: row?.isPrimary === true,
    variationDbRaw: num(row?.variationDbRaw),
    wholeDbDeviation: num(row?.wholeDbDeviation),
    level: text(row?.level) || null,
    worstFrequencyHz: num(row?.worstFrequencyHz),
  };
}

function deriveScopeSummary(rows) {
  if (!rows.length) return null;
  let worst = null;
  for (const row of rows) {
    const variation = num(row?.variationDbRaw);
    if (variation == null) continue;
    if (!worst || Math.abs(variation) > Math.abs(worst.variation)) {
      worst = { variation, row };
    }
  }
  if (!worst) return { seatCount: rows.length, worstVariationDb: null, level: null, worstSeatId: null, worstFrequencyHz: null };
  return {
    seatCount: rows.length,
    worstVariationDb: worst.variation,
    level: text(worst.row?.level) || null,
    worstSeatId: text(worst.row?.seatId) || null,
    worstFrequencyHz: num(worst.row?.worstFrequencyHz),
  };
}