// correctionCounterfactualAuthority.js
//
// Counterfactual examination of a post-EQ residual.
//
// PURPOSE
//   A residual is only justified when the completed calculation can name AND
//   prove the mechanism that limited the correction. This module performs that
//   proof: it asks the official RP22 P19 authority what would happen if the
//   residual were closed, and reports the answer with the numbers behind it.
//
// WHAT IT DOES NOT DO
//   It never changes the production correction, the EQ, the smoothing kernel,
//   the limits, the target, the grading or the assessment band. It builds a
//   counterfactual, scores that counterfactual with the SAME authorities the
//   published result uses, and reports the comparison. Nothing here feeds back
//   into the live correction envelope.
//
// AUTHORITIES REUSED (never re-implemented)
//   P19                      evaluateP19AbsoluteTargetDeviation (canonical)
//                            max|smoothed(1/3-octave) − H(f)| over the band
//   envelope smoothing       smoothPredictedCorrectionEnvelope — the SAME kernel
//                            the production correction uses, so the
//                            counterfactual has realistic bandwidth and is
//                            never a single-bin spike
//   boost limit              MAX_BOOST_DB / MAX_CUT_DB from the correction model
//   protected nulls          isProtectedFrequency — the fitter's own authority
//   capability               capabilityLimitedRegions from the authority
//
// COUNTERFACTUAL RESPONSE RELATION
//   A post-EQ response moves by exactly the change in the applied correction:
//       counterfactualPostEq(f) = finalPostEq(f) + (cfApplied(f) - applied(f))
//   clamped to the delivered-output ceiling (maximumSplCurveAfterEq). This is a
//   derivation of already-computed curves, not a re-simulation.
//
// TWO INDEPENDENT COMPARISONS (kept separate, never merged)
//   A. smoothing   — same global trim; replace only the locally reduced smoothed
//                    correction with the permitted pre-smoothing correction.
//   B. global trim — keep the current correction envelope; test the nearest
//                    permitted whole-band trims and report whether the selected
//                    trim is genuinely the minimum-error one.

import {
  MAX_BOOST_DB,
  smoothPredictedCorrectionEnvelope,
} from "@/components/utils/realisticPostCalibrationPrediction";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import { evaluateP19AbsoluteTargetDeviation } from "@/components/utils/p19AbsoluteTargetDeviation";

// A change smaller than this is not a meaningful P19 movement.
export const P19_MATERIALITY_DB = 0.1;

// The nearest permitted global-trim steps tested in comparison B.
export const GLOBAL_TRIM_STEPS_DB = [0, 0.25, 0.5, 0.75, 1];

export const COUNTERFACTUAL_OUTCOMES = {
  JUSTIFIED: "residual_justified",
  UNDER_CORRECTING: "under_correction",
  NOT_APPLICABLE: "not_applicable",
};

const round2 = (value) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : null);

function prepareSampler(curve) {
  const points = (Array.isArray(curve) ? curve : [])
    .map((point) => ({ frequency: Number(point?.frequency), spl: Number(point?.spl) }))
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.spl) && point.frequency > 0)
    .sort((left, right) => left.frequency - right.frequency);
  if (!points.length) return null;
  return (frequency) => {
    if (!Number.isFinite(frequency) || frequency <= 0) return null;
    if (frequency < points[0].frequency || frequency > points[points.length - 1].frequency) return null;
    let low = 0;
    let high = points.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (points[mid].frequency <= frequency) low = mid;
      else high = mid;
    }
    const a = points[low];
    const b = points[high];
    if (a.frequency === b.frequency) return a.spl;
    const ratio = Math.log(frequency / a.frequency) / Math.log(b.frequency / a.frequency);
    return a.spl + (b.spl - a.spl) * ratio;
  };
}

function regionCovers(regions, frequency) {
  return (Array.isArray(regions) ? regions : []).some((region) => {
    const start = Number(region?.startHz);
    const end = Number(region?.endHz);
    return Number.isFinite(start) && Number.isFinite(end)
      && frequency >= start && frequency <= end;
  });
}

