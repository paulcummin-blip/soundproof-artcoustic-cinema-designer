// p19BoundedRefinement.js
// ------------------------
// Bounded post-calibration P19 refinement.
//
// The existing deterministic predictor (predictRealisticPostCalibrationCorrection)
// performs ONE global normalisation (globalTrimDb = median of target − smoothed
// maximum over the P19 band) followed by pointwise correction/capability clamping.
//
// This module performs a CHEAP bounded search over a neighbourhood of
// globalTrimDb values around the Pass-1 result. For each candidate it re-runs
// the SAME existing correction logic (via predictRealisticPostCalibrationCorrection
// with globalTrimDbOverride), rebuilds the post-EQ curve, and evaluates the
// FINAL official P19 over the RECALCULATED assessment band (based on the
// candidate's own P18).
//
// Hard constraints (all enforced by reusing the existing correction engine):
//   - P14 output preserved (P14 is from maximumSplCurveAfterEq, independent of globalTrimDb)
//   - +6 dB maximum boost
//   - -15 dB maximum cut
//   - Protected-null rules
//   - Product/source capability guard
//
// Additional refinement-level constraints:
//   - P18 achieved level not worse than Pass-1
//   - P18 achieved extension Hz not materially worse than Pass-1
//   - Primary-seat safety preserved (no prohibited primary-seat P19 regression)
//
// This is NOT another acoustic simulation. It operates on already-calculated
// response/calibration data.

