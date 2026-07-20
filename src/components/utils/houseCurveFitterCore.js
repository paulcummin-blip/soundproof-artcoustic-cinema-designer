// houseCurveFitterCore.js — Single-start iterative house-curve optimisation loop.
// Generates trials for EVERY broad residual region across all real seats, enforces
// complete-bank limits on every trial (append, gain revision, Q revision, replacement,
// removal), and selects the best admissible improvement across all regions. Blocked
// residuals are recorded separately. The fitter never stops at a single uncorrectable
// null — it skips blocked regions and continues evaluating other regions.

import {
  evaluateProvisionalBankLimits, limitBoostForCapability,
  isNearDuplicate, countSameSignFiltersInRegion,
  buildCurveFromBank, findRegions, qForRegion,
} from "@/components/utils/designEqCalibration";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

const isNumber = (v) => Number.isFinite(Number(v));

// P19 level from max abs deviation: L4 <=2, L3 <=3, L2 <=4, L1 <=5, else FAIL (0).
export function houseCurveP19Level(deviationDb) {
  if (!isNumber(deviationDb)) return 0;
  if (deviationDb <= 2) return 4;
  if (deviationDb <= 3) return 3;
  if (deviationDb <= 4) return 2;
  if (deviationDb <= 5) return 1;
  return 0;
}

// Apply shared filter bank to a seat's raw response, smooth, and calculate per-seat
// house-curve deviation metrics in the assessment band.
function calculateSeatMetrics(seatRaw, filters, assessmentStartHz, assessmentEndHz, anchorDb) {
  const corrected = buildCurveFromBank(seatRaw, filters);
  const smoothed = applyBassSmoothing(corrected, "third");
  const assessedPoints = smoothed
    .filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
    .map((p) => ({
      frequency: p.frequency,
      spl: p.spl,
      targetDb: anchorDb + artcousticHouseCurveOffsetAt(p.frequency),
      deviationDb: p.spl - (anchorDb + artcousticHouseCurveOffsetAt(p.frequency)),
    }))
    .filter((p) => isNumber(p.deviationDb));
  if (!assessedPoints.length) return null;
  const maxAbsDev = Math.max(...assessedPoints.map((p) => Math.abs(p.deviationDb)));
  const rmsDev = Math.sqrt(assessedPoints.reduce((sum, p) => sum + p.deviationDb ** 2, 0) / assessedPoints.length);
  const worstPoint = assessedPoints.reduce((best, p) => Math.abs(p.deviationDb) > Math.abs(best.deviationDb) ? p : best);
  return { maxAbsDeviationDb: maxAbsDev, rmsDeviationDb: rmsDev, worstFrequencyHz: worstPoint.frequency };
}

// Calculate metrics across a set of seats for a given filter bank.
export function calculateAllSeatMetrics(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb) {
  const seatMetrics = [];
  for (const seat of seats) {
    const metrics = calculateSeatMetrics(seat.raw, filters, assessmentStartHz, assessmentEndHz, anchorDb);
    if (metrics) seatMetrics.push({ seatId: seat.seatId, isPrimary: seat.isPrimary, ...metrics });
  }
  if (!seatMetrics.length) return null;
  const worstSeat = seatMetrics.reduce((worst, m) => m.maxAbsDeviationDb > worst.maxAbsDeviationDb ? m : worst);
  const meanMaxDev = seatMetrics.reduce((sum, m) => sum + m.maxAbsDeviationDb, 0) / seatMetrics.length;
  const rmsTargetError = Math.sqrt(seatMetrics.reduce((sum, m) => sum + m.rmsDeviationDb ** 2, 0) / seatMetrics.length);
  return {
    seatMetrics,
    worstSeatId: worstSeat.seatId,
    worstSeatMaxDeviationDb: worstSeat.maxAbsDeviationDb,
    worstSeatP19Level: houseCurveP19Level(worstSeat.maxAbsDeviationDb),
    meanSeatMaxDeviationDb: meanMaxDev,
    rmsSeatTargetErrorDb: rmsTargetError,
  };
}

