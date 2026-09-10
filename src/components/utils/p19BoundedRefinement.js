// p19BoundedRefinement.js
// ------------------------
// Bounded post-calibration P19 refinement.
//
// This module searches a bounded neighbourhood of globalTrimDb values around
// the Pass-1 result. For each candidate, it calls a SHARED candidate evaluator
// (supplied by canonicalBassOptimiser.js) that:
//   - runs the SAME correction logic with the candidate globalTrimDb
//   - rebuilds the product operating envelope from THAT candidate's correction
//   - builds the post-EQ curve (clamped to capability + product envelope)
//   - builds per-seat post-EQ curves
//   - verifies P14 via calculatePairedP14P18ProductionAuthority
//   - evaluates P18 via assessP18AgainstRequiredExtension + assessP18Extension
//   - resolves the assessment band with the REAL p14Pass
//   - evaluates P19 and P20 over the recalculated band
//   - checks primary-seat safety for ALL primary seats (P19 and P20)
//
// This module does NOT duplicate any cap/envelope/P14/P18/P19/P20 maths.
// It varies only the search variable (globalTrimDb) and ranks candidates
// using the comprehensive evaluation returned by the shared evaluator.
//
// Eligibility gates (all hard, fail closed):
//   1. P14 valid (p14Pass === true)
//   2. Physical authority (physicalEqAuthorityPassed === true)
//   2b. Boost ≤ +6 dB + tolerance, cut ≥ −15 dB − tolerance
//   3. P18 not worsened (level not worse, extension Hz not materially worse)
//   4. Primary-seat safety (no P19 or P20 regression for ANY primary seat)
//   5. P20 multi-seat damage guard (worst P20 not > Pass-1 + 1.0 dB)
//
// Ranking hierarchy (among ELIGIBLE candidates):
//   1. Lowest recalculated official P19
//   2. P20 / multi-seat behaviour (worst P20 lower is better)
//   3. Headroom (p14MarginDb)
//   4. Smallest departure from Pass-1

const finite = (v) => v !== null && v !== "" && Number.isFinite(Number(v));

// P18 extension materiality tolerance: a candidate whose extension Hz is
// higher (worse) than Pass-1 by more than this is rejected.
const P18_EXTENSION_TOLERANCE_HZ = 1.0;

// P20 multi-seat materiality tolerance: a candidate whose worst P20 is worse
// than Pass-1 by more than this is rejected (multi-seat damage guard).
const P20_MULTI_SEAT_TOLERANCE_DB = 1.0;

// P19 improvement materiality threshold: improvements below this are cosmetic.
const P19_IMPROVEMENT_THRESHOLD_DB = 0.1;

// Hard physical limits (fail closed with tiny numeric tolerance).
const MAX_BOOST_LIMIT_DB = 6.0;
const MAX_BOOST_TOLERANCE_DB = 0.05;
const MAX_CUT_LIMIT_DB = -15.0;
const MAX_CUT_TOLERANCE_DB = 0.05;

/**
 * Check if a candidate is eligible (passes hard constraints relative to Pass-1).
 * Physical authority, boost/cut limits, and P20 damage are ALL eligibility
 * gates — not just diagnostics.
 */