function nearestGridFrequency(grid, requested) {
  if (!Array.isArray(grid) || !grid.length || !Number.isFinite(requested)) return null;
  let nearest = grid[0];
  let distance = Math.abs(nearest - requested);
  for (const frequency of grid) {
    const candidate = Math.abs(frequency - requested);
    if (candidate < distance) {
      nearest = frequency;
      distance = candidate;
    }
  }
  return nearest;
}

/** Official P19 through the canonical authority. */
function scoreP19(postEqCurve, { canonicalTargetCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions }) {
  const result = evaluateP19AbsoluteTargetDeviation({
    rspPostEqCurve: postEqCurve,
    canonicalTargetCurve,
    assessmentStartHz,
    assessmentEndHz,
    protectedNullRegions,
  });
  if (!result) return null;
  return {
    maxAbsDeviationDb: round2(result.maxAbsDeviationDb),
    worstFrequencyHz: Number.isFinite(result.worstFrequencyHz)
      ? round2(result.worstFrequencyHz) : null,
    level: result.level ?? null,
  };
}

/**
 * Apply a per-frequency correction change to the final response, clamped to the
 * delivered-output ceiling. Returns null when the response cannot be rebuilt.
 */
function projectResponse(postEqRspCurve, appliedSampler, changeSampler, ceilingSampler) {
  return (Array.isArray(postEqRspCurve) ? postEqRspCurve : [])
    .map((point) => {
      const frequency = Number(point?.frequency);
      const finalSpl = Number(point?.spl);
      if (!Number.isFinite(frequency) || !Number.isFinite(finalSpl)) return null;
      const delta = Number(changeSampler(frequency)) || 0;
      const applied = Number(appliedSampler(frequency));
      const baseline = Number.isFinite(applied) ? applied : 0;
      let spl = finalSpl + (delta - baseline);
      const ceiling = ceilingSampler ? Number(ceilingSampler(frequency)) : NaN;
      if (Number.isFinite(ceiling)) spl = Math.min(spl, ceiling);
      return { ...point, spl };
    })
    .filter(Boolean);
}

/**
 * Build the counterfactual correction envelope: bring the deficiency region onto
 * target using the SAME physically realistic bandwidth the production correction
 * uses. Never a single-bin spike, never a protected-null boost.
 *
 * @returns {object} { allowed, rejectionReason, counterfactualEnvelope, addedAtTargetDb }
 */