// Find ALL broad residual regions across all seats, sorted by severity (descending).
// Each region is seat-specific so trials can be generated per-seat while the shared
// bank is evaluated across all seats.
function findAllResidualRegions(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb, peakThresholdDb, valleyThresholdDb) {
  const allRegions = [];
  for (const seat of seats) {
    const corrected = buildCurveFromBank(seat.raw, filters);
    const smoothed = applyBassSmoothing(corrected, "third");
    const trendPoints = smoothed
      .filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
      .map((p) => ({ ...p, deviationDb: p.spl - (anchorDb + artcousticHouseCurveOffsetAt(p.frequency)) }));
    const regions = [
      ...findRegions(trendPoints, "peak", peakThresholdDb, valleyThresholdDb),
      ...findRegions(trendPoints, "valley", peakThresholdDb, valleyThresholdDb),
    ];
    for (const region of regions) allRegions.push({ ...region, seatId: seat.seatId });
  }
  allRegions.sort((a, b) => b.severityDb - a.severityDb);
  return allRegions;
}

// Build the proposed filter bank for a trial.
function buildProposedBank(trial, filters) {
  if (trial.action === "append") return [...filters, trial.filter];
  if (trial.action === "remove") return filters.filter((_, i) => i !== trial.removedFilterIndex);
  return filters.map((f, i) => i === trial.replacedFilterIndex ? trial.filter : f);
}

