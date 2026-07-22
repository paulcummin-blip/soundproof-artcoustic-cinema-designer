import {
  buildCurveFromBank,
  evaluateProvisionalBankLimits,
  limitBoostForCapability,
  normaliseCurve,
  peakingEqResponseDb,
} from "@/components/utils/designEqCalibration";
import { computeOfficialP20Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { computeParam14LfeCapability } from "@/components/utils/rp22BassMetrics";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";

const MAX_FILTERS = 10;
const MAX_Q = 10;
const MAX_PROTECTED_NULL_WORSENING_DB = 2;
const RESIDUAL_THRESHOLD_DB = 1;
const EPSILON_DB = 0.05;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const levelNumber = (level) => Number(String(level || "").replace("L", "")) || 0;

function targetAt(frequency, anchorDb, canonicalTargetCurve) {
  return interpolateCanonicalTarget(canonicalTargetCurve, frequency)
    ?? (anchorDb + artcousticHouseCurveOffsetAt(frequency));
}

function correctionAt(frequency, filters) {
  return filters.reduce((sum, filter) => sum + peakingEqResponseDb(frequency, filter), 0);
}

function correctedSeats(perSeatRawCurves, filters) {
  return (perSeatRawCurves || [])
    .filter((seat) => seat?.seatId && seat.seatId !== "rsp" && !seat.__isSyntheticRsp && Array.isArray(seat.responseData))
    .map((seat) => ({
      seatId: seat.seatId,
      responseData: normaliseCurve(seat.responseData).map((point) => ({
        frequency: point.frequency,
        spl: point.spl + correctionAt(point.frequency, filters),
      })),
    }));
}

function p20Level(raw, perSeatRawCurves, filters, startHz, endHz) {
  const assessment = computeOfficialP20Assessment({
    rspPostEqCurve: buildCurveFromBank(raw, filters),
    perSeatPostEqCurves: correctedSeats(perSeatRawCurves, filters),
    assessmentStartHz: startHz,
    assessmentEndHz: endHz,
  });
  return { available: assessment.available, level: assessment.worstSeat?.level ?? 0 };
}

function p14Level(raw, filters) {
  return levelNumber(computeParam14LfeCapability(buildCurveFromBank(raw, filters), false, [20, 120])?.level);
}

function rawResidualPoints(raw, filters, startHz, endHz, anchorDb, canonicalTargetCurve) {
  return raw
    .filter((point) => point.frequency >= startHz && point.frequency <= endHz)
    .map((point) => {
      const targetSpl = targetAt(point.frequency, anchorDb, canonicalTargetCurve);
      const aggregateCorrectionDb = correctionAt(point.frequency, filters);
      return {
        frequency: point.frequency,
        rawSpl: point.spl,
        targetSpl,
        aggregateCorrectionDb,
        postEqSpl: point.spl + aggregateCorrectionDb,
        residualDb: point.spl + aggregateCorrectionDb - targetSpl,
      };
    });
}

function residualRegions(points, protectedNullRegions) {
  const regions = [];
  let current = [];
  let currentSign = 0;
  let currentProtected = false;
  const finish = () => {
    if (!current.length) return;
    const centre = current.reduce((worst, point) => Math.abs(point.residualDb) > Math.abs(worst.residualDb) ? point : worst);
    regions.push({
      kind: centre.residualDb > 0 ? "peak" : "valley",
      startHz: current[0].frequency,
      endHz: current.at(-1).frequency,
      centre,
      protectedNullOverlap: currentProtected,
    });
    current = [];
  };
  for (const point of points) {
    const sign = Math.sign(point.residualDb);
    const protectedPoint = isProtectedFrequency(point.frequency, protectedNullRegions);
    if (Math.abs(point.residualDb) < RESIDUAL_THRESHOLD_DB) {
      finish();
      currentSign = 0;
      continue;
    }
    if (current.length && (sign !== currentSign || protectedPoint !== currentProtected)) finish();
    if (!current.length) {
      currentSign = sign;
      currentProtected = protectedPoint;
    }
    current.push(point);
  }
  finish();
  return regions.sort((left, right) => Math.abs(right.centre.residualDb) - Math.abs(left.centre.residualDb));
}

function quality(points, protectedNullRegions) {
  const scored = points.filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
  if (!scored.length) return { maximumAbsoluteResidualDb: null, rmsResidualDb: null };
  return {
    maximumAbsoluteResidualDb: Math.max(...scored.map((point) => Math.abs(point.residualDb))),
    rmsResidualDb: Math.sqrt(scored.reduce((sum, point) => sum + point.residualDb ** 2, 0) / scored.length),
  };
}

function overlappingFilters(frequency, filters) {
  return filters.map((filter, index) => ({
    index,
    band: filter.band,
    frequencyHz: filter.frequencyHz,
    gainDb: filter.gainDb,
    Q: filter.Q,
    contributionDb: peakingEqResponseDb(frequency, filter),
  })).filter((filter) => Math.abs(filter.contributionDb) >= 0.01);
}

function protectedNullWorsening(currentFilters, candidateFilters, protectedNullRegions) {
  return (protectedNullRegions || []).reduce((worst, region) => {
    const frequency = region.centreFrequencyHz;
    if (!Number.isFinite(frequency)) return worst;
    const incrementalCorrection = correctionAt(frequency, candidateFilters) - correctionAt(frequency, currentFilters);
    return Math.max(worst, Math.max(0, -incrementalCorrection));
  }, 0);
}

function proposedBanks(region, filters, activeSubs, usableLfHz, requestedSystemOutputDb) {
  const requiredDb = -region.centre.residualDb;
  const isCut = requiredDb < 0;
  const requestedDb = isCut ? Math.max(-15, requiredDb) : Math.min(6, requiredDb);
  const gains = [1, 0.9, 0.75, 0.5, 0.25];
  const qValues = [10, 8, 6, 5, 4];
  const trials = [];
  if (filters.length < MAX_FILTERS) {
    for (const gainScale of gains) for (const Q of qValues) {
      let filter = {
        band: filters.length + 1,
        enabled: true,
        type: "Peak",
        frequencyHz: region.centre.frequency,
        gainDb: requestedDb * gainScale,
        Q,
        reason: "Professional high-resolution residual cleanup",
      };
      if (filter.gainDb > 0) {
        const halfWidth = region.centre.frequency / (2 * Q);
        filter = limitBoostForCapability({ ...filter, startHz: filter.frequencyHz - halfWidth, endHz: filter.frequencyHz + halfWidth }, activeSubs, usableLfHz, requestedSystemOutputDb);
      }
      trials.push({ action: "append", changedFilterIndex: filters.length, filter, filters: [...filters, filter] });
    }
  }
  overlappingFilters(region.centre.frequency, filters)
    .filter((overlap) => Math.abs(Math.log2(region.centre.frequency / overlap.frequencyHz)) <= 1 / 3)
    .forEach((overlap) => {
      const existing = filters[overlap.index];
      for (const gainScale of gains) for (const Q of [MAX_Q, existing.Q]) {
        const gainDb = clamp(existing.gainDb + requiredDb * gainScale, -15, 6);
        if (Math.abs(gainDb - existing.gainDb) <= 0.05) continue;
        const filter = { ...existing, gainDb, Q: clamp(Q, 0.5, MAX_Q), reason: "Professional high-resolution gain refinement" };
        const next = filters.map((candidate, index) => index === overlap.index ? filter : candidate);
        trials.push({ action: "revise", changedFilterIndex: overlap.index, filter, filters: next });
      }
    });
  const unique = new Map();
  trials.forEach((trial) => {
    const key = trial.filters.map((filter) => `${filter.frequencyHz}:${filter.gainDb.toFixed(4)}:${filter.Q}`).join("|");
    if (!unique.has(key)) unique.set(key, trial);
  });
  return [...unique.values()];
}

function priorDisposition(region, priorIterationTrace) {
  const entries = (priorIterationTrace || []).flatMap((iteration) => {
    const discovered = (iteration.regions || []).some((candidate) => Math.abs(Math.log2(candidate.centreFrequencyHz / region.centre.frequency)) <= 1 / 24);
    return (iteration.trials || [])
      .filter((trial) => Math.abs(Math.log2(trial.regionCentreHz / region.centre.frequency)) <= 1 / 24)
      .map((trial) => ({ discovered, accepted: !!trial.accepted, rejectionReason: trial.rejectionReason }));
  });
  if (!entries.length) return {
    discovered: false,
    disposition: "not-discovered-on-1/3-octave-scoring-grid",
    rejectionReasons: [],
  };
  return {
    discovered: entries.some((entry) => entry.discovered),
    disposition: entries.some((entry) => entry.accepted) ? "accepted-by-primary-fit" : "all-primary-fit-trials-rejected",
    rejectionReasons: entries.filter((entry) => !entry.accepted).map((entry) => entry.rejectionReason).filter(Boolean),
  };
}

function rejectionForTrial({ trial, currentFilters, currentPoints, currentQuality, currentP14Level, currentP20, raw, perSeatRawCurves,
  region, protectedNullRegions, canonicalTargetCurve, anchorDb, assessmentStartHz, assessmentEndHz,
  correctionStartHz, correctionEndHz, activeSubs, usableLfHz, requestedSystemOutputDb, profile }) {
  if (trial.filters.filter((filter) => filter.enabled).length > MAX_FILTERS) return { reason: "filter-count-limit: more than ten enabled filters" };
  if (trial.filter.Q > MAX_Q || trial.filter.Q < 0.5) return { reason: `filter-Q-limit: Q ${trial.filter.Q} is outside 0.5–${MAX_Q}` };
  const limits = evaluateProvisionalBankLimits(trial.filters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  if (!limits.allOk) {
    const failures = [];
    if (!limits.cutLimitOk) failures.push(`aggregate cut ${limits.maxAggregateCutDb.toFixed(3)} dB exceeds −15 dB`);
    if (!limits.boostLimitOk) failures.push(`aggregate boost ${limits.maxAggregateBoostDb.toFixed(3)} dB exceeds +6 dB`);
    if (!limits.sourceDomainHeadroomOk) failures.push("product boost headroom exceeded");
    return { reason: `bank-limit: ${failures.join("; ")}`, limits };
  }
  const nullWorseningDb = protectedNullWorsening(currentFilters, trial.filters, protectedNullRegions);
  if (nullWorseningDb > MAX_PROTECTED_NULL_WORSENING_DB + EPSILON_DB) {
    return { reason: `protected-null-overlap: predicted worsening ${nullWorseningDb.toFixed(3)} dB exceeds ${MAX_PROTECTED_NULL_WORSENING_DB.toFixed(1)} dB`, limits, nullWorseningDb };
  }
  const candidatePoints = rawResidualPoints(raw, trial.filters, correctionStartHz, correctionEndHz, anchorDb, canonicalTargetCurve);
  const materiallyWorsenedPoint = candidatePoints.find((point, index) => {
    const before = currentPoints[index];
    return before && !isProtectedFrequency(point.frequency, protectedNullRegions)
      && Math.abs(point.residualDb) > Math.abs(before.residualDb) + 0.5;
  });
  if (materiallyWorsenedPoint) {
    return { reason: `high-resolution-score: ${materiallyWorsenedPoint.frequency.toFixed(2)} Hz worsened by more than 0.50 dB`, limits, nullWorseningDb };
  }
  const candidateCentre = candidatePoints.reduce((nearest, point) => Math.abs(point.frequency - region.centre.frequency) < Math.abs(nearest.frequency - region.centre.frequency) ? point : nearest);
  const localImprovementDb = Math.abs(region.centre.residualDb) - Math.abs(candidateCentre.residualDb);
  if (localImprovementDb <= EPSILON_DB) return { reason: "local-fit: attempted correction did not reduce the centre residual", limits, nullWorseningDb, candidateCentre };
  const candidateQuality = quality(candidatePoints, protectedNullRegions);
  if (candidateQuality.maximumAbsoluteResidualDb > currentQuality.maximumAbsoluteResidualDb + 0.25) {
    return { reason: "high-resolution-score: maximum correctable residual worsened by more than 0.25 dB", limits, nullWorseningDb, candidateCentre, candidateQuality };
  }
  if (candidateQuality.rmsResidualDb > currentQuality.rmsResidualDb + 0.1) {
    return { reason: "high-resolution-score: correctable RMS worsened by more than 0.10 dB", limits, nullWorseningDb, candidateCentre, candidateQuality };
  }
  const candidateP14Level = p14Level(raw, trial.filters);
  if (currentP14Level >= 1 && candidateP14Level < 1) {
    return { reason: "P14-preservation: this correction alone loses an otherwise-achieved P14 L1 result", limits, nullWorseningDb, candidateCentre, candidateQuality, candidateP14Level };
  }
  const candidateP20 = p20Level(raw, perSeatRawCurves, trial.filters, assessmentStartHz, assessmentEndHz);
  if (currentP20.available && candidateP20.available && candidateP20.level < currentP20.level) {
    return { reason: `P20-preservation: level would fall from L${currentP20.level} to L${candidateP20.level}`, limits, nullWorseningDb, candidateCentre, candidateQuality, candidateP14Level, candidateP20 };
  }
  return { accepted: true, reason: null, limits, nullWorseningDb, candidateCentre, candidateQuality, candidateP14Level, candidateP20, localImprovementDb };
}

export function runProfessionalResidualCleanup({ filters = [], rawCurve = [], perSeatRawCurves = [], anchorDb = 0,
  canonicalTargetCurve = [], protectedNullRegions = [], activeSubs = [], usableLfHz, requestedSystemOutputDb,
  assessmentStartHz = 20, assessmentEndHz = 120, correctionStartHz = 20, correctionEndHz = 200,
  profile = { maximumCutDb: 15, maximumAggregateBoostDb: 6 }, priorIterationTrace = [], cleanupPass = 0 }) {
  const raw = normaliseCurve(rawCurve);
  let selectedFilters = filters.filter((filter) => filter?.enabled).map((filter) => ({ ...filter }));
  let bankEvaluationCount = 0;
  let acceptedOperationCount = 0;
  const diagnostics = [];
  const initialPoints = rawResidualPoints(raw, selectedFilters, correctionStartHz, correctionEndHz, anchorDb, canonicalTargetCurve);
  const initialRegions = residualRegions(initialPoints, protectedNullRegions);
  const baselineP20 = p20Level(raw, perSeatRawCurves, selectedFilters, assessmentStartHz, assessmentEndHz);

  for (const initialRegion of initialRegions) {
    const currentPoints = rawResidualPoints(raw, selectedFilters, correctionStartHz, correctionEndHz, anchorDb, canonicalTargetCurve);
    const nearest = currentPoints.reduce((best, point) => Math.abs(point.frequency - initialRegion.centre.frequency) < Math.abs(best.frequency - initialRegion.centre.frequency) ? point : best);
    const region = { ...initialRegion, centre: nearest };
    const limitsBefore = evaluateProvisionalBankLimits(selectedFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
    bankEvaluationCount++;
    const boostAllowance = getSourceDomainBoostAllowance({
      frequency: region.centre.frequency, requestedBoostDb: 6, activeSubs, usableLfHz,
      maxBoostDb: 6, requestedSystemOutputDb,
    });
    const permittedBoostDb = Number.isFinite(boostAllowance?.allowedBoostDb) ? boostAllowance.allowedBoostDb : 6;
    const diagnostic = {
      kind: region.kind,
      startHz: region.startHz,
      endHz: region.endHz,
      centreFrequencyHz: region.centre.frequency,
      requiredCorrectionDb: -region.centre.residualDb,
      existingAggregateCorrectionDb: region.centre.aggregateCorrectionDb,
      overlappingFilters: overlappingFilters(region.centre.frequency, selectedFilters),
      remainingCutHeadroomDb: Math.max(0, 15 + region.centre.aggregateCorrectionDb),
      remainingBoostHeadroomDb: Math.max(0, Math.min(6, permittedBoostDb) - Math.max(0, region.centre.aggregateCorrectionDb)),
      remainingAggregateCutHeadroomDb: Math.max(0, 15 + limitsBefore.maxAggregateCutDb),
      remainingAggregateBoostHeadroomDb: Math.max(0, 6 - limitsBefore.maxAggregateBoostDb),
      productPermittedTotalBoostDb: permittedBoostDb,
      protectedNullOverlap: region.protectedNullOverlap,
      priorFit: priorDisposition(region, priorIterationTrace),
      candidateSelectionMismatch: false,
      attempts: [],
      acceptedAttempt: null,
    };
    diagnostics.push(diagnostic);
    if (Math.abs(region.centre.residualDb) < RESIDUAL_THRESHOLD_DB) {
      diagnostic.finalDisposition = "already-within-±1-dB-after-earlier-cleanup";
      continue;
    }
    if (region.protectedNullOverlap) {
      diagnostic.finalDisposition = "protected-null: boost intentionally not attempted";
      continue;
    }
    const currentQuality = quality(currentPoints, protectedNullRegions);
    const currentP14Level = p14Level(raw, selectedFilters);
    const currentP20 = p20Level(raw, perSeatRawCurves, selectedFilters, assessmentStartHz, assessmentEndHz);
    let accepted = [];
    for (const trial of proposedBanks(region, selectedFilters, activeSubs, usableLfHz, requestedSystemOutputDb)) {
      const outcome = rejectionForTrial({
        trial, currentFilters: selectedFilters, currentPoints, currentQuality, currentP14Level, currentP20, raw, perSeatRawCurves,
        region, protectedNullRegions, canonicalTargetCurve, anchorDb, assessmentStartHz, assessmentEndHz,
        correctionStartHz, correctionEndHz, activeSubs, usableLfHz, requestedSystemOutputDb, profile,
      });
      bankEvaluationCount++;
      const attempt = {
        action: trial.action,
        changedFilterIndex: trial.changedFilterIndex,
        frequencyHz: trial.filter.frequencyHz,
        gainDb: trial.filter.gainDb,
        Q: trial.filter.Q,
        accepted: !!outcome.accepted,
        rejectionReason: outcome.reason,
        aggregateCutDb: outcome.limits?.maxAggregateCutDb ?? null,
        aggregateBoostDb: outcome.limits?.maxAggregateBoostDb ?? null,
        predictedProtectedNullWorseningDb: outcome.nullWorseningDb ?? null,
        predictedCentreResidualDb: outcome.candidateCentre?.residualDb ?? null,
        predictedCorrectableMaximumDb: outcome.candidateQuality?.maximumAbsoluteResidualDb ?? null,
        predictedCorrectableRmsDb: outcome.candidateQuality?.rmsResidualDb ?? null,
        predictedP14Level: outcome.candidateP14Level ?? null,
        predictedP20Level: outcome.candidateP20?.level ?? null,
      };
      diagnostic.attempts.push(attempt);
      if (outcome.accepted) accepted.push({ trial, outcome, attempt });
    }
    accepted.sort((left, right) =>
      Math.abs(left.outcome.candidateCentre.residualDb) - Math.abs(right.outcome.candidateCentre.residualDb)
      || left.trial.filters.length - right.trial.filters.length
      || right.trial.filter.Q - left.trial.filter.Q
      || left.outcome.candidateQuality.maximumAbsoluteResidualDb - right.outcome.candidateQuality.maximumAbsoluteResidualDb
      || left.outcome.candidateQuality.rmsResidualDb - right.outcome.candidateQuality.rmsResidualDb);
    if (!accepted.length) {
      diagnostic.finalDisposition = diagnostic.attempts.length ? "all-cleanup-trials-rejected" : "no-legal-filter-operation-generated";
      continue;
    }
    const winner = accepted[0];
    selectedFilters = winner.trial.filters;
    winner.attempt.selected = true;
    diagnostic.acceptedAttempt = winner.attempt;
    diagnostic.finalDisposition = "accepted-high-resolution-cleanup";
    acceptedOperationCount++;
  }

  const finalLimits = evaluateProvisionalBankLimits(selectedFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  bankEvaluationCount++;
  const finalPoints = rawResidualPoints(raw, selectedFilters, correctionStartHz, correctionEndHz, anchorDb, canonicalTargetCurve);
  if (acceptedOperationCount > 0 && cleanupPass < 4) {
    const nextPass = runProfessionalResidualCleanup({
      filters: selectedFilters, rawCurve: raw, perSeatRawCurves, anchorDb, canonicalTargetCurve,
      protectedNullRegions, activeSubs, usableLfHz, requestedSystemOutputDb,
      assessmentStartHz, assessmentEndHz, correctionStartHz, correctionEndHz,
      profile, priorIterationTrace, cleanupPass: cleanupPass + 1,
    });
    return {
      ...nextPass,
      diagnostics: [...diagnostics, ...nextPass.diagnostics],
      changed: true,
      acceptedOperationCount: acceptedOperationCount + nextPass.acceptedOperationCount,
      bankEvaluationCount: bankEvaluationCount + nextPass.bankEvaluationCount,
      baselineP20Level: baselineP20.level,
    };
  }
  return {
    filters: selectedFilters,
    curve: buildCurveFromBank(raw, selectedFilters),
    combinedEqCurve: raw.map((point) => ({ frequency: point.frequency, spl: correctionAt(point.frequency, selectedFilters) })),
    diagnostics,
    changed: acceptedOperationCount > 0,
    acceptedOperationCount,
    bankEvaluationCount,
    finalQuality: quality(finalPoints, protectedNullRegions),
    finalBankLimits: finalLimits,
    baselineP20Level: baselineP20.level,
    finalP20Level: p20Level(raw, perSeatRawCurves, selectedFilters, assessmentStartHz, assessmentEndHz).level,
    limits: { maximumAggregateCutDb: -15, maximumAggregateBoostDb: 6, maximumFilterQ: MAX_Q, maximumEnabledFilters: MAX_FILTERS },
  };
}