function buildCounterfactualEnvelope({
  rawCorrectionCurve,
  targetCurve,
  finalRspCurve,
  protectedNullRegions,
  capabilityLimitedRegions,
  maximumOutputCurve,
  availableBoostHeadroomDb,
  inspectionFrequency,
  sourceBoostLimited,
}) {
  const appliedSampler = prepareSampler(rawCorrectionCurve);
  const targetSampler = prepareSampler(targetCurve);
  const rspSampler = prepareSampler(finalRspCurve);
  const ceilingSampler = prepareSampler(maximumOutputCurve);

  const rejection = (reason) => ({
    allowed: false,
    rejectionReason: reason,
    counterfactualEnvelope: null,
    addedAtTargetDb: null,
  });

  if (!appliedSampler) {
    return rejection("pre_smoothing_correction_unavailable");
  }
  if (!targetSampler || !rspSampler) {
    return rejection("target_or_response_unavailable");
  }

  const targetDb = targetSampler(inspectionFrequency);
  const responseDb = rspSampler(inspectionFrequency);
  if (!Number.isFinite(targetDb) || !Number.isFinite(responseDb)) {
    return rejection("inspection_frequency_outside_curve_domain");
  }

  const deficitDb = targetDb - responseDb;
  if (deficitDb <= 0) {
    return rejection("no_positive_deficit_at_inspection_frequency");
  }

  if (isProtectedFrequency(inspectionFrequency, protectedNullRegions)) {
    return rejection("protected_null_active");
  }
  if (regionCovers(capabilityLimitedRegions, inspectionFrequency)) {
    return rejection("output_capability_active");
  }

  const permittedCeiling = availableBoostHeadroomDb === null
    ? MAX_BOOST_DB
    : Math.max(0, Math.min(MAX_BOOST_DB, availableBoostHeadroomDb));
  const currentValue = appliedSampler(inspectionFrequency);
  const permittedValue = Math.min(
    MAX_BOOST_DB,
    Number.isFinite(currentValue) ? currentValue + deficitDb : deficitDb,
  );
  const added = Math.min(deficitDb, Math.max(0, Math.min(permittedCeiling, deficitDb)));
  if (added <= 0) {
    return rejection("no_permitted_boost_headroom_at_inspection_frequency");
  }

  // Raise the pre-smoothing envelope at the inspection frequency, then run the
  // production kernel over it so the counterfactual carries real bandwidth.
  const raised = (Array.isArray(rawCorrectionCurve) ? rawCorrectionCurve : [])
    .map((point) => {
      const frequency = Number(point?.frequency);
      const spl = Number(point?.spl);
      if (!Number.isFinite(frequency) || !Number.isFinite(spl)) return null;
      const inNull = isProtectedFrequency(frequency, protectedNullRegions);
      const boosted = inNull ? spl : Math.min(spl + (Math.abs(frequency - inspectionFrequency) < 1e-9 ? added : 0), MAX_BOOST_DB);
      return { frequency, spl: boosted };
    })
    .filter(Boolean);
  if (!raised.length) return rejection("pre_smoothing_envelope_invalid");

  const counterfactualEnvelope = smoothPredictedCorrectionEnvelope(raised, protectedNullRegions);
  if (!Array.isArray(counterfactualEnvelope) || !counterfactualEnvelope.length) {
    return rejection("counterfactual_envelope_unavailable");
  }

  // Safety: the counterfactual must not exceed the delivered-output ceiling.
  if (ceilingSampler) {
    const finalAtTarget = rspSampler(inspectionFrequency);
    const ceilingAtTarget = ceilingSampler(inspectionFrequency);
    if (Number.isFinite(finalAtTarget) && Number.isFinite(ceilingAtTarget)
      && finalAtTarget + added > ceilingAtTarget) {
      return rejection("delivered_output_ceiling_would_be_exceeded");
    }
  }

  return {
    allowed: true,
    rejectionReason: null,
    counterfactualEnvelope,
    addedAtTargetDb: round2(added),
    sourceBoostLimited: sourceBoostLimited === true,
    permittedValueAtTargetDb: round2(permittedValue),
  };
}

/**
 * Pick the inspection frequency for the counterfactual: the worst BELOW-TARGET
 * residual among the given frequencies, resolved onto the real engine grid.
 * Returns null when nothing is below target — there is no unjustified shortfall
 * to examine.
 */
export function selectInspectionFrequencyForCounterfactual({
  postEqRspCurve,
  canonicalTargetCurve,
  frequencies,
} = {}) {
  const rspSampler = prepareSampler(postEqRspCurve);
  const targetSampler = prepareSampler(canonicalTargetCurve);
  if (!rspSampler || !targetSampler || !Array.isArray(frequencies) || !frequencies.length) return null;
  const grid = (Array.isArray(postEqRspCurve) ? postEqRspCurve : [])
    .map((point) => Number(point?.frequency))
    .filter((frequency) => Number.isFinite(frequency) && frequency > 0);
  if (!grid.length) return null;

  let worst = null;
  for (const requested of frequencies) {
    const gridFrequency = nearestGridFrequency(grid, Number(requested));
    if (gridFrequency === null) continue;
    const targetDb = targetSampler(gridFrequency);
    const responseDb = rspSampler(gridFrequency);
    if (!Number.isFinite(targetDb) || !Number.isFinite(responseDb)) continue;
    const deficitDb = targetDb - responseDb;
    if (deficitDb <= P19_MATERIALITY_DB) continue;
    if (!worst || deficitDb > worst.deficitDb) worst = { deficitDb, gridFrequency };
  }
  return worst ? worst.gridFrequency : null;
}