// Validate a proposed bank against complete-bank limits. If the bank fails and a
// single filter's gain can be scaled, binary-search the gain to find the largest
// admissible value. Returns { filters, limits, scaled } or { filters: null, limits, scaled }.
function validateAndScaleTrial(proposedFilters, scalableFilterIndex, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile) {
  const limits = evaluateProvisionalBankLimits(proposedFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  if (limits.allOk) return { filters: proposedFilters, limits, scaled: false };
  if (scalableFilterIndex === null || scalableFilterIndex < 0 || scalableFilterIndex >= proposedFilters.length)
    return { filters: null, limits, scaled: false };
  const scalable = proposedFilters[scalableFilterIndex];
  if (!scalable?.enabled || !Number.isFinite(scalable.gainDb) || Math.abs(scalable.gainDb) <= 0.1)
    return { filters: null, limits, scaled: false };
  const isBoost = scalable.gainDb > 0;
  let lo = 0;
  let hi = Math.abs(scalable.gainDb);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const scaledGain = isBoost ? mid : -mid;
    const scaledFilters = proposedFilters.map((f, i) => i === scalableFilterIndex ? { ...f, gainDb: scaledGain } : f);
    const scaledLimits = evaluateProvisionalBankLimits(scaledFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
    if (scaledLimits.allOk) lo = mid; else hi = mid;
  }
  const scaledGainDb = isBoost ? lo : -lo;
  if (Math.abs(scaledGainDb) <= 0.1) return { filters: null, limits, scaled: true };
  const scaledFilters = proposedFilters.map((f, i) => i === scalableFilterIndex ? { ...f, gainDb: scaledGainDb } : f);
  const finalLimits = evaluateProvisionalBankLimits(scaledFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  return { filters: finalLimits.allOk ? scaledFilters : null, limits: finalLimits, scaled: true };
}

// Generate trials for a single residual region. Returns { trials, productLimited }.
// Trial types: append, gain revision, Q revision, replacement, removal.
function generateTrialsForRegion(region, filters, profile, activeSubs, usableLfHz, requestedSystemOutputDb) {
  const trials = [];
  const isPeak = region.kind === "peak";
  const maximumCutDb = profile.maximumCutDb;
  const maximumAggregateBoostDb = profile.maximumAggregateBoostDb;
  const requestedGainDb = isPeak
    ? -Math.min(maximumCutDb, region.severityDb * 0.85)
    : Math.min(maximumAggregateBoostDb, region.severityDb * 0.75);
  const correctionSign = isPeak ? -1 : 1;
  const baseCandidate = limitBoostForCapability({
    band: filters.length + 1, enabled: true, type: "Peak",
    frequencyHz: region.centrePoint.frequency, gainDb: requestedGainDb,
    Q: qForRegion(region), startHz: region.startHz, endHz: region.endHz,
    reason: isPeak ? "Residual peak above house curve" : "Residual valley below house curve",
  }, activeSubs, usableLfHz, requestedSystemOutputDb);

  const productLimited = Math.abs(baseCandidate.gainDb) <= 0.1;
  const gainScales = [1, 0.75, 0.5];
  const qMultipliers = [1, 1.5, 2, 3];
  const seenVariants = new Set();

  // Append candidates (if < 10 filters and not product-limited)
  if (!productLimited && filters.length < 10) {
    for (const gainScale of gainScales) {
      for (const qMultiplier of qMultipliers) {
        const scaled = { ...baseCandidate, gainDb: baseCandidate.gainDb * gainScale, Q: Math.max(0.5, Math.min(10, baseCandidate.Q * qMultiplier)) };
        const candidate = scaled.gainDb > 0 ? limitBoostForCapability(scaled, activeSubs, usableLfHz, requestedSystemOutputDb) : scaled;
        const key = `${candidate.gainDb.toFixed(4)}:${candidate.Q.toFixed(4)}`;
        if (seenVariants.has(key) || Math.abs(candidate.gainDb) <= 0.1) continue;
        seenVariants.add(key);
        if (isNearDuplicate(candidate, filters)) continue;
        if (countSameSignFiltersInRegion(candidate, filters) >= 2) continue;
        trials.push({ action: "append", filter: candidate, scalableIndex: filters.length });
      }
    }
  }

  // Gain revision, Q revision, replacement, removal for existing filters near the region.
  for (let fi = 0; fi < filters.length; fi++) {
    const existing = filters[fi];
    if (!existing.enabled) continue;
    const freqRatio = Math.log2(Math.max(baseCandidate.frequencyHz, existing.frequencyHz) / Math.min(baseCandidate.frequencyHz, existing.frequencyHz));
    if (freqRatio > 1 / 12) continue;
    const existingSign = existing.gainDb > 0 ? 1 : -1;

    if (existingSign === correctionSign && !productLimited) {
      // Gain revision: adjust existing same-sign filter's gain toward the correction.
      for (const gainScale of gainScales) {
        const correctionDelta = baseCandidate.gainDb * gainScale;
        if (Math.abs(correctionDelta) <= 0.1) continue;
        const proposedGain = existing.gainDb + correctionDelta;
        const clampedGain = existing.gainDb > 0 ? Math.min(maximumAggregateBoostDb, proposedGain) : Math.max(-maximumCutDb, proposedGain);
        if (Math.abs(clampedGain - existing.gainDb) <= 0.1) continue;
        trials.push({ action: "revise", filter: { ...existing, gainDb: clampedGain }, replacedFilterIndex: fi, scalableIndex: fi });
      }
      // Q revision: widen/narrow existing same-sign filter to broaden the correction.
      for (const qMult of [0.5, 0.75, 1.5, 2, 3]) {
        const newQ = Math.max(0.5, Math.min(10, existing.Q * qMult));
        if (Math.abs(newQ - existing.Q) <= 0.1) continue;
        trials.push({ action: "reviseQ", filter: { ...existing, Q: newQ }, replacedFilterIndex: fi, scalableIndex: fi });
      }
    } else if (existingSign !== correctionSign) {
      // Replacement: replace opposite-sign filter with a correct-sign one (if not product-limited).
      if (!productLimited) {
        trials.push({ action: "replace", filter: { ...baseCandidate, band: existing.band }, replacedFilterIndex: fi, scalableIndex: fi });
      }
      // Removal: remove the counterproductive opposite-sign filter.
      trials.push({ action: "remove", removedFilterIndex: fi, scalableIndex: null });
    }
  }

  return { trials, productLimited };
}

// Run a single-start optimisation loop. Returns { filters, metrics, baselineWorstSeatDeviation,
// blockedResiduals, stopReason, bankEvalCount, operations }.
export function runSingleStart(initialFilters, seats, bankRaw, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile) {
  const peakThresholdDb = profile.peakDiscoveryThresholdDb || 1;
  const valleyThresholdDb = profile.valleyDiscoveryThresholdDb || 1;
  const maxOperations = 30;

  let filters = initialFilters.map((f) => ({ ...f }));
  let currentMetrics = calculateAllSeatMetrics(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb);
  if (!currentMetrics) return { filters, metrics: null, baselineWorstSeatDeviation: null, blockedResiduals: [], stopReason: "no seat metrics", bankEvalCount: 0, operations: 0 };

  const baselineWorstSeatDeviation = currentMetrics.worstSeatMaxDeviationDb;
  let blockedResiduals = [];
  let operations = 0;
  let stopReason = "no safe improvement remained";
  let bankEvalCount = 0;

  while (operations < maxOperations) {
    const regions = findAllResidualRegions(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb, peakThresholdDb, valleyThresholdDb);
    if (!regions.length) { stopReason = "no residual regions found"; break; }

    blockedResiduals = []; // reset for this iteration — only the last iteration's blocked residuals are kept
    let bestTrial = null;
    let bestTrialMetrics = null;
    let bestTrialFilters = null;

    for (const region of regions) {
      const { trials, productLimited } = generateTrialsForRegion(region, filters, profile, activeSubs, usableLfHz, requestedSystemOutputDb);
      let regionAdmissible = false;
      let regionBlockReason = productLimited ? "product-limited" : null;

      for (const trial of trials) {
        const proposedFilters = buildProposedBank(trial, filters);
        const validation = validateAndScaleTrial(proposedFilters, trial.scalableIndex, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
        bankEvalCount++;
        if (!validation.filters) { regionBlockReason = regionBlockReason || "bank-limited"; continue; }
        regionAdmissible = true;
        const trialMetrics = calculateAllSeatMetrics(seats, validation.filters, assessmentStartHz, assessmentEndHz, anchorDb);
        if (!trialMetrics) continue;
        const worstSeatImproves = trialMetrics.worstSeatMaxDeviationDb < currentMetrics.worstSeatMaxDeviationDb - 0.05;
        const worstSeatUnchanged = Math.abs(trialMetrics.worstSeatMaxDeviationDb - currentMetrics.worstSeatMaxDeviationDb) <= 0.05;
        const meanImproves = trialMetrics.meanSeatMaxDeviationDb < currentMetrics.meanSeatMaxDeviationDb - 0.05;
        const rmsImproves = trialMetrics.rmsSeatTargetErrorDb < currentMetrics.rmsSeatTargetErrorDb - 0.05;
        if (!worstSeatImproves && !(worstSeatUnchanged && (meanImproves || rmsImproves))) continue;
        if (!bestTrial || trialMetrics.worstSeatMaxDeviationDb < bestTrialMetrics.worstSeatMaxDeviationDb - 0.05 ||
            (Math.abs(trialMetrics.worstSeatMaxDeviationDb - bestTrialMetrics.worstSeatMaxDeviationDb) <= 0.05 && trialMetrics.meanSeatMaxDeviationDb < bestTrialMetrics.meanSeatMaxDeviationDb - 0.05)) {
          bestTrial = trial;
          bestTrialMetrics = trialMetrics;
          bestTrialFilters = validation.filters;
        }
      }

      if (!regionAdmissible && region.severityDb > 2 && regionBlockReason) {
        const alreadyBlocked = blockedResiduals.some((b) => b.seatId === region.seatId && Math.abs(b.frequency - region.centrePoint.frequency) < 2);
        if (!alreadyBlocked) {
          const requiredCorrectionDb = region.kind === "peak" ? -region.severityDb * 0.85 : region.severityDb * 0.75;
          blockedResiduals.push({
            seatId: region.seatId,
            frequency: region.centrePoint.frequency,
            signedDeviationDb: region.centrePoint.deviationDb,
            requiredCorrectionDb,
            permittedCorrectionDb: productLimited ? 0 : null,
            blockingReason: regionBlockReason,
          });
        }
      }
    }

    if (!bestTrial) { stopReason = "no admissible improvement from any region"; break; }
    filters = bestTrialFilters;
    currentMetrics = bestTrialMetrics;
    operations++;
  }

  if (operations >= maxOperations && stopReason === "no safe improvement remained") stopReason = "operation ceiling reached";

  return { filters, metrics: currentMetrics, baselineWorstSeatDeviation, blockedResiduals, stopReason, bankEvalCount, operations };
}