function isEligible(evaluation, pass1) {
  if (!evaluation) return false;
  // 1. P14 valid
  if (evaluation.p14Pass !== true) return false;
  // 2. Physical authority (protected-null + peak-boost violations)
  if (evaluation.physicalEqAuthorityPassed !== true) return false;
  // 2b. Hard boost/cut limits (fail closed)
  if (finite(evaluation.maxBoostDb) && Number(evaluation.maxBoostDb) > MAX_BOOST_LIMIT_DB + MAX_BOOST_TOLERANCE_DB) return false;
  if (finite(evaluation.maxCutDb) && Number(evaluation.maxCutDb) < MAX_CUT_LIMIT_DB - MAX_CUT_TOLERANCE_DB) return false;
  // 3. P18 not worsened
  const p18Level = finite(evaluation.achievedP18Level) ? Number(evaluation.achievedP18Level) : 0;
  const pass1P18Level = finite(pass1.achievedP18Level) ? Number(pass1.achievedP18Level) : 0;
  if (p18Level < pass1P18Level) return false;
  if (finite(evaluation.achievedP18Hz) && finite(pass1.achievedP18Hz)
    && Number(evaluation.achievedP18Hz) > Number(pass1.achievedP18Hz) + P18_EXTENSION_TOLERANCE_HZ) return false;
  // 4. Primary-seat safety (all primary seats, P19 + P20)
  if (evaluation.primarySeatSafety?.regressed === true) return false;
  // 5. P20 multi-seat damage guard — eligibility, not just tiebreaker.
  // If Pass-1 P20 is valid AND candidate P20 is valid AND candidate worst P20
  // exceeds Pass-1 by more than the tolerance, the candidate is ineligible.
  if (pass1.p20Available === true && evaluation.p20Available === true
    && finite(pass1.p20Db) && finite(evaluation.p20Db)
    && Number(evaluation.p20Db) > Number(pass1.p20Db) + P20_MULTI_SEAT_TOLERANCE_DB) return false;
  // 6. Operating-level authority — the final post-EQ curve must integrate to
  // the selected operating output (e.g. 112 dBC). P14 capability PASS does NOT
  // imply operating-level PASS. A candidate that overshoots the target (e.g.
  // 118.6 dBC at 112 target) is ineligible regardless of P19/P20 improvement.
  if (evaluation.operatingOutputValid !== true) return false;
  return true;
}

/**
 * Compare two ELIGIBLE candidates using the full ranking hierarchy.
 * Returns negative if candidateA ranks better, positive if candidateB ranks better.
 */
function compareCandidates(a, b, pass1) {
  // 1. Lowest recalculated official P19
  if (finite(a.p19Db) && finite(b.p19Db) && Math.abs(a.p19Db - b.p19Db) > 0.01) {
    return a.p19Db - b.p19Db; // lower is better
  }

  // 2. P20 / multi-seat behaviour — lower worst P20 is better
  const aP20 = finite(a.p20Db) ? Number(a.p20Db) : Infinity;
  const bP20 = finite(b.p20Db) ? Number(b.p20Db) : Infinity;
  if (Math.abs(aP20 - bP20) > 0.01) return aP20 - bP20;

  // 3. Headroom — higher p14MarginDb is better
  const aHeadroom = finite(a.p14MarginDb) ? Number(a.p14MarginDb) : -Infinity;
  const bHeadroom = finite(b.p14MarginDb) ? Number(b.p14MarginDb) : -Infinity;
  if (Math.abs(aHeadroom - bHeadroom) > 0.01) return bHeadroom - aHeadroom;

  // 4. Smallest departure from Pass-1
  const aDeparture = Math.abs(Number(a.globalTrimDb) - Number(pass1.globalTrimDb));
  const bDeparture = Math.abs(Number(b.globalTrimDb) - Number(pass1.globalTrimDb));
  return aDeparture - bDeparture;
}

/**
 * Bounded P19 refinement over globalTrimDb.
 *
 * @param {object} params
 * @param {function} params.evaluateCandidate - callback(globalTrimDb) => evaluation object
 * @param {number} params.pass1GlobalTrimDb - Pass-1 auto-derived global trim
 * @param {object} params.pass1Evaluation - evaluation object from Pass-1 (via same evaluator)
 * @returns {object} refinement result with diagnostics
 */