/**
 * Run the complete counterfactual examination for one inspection frequency.
 *
 * @param {object} params
 * @param {number} params.inspectionFrequencyHz        the frequency under question (e.g. 23.8)
 * @param {Array}  params.postEqRspCurve               final post-alignment RSP response
 * @param {Array}  params.canonicalTargetCurve         the house target H(f)
 * @param {Array}  params.correctionCurve              applied (post-smoothing) correction envelope
 * @param {Array}  [params.rawCorrectionCurve]         real pre-smoothing envelope (if available)
 * @param {Array}  [params.maximumOutputCurve]         maximumSplCurveAfterEq
 * @param {number} [params.globalTrimDb]               predictor global trim (headroom authority)
 * @param {number} [params.assessmentStartHz]
 * @param {number} [params.assessmentEndHz]
 * @param {Array}  [params.protectedNullRegions]
 * @param {Array}  [params.capabilityLimitedRegions]
 * @param {number} [params.officialP19WorstFrequencyHz]
 * @returns {object|null} persisted counterfactual evidence
 */
export function buildCorrectionCounterfactual({
  inspectionFrequencyHz,
  postEqRspCurve,
  canonicalTargetCurve,
  correctionCurve,
  rawCorrectionCurve = null,
  maximumOutputCurve = null,
  globalTrimDb = null,
  assessmentStartHz = null,
  assessmentEndHz = null,
  protectedNullRegions = [],
  capabilityLimitedRegions = [],
  officialP19WorstFrequencyHz = null,
} = {}) {
  if (!Number.isFinite(Number(inspectionFrequencyHz))
    || !Number.isFinite(Number(assessmentStartHz))
    || !Number.isFinite(Number(assessmentEndHz))) {
    return null;
  }

  const inspectionFrequency = Number(inspectionFrequencyHz);
  const grid = (Array.isArray(postEqRspCurve) ? postEqRspCurve : [])
    .map((point) => Number(point?.frequency))
    .filter((frequency) => Number.isFinite(frequency) && frequency > 0);
  const gridFrequency = nearestGridFrequency(grid, inspectionFrequency);
  if (gridFrequency === null) return null;

  const p19Context = {
    canonicalTargetCurve,
    assessmentStartHz: Number(assessmentStartHz),
    assessmentEndHz: Number(assessmentEndHz),
    protectedNullRegions,
  };

  // ── Original: the published final response, scored by the same authority ──
  const original = scoreP19(postEqRspCurve, p19Context);
  if (!original) return null;

  const appliedSampler = prepareSampler(correctionCurve);
  const ceilingSampler = prepareSampler(maximumOutputCurve);
  if (!appliedSampler) return null;

  const trim = Number.isFinite(Number(globalTrimDb)) ? Number(globalTrimDb) : null;
  const availableBoostHeadroomDb = trim === null ? null : Math.max(0, -trim);

  const base = {
    schemaVersion: 1,
    inspectionFrequencyHz: inspectionFrequency,
    gridFrequencyHz: round2(gridFrequency),
    originalP19Db: original.maxAbsDeviationDb,
    originalP19Level: original.level,
    originalP19WorstFrequencyHz: original.worstFrequencyHz,
    assessmentStartHz: Number(assessmentStartHz),
    assessmentEndHz: Number(assessmentEndHz),
    officialP19WorstFrequencyHz: Number.isFinite(Number(officialP19WorstFrequencyHz))
      ? Number(officialP19WorstFrequencyHz) : null,
    availableBoostHeadroomDb: availableBoostHeadroomDb === null ? null : round2(availableBoostHeadroomDb),
  };

  // ── Step 4: closing the residual ──
  const envelope = buildCounterfactualEnvelope({
    rawCorrectionCurve,
    targetCurve: canonicalTargetCurve,
    finalRspCurve: postEqRspCurve,
    protectedNullRegions,
    capabilityLimitedRegions,
    maximumOutputCurve,
    availableBoostHeadroomDb,
    inspectionFrequency: gridFrequency,
  });

  let counterfactual = null;
  if (envelope.allowed) {
    const cfApplySampler = prepareSampler(envelope.counterfactualEnvelope);
    if (cfApplySampler) {
      const cfResponse = projectResponse(postEqRspCurve, appliedSampler, cfApplySampler, ceilingSampler);
      const scored = scoreP19(cfResponse, p19Context);
      if (scored) {
        const delta = round2(scored.maxAbsDeviationDb - original.maxAbsDeviationDb);
        counterfactual = {
          counterfactualCorrectionDb: envelope.addedAtTargetDb,
          counterfactualP19Db: scored.maxAbsDeviationDb,
          counterfactualP19Level: scored.level,
          counterfactualP19WorstFrequencyHz: scored.worstFrequencyHz,
          p19DeltaDb: delta,
          counterfactualAllowed: true,
          counterfactualRejectionReason: null,
          worsensP19: delta > P19_MATERIALITY_DB,
          materialityDb: P19_MATERIALITY_DB,
        };
      }
    }
  }
  if (!counterfactual) {
    counterfactual = {
      counterfactualCorrectionDb: envelope.addedAtTargetDb,
      counterfactualP19Db: null,
      counterfactualP19Level: null,
      counterfactualP19WorstFrequencyHz: null,
      p19DeltaDb: null,
      counterfactualAllowed: false,
      counterfactualRejectionReason: envelope.rejectionReason || "counterfactual_scoring_unavailable",
      worsensP19: null,
      materialityDb: P19_MATERIALITY_DB,
    };
  }

  // ── Step 5A: smoothing-only counterfactual ──
  // Same global trim; swap only the locally reduced smoothed value for the
  // permitted pre-smoothing value, then re-score.
  let smoothing = { available: false, rejectionReason: "pre_smoothing_correction_unavailable" };
  const rawSampler = prepareSampler(rawCorrectionCurve);
  if (rawSampler) {
    const raised = (Array.isArray(rawCorrectionCurve) ? rawCorrectionCurve : [])
      .map((point) => {
        const frequency = Number(point?.frequency);
        const spl = Number(point?.spl);
        if (!Number.isFinite(frequency) || !Number.isFinite(spl)) return null;
        return { frequency, spl };
      })
      .filter(Boolean);
    if (raised.length) {
      const cfApplySampler = prepareSampler(raised);
      const cfResponse = projectResponse(postEqRspCurve, appliedSampler, cfApplySampler, ceilingSampler);
      const scored = scoreP19(cfResponse, p19Context);
      if (scored) {
        const delta = round2(scored.maxAbsDeviationDb - original.maxAbsDeviationDb);
        smoothing = {
          available: true,
          rejectionReason: null,
          p19Db: scored.maxAbsDeviationDb,
          p19Level: scored.level,
          p19WorstFrequencyHz: scored.worstFrequencyHz,
          p19DeltaDb: delta,
          worsensP19: delta > P19_MATERIALITY_DB,
          improvesP19: delta < -P19_MATERIALITY_DB,
        };
      }
    }
  }

  // ── Step 5B: global-alignment counterfactual ──
  // Keep the current correction envelope and shift the whole band by each
  // permitted trim step, then re-score. Reports whether the selected trim is
  // genuinely the minimum-error one.
  const steps = [];
  for (const step of GLOBAL_TRIM_STEPS_DB) {
    if (step === 0) {
      steps.push({
        trimDb: 0,
        permitted: true,
        p19Db: original.maxAbsDeviationDb,
        p19WorstFrequencyHz: original.worstFrequencyHz,
        p19DeltaDb: 0,
      });
      continue;
    }
    // A whole-band raise needs headroom across the ENTIRE band.
    const permitted = availableBoostHeadroomDb === null ? false : availableBoostHeadroomDb >= step;
    if (!permitted) {
      steps.push({ trimDb: step, permitted: false, p19Db: null, p19WorstFrequencyHz: null, p19DeltaDb: null });
      continue;
    }
    const shifted = (Array.isArray(postEqRspCurve) ? postEqRspCurve : [])
      .map((point) => {
        const frequency = Number(point?.frequency);
        const spl = Number(point?.spl);
        if (!Number.isFinite(frequency) || !Number.isFinite(spl)) return null;
        let raised = spl + step;
        const ceiling = ceilingSampler ? Number(ceilingSampler(frequency)) : NaN;
        if (Number.isFinite(ceiling)) raised = Math.min(raised, ceiling);
        return { ...point, spl: raised };
      })
      .filter(Boolean);
    const scored = scoreP19(shifted, p19Context);
    steps.push({
      trimDb: step,
      permitted: true,
      p19Db: scored ? scored.maxAbsDeviationDb : null,
      p19WorstFrequencyHz: scored ? scored.worstFrequencyHz : null,
      p19DeltaDb: scored ? round2(scored.maxAbsDeviationDb - original.maxAbsDeviationDb) : null,
    });
  }
  const scoredSteps = steps.filter((step) => step.permitted && Number.isFinite(step.p19Db));
  const best = scoredSteps.length
    ? scoredSteps.reduce((left, right) => (right.p19Db < left.p19Db ? right : left))
    : null;
  const globalTrim = {
    available: scoredSteps.length > 0,
    currentTrimDb: 0,
    currentIsOptimal: best ? Math.abs(Number(best.p19Db) - Number(original.maxAbsDeviationDb)) < P19_MATERIALITY_DB : null,
    bestTrimDb: best ? best.trimDb : null,
    bestP19Db: best ? best.p19Db : null,
    bestP19WorstFrequencyHz: best ? best.p19WorstFrequencyHz : null,
    improvementVsCurrentDb: best ? round2(original.maxAbsDeviationDb - best.p19Db) : null,
    steps,
    rejectedSteps: steps.filter((step) => step.permitted === false).map((step) => step.trimDb),
  };

  // ── Outcome ──
  const closesResidual = counterfactual.counterfactualAllowed === true;
  let outcome = COUNTERFACTUAL_OUTCOMES.NOT_APPLICABLE;
  if (closesResidual) {
    outcome = counterfactual.worsensP19 === true
      ? COUNTERFACTUAL_OUTCOMES.JUSTIFIED
      : COUNTERFACTUAL_OUTCOMES.UNDER_CORRECTING;
  }

  return {
    ...base,
    ...counterfactual,
    smoothing,
    globalTrim,
    outcome,
    materialityDb: P19_MATERIALITY_DB,
  };
}

