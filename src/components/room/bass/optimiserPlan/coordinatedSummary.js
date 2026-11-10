// coordinatedSummary.js
// Compact, durable summary of Phase 9B (coordinated physical search) for
// persisted optimiser run evidence. Extracted from the engine's
// coordinatedDiagnostics object — no raw acoustic curves, no response arrays,
// no tuning payloads. Identity + outcome labels + counts only.
//
// This is an audit record, not a result authority. Nothing here may be read
// as a current engineering value. A completed run must never leave us
// guessing whether Phase 9B executed.

/**
 * Build a compact coordinated summary from the engine's coordinatedDiagnostics.
 * Returns null when no diagnostics were recorded (the run predates Phase 9B
 * or the phase was never reached).
 *
 * @param {object|null} coordinatedDiagnostics - from selection.coordinatedDiagnostics
 * @returns {object|null} compact summary or null
 */
export function buildCoordinatedSummary(coordinatedDiagnostics) {
  if (!coordinatedDiagnostics || typeof coordinatedDiagnostics !== "object") {
    return null;
  }

  const confirmed = Array.isArray(coordinatedDiagnostics.confirmed)
    ? coordinatedDiagnostics.confirmed
    : [];

  return {
    // Execution outcome — always present so a completed run states what
    // happened to Phase 9B explicitly.
    status: coordinatedDiagnostics.status || "skipped",
    eligible: !!coordinatedDiagnostics.eligible,
    skipReason: coordinatedDiagnostics.skipReason || null,
    startedAt: coordinatedDiagnostics.startedAt || null,
    elapsedMs: Number.isFinite(Number(coordinatedDiagnostics.elapsedMs))
      ? Math.round(Number(coordinatedDiagnostics.elapsedMs))
      : null,
    error: coordinatedDiagnostics.error || null,
    // Gate-outcome inputs — what the eligibility gate checked before
    // branching. Captured before the search so a skipped run states WHY
    // it was skipped (which input was absent), not merely that it was.
    gateInputs: {
      hasExistingAuthority: coordinatedDiagnostics.gateInputs?.hasExistingAuthority ?? null,
      hasCurrentFinalist: coordinatedDiagnostics.gateInputs?.hasCurrentFinalist ?? null,
      hasEffectiveBaseline: coordinatedDiagnostics.gateInputs?.hasEffectiveBaseline ?? null,
      hasCurrentTransfer: coordinatedDiagnostics.gateInputs?.hasCurrentTransfer ?? null,
    },
    // Quantity coverage — which subwoofer counts were searched.
    installedQuantity: Number.isFinite(Number(coordinatedDiagnostics.installedQuantity))
      ? Number(coordinatedDiagnostics.installedQuantity)
      : null,
    quantityCoverage: coordinatedDiagnostics.quantityCoverage || {},
    missingQuantities: Array.isArray(coordinatedDiagnostics.missingQuantities)
      ? coordinatedDiagnostics.missingQuantities
      : [],
    // Search funnel — counts only, never summed.
    seatingOffsetsConsidered: Number(coordinatedDiagnostics.seatingOffsetsConsidered) || 0,
    seatingStatesRetained: Array.isArray(coordinatedDiagnostics.seatingStatesRetained)
      ? coordinatedDiagnostics.seatingStatesRetained
      : [],
    placementsGenerated: Number(coordinatedDiagnostics.placementsGenerated) || 0,
    placementsRetained: Number(coordinatedDiagnostics.placementsRetained?.length) || 0,
    combosEvaluated: Number(coordinatedDiagnostics.combosEvaluated) || 0,
    placementFinalists: (coordinatedDiagnostics.placementsRetained || []).map(({ id, phase, quantity, coordinates }) => ({
      id, phase, quantity, coordinates,
    })),
    screenedCandidates: (coordinatedDiagnostics.survivors || []).map(({ placementId, quantity, offsetMm }) => ({
      placementId, quantity, offsetMm,
    })),
    shortlistSize: Number(coordinatedDiagnostics.survivors?.length) || 0,
    // Confirmation outcomes — identity + outcome labels only.
    confirmedCount: confirmed.length,
    confirmedCandidates: confirmed.map((c) => ({
      candidateId: c?.candidateId || null,
      placementId: c?.placementId || null,
      quantity: c?.quantity != null && Number.isFinite(Number(c.quantity)) ? Number(c.quantity) : null,
      offsetMm: c?.offsetMm != null && Number.isFinite(Number(c.offsetMm)) ? Number(c.offsetMm) : null,
      p19Level: c?.p19Level || null,
      p19VariationDb: c?.p19VariationDb != null && Number.isFinite(Number(c.p19VariationDb))
        ? Number(c.p19VariationDb) : null,
      p20Level: c?.p20Level || null,
      p20VariationDb: c?.p20VariationDb != null && Number.isFinite(Number(c.p20VariationDb))
        ? Number(c.p20VariationDb) : null,
      p14Db: c?.p14Db != null && Number.isFinite(Number(c.p14Db)) ? Number(c.p14Db) : null,
      p18Hz: c?.p18Hz != null && Number.isFinite(Number(c.p18Hz)) ? Number(c.p18Hz) : null,
      responseBasis: c?.responseBasis ?? null,
      crossover: c?.crossover ?? null,
      crossoverSearched: c?.crossoverSearched === true,
      tuning: c?.tuning ?? null,
      receipt: c?.receipt ?? null,
      perSeatP20: c?.perSeatP20 ?? [],
      isCrossQuantity: !!c?.isCrossQuantity,
    })),
    // Rejection reasons — compact, no raw issues arrays.
    rejectedCount: Number(coordinatedDiagnostics.rejected?.length) || 0,
    rejections: (Array.isArray(coordinatedDiagnostics.rejected) ? coordinatedDiagnostics.rejected : [])
      .slice(0, 12)
      .map((r) => ({
        stage: r?.stage || null,
        placementId: r?.placementId || null,
        quantity: Number.isFinite(Number(r?.quantity)) ? Number(r.quantity) : null,
        offsetMm: Number.isFinite(Number(r?.offsetMm)) ? Number(r.offsetMm) : null,
        reason: r?.reason || r?.error || null,
        nonAssessable: !!r?.nonAssessable,
      })),
  };
}