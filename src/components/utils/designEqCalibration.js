import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import { buildFilterDecisionDiagnostics, classifyEqCorrectionRegion, findAggregatePeakBoostViolations, validatePhysicalEqAction } from "@/components/utils/designEqPhysicsAuthority";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import {
  aggregateResponseDbAt,
  buildCurveFromBank,
  countSameSignFiltersInRegion,
  emptyFilters,
  evaluateProvisionalBankLimits,
  isNearDuplicate,
  limitBoostForCapability,
  maxSameRegionFilterCount,
  peakingEqResponseDb,
  scaleCandidateForBankLimits,
  scaleRevisionForBankLimits,
  resetDesignEqBankEvaluationCount,
  getDesignEqBankEvaluationCount,
} from "@/components/utils/designEqBankLimits";

const isNumber = (value) => Number.isFinite(Number(value));

// Explicit fitting profiles share a fixed requested RP22 target. Standard uses
// conservative discovery and cut limits; Accuracy allows tighter alignment.
// P14/P18 capability is assessed after EQ and never selects the checkpoint.
// Positive magnitudes configure boost; cuts are applied as negative gain.
export const DESIGN_EQ_FIT_PROFILES = {
  standard: {
    id: "standard",
    preserveP14: false,
    fittingToleranceDb: 2,
    maximumCutDb: 15,
    maximumAggregateBoostDb: 6,
    peakDiscoveryThresholdDb: 2,
    valleyDiscoveryThresholdDb: 2,
  },
  accuracy: {
    id: "accuracy",
    preserveP14: false,
    fittingToleranceDb: 1,
    maximumCutDb: 15,
    maximumAggregateBoostDb: 6,
    peakDiscoveryThresholdDb: 1,
    valleyDiscoveryThresholdDb: 1,
  },
};

export function getDesignEqFitProfile(profileId) {
  return DESIGN_EQ_FIT_PROFILES[profileId] || DESIGN_EQ_FIT_PROFILES.standard;
}

function normaliseCurve(curveData) {
  return (Array.isArray(curveData) ? curveData : [])
    .map((point) => ({ frequency: Number(point?.frequency), spl: Number(point?.spl) }))
    .filter((point) => isNumber(point.frequency) && isNumber(point.spl) && point.frequency > 0)
    .sort((a, b) => a.frequency - b.frequency);
}