/**
 * The one sentence Expert Detail shows for a residual that a proven mechanism
 * justifies. Returns null when the evidence cannot name a mechanism — the UI
 * then shows nothing rather than inventing an explanation.
 */
export function formatResidualMechanismSentence({ counterfactual, residualDb = null } = {}) {
  if (!counterfactual || counterfactual.counterfactualP19Db === null) return null;
  // Only a counterfactual that PROVES correction would worsen P19 justifies the
  // residual. Otherwise no sentence is produced — the UI shows nothing rather
  // than an unproven explanation.
  if (counterfactual.worsensP19 !== true) return null;
  const rawFrequency = Number(
    Number.isFinite(Number(counterfactual.gridFrequencyHz))
      ? counterfactual.gridFrequencyHz
      : counterfactual.inspectionFrequencyHz,
  );
  const worst = Number(counterfactual.counterfactualP19WorstFrequencyHz);
  if (!Number.isFinite(rawFrequency) || !Number.isFinite(worst)) return null;
  const frequency = Number.isInteger(rawFrequency) ? String(rawFrequency) : rawFrequency.toFixed(1);
  const residual = Number.isFinite(Number(residualDb))
    ? Math.abs(Number(residualDb)).toFixed(1)
    : null;
  const lead = residual === null
    ? `${frequency} Hz remains below target`
    : `${frequency} Hz remains ${residual} dB below target`;
  return `${lead} because additional correction would increase the official P19 maximum error `
    + `from ${counterfactual.originalP19Db} dB to ${counterfactual.counterfactualP19Db} dB at ${Math.round(worst)} Hz.`;
}