export function refineP19GlobalNormalisation({
  evaluateCandidate,
  pass1GlobalTrimDb,
  pass1Evaluation,
}) {
  const nowMs = () => typeof performance !== "undefined" ? performance.now() : Date.now();
  const startedAt = nowMs();

  if (typeof evaluateCandidate !== "function" || !pass1Evaluation) {
    return { refinementAttempted: false, reason: "missing-evaluator-or-pass1" };
  }

  // ── Pass-1 validity check ──
  // Pass 1 must have valid P14 AND physical authority to serve as
  // an optimisation baseline. If it doesn't, refinement must NOT
  // manufacture a refined authority from an invalid baseline.
  if (pass1Evaluation.p14Pass !== true || pass1Evaluation.physicalEqAuthorityPassed !== true
    || pass1Evaluation.operatingOutputValid !== true) {
    return {
      refinementAttempted: true,
      refinementImproved: false,
      reason: "pass1-invalid-for-refinement",
      pass1P14Pass: pass1Evaluation.p14Pass === true,
      pass1PhysicalEqAuthorityPassed: pass1Evaluation.physicalEqAuthorityPassed === true,
      pass1OperatingOutputValid: pass1Evaluation.operatingOutputValid === true,
      pass1GlobalTrimDb: Number(pass1GlobalTrimDb),
      refinedGlobalTrimDb: Number(pass1GlobalTrimDb),
      pass1P19Db: finite(pass1Evaluation.p19Db) ? Number(pass1Evaluation.p19Db) : null,
      refinedP19Db: finite(pass1Evaluation.p19Db) ? Number(pass1Evaluation.p19Db) : null,
      improvementDb: 0,
      pass1P18Hz: finite(pass1Evaluation.achievedP18Hz) ? Number(pass1Evaluation.achievedP18Hz) : null,
      refinedP18Hz: finite(pass1Evaluation.achievedP18Hz) ? Number(pass1Evaluation.achievedP18Hz) : null,
      pass1P18Level: finite(pass1Evaluation.achievedP18Level) ? Number(pass1Evaluation.achievedP18Level) : 0,
      refinedP18Level: finite(pass1Evaluation.achievedP18Level) ? Number(pass1Evaluation.achievedP18Level) : 0,
      pass1P14MarginDb: finite(pass1Evaluation.p14MarginDb) ? Number(pass1Evaluation.p14MarginDb) : null,
      refinedP14MarginDb: finite(pass1Evaluation.p14MarginDb) ? Number(pass1Evaluation.p14MarginDb) : null,
      pass1P20Db: finite(pass1Evaluation.p20Db) ? Number(pass1Evaluation.p20Db) : null,
      refinedP20Db: finite(pass1Evaluation.p20Db) ? Number(pass1Evaluation.p20Db) : null,
      pass1AssessmentBand: pass1Evaluation.assessmentBand || null,
      refinedAssessmentBand: pass1Evaluation.assessmentBand || null,
      maxBoostDb: pass1Evaluation.maxBoostDb ?? null,
      maxCutDb: pass1Evaluation.maxCutDb ?? null,
      bindingConstraint: "pass1-invalid-for-refinement",
      selectedOperatingOutputDb: finite(pass1Evaluation.selectedOperatingOutputDb) ? Number(pass1Evaluation.selectedOperatingOutputDb) : null,
      pass1FinalOperatingOutputDb: finite(pass1Evaluation.finalOperatingOutputDb) ? Number(pass1Evaluation.finalOperatingOutputDb) : null,
      pass1OperatingOutputErrorDb: finite(pass1Evaluation.operatingOutputErrorDb) ? Number(pass1Evaluation.operatingOutputErrorDb) : null,
      pass1OperatingOutputValid: pass1Evaluation.operatingOutputValid === true,
      refinedFinalOperatingOutputDb: finite(pass1Evaluation.finalOperatingOutputDb) ? Number(pass1Evaluation.finalOperatingOutputDb) : null,
      refinedOperatingOutputErrorDb: finite(pass1Evaluation.operatingOutputErrorDb) ? Number(pass1Evaluation.operatingOutputErrorDb) : null,
      refinedOperatingOutputValid: pass1Evaluation.operatingOutputValid === true,
      candidatesTested: 0,
      coarseCandidatesTested: 0,
      fineCandidatesTested: 0,
      coarseRefinementTimeMs: 0,
      fineRefinementTimeMs: 0,
      totalAddedLatencyMs: nowMs() - startedAt,
      pass1Evaluation,
      refinedEvaluation: null,
    };
  }

  const pass1 = pass1Evaluation;
  const pass1P19 = finite(pass1.p19Db) ? Number(pass1.p19Db) : null;

  // ── Derive bounded search range ──
  // Search the full bounded Pass-1 → 0 region. The lower bound is the auto
  // Pass-1 trim (e.g. -19.4 dB); the upper bound is 0 dB (no trim). This
  // ensures the legal optimum (e.g. ~-12.25 dB) is naturally included — the
  // previous hard -12 dB floor incorrectly excluded it.
  const searchUpper = 0;
  const searchLower = pass1GlobalTrimDb;
  const coarseStep = 1.0;

  // ── Coarse search ──
  const coarseStart = nowMs();
  const coarseCandidates = [];
  for (let trim = searchLower; trim <= searchUpper + 0.001; trim += coarseStep) {
    coarseCandidates.push(Math.round(trim * 1000) / 1000);
  }
  const pass1Rounded = Math.round(pass1GlobalTrimDb * 1000) / 1000;
  if (!coarseCandidates.includes(pass1Rounded)) {
    coarseCandidates.push(pass1Rounded);
  }
  // Ensure 0 dB (upper bound) is always tested
  if (!coarseCandidates.includes(0)) {
    coarseCandidates.push(0);
  }

  let coarseEvaluationsRun = 0;
  const coarseEvaluations = [];
  for (const trim of coarseCandidates) {
    const evaluation = evaluateCandidate(trim);
    coarseEvaluationsRun++;
    if (evaluation) coarseEvaluations.push(evaluation);
  }
  const coarseTimeMs = nowMs() - coarseStart;

  // Find best eligible coarse candidate
  let bestCoarse = null;
  for (const evaluation of coarseEvaluations) {
    if (!isEligible(evaluation, pass1)) continue;
    if (!bestCoarse || compareCandidates(evaluation, bestCoarse, pass1) < 0) {
      bestCoarse = evaluation;
    }
  }

  // ── Fine search around best coarse candidate ──
  const fineStart = nowMs();
  let bestFine = bestCoarse;
  let fineEvaluationsRun = 0;
  if (bestCoarse) {
    const fineCentre = Number(bestCoarse.globalTrimDb);
    const fineRange = 1.5;
    const fineStep = 0.25;
    for (let trim = fineCentre - fineRange; trim <= fineCentre + fineRange + 0.001; trim += fineStep) {
      const rounded = Math.round(trim * 1000) / 1000;
      if (rounded > searchUpper + 0.001 || rounded < searchLower - 0.001) continue;
      if (rounded === Math.round(fineCentre * 1000) / 1000) continue;
      const evaluation = evaluateCandidate(rounded);
      fineEvaluationsRun++;
      if (!evaluation || !isEligible(evaluation, pass1)) continue;
      if (!bestFine || compareCandidates(evaluation, bestFine, pass1) < 0) {
        bestFine = evaluation;
      }
    }
  }
  const fineTimeMs = nowMs() - fineStart;

  const totalEvaluationsRun = coarseEvaluationsRun + fineEvaluationsRun;
  const totalTimeMs = nowMs() - startedAt;

  // ── Select winner ──
  const refinedP19 = bestFine ? Number(bestFine.p19Db) : pass1P19;
  const improvementDb = finite(pass1P19) && finite(refinedP19) ? pass1P19 - refinedP19 : 0;
  const refinementImproved = bestFine && improvementDb > P19_IMPROVEMENT_THRESHOLD_DB;

  // ── Binding constraint diagnostics ──
  let bindingConstraint = null;
  if (refinementImproved && bestFine) {
    const c = bestFine;
    if (finite(c.maxBoostDb) && c.maxBoostDb >= 5.95) bindingConstraint = "boost-limit";
    else if (finite(c.maxCutDb) && c.maxCutDb <= -14.95) bindingConstraint = "cut-limit";
    else if (!c.assessmentBand?.valid) bindingConstraint = "assessment-band-invalid";
    else bindingConstraint = "CURRENT MODEL CAPABILITY LIMIT";
  } else if (!bestFine) {
    bindingConstraint = "no-valid-candidate-found";
  } else {
    bindingConstraint = "pass1-already-optimal";
  }

  return {
    refinementAttempted: true,
    refinementImproved,
    pass1GlobalTrimDb: Number(pass1GlobalTrimDb),
    refinedGlobalTrimDb: refinementImproved ? Number(bestFine.globalTrimDb) : Number(pass1GlobalTrimDb),
    pass1P19Db: finite(pass1P19) ? Number(pass1P19) : null,
    refinedP19Db: finite(refinedP19) ? Number(refinedP19) : null,
    improvementDb: Number(improvementDb) || 0,
    pass1P18Hz: finite(pass1.achievedP18Hz) ? Number(pass1.achievedP18Hz) : null,
    refinedP18Hz: refinementImproved && finite(bestFine.achievedP18Hz) ? Number(bestFine.achievedP18Hz) : (finite(pass1.achievedP18Hz) ? Number(pass1.achievedP18Hz) : null),
    pass1P18Level: finite(pass1.achievedP18Level) ? Number(pass1.achievedP18Level) : 0,
    refinedP18Level: refinementImproved && finite(bestFine.achievedP18Level) ? Number(bestFine.achievedP18Level) : (finite(pass1.achievedP18Level) ? Number(pass1.achievedP18Level) : 0),
    pass1P14Pass: pass1.p14Pass === true,
    refinedP14Pass: refinementImproved ? bestFine.p14Pass === true : pass1.p14Pass === true,
    pass1P14MarginDb: finite(pass1.p14MarginDb) ? Number(pass1.p14MarginDb) : null,
    refinedP14MarginDb: refinementImproved && finite(bestFine.p14MarginDb) ? Number(bestFine.p14MarginDb) : (finite(pass1.p14MarginDb) ? Number(pass1.p14MarginDb) : null),
    pass1P20Db: finite(pass1.p20Db) ? Number(pass1.p20Db) : null,
    refinedP20Db: refinementImproved && finite(bestFine.p20Db) ? Number(bestFine.p20Db) : (finite(pass1.p20Db) ? Number(pass1.p20Db) : null),
    pass1AssessmentBand: pass1.assessmentBand || null,
    refinedAssessmentBand: refinementImproved ? bestFine.assessmentBand : pass1.assessmentBand || null,
    maxBoostDb: refinementImproved ? bestFine.maxBoostDb : pass1.maxBoostDb,
    maxCutDb: refinementImproved ? bestFine.maxCutDb : pass1.maxCutDb,
    bindingConstraint,
    selectedOperatingOutputDb: finite(pass1.selectedOperatingOutputDb) ? Number(pass1.selectedOperatingOutputDb) : null,
    pass1FinalOperatingOutputDb: finite(pass1.finalOperatingOutputDb) ? Number(pass1.finalOperatingOutputDb) : null,
    pass1OperatingOutputErrorDb: finite(pass1.operatingOutputErrorDb) ? Number(pass1.operatingOutputErrorDb) : null,
    pass1OperatingOutputValid: pass1.operatingOutputValid === true,
    refinedFinalOperatingOutputDb: refinementImproved && finite(bestFine.finalOperatingOutputDb) ? Number(bestFine.finalOperatingOutputDb) : (finite(pass1.finalOperatingOutputDb) ? Number(pass1.finalOperatingOutputDb) : null),
    refinedOperatingOutputErrorDb: refinementImproved && finite(bestFine.operatingOutputErrorDb) ? Number(bestFine.operatingOutputErrorDb) : (finite(pass1.operatingOutputErrorDb) ? Number(pass1.operatingOutputErrorDb) : null),
    refinedOperatingOutputValid: refinementImproved ? bestFine.operatingOutputValid === true : pass1.operatingOutputValid === true,
    candidatesTested: totalEvaluationsRun,
    coarseCandidatesTested: coarseEvaluationsRun,
    fineCandidatesTested: fineEvaluationsRun,
    coarseRefinementTimeMs: coarseTimeMs,
    fineRefinementTimeMs: fineTimeMs,
    totalAddedLatencyMs: totalTimeMs,
    // Refined response curves (for updating the candidate)
    refinedCorrectionCurve: refinementImproved ? bestFine.correctionCurve : null,
    refinedFinalPostEqCurve: refinementImproved ? bestFine.finalPostEqCurve : null,
    refinedOperatingPreEqCurve: refinementImproved ? bestFine.operatingPreEqCurve : null,
    refinedAchievedPreEqCurve: refinementImproved ? bestFine.achievedPreEqCurve : null,
    refinedUnconstrainedPostEqCurve: refinementImproved ? bestFine.unconstrainedPostEqCurve : null,
    refinedPerSeatPostEqCurves: refinementImproved ? bestFine.perSeatPostEqCurves : null,
    refinedProductOperatingEnvelope: refinementImproved ? bestFine.productOperatingEnvelope : null,
    // Full evaluations for diagnostics
    pass1Evaluation,
    refinedEvaluation: refinementImproved ? bestFine : null,
  };
}