import { predictRealisticPostCalibrationCorrection } from "@/components/utils/realisticPostCalibrationPrediction";
import { assessP18AgainstRequiredExtension } from "@/components/utils/bassDesignPhilosophyAuthority";
import { computeOfficialP19Assessment, computeOfficialPerSeatP19Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { resolveBassAssessmentBand } from "@/components/utils/bassAssessmentBandAuthority";
import { houseCurveP19Level } from "@/components/utils/houseCurveFitterCore";

const finite = (v) => v !== null && v !== "" && Number.isFinite(Number(v));

// ── Post-EQ curve building (mirrors buildCanonicalCandidate logic) ──
// These are the SAME cap functions used in canonicalBassOptimiser.js, extracted
// here so the refinement can rebuild the post-EQ curve for each candidate
// without touching the acoustic simulator.

function interpolateCorrection(curve, frequency) {
  if (!Array.isArray(curve) || !curve.length) return 0;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve.at(-1).frequency) return curve.at(-1).spl;
  const upperIndex = curve.findIndex((point) => point.frequency >= frequency);
  const low = curve[upperIndex - 1];
  const high = curve[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}

function capCurveToEnvelope(requestedCurve, maximumCurve) {
  if (!Array.isArray(maximumCurve) || !maximumCurve.length) {
    return (Array.isArray(requestedCurve) ? requestedCurve : []).map((p) => ({ ...p }));
  }
  return (Array.isArray(requestedCurve) ? requestedCurve : []).map((point) => {
    const maximumSpl = interpolateCorrection(maximumCurve, point.frequency);
    const requestedSpl = Number(point?.spl);
    if (!Number.isFinite(requestedSpl) || !Number.isFinite(maximumSpl)) return { ...point };
    return {
      ...point,
      spl: Math.min(requestedSpl, maximumSpl),
      capabilityLimited: requestedSpl > maximumSpl + 0.05,
    };
  });
}

function capCurveToProductOperatingEnvelope(requestedCurve, productEnvelope) {
  if (!Array.isArray(productEnvelope) || !productEnvelope.length) {
    return (Array.isArray(requestedCurve) ? requestedCurve : []).map((p) => ({ ...p }));
  }
  const extensionBandEndHz = Number(productEnvelope.find((p) => finite(p?.extensionBandEndHz))?.extensionBandEndHz);
  return (Array.isArray(requestedCurve) ? requestedCurve : []).map((point) => {
    if (!finite(point?.frequency) || !finite(extensionBandEndHz) || point.frequency > extensionBandEndHz) return { ...point };
    const productLimitSpl = interpolateCorrection(productEnvelope, point.frequency);
    if (!finite(productLimitSpl) || !finite(point?.spl)) return { ...point };
    return { ...point, spl: Math.min(point.spl, productLimitSpl) };
  });
}

function applyBankToSeats(seats, correction) {
  return (Array.isArray(seats) ? seats : []).filter((s) => s?.seatId !== "rsp" && Array.isArray(s?.responseData))
    .map((seat) => ({
      seatId: seat.seatId,
      isPrimary: !!seat.isPrimary,
      responseData: seat.responseData.map((point) => ({
        frequency: point.frequency,
        spl: point.spl + interpolateCorrection(correction, point.frequency),
      })),
    }));
}

// ── Candidate evaluation ──

function evaluateCandidate({
  candidateGlobalTrimDb,
  maximumSplCurveBeforeEq,
  predictorTargetCurve,
  p18TargetCurve,
  protectedNullRegions,
  activeSubs,
  usableLfHz,
  selectedOperatingOutputDb,
  productOperatingEnvelopeCurve,
  perSeatMaximumSplCurves,
  selectedP14TargetDb,
  requiredExtensionHz,
  p18CutoffDb,
  configuredUsableLfHz,
  productCurveMinHz,
  transitionHz,
  pass1P18ExtensionHz,
  pass1P18Level,
}) {
  // 1. Re-run the SAME correction logic with the candidate globalTrimDb
  const realisticResult = predictRealisticPostCalibrationCorrection({
    maximumCapabilityCurve: maximumSplCurveBeforeEq,
    targetCurve: predictorTargetCurve,
    assessmentStartHz: 20,
    assessmentEndHz: transitionHz,
    protectedNullRegions,
    activeSubs,
    usableLfHz,
    requestedSystemOutputDb: selectedOperatingOutputDb,
    globalTrimDbOverride: candidateGlobalTrimDb,
  });
  const correctionCurve = realisticResult.correctionCurve;
  const globalTrimDb = realisticResult.globalTrimDb;

  // 2. Build the post-EQ curve (same cap logic as buildCanonicalCandidate)
  const operatingPreEqCurve = maximumSplCurveBeforeEq.map((point) => ({
    frequency: point.frequency,
    spl: finite(point.spl) ? point.spl + globalTrimDb : point.spl,
  }));
  const unconstrainedPostEqCurve = operatingPreEqCurve.map((point) => ({
    frequency: point.frequency,
    spl: point.spl + interpolateCorrection(correctionCurve, point.frequency),
  }));
  const maximumClampedPostEqCurve = capCurveToEnvelope(unconstrainedPostEqCurve, maximumSplCurveBeforeEq);
  const finalPostEqCurve = capCurveToProductOperatingEnvelope(maximumClampedPostEqCurve, productOperatingEnvelopeCurve);

  // 3. Build per-seat post-EQ curves (same logic as buildCanonicalCandidate)
  const perSeatPostEqCurves = applyBankToSeats(perSeatMaximumSplCurves, correctionCurve)
    .map((seat) => ({
      ...seat,
      responseData: seat.responseData.map((point) => ({
        ...point,
        spl: finite(point.spl) ? point.spl + globalTrimDb : point.spl,
      })),
    }))
    .map((seat) => {
      const maxSpl = perSeatMaximumSplCurves.find((s) => s?.seatId === seat.seatId);
      const capabilityClamped = maxSpl
        ? capCurveToEnvelope(seat.responseData, maxSpl.responseData)
        : seat.responseData;
      return {
        ...seat,
        responseData: capCurveToProductOperatingEnvelope(capabilityClamped, productOperatingEnvelopeCurve),
      };
    });

  // 4. Evaluate P18 from the post-EQ curve
  const p18Assessment = assessP18AgainstRequiredExtension({
    rspPostEqCurve: finalPostEqCurve,
    canonicalTargetCurve: p18TargetCurve,
    perSeatPostEqCurves,
    selectedP14TargetDb,
    requiredExtensionHz,
    p18CutoffDb,
    configuredUsableLfHz,
    productCurveMinHz,
  });
  const achievedP18Hz = p18Assessment?.achievedExtensionHz ?? null;
  const achievedP18Level = p18Assessment?.level ?? 0;

  // 5. Resolve the RECALCULATED assessment band
  const assessmentBand = resolveBassAssessmentBand({
    p14Pass: true, // P14 is preserved (independent of globalTrimDb)
    achievedP18Hz,
    transitionHz,
  });

  // 6. Evaluate P19 over the recalculated band
  let p19Db = null;
  let p19Level = null;
  let p19WorstFrequencyHz = null;
  if (assessmentBand.valid) {
    const p19 = computeOfficialP19Assessment({
      rspPostEqCurve: finalPostEqCurve,
      canonicalTargetCurve: predictorTargetCurve,
      assessmentStartHz: assessmentBand.lowerHz,
      assessmentEndHz: assessmentBand.upperHz,
    });
    p19Db = p19?.variationDbRaw ?? null;
    p19Level = houseCurveP19Level(p19Db);
    p19WorstFrequencyHz = p19?.worstFrequencyHz ?? null;
  }

  // 7. Evaluate per-seat P19 (for primary-seat safety)
  let primarySeatP19Db = null;
  if (assessmentBand.valid && perSeatPostEqCurves.length > 0) {
    const perSeatP19 = computeOfficialPerSeatP19Assessment({
      perSeatPostEqCurves,
      canonicalTargetCurve: predictorTargetCurve,
      assessmentStartHz: assessmentBand.lowerHz,
      assessmentEndHz: assessmentBand.upperHz,
    });
    const primarySeat = perSeatP19.find((s) => s.isPrimary) || perSeatP19[0];
    primarySeatP19Db = primarySeat?.variationDbRaw ?? null;
  }

  // 8. Check boost/cut limits
  const maxBoost = Math.max(0, ...correctionCurve.map((p) => Number(p.spl) || 0));
  const maxCut = Math.min(0, ...correctionCurve.map((p) => Number(p.spl) || 0));

  return {
    candidateGlobalTrimDb,
    correctionCurve,
    globalTrimDb,
    finalPostEqCurve,
    perSeatPostEqCurves,
    achievedP18Hz,
    achievedP18Level,
    p19Db,
    p19Level,
    p19WorstFrequencyHz,
    primarySeatP19Db,
    assessmentBand,
    maxBoostDb: maxBoost,
    maxCutDb: maxCut,
  };
}

// ── Constraint validation ──

const P18_EXTENSION_TOLERANCE_HZ = 1.0; // Materiality tolerance for P18 extension

function validateCandidate(candidate, pass1) {
  const violations = [];

  // P18 level not worse
  if (candidate.achievedP18Level < pass1.achievedP18Level) {
    violations.push("p18-level-worse");
  }

  // P18 extension not materially worse
  if (finite(pass1.achievedP18Hz) && finite(candidate.achievedP18Hz)) {
    if (candidate.achievedP18Hz > pass1.achievedP18Hz + P18_EXTENSION_TOLERANCE_HZ) {
      violations.push("p18-extension-worse");
    }
  }

  // Primary-seat safety: no prohibited regression
  if (finite(pass1.primarySeatP19Db) && finite(candidate.primarySeatP19Db)) {
    if (candidate.primarySeatP19Db > pass1.primarySeatP19Db + 0.5) {
      violations.push("primary-seat-regression");
    }
  }

  return { valid: violations.length === 0, violations };
}

// ── Main refinement function ──

export function refineP19GlobalNormalisation({
  maximumSplCurveBeforeEq,
  predictorTargetCurve,
  p18TargetCurve,
  protectedNullRegions = [],
  activeSubs = [],
  usableLfHz = null,
  selectedOperatingOutputDb = null,
  productOperatingEnvelopeCurve = [],
  perSeatMaximumSplCurves = [],
  selectedP14TargetDb = null,
  requiredExtensionHz = 20,
  p18CutoffDb = null,
  configuredUsableLfHz = null,
  productCurveMinHz = null,
  transitionHz = 120,
  pass1GlobalTrimDb = 0,
  pass1CorrectionCurve = [],
  pass1FinalPostEqCurve = [],
  pass1AchievedP18Hz = null,
  pass1AchievedP18Level = 0,
  pass1P19Db = null,
  pass1PrimarySeatP19Db = null,
}) {
  const nowMs = () => typeof performance !== "undefined" ? performance.now() : Date.now();
  const startedAt = nowMs();

  if (!Array.isArray(maximumSplCurveBeforeEq) || !maximumSplCurveBeforeEq.length) {
    return { refinementAttempted: false, reason: "no-maximum-capability-curve" };
  }

  // ── Evaluate Pass-1 for baseline ──
  const pass1Candidate = evaluateCandidate({
    candidateGlobalTrimDb: pass1GlobalTrimDb,
    maximumSplCurveBeforeEq,
    predictorTargetCurve,
    p18TargetCurve,
    protectedNullRegions,
    activeSubs,
    usableLfHz,
    selectedOperatingOutputDb,
    productOperatingEnvelopeCurve,
    perSeatMaximumSplCurves,
    selectedP14TargetDb,
    requiredExtensionHz,
    p18CutoffDb,
    configuredUsableLfHz,
    productCurveMinHz,
    transitionHz,
    pass1P18ExtensionHz: pass1AchievedP18Hz,
    pass1P18Level: pass1AchievedP18Level,
  });

  const pass1P19 = finite(pass1P19Db) ? pass1P19Db : pass1Candidate.p19Db;
  const pass1P18Hz = finite(pass1AchievedP18Hz) ? pass1AchievedP18Hz : pass1Candidate.achievedP18Hz;
  const pass1P18Lvl = pass1AchievedP18Level || pass1Candidate.achievedP18Level;
  const pass1PrimP19 = finite(pass1PrimarySeatP19Db) ? pass1PrimarySeatP19Db : pass1Candidate.primarySeatP19Db;

  // ── Derive bounded search range ──
  // The globalTrimDb is ≤ 0. Search a small neighbourhood around Pass-1.
  // Upper bound: 0 (can't be positive). Lower bound: pass1 - 6 dB (deliberately small).
  const searchUpper = 0;
  const searchLower = Math.max(-12, pass1GlobalTrimDb - 6);
  const coarseStep = 1.0; // 1 dB coarse steps

  // Coarse candidates
  const coarseCandidates = [];
  for (let trim = searchLower; trim <= searchUpper + 0.001; trim += coarseStep) {
    coarseCandidates.push(Math.round(trim * 1000) / 1000);
  }
  // Always include Pass-1
  if (!coarseCandidates.includes(Math.round(pass1GlobalTrimDb * 1000) / 1000)) {
    coarseCandidates.push(Math.round(pass1GlobalTrimDb * 1000) / 1000);
  }

  const coarseStart = nowMs();
  const coarseResults = [];
  for (const trim of coarseCandidates) {
    const candidate = evaluateCandidate({
      candidateGlobalTrimDb: trim,
      maximumSplCurveBeforeEq,
      predictorTargetCurve,
      p18TargetCurve,
      protectedNullRegions,
      activeSubs,
      usableLfHz,
      selectedOperatingOutputDb,
      productOperatingEnvelopeCurve,
      perSeatMaximumSplCurves,
      selectedP14TargetDb,
      requiredExtensionHz,
      p18CutoffDb,
      configuredUsableLfHz,
      productCurveMinHz,
      transitionHz,
      pass1P18ExtensionHz: pass1P18Hz,
      pass1P18Level: pass1P18Lvl,
    });
    const validation = validateCandidate(candidate, {
      achievedP18Level: pass1P18Lvl,
      achievedP18Hz: pass1P18Hz,
      primarySeatP19Db: pass1PrimP19,
    });
    coarseResults.push({ candidate, validation });
  }
  const coarseTimeMs = nowMs() - coarseStart;

  // Find best coarse candidate (lowest P19, subject to constraints)
  const validCoarse = coarseResults.filter((r) => r.validation.valid && finite(r.candidate.p19Db));
  let bestCoarse = null;
  if (validCoarse.length > 0) {
    bestCoarse = validCoarse.reduce((best, entry) => {
      if (!best || entry.candidate.p19Db < best.candidate.p19Db - 0.01) return entry;
      // Tie-breaking: prefer smaller departure from Pass-1
      if (best && Math.abs(entry.candidate.globalTrimDb - pass1GlobalTrimDb) < Math.abs(best.candidate.globalTrimDb - pass1GlobalTrimDb)) {
        return entry;
      }
      return best;
    }, null);
  }

  // ── Fine search around best coarse candidate ──
  const fineStart = nowMs();
  let bestFine = bestCoarse;
  if (bestCoarse) {
    const fineCentre = bestCoarse.candidate.globalTrimDb;
    const fineRange = 1.5; // ±1.5 dB
    const fineStep = 0.25; // 0.25 dB fine steps
    for (let trim = fineCentre - fineRange; trim <= fineCentre + fineRange + 0.001; trim += fineStep) {
      const rounded = Math.round(trim * 1000) / 1000;
      if (rounded > searchUpper + 0.001 || rounded < searchLower - 0.001) continue;
      if (rounded === Math.round(fineCentre * 1000) / 1000) continue; // Already evaluated
      const candidate = evaluateCandidate({
        candidateGlobalTrimDb: rounded,
        maximumSplCurveBeforeEq,
        predictorTargetCurve,
        p18TargetCurve,
        protectedNullRegions,
        activeSubs,
        usableLfHz,
        selectedOperatingOutputDb,
        productOperatingEnvelopeCurve,
        perSeatMaximumSplCurves,
        selectedP14TargetDb,
        requiredExtensionHz,
        p18CutoffDb,
        configuredUsableLfHz,
        productCurveMinHz,
        transitionHz,
        pass1P18ExtensionHz: pass1P18Hz,
        pass1P18Level: pass1P18Lvl,
      });
      const validation = validateCandidate(candidate, {
        achievedP18Level: pass1P18Lvl,
        achievedP18Hz: pass1P18Hz,
        primarySeatP19Db: pass1PrimP19,
      });
      if (validation.valid && finite(candidate.p19Db)) {
        if (!bestFine || candidate.p19Db < bestFine.candidate.p19Db - 0.05) {
          bestFine = { candidate, validation };
        }
      }
    }
  }
  const fineTimeMs = nowMs() - fineStart;

  const totalCandidates = coarseCandidates.length + (bestCoarse ? Math.ceil(3.0 / 0.25) : 0);
  const totalTimeMs = nowMs() - startedAt;

  // ── Select winner ──
  const pass1P19Value = finite(pass1P19) ? pass1P19 : pass1Candidate.p19Db;
  const refinedP19 = bestFine?.candidate?.p19Db ?? pass1P19Value;
  const improvementDb = finite(pass1P19Value) && finite(refinedP19) ? pass1P19Value - refinedP19 : 0;

  // Determine if refinement found a materially better result
  const MATERIALITY_THRESHOLD_DB = 0.1;
  const refinementImproved = bestFine && improvementDb > MATERIALITY_THRESHOLD_DB;

  // ── Binding constraint diagnostics ──
  let bindingConstraint = null;
  if (refinementImproved && bestFine) {
    const c = bestFine.candidate;
    if (c.maxBoostDb >= 5.95) bindingConstraint = "boost-limit";
    else if (c.maxCutDb <= -14.95) bindingConstraint = "cut-limit";
    else if (!c.assessmentBand?.valid) bindingConstraint = "assessment-band-invalid";
    else bindingConstraint = "current-model-capability-limit";
  } else if (!bestFine) {
    bindingConstraint = "no-valid-candidate-found";
  } else {
    bindingConstraint = "pass1-already-optimal";
  }

  return {
    refinementAttempted: true,
    refinementImproved,
    pass1P19Db: finite(pass1P19Value) ? Number(pass1P19Value) : null,
    refinedP19Db: finite(refinedP19) ? Number(refinedP19) : null,
    improvementDb: Number(improvementDb) || 0,
    pass1GlobalTrimDb: Number(pass1GlobalTrimDb),
    refinedGlobalTrimDb: refinementImproved ? Number(bestFine.candidate.globalTrimDb) : Number(pass1GlobalTrimDb),
    refinedCorrectionCurve: refinementImproved ? bestFine.candidate.correctionCurve : pass1CorrectionCurve,
    refinedFinalPostEqCurve: refinementImproved ? bestFine.candidate.finalPostEqCurve : pass1FinalPostEqCurve,
    refinedPerSeatPostEqCurves: refinementImproved ? bestFine.candidate.perSeatPostEqCurves : null,
    refinedP18Hz: refinementImproved ? bestFine.candidate.achievedP18Hz : pass1P18Hz,
    refinedP18Level: refinementImproved ? bestFine.candidate.achievedP18Level : pass1P18Lvl,
    selectedP14Db: finite(selectedP14TargetDb) ? Number(selectedP14TargetDb) : null,
    pass1P18Hz: finite(pass1P18Hz) ? Number(pass1P18Hz) : null,
    refinedAssessmentBand: refinementImproved ? bestFine.candidate.assessmentBand : pass1Candidate.assessmentBand,
    pass1AssessmentBand: pass1Candidate.assessmentBand,
    maxBoostDb: refinementImproved ? bestFine.candidate.maxBoostDb : pass1Candidate.maxBoostDb,
    maxCutDb: refinementImproved ? bestFine.candidate.maxCutDb : pass1Candidate.maxCutDb,
    bindingConstraint,
    candidatesTested: totalCandidates,
    coarseCandidatesTested: coarseCandidates.length,
    fineCandidatesTested: bestCoarse ? Math.ceil(3.0 / 0.25) : 0,
    coarseRefinementTimeMs: coarseTimeMs,
    fineRefinementTimeMs: fineTimeMs,
    totalAddedLatencyMs: totalTimeMs,
    primarySeatP19Db: refinementImproved ? bestFine.candidate.primarySeatP19Db : pass1PrimP19,
    pass1PrimarySeatP19Db: finite(pass1PrimP19) ? Number(pass1PrimP19) : null,
  };
}