function interpolate(curve, frequency) {
  if (!curve.length) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  const upperIndex = curve.findIndex((point) => point.frequency >= frequency);
  const low = curve[upperIndex - 1];
  const high = curve[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}


function median(values) {
  const sorted = values.filter(isNumber).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function deviationAt(curve, frequency, anchorDb) {
  const spl = interpolate(curve, frequency);
  return isNumber(spl) ? spl - (anchorDb + artcousticHouseCurveOffsetAt(frequency)) : null;
}

function octaveWidth(startHz, endHz) {
  return startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;
}

// Part D: Peak and valley discovery thresholds are now profile-driven. Standard
// preserves the original ±2 dB behaviour; Accuracy uses ±1 dB so a ±1 dB target
// can discover materially correctable residuals.
function findRegions(points, kind, peakThresholdDb = 2, valleyThresholdDb = 2) {
  // Part A: Peak deviations >= +peakThresholdDb; valley deviations <= -valleyThresholdDb.
  // The previous implementation used `-threshold` for valleys, which became positive
  // and accepted deviations up to +valleyThresholdDb as valleys. This is now corrected.
  const matches = (point) =>
    kind === "peak"
      ? point.deviationDb >= peakThresholdDb
      : point.deviationDb <= -valleyThresholdDb;
  const minimumWidth = kind === "peak" ? 1 / 6 : 1 / 3;
  const regions = [];
  let current = [];
  const finish = () => {
    if (!current.length) return;
    const startHz = current[0].frequency;
    const endHz = current[current.length - 1].frequency;
    const width = octaveWidth(startHz, endHz);
    if (width >= minimumWidth) {
      const centrePoint = current.reduce((best, point) => kind === "peak"
        ? (point.deviationDb > best.deviationDb ? point : best)
        : (point.deviationDb < best.deviationDb ? point : best));
      regions.push({ kind, startHz, endHz, widthOctaves: width, centrePoint, severityDb: Math.abs(centrePoint.deviationDb) });
    }
    current = [];
  };
  points.forEach((point) => {
    if (matches(point)) current.push(point);
    else finish();
  });
  finish();
  return regions;
}

// Part A: Deterministic checks proving the valley threshold sign is correct.
// A +0.5 dB point must NOT be an Accuracy valley; a −0.9 dB point must NOT be
// an Accuracy valley; a −1.0 dB point MUST be an Accuracy valley. Uses a band
// of points spanning > 1/3 octave so the minimum-width requirement is met.
export function getDesignEqValleyThresholdValidation() {
  const peakThresholdDb = 1;
  const valleyThresholdDb = 1;
  // 40–63 Hz ≈ 0.66 octaves — exceeds the 1/3-octave valley minimum width.
  const bandFreqs = [40, 45, 50, 56, 63];
  const bandPoints = (deviationDb) => bandFreqs.map((f) => ({ frequency: f, deviationDb }));
  const isValley = (deviationDb) =>
    findRegions(bandPoints(deviationDb), "valley", peakThresholdDb, valleyThresholdDb).length > 0;
  const isPeak = (deviationDb) =>
    findRegions(bandPoints(deviationDb), "peak", peakThresholdDb, valleyThresholdDb).length > 0;
  return {
    plusHalfDbIsNotValley: !isValley(0.5),
    minusZeroNineDbIsNotValley: !isValley(-0.9),
    minusOneDbIsValley: isValley(-1.0),
    plusOneDbIsPeak: isPeak(1.0),
    plusHalfDbIsNotPeak: !isPeak(0.5),
  };
}

function qForRegion(region) {
  const bandwidthHz = Math.max(region.endHz - region.startHz, 0.01);
  return Math.max(0.5, Math.min(10, region.centrePoint.frequency / bandwidthHz));
}

function completeBandResidualMetrics(trend, assessmentStartHz, assessmentEndHz, anchorDb) {
  const points = trend
    .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .map((point) => ({
      frequency: point.frequency,
      deviationDb: deviationAt(trend, point.frequency, anchorDb),
    }))
    .filter((point) => isNumber(point.deviationDb));
  if (!points.length) return null;
  const worst = points.reduce((current, point) => Math.abs(point.deviationDb) > Math.abs(current.deviationDb) ? point : current);
  return {
    points,
    maximumAbsoluteDeviationDb: Math.abs(worst.deviationDb),
    rmsDeviationDb: Math.sqrt(points.reduce((sum, point) => sum + point.deviationDb ** 2, 0) / points.length),
    worstResidualFrequencyHz: worst.frequency,
  };
}

function createsBroadBelowTargetWorsening(beforeTrend, afterMetrics, anchorDb, fittingToleranceDb) {
  let regionStartHz = null;
  let regionEndHz = null;
  const closesMaterialRegion = () => {
    const isMaterial = regionStartHz !== null
      && regionEndHz !== null
      && octaveWidth(regionStartHz, regionEndHz) >= 1 / 6;
    regionStartHz = null;
    regionEndHz = null;
    return isMaterial;
  };

  for (const point of afterMetrics.points) {
    const beforeDeviationDb = deviationAt(beforeTrend, point.frequency, anchorDb);
    const isWorseBelowTarget = Number.isFinite(beforeDeviationDb)
      && point.deviationDb < -fittingToleranceDb
      && point.deviationDb <= beforeDeviationDb - 0.25;
    if (isWorseBelowTarget) {
      if (regionStartHz === null) regionStartHz = point.frequency;
      regionEndHz = point.frequency;
    } else if (closesMaterialRegion()) {
      return true;
    }
  }
  return closesMaterialRegion();
}

function minimumSplAcrossBand(curve, assessmentStartHz, assessmentEndHz) {
  const values = curve
    .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .map((point) => Number(point.spl))
    .filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function buildCheckpoint({ filters, curve, originalTrend, assessmentStartHz, assessmentEndHz, anchorDb, fittingToleranceDb }) {
  const trend = applyBassSmoothing(curve, "third");
  const metrics = completeBandResidualMetrics(trend, assessmentStartHz, assessmentEndHz, anchorDb);
  const rawMinimumSpl = minimumSplAcrossBand(curve, assessmentStartHz, assessmentEndHz);
  const smoothedMinimumSpl = minimumSplAcrossBand(trend, assessmentStartHz, assessmentEndHz);
  const broadBelowTargetWorsening = filters.length > 0 && metrics
    ? createsBroadBelowTargetWorsening(originalTrend, metrics, anchorDb, fittingToleranceDb)
    : false;
  return {
    filters: filters.map((filter) => ({ ...filter })),
    curve: curve.map((point) => ({ ...point })),
    trend: trend.map((point) => ({ ...point })),
    maximumAbsoluteDeviationDb: metrics?.maximumAbsoluteDeviationDb ?? Infinity,
    rmsDeviationDb: metrics?.rmsDeviationDb ?? Infinity,
    worstResidualFrequencyHz: metrics?.worstResidualFrequencyHz ?? null,
    rawMinimumSpl,
    smoothedMinimumSpl,
    minimumSpl: smoothedMinimumSpl,
    broadBelowTargetWorsening,
  };
}

export function calculateDesignEqCurve(curveData, usableLfHz, activeSubs = [], options = {}) {
  const raw = normaliseCurve(curveData);
  if (!raw.length) return { curve: curveData || [], diagnostics: [], filters: emptyFilters([]), combinedEqCurve: [], designEqFitProfile: "standard" };

  const thirdOctave = applyBassSmoothing(raw, "third");
  const referenceBand = thirdOctave.filter((point) => point.frequency >= 150 && point.frequency <= 200);
  const rawAnchorDb = median((referenceBand.length ? referenceBand : thirdOctave).map((point) => point.spl));
  const anchorDb = isNumber(options.targetAnchorDb) ? Number(options.targetAnchorDb) : rawAnchorDb;
  if (!isNumber(anchorDb)) return { curve: raw, diagnostics: [], filters: emptyFilters([]), combinedEqCurve: [], designEqFitProfile: "standard" };

  const assessmentStartHz = Number.isFinite(Number(options.assessmentStartHz)) ? Number(options.assessmentStartHz) : 20;
  const assessmentEndHz = Number.isFinite(Number(options.assessmentEndHz)) ? Number(options.assessmentEndHz) : 200;
  const canonicalTargetCurve = Array.isArray(options.canonicalTargetCurve) ? options.canonicalTargetCurve : [];
  const protectedNullRegions = Array.isArray(options.protectedNullRegions) ? options.protectedNullRegions : [];
  // Resolve conservative or accuracy fitting against the same fixed target.
  const profile = getDesignEqFitProfile(options.fitProfile);
  const profileFittingToleranceDb = Number.isFinite(Number(profile.fittingToleranceDb)) ? Number(profile.fittingToleranceDb) : 2;
  const requestedFittingToleranceDb = Number.isFinite(Number(options.fittingToleranceDb))
    ? Number(options.fittingToleranceDb)
    : profileFittingToleranceDb;
  const fittingToleranceDb = Math.max(1, Math.min(5, requestedFittingToleranceDb));
  const requestedSystemOutputDb = Number(options.requestedSystemOutputDb);
  const collectDiagnostics = options.collectDiagnostics !== false;
  // Accept initialFilters for seeded fits (Accuracy profile seeded from Standard).
  // Keep only valid, enabled filters. Limit to 10 filters.
  const initialFilters = Array.isArray(options.initialFilters)
    ? options.initialFilters
        .filter((f) => f && f.enabled && Number.isFinite(f.frequencyHz) && f.frequencyHz > 0
          && Number.isFinite(f.gainDb) && Number.isFinite(f.Q) && f.Q > 0)
        .filter((filter) => {
          const frequency = Number(filter.frequencyHz);
          const authority = classifyEqCorrectionRegion({
            frequency,
            rawSpl: interpolate(raw, frequency),
            currentSpl: interpolate(raw, frequency),
            targetSpl: anchorDb + artcousticHouseCurveOffsetAt(frequency),
            protectedNull: isProtectedFrequency(frequency, protectedNullRegions),
            requestedGainDb: filter.gainDb,
          });
          return validatePhysicalEqAction(authority.classification, filter.gainDb).passed;
        })
        .slice(0, 10)
        .map((f) => ({ ...f }))
    : [];
  const hasInitialFilters = initialFilters.length > 0;
  resetDesignEqBankEvaluationCount();
  // Seed the filter bank from the Standard fit when provided (Accuracy profile).
  // The seeded state is the first checkpoint — it guarantees the Accuracy result
  // retains or improves the Standard checkpoint's maximum house-curve deviation.
  const filters = hasInitialFilters ? initialFilters.map((f) => ({ ...f })) : [];
  let curve = hasInitialFilters ? buildCurveFromBank(raw, filters) : raw;
  let stopReason = "no safe improvement remained";
  const checkpoints = [buildCheckpoint({
    filters,
    curve,
    originalTrend: thirdOctave,
    assessmentStartHz,
    assessmentEndHz,
    anchorDb,
    fittingToleranceDb,
  })];
  const iterationTrace = [];
  let bankLimitScaledCount = 0;
  let bankLimitRejectedCount = 0;
  let nearDuplicateRejectedCount = 0;
  let sameRegionRejectedCount = 0;
  let revisionAttemptCount = 0;
  let revisionPassedAcceptanceCount = 0;
  let selectedRevisionOperationCount = 0;
  const revisionAttempts = [];
  const detectedRegions = [];
  const candidateAcceptanceDiagnostics = [];
  const candidateSelectionDiagnostics = [];
  let operations = 0;
  const maxOperations = 30;
  const revisionScales = [1, 0.75, 0.5, 0.25];

  // Fit one broad residual at a time. Each pass re-smooths the cumulative curve.
  // When an append candidate is blocked by same-region/near-duplicate guards,
  // gain-only revision candidates are generated for existing same-sign filters
  // instead of appending a third overlapping filter.
  while (operations < maxOperations) {
    const trend = applyBassSmoothing(curve, "third");
    const trendPoints = trend
      .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
      .map((point) => ({ ...point, deviationDb: deviationAt(trend, point.frequency, anchorDb) }));
    const currentMetrics = completeBandResidualMetrics(trend, assessmentStartHz, assessmentEndHz, anchorDb);
    if (!currentMetrics) break;
    if (currentMetrics.maximumAbsoluteDeviationDb <= fittingToleranceDb) {
      stopReason = "fitting tolerance achieved";
      break;
    }

    // Part D: Peak and valley discovery thresholds are profile-driven. Standard
    // preserves ±2 dB; Accuracy uses ±1 dB so a ±1 dB target can discover
    // materially correctable residuals.
    const peakDiscoveryThresholdDb = Math.max(0.5, Math.min(3, profile.peakDiscoveryThresholdDb ?? fittingToleranceDb));
    const valleyDiscoveryThresholdDb = Math.max(0.5, Math.min(3, profile.valleyDiscoveryThresholdDb ?? fittingToleranceDb));
    const regions = [
      ...findRegions(trendPoints, "peak", peakDiscoveryThresholdDb, valleyDiscoveryThresholdDb),
      ...findRegions(trendPoints, "valley", peakDiscoveryThresholdDb, valleyDiscoveryThresholdDb),
    ].sort((a, b) => b.severityDb - a.severityDb);
    if (!regions.length) break;

    const currentMinimumSpl = minimumSplAcrossBand(curve, assessmentStartHz, assessmentEndHz);
    const currentP14MinimumSpl = minimumSplAcrossBand(trend, assessmentStartHz, assessmentEndHz);
    if (!Number.isFinite(currentMinimumSpl)) break;
    const acceptableCandidates = [];
    const gainScales = [1, 0.75, 0.5];
    const qMultipliers = [1, 1.5, 2, 3];
    // Gentle peak-cut ladder: additional cut candidates derived from the
    // fitter-smoothed region severity. Cuts only — never used for boosts
    // or valleys. Tests whether a gentler cut than the raw-peak ladder
    // provides can pass the acceptance gate.
    const gentlePeakCutGainScales = [0.5, 0.75, 1.0];
    for (const region of regions) {
      const isInsideProtectedNull = isProtectedFrequency(region.centrePoint.frequency, protectedNullRegions);
      const rawCentreSpl = interpolate(raw, region.centrePoint.frequency);
      const targetCentreSpl = anchorDb + artcousticHouseCurveOffsetAt(region.centrePoint.frequency);
      const physicalAuthority = classifyEqCorrectionRegion({
        frequency: region.centrePoint.frequency,
        rawSpl: rawCentreSpl,
        currentSpl: region.centrePoint.spl,
        targetSpl: targetCentreSpl,
        protectedNull: isInsideProtectedNull,
        widthOctaves: region.widthOctaves,
      });
      const isPeak = physicalAuthority.classification === "Peak";
      if (collectDiagnostics) detectedRegions.push({
        iteration: operations + 1,
        startHz: region.startHz,
        centreHz: region.centrePoint.frequency,
        endHz: region.endHz,
        frequencyHz: region.centrePoint.frequency,
        kind: region.kind,
        severityDb: region.severityDb,
        insideProtectedNull: isInsideProtectedNull,
      });
      if (physicalAuthority.classification === "Null") continue;
      // Per-filter and completed-bank limits are fixed at +6 dB / −15 dB.
      const maximumCutDb = profile.maximumCutDb ?? 10;
      const maximumAggregateBoostDb = profile.maximumAggregateBoostDb ?? 6;
      const requestedGainDb = isPeak
        ? -Math.min(maximumCutDb, Math.max(region.severityDb, Math.abs(physicalAuthority.rawResidualDb || 0)) * 0.85)
        : Math.min(maximumAggregateBoostDb, region.severityDb * 0.75);
      const baseCandidate = limitBoostForCapability({
        band: filters.length + 1,
        enabled: true,
        type: "Peak",
        frequencyHz: region.centrePoint.frequency,
        gainDb: requestedGainDb,
        Q: qForRegion(region),
        startHz: region.startHz,
        endHz: region.endHz,
        widthOctaves: region.widthOctaves,
        classification: physicalAuthority.classification,
        expectedAction: physicalAuthority.expectedAction,
        beforeEqSpl: rawCentreSpl,
        targetSpl: targetCentreSpl,
        reason: physicalAuthority.reason,
      }, activeSubs, usableLfHz, options.requestedSystemOutputDb);
      if (Math.abs(baseCandidate.gainDb) <= 0.1 || !validatePhysicalEqAction(physicalAuthority.classification, baseCandidate.gainDb).passed) continue;

      const regionSameSignCount = countSameSignFiltersInRegion(baseCandidate, filters);
      const regionAppendCandidates = [];
      const seenVariants = new Set();

      // Phase 1: Generate and evaluate every append gain/Q variant first.
      // A near-duplicate Q variant does not mean the entire region is append-blocked.
      // Skip append when the filter bank is already at the 10-filter ceiling —
      // only gain revisions to existing filters are tested.
      if (filters.length < 10) {
      // Build the list of (baseGainDb, gainScale) pairs to evaluate.
      // Peaks get the existing raw-peak ladder plus a gentle ladder
      // derived from the smoothed region severity; valleys get only
      // the existing ladder. The gentle ladder is cuts only.
      const gainScaleEntries = isPeak
        ? [
            ...gainScales.map((gainScale) => ({ baseGainDb: baseCandidate.gainDb, gainScale })),
            ...gentlePeakCutGainScales.map((gainScale) => ({ baseGainDb: -region.severityDb, gainScale })),
          ]
        : gainScales.map((gainScale) => ({ baseGainDb: baseCandidate.gainDb, gainScale }));
      for (const { baseGainDb, gainScale } of gainScaleEntries) {
        for (const qMultiplier of qMultipliers) {
          const scaledCandidate = {
            ...baseCandidate,
            gainDb: baseGainDb * gainScale,
            Q: Math.max(0.5, Math.min(10, baseCandidate.Q * qMultiplier)),
          };
          const candidate = scaledCandidate.gainDb > 0
            ? limitBoostForCapability(scaledCandidate, activeSubs, usableLfHz, options.requestedSystemOutputDb)
            : scaledCandidate;
          const variantKey = `${candidate.gainDb.toFixed(4)}:${candidate.Q.toFixed(4)}`;
          if (seenVariants.has(variantKey) || Math.abs(candidate.gainDb) <= 0.1) continue;
          seenVariants.add(variantKey);

          const isDuplicate = isNearDuplicate(candidate, filters);
          const sameRegionCount = countSameSignFiltersInRegion(candidate, filters);
          if (isDuplicate) nearDuplicateRejectedCount++;
          if (sameRegionCount >= 2) sameRegionRejectedCount++;
          if (isDuplicate || sameRegionCount >= 2) continue;

          const gainBeforeBankLimiting = candidate.gainDb;
          const bankResult = scaleCandidateForBankLimits(candidate, filters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb, profile);
          if (!bankResult.filter) { bankLimitRejectedCount++; continue; }
          if (bankResult.scaled) bankLimitScaledCount++;
          const finalCandidate = bankResult.filter;
          const gainAfterBankLimiting = finalCandidate.gainDb;
          const nextCurve = buildCurveFromBank(raw, [...filters, finalCandidate]);
          const nextTrend = applyBassSmoothing(nextCurve, "third");
          const nextMetrics = completeBandResidualMetrics(nextTrend, assessmentStartHz, assessmentEndHz, anchorDb);
          if (!nextMetrics) continue;
          const before = Math.abs(region.centrePoint.deviationDb);
          const after = Math.abs(deviationAt(nextTrend, region.centrePoint.frequency, anchorDb));
          const localImprovementDb = before - after;
          const maximumDeviationReductionDb = currentMetrics.maximumAbsoluteDeviationDb - nextMetrics.maximumAbsoluteDeviationDb;
          const rmsReductionDb = currentMetrics.rmsDeviationDb - nextMetrics.rmsDeviationDb;
          const acousticObjectiveImprovementDb = maximumDeviationReductionDb + 0.35 * rmsReductionDb;
          const normalRefinementAcceptable = localImprovementDb >= 0.05
            && nextMetrics.maximumAbsoluteDeviationDb <= currentMetrics.maximumAbsoluteDeviationDb + 0.05
            && (maximumDeviationReductionDb >= 0.10 || rmsReductionDb >= 0.10);
          const isMajorModalCorrectionCandidate = region.kind === "peak"
            && region.severityDb >= 4
            && !isInsideProtectedNull
            && localImprovementDb >= 1;
          const modalAcceptanceResult = isMajorModalCorrectionCandidate;
          const candidateClassification = modalAcceptanceResult ? "modal correction" : "normal refinement";
          const acceptable = modalAcceptanceResult || normalRefinementAcceptable;
          const acceptanceReason = modalAcceptanceResult
            ? "Accepted: major modal correction passed the modal gate without requiring complete-band improvement."
            : acceptable
              ? "Accepted: normal refinement improved the fixed house-curve objective."
              : `Rejected: normal refinement failed global improvement gate; modal gate ${region.kind !== "peak" ? "requires a peak" : region.severityDb < 4 ? "requires at least 4 dB severity" : isInsideProtectedNull ? "blocked by protected null" : "requires at least 1 dB local improvement"}.`;
          if (collectDiagnostics) candidateAcceptanceDiagnostics.push({
            action: "append",
            classification: candidateClassification,
            frequencyHz: region.centrePoint.frequency,
            proposedGainDb: finalCandidate.gainDb,
            proposedQ: finalCandidate.Q,
            regionKind: region.kind,
            severityDb: region.severityDb,
            insideProtectedNull: isInsideProtectedNull,
            localImprovementDb,
            maximumDeviationReductionDb,
            rmsReductionDb,
            globalImprovement: { maximumDeviationReductionDb, rmsReductionDb },
            normalRefinementAcceptable,
            modalAcceptanceResult,
            majorModalCorrectionAcceptable: modalAcceptanceResult,
            acousticObjectiveImprovementDb,
            accepted: acceptable,
            reason: acceptanceReason,
          });
          if (acceptable) regionAppendCandidates.push({
            action: "append", filter: finalCandidate, replacedFilterIndex: null,
            oldGainDb: null, newGainDb: finalCandidate.gainDb, gainDeltaDb: finalCandidate.gainDb,
            oldQ: null, newQ: finalCandidate.Q, curve: nextCurve,
            maximumDeviationReductionDb, rmsReductionDb, localImprovementDb,
            candidateClassification, acceptanceReason,
            acousticObjectiveImprovementDb,
            gainBeforeBankLimiting, gainAfterBankLimiting, bankLimits: bankResult.limits,
            regionSameSignCount,
          });
        }
      }
      }

      // Phase 2: Generate gain-revision candidates only when no append variant
      // passes all guards and acceptance rules, or the region already contains
      // two same-sign filters and cannot legally accept another filter.
      if (regionAppendCandidates.length === 0 || regionSameSignCount >= 2) {
        const seenRevisionsRegion = new Set();
        for (const gainScale of gainScales) {
          const correctionDelta = baseCandidate.gainDb * gainScale;
          if (Math.abs(correctionDelta) <= 0.1) continue;
          for (let filterIndex = 0; filterIndex < filters.length; filterIndex++) {
            const existingFilter = filters[filterIndex];
            if (!existingFilter.enabled) continue;
            const existingSign = existingFilter.gainDb > 0 ? 1 : -1;
            const correctionSign = correctionDelta > 0 ? 1 : -1;
            if (existingSign !== correctionSign) continue;
            const freqRatio = Math.log2(Math.max(baseCandidate.frequencyHz, existingFilter.frequencyHz) / Math.min(baseCandidate.frequencyHz, existingFilter.frequencyHz));
            if (freqRatio > 1 / 12) continue;
            for (const revisionScale of revisionScales) {
              const proposedGainDelta = correctionDelta * revisionScale;
              const revisionKey = `${region.centrePoint.frequency.toFixed(2)}:${filterIndex}:${proposedGainDelta.toFixed(4)}`;
              if (seenRevisionsRegion.has(revisionKey)) continue;
              seenRevisionsRegion.add(revisionKey);
              const proposedGainDb = existingFilter.gainDb + proposedGainDelta;
              const revisionResult = scaleRevisionForBankLimits(existingFilter, proposedGainDelta, filterIndex, filters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb, profile);
              revisionAttemptCount++;
              const attempt = {
                filterIndex, oldGainDb: existingFilter.gainDb, proposedGainDb,
                acceptedGainDb: revisionResult.filter ? revisionResult.filter.gainDb : existingFilter.gainDb,
                bankMaxBoostDb: revisionResult.limits?.maxAggregateBoostDb ?? null,
                bankMaxBoostHz: revisionResult.limits?.maxAggregateBoostHz ?? null,
                bankMaxCutDb: revisionResult.limits?.maxAggregateCutDb ?? null,
                bankMaxCutHz: revisionResult.limits?.maxAggregateCutHz ?? null,
                maximumDeviationBeforeDb: currentMetrics.maximumAbsoluteDeviationDb,
                maximumDeviationAfterDb: null, rmsBeforeDb: currentMetrics.rmsDeviationDb, rmsAfterDb: null,
                passedRules: false, rejectionReason: null,
              };
              if (!revisionResult.filter) {
                attempt.rejectionReason = "Gain change below 0.1 dB after bank limiting";
                if (collectDiagnostics) revisionAttempts.push(attempt);
                continue;
              }
              const revisedFilter = revisionResult.filter;
              const revisedFilters = filters.map((f, i) => i === filterIndex ? revisedFilter : f);
              const revisedCurve = buildCurveFromBank(raw, revisedFilters);
              const revisedTrend = applyBassSmoothing(revisedCurve, "third");
              const revisedMetrics = completeBandResidualMetrics(revisedTrend, assessmentStartHz, assessmentEndHz, anchorDb);
              if (!revisedMetrics) {
                attempt.rejectionReason = "Could not compute revised metrics";
                if (collectDiagnostics) revisionAttempts.push(attempt);
                continue;
              }
              attempt.maximumDeviationAfterDb = revisedMetrics.maximumAbsoluteDeviationDb;
              attempt.rmsAfterDb = revisedMetrics.rmsDeviationDb;
              const before = Math.abs(region.centrePoint.deviationDb);
              const after = Math.abs(deviationAt(revisedTrend, region.centrePoint.frequency, anchorDb));
              const localImprovementDb = before - after;
              const maximumDeviationReductionDb = currentMetrics.maximumAbsoluteDeviationDb - revisedMetrics.maximumAbsoluteDeviationDb;
              const rmsReductionDb = currentMetrics.rmsDeviationDb - revisedMetrics.rmsDeviationDb;
              const acousticObjectiveImprovementDb = maximumDeviationReductionDb + 0.35 * rmsReductionDb;
              const normalRefinementAcceptable = localImprovementDb >= 0.05
                && revisedMetrics.maximumAbsoluteDeviationDb <= currentMetrics.maximumAbsoluteDeviationDb + 0.05
                && (maximumDeviationReductionDb >= 0.10 || rmsReductionDb >= 0.10);
              const isMajorModalCorrectionCandidate = region.kind === "peak"
                && region.severityDb >= 4
                && !isInsideProtectedNull
                && localImprovementDb >= 1;
              const modalAcceptanceResult = isMajorModalCorrectionCandidate;
              const candidateClassification = modalAcceptanceResult ? "modal correction" : "normal refinement";
              const acceptable = modalAcceptanceResult || normalRefinementAcceptable;
              const acceptanceReason = modalAcceptanceResult
                ? "Accepted: major modal correction passed the modal gate without requiring complete-band improvement."
                : acceptable
                  ? "Accepted: normal refinement improved the fixed house-curve objective."
                  : `Rejected: normal refinement failed global improvement gate; modal gate ${region.kind !== "peak" ? "requires a peak" : region.severityDb < 4 ? "requires at least 4 dB severity" : isInsideProtectedNull ? "blocked by protected null" : "requires at least 1 dB local improvement"}.`;
              if (collectDiagnostics) candidateAcceptanceDiagnostics.push({
                action: "revise",
                classification: candidateClassification,
                frequencyHz: region.centrePoint.frequency,
                proposedGainDb: revisedFilter.gainDb,
                proposedQ: revisedFilter.Q,
                regionKind: region.kind,
                severityDb: region.severityDb,
                insideProtectedNull: isInsideProtectedNull,
                localImprovementDb,
                maximumDeviationReductionDb,
                rmsReductionDb,
                globalImprovement: { maximumDeviationReductionDb, rmsReductionDb },
                normalRefinementAcceptable,
                majorModalCorrectionAcceptable: isMajorModalCorrectionCandidate,
                acousticObjectiveImprovementDb,
                accepted: acceptable,
                reason: acceptanceReason,
              });
              attempt.classification = candidateClassification;
              attempt.localImprovementDb = localImprovementDb;
              attempt.maximumDeviationReductionDb = maximumDeviationReductionDb;
              attempt.rmsReductionDb = rmsReductionDb;
              attempt.passedRules = acceptable;
              if (!acceptable) attempt.rejectionReason = acceptanceReason;
              if (collectDiagnostics) revisionAttempts.push(attempt);
              if (acceptable) {
                revisionPassedAcceptanceCount++;
                acceptableCandidates.push({
                  action: "revise", filter: revisedFilter, replacedFilterIndex: filterIndex,
                  oldGainDb: existingFilter.gainDb, newGainDb: revisedFilter.gainDb,
                  gainDeltaDb: revisedFilter.gainDb - existingFilter.gainDb,
                  oldQ: existingFilter.Q, newQ: existingFilter.Q, curve: revisedCurve,
                  maximumDeviationReductionDb, rmsReductionDb, localImprovementDb,
                  candidateClassification, acceptanceReason,
                  acousticObjectiveImprovementDb,
                  bankLimits: revisionResult.limits, regionSameSignCount,
                });
              }
            }
          }
        }
      }

      acceptableCandidates.push(...regionAppendCandidates);
    }

    // Part C: Candidate ranking — quantize max-deviation to 0.05 dB steps so
    // insignificant floating-point differences don't select a revision with
    // materially worse RMS. After max-deviation, RMS and local improvement,
    // prefer a legal append (preserves filter-shape flexibility), then lower
    // gain cost, then lower Q.
    acceptableCandidates.sort((a, b) => {
      const aMaxDev = Math.round(a.maximumDeviationReductionDb / 0.05);
      const bMaxDev = Math.round(b.maximumDeviationReductionDb / 0.05);
      if (bMaxDev !== aMaxDev) return bMaxDev - aMaxDev;
      if (Math.abs(b.rmsReductionDb - a.rmsReductionDb) > 0.05) return b.rmsReductionDb - a.rmsReductionDb;
      if (Math.abs(b.localImprovementDb - a.localImprovementDb) > 0.05) return b.localImprovementDb - a.localImprovementDb;
      if (a.action !== b.action) return a.action === "append" ? -1 : 1;
      if (Math.abs(Math.abs(a.gainDeltaDb) - Math.abs(b.gainDeltaDb)) > 0.05) return Math.abs(a.gainDeltaDb) - Math.abs(b.gainDeltaDb);
      return a.filter.Q - b.filter.Q;
    });
    const chosen = acceptableCandidates[0];
    if (collectDiagnostics) candidateSelectionDiagnostics.push({
      iteration: operations + 1,
      acceptableCandidatesCount: acceptableCandidates.length,
      sortedCandidateOrder: acceptableCandidates.map((candidate, index) => ({
        rank: index + 1,
        action: candidate.action,
        frequencyHz: candidate.filter?.frequencyHz ?? null,
        gainDb: candidate.filter?.gainDb ?? null,
        Q: candidate.filter?.Q ?? null,
        classification: candidate.candidateClassification || null,
        acousticObjectiveImprovementDb: candidate.acousticObjectiveImprovementDb ?? null,
      })),
      chosen: chosen ? {
        action: chosen.action,
        frequencyHz: chosen.filter?.frequencyHz ?? null,
        gainDb: chosen.filter?.gainDb ?? null,
        Q: chosen.filter?.Q ?? null,
        classification: chosen.candidateClassification || null,
      } : null,
      rejectionReason: acceptableCandidates.length > 0 && !chosen ? "Candidates remained after sorting but no chosen candidate was produced." : null,
    });
    if (!chosen) break;

    if (chosen.action === "append" && filters.length >= 10) {
      stopReason = "ten-band ceiling reached";
      break;
    }
    if (chosen.action === "append") {
      filters.push(chosen.filter);
    } else {
      filters[chosen.replacedFilterIndex] = chosen.filter;
      selectedRevisionOperationCount++;
    }
    curve = buildCurveFromBank(raw, filters);
    const checkpoint = buildCheckpoint({
      filters, curve, originalTrend: thirdOctave,
      assessmentStartHz, assessmentEndHz, anchorDb, fittingToleranceDb,
    });
    checkpoints.push(checkpoint);
    if (collectDiagnostics) iterationTrace.push({
      iteration: operations + 1, action: chosen.action, replacedFilterIndex: chosen.replacedFilterIndex,
      selectedFrequencyHz: chosen.filter.frequencyHz, gainDb: chosen.filter.gainDb, Q: chosen.filter.Q,
      oldGainDb: chosen.oldGainDb, newGainDb: chosen.newGainDb, gainDeltaDb: chosen.gainDeltaDb,
      oldQ: chosen.oldQ, newQ: chosen.newQ,
      candidateClassification: chosen.candidateClassification,
      localImprovementDb: chosen.localImprovementDb,
      maximumDeviationReductionDb: chosen.maximumDeviationReductionDb,
      rmsReductionDb: chosen.rmsReductionDb,
      acceptanceReason: chosen.acceptanceReason,
      maximumDeviationBeforeDb: currentMetrics.maximumAbsoluteDeviationDb,
      maximumDeviationAfterDb: checkpoint.maximumAbsoluteDeviationDb,
      rmsBeforeDb: currentMetrics.rmsDeviationDb, rmsAfterDb: checkpoint.rmsDeviationDb,
      rawMinimumSplBeforeDb: currentMinimumSpl, rawMinimumSplAfterDb: checkpoint.rawMinimumSpl,
      smoothedMinimumSplBeforeDb: currentP14MinimumSpl,
      smoothedMinimumSplAfterDb: checkpoint.smoothedMinimumSpl,
      broadBelowTargetWorsening: checkpoint.broadBelowTargetWorsening,
      gainBeforeBankLimiting: chosen.gainBeforeBankLimiting, gainAfterBankLimiting: chosen.gainAfterBankLimiting,
      aggregateMaxBoostAfterDb: chosen.bankLimits?.maxAggregateBoostDb ?? 0,
      aggregateMaxBoostAfterHz: chosen.bankLimits?.maxAggregateBoostHz ?? null,
      aggregateMaxCutAfterDb: chosen.bankLimits?.maxAggregateCutDb ?? 0,
      aggregateMaxCutAfterHz: chosen.bankLimits?.maxAggregateCutHz ?? null,
    });
    operations++;
  }
  if (operations >= maxOperations && stopReason === "no safe improvement remained") stopReason = "operation ceiling reached";

  // Select only by fixed-target acoustic error. Capability is assessed after EQ.
  const baselineCheckpoint = checkpoints[0];
  const finiteCheckpoints = checkpoints.filter((checkpoint) =>
    Number.isFinite(checkpoint.maximumAbsoluteDeviationDb) && Number.isFinite(checkpoint.rmsDeviationDb));
  const selectedCheckpoint = [...(finiteCheckpoints.length ? finiteCheckpoints : [baselineCheckpoint])].sort((a, b) =>
    a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb
    || a.rmsDeviationDb - b.rmsDeviationDb
    || a.filters.length - b.filters.length)[0];
  const selectionReason = collectDiagnostics
    ? `Fixed house-curve checkpoint selected: lowest maximum absolute deviation (${selectedCheckpoint.maximumAbsoluteDeviationDb.toFixed(2)} dB), then RMS (${selectedCheckpoint.rmsDeviationDb.toFixed(2)} dB), then fewest filters (${selectedCheckpoint.filters.length}).`
    : null;
  const checkpointSummaries = collectDiagnostics ? checkpoints.map((checkpoint, index) => {
    const selected = checkpoint === selectedCheckpoint;
    const finite = Number.isFinite(checkpoint.maximumAbsoluteDeviationDb) && Number.isFinite(checkpoint.rmsDeviationDb);
    return {
      index,
      enabledFilterCount: checkpoint.filters.length,
      maximumAbsoluteDeviationDb: checkpoint.maximumAbsoluteDeviationDb,
      rmsDeviationDb: checkpoint.rmsDeviationDb,
      worstResidualFrequencyHz: checkpoint.worstResidualFrequencyHz,
      broadBelowTargetWorsening: checkpoint.broadBelowTargetWorsening,
      selected,
      selectionEligibility: selected ? "selected" : finite ? "fixed-target-eligible" : "non-finite-metrics",
      reasonExcluded: selected ? null : finite
        ? "Higher fixed-target maximum deviation, RMS, or filter count than the selected checkpoint."
        : "Non-finite maximum-deviation or RMS excluded this checkpoint.",
    };
  }) : [];

  // Seed selection — a physically valid checkpoint with enabled filters that
  // improves RMS meaningfully without worsening max residual by more than a
  // small acoustic tolerance. This seed may differ from the selected checkpoint
  // (which is chosen purely by lowest max deviation) and is used to seed the
  // Accuracy and house-curve fitters so they start from a useful correction
  // rather than an empty bank.
  const MAX_RESIDUAL_SEED_TOLERANCE_DB = 0.10;
  const MIN_RMS_SEED_IMPROVEMENT_DB = 0.20;
  const baselineRmsDeviationDb = baselineCheckpoint.rmsDeviationDb;
  const baselineMaxDeviationDb = baselineCheckpoint.maximumAbsoluteDeviationDb;
  const seedEligibleCheckpoints = finiteCheckpoints.filter((checkpoint) => {
    if (checkpoint.filters.length === 0) return false;
    if (checkpoint.broadBelowTargetWorsening) return false;
    if (!Number.isFinite(baselineRmsDeviationDb) || !Number.isFinite(baselineMaxDeviationDb)) return false;
    const rmsImprovementDb = baselineRmsDeviationDb - checkpoint.rmsDeviationDb;
    const maxResidualWorseningDb = checkpoint.maximumAbsoluteDeviationDb - baselineMaxDeviationDb;
    return rmsImprovementDb >= MIN_RMS_SEED_IMPROVEMENT_DB
      && maxResidualWorseningDb <= MAX_RESIDUAL_SEED_TOLERANCE_DB;
  }).sort((a, b) =>
    a.rmsDeviationDb - b.rmsDeviationDb
    || a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb
    || a.filters.length - b.filters.length);
  // Verify aggregate boost/cut limits for each seed-eligible checkpoint in
  // rank order. Pick the first that passes all bank limits — physical
  // validation and protected-null rules are already guaranteed by the
  // checkpoint creation loop, so only the aggregate limit check remains.
  let seedCheckpoint = null;
  for (const checkpoint of seedEligibleCheckpoints) {
    const limits = evaluateProvisionalBankLimits(
      checkpoint.filters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb, profile,
    );
    if (limits.allOk) {
      seedCheckpoint = checkpoint;
      break;
    }
  }
  const standardSeedFilters = seedCheckpoint
    ? seedCheckpoint.filters.map((filter) => ({ ...filter }))
    : [];
  const seedSelectionReason = !collectDiagnostics ? null : seedCheckpoint
    ? `Seed checkpoint selected: RMS improved by ${(baselineRmsDeviationDb - seedCheckpoint.rmsDeviationDb).toFixed(3)} dB vs baseline, max residual worsened by ${(seedCheckpoint.maximumAbsoluteDeviationDb - baselineMaxDeviationDb).toFixed(3)} dB (within ${MAX_RESIDUAL_SEED_TOLERANCE_DB} dB tolerance).`
    : "No seed checkpoint qualified: no checkpoint with enabled filters met the RMS improvement and max residual tolerance criteria.";

  const selectedFilters = selectedCheckpoint.filters;
  const filterBank = emptyFilters(selectedFilters);
  const combinedEqCurve = raw.map((point) => ({
    frequency: point.frequency,
    spl: selectedFilters.reduce((sum, filter) => sum + peakingEqResponseDb(point.frequency, filter), 0),
  }));
  curve = raw.map((point, index) => ({
    frequency: point.frequency,
    spl: point.spl + combinedEqCurve[index].spl,
  }));

  // Worst-residual fixed-limit diagnostics for the selected checkpoint.
  // Uses requested P19 tolerance and retains up to 8
  // distinct residual regions (1/12-octave separation) — diagnostic only.
  const requestedP19ToleranceDb = Number.isFinite(Number(options.targetToleranceDb)) ? Number(options.targetToleranceDb) : 0;
  const selectedTrend = selectedCheckpoint.trend;
  const sortedResidualPoints = (Array.isArray(selectedTrend) ? selectedTrend : [])
    .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .map((point) => {
      const targetDb = anchorDb + artcousticHouseCurveOffsetAt(point.frequency);
      const signedResidualDb = point.spl - targetDb;
      return {
        frequency: point.frequency,
        targetDb,
        postEqSmoothedSpl: point.spl,
        signedResidualDb,
        absoluteResidualDb: Math.abs(signedResidualDb),
      };
    })
    .sort((a, b) => b.absoluteResidualDb - a.absoluteResidualDb);
  // Part F: Retain up to 8 distinct residual regions (1/12-octave separation)
  const distinctResidualPoints = [];
  for (const point of sortedResidualPoints) {
    const isDistinct = distinctResidualPoints.every((retained) =>
      Math.log2(Math.max(point.frequency, retained.frequency) / Math.min(point.frequency, retained.frequency)) > 1 / 12
    );
    if (isDistinct) distinctResidualPoints.push(point);
    if (distinctResidualPoints.length >= 8) break;
  }
  const worstResidualDiagnostics = collectDiagnostics ? distinctResidualPoints.map((point) => {
    const aggregateEqDb = aggregateResponseDbAt(point.frequency, selectedFilters);
    const boostAllowance = getSourceDomainBoostAllowance({
      frequency: point.frequency, requestedBoostDb: 6, activeSubs, usableLfHz,
      maxBoostDb: 6, requestedSystemOutputDb: options.requestedSystemOutputDb,
    });
    const sourceDomainAllowedBoostDb = boostAllowance.allowedBoostDb;
    const lfRampFraction = boostAllowance.lfRampFraction;
    const remainingPointBoostDb = Math.max(0, sourceDomainAllowedBoostDb - Math.max(0, aggregateEqDb));
    const isBelowTarget = point.signedResidualDb < 0;
    const requiredBoostToTargetDb = isBelowTarget ? Math.abs(point.signedResidualDb) : 0;
    const requiredBoostToP19ToleranceDb = isBelowTarget ? Math.max(0, Math.abs(point.signedResidualDb) - requestedP19ToleranceDb) : 0;
    const fullTargetCapabilityLimited = isBelowTarget && requiredBoostToTargetDb > remainingPointBoostDb;
    const p19ToleranceCapabilityLimited = isBelowTarget && requiredBoostToP19ToleranceDb > remainingPointBoostDb;
    return {
      frequency: point.frequency,
      targetSpl: point.targetDb,
      postEqSmoothedSpl: point.postEqSmoothedSpl,
      signedResidualDb: point.signedResidualDb,
      absoluteResidualDb: point.absoluteResidualDb,
      aggregateEqContributionDb: aggregateEqDb,
      sourceDomainPermittedTotalBoostDb: sourceDomainAllowedBoostDb,
      remainingPointBoostDb,
      requiredBoostToTargetDb,
      requiredBoostToP19ToleranceDb,
      fullTargetBoostLimited: fullTargetCapabilityLimited,
      p19ToleranceBoostLimited: p19ToleranceCapabilityLimited,
      usableLfRampFraction: lfRampFraction,
    };
  }) : [];

  const finalBankLimits = evaluateProvisionalBankLimits(selectedFilters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb, profile);
  const sameRegionFilterCount = maxSameRegionFilterCount(selectedFilters);
  const diagnosticTargetCurve = canonicalTargetCurve.length
    ? canonicalTargetCurve
    : raw.map((point) => ({ frequency: point.frequency, spl: anchorDb + artcousticHouseCurveOffsetAt(point.frequency) }));
  const filterDecisionDiagnostics = buildFilterDecisionDiagnostics(
    selectedFilters, raw, curve, diagnosticTargetCurve, protectedNullRegions,
  );
  const physicalAuthorityViolations = findAggregatePeakBoostViolations(raw, curve, diagnosticTargetCurve);

  return {
    curve,
    filters: filterBank,
    combinedEqCurve,
    fitterHouseCurveTarget: canonicalTargetCurve.length
      ? canonicalTargetCurve.map((point) => ({ ...point }))
      : sortedResidualPoints.map(({ frequency, targetDb }) => ({ frequency, spl: targetDb })).sort((a, b) => a.frequency - b.frequency),
    iterationTrace,
    stopReason,
    // Part D: Effective profile contract — identifies the selected profile and
    // its configuration so callers can distinguish it from the requested P19
    // tolerance. Requested P19 tolerance is separate from the profile fitting
    // tolerance.
    designEqFitProfile: profile.id,
    designEqFitProfileConfig: {
      preserveP14: profile.preserveP14,
      fittingToleranceDb,
      maximumCutDb: profile.maximumCutDb,
      maximumAggregateBoostDb: profile.maximumAggregateBoostDb,
      peakDiscoveryThresholdDb: profile.peakDiscoveryThresholdDb,
      valleyDiscoveryThresholdDb: profile.valleyDiscoveryThresholdDb,
    },
    requestedP19ToleranceDb,
    selectedCheckpoint: {
      enabledFilterCount: selectedFilters.length,
      maximumAbsoluteDeviationDb: selectedCheckpoint.maximumAbsoluteDeviationDb,
      rmsDeviationDb: selectedCheckpoint.rmsDeviationDb,
      worstResidualFrequencyHz: selectedCheckpoint.worstResidualFrequencyHz,
      rawMinimumSpl: selectedCheckpoint.rawMinimumSpl,
      smoothedMinimumSpl: selectedCheckpoint.smoothedMinimumSpl,
      minimumSpl: selectedCheckpoint.smoothedMinimumSpl,
      broadBelowTargetWorsening: selectedCheckpoint.broadBelowTargetWorsening,
    },
    standardSeedFilters,
    bestSeedFilters: standardSeedFilters,
    seedCheckpoint: seedCheckpoint ? {
      enabledFilterCount: seedCheckpoint.filters.length,
      maximumAbsoluteDeviationDb: seedCheckpoint.maximumAbsoluteDeviationDb,
      rmsDeviationDb: seedCheckpoint.rmsDeviationDb,
      worstResidualFrequencyHz: seedCheckpoint.worstResidualFrequencyHz,
      broadBelowTargetWorsening: seedCheckpoint.broadBelowTargetWorsening,
    } : null,
    seedSelectionReason,
    checkpointSummaries,
    detectedRegions,
    candidateAcceptanceDiagnostics,
    candidateSelectionDiagnostics,
    filterDecisionDiagnostics,
    physicalEqAuthorityPassed: physicalAuthorityViolations.length === 0,
    physicalAuthorityViolations,
    worstResidualDiagnostics,
    selectionReason,
    lfCapabilityProtection: null,
    bankDiagnostics: {
      evaluatedVariantsScaledByBankLimit: bankLimitScaledCount,
      evaluatedVariantsRejectedByBankLimit: bankLimitRejectedCount,
      evaluatedVariantsRejectedAsNearDuplicates: nearDuplicateRejectedCount,
      evaluatedVariantsRejectedBySameRegionGuard: sameRegionRejectedCount,
      completedBankEvaluationCount: getDesignEqBankEvaluationCount(),
      selectedBankLimits: {
        maxAggregateBoostDb: finalBankLimits.maxAggregateBoostDb,
        maxAggregateBoostHz: finalBankLimits.maxAggregateBoostHz,
        maxAggregateCutDb: finalBankLimits.maxAggregateCutDb,
        maxAggregateCutHz: finalBankLimits.maxAggregateCutHz,
        limitingPermittedBoostDb: finalBankLimits.limitingPermittedBoostDb,
        boostLimitOk: finalBankLimits.boostLimitOk,
        cutLimitOk: finalBankLimits.cutLimitOk,
        sourceDomainHeadroomOk: finalBankLimits.sourceDomainHeadroomOk,
        allOk: finalBankLimits.allOk,
        sameRegionFilterCount,
      },
    },
    revisionDiagnostics: {
      revisionAttemptCount,
      revisionPassedAcceptanceCount,
      selectedRevisionOperationCount,
      attempts: revisionAttempts,
    },
    diagnostics: collectDiagnostics ? curve.map((point, index) => ({
      frequency: point.frequency,
      targetDb: anchorDb + artcousticHouseCurveOffsetAt(point.frequency),
      trendDb: interpolate(thirdOctave, point.frequency),
      appliedCorrectionDb: combinedEqCurve[index].spl,
    })) : [],
    __designEqTrace__: {
      inputCollectDiagnostics: collectDiagnostics,
      detectedRegionCount: detectedRegions.length,
      appendTrialCount: candidateAcceptanceDiagnostics.filter((d) => d.action === "append").length,
      revisionTrialCount: candidateAcceptanceDiagnostics.filter((d) => d.action === "revise").length,
      candidateAcceptanceDiagnosticsCount: candidateAcceptanceDiagnostics.length,
      stopReason,
    },
  };
}

export function applyDesignEqCurve(curveData, usableLfHz, activeSubs = []) {
  return calculateDesignEqCurve(curveData, usableLfHz, activeSubs).curve;
}

// Shared utilities for the seat-aware house-curve fitter (houseCurveFitter.js).
export { normaliseCurve, findRegions, qForRegion };

export {
  limitBoostForCapability,
  evaluateProvisionalBankLimits,
  scaleCandidateForBankLimits,
  isNearDuplicate,
  countSameSignFiltersInRegion,
  buildCurveFromBank,
  emptyFilters,
  peakingEqResponseDb,
} from "@/components/utils/designEqBankLimits";