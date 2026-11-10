// coordinatedDiagnosticsEnrichment.js
// Enrich Phase 9B coordinated diagnostics with selection evaluation outcomes.
//
// After selectConfirmedRecommendations runs, the selection.evaluations array
// carries the validation, safety, protected-primary-seat and materiality
// outcomes for every candidate — including coordinated ones. This module
// cross-references those outcomes with the coordinatedDiagnostics.confirmed
// entries so the persisted coordinated summary carries the full decision
// evidence for each candidate.
//
// Pure reader: no calculation, no side effects.

/**
 * Enrich the confirmed entries in coordinatedDiagnostics with the evaluation
 * outcomes from selectConfirmedRecommendations.
 *
 * @param {object} coordinatedDiagnostics — from runCoordinatedPhysicalSearch
 * @param {Array} evaluations — from selection.evaluations
 * @returns {object} the enriched coordinatedDiagnostics (mutated in place)
 */
export function enrichCoordinatedDiagnosticsWithEvaluations(coordinatedDiagnostics, evaluations) {
  if (!coordinatedDiagnostics || !Array.isArray(coordinatedDiagnostics.confirmed)) {
    return coordinatedDiagnostics;
  }
  const evals = Array.isArray(evaluations) ? evaluations : [];
  const evalByCandidate = new Map(evals.map((e) => [String(e?.candidateId || ""), e]));

  for (const confirmed of coordinatedDiagnostics.confirmed) {
    const candidateId = String(confirmed?.candidateId || "");
    const evaluation = evalByCandidate.get(candidateId) || null;

    // Validation outcome
    confirmed.validationOutcome = evaluation
      ? {
          status: evaluation.status || null,
          valid: evaluation.status !== "invalid" && evaluation.status !== "non-assessable",
          issues: Array.isArray(evaluation.issues) ? evaluation.issues : [],
        }
      : { status: "not-evaluated", valid: false, issues: ["No selection evaluation found for this candidate"] };

    // Protected-primary-seat safety outcome
    confirmed.protectedPrimarySafety = evaluation?.protectedSafety
      ? {
          safe: evaluation.protectedSafety.safe === true,
          regressedSeatId: evaluation.protectedSafety.regressedSeatId || null,
          parameter: evaluation.protectedSafety.parameter || null,
          reason: evaluation.protectedSafety.reason || null,
        }
      : null;

    // Materiality gate outcome
    confirmed.materialityOutcome = evaluation?.materiality
      ? {
          material: evaluation.materiality.material === true,
          rule: evaluation.materiality.rule || null,
          reason: evaluation.materiality.reason || null,
        }
      : null;

    // Eligibility for physical-alternative presentation: requires validation,
    // safety, protected-primary-seat and materiality to ALL pass. The
    // selection status "material" means exactly that.
    confirmed.physicalAlternativeEligible = evaluation?.status === "material";

    // Whether the alternative was actually displayed — set by the UI layer.
    // Default false; the presentation component sets it true when it renders.
    confirmed.physicalAlternativeDisplayed = false;
  }

  return coordinatedDiagnostics;
}