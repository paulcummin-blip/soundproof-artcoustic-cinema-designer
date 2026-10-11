(function() {
  "use strict";
  const WINDOW_CACHE_LIMIT = 8;
  const windowBoundsCache = /* @__PURE__ */ new Map();
  function fractionalWindowBounds(sorted, width) {
    const key = `${width}:${sorted.map((point) => point.frequency).join(",")}`;
    const cached = windowBoundsCache.get(key);
    if (cached) return cached;
    let lowIndex = 0;
    let highIndex = 0;
    const bounds = sorted.map(({ frequency }) => {
      const fLow = frequency * Math.pow(2, -0.5 / width);
      const fHigh = frequency * Math.pow(2, 0.5 / width);
      while (lowIndex < sorted.length && sorted[lowIndex].frequency < fLow) lowIndex++;
      if (highIndex < lowIndex) highIndex = lowIndex;
      while (highIndex < sorted.length && sorted[highIndex].frequency <= fHigh) highIndex++;
      return [lowIndex, highIndex];
    });
    windowBoundsCache.set(key, bounds);
    while (windowBoundsCache.size > WINDOW_CACHE_LIMIT) windowBoundsCache.delete(windowBoundsCache.keys().next().value);
    return bounds;
  }
  function prepareBassSmoothingGrid(data, mode) {
    if (!Array.isArray(data) || data.length < 3 || mode === "none") return { sorted: data, bounds: null };
    const width = mode === "sixth" ? 6 : mode === "third" ? 3 : mode === "octave" ? 1 : null;
    if (!width) return { sorted: data, bounds: null };
    const sorted = [...data].sort((a, b) => a.frequency - b.frequency);
    return { sorted, bounds: fractionalWindowBounds(sorted, width) };
  }
  function smoothFractionalOctave(data, width) {
    if (!Array.isArray(data) || data.length < 3) return data;
    const mode = width === 6 ? "sixth" : width === 3 ? "third" : "octave";
    const { sorted, bounds } = prepareBassSmoothingGrid(data, mode);
    return sorted.map(({ frequency }, pointIndex) => {
      const [start, end] = bounds[pointIndex];
      let powerSum = 0;
      let count = 0;
      for (let index = start; index < end; index++) {
        const spl = sorted[index].spl;
        if (!Number.isFinite(spl)) continue;
        powerSum += Math.pow(10, spl / 10);
        count++;
      }
      return { frequency, spl: count === 0 ? null : 10 * Math.log10(powerSum / count) };
    });
  }
  function applyBassSmoothing(data, mode) {
    if (!Array.isArray(data) || data.length === 0) return data;
    if (mode === "sixth") return smoothFractionalOctave(data, 6);
    if (mode === "third") return smoothFractionalOctave(data, 3);
    if (mode === "octave") return smoothFractionalOctave(data, 1);
    return data;
  }
  const ARTCOUSTIC_HOUSE_CURVE = [
    { frequency: 15, offsetDb: 6 },
    { frequency: 20, offsetDb: 6 },
    { frequency: 30, offsetDb: 6 },
    { frequency: 40, offsetDb: 5 },
    { frequency: 50, offsetDb: 4 },
    { frequency: 63, offsetDb: 3 },
    { frequency: 80, offsetDb: 2.5 },
    { frequency: 100, offsetDb: 2 },
    { frequency: 120, offsetDb: 1.5 },
    { frequency: 150, offsetDb: 1.2 },
    { frequency: 200, offsetDb: 0.8 },
    { frequency: 400, offsetDb: 0 }
  ];
  function artcousticHouseCurveOffsetAt(frequency) {
    if (!Number.isFinite(Number(frequency)) || frequency <= ARTCOUSTIC_HOUSE_CURVE[0].frequency) return 6;
    const last = ARTCOUSTIC_HOUSE_CURVE[ARTCOUSTIC_HOUSE_CURVE.length - 1];
    if (frequency >= last.frequency) return 0;
    for (let index = 0; index < ARTCOUSTIC_HOUSE_CURVE.length - 1; index += 1) {
      const low = ARTCOUSTIC_HOUSE_CURVE[index];
      const high = ARTCOUSTIC_HOUSE_CURVE[index + 1];
      if (frequency >= low.frequency && frequency <= high.frequency) {
        const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
        return low.offsetDb + (high.offsetDb - low.offsetDb) * ratio;
      }
    }
    return 0;
  }
  const median$1 = (values) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  function deriveProductionEqVerticalAnchor(rawCurve) {
    const smoothed = applyBassSmoothing(rawCurve || [], "third").map((point) => ({ frequency: Number(point == null ? void 0 : point.frequency), spl: Number(point == null ? void 0 : point.spl) })).filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.spl));
    if (!smoothed.length) return null;
    const referenceBand = smoothed.filter((point) => point.frequency >= 150 && point.frequency <= 200);
    return median$1((referenceBand.length ? referenceBand : smoothed).map((point) => point.spl));
  }
  const HOUSE_CURVE_P19_START_HZ = 20;
  const HOUSE_CURVE_P19_END_HZ = 120;
  const HOUSE_CURVE_CORRECTION_START_HZ = 20;
  function resolveHouseCurveDomains(frequencyGrid, configuredCorrectionEndHz, configuredTransitionHz = HOUSE_CURVE_P19_END_HZ) {
    const finite2 = (frequencyGrid || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const availableStartHz = finite2[0] ?? null;
    const availableEndHz = finite2.at(-1) ?? null;
    const correctionStartHz = Math.max(HOUSE_CURVE_CORRECTION_START_HZ, availableStartHz ?? HOUSE_CURVE_CORRECTION_START_HZ);
    const requestedEnd = Number.isFinite(configuredCorrectionEndHz) ? configuredCorrectionEndHz : availableEndHz;
    const correctionEndHz = Math.min(requestedEnd ?? HOUSE_CURVE_P19_END_HZ, availableEndHz ?? requestedEnd ?? HOUSE_CURVE_P19_END_HZ);
    const requestedTransitionHz = Number.isFinite(Number(configuredTransitionHz)) && Number(configuredTransitionHz) > 0 ? Number(configuredTransitionHz) : HOUSE_CURVE_P19_END_HZ;
    return {
      p19StartHz: Math.max(HOUSE_CURVE_P19_START_HZ, availableStartHz ?? HOUSE_CURVE_P19_START_HZ),
      // RP22 P19/P20 end at the room's calculated transition (Schroeder)
      // frequency. The 200 Hz PEQ correction limit is a separate domain.
      p19EndHz: Math.min(requestedTransitionHz, availableEndHz ?? requestedTransitionHz),
      correctionStartHz,
      correctionEndHz
    };
  }
  function buildCanonicalAbsoluteHouseCurveTarget({ frequencyGrid, targetAnchorDb, correctionStartHz, correctionEndHz }) {
    if (!Number.isFinite(targetAnchorDb)) return [];
    return (frequencyGrid || []).map(Number).filter((frequency) => Number.isFinite(frequency) && frequency >= correctionStartHz && frequency <= correctionEndHz).sort((a, b) => a - b).map((frequency) => ({ frequency, spl: targetAnchorDb + artcousticHouseCurveOffsetAt(frequency) }));
  }
  function interpolateCanonicalTarget(targetCurve, frequency) {
    if (!Array.isArray(targetCurve) || !targetCurve.length || !Number.isFinite(frequency)) return null;
    if (frequency <= targetCurve[0].frequency) return targetCurve[0].spl;
    if (frequency >= targetCurve.at(-1).frequency) return targetCurve.at(-1).spl;
    const upperIndex = targetCurve.findIndex((point) => point.frequency >= frequency);
    const low = targetCurve[upperIndex - 1];
    const high = targetCurve[upperIndex];
    const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
    return low.spl + (high.spl - low.spl) * ratio;
  }
  function requiredCorrectionDb(targetSplDb, currentPostEqSplDb) {
    if (!Number.isFinite(targetSplDb) || !Number.isFinite(currentPostEqSplDb)) return null;
    return targetSplDb - currentPostEqSplDb;
  }
  function resolveRequiredCorrectionDb({ targetSplDb, currentPostEqSplDb, protectedNull = false }) {
    const required = requiredCorrectionDb(targetSplDb, currentPostEqSplDb);
    if (!Number.isFinite(required)) return null;
    return protectedNull && required > 0 ? 0 : required;
  }
  const octaveWidth$1 = (startHz, endHz) => startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;
  const MAX_PROTECTED_NULL_WIDTH_HZ = 6;
  function identifyProtectedNullRegions(curve, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, canonicalTargetCurve = null) {
    const nullThresholdDb = -10;
    const boundaryThresholdDb = -6;
    const points = (Array.isArray(curve) ? curve : []).filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.spl) && point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz).map((point, index) => ({
      ...point,
      assessmentIndex: index,
      residualDb: point.spl - (interpolateCanonicalTarget(canonicalTargetCurve, point.frequency) ?? anchorDb + artcousticHouseCurveOffsetAt(point.frequency))
    }));
    const median2 = (values) => {
      const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
      if (!sorted.length) return null;
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const shoulderForFrequencyRange = (minimumHz, maximumHz) => {
      const samples = points.filter((candidate) => candidate.frequency >= minimumHz && candidate.frequency <= maximumHz);
      const medianSplDb = median2(samples.map((candidate) => candidate.spl));
      if (!Number.isFinite(medianSplDb)) return null;
      const representative = samples.reduce((nearest, candidate) => !nearest || Math.abs(candidate.spl - medianSplDb) < Math.abs(nearest.spl - medianSplDb) ? candidate : nearest, null);
      return representative ? {
        index: representative.assessmentIndex,
        frequencyHz: representative.frequency,
        splDb: representative.spl,
        medianSplDb
      } : null;
    };
    const localized = points.map((point, index) => {
      const leftShoulder = shoulderForFrequencyRange(point.frequency / 2 ** (2 / 3), point.frequency / 2 ** (1 / 4));
      const rightShoulder = shoulderForFrequencyRange(point.frequency * 2 ** (1 / 4), point.frequency * 2 ** (2 / 3));
      const shoulderReferenceSplDb = leftShoulder && rightShoulder ? (leftShoulder.splDb + rightShoulder.splDb) / 2 : null;
      const nullDepthDb = Number.isFinite(shoulderReferenceSplDb) ? point.spl - shoulderReferenceSplDb : null;
      const previous = points[index - 1];
      const next = points[index + 1];
      const isLocalMinimum = !!previous && !!next && point.spl <= previous.spl && point.spl <= next.spl && (point.spl < previous.spl || point.spl < next.spl);
      return {
        ...point,
        leftShoulder,
        rightShoulder,
        shoulderReferenceSplDb,
        neighbouringShoulderSplDb: shoulderReferenceSplDb,
        nullDepthDb,
        isLocalMinimum
      };
    });
    const regions = [];
    const localMinima = localized.filter((point) => point.isLocalMinimum && point.nullDepthDb <= nullThresholdDb && Number.isFinite(point.shoulderReferenceSplDb)).sort((a, b) => a.nullDepthDb - b.nullDepthDb);
    for (const worst of localMinima) {
      let startIndex = worst.assessmentIndex;
      let endIndex = worst.assessmentIndex;
      const depthFromFixedShoulders = (point) => point.spl - worst.shoulderReferenceSplDb;
      while (startIndex > 0 && depthFromFixedShoulders(localized[startIndex - 1]) <= boundaryThresholdDb) startIndex--;
      while (endIndex < localized.length - 1 && depthFromFixedShoulders(localized[endIndex + 1]) <= boundaryThresholdDb) endIndex++;
      const startHz = localized[startIndex].frequency;
      const endHz = localized[endIndex].frequency;
      const widthHz = endHz - startHz;
      const widthOctaves = octaveWidth$1(startHz, endHz);
      const narrowCancellation = widthHz <= MAX_PROTECTED_NULL_WIDTH_HZ + 1e-9;
      if (!narrowCancellation) {
        continue;
      }
      if (regions.some((region) => startHz <= region.endHz && endHz >= region.startHz)) continue;
      const requiredBoostDb = Math.max(0, -worst.residualDb);
      const permittedBoostDb = 6;
      const capabilityLimited = requiredBoostDb > permittedBoostDb + 1e-9;
      const protectionPaddingHz = Math.max(0.25, Math.min(1, widthHz * 0.1));
      const reason = `Narrow cancellation null (≤ ${MAX_PROTECTED_NULL_WIDTH_HZ} Hz) at least 10 dB below neighbouring broad response`;
      regions.push({
        startHz: Math.max(assessmentStartHz, startHz - protectionPaddingHz),
        endHz: Math.min(assessmentEndHz, endHz + protectionPaddingHz),
        widthHz,
        widthOctaves,
        centreFrequencyHz: worst.frequency,
        signedResidualDb: worst.residualDb,
        centreAssessmentIndex: worst.assessmentIndex,
        centreSplDb: worst.spl,
        leftShoulderIndex: worst.leftShoulder.index,
        leftShoulderFrequencyHz: worst.leftShoulder.frequencyHz,
        leftShoulderSplDb: worst.leftShoulder.splDb,
        rightShoulderIndex: worst.rightShoulder.index,
        rightShoulderFrequencyHz: worst.rightShoulder.frequencyHz,
        rightShoulderSplDb: worst.rightShoulder.splDb,
        shoulderReferenceSplDb: worst.shoulderReferenceSplDb,
        nullDepthDb: worst.nullDepthDb,
        nullDepthThresholdDb: nullThresholdDb,
        localMinimum: worst.isLocalMinimum,
        protected: true,
        assessmentCurveDomain: "unsmoothed-physical-response",
        depthFormula: "centreSplDb - shoulderReferenceSplDb",
        depthRelativeToTargetDb: requiredBoostDb,
        neighbouringShoulderResidualDb: worst.shoulderReferenceSplDb - (interpolateCanonicalTarget(canonicalTargetCurve, worst.frequency) ?? anchorDb + artcousticHouseCurveOffsetAt(worst.frequency)),
        depthRelativeToShouldersDb: -worst.nullDepthDb,
        requiredBoostDb,
        permittedBoostDb,
        boostRejectedDb: requiredBoostDb,
        narrowCancellation,
        maximumProtectedWidthHz: MAX_PROTECTED_NULL_WIDTH_HZ,
        capabilityLimited,
        rejectionReason: reason,
        reason
      });
    }
    return regions.sort((a, b) => a.startHz - b.startHz);
  }
  function isProtectedFrequency(frequency, regions) {
    return (regions || []).some((region) => frequency >= region.startHz && frequency <= region.endHz);
  }
  const PROTECTED_NULL_SCORING_SMOOTHING_OCTAVES = 1 / 3;
  function isProtectedSmoothedFrequency(frequency, regions, smoothingWidthOctaves = PROTECTED_NULL_SCORING_SMOOTHING_OCTAVES) {
    const halfWidthOctaves = Math.max(0, Number(smoothingWidthOctaves) || 0) / 2;
    const edgeScale = 2 ** halfWidthOctaves;
    return (regions || []).some((region) => frequency >= region.startHz / edgeScale && frequency <= region.endHz * edgeScale);
  }
  const NEAR_TARGET_INFLUENCE_THRESHOLD_DB = 0.25;
  const CAPABILITY_ANCHORED_INTERMEDIATE_FLOOR_DB = -5;
  function evaluateNearTargetProtection(baselinePoints, candidatePoints, maximumResidualImprovementDb, protectedNullRegions = []) {
    const candidateByFrequency = new Map((candidatePoints || []).map((point) => [point.frequency, point]));
    const violations = [];
    for (const before of baselinePoints || []) {
      if (isProtectedSmoothedFrequency(before.frequency, protectedNullRegions)) continue;
      const after = candidateByFrequency.get(before.frequency);
      if (!after) continue;
      const changeDb = Math.abs(after.deviationDb - before.deviationDb);
      if (changeDb < NEAR_TARGET_INFLUENCE_THRESHOLD_DB) continue;
      const permittedFloorDb = Math.min(CAPABILITY_ANCHORED_INTERMEDIATE_FLOOR_DB, before.deviationDb);
      const worsenedBelowFloor = after.deviationDb < permittedFloorDb - 0.05 && after.deviationDb < before.deviationDb - NEAR_TARGET_INFLUENCE_THRESHOLD_DB;
      let reason = null;
      if (worsenedBelowFloor) {
        reason = `candidate manufactured an avoidable below-target trough (${after.deviationDb.toFixed(2)} dB; floor ${permittedFloorDb.toFixed(2)} dB) while maximum residual improved ${maximumResidualImprovementDb.toFixed(2)} dB`;
      }
      if (reason) violations.push({ frequency: before.frequency, beforeResidualDb: before.deviationDb, afterResidualDb: after.deviationDb, reason });
    }
    return { passed: violations.length === 0, violations };
  }
  const finite$7 = (value) => Number.isFinite(Number(value));
  const PEAK_CLASSIFICATION_THRESHOLD_DB = 2.5;
  let _correctabilityGate = null;
  function setCorrectabilityGate(assessment) {
    _correctabilityGate = assessment;
  }
  function clearCorrectabilityGate() {
    _correctabilityGate = null;
  }
  function curveSplAt(curve, frequency) {
    const points = (Array.isArray(curve) ? curve : []).filter((point) => finite$7(point == null ? void 0 : point.frequency) && finite$7(point == null ? void 0 : point.spl));
    if (!points.length || !finite$7(frequency)) return null;
    if (frequency <= points[0].frequency) return Number(points[0].spl);
    if (frequency >= points.at(-1).frequency) return Number(points.at(-1).spl);
    const upperIndex = points.findIndex((point) => Number(point.frequency) >= Number(frequency));
    const low = points[upperIndex - 1];
    const high = points[upperIndex];
    const ratio = (Number(frequency) - Number(low.frequency)) / (Number(high.frequency) - Number(low.frequency));
    return Number(low.spl) + (Number(high.spl) - Number(low.spl)) * ratio;
  }
  function classifyEqCorrectionRegion({
    frequency,
    rawSpl,
    currentSpl,
    targetSpl,
    protectedNull = false,
    widthOctaves = null,
    requestedGainDb = null,
    permittedBoostDb = null,
    eqAllowed = null
  }) {
    const rawResidualDb = finite$7(rawSpl) && finite$7(targetSpl) ? Number(rawSpl) - Number(targetSpl) : null;
    const currentResidualDb = finite$7(currentSpl) && finite$7(targetSpl) ? Number(currentSpl) - Number(targetSpl) : rawResidualDb;
    if (protectedNull) return {
      classification: "Null",
      expectedAction: "Protect",
      rawResidualDb,
      currentResidualDb,
      reason: "Deep narrow cancellation region is protected from corrective EQ."
    };
    const isBroadRegion = finite$7(widthOctaves) && widthOctaves >= 1 / 3;
    const trendShowsPeak = finite$7(currentResidualDb) && currentResidualDb > PEAK_CLASSIFICATION_THRESHOLD_DB;
    const rawPeakVetoesBoost = finite$7(rawResidualDb) && rawResidualDb > PEAK_CLASSIFICATION_THRESHOLD_DB && !isBroadRegion;
    if (trendShowsPeak || rawPeakVetoesBoost) {
      return {
        classification: "Peak",
        expectedAction: "Cut",
        rawResidualDb,
        currentResidualDb,
        reason: "Positive response residual exceeds the peak threshold and may only receive attenuation."
      };
    }
    const gateEqAllowed = (_correctabilityGate == null ? void 0 : _correctabilityGate.eqAllowed) === true;
    const effectiveEqAllowed = eqAllowed === true || gateEqAllowed;
    const narrowDeepDeficit = !effectiveEqAllowed && finite$7(currentResidualDb) && currentResidualDb <= -10 && finite$7(widthOctaves) && widthOctaves < 1 / 3;
    if (narrowDeepDeficit) return {
      classification: "Null",
      expectedAction: "Protect",
      rawResidualDb,
      currentResidualDb,
      reason: "Deep narrow deficit is treated as likely destructive cancellation."
    };
    return {
      classification: "Valley",
      expectedAction: "Boost within +6 dB limit",
      rawResidualDb,
      currentResidualDb,
      reason: "Broad response deficit may receive correction within the fixed EQ boost limit."
    };
  }
  function validatePhysicalEqAction(classification, appliedCorrectionDb) {
    const correction = Number(appliedCorrectionDb);
    if (!finite$7(correction) || Math.abs(correction) <= 0.05) return { passed: true, actualAction: "No material change" };
    const actualAction = correction < 0 ? "Cut" : "Boost";
    if (classification === "Peak" && correction > 0) return { passed: false, actualAction, reason: "Positive gain is forbidden at a modal peak." };
    if (classification === "Null") return { passed: false, actualAction, reason: "Corrective EQ is forbidden inside a protected null." };
    return { passed: true, actualAction };
  }
  function findAggregatePeakBoostViolations(rawCurve, postEqCurve, targetCurve) {
    return (Array.isArray(rawCurve) ? rawCurve : []).map((point) => {
      const targetSpl = interpolateCanonicalTarget(targetCurve, point.frequency);
      const finalSpl = curveSplAt(postEqCurve, point.frequency);
      const rawResidualDb = finite$7(targetSpl) ? Number(point.spl) - Number(targetSpl) : null;
      const aggregateCorrectionDb = finite$7(finalSpl) ? Number(finalSpl) - Number(point.spl) : null;
      return { frequencyHz: Number(point.frequency), rawSpl: Number(point.spl), targetSpl, rawResidualDb, aggregateCorrectionDb };
    }).filter((point) => finite$7(point.rawResidualDb) && point.rawResidualDb > PEAK_CLASSIFICATION_THRESHOLD_DB && finite$7(point.aggregateCorrectionDb) && point.aggregateCorrectionDb > 0.05);
  }
  function buildFilterDecisionDiagnostics(filters, rawCurve, postEqCurve, targetCurve, protectedNullRegions = []) {
    return (Array.isArray(filters) ? filters : []).filter((filter) => filter == null ? void 0 : filter.enabled).map((filter) => {
      const frequency = Number(filter.frequencyHz);
      const beforeEqSpl = curveSplAt(rawCurve, frequency);
      const targetSpl = interpolateCanonicalTarget(targetCurve, frequency);
      const finalSpl = curveSplAt(postEqCurve, frequency);
      const protectedNull = isProtectedFrequency(frequency, protectedNullRegions);
      const authority = classifyEqCorrectionRegion({
        frequency,
        rawSpl: beforeEqSpl,
        currentSpl: beforeEqSpl,
        targetSpl,
        protectedNull,
        widthOctaves: filter.widthOctaves,
        requestedGainDb: filter.gainDb
      });
      const aggregateCorrectionAtFrequencyDb = finite$7(finalSpl) && finite$7(beforeEqSpl) ? finalSpl - beforeEqSpl : null;
      const action = validatePhysicalEqAction(authority.classification, aggregateCorrectionAtFrequencyDb);
      return {
        frequencyHz: frequency,
        gainDb: Number(filter.gainDb),
        Q: Number(filter.Q),
        filterType: filter.type || "Peak",
        classification: authority.classification,
        beforeEqSpl,
        targetSpl,
        expectedAction: authority.expectedAction,
        actualAction: action.actualAction,
        finalSpl,
        decision: action.passed ? "Accepted" : "Rejected",
        reason: action.reason || filter.reason || authority.reason,
        aggregateCorrectionAtFrequencyDb
      };
    });
  }
  const trace = (rows) => Object.freeze(rows.map(([frequency, spl, phaseDeg]) => Object.freeze({ frequency, spl, phaseDeg })));
  const SUB2_12_TRACE = trace([
    [15, 104.854677, -172],
    [16, 105.974677, -168],
    [18, 108.004077, -162],
    [20, 109.834077, -154.750161],
    [20.667821, 110.273388, -158.005197],
    [21.357941, 110.704815, -109.875424],
    [22.071105, 111.128169, -74.635948],
    [22.808082, 111.543403, -47.990048],
    [23.569668, 112.388911, -14.578634],
    [24.356684, 113.2117, 18.749651],
    [25.169979, 114.011667, 52.032845],
    [26.010431, 114.787945, 85.304814],
    [26.878946, 115.535432, 118.59491],
    [27.776463, 116.216718, 151.937236],
    [28.703948, 116.830701, 145.362078],
    [29.662402, 117.376755, 138.895082],
    [30.652861, 117.854601, 132.556838],
    [31.676392, 118.264182, 126.362845],
    [32.7341, 118.60555, 120.323809],
    [33.827126, 118.878772, 114.446179],
    [34.956649, 119.082294, 108.734061],
    [36.123888, 119.220303, 103.192661],
    [37.330102, 119.331442, 97.819483],
    [38.576594, 119.418318, 92.610417],
    [39.864706, 119.483255, 87.560234],
    [41.195831, 119.528309, 82.662978],
    [42.571402, 119.555307, 77.912253],
    [43.992906, 119.561129, 73.304738],
    [45.461875, 119.546064, 68.833568],
    [46.979895, 119.514137, 64.49435],
    [48.548602, 119.468182, 60.282018],
    [50.169691, 119.409154, 56.189627],
    [51.844909, 119.33611, 52.214996],
    [53.576065, 119.244845, 48.363394],
    [55.365026, 119.135719, 44.627324],
    [57.213722, 119.009021, 40.999177],
    [59.124148, 118.869713, 37.467893],
    [61.098365, 118.714913, 34.04603],
    [63.138504, 118.541411, 30.741723],
    [65.246764, 118.348811, 27.548408],
    [67.425422, 118.136619, 24.459233],
    [69.676827, 117.902453, 21.492186],
    [72.003409, 117.64665, 18.658627],
    [74.407678, 117.367894, 15.95538],
    [76.892229, 117.064637, 13.379164],
    [79.45974, 116.729304, 11.015719],
    [82.112984, 116.362858, 8.859129],
    [84.854823, 115.96549, 6.90406],
    [87.688214, 115.533129, 5.262024],
    [90.616215, 115.329674, 4.318794],
    [93.641985, 115.114451, 3.454324],
    [96.768789, 114.889034, 2.660156],
    [100, 114.650755, 1.971426]
  ]);
  const SUB3_12_TRACE = trace([
    [20, 114.875867, 84.162794],
    [20.962263, 115.447429, 98.036585],
    [21.970823, 116.018283, 105.964695],
    [23.027908, 116.590059, 110.512586],
    [24.135853, 117.739395, 153.825413],
    [25.297104, 118.857071, 145.850222],
    [26.514227, 119.879525, 137.976506],
    [27.78991, 120.801581, 130.185025],
    [29.12697, 121.617017, 122.464022],
    [30.528359, 122.318487, 114.808757],
    [31.997174, 122.897782, 107.222839],
    [33.536659, 123.34605, 99.718111],
    [35.150212, 123.685709, 92.294269],
    [36.841399, 123.976824, 84.991703],
    [38.613955, 124.221536, 77.838903],
    [40.471793, 124.422886, 70.860249],
    [42.419018, 124.584963, 64.076731],
    [44.45993, 124.708902, 57.481314],
    [46.599036, 124.800342, 51.082463],
    [48.841062, 124.867557, 44.900897],
    [51.190958, 124.916677, 38.93592],
    [53.653916, 124.949812, 33.158453],
    [56.235374, 124.97244, 27.551785],
    [58.941034, 124.989694, 22.095171],
    [61.776872, 125.005326, 16.773052],
    [64.749151, 125.022763, 11.554981],
    [67.864435, 125.046006, 6.410477],
    [71.129606, 125.073107, 1.296343],
    [74.551874, 125.111289, -3.806785],
    [78.138799, 125.160564, -8.942846],
    [81.898301, 125.220765, -14.162761],
    [85.838685, 125.29805, -19.50686],
    [89.968653, 125.390605, -25.036494],
    [94.297327, 125.499138, -30.826273],
    [98.834267, 125.625049, -36.952496],
    [103.589494, 125.76473, -43.522329],
    [108.573509, 125.912224, -50.661762],
    [113.797321, 126.055142, -58.51253],
    [119.272466, 126.17237, -67.239577],
    [125.011039, 126.229286, -76.974704],
    [131.025711, 126.176729, -87.793223],
    [137.329769, 125.961389, -99.657056],
    [143.937135, 125.526675, -112.380617],
    [150.862401, 124.827297, -125.639792],
    [158.120864, 123.837027, -139.051561],
    [165.728555, 122.544817, -100.76488],
    [173.702275, 120.961024, -61.810939],
    [182.059636, 120.198782, -51.271832],
    [190.819095, 119.326351, -33.553504],
    [200, 118.358132, -3.386624]
  ]);
  const SUB4_12_TRACE = trace([
    [12, 116.203406, 169],
    [15, 120.066431, 162],
    [18, 121.781581, 156],
    [20, 122.203406, 151.325394],
    [20.962263, 122.230291, 148.400661],
    [21.970823, 122.275232, 145.568623],
    [23.027908, 122.348335, 142.740505],
    [24.135853, 122.517668, 136.670344],
    [25.297104, 122.721037, 130.79328],
    [26.514227, 122.987299, 124.716081],
    [27.78991, 123.319257, 118.205731],
    [29.12697, 123.70317, 111.138085],
    [30.528359, 124.105171, 103.484174],
    [31.997174, 124.48933, 95.304201],
    [33.536659, 124.823002, 86.734306],
    [35.150212, 125.079653, 77.944907],
    [36.841399, 125.247681, 69.167543],
    [38.613955, 125.328553, 60.615367],
    [40.471793, 125.327746, 52.4659],
    [42.419018, 125.265057, 44.842414],
    [44.45993, 125.168933, 37.850626],
    [46.599036, 125.061387, 31.480713],
    [48.841062, 124.959607, 25.679832],
    [51.190958, 124.874106, 20.362329],
    [53.653916, 124.807075, 15.417265],
    [56.235374, 124.761673, 10.755664],
    [58.941034, 124.739009, 6.298284],
    [61.776872, 124.727366, 1.915338],
    [64.749151, 124.724221, -2.448229],
    [67.864435, 124.731556, -6.819759],
    [71.129606, 124.74588, -11.238611],
    [74.551874, 124.773284, -15.720566],
    [78.138799, 124.812802, -20.305943],
    [81.898301, 124.863403, -25.041685],
    [85.838685, 124.929551, -29.96269],
    [89.968653, 125.007623, -35.124286],
    [94.297327, 125.096738, -40.59401],
    [98.834267, 125.196316, -46.438941],
    [103.589494, 125.300756, -52.752424],
    [108.573509, 125.401665, -59.638559],
    [113.797321, 125.484736, -67.207377],
    [119.272466, 125.529215, -75.581991],
    [125.011039, 125.504315, -84.84621],
    [131.025711, 125.368729, -95.035106],
    [137.329769, 125.080393, -106.098291],
    [143.937135, 124.594082, -117.876758],
    [150.862401, 123.872803, -130.103708],
    [158.120864, 122.894385, -142.468324],
    [165.728555, 121.647625, -103.195989],
    [173.702275, 120.138515, -63.390516],
    [182.059636, 119.416501, -52.35047],
    [190.819095, 118.597614, -34.21156],
    [200, 117.690453, -3.727474]
  ]);
  const capability = (usableLF_neg6dB, maxSPL, engineeringTrace) => Object.freeze({
    usableLF_neg6dB,
    frequencyResponseCurve: engineeringTrace,
    maxSPLCurve: Object.freeze(engineeringTrace.map(({ frequency, spl }) => Object.freeze({ frequency, spl }))),
    maxSPL,
    outputReference: "maximum continuous SPL at 1 m, half-space",
    responseModel: "frequency-dependent engineering curve"
  });
  const SUBWOOFER_BASS_CAPABILITIES = Object.freeze({
    "sub2-12": capability(22, 120, SUB2_12_TRACE),
    "sub3-12": capability(22, 125, SUB3_12_TRACE),
    "sub4-12": capability(12, 126, SUB4_12_TRACE)
  });
  function normaliseModelKey(name = "") {
    const raw = String(name).toLowerCase();
    let s = raw.replace(/[()]/g, " ").replace(/[^a-z0-9_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    s = s.replace(/^spitfire-q-(\d+)-(\d+)$/, "q$1-$2");
    s = s.replace(/^spitfire-q(\d+)-(\d+)$/, "q$1-$2");
    s = s.replace(/^evolve-(\d+)-(\d+)$/, "evolve-$1-$2");
    s = s.replace(/^architect-(pas2-2)$/, "architect-$1");
    s = s.replace(/^architect-mikro$/, "architect-mikro");
    if (s.endsWith("-s")) {
      s = s.slice(0, -2) + "_s";
    }
    return s;
  }
  const mmToM = (mm) => Math.round((Number(mm) || 0) * 1e-3 * 1e6) / 1e6;
  const MODELS = [
    // LCR — EXACT ORDER
    { key: "q4-3", label: "Q4-3", category: "LCR", widthMm: 280, heightMm: 210, depthMm: 110, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 101, nominalOhms: 4, max_power: 120, max_spl_cont_db_1m_halfspace: 114, max_spl_peak_db_cf6_1m_halfspace: 120, max_spl_cont_db_1m_anechoic: 108, max_spl_peak_db_cf6_1m_anechoic: 114, frequency_response_low: 100, usable_lf_hz_minus6db: 97, coverage_deg: { horizontal: 90, vertical: 45 }, price_gbp_exVat: 1820, retailPriceGBP: 1820, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
    { key: "q6-3", label: "Q6-3", category: "LCR", widthMm: 280, heightMm: 280, depthMm: 110, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 100, nominalOhms: 10, max_power: 120, max_spl_cont_db_1m_halfspace: 118, max_spl_peak_db_cf6_1m_halfspace: 124, max_spl_cont_db_1m_anechoic: 112, max_spl_peak_db_cf6_1m_anechoic: 118, price_gbp_exVat: 2090, retailPriceGBP: 2090, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 39, minus3dB: 48, minus5dB: 64 } } },
    { key: "q4-5", label: "Q4-5", category: "LCR", widthMm: 500, heightMm: 400, depthMm: 160, sensitivity_dB_1w1m: 99, sensitivity_dB_2p83: 99, nominalOhms: 8, max_power: 400, max_spl_cont_db_1m_halfspace: 122, max_spl_peak_db_cf6_1m_halfspace: 128, max_spl_cont_db_1m_anechoic: 116, max_spl_peak_db_cf6_1m_anechoic: 122, price_gbp_exVat: 3910, retailPriceGBP: 3910, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 40, minus5deg: 50 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
    { key: "q8-5", label: "Q8-5", category: "LCR", widthMm: 500, heightMm: 600, depthMm: 160, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 106, nominalOhms: 4, max_power: 800, max_spl_cont_db_1m_halfspace: 128, max_spl_peak_db_cf6_1m_halfspace: 134, max_spl_cont_db_1m_anechoic: 122, max_spl_peak_db_cf6_1m_anechoic: 128, price_gbp_exVat: 5730, retailPriceGBP: 5730, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 40, minus5deg: 50 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
    { key: "evolve-1", label: "EVOLVE 1", category: "LCR", widthMm: 120, heightMm: 120, depthMm: 99, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 93, nominalOhms: 8, max_power: 30, max_spl_cont_db_1m_halfspace: 104, max_spl_peak_db_cf6_1m_halfspace: 110, max_spl_cont_db_1m_anechoic: 98, max_spl_peak_db_cf6_1m_anechoic: 104, frequency_response_low: 120, frequency_response_high: 2e4, usable_lf_hz_minus6db: 118, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: null },
    { key: "evolve-1-1", label: "EVOLVE 1-1", category: "LCR", widthMm: 150, heightMm: 150, depthMm: 72, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 93, nominalOhms: 8, max_power: 30, max_spl_cont_db_1m_halfspace: 104, max_spl_peak_db_cf6_1m_halfspace: 110, max_spl_cont_db_1m_anechoic: 98, max_spl_peak_db_cf6_1m_anechoic: 104, frequency_response_low: 120, frequency_response_high: 2e4, usable_lf_hz_minus6db: 118, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: null },
    { key: "sl-evolve-1-1", label: "SL EVOLVE 1-1", category: "LCR", widthMm: 150, heightMm: 150, depthMm: 72, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 93, nominalOhms: 8, max_power: 30, max_spl_cont_db_1m_halfspace: 102, max_spl_peak_db_cf6_1m_halfspace: 108, max_spl_cont_db_1m_anechoic: 96, max_spl_peak_db_cf6_1m_anechoic: 102, frequency_response_low: 90, frequency_response_high: 4e4, usable_lf_hz_minus6db: 87, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: 400, retailPriceGBP: 400, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-2-1", label: "EVOLVE 2-1", category: "LCR", widthMm: 200, heightMm: 200, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 100, nominalOhms: 4, max_power: 60, max_spl_cont_db_1m_halfspace: 108, max_spl_peak_db_cf6_1m_halfspace: 114, max_spl_cont_db_1m_anechoic: 102, max_spl_peak_db_cf6_1m_anechoic: 108, frequency_response_low: 90, frequency_response_high: 4e4, usable_lf_hz_minus6db: 87, coverage_deg: { horizontal: 70, vertical: 90 }, price_gbp_exVat: 780, retailPriceGBP: 780, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 31, minus3dB: 45, minus5dB: 64 } } },
    { key: "evolve-3-1", label: "EVOLVE 3-1", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 101, nominalOhms: 3, max_power: 90, max_spl_cont_db_1m_halfspace: 110, max_spl_peak_db_cf6_1m_halfspace: 116, max_spl_cont_db_1m_anechoic: 104, max_spl_peak_db_cf6_1m_anechoic: 110, frequency_response_low: 80, frequency_response_high: 4e4, usable_lf_hz_minus6db: 77, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: 1170, retailPriceGBP: 1170, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 39, minus3dB: 55, minus5dB: 73 } } },
    { key: "evolve-4-2", label: "EVOLVE 4-2", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 99, nominalOhms: 4, max_power: 120, max_spl_cont_db_1m_halfspace: 113, max_spl_peak_db_cf6_1m_halfspace: 119, max_spl_cont_db_1m_anechoic: 107, max_spl_peak_db_cf6_1m_anechoic: 113, frequency_response_low: 85, frequency_response_high: 4e4, usable_lf_hz_minus6db: 82, coverage_deg: { horizontal: 90, vertical: 58 }, price_gbp_exVat: 1780, retailPriceGBP: 1780, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
    { key: "evolve-6-3", label: "EVOLVE 6-3", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 103, nominalOhms: 4, max_power: 180, max_spl_cont_db_1m_halfspace: 118, max_spl_peak_db_cf6_1m_halfspace: 124, max_spl_cont_db_1m_anechoic: 112, max_spl_peak_db_cf6_1m_anechoic: 118, frequency_response_low: 90, frequency_response_high: 4e4, usable_lf_hz_minus6db: 87, coverage_deg: { horizontal: 90, vertical: 54 }, price_gbp_exVat: 2250, retailPriceGBP: 2250, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
    { key: "evolve-8-4", label: "EVOLVE 8-4", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 102, sensitivity_dB_2p83: 106, nominalOhms: 3, max_power: 240, max_spl_cont_db_1m_halfspace: 120, max_spl_peak_db_cf6_1m_halfspace: 126, max_spl_cont_db_1m_anechoic: 114, max_spl_peak_db_cf6_1m_anechoic: 120, frequency_response_low: 95, frequency_response_high: 3e4, usable_lf_hz_minus6db: 92, coverage_deg: { horizontal: 90, vertical: 50 }, price_gbp_exVat: 2720, retailPriceGBP: 2720, currency: "GBP", vatIncluded: true, vatRate: 0.2, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
    // TODO: Replace C-1 dimensions with verified source dimensions if/when available.
    { key: "c-1", label: "C-1", category: "LCR", frontStageType: "center_only", widthType: "fixed", fixedWidthMm: 400, widthMm: 400, heightMm: 120, depthMm: 81, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 96, nominalOhms: 4, max_power: 60, max_spl: 108, peak_spl: 114, frequency_response_low: 90, usable_lf_hz_minus6db: 87, recommended_hpf_hz: 100, recommended_hpf_slope: "24dB/oct", hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 50, minus3dB: 70, minus5dB: 85 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 100 } } },
    // ONE loudspeaker, published in six cabinet lengths — 1222 mm (its smallest)
    // through 2230 mm. The lengths are the same acoustics in a different physical
    // width: sensitivity, impedance, power handling and maximum SPL are shared by
    // every variant, and only the cabinet width (and the illustration drawn for
    // it) changes. Three widths carry their own illustrated face artwork —
    // 1222 mm, 1441 mm and 1711 mm. tvWidthMap stays the preset-key lookup the TV
    // presets resolve through; cabinetLengthsMm is the catalogue's own list of
    // available variants, which the shared variant authority resolves against the
    // screen's physical width. dualCentreCabinetLengthMm names the variant the
    // dual-centre arrangement requires.
    { key: "c4-1", label: "C4-1", category: "LCR", frontStageType: "center_only", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, cabinetLengthsMm: [1222, 1411, 1441, 1711, 1872, 2230], dualCentreCabinetLengthMm: 1222, heightMm: 120, depthMm: 81, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 98, nominalOhms: 8, max_power: 120, max_spl: 109, peak_spl: 115, max_spl_cont_db_1m_halfspace: 109, max_spl_peak_db_cf6_1m_halfspace: 115, max_spl_cont_db_1m_anechoic: 103, max_spl_peak_db_cf6_1m_anechoic: 109, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 45, minus5deg: 60 }, dispersion: { horizontal: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 } } },
    { key: "multi-lcr", label: "Multi (LCR)", category: "LCR", frontStageType: "integrated_lcr", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 96, nominalOhms: 12, max_power: 60, max_spl: 108, peak_spl: 114, max_spl_cont_db_1m_halfspace: 108, max_spl_peak_db_cf6_1m_halfspace: 114, max_spl_cont_db_1m_anechoic: 102, max_spl_peak_db_cf6_1m_anechoic: 108, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 45, minus5deg: 60 }, dispersion: { horizontal: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 } } },
    { key: "multi-mono", label: "Multi (Mono)", category: "LCR", frontStageType: "center_only", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 101, sensitivity_dB_2p83: 101, nominalOhms: 12, max_power: 180, max_spl: 113, peak_spl: 119, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 45, minus5deg: 60 }, dispersion: { horizontal: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 } } },
    { key: "hspl-lcr", label: "HSPL (LCR)", category: "LCR", frontStageType: "integrated_lcr", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 98, nominalOhms: 8, max_power: 120, max_spl: 110, peak_spl: 116, max_spl_cont_db_1m_halfspace: 110, max_spl_peak_db_cf6_1m_halfspace: 116, max_spl_cont_db_1m_anechoic: 104, max_spl_peak_db_cf6_1m_anechoic: 110, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 50, minus3dB: 70, minus5dB: 85 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 100 } } },
    { key: "hspl-mono", label: "HSPL (Mono)", category: "LCR", frontStageType: "center_only", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 103, nominalOhms: 8, max_power: 360, max_spl: 115, peak_spl: 121, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 50, minus3dB: 70, minus5dB: 85 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 100 } } },
    // SURROUNDS — EXACT ORDER
    { key: "mikro", label: "MIKRO", category: "SURROUNDS", widthMm: 120, heightMm: 120, depthMm: 80, sensitivity_dB_1w1m: 86, sensitivity_dB_2p83: 86, nominalOhms: 8, max_power: 15, max_spl_cont_db_1m_halfspace: 102, max_spl_peak_db_cf6_1m_halfspace: 108, max_spl_cont_db_1m_anechoic: 96, max_spl_peak_db_cf6_1m_anechoic: 102, frequency_response_low: 300, frequency_response_high: 2e4, usable_lf_hz_minus6db: 297, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: null },
    { key: "evolve-1-1_s", label: "EVOLVE 1-1", category: "SURROUNDS", widthMm: 150, heightMm: 150, depthMm: 72, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 93, nominalOhms: 8, max_power: 30, max_spl_cont_db_1m_halfspace: 104, max_spl_peak_db_cf6_1m_halfspace: 110, max_spl_cont_db_1m_anechoic: 98, max_spl_peak_db_cf6_1m_anechoic: 104, frequency_response_low: 120, frequency_response_high: 2e4, usable_lf_hz_minus6db: 118, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: 550 },
    { key: "sl-evolve-1-1_s", label: "SL EVOLVE 1-1", category: "SURROUNDS", widthMm: 150, heightMm: 150, depthMm: 72, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 93, nominalOhms: 8, max_power: 30, max_spl_cont_db_1m_halfspace: 102, max_spl_peak_db_cf6_1m_halfspace: 108, max_spl_cont_db_1m_anechoic: 96, max_spl_peak_db_cf6_1m_anechoic: 102, frequency_response_low: 90, frequency_response_high: 4e4, usable_lf_hz_minus6db: 87, coverage_deg: { horizontal: 90, vertical: 90 }, price_gbp_exVat: 400, retailPriceGBP: 400, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-2-1_s", label: "EVOLVE 2-1", category: "SURROUNDS", widthMm: 200, heightMm: 200, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 100, nominalOhms: 4, max_power: 60, price_gbp_exVat: 780, retailPriceGBP: 780, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-3-1_s", label: "EVOLVE 3-1", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 101, nominalOhms: 3, max_power: 90, price_gbp_exVat: 1170, retailPriceGBP: 1170, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-4-2_s", label: "EVOLVE 4-2", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 99, nominalOhms: 4, max_power: 120, price_gbp_exVat: 1780, retailPriceGBP: 1780, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-6-3_s", label: "EVOLVE 6-3", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 103, nominalOhms: 4, max_power: 180, price_gbp_exVat: 2250, retailPriceGBP: 2250, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "evolve-8-4_s", label: "EVOLVE 8-4", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 102, sensitivity_dB_2p83: 106, nominalOhms: 3, max_power: 240, price_gbp_exVat: 2720, retailPriceGBP: 2720, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "q4-3_s", label: "Q4-3", category: "SURROUNDS", widthMm: 280, heightMm: 210, depthMm: 110, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 101, nominalOhms: 4, max_power: 120, max_spl_cont_db_1m_halfspace: 114, max_spl_peak_db_cf6_1m_halfspace: 120, max_spl_cont_db_1m_anechoic: 108, max_spl_peak_db_cf6_1m_anechoic: 114, frequency_response_low: 100, usable_lf_hz_minus6db: 97, coverage_deg: { horizontal: 90, vertical: 45 }, price_gbp_exVat: 1820, retailPriceGBP: 1820, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "q6-3_s", label: "Q6-3", category: "SURROUNDS", widthMm: 280, heightMm: 280, depthMm: 110, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 100, nominalOhms: 10, max_power: 120, price_gbp_exVat: 2090, retailPriceGBP: 2090, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "q4-5_s", label: "Q4-5", category: "SURROUNDS", widthMm: 500, heightMm: 400, depthMm: 160, sensitivity_dB_1w1m: 99, sensitivity_dB_2p83: 99, nominalOhms: 8, max_power: 400, price_gbp_exVat: 3910, retailPriceGBP: 3910, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    { key: "q8-5_s", label: "Q8-5", category: "SURROUNDS", widthMm: 500, heightMm: 600, depthMm: 160, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 106, nominalOhms: 4, max_power: 800, price_gbp_exVat: 5730, retailPriceGBP: 5730, currency: "GBP", vatIncluded: true, vatRate: 0.2 },
    // ARCHITECT (OVERHEAD) — EXACT ORDER
    {
      key: "architect-mikro",
      label: "MIKRO Ci",
      category: "ARCHITECT",
      widthMm: 54,
      // short edge (left/right)
      depthMm: 138,
      // long edge (front/back)
      heightMm: 26,
      // physical depth only for reporting
      round: false,
      // MUST be explicitly false
      sensitivity_dB_1w1m: 86,
      sensitivity_dB_2p83: 86,
      nominalOhms: 8,
      max_power: 15,
      max_spl_cont_db_1m_halfspace: 102,
      max_spl_peak_db_cf6_1m_halfspace: 108,
      max_spl_cont_db_1m_anechoic: 96,
      max_spl_peak_db_cf6_1m_anechoic: 102,
      frequency_response_low: 300,
      frequency_response_high: 2e4,
      usable_lf_hz_minus6db: 297,
      coverage_deg: { horizontal: 90, vertical: 90 },
      price_gbp_exVat: null,
      builtInTiltDeg: 0,
      dispersion: {
        horizontal: {
          minus1p5dB: 90,
          minus3dB: 90,
          minus5dB: 90
        }
      }
    },
    {
      key: "architect-2-1",
      label: "ARCHITECT 2-1",
      category: "ARCHITECT",
      diameterMm: 240,
      depthMm: 120,
      round: true,
      sensitivity_dB_1w1m: 97,
      sensitivity_dB_2p83: 100,
      nominalOhms: 4,
      max_power: 60,
      max_spl_cont_db_1m_halfspace: 108,
      max_spl_peak_db_cf6_1m_halfspace: 114,
      max_spl_cont_db_1m_anechoic: 102,
      max_spl_peak_db_cf6_1m_anechoic: 108,
      frequency_response_low: 80,
      frequency_response_high: 4e4,
      usable_lf_hz_minus6db: 77,
      coverage_deg: { horizontal: 70, vertical: 90 },
      price_gbp_exVat: 740,
      retailPriceGBP: 740,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      builtInTiltDeg: 5,
      dispersion: {
        horizontal: {
          minus1p5dB: 40,
          minus3dB: 55,
          minus5dB: 72
        },
        vertical: {
          minus1p5dB: 40,
          minus3dB: 55,
          minus5dB: 72
        }
      }
    },
    {
      key: "architect-4-2",
      label: "ARCHITECT 4-2",
      category: "ARCHITECT",
      hiddenFromSelector: true,
      diameterMm: 300,
      depthMm: 120,
      round: true,
      sensitivity_dB_1w1m: 97,
      sensitivity_dB_2p83: 97,
      nominalOhms: 4,
      max_power: 120,
      price_gbp_exVat: 1230,
      retailPriceGBP: 1230,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      builtInTiltDeg: 5,
      dispersion: {
        horizontal: {
          minus1p5dB: 30,
          minus3dB: 45,
          minus5dB: 63
        },
        vertical: {
          minus1p5dB: 30,
          minus3dB: 45,
          minus5dB: 63
        }
      }
    },
    {
      key: "architect-pas2-2",
      label: "ARCHITECT PAS2-2",
      category: "ARCHITECT",
      hiddenFromSelector: true,
      diameterMm: 300,
      depthMm: 150,
      round: true,
      sensitivity_dB_1w1m: 97,
      sensitivity_dB_2p83: 97,
      nominalOhms: 4,
      max_power: 120,
      price_gbp_exVat: 1200,
      retailPriceGBP: 1200,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      builtInTiltDeg: 20,
      dispersion: {
        horizontal: {
          minus1p5dB: 43,
          minus3dB: 60,
          minus5dB: 82
        },
        vertical: {
          minus1p5dB: 24,
          minus3dB: 40,
          minus5dB: 60
        }
      }
    },
    {
      key: "spitfire-cloud",
      label: "SPITFIRE CLOUD",
      category: "ARCHITECT",
      diameterMm: 300,
      depthMm: 300,
      heightMm: 83,
      round: true,
      sensitivity_dB_1w1m: 98,
      sensitivity_dB_2p83: 98,
      nominalOhms: 4,
      max_power: 120,
      max_spl_cont_db_1m_halfspace: 114,
      max_spl_peak_db_cf6_1m_halfspace: 120,
      frequency_response_low: 100,
      usable_lf_hz_minus6db: 97,
      price_gbp_exVat: null,
      builtInTiltDeg: 22,
      // RP22 P17 MEASURED ENGINE — enabled for this model only (Stage 2C).
      polarModel: {
        type: "measured",
        axisTiltDeg: 22,
        dataset: "SpitfireCloud"
      }
    },
    {
      key: "architect-4-2-mk2",
      label: "ARCHITECT 4-2 mk II",
      category: "ARCHITECT",
      diameterMm: 300,
      depthMm: 300,
      heightMm: 83,
      round: true,
      sensitivity_dB_1w1m: 98,
      sensitivity_dB_2p83: 98,
      nominalOhms: 4,
      max_power: 120,
      max_spl_cont_db_1m_halfspace: 114,
      max_spl_peak_db_cf6_1m_halfspace: 120,
      frequency_response_low: 100,
      usable_lf_hz_minus6db: 97,
      price_gbp_exVat: null,
      builtInTiltDeg: 22,
      // Architect 4-2 Mk2 shares the measured polar dataset with Spitfire Cloud.
      polarModel: {
        type: "measured",
        axisTiltDeg: 22,
        dataset: "SpitfireCloud"
      }
    },
    // SUBWOOFERS — EXACT ORDER
    {
      key: "sub2-12",
      label: "SUB2-12",
      category: "SUBWOOFERS",
      widthMm: 500,
      heightMm: 500,
      depthMm: 255,
      sensitivity_dB_1w1m: 94,
      max_power: 350,
      max_spl_cont_db_1m_halfspace: 120,
      max_spl_peak_db_cf6_1m_halfspace: 126,
      max_spl_cont_db_1m_anechoic: 114,
      max_spl_peak_db_cf6_1m_anechoic: 120,
      max_spl_cont_db_30hz_halfspace: 118,
      max_spl_cont_db_30hz_anechoic: 112,
      price_gbp_exVat: 2190,
      retailPriceGBP: 2190,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      graphDerivedDesignEstimate: true,
      notes: "Dolby DART approved continuous SPL data",
      dolbyDartApproved: true,
      approvedContinuousSplAt1mDb: 120,
      approvedContinuousSplAt30HzDb: 118,
      approvedPeakSplDb: 126,
      approvedFrequencyRangeHz: [25, 170],
      approvedUsableLfHzMinus6dB: 22,
      bassCapability: SUBWOOFER_BASS_CAPABILITIES["sub2-12"],
      frequency_response_curve: SUBWOOFER_BASS_CAPABILITIES["sub2-12"].frequencyResponseCurve.map(({ frequency, spl }) => [frequency, spl])
    },
    {
      key: "sub3-12",
      label: "SUB3-12",
      category: "SUBWOOFERS",
      widthMm: 600,
      heightMm: 600,
      depthMm: 255,
      sensitivity_dB_1w1m: 97,
      max_power: 700,
      max_spl_cont_db_1m_halfspace: 125,
      max_spl_peak_db_cf6_1m_halfspace: 131,
      max_spl_cont_db_1m_anechoic: 119,
      max_spl_peak_db_cf6_1m_anechoic: 125,
      max_spl_cont_db_30hz_halfspace: 122,
      max_spl_cont_db_30hz_anechoic: 116,
      price_gbp_exVat: 3740,
      retailPriceGBP: 3740,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      graphDerivedDesignEstimate: true,
      notes: "Dolby DART approved continuous SPL data",
      dolbyDartApproved: true,
      approvedContinuousSplAt1mDb: 125,
      approvedContinuousSplAt30HzDb: 122,
      approvedPeakSplDb: 131,
      approvedFrequencyRangeHz: [25, 170],
      approvedUsableLfHzMinus6dB: 22,
      bassCapability: SUBWOOFER_BASS_CAPABILITIES["sub3-12"],
      frequency_response_curve: SUBWOOFER_BASS_CAPABILITIES["sub3-12"].frequencyResponseCurve.map(({ frequency, spl }) => [frequency, spl])
    },
    {
      key: "sub4-12",
      label: "SUB4-12",
      category: "SUBWOOFERS",
      widthMm: 440,
      heightMm: 1700,
      depthMm: 270,
      sensitivity_dB_1w1m: 99,
      max_power: 1400,
      max_spl_cont_db_1m_halfspace: 126,
      max_spl_peak_db_cf6_1m_halfspace: 132,
      max_spl_cont_db_1m_anechoic: 120,
      max_spl_peak_db_cf6_1m_anechoic: 126,
      max_spl_cont_db_30hz_halfspace: 126,
      max_spl_cont_db_30hz_anechoic: 120,
      price_gbp_exVat: 6600,
      retailPriceGBP: 6600,
      currency: "GBP",
      vatIncluded: true,
      vatRate: 0.2,
      graphDerivedDesignEstimate: true,
      notes: "Dolby DART approved continuous SPL data",
      dolbyDartApproved: true,
      approvedContinuousSplAt1mDb: 126,
      approvedContinuousSplAt30HzDb: 126,
      approvedPeakSplDb: 132,
      approvedFrequencyRangeHz: [15, 170],
      approvedUsableLfHzMinus6dB: 12,
      bassCapability: SUBWOOFER_BASS_CAPABILITIES["sub4-12"],
      frequency_response_curve: SUBWOOFER_BASS_CAPABILITIES["sub4-12"].frequencyResponseCurve.map(({ frequency, spl }) => [frequency, spl])
    }
  ];
  new Map(MODELS.map((m, i) => [m.key, i]));
  function getSpeakerModelMeta(modelName, orientation, options = {}) {
    const key = normaliseModelKey(modelName);
    const hit = MODELS.find((m) => m.key === key) || // allow mapping of LCR keys into surrounds if labels match
    MODELS.find((m) => m.label.toLowerCase() === String(modelName).trim().toLowerCase());
    if (!hit) {
      return {
        widthM: 0.27,
        heightM: 0.27,
        depthM: 0.082,
        round: false,
        notFound: true,
        key,
        label: String(modelName),
        price_gbp_exVat: null,
        sensitivity_dB_1w1m: null,
        sensitivity_dB_2p83: null,
        nominalOhms: null,
        max_power: null,
        bassCapability: null,
        frequency_response_curve: null
      };
    }
    const inherited = (hit == null ? void 0 : hit.key) && hit.key.endsWith("_s") ? MODELS.find((m) => m.key === hit.key.replace(/_s$/, "")) : null;
    const finalDispersion = (hit == null ? void 0 : hit.dispersion) ?? (inherited == null ? void 0 : inherited.dispersion) ?? null;
    const finalHfOffAxis16k = (hit == null ? void 0 : hit.hfOffAxis16k) ?? (inherited == null ? void 0 : inherited.hfOffAxis16k) ?? null;
    if (hit.round) {
      return {
        round: true,
        diameterM: mmToM(hit.diameterMm),
        depthM: mmToM(hit.depthMm),
        widthM: mmToM(hit.diameterMm),
        // for generic callers
        heightM: mmToM(hit.diameterMm),
        // for generic callers
        key: hit.key,
        label: hit.label,
        category: hit.category,
        sensitivity_dB_1w1m: hit.sensitivity_dB_1w1m ?? null,
        sensitivity_dB_2p83: hit.sensitivity_dB_2p83 ?? null,
        nominalOhms: hit.nominalOhms ?? null,
        max_power: hit.max_power ?? null,
        max_spl_cont_db_1m_halfspace: hit.max_spl_cont_db_1m_halfspace ?? null,
        max_spl_peak_db_cf6_1m_halfspace: hit.max_spl_peak_db_cf6_1m_halfspace ?? null,
        max_spl_cont_db_1m_anechoic: hit.max_spl_cont_db_1m_anechoic ?? null,
        max_spl_peak_db_cf6_1m_anechoic: hit.max_spl_peak_db_cf6_1m_anechoic ?? null,
        frequency_response_low: hit.frequency_response_low ?? null,
        frequency_response_high: hit.frequency_response_high ?? null,
        usable_lf_hz_minus6db: hit.usable_lf_hz_minus6db ?? null,
        hfOffAxis16k: finalHfOffAxis16k,
        builtInTiltDeg: hit.builtInTiltDeg ?? null,
        dispersion: finalDispersion,
        coverage_deg: hit.coverage_deg ?? null,
        // RP22 P17 measured engine (Stage 1 scaffolding) — null for every current model.
        polarModel: hit.polarModel ?? null,
        frequency_response_curve: hit.frequency_response_curve ?? null,
        price_gbp_exVat: hit.price_gbp_exVat ?? null
      };
    }
    let resolvedWidthMm = hit.widthMm;
    if (hit.widthType === "fixed" && Number.isFinite(hit.fixedWidthMm)) {
      resolvedWidthMm = hit.fixedWidthMm;
    }
    if (hit.widthType === "tv_linked" && hit.tvWidthMap) {
      const lengths = getSoundbarCabinetLengthsMm(hit.key);
      const selected = Number(options == null ? void 0 : options.cabinetLengthMm);
      if (Number.isFinite(selected) && lengths.includes(selected)) {
        resolvedWidthMm = selected;
      } else if (orientation) {
        resolvedWidthMm = hit.tvWidthMap[orientation] || hit.widthMm || hit.fixedWidthMm;
      }
    }
    let widthM = mmToM(resolvedWidthMm);
    let heightM = mmToM(hit.heightMm);
    const depthM = mmToM(hit.depthMm);
    if (hit.key === "sub4-12" && orientation === "horizontal") {
      [widthM, heightM] = [heightM, widthM];
    }
    return {
      round: false,
      widthM,
      heightM,
      depthM,
      // The cabinet length actually installed, and every length the catalogue
      // publishes for this model. Null/empty for anything that is not a
      // TV-linked soundbar.
      cabinetLengthMm: hit.widthType === "tv_linked" && Number.isFinite(resolvedWidthMm) ? resolvedWidthMm : null,
      cabinetLengthsMm: hit.widthType === "tv_linked" ? getSoundbarCabinetLengthsMm(hit.key) : [],
      key: hit.key,
      label: hit.label,
      category: hit.category,
      frontStageType: hit.frontStageType ?? null,
      widthType: hit.widthType ?? null,
      fixedWidthMm: hit.fixedWidthMm ?? null,
      tvWidthMap: hit.tvWidthMap ?? null,
      placementOffsetFromScreenBottomMm: hit.placementOffsetFromScreenBottomMm ?? null,
      sensitivity_dB_1w1m: hit.sensitivity_dB_1w1m ?? null,
      sensitivity_dB_2p83: hit.sensitivity_dB_2p83 ?? null,
      nominalOhms: hit.nominalOhms ?? null,
      max_power: hit.max_power ?? null,
      max_spl: hit.max_spl ?? null,
      peak_spl: hit.peak_spl ?? null,
      // Canonical anechoic/halfspace SPL fields — RP22 maths must use the anechoic variants
      max_spl_cont_db_1m_halfspace: hit.max_spl_cont_db_1m_halfspace ?? null,
      max_spl_peak_db_cf6_1m_halfspace: hit.max_spl_peak_db_cf6_1m_halfspace ?? null,
      max_spl_cont_db_1m_anechoic: hit.max_spl_cont_db_1m_anechoic ?? null,
      max_spl_peak_db_cf6_1m_anechoic: hit.max_spl_peak_db_cf6_1m_anechoic ?? null,
      max_spl_cont_db_30hz_halfspace: hit.max_spl_cont_db_30hz_halfspace ?? null,
      max_spl_cont_db_30hz_anechoic: hit.max_spl_cont_db_30hz_anechoic ?? null,
      frequency_response_low: hit.frequency_response_low ?? null,
      frequency_response_high: hit.frequency_response_high ?? null,
      usable_lf_hz_minus6db: hit.usable_lf_hz_minus6db ?? null,
      recommended_hpf_hz: hit.recommended_hpf_hz ?? null,
      recommended_hpf_slope: hit.recommended_hpf_slope ?? null,
      hfOffAxis16k: finalHfOffAxis16k,
      builtInTiltDeg: hit.builtInTiltDeg ?? null,
      dispersion: finalDispersion,
      coverage_deg: hit.coverage_deg ?? null,
      // RP22 P17 measured engine (Stage 1 scaffolding) — null for every current model.
      polarModel: hit.polarModel ?? null,
      bassCapability: hit.bassCapability ?? null,
      frequency_response_curve: hit.frequency_response_curve ?? null,
      price_gbp_exVat: hit.price_gbp_exVat ?? null
    };
  }
  function getSoundbarCabinetLengthsMm(modelName) {
    const key = normaliseModelKey(modelName);
    const model = MODELS.find((m) => m.key === key);
    if (!model || model.widthType !== "tv_linked") return [];
    const declared = Array.isArray(model.cabinetLengthsMm) ? model.cabinetLengthsMm : null;
    const fromMap = model.tvWidthMap ? Object.values(model.tvWidthMap) : [];
    const lengths = (declared || fromMap).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    return [...new Set(lengths)].sort((a, b) => a - b);
  }
  function getApprovedContinuousSplDb(modelKey) {
    const key = normaliseModelKey(modelKey);
    const model = MODELS.find((m) => m.key === key);
    return (model == null ? void 0 : model.dolbyDartApproved) && Number.isFinite(model.approvedContinuousSplAt1mDb) ? model.approvedContinuousSplAt1mDb : null;
  }
  function getApprovedFrequencyRangeHz(modelKey) {
    const key = normaliseModelKey(modelKey);
    const model = MODELS.find((m) => m.key === key);
    const range = (model == null ? void 0 : model.dolbyDartApproved) ? model.approvedFrequencyRangeHz : null;
    return Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) ? [...range] : null;
  }
  function isValidCurve(curve) {
    if (!Array.isArray(curve)) return false;
    return curve.every(
      (point) => Array.isArray(point) && point.length === 2 && typeof point[0] === "number" && typeof point[1] === "number"
    );
  }
  function getSubwooferCurve(modelKey) {
    const normalized = normaliseModelKey(modelKey);
    const model = MODELS.find((m) => m.key === normalized);
    if (!model || !model.frequency_response_curve) {
      return null;
    }
    const rawCurve = model.frequency_response_curve;
    if (!isValidCurve(rawCurve)) {
      return null;
    }
    return rawCurve.map(([hz, db]) => ({ hz, db }));
  }
  function getProductCurveFrequencyRange(modelKey) {
    const curve = getSubwooferCurve(modelKey);
    if (!Array.isArray(curve) || curve.length === 0) return null;
    const freqs = curve.map((p) => Number(p.hz)).filter(Number.isFinite).sort((a, b) => a - b);
    if (!freqs.length) return null;
    return { minHz: freqs[0], maxHz: freqs[freqs.length - 1] };
  }
  function ceilSplDisplayValue(value) {
    if (value === null || value === void 0 || value === "" || typeof value === "boolean") return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.ceil(number) : null;
  }
  function formatSplDisplay(value, { unit = "dBC", fallback = "—" } = {}) {
    const wholeDb = ceilSplDisplayValue(value);
    return wholeDb === null ? fallback : `${wholeDb} ${unit}`;
  }
  const P14_MINIMUM_THRESHOLDS = Object.freeze({ L1: 109, L2: 112, L3: 115, L4: 118 });
  const P14_RECOMMENDED_THRESHOLDS = Object.freeze({ L1: 114, L2: 117, L3: 120, L4: 123 });
  function gradeAtThresholds(value, thresholds) {
    if (!Number.isFinite(value)) return 0;
    const ceiled = Math.ceil(value);
    if (ceiled >= thresholds.L4) return 4;
    if (ceiled >= thresholds.L3) return 3;
    if (ceiled >= thresholds.L2) return 2;
    if (ceiled >= thresholds.L1) return 1;
    return 0;
  }
  const gradeP14Minimum = (value) => gradeAtThresholds(value, P14_MINIMUM_THRESHOLDS);
  const gradeP14Recommended = (value) => gradeAtThresholds(value, P14_RECOMMENDED_THRESHOLDS);
  const normalizeP14TargetBasis = (basis) => basis === "recommended" ? "recommended" : "minimum";
  const p14ThresholdsForBasis = (basis) => normalizeP14TargetBasis(basis) === "recommended" ? P14_RECOMMENDED_THRESHOLDS : P14_MINIMUM_THRESHOLDS;
  const gradeP14ForBasis = (value, basis) => gradeAtThresholds(value, p14ThresholdsForBasis(basis));
  const formatP14Capability = (value) => formatSplDisplay(value);
  const formatP14BasisLabel = (basis) => normalizeP14TargetBasis(basis) === "recommended" ? "Recommended" : "Minimum";
  const P14_EQ_ASSESSMENT_RANGE_HZ = Object.freeze({ lowerHz: 20, upperHz: 120 });
  const P14_SAFETY_MARGIN_DB = 3;
  const P14_CAPABILITY_REGIONS = Object.freeze([
    Object.freeze({ key: "extension", label: "20–30 Hz extension", lowerHz: 20, upperHz: 30, weight: 0.2 }),
    Object.freeze({ key: "primary", label: "30–80 Hz primary LFE", lowerHz: 30, upperHz: 80, weight: 0.6 }),
    Object.freeze({ key: "integration", label: "80–120 Hz integration", lowerHz: 80, upperHz: 120, weight: 0.2 })
  ]);
  const P14_FREQUENCY_GRID_HZ = Object.freeze([
    20,
    22.45,
    25.2,
    28.28,
    30,
    31.75,
    35.64,
    40,
    44.9,
    50.4,
    56.57,
    63.5,
    71.27,
    80,
    89.8,
    100.79,
    113.14,
    120
  ]);
  function interpolateCurve(curve, frequency, valueKey = "spl") {
    const points = (curve || []).filter((point) => Number.isFinite(Number(point == null ? void 0 : point.frequency)) && Number.isFinite(Number(point == null ? void 0 : point[valueKey]))).map((point) => ({ frequency: Number(point.frequency), value: Number(point[valueKey]) })).sort((left, right) => left.frequency - right.frequency);
    if (!points.length || frequency < points[0].frequency || frequency > points[points.length - 1].frequency) return null;
    const upperIndex = points.findIndex((point) => point.frequency >= frequency);
    if (upperIndex <= 0) return points[0].value;
    const low = points[upperIndex - 1];
    const high = points[upperIndex];
    const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
    return low.value + (high.value - low.value) * ratio;
  }
  function positiveEqBoostAt(combinedEqCurve, frequency) {
    const boost = interpolateCurve(combinedEqCurve, frequency);
    return Number.isFinite(boost) ? Math.max(0, boost) : 0;
  }
  function referenceCapabilityDb(curve) {
    const values = (curve || []).filter((point) => point.frequency >= 30 && point.frequency <= 80 && Number.isFinite(point.spl)).map((point) => point.spl);
    return values.length ? Math.max(...values) : null;
  }
  function singleSubCapabilityAt(sub, frequency) {
    var _a;
    const modelKey = (sub == null ? void 0 : sub.modelKey) ?? (sub == null ? void 0 : sub.model);
    const approvedDb = getApprovedContinuousSplDb(modelKey);
    const curve = ((_a = getSubwooferCurve(modelKey)) == null ? void 0 : _a.map((point) => ({ frequency: point.hz, spl: point.db }))) || [];
    const referenceDb = referenceCapabilityDb(curve);
    const curveDb = interpolateCurve(curve, frequency);
    if (!Number.isFinite(approvedDb) || !Number.isFinite(referenceDb) || !Number.isFinite(curveDb)) return null;
    return Math.min(approvedDb, approvedDb + curveDb - referenceDb);
  }
  function powerSumDb(values) {
    if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
    return 10 * Math.log10(values.reduce((sum, value) => sum + Math.pow(10, value / 10), 0));
  }
  function regionForFrequency(frequency) {
    if (frequency < 30) return P14_CAPABILITY_REGIONS[0];
    if (frequency < 80) return P14_CAPABILITY_REGIONS[1];
    return P14_CAPABILITY_REGIONS[2];
  }
  function weightedRegionValue(curve, valueKey) {
    const regional = P14_CAPABILITY_REGIONS.map((region) => {
      const points = curve.filter((point) => regionForFrequency(point.frequency).key === region.key);
      const value = points.length ? points.reduce((sum, point) => sum + point[valueKey], 0) / points.length : null;
      return { ...region, value };
    });
    if (regional.some((region) => !Number.isFinite(region.value))) return { value: null, regional };
    return {
      value: regional.reduce((sum, region) => sum + region.value * region.weight, 0),
      regional
    };
  }
  function buildCapabilityCurve(activeSubs, productCapabilityDb, combinedEqCurve) {
    return P14_FREQUENCY_GRID_HZ.map((frequency) => {
      const individualCapabilities = (activeSubs || []).map((sub) => singleSubCapabilityAt(sub, frequency));
      const rawCapabilityDb = individualCapabilities.length ? powerSumDb(individualCapabilities) : Number.isFinite(productCapabilityDb) ? productCapabilityDb : null;
      if (!Number.isFinite(rawCapabilityDb)) return null;
      const positiveEqBoostDb = positiveEqBoostAt(combinedEqCurve, frequency);
      return {
        frequency,
        rawCapabilityDb,
        positiveEqBoostDb,
        remainingCapabilityDb: rawCapabilityDb - positiveEqBoostDb,
        region: regionForFrequency(frequency).key
      };
    }).filter(Boolean);
  }
  function maximumPositiveEqPoint(points) {
    return points.reduce((maximum, point) => {
      const frequency = Number(point == null ? void 0 : point.frequency);
      const boostDb = Number(point == null ? void 0 : point.spl);
      if (!Number.isFinite(frequency) || !Number.isFinite(boostDb) || boostDb <= maximum.boostDb) return maximum;
      return { boostDb, frequencyHz: frequency };
    }, { boostDb: 0, frequencyHz: null });
  }
  function analyseP14EqHeadroom(combinedEqCurve) {
    const validPoints = (combinedEqCurve || []).filter((point) => Number.isFinite(Number(point == null ? void 0 : point.frequency)) && Number.isFinite(Number(point == null ? void 0 : point.spl)));
    const wholeBankMaximum = maximumPositiveEqPoint(validPoints);
    const inBandMaximum = maximumPositiveEqPoint(validPoints.filter((point) => {
      const frequency = Number(point.frequency);
      return frequency >= P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz && frequency <= P14_EQ_ASSESSMENT_RANGE_HZ.upperHz;
    }));
    return {
      assessmentRangeHz: P14_EQ_ASSESSMENT_RANGE_HZ,
      maximumInBandPositiveEqBoostDb: inBandMaximum.boostDb,
      maximumInBandPositiveEqBoostFrequencyHz: inBandMaximum.frequencyHz,
      wholeBankMaximumPositiveEqBoostDb: wholeBankMaximum.boostDb,
      wholeBankMaximumPositiveEqBoostFrequencyHz: wholeBankMaximum.frequencyHz,
      wholeBankMaximumExcludedFromP14: wholeBankMaximum.boostDb > inBandMaximum.boostDb
    };
  }
  function assessP14Capability({ activeSubs = [], productCapabilityDb = null, combinedEqCurve = [], targetBasis = "minimum" } = {}) {
    const normalizedTargetBasis = normalizeP14TargetBasis(targetBasis);
    const capabilityCurve = buildCapabilityCurve(activeSubs, productCapabilityDb, combinedEqCurve);
    if (!capabilityCurve.length) return null;
    const rawAssessment = weightedRegionValue(capabilityCurve, "rawCapabilityDb");
    const postEqAssessment = weightedRegionValue(capabilityCurve, "remainingCapabilityDb");
    if (!Number.isFinite(rawAssessment.value) || !Number.isFinite(postEqAssessment.value)) return null;
    const limitingRegion = postEqAssessment.regional.reduce((lowest, region) => !lowest || region.value < lowest.value ? region : lowest, null);
    const limitingPoint = capabilityCurve.filter((point) => point.region === (limitingRegion == null ? void 0 : limitingRegion.key)).reduce((lowest, point) => !lowest || point.remainingCapabilityDb < lowest.remainingCapabilityDb ? point : lowest, null);
    const eqHeadroomConsumedDb = Math.max(0, rawAssessment.value - postEqAssessment.value);
    const p14CapabilityDb = postEqAssessment.value - P14_SAFETY_MARGIN_DB;
    const eqHeadroomDiagnostics = analyseP14EqHeadroom(combinedEqCurve);
    return {
      p14CapabilityDb,
      safeCapabilityDb: p14CapabilityDb,
      limitingFrequency: (limitingPoint == null ? void 0 : limitingPoint.frequency) ?? null,
      rawCapabilityDb: rawAssessment.value,
      capabilityReserveDb: P14_SAFETY_MARGIN_DB,
      eqHeadroomConsumedDb,
      safetyMarginDb: P14_SAFETY_MARGIN_DB,
      capabilityCurve,
      limitingFrequencyRegion: (limitingRegion == null ? void 0 : limitingRegion.label) ?? null,
      regionalCapability: postEqAssessment.regional,
      value: p14CapabilityDb,
      formatted: formatP14Capability(p14CapabilityDb),
      level: gradeP14ForBasis(p14CapabilityDb, normalizedTargetBasis),
      targetBasis: normalizedTargetBasis,
      targetBasisLabel: formatP14BasisLabel(normalizedTargetBasis),
      minimumLevel: gradeP14Minimum(p14CapabilityDb),
      recommendedLevel: gradeP14Recommended(p14CapabilityDb),
      productCapabilityBeforeEqDb: rawAssessment.value,
      maximumAggregateEqBoostDb: eqHeadroomConsumedDb,
      headroomConsumedByEqDb: eqHeadroomConsumedDb,
      capabilityRemainingAfterEqDb: p14CapabilityDb,
      assessmentRangeHz: eqHeadroomDiagnostics.assessmentRangeHz,
      maximumInBandPositiveEqBoostDb: eqHeadroomDiagnostics.maximumInBandPositiveEqBoostDb,
      maximumInBandPositiveEqBoostFrequencyHz: eqHeadroomDiagnostics.maximumInBandPositiveEqBoostFrequencyHz,
      wholeBankMaximumPositiveEqBoostDb: eqHeadroomDiagnostics.wholeBankMaximumPositiveEqBoostDb,
      wholeBankMaximumPositiveEqBoostFrequencyHz: eqHeadroomDiagnostics.wholeBankMaximumPositiveEqBoostFrequencyHz,
      wholeBankMaximumExcludedFromP14: eqHeadroomDiagnostics.wholeBankMaximumExcludedFromP14,
      eqHeadroomDiagnostics,
      protectedNullDirectEffectDb: 0,
      source: "weighted-frequency-dependent-approved-continuous-lfe-capability-post-eq"
    };
  }
  const isFiniteNumber$2 = (value) => Number.isFinite(Number(value));
  const isPositivePower = (value) => value !== null && value !== void 0 && value !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
  const dbToPower = (db) => Math.pow(10, Number(db) / 10);
  const DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W = 1e3;
  function getPerSubwooferAmplifierAuthority(activeSubs, configuredPowerPerSubW = null) {
    const subs = Array.isArray(activeSubs) ? activeSubs : [];
    const firstConfiguredPowerW = subs.map((sub) => (sub == null ? void 0 : sub.subwooferAmplifierPowerW) ?? (sub == null ? void 0 : sub.amplifierPowerPerSubW)).find(isPositivePower);
    const defaultPowerPerSubW = isPositivePower(configuredPowerPerSubW) ? Number(configuredPowerPerSubW) : isPositivePower(firstConfiguredPowerW) ? Number(firstConfiguredPowerW) : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;
    const sourceAuthorities = subs.map((sub, index) => {
      const model = MODELS.find((candidate) => candidate.key === getModelKey(sub));
      const productPowerHandlingW = Number(model == null ? void 0 : model.max_power);
      const amplifierPowerW = isPositivePower((sub == null ? void 0 : sub.subwooferAmplifierPowerW) ?? (sub == null ? void 0 : sub.amplifierPowerPerSubW)) ? Number((sub == null ? void 0 : sub.subwooferAmplifierPowerW) ?? (sub == null ? void 0 : sub.amplifierPowerPerSubW)) : defaultPowerPerSubW;
      const powerRatio = Number.isFinite(productPowerHandlingW) && productPowerHandlingW > 0 ? Math.max(0, Math.min(1, amplifierPowerW / productPowerHandlingW)) : 1;
      return {
        index,
        modelKey: getModelKey(sub),
        amplifierPowerW,
        productPowerHandlingW: Number.isFinite(productPowerHandlingW) ? productPowerHandlingW : null,
        powerRatio,
        deratingDb: powerRatio > 0 ? 10 * Math.log10(powerRatio) : -Infinity,
        powerLimited: powerRatio < 1 - 1e-9
      };
    });
    return {
      powerPerSubW: defaultPowerPerSubW,
      totalAvailablePowerW: sourceAuthorities.reduce((sum, source) => sum + source.amplifierPowerW, 0),
      totalProductPowerHandlingW: sourceAuthorities.reduce((sum, source) => sum + (source.productPowerHandlingW || 0), 0),
      sourceAuthorities,
      powerLimited: sourceAuthorities.some((source) => source.powerLimited),
      allocationPolicy: "one-dedicated-amplifier-per-subwoofer"
    };
  }
  function interpolateCapabilityCurve(curve, frequency) {
    const points = Array.isArray(curve) ? curve.map((point) => ({ frequency: Number((point == null ? void 0 : point.frequency) ?? (point == null ? void 0 : point.hz) ?? (point == null ? void 0 : point[0])), spl: Number((point == null ? void 0 : point.spl) ?? (point == null ? void 0 : point.db) ?? (point == null ? void 0 : point[1])) })).filter((point) => isFiniteNumber$2(point.frequency) && isFiniteNumber$2(point.spl)).sort((a, b) => a.frequency - b.frequency) : [];
    if (!points.length || !isFiniteNumber$2(frequency)) return null;
    if (frequency <= points[0].frequency) return points[0].spl;
    if (frequency >= points[points.length - 1].frequency) return points[points.length - 1].spl;
    const upperIndex = points.findIndex((point) => point.frequency >= frequency);
    const low = points[upperIndex - 1];
    const high = points[upperIndex];
    const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
    return low.spl + (high.spl - low.spl) * ratio;
  }
  function getModelKey(sub) {
    return normaliseModelKey((sub == null ? void 0 : sub.modelKey) ?? (sub == null ? void 0 : sub.model) ?? "");
  }
  function getCombinedRequestedOutputDb(activeSubs) {
    const configured = (activeSubs || []).map((sub) => {
      var _a;
      return ((_a = sub == null ? void 0 : sub.tuning) == null ? void 0 : _a.requestedOutputDb) ?? (sub == null ? void 0 : sub.requestedOutputDb);
    }).find(isFiniteNumber$2);
    return isFiniteNumber$2(configured) ? Number(configured) : 114;
  }
  function getOverallLfeGainDb(activeSubs) {
    const configured = (activeSubs || []).map((sub) => {
      var _a;
      return ((_a = sub == null ? void 0 : sub.tuning) == null ? void 0 : _a.overallLfeGainDb) ?? (sub == null ? void 0 : sub.overallLfeGainDb);
    }).find(isFiniteNumber$2);
    return isFiniteNumber$2(configured) ? Number(configured) : 0;
  }
  function getSystemSourceCapability(activeSubs, frequency, amplifierPowerPerSubW = null) {
    const amplifier = getPerSubwooferAmplifierAuthority(activeSubs, amplifierPowerPerSubW);
    const levels = (activeSubs || []).map((sub) => interpolateCapabilityCurve(getSubwooferCurve(getModelKey(sub)), frequency));
    if (!levels.length || levels.some((level) => !isFiniteNumber$2(level))) return null;
    const summedPower = levels.reduce((sum, level, index) => {
      var _a;
      const deratingDb = ((_a = amplifier.sourceAuthorities[index]) == null ? void 0 : _a.deratingDb) ?? 0;
      return sum + dbToPower(level + deratingDb);
    }, 0);
    return 10 * Math.log10(summedPower);
  }
  function getCurrentSystemSourceOutput(activeSubs) {
    if (!(activeSubs || []).length) return null;
    return getCombinedRequestedOutputDb(activeSubs) + getOverallLfeGainDb(activeSubs);
  }
  function getSourceDomainBoostAllowance({ frequency, requestedBoostDb, activeSubs, usableLfHz, maxBoostDb = 6, requestedSystemOutputDb, amplifierPowerPerSubW = null }) {
    const requested = Math.max(0, Number(requestedBoostDb) || 0);
    const amplifierAuthority = getPerSubwooferAmplifierAuthority(activeSubs, amplifierPowerPerSubW);
    const systemCapabilityDb = getSystemSourceCapability(activeSubs, frequency, amplifierPowerPerSubW);
    const configuredSystemOutputDb = getCurrentSystemSourceOutput(activeSubs);
    const currentSystemSourceOutputDb = isFiniteNumber$2(requestedSystemOutputDb) ? Number(requestedSystemOutputDb) : configuredSystemOutputDb;
    const availableHeadroomDb = isFiniteNumber$2(systemCapabilityDb) && isFiniteNumber$2(currentSystemSourceOutputDb) ? systemCapabilityDb - P14_SAFETY_MARGIN_DB - currentSystemSourceOutputDb : null;
    const normalAllowedBoostDb = availableHeadroomDb == null ? Math.min(requested, maxBoostDb) : Math.max(0, Math.min(requested, maxBoostDb, availableHeadroomDb));
    const evaluationHz = Number(frequency);
    const sourceCoverage = (activeSubs || []).map((sub) => {
      const modelKey = getModelKey(sub);
      const curve = getSubwooferCurve(modelKey) || [];
      const curveFrequencies = curve.map((point) => Number((point == null ? void 0 : point.hz) ?? (point == null ? void 0 : point.frequency))).filter(Number.isFinite);
      const approvedRange = getApprovedFrequencyRangeHz(modelKey);
      const lowerHz = curveFrequencies.length ? Math.min(...curveFrequencies) : Number(approvedRange == null ? void 0 : approvedRange[0]);
      const upperHz = Math.max(
        curveFrequencies.length ? Math.max(...curveFrequencies) : -Infinity,
        Number.isFinite(Number(approvedRange == null ? void 0 : approvedRange[1])) ? Number(approvedRange[1]) : -Infinity
      );
      return {
        modelKey,
        lowerHz: Number.isFinite(lowerHz) ? lowerHz : null,
        upperHz: Number.isFinite(upperHz) ? upperHz : null,
        covered: Number.isFinite(evaluationHz) && Number.isFinite(lowerHz) && Number.isFinite(upperHz) && evaluationHz >= lowerHz && evaluationHz <= upperHz
      };
    });
    const frequencyCoveredByProducts = sourceCoverage.length > 0 && sourceCoverage.every((source) => source.covered);
    const rampFraction = frequencyCoveredByProducts ? 1 : 0;
    return {
      systemCapabilityDb,
      amplifierAuthority,
      currentSystemSourceOutputDb,
      availableHeadroomDb,
      headroomDb: availableHeadroomDb,
      requestedBoostDb: requested,
      usableLfHz: isFiniteNumber$2(usableLfHz) ? Number(usableLfHz) : null,
      sourceCoverage,
      frequencyCoveredByProducts,
      lfRampFraction: rampFraction,
      lfRampLimitDb: normalAllowedBoostDb * rampFraction,
      allowedBoostDb: normalAllowedBoostDb * rampFraction
    };
  }
  const SAMPLE_RATE = 48e3;
  let bankEvaluationCounter = 0;
  const resetDesignEqBankEvaluationCount = () => {
    bankEvaluationCounter = 0;
  };
  const getDesignEqBankEvaluationCount = () => bankEvaluationCounter;
  const filterSignature$1 = (filter) => [
    (filter == null ? void 0 : filter.enabled) ? 1 : 0,
    Number(filter == null ? void 0 : filter.frequencyHz),
    Number(filter == null ? void 0 : filter.gainDb),
    Number(filter == null ? void 0 : filter.Q)
  ].join(":");
  const bankSignature = (filters) => (filters || []).map(filterSignature$1).join("|");
  function createDesignEqBankEvaluationContext(raw, activeSubs, usableLfHz, requestedSystemOutputDb) {
    const rawPoints = Array.isArray(raw) ? raw : [];
    const bandIndices = rawPoints.map((point, index) => ({ point, index })).filter(({ point }) => point.frequency >= 20 && point.frequency <= 200);
    return {
      raw,
      rawPoints,
      bandIndices,
      permittedBoostDb: bandIndices.map(({ point }) => {
        const allowance = getSourceDomainBoostAllowance({
          frequency: point.frequency,
          requestedBoostDb: 6,
          activeSubs,
          usableLfHz,
          maxBoostDb: 6,
          requestedSystemOutputDb
        });
        return allowance.frequencyCoveredByProducts ? Math.max(0, Math.min(6, allowance.allowedBoostDb)) : null;
      }),
      filterResponses: /* @__PURE__ */ new Map(),
      bankLimitResults: /* @__PURE__ */ new Map(),
      curveResults: /* @__PURE__ */ new Map(),
      stats: {
        bankRequests: 0,
        uniqueBankEvaluations: 0,
        reusedBankEvaluations: 0,
        uniqueFilterResponses: 0,
        curveRequests: 0,
        reusedCurves: 0
      }
    };
  }
  function getDesignEqBankEvaluationContextStats(context) {
    return (context == null ? void 0 : context.stats) ? { ...context.stats } : null;
  }
  function responseForFilter$1(context, filter) {
    const key = filterSignature$1(filter);
    if (!context.filterResponses.has(key)) {
      context.filterResponses.set(
        key,
        context.rawPoints.map((point) => peakingEqResponseDb(point.frequency, filter))
      );
      context.stats.uniqueFilterResponses += 1;
    }
    return context.filterResponses.get(key);
  }
  function peakingEqResponseDb(frequencyHz, filter) {
    const evaluationHz = Number(frequencyHz);
    const requestedCentreHz = Number(filter == null ? void 0 : filter.frequencyHz);
    const centreHz = Math.min(requestedCentreHz, SAMPLE_RATE * 0.45);
    const gainDb = Number(filter == null ? void 0 : filter.gainDb);
    const q = Number(filter == null ? void 0 : filter.Q);
    if (!(filter == null ? void 0 : filter.enabled) || !Number.isFinite(evaluationHz) || evaluationHz <= 0 || !Number.isFinite(centreHz) || centreHz <= 0 || !Number.isFinite(q) || q <= 0 || !Number.isFinite(gainDb)) return 0;
    const A = 10 ** (gainDb / 40);
    const w0 = 2 * Math.PI * centreHz / SAMPLE_RATE;
    const alpha = Math.sin(w0) / (2 * q);
    const b0Raw = 1 + alpha * A;
    const b1Raw = -2 * Math.cos(w0);
    const b2Raw = 1 - alpha * A;
    const a0 = 1 + alpha / A;
    const a1Raw = -2 * Math.cos(w0);
    const a2Raw = 1 - alpha / A;
    if (![A, w0, alpha, b0Raw, b1Raw, b2Raw, a0, a1Raw, a2Raw].every(Number.isFinite) || a0 === 0) return 0;
    const b0 = b0Raw / a0;
    const b1 = b1Raw / a0;
    const b2 = b2Raw / a0;
    const a1 = a1Raw / a0;
    const a2 = a2Raw / a0;
    const w = 2 * Math.PI * evaluationHz / SAMPLE_RATE;
    const numeratorMagnitude = Math.hypot(
      b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w),
      -(b1 * Math.sin(w) + b2 * Math.sin(2 * w))
    );
    const denominatorMagnitude = Math.hypot(
      1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w),
      -(a1 * Math.sin(w) + a2 * Math.sin(2 * w))
    );
    if (![numeratorMagnitude, denominatorMagnitude].every(Number.isFinite) || numeratorMagnitude <= 0 || denominatorMagnitude <= 0) return 0;
    const responseDb = 20 * Math.log10(numeratorMagnitude / denominatorMagnitude);
    return Number.isFinite(responseDb) ? responseDb : 0;
  }
  function limitBoostForCapability(filter, activeSubs, usableLfHz, requestedSystemOutputDb) {
    if (!((filter == null ? void 0 : filter.gainDb) > 0)) return filter;
    const allowance = getSourceDomainBoostAllowance({
      frequency: filter.frequencyHz,
      requestedBoostDb: filter.gainDb,
      activeSubs,
      usableLfHz,
      maxBoostDb: 6,
      requestedSystemOutputDb
    });
    return { ...filter, gainDb: Math.max(0, Math.min(6, allowance.allowedBoostDb)) };
  }
  function aggregateResponseDbAt(frequency, filters) {
    return filters.reduce((sum, filter) => sum + peakingEqResponseDb(frequency, filter), 0);
  }
  function evaluateProvisionalBankLimits(filters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationContext = null) {
    bankEvaluationCounter += 1;
    const maximumAggregateBoostDb = ((profile == null ? void 0 : profile.maximumAggregateBoostDb) ?? 6) + 0.05;
    const aggregateCutFloorDb = -(((profile == null ? void 0 : profile.maximumCutDb) ?? 15) + 0.05);
    const prepared = (evaluationContext == null ? void 0 : evaluationContext.raw) === raw ? evaluationContext : null;
    const resultKey = prepared ? [maximumAggregateBoostDb, aggregateCutFloorDb, bankSignature(filters)].join("::") : null;
    if (prepared) {
      prepared.stats.bankRequests += 1;
      const cached = prepared.bankLimitResults.get(resultKey);
      if (cached) {
        prepared.stats.reusedBankEvaluations += 1;
        return cached;
      }
    }
    const bandPoints = prepared ? prepared.bandIndices.map(({ point }) => point) : raw.filter((point) => point.frequency >= 20 && point.frequency <= 200);
    const preparedResponses = prepared ? filters.map((filter) => responseForFilter$1(prepared, filter)) : null;
    let maxAggregateBoostDb = 0;
    let maxAggregateBoostHz = null;
    let maxAggregateCutDb = 0;
    let maxAggregateCutHz = null;
    let limitingPermittedBoostDb = 6;
    let boostLimitOk = true;
    let cutLimitOk = true;
    let sourceDomainHeadroomOk = true;
    for (let pointIndex = 0; pointIndex < bandPoints.length; pointIndex += 1) {
      const point = bandPoints[pointIndex];
      let aggregateDb = 0;
      if (prepared) {
        const rawIndex = prepared.bandIndices[pointIndex].index;
        for (const response of preparedResponses) aggregateDb += response[rawIndex];
      } else {
        aggregateDb = aggregateResponseDbAt(point.frequency, filters);
      }
      const sourceAllowance = prepared ? null : getSourceDomainBoostAllowance({
        frequency: point.frequency,
        requestedBoostDb: 6,
        activeSubs,
        usableLfHz,
        maxBoostDb: 6,
        requestedSystemOutputDb
      });
      const permittedBoostDb = prepared ? prepared.permittedBoostDb[pointIndex] : sourceAllowance.frequencyCoveredByProducts ? Math.max(0, Math.min(6, sourceAllowance.allowedBoostDb)) : null;
      if (Number.isFinite(permittedBoostDb)) {
        limitingPermittedBoostDb = Math.min(limitingPermittedBoostDb, permittedBoostDb);
      }
      if (aggregateDb > maxAggregateBoostDb) {
        maxAggregateBoostDb = aggregateDb;
        maxAggregateBoostHz = point.frequency;
      }
      if (aggregateDb < maxAggregateCutDb) {
        maxAggregateCutDb = aggregateDb;
        maxAggregateCutHz = point.frequency;
      }
      if (aggregateDb > maximumAggregateBoostDb) boostLimitOk = false;
      if (Number.isFinite(permittedBoostDb) && aggregateDb > permittedBoostDb + 0.05) sourceDomainHeadroomOk = false;
      if (aggregateDb < aggregateCutFloorDb) cutLimitOk = false;
    }
    const result = {
      maxAggregateBoostDb,
      maxAggregateBoostHz,
      maxAggregateCutDb,
      maxAggregateCutHz,
      limitingPermittedBoostDb,
      boostLimitOk,
      cutLimitOk,
      sourceDomainHeadroomOk,
      // The whole bank must remain inside the frequency-dependent source
      // headroom envelope. Per-filter centre-frequency clamping is necessary,
      // but overlapping filters can still exceed the allowance between centres.
      allOk: boostLimitOk && cutLimitOk && sourceDomainHeadroomOk
    };
    if (prepared) {
      prepared.bankLimitResults.set(resultKey, result);
      prepared.stats.uniqueBankEvaluations += 1;
    }
    return result;
  }
  function scaleCandidateForBankLimits(candidate, existingFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationContext = null) {
    const isBoost = candidate.gainDb > 0;
    let perFilterDiagnostics = null;
    let clampedCandidate = candidate;
    if (isBoost) {
      const requestedGainDb = candidate.gainDb;
      const allowance = getSourceDomainBoostAllowance({
        frequency: candidate.frequencyHz,
        requestedBoostDb: requestedGainDb,
        activeSubs,
        usableLfHz,
        maxBoostDb: 6,
        requestedSystemOutputDb
      });
      const allowedGainDb = Math.max(0, Math.min(6, allowance.allowedBoostDb));
      const appliedGainDb = Math.min(requestedGainDb, allowedGainDb);
      const headroomLimited = appliedGainDb < requestedGainDb - 0.05;
      perFilterDiagnostics = {
        frequencyHz: candidate.frequencyHz,
        requestedGainDb,
        allowedGainDb,
        appliedGainDb,
        headroomLimited,
        reason: headroomLimited ? `Boost reduced from ${requestedGainDb.toFixed(2)} dB to ${appliedGainDb.toFixed(2)} dB — source-domain headroom limit at ${candidate.frequencyHz.toFixed(1)} Hz` : `Boost within source-domain allowance at ${candidate.frequencyHz.toFixed(1)} Hz`
      };
      if (appliedGainDb <= 0.1) {
        return {
          filter: null,
          scaled: true,
          limits: evaluateProvisionalBankLimits([...existingFilters, { ...candidate, gainDb: 0 }], raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationContext),
          perFilterDiagnostics
        };
      }
      clampedCandidate = { ...candidate, gainDb: appliedGainDb };
    }
    const initial = evaluateProvisionalBankLimits([...existingFilters, clampedCandidate], raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationContext);
    if (initial.allOk) return { filter: clampedCandidate, scaled: clampedCandidate.gainDb !== candidate.gainDb, limits: initial, perFilterDiagnostics };
    let low = 0;
    let high = Math.abs(clampedCandidate.gainDb);
    for (let index = 0; index < 14; index += 1) {
      const magnitude = (low + high) / 2;
      const gainDb2 = isBoost ? magnitude : -magnitude;
      const limits = evaluateProvisionalBankLimits(
        [...existingFilters, { ...clampedCandidate, gainDb: gainDb2 }],
        raw,
        activeSubs,
        usableLfHz,
        requestedSystemOutputDb,
        profile,
        evaluationContext
      );
      if (limits.allOk) low = magnitude;
      else high = magnitude;
    }
    const gainDb = isBoost ? low : -low;
    if (Math.abs(gainDb) <= 0.1) return { filter: null, scaled: true, limits: initial, perFilterDiagnostics };
    const filter = { ...clampedCandidate, gainDb };
    return {
      filter,
      scaled: true,
      limits: evaluateProvisionalBankLimits([...existingFilters, filter], raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationContext),
      perFilterDiagnostics
    };
  }
  function isNearDuplicate(candidate, existingFilters) {
    const sign = candidate.gainDb > 0 ? 1 : -1;
    return existingFilters.some((filter) => {
      if (!filter.enabled || (filter.gainDb > 0 ? 1 : -1) !== sign) return false;
      const frequencyDistance = Math.log2(Math.max(candidate.frequencyHz, filter.frequencyHz) / Math.min(candidate.frequencyHz, filter.frequencyHz));
      const qRatio = Math.max(candidate.Q, filter.Q) / Math.min(candidate.Q, filter.Q);
      return frequencyDistance <= 1 / 24 && qRatio <= 1.25;
    });
  }
  function countSameSignFiltersInRegion(candidate, existingFilters) {
    const sign = candidate.gainDb > 0 ? 1 : -1;
    return existingFilters.filter((filter) => {
      if (!filter.enabled || (filter.gainDb > 0 ? 1 : -1) !== sign) return false;
      return Math.log2(Math.max(candidate.frequencyHz, filter.frequencyHz) / Math.min(candidate.frequencyHz, filter.frequencyHz)) <= 1 / 12;
    }).length;
  }
  function maxSameRegionFilterCount(filters) {
    return filters.reduce((maximum, candidate) => candidate.enabled ? Math.max(maximum, countSameSignFiltersInRegion(candidate, filters.filter((filter) => filter !== candidate)) + 1) : maximum, 0);
  }
  function buildCurveFromBank(raw, filters, evaluationContext = null) {
    const prepared = (evaluationContext == null ? void 0 : evaluationContext.raw) === raw ? evaluationContext : null;
    if (!prepared) {
      return raw.map((point) => ({
        frequency: point.frequency,
        spl: point.spl + aggregateResponseDbAt(point.frequency, filters)
      }));
    }
    prepared.stats.curveRequests += 1;
    const key = bankSignature(filters);
    const cached = prepared.curveResults.get(key);
    if (cached) {
      prepared.stats.reusedCurves += 1;
      return cached;
    }
    const responses = filters.map((filter) => responseForFilter$1(prepared, filter));
    const curve = raw.map((point, pointIndex) => {
      let aggregateDb = 0;
      for (const response of responses) aggregateDb += response[pointIndex];
      return { frequency: point.frequency, spl: point.spl + aggregateDb };
    });
    prepared.curveResults.set(key, curve);
    return curve;
  }
  function scaleRevisionForBankLimits(existingFilter, proposedGainDelta, filterIndex, existingFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationContext = null) {
    const maximumCutDb = (profile == null ? void 0 : profile.maximumCutDb) ?? 15;
    const maximumAggregateBoostDb = (profile == null ? void 0 : profile.maximumAggregateBoostDb) ?? 6;
    const proposedGain = existingFilter.gainDb + proposedGainDelta;
    const clampedGain = existingFilter.gainDb > 0 ? Math.min(maximumAggregateBoostDb, proposedGain) : Math.max(-maximumCutDb, proposedGain);
    const clampedDelta = clampedGain - existingFilter.gainDb;
    if (Math.abs(clampedDelta) <= 0.1) return { filter: null, scaled: false, limits: null, acceptedDelta: 0 };
    const revisedFilter = { ...existingFilter, gainDb: clampedGain };
    const initialFilters = existingFilters.map((filter2, index) => index === filterIndex ? revisedFilter : filter2);
    const initial = evaluateProvisionalBankLimits(initialFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationContext);
    if (initial.allOk) return { filter: revisedFilter, scaled: false, limits: initial, acceptedDelta: clampedDelta };
    const isBoost = clampedDelta > 0;
    let low = 0;
    let high = Math.abs(clampedDelta);
    for (let index = 0; index < 14; index += 1) {
      const magnitude = (low + high) / 2;
      const delta = isBoost ? magnitude : -magnitude;
      const trial = { ...existingFilter, gainDb: existingFilter.gainDb + delta };
      const trialFilters = existingFilters.map((filter2, candidateIndex) => candidateIndex === filterIndex ? trial : filter2);
      const limits = evaluateProvisionalBankLimits(trialFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationContext);
      if (limits.allOk) low = magnitude;
      else high = magnitude;
    }
    const acceptedDelta = isBoost ? low : -low;
    if (Math.abs(acceptedDelta) <= 0.1) return { filter: null, scaled: true, limits: initial, acceptedDelta: 0 };
    const filter = { ...existingFilter, gainDb: existingFilter.gainDb + acceptedDelta };
    const acceptedFilters = existingFilters.map((entry, index) => index === filterIndex ? filter : entry);
    return {
      filter,
      scaled: true,
      limits: evaluateProvisionalBankLimits(acceptedFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationContext),
      acceptedDelta
    };
  }
  function emptyFilters(filters) {
    return [...filters, ...Array.from({ length: Math.max(0, 10 - filters.length) }, (_, index) => ({
      band: filters.length + index + 1,
      enabled: false,
      type: "Peak",
      frequencyHz: null,
      gainDb: 0,
      Q: null,
      startHz: null,
      endHz: null,
      reason: "Unused"
    }))];
  }
  const isNumber$2 = (value) => Number.isFinite(Number(value));
  const DESIGN_EQ_FIT_PROFILES = {
    standard: {
      id: "standard",
      preserveP14: false,
      fittingToleranceDb: 2,
      maximumCutDb: 15,
      maximumAggregateBoostDb: 6,
      peakDiscoveryThresholdDb: 2,
      valleyDiscoveryThresholdDb: 2
    },
    accuracy: {
      id: "accuracy",
      preserveP14: false,
      fittingToleranceDb: 1,
      maximumCutDb: 15,
      maximumAggregateBoostDb: 6,
      peakDiscoveryThresholdDb: 1,
      valleyDiscoveryThresholdDb: 1
    }
  };
  function getDesignEqFitProfile(profileId) {
    return DESIGN_EQ_FIT_PROFILES[profileId] || DESIGN_EQ_FIT_PROFILES.standard;
  }
  function normaliseCurve(curveData) {
    return (Array.isArray(curveData) ? curveData : []).map((point) => ({ frequency: Number(point == null ? void 0 : point.frequency), spl: Number(point == null ? void 0 : point.spl) })).filter((point) => isNumber$2(point.frequency) && isNumber$2(point.spl) && point.frequency > 0).sort((a, b) => a.frequency - b.frequency);
  }
  function interpolate$1(curve, frequency) {
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
    const sorted = values.filter(isNumber$2).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function deviationAt(curve, frequency, anchorDb) {
    const spl = interpolate$1(curve, frequency);
    return isNumber$2(spl) ? spl - (anchorDb + artcousticHouseCurveOffsetAt(frequency)) : null;
  }
  function octaveWidth(startHz, endHz) {
    return startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;
  }
  function findRegions(points, kind, peakThresholdDb = 2, valleyThresholdDb = 2) {
    const matches = (point) => kind === "peak" ? point.deviationDb >= peakThresholdDb : point.deviationDb <= -valleyThresholdDb;
    const minimumWidth = kind === "peak" ? 1 / 6 : 1 / 3;
    const regions = [];
    let current = [];
    const finish = () => {
      if (!current.length) return;
      const startHz = current[0].frequency;
      const endHz = current[current.length - 1].frequency;
      const width = octaveWidth(startHz, endHz);
      if (width >= minimumWidth) {
        const subRegions = splitBroadRegionAtValleys(current, kind, minimumWidth);
        for (const subRegion of subRegions) {
          const subStartHz = subRegion[0].frequency;
          const subEndHz = subRegion[subRegion.length - 1].frequency;
          const subWidth = octaveWidth(subStartHz, subEndHz);
          if (subWidth >= minimumWidth) {
            const centrePoint = subRegion.reduce((best, point) => kind === "peak" ? point.deviationDb > best.deviationDb ? point : best : point.deviationDb < best.deviationDb ? point : best);
            regions.push({ kind, startHz: subStartHz, endHz: subEndHz, widthOctaves: subWidth, centrePoint, severityDb: Math.abs(centrePoint.deviationDb) });
          }
        }
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
  function qForRegion(region) {
    const bandwidthHz = Math.max(region.endHz - region.startHz, 0.01);
    return Math.max(0.5, Math.min(10, region.centrePoint.frequency / bandwidthHz));
  }
  function splitBroadRegionAtValleys(points, kind, minimumWidth) {
    if (points.length < 5) return [points];
    const splitIndices = [];
    for (let i = 2; i < points.length - 2; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      if (kind === "peak") {
        if (curr.deviationDb <= prev.deviationDb && curr.deviationDb <= next.deviationDb) {
          const higherNeighbor = Math.max(prev.deviationDb, next.deviationDb);
          if (higherNeighbor - curr.deviationDb >= 1) splitIndices.push(i);
        }
      } else {
        if (curr.deviationDb >= prev.deviationDb && curr.deviationDb >= next.deviationDb) {
          const lowerNeighbor = Math.min(prev.deviationDb, next.deviationDb);
          if (curr.deviationDb - lowerNeighbor >= 1) splitIndices.push(i);
        }
      }
    }
    if (!splitIndices.length) return [points];
    const subRegions = [];
    let start = 0;
    for (const splitIndex of splitIndices) {
      subRegions.push(points.slice(start, splitIndex + 1));
      start = splitIndex;
    }
    subRegions.push(points.slice(start));
    const validSubRegions = subRegions.filter((subRegion) => {
      if (subRegion.length < 2) return false;
      return octaveWidth(subRegion[0].frequency, subRegion[subRegion.length - 1].frequency) >= minimumWidth;
    });
    return validSubRegions.length > 0 ? validSubRegions : [points];
  }
  function completeBandResidualMetrics(trend, assessmentStartHz, assessmentEndHz, anchorDb) {
    const points = trend.filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz).map((point) => ({
      frequency: point.frequency,
      deviationDb: deviationAt(trend, point.frequency, anchorDb)
    })).filter((point) => isNumber$2(point.deviationDb));
    if (!points.length) return null;
    const worst = points.reduce((current, point) => Math.abs(point.deviationDb) > Math.abs(current.deviationDb) ? point : current);
    return {
      points,
      maximumAbsoluteDeviationDb: Math.abs(worst.deviationDb),
      rmsDeviationDb: Math.sqrt(points.reduce((sum, point) => sum + point.deviationDb ** 2, 0) / points.length),
      worstResidualFrequencyHz: worst.frequency
    };
  }
  function createsBroadBelowTargetWorsening(beforeTrend, afterMetrics, anchorDb, fittingToleranceDb) {
    let regionStartHz = null;
    let regionEndHz = null;
    const closesMaterialRegion = () => {
      const isMaterial = regionStartHz !== null && regionEndHz !== null && octaveWidth(regionStartHz, regionEndHz) >= 1 / 6;
      regionStartHz = null;
      regionEndHz = null;
      return isMaterial;
    };
    for (const point of afterMetrics.points) {
      const beforeDeviationDb = deviationAt(beforeTrend, point.frequency, anchorDb);
      const isWorseBelowTarget = Number.isFinite(beforeDeviationDb) && point.deviationDb < -fittingToleranceDb && point.deviationDb <= beforeDeviationDb - 0.25;
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
    const values = curve.filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz).map((point) => Number(point.spl)).filter(Number.isFinite);
    return values.length ? Math.min(...values) : null;
  }
  function buildCheckpoint({ filters, curve, originalTrend, assessmentStartHz, assessmentEndHz, anchorDb, fittingToleranceDb }) {
    const trend = applyBassSmoothing(curve, "third");
    const metrics = completeBandResidualMetrics(trend, assessmentStartHz, assessmentEndHz, anchorDb);
    const rawMinimumSpl = minimumSplAcrossBand(curve, assessmentStartHz, assessmentEndHz);
    const smoothedMinimumSpl = minimumSplAcrossBand(trend, assessmentStartHz, assessmentEndHz);
    const broadBelowTargetWorsening = filters.length > 0 && metrics ? createsBroadBelowTargetWorsening(originalTrend, metrics, anchorDb, fittingToleranceDb) : false;
    return {
      filters: filters.map((filter) => ({ ...filter })),
      curve: curve.map((point) => ({ ...point })),
      trend: trend.map((point) => ({ ...point })),
      maximumAbsoluteDeviationDb: (metrics == null ? void 0 : metrics.maximumAbsoluteDeviationDb) ?? Infinity,
      rmsDeviationDb: (metrics == null ? void 0 : metrics.rmsDeviationDb) ?? Infinity,
      worstResidualFrequencyHz: (metrics == null ? void 0 : metrics.worstResidualFrequencyHz) ?? null,
      rawMinimumSpl,
      smoothedMinimumSpl,
      minimumSpl: smoothedMinimumSpl,
      broadBelowTargetWorsening
    };
  }
  function calculateDesignEqCurve(curveData, usableLfHz, activeSubs = [], options = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const raw = normaliseCurve(curveData);
    if (!raw.length) return { curve: curveData || [], diagnostics: [], filters: emptyFilters([]), combinedEqCurve: [], designEqFitProfile: "standard" };
    const thirdOctave = applyBassSmoothing(raw, "third");
    const referenceBand = thirdOctave.filter((point) => point.frequency >= 150 && point.frequency <= 200);
    const measuredAnchorDb = median((referenceBand.length ? referenceBand : thirdOctave).map((point) => point.spl));
    const assessmentStartHz = Number.isFinite(Number(options.assessmentStartHz)) ? Number(options.assessmentStartHz) : 20;
    const assessmentEndHz = Number.isFinite(Number(options.assessmentEndHz)) ? Number(options.assessmentEndHz) : 200;
    const p14TargetDb = Number.isFinite(Number(options.p14TargetDb)) ? Number(options.p14TargetDb) : null;
    const bassBandPoints = thirdOctave.filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz);
    const currentIntegratedBassDb = bassBandPoints.length ? 10 * Math.log10(bassBandPoints.reduce((sum, p) => sum + Math.pow(10, p.spl / 10), 0) / bassBandPoints.length) : measuredAnchorDb;
    const requiredP14OffsetDb = p14TargetDb != null && isNumber$2(currentIntegratedBassDb) ? p14TargetDb - currentIntegratedBassDb : 0;
    const finalDesignTargetAnchorDb = measuredAnchorDb + requiredP14OffsetDb;
    const anchorDb = isNumber$2(options.targetAnchorDb) ? Number(options.targetAnchorDb) : finalDesignTargetAnchorDb;
    if (!isNumber$2(anchorDb)) return { curve: raw, diagnostics: [], filters: emptyFilters([]), combinedEqCurve: [], designEqFitProfile: "standard" };
    const canonicalTargetCurve = Array.isArray(options.canonicalTargetCurve) ? options.canonicalTargetCurve : [];
    const protectedNullRegions = Array.isArray(options.protectedNullRegions) ? options.protectedNullRegions : [];
    const profile = getDesignEqFitProfile(options.fitProfile);
    const profileFittingToleranceDb = Number.isFinite(Number(profile.fittingToleranceDb)) ? Number(profile.fittingToleranceDb) : 2;
    const requestedFittingToleranceDb = Number.isFinite(Number(options.fittingToleranceDb)) ? Number(options.fittingToleranceDb) : profileFittingToleranceDb;
    const fittingToleranceDb = Math.max(1, Math.min(5, requestedFittingToleranceDb));
    const requestedSystemOutputDb = Number(options.requestedSystemOutputDb);
    const p14TargetDbForInvariant = Number.isFinite(Number(options.p14TargetDb)) ? Number(options.p14TargetDb) : null;
    const operatingOutputInvariantOk = p14TargetDbForInvariant != null && Number.isFinite(requestedSystemOutputDb) && Math.abs(requestedSystemOutputDb - p14TargetDbForInvariant) <= 0.05;
    const collectDiagnostics = options.collectDiagnostics !== false;
    const initialFilters = Array.isArray(options.initialFilters) ? options.initialFilters.filter((f) => f && f.enabled && Number.isFinite(f.frequencyHz) && f.frequencyHz > 0 && Number.isFinite(f.gainDb) && Number.isFinite(f.Q) && f.Q > 0).filter((filter) => {
      const frequency = Number(filter.frequencyHz);
      const authority = classifyEqCorrectionRegion({
        frequency,
        rawSpl: interpolate$1(raw, frequency),
        currentSpl: interpolate$1(raw, frequency),
        targetSpl: anchorDb + artcousticHouseCurveOffsetAt(frequency),
        protectedNull: isProtectedFrequency(frequency, protectedNullRegions),
        requestedGainDb: filter.gainDb
      });
      return validatePhysicalEqAction(authority.classification, filter.gainDb).passed;
    }).slice(0, 10).map((f) => ({ ...f })) : [];
    const hasInitialFilters = initialFilters.length > 0;
    resetDesignEqBankEvaluationCount();
    const bankEvaluationContext = createDesignEqBankEvaluationContext(
      raw,
      activeSubs,
      usableLfHz,
      requestedSystemOutputDb
    );
    const filters = hasInitialFilters ? initialFilters.map((f) => ({ ...f })) : [];
    let curve = hasInitialFilters ? buildCurveFromBank(raw, filters, bankEvaluationContext) : raw;
    let stopReason = "no safe improvement remained";
    const checkpoints = [buildCheckpoint({
      filters,
      curve,
      originalTrend: thirdOctave,
      assessmentStartHz,
      assessmentEndHz,
      anchorDb,
      fittingToleranceDb
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
    while (operations < maxOperations) {
      const trend = applyBassSmoothing(curve, "third");
      const trendPoints = trend.filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz).map((point) => ({ ...point, deviationDb: deviationAt(trend, point.frequency, anchorDb) }));
      const currentMetrics = completeBandResidualMetrics(trend, assessmentStartHz, assessmentEndHz, anchorDb);
      if (!currentMetrics) break;
      if (currentMetrics.maximumAbsoluteDeviationDb <= fittingToleranceDb) {
        stopReason = "fitting tolerance achieved";
        break;
      }
      const peakDiscoveryThresholdDb = Math.max(0.5, Math.min(3, profile.peakDiscoveryThresholdDb ?? fittingToleranceDb));
      const valleyDiscoveryThresholdDb = Math.max(0.5, Math.min(3, profile.valleyDiscoveryThresholdDb ?? fittingToleranceDb));
      const regions = [
        ...findRegions(trendPoints, "peak", peakDiscoveryThresholdDb, valleyDiscoveryThresholdDb),
        ...findRegions(trendPoints, "valley", peakDiscoveryThresholdDb, valleyDiscoveryThresholdDb)
      ].sort((a, b) => b.severityDb - a.severityDb);
      if (!regions.length) break;
      const currentMinimumSpl = minimumSplAcrossBand(curve, assessmentStartHz, assessmentEndHz);
      const currentP14MinimumSpl = minimumSplAcrossBand(trend, assessmentStartHz, assessmentEndHz);
      if (!Number.isFinite(currentMinimumSpl)) break;
      const acceptableCandidates = [];
      const gainScales = [1, 0.75, 0.5];
      const qMultipliers = [1, 1.5, 2, 3];
      const gentlePeakCutGainScales = [0.5, 0.75, 1];
      for (const region of regions) {
        const isInsideProtectedNull = isProtectedFrequency(region.centrePoint.frequency, protectedNullRegions);
        const rawCentreSpl = interpolate$1(raw, region.centrePoint.frequency);
        const targetCentreSpl = anchorDb + artcousticHouseCurveOffsetAt(region.centrePoint.frequency);
        const physicalAuthority = classifyEqCorrectionRegion({
          frequency: region.centrePoint.frequency,
          rawSpl: rawCentreSpl,
          currentSpl: region.centrePoint.spl,
          targetSpl: targetCentreSpl,
          protectedNull: isInsideProtectedNull,
          widthOctaves: region.widthOctaves
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
          insideProtectedNull: isInsideProtectedNull
        });
        if (physicalAuthority.classification === "Null") continue;
        const maximumCutDb = profile.maximumCutDb ?? 10;
        const maximumAggregateBoostDb = profile.maximumAggregateBoostDb ?? 6;
        const requestedGainDb = isPeak ? -Math.min(maximumCutDb, Math.max(region.severityDb, Math.abs(physicalAuthority.rawResidualDb || 0)) * 0.85) : Math.min(maximumAggregateBoostDb, region.severityDb * 0.75);
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
          reason: physicalAuthority.reason
        }, activeSubs, usableLfHz, options.requestedSystemOutputDb);
        if (Math.abs(baseCandidate.gainDb) <= 0.1 || !validatePhysicalEqAction(physicalAuthority.classification, baseCandidate.gainDb).passed) continue;
        const regionSameSignCount = countSameSignFiltersInRegion(baseCandidate, filters);
        const regionAppendCandidates = [];
        const seenVariants = /* @__PURE__ */ new Set();
        if (filters.length < 10) {
          const gainScaleEntries = isPeak ? [
            ...gainScales.map((gainScale) => ({ baseGainDb: baseCandidate.gainDb, gainScale })),
            ...gentlePeakCutGainScales.map((gainScale) => ({ baseGainDb: -region.severityDb, gainScale }))
          ] : gainScales.map((gainScale) => ({ baseGainDb: baseCandidate.gainDb, gainScale }));
          for (const { baseGainDb, gainScale } of gainScaleEntries) {
            for (const qMultiplier of qMultipliers) {
              const scaledCandidate = {
                ...baseCandidate,
                gainDb: baseGainDb * gainScale,
                Q: Math.max(0.5, Math.min(10, baseCandidate.Q * qMultiplier))
              };
              const candidate = scaledCandidate.gainDb > 0 ? limitBoostForCapability(scaledCandidate, activeSubs, usableLfHz, options.requestedSystemOutputDb) : scaledCandidate;
              const variantKey = `${candidate.gainDb.toFixed(4)}:${candidate.Q.toFixed(4)}`;
              if (seenVariants.has(variantKey) || Math.abs(candidate.gainDb) <= 0.1) continue;
              seenVariants.add(variantKey);
              const isDuplicate = isNearDuplicate(candidate, filters);
              const sameRegionCount = countSameSignFiltersInRegion(candidate, filters);
              if (isDuplicate) nearDuplicateRejectedCount++;
              if (sameRegionCount >= 2) sameRegionRejectedCount++;
              if (isDuplicate || sameRegionCount >= 2) continue;
              const gainBeforeBankLimiting = candidate.gainDb;
              const bankResult = scaleCandidateForBankLimits(candidate, filters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb, profile, bankEvaluationContext);
              if (!bankResult.filter) {
                bankLimitRejectedCount++;
                continue;
              }
              if (bankResult.scaled) bankLimitScaledCount++;
              const finalCandidate = bankResult.filter;
              const gainAfterBankLimiting = finalCandidate.gainDb;
              const nextCurve = buildCurveFromBank(raw, [...filters, finalCandidate], bankEvaluationContext);
              const nextTrend = applyBassSmoothing(nextCurve, "third");
              const nextMetrics = completeBandResidualMetrics(nextTrend, assessmentStartHz, assessmentEndHz, anchorDb);
              if (!nextMetrics) continue;
              const before = Math.abs(region.centrePoint.deviationDb);
              const after = Math.abs(deviationAt(nextTrend, region.centrePoint.frequency, anchorDb));
              const localImprovementDb = before - after;
              const maximumDeviationReductionDb = currentMetrics.maximumAbsoluteDeviationDb - nextMetrics.maximumAbsoluteDeviationDb;
              const rmsReductionDb = currentMetrics.rmsDeviationDb - nextMetrics.rmsDeviationDb;
              const acousticObjectiveImprovementDb = maximumDeviationReductionDb + 0.35 * rmsReductionDb;
              const normalRefinementAcceptable = localImprovementDb >= 0.05 && nextMetrics.maximumAbsoluteDeviationDb <= currentMetrics.maximumAbsoluteDeviationDb + 0.05 && (maximumDeviationReductionDb >= 0.1 || rmsReductionDb >= 0.1);
              const isMajorModalCorrectionCandidate = region.kind === "peak" && region.severityDb >= 4 && !isInsideProtectedNull && localImprovementDb >= 1;
              const modalAcceptanceResult = isMajorModalCorrectionCandidate;
              const candidateClassification = modalAcceptanceResult ? "modal correction" : "normal refinement";
              const acceptable = modalAcceptanceResult || normalRefinementAcceptable;
              const acceptanceReason = modalAcceptanceResult ? "Accepted: major modal correction passed the modal gate without requiring complete-band improvement." : acceptable ? "Accepted: normal refinement improved the fixed house-curve objective." : `Rejected: normal refinement failed global improvement gate; modal gate ${region.kind !== "peak" ? "requires a peak" : region.severityDb < 4 ? "requires at least 4 dB severity" : isInsideProtectedNull ? "blocked by protected null" : "requires at least 1 dB local improvement"}.`;
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
                reason: acceptanceReason
              });
              if (acceptable) regionAppendCandidates.push({
                action: "append",
                filter: finalCandidate,
                replacedFilterIndex: null,
                oldGainDb: null,
                newGainDb: finalCandidate.gainDb,
                gainDeltaDb: finalCandidate.gainDb,
                oldQ: null,
                newQ: finalCandidate.Q,
                curve: nextCurve,
                maximumDeviationReductionDb,
                rmsReductionDb,
                localImprovementDb,
                candidateClassification,
                acceptanceReason,
                acousticObjectiveImprovementDb,
                gainBeforeBankLimiting,
                gainAfterBankLimiting,
                bankLimits: bankResult.limits,
                regionSameSignCount
              });
            }
          }
        }
        if (regionAppendCandidates.length === 0 || regionSameSignCount >= 2) {
          const seenRevisionsRegion = /* @__PURE__ */ new Set();
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
                const revisionResult = scaleRevisionForBankLimits(existingFilter, proposedGainDelta, filterIndex, filters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb, profile, bankEvaluationContext);
                revisionAttemptCount++;
                const attempt = {
                  filterIndex,
                  oldGainDb: existingFilter.gainDb,
                  proposedGainDb,
                  acceptedGainDb: revisionResult.filter ? revisionResult.filter.gainDb : existingFilter.gainDb,
                  bankMaxBoostDb: ((_a = revisionResult.limits) == null ? void 0 : _a.maxAggregateBoostDb) ?? null,
                  bankMaxBoostHz: ((_b = revisionResult.limits) == null ? void 0 : _b.maxAggregateBoostHz) ?? null,
                  bankMaxCutDb: ((_c = revisionResult.limits) == null ? void 0 : _c.maxAggregateCutDb) ?? null,
                  bankMaxCutHz: ((_d = revisionResult.limits) == null ? void 0 : _d.maxAggregateCutHz) ?? null,
                  maximumDeviationBeforeDb: currentMetrics.maximumAbsoluteDeviationDb,
                  maximumDeviationAfterDb: null,
                  rmsBeforeDb: currentMetrics.rmsDeviationDb,
                  rmsAfterDb: null,
                  passedRules: false,
                  rejectionReason: null
                };
                if (!revisionResult.filter) {
                  attempt.rejectionReason = "Gain change below 0.1 dB after bank limiting";
                  if (collectDiagnostics) revisionAttempts.push(attempt);
                  continue;
                }
                const revisedFilter = revisionResult.filter;
                const revisedFilters = filters.map((f, i) => i === filterIndex ? revisedFilter : f);
                const revisedCurve = buildCurveFromBank(raw, revisedFilters, bankEvaluationContext);
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
                const normalRefinementAcceptable = localImprovementDb >= 0.05 && revisedMetrics.maximumAbsoluteDeviationDb <= currentMetrics.maximumAbsoluteDeviationDb + 0.05 && (maximumDeviationReductionDb >= 0.1 || rmsReductionDb >= 0.1);
                const isMajorModalCorrectionCandidate = region.kind === "peak" && region.severityDb >= 4 && !isInsideProtectedNull && localImprovementDb >= 1;
                const modalAcceptanceResult = isMajorModalCorrectionCandidate;
                const candidateClassification = modalAcceptanceResult ? "modal correction" : "normal refinement";
                const acceptable = modalAcceptanceResult || normalRefinementAcceptable;
                const acceptanceReason = modalAcceptanceResult ? "Accepted: major modal correction passed the modal gate without requiring complete-band improvement." : acceptable ? "Accepted: normal refinement improved the fixed house-curve objective." : `Rejected: normal refinement failed global improvement gate; modal gate ${region.kind !== "peak" ? "requires a peak" : region.severityDb < 4 ? "requires at least 4 dB severity" : isInsideProtectedNull ? "blocked by protected null" : "requires at least 1 dB local improvement"}.`;
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
                  reason: acceptanceReason
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
                    action: "revise",
                    filter: revisedFilter,
                    replacedFilterIndex: filterIndex,
                    oldGainDb: existingFilter.gainDb,
                    newGainDb: revisedFilter.gainDb,
                    gainDeltaDb: revisedFilter.gainDb - existingFilter.gainDb,
                    oldQ: existingFilter.Q,
                    newQ: existingFilter.Q,
                    curve: revisedCurve,
                    maximumDeviationReductionDb,
                    rmsReductionDb,
                    localImprovementDb,
                    candidateClassification,
                    acceptanceReason,
                    acousticObjectiveImprovementDb,
                    bankLimits: revisionResult.limits,
                    regionSameSignCount
                  });
                }
              }
            }
          }
        }
        acceptableCandidates.push(...regionAppendCandidates);
      }
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
        sortedCandidateOrder: acceptableCandidates.map((candidate, index) => {
          var _a2, _b2, _c2;
          return {
            rank: index + 1,
            action: candidate.action,
            frequencyHz: ((_a2 = candidate.filter) == null ? void 0 : _a2.frequencyHz) ?? null,
            gainDb: ((_b2 = candidate.filter) == null ? void 0 : _b2.gainDb) ?? null,
            Q: ((_c2 = candidate.filter) == null ? void 0 : _c2.Q) ?? null,
            classification: candidate.candidateClassification || null,
            acousticObjectiveImprovementDb: candidate.acousticObjectiveImprovementDb ?? null
          };
        }),
        chosen: chosen ? {
          action: chosen.action,
          frequencyHz: ((_e = chosen.filter) == null ? void 0 : _e.frequencyHz) ?? null,
          gainDb: ((_f = chosen.filter) == null ? void 0 : _f.gainDb) ?? null,
          Q: ((_g = chosen.filter) == null ? void 0 : _g.Q) ?? null,
          classification: chosen.candidateClassification || null
        } : null,
        rejectionReason: acceptableCandidates.length > 0 && !chosen ? "Candidates remained after sorting but no chosen candidate was produced." : null
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
      curve = buildCurveFromBank(raw, filters, bankEvaluationContext);
      const checkpoint = buildCheckpoint({
        filters,
        curve,
        originalTrend: thirdOctave,
        assessmentStartHz,
        assessmentEndHz,
        anchorDb,
        fittingToleranceDb
      });
      checkpoints.push(checkpoint);
      if (collectDiagnostics) iterationTrace.push({
        iteration: operations + 1,
        action: chosen.action,
        replacedFilterIndex: chosen.replacedFilterIndex,
        selectedFrequencyHz: chosen.filter.frequencyHz,
        gainDb: chosen.filter.gainDb,
        Q: chosen.filter.Q,
        oldGainDb: chosen.oldGainDb,
        newGainDb: chosen.newGainDb,
        gainDeltaDb: chosen.gainDeltaDb,
        oldQ: chosen.oldQ,
        newQ: chosen.newQ,
        candidateClassification: chosen.candidateClassification,
        localImprovementDb: chosen.localImprovementDb,
        maximumDeviationReductionDb: chosen.maximumDeviationReductionDb,
        rmsReductionDb: chosen.rmsReductionDb,
        acceptanceReason: chosen.acceptanceReason,
        maximumDeviationBeforeDb: currentMetrics.maximumAbsoluteDeviationDb,
        maximumDeviationAfterDb: checkpoint.maximumAbsoluteDeviationDb,
        rmsBeforeDb: currentMetrics.rmsDeviationDb,
        rmsAfterDb: checkpoint.rmsDeviationDb,
        rawMinimumSplBeforeDb: currentMinimumSpl,
        rawMinimumSplAfterDb: checkpoint.rawMinimumSpl,
        smoothedMinimumSplBeforeDb: currentP14MinimumSpl,
        smoothedMinimumSplAfterDb: checkpoint.smoothedMinimumSpl,
        broadBelowTargetWorsening: checkpoint.broadBelowTargetWorsening,
        gainBeforeBankLimiting: chosen.gainBeforeBankLimiting,
        gainAfterBankLimiting: chosen.gainAfterBankLimiting,
        aggregateMaxBoostAfterDb: ((_h = chosen.bankLimits) == null ? void 0 : _h.maxAggregateBoostDb) ?? 0,
        aggregateMaxBoostAfterHz: ((_i = chosen.bankLimits) == null ? void 0 : _i.maxAggregateBoostHz) ?? null,
        aggregateMaxCutAfterDb: ((_j = chosen.bankLimits) == null ? void 0 : _j.maxAggregateCutDb) ?? 0,
        aggregateMaxCutAfterHz: ((_k = chosen.bankLimits) == null ? void 0 : _k.maxAggregateCutHz) ?? null
      });
      operations++;
    }
    if (operations >= maxOperations && stopReason === "no safe improvement remained") stopReason = "operation ceiling reached";
    const baselineCheckpoint = checkpoints[0];
    const finiteCheckpoints = checkpoints.filter((checkpoint) => Number.isFinite(checkpoint.maximumAbsoluteDeviationDb) && Number.isFinite(checkpoint.rmsDeviationDb));
    const selectedCheckpoint = [...finiteCheckpoints.length ? finiteCheckpoints : [baselineCheckpoint]].sort((a, b) => a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb || a.rmsDeviationDb - b.rmsDeviationDb || a.filters.length - b.filters.length)[0];
    const selectionReason = collectDiagnostics ? `Fixed house-curve checkpoint selected: lowest maximum absolute deviation (${selectedCheckpoint.maximumAbsoluteDeviationDb.toFixed(2)} dB), then RMS (${selectedCheckpoint.rmsDeviationDb.toFixed(2)} dB), then fewest filters (${selectedCheckpoint.filters.length}).` : null;
    const checkpointSummaries = collectDiagnostics ? checkpoints.map((checkpoint, index) => {
      const selected = checkpoint === selectedCheckpoint;
      const finite2 = Number.isFinite(checkpoint.maximumAbsoluteDeviationDb) && Number.isFinite(checkpoint.rmsDeviationDb);
      return {
        index,
        enabledFilterCount: checkpoint.filters.length,
        maximumAbsoluteDeviationDb: checkpoint.maximumAbsoluteDeviationDb,
        rmsDeviationDb: checkpoint.rmsDeviationDb,
        worstResidualFrequencyHz: checkpoint.worstResidualFrequencyHz,
        broadBelowTargetWorsening: checkpoint.broadBelowTargetWorsening,
        selected,
        selectionEligibility: selected ? "selected" : finite2 ? "fixed-target-eligible" : "non-finite-metrics",
        reasonExcluded: selected ? null : finite2 ? "Higher fixed-target maximum deviation, RMS, or filter count than the selected checkpoint." : "Non-finite maximum-deviation or RMS excluded this checkpoint."
      };
    }) : [];
    const MAX_RESIDUAL_SEED_TOLERANCE_DB = 0.1;
    const MIN_RMS_SEED_IMPROVEMENT_DB = 0.2;
    const baselineRmsDeviationDb = baselineCheckpoint.rmsDeviationDb;
    const baselineMaxDeviationDb = baselineCheckpoint.maximumAbsoluteDeviationDb;
    const seedEligibleCheckpoints = finiteCheckpoints.filter((checkpoint) => {
      if (checkpoint.filters.length === 0) return false;
      if (checkpoint.broadBelowTargetWorsening) return false;
      if (!Number.isFinite(baselineRmsDeviationDb) || !Number.isFinite(baselineMaxDeviationDb)) return false;
      const rmsImprovementDb = baselineRmsDeviationDb - checkpoint.rmsDeviationDb;
      const maxResidualWorseningDb = checkpoint.maximumAbsoluteDeviationDb - baselineMaxDeviationDb;
      return rmsImprovementDb >= MIN_RMS_SEED_IMPROVEMENT_DB && maxResidualWorseningDb <= MAX_RESIDUAL_SEED_TOLERANCE_DB;
    }).sort((a, b) => a.rmsDeviationDb - b.rmsDeviationDb || a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb || a.filters.length - b.filters.length);
    let seedCheckpoint = null;
    for (const checkpoint of seedEligibleCheckpoints) {
      const limits = evaluateProvisionalBankLimits(
        checkpoint.filters,
        raw,
        activeSubs,
        usableLfHz,
        options.requestedSystemOutputDb,
        profile,
        bankEvaluationContext
      );
      if (limits.allOk) {
        seedCheckpoint = checkpoint;
        break;
      }
    }
    const standardSeedFilters = seedCheckpoint ? seedCheckpoint.filters.map((filter) => ({ ...filter })) : [];
    const seedSelectionReason = !collectDiagnostics ? null : seedCheckpoint ? `Seed checkpoint selected: RMS improved by ${(baselineRmsDeviationDb - seedCheckpoint.rmsDeviationDb).toFixed(3)} dB vs baseline, max residual worsened by ${(seedCheckpoint.maximumAbsoluteDeviationDb - baselineMaxDeviationDb).toFixed(3)} dB (within ${MAX_RESIDUAL_SEED_TOLERANCE_DB} dB tolerance).` : "No seed checkpoint qualified: no checkpoint with enabled filters met the RMS improvement and max residual tolerance criteria.";
    const selectedFilters = selectedCheckpoint.filters;
    const filterBank = emptyFilters(selectedFilters);
    const combinedEqCurve = raw.map((point) => ({
      frequency: point.frequency,
      spl: selectedFilters.reduce((sum, filter) => sum + peakingEqResponseDb(point.frequency, filter), 0)
    }));
    curve = raw.map((point, index) => ({
      frequency: point.frequency,
      spl: point.spl + combinedEqCurve[index].spl
    }));
    const requestedP19ToleranceDb = Number.isFinite(Number(options.targetToleranceDb)) ? Number(options.targetToleranceDb) : 0;
    const selectedTrend = selectedCheckpoint.trend;
    const sortedResidualPoints = (Array.isArray(selectedTrend) ? selectedTrend : []).filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz).map((point) => {
      const targetDb = anchorDb + artcousticHouseCurveOffsetAt(point.frequency);
      const signedResidualDb = point.spl - targetDb;
      return {
        frequency: point.frequency,
        targetDb,
        postEqSmoothedSpl: point.spl,
        signedResidualDb,
        absoluteResidualDb: Math.abs(signedResidualDb)
      };
    }).sort((a, b) => b.absoluteResidualDb - a.absoluteResidualDb);
    const distinctResidualPoints = [];
    for (const point of sortedResidualPoints) {
      const isDistinct = distinctResidualPoints.every(
        (retained) => Math.log2(Math.max(point.frequency, retained.frequency) / Math.min(point.frequency, retained.frequency)) > 1 / 12
      );
      if (isDistinct) distinctResidualPoints.push(point);
      if (distinctResidualPoints.length >= 8) break;
    }
    const worstResidualDiagnostics = collectDiagnostics ? distinctResidualPoints.map((point) => {
      const aggregateEqDb = aggregateResponseDbAt(point.frequency, selectedFilters);
      const boostAllowance = getSourceDomainBoostAllowance({
        frequency: point.frequency,
        requestedBoostDb: 6,
        activeSubs,
        usableLfHz,
        maxBoostDb: 6,
        requestedSystemOutputDb: options.requestedSystemOutputDb
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
        usableLfRampFraction: lfRampFraction
      };
    }) : [];
    const finalBankLimits = evaluateProvisionalBankLimits(selectedFilters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb, profile, bankEvaluationContext);
    const sameRegionFilterCount = maxSameRegionFilterCount(selectedFilters);
    const diagnosticTargetCurve = canonicalTargetCurve.length ? canonicalTargetCurve : raw.map((point) => ({ frequency: point.frequency, spl: anchorDb + artcousticHouseCurveOffsetAt(point.frequency) }));
    const filterDecisionDiagnostics = buildFilterDecisionDiagnostics(
      selectedFilters,
      raw,
      curve,
      diagnosticTargetCurve,
      protectedNullRegions
    );
    const physicalAuthorityViolations = findAggregatePeakBoostViolations(raw, curve, diagnosticTargetCurve);
    return {
      curve,
      filters: filterBank,
      combinedEqCurve,
      fitterHouseCurveTarget: canonicalTargetCurve.length ? canonicalTargetCurve.map((point) => ({ ...point })) : sortedResidualPoints.map(({ frequency, targetDb }) => ({ frequency, spl: targetDb })).sort((a, b) => a.frequency - b.frequency),
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
        valleyDiscoveryThresholdDb: profile.valleyDiscoveryThresholdDb
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
        broadBelowTargetWorsening: selectedCheckpoint.broadBelowTargetWorsening
      },
      standardSeedFilters,
      bestSeedFilters: standardSeedFilters,
      seedCheckpoint: seedCheckpoint ? {
        enabledFilterCount: seedCheckpoint.filters.length,
        maximumAbsoluteDeviationDb: seedCheckpoint.maximumAbsoluteDeviationDb,
        rmsDeviationDb: seedCheckpoint.rmsDeviationDb,
        worstResidualFrequencyHz: seedCheckpoint.worstResidualFrequencyHz,
        broadBelowTargetWorsening: seedCheckpoint.broadBelowTargetWorsening
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
      operatingOutputInvariantOk,
      p14TargetAuthority: {
        measuredAnchorDb,
        currentIntegratedBassDb,
        p14TargetDb,
        requiredP14OffsetDb,
        finalDesignTargetAnchorDb
      },
      lfCapabilityProtection: null,
      bankDiagnostics: {
        evaluatedVariantsScaledByBankLimit: bankLimitScaledCount,
        evaluatedVariantsRejectedByBankLimit: bankLimitRejectedCount,
        evaluatedVariantsRejectedAsNearDuplicates: nearDuplicateRejectedCount,
        evaluatedVariantsRejectedBySameRegionGuard: sameRegionRejectedCount,
        completedBankEvaluationCount: getDesignEqBankEvaluationCount(),
        exactMemoisation: getDesignEqBankEvaluationContextStats(bankEvaluationContext),
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
          sameRegionFilterCount
        }
      },
      revisionDiagnostics: {
        revisionAttemptCount,
        revisionPassedAcceptanceCount,
        selectedRevisionOperationCount,
        attempts: revisionAttempts
      },
      diagnostics: collectDiagnostics ? curve.map((point, index) => ({
        frequency: point.frequency,
        targetDb: anchorDb + artcousticHouseCurveOffsetAt(point.frequency),
        trendDb: interpolate$1(thirdOctave, point.frequency),
        appliedCorrectionDb: combinedEqCurve[index].spl
      })) : [],
      __designEqTrace__: {
        inputCollectDiagnostics: collectDiagnostics,
        detectedRegionCount: detectedRegions.length,
        appendTrialCount: candidateAcceptanceDiagnostics.filter((d) => d.action === "append").length,
        revisionTrialCount: candidateAcceptanceDiagnostics.filter((d) => d.action === "revise").length,
        candidateAcceptanceDiagnosticsCount: candidateAcceptanceDiagnostics.length,
        stopReason
      }
    };
  }
  const RAW = [
    {
      id: 1,
      number: 1,
      name: "Minimum distance between the listening area and the room walls (dsw, dbw)",
      description: "Avoids SPL imbalance and wall boundary interference. Measured from the listener’s head centre to the nearest wall or protruding baffle.",
      unit: "m",
      thresholds: { L1: 0.5, L2: 0.8, L3: 1.2, L4: 1.5 },
      metric: "Min.",
      scope: "Seat"
    },
    {
      id: 2,
      number: 2,
      name: "Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers",
      description: "Includes all listener-level and upper discrete processor outputs; multiple combinations possible depending on design.",
      unit: "Number discrete speakers",
      thresholds: { L1: 5, L2: 11, L3: 15, L4: 15 },
      metric: "Min.",
      scope: "Room"
    },
    {
      id: 3,
      number: 3,
      name: "Number of screen wall speakers allowed outside of recommended zonal locations",
      description: "Speaker locations are zones, not strict angles. Zones allow flexibility within recommended areas.",
      unit: "Number speakers",
      thresholds: { L1: 0, L2: 0, L3: 0, L4: 0 },
      metric: "-",
      scope: "Room"
    },
    {
      id: 4,
      number: 4,
      name: "Maximum SPL difference between screen wall speakers",
      description: "Normalised to RSP (0dB ref). Max predicted SPL diff using anechoic propagation loss.",
      unit: "dB",
      thresholds: { L1: 6, L2: 5, L3: 4, L4: 2 },
      metric: "Max.",
      scope: "Seat"
    },
    {
      id: 5,
      number: 5,
      name: "Maximum allowable horizontal angle between adjacent surround speakers",
      description: "Ensures smooth sound movement and accurate localisation.",
      unit: "Degrees (°)",
      thresholds: { L1: null, L2: 80, L3: 60, L4: 50 },
      metric: "Max.",
      scope: "Seat"
    },
    {
      id: 6,
      number: 6,
      name: "Maximum SPL difference between surround speakers",
      description: "Normalised to RSP (0dB ref).",
      unit: "dB",
      thresholds: { L1: 10, L2: 6, L3: 4, L4: 2 },
      metric: "Max.",
      scope: "Seat"
    },
    {
      id: 7,
      number: 7,
      name: "Wide speakers (if implemented) — maximum allowable horizontal deviation from median angle",
      description: "Ensures localisation accuracy.",
      unit: "Degrees (°)",
      thresholds: { L1: 10, L2: 7, L3: 5, L4: 2 },
      metric: "±",
      scope: "Room"
    },
    {
      id: 8,
      number: 8,
      name: "Upfiring/elevation speakers allowed?",
      description: "Solution for when overhead speakers cannot be installed.",
      unit: "Yes/No",
      thresholds: { L1: "Yes", L2: "Yes", L3: "No", L4: "No" },
      metric: "-",
      scope: "-"
    },
    {
      id: 9,
      number: 9,
      name: "Maximum allowable vertical angle between adjacent (L/R rows of) upper speakers",
      description: "Ensures smooth sound movement and accurate localisation. Excludes 'Voice of God' and height centre.",
      unit: "Degrees (°)",
      thresholds: { L1: 80.1, L2: 80, L3: 60, L4: 50 },
      metric: "Max.",
      scope: "Seat"
    },
    {
      id: 10,
      number: 10,
      name: "Maximum SPL difference between upper speakers",
      description: "Normalised to RSP.",
      unit: "dB",
      thresholds: { L1: 12, L2: 8, L3: 5, L4: 2 },
      metric: "Max.",
      scope: "Seat"
    },
    {
      id: 11,
      number: 11,
      name: "Number of surround/wide/upper speakers allowed outside of zonal recommendation locations",
      description: "Zones allow flexibility but must remain within recommended placement areas.",
      unit: "Number speakers",
      thresholds: { L1: null, L2: 0, L3: 0, L4: 0 },
      metric: "-",
      scope: "Room"
    },
    {
      id: 12,
      number: 12,
      name: "Screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping",
      description: "Min SPL per AES75-2022 or ANSI-CTA-2034-A; includes headroom for bass contours and +EQ.",
      unit: "dB SPL (C)",
      thresholds: { L1: 102, L2: 105, L3: 108, L4: 111 },
      metric: "Min.",
      scope: "Room"
    },
    {
      id: 13,
      number: 13,
      name: "Non-screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping",
      description: "Includes amplifier headroom; same SPL spec logic as parameter 12.",
      unit: "dB SPL (C)",
      thresholds: { L1: 99, L2: 102, L3: 105, L4: 108 },
      metric: "Min.",
      scope: "Room"
    },
    {
      id: 14,
      number: 14,
      name: "LFE frequencies total SPL capability at RSP, plus bass management if used (post calibration EQ, within bass extension spec for the level) without clipping (includes amplifier headroom)",
      description: "Post calibration EQ; includes amp headroom; can include boundary gain.",
      unit: "dB SPL (C)",
      thresholds: { L1: 114, L2: 117, L3: 120, L4: 123 },
      metric: "Min.",
      scope: "Room"
    },
    {
      id: 15,
      number: 15,
      name: "Background noise floor",
      description: "With all AV/mechanical systems running at nominal operating temps.",
      unit: "NCB rating",
      thresholds: { L1: 26, L2: 22, L3: 18, L4: 15 },
      metric: "Max.",
      scope: "-"
    },
    {
      id: 16,
      number: 16,
      name: "Seat-to-seat frequency response variance across all screen wall speakers",
      description: "Normalised to RSP between 500 Hz–16 kHz (1 octave smoothing).",
      unit: "± dB",
      thresholds: { L1: 5, L2: 3, L3: 1.5, L4: 1.5 },
      metric: "Max.",
      scope: "Seat"
    },
    {
      id: 17,
      number: 17,
      name: "Seat-to-seat frequency response variance across all wide/surround/upper speakers",
      description: "Normalised to RSP between 500 Hz–16 kHz (1 octave smoothing).",
      unit: "± dB",
      thresholds: { L1: null, L2: null, L3: 3, L4: 1.5 },
      metric: "Max.",
      scope: "Seat"
    },
    {
      id: 18,
      number: 18,
      name: "In-room bass extension -3 dB cut off frequency point",
      description: "In-room predicted -3 dB bass extension frequency with no perceptible distortion or audible mechanical resonances at the specified minimum SPL according to performance parameter 14… To include speaker coupling, boundary and room gain.",
      unit: "Hz",
      // Recommended row retained as the legacy flat thresholds shape.
      thresholds: { L1: 30, L2: 25, L3: 18, L4: 15 },
      thresholdsByBasis: {
        minimum: { L1: 35, L2: 30, L3: 20, L4: 18 },
        recommended: { L1: 30, L2: 25, L3: 18, L4: 15 }
      },
      metric: "Min.",
      scope: "Room"
    },
    {
      id: 19,
      number: 19,
      name: "Frequency response below room’s transition frequency at RSP (“The Result”)",
      description: "RSP after EQ vs house target below transition.",
      unit: "± dB",
      thresholds: { L1: 5, L2: 4, L3: 3, L4: 2 },
      metric: "Max.",
      scope: "RSP"
    },
    {
      id: 20,
      number: 20,
      name: "Seat-to-seat frequency response below transition frequency (“The Consistency”)",
      description: "Relative to RSP (1/3 oct smoothing).",
      unit: "± dB",
      thresholds: { L1: null, L2: 4, L3: 3, L4: 2 },
      metric: "Max.",
      scope: "Seat"
    },
    {
      id: 21,
      number: 21,
      name: "Level of early reflections relative to direct sound (0–15 ms, 1–8 kHz)",
      description: "Manages early reflections for balance of direct/reflected sound.",
      unit: "dB",
      thresholds: { L1: null, L2: -8, L3: -10, L4: -12 },
      metric: "Min.",
      scope: "Room"
    }
  ];
  function deepFreeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      const v = obj[prop];
      if (v !== null && (typeof v === "object" || typeof v === "function") && !Object.isFrozen(v)) {
        deepFreeze(v);
      }
    });
    return obj;
  }
  function validate(params) {
    if (!Array.isArray(params) || params.length !== 21) {
      throw new Error("RP22: parameter array must contain exactly 21 items.");
    }
    const ids = /* @__PURE__ */ new Set();
    const nums = /* @__PURE__ */ new Set();
    for (const p of params) {
      if (typeof p.id !== "number" || typeof p.number !== "number") {
        throw new Error("RP22: id/number must be numbers.");
      }
      if (ids.has(p.id) || nums.has(p.number)) {
        throw new Error("RP22: duplicate id or number detected.");
      }
      ids.add(p.id);
      nums.add(p.number);
      ["name", "description", "unit", "metric", "scope"].forEach((k) => {
        if (!p[k]) throw new Error(`RP22: missing field '${k}' on #${p.number}.`);
      });
      if (!p.thresholds || typeof p.thresholds !== "object") {
        throw new Error(`RP22: missing thresholds on #${p.number}.`);
      }
      const keys = Object.keys(p.thresholds);
      if (keys.length > 0 && keys.sort().join(",") !== "L1,L2,L3,L4") {
        throw new Error(`RP22: thresholds must be L1..L4 on #${p.number}.`);
      }
    }
  }
  validate(RAW);
  const rp22Parameters = deepFreeze(RAW);
  Object.freeze(
    rp22Parameters.reduce((m, p) => (m[p.id] = p, m), {})
  );
  Object.freeze(
    rp22Parameters.reduce((m, p) => (m[p.number] = p, m), {})
  );
  const P18_TARGET_BASIS_MINIMUM = "minimum";
  const P18_TARGET_BASIS_RECOMMENDED = "recommended";
  const P18_THRESHOLDS_BY_BASIS = Object.freeze({
    minimum: Object.freeze({ L1: 35, L2: 30, L3: 20, L4: 18 }),
    recommended: Object.freeze({ L1: 30, L2: 25, L3: 18, L4: 15 })
  });
  const P18_PERFORMANCE_BANDS = Object.freeze([
    Object.freeze({ band: 6, maximumHz: 15, multiplier: 12, label: "Recommended L4" }),
    Object.freeze({ band: 5, maximumHz: 18, multiplier: 10, label: "Minimum L4 / Recommended L3" }),
    Object.freeze({ band: 4, maximumHz: 20, multiplier: 8, label: "Minimum L3" }),
    Object.freeze({ band: 3, maximumHz: 25, multiplier: 6, label: "Recommended L2" }),
    Object.freeze({ band: 2, maximumHz: 30, multiplier: 4, label: "Minimum L2 / Recommended L1" }),
    Object.freeze({ band: 1, maximumHz: 35, multiplier: 2, label: "Minimum L1" })
  ]);
  function normalizeP18TargetBasis(value) {
    return value === P18_TARGET_BASIS_RECOMMENDED ? P18_TARGET_BASIS_RECOMMENDED : P18_TARGET_BASIS_MINIMUM;
  }
  function resolveP18DesignHz(rawHz) {
    const value = Number(rawHz);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  }
  function p18ThresholdsForBasis(basis) {
    return P18_THRESHOLDS_BY_BASIS[normalizeP18TargetBasis(basis)];
  }
  function p18ThresholdHzForLevel(basis, level) {
    const numericLevel2 = Math.max(1, Math.min(4, Math.round(Number(level) || 4)));
    return p18ThresholdsForBasis(basis)[`L${numericLevel2}`];
  }
  function gradeP18ForBasis(rawHz, basis = P18_TARGET_BASIS_MINIMUM) {
    const designHz = resolveP18DesignHz(rawHz);
    if (designHz == null) return 0;
    const thresholds = p18ThresholdsForBasis(basis);
    if (designHz <= thresholds.L4) return 4;
    if (designHz <= thresholds.L3) return 3;
    if (designHz <= thresholds.L2) return 2;
    if (designHz <= thresholds.L1) return 1;
    return 0;
  }
  function p18PerformanceBand(rawHz) {
    var _a;
    const designHz = resolveP18DesignHz(rawHz);
    if (designHz == null) return null;
    return ((_a = P18_PERFORMANCE_BANDS.find(({ maximumHz }) => designHz <= maximumHz)) == null ? void 0 : _a.band) ?? 0;
  }
  function p18PerformanceMultiplier(rawHz) {
    var _a;
    const designHz = resolveP18DesignHz(rawHz);
    if (designHz == null) return null;
    return ((_a = P18_PERFORMANCE_BANDS.find(({ maximumHz }) => designHz <= maximumHz)) == null ? void 0 : _a.multiplier) ?? -5;
  }
  function assessP18Extension(rawHz, basis = P18_TARGET_BASIS_MINIMUM) {
    const targetBasis = normalizeP18TargetBasis(basis);
    const designHz = resolveP18DesignHz(rawHz);
    if (designHz == null) {
      return {
        rawHz: null,
        designHz: null,
        targetBasis,
        level: null,
        levelLabel: null,
        performanceBand: null,
        performanceMultiplier: null,
        passed: null
      };
    }
    const level = gradeP18ForBasis(designHz, targetBasis);
    const performanceBand = p18PerformanceBand(designHz);
    const performanceMultiplier = p18PerformanceMultiplier(designHz);
    return {
      rawHz: Number(rawHz),
      designHz,
      targetBasis,
      level,
      levelLabel: level > 0 ? `L${level}` : "FAIL",
      performanceBand,
      performanceMultiplier,
      passed: level > 0
    };
  }
  const BASS_RANK_LEVEL = Object.freeze(["FAIL", "L1", "L2", "L3", "L4"]);
  function floorBassDeviation(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.floor(numeric) : null;
  }
  function gradeP19(value) {
    const wholeDb = floorBassDeviation(value);
    if (wholeDb == null) return null;
    if (wholeDb <= 2) return 4;
    if (wholeDb <= 3) return 3;
    if (wholeDb <= 4) return 2;
    if (wholeDb <= 5) return 1;
    return 0;
  }
  function gradeP20(value) {
    const wholeDb = floorBassDeviation(value);
    if (wholeDb == null) return null;
    if (wholeDb <= 2) return 4;
    if (wholeDb <= 3) return 3;
    if (wholeDb <= 4) return 2;
    return 1;
  }
  function bassLevelFromRank(rank) {
    const numeric = Number(rank);
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 4 ? BASS_RANK_LEVEL[numeric] : null;
  }
  function levelP19_lfResponse(dB) {
    const rank = gradeP19(dB);
    const level = bassLevelFromRank(rank);
    return level == null ? { level: "N/A", ok: false } : { level, ok: rank > 0 };
  }
  function levelP20_lfConsistency(dB) {
    const rank = gradeP20(dB);
    const level = bassLevelFromRank(rank);
    return level == null ? { level: "N/A", ok: false } : { level, ok: true };
  }
  function numericRp22Level(result) {
    const label = String((result == null ? void 0 : result.level) || "").toUpperCase();
    if (label === "FAIL") return 0;
    const match = label.match(/^L([1-4])$/);
    return match ? Number(match[1]) : null;
  }
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const P18_RESIDUAL_HEADROOM_DB = 3;
  function toSplCurve(responseData) {
    if (!Array.isArray(responseData)) return [];
    return responseData.filter((p) => p && isNum(p.frequency) && isNum(p.spl)).map((p) => ({ frequency: Number(p.frequency), spl: Number(p.spl) })).sort((a, b) => a.frequency - b.frequency);
  }
  function smoothThird(curve) {
    if (!Array.isArray(curve) || curve.length === 0) return [];
    const smoothed = applyBassSmoothing(curve, "third");
    return smoothed.filter((p) => isNum(p.frequency) && isNum(p.spl)).map((p) => ({ frequency: Number(p.frequency), spl: Number(p.spl) }));
  }
  function adjustForHouseCurve(curve) {
    return curve.map((p) => ({
      frequency: p.frequency,
      spl: p.spl - artcousticHouseCurveOffsetAt(p.frequency)
    }));
  }
  function findTargetRelativeF3Adjusted(curve, flatCutoffDb, validMinHz) {
    const empty = { f3Hz: null, bounded: false, upperBoundHz: null };
    if (!Array.isArray(curve) || curve.length === 0) return empty;
    const curveMinHz = curve[0].frequency;
    const floorHz = isNum(validMinHz) && validMinHz > 0 ? Math.max(validMinHz, curveMinHz) : curveMinHz;
    const points = curve.filter((p) => p.frequency >= floorHz && p.frequency <= 200 && isNum(p.spl));
    if (!points.length) {
      return { f3Hz: null, bounded: true, upperBoundHz: floorHz };
    }
    if (points[0].spl >= flatCutoffDb) {
      return { f3Hz: null, bounded: true, upperBoundHz: floorHz };
    }
    let f3Hz = null;
    for (let index = 0; index < points.length; index++) {
      if (points[index].spl < flatCutoffDb) continue;
      const windowEndHz = points[index].frequency * Math.pow(2, 1 / 3);
      let sustained = true;
      for (let j = index; j < points.length; j++) {
        if (points[j].frequency > windowEndHz) break;
        if (points[j].spl < flatCutoffDb) {
          sustained = false;
          break;
        }
      }
      if (!sustained) continue;
      const previous = points[index - 1];
      if (!previous || previous.spl >= flatCutoffDb) {
        f3Hz = points[index].frequency;
        break;
      }
      const ratio = (flatCutoffDb - previous.spl) / (points[index].spl - previous.spl);
      f3Hz = previous.frequency + (points[index].frequency - previous.frequency) * ratio;
      break;
    }
    if (f3Hz == null) {
      return { f3Hz: null, bounded: false, upperBoundHz: null };
    }
    return { f3Hz, bounded: false, upperBoundHz: null };
  }
  function computeResponseTargetF3(responseCurve, p14TargetDb, validMinHz = null) {
    const smoothed = smoothThird(toSplCurve(responseCurve));
    const adjusted = adjustForHouseCurve(smoothed);
    const flatCutoffDb = Number(p14TargetDb) - 3;
    return findTargetRelativeF3Adjusted(adjusted, flatCutoffDb, validMinHz);
  }
  function buildProductCapabilityCurve(activeSubs) {
    const products = (activeSubs || []).map((sub) => {
      var _a;
      const modelKey = (sub == null ? void 0 : sub.modelKey) ?? (sub == null ? void 0 : sub.model);
      const curve = getSubwooferCurve(modelKey);
      const meta = getSpeakerModelMeta(modelKey);
      if (!Array.isArray(curve) || curve.length < 2) return null;
      const frequencies2 = curve.map((p) => Number(p.hz)).filter(Number.isFinite).sort((a, b) => a - b);
      const usableLfHz = Number((_a = meta == null ? void 0 : meta.bassCapability) == null ? void 0 : _a.usableLF_neg6dB);
      return {
        // Diagnostic only — never the P18 floor.
        usableLfHz: isNum(usableLfHz) ? usableLfHz : null,
        dataFloorHz: frequencies2.length ? frequencies2[0] : null,
        curve: curve.map((p) => ({ frequency: Number(p.hz), spl: Number(p.db) }))
      };
    }).filter(Boolean);
    if (!products.length) return null;
    const productLfLimits = products.map((p) => p.dataFloorHz).filter(isNum);
    const physicalLfHz = productLfLimits.length ? Math.max(...productLfLimits) : 0;
    const frequencies = [.../* @__PURE__ */ new Set([
      physicalLfHz,
      ...products.flatMap((p) => p.curve.map((point) => point.frequency))
    ])].filter((f) => f >= physicalLfHz).sort((a, b) => a - b);
    const capabilityCurve = frequencies.map((f) => {
      const values = products.map((p) => {
        const exact = p.curve.find((c) => c.frequency === f);
        if (exact) return exact.spl;
        const lower = p.curve.filter((c) => c.frequency <= f).at(-1);
        const upper = p.curve.find((c) => c.frequency >= f);
        if (!lower || !upper || lower.frequency === upper.frequency) return (lower == null ? void 0 : lower.spl) ?? null;
        const ratio = (f - lower.frequency) / (upper.frequency - lower.frequency);
        return lower.spl + (upper.spl - lower.spl) * ratio;
      });
      if (values.some((v) => !isNum(v))) return null;
      const spl = 10 * Math.log10(values.reduce((sum, v) => sum + Math.pow(10, v / 10), 0));
      return { frequency: f, spl };
    }).filter(Boolean);
    return { curve: capabilityCurve, physicalLfHz };
  }
  function computeCapabilityTargetF3(activeSubs, p14TargetDb, validMinHz = null) {
    const product = buildProductCapabilityCurve(activeSubs);
    if (!product || !product.curve.length) {
      return { f3Hz: null, bounded: false, upperBoundHz: null };
    }
    const adjusted = adjustForHouseCurve(product.curve);
    const flatCutoffDb = Number(p14TargetDb) + P18_RESIDUAL_HEADROOM_DB;
    return findTargetRelativeF3Adjusted(adjusted, flatCutoffDb, validMinHz);
  }
  function canonicalizeSeatIdentity(value) {
    const rawIdentity = (value == null ? void 0 : value.seatId) ?? (value == null ? void 0 : value.id) ?? value;
    return rawIdentity == null ? "" : String(rawIdentity).trim().toLowerCase();
  }
  function isReferenceSeatIdentity(seat) {
    if ((seat == null ? void 0 : seat.__isSyntheticRsp) === true) return true;
    return ["rsp", "mlp"].includes(canonicalizeSeatIdentity(seat));
  }
  const finite$6 = (value) => value !== null && value !== "" && Number.isFinite(Number(value));
  function normalizedSmoothedAssessedCurve(curve, startHz, endHz) {
    return applyBassSmoothing(
      (Array.isArray(curve) ? curve : []).filter((point) => finite$6(point == null ? void 0 : point.frequency) && finite$6(point == null ? void 0 : point.spl)).map((point) => ({ frequency: Number(point.frequency), spl: Number(point.spl) })).sort((a, b) => a.frequency - b.frequency),
      "third"
    ).filter((point) => point.frequency >= startHz && point.frequency <= endHz && finite$6(point.spl));
  }
  function resolveAbsoluteTargetDb(canonicalTargetCurve, frequency) {
    if (Array.isArray(canonicalTargetCurve) && canonicalTargetCurve.length) {
      const interpolated = interpolateCanonicalTarget(canonicalTargetCurve, frequency);
      if (Number.isFinite(interpolated)) return interpolated;
    }
    const shapeOffset = artcousticHouseCurveOffsetAt(frequency);
    return Number.isFinite(shapeOffset) ? shapeOffset : null;
  }
  function scanMaxAbsoluteDeviation(smoothedAssessedCurve, canonicalTargetCurve, protectedNullRegions) {
    let maxAbsDeviationDb = -Infinity;
    let worstFrequencyHz = null;
    const residualCurve = [];
    const hasProtectedNulls = Array.isArray(protectedNullRegions) && protectedNullRegions.length > 0;
    for (const point of smoothedAssessedCurve) {
      const targetDb = resolveAbsoluteTargetDb(canonicalTargetCurve, point.frequency);
      if (!Number.isFinite(targetDb)) continue;
      const residualDb = point.spl - targetDb;
      if (!Number.isFinite(residualDb)) continue;
      const isProtected = hasProtectedNulls && isProtectedSmoothedFrequency(point.frequency, protectedNullRegions);
      residualCurve.push({ frequency: point.frequency, spl: point.spl, targetDb, residualDb, protected: isProtected });
      const absDeviationDb = Math.abs(residualDb);
      if (absDeviationDb > maxAbsDeviationDb) {
        maxAbsDeviationDb = absDeviationDb;
        worstFrequencyHz = point.frequency;
      }
    }
    if (!Number.isFinite(maxAbsDeviationDb)) return null;
    return { maxAbsDeviationDb, worstFrequencyHz, residualCurve };
  }
  function evaluateP19AbsoluteTargetDeviation({
    rspPostEqCurve,
    canonicalTargetCurve,
    assessmentStartHz,
    assessmentEndHz,
    protectedNullRegions = []
  }) {
    const smoothedAssessedCurve = normalizedSmoothedAssessedCurve(rspPostEqCurve, assessmentStartHz, assessmentEndHz);
    if (!smoothedAssessedCurve.length) return null;
    const scan = scanMaxAbsoluteDeviation(smoothedAssessedCurve, canonicalTargetCurve, protectedNullRegions);
    if (!scan) return null;
    const { maxAbsDeviationDb, worstFrequencyHz, residualCurve } = scan;
    const level = numericRp22Level(levelP19_lfResponse(maxAbsDeviationDb));
    return {
      variationDbRaw: maxAbsDeviationDb,
      totalRspToTargetDifferenceDbRaw: maxAbsDeviationDb,
      displayVariationDb: maxAbsDeviationDb,
      level,
      worstFrequencyHz,
      maxAbsDeviationDb,
      residualCurve,
      sourceCurve: smoothedAssessedCurve
    };
  }
  function scanMaxAbsoluteDeviationFromResidualPoints(residualPoints2, protectedNullRegions = []) {
    if (!Array.isArray(residualPoints2) || !residualPoints2.length) return null;
    let maxAbsDeviationDb = -Infinity;
    let worstFrequencyHz = null;
    for (const point of residualPoints2) {
      if (!finite$6(point == null ? void 0 : point.frequency) || !finite$6(point == null ? void 0 : point.deviationDb)) continue;
      const absDeviationDb = Math.abs(Number(point.deviationDb));
      if (absDeviationDb > maxAbsDeviationDb) {
        maxAbsDeviationDb = absDeviationDb;
        worstFrequencyHz = point.frequency;
      }
    }
    if (!Number.isFinite(maxAbsDeviationDb)) return null;
    return { maxAbsDeviationDb, worstFrequencyHz };
  }
  const finite$5 = (value) => value !== null && value !== "" && Number.isFinite(Number(value));
  function normalizedCurve(curve) {
    return (Array.isArray(curve) ? curve : []).filter((point) => finite$5(point == null ? void 0 : point.frequency) && finite$5(point == null ? void 0 : point.spl)).map((point) => ({ frequency: Number(point.frequency), spl: Number(point.spl) })).sort((left, right) => left.frequency - right.frequency);
  }
  function smoothedAssessmentCurve(curve, startHz, endHz) {
    return applyBassSmoothing(normalizedCurve(curve), "third").filter((point) => point.frequency >= startHz && point.frequency <= endHz && finite$5(point.spl));
  }
  function curveValueAt(curve, frequency) {
    if (!curve.length) return null;
    if (frequency < curve[0].frequency || frequency > curve[curve.length - 1].frequency) return null;
    if (frequency === curve[0].frequency) return curve[0].spl;
    if (frequency === curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
    for (let index = 0; index < curve.length - 1; index += 1) {
      const low = curve[index];
      const high = curve[index + 1];
      if (frequency < low.frequency || frequency > high.frequency) continue;
      const span = high.frequency - low.frequency;
      if (span === 0) return low.spl;
      const ratio = (frequency - low.frequency) / span;
      return low.spl + (high.spl - low.spl) * ratio;
    }
    return null;
  }
  function computeCorrectableP19Diagnostic({ rspPostEqCurve, canonicalTargetCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions = [] }) {
    const result = evaluateP19AbsoluteTargetDeviation({
      rspPostEqCurve,
      canonicalTargetCurve,
      assessmentStartHz,
      assessmentEndHz,
      protectedNullRegions
    });
    if (!result) return null;
    return { ...result, sourceCurve: result.sourceCurve, label: "Correctable P19 — optimiser diagnostic" };
  }
  function p20LevelFromDisplayVariation(displayVariationDb) {
    if (!finite$5(displayVariationDb)) return null;
    return numericRp22Level(levelP20_lfConsistency(Number(displayVariationDb)));
  }
  function computeOfficialP20Assessment({ rspPostEqCurve, perSeatPostEqCurves, assessmentStartHz, assessmentEndHz }) {
    const rspCurve = smoothedAssessmentCurve(rspPostEqCurve, assessmentStartHz, assessmentEndHz);
    if (!rspCurve.length) return { available: false, perSeatResults: [], worstSeat: null, label: "P20 worst seat" };
    const perSeatResults = (Array.isArray(perSeatPostEqCurves) ? perSeatPostEqCurves : []).filter((seat) => (seat == null ? void 0 : seat.seatId) && !isReferenceSeatIdentity(seat)).map((seat) => {
      const seatCurve = smoothedAssessmentCurve(seat.responseData, assessmentStartHz, assessmentEndHz);
      let variationDbRaw = null;
      let worstFrequencyHz = null;
      let comparisonPointCount = 0;
      rspCurve.forEach((rspPoint) => {
        const seatSpl = curveValueAt(seatCurve, rspPoint.frequency);
        if (!finite$5(rspPoint.spl) || !finite$5(seatSpl)) return;
        comparisonPointCount += 1;
        const variation = Math.abs(seatSpl - rspPoint.spl);
        if (variationDbRaw == null || variation > variationDbRaw) {
          variationDbRaw = variation;
          worstFrequencyHz = rspPoint.frequency;
        }
      });
      if (comparisonPointCount === 0 || variationDbRaw == null) return null;
      const displayVariationDb = Number(variationDbRaw);
      return {
        seatId: seat.seatId,
        variationDbRaw,
        totalSeatToRspDifferenceDbRaw: Number(variationDbRaw),
        displayVariationDb,
        level: p20LevelFromDisplayVariation(displayVariationDb),
        worstFrequencyHz,
        comparisonPointCount
      };
    }).filter(Boolean);
    const worstSeat = perSeatResults.reduce((worst, seat) => !worst || seat.variationDbRaw > worst.variationDbRaw ? seat : worst, null);
    return { available: perSeatResults.length > 0, perSeatResults, worstSeat, label: "P20 worst seat" };
  }
  const BASS_PRIORITY_MODES = Object.freeze({
    BALANCED: "balanced",
    HOUSE_CURVE_ACCURACY: "house_curve_accuracy",
    DEPTH: "depth",
    SPL: "spl"
  });
  Object.freeze(Object.values(BASS_PRIORITY_MODES));
  function isPhysicallyCredibleBassCandidate(candidate) {
    var _a;
    if (!candidate) return false;
    if (!Array.isArray(candidate.finalPostEqCurve) || candidate.finalPostEqCurve.length === 0) return false;
    if (!Array.isArray(candidate.generatedFilterBank)) return false;
    if (candidate.physicalEqAuthorityPassed === false) return false;
    return ((_a = candidate.bankValidationResult) == null ? void 0 : _a.allOk) !== false;
  }
  function generateHouseCurveTrials(region, filters, profile, activeSubs, usableLfHz, requestedSystemOutputDb) {
    const trials = [];
    const requiredAtCentreDb = resolveRequiredCorrectionDb({
      targetSplDb: 0,
      currentPostEqSplDb: region.centrePoint.deviationDb,
      protectedNull: !!region.protectedNull
    });
    const residualDb = Number(region.centrePoint.deviationDb);
    const hasAbsoluteSpl = Number.isFinite(Number(region.centrePoint.spl)) && Number.isFinite(Number(region.centrePoint.targetSpl));
    const currentSpl = hasAbsoluteSpl ? Number(region.centrePoint.spl) : residualDb;
    const targetSpl = hasAbsoluteSpl ? Number(region.centrePoint.targetSpl) : 0;
    const rawSpl = Number.isFinite(Number(region.rawSpl)) ? Number(region.rawSpl) : currentSpl;
    const authority = classifyEqCorrectionRegion({
      frequency: region.centrePoint.frequency,
      rawSpl,
      currentSpl,
      targetSpl,
      protectedNull: !!region.protectedNull,
      widthOctaves: region.widthOctaves
    });
    if (authority.classification === "Null") {
      return { trials, productLimited: false, authority };
    }
    const isPeak = authority.classification === "Peak";
    const isBroadValley = !isPeak && Number.isFinite(region.widthOctaves) && region.widthOctaves >= 1 / 3;
    const broadValleyMaxQ = 4;
    const maximumCutDb = profile.maximumCutDb;
    const maximumAggregateBoostDb = profile.maximumAggregateBoostDb;
    const requestedGainDb = isPeak ? -Math.min(maximumCutDb, Math.abs(authority.rawResidualDb ?? requiredAtCentreDb)) : Math.min(maximumAggregateBoostDb, Math.max(0, requiredAtCentreDb) * 0.75);
    const correctionSign = Math.sign(requestedGainDb);
    const baseCandidate = limitBoostForCapability({
      band: filters.length + 1,
      enabled: true,
      type: "Peak",
      frequencyHz: region.centrePoint.frequency,
      gainDb: requestedGainDb,
      Q: isBroadValley ? Math.min(broadValleyMaxQ, qForRegion(region)) : qForRegion(region),
      startHz: region.startHz,
      endHz: region.endHz,
      widthOctaves: region.widthOctaves,
      classification: authority.classification,
      expectedAction: authority.expectedAction,
      beforeEqSpl: region.rawSpl,
      targetSpl: region.centrePoint.targetSpl,
      reason: authority.reason
    }, activeSubs, usableLfHz, requestedSystemOutputDb);
    const physicalAction = validatePhysicalEqAction(authority.classification, baseCandidate.gainDb);
    const productLimited = Math.abs(baseCandidate.gainDb) <= 0.1 || !physicalAction.passed;
    const gainScales = [1, 0.75, 0.5];
    const rawQValues = isBroadValley ? [baseCandidate.Q * 0.65, baseCandidate.Q, Math.min(broadValleyMaxQ, baseCandidate.Q * 1.25)] : [baseCandidate.Q * 0.65, baseCandidate.Q, 4, 5, 6, 7, 8, 10];
    const qValues = [...new Map(rawQValues.map((q) => {
      const value = Math.max(0.5, Math.min(10, q));
      return [value.toFixed(4), value];
    })).values()];
    const overlappingSameSignCount = filters.filter((filter) => (filter == null ? void 0 : filter.enabled) && Math.sign(filter.gainDb) === correctionSign && Math.log2(Math.max(baseCandidate.frequencyHz, filter.frequencyHz) / Math.min(baseCandidate.frequencyHz, filter.frequencyHz)) <= 1 / 2).length;
    if (!productLimited && filters.length < 10 && overlappingSameSignCount < 2) {
      const seenVariants = /* @__PURE__ */ new Set();
      for (const gainScale of gainScales) {
        for (const q of qValues) {
          const scaled = { ...baseCandidate, gainDb: baseCandidate.gainDb * gainScale, Q: q };
          const candidate = scaled.gainDb > 0 ? limitBoostForCapability(scaled, activeSubs, usableLfHz, requestedSystemOutputDb) : scaled;
          const key = `${candidate.gainDb.toFixed(4)}:${candidate.Q.toFixed(4)}`;
          if (seenVariants.has(key) || Math.abs(candidate.gainDb) <= 0.1) continue;
          seenVariants.add(key);
          if (isNearDuplicate(candidate, filters) || countSameSignFiltersInRegion(candidate, filters) >= 2) continue;
          trials.push({ action: "append", filter: candidate, scalableIndex: filters.length });
        }
      }
    }
    for (let index = 0; index < filters.length; index++) {
      const existing = filters[index];
      if (!existing.enabled) continue;
      const separation = Math.log2(Math.max(baseCandidate.frequencyHz, existing.frequencyHz) / Math.min(baseCandidate.frequencyHz, existing.frequencyHz));
      if (separation > 1 / 6) continue;
      const existingSign = existing.gainDb > 0 ? 1 : -1;
      if (existingSign === correctionSign && !productLimited) {
        for (const gainScale of gainScales) {
          for (const qScale of [0.75, 1, 1.5]) {
            const refit = {
              ...baseCandidate,
              band: existing.band,
              gainDb: baseCandidate.gainDb * gainScale,
              Q: Math.max(0.5, Math.min(isBroadValley ? broadValleyMaxQ : 10, baseCandidate.Q * qScale)),
              reason: isBroadValley ? "Joint broad-valley centre/gain/Q refit" : "Joint centre/gain/Q refit of occupied region"
            };
            trials.push({ action: "refit", filter: refit, replacedFilterIndex: index, scalableIndex: index });
          }
          const proposedGain = existing.gainDb + baseCandidate.gainDb * gainScale;
          const gainDb = existing.gainDb > 0 ? Math.min(maximumAggregateBoostDb, proposedGain) : Math.max(-maximumCutDb, proposedGain);
          if (Math.abs(gainDb - existing.gainDb) > 0.1) trials.push({ action: "revise", filter: { ...existing, gainDb }, replacedFilterIndex: index, scalableIndex: index });
        }
        for (const multiplier of isBroadValley ? [0.5, 0.75, 1] : [0.5, 0.75, 1.5, 2, 3]) {
          const Q = Math.max(0.5, Math.min(isBroadValley ? broadValleyMaxQ : 10, existing.Q * multiplier));
          if (Math.abs(Q - existing.Q) > 0.1) trials.push({ action: "reviseQ", filter: { ...existing, Q }, replacedFilterIndex: index, scalableIndex: index });
        }
      } else if (existingSign !== correctionSign) {
        if (!productLimited) trials.push({ action: "replace", filter: { ...baseCandidate, band: existing.band }, replacedFilterIndex: index, scalableIndex: index });
        trials.push({ action: "remove", removedFilterIndex: index, scalableIndex: null });
      }
    }
    const mergeIndices = filters.map((filter, index) => ({ filter, index })).filter(({ filter }) => {
      if (!(filter == null ? void 0 : filter.enabled) || Math.sign(filter.gainDb) !== correctionSign) return false;
      return Math.log2(Math.max(baseCandidate.frequencyHz, filter.frequencyHz) / Math.min(baseCandidate.frequencyHz, filter.frequencyHz)) <= 1 / 2;
    }).map(({ index }) => index);
    if (!productLimited && mergeIndices.length >= 2) {
      for (const qScale of [0.75, 1, 1.5]) {
        const merged = {
          ...baseCandidate,
          band: Math.min(...mergeIndices.map((index) => filters[index].band || index + 1)),
          Q: Math.max(0.5, Math.min(isBroadValley ? broadValleyMaxQ : 10, baseCandidate.Q * qScale)),
          reason: isBroadValley ? "Merged overlapping filters into broad-valley refit" : "Merged overlapping filters and jointly refit region"
        };
        trials.push({ action: "merge", filter: merged, mergedFilterIndices: mergeIndices, scalableIndex: filters.length - mergeIndices.length });
      }
    }
    return { trials, productLimited, authority };
  }
  const HOUSE_CURVE_MEMO_LIMITS = Object.freeze({
    correctedCurves: 32,
    metricGrids: 16,
    metrics: 32,
    filterResponses: 64
  });
  class BoundedLruMap extends Map {
    constructor(limit) {
      super();
      this.limit = Math.max(1, Number(limit) || 1);
    }
    get(key) {
      if (!super.has(key)) return void 0;
      const value = super.get(key);
      super.delete(key);
      super.set(key, value);
      return value;
    }
    set(key, value) {
      if (super.has(key)) super.delete(key);
      super.set(key, value);
      while (this.size > this.limit) {
        const oldestKey = this.keys().next().value;
        super.delete(oldestKey);
      }
      return this;
    }
  }
  function bankResponseSignature(filters) {
    return (filters || []).map((filter) => `${(filter == null ? void 0 : filter.enabled) ? 1 : 0}:${filter == null ? void 0 : filter.frequencyHz}:${filter == null ? void 0 : filter.gainDb}:${filter == null ? void 0 : filter.Q}`).join("|");
  }
  function filterResponseCacheKey(filter, gridIdentity) {
    const f = filter || {};
    return [
      f.type ?? "Peak",
      f.enabled ? 1 : 0,
      Number(f.frequencyHz),
      Number(f.gainDb),
      Number(f.Q),
      f.polarity ?? 0,
      gridIdentity
    ].join("|");
  }
  function createHouseCurveEvaluationMemo(enabled = true) {
    return {
      enabled,
      correctedCurves: new BoundedLruMap(HOUSE_CURVE_MEMO_LIMITS.correctedCurves),
      metricGrids: new BoundedLruMap(HOUSE_CURVE_MEMO_LIMITS.metricGrids),
      metrics: new BoundedLruMap(HOUSE_CURVE_MEMO_LIMITS.metrics),
      filterResponses: new BoundedLruMap(HOUSE_CURVE_MEMO_LIMITS.filterResponses)
    };
  }
  function readExactMemo(cache, key, operationCounts, hitField) {
    if (!(cache == null ? void 0 : cache.has(key))) return null;
    return cache.get(key);
  }
  function writeExactMemo(cache, key, value, enabled) {
    if (enabled) cache.set(key, value);
    return value;
  }
  function prepareBassCurveMetricGrid(curve, assessmentStartHz, assessmentEndHz, anchorDb, canonicalTargetCurve = null) {
    const { sorted, bounds } = prepareBassSmoothingGrid(curve, "third");
    const assessedIndices = [];
    const targets = [];
    for (let index = 0; index < sorted.length; index += 1) {
      const frequency = sorted[index].frequency;
      if (frequency < assessmentStartHz || frequency > assessmentEndHz) continue;
      assessedIndices.push(index);
      targets.push(interpolateCanonicalTarget(canonicalTargetCurve, frequency) ?? anchorDb + artcousticHouseCurveOffsetAt(frequency));
    }
    return { bounds, assessedIndices, targets };
  }
  function calculatePreparedBassCurveMetrics(curve, prepared) {
    if (!(prepared == null ? void 0 : prepared.bounds) || !prepared.assessedIndices.length) return null;
    let maxAbsDeviationDb = -Infinity;
    let rmsSum = 0;
    let signedSum = 0;
    let minimumSmoothedSplDb = Infinity;
    let worstFrequencyHz = null;
    const residualPoints2 = [];
    for (let assessedIndex = 0; assessedIndex < prepared.assessedIndices.length; assessedIndex += 1) {
      const pointIndex = prepared.assessedIndices[assessedIndex];
      const [start, end] = prepared.bounds[pointIndex];
      let sum = 0;
      let count = 0;
      for (let index = start; index < end; index += 1) {
        if (!Number.isFinite(curve[index].spl)) continue;
        sum += curve[index].spl;
        count += 1;
      }
      if (!count) continue;
      const smoothedSplDb = sum / count;
      const deviationDb = smoothedSplDb - prepared.targets[assessedIndex];
      if (!Number.isFinite(deviationDb)) continue;
      const absoluteDeviationDb = Math.abs(deviationDb);
      residualPoints2.push({ frequency: curve[pointIndex].frequency, deviationDb, smoothedSplDb });
      signedSum += deviationDb;
      minimumSmoothedSplDb = Math.min(minimumSmoothedSplDb, smoothedSplDb);
      if (absoluteDeviationDb > maxAbsDeviationDb) {
        maxAbsDeviationDb = absoluteDeviationDb;
        worstFrequencyHz = curve[pointIndex].frequency;
      }
      rmsSum += deviationDb ** 2;
    }
    if (!Number.isFinite(maxAbsDeviationDb) || !residualPoints2.length) return null;
    const meanSignedResidualDb = signedSum / residualPoints2.length;
    const shapeRmsDeviationDb = Math.sqrt(residualPoints2.reduce((sum, point) => sum + (point.deviationDb - meanSignedResidualDb) ** 2, 0) / residualPoints2.length);
    return {
      maxAbsDeviationDb,
      rmsDeviationDb: Math.sqrt(rmsSum / residualPoints2.length),
      meanSignedResidualDb,
      shapeRmsDeviationDb,
      minimumSmoothedSplDb,
      residualPoints: residualPoints2,
      worstFrequencyHz
    };
  }
  function filterSignature(filter) {
    return `${(filter == null ? void 0 : filter.enabled) ? 1 : 0}:${filter == null ? void 0 : filter.frequencyHz}:${filter == null ? void 0 : filter.gainDb}:${filter == null ? void 0 : filter.Q}`;
  }
  function prepareBankValidation(raw, activeSubs, usableLfHz, requestedSystemOutputDb) {
    const frequencies = (raw || []).filter((point) => point.frequency >= 20 && point.frequency <= 200).map((point) => point.frequency);
    const permittedBoostDb = frequencies.map((frequency) => {
      const allowance = getSourceDomainBoostAllowance({
        frequency,
        requestedBoostDb: 6,
        activeSubs,
        usableLfHz,
        maxBoostDb: 6,
        requestedSystemOutputDb
      });
      return allowance.frequencyCoveredByProducts ? allowance.allowedBoostDb : null;
    });
    return {
      frequencies,
      permittedBoostDb,
      filterResponses: /* @__PURE__ */ new Map(),
      bankLimitResults: /* @__PURE__ */ new Map(),
      // Stage B.5: exact high-level validation results are immutable for this
      // prepared context (same raw grid, products, output target and limits).
      // Reuse them when another residual region proposes the identical bank.
      trialValidationResults: /* @__PURE__ */ new Map()
    };
  }
  function responseForFilter(context, filter, operationCounts) {
    const key = filterSignature(filter);
    if (operationCounts) operationCounts.filterResponseRequests += 1;
    let response = context.filterResponses.get(key);
    if (response) return response;
    response = context.frequencies.map((frequency) => peakingEqResponseDb(frequency, filter));
    context.filterResponses.set(key, response);
    if (operationCounts) {
      operationCounts.uniqueFilterResponses += 1;
      operationCounts.bankFilterPointEvaluations += response.length;
    }
    return response;
  }
  function evaluatePreparedBankLimits(context, filters, profile, operationCounts) {
    var _a, _b;
    if (operationCounts) operationCounts.bankLimitRequests = (operationCounts.bankLimitRequests || 0) + 1;
    const maximumAggregateBoostDb = ((profile == null ? void 0 : profile.maximumAggregateBoostDb) ?? 6) + 0.05;
    const aggregateCutFloorDb = -(((profile == null ? void 0 : profile.maximumCutDb) ?? 10) + 0.05);
    const bankKey = [
      maximumAggregateBoostDb,
      aggregateCutFloorDb,
      filters.map(filterSignature).join("|")
    ].join("::");
    const cached = (_a = context.bankLimitResults) == null ? void 0 : _a.get(bankKey);
    if (cached) {
      if (operationCounts) operationCounts.reusedBankLimitEvaluations = (operationCounts.reusedBankLimitEvaluations || 0) + 1;
      return cached;
    }
    const filterResponses = filters.map((filter) => responseForFilter(context, filter, operationCounts));
    let maxAggregateBoostDb = 0;
    let maxAggregateBoostHz = null;
    let maxAggregateCutDb = 0;
    let maxAggregateCutHz = null;
    let boostLimitOk = true;
    let cutLimitOk = true;
    let sourceDomainHeadroomOk = true;
    for (let pointIndex = 0; pointIndex < context.frequencies.length; pointIndex += 1) {
      const aggregateDb = filterResponses.reduce((sum, response) => sum + response[pointIndex], 0);
      const frequency = context.frequencies[pointIndex];
      if (aggregateDb > maxAggregateBoostDb) {
        maxAggregateBoostDb = aggregateDb;
        maxAggregateBoostHz = frequency;
      }
      if (aggregateDb < maxAggregateCutDb) {
        maxAggregateCutDb = aggregateDb;
        maxAggregateCutHz = frequency;
      }
      if (aggregateDb > maximumAggregateBoostDb) boostLimitOk = false;
      const permittedBoostDb = context.permittedBoostDb[pointIndex];
      if (Number.isFinite(permittedBoostDb) && aggregateDb > permittedBoostDb + 0.05) sourceDomainHeadroomOk = false;
      if (aggregateDb < aggregateCutFloorDb) cutLimitOk = false;
    }
    const limitingPermittedBoostDb = context.permittedBoostDb.filter(Number.isFinite).reduce((minimum, value) => Math.min(minimum, value), 6);
    const result = {
      maxAggregateBoostDb,
      maxAggregateBoostHz,
      maxAggregateCutDb,
      maxAggregateCutHz,
      limitingPermittedBoostDb,
      boostLimitOk,
      cutLimitOk,
      sourceDomainHeadroomOk,
      allOk: boostLimitOk && cutLimitOk && sourceDomainHeadroomOk
    };
    (_b = context.bankLimitResults) == null ? void 0 : _b.set(bankKey, result);
    if (operationCounts) operationCounts.uniqueBankLimitEvaluations = (operationCounts.uniqueBankLimitEvaluations || 0) + 1;
    return result;
  }
  const CURRENT_BASELINE_TOLERANCE_DB = 0.5;
  const CUT_BASE_TOLERANCE_DB = 1;
  const CUT_MATERIAL_IMPROVEMENT_TOLERANCE_DB = 1.5;
  const CUT_MAJOR_IMPROVEMENT_TOLERANCE_DB = 2;
  function resolveSeatRegressionToleranceDb(rspImprovementDb, {
    isCorrectiveCut = false,
    protectedNull = false,
    bankLimits: bankLimits2 = null
  } = {}) {
    const safeCut = isCorrectiveCut && !protectedNull && (bankLimits2 == null ? void 0 : bankLimits2.boostLimitOk) !== false && (bankLimits2 == null ? void 0 : bankLimits2.sourceDomainHeadroomOk) !== false;
    if (!safeCut) {
      return CURRENT_BASELINE_TOLERANCE_DB;
    }
    if (!Number.isFinite(rspImprovementDb) || rspImprovementDb < 1) {
      return CUT_BASE_TOLERANCE_DB;
    }
    if (rspImprovementDb < 3) {
      return CUT_MATERIAL_IMPROVEMENT_TOLERANCE_DB;
    }
    return rspImprovementDb >= 5 ? CUT_MAJOR_IMPROVEMENT_TOLERANCE_DB : CUT_MATERIAL_IMPROVEMENT_TOLERANCE_DB;
  }
  function evaluateSeatRegressionTolerance({
    seatMetrics = [],
    baselineSeatMaxDeviations = /* @__PURE__ */ new Map(),
    protectedNullRegions = [],
    isProtectedFrequency: isProtectedFrequency2,
    rspImprovementDb,
    isCorrectiveCut,
    protectedNull,
    bankLimits: bankLimits2
  }) {
    const allowedRegressionDb = resolveSeatRegressionToleranceDb(rspImprovementDb, {
      isCorrectiveCut,
      protectedNull,
      bankLimits: bankLimits2
    });
    let worstSeatId = null;
    let worstSeatRegressionDb = -Infinity;
    for (const metric of seatMetrics) {
      if (metric.seatId === "rsp") continue;
      const baselineDeviationDb = baselineSeatMaxDeviations.get(metric.seatId);
      if (!Number.isFinite(baselineDeviationDb)) continue;
      const points = (metric.residualPoints || []).filter((point) => !isProtectedFrequency2(point.frequency, protectedNullRegions));
      const candidateDeviationDb = points.length ? Math.max(...points.map((point) => Math.abs(point.deviationDb))) : metric.maxAbsDeviationDb;
      const regressionDb = candidateDeviationDb - baselineDeviationDb;
      if (regressionDb > worstSeatRegressionDb) {
        worstSeatRegressionDb = regressionDb;
        worstSeatId = metric.seatId;
      }
    }
    const measuredRegressionDb = Number.isFinite(worstSeatRegressionDb) ? worstSeatRegressionDb : 0;
    return {
      passed: measuredRegressionDb <= allowedRegressionDb + 1e-9,
      allowedRegressionDb,
      worstSeatId,
      worstSeatRegressionDb: measuredRegressionDb,
      toleranceRaised: allowedRegressionDb > CURRENT_BASELINE_TOLERANCE_DB
    };
  }
  const finiteOrLarge = (value) => Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  const filterCount = (metrics) => {
    const bank = metrics == null ? void 0 : metrics.generatedFilterBank;
    return Array.isArray(bank) ? bank.filter((filter) => filter == null ? void 0 : filter.enabled).length : 0;
  };
  const MAX_EQUIVALENCE_DB = 0.05;
  const MEAN_EQUIVALENCE_DB = 0.05;
  const RMS_EPSILON_DB$1 = 0.01;
  function compareHouseCurveMetrics(a, b) {
    if (!a) return b ? 1 : 0;
    if (!b) return -1;
    if (Number.isFinite(a.rspMaxDeviationDb) && Number.isFinite(b.rspMaxDeviationDb)) {
      if (Math.abs(a.rspMaxDeviationDb - b.rspMaxDeviationDb) > MAX_EQUIVALENCE_DB) return a.rspMaxDeviationDb - b.rspMaxDeviationDb;
      if (Number.isFinite(a.rspRmsDeviationDb) && Number.isFinite(b.rspRmsDeviationDb) && Math.abs(a.rspRmsDeviationDb - b.rspRmsDeviationDb) > RMS_EPSILON_DB$1) return a.rspRmsDeviationDb - b.rspRmsDeviationDb;
    }
    const aWorst = finiteOrLarge(a.worstSeatMaxDeviationDb ?? a.worstRealSeatHouseCurveVariationDb);
    const bWorst = finiteOrLarge(b.worstSeatMaxDeviationDb ?? b.worstRealSeatHouseCurveVariationDb);
    if (Math.abs(aWorst - bWorst) > MAX_EQUIVALENCE_DB) return aWorst - bWorst;
    if (Number.isFinite(a.meanSeatMaxDeviationDb) && Number.isFinite(b.meanSeatMaxDeviationDb) && Math.abs(a.meanSeatMaxDeviationDb - b.meanSeatMaxDeviationDb) > MEAN_EQUIVALENCE_DB) {
      return a.meanSeatMaxDeviationDb - b.meanSeatMaxDeviationDb;
    }
    if (Number.isFinite(a.rmsSeatTargetErrorDb) && Number.isFinite(b.rmsSeatTargetErrorDb) && Math.abs(a.rmsSeatTargetErrorDb - b.rmsSeatTargetErrorDb) > RMS_EPSILON_DB$1) {
      return a.rmsSeatTargetErrorDb - b.rmsSeatTargetErrorDb;
    }
    const aRsp = finiteOrLarge(a.rspMaxDeviationDb);
    const bRsp = finiteOrLarge(b.rspMaxDeviationDb);
    if (Math.abs(aRsp - bRsp) > RMS_EPSILON_DB$1) return aRsp - bRsp;
    return filterCount(a) - filterCount(b);
  }
  const isNumber$1 = (v) => Number.isFinite(Number(v));
  const WORST_EQUIV_DB = 0.05;
  const RMS_EPSILON_DB = 0.01;
  const HOUSE_CURVE_MAX_OPERATIONS = 8;
  const CUT_INFLUENCE_THRESHOLD_DB = 0.25;
  const CUT_PEAK_REDUCTION_DB$1 = 0.5;
  const CUT_AREA_REDUCTION_DB = 0.01;
  function houseCurveP19Level(variationDb) {
    if (!isNumber$1(variationDb)) return 0;
    return numericRp22Level(levelP19_lfResponse(Number(variationDb))) ?? 0;
  }
  function calculateSeatMetricsFromCorrected(correctedCurve, assessmentStartHz, assessmentEndHz, anchorDb, prepared = null, canonicalTargetCurve = null) {
    if (prepared) return calculatePreparedBassCurveMetrics(correctedCurve, prepared);
    const smoothed = applyBassSmoothing(correctedCurve, "third");
    const assessedPoints = smoothed.filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz).map((p) => {
      const targetDb = interpolateCanonicalTarget(canonicalTargetCurve, p.frequency) ?? anchorDb + artcousticHouseCurveOffsetAt(p.frequency);
      return { frequency: p.frequency, spl: p.spl, targetDb, deviationDb: p.spl - targetDb };
    }).filter((p) => isNumber$1(p.deviationDb));
    if (!assessedPoints.length) return null;
    const maxAbsDev = Math.max(...assessedPoints.map((p) => Math.abs(p.deviationDb)));
    const rmsDev = Math.sqrt(assessedPoints.reduce((sum, p) => sum + p.deviationDb ** 2, 0) / assessedPoints.length);
    const meanSignedResidualDb = assessedPoints.reduce((sum, p) => sum + p.deviationDb, 0) / assessedPoints.length;
    const shapeRmsDeviationDb = Math.sqrt(assessedPoints.reduce((sum, p) => sum + (p.deviationDb - meanSignedResidualDb) ** 2, 0) / assessedPoints.length);
    const worstPoint = assessedPoints.reduce((best, p) => Math.abs(p.deviationDb) > Math.abs(best.deviationDb) ? p : best);
    return {
      maxAbsDeviationDb: maxAbsDev,
      rmsDeviationDb: rmsDev,
      meanSignedResidualDb,
      shapeRmsDeviationDb,
      minimumSmoothedSplDb: Math.min(...assessedPoints.map((p) => p.spl)),
      residualPoints: assessedPoints,
      worstFrequencyHz: worstPoint.frequency
    };
  }
  function correctedCurvesForSharedBank(seats, filters, operationCounts, memo = null) {
    const bankKey = bankResponseSignature(filters);
    if (operationCounts) operationCounts.curveEvaluationRequests += seats.length;
    const cached = (memo == null ? void 0 : memo.enabled) ? readExactMemo(memo.correctedCurves, bankKey) : null;
    if (cached) {
      if (operationCounts) operationCounts.reusedCurveEvaluationRequests += seats.length;
      return cached;
    }
    const correctionsByFrequencyGrid = /* @__PURE__ */ new Map();
    const corrected = seats.map((seat) => {
      const raw = seat.raw;
      const gridKey = raw.map((point) => point.frequency).join("|");
      let correction = correctionsByFrequencyGrid.get(gridKey);
      if (!correction) {
        if ((memo == null ? void 0 : memo.enabled) && memo.filterResponses) {
          const filterResponses = filters.map((filter) => {
            const filterKey = filterResponseCacheKey(filter, gridKey);
            let responseVector = memo.filterResponses.get(filterKey);
            if (!responseVector) {
              responseVector = raw.map((point) => peakingEqResponseDb(point.frequency, filter));
              memo.filterResponses.set(filterKey, responseVector);
            }
            return responseVector;
          });
          correction = raw.map((point, pointIndex) => {
            let sum = 0;
            for (let filterIndex = 0; filterIndex < filters.length; filterIndex++) {
              sum += filterResponses[filterIndex][pointIndex];
            }
            return sum;
          });
        } else {
          correction = raw.map((point) => filters.reduce((sum, filter) => sum + peakingEqResponseDb(point.frequency, filter), 0));
        }
        correctionsByFrequencyGrid.set(gridKey, correction);
        if (operationCounts) {
          operationCounts.uniqueCurveFilterEvaluations += 1;
          operationCounts.filterPointEvaluations += raw.length * filters.length;
        }
      }
      return {
        seat,
        corrected: raw.map((point, index) => ({ frequency: point.frequency, spl: point.spl + correction[index] }))
      };
    });
    return writeExactMemo(memo == null ? void 0 : memo.correctedCurves, bankKey, corrected, memo == null ? void 0 : memo.enabled);
  }
  function summarizeSeatMetrics(seatMetrics, protectedNullRegions = []) {
    var _a;
    if (!seatMetrics.length) return null;
    const rsp = seatMetrics.find((metric) => metric.seatId === "rsp") || null;
    const scoredRspPoints = ((rsp == null ? void 0 : rsp.residualPoints) || []).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
    const rspScan = ((_a = rsp == null ? void 0 : rsp.residualPoints) == null ? void 0 : _a.length) ? scanMaxAbsoluteDeviationFromResidualPoints(rsp.residualPoints, protectedNullRegions) : null;
    const rspMaxDeviationDb = (rspScan == null ? void 0 : rspScan.maxAbsDeviationDb) ?? (rsp == null ? void 0 : rsp.maxAbsDeviationDb) ?? null;
    const rspRmsDeviationDb = scoredRspPoints.length ? Math.sqrt(scoredRspPoints.reduce((sum, point) => sum + point.deviationDb ** 2, 0) / scoredRspPoints.length) : (rsp == null ? void 0 : rsp.rmsDeviationDb) ?? null;
    const rspMeanSignedResidualDb = scoredRspPoints.length ? scoredRspPoints.reduce((sum, point) => sum + point.deviationDb, 0) / scoredRspPoints.length : (rsp == null ? void 0 : rsp.meanSignedResidualDb) ?? null;
    const rspShapeRmsDeviationDb = scoredRspPoints.length ? Math.sqrt(scoredRspPoints.reduce((sum, point) => sum + (point.deviationDb - rspMeanSignedResidualDb) ** 2, 0) / scoredRspPoints.length) : (rsp == null ? void 0 : rsp.shapeRmsDeviationDb) ?? null;
    const objectiveMetric = (metric) => {
      var _a2;
      const points = (metric.residualPoints || []).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
      const scan = ((_a2 = metric.residualPoints) == null ? void 0 : _a2.length) ? scanMaxAbsoluteDeviationFromResidualPoints(metric.residualPoints, protectedNullRegions) : null;
      return {
        ...metric,
        objectiveMaxAbsDeviationDb: (scan == null ? void 0 : scan.maxAbsDeviationDb) ?? (points.length ? Math.max(...points.map((point) => Math.abs(point.deviationDb))) : metric.maxAbsDeviationDb),
        objectiveRmsDeviationDb: points.length ? Math.sqrt(points.reduce((sum, point) => sum + point.deviationDb ** 2, 0) / points.length) : metric.rmsDeviationDb
      };
    };
    const realSeats = seatMetrics.filter((metric) => metric.seatId !== "rsp").map(objectiveMetric);
    const constrainedSeats = realSeats.length ? realSeats : rsp ? [objectiveMetric(rsp)] : seatMetrics.map(objectiveMetric);
    const worstSeat = constrainedSeats.reduce((worst, metric) => metric.objectiveMaxAbsDeviationDb > worst.objectiveMaxAbsDeviationDb ? metric : worst);
    return {
      seatMetrics,
      worstSeatId: worstSeat.seatId,
      worstSeatMaxDeviationDb: worstSeat.objectiveMaxAbsDeviationDb,
      worstSeatP19Level: houseCurveP19Level(worstSeat.objectiveMaxAbsDeviationDb),
      meanSeatMaxDeviationDb: constrainedSeats.reduce((sum, metric) => sum + metric.objectiveMaxAbsDeviationDb, 0) / constrainedSeats.length,
      rmsSeatTargetErrorDb: Math.sqrt(constrainedSeats.reduce((sum, metric) => sum + metric.objectiveRmsDeviationDb ** 2, 0) / constrainedSeats.length),
      rspMaxDeviationDb,
      rspRmsDeviationDb,
      rspMeanSignedResidualDb,
      rspShapeRmsDeviationDb,
      rspMinimumSmoothedSplDb: (rsp == null ? void 0 : rsp.minimumSmoothedSplDb) ?? null,
      rspResidualPoints: (rsp == null ? void 0 : rsp.residualPoints) ?? []
    };
  }
  function rspMinimumInBand(metrics, startHz = 20, endHz = 120) {
    var _a;
    const rsp = (_a = metrics == null ? void 0 : metrics.seatMetrics) == null ? void 0 : _a.find((metric) => metric.seatId === "rsp");
    const values = ((rsp == null ? void 0 : rsp.residualPoints) || []).filter((point) => point.frequency >= startHz && point.frequency <= endHz).map((point) => point.smoothedSplDb ?? point.spl).filter(Number.isFinite);
    return values.length ? Math.min(...values) : null;
  }
  function calculateAllSeatMetricsFromCorrected(correctedCurves, assessmentStartHz, assessmentEndHz, anchorDb, canonicalTargetCurve = null) {
    const seatMetrics = [];
    for (const seat of correctedCurves) {
      const curve = Array.isArray(seat.responseData) ? seat.responseData : seat.raw;
      if (!Array.isArray(curve) || curve.length === 0) continue;
      const metrics = calculateSeatMetricsFromCorrected(curve, assessmentStartHz, assessmentEndHz, anchorDb, null, canonicalTargetCurve);
      if (metrics) seatMetrics.push({ seatId: seat.seatId, isPrimary: seat.isPrimary, ...metrics });
    }
    return summarizeSeatMetrics(seatMetrics);
  }
  function calculateAllSeatMetrics(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb, operationCounts = null, memo = null, qualityOptions = {}) {
    const startedAt = operationCounts ? performance.now() : 0;
    const correctedSeats2 = correctedCurvesForSharedBank(seats, filters, operationCounts, memo);
    if (operationCounts) operationCounts.perSeatMetricEvaluations += correctedSeats2.length;
    const metricsKey = bankResponseSignature(filters);
    const cached = (memo == null ? void 0 : memo.enabled) ? readExactMemo(memo.metrics, metricsKey) : null;
    if (cached) {
      if (operationCounts) operationCounts.reusedPerSeatMetricEvaluations += correctedSeats2.length;
      return cached;
    }
    const seatMetrics = [];
    for (const { seat, corrected } of correctedSeats2) {
      if (operationCounts) operationCounts.metricGridPreparationRequests += 1;
      const gridKey = seat.gridKey || corrected.map((point) => point.frequency).join("|");
      let prepared = (memo == null ? void 0 : memo.enabled) ? memo.metricGrids.get(gridKey) : null;
      if (!prepared && (memo == null ? void 0 : memo.enabled)) {
        prepared = prepareBassCurveMetricGrid(corrected, assessmentStartHz, assessmentEndHz, anchorDb, qualityOptions.canonicalTargetCurve);
        memo.metricGrids.set(gridKey, prepared);
        if (operationCounts) operationCounts.uniqueMetricGridPreparations += 1;
      }
      const metrics = calculateSeatMetricsFromCorrected(corrected, assessmentStartHz, assessmentEndHz, anchorDb, prepared, qualityOptions.canonicalTargetCurve);
      if (metrics) seatMetrics.push({ seatId: seat.seatId, isPrimary: seat.isPrimary, ...metrics });
    }
    if (operationCounts) {
      operationCounts.uniquePerSeatMetricEvaluations += correctedSeats2.length;
      operationCounts.perSeatEvaluationTimeMs += performance.now() - startedAt;
    }
    if (!seatMetrics.length) return null;
    return writeExactMemo(memo == null ? void 0 : memo.metrics, metricsKey, summarizeSeatMetrics(seatMetrics, qualityOptions.protectedNullRegions), memo == null ? void 0 : memo.enabled);
  }
  function enclosingBroadValley(segment, candidatePoint) {
    if (!Array.isArray(segment) || (candidatePoint == null ? void 0 : candidatePoint.deviationDb) >= 0) return null;
    const centreIndex = segment.findIndex((point) => point.frequency === candidatePoint.frequency);
    if (centreIndex <= 0 || centreIndex >= segment.length - 1) return null;
    const halfOctave = 2 ** 0.5;
    const leftPeak = segment.filter((point) => point.frequency >= candidatePoint.frequency / halfOctave && point.frequency < candidatePoint.frequency).reduce((best, point) => !best || point.deviationDb > best.deviationDb ? point : best, null);
    const rightPeak = segment.filter((point) => point.frequency > candidatePoint.frequency && point.frequency <= candidatePoint.frequency * halfOctave).reduce((best, point) => !best || point.deviationDb > best.deviationDb ? point : best, null);
    const hasMaterialShoulders = leftPeak && rightPeak && leftPeak.deviationDb >= candidatePoint.deviationDb + 2 && rightPeak.deviationDb >= candidatePoint.deviationDb + 2;
    if (!hasMaterialShoulders || rightPeak.frequency <= leftPeak.frequency) return null;
    const widthOctaves = Math.log2(rightPeak.frequency / leftPeak.frequency);
    return widthOctaves >= 1 / 3 ? { startHz: leftPeak.frequency, endHz: rightPeak.frequency, widthOctaves } : null;
  }
  function findAllResidualRegions(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb, peakThresholdDb, valleyThresholdDb, operationCounts, memo, protectedNullRegions = [], canonicalTargetCurve = null) {
    const allRegions = [];
    const correctedSeats2 = correctedCurvesForSharedBank(seats, filters, operationCounts, memo);
    const rspDiscoverySeats = correctedSeats2.filter(({ seat }) => seat.seatId === "rsp");
    const discoverySeats = rspDiscoverySeats.length ? rspDiscoverySeats : correctedSeats2;
    for (const { seat, corrected } of discoverySeats) {
      const smoothed = applyBassSmoothing(corrected, "third");
      const trendPoints = smoothed.filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz).map((p) => {
        const targetSpl = interpolateCanonicalTarget(canonicalTargetCurve, p.frequency) ?? anchorDb + artcousticHouseCurveOffsetAt(p.frequency);
        return { ...p, targetSpl, deviationDb: p.spl - targetSpl };
      });
      const unprotectedSegments = [];
      let currentSegment = [];
      for (const point of trendPoints) {
        if (isProtectedSmoothedFrequency(point.frequency, protectedNullRegions)) {
          if (currentSegment.length) unprotectedSegments.push(currentSegment);
          currentSegment = [];
        } else {
          currentSegment.push(point);
        }
      }
      if (currentSegment.length) unprotectedSegments.push(currentSegment);
      const regions = unprotectedSegments.flatMap((segment) => {
        const discovered = [
          ...findRegions(segment, "peak", peakThresholdDb, valleyThresholdDb),
          ...findRegions(segment, "valley", peakThresholdDb, valleyThresholdDb)
        ];
        if (!segment.length) return discovered;
        const worstPoint = segment.reduce((worst, point) => Math.abs(point.deviationDb) > Math.abs(worst.deviationDb) ? point : worst);
        const localExtrema = segment.filter((point, index) => {
          var _a, _b;
          const previous = (_a = segment[index - 1]) == null ? void 0 : _a.deviationDb;
          const next = (_b = segment[index + 1]) == null ? void 0 : _b.deviationDb;
          const peak = point.deviationDb >= peakThresholdDb && point.deviationDb >= (previous ?? -Infinity) && point.deviationDb >= (next ?? -Infinity);
          const valley = point.deviationDb <= -valleyThresholdDb && point.deviationDb <= (previous ?? Infinity) && point.deviationDb <= (next ?? Infinity);
          return peak || valley;
        });
        const candidatePoints = [worstPoint, segment[0], segment.at(-1), ...localExtrema].filter((point, index, values) => values.findIndex((candidate) => candidate.frequency === point.frequency) === index);
        for (const candidatePoint of candidatePoints) {
          const thresholdDb = candidatePoint.deviationDb >= 0 ? peakThresholdDb : valleyThresholdDb;
          const represented = discovered.some((region) => Math.abs(Math.log2(region.centrePoint.frequency / candidatePoint.frequency)) <= 1 / 24);
          if (!represented && Math.abs(candidatePoint.deviationDb) >= thresholdDb) {
            const enclosingValley = enclosingBroadValley(segment, candidatePoint);
            discovered.push({
              kind: candidatePoint.deviationDb >= 0 ? "peak" : "valley",
              startHz: (enclosingValley == null ? void 0 : enclosingValley.startHz) ?? candidatePoint.frequency / 2 ** (1 / 12),
              endHz: (enclosingValley == null ? void 0 : enclosingValley.endHz) ?? candidatePoint.frequency * 2 ** (1 / 12),
              ...enclosingValley ? {
                widthOctaves: enclosingValley.widthOctaves,
                regionBasis: "nearest-smoothed-peak-boundaries"
              } : {},
              centrePoint: candidatePoint,
              severityDb: Math.abs(candidatePoint.deviationDb)
            });
          }
        }
        return discovered;
      });
      for (const region of regions) {
        const rawSpl = curveSplAt(seat.raw, region.centrePoint.frequency);
        const protectedNull = isProtectedFrequency(region.centrePoint.frequency, protectedNullRegions);
        const authority = classifyEqCorrectionRegion({
          frequency: region.centrePoint.frequency,
          rawSpl,
          currentSpl: region.centrePoint.spl,
          targetSpl: region.centrePoint.targetSpl,
          protectedNull,
          widthOctaves: region.widthOctaves
        });
        allRegions.push({ ...region, seatId: seat.seatId, rawSpl, authority });
      }
    }
    allRegions.sort((a, b) => b.severityDb - a.severityDb);
    return allRegions;
  }
  function buildProposedBank(trial, filters) {
    if (trial.action === "append") return [...filters, trial.filter];
    if (trial.action === "remove") return filters.filter((_, i) => i !== trial.removedFilterIndex);
    if (trial.action === "merge") return [...filters.filter((_, i) => !trial.mergedFilterIndices.includes(i)), trial.filter];
    return filters.map((f, i) => i === trial.replacedFilterIndex ? trial.filter : f);
  }
  function validateAndScaleTrial(proposedFilters, scalableFilterIndex, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, operationCounts, preparedBankValidation) {
    if (operationCounts) operationCounts.bankValidationRequests += 1;
    const startedAt = operationCounts ? performance.now() : 0;
    const validationCache = preparedBankValidation == null ? void 0 : preparedBankValidation.trialValidationResults;
    const validationCacheKey = validationCache ? [
      scalableFilterIndex ?? "none",
      (profile == null ? void 0 : profile.maximumAggregateBoostDb) ?? 6,
      profile == null ? void 0 : profile.maximumCutDb,
      bankResponseSignature(proposedFilters)
    ].join("|") : null;
    if (validationCacheKey && validationCache.has(validationCacheKey)) {
      if (operationCounts) {
        operationCounts.reusedBankValidations += 1;
        operationCounts.candidateBankValidationTimeMs += performance.now() - startedAt;
      }
      return validationCache.get(validationCacheKey);
    }
    const limits = preparedBankValidation ? evaluatePreparedBankLimits(preparedBankValidation, proposedFilters, profile, operationCounts) : evaluateProvisionalBankLimits(proposedFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
    let result;
    if (limits.allOk) {
      result = { filters: proposedFilters, limits, scaled: false };
    } else if (scalableFilterIndex === null || scalableFilterIndex < 0 || scalableFilterIndex >= proposedFilters.length) {
      result = { filters: null, limits, scaled: false };
    } else {
      const scalable = proposedFilters[scalableFilterIndex];
      if (!(scalable == null ? void 0 : scalable.enabled) || !Number.isFinite(scalable.gainDb) || Math.abs(scalable.gainDb) <= 0.1) {
        result = { filters: null, limits, scaled: false };
      } else {
        const isBoost = scalable.gainDb > 0;
        let lo = 0;
        let hi = Math.abs(scalable.gainDb);
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          const scaledGain = isBoost ? mid : -mid;
          const scaledFilters = proposedFilters.map((f, i2) => i2 === scalableFilterIndex ? { ...f, gainDb: scaledGain } : f);
          const scaledLimits = preparedBankValidation ? evaluatePreparedBankLimits(preparedBankValidation, scaledFilters, profile, operationCounts) : evaluateProvisionalBankLimits(scaledFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
          if (scaledLimits.allOk) lo = mid;
          else hi = mid;
        }
        const scaledGainDb = isBoost ? lo : -lo;
        if (Math.abs(scaledGainDb) <= 0.1) {
          result = { filters: null, limits, scaled: true };
        } else {
          const scaledFilters = proposedFilters.map((f, i) => i === scalableFilterIndex ? { ...f, gainDb: scaledGainDb } : f);
          const finalLimits = preparedBankValidation ? evaluatePreparedBankLimits(preparedBankValidation, scaledFilters, profile, operationCounts) : evaluateProvisionalBankLimits(scaledFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
          result = { filters: finalLimits.allOk ? scaledFilters : null, limits: finalLimits, scaled: true };
        }
      }
    }
    if (validationCacheKey) validationCache.set(validationCacheKey, result);
    if (operationCounts) {
      operationCounts.uniqueBankValidations += 1;
      operationCounts.candidateBankValidationTimeMs += performance.now() - startedAt;
    }
    return result;
  }
  function evaluateCutInfluenceAcceptance(currentMetrics, trialMetrics, protectedNullRegions) {
    const currentPoints = (currentMetrics == null ? void 0 : currentMetrics.rspResidualPoints) || [];
    const trialPoints = (trialMetrics == null ? void 0 : trialMetrics.rspResidualPoints) || [];
    if (!currentPoints.length || !trialPoints.length) return false;
    const trialByFreq = new Map(trialPoints.map((p) => [p.frequency, p]));
    let currentMaxPositive = 0;
    let trialMaxPositive = 0;
    let currentPositiveArea = 0;
    let trialPositiveArea = 0;
    let inInfluence = false;
    for (const current of currentPoints) {
      const after = trialByFreq.get(current.frequency);
      if (!after) continue;
      if (isProtectedSmoothedFrequency(current.frequency, protectedNullRegions)) continue;
      const change = after.deviationDb - current.deviationDb;
      if (Math.abs(change) < CUT_INFLUENCE_THRESHOLD_DB) continue;
      inInfluence = true;
      if (current.deviationDb > 0) {
        currentMaxPositive = Math.max(currentMaxPositive, current.deviationDb);
        currentPositiveArea += current.deviationDb;
      }
      if (after.deviationDb > 0) {
        trialMaxPositive = Math.max(trialMaxPositive, after.deviationDb);
        trialPositiveArea += after.deviationDb;
      }
    }
    if (!inInfluence) return false;
    const peakReduced = currentMaxPositive - trialMaxPositive >= CUT_PEAK_REDUCTION_DB$1;
    const areaReduced = trialPositiveArea < currentPositiveArea - CUT_AREA_REDUCTION_DB;
    return peakReduced && areaReduced;
  }
  function createHouseCurveOperationCounts() {
    return {
      curveEvaluationRequests: 0,
      uniqueCurveFilterEvaluations: 0,
      reusedCurveEvaluationRequests: 0,
      filterPointEvaluations: 0,
      metricGridPreparationRequests: 0,
      uniqueMetricGridPreparations: 0,
      perSeatMetricEvaluations: 0,
      uniquePerSeatMetricEvaluations: 0,
      reusedPerSeatMetricEvaluations: 0,
      perSeatEvaluationTimeMs: 0,
      bankValidationRequests: 0,
      uniqueBankValidations: 0,
      reusedBankValidations: 0,
      bankLimitRequests: 0,
      uniqueBankLimitEvaluations: 0,
      reusedBankLimitEvaluations: 0,
      filterResponseRequests: 0,
      uniqueFilterResponses: 0,
      bankFilterPointEvaluations: 0,
      candidateBankValidationTimeMs: 0,
      nearTargetProtectionRejections: 0,
      p14SafetyRejections: 0,
      protectedNullWorseningRejections: 0,
      mergedFilterOperations: 0,
      replacedFilterOperations: 0,
      seatRegressionToleranceAccepted: 0,
      seatRegressionToleranceRejected: 0
    };
  }
  function runSingleStart(initialFilters, seats, bankRaw, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile, options = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t;
    const peakThresholdDb = profile.peakDiscoveryThresholdDb || 1;
    const valleyThresholdDb = profile.valleyDiscoveryThresholdDb || 1;
    const maxOperations = HOUSE_CURVE_MAX_OPERATIONS;
    const protectedNullRegions = Array.isArray(options.protectedNullRegions) ? options.protectedNullRegions : [];
    const canonicalTargetCurve = Array.isArray(options.canonicalTargetCurve) ? options.canonicalTargetCurve : null;
    const correctionStartHz = Number.isFinite(Number(options.correctionStartHz)) ? Number(options.correctionStartHz) : assessmentStartHz;
    const correctionEndHz = Number.isFinite(Number(options.correctionEndHz)) ? Number(options.correctionEndHz) : assessmentEndHz;
    const operationCounts = createHouseCurveOperationCounts();
    const memo = options.memo || createHouseCurveEvaluationMemo(options.reuseExactEvaluations !== false);
    const preparedBankValidation = options.preparedBankValidation || (options.reuseExactEvaluations !== false ? prepareBankValidation(bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb) : null);
    let filters = initialFilters.map((f) => ({ ...f }));
    let currentMetrics = calculateAllSeatMetrics(seats, filters, assessmentStartHz, assessmentEndHz, anchorDb, operationCounts, memo, { protectedNullRegions, canonicalTargetCurve });
    if (!currentMetrics) return { filters, metrics: null, baselineWorstSeatDeviation: null, blockedResiduals: [], stopReason: "no seat metrics", bankEvalCount: 0, operations: 0, operationCounts };
    const baselineWorstSeatDeviation = currentMetrics.worstSeatMaxDeviationDb;
    const baselineRspMetrics = {
      maximumAbsoluteResidualDb: currentMetrics.rspMaxDeviationDb,
      rmsResidualDb: currentMetrics.rspRmsDeviationDb,
      meanSignedResidualDb: currentMetrics.rspMeanSignedResidualDb,
      shapeRmsResidualDb: currentMetrics.rspShapeRmsDeviationDb
    };
    const baselineRspPoints = currentMetrics.rspResidualPoints || [];
    const baselineRspMinimumSplDb = rspMinimumInBand(currentMetrics);
    const baselineSeatMaxDeviations = /* @__PURE__ */ new Map();
    if (currentMetrics.seatMetrics) {
      for (const m of currentMetrics.seatMetrics) {
        const points = (m.residualPoints || []).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
        baselineSeatMaxDeviations.set(m.seatId, points.length ? Math.max(...points.map((point) => Math.abs(point.deviationDb))) : m.maxAbsDeviationDb);
      }
    }
    let blockedResiduals = [];
    let operations = 0;
    let stopReason = "no safe improvement remained";
    let bankEvalCount = 0;
    const trace2 = [];
    while (operations < maxOperations) {
      const regions = findAllResidualRegions(seats, filters, correctionStartHz, correctionEndHz, anchorDb, peakThresholdDb, valleyThresholdDb, operationCounts, memo, protectedNullRegions, canonicalTargetCurve);
      if (!regions.length) {
        stopReason = "no residual regions found";
        break;
      }
      const iterationEntry = {
        iteration: operations,
        regions: regions.map((r) => ({ seatId: r.seatId, kind: r.kind, startHz: r.startHz, endHz: r.endHz, centreFrequencyHz: r.centrePoint.frequency, severityDb: r.severityDb })),
        trials: [],
        bestTrialIndex: null
      };
      blockedResiduals = protectedNullRegions.map((region) => ({
        seatId: "rsp",
        frequency: region.centreFrequencyHz,
        signedDeviationDb: region.signedResidualDb,
        requiredCorrectionDb: region.requiredBoostDb,
        permittedCorrectionDb: region.permittedBoostDb,
        blockingReason: "protected-null",
        reason: region.reason
      }));
      let bestTrial = null;
      let bestTrialMetrics = null;
      let bestTrialFilters = null;
      let bestTrialTraceIndex = null;
      for (const region of regions) {
        const protectedNull = ((_a = region.authority) == null ? void 0 : _a.classification) === "Null" || region.kind === "valley" && isProtectedFrequency(region.centrePoint.frequency, protectedNullRegions);
        const { trials, productLimited: correctionUnavailable, authority } = generateHouseCurveTrials({ ...region, protectedNull }, filters, profile, activeSubs, usableLfHz, requestedSystemOutputDb);
        let regionAdmissible = false;
        let regionBlockReason = protectedNull ? "protected-null" : correctionUnavailable ? "correction-unavailable" : null;
        if (protectedNull) continue;
        for (const trial of trials) {
          const proposedFilters = buildProposedBank(trial, filters);
          const validation = validateAndScaleTrial(proposedFilters, trial.scalableIndex, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, operationCounts, preparedBankValidation);
          bankEvalCount++;
          const trialEntry = {
            regionSeatId: region.seatId,
            regionKind: region.kind,
            regionCentreHz: region.centrePoint.frequency,
            regionSeverityDb: region.severityDb,
            regionClassification: (authority == null ? void 0 : authority.classification) || ((_b = region.authority) == null ? void 0 : _b.classification) || null,
            beforeEqSpl: region.rawSpl ?? null,
            targetSpl: region.centrePoint.targetSpl ?? null,
            expectedAction: (authority == null ? void 0 : authority.expectedAction) || ((_c = region.authority) == null ? void 0 : _c.expectedAction) || null,
            action: trial.action,
            frequencyHz: ((_d = trial.filter) == null ? void 0 : _d.frequencyHz) ?? null,
            gainDb: ((_e = trial.filter) == null ? void 0 : _e.gainDb) ?? null,
            Q: ((_f = trial.filter) == null ? void 0 : _f.Q) ?? null,
            scaled: validation.scaled,
            bankValidation: {
              allOk: ((_g = validation.limits) == null ? void 0 : _g.allOk) ?? false,
              boostLimitOk: ((_h = validation.limits) == null ? void 0 : _h.boostLimitOk) ?? null,
              cutLimitOk: ((_i = validation.limits) == null ? void 0 : _i.cutLimitOk) ?? null,
              sourceDomainHeadroomOk: ((_j = validation.limits) == null ? void 0 : _j.sourceDomainHeadroomOk) ?? null,
              maxAggregateBoostDb: ((_k = validation.limits) == null ? void 0 : _k.maxAggregateBoostDb) ?? null,
              maxAggregateBoostHz: ((_l = validation.limits) == null ? void 0 : _l.maxAggregateBoostHz) ?? null,
              maxAggregateCutDb: ((_m = validation.limits) == null ? void 0 : _m.maxAggregateCutDb) ?? null,
              maxAggregateCutHz: ((_n = validation.limits) == null ? void 0 : _n.maxAggregateCutHz) ?? null
            },
            metricsBefore: {
              rspMaxDeviationDb: (currentMetrics == null ? void 0 : currentMetrics.rspMaxDeviationDb) ?? null,
              rspRmsDeviationDb: (currentMetrics == null ? void 0 : currentMetrics.rspRmsDeviationDb) ?? null,
              rspMeanSignedResidualDb: (currentMetrics == null ? void 0 : currentMetrics.rspMeanSignedResidualDb) ?? null,
              worstSeatMaxDeviationDb: (currentMetrics == null ? void 0 : currentMetrics.worstSeatMaxDeviationDb) ?? null
            },
            metricsAfter: null,
            rspImprovementDb: null,
            seatImpact: null,
            accepted: false,
            rejectionReason: null
          };
          if (!validation.filters) {
            const failed = [];
            if (((_o = validation.limits) == null ? void 0 : _o.boostLimitOk) === false) failed.push("aggregate boost exceeded");
            if (((_p = validation.limits) == null ? void 0 : _p.cutLimitOk) === false) failed.push("aggregate cut exceeded");
            if (((_q = validation.limits) == null ? void 0 : _q.sourceDomainHeadroomOk) === false) failed.push("source-domain headroom exceeded");
            trialEntry.rejectionReason = `bank-limited: ${failed.join(", ") || "unknown limit"}`;
            regionBlockReason = regionBlockReason || "bank-limited";
            iterationEntry.trials.push(trialEntry);
            continue;
          }
          regionAdmissible = true;
          const trialMetrics = calculateAllSeatMetrics(seats, validation.filters, assessmentStartHz, assessmentEndHz, anchorDb, operationCounts, memo, { protectedNullRegions, canonicalTargetCurve });
          if (!trialMetrics) {
            trialEntry.rejectionReason = "no metrics computed";
            iterationEntry.trials.push(trialEntry);
            continue;
          }
          trialEntry.metricsAfter = {
            rspMaxDeviationDb: trialMetrics.rspMaxDeviationDb ?? null,
            rspRmsDeviationDb: trialMetrics.rspRmsDeviationDb ?? null,
            rspMeanSignedResidualDb: trialMetrics.rspMeanSignedResidualDb ?? null,
            worstSeatMaxDeviationDb: trialMetrics.worstSeatMaxDeviationDb ?? null
          };
          const centreHz = region.centrePoint.frequency;
          const currentEqAtCentre = filters.reduce((sum, filter) => sum + peakingEqResponseDb(centreHz, filter), 0);
          const trialEqAtCentre = validation.filters.reduce((sum, filter) => sum + peakingEqResponseDb(centreHz, filter), 0);
          const requiredAtCentre = requiredCorrectionDb(region.centrePoint.targetSpl, region.centrePoint.spl);
          const appliedStepAtCentre = trialEqAtCentre - currentEqAtCentre;
          const physicalAction = validatePhysicalEqAction((authority == null ? void 0 : authority.classification) || ((_r = region.authority) == null ? void 0 : _r.classification), appliedStepAtCentre);
          const directionPass = physicalAction.passed && (Math.abs(requiredAtCentre) <= 0.05 || requiredAtCentre * appliedStepAtCentre > 0 || (authority == null ? void 0 : authority.classification) === "Peak" && appliedStepAtCentre < 0);
          trialEntry.actualAction = physicalAction.actualAction;
          const maxImprovementDb = currentMetrics.rspMaxDeviationDb - trialMetrics.rspMaxDeviationDb;
          const rmsImprovementDb = currentMetrics.rspRmsDeviationDb - trialMetrics.rspRmsDeviationDb;
          trialEntry.rspImprovementDb = maxImprovementDb;
          const rmsImproved = rmsImprovementDb > RMS_EPSILON_DB;
          const maxProtected = trialMetrics.rspMaxDeviationDb <= currentMetrics.rspMaxDeviationDb + WORST_EQUIV_DB;
          const isCutTrial = Number((_s = trial.filter) == null ? void 0 : _s.gainDb) < 0;
          const cutInfluenceAccepted = isCutTrial && evaluateCutInfluenceAcceptance(currentMetrics, trialMetrics, protectedNullRegions);
          const objectiveImproved = maxImprovementDb > WORST_EQUIV_DB || maxProtected && rmsImproved || cutInfluenceAccepted;
          if (!directionPass || !cutInfluenceAccepted && (!objectiveImproved || compareHouseCurveMetrics(trialMetrics, currentMetrics) >= 0)) {
            trialEntry.rejectionReason = !directionPass ? physicalAction.reason || "correction direction opposed target-minus-current residual" : !objectiveImproved ? isCutTrial ? "cut did not materially reduce positive residual in influence region" : "neither maximum residual nor weighted RMS improved" : "not strictly better than current";
            iterationEntry.trials.push(trialEntry);
            continue;
          }
          const nearTarget = evaluateNearTargetProtection(baselineRspPoints, trialMetrics.rspResidualPoints, maxImprovementDb, protectedNullRegions);
          if (!nearTarget.passed) {
            operationCounts.nearTargetProtectionRejections++;
            trialEntry.rejectionReason = nearTarget.violations[0].reason;
            trialEntry.nearTargetViolations = nearTarget.violations;
            iterationEntry.trials.push(trialEntry);
            continue;
          }
          const seatTolerance = evaluateSeatRegressionTolerance({
            seatMetrics: trialMetrics.seatMetrics || [],
            baselineSeatMaxDeviations,
            protectedNullRegions,
            isProtectedFrequency: isProtectedSmoothedFrequency,
            rspImprovementDb: maxImprovementDb,
            isCorrectiveCut: region.kind === "peak" && Number((_t = trial.filter) == null ? void 0 : _t.gainDb) < 0,
            protectedNull,
            bankLimits: validation.limits
          });
          trialEntry.seatImpact = {
            worstSeatId: seatTolerance.worstSeatId,
            worstSeatChangeDb: -seatTolerance.worstSeatRegressionDb,
            worstSeatRegressionDb: seatTolerance.worstSeatRegressionDb,
            allowedRegressionDb: seatTolerance.allowedRegressionDb,
            toleranceRaised: seatTolerance.toleranceRaised
          };
          if (!seatTolerance.passed) {
            operationCounts.seatRegressionToleranceRejected++;
            trialEntry.rejectionReason = `seat ${seatTolerance.worstSeatId} worsened ${seatTolerance.worstSeatRegressionDb.toFixed(2)} dB; allowed ${seatTolerance.allowedRegressionDb.toFixed(2)} dB`;
            iterationEntry.trials.push(trialEntry);
            continue;
          }
          if (seatTolerance.toleranceRaised && seatTolerance.worstSeatRegressionDb > 0.5) {
            operationCounts.seatRegressionToleranceAccepted++;
            trialEntry.acceptedAfterSeatToleranceAdjustment = true;
          }
          trialEntry.accepted = true;
          trialEntry.acceptanceReason = cutInfluenceAccepted ? "cut materially reduced positive residual in influence region" : maxImprovementDb > WORST_EQUIV_DB ? "reduced maximum absolute RSP residual" : "held maximum residual while reducing RSP RMS";
          iterationEntry.trials.push(trialEntry);
          const acousticComparison = bestTrial ? compareHouseCurveMetrics(trialMetrics, bestTrialMetrics) : -1;
          const cutPreferable = cutInfluenceAccepted && bestTrial && Math.abs(trialMetrics.rspMaxDeviationDb - bestTrialMetrics.rspMaxDeviationDb) <= 0.1 && trialMetrics.rspRmsDeviationDb < bestTrialMetrics.rspRmsDeviationDb - RMS_EPSILON_DB;
          if (!bestTrial || acousticComparison < 0 || cutPreferable) {
            bestTrial = trial;
            bestTrialMetrics = trialMetrics;
            bestTrialFilters = validation.filters;
            bestTrialTraceIndex = iterationEntry.trials.length - 1;
          }
        }
        if (!regionAdmissible && region.severityDb > 2 && regionBlockReason) {
          const alreadyBlocked = blockedResiduals.some((b) => b.seatId === region.seatId && Math.abs(b.frequency - region.centrePoint.frequency) < 2);
          if (!alreadyBlocked) {
            const requiredCorrectionDb2 = region.kind === "peak" ? -region.severityDb * 0.85 : region.severityDb * 0.75;
            blockedResiduals.push({
              seatId: region.seatId,
              frequency: region.centrePoint.frequency,
              signedDeviationDb: region.centrePoint.deviationDb,
              requiredCorrectionDb: requiredCorrectionDb2,
              permittedCorrectionDb: correctionUnavailable ? 0 : null,
              blockingReason: regionBlockReason
            });
          }
        }
      }
      iterationEntry.bestTrialIndex = bestTrialTraceIndex;
      trace2.push(iterationEntry);
      if (!bestTrial) {
        stopReason = "no admissible improvement from any region";
        break;
      }
      filters = bestTrialFilters;
      currentMetrics = bestTrialMetrics;
      if (bestTrial.action === "merge") operationCounts.mergedFilterOperations++;
      if (["replace", "refit", "revise", "reviseQ"].includes(bestTrial.action)) operationCounts.replacedFilterOperations++;
      operations++;
    }
    if (operations >= maxOperations && stopReason === "no safe improvement remained") stopReason = "operation ceiling reached";
    return {
      filters,
      metrics: currentMetrics,
      baselineWorstSeatDeviation,
      baselineRspMinimumSplDb,
      finalRspMinimumSplDb: rspMinimumInBand(currentMetrics),
      blockedResiduals,
      stopReason,
      bankEvalCount,
      operations,
      operationCounts,
      trace: trace2,
      baselineRspMetrics,
      seatRegressionToleranceDiagnostics: {
        baselineToleranceDb: 0.5,
        materialImprovementToleranceDb: 1,
        majorImprovementToleranceDb: 1.5,
        materialImprovementThresholdDb: 3,
        majorImprovementThresholdDb: 5,
        acceptedAfterAdjustment: operationCounts.seatRegressionToleranceAccepted,
        rejectedBeyondTolerance: operationCounts.seatRegressionToleranceRejected
      }
    };
  }
  const Q_VALUES = [6, 8, 10];
  const BROAD_VALLEY_MAX_Q = 4;
  const GAIN_SCALES = [0.25, 0.5, 0.75, 1];
  const PROTECTED_EDGE_GUARD_OCTAVES = 1 / 24;
  function boostWouldSpillIntoProtectedNull(frequency, protectedNullRegions) {
    return (protectedNullRegions || []).some((region) => frequency >= region.startHz / 2 ** PROTECTED_EDGE_GUARD_OCTAVES && frequency <= region.endHz * 2 ** PROTECTED_EDGE_GUARD_OCTAVES);
  }
  function broadValleyQValues(points, valley) {
    const centreIndex = points.findIndex((point) => point.frequency === (valley == null ? void 0 : valley.frequency));
    if (centreIndex <= 0 || centreIndex >= points.length - 1) return { qValues: Q_VALUES, region: null };
    const halfOctave = 2 ** 0.5;
    const leftPeak = points.filter((point) => point.frequency >= valley.frequency / halfOctave && point.frequency < valley.frequency).reduce((best, point) => !best || point.deviationDb > best.deviationDb ? point : best, null);
    const rightPeak = points.filter((point) => point.frequency > valley.frequency && point.frequency <= valley.frequency * halfOctave).reduce((best, point) => !best || point.deviationDb > best.deviationDb ? point : best, null);
    const hasMaterialShoulders = leftPeak && rightPeak && leftPeak.deviationDb >= valley.deviationDb + 2 && rightPeak.deviationDb >= valley.deviationDb + 2;
    if (!hasMaterialShoulders || rightPeak.frequency <= leftPeak.frequency) return { qValues: Q_VALUES, region: null };
    const widthOctaves = Math.log2(rightPeak.frequency / leftPeak.frequency);
    if (widthOctaves < 1 / 3) return { qValues: Q_VALUES, region: null };
    const baseQ = Math.max(0.5, Math.min(
      BROAD_VALLEY_MAX_Q,
      valley.frequency / Math.max(1, rightPeak.frequency - leftPeak.frequency)
    ));
    const qValues = [...new Set([baseQ * 0.65, baseQ, Math.min(BROAD_VALLEY_MAX_Q, baseQ * 1.25)].map((value) => Number(Math.max(0.5, Math.min(BROAD_VALLEY_MAX_Q, value)).toFixed(4))))];
    return {
      qValues,
      region: { startHz: leftPeak.frequency, endHz: rightPeak.frequency, widthOctaves }
    };
  }
  function realSeatsRemainConstrained(baseline, after, protectedNullRegions) {
    const beforeById = new Map(((baseline == null ? void 0 : baseline.seatMetrics) || []).map((metric) => [metric.seatId, metric]));
    return ((after == null ? void 0 : after.seatMetrics) || []).every((metric) => {
      if (metric.seatId === "rsp") return true;
      const baseline2 = beforeById.get(metric.seatId);
      if (!baseline2) return true;
      const scored = (metric.residualPoints || []).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
      const candidateMax = scored.length ? Math.max(...scored.map((point) => Math.abs(point.deviationDb))) : metric.maxAbsDeviationDb;
      const baselineScored = (baseline2.residualPoints || []).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
      const baselineMax = baselineScored.length ? Math.max(...baselineScored.map((point) => Math.abs(point.deviationDb))) : baseline2.maxAbsDeviationDb;
      return candidateMax <= baselineMax + 0.5;
    });
  }
  function refineOpposingResidualPair({ filters, metrics, seatBaselineMetrics, seats, bankRaw, fitStartHz, fitEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile, protectedNullRegions, canonicalTargetCurve, evaluationMemo = null, preparedBankValidation = null, operationCounts = null }) {
    const points = ((metrics == null ? void 0 : metrics.rspResidualPoints) || []).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
    const peak = points.filter((point) => point.deviationDb > 0).sort((a, b) => b.deviationDb - a.deviationDb)[0];
    const valley = points.filter((point) => point.deviationDb < 0).sort((a, b) => a.deviationDb - b.deviationDb)[0];
    const enabledFilterCount = filters.filter((filter) => filter.enabled).length;
    if (!peak || !valley) return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: null, limitation: "no opposing correctable residual pair remained" };
    if (boostWouldSpillIntoProtectedNull(valley.frequency, protectedNullRegions)) {
      return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: { valleyFrequencyHz: valley.frequency }, limitation: "valley boost rejected because its filter would spill into a protected cancellation region" };
    }
    const replacementPairs = [];
    if (enabledFilterCount > 8) {
      const replaceable = filters.map((filter, index) => ({
        filter,
        index,
        activity: Math.abs(filter.gainDb || 0),
        outsideAssessment: filter.frequencyHz > fitEndHz
      })).filter((entry) => entry.filter.enabled && entry.filter.frequencyHz >= Math.max(40, Number(usableLfHz || 20) * 1.25)).sort((left, right) => Number(right.outsideAssessment) - Number(left.outsideAssessment) || left.activity - right.activity).slice(0, 4);
      for (let left = 0; left < replaceable.length; left++) {
        for (let right = left + 1; right < replaceable.length; right++) {
          replacementPairs.push([replaceable[left], replaceable[right]]);
        }
      }
      if (!replacementPairs.length) {
        return {
          filters,
          metrics,
          changed: false,
          bankEvaluationCount: 0,
          diagnostic: { peakFrequencyHz: peak.frequency, valleyFrequencyHz: valley.frequency },
          limitation: "ten-filter ceiling had no safe pair of non-low-frequency slots to repurpose"
        };
      }
    }
    const fittingToleranceDb = Number.isFinite(profile == null ? void 0 : profile.fittingToleranceDb) ? profile.fittingToleranceDb : 1;
    if (Math.max(peak.deviationDb, Math.abs(valley.deviationDb)) <= fittingToleranceDb) {
      return { filters, metrics, changed: false, bankEvaluationCount: 0, diagnostic: null, limitation: `fit residual already within ${fittingToleranceDb} dB` };
    }
    let bestFilters = filters;
    let bestMetrics = metrics;
    let bankEvaluationCount = 0;
    const boostRegion = broadValleyQValues(points, valley);
    for (const cutQ of Q_VALUES) for (const boostQ of boostRegion.qValues) {
      for (const cutScale of GAIN_SCALES) for (const boostScale of GAIN_SCALES) {
        const cut = {
          band: filters.length + 1,
          enabled: true,
          type: "Peak",
          frequencyHz: peak.frequency,
          gainDb: -Math.min(15, peak.deviationDb * cutScale),
          Q: cutQ,
          reason: "Joint refinement of opposing correctable residuals"
        };
        const requestedBoost = {
          band: filters.length + 2,
          enabled: true,
          type: "Peak",
          frequencyHz: valley.frequency,
          gainDb: Math.min(6, Math.abs(valley.deviationDb) * boostScale),
          Q: boostQ,
          ...boostRegion.region || {},
          reason: boostRegion.region ? "Joint broad-valley refinement of opposing correctable residuals" : "Joint refinement of opposing correctable residuals"
        };
        const boost = limitBoostForCapability(requestedBoost, activeSubs, usableLfHz, requestedSystemOutputDb);
        if (boost.gainDb <= 0.1) continue;
        const proposedBanks2 = enabledFilterCount <= 8 ? [[...filters, cut, boost]] : replacementPairs.map(([cutSlot, boostSlot]) => filters.map((filter, index) => {
          if (index === cutSlot.index) return {
            ...cut,
            band: filter.band,
            reason: "Joint refinement: repurposed weak slot for residual peak cut"
          };
          if (index === boostSlot.index) return {
            ...boost,
            band: filter.band,
            reason: boostRegion.region ? "Joint broad-valley refinement: repurposed weak slot for residual boost" : "Joint refinement: repurposed weak slot for residual boost"
          };
          return { ...filter };
        }));
        for (const proposed of proposedBanks2) {
          const limits = preparedBankValidation ? evaluatePreparedBankLimits(preparedBankValidation, proposed, profile, operationCounts) : evaluateProvisionalBankLimits(proposed, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
          bankEvaluationCount++;
          if (!limits.allOk) continue;
          const candidateMetrics = calculateAllSeatMetrics(
            seats,
            proposed,
            fitStartHz,
            fitEndHz,
            anchorDb,
            operationCounts,
            evaluationMemo,
            { protectedNullRegions, canonicalTargetCurve }
          );
          if (!candidateMetrics) continue;
          if (!realSeatsRemainConstrained(seatBaselineMetrics, candidateMetrics, protectedNullRegions)) continue;
          const maxImprovementDb = bestMetrics.rspMaxDeviationDb - candidateMetrics.rspMaxDeviationDb;
          const rmsImprovementDb = bestMetrics.rspRmsDeviationDb - candidateMetrics.rspRmsDeviationDb;
          if (maxImprovementDb + 0.35 * rmsImprovementDb <= 0.01) continue;
          const maxImproved = maxImprovementDb > 0.05;
          const rmsImproved = rmsImprovementDb > 0.01;
          const maxNotWorse = candidateMetrics.rspMaxDeviationDb <= bestMetrics.rspMaxDeviationDb + 0.05;
          const rmsNotWorse = candidateMetrics.rspRmsDeviationDb <= bestMetrics.rspRmsDeviationDb + 0.01;
          if (!(maxImproved && rmsNotWorse || rmsImproved && maxNotWorse)) continue;
          if (compareHouseCurveMetrics(candidateMetrics, bestMetrics) < 0) {
            bestFilters = proposed;
            bestMetrics = candidateMetrics;
          }
        }
      }
    }
    return {
      filters: bestFilters,
      metrics: bestMetrics,
      changed: bestFilters !== filters,
      bankEvaluationCount,
      limitation: bestFilters === filters ? "no legal pair improved the 20–200 Hz maximum or RMS within equivalence tolerances" : null,
      diagnostic: {
        peakFrequencyHz: peak.frequency,
        peakResidualDb: peak.deviationDb,
        valleyFrequencyHz: valley.frequency,
        valleyResidualDb: valley.deviationDb,
        valleyRegion: boostRegion.region,
        boostQValues: boostRegion.qValues,
        replacementPairCount: replacementPairs.length,
        repurposedExistingSlots: enabledFilterCount > 8
      }
    };
  }
  const MAX_FILTERS$1 = 10;
  const MAX_Q = 10;
  const MAX_PROTECTED_NULL_WORSENING_DB = 2;
  const RESIDUAL_THRESHOLD_DB = 1;
  const EPSILON_DB = 0.05;
  const CUT_PEAK_REDUCTION_DB = 0.5;
  const CUT_RMS_IMPROVEMENT_DB = 0.05;
  const CUT_SEAT_WORSENING_DB = 1;
  const clamp$1 = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  function targetAt$1(frequency, anchorDb, canonicalTargetCurve) {
    return interpolateCanonicalTarget(canonicalTargetCurve, frequency) ?? anchorDb + artcousticHouseCurveOffsetAt(frequency);
  }
  function correctionAt$1(frequency, filters) {
    return filters.reduce((sum, filter) => sum + peakingEqResponseDb(frequency, filter), 0);
  }
  function correctedSeats(perSeatRawCurves, filters) {
    return (perSeatRawCurves || []).filter((seat) => (seat == null ? void 0 : seat.seatId) && seat.seatId !== "rsp" && !seat.__isSyntheticRsp && Array.isArray(seat.responseData)).map((seat) => ({
      seatId: seat.seatId,
      responseData: normaliseCurve(seat.responseData).map((point) => ({
        frequency: point.frequency,
        spl: point.spl + correctionAt$1(point.frequency, filters)
      }))
    }));
  }
  function rawResidualPoints(raw, filters, startHz, endHz, anchorDb, canonicalTargetCurve) {
    return raw.filter((point) => point.frequency >= startHz && point.frequency <= endHz).map((point) => {
      const targetSpl = targetAt$1(point.frequency, anchorDb, canonicalTargetCurve);
      const aggregateCorrectionDb = correctionAt$1(point.frequency, filters);
      return {
        frequency: point.frequency,
        rawSpl: point.spl,
        targetSpl,
        aggregateCorrectionDb,
        postEqSpl: point.spl + aggregateCorrectionDb,
        residualDb: point.spl + aggregateCorrectionDb - targetSpl
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
      const startHz = current[0].frequency;
      const endHz = current.at(-1).frequency;
      regions.push({
        kind: centre.residualDb > 0 ? "peak" : "valley",
        startHz,
        endHz,
        widthOctaves: startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0,
        centre,
        protectedNullOverlap: currentProtected
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
  function quality$2(points, protectedNullRegions) {
    const scored = points.filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
    if (!scored.length) return { maximumAbsoluteResidualDb: null, rmsResidualDb: null };
    return {
      maximumAbsoluteResidualDb: Math.max(...scored.map((point) => Math.abs(point.residualDb))),
      rmsResidualDb: Math.sqrt(scored.reduce((sum, point) => sum + point.residualDb ** 2, 0) / scored.length)
    };
  }
  function overlappingFilters(frequency, filters) {
    return filters.map((filter, index) => ({
      index,
      band: filter.band,
      frequencyHz: filter.frequencyHz,
      gainDb: filter.gainDb,
      Q: filter.Q,
      contributionDb: peakingEqResponseDb(frequency, filter)
    })).filter((filter) => Math.abs(filter.contributionDb) >= 0.01);
  }
  function protectedNullWorsening(currentFilters, candidateFilters, protectedNullRegions) {
    return (protectedNullRegions || []).reduce((worst, region) => {
      const frequency = region.centreFrequencyHz;
      if (!Number.isFinite(frequency)) return worst;
      const incrementalCorrection = correctionAt$1(frequency, candidateFilters) - correctionAt$1(frequency, currentFilters);
      return Math.max(worst, Math.max(0, -incrementalCorrection));
    }, 0);
  }
  function proposedBanks(region, filters, activeSubs, usableLfHz, requestedSystemOutputDb, protectedNullRegions) {
    const requiredDb = -region.centre.residualDb;
    const authority = classifyEqCorrectionRegion({
      frequency: region.centre.frequency,
      rawSpl: region.centre.rawSpl,
      currentSpl: region.centre.postEqSpl,
      targetSpl: region.centre.targetSpl,
      protectedNull: region.protectedNullOverlap,
      requestedGainDb: requiredDb
    });
    if (!validatePhysicalEqAction(authority.classification, requiredDb).passed) return [];
    const boostSpillsIntoProtectedNull = requiredDb > 0 && (protectedNullRegions || []).some((protectedRegion) => region.centre.frequency >= protectedRegion.startHz / 2 ** (1 / 24) && region.centre.frequency <= protectedRegion.endHz * 2 ** (1 / 24));
    if (boostSpillsIntoProtectedNull) return [];
    const isCut = requiredDb < 0;
    const requestedDb = isCut ? Math.max(-15, requiredDb) : Math.min(6, requiredDb);
    const gains = [1, 0.9, 0.75, 0.5, 0.25];
    const isBroadValley = !isCut && Number.isFinite(region.widthOctaves) && region.widthOctaves >= 1 / 3;
    const regionBandwidthHz = Math.max(1, region.endHz - region.startHz);
    const baseRegionQ = clamp$1(region.centre.frequency / regionBandwidthHz, 0.5, 10);
    const qValues = isBroadValley ? [...new Set([baseRegionQ * 0.65, baseRegionQ, Math.min(4, baseRegionQ * 1.25)].map((value) => Number(clamp$1(value, 0.5, 4).toFixed(4))))] : [10, 8, 6, 5, 4, 3, 2];
    const trials = [];
    const targetFilters = [];
    for (const gainScale of gains) for (const Q of qValues) {
      let filter = {
        band: filters.length + 1,
        enabled: true,
        type: "Peak",
        frequencyHz: region.centre.frequency,
        gainDb: requestedDb * gainScale,
        Q,
        reason: isBroadValley ? "Professional broad-valley residual correction" : "Professional high-resolution residual cleanup",
        widthOctaves: region.widthOctaves
      };
      if (filter.gainDb > 0) {
        const halfWidth = region.centre.frequency / (2 * Q);
        filter = limitBoostForCapability({ ...filter, startHz: filter.frequencyHz - halfWidth, endHz: filter.frequencyHz + halfWidth }, activeSubs, usableLfHz, requestedSystemOutputDb);
      }
      if (Math.abs(filter.gainDb) > 0.1) targetFilters.push(filter);
    }
    if (filters.length < MAX_FILTERS$1) {
      for (const filter of targetFilters) {
        if (isNearDuplicate(filter, filters) || countSameSignFiltersInRegion(filter, filters) >= 3) continue;
        trials.push({ action: "append", changedFilterIndex: filters.length, filter, filters: [...filters, filter] });
      }
    }
    const replaceableIndexes = filters.map((filter, index) => ({ filter, index, activity: Math.abs(filter.gainDb || 0) })).filter((entry) => entry.activity <= 3.5).sort((left, right) => left.activity - right.activity).slice(0, 4).map((entry) => entry.index);
    for (const replacementIndex of replaceableIndexes) {
      const withoutReplaced = filters.filter((_, index) => index !== replacementIndex);
      for (const targetFilter of targetFilters) {
        const filter = {
          ...targetFilter,
          band: filters[replacementIndex].band,
          reason: isBroadValley ? "Professional broad-valley filter-slot replacement" : "Professional high-resolution filter-slot replacement"
        };
        if (isNearDuplicate(filter, withoutReplaced) || countSameSignFiltersInRegion(filter, withoutReplaced) >= 3) continue;
        const next = filters.map((candidate, index) => index === replacementIndex ? filter : candidate);
        trials.push({ action: "replace", changedFilterIndex: replacementIndex, filter, filters: next });
      }
    }
    overlappingFilters(region.centre.frequency, filters).filter((overlap) => Math.abs(Math.log2(region.centre.frequency / overlap.frequencyHz)) <= 1 / 3).forEach((overlap) => {
      const existing = filters[overlap.index];
      const frequencyCandidates = [existing.frequencyHz, region.centre.frequency];
      const refinementQValues = isBroadValley ? qValues : [MAX_Q, existing.Q];
      for (const frequencyHz of frequencyCandidates) for (const gainScale of gains) for (const Q of refinementQValues) {
        const gainDb = clamp$1(existing.gainDb + requiredDb * gainScale, -15, 6);
        const unchanged = Math.abs(gainDb - existing.gainDb) <= 0.05 && Math.abs(frequencyHz - existing.frequencyHz) <= 0.01 && Q === existing.Q;
        if (unchanged) continue;
        const filter = { ...existing, frequencyHz, gainDb, Q: clamp$1(Q, 0.5, MAX_Q), reason: "Professional high-resolution gain/frequency refinement" };
        const next = filters.map((candidate, index) => index === overlap.index ? filter : candidate);
        trials.push({ action: "revise", changedFilterIndex: overlap.index, filter, filters: next });
      }
    });
    const unique = /* @__PURE__ */ new Map();
    trials.forEach((trial) => {
      const key = trial.filters.map((filter) => `${filter.frequencyHz}:${filter.gainDb.toFixed(4)}:${filter.Q}`).join("|");
      if (!unique.has(key)) unique.set(key, trial);
    });
    return [...unique.values()];
  }
  function priorDisposition(region, priorIterationTrace) {
    const entries = (priorIterationTrace || []).flatMap((iteration) => {
      const discovered = (iteration.regions || []).some((candidate) => Math.abs(Math.log2(candidate.centreFrequencyHz / region.centre.frequency)) <= 1 / 24);
      return (iteration.trials || []).filter((trial) => Math.abs(Math.log2(trial.regionCentreHz / region.centre.frequency)) <= 1 / 24).map((trial) => ({ discovered, accepted: !!trial.accepted, rejectionReason: trial.rejectionReason }));
    });
    if (!entries.length) return {
      discovered: false,
      disposition: "not-discovered-on-1/3-octave-scoring-grid",
      rejectionReasons: []
    };
    return {
      discovered: entries.some((entry) => entry.discovered),
      disposition: entries.some((entry) => entry.accepted) ? "accepted-by-primary-fit" : "all-primary-fit-trials-rejected",
      rejectionReasons: entries.filter((entry) => !entry.accepted).map((entry) => entry.rejectionReason).filter(Boolean)
    };
  }
  function worstSeatDeviationWorsening(currentFilters, candidateFilters, perSeatRawCurves, anchorDb, canonicalTargetCurve, startHz, endHz, protectedNullRegions) {
    const currentSeats = correctedSeats(perSeatRawCurves, currentFilters);
    const candidateSeats = correctedSeats(perSeatRawCurves, candidateFilters);
    let worstWorseningDb = 0;
    for (let i = 0; i < currentSeats.length; i++) {
      const currentSeat = currentSeats[i];
      const candidateSeat = candidateSeats[i];
      if (!currentSeat || !candidateSeat) continue;
      let currentMaxDev = 0;
      let candidateMaxDev = 0;
      for (const point of currentSeat.responseData) {
        if (point.frequency < startHz || point.frequency > endHz) continue;
        if (isProtectedFrequency(point.frequency, protectedNullRegions)) continue;
        const dev = Math.abs(point.spl - targetAt$1(point.frequency, anchorDb, canonicalTargetCurve));
        if (dev > currentMaxDev) currentMaxDev = dev;
      }
      for (const point of candidateSeat.responseData) {
        if (point.frequency < startHz || point.frequency > endHz) continue;
        if (isProtectedFrequency(point.frequency, protectedNullRegions)) continue;
        const dev = Math.abs(point.spl - targetAt$1(point.frequency, anchorDb, canonicalTargetCurve));
        if (dev > candidateMaxDev) candidateMaxDev = dev;
      }
      const worsening = candidateMaxDev - currentMaxDev;
      if (worsening > worstWorseningDb) worstWorseningDb = worsening;
    }
    return worstWorseningDb;
  }
  function rejectionForTrial({
    trial,
    currentFilters,
    currentPoints,
    currentQuality,
    raw,
    perSeatRawCurves,
    region,
    protectedNullRegions,
    canonicalTargetCurve,
    anchorDb,
    assessmentStartHz,
    assessmentEndHz,
    correctionStartHz,
    correctionEndHz,
    activeSubs,
    usableLfHz,
    requestedSystemOutputDb,
    profile,
    preparedBankValidation = null,
    operationCounts = null
  }) {
    if (trial.filters.filter((filter) => filter.enabled).length > MAX_FILTERS$1) return { reason: "filter-count-limit: more than ten enabled filters" };
    if (trial.filter.Q > MAX_Q || trial.filter.Q < 0.5) return { reason: `filter-Q-limit: Q ${trial.filter.Q} is outside 0.5–${MAX_Q}` };
    const limits = preparedBankValidation ? evaluatePreparedBankLimits(preparedBankValidation, trial.filters, profile, operationCounts) : evaluateProvisionalBankLimits(trial.filters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
    if (!limits.allOk) {
      const failures = [];
      if (!limits.cutLimitOk) failures.push(`aggregate cut ${limits.maxAggregateCutDb.toFixed(3)} dB exceeds −15 dB`);
      if (!limits.boostLimitOk) failures.push(`aggregate boost ${limits.maxAggregateBoostDb.toFixed(3)} dB exceeds +6 dB`);
      return { reason: `bank-limit: ${failures.join("; ")}`, limits };
    }
    const nullWorseningDb = protectedNullWorsening(currentFilters, trial.filters, protectedNullRegions);
    if (nullWorseningDb > MAX_PROTECTED_NULL_WORSENING_DB + EPSILON_DB) {
      return { reason: `protected-null-overlap: predicted worsening ${nullWorseningDb.toFixed(3)} dB exceeds ${MAX_PROTECTED_NULL_WORSENING_DB.toFixed(1)} dB`, limits, nullWorseningDb };
    }
    const candidatePoints = rawResidualPoints(raw, trial.filters, correctionStartHz, correctionEndHz, anchorDb, canonicalTargetCurve);
    const candidateCentre = candidatePoints.reduce((nearest, point) => Math.abs(point.frequency - region.centre.frequency) < Math.abs(nearest.frequency - region.centre.frequency) ? point : nearest);
    const localImprovementDb = Math.abs(region.centre.residualDb) - Math.abs(candidateCentre.residualDb);
    if (localImprovementDb <= EPSILON_DB) return { reason: "local-fit: attempted correction did not reduce the centre residual", limits, nullWorseningDb, candidateCentre };
    const candidateQuality = quality$2(candidatePoints, protectedNullRegions);
    const incrementalCorrectionDb = correctionAt$1(region.centre.frequency, trial.filters) - correctionAt$1(region.centre.frequency, currentFilters);
    const isCutTrial = incrementalCorrectionDb < -EPSILON_DB;
    if (isCutTrial) {
      const INFLUENCE_THRESHOLD_DB = 0.25;
      const influenceIndices = [];
      for (let i = 0; i < candidatePoints.length; i++) {
        const freq = candidatePoints[i].frequency;
        const change = correctionAt$1(freq, trial.filters) - correctionAt$1(freq, currentFilters);
        if (Math.abs(change) >= INFLUENCE_THRESHOLD_DB) influenceIndices.push(i);
      }
      const influenceCurrent = influenceIndices.map((i) => currentPoints[i]).filter(Boolean);
      const influenceCandidate = influenceIndices.map((i) => candidatePoints[i]).filter(Boolean);
      const currentPositiveArea = influenceCurrent.reduce((s, p) => s + Math.max(0, p.residualDb), 0);
      const candidatePositiveArea = influenceCandidate.reduce((s, p) => s + Math.max(0, p.residualDb), 0);
      if (candidatePositiveArea >= currentPositiveArea - EPSILON_DB) {
        return { reason: "cut-area: positive residual area did not reduce within influence region", limits, nullWorseningDb, candidateCentre, candidateQuality };
      }
      const currentMaxPositive = Math.max(0, ...influenceCurrent.map((p) => p.residualDb));
      const candidateMaxPositive = Math.max(0, ...influenceCandidate.map((p) => p.residualDb));
      if (currentMaxPositive - candidateMaxPositive < CUT_PEAK_REDUCTION_DB - EPSILON_DB) {
        return { reason: `cut-peak: maximum positive residual did not reduce by ${CUT_PEAK_REDUCTION_DB} dB within influence region`, limits, nullWorseningDb, candidateCentre, candidateQuality };
      }
      const badPoint = candidatePoints.find((point, index) => {
        const before = currentPoints[index];
        if (!before || isProtectedFrequency(point.frequency, protectedNullRegions)) return false;
        const wasAboveMinus3 = before.residualDb >= -3;
        const isNowBelowMinus3 = point.residualDb < -3;
        if (wasAboveMinus3 && isNowBelowMinus3) return true;
        if (!wasAboveMinus3 && before.residualDb - point.residualDb > CUT_SEAT_WORSENING_DB + EPSILON_DB) return true;
        return false;
      });
      if (badPoint) {
        return { reason: `cut-below: ${badPoint.frequency.toFixed(2)} Hz moved below −3 dB or worsened beyond 0.50 dB`, limits, nullWorseningDb, candidateCentre, candidateQuality };
      }
      if (currentQuality.rmsResidualDb - candidateQuality.rmsResidualDb < CUT_RMS_IMPROVEMENT_DB - EPSILON_DB) {
        return { reason: `cut-rms: overall RMS target error did not improve by at least ${CUT_RMS_IMPROVEMENT_DB} dB`, limits, nullWorseningDb, candidateCentre, candidateQuality };
      }
      const seatWorseningDb = worstSeatDeviationWorsening(
        currentFilters,
        trial.filters,
        perSeatRawCurves,
        anchorDb,
        canonicalTargetCurve,
        correctionStartHz,
        correctionEndHz,
        protectedNullRegions
      );
      if (seatWorseningDb > CUT_SEAT_WORSENING_DB + EPSILON_DB) {
        return { reason: `cut-seat: worst-seat maximum deviation worsened by ${seatWorseningDb.toFixed(2)} dB`, limits, nullWorseningDb, candidateCentre, candidateQuality };
      }
      return { accepted: true, reason: null, limits, nullWorseningDb, candidateCentre, candidateQuality, localImprovementDb };
    }
    const materiallyWorsenedPoint = candidatePoints.find((point, index) => {
      const before = currentPoints[index];
      return before && !isProtectedFrequency(point.frequency, protectedNullRegions) && Math.abs(point.residualDb) > Math.abs(before.residualDb) + 0.5;
    });
    if (materiallyWorsenedPoint) {
      return { reason: `high-resolution-score: ${materiallyWorsenedPoint.frequency.toFixed(2)} Hz worsened by more than 0.50 dB`, limits, nullWorseningDb };
    }
    if (candidateQuality.maximumAbsoluteResidualDb > currentQuality.maximumAbsoluteResidualDb + 0.25) {
      return { reason: "high-resolution-score: maximum correctable residual worsened by more than 0.25 dB", limits, nullWorseningDb, candidateCentre, candidateQuality };
    }
    if (candidateQuality.rmsResidualDb > currentQuality.rmsResidualDb + 0.1) {
      return { reason: "high-resolution-score: correctable RMS worsened by more than 0.10 dB", limits, nullWorseningDb, candidateCentre, candidateQuality };
    }
    return { accepted: true, reason: null, limits, nullWorseningDb, candidateCentre, candidateQuality, localImprovementDb };
  }
  function runProfessionalResidualCleanup({
    filters = [],
    rawCurve = [],
    perSeatRawCurves = [],
    anchorDb = 0,
    canonicalTargetCurve = [],
    protectedNullRegions = [],
    activeSubs = [],
    usableLfHz,
    requestedSystemOutputDb,
    assessmentStartHz = 20,
    assessmentEndHz = 120,
    correctionStartHz = 20,
    correctionEndHz = 200,
    profile = { maximumCutDb: 15, maximumAggregateBoostDb: 6 },
    priorIterationTrace = [],
    cleanupPass = 0,
    preparedBankValidation = null,
    operationCounts = null
  }) {
    var _a, _b, _c, _d, _e;
    const raw = normaliseCurve(rawCurve);
    let selectedFilters = filters.filter((filter) => filter == null ? void 0 : filter.enabled).map((filter) => ({ ...filter }));
    let bankEvaluationCount = 0;
    let acceptedOperationCount = 0;
    const diagnostics = [];
    const initialPoints = rawResidualPoints(raw, selectedFilters, correctionStartHz, correctionEndHz, anchorDb, canonicalTargetCurve);
    const initialRegions = residualRegions(initialPoints, protectedNullRegions);
    for (const initialRegion of initialRegions) {
      const currentPoints = rawResidualPoints(raw, selectedFilters, correctionStartHz, correctionEndHz, anchorDb, canonicalTargetCurve);
      const nearest = currentPoints.reduce((best, point) => Math.abs(point.frequency - initialRegion.centre.frequency) < Math.abs(best.frequency - initialRegion.centre.frequency) ? point : best);
      const region = { ...initialRegion, centre: nearest };
      const limitsBefore = preparedBankValidation ? evaluatePreparedBankLimits(preparedBankValidation, selectedFilters, profile, operationCounts) : evaluateProvisionalBankLimits(selectedFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
      bankEvaluationCount++;
      const permittedBoostDb = 6;
      const diagnostic = {
        kind: region.kind,
        classification: classifyEqCorrectionRegion({
          frequency: region.centre.frequency,
          rawSpl: region.centre.rawSpl,
          currentSpl: region.centre.postEqSpl,
          targetSpl: region.centre.targetSpl,
          protectedNull: region.protectedNullOverlap,
          requestedGainDb: -region.centre.residualDb
        }).classification,
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
        permittedTotalBoostDb: permittedBoostDb,
        protectedNullOverlap: region.protectedNullOverlap,
        priorFit: priorDisposition(region, priorIterationTrace),
        candidateSelectionMismatch: false,
        attempts: [],
        acceptedAttempt: null
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
      const currentQuality = quality$2(currentPoints, protectedNullRegions);
      let accepted = [];
      for (const trial of proposedBanks(region, selectedFilters, activeSubs, usableLfHz, requestedSystemOutputDb, protectedNullRegions)) {
        const outcome = rejectionForTrial({
          trial,
          currentFilters: selectedFilters,
          currentPoints,
          currentQuality,
          raw,
          perSeatRawCurves,
          region,
          protectedNullRegions,
          canonicalTargetCurve,
          anchorDb,
          assessmentStartHz,
          assessmentEndHz,
          correctionStartHz,
          correctionEndHz,
          activeSubs,
          usableLfHz,
          requestedSystemOutputDb,
          profile,
          preparedBankValidation,
          operationCounts
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
          aggregateCutDb: ((_a = outcome.limits) == null ? void 0 : _a.maxAggregateCutDb) ?? null,
          aggregateBoostDb: ((_b = outcome.limits) == null ? void 0 : _b.maxAggregateBoostDb) ?? null,
          predictedProtectedNullWorseningDb: outcome.nullWorseningDb ?? null,
          predictedCentreResidualDb: ((_c = outcome.candidateCentre) == null ? void 0 : _c.residualDb) ?? null,
          predictedCorrectableMaximumDb: ((_d = outcome.candidateQuality) == null ? void 0 : _d.maximumAbsoluteResidualDb) ?? null,
          predictedCorrectableRmsDb: ((_e = outcome.candidateQuality) == null ? void 0 : _e.rmsResidualDb) ?? null
        };
        diagnostic.attempts.push(attempt);
        if (outcome.accepted) accepted.push({ trial, outcome, attempt });
      }
      accepted.sort((left, right) => left.outcome.candidateQuality.maximumAbsoluteResidualDb - right.outcome.candidateQuality.maximumAbsoluteResidualDb || left.outcome.candidateQuality.rmsResidualDb - right.outcome.candidateQuality.rmsResidualDb || Math.abs(left.outcome.candidateCentre.residualDb) - Math.abs(right.outcome.candidateCentre.residualDb) || left.trial.filters.length - right.trial.filters.length || left.trial.filter.Q - right.trial.filter.Q);
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
    const finalLimits = preparedBankValidation ? evaluatePreparedBankLimits(preparedBankValidation, selectedFilters, profile, operationCounts) : evaluateProvisionalBankLimits(selectedFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
    bankEvaluationCount++;
    const finalPoints = rawResidualPoints(raw, selectedFilters, correctionStartHz, correctionEndHz, anchorDb, canonicalTargetCurve);
    if (acceptedOperationCount > 0 && cleanupPass < 4) {
      const nextPass = runProfessionalResidualCleanup({
        filters: selectedFilters,
        rawCurve: raw,
        perSeatRawCurves,
        anchorDb,
        canonicalTargetCurve,
        protectedNullRegions,
        activeSubs,
        usableLfHz,
        requestedSystemOutputDb,
        assessmentStartHz,
        assessmentEndHz,
        correctionStartHz,
        correctionEndHz,
        profile,
        priorIterationTrace,
        cleanupPass: cleanupPass + 1,
        preparedBankValidation,
        operationCounts
      });
      return {
        ...nextPass,
        diagnostics: [...diagnostics, ...nextPass.diagnostics],
        changed: true,
        acceptedOperationCount: acceptedOperationCount + nextPass.acceptedOperationCount,
        bankEvaluationCount: bankEvaluationCount + nextPass.bankEvaluationCount
      };
    }
    return {
      filters: selectedFilters,
      curve: buildCurveFromBank(raw, selectedFilters),
      combinedEqCurve: raw.map((point) => ({ frequency: point.frequency, spl: correctionAt$1(point.frequency, selectedFilters) })),
      diagnostics,
      changed: acceptedOperationCount > 0,
      acceptedOperationCount,
      bankEvaluationCount,
      finalQuality: quality$2(finalPoints, protectedNullRegions),
      finalBankLimits: finalLimits,
      limits: { maximumAggregateCutDb: -15, maximumAggregateBoostDb: 6, maximumFilterQ: MAX_Q, maximumEnabledFilters: MAX_FILTERS$1 }
    };
  }
  const MAX_FILTERS = 10;
  const MIN_WIDTH_OCTAVES = 0.22;
  const MIN_IMPROVEMENT_DB = 1.5;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  function correctionAt(frequency, filters) {
    return filters.reduce((sum, filter) => sum + peakingEqResponseDb(frequency, filter), 0);
  }
  function residualPoints(raw, filters, targetCurve, startHz, endHz, protectedRegions) {
    return raw.filter((point) => point.frequency >= startHz && point.frequency <= endHz).map((point) => {
      const targetSpl = interpolateCanonicalTarget(targetCurve, point.frequency);
      return {
        frequency: point.frequency,
        residualDb: point.spl + correctionAt(point.frequency, filters) - targetSpl,
        protected: isProtectedFrequency(point.frequency, protectedRegions)
      };
    }).filter((point) => Number.isFinite(point.residualDb));
  }
  function discoverBroadValleys(points, minimumFrequencyHz) {
    const regions = [];
    let current = [];
    const finish = () => {
      if (current.length >= 3) {
        const startHz = current[0].frequency;
        const endHz = current.at(-1).frequency;
        const widthOctaves = endHz > startHz ? Math.log2(endHz / startHz) : 0;
        const centre = current.reduce((worst, point) => point.residualDb < worst.residualDb ? point : worst);
        if (widthOctaves >= MIN_WIDTH_OCTAVES && centre.residualDb <= -4) {
          regions.push({ startHz, endHz, widthOctaves, centre });
        }
      }
      current = [];
    };
    for (const point of points) {
      if (point.frequency < minimumFrequencyHz || point.protected || point.residualDb > -1) {
        finish();
      } else {
        current.push(point);
      }
    }
    finish();
    return regions.sort((left, right) => left.centre.residualDb - right.centre.residualDb);
  }
  function quality$1(points) {
    const scored = points.filter((point) => !point.protected);
    if (!scored.length) return null;
    return {
      maximum: Math.max(...scored.map((point) => Math.abs(point.residualDb))),
      rms: Math.sqrt(scored.reduce((sum, point) => sum + point.residualDb ** 2, 0) / scored.length),
      meanAbsolute: scored.reduce((sum, point) => sum + Math.abs(point.residualDb), 0) / scored.length
    };
  }
  function valleyDeficit(points, region) {
    const inside = points.filter((point) => point.frequency >= region.startHz && point.frequency <= region.endHz);
    return inside.length ? inside.reduce((sum, point) => sum + Math.max(0, -point.residualDb), 0) / inside.length : 0;
  }
  function shoulderPeaks(points, region) {
    const ranges = [
      {
        side: "lower",
        includes: (point) => point.frequency >= region.startHz / 2 ** 0.5 && point.frequency < region.startHz
      },
      {
        side: "upper",
        includes: (point) => point.frequency > region.endHz && point.frequency <= region.endHz * 2 ** 0.35
      }
    ];
    return ranges.map(({ side, includes }) => {
      const candidate = points.filter((point) => !point.protected && includes(point)).sort((left, right) => right.residualDb - left.residualDb)[0];
      return ((candidate == null ? void 0 : candidate.residualDb) ?? 0) >= 2 ? { ...candidate, side } : null;
    }).filter(Boolean);
  }
  function realSeatsSafe(before, after) {
    const beforeById = new Map(((before == null ? void 0 : before.seatMetrics) || []).map((seat) => [seat.seatId, seat]));
    return ((after == null ? void 0 : after.seatMetrics) || []).every((seat) => {
      if (seat.seatId === "rsp") return true;
      const baseline = beforeById.get(seat.seatId);
      return !baseline || seat.maxAbsDeviationDb <= baseline.maxAbsDeviationDb + 1;
    });
  }
  function protectedNullsSafe(current, proposed, protectedRegions) {
    return (protectedRegions || []).every((region) => {
      const centre = region.centreFrequencyHz;
      return !Number.isFinite(centre) || correctionAt(centre, proposed) - correctionAt(centre, current) <= 0.5;
    });
  }
  const signature = (filters) => filters.map(
    (filter) => `${Number(filter.frequencyHz).toFixed(3)}/${Number(filter.gainDb).toFixed(3)}/${Number(filter.Q).toFixed(3)}`
  ).join("|");
  function rebalanceBroadValleyBank({
    filters = [],
    rawCurve = [],
    targetCurve = [],
    protectedNullRegions = [],
    objectiveSeats = [],
    currentMetrics = null,
    fitStartHz = 20,
    fitEndHz = 200,
    correctionStartHz = 20,
    correctionEndHz = 200,
    anchorDb = 0,
    bankRaw = [],
    activeSubs = [],
    usableLfHz = 20,
    requestedSystemOutputDb,
    profile = { maximumCutDb: 15, maximumAggregateBoostDb: 6 },
    evaluationMemo = null,
    preparedBankValidation = null,
    operationCounts = null
  }) {
    var _a, _b;
    const current = filters.filter((filter) => filter == null ? void 0 : filter.enabled).map((filter) => ({ ...filter }));
    const raw = normaliseCurve(rawCurve);
    const baselinePoints = residualPoints(
      raw,
      current,
      targetCurve,
      correctionStartHz,
      correctionEndHz,
      protectedNullRegions
    );
    const baselineQuality = quality$1(baselinePoints);
    const valleys = discoverBroadValleys(
      baselinePoints,
      Math.max(40, Number(usableLfHz || 20) * 1.25)
    );
    const baselineMetrics = currentMetrics || calculateAllSeatMetrics(
      objectiveSeats,
      current,
      fitStartHz,
      fitEndHz,
      anchorDb,
      operationCounts,
      evaluationMemo,
      { protectedNullRegions, canonicalTargetCurve: targetCurve }
    );
    let bankEvaluationCount = 0;
    const diagnostics = [];
    const preliminary = [];
    const seen = /* @__PURE__ */ new Set();
    for (const region of valleys.slice(0, 3)) {
      const centreHz = region.centre.frequency;
      const contributions = current.map((filter, index) => ({
        filter,
        index,
        contributionDb: peakingEqResponseDb(centreHz, filter)
      }));
      const blocker = contributions.filter((entry) => entry.filter.gainDb < -0.1 && entry.contributionDb <= -0.75).sort((left, right) => left.contributionDb - right.contributionDb)[0];
      const boostIndexes = contributions.filter((entry) => entry.filter.gainDb > 0.1 && Math.abs(Math.log2(centreHz / entry.filter.frequencyHz)) <= 0.5).sort((left, right) => right.contributionDb - left.contributionDb).map((entry) => entry.index);
      const shoulders = shoulderPeaks(baselinePoints, region);
      const shoulderCuts = [];
      for (const shoulder of shoulders) {
        const match = current.map((filter, index) => ({
          filter,
          index,
          shoulder,
          distance: Math.abs(Math.log2(shoulder.frequency / filter.frequencyHz))
        })).filter((entry) => entry.filter.gainDb < -0.1 && entry.distance <= 0.3 && !shoulderCuts.some((selected) => selected.index === entry.index)).sort((left, right) => left.distance - right.distance)[0];
        if (match) shoulderCuts.push(match);
      }
      const diagnostic = {
        startHz: region.startHz,
        endHz: region.endHz,
        widthOctaves: region.widthOctaves,
        centreFrequencyHz: centreHz,
        baselineCentreResidualDb: region.centre.residualDb,
        blocker: blocker ? {
          index: blocker.index,
          frequencyHz: blocker.filter.frequencyHz,
          gainDb: blocker.filter.gainDb,
          Q: blocker.filter.Q,
          contributionDb: blocker.contributionDb
        } : null,
        blockerCompanion: null,
        shoulderFrequencyHz: ((_a = shoulders[0]) == null ? void 0 : _a.frequency) ?? null,
        shoulderFrequenciesHz: shoulders.map((shoulder) => shoulder.frequency),
        evaluatedBanks: 0,
        legalBanks: 0,
        acceptedBanks: 0
      };
      diagnostics.push(diagnostic);
      if (!blocker || blocker.filter.Q >= 8) continue;
      const blockerQValues = [...new Set([1.25, 1.5, 2, 2.5, 3, 4].map(
        (scale) => Number(clamp(blocker.filter.Q * scale, blocker.filter.Q + 0.2, 10).toFixed(4))
      ))];
      const blockerCompanion = current.map((filter, index) => ({
        filter,
        index,
        distance: Math.abs(Math.log2(filter.frequencyHz / blocker.filter.frequencyHz))
      })).filter((entry) => entry.index !== blocker.index && entry.filter.gainDb < -0.1 && entry.distance <= 0.35).sort((left, right) => left.distance - right.distance)[0] || null;
      const replacementCompanion = blockerCompanion ? null : current.map((filter, index) => ({
        filter,
        index,
        activity: Math.abs(filter.gainDb || 0),
        outsideAssessment: filter.frequencyHz > fitEndHz
      })).filter((entry) => entry.index !== blocker.index && entry.activity <= 1.5).sort((left, right) => Number(right.outsideAssessment) - Number(left.outsideAssessment) || left.activity - right.activity)[0] || null;
      const effectiveCompanion = blockerCompanion || replacementCompanion;
      diagnostic.blockerCompanion = effectiveCompanion ? {
        index: effectiveCompanion.index,
        frequencyHz: effectiveCompanion.filter.frequencyHz,
        gainDb: effectiveCompanion.filter.gainDb,
        Q: effectiveCompanion.filter.Q,
        repurposed: !!replacementCompanion
      } : null;
      const blockerVariants = blockerQValues.map((blockerQ) => {
        const variant = current.map((filter) => ({ ...filter }));
        variant[blocker.index] = {
          ...variant[blocker.index],
          Q: blockerQ,
          reason: "Joint broad-valley rebalance: narrow remote peak-cut tail"
        };
        return variant;
      });
      if (!effectiveCompanion && current.length < MAX_FILTERS) {
        const lowerShoulder = shoulders.find((shoulder) => shoulder.side === "lower");
        const appendedFrequencyHz = (lowerShoulder == null ? void 0 : lowerShoulder.frequency) ?? Math.sqrt(blocker.filter.frequencyHz * region.startHz);
        const appendedSplitPresets = [
          [-13, 2.5, -3, 4],
          [-12, 3, -4, 4],
          [-11, 3.5, -5, 5],
          [-10, 4, -6, 5],
          [-9, 4.5, -7, 6],
          [-8, 5, -8, 6]
        ];
        for (const [primaryGainDb, primaryQ, companionGainDb, companionQ] of appendedSplitPresets) {
          const variant = current.map((filter) => ({ ...filter }));
          variant[blocker.index] = {
            ...variant[blocker.index],
            gainDb: primaryGainDb,
            Q: primaryQ,
            reason: "Joint broad-valley rebalance: narrow saturated peak cut"
          };
          variant.push({
            band: variant.length + 1,
            enabled: true,
            type: "Peak",
            frequencyHz: appendedFrequencyHz,
            gainDb: companionGainDb,
            Q: companionQ,
            reason: "Joint broad-valley rebalance: add overlapping shoulder cut"
          });
          blockerVariants.push(variant);
        }
        diagnostic.blockerCompanion = {
          index: current.length,
          frequencyHz: appendedFrequencyHz,
          gainDb: null,
          Q: null,
          appended: true,
          repurposed: false
        };
      }
      if (effectiveCompanion) {
        const lowerShoulder = shoulders.find((shoulder) => shoulder.side === "lower");
        const upperShoulder = shoulders.find((shoulder) => shoulder.side === "upper");
        const splitFrequencyHz = replacementCompanion && upperShoulder ? upperShoulder.frequency : replacementCompanion ? Math.sqrt(blocker.filter.frequencyHz * ((lowerShoulder == null ? void 0 : lowerShoulder.frequency) ?? region.startHz)) : Math.sqrt(blocker.filter.frequencyHz * effectiveCompanion.filter.frequencyHz);
        const splitPresets = replacementCompanion && upperShoulder ? [
          [-14, 2, -2, 8],
          [-14, 2, -4, 8],
          [-13, 2.5, -4, 10],
          [-13, 2.5, -6, 10],
          [-12, 3, -6, 8],
          [-12, 3, -8, 10],
          [-11, 3.5, -8, 10],
          [-10, 4, -10, 10]
        ] : [
          [-14, 2, -2, 3],
          [-13, 2.5, -3, 3],
          [-12, 3, -4, 3],
          [-11, 3.5, -5, 3],
          [-10, 4, -6, 3],
          [-9, 4, -7, 4],
          [-12, 4, -4, 4],
          [-10, 5, -6, 4]
        ];
        for (const [primaryGainDb, primaryQ, companionGainDb, companionQ] of splitPresets) {
          const variant = current.map((filter) => ({ ...filter }));
          variant[blocker.index] = {
            ...variant[blocker.index],
            gainDb: primaryGainDb,
            Q: primaryQ,
            reason: "Joint broad-valley rebalance: split saturated broad peak cut"
          };
          variant[effectiveCompanion.index] = {
            ...variant[effectiveCompanion.index],
            enabled: true,
            type: "Peak",
            frequencyHz: splitFrequencyHz,
            gainDb: companionGainDb,
            Q: companionQ,
            reason: replacementCompanion ? "Joint broad-valley rebalance: repurpose weak slot for overlapping peak control" : "Joint broad-valley rebalance: preserve peak control without remote tail"
          };
          blockerVariants.push(variant);
        }
      }
      const boostAdditions = boostIndexes.length ? [0, 1, 2, 3, 4] : [0, 2, 3, 4, 5, 6];
      const boostQValues = boostIndexes.length ? [...new Set([current[boostIndexes[0]].Q, 1.5, 2, 2.5, 3].map((value) => Number(clamp(value, 0.5, 4).toFixed(4))))] : [1.5, 2, 2.5, 3];
      const shoulderAdjustmentSets = shoulderCuts.length >= 2 ? [[0, 0], [-1, -1], [-2, -1], [-2, -2], [-3, -2], [-4, -3], [-4, -4]] : shoulderCuts.length === 1 ? [[0], [-1], [-2], [-3], [-4]] : [[]];
      const additionalBoostModes = boostIndexes.length && current.length < MAX_FILTERS ? [false, true] : [false];
      for (const blockerVariant of blockerVariants) for (const boostAddition of boostAdditions) {
        for (const boostQ of boostQValues) for (const shoulderDeltas of shoulderAdjustmentSets) {
          for (const useAdditionalBoost of additionalBoostModes) {
            let proposed = blockerVariant.map((filter) => ({ ...filter }));
            if (boostIndexes.length && !useAdditionalBoost) {
              const totalGain = boostIndexes.reduce((sum, index) => sum + Math.max(0, proposed[index].gainDb), 0);
              boostIndexes.forEach((index) => {
                const share = totalGain > 0 ? proposed[index].gainDb / totalGain : 1 / boostIndexes.length;
                proposed[index] = {
                  ...proposed[index],
                  gainDb: clamp(proposed[index].gainDb + boostAddition * share, 0, 6),
                  Q: boostQ,
                  frequencyHz: proposed[index].frequencyHz + (centreHz - proposed[index].frequencyHz) * 0.35,
                  reason: "Joint broad-valley rebalance: use available source-domain boost"
                };
              });
            } else if (boostAddition > 0) {
              if (proposed.length >= MAX_FILTERS) continue;
              proposed.push({
                band: proposed.length + 1,
                enabled: true,
                type: "Peak",
                frequencyHz: centreHz,
                gainDb: boostIndexes.length ? boostAddition + 2 : boostAddition,
                Q: boostQ,
                startHz: region.startHz,
                endHz: region.endHz,
                reason: "Joint broad-valley rebalance: use available aggregate source-domain boost"
              });
            }
            shoulderCuts.forEach((shoulderCut, shoulderIndex) => {
              const shoulderDelta = shoulderDeltas[shoulderIndex] ?? 0;
              if (shoulderDelta >= 0) return;
              const index = shoulderCut.index;
              proposed[index] = {
                ...proposed[index],
                frequencyHz: proposed[index].frequencyHz + (shoulderCut.shoulder.frequency - proposed[index].frequencyHz) * 0.5,
                gainDb: clamp(proposed[index].gainDb + shoulderDelta, -15, 0),
                Q: clamp(Math.max(proposed[index].Q, 8), 0.5, 10),
                reason: "Joint broad-valley rebalance: retain both adjacent peak shoulders"
              };
            });
            const candidateSignature = signature(proposed);
            if (seen.has(candidateSignature)) continue;
            seen.add(candidateSignature);
            diagnostic.evaluatedBanks += 1;
            const limits = preparedBankValidation ? evaluatePreparedBankLimits(preparedBankValidation, proposed, profile, operationCounts) : evaluateProvisionalBankLimits(
              proposed,
              bankRaw,
              activeSubs,
              usableLfHz,
              requestedSystemOutputDb,
              profile
            );
            bankEvaluationCount += 1;
            if (!limits.allOk || !protectedNullsSafe(current, proposed, protectedNullRegions)) continue;
            diagnostic.legalBanks += 1;
            const points = residualPoints(
              raw,
              proposed,
              targetCurve,
              correctionStartHz,
              correctionEndHz,
              protectedNullRegions
            );
            const candidateQuality = quality$1(points);
            if (!candidateQuality) continue;
            const valleyImprovementDb = valleyDeficit(baselinePoints, region) - valleyDeficit(points, region);
            const centreCorrectionIncreaseDb = correctionAt(centreHz, proposed) - correctionAt(centreHz, current);
            if (valleyImprovementDb < MIN_IMPROVEMENT_DB || centreCorrectionIncreaseDb < MIN_IMPROVEMENT_DB || candidateQuality.maximum > baselineQuality.maximum + 6 || candidateQuality.rms > baselineQuality.rms + 2) continue;
            diagnostic.acceptedBanks += 1;
            preliminary.push({
              filters: proposed,
              region,
              quality: candidateQuality,
              limits,
              valleyImprovementDb,
              centreCorrectionIncreaseDb,
              activity: proposed.reduce((sum, filter) => sum + Math.abs(filter.gainDb || 0), 0),
              usesRepurposedCompanion: !!replacementCompanion && ((_b = proposed[replacementCompanion.index]) == null ? void 0 : _b.reason) === "Joint broad-valley rebalance: repurpose weak slot for overlapping peak control",
              usesAppendedCompanion: proposed.length > current.length && proposed.some((filter) => filter.reason === "Joint broad-valley rebalance: add overlapping shoulder cut"),
              addsBroadValleyBoost: proposed.some((filter) => filter.reason === "Joint broad-valley rebalance: use available aggregate source-domain boost"),
              adjustedShoulderCount: shoulderCuts.reduce((count, shoulderCut) => count + (Math.abs(
                proposed[shoulderCut.index].gainDb - current[shoulderCut.index].gainDb
              ) >= 0.5 ? 1 : 0), 0)
            });
          }
        }
      }
    }
    preliminary.sort((left, right) => left.quality.maximum - right.quality.maximum || left.quality.rms - right.quality.rms || right.valleyImprovementDb - left.valleyImprovementDb || left.quality.meanAbsolute - right.quality.meanAbsolute || left.activity - right.activity);
    const verification = {
      testedBanks: 0,
      missingMetrics: 0,
      realSeatUnsafe: 0,
      rspLevelRegression: 0,
      rspRmsWorsening: 0,
      samples: [],
      bestValleySample: null,
      bestRepurposedSample: null,
      bestAppendedSample: null,
      bestAppendedCutOnlySample: null
    };
    const verificationPool = [];
    const verificationSignatures = /* @__PURE__ */ new Set();
    const addToVerificationPool = (candidate) => {
      const candidateSignature = signature(candidate.filters);
      if (verificationSignatures.has(candidateSignature)) return;
      verificationSignatures.add(candidateSignature);
      verificationPool.push(candidate);
    };
    preliminary.slice(0, 20).forEach(addToVerificationPool);
    preliminary.filter((candidate) => candidate.usesRepurposedCompanion).slice(0, 20).forEach(addToVerificationPool);
    preliminary.filter((candidate) => candidate.usesAppendedCompanion).slice(0, 30).forEach(addToVerificationPool);
    preliminary.filter((candidate) => candidate.adjustedShoulderCount >= 2).slice(0, 15).forEach(addToVerificationPool);
    [...preliminary].sort((left, right) => right.valleyImprovementDb - left.valleyImprovementDb || right.centreCorrectionIncreaseDb - left.centreCorrectionIncreaseDb || left.quality.rms - right.quality.rms).slice(0, 20).forEach(addToVerificationPool);
    const verifiedCandidates = [];
    for (const candidate of verificationPool.slice(0, 75)) {
      verification.testedBanks += 1;
      const metrics = calculateAllSeatMetrics(
        objectiveSeats,
        candidate.filters,
        fitStartHz,
        fitEndHz,
        anchorDb,
        operationCounts,
        evaluationMemo,
        { protectedNullRegions, canonicalTargetCurve: targetCurve }
      );
      const realSeatSafe = !!metrics && realSeatsSafe(baselineMetrics, metrics);
      const baselineRspLevel = Number.isFinite(baselineMetrics == null ? void 0 : baselineMetrics.rspMaxDeviationDb) ? houseCurveP19Level(baselineMetrics.rspMaxDeviationDb) : null;
      const candidateRspLevel = Number.isFinite(metrics == null ? void 0 : metrics.rspMaxDeviationDb) ? houseCurveP19Level(metrics.rspMaxDeviationDb) : null;
      const rspLevelSafe = baselineRspLevel === null || candidateRspLevel >= baselineRspLevel;
      const absoluteRspRmsSafe = !Number.isFinite(baselineMetrics == null ? void 0 : baselineMetrics.rspRmsDeviationDb) || metrics.rspRmsDeviationDb <= baselineMetrics.rspRmsDeviationDb + 0.1;
      const shapeAndLevelSafe = Number.isFinite(baselineMetrics == null ? void 0 : baselineMetrics.rspShapeRmsDeviationDb) && Number.isFinite(metrics == null ? void 0 : metrics.rspShapeRmsDeviationDb) && metrics.rspShapeRmsDeviationDb <= baselineMetrics.rspShapeRmsDeviationDb - 0.1 && metrics.rspMaxDeviationDb <= baselineMetrics.rspMaxDeviationDb + 0.5 && Math.abs((metrics.rspMeanSignedResidualDb ?? 0) - (baselineMetrics.rspMeanSignedResidualDb ?? 0)) <= 1.25;
      const rspRmsSafe = absoluteRspRmsSafe || shapeAndLevelSafe;
      const verificationSample = {
        rawMaximumResidualDb: candidate.quality.maximum,
        rawRmsResidualDb: candidate.quality.rms,
        valleyImprovementDb: candidate.valleyImprovementDb,
        centreCorrectionIncreaseDb: candidate.centreCorrectionIncreaseDb,
        realSeatSafe,
        rspLevelSafe,
        rspRmsSafe,
        baselineRspMaxDeviationDb: (baselineMetrics == null ? void 0 : baselineMetrics.rspMaxDeviationDb) ?? null,
        candidateRspMaxDeviationDb: (metrics == null ? void 0 : metrics.rspMaxDeviationDb) ?? null,
        baselineRspLevel,
        candidateRspLevel,
        baselineRspRmsDeviationDb: (baselineMetrics == null ? void 0 : baselineMetrics.rspRmsDeviationDb) ?? null,
        candidateRspRmsDeviationDb: (metrics == null ? void 0 : metrics.rspRmsDeviationDb) ?? null,
        baselineRspMeanSignedResidualDb: (baselineMetrics == null ? void 0 : baselineMetrics.rspMeanSignedResidualDb) ?? null,
        candidateRspMeanSignedResidualDb: (metrics == null ? void 0 : metrics.rspMeanSignedResidualDb) ?? null,
        baselineRspShapeRmsDeviationDb: (baselineMetrics == null ? void 0 : baselineMetrics.rspShapeRmsDeviationDb) ?? null,
        candidateRspShapeRmsDeviationDb: (metrics == null ? void 0 : metrics.rspShapeRmsDeviationDb) ?? null,
        absoluteRspRmsSafe,
        shapeAndLevelSafe,
        usesRepurposedCompanion: candidate.usesRepurposedCompanion,
        usesAppendedCompanion: candidate.usesAppendedCompanion,
        addsBroadValleyBoost: candidate.addsBroadValleyBoost,
        adjustedShoulderCount: candidate.adjustedShoulderCount,
        bankLimits: candidate.limits,
        filterSignature: signature(candidate.filters)
      };
      if (verification.samples.length < 8) verification.samples.push(verificationSample);
      if (!verification.bestValleySample || verificationSample.valleyImprovementDb > verification.bestValleySample.valleyImprovementDb) {
        verification.bestValleySample = verificationSample;
      }
      if (candidate.usesRepurposedCompanion && (!verification.bestRepurposedSample || verificationSample.valleyImprovementDb > verification.bestRepurposedSample.valleyImprovementDb)) {
        verification.bestRepurposedSample = verificationSample;
      }
      if (candidate.usesAppendedCompanion && (!verification.bestAppendedSample || verificationSample.valleyImprovementDb > verification.bestAppendedSample.valleyImprovementDb)) {
        verification.bestAppendedSample = verificationSample;
      }
      if (candidate.usesAppendedCompanion && !candidate.addsBroadValleyBoost && (!verification.bestAppendedCutOnlySample || verificationSample.valleyImprovementDb > verification.bestAppendedCutOnlySample.valleyImprovementDb)) {
        verification.bestAppendedCutOnlySample = verificationSample;
      }
      if (!metrics) {
        verification.missingMetrics += 1;
        continue;
      }
      if (!realSeatSafe) {
        verification.realSeatUnsafe += 1;
        continue;
      }
      if (!rspLevelSafe) {
        verification.rspLevelRegression += 1;
        continue;
      }
      if (!rspRmsSafe) {
        verification.rspRmsWorsening += 1;
        continue;
      }
      verifiedCandidates.push({ ...candidate, metrics });
    }
    verifiedCandidates.sort((left, right) => houseCurveP19Level(right.metrics.rspMaxDeviationDb) - houseCurveP19Level(left.metrics.rspMaxDeviationDb) || left.metrics.rspMaxDeviationDb - right.metrics.rspMaxDeviationDb || left.metrics.rspShapeRmsDeviationDb - right.metrics.rspShapeRmsDeviationDb || left.quality.maximum - right.quality.maximum || right.valleyImprovementDb - left.valleyImprovementDb);
    const winner = verifiedCandidates[0] || null;
    if (!winner) {
      return {
        filters: current,
        metrics: baselineMetrics,
        changed: false,
        bankEvaluationCount,
        reason: valleys.length ? "no legal joint broad-valley bank improved the response" : "no broad unprotected modal valley required rebalancing",
        diagnostics,
        verification,
        selected: null
      };
    }
    return {
      filters: winner.filters,
      metrics: winner.metrics,
      changed: true,
      bankEvaluationCount,
      reason: `joint broad-valley bank rebalanced around ${winner.region.centre.frequency.toFixed(1)} Hz`,
      diagnostics,
      verification,
      selected: {
        startHz: winner.region.startHz,
        endHz: winner.region.endHz,
        centreFrequencyHz: winner.region.centre.frequency,
        valleyImprovementDb: winner.valleyImprovementDb,
        centreCorrectionIncreaseDb: winner.centreCorrectionIncreaseDb,
        maximumResidualBeforeDb: baselineQuality.maximum,
        maximumResidualAfterDb: winner.quality.maximum,
        rmsResidualBeforeDb: baselineQuality.rms,
        rmsResidualAfterDb: winner.quality.rms,
        bankLimits: winner.limits
      }
    };
  }
  const EQ_ACTIVITY = (filters) => filters.reduce((sum, filter) => sum + Math.abs(filter.gainDb || 0), 0);
  function quality(raw, filters, target, startHz, endHz, protectedRegions) {
    const residuals = applyBassSmoothing(buildCurveFromBank(raw, filters), "third").filter((point) => point.frequency >= startHz && point.frequency <= endHz).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedRegions)).map((point) => point.spl - interpolateCanonicalTarget(target, point.frequency)).filter(Number.isFinite);
    if (!residuals.length) return null;
    return {
      maximum: Math.max(...residuals.map(Math.abs)),
      rms: Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length),
      meanAbsolute: residuals.reduce((sum, value) => sum + Math.abs(value), 0) / residuals.length,
      activity: EQ_ACTIVITY(filters)
    };
  }
  function tuple(result) {
    return [result.quality.maximum, result.quality.rms, result.quality.meanAbsolute, result.rawPeakResidual, result.quality.activity];
  }
  function better(left, right) {
    if (!right) return true;
    const a = tuple(left);
    const b = tuple(right);
    for (let index = 0; index < a.length; index++) if (Math.abs(a[index] - b[index]) > 1e-9) return a[index] < b[index];
    return false;
  }
  function refineLegalUnprotectedPeak({
    filters,
    rawCurve,
    targetCurve,
    protectedNullRegions,
    assessmentStartHz,
    assessmentEndHz,
    bankRaw,
    activeSubs,
    usableLfHz,
    requestedSystemOutputDb,
    profile,
    objectiveSeats,
    fitStartHz,
    fitEndHz,
    anchorDb,
    evaluationMemo = null,
    preparedBankValidation = null,
    operationCounts = null
  }) {
    const current = filters.filter((filter) => filter == null ? void 0 : filter.enabled).map((filter) => ({ ...filter }));
    const currentCurve = buildCurveFromBank(rawCurve, current);
    const residualCurve = currentCurve.filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz).filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions)).map((point) => ({ ...point, residual: point.spl - interpolateCanonicalTarget(targetCurve, point.frequency) }));
    const peaks = residualCurve.filter((point, index) => {
      var _a, _b;
      return point.residual > 3 && point.residual >= (((_a = residualCurve[index - 1]) == null ? void 0 : _a.residual) ?? -Infinity) && point.residual >= (((_b = residualCurve[index + 1]) == null ? void 0 : _b.residual) ?? -Infinity);
    }).sort((left, right) => right.residual - left.residual);
    if (!peaks.length) return { filters: current, changed: false, reason: "no unprotected raw peak remained above +3 dB" };
    const baselineMetrics = calculateAllSeatMetrics(objectiveSeats, current, fitStartHz, fitEndHz, anchorDb, operationCounts, evaluationMemo, {
      protectedNullRegions,
      canonicalTargetCurve: targetCurve
    });
    let best = null;
    for (const peak of peaks.slice(0, 4)) {
      current.forEach((filter, filterIndex) => {
        if (filter.gainDb >= -0.1 || peakingEqResponseDb(peak.frequency, filter) > -0.25) return;
        for (const shift of [0.25, 0.5, 0.75, 1]) for (const gainDelta of [-0.5, -0.25, 0, 0.25, 0.5]) {
          const revised = {
            ...filter,
            frequencyHz: filter.frequencyHz + (peak.frequency - filter.frequencyHz) * shift,
            gainDb: Math.max(-15, Math.min(0, filter.gainDb + gainDelta)),
            reason: "Legal unprotected-peak frequency refinement"
          };
          const proposed = current.map((entry, index) => index === filterIndex ? revised : entry);
          const limits = preparedBankValidation ? evaluatePreparedBankLimits(preparedBankValidation, proposed, profile, operationCounts) : evaluateProvisionalBankLimits(proposed, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
          if (!limits.allOk || limits.maxAggregateCutDb < -15.0001) continue;
          const post = buildCurveFromBank(rawCurve, proposed);
          const postPoint = post.reduce((nearest, point) => Math.abs(point.frequency - peak.frequency) < Math.abs(nearest.frequency - peak.frequency) ? point : nearest);
          const rawPeakResidual = Math.abs(postPoint.spl - interpolateCanonicalTarget(targetCurve, postPoint.frequency));
          if (rawPeakResidual > 3.0001) continue;
          const proposedQuality = quality(rawCurve, proposed, targetCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions);
          if (!proposedQuality || proposedQuality.maximum > 3.0001) continue;
          const metrics = calculateAllSeatMetrics(objectiveSeats, proposed, fitStartHz, fitEndHz, anchorDb, operationCounts, evaluationMemo, {
            protectedNullRegions,
            canonicalTargetCurve: targetCurve
          });
          const realSeatsSafe2 = ((metrics == null ? void 0 : metrics.seatMetrics) || []).filter((seat) => seat.seatId !== "rsp").every((seat) => {
            var _a;
            const baseline = (_a = baselineMetrics == null ? void 0 : baselineMetrics.seatMetrics) == null ? void 0 : _a.find((entry) => entry.seatId === seat.seatId);
            return !baseline || seat.maxAbsDeviationDb <= baseline.maxAbsDeviationDb + 1;
          });
          if (!realSeatsSafe2) continue;
          const candidate = { filters: proposed, quality: proposedQuality, rawPeakResidual, metrics, limits, frequencyHz: peak.frequency };
          if (better(candidate, best)) best = candidate;
        }
      });
    }
    return best ? { ...best, changed: true, reason: "legal unprotected peak refined within ±3 dB" } : { filters: current, changed: false, reason: "no legal frequency refinement satisfied the strict peak and correctable-error gates" };
  }
  const isNumber = (v) => Number.isFinite(Number(v));
  function resolveFallback({ selectedFilters, standardSeedFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, objectiveSeats, assessmentStartHz, assessmentEndHz, anchorDb, protectedNullRegions = [], canonicalTargetCurve = null, bankEvalCount = 0 }) {
    let filters = (Array.isArray(selectedFilters) ? selectedFilters : []).map((f) => ({ ...f }));
    let finalBankLimits = evaluateProvisionalBankLimits(filters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
    bankEvalCount++;
    let bankValidationPassed = finalBankLimits.allOk;
    let fallbackOccurred = false;
    let fallbackType = null;
    let finalMetrics = null;
    let stopReason = null;
    let blockedResiduals = [];
    let invariantViolation = false;
    if (!bankValidationPassed) {
      fallbackOccurred = true;
      if (standardSeedFilters.length > 0) {
        const seedLimits = evaluateProvisionalBankLimits(standardSeedFilters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
        bankEvalCount++;
        if (seedLimits.allOk) {
          filters = standardSeedFilters.map((f) => ({ ...f }));
          fallbackType = "standard-seed";
        } else {
          filters = [];
          fallbackType = "empty";
        }
      } else {
        filters = [];
        fallbackType = "empty";
      }
      finalMetrics = calculateAllSeatMetrics(objectiveSeats, filters, assessmentStartHz, assessmentEndHz, anchorDb, null, null, { protectedNullRegions, canonicalTargetCurve });
      stopReason = `final bank validation failed — reverted to ${fallbackType}`;
      blockedResiduals = [];
      finalBankLimits = evaluateProvisionalBankLimits(filters, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
      bankEvalCount++;
      bankValidationPassed = finalBankLimits.allOk;
      if (fallbackType === "empty" && !bankValidationPassed) {
        invariantViolation = true;
      }
    }
    return { filters, fallbackOccurred, fallbackType, bankValidationPassed, finalBankLimits, finalMetrics, stopReason, blockedResiduals, bankEvalCount, invariantViolation };
  }
  function calculateHouseCurveEqCurve(rawCurve, perSeatRawCurves, usableLfHz, activeSubs = [], options = {}) {
    var _a, _b, _c, _d, _e, _f, _g;
    const rspRaw = normaliseCurve(rawCurve);
    if (!rspRaw.length) return { filters: emptyFilters([]), curve: [], combinedEqCurve: [], designEqFitProfile: "house_curve", perSeatMetrics: [] };
    const realSeatCurves = (Array.isArray(perSeatRawCurves) ? perSeatRawCurves : []).filter((s) => (s == null ? void 0 : s.seatId) && s.seatId !== "rsp" && !s.__isSyntheticRsp && Array.isArray(s == null ? void 0 : s.responseData) && s.responseData.length > 0).map((s) => {
      const raw = normaliseCurve(s.responseData);
      return { seatId: s.seatId, isPrimary: !!s.isPrimary, raw, gridKey: raw.map((point) => point.frequency).join("|") };
    }).filter((s) => s.raw.length > 0);
    const hasRealSeats = realSeatCurves.length > 0;
    const rspSeat = { seatId: "rsp", isPrimary: true, raw: rspRaw, gridKey: rspRaw.map((point) => point.frequency).join("|") };
    const objectiveSeats = [rspSeat, ...realSeatCurves];
    const objectiveLabel = hasRealSeats ? "RSP primary; real seats constrained" : "RSP primary — no real seats";
    const assessmentStartHz = Number.isFinite(Number(options.assessmentStartHz)) ? Number(options.assessmentStartHz) : 20;
    const assessmentEndHz = Number.isFinite(Number(options.assessmentEndHz)) ? Number(options.assessmentEndHz) : 120;
    const fitStartHz = Number.isFinite(Number(options.fitStartHz)) ? Number(options.fitStartHz) : 20;
    const fitEndHz = Number.isFinite(Number(options.fitEndHz)) ? Number(options.fitEndHz) : 200;
    const correctionStartHz = Number.isFinite(Number(options.correctionStartHz)) ? Number(options.correctionStartHz) : 20;
    const correctionEndHz = Number.isFinite(Number(options.correctionEndHz)) ? Number(options.correctionEndHz) : 200;
    const anchorDb = Number.isFinite(Number(options.targetAnchorDb)) ? Number(options.targetAnchorDb) : 0;
    if (!isNumber(anchorDb)) return { filters: emptyFilters([]), curve: [], combinedEqCurve: [], designEqFitProfile: "house_curve", perSeatMetrics: [] };
    const requestedSystemOutputDb = Number.isFinite(Number(options.requestedSystemOutputDb)) ? Number(options.requestedSystemOutputDb) : void 0;
    const canonicalTargetCurve = Array.isArray(options.canonicalTargetCurve) ? options.canonicalTargetCurve : [];
    const profile = { ...DESIGN_EQ_FIT_PROFILES.accuracy, maximumCutDb: 15 };
    const bankRaw = rspRaw;
    const protectedNullRegions = Array.isArray(options.protectedNullRegions) ? options.protectedNullRegions : identifyProtectedNullRegions(
      rspRaw,
      correctionStartHz,
      correctionEndHz,
      anchorDb,
      activeSubs,
      usableLfHz,
      requestedSystemOutputDb,
      canonicalTargetCurve
    );
    const standardSeedFilters = Array.isArray(options.initialFilters) ? options.initialFilters.filter((f) => f && f.enabled && Number.isFinite(f.frequencyHz) && f.frequencyHz > 0 && Number.isFinite(f.gainDb) && Number.isFinite(f.Q) && f.Q > 0).filter((filter) => {
      const frequency = Number(filter.frequencyHz);
      const rawPoint = rspRaw.reduce((nearest, point) => Math.abs(point.frequency - frequency) < Math.abs(nearest.frequency - frequency) ? point : nearest);
      const targetSpl = interpolateCanonicalTarget(canonicalTargetCurve, frequency) ?? anchorDb + artcousticHouseCurveOffsetAt(frequency);
      const authority = classifyEqCorrectionRegion({
        frequency,
        rawSpl: rawPoint == null ? void 0 : rawPoint.spl,
        currentSpl: rawPoint == null ? void 0 : rawPoint.spl,
        targetSpl,
        protectedNull: protectedNullRegions.some((region) => frequency >= region.startHz && frequency <= region.endHz),
        requestedGainDb: filter.gainDb
      });
      return validatePhysicalEqAction(authority.classification, filter.gainDb).passed;
    }).slice(0, 10).map((f) => ({ ...f })) : [];
    const reuseExactEvaluations = options.reuseExactEvaluations !== false;
    const evaluationMemo = createHouseCurveEvaluationMemo(reuseExactEvaluations);
    const preparedBankValidation = reuseExactEvaluations ? prepareBankValidation(bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb) : null;
    const sharedOperationCounts = createHouseCurveOperationCounts();
    const evaluationOptions = { reuseExactEvaluations, memo: evaluationMemo, preparedBankValidation, protectedNullRegions, canonicalTargetCurve, correctionStartHz, correctionEndHz };
    const startA = runSingleStart([], objectiveSeats, bankRaw, fitStartHz, fitEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationOptions);
    let startB = startA;
    if (standardSeedFilters.length > 0) {
      startB = runSingleStart(standardSeedFilters, objectiveSeats, bankRaw, fitStartHz, fitEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, profile, evaluationOptions);
    }
    let selected = startA;
    let selectedStartLabel = "empty";
    if (startB !== startA && startB.metrics && startA.metrics) {
      const acousticComparatorPrefersB = compareHouseCurveMetrics(startB.metrics, startA.metrics) < 0;
      if (acousticComparatorPrefersB) {
        selected = startB;
        selectedStartLabel = "standard-seeded";
      }
    }
    let filters = selected.filters.map((f) => ({ ...f }));
    let finalMetrics = selected.metrics;
    let stopReason = selected.stopReason;
    let blockedResiduals = selected.blockedResiduals;
    let bankEvalCount = selected.bankEvalCount;
    let operations = selected.operations;
    const pairedSeatBaselineMetrics = finalMetrics;
    const correctableP19FromFitMetrics = (metrics) => {
      const points = ((metrics == null ? void 0 : metrics.rspResidualPoints) || []).filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz && !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
      return points.length ? Math.max(...points.map((point) => Math.abs(point.deviationDb))) : null;
    };
    for (let refinementPass = 0; refinementPass < 2; refinementPass++) {
      if (correctableP19FromFitMetrics(finalMetrics) <= profile.fittingToleranceDb) break;
      const pairedRefinement = refineOpposingResidualPair({
        filters,
        metrics: finalMetrics,
        seatBaselineMetrics: pairedSeatBaselineMetrics,
        seats: objectiveSeats,
        bankRaw,
        fitStartHz,
        fitEndHz,
        anchorDb,
        activeSubs,
        usableLfHz,
        requestedSystemOutputDb,
        profile,
        protectedNullRegions,
        canonicalTargetCurve,
        evaluationMemo,
        preparedBankValidation,
        operationCounts: sharedOperationCounts
      });
      bankEvalCount += pairedRefinement.bankEvaluationCount;
      if (!pairedRefinement.changed) {
        stopReason = `${stopReason}; paired refinement stopped: ${pairedRefinement.limitation}`;
        break;
      }
      filters = pairedRefinement.filters;
      finalMetrics = pairedRefinement.metrics;
      operations += 1;
      stopReason = `${stopReason}; accepted joint opposing-residual refinement`;
    }
    const residualCleanup = runProfessionalResidualCleanup({
      filters,
      rawCurve: rspRaw,
      perSeatRawCurves,
      anchorDb,
      canonicalTargetCurve,
      protectedNullRegions,
      activeSubs,
      usableLfHz,
      requestedSystemOutputDb,
      assessmentStartHz,
      assessmentEndHz,
      correctionStartHz,
      correctionEndHz,
      profile,
      priorIterationTrace: selected.trace || [],
      preparedBankValidation,
      operationCounts: sharedOperationCounts
    });
    bankEvalCount += residualCleanup.bankEvaluationCount;
    if (residualCleanup.changed) {
      filters = residualCleanup.filters;
      finalMetrics = calculateAllSeatMetrics(
        objectiveSeats,
        filters,
        fitStartHz,
        fitEndHz,
        anchorDb,
        sharedOperationCounts,
        evaluationMemo,
        { protectedNullRegions, canonicalTargetCurve }
      );
      operations += residualCleanup.acceptedOperationCount;
      stopReason = `${stopReason}; accepted ${residualCleanup.acceptedOperationCount} high-resolution residual-cleanup operation(s)`;
    }
    const broadValleyRebalance = rebalanceBroadValleyBank({
      filters,
      rawCurve: rspRaw,
      targetCurve: canonicalTargetCurve,
      protectedNullRegions,
      objectiveSeats,
      currentMetrics: finalMetrics,
      fitStartHz,
      fitEndHz,
      correctionStartHz,
      correctionEndHz,
      anchorDb,
      bankRaw,
      activeSubs,
      usableLfHz,
      requestedSystemOutputDb,
      profile,
      evaluationMemo,
      preparedBankValidation,
      operationCounts: sharedOperationCounts
    });
    bankEvalCount += broadValleyRebalance.bankEvaluationCount;
    if (broadValleyRebalance.changed) {
      filters = broadValleyRebalance.filters;
      finalMetrics = broadValleyRebalance.metrics;
      operations += 1;
      stopReason = `${stopReason}; ${broadValleyRebalance.reason}`;
    }
    const legalPeakRefinement = refineLegalUnprotectedPeak({
      filters,
      rawCurve: rspRaw,
      targetCurve: canonicalTargetCurve,
      protectedNullRegions,
      assessmentStartHz,
      assessmentEndHz,
      bankRaw,
      activeSubs,
      usableLfHz,
      requestedSystemOutputDb,
      profile,
      objectiveSeats,
      fitStartHz,
      fitEndHz,
      anchorDb,
      evaluationMemo,
      preparedBankValidation,
      operationCounts: sharedOperationCounts
    });
    if (legalPeakRefinement.changed) {
      filters = legalPeakRefinement.filters;
      finalMetrics = legalPeakRefinement.metrics;
      operations += 1;
      stopReason = `${stopReason}; ${legalPeakRefinement.reason}`;
    }
    const operationCounts = [startA, startB === startA ? null : startB].filter(Boolean).reduce((totals, start) => {
      Object.entries(start.operationCounts || {}).forEach(([key, value]) => {
        totals[key] = (totals[key] || 0) + value;
      });
      return totals;
    }, {});
    Object.entries(sharedOperationCounts).forEach(([key, value]) => {
      operationCounts[key] = (operationCounts[key] || 0) + value;
    });
    operationCounts.residualCleanupAcceptedOperations = residualCleanup.acceptedOperationCount;
    operationCounts.residualCleanupBankEvaluations = residualCleanup.bankEvaluationCount;
    operationCounts.broadValleyRebalanceAcceptedOperations = broadValleyRebalance.changed ? 1 : 0;
    operationCounts.broadValleyRebalanceBankEvaluations = broadValleyRebalance.bankEvaluationCount;
    const fallback = resolveFallback({
      selectedFilters: filters,
      standardSeedFilters,
      bankRaw,
      activeSubs,
      usableLfHz,
      requestedSystemOutputDb,
      profile,
      objectiveSeats,
      assessmentStartHz: fitStartHz,
      assessmentEndHz: fitEndHz,
      anchorDb,
      protectedNullRegions,
      canonicalTargetCurve,
      bankEvalCount
    });
    filters = fallback.filters;
    let finalBankLimits = fallback.finalBankLimits;
    let bankValidationPassed = fallback.bankValidationPassed;
    const fallbackOccurred = fallback.fallbackOccurred;
    const fallbackType = fallback.fallbackType;
    const invariantViolation = fallback.invariantViolation;
    bankEvalCount = fallback.bankEvalCount;
    if (fallback.fallbackOccurred) {
      finalMetrics = fallback.finalMetrics;
      stopReason = fallback.stopReason;
      blockedResiduals = fallback.blockedResiduals;
    }
    const rspCorrected = buildCurveFromBank(rspRaw, filters);
    const rspSmoothed = applyBassSmoothing(rspCorrected, "third");
    const rspAssessed = rspSmoothed.filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz).map((p) => {
      const targetSpl = interpolateCanonicalTarget(canonicalTargetCurve, p.frequency) ?? anchorDb + artcousticHouseCurveOffsetAt(p.frequency);
      return { frequency: p.frequency, targetSpl, deviationDb: p.spl - targetSpl };
    }).filter((p) => isNumber(p.deviationDb));
    const rspMaxDev = rspAssessed.length ? Math.max(...rspAssessed.map((p) => Math.abs(p.deviationDb))) : null;
    const rspCorrectableAssessed = rspAssessed.filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions));
    const rspCorrectableMaxDev = rspCorrectableAssessed.length ? Math.max(...rspCorrectableAssessed.map((point) => Math.abs(point.deviationDb))) : null;
    const upperFitStats = (smoothedCurve) => {
      const residuals = smoothedCurve.filter((point) => point.frequency > assessmentEndHz && point.frequency <= fitEndHz).filter((point) => !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions)).map((point) => point.spl - (interpolateCanonicalTarget(canonicalTargetCurve, point.frequency) ?? anchorDb + artcousticHouseCurveOffsetAt(point.frequency))).filter(Number.isFinite);
      return residuals.length ? {
        maximumAbsoluteResidualDb: Math.max(...residuals.map(Math.abs)),
        rmsResidualDb: Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length)
      } : { maximumAbsoluteResidualDb: null, rmsResidualDb: null };
    };
    const upperFitPre = upperFitStats(applyBassSmoothing(rspRaw, "third"));
    const upperFitPost = upperFitStats(rspSmoothed);
    const upperFitCorrectableResidualExists = Number.isFinite(upperFitPre.maximumAbsoluteResidualDb) && upperFitPre.maximumAbsoluteResidualDb > 1;
    const upperFitImproved = upperFitCorrectableResidualExists && (upperFitPost.maximumAbsoluteResidualDb < upperFitPre.maximumAbsoluteResidualDb - 0.05 && upperFitPost.rmsResidualDb <= upperFitPre.rmsResidualDb + 0.01 || upperFitPost.rmsResidualDb < upperFitPre.rmsResidualDb - 0.01 && upperFitPost.maximumAbsoluteResidualDb <= upperFitPre.maximumAbsoluteResidualDb + 0.05);
    const combinedEqCurve = rspRaw.map((p) => ({ frequency: p.frequency, spl: filters.reduce((sum, f) => sum + peakingEqResponseDb(p.frequency, f), 0) }));
    const curve = rspRaw.map((p, i) => ({ frequency: p.frequency, spl: p.spl + combinedEqCurve[i].spl }));
    let limitingReason = "none";
    if (!bankValidationPassed) limitingReason = "bank-validation-failed";
    else if (filters.length >= 10) limitingReason = "filter-limited";
    else if (finalBankLimits.maxAggregateBoostDb >= 5.95) limitingReason = "boost-limited";
    else if (finalBankLimits.maxAggregateCutDb <= -14.95) limitingReason = "cut-limited";
    else if (blockedResiduals.some((b) => b.blockingReason === "bank-limited")) limitingReason = "bank-limited";
    const worstCorrectablePoint = rspCorrectableAssessed.length ? rspCorrectableAssessed.reduce((worst, point) => Math.abs(point.deviationDb) > Math.abs(worst.deviationDb) ? point : worst) : null;
    const worstFrequencyHz = (worstCorrectablePoint == null ? void 0 : worstCorrectablePoint.frequency) ?? null;
    const signedResidualDb = (worstCorrectablePoint == null ? void 0 : worstCorrectablePoint.deviationDb) ?? null;
    const requiredCorrectionAtWorstDb = Number.isFinite(signedResidualDb) ? requiredCorrectionDb(worstCorrectablePoint.targetSpl, worstCorrectablePoint.targetSpl + signedResidualDb) : null;
    const appliedCorrectionAtWorstDb = Number.isFinite(worstFrequencyHz) ? interpolateCanonicalTarget(combinedEqCurve, worstFrequencyHz) : null;
    const remainingProductBoostDb = Number.isFinite(requiredCorrectionAtWorstDb) && requiredCorrectionAtWorstDb > 0 ? Math.max(0, 6 - Math.max(0, appliedCorrectionAtWorstDb || 0)) : null;
    let remainingResidualLimit = "none";
    const remainingAggregateCutHeadroomDb = Math.max(0, 15 + finalBankLimits.maxAggregateCutDb);
    const rawAtWorst = Number.isFinite(worstFrequencyHz) ? rspRaw.reduce((nearest, point) => Math.abs(point.frequency - worstFrequencyHz) < Math.abs(nearest.frequency - worstFrequencyHz) ? point : nearest) : null;
    const rawTargetAtWorst = Number.isFinite(worstFrequencyHz) ? interpolateCanonicalTarget(canonicalTargetCurve, worstFrequencyHz) ?? anchorDb + artcousticHouseCurveOffsetAt(worstFrequencyHz) : null;
    const highResolutionResidualAtWorstDb = rawAtWorst && Number.isFinite(rawTargetAtWorst) ? rawAtWorst.spl + appliedCorrectionAtWorstDb - rawTargetAtWorst : null;
    const resolutionConflict = Number.isFinite(signedResidualDb) && Number.isFinite(highResolutionResidualAtWorstDb) && signedResidualDb * highResolutionResidualAtWorstDb < 0;
    const nearestProtectedBoundaryDistanceHz = Number.isFinite(worstFrequencyHz) && protectedNullRegions.length ? Math.min(...protectedNullRegions.flatMap((region) => [Math.abs(worstFrequencyHz - region.startHz), Math.abs(worstFrequencyHz - region.endHz)])) : null;
    if (resolutionConflict && Math.abs(signedResidualDb) > 3) remainingResidualLimit = "high-resolution-conflict-limited";
    else if (Number.isFinite(requiredCorrectionAtWorstDb) && requiredCorrectionAtWorstDb < 0 && Math.abs(requiredCorrectionAtWorstDb) > remainingAggregateCutHeadroomDb + 0.05) remainingResidualLimit = "cut-limited";
    else if (Number.isFinite(requiredCorrectionAtWorstDb) && requiredCorrectionAtWorstDb > 0 && finalBankLimits.maxAggregateBoostDb >= 5.95) remainingResidualLimit = "boost-limited";
    else if (filters.filter((filter) => filter.enabled).length >= 10) remainingResidualLimit = "filter-count-limited";
    const nearestRejectedTrials = Number.isFinite(worstFrequencyHz) ? (selected.trace || []).flatMap((entry) => entry.trials || []).filter((trial) => Number.isFinite(trial.regionCentreHz) && Math.log2(Math.max(trial.regionCentreHz, worstFrequencyHz) / Math.min(trial.regionCentreHz, worstFrequencyHz)) <= 1 / 6 && !trial.accepted && trial.rejectionReason) : [];
    const protectedBoundaryDistanceText = Number.isFinite(nearestProtectedBoundaryDistanceHz) ? `${nearestProtectedBoundaryDistanceHz.toFixed(3)} Hz` : "unknown distance";
    const remainingWorstCorrectableResidual = {
      frequencyHz: worstFrequencyHz,
      signedResidualDb,
      requiredCorrectionDb: requiredCorrectionAtWorstDb,
      appliedCorrectionDb: appliedCorrectionAtWorstDb,
      limitingClassification: remainingResidualLimit,
      cutLimited: remainingResidualLimit === "cut-limited",
      boostLimited: remainingResidualLimit === "boost-limited",
      productLimited: false,
      filterCountLimited: remainingResidualLimit === "filter-count-limited",
      highResolutionConflictLimited: remainingResidualLimit === "high-resolution-conflict-limited",
      highResolutionResidualDb: highResolutionResidualAtWorstDb,
      highResolutionRequiredCorrectionDb: Number.isFinite(highResolutionResidualAtWorstDb) ? -highResolutionResidualAtWorstDb : null,
      nearestProtectedBoundaryDistanceHz,
      maximumLegalFilterQ: 10,
      enabledFilterCount: filters.filter((filter) => filter.enabled).length,
      maximumPermittedTotalBoostDb: 6,
      remainingBoostDb: remainingProductBoostDb,
      remainingAggregateCutHeadroomDb,
      anotherLegalFilterRejectedBecause: remainingResidualLimit === "cut-limited" ? `required additional cut ${Math.abs(requiredCorrectionAtWorstDb).toFixed(3)} dB exceeds remaining aggregate cut headroom ${remainingAggregateCutHeadroomDb.toFixed(3)} dB` : remainingResidualLimit === "high-resolution-conflict-limited" ? `1/3-octave residual ${signedResidualDb.toFixed(3)} dB requires ${requiredCorrectionAtWorstDb.toFixed(3)} dB, but the high-resolution residual is ${highResolutionResidualAtWorstDb.toFixed(3)} dB and requires ${(-highResolutionResidualAtWorstDb).toFixed(3)} dB; opposite correction signs at ${protectedBoundaryDistanceText} from a protected-null boundary, with ${remainingAggregateCutHeadroomDb.toFixed(3)} dB aggregate cut headroom, Q ≤ 10 and ${filters.filter((filter) => filter.enabled).length}/10 filters enabled` : ((_a = nearestRejectedTrials.at(-1)) == null ? void 0 : _a.rejectionReason) ?? stopReason
    };
    const candidateDecision = (trial) => ({
      filterFrequencyHz: trial.frequencyHz,
      gainDb: trial.gainDb,
      Q: trial.Q,
      classification: trial.regionClassification,
      beforeEqSpl: trial.beforeEqSpl,
      targetSpl: trial.targetSpl,
      expectedAction: trial.expectedAction,
      actualAction: trial.actualAction,
      rspImprovementDb: trial.rspImprovementDb,
      seatImpact: trial.seatImpact,
      capabilityPenaltyDb: trial.incrementalCapabilityPenaltyCostDb ?? trial.capabilityPenaltyCostDb,
      decision: trial.acceptedAfterSeatToleranceAdjustment ? "accepted after tolerance adjustment" : trial.accepted ? "accepted" : "rejected",
      rejectionReason: trial.rejectionReason
    });
    const evaluatedEqCandidates = (selected.trace || []).flatMap((entry) => entry.trials || []);
    const rejectedEqCandidates = evaluatedEqCandidates.filter((trial) => !trial.accepted).map(candidateDecision);
    const filterDecisionDiagnostics = buildFilterDecisionDiagnostics(
      filters,
      rspRaw,
      curve,
      canonicalTargetCurve,
      protectedNullRegions
    );
    const physicalAuthorityViolations = findAggregatePeakBoostViolations(rspRaw, curve, canonicalTargetCurve);
    const seatToleranceAdjustedCandidates = evaluatedEqCandidates.filter((trial) => trial.acceptedAfterSeatToleranceAdjustment).map(candidateDecision);
    return {
      filters: emptyFilters(filters),
      curve,
      combinedEqCurve,
      fitterHouseCurveTarget: canonicalTargetCurve.map((point) => ({ ...point })),
      designEqFitProfile: "house_curve",
      designEqFitProfileConfig: {
        preserveP14: false,
        fittingToleranceDb: 1,
        maximumCutDb: 15,
        maximumAggregateBoostDb: 6,
        peakDiscoveryThresholdDb: 1,
        valleyDiscoveryThresholdDb: 1
      },
      perSeatMetrics: (finalMetrics == null ? void 0 : finalMetrics.seatMetrics) ?? [],
      worstSeatId: (finalMetrics == null ? void 0 : finalMetrics.worstSeatId) ?? null,
      worstSeatMaxDeviationDb: (finalMetrics == null ? void 0 : finalMetrics.worstSeatMaxDeviationDb) ?? null,
      worstSeatP19Level: (finalMetrics == null ? void 0 : finalMetrics.worstSeatP19Level) ?? 0,
      meanSeatMaxDeviationDb: (finalMetrics == null ? void 0 : finalMetrics.meanSeatMaxDeviationDb) ?? null,
      rmsSeatTargetErrorDb: (finalMetrics == null ? void 0 : finalMetrics.rmsSeatTargetErrorDb) ?? null,
      rspMaxDeviationDb: rspMaxDev,
      officialP19VariationDb: Number.isFinite(rspMaxDev) ? rspMaxDev : null,
      correctableP19VariationDb: Number.isFinite(rspCorrectableMaxDev) ? rspCorrectableMaxDev : null,
      assessmentStartHz,
      assessmentEndHz,
      fitStartHz,
      fitEndHz,
      correctionStartHz,
      correctionEndHz,
      remainingWorstCorrectableResidual,
      rspObjectiveMaxDeviationDb: (finalMetrics == null ? void 0 : finalMetrics.rspMaxDeviationDb) ?? null,
      rspRmsDeviationDb: (finalMetrics == null ? void 0 : finalMetrics.rspRmsDeviationDb) ?? null,
      rspMeanSignedResidualDb: (finalMetrics == null ? void 0 : finalMetrics.rspMeanSignedResidualDb) ?? null,
      rspShapeRmsDeviationDb: (finalMetrics == null ? void 0 : finalMetrics.rspShapeRmsDeviationDb) ?? null,
      rspP19Level: houseCurveP19Level(Number.isFinite(rspMaxDev) ? rspMaxDev : null),
      baselineWorstSeatDeviationDb: selected.baselineWorstSeatDeviation,
      objectiveLabel,
      selectedStart: selectedStartLabel,
      bankValidationPassed,
      blockedResiduals,
      bankLimits: {
        maxAggregateBoostDb: finalBankLimits.maxAggregateBoostDb,
        maxAggregateBoostHz: finalBankLimits.maxAggregateBoostHz,
        maxAggregateCutDb: finalBankLimits.maxAggregateCutDb,
        maxAggregateCutHz: finalBankLimits.maxAggregateCutHz,
        boostLimitOk: finalBankLimits.boostLimitOk,
        cutLimitOk: finalBankLimits.cutLimitOk,
        sourceDomainHeadroomOk: finalBankLimits.sourceDomainHeadroomOk,
        allOk: finalBankLimits.allOk
      },
      stopReason,
      limitingReason,
      enabledFilterCount: filters.filter((f) => f.enabled).length,
      selectedCheckpoint: {
        enabledFilterCount: filters.filter((f) => f.enabled).length,
        maximumAbsoluteDeviationDb: rspMaxDev,
        rmsDeviationDb: null,
        worstResidualFrequencyHz: null,
        rawMinimumSpl: null,
        p14MinimumSpl: null,
        p14Safe: false,
        broadBelowTargetWorsening: false
      },
      iterationTrace: selected.trace || [],
      filterDecisionDiagnostics,
      physicalEqAuthorityPassed: physicalAuthorityViolations.length === 0,
      physicalAuthorityViolations,
      rejectedEqCandidates,
      seatToleranceAdjustedCandidates,
      seatRegressionToleranceDiagnostics: selected.seatRegressionToleranceDiagnostics,
      lfCapabilityProtection: null,
      houseCurveDiagnostics: {
        preRsp: selected.baselineRspMetrics,
        officialP19VariationDb: Number.isFinite(rspMaxDev) ? rspMaxDev : null,
        correctableP19VariationDb: Number.isFinite(rspCorrectableMaxDev) ? rspCorrectableMaxDev : null,
        officialP19TotalDifferenceDb: rspMaxDev,
        correctableP19TotalDifferenceDb: rspCorrectableMaxDev,
        assessmentStartHz,
        assessmentEndHz,
        fitStartHz,
        fitEndHz,
        correctionStartHz,
        correctionEndHz,
        upperFitBandImprovement: {
          startHz: assessmentEndHz,
          endHz: fitEndHz,
          correctableResidualExists: upperFitCorrectableResidualExists,
          improved: upperFitImproved,
          pre: upperFitPre,
          post: upperFitPost
        },
        remainingWorstCorrectableResidual,
        legalPeakRefinement: {
          changed: legalPeakRefinement.changed,
          reason: legalPeakRefinement.reason,
          frequencyHz: legalPeakRefinement.frequencyHz ?? null,
          rawPeakResidualDb: legalPeakRefinement.rawPeakResidual ?? null
        },
        residualCleanup: {
          diagnostics: residualCleanup.diagnostics,
          finalQuality: residualCleanup.finalQuality,
          limits: residualCleanup.limits
        },
        broadValleyRebalance: {
          changed: broadValleyRebalance.changed,
          reason: broadValleyRebalance.reason,
          selected: broadValleyRebalance.selected,
          diagnostics: broadValleyRebalance.diagnostics,
          verification: broadValleyRebalance.verification
        },
        postRsp: {
          maximumAbsoluteResidualDb: (finalMetrics == null ? void 0 : finalMetrics.rspMaxDeviationDb) ?? null,
          rmsResidualDb: (finalMetrics == null ? void 0 : finalMetrics.rspRmsDeviationDb) ?? null,
          meanSignedResidualDb: (finalMetrics == null ? void 0 : finalMetrics.rspMeanSignedResidualDb) ?? null,
          shapeRmsResidualDb: (finalMetrics == null ? void 0 : finalMetrics.rspShapeRmsDeviationDb) ?? null
        },
        protectedNullRegions,
        nearTargetProtectionRejectionCount: operationCounts.nearTargetProtectionRejections || 0,
        p14SafetyRejectionCount: 0,
        protectedNullWorseningRejectionCount: operationCounts.protectedNullWorseningRejections || 0,
        mergedFilterOperationCount: operationCounts.mergedFilterOperations || 0,
        replacedFilterOperationCount: operationCounts.replacedFilterOperations || 0,
        productHeadroomRejections: []
      },
      bankDiagnostics: {
        completedBankEvaluationCount: bankEvalCount,
        selectedBankLimits: {
          maxAggregateBoostDb: finalBankLimits.maxAggregateBoostDb,
          maxAggregateBoostHz: finalBankLimits.maxAggregateBoostHz,
          maxAggregateCutDb: finalBankLimits.maxAggregateCutDb,
          maxAggregateCutHz: finalBankLimits.maxAggregateCutHz
        },
        finalBankValidationPassed: bankValidationPassed,
        fallbackOccurred,
        fallbackType,
        invariantViolation
      },
      checkpointSummaries: [],
      worstResidualDiagnostics: [],
      selectionReason: `House-curve fitter (${selectedStartLabel} start, ${objectiveLabel}): ${operations} operations, RSP max ${((_c = (_b = selected.baselineRspMetrics) == null ? void 0 : _b.maximumAbsoluteResidualDb) == null ? void 0 : _c.toFixed(1)) ?? "—"}→${((_d = finalMetrics == null ? void 0 : finalMetrics.rspMaxDeviationDb) == null ? void 0 : _d.toFixed(1)) ?? "—"} dB, RMS ${((_f = (_e = selected.baselineRspMetrics) == null ? void 0 : _e.rmsResidualDb) == null ? void 0 : _f.toFixed(1)) ?? "—"}→${((_g = finalMetrics == null ? void 0 : finalMetrics.rspRmsDeviationDb) == null ? void 0 : _g.toFixed(1)) ?? "—"} dB. ${stopReason}.`,
      revisionDiagnostics: { attempts: [] },
      requestedP19ToleranceDb: Number.isFinite(Number(options.targetToleranceDb)) ? Number(options.targetToleranceDb) : 0,
      operationCounts,
      __designEqTrace__: {
        inputCollectDiagnostics: options.collectDiagnostics !== false,
        detectedRegionCount: null,
        appendTrialCount: null,
        revisionTrialCount: null,
        candidateAcceptanceDiagnosticsCount: 0,
        stopReason
      }
    };
  }
  const objectiveKey = (candidate) => [
    candidate == null ? void 0 : candidate.canonicalVerticalOffsetDb,
    candidate == null ? void 0 : candidate.assessmentStartHz,
    candidate == null ? void 0 : candidate.assessmentEndHz,
    candidate == null ? void 0 : candidate.correctionStartHz,
    candidate == null ? void 0 : candidate.correctionEndHz
  ].join("|");
  function outsideProtectedNulls(frequency, regions) {
    return !regions.some((region) => frequency >= region.startHz && frequency <= region.endHz);
  }
  function rankingMetrics(curve, candidate, protectedNullRegions) {
    const maximumCurve = Array.isArray(candidate == null ? void 0 : candidate.maximumSplCurveBeforeEq) ? applyBassSmoothing(candidate.maximumSplCurveBeforeEq, "third") : [];
    const hasMaximumEnvelope = maximumCurve.length > 0;
    const assessedPoints = applyBassSmoothing(curve || [], "third").filter((point) => point.frequency >= candidate.correctionStartHz && point.frequency <= candidate.correctionEndHz).filter((point) => outsideProtectedNulls(point.frequency, protectedNullRegions));
    const points = assessedPoints.map((point) => {
      const targetSpl = interpolateCanonicalTarget(candidate.productionHouseCurveTarget, point.frequency);
      const residualDb = point.spl - targetSpl;
      const maximumSpl = hasMaximumEnvelope ? interpolateCurveSpl(maximumCurve, point.frequency) : null;
      if (Number.isFinite(residualDb) && residualDb < 0 && Number.isFinite(maximumSpl) && maximumSpl < targetSpl - 0.05) return null;
      return residualDb;
    }).filter(Number.isFinite);
    if (!points.length) {
      return assessedPoints.length ? { maximumAbsoluteResidualDb: 0, rmsResidualDb: 0, meanAbsoluteResidualDb: 0 } : { maximumAbsoluteResidualDb: null, rmsResidualDb: null, meanAbsoluteResidualDb: null };
    }
    return {
      maximumAbsoluteResidualDb: Math.max(...points.map(Math.abs)),
      rmsResidualDb: Math.sqrt(points.reduce((sum, value) => sum + value ** 2, 0) / points.length),
      meanAbsoluteResidualDb: points.reduce((sum, value) => sum + Math.abs(value), 0) / points.length
    };
  }
  function interpolateCurveSpl(curve, frequency) {
    const points = Array.isArray(curve) ? curve : [];
    if (!points.length || !Number.isFinite(frequency)) return null;
    if (frequency <= points[0].frequency) return Number(points[0].spl);
    if (frequency >= points.at(-1).frequency) return Number(points.at(-1).spl);
    const upperIndex = points.findIndex((point) => point.frequency >= frequency);
    const low = points[upperIndex - 1];
    const high = points[upperIndex];
    const span = high.frequency - low.frequency;
    if (!(span > 0)) return Number(low.spl);
    const ratio = (frequency - low.frequency) / span;
    return Number(low.spl) + (Number(high.spl) - Number(low.spl)) * ratio;
  }
  function avoidableTargetShortfallMetrics(curve, candidate, protectedNullRegions) {
    if (!Array.isArray(candidate == null ? void 0 : candidate.maximumSplCurveBeforeEq) || !candidate.maximumSplCurveBeforeEq.length) {
      return { maximumDb: null, rmsDb: null, meanDb: null, pointCount: 0 };
    }
    const maximumCurve = applyBassSmoothing(candidate.maximumSplCurveBeforeEq, "third");
    const shortfalls = applyBassSmoothing(curve || [], "third").filter((point) => point.frequency >= candidate.correctionStartHz && point.frequency <= candidate.correctionEndHz).filter((point) => outsideProtectedNulls(point.frequency, protectedNullRegions)).map((point) => {
      const targetSpl = interpolateCanonicalTarget(candidate.productionHouseCurveTarget, point.frequency);
      const maximumSpl = interpolateCurveSpl(maximumCurve, point.frequency);
      if (!Number.isFinite(targetSpl) || !Number.isFinite(maximumSpl) || maximumSpl < targetSpl - 0.05) return null;
      return Math.max(0, targetSpl - point.spl);
    }).filter(Number.isFinite);
    if (!shortfalls.length) return { maximumDb: null, rmsDb: null, meanDb: null, pointCount: 0 };
    return {
      maximumDb: Math.max(...shortfalls),
      rmsDb: Math.sqrt(shortfalls.reduce((sum, value) => sum + value ** 2, 0) / shortfalls.length),
      meanDb: shortfalls.reduce((sum, value) => sum + value, 0) / shortfalls.length,
      pointCount: shortfalls.length
    };
  }
  function preEqCurve(candidate) {
    if (Array.isArray(candidate == null ? void 0 : candidate.rspBeforePeqAtOperatingLevel) && candidate.rspBeforePeqAtOperatingLevel.length) {
      return candidate.rspBeforePeqAtOperatingLevel;
    }
    const corrections = new Map(((candidate == null ? void 0 : candidate.combinedEqCurve) || []).map((point) => [Number(point.frequency), Number(point.spl)]));
    return ((candidate == null ? void 0 : candidate.finalPostEqCurve) || []).map((point) => ({
      frequency: point.frequency,
      spl: point.spl - (corrections.get(Number(point.frequency)) || 0)
    }));
  }
  function annotateCandidatePoolForHouseCurveRanking(candidates) {
    const source = Array.isArray(candidates) ? candidates : [];
    const nullsByRequest = /* @__PURE__ */ new Map();
    source.forEach((candidate) => {
      var _a;
      if ((candidate == null ? void 0 : candidate.designEqFitProfile) !== "house_curve") return;
      const regions = (_a = candidate == null ? void 0 : candidate.houseCurveDiagnostics) == null ? void 0 : _a.protectedNullRegions;
      if (Array.isArray(regions)) nullsByRequest.set(objectiveKey(candidate), regions);
    });
    return source.map((candidate) => {
      const protectedNullRegions = nullsByRequest.get(objectiveKey(candidate)) || (candidate == null ? void 0 : candidate.protectedNullRegions) || [];
      const postEqMetrics = rankingMetrics(candidate == null ? void 0 : candidate.finalPostEqCurve, candidate, protectedNullRegions);
      const preEqMetrics = rankingMetrics(preEqCurve(candidate), candidate, protectedNullRegions);
      const avoidableShortfall = avoidableTargetShortfallMetrics(
        candidate == null ? void 0 : candidate.finalPostEqCurve,
        candidate,
        protectedNullRegions
      );
      return {
        ...candidate,
        preEqHouseCurveErrorDb: preEqMetrics.rmsResidualDb,
        postEqHouseCurveErrorDb: postEqMetrics.rmsResidualDb,
        houseCurveRankingMaxResidualDb: postEqMetrics.maximumAbsoluteResidualDb,
        houseCurveRankingRmsResidualDb: postEqMetrics.rmsResidualDb,
        houseCurveRankingMeanAbsoluteResidualDb: postEqMetrics.meanAbsoluteResidualDb,
        avoidableTargetShortfallMaxDb: avoidableShortfall.maximumDb,
        avoidableTargetShortfallRmsDb: avoidableShortfall.rmsDb,
        avoidableTargetShortfallMeanDb: avoidableShortfall.meanDb,
        avoidableTargetShortfallPointCount: avoidableShortfall.pointCount,
        houseCurveRankingProtectedNullCount: protectedNullRegions.length
      };
    });
  }
  const RP22_BASS_METRIC_SCHEMA_VERSION = 21;
  const BASS_OPTIMISER_PROTOCOL_VERSION = "bass-optimiser-protocol-v1";
  const BASS_OPTIMISER_POOL_VERSION = "bass-optimiser-pool-v41-physically-qualified-p18";
  const HOUSE_CURVE_ENGINE_VERSION = "house-curve-shape-fit-v41-physically-qualified-p18";
  const BASS_RESULT_SCHEMA_VERSION = 34;
  const BASS_METRIC_SCHEMA_VERSION = RP22_BASS_METRIC_SCHEMA_VERSION;
  const BASS_OPTIMISER_POOL_PROPERTY = "pool";
  const BASS_OPTIMISER_VERSIONS = Object.freeze({
    protocolVersion: BASS_OPTIMISER_PROTOCOL_VERSION,
    poolVersion: BASS_OPTIMISER_POOL_VERSION,
    engineVersion: HOUSE_CURVE_ENGINE_VERSION,
    resultSchemaVersion: BASS_RESULT_SCHEMA_VERSION,
    metricSchemaVersion: BASS_METRIC_SCHEMA_VERSION
  });
  function describeOptimiserCompatibility(expected, actual, reason = "version-mismatch") {
    const value = (item) => item == null ? "missing" : String(item);
    return `${reason} (expected protocol=${value(expected == null ? void 0 : expected.protocolVersion)}, actual protocol=${value(actual == null ? void 0 : actual.protocolVersion)}; expected pool=${value(expected == null ? void 0 : expected.poolVersion)}, actual pool=${value(actual == null ? void 0 : actual.poolVersion)}; expected engine=${value(expected == null ? void 0 : expected.engineVersion)}, actual engine=${value(actual == null ? void 0 : actual.engineVersion)}; expected result-schema=${value(expected == null ? void 0 : expected.resultSchemaVersion)}, actual result-schema=${value(actual == null ? void 0 : actual.resultSchemaVersion)}; expected metric-schema=${value(expected == null ? void 0 : expected.metricSchemaVersion)}, actual metric-schema=${value(actual == null ? void 0 : actual.metricSchemaVersion)}; expected fingerprint=${value(expected == null ? void 0 : expected.fingerprint)}, actual fingerprint=${value(actual == null ? void 0 : actual.fingerprint)})`;
  }
  function validateOptimiserVersions(actual, expected = BASS_OPTIMISER_VERSIONS) {
    const field = ["protocolVersion", "poolVersion", "engineVersion", "resultSchemaVersion", "metricSchemaVersion"].find((name) => (actual == null ? void 0 : actual[name]) !== (expected == null ? void 0 : expected[name]));
    return field ? { valid: false, field, message: describeOptimiserCompatibility(expected, actual, `${field}-mismatch`) } : { valid: true, field: null, message: null };
  }
  const envelope = (type, requestId, fingerprint, identity, diagnosticToken = null, collectDiagnostics = null) => ({
    type,
    requestId,
    fingerprint,
    identity: identity || null,
    diagnosticToken,
    collectDiagnostics,
    ...BASS_OPTIMISER_VERSIONS
  });
  function createProgressMessage(requestId, fingerprint, progress, identity = null, diagnosticToken = null, collectDiagnostics = null) {
    return { ...envelope("progress", requestId, fingerprint, identity, diagnosticToken, collectDiagnostics), progress, postedAtMs: Date.now() };
  }
  function createCompleteMessage(requestId, fingerprint, pool, identity = null, diagnosticToken = null, collectDiagnostics = null) {
    return { ...envelope("complete", requestId, fingerprint, identity, diagnosticToken, collectDiagnostics), [BASS_OPTIMISER_POOL_PROPERTY]: pool, postedAtMs: Date.now() };
  }
  function createErrorMessage(requestId, fingerprint, error, identity = null, diagnosticToken = null, collectDiagnostics = null) {
    return { ...envelope("error", requestId, fingerprint, identity, diagnosticToken, collectDiagnostics), error, postedAtMs: Date.now() };
  }
  function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  const fixed = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(4) : "null";
  function buildFilterBankSignature(candidate) {
    return (Array.isArray(candidate == null ? void 0 : candidate.generatedFilterBank) ? candidate.generatedFilterBank : []).filter((filter) => filter == null ? void 0 : filter.enabled).map((filter) => `${fixed(filter.frequencyHz)}/${fixed(filter.gainDb)}/Q${fixed(filter.Q)}`).join("|") || "(none)";
  }
  function buildCorrectionCurveSignature(candidate) {
    return buildCurveSignature((candidate == null ? void 0 : candidate.combinedEqCurve) || (candidate == null ? void 0 : candidate.correctionCurve));
  }
  function buildCurveSignature(curve) {
    const points = Array.isArray(curve) ? curve : [];
    if (!points.length) return "curve:empty";
    const indexes = [.../* @__PURE__ */ new Set([0, Math.floor(points.length / 4), Math.floor(points.length / 2), Math.floor(points.length * 3 / 4), points.length - 1])];
    return `curve:${points.length}:${hashText(indexes.map((index) => {
      var _a, _b;
      return `${fixed((_a = points[index]) == null ? void 0 : _a.frequency)}/${fixed((_b = points[index]) == null ? void 0 : _b.spl)}`;
    }).join("|"))}`;
  }
  function candidateStartStrategy(candidate) {
    return (candidate == null ? void 0 : candidate.startStrategy) || ((candidate == null ? void 0 : candidate.designEqFitProfile) === "house_curve" ? "multi-start" : "single");
  }
  function buildCandidateId(candidate) {
    if (!candidate) return null;
    const identity = [
      candidate.designEqFitProfile || "standard",
      candidateStartStrategy(candidate),
      fixed(candidate.canonicalVerticalOffsetDb),
      fixed(candidate.assessmentStartHz),
      fixed(candidate.assessmentEndHz),
      buildCorrectionCurveSignature(candidate),
      buildCurveSignature(candidate.finalPostEqCurve)
    ].join("|");
    return `bass-candidate:${hashText(identity)}`;
  }
  function stampCandidateAuthority(candidate) {
    if (!candidate) return candidate;
    const candidateId = buildCandidateId(candidate);
    const filterBankSignature = buildFilterBankSignature(candidate);
    const correctionCurveSignature = buildCorrectionCurveSignature(candidate);
    const postEqCurveSignature = buildCurveSignature(candidate.finalPostEqCurve);
    const stampProtectedRegions = (regions) => (Array.isArray(regions) ? regions : []).map((region) => ({
      ...region,
      selectedCandidateId: candidateId,
      curveSignature: postEqCurveSignature,
      correctionCurveSignature,
      filterBankSignature
    }));
    const protectedNullRegions = stampProtectedRegions(candidate.protectedNullRegions);
    const houseCurveDiagnostics = candidate.houseCurveDiagnostics ? {
      ...candidate.houseCurveDiagnostics,
      protectedNullRegions: stampProtectedRegions(candidate.houseCurveDiagnostics.protectedNullRegions)
    } : candidate.houseCurveDiagnostics;
    return {
      ...candidate,
      candidateId,
      filterBankSignature,
      correctionCurveSignature,
      postEqCurveSignature,
      protectedNullRegions,
      houseCurveDiagnostics,
      startStrategy: candidateStartStrategy(candidate)
    };
  }
  function stampPoolAuthority(pool) {
    if (!pool) return pool;
    const candidates = (Array.isArray(pool.candidates) ? pool.candidates : []).map(stampCandidateAuthority);
    const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
    const selectablePool = (Array.isArray(pool.selectablePool) ? pool.selectablePool : []).map((candidate) => byId.get(buildCandidateId(candidate)) || stampCandidateAuthority(candidate));
    return {
      ...pool,
      candidates,
      selectablePool,
      ...BASS_OPTIMISER_VERSIONS
    };
  }
  const finite$4 = (value) => Number.isFinite(Number(value));
  function smoothThirdOctavePowerMean(curve) {
    const sorted = (curve || []).filter((point) => finite$4(point == null ? void 0 : point.frequency) && finite$4(point == null ? void 0 : point.spl) && point.frequency > 0).map((point) => ({ ...point, frequency: Number(point.frequency), spl: Number(point.spl) })).sort((a, b) => a.frequency - b.frequency);
    if (!sorted.length) return [];
    const halfBandRatio = Math.pow(2, 1 / 6);
    return sorted.map((centre) => {
      const lowerHz = centre.frequency / halfBandRatio;
      const upperHz = centre.frequency * halfBandRatio;
      const samples = sorted.filter((point) => point.frequency >= lowerHz && point.frequency <= upperHz);
      const meanPower = samples.reduce((sum, point) => sum + Math.pow(10, point.spl / 10), 0) / samples.length;
      return { frequency: centre.frequency, spl: 10 * Math.log10(meanPower), sampleCount: samples.length, lowerHz, upperHz };
    });
  }
  const SHADOW_P18_FREQUENCIES_BY_BASIS = P18_THRESHOLDS_BY_BASIS;
  const SHADOW_P18_FREQUENCIES = P18_THRESHOLDS_BY_BASIS.recommended;
  const SHADOW_SEVERE_NULL_DEPTH_DB = 10;
  const LEVELS_DESC$1 = ["L4", "L3", "L2", "L1"];
  const REFERENCE_SOURCE_DB = 94;
  const REFERENCE_SOURCE_AMPLITUDE = Math.pow(10, REFERENCE_SOURCE_DB / 20);
  const CONTIGUOUS_GUARD_OCTAVES = 1 / 6;
  const finite$3 = (value) => Number.isFinite(Number(value));
  const dbToAmplitude = (db) => Math.pow(10, Number(db) / 20);
  const amplitudeToDb = (value) => 20 * Math.log10(Math.max(Number(value), 1e-12));
  function sortedPoints(points, valueKey) {
    return (points || []).filter((point) => finite$3(point == null ? void 0 : point.frequency) && finite$3(point == null ? void 0 : point[valueKey])).sort((a, b) => a.frequency - b.frequency);
  }
  function interpolateInRange(points, frequency, valueKey) {
    const sorted = sortedPoints(points, valueKey);
    if (!sorted.length || frequency < sorted[0].frequency || frequency > sorted[sorted.length - 1].frequency) return null;
    if (frequency === sorted[0].frequency) return sorted[0][valueKey];
    if (frequency === sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1][valueKey];
    const upperIndex = sorted.findIndex((point) => point.frequency >= frequency);
    const low = sorted[upperIndex - 1];
    const high = sorted[upperIndex];
    const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
    return low[valueKey] + (high[valueKey] - low[valueKey]) * ratio;
  }
  function productCapabilityDefinition(sub) {
    var _a, _b;
    if (Array.isArray(sub == null ? void 0 : sub.shadowCapabilityCurve) && sub.shadowCapabilityCurve.length >= 2) {
      const curve = sortedPoints(sub.shadowCapabilityCurve, "spl");
      return curve.length >= 2 ? { curve, amplifierLimitDb: null, modelKey: sub.modelKey || "synthetic" } : null;
    }
    const modelKey = normaliseModelKey((sub == null ? void 0 : sub.modelKey) ?? (sub == null ? void 0 : sub.model) ?? "");
    const approvedDb = getApprovedContinuousSplDb(modelKey);
    const registryCurve = getSubwooferCurve(modelKey);
    if (!finite$3(approvedDb) || !Array.isArray(registryCurve) || registryCurve.length < 2) return null;
    let sourceCurve = registryCurve.map((point) => ({ frequency: Number(point.hz), spl: Number(point.db) }));
    const approvedRangeHz = getApprovedFrequencyRangeHz(modelKey);
    const approvedUpperHz = Array.isArray(approvedRangeHz) ? Number(approvedRangeHz[1]) : null;
    const lastMeasuredPoint = sourceCurve[sourceCurve.length - 1];
    let approvedRangeCompletion = null;
    if (finite$3(approvedUpperHz) && approvedUpperHz > lastMeasuredPoint.frequency) {
      sourceCurve = [...sourceCurve, { frequency: approvedUpperHz, spl: lastMeasuredPoint.spl }];
      approvedRangeCompletion = {
        method: "approved-range-edge-hold",
        measuredThroughHz: lastMeasuredPoint.frequency,
        completedThroughHz: approvedUpperHz
      };
    }
    const anchorBand = sourceCurve.filter((point) => point.frequency >= 30 && point.frequency <= 120);
    if (!anchorBand.length) return null;
    const shapeAnchorDb = Math.max(...anchorBand.map((point) => point.spl));
    const amplifierLimitDb = [sub == null ? void 0 : sub.amplifierLimitDb, (_a = sub == null ? void 0 : sub.amplifier) == null ? void 0 : _a.continuousSplLimitDb, (_b = sub == null ? void 0 : sub.tuning) == null ? void 0 : _b.amplifierLimitDb].find(finite$3);
    return {
      modelKey,
      amplifierLimitDb: finite$3(amplifierLimitDb) ? Number(amplifierLimitDb) : null,
      approvedRangeCompletion,
      curve: sourceCurve.map((point) => ({
        frequency: point.frequency,
        spl: Math.min(Number(approvedDb) + point.spl - shapeAnchorDb, finite$3(amplifierLimitDb) ? Number(amplifierLimitDb) : Infinity)
      }))
    };
  }
  function validateSourceMapping(activeSubs, transfers) {
    const subIds = activeSubs.map((sub) => typeof (sub == null ? void 0 : sub.id) === "string" ? sub.id.trim() : "");
    const transferIds = transfers.map((transfer) => typeof (transfer == null ? void 0 : transfer.sourceId) === "string" ? transfer.sourceId.trim() : "");
    if (subIds.some((id) => !id)) return { valid: false, reason: "Every active subwoofer requires a stable source ID." };
    if (transferIds.some((id) => !id)) return { valid: false, reason: "Every per-source transfer requires a stable source ID." };
    if (new Set(subIds).size !== subIds.length) return { valid: false, reason: "Duplicate active subwoofer source IDs were rejected." };
    if (new Set(transferIds).size !== transferIds.length) return { valid: false, reason: "Duplicate per-source transfer IDs were rejected." };
    const transferMap = new Map(transfers.map((transfer) => [transfer.sourceId.trim(), transfer]));
    const missing = subIds.filter((id) => !transferMap.has(id));
    if (missing.length) return { valid: false, reason: `Missing per-source transfer for ${missing.join(", ")}.` };
    const subSet = new Set(subIds);
    const orphans = transferIds.filter((id) => !subSet.has(id));
    if (orphans.length) return { valid: false, reason: `Orphan per-source transfer for ${orphans.join(", ")}.` };
    return { valid: true, matched: activeSubs.map((sub) => ({ sub, transfer: transferMap.get(sub.id.trim()) })) };
  }
  function targetAt(frequency, cutoffHz, targetDb) {
    const fullTargetHz = cutoffHz * Math.pow(2, 1 / 3);
    if (frequency <= cutoffHz) return targetDb - 3;
    if (frequency >= fullTargetHz) return targetDb;
    return targetDb - 3 + 3 * (Math.log2(frequency / cutoffHz) / (1 / 3));
  }
  function underTargetRegions(curve, cutoffHz, targetDb) {
    const misses = curve.filter((point) => point.frequency >= cutoffHz).map((point) => ({
      frequency: point.frequency,
      shortfallDb: targetAt(point.frequency, cutoffHz, targetDb) - point.spl
    }));
    const regions = [];
    let active = [];
    const close = () => {
      if (!active.length) return;
      const startHz = active[0].frequency;
      const endHz = active[active.length - 1].frequency;
      const bandwidthOctaves = endHz > startHz ? Math.log2(endHz / startHz) : 0;
      const depthDb = Math.max(...active.map((point) => point.shortfallDb));
      const broad = bandwidthOctaves >= CONTIGUOUS_GUARD_OCTAVES;
      const severe = depthDb > SHADOW_SEVERE_NULL_DEPTH_DB;
      regions.push({ startHz, endHz, bandwidthHz: endHz - startHz, bandwidthOctaves, depthDb, broad, severe, classification: broad ? "broad miss" : severe ? "narrow severe miss" : "narrow shallow miss" });
      active = [];
    };
    misses.forEach((point) => point.shortfallDb > 0 ? active.push(point) : close());
    close();
    return regions;
  }
  function heuristicCauses({ worstFrequency, rawCurve, postEqCurve, sourceDiagnostics }) {
    const causes = [];
    const rawPoint = rawCurve.reduce((nearest, point) => !nearest || Math.abs(point.frequency - worstFrequency) < Math.abs(nearest.frequency - worstFrequency) ? point : nearest, null);
    const post = interpolateInRange(postEqCurve, worstFrequency, "spl");
    if (finite$3(rawPoint == null ? void 0 : rawPoint.spl) && finite$3(post) && rawPoint.spl - post > 0.25) causes.push("EQ headroom");
    if (finite$3(rawPoint == null ? void 0 : rawPoint.energeticSpl) && rawPoint.energeticSpl - rawPoint.spl > 3) causes.push("acoustic cancellation");
    const rolledOff = sourceDiagnostics.some((source) => {
      const atWorst = interpolateInRange(source.capabilityCurve, worstFrequency, "spl");
      const at80 = interpolateInRange(source.capabilityCurve, 80, "spl");
      return finite$3(atWorst) && finite$3(at80) && atWorst < at80 - 3;
    });
    if (rolledOff) causes.push("product roll-off");
    if (sourceDiagnostics.some((source) => !finite$3(source.amplifierLimitDb))) causes.push("missing amplifier data");
    return causes.length ? causes : ["no single cause identified"];
  }
  function assessShadowPairedP14P18({ activeSubs = [], perSourceComplexTransfers = [], targetBasis = "minimum", upperFrequencyHz = 120 } = {}) {
    const basis = normalizeP14TargetBasis(targetBasis);
    const transfers = Array.isArray(perSourceComplexTransfers) ? perSourceComplexTransfers : [];
    const mapping = validateSourceMapping(activeSubs, transfers);
    if (!mapping.valid) return { status: "INCOMPLETE DATA", reason: mapping.reason, targetBasis: basis, levelResults: [] };
    const invalidTransfer = mapping.matched.find(({ transfer }) => !Array.isArray(transfer == null ? void 0 : transfer.points) || transfer.points.length < 2);
    if (invalidTransfer) return { status: "INCOMPLETE DATA", reason: `Missing complex transfer points for ${invalidTransfer.sub.id}.`, targetBasis: basis, levelResults: [] };
    const prepared = mapping.matched.map(({ sub, transfer }) => ({ sub, transfer: { ...transfer, points: sortedPoints(transfer.points, "re") }, capability: productCapabilityDefinition(sub) }));
    const missingCapability = prepared.find((entry) => !entry.capability);
    if (missingCapability) return { status: "INCOMPLETE DATA", reason: `Missing approved product capability data for ${missingCapability.sub.id}.`, targetBasis: basis, levelResults: [] };
    const frequencies = sortedPoints(prepared[0].transfer.points, "re").map((point) => point.frequency).filter((frequency) => frequency <= upperFrequencyHz);
    const sourceDiagnostics = prepared.map(({ sub, transfer, capability: capability2 }) => ({
      sourceId: sub.id,
      modelKey: capability2.modelKey,
      amplifierLimitDb: capability2.amplifierLimitDb,
      transferRangeHz: [transfer.points[0].frequency, transfer.points[transfer.points.length - 1].frequency],
      productRangeHz: [capability2.curve[0].frequency, capability2.curve[capability2.curve.length - 1].frequency],
      approvedRangeCompletion: capability2.approvedRangeCompletion || null,
      capabilityCurve: capability2.curve
    }));
    const rawDeliveredCurve = [];
    for (const frequency of frequencies) {
      let re = 0;
      let im = 0;
      let energeticPower = 0;
      let complete = true;
      for (const { transfer, capability: capability2 } of prepared) {
        const transferRe = interpolateInRange(transfer.points, frequency, "re");
        const transferIm = interpolateInRange(transfer.points, frequency, "im");
        const capabilityDb = interpolateInRange(capability2.curve, frequency, "spl");
        if (![transferRe, transferIm, capabilityDb].every(finite$3)) {
          complete = false;
          break;
        }
        const hRe = transferRe / REFERENCE_SOURCE_AMPLITUDE;
        const hIm = transferIm / REFERENCE_SOURCE_AMPLITUDE;
        const sourceAmplitude = dbToAmplitude(capabilityDb);
        const sourceRe = sourceAmplitude * hRe;
        const sourceIm = sourceAmplitude * hIm;
        re += sourceRe;
        im += sourceIm;
        energeticPower += sourceRe * sourceRe + sourceIm * sourceIm;
      }
      if (complete) rawDeliveredCurve.push({ frequency, spl: amplitudeToDb(Math.hypot(re, im)), re, im, energeticSpl: 10 * Math.log10(Math.max(energeticPower, 1e-24)) });
    }
    if (!rawDeliveredCurve.length) return { status: "INCOMPLETE DATA", reason: "No shared product-and-transfer frequency range is available.", targetBasis: basis, levelResults: [] };
    const postEqDeliveredCurve = rawDeliveredCurve.map((point) => ({
      frequency: point.frequency,
      spl: point.spl - P14_SAFETY_MARGIN_DB,
      positiveEqCostDb: 0,
      rawCapabilityDb: point.spl
    }));
    const smoothedDeliveredCurve = smoothThirdOctavePowerMean(postEqDeliveredCurve);
    const thresholds = p14ThresholdsForBasis(basis);
    const levelResults = LEVELS_DESC$1.map((level) => {
      const cutoffHz = SHADOW_P18_FREQUENCIES_BY_BASIS[basis][level];
      const unsupported = sourceDiagnostics.filter((source) => source.transferRangeHz[0] > cutoffHz || source.productRangeHz[0] > cutoffHz || source.transferRangeHz[1] < upperFrequencyHz || source.productRangeHz[1] < upperFrequencyHz);
      if (unsupported.length) return { level, cutoffHz, status: "INCOMPLETE DATA", passes: null, reason: `Required ${cutoffHz}–${upperFrequencyHz} Hz data is unsupported for ${unsupported.map((source) => source.sourceId).join(", ")}.` };
      const assessed = smoothedDeliveredCurve.filter((point) => point.frequency >= cutoffHz && point.frequency <= upperFrequencyHz);
      const targetEnvelope = assessed.map((point) => ({ frequency: point.frequency, spl: targetAt(point.frequency, cutoffHz, thresholds[level]) }));
      const smoothedRegions = underTargetRegions(assessed, cutoffHz, thresholds[level]);
      const unsmoothedRegions = underTargetRegions(postEqDeliveredCurve.filter((point) => point.frequency <= upperFrequencyHz), cutoffHz, thresholds[level]);
      const failsBroad = smoothedRegions.some((region) => region.broad);
      const failsSevere = unsmoothedRegions.some((region) => region.severe);
      const passes = !failsBroad && !failsSevere;
      const worst2 = assessed.reduce((lowest, point) => !lowest || point.spl < lowest.spl ? point : lowest, null);
      return { level, cutoffHz, targetDb: thresholds[level], status: passes ? "PASS" : "FAIL", passes, targetEnvelope, smoothedUnderTargetRegions: smoothedRegions, unsmoothedUnderTargetRegions: unsmoothedRegions, worstCapabilityDb: (worst2 == null ? void 0 : worst2.spl) ?? null, worstFrequencyHz: (worst2 == null ? void 0 : worst2.frequency) ?? null };
    });
    const winner = levelResults.find((result) => result.status === "PASS") || null;
    const displayLevel = winner || levelResults.find((result) => result.status !== "INCOMPLETE DATA") || levelResults[levelResults.length - 1];
    const band = smoothedDeliveredCurve.filter((point) => point.frequency >= ((displayLevel == null ? void 0 : displayLevel.cutoffHz) ?? 30) && point.frequency <= upperFrequencyHz);
    const worst = band.reduce((lowest, point) => !lowest || point.spl < lowest.spl ? point : lowest, null);
    const allRegions = (displayLevel == null ? void 0 : displayLevel.unsmoothedUnderTargetRegions) || [];
    return {
      status: winner ? "PASS" : levelResults.some((result) => result.status === "FAIL") ? "FAIL" : "INCOMPLETE DATA",
      targetBasis: basis,
      pairedP14Grade: (winner == null ? void 0 : winner.level) ?? "FAIL",
      pairedP18Grade: (winner == null ? void 0 : winner.level) ?? "FAIL",
      capabilityReserveDb: P14_SAFETY_MARGIN_DB,
      rawDeliveredCurve,
      postEqDeliveredCurve,
      smoothedDeliveredCurve,
      selectedTargetEnvelope: (displayLevel == null ? void 0 : displayLevel.targetEnvelope) || [],
      levelResults,
      worstCapabilityDb: (worst == null ? void 0 : worst.spl) ?? null,
      worstFrequencyHz: (worst == null ? void 0 : worst.frequency) ?? null,
      unsmoothedUnderTargetRegions: allRegions,
      longestContiguousUnderTarget: [...allRegions].sort((a, b) => b.bandwidthOctaves - a.bandwidthOctaves || b.depthDb - a.depthDb)[0] || null,
      eqHeadroomCostDb: Math.max(0, ...postEqDeliveredCurve.map((point) => point.positiveEqCostDb)),
      heuristicLimitingCause: heuristicCauses({ worstFrequency: worst == null ? void 0 : worst.frequency, rawCurve: rawDeliveredCurve, postEqCurve: postEqDeliveredCurve, sourceDiagnostics }),
      deliveredAtFrequencies: Object.fromEntries([15, 18, 25, 30].map((frequency) => [frequency, interpolateInRange(smoothedDeliveredCurve, frequency, "spl")])),
      sourceDiagnostics,
      method: {
        smoothing: "one-third-octave power mean: mean(10^(dB/10)), then 10log10",
        smoothingBounds: "centre / 2^(1/6) through centre × 2^(1/6)",
        transition: "log-frequency ramp from target −3 dB at cutoff to full target one-third octave above",
        contiguousGuardOctaves: CONTIGUOUS_GUARD_OCTAVES,
        severeNullDepthDb: SHADOW_SEVERE_NULL_DEPTH_DB,
        causeAttribution: "heuristic diagnostic only; multiple overlapping causes may be returned",
        upperFrequencyHz,
        normalization: "engine complex amplitude relative to 20 µPa divided by 10^(94/20), yielding dimensionless transfer",
        referenceSourceDb: REFERENCE_SOURCE_DB,
        referenceSourceAmplitude: REFERENCE_SOURCE_AMPLITUDE
      }
    };
  }
  const PAIRED_P14_P18_AUTHORITY_METHOD = "position-aware-paired-p14-p18";
  const PAIRED_P14_P18_AUTHORITY_VERSION = "1.3.0";
  const PAIRED_P14_P18_CONTRACT_SCHEMA_VERSION = "paired-p14-p18-production-contract:v2";
  const STATUS_VOCABULARY_VERSION = "paired-compliance-status:v1";
  const LEVELS = Object.freeze(["L1", "L2", "L3", "L4"]);
  const LEVELS_DESC = Object.freeze([...LEVELS].reverse());
  const finite$2 = (value) => Number.isFinite(Number(value));
  const numberOrNull = (value) => finite$2(value) ? Number(value) : null;
  function interpolate(points, frequency, valueKey = "spl") {
    const sorted = (points || []).filter((point) => finite$2(point == null ? void 0 : point.frequency) && finite$2(point == null ? void 0 : point[valueKey])).sort((a, b) => a.frequency - b.frequency);
    if (!sorted.length || frequency < sorted[0].frequency || frequency > sorted[sorted.length - 1].frequency) return null;
    const upperIndex = sorted.findIndex((point) => point.frequency >= frequency);
    if (upperIndex <= 0) return Number(sorted[0][valueKey]);
    const low = sorted[upperIndex - 1];
    const high = sorted[upperIndex];
    const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
    return Number(low[valueKey]) + (Number(high[valueKey]) - Number(low[valueKey])) * ratio;
  }
  function cleanCurve(curve, keys = []) {
    return (curve || []).map((point) => {
      const cleaned = { frequency: numberOrNull(point == null ? void 0 : point.frequency), spl: numberOrNull(point == null ? void 0 : point.spl) };
      keys.forEach((key) => {
        cleaned[key] = numberOrNull(point == null ? void 0 : point[key]);
      });
      return cleaned;
    }).filter((point) => point.frequency != null && point.spl != null);
  }
  function incompleteLevel(level, shadowLevel = null) {
    return {
      level,
      levelNumber: Number(level.slice(1)),
      cutoffHz: numberOrNull((shadowLevel == null ? void 0 : shadowLevel.cutoffHz) ?? SHADOW_P18_FREQUENCIES[level]),
      targetDb: numberOrNull(shadowLevel == null ? void 0 : shadowLevel.targetDb),
      status: "INCOMPLETE DATA",
      passes: null,
      targetEnvelope: [],
      worstCapabilityDb: null,
      limitingFrequencyHz: null,
      marginDb: null,
      shortfallDb: null,
      broadMiss: null,
      severeNull: null,
      smoothedUnderTargetRegions: [],
      unsmoothedUnderTargetRegions: [],
      missingDataReason: (shadowLevel == null ? void 0 : shadowLevel.reason) || "Required paired capability data is unavailable."
    };
  }
  function enrichLevel(level, shadowLevel, smoothedCurve) {
    if (!shadowLevel || shadowLevel.status === "INCOMPLETE DATA") return incompleteLevel(level, shadowLevel);
    const targetEnvelope = cleanCurve(shadowLevel.targetEnvelope);
    const margins = targetEnvelope.map((target) => {
      const deliveredDb = interpolate(smoothedCurve, target.frequency);
      return deliveredDb == null ? null : { frequency: target.frequency, deliveredDb, targetDb: target.spl, marginDb: deliveredDb - target.spl };
    }).filter(Boolean);
    if (!margins.length) return incompleteLevel(level, { ...shadowLevel, reason: "No complete target-envelope margin could be calculated." });
    const limiting = margins.reduce((worst, point) => !worst || point.marginDb < worst.marginDb ? point : worst, null);
    const marginDb = numberOrNull(limiting.marginDb);
    return {
      level,
      levelNumber: Number(level.slice(1)),
      cutoffHz: numberOrNull(shadowLevel.cutoffHz),
      targetDb: numberOrNull(shadowLevel.targetDb),
      status: shadowLevel.status,
      passes: shadowLevel.status === "PASS",
      targetEnvelope,
      worstCapabilityDb: numberOrNull(limiting.deliveredDb),
      limitingFrequencyHz: numberOrNull(limiting.frequency),
      marginDb,
      shortfallDb: marginDb == null ? null : Math.max(0, -marginDb),
      broadMiss: (shadowLevel.smoothedUnderTargetRegions || []).some((region) => region.broad === true),
      severeNull: (shadowLevel.unsmoothedUnderTargetRegions || []).some((region) => region.severe === true),
      smoothedUnderTargetRegions: shadowLevel.smoothedUnderTargetRegions || [],
      unsmoothedUnderTargetRegions: shadowLevel.unsmoothedUnderTargetRegions || [],
      missingDataReason: null
    };
  }
  function buildAssessment(shadow) {
    const shadowByLevel = Object.fromEntries((shadow.levelResults || []).map((result) => [result.level, result]));
    const levels = Object.fromEntries(LEVELS.map((level) => [level, enrichLevel(level, shadowByLevel[level], shadow.smoothedDeliveredCurve || [])]));
    const winner = LEVELS_DESC.map((level) => levels[level]).find((result) => result.status === "PASS") || null;
    const fallback = LEVELS_DESC.map((level) => levels[level]).find((result) => result.status === "FAIL") || null;
    const limitingLevel = winner || fallback;
    return {
      status: winner ? "PASS" : fallback ? "FAIL" : "INCOMPLETE DATA",
      achievedLevel: (winner == null ? void 0 : winner.level) ?? null,
      achievedLevelNumber: (winner == null ? void 0 : winner.levelNumber) ?? null,
      // Legacy aliases retained for existing diagnostic consumers.
      winningLevel: (winner == null ? void 0 : winner.level) ?? null,
      winningLevelNumber: (winner == null ? void 0 : winner.levelNumber) ?? null,
      p14: {
        worstCapabilityDb: (limitingLevel == null ? void 0 : limitingLevel.worstCapabilityDb) ?? null,
        limitingFrequencyHz: (limitingLevel == null ? void 0 : limitingLevel.limitingFrequencyHz) ?? null
      },
      p18: {
        extensionHz: (winner == null ? void 0 : winner.cutoffHz) ?? null,
        level: (winner == null ? void 0 : winner.level) ?? null
      },
      levels
    };
  }
  function rangesFromSources(sourceDiagnostics, key) {
    return (sourceDiagnostics || []).map((source) => ({ sourceId: source.sourceId, rangeHz: source[key] || [null, null] }));
  }
  function buildCoverage({ minimumShadow, recommendedShadow, activeSubs, transfers, upperFrequencyHz }) {
    const sourceDiagnostics = minimumShadow.sourceDiagnostics || recommendedShadow.sourceDiagnostics || [];
    const productDataRangeBySource = rangesFromSources(sourceDiagnostics, "productRangeHz");
    const transferDataRangeBySource = sourceDiagnostics.length ? rangesFromSources(sourceDiagnostics, "transferRangeHz") : (transfers || []).map((transfer) => {
      const frequencies = ((transfer == null ? void 0 : transfer.points) || []).map((point) => Number(point == null ? void 0 : point.frequency)).filter(Number.isFinite);
      return { sourceId: (transfer == null ? void 0 : transfer.sourceId) || null, rangeHz: frequencies.length ? [Math.min(...frequencies), Math.max(...frequencies)] : [null, null] };
    });
    const allRanges = [...productDataRangeBySource, ...transferDataRangeBySource].map((entry) => entry.rangeHz).filter((range) => finite$2(range == null ? void 0 : range[0]) && finite$2(range == null ? void 0 : range[1]));
    const sharedFrequencyRangeHz = allRanges.length ? [Math.max(...allRanges.map((range) => Number(range[0]))), Math.min(upperFrequencyHz, ...allRanges.map((range) => Number(range[1])))] : [null, null];
    const missingRequiredFrequencies = LEVELS.filter((level) => {
      const cutoff = SHADOW_P18_FREQUENCIES[level];
      return [minimumShadow, recommendedShadow].some((shadow) => {
        var _a, _b;
        return ((_b = (_a = shadow.levelResults) == null ? void 0 : _a.find((item) => item.level === level)) == null ? void 0 : _b.status) === "INCOMPLETE DATA";
      }) || !finite$2(sharedFrequencyRangeHz[0]) || sharedFrequencyRangeHz[0] > cutoff || sharedFrequencyRangeHz[1] < upperFrequencyHz;
    }).map((level) => ({ level, cutoffHz: SHADOW_P18_FREQUENCIES[level] }));
    const reason = minimumShadow.reason || recommendedShadow.reason || (missingRequiredFrequencies.length ? "One or more target levels lack required product or transfer coverage." : null);
    return { upperFrequencyHz, sharedFrequencyRangeHz, productDataRangeBySource, transferDataRangeBySource, missingRequiredFrequencies, missingDataReason: reason, activeSourceCount: activeSubs.length };
  }
  function selectedLevelResult(assessment, requestedLevel = null) {
    var _a;
    if (requestedLevel && ((_a = assessment == null ? void 0 : assessment.levels) == null ? void 0 : _a[requestedLevel])) return assessment.levels[requestedLevel];
    if (assessment.winningLevel) return assessment.levels[assessment.winningLevel];
    return LEVELS_DESC.map((level) => assessment.levels[level]).find((result) => result.status === "FAIL") || null;
  }
  function normalizeRequestedLevel(value) {
    const numeric = Number(String(value ?? 4).replace(/^L/i, ""));
    return `L${Math.max(1, Math.min(4, Math.round(Number.isFinite(numeric) ? numeric : 4)))}`;
  }
  function buildAuthoritySeparation(assessment, requestedLevel, requestedTargetSplDb) {
    var _a;
    const requestedResult = ((_a = assessment == null ? void 0 : assessment.levels) == null ? void 0 : _a[requestedLevel]) || null;
    const achievedLevel = (assessment == null ? void 0 : assessment.achievedLevel) ?? null;
    const requestedPassed = (requestedResult == null ? void 0 : requestedResult.status) === "PASS";
    const incomplete = !requestedResult || requestedResult.status === "INCOMPLETE DATA";
    return {
      requested: {
        level: requestedLevel,
        targetSplDb: finite$2(requestedTargetSplDb) ? Number(requestedTargetSplDb) : (requestedResult == null ? void 0 : requestedResult.targetDb) ?? null
      },
      achieved: {
        level: achievedLevel,
        levelNumber: (assessment == null ? void 0 : assessment.achievedLevelNumber) ?? null,
        p14: { ...assessment.p14 },
        p18: { ...assessment.p18 }
      },
      limitation: requestedPassed ? null : {
        primary: incomplete ? "incomplete data" : "output capability",
        shortfallDb: (requestedResult == null ? void 0 : requestedResult.shortfallDb) ?? null,
        limitingParameter: incomplete ? null : "P14",
        reason: incomplete ? (requestedResult == null ? void 0 : requestedResult.missingDataReason) ?? null : "Subwoofer output capability limited"
      }
    };
  }
  function buildLimitingResult(assessment, shadow, requestedLevel = null) {
    const selected = selectedLevelResult(assessment, requestedLevel);
    if (!selected) return { level: null, cutoffHz: null, targetDb: null, worstCapabilityDb: null, limitingFrequencyHz: null, marginDb: null, shortfallDb: null, broadMiss: null, severeNull: null, longestContiguousUnderTarget: null, smoothedUnderTargetRegions: [], unsmoothedUnderTargetRegions: [], heuristicCauses: [] };
    const longest = [...selected.unsmoothedUnderTargetRegions].sort((a, b) => Number(b.bandwidthOctaves) - Number(a.bandwidthOctaves) || Number(b.depthDb) - Number(a.depthDb))[0] || null;
    return {
      level: selected.level,
      cutoffHz: selected.cutoffHz,
      targetDb: selected.targetDb,
      worstCapabilityDb: selected.worstCapabilityDb,
      limitingFrequencyHz: selected.limitingFrequencyHz,
      marginDb: selected.marginDb,
      shortfallDb: selected.shortfallDb,
      broadMiss: selected.broadMiss,
      severeNull: selected.severeNull,
      longestContiguousUnderTarget: longest,
      smoothedUnderTargetRegions: selected.smoothedUnderTargetRegions,
      unsmoothedUnderTargetRegions: selected.unsmoothedUnderTargetRegions,
      heuristicCauses: shadow.heuristicLimitingCause || []
    };
  }
  function buildEqHeadroom(shadow, upperFrequencyHz, selectedCorrectionIdentity) {
    const points = (shadow.postEqDeliveredCurve || []).filter((point) => point.frequency >= 20 && point.frequency <= Math.min(120, upperFrequencyHz));
    const maximum = points.reduce((best, point) => Number(point.positiveEqCostDb) > best.costDb ? { costDb: Number(point.positiveEqCostDb), frequencyHz: Number(point.frequency) } : best, { costDb: 0, frequencyHz: null });
    return { assessmentRangeHz: [20, Math.min(120, upperFrequencyHz)], maximumPositiveEqCostDb: maximum.costDb, maximumPositiveEqCostFrequencyHz: maximum.frequencyHz, selectedCorrectionIdentity: selectedCorrectionIdentity ?? null };
  }
  function buildSourceResult(activeSubs, transfers, sourceDiagnostics) {
    const activeSourceIds = (activeSubs || []).map((sub) => typeof (sub == null ? void 0 : sub.id) === "string" ? sub.id.trim() : "");
    const transferIds = (transfers || []).map((transfer) => typeof (transfer == null ? void 0 : transfer.sourceId) === "string" ? transfer.sourceId.trim() : "");
    const activeSet = new Set(activeSourceIds);
    return {
      activeSourceIds,
      matchedSourceIds: transferIds.filter((id) => id && activeSet.has(id)),
      sourceDiagnostics: (sourceDiagnostics || []).map((source) => ({
        sourceId: source.sourceId,
        modelKey: source.modelKey,
        amplifierLimitDb: numberOrNull(source.amplifierLimitDb),
        transferRangeHz: source.transferRangeHz,
        productRangeHz: source.productRangeHz,
        approvedRangeCompletion: source.approvedRangeCompletion || null,
        capabilityCurve: cleanCurve(source.capabilityCurve)
      }))
    };
  }
  function calculatePairedP14P18ProductionAuthority(inputs = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const activeSubs = Array.isArray(inputs.activeSubs) ? inputs.activeSubs : [];
    const perSourceComplexTransfers = Array.isArray(inputs.perSourceComplexTransfers) ? inputs.perSourceComplexTransfers : [];
    const combinedEqCurve = Array.isArray(inputs.combinedEqCurve) ? inputs.combinedEqCurve : [];
    const selectedTargetBasis = normalizeP14TargetBasis(inputs.targetBasis ?? "minimum");
    const upperFrequencyHz = finite$2(inputs.upperFrequencyHz) ? Number(inputs.upperFrequencyHz) : 120;
    const common = { activeSubs, perSourceComplexTransfers, combinedEqCurve, upperFrequencyHz };
    const minimumShadow = assessShadowPairedP14P18({ ...common, targetBasis: "minimum" });
    const recommendedShadow = assessShadowPairedP14P18({ ...common, targetBasis: "recommended" });
    const minimum = buildAssessment(minimumShadow);
    const recommended = buildAssessment(recommendedShadow);
    const selectedAssessment = selectedTargetBasis === "recommended" ? recommended : minimum;
    const selectedShadow = selectedTargetBasis === "recommended" ? recommendedShadow : minimumShadow;
    const requestedLevel = normalizeRequestedLevel(inputs.requestedLevel);
    const separation = buildAuthoritySeparation(selectedAssessment, requestedLevel, inputs.requestedTargetSplDb);
    const requestedResult = selectedAssessment.levels[requestedLevel];
    const sourceDiagnostics = minimumShadow.sourceDiagnostics || recommendedShadow.sourceDiagnostics || [];
    const coverage = buildCoverage({ minimumShadow, recommendedShadow, activeSubs, transfers: perSourceComplexTransfers, upperFrequencyHz });
    const reason = selectedShadow.reason || coverage.missingDataReason || null;
    return {
      schemaVersion: PAIRED_P14_P18_CONTRACT_SCHEMA_VERSION,
      authority: { method: PAIRED_P14_P18_AUTHORITY_METHOD, version: PAIRED_P14_P18_AUTHORITY_VERSION, statusVocabularyVersion: STATUS_VOCABULARY_VERSION },
      status: (requestedResult == null ? void 0 : requestedResult.status) ?? "INCOMPLETE DATA",
      reason,
      selectedTargetBasis,
      ...separation,
      assessments: { minimum, recommended },
      curves: {
        rawDeliveredCurve: cleanCurve(selectedShadow.rawDeliveredCurve, ["re", "im", "energeticSpl"]),
        postEqDeliveredCurve: cleanCurve(selectedShadow.postEqDeliveredCurve, ["positiveEqCostDb"]),
        smoothedDeliveredCurve: cleanCurve(selectedShadow.smoothedDeliveredCurve, ["sampleCount", "lowerHz", "upperHz"]),
        selectedTargetEnvelope: ((_a = selectedLevelResult(selectedAssessment, requestedLevel)) == null ? void 0 : _a.targetEnvelope) || []
      },
      coverage,
      limitingResult: buildLimitingResult(selectedAssessment, selectedShadow, requestedLevel),
      eqHeadroom: buildEqHeadroom(selectedShadow, upperFrequencyHz, inputs.selectedCorrectionIdentity),
      sources: buildSourceResult(activeSubs, perSourceComplexTransfers, sourceDiagnostics),
      methodDiagnostics: {
        smoothing: ((_b = selectedShadow.method) == null ? void 0 : _b.smoothing) || "one-third-octave power mean: mean(10^(dB/10)), then 10log10",
        smoothingBounds: ((_c = selectedShadow.method) == null ? void 0 : _c.smoothingBounds) || "centre / 2^(1/6) through centre × 2^(1/6)",
        transition: ((_d = selectedShadow.method) == null ? void 0 : _d.transition) || "log-frequency ramp from target −3 dB at cutoff to full target one-third octave above",
        contiguousGuardOctaves: ((_e = selectedShadow.method) == null ? void 0 : _e.contiguousGuardOctaves) ?? 1 / 6,
        severeNullDepthDb: ((_f = selectedShadow.method) == null ? void 0 : _f.severeNullDepthDb) ?? SHADOW_SEVERE_NULL_DEPTH_DB,
        normalization: ((_g = selectedShadow.method) == null ? void 0 : _g.normalization) || "engine complex amplitude relative to 20 µPa divided by 10^(94/20), yielding dimensionless transfer",
        referenceSourceDb: ((_h = selectedShadow.method) == null ? void 0 : _h.referenceSourceDb) ?? 94,
        referenceSourceAmplitude: ((_i = selectedShadow.method) == null ? void 0 : _i.referenceSourceAmplitude) ?? Math.pow(10, 94 / 20)
      },
      fingerprints: { normalizedTransferFingerprint: inputs.normalizedTransferFingerprint ?? null, calibrationFingerprint: inputs.calibrationFingerprint ?? null },
      legacyScalarDiagnostic: { authoritative: false, value: inputs.legacyScalarDiagnostic ?? null }
    };
  }
  function buildPairedP14P18CandidateSummary(authority) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    const selected = (authority == null ? void 0 : authority.selectedTargetBasis) === "recommended" ? (_a = authority == null ? void 0 : authority.assessments) == null ? void 0 : _a.recommended : (_b = authority == null ? void 0 : authority.assessments) == null ? void 0 : _b.minimum;
    const limiting = authority == null ? void 0 : authority.limitingResult;
    return {
      status: (authority == null ? void 0 : authority.status) ?? null,
      selectedTargetBasis: (authority == null ? void 0 : authority.selectedTargetBasis) ?? null,
      requestedLevel: ((_c = authority == null ? void 0 : authority.requested) == null ? void 0 : _c.level) ?? null,
      requestedTargetSplDb: ((_d = authority == null ? void 0 : authority.requested) == null ? void 0 : _d.targetSplDb) ?? null,
      minimumAchievedLevel: ((_f = (_e = authority == null ? void 0 : authority.assessments) == null ? void 0 : _e.minimum) == null ? void 0 : _f.achievedLevel) ?? null,
      recommendedAchievedLevel: ((_h = (_g = authority == null ? void 0 : authority.assessments) == null ? void 0 : _g.recommended) == null ? void 0 : _h.achievedLevel) ?? null,
      selectedAchievedLevel: ((_i = authority == null ? void 0 : authority.achieved) == null ? void 0 : _i.level) ?? (selected == null ? void 0 : selected.achievedLevel) ?? null,
      selectedP18ExtensionHz: ((_k = (_j = authority == null ? void 0 : authority.achieved) == null ? void 0 : _j.p18) == null ? void 0 : _k.extensionHz) ?? ((_l = selected == null ? void 0 : selected.p18) == null ? void 0 : _l.extensionHz) ?? null,
      limitingFrequencyHz: (limiting == null ? void 0 : limiting.limitingFrequencyHz) ?? null,
      marginDb: (limiting == null ? void 0 : limiting.marginDb) ?? null,
      shortfallDb: (limiting == null ? void 0 : limiting.shortfallDb) ?? null,
      broadMiss: (limiting == null ? void 0 : limiting.broadMiss) ?? null,
      severeNull: (limiting == null ? void 0 : limiting.severeNull) ?? null,
      authorityMethod: ((_m = authority == null ? void 0 : authority.authority) == null ? void 0 : _m.method) ?? null,
      authorityVersion: ((_n = authority == null ? void 0 : authority.authority) == null ? void 0 : _n.version) ?? null,
      schemaVersion: (authority == null ? void 0 : authority.schemaVersion) ?? null
    };
  }
  const MULTI_SUB_COHERENT_EFFICIENCY_THRESHOLD = 0.4;
  const MULTI_SUB_RELATIVE_SHOULDER_RATIO = 0.5;
  const MULTI_SUB_CONSTITUENT_ENERGY_RATIO = 0.3;
  const FREQUENCY_MATCH_TOLERANCE_HZ = 5;
  function findClosestComplexPoint(points, frequency) {
    if (!Array.isArray(points) || !points.length) return null;
    let closest = null;
    let minDelta = Infinity;
    for (const point of points) {
      if (!point || !Number.isFinite(point.frequency) || !Number.isFinite(point.re) || !Number.isFinite(point.im)) continue;
      const delta = Math.abs(point.frequency - frequency);
      if (delta < minDelta) {
        minDelta = delta;
        closest = point;
      }
    }
    return closest && minDelta <= FREQUENCY_MATCH_TOLERANCE_HZ ? closest : null;
  }
  function collectComplexAtFrequency(transfers, frequency) {
    const sources = [];
    for (const transfer of transfers) {
      const point = findClosestComplexPoint(transfer == null ? void 0 : transfer.points, frequency);
      if (!point) return null;
      sources.push({ re: point.re, im: point.im });
    }
    let sumRe = 0, sumIm = 0, incoherentSum = 0;
    for (const s of sources) {
      sumRe += s.re;
      sumIm += s.im;
      incoherentSum += Math.hypot(s.re, s.im);
    }
    return { sources, coherentSum: { re: sumRe, im: sumIm }, incoherentSum };
  }
  function computeCoherentEfficiency(data) {
    if (!data || data.incoherentSum <= 1e-10) return null;
    return Math.hypot(data.coherentSum.re, data.coherentSum.im) / data.incoherentSum;
  }
  function verifyMultiSubCancellation(transfers, centreFreq, leftFreq, rightFreq) {
    const centreData = collectComplexAtFrequency(transfers, centreFreq);
    const leftData = collectComplexAtFrequency(transfers, leftFreq);
    const rightData = collectComplexAtFrequency(transfers, rightFreq);
    if (!centreData || !leftData || !rightData) {
      return { isCancellation: false, reason: "insufficient-complex-data" };
    }
    const centreEfficiency = computeCoherentEfficiency(centreData);
    const leftEfficiency = computeCoherentEfficiency(leftData);
    const rightEfficiency = computeCoherentEfficiency(rightData);
    if (centreEfficiency === null || leftEfficiency === null || rightEfficiency === null) {
      return { isCancellation: false, reason: "efficiency-undefined" };
    }
    const shoulderEfficiencyAvg = (leftEfficiency + rightEfficiency) / 2;
    const centreConstituentEnergy = centreData.incoherentSum;
    const shoulderConstituentEnergy = (leftData.incoherentSum + rightData.incoherentSum) / 2;
    const constituentEnergyRatio = shoulderConstituentEnergy > 0 ? centreConstituentEnergy / shoulderConstituentEnergy : 0;
    const hasSignificantConstituentEnergy = constituentEnergyRatio >= MULTI_SUB_CONSTITUENT_ENERGY_RATIO;
    const centreHasPoorCoherence = centreEfficiency < MULTI_SUB_COHERENT_EFFICIENCY_THRESHOLD;
    const centreWorseThanShoulders = shoulderEfficiencyAvg > 0 && centreEfficiency < MULTI_SUB_RELATIVE_SHOULDER_RATIO * shoulderEfficiencyAvg;
    const isCancellation = hasSignificantConstituentEnergy && centreHasPoorCoherence && centreWorseThanShoulders;
    return {
      isCancellation,
      reason: isCancellation ? "multi-sub-destructive-cancellation" : "no-cancellation-evidence",
      centreEfficiency,
      leftEfficiency,
      rightEfficiency,
      shoulderEfficiencyAvg,
      constituentEnergyRatio,
      centreConstituentEnergy,
      shoulderConstituentEnergy,
      thresholds: {
        coherentEfficiencyThreshold: MULTI_SUB_COHERENT_EFFICIENCY_THRESHOLD,
        relativeShoulderRatio: MULTI_SUB_RELATIVE_SHOULDER_RATIO,
        constituentEnergyRatio: MULTI_SUB_CONSTITUENT_ENERGY_RATIO
      }
    };
  }
  function verifyCancellationNullRegions(candidateRegions, perSourceComplexTransfers) {
    if (!Array.isArray(candidateRegions) || !candidateRegions.length) return [];
    const transfers = Array.isArray(perSourceComplexTransfers) ? perSourceComplexTransfers : [];
    if (!transfers.length) return [];
    const sourceCount = transfers.length;
    const verified = [];
    for (const candidate of candidateRegions) {
      const centreFreq = candidate.centreFrequencyHz;
      const leftFreq = candidate.leftShoulderFrequencyHz;
      const rightFreq = candidate.rightShoulderFrequencyHz;
      if (!Number.isFinite(centreFreq) || !Number.isFinite(leftFreq) || !Number.isFinite(rightFreq)) continue;
      let verification = null;
      if (sourceCount >= 2) {
        verification = verifyMultiSubCancellation(transfers, centreFreq, leftFreq, rightFreq);
      }
      if (verification && verification.isCancellation) {
        verified.push({
          ...candidate,
          protected: true,
          cancellationVerified: true,
          verificationMethod: "multi-sub-coherent-efficiency",
          verificationEvidence: verification
        });
      }
    }
    return verified;
  }
  function identifyVerifiedProtectedNullRegions(curve, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, canonicalTargetCurve, perSourceComplexTransfers) {
    const candidates = identifyProtectedNullRegions(
      curve,
      assessmentStartHz,
      assessmentEndHz,
      anchorDb,
      activeSubs,
      usableLfHz,
      requestedSystemOutputDb,
      canonicalTargetCurve
    );
    return verifyCancellationNullRegions(candidates, perSourceComplexTransfers);
  }
  const THIRD_OCTAVE_CENTRES_HZ = Object.freeze([
    16,
    20,
    25,
    31.5,
    40,
    50,
    63,
    80,
    100
  ]);
  const pointValue = (point) => Number((point == null ? void 0 : point.spl) ?? (point == null ? void 0 : point.offsetDb) ?? (point == null ? void 0 : point.db));
  function interpolateShape(curve, frequency) {
    const points = (curve || []).map((point) => ({ frequency: Number((point == null ? void 0 : point.frequency) ?? (point == null ? void 0 : point.hz)), db: pointValue(point) })).filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.db)).sort((a, b) => a.frequency - b.frequency);
    if (!points.length || frequency < points[0].frequency || frequency > points.at(-1).frequency) return null;
    const upperIndex = points.findIndex((point) => point.frequency >= frequency);
    if (upperIndex <= 0) return points[0].db;
    const low = points[upperIndex - 1];
    const high = points[upperIndex];
    const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
    return low.db + (high.db - low.db) * ratio;
  }
  function cWeightingCorrectionDb(frequencyHz) {
    const f = Number(frequencyHz);
    if (!Number.isFinite(f) || f <= 0) return null;
    const f2 = f * f;
    const c = 12200 ** 2 * f2 / ((f2 + 20.6 ** 2) * (f2 + 12200 ** 2));
    return 20 * Math.log10(c) + 0.06;
  }
  function normaliseHouseCurveToP14Total({
    houseCurveShape,
    selectedP14TargetDb,
    requiredExtensionHz,
    upperLfeHz = 120
  } = {}) {
    const targetDb = Number(selectedP14TargetDb);
    const lowerHz = Number(requiredExtensionHz);
    const upperHz = Number(upperLfeHz);
    if (!Number.isFinite(targetDb) || !Number.isFinite(lowerHz) || !Number.isFinite(upperHz)) return null;
    const bands = THIRD_OCTAVE_CENTRES_HZ.filter((frequency) => frequency >= lowerHz && frequency <= upperHz).map((frequency) => {
      const houseCurveBandDb = interpolateShape(houseCurveShape, frequency);
      const cCorrectionDb = cWeightingCorrectionDb(frequency);
      if (!Number.isFinite(houseCurveBandDb) || !Number.isFinite(cCorrectionDb)) return null;
      return { frequencyHz: frequency, houseCurveBandDb, cWeightingCorrectionDb: cCorrectionDb };
    }).filter(Boolean);
    if (!bands.length) return null;
    const relativePower = bands.reduce((sum, band) => sum + 10 ** ((band.houseCurveBandDb + band.cWeightingCorrectionDb) / 10), 0);
    const relativeIntegratedDb = 10 * Math.log10(relativePower);
    const operatingCurveOffsetDb = targetDb - relativeIntegratedDb;
    const includedThirdOctaveBands = bands.map((band) => ({
      ...band,
      normalisedBandDb: band.houseCurveBandDb + operatingCurveOffsetDb,
      weightedBandDb: band.houseCurveBandDb + operatingCurveOffsetDb + band.cWeightingCorrectionDb
    }));
    const integratedCWeightedDb = 10 * Math.log10(includedThirdOctaveBands.reduce(
      (sum, band) => sum + 10 ** (band.weightedBandDb / 10),
      0
    ));
    return {
      selectedP14TargetDb: targetDb,
      requiredExtensionHz: lowerHz,
      operatingCurveOffsetDb,
      integratedCWeightedDb,
      includedThirdOctaveBands
    };
  }
  function integrateRawResponseLevelDbC({ rawCurve, lowerHz, upperHz = 120 } = {}) {
    const lower = Number(lowerHz);
    const upper = Number(upperHz);
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) return null;
    const bands = THIRD_OCTAVE_CENTRES_HZ.filter((frequency) => frequency >= lower && frequency <= upper).map((frequency) => {
      const rawSplDb = interpolateShape(rawCurve, frequency);
      const cCorrectionDb = cWeightingCorrectionDb(frequency);
      if (!Number.isFinite(rawSplDb) || !Number.isFinite(cCorrectionDb)) return null;
      return { frequencyHz: frequency, rawSplDb, cWeightingCorrectionDb: cCorrectionDb };
    }).filter(Boolean);
    if (!bands.length) return null;
    const power = bands.reduce((sum, band) => sum + 10 ** ((band.rawSplDb + band.cWeightingCorrectionDb) / 10), 0);
    return 10 * Math.log10(power);
  }
  const isFiniteNumber$1 = (value) => Number.isFinite(Number(value));
  function interpolateRaw(curve, frequency) {
    if (!Array.isArray(curve) || !curve.length || !isFiniteNumber$1(frequency)) return null;
    const sorted = [...curve].sort((a, b) => a.frequency - b.frequency);
    if (frequency <= sorted[0].frequency) return sorted[0].spl;
    if (frequency >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
    const upperIndex = sorted.findIndex((point) => point.frequency >= frequency);
    const low = sorted[upperIndex - 1];
    const high = sorted[upperIndex];
    const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
    return low.spl + (high.spl - low.spl) * ratio;
  }
  function targetSplAt(frequency, canonicalTargetCurve, anchorDb) {
    return interpolateCanonicalTarget(canonicalTargetCurve, frequency) ?? (isFiniteNumber$1(anchorDb) ? anchorDb + artcousticHouseCurveOffsetAt(frequency) : null);
  }
  function salvagePartialBank({
    filters = [],
    rawCurve = [],
    activeSubs = [],
    usableLfHz = null,
    requestedSystemOutputDb,
    profile,
    protectedNullRegions = [],
    canonicalTargetCurve = [],
    anchorDb
  }) {
    const originalFilters = (Array.isArray(filters) ? filters : []).filter((f) => (f == null ? void 0 : f.enabled) && isFiniteNumber$1(f.frequencyHz) && f.frequencyHz > 0 && isFiniteNumber$1(f.gainDb) && isFiniteNumber$1(f.Q) && f.Q > 0).map((f) => ({ ...f, enabled: true }));
    const removedFilters = [];
    const removeFilter = (filter, reason) => {
      removedFilters.push({
        frequencyHz: filter.frequencyHz,
        gainDb: filter.gainDb,
        q: filter.Q,
        reasonRemoved: reason
      });
    };
    const individuallyValid = [];
    for (const filter of originalFilters) {
      let f = { ...filter, enabled: true };
      let removed = false;
      if (isProtectedFrequency(f.frequencyHz, protectedNullRegions)) {
        removeFilter(f, "protected-null");
        removed = true;
      }
      if (!removed) {
        const rawSpl = interpolateRaw(rawCurve, f.frequencyHz);
        const targetSpl = targetSplAt(f.frequencyHz, canonicalTargetCurve, anchorDb);
        const authority = classifyEqCorrectionRegion({
          frequency: f.frequencyHz,
          rawSpl,
          currentSpl: rawSpl,
          targetSpl,
          protectedNull: false,
          widthOctaves: f.widthOctaves,
          requestedGainDb: f.gainDb
        });
        if (!validatePhysicalEqAction(authority.classification, f.gainDb).passed) {
          removeFilter(f, "physical-authority");
          removed = true;
        }
      }
      if (!removed && f.gainDb > 0) {
        const clamped = limitBoostForCapability(f, activeSubs, usableLfHz, requestedSystemOutputDb);
        if (!isFiniteNumber$1(clamped.gainDb) || Math.abs(clamped.gainDb) <= 0.1) {
          removeFilter(f, "source-domain-headroom");
          removed = true;
        } else {
          f = { ...clamped, enabled: true };
        }
      }
      if (!removed) {
        individuallyValid.push(f);
      }
    }
    let workingBank = individuallyValid.map((f) => ({ ...f, enabled: true }));
    let bankLimits2 = evaluateProvisionalBankLimits(
      workingBank,
      rawCurve,
      activeSubs,
      usableLfHz,
      requestedSystemOutputDb,
      profile
    );
    let iterations = 0;
    const maxIterations = 20;
    while (!bankLimits2.allOk && workingBank.length > 0 && iterations < maxIterations) {
      iterations += 1;
      if (!bankLimits2.boostLimitOk || !bankLimits2.sourceDomainHeadroomOk) {
        const positiveFilters = workingBank.filter((f) => f.gainDb > 0);
        if (positiveFilters.length === 0) break;
        const worst = positiveFilters.reduce((a, b) => Math.abs(b.gainDb) > Math.abs(a.gainDb) ? b : a);
        removeFilter(worst, bankLimits2.sourceDomainHeadroomOk ? "aggregate-boost-limit" : "source-domain-headroom");
        workingBank = workingBank.filter((f) => f !== worst);
      } else if (!bankLimits2.cutLimitOk) {
        const negativeFilters = workingBank.filter((f) => f.gainDb < 0);
        if (negativeFilters.length === 0) break;
        const worst = negativeFilters.reduce((a, b) => Math.abs(b.gainDb) > Math.abs(a.gainDb) ? b : a);
        removeFilter(worst, "aggregate-cut-limit");
        workingBank = workingBank.filter((f) => f !== worst);
      } else {
        break;
      }
      bankLimits2 = evaluateProvisionalBankLimits(
        workingBank,
        rawCurve,
        activeSubs,
        usableLfHz,
        requestedSystemOutputDb,
        profile
      );
    }
    const sanitisedFilters = workingBank;
    const sanitisedBankLimits = bankLimits2;
    const cutOnlyFilters = sanitisedFilters.filter((f) => f.gainDb < 0);
    const cutOnlyBankLimits = cutOnlyFilters.length > 0 ? evaluateProvisionalBankLimits(
      cutOnlyFilters,
      rawCurve,
      activeSubs,
      usableLfHz,
      requestedSystemOutputDb,
      profile
    ) : {
      maxAggregateBoostDb: 0,
      maxAggregateBoostHz: null,
      maxAggregateCutDb: 0,
      maxAggregateCutHz: null,
      limitingPermittedBoostDb: 6,
      boostLimitOk: true,
      cutLimitOk: true,
      sourceDomainHeadroomOk: true,
      allOk: true
    };
    const removedInvalidBoostCount = removedFilters.filter((r) => r.gainDb > 0 && (r.reasonRemoved === "source-domain-headroom" || r.reasonRemoved === "aggregate-boost-limit")).length;
    const removedProtectedNullFilterCount = removedFilters.filter((r) => r.reasonRemoved === "protected-null").length;
    const retainedCutCount = sanitisedFilters.filter((f) => f.gainDb < 0).length;
    const retainedBoostCount = sanitisedFilters.filter((f) => f.gainDb > 0).length;
    return {
      sanitisedFilters,
      sanitisedBankLimits,
      cutOnlyFilters,
      cutOnlyBankLimits,
      removedFilters,
      diagnostics: {
        originalGeneratedFilterCount: originalFilters.length,
        originalEnabledFilterCount: originalFilters.length,
        removedInvalidBoostCount,
        removedProtectedNullFilterCount,
        retainedCutCount,
        retainedBoostCount,
        sanitisedBankValidation: sanitisedBankLimits.allOk,
        cutOnlyBankValidation: cutOnlyBankLimits.allOk,
        removedFilterDetails: removedFilters
      }
    };
  }
  function buildSalvageEqResult({
    originalEq,
    salvageFilters,
    bankLimits: bankLimits2,
    profileMarker,
    rawCurve,
    canonicalTargetCurve,
    protectedNullRegions,
    stopReason
  }) {
    const filters = salvageFilters.map((f) => ({ ...f, enabled: true }));
    const combinedEqCurve = rawCurve.map((point) => ({
      frequency: point.frequency,
      spl: filters.reduce((sum, filter) => sum + peakingEqResponseDb(point.frequency, filter), 0)
    }));
    const curve = rawCurve.map((point, index) => ({
      frequency: point.frequency,
      spl: point.spl + combinedEqCurve[index].spl
    }));
    const physicalAuthorityViolations = findAggregatePeakBoostViolations(rawCurve, curve, canonicalTargetCurve);
    const filterDecisionDiagnostics = buildFilterDecisionDiagnostics(
      filters,
      rawCurve,
      curve,
      canonicalTargetCurve,
      protectedNullRegions
    );
    const headroomConsumedByEqDb = filters.filter((f) => f.enabled && f.gainDb > 0).reduce((sum, f) => sum + f.gainDb, 0);
    return {
      ...originalEq,
      designEqFitProfile: profileMarker,
      designEqFitProfileConfig: originalEq.designEqFitProfileConfig || null,
      selectedStart: `salvage:${profileMarker}`,
      filters,
      curve,
      combinedEqCurve,
      fitterHouseCurveTarget: originalEq.fitterHouseCurveTarget || canonicalTargetCurve.map((p) => ({ ...p })),
      physicalEqAuthorityPassed: physicalAuthorityViolations.length === 0,
      physicalAuthorityViolations,
      bankLimits: { ...bankLimits2 },
      bankDiagnostics: { selectedBankLimits: { ...bankLimits2 } },
      bankValidationPassed: bankLimits2.allOk,
      rspObjectiveMaxDeviationDb: null,
      rspMaxDeviationDb: null,
      rspRmsDeviationDb: null,
      rspMeanSignedResidualDb: null,
      rspShapeRmsDeviationDb: null,
      iterationTrace: [],
      detectedRegions: [],
      candidateAcceptanceDiagnostics: [],
      candidateSelectionDiagnostics: [],
      filterDecisionDiagnostics,
      rejectedEqCandidates: [],
      seatToleranceAdjustedCandidates: [],
      seatRegressionToleranceDiagnostics: null,
      stopReason,
      selectionReason: `Salvaged partial bank (${profileMarker})`,
      houseCurveDiagnostics: null,
      worstSeatMaxDeviationDb: null,
      meanSeatMaxDeviationDb: null,
      rmsSeatTargetErrorDb: null,
      perSeatMetrics: [],
      headroomConsumedByEqDb
    };
  }
  const MAX_BOOST_DB = 6;
  const MAX_CUT_DB = 15;
  const CORRECTION_SMOOTHING_WEIGHTS = Object.freeze([1, 6, 1]);
  function smoothPredictedCorrectionEnvelope(correctionCurve, protectedNullRegions = []) {
    if (!Array.isArray(correctionCurve) || correctionCurve.length < 3) {
      return Array.isArray(correctionCurve) ? correctionCurve.map((point) => ({ ...point })) : [];
    }
    const protectedMask = correctionCurve.map((point) => isProtectedFrequency(point == null ? void 0 : point.frequency, protectedNullRegions));
    const radius = Math.floor(CORRECTION_SMOOTHING_WEIGHTS.length / 2);
    return correctionCurve.map((point, index) => {
      var _a;
      const originalDb = Number(point == null ? void 0 : point.spl);
      if (!Number.isFinite(originalDb)) return { ...point };
      if (protectedMask[index]) return { ...point, spl: 0 };
      let weightedTotal = 0;
      let weightTotal = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleIndex = index + offset;
        if (sampleIndex < 0 || sampleIndex >= correctionCurve.length) continue;
        const pathStart = Math.min(index, sampleIndex);
        const pathEnd = Math.max(index, sampleIndex);
        let crossesProtectedNull = false;
        for (let pathIndex = pathStart; pathIndex <= pathEnd; pathIndex += 1) {
          if (protectedMask[pathIndex]) {
            crossesProtectedNull = true;
            break;
          }
        }
        if (crossesProtectedNull) continue;
        const sampleDb = Number((_a = correctionCurve[sampleIndex]) == null ? void 0 : _a.spl);
        if (!Number.isFinite(sampleDb)) continue;
        const weight = CORRECTION_SMOOTHING_WEIGHTS[offset + radius];
        weightedTotal += sampleDb * weight;
        weightTotal += weight;
      }
      if (!weightTotal) return { ...point };
      const averagedDb = weightedTotal / weightTotal;
      const smoothedDb = originalDb > 0 ? Math.min(originalDb, Math.max(0, averagedDb)) : originalDb < 0 ? Math.max(originalDb, Math.min(0, averagedDb)) : 0;
      return { ...point, spl: smoothedDb };
    });
  }
  function interpolateValue(curve, frequency) {
    if (!Array.isArray(curve) || !curve.length) return null;
    if (frequency <= curve[0].frequency) return curve[0].spl;
    if (frequency >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
    const upperIndex = curve.findIndex((point) => point.frequency >= frequency);
    const low = curve[upperIndex - 1];
    const high = curve[upperIndex];
    const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
    return low.spl + (high.spl - low.spl) * ratio;
  }
  function computeGlobalOperatingTrimDb({
    maximumCapabilityCurve,
    targetCurve,
    assessmentStartHz,
    assessmentEndHz,
    protectedNullRegions = []
  }) {
    if (!Array.isArray(maximumCapabilityCurve) || !maximumCapabilityCurve.length) return 0;
    if (!Number.isFinite(assessmentStartHz) || !Number.isFinite(assessmentEndHz)) return 0;
    if (assessmentEndHz <= assessmentStartHz) return 0;
    const smoothedMaximum = applyBassSmoothing(maximumCapabilityCurve, "third");
    const differences = smoothedMaximum.filter((point) => Number.isFinite(point == null ? void 0 : point.frequency) && Number.isFinite(point == null ? void 0 : point.spl) && point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz && !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions)).map((point) => {
      const targetSpl = interpolateValue(targetCurve, point.frequency);
      if (!Number.isFinite(targetSpl)) return null;
      return targetSpl - point.spl;
    }).filter((diff) => diff !== null && Number.isFinite(diff));
    if (!differences.length) return 0;
    differences.sort((a, b) => a - b);
    const minDifference = differences[0];
    const upperBoundDb = minDifference + MAX_CUT_DB;
    return Math.min(0, upperBoundDb);
  }
  function predictRealisticPostCalibrationCorrection({
    maximumCapabilityCurve,
    targetCurve,
    assessmentStartHz,
    assessmentEndHz,
    protectedNullRegions = [],
    activeSubs = [],
    usableLfHz = null,
    requestedSystemOutputDb = null,
    globalTrimDbOverride = null
  }) {
    if (!Array.isArray(maximumCapabilityCurve) || !maximumCapabilityCurve.length) {
      return { correctionCurve: [], globalTrimDb: 0, operatingPreEqCurve: [] };
    }
    const hasExplicitTrim = globalTrimDbOverride !== null && globalTrimDbOverride !== void 0 && Number.isFinite(Number(globalTrimDbOverride));
    const globalTrimDb = hasExplicitTrim ? Math.min(0, Number(globalTrimDbOverride)) : computeGlobalOperatingTrimDb({
      maximumCapabilityCurve,
      targetCurve,
      assessmentStartHz,
      assessmentEndHz,
      protectedNullRegions
    });
    const operatingPreEqCurve = maximumCapabilityCurve.map((point) => ({
      frequency: point.frequency,
      spl: Number.isFinite(point.spl) ? point.spl + globalTrimDb : point.spl
    }));
    const availableBoostHeadroomDb = Math.max(0, -globalTrimDb);
    const rawCorrectionCurve = maximumCapabilityCurve.map((point) => {
      const frequency = point.frequency;
      const operatingSpl = Number.isFinite(point.spl) ? point.spl + globalTrimDb : null;
      const targetSpl = interpolateValue(targetCurve, frequency);
      if (!Number.isFinite(operatingSpl) || !Number.isFinite(targetSpl)) {
        return { frequency, spl: 0 };
      }
      const errorDb = targetSpl - operatingSpl;
      const inProtectedNull = isProtectedFrequency(frequency, protectedNullRegions);
      let correctionDb;
      if (inProtectedNull) {
        correctionDb = 0;
      } else if (errorDb > 0) {
        const nominalBoost = Math.min(errorDb, MAX_BOOST_DB, availableBoostHeadroomDb);
        if (!Array.isArray(activeSubs) || !activeSubs.length) {
          correctionDb = Math.max(0, nominalBoost);
        } else {
          const allowance = getSourceDomainBoostAllowance({
            frequency,
            requestedBoostDb: nominalBoost,
            activeSubs,
            usableLfHz,
            maxBoostDb: MAX_BOOST_DB,
            requestedSystemOutputDb
          });
          correctionDb = Math.max(0, Math.min(nominalBoost, Number(allowance.allowedBoostDb) || 0));
        }
      } else {
        correctionDb = Math.max(errorDb, -MAX_CUT_DB);
      }
      return { frequency, spl: correctionDb };
    });
    const correctionCurve = smoothPredictedCorrectionEnvelope(rawCorrectionCurve, protectedNullRegions);
    return { correctionCurve, rawCorrectionCurve, globalTrimDb, operatingPreEqCurve };
  }
  const finite$1 = (v) => v !== null && v !== "" && Number.isFinite(Number(v));
  function normalizeCurve(curve) {
    return (Array.isArray(curve) ? curve : []).filter((p) => finite$1(p == null ? void 0 : p.frequency) && finite$1(p == null ? void 0 : p.spl)).map((p) => ({ frequency: Number(p.frequency), spl: Number(p.spl) })).sort((a, b) => a.frequency - b.frequency);
  }
  function interpolateCurveValue(curve, frequency) {
    if (!Array.isArray(curve) || !curve.length || !Number.isFinite(frequency)) return null;
    if (frequency <= curve[0].frequency) return curve[0].spl;
    if (frequency >= curve.at(-1).frequency) return curve.at(-1).spl;
    for (let i = 0; i < curve.length - 1; i++) {
      if (frequency >= curve[i].frequency && frequency <= curve[i + 1].frequency) {
        const span = curve[i + 1].frequency - curve[i].frequency;
        if (span === 0) return curve[i].spl;
        const ratio = (frequency - curve[i].frequency) / span;
        return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * ratio;
      }
    }
    return null;
  }
  const DEFAULT_BLEND_SCALE_DB = 2;
  function softplus(x, scale) {
    if (x > 20 * scale) return x;
    if (x < -20 * scale) return 0;
    return scale * Math.log1p(Math.exp(x / scale));
  }
  function buildSmoothCapabilityEnvelope(maximumSplCurve) {
    const normalized = normalizeCurve(maximumSplCurve);
    if (normalized.length < 3) return normalized;
    return applyBassSmoothing(normalized, "octave").filter((p) => finite$1(p.spl));
  }
  function buildPracticalCalibrationTarget({
    idealTargetCurve,
    capabilityEnvelope,
    requiredHeadroomDb = 0,
    blendScaleDb = DEFAULT_BLEND_SCALE_DB
  }) {
    const ideal = normalizeCurve(idealTargetCurve);
    const capability2 = normalizeCurve(capabilityEnvelope);
    if (!ideal.length) return [];
    if (!capability2.length) return ideal.map((p) => ({ ...p }));
    return ideal.map((point) => {
      const capSpl = interpolateCurveValue(capability2, point.frequency);
      if (!finite$1(capSpl)) return { ...point };
      const excess = point.spl - capSpl - requiredHeadroomDb;
      const reduction = softplus(excess, blendScaleDb);
      return { frequency: point.frequency, spl: point.spl - reduction };
    });
  }
  function buildPracticalCalibrationTargetFromCapability({
    idealTargetCurve,
    maximumSplCurve,
    requiredHeadroomDb = 0,
    blendScaleDb = DEFAULT_BLEND_SCALE_DB,
    p18DesignHz = null,
    p18ReferenceDb = null
  }) {
    const capabilityEnvelope = buildSmoothCapabilityEnvelope(maximumSplCurve);
    const practicalCalibrationTarget = buildPracticalCalibrationTarget({
      idealTargetCurve,
      capabilityEnvelope,
      requiredHeadroomDb,
      blendScaleDb
    });
    return { capabilityEnvelope, practicalCalibrationTarget };
  }
  const finite = (v) => v !== null && v !== "" && Number.isFinite(Number(v));
  const P18_EXTENSION_TOLERANCE_HZ = 1;
  const P20_MULTI_SEAT_TOLERANCE_DB = 1;
  const P19_IMPROVEMENT_THRESHOLD_DB = 0.1;
  const MAX_BOOST_LIMIT_DB = 6;
  const MAX_BOOST_TOLERANCE_DB = 0.05;
  const MAX_CUT_LIMIT_DB = -15;
  const MAX_CUT_TOLERANCE_DB = 0.05;
  function isEligible(evaluation, pass1) {
    var _a;
    if (!evaluation) return false;
    if (evaluation.p14Pass !== true) return false;
    if (evaluation.physicalEqAuthorityPassed !== true) return false;
    if (finite(evaluation.maxBoostDb) && Number(evaluation.maxBoostDb) > MAX_BOOST_LIMIT_DB + MAX_BOOST_TOLERANCE_DB) return false;
    if (finite(evaluation.maxCutDb) && Number(evaluation.maxCutDb) < MAX_CUT_LIMIT_DB - MAX_CUT_TOLERANCE_DB) return false;
    const p18Level = finite(evaluation.achievedP18Level) ? Number(evaluation.achievedP18Level) : 0;
    const pass1P18Level = finite(pass1.achievedP18Level) ? Number(pass1.achievedP18Level) : 0;
    if (p18Level < pass1P18Level) return false;
    if (finite(evaluation.achievedP18Hz) && finite(pass1.achievedP18Hz) && Number(evaluation.achievedP18Hz) > Number(pass1.achievedP18Hz) + P18_EXTENSION_TOLERANCE_HZ) return false;
    if (((_a = evaluation.primarySeatSafety) == null ? void 0 : _a.regressed) === true) return false;
    if (pass1.p20Available === true && evaluation.p20Available === true && finite(pass1.p20Db) && finite(evaluation.p20Db) && Number(evaluation.p20Db) > Number(pass1.p20Db) + P20_MULTI_SEAT_TOLERANCE_DB) return false;
    if (evaluation.operatingOutputValid !== true) return false;
    return true;
  }
  function compareCandidates(a, b, pass1) {
    if (finite(a.p19Db) && finite(b.p19Db) && Math.abs(a.p19Db - b.p19Db) > 0.01) {
      return a.p19Db - b.p19Db;
    }
    const aP20 = finite(a.p20Db) ? Number(a.p20Db) : Infinity;
    const bP20 = finite(b.p20Db) ? Number(b.p20Db) : Infinity;
    if (Math.abs(aP20 - bP20) > 0.01) return aP20 - bP20;
    const aHeadroom = finite(a.p14MarginDb) ? Number(a.p14MarginDb) : -Infinity;
    const bHeadroom = finite(b.p14MarginDb) ? Number(b.p14MarginDb) : -Infinity;
    if (Math.abs(aHeadroom - bHeadroom) > 0.01) return bHeadroom - aHeadroom;
    const aDeparture = Math.abs(Number(a.globalTrimDb) - Number(pass1.globalTrimDb));
    const bDeparture = Math.abs(Number(b.globalTrimDb) - Number(pass1.globalTrimDb));
    return aDeparture - bDeparture;
  }
  function refineP19GlobalNormalisation({
    evaluateCandidate,
    pass1GlobalTrimDb,
    pass1Evaluation
  }) {
    var _a;
    const nowMs = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    const startedAt = nowMs();
    if (typeof evaluateCandidate !== "function" || !pass1Evaluation) {
      return { refinementAttempted: false, reason: "missing-evaluator-or-pass1" };
    }
    if (pass1Evaluation.p14Pass !== true || pass1Evaluation.physicalEqAuthorityPassed !== true || pass1Evaluation.operatingOutputValid !== true) {
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
        refinedEvaluation: null
      };
    }
    const pass1 = pass1Evaluation;
    const pass1P19 = finite(pass1.p19Db) ? Number(pass1.p19Db) : null;
    const searchUpper = 0;
    const searchLower = pass1GlobalTrimDb;
    const coarseStep = 1;
    const coarseStart = nowMs();
    const coarseCandidates = [];
    for (let trim = searchLower; trim <= searchUpper + 1e-3; trim += coarseStep) {
      coarseCandidates.push(Math.round(trim * 1e3) / 1e3);
    }
    const pass1Rounded = Math.round(pass1GlobalTrimDb * 1e3) / 1e3;
    if (!coarseCandidates.includes(pass1Rounded)) {
      coarseCandidates.push(pass1Rounded);
    }
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
    let bestCoarse = null;
    for (const evaluation of coarseEvaluations) {
      if (!isEligible(evaluation, pass1)) continue;
      if (!bestCoarse || compareCandidates(evaluation, bestCoarse, pass1) < 0) {
        bestCoarse = evaluation;
      }
    }
    const fineStart = nowMs();
    let bestFine = bestCoarse;
    let fineEvaluationsRun = 0;
    if (bestCoarse) {
      const fineCentre = Number(bestCoarse.globalTrimDb);
      const fineRange = 1.5;
      const fineStep = 0.25;
      for (let trim = fineCentre - fineRange; trim <= fineCentre + fineRange + 1e-3; trim += fineStep) {
        const rounded = Math.round(trim * 1e3) / 1e3;
        if (rounded > searchUpper + 1e-3 || rounded < searchLower - 1e-3) continue;
        if (rounded === Math.round(fineCentre * 1e3) / 1e3) continue;
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
    const refinedP19 = bestFine ? Number(bestFine.p19Db) : pass1P19;
    const improvementDb = finite(pass1P19) && finite(refinedP19) ? pass1P19 - refinedP19 : 0;
    const refinementImproved = bestFine && improvementDb > P19_IMPROVEMENT_THRESHOLD_DB;
    let bindingConstraint = null;
    if (refinementImproved && bestFine) {
      const c = bestFine;
      if (finite(c.maxBoostDb) && c.maxBoostDb >= 5.95) bindingConstraint = "boost-limit";
      else if (finite(c.maxCutDb) && c.maxCutDb <= -14.95) bindingConstraint = "cut-limit";
      else if (!((_a = c.assessmentBand) == null ? void 0 : _a.valid)) bindingConstraint = "assessment-band-invalid";
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
      refinedP18Hz: refinementImproved && finite(bestFine.achievedP18Hz) ? Number(bestFine.achievedP18Hz) : finite(pass1.achievedP18Hz) ? Number(pass1.achievedP18Hz) : null,
      pass1P18Level: finite(pass1.achievedP18Level) ? Number(pass1.achievedP18Level) : 0,
      refinedP18Level: refinementImproved && finite(bestFine.achievedP18Level) ? Number(bestFine.achievedP18Level) : finite(pass1.achievedP18Level) ? Number(pass1.achievedP18Level) : 0,
      pass1P14Pass: pass1.p14Pass === true,
      refinedP14Pass: refinementImproved ? bestFine.p14Pass === true : pass1.p14Pass === true,
      pass1P14MarginDb: finite(pass1.p14MarginDb) ? Number(pass1.p14MarginDb) : null,
      refinedP14MarginDb: refinementImproved && finite(bestFine.p14MarginDb) ? Number(bestFine.p14MarginDb) : finite(pass1.p14MarginDb) ? Number(pass1.p14MarginDb) : null,
      pass1P20Db: finite(pass1.p20Db) ? Number(pass1.p20Db) : null,
      refinedP20Db: refinementImproved && finite(bestFine.p20Db) ? Number(bestFine.p20Db) : finite(pass1.p20Db) ? Number(pass1.p20Db) : null,
      pass1AssessmentBand: pass1.assessmentBand || null,
      refinedAssessmentBand: refinementImproved ? bestFine.assessmentBand : pass1.assessmentBand || null,
      maxBoostDb: refinementImproved ? bestFine.maxBoostDb : pass1.maxBoostDb,
      maxCutDb: refinementImproved ? bestFine.maxCutDb : pass1.maxCutDb,
      bindingConstraint,
      selectedOperatingOutputDb: finite(pass1.selectedOperatingOutputDb) ? Number(pass1.selectedOperatingOutputDb) : null,
      pass1FinalOperatingOutputDb: finite(pass1.finalOperatingOutputDb) ? Number(pass1.finalOperatingOutputDb) : null,
      pass1OperatingOutputErrorDb: finite(pass1.operatingOutputErrorDb) ? Number(pass1.operatingOutputErrorDb) : null,
      pass1OperatingOutputValid: pass1.operatingOutputValid === true,
      refinedFinalOperatingOutputDb: refinementImproved && finite(bestFine.finalOperatingOutputDb) ? Number(bestFine.finalOperatingOutputDb) : finite(pass1.finalOperatingOutputDb) ? Number(pass1.finalOperatingOutputDb) : null,
      refinedOperatingOutputErrorDb: refinementImproved && finite(bestFine.operatingOutputErrorDb) ? Number(bestFine.operatingOutputErrorDb) : finite(pass1.operatingOutputErrorDb) ? Number(pass1.operatingOutputErrorDb) : null,
      refinedOperatingOutputValid: refinementImproved ? bestFine.operatingOutputValid === true : pass1.operatingOutputValid === true,
      operatingOutputBandHz: pass1.operatingOutputBandHz || null,
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
      refinedEvaluation: refinementImproved ? bestFine : null
    };
  }
  const isFiniteNumber = (value) => value !== null && value !== "" && typeof value !== "boolean" && Number.isFinite(Number(value));
  function assessP18AgainstRequiredExtension({
    rspPostEqCurve,
    canonicalTargetCurve,
    perSeatPostEqCurves = [],
    selectedP14TargetDb,
    requiredExtensionHz,
    p18CutoffDb,
    configuredUsableLfHz = null,
    upperLfeHz = 120,
    productCurveMinHz = null,
    activeSubs = []
  }) {
    var _a;
    if (!Array.isArray(rspPostEqCurve) || !rspPostEqCurve.length) return null;
    const targetDb = Number(selectedP14TargetDb);
    const requiredHz = Number(requiredExtensionHz);
    const absoluteCutoffDb = Number.isFinite(Number(p18CutoffDb)) ? Number(p18CutoffDb) : null;
    const usableLfHz = Number.isFinite(Number(configuredUsableLfHz)) ? Number(configuredUsableLfHz) : null;
    if (!Number.isFinite(requiredHz)) return null;
    const seatCurves = (Array.isArray(perSeatPostEqCurves) ? perSeatPostEqCurves : []).filter((seat) => Array.isArray(seat == null ? void 0 : seat.responseData) && seat.responseData.length);
    const simulationMinHz = 15;
    const productFloorHz = Number.isFinite(Number(productCurveMinHz)) ? Number(productCurveMinHz) : null;
    const validMinHz = productFloorHz != null ? Math.max(simulationMinHz, productFloorHz) : simulationMinHz;
    const rspF3 = computeResponseTargetF3(rspPostEqCurve, targetDb, validMinHz);
    const rspBounded = rspF3.bounded === true;
    const rspExtensionHz = rspBounded ? rspF3.upperBoundHz : rspF3.f3Hz;
    const capF3 = Array.isArray(activeSubs) && activeSubs.length > 0 ? computeCapabilityTargetF3(activeSubs, targetDb, validMinHz) : null;
    const capBounded = (capF3 == null ? void 0 : capF3.bounded) === true;
    const capExtensionHz = capF3 == null ? null : capBounded ? capF3.upperBoundHz : capF3.f3Hz;
    let achievedExtensionHz = null;
    let achievedExtensionBounded = false;
    let extensionUpperBoundHz = null;
    if (rspExtensionHz != null && capExtensionHz != null) {
      achievedExtensionHz = Math.max(rspExtensionHz, capExtensionHz);
      achievedExtensionBounded = rspBounded && capBounded;
      extensionUpperBoundHz = achievedExtensionBounded ? achievedExtensionHz : null;
    } else if (rspExtensionHz != null) {
      achievedExtensionHz = rspExtensionHz;
      achievedExtensionBounded = rspBounded;
      extensionUpperBoundHz = rspBounded ? rspExtensionHz : null;
    } else if (capExtensionHz != null) {
      achievedExtensionHz = capExtensionHz;
      achievedExtensionBounded = capBounded;
      extensionUpperBoundHz = capBounded ? capExtensionHz : null;
    }
    const seatResults = seatCurves.map((seat) => {
      const seatF3 = computeResponseTargetF3(seat.responseData, targetDb, validMinHz);
      const seatBounded = seatF3.bounded === true;
      return {
        seatId: seat.seatId,
        extensionHz: seatBounded ? seatF3.upperBoundHz : seatF3.f3Hz,
        achievedExtensionBounded: seatBounded
      };
    });
    const validSeatExtensions = seatResults.map((seat) => seat.extensionHz).filter(isFiniteNumber);
    const worstSeatExtensionHz = validSeatExtensions.length ? Math.max(...validSeatExtensions) : null;
    const worstSeatId = ((_a = seatResults.filter((seat) => isFiniteNumber(seat.extensionHz)).sort((a, b) => b.extensionHz - a.extensionHz)[0]) == null ? void 0 : _a.seatId) ?? null;
    const passes = isFiniteNumber(achievedExtensionHz) && achievedExtensionHz <= requiredHz;
    const shortfallHz = passes ? null : isFiniteNumber(achievedExtensionHz) ? achievedExtensionHz - requiredHz : null;
    return {
      selectedP14TargetDb: Number.isFinite(targetDb) ? targetDb : null,
      requiredExtensionHz: requiredHz,
      p18CutoffDb: absoluteCutoffDb,
      rspRefDb: null,
      rspCutoffDb: null,
      relativeCutoffDb: -3,
      configuredUsableLfHz: usableLfHz,
      rspExtensionHz,
      capabilityExtensionHz: capExtensionHz,
      worstSeatExtensionHz,
      worstSeatId,
      seatResults,
      seatConsistencyExcludedFromP18: true,
      achievedExtensionHz,
      achievedExtensionBounded,
      extensionUpperBoundHz,
      validMinHz,
      productCurveMinHz: productFloorHz,
      passes,
      shortfallHz,
      assessmentSource: achievedExtensionBounded ? "physically-qualified-target-f3-bounded-at-product-validity-floor" : "physically-qualified-target-f3-sustained-extension"
    };
  }
  const isFiniteNum = (value) => value !== null && value !== void 0 && typeof value !== "boolean" && Number.isFinite(Number(value));
  function resolveBassAssessmentBand({ p14Pass, achievedP18Hz, transitionHz } = {}) {
    if (!isFiniteNum(achievedP18Hz) || Number(achievedP18Hz) <= 0) {
      return { valid: false, lowerHz: null, upperHz: null, reason: "p18-extension-not-achieved" };
    }
    if (!isFiniteNum(transitionHz) || Number(transitionHz) <= 0) {
      return { valid: false, lowerHz: null, upperHz: null, reason: "transition-frequency-unavailable" };
    }
    const lower = Number(achievedP18Hz);
    const upper = Number(transitionHz);
    if (upper <= lower) {
      return { valid: false, lowerHz: null, upperHz: null, reason: "transition-not-above-p18" };
    }
    return { valid: true, lowerHz: lower, upperHz: upper, reason: null };
  }
  function numericLevel(value) {
    if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
    const match = String(value || "").match(/^L([1-4])$/i);
    return match ? Number(match[1]) : 0;
  }
  const PRIMARY_RAW_REGRESSION_THRESHOLD_DB = 1;
  function hasPrimarySeatRegression(currentResult, candidateResult) {
    const currentP19 = new Map(((currentResult == null ? void 0 : currentResult.perSeatP19) || []).map((s) => [String(s.seatId), s]));
    const currentP20 = new Map(((currentResult == null ? void 0 : currentResult.perSeatP20) || []).map((s) => [String(s.seatId), s]));
    for (const seat of (candidateResult == null ? void 0 : candidateResult.perSeatP19) || []) {
      if (!seat.isPrimary) continue;
      const cur = currentP19.get(String(seat.seatId));
      if (!cur) continue;
      const candidateLevel = numericLevel(seat.level);
      const currentLevel = numericLevel(cur.level);
      if (candidateLevel < currentLevel) {
        return { regressed: true, seatId: seat.seatId, parameter: "P19", currentLevel, candidateLevel };
      }
      if (candidateLevel === currentLevel) {
        const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
        const curRaw = Math.abs(Number(cur.variationDbRaw) || 0);
        if (Number.isFinite(candRaw) && Number.isFinite(curRaw) && candRaw - curRaw > PRIMARY_RAW_REGRESSION_THRESHOLD_DB) {
          return {
            regressed: true,
            seatId: seat.seatId,
            parameter: "P19",
            currentLevel,
            candidateLevel,
            rawDeltaDb: candRaw - curRaw,
            reason: "same-level raw regression"
          };
        }
      }
    }
    for (const seat of (candidateResult == null ? void 0 : candidateResult.perSeatP20) || []) {
      if (!seat.isPrimary) continue;
      const cur = currentP20.get(String(seat.seatId));
      if (!cur) continue;
      const candidateLevel = numericLevel(seat.level);
      const currentLevel = numericLevel(cur.level);
      if (candidateLevel < currentLevel) {
        return { regressed: true, seatId: seat.seatId, parameter: "P20", currentLevel, candidateLevel };
      }
      if (candidateLevel === currentLevel) {
        const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
        const curRaw = Math.abs(Number(cur.variationDbRaw) || 0);
        if (Number.isFinite(candRaw) && Number.isFinite(curRaw) && candRaw - curRaw > PRIMARY_RAW_REGRESSION_THRESHOLD_DB) {
          return {
            regressed: true,
            seatId: seat.seatId,
            parameter: "P20",
            currentLevel,
            candidateLevel,
            rawDeltaDb: candRaw - curRaw,
            reason: "same-level raw regression"
          };
        }
      }
    }
    return { regressed: false };
  }
  const FIT_PROFILES = [DESIGN_EQ_FIT_PROFILES.standard, DESIGN_EQ_FIT_PROFILES.accuracy];
  const BASS_CAPABILITY_RESERVE_DB = P14_SAFETY_MARGIN_DB;
  const PRODUCT_EXTENSION_REFERENCE_TOLERANCE_DB = 1.5;
  const OPERATING_OUTPUT_TOLERANCE_DB = 0.5;
  const OPERATING_WINDOW_MAX_BOOST_DB = DESIGN_EQ_FIT_PROFILES.accuracy.maximumAggregateBoostDb;
  const OPERATING_WINDOW_MAX_CUT_DB = DESIGN_EQ_FIT_PROFILES.accuracy.maximumCutDb;
  function clampPositiveOperatingOffset(requestedOffsetDb, activeSubs, baseRequestedSystemOutputDb, requiredExtensionHz) {
    if (!Number.isFinite(requestedOffsetDb)) return 0;
    if (requestedOffsetDb <= 0) return requestedOffsetDb;
    if (!Number.isFinite(baseRequestedSystemOutputDb)) return 0;
    const bandFrequencies = [20, 25, 31.5, 40, 50, 63, 80, 100, 120].filter((frequency) => frequency >= requiredExtensionHz && frequency <= 120);
    let maximumSafePositiveOffsetDb = Infinity;
    for (const frequency of bandFrequencies) {
      const rawCapabilityDb = getSystemSourceCapability(activeSubs, frequency);
      if (!Number.isFinite(rawCapabilityDb)) continue;
      const safeCapabilityDb = rawCapabilityDb - BASS_CAPABILITY_RESERVE_DB;
      maximumSafePositiveOffsetDb = Math.min(
        maximumSafePositiveOffsetDb,
        safeCapabilityDb - baseRequestedSystemOutputDb
      );
    }
    if (!Number.isFinite(maximumSafePositiveOffsetDb) || maximumSafePositiveOffsetDb <= 0) return 0;
    return Math.min(requestedOffsetDb, maximumSafePositiveOffsetDb);
  }
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
  function deriveCorrectionWindowOperatingOffsetDb({
    rawCurve = [],
    targetCurve = [],
    assessmentStartHz = 20,
    assessmentEndHz = 200,
    protectedNullRegions = [],
    maximumAggregateBoostDb = OPERATING_WINDOW_MAX_BOOST_DB,
    maximumCutDb = OPERATING_WINDOW_MAX_CUT_DB,
    assessmentSmoothing = "third"
  } = {}) {
    const assessmentCurve = assessmentSmoothing === "none" ? (Array.isArray(rawCurve) ? rawCurve : []).map((point) => ({ ...point })) : applyBassSmoothing(rawCurve, assessmentSmoothing);
    const correctablePoints = assessmentCurve.filter((point) => Number.isFinite(point == null ? void 0 : point.frequency) && Number.isFinite(point == null ? void 0 : point.spl) && point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz && !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions)).map((point) => ({
      frequency: point.frequency,
      residualDb: point.spl - interpolateCorrection(targetCurve, point.frequency)
    })).filter((point) => Number.isFinite(point.residualDb));
    if (!correctablePoints.length) {
      return {
        requestedOffsetDb: 0,
        selectionMode: "no-correctable-points",
        feasible: false,
        pointCount: 0,
        minimumResidualDb: null,
        maximumResidualDb: null,
        meanResidualDb: null,
        lowerOffsetBoundDb: null,
        upperOffsetBoundDb: null,
        assessmentStartHz,
        assessmentEndHz,
        assessmentSmoothing
      };
    }
    const residuals = correctablePoints.map((point) => point.residualDb);
    const minimumResidualDb = Math.min(...residuals);
    const maximumResidualDb = Math.max(...residuals);
    const meanResidualDb = residuals.reduce((sum, residual) => sum + residual, 0) / residuals.length;
    const lowerOffsetBoundDb = -Math.max(0, maximumAggregateBoostDb) - minimumResidualDb;
    const upperOffsetBoundDb = Math.max(0, maximumCutDb) - maximumResidualDb;
    const feasible = lowerOffsetBoundDb <= upperOffsetBoundDb;
    const balancedInfeasibleOffsetDb = (lowerOffsetBoundDb + upperOffsetBoundDb) / 2;
    const requestedOffsetDb = Math.max(lowerOffsetBoundDb, upperOffsetBoundDb);
    return {
      requestedOffsetDb,
      selectionMode: feasible ? "cut-preferred-within-correction-window" : "cut-preferred-above-correction-window",
      feasible,
      pointCount: correctablePoints.length,
      minimumResidualDb,
      maximumResidualDb,
      meanResidualDb,
      lowerOffsetBoundDb,
      upperOffsetBoundDb,
      balancedInfeasibleOffsetDb,
      irreducibleShortfallDb: feasible ? 0 : Math.max(0, lowerOffsetBoundDb - requestedOffsetDb),
      irreducibleExcessDb: feasible ? 0 : Math.max(0, requestedOffsetDb - upperOffsetBoundDb),
      maximumAggregateBoostDb,
      maximumCutDb,
      assessmentStartHz,
      assessmentEndHz,
      assessmentSmoothing
    };
  }
  function applyBankToSeats(seats, correction) {
    return (Array.isArray(seats) ? seats : []).filter((seat) => (seat == null ? void 0 : seat.seatId) !== "rsp" && Array.isArray(seat == null ? void 0 : seat.responseData)).map((seat) => ({
      seatId: seat.seatId,
      isPrimary: !!seat.isPrimary,
      responseData: seat.responseData.map((point) => ({
        frequency: point.frequency,
        spl: point.spl + interpolateCorrection(correction, point.frequency)
      }))
    }));
  }
  function applyMaximumSplSafetyMargin(curve) {
    return (Array.isArray(curve) ? curve : []).map((point) => ({
      ...point,
      spl: Number.isFinite(point == null ? void 0 : point.spl) ? point.spl - BASS_CAPABILITY_RESERVE_DB : point == null ? void 0 : point.spl
    }));
  }
  function buildMaximumSplCurveAfterEq(maximumBeforeEq) {
    return {
      globalEqTrimDb: 0,
      curve: (Array.isArray(maximumBeforeEq) ? maximumBeforeEq : []).map((point) => ({
        ...point
      }))
    };
  }
  function capCurveToEnvelope(requestedCurve, maximumCurve) {
    if (!Array.isArray(maximumCurve) || !maximumCurve.length) {
      return (Array.isArray(requestedCurve) ? requestedCurve : []).map((point) => ({ ...point }));
    }
    return (Array.isArray(requestedCurve) ? requestedCurve : []).map((point) => {
      const maximumSpl = interpolateCorrection(maximumCurve, point.frequency);
      const requestedSpl = Number(point == null ? void 0 : point.spl);
      if (!Number.isFinite(requestedSpl) || !Number.isFinite(maximumSpl)) return { ...point };
      return {
        ...point,
        spl: Math.min(requestedSpl, maximumSpl),
        requestedSpl,
        maximumSpl,
        capabilityLimited: requestedSpl > maximumSpl + 0.05
      };
    });
  }
  function buildProductOperatingEnvelope({
    frequencyGrid = [],
    targetCurve = [],
    activeSubs = [],
    combinedEqCurve = [],
    selectedOperatingOutputDb = null,
    targetBasis = "minimum"
  } = {}) {
    var _a;
    if (!Array.isArray(frequencyGrid) || !frequencyGrid.length || !activeSubs.length || !Number.isFinite(Number(selectedOperatingOutputDb))) {
      return { curve: [], p14CapabilityDb: null, operatingMarginDb: null, operatingHeadroomDb: null, p14ShortfallDb: null, referenceCapabilityDb: null, extensionBandEndHz: null };
    }
    const productP14 = assessP14Capability({
      activeSubs,
      combinedEqCurve: (combinedEqCurve || []).map((point) => ({
        frequency: point.frequency,
        spl: Math.max(0, Number(point == null ? void 0 : point.spl) || 0)
      })),
      targetBasis
    });
    const p14CapabilityDb = Number((productP14 == null ? void 0 : productP14.p14CapabilityDb) ?? (productP14 == null ? void 0 : productP14.value));
    const operatingMarginDb = Number.isFinite(p14CapabilityDb) ? p14CapabilityDb - Number(selectedOperatingOutputDb) : 0;
    const operatingHeadroomDb = Math.max(0, operatingMarginDb);
    const p14ShortfallDb = Math.max(0, -operatingMarginDb);
    const capabilities = frequencyGrid.map((frequency) => ({
      frequency: Number(frequency),
      capabilityDb: getSystemSourceCapability(activeSubs, Number(frequency))
    })).filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.capabilityDb));
    const referencePoints = capabilities.filter((point) => point.frequency >= 30 && point.frequency <= 120);
    const referenceCapabilityDb2 = referencePoints.length ? Math.max(...referencePoints.map((point) => point.capabilityDb)) : null;
    if (!Number.isFinite(referenceCapabilityDb2)) {
      return { curve: [], p14CapabilityDb, operatingMarginDb, operatingHeadroomDb, p14ShortfallDb, referenceCapabilityDb: null, extensionBandEndHz: null };
    }
    const extensionThresholdDb = referenceCapabilityDb2 - PRODUCT_EXTENSION_REFERENCE_TOLERANCE_DB;
    const extensionEntryIndex = capabilities.findIndex((point) => point.capabilityDb >= extensionThresholdDb);
    const extensionEntry = extensionEntryIndex >= 0 ? capabilities[extensionEntryIndex] : null;
    const extensionPrevious = extensionEntryIndex > 0 ? capabilities[extensionEntryIndex - 1] : null;
    const extensionBandEndHz = extensionEntry && extensionPrevious ? extensionPrevious.frequency + (extensionEntry.frequency - extensionPrevious.frequency) * Math.max(0, Math.min(
      1,
      (extensionThresholdDb - extensionPrevious.capabilityDb) / Math.max(1e-9, extensionEntry.capabilityDb - extensionPrevious.capabilityDb)
    )) : (extensionEntry == null ? void 0 : extensionEntry.frequency) ?? ((_a = capabilities.at(-1)) == null ? void 0 : _a.frequency) ?? null;
    const curve = capabilities.map((point) => {
      const targetSpl = interpolateCorrection(targetCurve, point.frequency);
      const productRelativeCapabilityDb = point.capabilityDb - referenceCapabilityDb2;
      const relativeProductLimitDb = productRelativeCapabilityDb + operatingMarginDb;
      return {
        frequency: point.frequency,
        spl: Number.isFinite(targetSpl) ? targetSpl + relativeProductLimitDb : point.capabilityDb,
        productCapabilityDb: point.capabilityDb,
        productRelativeCapabilityDb,
        relativeProductLimitDb,
        extensionEnvelopeApplies: point.frequency <= extensionBandEndHz,
        extensionBandEndHz
      };
    });
    return {
      curve,
      p14CapabilityDb,
      rawP14CapabilityDb: (productP14 == null ? void 0 : productP14.rawCapabilityDb) ?? null,
      capabilityReserveDb: BASS_CAPABILITY_RESERVE_DB,
      operatingMarginDb,
      operatingHeadroomDb,
      p14ShortfallDb,
      referenceCapabilityDb: referenceCapabilityDb2,
      extensionBandEndHz,
      authority: "power-summed-product-extension-envelope-at-selected-p14"
    };
  }
  function capCurveToProductOperatingEnvelope(requestedCurve, productEnvelope) {
    var _a;
    if (!Array.isArray(productEnvelope) || !productEnvelope.length) {
      return (Array.isArray(requestedCurve) ? requestedCurve : []).map((point) => ({ ...point }));
    }
    const extensionBandEndHz = Number((_a = productEnvelope.find((point) => Number.isFinite(point == null ? void 0 : point.extensionBandEndHz))) == null ? void 0 : _a.extensionBandEndHz);
    return (Array.isArray(requestedCurve) ? requestedCurve : []).map((point) => {
      if (!Number.isFinite(point == null ? void 0 : point.frequency) || !Number.isFinite(extensionBandEndHz) || point.frequency > extensionBandEndHz) return { ...point };
      const productLimitSpl = interpolateCorrection(productEnvelope, point.frequency);
      if (!Number.isFinite(productLimitSpl) || !Number.isFinite(point == null ? void 0 : point.spl)) return { ...point };
      return {
        ...point,
        requestedSpl: Number.isFinite(point.requestedSpl) ? point.requestedSpl : point.spl,
        productOperatingLimitSpl: productLimitSpl,
        spl: Math.min(point.spl, productLimitSpl),
        capabilityLimited: point.capabilityLimited === true || point.spl > productLimitSpl + 0.05
      };
    });
  }
  function buildProductLimitAttenuationCurve(rspBeforeProductEnvelope, rspFinalAfterProductEnvelope) {
    if (!Array.isArray(rspBeforeProductEnvelope) || !Array.isArray(rspFinalAfterProductEnvelope)) return [];
    const afterByFrequency = /* @__PURE__ */ new Map();
    for (const point of rspFinalAfterProductEnvelope) {
      if ((point == null ? void 0 : point.frequency) && Number.isFinite(Number(point == null ? void 0 : point.spl))) {
        afterByFrequency.set(Number(point.frequency), Number(point.spl));
      }
    }
    return rspBeforeProductEnvelope.filter((point) => (point == null ? void 0 : point.frequency) && Number.isFinite(Number(point == null ? void 0 : point.spl))).map((point) => {
      const frequency = Number(point.frequency);
      const before = Number(point.spl);
      const after = afterByFrequency.get(frequency);
      if (!Number.isFinite(after)) {
        return { frequency, attenuationDb: 0, rspBeforeProductLimit: before, rspAfterProductLimit: null };
      }
      return {
        frequency,
        attenuationDb: Math.max(0, before - after),
        rspBeforeProductLimit: before,
        rspAfterProductLimit: after
      };
    });
  }
  function interpolateAttenuationDb(attenuationCurve, frequency) {
    if (!Array.isArray(attenuationCurve) || !attenuationCurve.length) return 0;
    if (frequency < attenuationCurve[0].frequency || frequency > attenuationCurve.at(-1).frequency) return 0;
    const upperIndex = attenuationCurve.findIndex((point) => point.frequency >= frequency);
    if (upperIndex <= 0) return attenuationCurve[0].attenuationDb || 0;
    const low = attenuationCurve[upperIndex - 1];
    const high = attenuationCurve[upperIndex];
    const span = high.frequency - low.frequency;
    if (span <= 0) return low.attenuationDb || 0;
    const fraction = (frequency - low.frequency) / span;
    return (low.attenuationDb || 0) + fraction * ((high.attenuationDb || 0) - (low.attenuationDb || 0));
  }
  function applyProductLimitAttenuation(curve, attenuationCurve) {
    if (!Array.isArray(attenuationCurve) || !attenuationCurve.length) {
      return (Array.isArray(curve) ? curve : []).map((point) => ({ ...point }));
    }
    return (Array.isArray(curve) ? curve : []).map((point) => {
      if (!(point == null ? void 0 : point.frequency) || !Number.isFinite(Number(point == null ? void 0 : point.spl))) return { ...point };
      const attenuationDb = interpolateAttenuationDb(attenuationCurve, Number(point.frequency));
      if (!Number.isFinite(attenuationDb) || attenuationDb <= 0) return { ...point };
      return {
        ...point,
        spl: Number(point.spl) - attenuationDb,
        productLimitAttenuationDb: attenuationDb
      };
    });
  }
  function findAchievedProtectedNullBoostViolations(beforeCurve, afterCurve, protectedNullRegions) {
    return (Array.isArray(afterCurve) ? afterCurve : []).map((point) => {
      const region = (Array.isArray(protectedNullRegions) ? protectedNullRegions : []).find((candidate) => point.frequency >= candidate.startHz && point.frequency <= candidate.endHz);
      if (!region) return null;
      const beforeSpl = interpolateCorrection(beforeCurve, point.frequency);
      const finalSpl = Number(point == null ? void 0 : point.spl);
      const aggregateCorrectionDb = finalSpl - beforeSpl;
      return {
        authorityType: "protected-null-boost",
        frequencyHz: point.frequency,
        beforeSpl,
        finalSpl,
        aggregateCorrectionDb,
        protectedRegionStartHz: region.startHz,
        protectedRegionEndHz: region.endHz
      };
    }).filter((point) => point && Number.isFinite(point.aggregateCorrectionDb) && point.aggregateCorrectionDb > 0.05);
  }
  function capabilityLimitedRegions(curve) {
    const points = (Array.isArray(curve) ? curve : []).filter((point) => point.capabilityLimited);
    if (!points.length) return [];
    const regions = [];
    let current = [];
    const close = () => {
      if (!current.length) return;
      const worst = current.reduce((result, point) => {
        const effectiveMaximumSpl = Math.min(
          Number.isFinite(point.maximumSpl) ? point.maximumSpl : Infinity,
          Number.isFinite(point.productOperatingLimitSpl) ? point.productOperatingLimitSpl : Infinity
        );
        const shortfallDb = point.requestedSpl - effectiveMaximumSpl;
        return !result || shortfallDb > result.shortfallDb ? { frequencyHz: point.frequency, shortfallDb } : result;
      }, null);
      regions.push({
        startHz: current[0].frequency,
        endHz: current.at(-1).frequency,
        worstFrequencyHz: (worst == null ? void 0 : worst.frequencyHz) ?? null,
        maximumShortfallDb: (worst == null ? void 0 : worst.shortfallDb) ?? null
      });
      current = [];
    };
    (Array.isArray(curve) ? curve : []).forEach((point) => {
      if (point.capabilityLimited) current.push(point);
      else close();
    });
    close();
    return regions;
  }
  function bankLimits(eq) {
    var _a;
    const limits = eq.designEqFitProfile === "house_curve" ? eq.bankLimits : (_a = eq.bankDiagnostics) == null ? void 0 : _a.selectedBankLimits;
    return {
      maxAggregateBoostDb: (limits == null ? void 0 : limits.maxAggregateBoostDb) ?? null,
      maxAggregateBoostHz: (limits == null ? void 0 : limits.maxAggregateBoostHz) ?? null,
      maxAggregateCutDb: (limits == null ? void 0 : limits.maxAggregateCutDb) ?? null,
      maxAggregateCutHz: (limits == null ? void 0 : limits.maxAggregateCutHz) ?? null,
      boostLimitOk: (limits == null ? void 0 : limits.boostLimitOk) ?? null,
      cutLimitOk: (limits == null ? void 0 : limits.cutLimitOk) ?? null,
      sourceDomainHeadroomOk: (limits == null ? void 0 : limits.sourceDomainHeadroomOk) ?? null,
      allOk: (limits == null ? void 0 : limits.allOk) ?? eq.bankValidationPassed ?? null
    };
  }
  function buildOperatingOutputDiagnostics(activeSubs, usableLfHz, selectedOperatingOutputDb, correctionStartHz, correctionEndHz) {
    const authority = "selected-p14-target";
    if (!Array.isArray(activeSubs) || !activeSubs.length || !Number.isFinite(selectedOperatingOutputDb)) {
      return {
        selectedOperatingOutputDb: Number.isFinite(selectedOperatingOutputDb) ? selectedOperatingOutputDb : null,
        productCapabilityAuthoritySource: authority,
        maximumAllowedBoostByFrequency: [],
        firstBindingConstraint: null
      };
    }
    const bandFrequencies = [20, 25, 31.5, 40, 50, 63, 80, 100, 120, 141.68, 150, 200].filter((f) => f >= (correctionStartHz || 20) && f <= (correctionEndHz || 200));
    const maximumAllowedBoostByFrequency = bandFrequencies.map((frequency) => {
      const allowance = getSourceDomainBoostAllowance({
        frequency,
        requestedBoostDb: 6,
        activeSubs,
        usableLfHz,
        maxBoostDb: 6,
        requestedSystemOutputDb: selectedOperatingOutputDb
      });
      return {
        frequency,
        allowedBoostDb: Number.isFinite(allowance.allowedBoostDb) ? allowance.allowedBoostDb : 6,
        systemCapabilityDb: allowance.systemCapabilityDb ?? null,
        availableHeadroomDb: allowance.availableHeadroomDb ?? null
      };
    });
    const firstBinding = maximumAllowedBoostByFrequency.find(
      (point) => Number.isFinite(point.allowedBoostDb) && point.allowedBoostDb < 6 - 0.05
    );
    return {
      selectedOperatingOutputDb,
      productCapabilityAuthoritySource: authority,
      maximumAllowedBoostByFrequency,
      firstBindingConstraint: firstBinding ? { frequency: firstBinding.frequency, allowedBoostDb: firstBinding.allowedBoostDb, constraintType: "product-headroom" } : null
    };
  }
  function buildCanonicalCandidate({
    rawCurve,
    maximumSplCurveBeforeEq,
    levelNormalisedRawCurve,
    operatingLevelOffsetDb,
    perSeatRawCurves,
    perSeatMaximumSplCurves,
    eq,
    domains,
    targetCurve,
    targetShape,
    verticalOffsetDb,
    protectedNullRegions,
    baseRequestedSystemOutputDb,
    operatingSystemOutputDb,
    requestedOperatingLevelOffsetDb,
    selectedOperatingOutputDb,
    operatingOutputDiagnostics,
    pairedAuthorityInputs,
    activeSubs,
    p14TargetBasis,
    usableLfHz,
    practicalCalibrationTarget,
    p18RequiredExtensionHz,
    p18TargetBasis
  }) {
    var _a, _b, _c;
    const requestedPreEqCurve = (levelNormalisedRawCurve || []).map((point) => ({ ...point }));
    const predictorTargetCurve = Array.isArray(practicalCalibrationTarget) && practicalCalibrationTarget.length ? practicalCalibrationTarget : targetCurve;
    const maximumAfterEq = buildMaximumSplCurveAfterEq(maximumSplCurveBeforeEq);
    const productCurveMinHzValues = (activeSubs || []).map((sub) => {
      var _a2;
      return (_a2 = getProductCurveFrequencyRange((sub == null ? void 0 : sub.modelKey) ?? (sub == null ? void 0 : sub.model))) == null ? void 0 : _a2.minHz;
    }).filter(Number.isFinite);
    const refinementProductCurveMinHz = productCurveMinHzValues.length ? Math.max(...productCurveMinHzValues) : null;
    const selectedP18Basis = p18TargetBasis || p14TargetBasis;
    const resolvedP18RequiredExtensionHz = Number.isFinite(Number(p18RequiredExtensionHz)) ? Number(p18RequiredExtensionHz) : p18ThresholdHzForLevel(selectedP18Basis, 1);
    const evaluateCandidate = (globalTrimDbOverride) => {
      var _a2, _b2, _c2, _d, _e;
      const realisticResult = predictRealisticPostCalibrationCorrection({
        maximumCapabilityCurve: maximumSplCurveBeforeEq,
        targetCurve: predictorTargetCurve,
        assessmentStartHz: domains.p19StartHz,
        assessmentEndHz: domains.p19EndHz,
        protectedNullRegions,
        activeSubs,
        usableLfHz,
        requestedSystemOutputDb: selectedOperatingOutputDb,
        ...globalTrimDbOverride !== null && globalTrimDbOverride !== void 0 && Number.isFinite(Number(globalTrimDbOverride)) ? { globalTrimDbOverride: Number(globalTrimDbOverride) } : {}
      });
      const correctionCurve = realisticResult.correctionCurve;
      const globalTrimDb = realisticResult.globalTrimDb;
      const operatingPreEqCurve = realisticResult.operatingPreEqCurve;
      const rawCorrectionCurve = Array.isArray(realisticResult.rawCorrectionCurve) ? realisticResult.rawCorrectionCurve : [];
      const achievedPre = operatingPreEqCurve.map((point) => ({ ...point }));
      const envelope2 = buildProductOperatingEnvelope({
        frequencyGrid: operatingPreEqCurve.map((point) => point.frequency),
        targetCurve,
        activeSubs,
        combinedEqCurve: correctionCurve,
        selectedOperatingOutputDb,
        targetBasis: p14TargetBasis
      });
      const unconstrainedPost = operatingPreEqCurve.map((point) => ({
        frequency: point.frequency,
        spl: point.spl + interpolateCorrection(correctionCurve, point.frequency)
      }));
      const maxClamped = capCurveToEnvelope(unconstrainedPost, maximumSplCurveBeforeEq);
      const finalPost = capCurveToProductOperatingEnvelope(maxClamped, envelope2.curve);
      const candidatePerSeatMaxSplMap = /* @__PURE__ */ new Map();
      for (const seat of Array.isArray(perSeatMaximumSplCurves) ? perSeatMaximumSplCurves : []) {
        if ((seat == null ? void 0 : seat.seatId) && seat.seatId !== "rsp" && Array.isArray(seat == null ? void 0 : seat.responseData)) {
          candidatePerSeatMaxSplMap.set(seat.seatId, seat.responseData);
        }
      }
      const requestedPerSeat = applyBankToSeats(perSeatMaximumSplCurves, correctionCurve).map((seat) => ({
        ...seat,
        responseData: seat.responseData.map((point) => ({
          ...point,
          spl: Number.isFinite(point.spl) ? point.spl + globalTrimDb : point.spl
        }))
      }));
      const productLimitAttenuationCurve2 = buildProductLimitAttenuationCurve(maxClamped, finalPost);
      const candidatePerSeatCurves = requestedPerSeat.map((seat) => {
        const maxSpl = candidatePerSeatMaxSplMap.get(seat.seatId);
        const capabilityClamped = maxSpl ? capCurveToEnvelope(seat.responseData, maxSpl) : seat.responseData;
        return {
          ...seat,
          responseData: applyProductLimitAttenuation(capabilityClamped, productLimitAttenuationCurve2)
        };
      });
      const pairedP14P18Authority2 = calculatePairedP14P18ProductionAuthority({
        ...pairedAuthorityInputs || {},
        combinedEqCurve: correctionCurve,
        selectedCorrectionIdentity: buildCurveSignature(correctionCurve)
      });
      const p14Pass = (pairedP14P18Authority2 == null ? void 0 : pairedP14P18Authority2.status) === "PASS";
      const p14MarginDb = ((_a2 = pairedP14P18Authority2 == null ? void 0 : pairedP14P18Authority2.limitingResult) == null ? void 0 : _a2.marginDb) ?? null;
      const p14AchievedDb = ((_b2 = pairedP14P18Authority2 == null ? void 0 : pairedP14P18Authority2.limitingResult) == null ? void 0 : _b2.worstCapabilityDb) ?? null;
      const p14TargetDb = ((_c2 = pairedP14P18Authority2 == null ? void 0 : pairedP14P18Authority2.requested) == null ? void 0 : _c2.targetSplDb) ?? selectedOperatingOutputDb;
      const p18Assessment = assessP18AgainstRequiredExtension({
        rspPostEqCurve: finalPost,
        canonicalTargetCurve: targetCurve,
        perSeatPostEqCurves: candidatePerSeatCurves,
        selectedP14TargetDb: selectedOperatingOutputDb,
        requiredExtensionHz: resolvedP18RequiredExtensionHz,
        p18CutoffDb: null,
        configuredUsableLfHz: usableLfHz,
        productCurveMinHz: refinementProductCurveMinHz,
        activeSubs
      });
      const achievedP18Hz = (p18Assessment == null ? void 0 : p18Assessment.achievedExtensionHz) ?? null;
      const achievedP18Bounded = (p18Assessment == null ? void 0 : p18Assessment.achievedExtensionBounded) ?? false;
      const p18Passes = (p18Assessment == null ? void 0 : p18Assessment.passes) ?? false;
      const p18ExtensionResult = assessP18Extension(achievedP18Hz, selectedP18Basis);
      const achievedP18Level = (p18ExtensionResult == null ? void 0 : p18ExtensionResult.level) ?? 0;
      const assessmentBand = resolveBassAssessmentBand({
        p14Pass,
        achievedP18Hz,
        transitionHz: domains.p19EndHz
      });
      let p19Db = null, p19Level = null, p19WorstFrequencyHz = null;
      let perSeatP19 = [];
      let p20Db = null, p20Level = null, p20Available = false;
      let perSeatP20 = [];
      if (assessmentBand.valid) {
        const p19 = computeCorrectableP19Diagnostic({
          rspPostEqCurve: finalPost,
          canonicalTargetCurve: predictorTargetCurve,
          assessmentStartHz: assessmentBand.lowerHz,
          assessmentEndHz: assessmentBand.upperHz,
          protectedNullRegions
        });
        p19Db = (p19 == null ? void 0 : p19.variationDbRaw) ?? null;
        p19Level = (p19 == null ? void 0 : p19.level) ?? null;
        p19WorstFrequencyHz = (p19 == null ? void 0 : p19.worstFrequencyHz) ?? null;
        perSeatP19 = [];
        const p20 = computeOfficialP20Assessment({
          rspPostEqCurve: finalPost,
          perSeatPostEqCurves: candidatePerSeatCurves,
          assessmentStartHz: assessmentBand.lowerHz,
          assessmentEndHz: assessmentBand.upperHz
        });
        p20Available = (p20 == null ? void 0 : p20.available) ?? false;
        p20Db = ((_d = p20 == null ? void 0 : p20.worstSeat) == null ? void 0 : _d.variationDbRaw) ?? null;
        p20Level = ((_e = p20 == null ? void 0 : p20.worstSeat) == null ? void 0 : _e.level) ?? null;
        perSeatP20 = ((p20 == null ? void 0 : p20.perSeatResults) || []).map((seat) => {
          var _a3;
          return {
            ...seat,
            isPrimary: !!((_a3 = candidatePerSeatCurves.find((s) => s.seatId === seat.seatId)) == null ? void 0 : _a3.isPrimary)
          };
        });
      }
      const operatingOutputBandHz = {
        lowerHz: P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz,
        upperHz: P14_EQ_ASSESSMENT_RANGE_HZ.upperHz
      };
      const finalOperatingOutputDb = integrateRawResponseLevelDbC({
        rawCurve: finalPost,
        lowerHz: operatingOutputBandHz.lowerHz,
        upperHz: operatingOutputBandHz.upperHz
      });
      const operatingOutputErrorDb = finalOperatingOutputDb !== null && Number.isFinite(selectedOperatingOutputDb) ? finalOperatingOutputDb - selectedOperatingOutputDb : null;
      const operatingOutputValid = operatingOutputErrorDb !== null && Math.abs(operatingOutputErrorDb) <= OPERATING_OUTPUT_TOLERANCE_DB;
      const maxBoostDb = Math.max(0, ...correctionCurve.map((p) => Number(p.spl) || 0));
      const maxCutDb = Math.min(0, ...correctionCurve.map((p) => Number(p.spl) || 0));
      const peakBoostViolations = findAggregatePeakBoostViolations(achievedPre, finalPost, targetCurve);
      const protectedNullViolations = findAchievedProtectedNullBoostViolations(achievedPre, finalPost, protectedNullRegions);
      const physicalAuthorityViolations = [...peakBoostViolations, ...protectedNullViolations];
      const physicalEqAuthorityPassed = physicalAuthorityViolations.length === 0;
      return {
        globalTrimDb,
        correctionCurve,
        operatingPreEqCurve,
        rawCorrectionCurve,
        achievedPreEqCurve: achievedPre,
        unconstrainedPostEqCurve: unconstrainedPost,
        finalPostEqCurve: finalPost,
        perSeatPostEqCurves: candidatePerSeatCurves,
        productOperatingEnvelope: envelope2,
        productLimitAttenuationCurve: productLimitAttenuationCurve2,
        p14Pass,
        p14Status: (pairedP14P18Authority2 == null ? void 0 : pairedP14P18Authority2.status) ?? null,
        p14AchievedDb,
        p14TargetDb,
        p14MarginDb,
        pairedP14P18Authority: pairedP14P18Authority2,
        achievedP18Hz,
        achievedP18Level,
        achievedP18Bounded,
        p18Passes,
        assessmentBand,
        p19Db,
        p19Level,
        p19WorstFrequencyHz,
        perSeatP19,
        p20Available,
        p20Db,
        p20Level,
        perSeatP20,
        maxBoostDb,
        maxCutDb,
        physicalEqAuthorityPassed,
        physicalAuthorityViolations,
        selectedOperatingOutputDb,
        finalOperatingOutputDb,
        operatingOutputErrorDb,
        operatingOutputValid,
        operatingOutputBandHz,
        primarySeatSafety: null
      };
    };
    const pass1Evaluation = evaluateCandidate(null);
    pass1Evaluation.primarySeatSafety = { regressed: false };
    const refinementResult = refineP19GlobalNormalisation({
      evaluateCandidate: (trim) => {
        const evaluation = evaluateCandidate(trim);
        if (!evaluation) return null;
        evaluation.primarySeatSafety = hasPrimarySeatRegression(
          { perSeatP19: pass1Evaluation.perSeatP19, perSeatP20: pass1Evaluation.perSeatP20 },
          { perSeatP19: evaluation.perSeatP19, perSeatP20: evaluation.perSeatP20 }
        );
        return evaluation;
      },
      pass1GlobalTrimDb: pass1Evaluation.globalTrimDb,
      pass1Evaluation
    });
    let realisticCorrectionCurve = pass1Evaluation.correctionCurve;
    let realisticRawCorrectionCurve = pass1Evaluation.rawCorrectionCurve || [];
    let realisticGlobalTrimDb = pass1Evaluation.globalTrimDb;
    let realisticOperatingPreEqCurve = pass1Evaluation.operatingPreEqCurve;
    let achievedPreEqCurve = pass1Evaluation.achievedPreEqCurve;
    let unconstrainedPostEqCurve = pass1Evaluation.unconstrainedPostEqCurve;
    let productOperatingEnvelope = pass1Evaluation.productOperatingEnvelope;
    let productLimitAttenuationCurve = pass1Evaluation.productLimitAttenuationCurve || [];
    let finalPostEqCurve = pass1Evaluation.finalPostEqCurve;
    let perSeatPostEqCurves = pass1Evaluation.perSeatPostEqCurves;
    let p19BoundedRefinementDiagnostics = null;
    if (refinementResult == null ? void 0 : refinementResult.refinementAttempted) {
      p19BoundedRefinementDiagnostics = {
        refinementAttempted: true,
        refinementImproved: refinementResult.refinementImproved,
        pass1P19Db: refinementResult.pass1P19Db,
        refinedP19Db: refinementResult.refinedP19Db,
        improvementDb: refinementResult.improvementDb,
        pass1GlobalTrimDb: refinementResult.pass1GlobalTrimDb,
        refinedGlobalTrimDb: refinementResult.refinedGlobalTrimDb,
        pass1P18Hz: refinementResult.pass1P18Hz,
        refinedP18Hz: refinementResult.refinedP18Hz,
        pass1P18Level: refinementResult.pass1P18Level,
        refinedP18Level: refinementResult.refinedP18Level,
        pass1P14Pass: refinementResult.pass1P14Pass,
        refinedP14Pass: refinementResult.refinedP14Pass,
        pass1P14MarginDb: refinementResult.pass1P14MarginDb,
        refinedP14MarginDb: refinementResult.refinedP14MarginDb,
        pass1P20Db: refinementResult.pass1P20Db,
        refinedP20Db: refinementResult.refinedP20Db,
        bindingConstraint: refinementResult.bindingConstraint,
        candidatesTested: refinementResult.candidatesTested,
        coarseRefinementTimeMs: refinementResult.coarseRefinementTimeMs,
        fineRefinementTimeMs: refinementResult.fineRefinementTimeMs,
        totalAddedLatencyMs: refinementResult.totalAddedLatencyMs,
        pass1AssessmentBand: refinementResult.pass1AssessmentBand,
        refinedAssessmentBand: refinementResult.refinedAssessmentBand,
        maxBoostDb: refinementResult.maxBoostDb,
        maxCutDb: refinementResult.maxCutDb,
        selectedOperatingOutputDb: refinementResult.selectedOperatingOutputDb,
        pass1FinalOperatingOutputDb: refinementResult.pass1FinalOperatingOutputDb,
        pass1OperatingOutputErrorDb: refinementResult.pass1OperatingOutputErrorDb,
        pass1OperatingOutputValid: refinementResult.pass1OperatingOutputValid,
        refinedFinalOperatingOutputDb: refinementResult.refinedFinalOperatingOutputDb,
        refinedOperatingOutputErrorDb: refinementResult.refinedOperatingOutputErrorDb,
        refinedOperatingOutputValid: refinementResult.refinedOperatingOutputValid
      };
      if (refinementResult.refinementImproved && refinementResult.refinedEvaluation) {
        const refined = refinementResult.refinedEvaluation;
        realisticCorrectionCurve = refined.correctionCurve;
        realisticRawCorrectionCurve = refined.rawCorrectionCurve || [];
        realisticGlobalTrimDb = refined.globalTrimDb;
        realisticOperatingPreEqCurve = refined.operatingPreEqCurve;
        achievedPreEqCurve = refined.achievedPreEqCurve;
        unconstrainedPostEqCurve = refined.unconstrainedPostEqCurve;
        productOperatingEnvelope = refined.productOperatingEnvelope;
        productLimitAttenuationCurve = refined.productLimitAttenuationCurve || [];
        finalPostEqCurve = refined.finalPostEqCurve;
        perSeatPostEqCurves = refined.perSeatPostEqCurves;
      }
    }
    const achievedPeakBoostViolations = findAggregatePeakBoostViolations(
      achievedPreEqCurve,
      finalPostEqCurve,
      targetCurve
    );
    const achievedProtectedNullBoostViolations = findAchievedProtectedNullBoostViolations(
      achievedPreEqCurve,
      finalPostEqCurve,
      protectedNullRegions
    );
    const achievedPhysicalAuthorityViolations = [
      ...achievedPeakBoostViolations,
      ...achievedProtectedNullBoostViolations
    ];
    const achievedPhysicalEqAuthorityPassed = achievedPhysicalAuthorityViolations.length === 0;
    const maximumPerSeatAfterEqCurves = (Array.isArray(perSeatMaximumSplCurves) ? perSeatMaximumSplCurves : []).filter((seat) => (seat == null ? void 0 : seat.seatId) !== "rsp" && Array.isArray(seat == null ? void 0 : seat.responseData)).map((seat) => ({
      seatId: seat.seatId,
      isPrimary: !!seat.isPrimary,
      responseData: buildMaximumSplCurveAfterEq(seat.responseData).curve
    }));
    const seatsForMetrics = perSeatPostEqCurves.length ? perSeatPostEqCurves : [{ seatId: "rsp", isPrimary: true, responseData: finalPostEqCurve }];
    const seatMetrics = calculateAllSeatMetricsFromCorrected(
      seatsForMetrics,
      domains.p19StartHz,
      domains.p19EndHz,
      verticalOffsetDb,
      predictorTargetCurve
    );
    const limits = bankLimits(eq);
    const positiveEqDemandCurve = realisticCorrectionCurve.map((point) => ({
      frequency: point.frequency,
      demandDb: Math.max(0, Number(point.spl) || 0)
    }));
    const smoothed = applyBassSmoothing(finalPostEqCurve, "third").filter((point) => point.frequency >= domains.correctionStartHz && point.frequency <= domains.correctionEndHz);
    const limitedRegions = capabilityLimitedRegions(finalPostEqCurve);
    const pairedP14P18Authority = calculatePairedP14P18ProductionAuthority({
      ...pairedAuthorityInputs || {},
      combinedEqCurve: realisticCorrectionCurve,
      selectedCorrectionIdentity: buildCurveSignature(realisticCorrectionCurve)
    });
    const pairedP14P18Summary = buildPairedP14P18CandidateSummary(pairedP14P18Authority);
    return {
      canonical: true,
      designEqFitProfile: eq.designEqFitProfile || "standard",
      designEqFitProfileConfig: eq.designEqFitProfileConfig || null,
      startStrategy: eq.designEqFitProfile === "house_curve" ? "multi-start" : "single",
      selectedStart: eq.selectedStart ?? null,
      rawResponseCurve: rawCurve.map((point) => ({ ...point })),
      maximumSplCurveBeforeEq: (maximumSplCurveBeforeEq || []).map((point) => ({ ...point })),
      maximumSplCurveAfterEq: maximumAfterEq.curve.map((point) => ({ ...point })),
      productOperatingEnvelopeCurve: productOperatingEnvelope.curve.map((point) => ({ ...point })),
      productLimitAttenuationCurve: (productLimitAttenuationCurve || []).map((point) => ({
        frequency: point.frequency,
        attenuationDb: point.attenuationDb,
        rspBeforeProductLimit: point.rspBeforeProductLimit,
        rspAfterProductLimit: point.rspAfterProductLimit
      })),
      productOperatingEnvelopeAuthority: productOperatingEnvelope.authority || null,
      productOperatingMarginDb: productOperatingEnvelope.operatingMarginDb,
      productOperatingHeadroomDb: productOperatingEnvelope.operatingHeadroomDb,
      productOperatingShortfallDb: productOperatingEnvelope.p14ShortfallDb,
      productExtensionBandEndHz: productOperatingEnvelope.extensionBandEndHz,
      productOperatingReferenceCapabilityDb: productOperatingEnvelope.referenceCapabilityDb,
      maximumSplSafetyMarginDb: BASS_CAPABILITY_RESERVE_DB,
      maximumSplGlobalEqTrimDb: maximumAfterEq.globalEqTrimDb,
      maximumSplAuthority: {
        method: "authoritative-position-aware-engine-envelope",
        version: "1.0.0",
        includesRoomGeometry: true,
        includesProductFrequencyResponse: true,
        includesProductOutputLimit: true,
        safetyMarginDb: BASS_CAPABILITY_RESERVE_DB
      },
      requestedPreEqOperatingCurve: requestedPreEqCurve,
      rspBeforePeqAtOperatingLevel: achievedPreEqCurve,
      realisticGlobalTrimDb: Number.isFinite(realisticGlobalTrimDb) ? realisticGlobalTrimDb : 0,
      operatingPreEqCurve: (realisticOperatingPreEqCurve || []).map((point) => ({ ...point })),
      // Pre-smoothing correction envelope, carried verbatim from the predictor.
      rawCorrectionCurve: (realisticRawCorrectionCurve || []).map((point) => ({ ...point })),
      operatingLevelOffsetDb: Number.isFinite(operatingLevelOffsetDb) ? operatingLevelOffsetDb : 0,
      requestedOperatingLevelOffsetDb: Number.isFinite(requestedOperatingLevelOffsetDb) ? requestedOperatingLevelOffsetDb : 0,
      baseRequestedSystemOutputDb: Number.isFinite(baseRequestedSystemOutputDb) ? baseRequestedSystemOutputDb : null,
      operatingSystemOutputDb: Number.isFinite(operatingSystemOutputDb) ? operatingSystemOutputDb : null,
      selectedOperatingOutputDb: Number.isFinite(selectedOperatingOutputDb) ? selectedOperatingOutputDb : null,
      operatingOutputDiagnostics: operatingOutputDiagnostics || null,
      rawResponseSignature: buildCurveSignature(rawCurve),
      generatedFilterBank: eq.filters || [],
      unconstrainedPostEqCurve,
      finalPostEqCurve,
      combinedEqCurve: realisticCorrectionCurve,
      perSeatPostEqCurves,
      maximumPerSeatPostEqCurves: maximumPerSeatAfterEqCurves,
      capabilityLimitedRegions: limitedRegions,
      capabilityLimitedPointCount: finalPostEqCurve.filter((point) => point.capabilityLimited).length,
      pairedP14P18Authority,
      pairedP14P18Summary,
      productionHouseCurveTarget: targetCurve.map((point) => ({ ...point })),
      practicalCalibrationTarget: (Array.isArray(practicalCalibrationTarget) ? practicalCalibrationTarget : targetCurve).map((point) => ({ ...point })),
      // Explicit P19 target identity: confirms the predictor and P19 grading
      // both use the same practical calibration target authority.
      calibrationTargetIdentity: Array.isArray(practicalCalibrationTarget) && practicalCalibrationTarget.length ? "practical-calibration-target" : "ideal-house-target",
      fitterHouseCurveTarget: (eq.fitterHouseCurveTarget || targetCurve).map((point) => ({ ...point })),
      canonicalHouseCurveShape: targetShape.map((point) => ({ ...point })),
      canonicalVerticalOffsetDb: verticalOffsetDb,
      positiveEqDemandCurve,
      protectedNullRegions: protectedNullRegions.map((region) => ({ ...region })),
      assessmentStartHz: domains.p19StartHz,
      assessmentEndHz: domains.p19EndHz,
      correctionStartHz: domains.correctionStartHz,
      correctionEndHz: domains.correctionEndHz,
      physicalEqAuthorityPassed: achievedPhysicalEqAuthorityPassed,
      physicalAuthorityViolations: achievedPhysicalAuthorityViolations,
      achievedProtectedNullBoostViolations,
      requestedPhysicalAuthorityViolations: eq.physicalAuthorityViolations || [],
      bankValidationResult: limits,
      aggregateBankLimits: limits,
      physicalValidation: { passed: achievedPhysicalEqAuthorityPassed && limits.allOk !== false, bankLimits: limits },
      fitMetrics: {
        maximumResidualDb: eq.rspObjectiveMaxDeviationDb ?? eq.rspMaxDeviationDb ?? ((_a = eq.selectedCheckpoint) == null ? void 0 : _a.maximumAbsoluteDeviationDb) ?? null,
        rmsResidualDb: eq.rspRmsDeviationDb ?? ((_b = eq.selectedCheckpoint) == null ? void 0 : _b.rmsDeviationDb) ?? null,
        meanSignedResidualDb: eq.rspMeanSignedResidualDb ?? null,
        shapeRmsResidualDb: eq.rspShapeRmsDeviationDb ?? null,
        smoothedPointCount: smoothed.length
      },
      worstSeatMaxDeviationDb: (seatMetrics == null ? void 0 : seatMetrics.worstSeatMaxDeviationDb) ?? eq.worstSeatMaxDeviationDb ?? null,
      meanSeatMaxDeviationDb: (seatMetrics == null ? void 0 : seatMetrics.meanSeatMaxDeviationDb) ?? eq.meanSeatMaxDeviationDb ?? null,
      rmsSeatTargetErrorDb: (seatMetrics == null ? void 0 : seatMetrics.rmsSeatTargetErrorDb) ?? eq.rmsSeatTargetErrorDb ?? null,
      perSeatMetrics: (seatMetrics == null ? void 0 : seatMetrics.seatMetrics) ?? eq.perSeatMetrics ?? [],
      rspObjectiveMaxDeviationDb: eq.rspObjectiveMaxDeviationDb ?? eq.rspMaxDeviationDb ?? null,
      rspRmsResidualDb: eq.rspRmsDeviationDb ?? ((_c = eq.selectedCheckpoint) == null ? void 0 : _c.rmsDeviationDb) ?? null,
      rspMeanSignedResidualDb: eq.rspMeanSignedResidualDb ?? null,
      rspMeanAbsoluteResidualDb: null,
      rspShapeRmsResidualDb: eq.rspShapeRmsDeviationDb ?? null,
      designEqIterationTrace: eq.iterationTrace || [],
      designEqDetectedRegions: eq.detectedRegions || [],
      designEqCandidateAcceptanceDiagnostics: eq.candidateAcceptanceDiagnostics || [],
      designEqCandidateSelectionDiagnostics: eq.candidateSelectionDiagnostics || [],
      designEqFilterDecisionDiagnostics: eq.filterDecisionDiagnostics || [],
      rejectedEqCandidates: eq.rejectedEqCandidates || [],
      seatToleranceAdjustedCandidates: eq.seatToleranceAdjustedCandidates || [],
      seatRegressionToleranceDiagnostics: eq.seatRegressionToleranceDiagnostics || null,
      designEqStopReason: eq.stopReason || null,
      designEqSelectionReason: eq.selectionReason || null,
      designEqBankDiagnostics: eq.bankDiagnostics || null,
      houseCurveDiagnostics: eq.houseCurveDiagnostics || null,
      p19BoundedRefinementDiagnostics
    };
  }
  function generateCanonicalCandidatePool({
    rawCurve = [],
    activeSubs = [],
    usableLfHz = null,
    transitionHz = 120,
    correctionEndHz = 200,
    perSeatRawCurves = [],
    collectDiagnostics = false,
    onProgress = null,
    reuseExactHouseCurveEvaluations = true,
    selectedP14TargetDb = 109,
    p14TargetBasis = "minimum",
    p14TargetLevel = 1,
    p18TargetBasis = p14TargetBasis,
    selectedP18RequiredExtensionHz = null,
    perSourceComplexTransfers = [],
    normalizedTransferFingerprint = null,
    calibrationFingerprint = null,
    correctabilityAssessment = null
  } = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    setCorrectabilityGate(correctabilityAssessment);
    try {
      const missingInputs = [!rawCurve.length && "rawCurve", !activeSubs.length && "activeSubs"].filter(Boolean);
      if (missingInputs.length) return stampPoolAuthority({
        poolVersion: BASS_OPTIMISER_POOL_VERSION,
        candidates: [],
        selectablePool: [],
        poolId: null,
        generatedCandidateCount: 0,
        physicallyCredibleCount: 0,
        generationStatus: "invalid-inputs",
        missingInputs,
        warningMessage: `Missing mandatory optimiser input${missingInputs.length > 1 ? "s" : ""}: ${missingInputs.join(", ")}`
      });
      const nowMs = () => typeof performance !== "undefined" ? performance.now() : Date.now();
      const startedAt = nowMs();
      const domains = resolveHouseCurveDomains(
        rawCurve.map((point) => point.frequency),
        correctionEndHz,
        transitionHz
      );
      const houseCurveShape = [15, 20, 25, 31.5, 40, 50, 63, 80, 100, 120, 150, 200, 400].map((f) => ({ frequency: f, offsetDb: artcousticHouseCurveOffsetAt(f) }));
      const p14AssessmentStartHz = 20;
      const requiredExtensionHz = p14AssessmentStartHz;
      const p14Normalisation = normaliseHouseCurveToP14Total({
        houseCurveShape,
        selectedP14TargetDb: Number(selectedP14TargetDb),
        requiredExtensionHz: p14AssessmentStartHz,
        upperLfeHz: 120
      });
      let verticalOffsetDb = p14Normalisation == null ? void 0 : p14Normalisation.operatingCurveOffsetDb;
      if (!Number.isFinite(verticalOffsetDb)) {
        verticalOffsetDb = deriveProductionEqVerticalAnchor(rawCurve);
      }
      if (!Number.isFinite(verticalOffsetDb)) return stampPoolAuthority({
        poolVersion: BASS_OPTIMISER_POOL_VERSION,
        candidates: [],
        selectablePool: [],
        poolId: null,
        generatedCandidateCount: 0,
        physicallyCredibleCount: 0,
        generationStatus: "invalid-anchor",
        missingInputs: ["canonicalVerticalOffsetDb"],
        warningMessage: "Could not align the house-curve shape to the raw response."
      });
      const targetCurve = buildCanonicalAbsoluteHouseCurveTarget({
        frequencyGrid: rawCurve.map((point) => point.frequency),
        targetAnchorDb: verticalOffsetDb,
        correctionStartHz: rawCurve[0].frequency,
        correctionEndHz: rawCurve.at(-1).frequency
      });
      const targetShape = targetCurve.map((point) => ({ frequency: point.frequency, offsetDb: point.spl - verticalOffsetDb }));
      const seats = (Array.isArray(perSeatRawCurves) ? perSeatRawCurves : []).filter((seat) => Array.isArray(seat == null ? void 0 : seat.responseData) && seat.responseData.length);
      const maximumSplCurveBeforeEq = applyMaximumSplSafetyMargin(rawCurve);
      const perSeatMaximumSplCurves = seats.map((seat) => ({
        ...seat,
        responseData: applyMaximumSplSafetyMargin(seat.responseData)
      }));
      const { capabilityEnvelope: practicalCapabilityEnvelope, practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
        idealTargetCurve: targetCurve,
        maximumSplCurve: maximumSplCurveBeforeEq
      });
      const capabilityConstrainedFitTarget = practicalCalibrationTarget;
      const baseRequestedSystemOutputDb = getCurrentSystemSourceOutput(activeSubs);
      const preliminaryProtectedNullRegions = identifyProtectedNullRegions(
        rawCurve,
        domains.correctionStartHz,
        domains.correctionEndHz,
        verticalOffsetDb,
        activeSubs,
        usableLfHz,
        null,
        targetCurve
      );
      const operatingLevelWindowDiagnostics = deriveCorrectionWindowOperatingOffsetDb({
        rawCurve,
        targetCurve,
        assessmentStartHz: domains.correctionStartHz,
        assessmentEndHz: domains.correctionEndHz,
        protectedNullRegions: preliminaryProtectedNullRegions,
        assessmentSmoothing: "none"
      });
      const requestedOperatingLevelOffsetDb = operatingLevelWindowDiagnostics.requestedOffsetDb;
      const appliedOperatingLevelOffsetDb = clampPositiveOperatingOffset(
        requestedOperatingLevelOffsetDb,
        activeSubs,
        baseRequestedSystemOutputDb,
        requiredExtensionHz
      );
      operatingLevelWindowDiagnostics.appliedOffsetDb = appliedOperatingLevelOffsetDb;
      operatingLevelWindowDiagnostics.positiveHeadroomLimited = appliedOperatingLevelOffsetDb < requestedOperatingLevelOffsetDb - 0.05;
      const operatingSystemOutputDb = Number.isFinite(baseRequestedSystemOutputDb) ? Number(baseRequestedSystemOutputDb) + appliedOperatingLevelOffsetDb : appliedOperatingLevelOffsetDb;
      const selectedOperatingOutputDb = Number.isFinite(selectedP14TargetDb) ? Number(selectedP14TargetDb) : Number.isFinite(baseRequestedSystemOutputDb) ? baseRequestedSystemOutputDb : null;
      const operatingOutputDiagnostics = buildOperatingOutputDiagnostics(
        activeSubs,
        usableLfHz,
        selectedOperatingOutputDb,
        domains.correctionStartHz,
        domains.correctionEndHz
      );
      const pairedAuthorityInputs = {
        activeSubs,
        perSourceComplexTransfers,
        targetBasis: p14TargetBasis,
        requestedLevel: p14TargetLevel,
        requestedTargetSplDb: selectedP14TargetDb,
        normalizedTransferFingerprint,
        calibrationFingerprint
      };
      const levelNormalisedRawCurve = rawCurve.map((point) => ({
        ...point,
        spl: Number.isFinite(point.spl) ? point.spl + appliedOperatingLevelOffsetDb : point.spl
      }));
      const levelNormalisedSeats = seats.map((seat) => ({
        ...seat,
        responseData: seat.responseData.map((point) => ({
          ...point,
          spl: Number.isFinite(point.spl) ? point.spl + appliedOperatingLevelOffsetDb : point.spl
        }))
      }));
      const identifiedProtectedNullRegions = identifyVerifiedProtectedNullRegions(
        levelNormalisedRawCurve,
        domains.correctionStartHz,
        domains.correctionEndHz,
        verticalOffsetDb,
        activeSubs,
        usableLfHz,
        null,
        targetCurve,
        perSourceComplexTransfers
      );
      const protectedNullRegions = identifiedProtectedNullRegions;
      const runIterativeFitters = !!collectDiagnostics;
      const totalTasks = runIterativeFitters ? FIT_PROFILES.length + 1 : 1;
      let completedTasks = 0;
      const report = (phase) => onProgress == null ? void 0 : onProgress({ phase, completedTasks, totalTasks, completedRequests: completedTasks, totalRequests: totalTasks });
      report("Canonical target aligned");
      const fitOptions = (profile, initialFilters = []) => ({
        targetAnchorDb: verticalOffsetDb,
        p14TargetDb: Number(selectedP14TargetDb),
        canonicalTargetCurve: capabilityConstrainedFitTarget,
        protectedNullRegions,
        fitProfile: profile,
        assessmentStartHz: domains.correctionStartHz,
        assessmentEndHz: domains.correctionEndHz,
        collectDiagnostics,
        initialFilters,
        requestedSystemOutputDb: selectedOperatingOutputDb
      });
      const eqResults = [];
      let standardFitTimeMs = 0;
      let accuracyFitTimeMs = 0;
      let houseCurveFitTimeMs = 0;
      let houseEq = null;
      if (runIterativeFitters) {
        const standardFitStartedAt = nowMs();
        const standardEq = calculateDesignEqCurve(levelNormalisedRawCurve, usableLfHz, activeSubs, fitOptions("standard"));
        standardFitTimeMs = nowMs() - standardFitStartedAt;
        eqResults.push(standardEq);
        completedTasks += 1;
        report("Canonical standard fit complete");
        const seedSource = standardEq.standardSeedFilters && standardEq.standardSeedFilters.length ? standardEq.standardSeedFilters : standardEq.bestSeedFilters && standardEq.bestSeedFilters.length ? standardEq.bestSeedFilters : standardEq.filters || [];
        const seed = seedSource.filter((filter) => filter == null ? void 0 : filter.enabled);
        const accuracyFitStartedAt = nowMs();
        const accuracyEq = calculateDesignEqCurve(levelNormalisedRawCurve, usableLfHz, activeSubs, fitOptions("accuracy", seed));
        accuracyFitTimeMs = nowMs() - accuracyFitStartedAt;
        eqResults.push(accuracyEq);
        completedTasks += 1;
        report("Canonical accuracy fit complete");
        const houseCurveFitStartedAt = nowMs();
        houseEq = calculateHouseCurveEqCurve(levelNormalisedRawCurve, levelNormalisedSeats, usableLfHz, activeSubs, {
          ...fitOptions("house_curve", seed),
          assessmentStartHz: domains.p19StartHz,
          assessmentEndHz: domains.p19EndHz,
          fitStartHz: domains.correctionStartHz,
          fitEndHz: domains.correctionEndHz,
          correctionStartHz: domains.correctionStartHz,
          correctionEndHz: domains.correctionEndHz,
          reuseExactEvaluations: reuseExactHouseCurveEvaluations
        });
        houseCurveFitTimeMs = nowMs() - houseCurveFitStartedAt;
        eqResults.push(houseEq);
        completedTasks += 1;
        report("Canonical house-curve fit complete");
      } else {
        eqResults.push({
          designEqFitProfile: "deterministic",
          designEqFitProfileConfig: null,
          selectedStart: "deterministic",
          filters: [],
          curve: levelNormalisedRawCurve.map((point) => ({ ...point })),
          combinedEqCurve: [],
          fitterHouseCurveTarget: targetCurve,
          // Not-evaluated semantics: the iterative fitter never ran, so its own
          // physical-authority and bank-validation gates were not exercised.
          // The candidate's separate achieved-curve physicalEqAuthorityPassed
          // (computed in buildCanonicalCandidate from the actual finalPostEqCurve)
          // and bankValidationResult (from bankLimits on the actual empty bank)
          // remain the real authorities — those ARE evaluated and are correct.
          physicalEqAuthorityPassed: null,
          physicalAuthorityViolations: [],
          bankValidationPassed: null,
          bankLimits: { allOk: true, boostLimitOk: true, cutLimitOk: true, sourceDomainHeadroomOk: true, maxAggregateBoostDb: 0, maxAggregateBoostHz: null, maxAggregateCutDb: 0, maxAggregateCutHz: null },
          bankDiagnostics: { selectedBankLimits: { allOk: true, boostLimitOk: true, cutLimitOk: true, sourceDomainHeadroomOk: true, maxAggregateBoostDb: 0, maxAggregateBoostHz: null, maxAggregateCutDb: 0, maxAggregateCutHz: null } },
          rspObjectiveMaxDeviationDb: null,
          rspMaxDeviationDb: null,
          rspRmsDeviationDb: null,
          rspMeanSignedResidualDb: null,
          rspShapeRmsDeviationDb: null,
          iterationTrace: [],
          detectedRegions: [],
          candidateAcceptanceDiagnostics: [],
          candidateSelectionDiagnostics: [],
          filterDecisionDiagnostics: [],
          rejectedEqCandidates: [],
          seatToleranceAdjustedCandidates: [],
          seatRegressionToleranceDiagnostics: null,
          stopReason: "deterministic-prediction-no-iterative-fitting",
          selectionReason: "Deterministic calibration prediction — iterative PEQ fitting skipped (collectDiagnostics=false)",
          houseCurveDiagnostics: null,
          worstSeatMaxDeviationDb: null,
          meanSeatMaxDeviationDb: null,
          rmsSeatTargetErrorDb: null,
          perSeatMetrics: []
        });
        completedTasks += 1;
        report("Canonical deterministic prediction complete");
      }
      const eqCandidates = eqResults.map((eq) => buildCanonicalCandidate({
        rawCurve,
        maximumSplCurveBeforeEq,
        levelNormalisedRawCurve,
        operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
        perSeatRawCurves: levelNormalisedSeats,
        perSeatMaximumSplCurves,
        eq,
        domains,
        targetCurve,
        targetShape,
        verticalOffsetDb,
        protectedNullRegions,
        baseRequestedSystemOutputDb,
        operatingSystemOutputDb,
        requestedOperatingLevelOffsetDb,
        selectedOperatingOutputDb,
        operatingOutputDiagnostics,
        pairedAuthorityInputs,
        activeSubs,
        p14TargetBasis,
        usableLfHz,
        practicalCalibrationTarget,
        p18RequiredExtensionHz: selectedP18RequiredExtensionHz || p18ThresholdHzForLevel(p18TargetBasis, 1),
        p18TargetBasis
      }));
      const salvagedCandidates = [];
      const salvageDiagnosticsByProfile = {};
      const salvageTriggerDiagnosticsByProfile = {};
      for (let i = 0; i < eqResults.length; i++) {
        const eq = eqResults[i];
        const baseProfile = eq.designEqFitProfile || (i === 0 ? "standard" : i === 1 ? "accuracy" : "house_curve");
        const profileBankAllOk = eq.designEqFitProfile === "house_curve" ? (_a = eq.bankLimits) == null ? void 0 : _a.allOk : (_c = (_b = eq.bankDiagnostics) == null ? void 0 : _b.selectedBankLimits) == null ? void 0 : _c.allOk;
        const isDeterministicStub = eq.designEqFitProfile === "deterministic";
        const normalBankIsProvenValid = isDeterministicStub ? true : eq.physicalEqAuthorityPassed === true && (eq.bankValidationPassed === true || profileBankAllOk === true);
        const eqBankFails = !normalBankIsProvenValid;
        salvageTriggerDiagnosticsByProfile[baseProfile] = {
          designEqFitProfile: eq.designEqFitProfile,
          isDeterministicStub,
          physicalEqAuthorityPassed: eq.physicalEqAuthorityPassed,
          bankValidationPassed: eq.bankValidationPassed,
          profileBankAllOk,
          normalBankIsProvenValid,
          eqBankFails,
          salvageInvoked: eqBankFails
        };
        if (!eqBankFails) continue;
        const salvageProfile = baseProfile === "house_curve" ? { ...DESIGN_EQ_FIT_PROFILES.accuracy, id: "house_curve", preserveP14: false, maximumCutDb: 15 } : DESIGN_EQ_FIT_PROFILES[baseProfile] || DESIGN_EQ_FIT_PROFILES.standard;
        const salvage = salvagePartialBank({
          filters: eq.filters || [],
          rawCurve: levelNormalisedRawCurve,
          activeSubs,
          usableLfHz,
          requestedSystemOutputDb: selectedOperatingOutputDb,
          profile: salvageProfile,
          protectedNullRegions,
          canonicalTargetCurve: targetCurve,
          anchorDb: verticalOffsetDb
        });
        salvageDiagnosticsByProfile[baseProfile] = salvage.diagnostics;
        if (salvage.sanitisedFilters.length > 0 && salvage.sanitisedBankLimits.allOk) {
          const sanitisedEq = buildSalvageEqResult({
            originalEq: eq,
            salvageFilters: salvage.sanitisedFilters,
            bankLimits: salvage.sanitisedBankLimits,
            profileMarker: `${baseProfile}_sanitised`,
            rawCurve: levelNormalisedRawCurve,
            canonicalTargetCurve: targetCurve,
            protectedNullRegions,
            stopReason: `salvaged sanitised bank — ${salvage.sanitisedFilters.length} filter(s) retained`
          });
          salvagedCandidates.push(buildCanonicalCandidate({
            rawCurve,
            maximumSplCurveBeforeEq,
            levelNormalisedRawCurve,
            operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
            perSeatRawCurves: levelNormalisedSeats,
            perSeatMaximumSplCurves,
            eq: sanitisedEq,
            domains,
            targetCurve,
            targetShape,
            verticalOffsetDb,
            protectedNullRegions,
            baseRequestedSystemOutputDb,
            operatingSystemOutputDb,
            requestedOperatingLevelOffsetDb,
            selectedOperatingOutputDb,
            operatingOutputDiagnostics,
            pairedAuthorityInputs,
            activeSubs,
            p14TargetBasis,
            usableLfHz,
            practicalCalibrationTarget,
            p18RequiredExtensionHz: selectedP18RequiredExtensionHz || p18ThresholdHzForLevel(p18TargetBasis, 1),
            p18TargetBasis
          }));
        }
        if (salvage.cutOnlyFilters.length > 0 && salvage.cutOnlyBankLimits.allOk) {
          const cutOnlyEq = buildSalvageEqResult({
            originalEq: eq,
            salvageFilters: salvage.cutOnlyFilters,
            bankLimits: salvage.cutOnlyBankLimits,
            profileMarker: `${baseProfile}_cut_only`,
            rawCurve: levelNormalisedRawCurve,
            canonicalTargetCurve: targetCurve,
            protectedNullRegions,
            stopReason: `salvaged cut-only bank — ${salvage.cutOnlyFilters.length} cut filter(s) retained`
          });
          salvagedCandidates.push(buildCanonicalCandidate({
            rawCurve,
            maximumSplCurveBeforeEq,
            levelNormalisedRawCurve,
            operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
            perSeatRawCurves: levelNormalisedSeats,
            perSeatMaximumSplCurves,
            eq: cutOnlyEq,
            domains,
            targetCurve,
            targetShape,
            verticalOffsetDb,
            protectedNullRegions,
            baseRequestedSystemOutputDb,
            operatingSystemOutputDb,
            requestedOperatingLevelOffsetDb,
            selectedOperatingOutputDb,
            operatingOutputDiagnostics,
            pairedAuthorityInputs,
            activeSubs,
            p14TargetBasis,
            usableLfHz,
            practicalCalibrationTarget,
            p18RequiredExtensionHz: selectedP18RequiredExtensionHz || p18ThresholdHzForLevel(p18TargetBasis, 1),
            p18TargetBasis
          }));
        }
      }
      const identityEq = {
        designEqFitProfile: "identity",
        designEqFitProfileConfig: null,
        selectedStart: "identity",
        filters: [],
        curve: levelNormalisedRawCurve.map((point) => ({ ...point })),
        combinedEqCurve: [],
        fitterHouseCurveTarget: targetCurve,
        physicalEqAuthorityPassed: true,
        physicalAuthorityViolations: [],
        bankLimits: { allOk: true, boostLimitOk: true, cutLimitOk: true, sourceDomainHeadroomOk: true, maxAggregateBoostDb: 0, maxAggregateBoostHz: null, maxAggregateCutDb: 0, maxAggregateCutHz: null },
        bankDiagnostics: { selectedBankLimits: { allOk: true, boostLimitOk: true, cutLimitOk: true, sourceDomainHeadroomOk: true, maxAggregateBoostDb: 0, maxAggregateBoostHz: null, maxAggregateCutDb: 0, maxAggregateCutHz: null } },
        bankValidationPassed: true,
        rspObjectiveMaxDeviationDb: null,
        rspMaxDeviationDb: null,
        rspRmsDeviationDb: null,
        rspMeanSignedResidualDb: null,
        rspShapeRmsDeviationDb: null,
        iterationTrace: [],
        detectedRegions: [],
        candidateAcceptanceDiagnostics: [],
        candidateSelectionDiagnostics: [],
        filterDecisionDiagnostics: [],
        rejectedEqCandidates: [],
        seatToleranceAdjustedCandidates: [],
        seatRegressionToleranceDiagnostics: null,
        stopReason: "identity — no EQ applied",
        selectionReason: "Identity candidate — no EQ applied",
        houseCurveDiagnostics: null,
        worstSeatMaxDeviationDb: null,
        meanSeatMaxDeviationDb: null,
        rmsSeatTargetErrorDb: null,
        perSeatMetrics: []
      };
      const identityCandidate = buildCanonicalCandidate({
        rawCurve,
        maximumSplCurveBeforeEq,
        levelNormalisedRawCurve,
        operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
        perSeatRawCurves: levelNormalisedSeats,
        perSeatMaximumSplCurves,
        eq: identityEq,
        domains,
        targetCurve,
        targetShape,
        verticalOffsetDb,
        protectedNullRegions,
        baseRequestedSystemOutputDb,
        operatingSystemOutputDb,
        requestedOperatingLevelOffsetDb,
        selectedOperatingOutputDb,
        operatingOutputDiagnostics,
        pairedAuthorityInputs,
        activeSubs,
        p14TargetBasis,
        usableLfHz,
        practicalCalibrationTarget,
        p18RequiredExtensionHz: selectedP18RequiredExtensionHz || p18ThresholdHzForLevel(p18TargetBasis, 1),
        p18TargetBasis
      });
      const candidates = annotateCandidatePoolForHouseCurveRanking([...eqCandidates, ...salvagedCandidates, identityCandidate]);
      const __canonicalTrace__ = {
        receivedCollectDiagnostics: collectDiagnostics,
        profiles: eqResults.map((eq, i) => {
          const candidate = candidates[i];
          const eqTrace = eq.__designEqTrace__ || {};
          return {
            profile: eq.designEqFitProfile || (i === 0 ? "standard" : i === 1 ? "accuracy" : "house_curve"),
            inputCollectDiagnostics: eqTrace.inputCollectDiagnostics ?? null,
            detectedRegionCount: eqTrace.detectedRegionCount ?? null,
            appendTrialCount: eqTrace.appendTrialCount ?? null,
            revisionTrialCount: eqTrace.revisionTrialCount ?? null,
            candidateAcceptanceDiagnosticsCount: eqTrace.candidateAcceptanceDiagnosticsCount ?? null,
            finalEnabledFilterCount: (eq.filters || []).filter((f) => f.enabled).length,
            finalFilterBankSignature: buildFilterBankSignature({ generatedFilterBank: eq.filters }),
            stopReason: eqTrace.stopReason ?? eq.stopReason ?? null,
            designEqCandidateAcceptanceDiagnosticsCountAfterMapping: Array.isArray(candidate == null ? void 0 : candidate.designEqCandidateAcceptanceDiagnostics) ? candidate.designEqCandidateAcceptanceDiagnostics.length : null
          };
        }),
        salvagedCandidateCount: salvagedCandidates.length,
        salvageDiagnosticsByProfile,
        salvageTriggerDiagnosticsByProfile
      };
      const rawSelectablePool = candidates.filter(isPhysicallyCredibleBassCandidate);
      const identityForGuard = candidates.find((c) => c.designEqFitProfile === "identity");
      const identityRmsForGuard = identityForGuard == null ? void 0 : identityForGuard.houseCurveRankingRmsResidualDb;
      const identityMaxForGuard = identityForGuard == null ? void 0 : identityForGuard.houseCurveRankingMaxResidualDb;
      const MIN_SALVAGE_IMPROVEMENT_DB = 0.05;
      const isSalvagedProfile = (profile) => typeof profile === "string" && (profile.endsWith("_sanitised") || profile.endsWith("_cut_only"));
      const selectablePool = rawSelectablePool.filter((candidate) => {
        if (!isSalvagedProfile(candidate.designEqFitProfile)) return true;
        const rms = candidate.houseCurveRankingRmsResidualDb;
        const max = candidate.houseCurveRankingMaxResidualDb;
        const rmsImprovement = Number.isFinite(identityRmsForGuard) && Number.isFinite(rms) ? identityRmsForGuard - rms : 0;
        const maxImprovement = Number.isFinite(identityMaxForGuard) && Number.isFinite(max) ? identityMaxForGuard - max : 0;
        return rmsImprovement > MIN_SALVAGE_IMPROVEMENT_DB || maxImprovement > MIN_SALVAGE_IMPROVEMENT_DB;
      });
      const eqSelectableCount = selectablePool.filter((c) => c.designEqFitProfile !== "identity").length;
      const identityOnlyFallback = eqSelectableCount === 0 && selectablePool.length > 0;
      const endedAt = nowMs();
      const poolId = `canonical:${buildCurveSignature(rawCurve)}:${activeSubs.length}:${seats.length}:${verticalOffsetDb.toFixed(4)}`;
      const diagnosticsIncluded = !!collectDiagnostics && candidates.some(
        (candidate) => Array.isArray(candidate == null ? void 0 : candidate.designEqCandidateAcceptanceDiagnostics) && candidate.designEqCandidateAcceptanceDiagnostics.length > 0
      );
      return stampPoolAuthority({
        poolVersion: BASS_OPTIMISER_POOL_VERSION,
        candidates,
        selectablePool,
        poolId,
        generatedCandidateCount: candidates.length,
        physicallyCredibleCount: selectablePool.length,
        standardFitCount: 1,
        accuracyFitCount: 1,
        houseCurveFitCount: 1,
        identityFitCount: 1,
        generationStatus: "complete",
        missingInputs: [],
        warningMessage: identityOnlyFallback ? "No physically valid EQ bank was available. Results show the achieved response without Design EQ." : null,
        canonical: true,
        diagnosticsIncluded,
        salvageDiagnostics: salvageDiagnosticsByProfile,
        __canonicalTrace__,
        canonicalVerticalOffsetDb: verticalOffsetDb,
        operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
        requestedOperatingLevelOffsetDb,
        baseRequestedSystemOutputDb,
        operatingSystemOutputDb,
        selectedOperatingOutputDb,
        operatingOutputDiagnostics,
        operatingLevelWindowDiagnostics,
        canonicalHouseCurveShape: targetShape,
        canonicalTargetCurve: targetCurve,
        protectedNullRegions,
        transitionHz,
        performanceSummary: {
          totalOptimiserTimeMs: endedAt - startedAt,
          requestCount: 1,
          profileCount: totalTasks,
          uniqueCoreFitCount: totalTasks,
          iterativeFittingSkipped: !runIterativeFitters,
          deterministicPredictionOnly: !runIterativeFitters,
          standardFitCount: runIterativeFitters ? 1 : 0,
          accuracyFitCount: runIterativeFitters ? 1 : 0,
          houseCurveFitCount: runIterativeFitters ? 1 : 0,
          coreFitTimeMs: standardFitTimeMs + accuracyFitTimeMs + houseCurveFitTimeMs,
          selectedDiagnosticFitTimeMs: 0,
          standardFitTimeMs,
          accuracyFitTimeMs,
          houseCurveFitTimeMs,
          candidateAssemblyTimeMs: Math.max(0, endedAt - startedAt - standardFitTimeMs - accuracyFitTimeMs - houseCurveFitTimeMs),
          selectedRevisionCandidateCount: eqResults.reduce((sum, eq) => {
            var _a2;
            return sum + (((_a2 = eq == null ? void 0 : eq.revisionDiagnostics) == null ? void 0 : _a2.revisionAttemptCount) || 0);
          }, 0),
          completedBankEvaluationCount: eqResults.reduce((sum, eq) => {
            var _a2;
            return sum + (((_a2 = eq == null ? void 0 : eq.bankDiagnostics) == null ? void 0 : _a2.completedBankEvaluationCount) || 0);
          }, 0),
          bankValidationRequests: ((_d = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _d.bankValidationRequests) || 0,
          uniqueBankValidations: ((_e = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _e.uniqueBankValidations) || 0,
          reusedBankValidations: ((_f = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _f.reusedBankValidations) || 0,
          filterResponseRequests: ((_g = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _g.filterResponseRequests) || 0,
          uniqueFilterResponses: ((_h = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _h.uniqueFilterResponses) || 0,
          metricGridPreparationRequests: ((_i = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _i.metricGridPreparationRequests) || 0,
          uniqueMetricGridPreparations: ((_j = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _j.uniqueMetricGridPreparations) || 0,
          curveEvaluationRequests: ((_k = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _k.curveEvaluationRequests) || 0,
          reusedCurveEvaluationRequests: ((_l = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _l.reusedCurveEvaluationRequests) || 0,
          perSeatMetricEvaluations: ((_m = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _m.perSeatMetricEvaluations) || 0,
          candidateBankValidationTimeMs: ((_n = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _n.candidateBankValidationTimeMs) || 0,
          perSeatEvaluationTimeMs: ((_o = houseEq == null ? void 0 : houseEq.operationCounts) == null ? void 0 : _o.perSeatEvaluationTimeMs) || 0,
          candidateBankCount: candidates.length,
          seatCount: seats.length
        }
      });
    } finally {
      clearCorrectabilityGate();
    }
  }
  function generateCandidatePool(options = {}) {
    return generateCanonicalCandidatePool(options);
  }
  self.onmessage = (e) => {
    var _a, _b;
    const { requestId, fingerprint, payload, dispatchedAtMs, identity: requestedIdentity, diagnosticToken } = e.data || {};
    const requestedCollectDiagnostics = ((_a = e.data) == null ? void 0 : _a.collectDiagnostics) === true;
    const requestOrigin = ((_b = e.data) == null ? void 0 : _b.origin) || "unknown";
    const workerStartupTimeMs = Number.isFinite(dispatchedAtMs) ? Math.max(0, Date.now() - dispatchedAtMs) : 0;
    const identity = {
      ...requestedIdentity || {},
      fingerprint,
      ...BASS_OPTIMISER_VERSIONS
    };
    if (!requestId || !fingerprint) {
      self.postMessage(createErrorMessage(
        requestId || null,
        fingerprint || null,
        "Missing requestId or fingerprint in worker request",
        identity,
        diagnosticToken || null,
        requestedCollectDiagnostics
      ));
      return;
    }
    try {
      const requestCompatibility = validateOptimiserVersions(e.data, BASS_OPTIMISER_VERSIONS);
      if (!requestCompatibility.valid) throw new Error(`Worker request incompatible: ${requestCompatibility.message}`);
      self.postMessage(createProgressMessage(requestId, fingerprint, { phase: "Worker request received" }, identity, diagnosticToken || null, requestedCollectDiagnostics));
      const pool = generateCandidatePool({
        rawCurve: (payload == null ? void 0 : payload.rawCurve) || [],
        activeSubs: (payload == null ? void 0 : payload.activeSubs) || [],
        usableLfHz: (payload == null ? void 0 : payload.usableLfHz) ?? null,
        transitionHz: (payload == null ? void 0 : payload.transitionHz) ?? 120,
        correctionEndHz: (payload == null ? void 0 : payload.correctionEndHz) ?? 200,
        perSeatRawCurves: (payload == null ? void 0 : payload.perSeatRawCurves) || [],
        perSourceComplexTransfers: (payload == null ? void 0 : payload.perSourceComplexTransfers) || [],
        normalizedTransferFingerprint: (payload == null ? void 0 : payload.normalizedTransferFingerprint) || null,
        calibrationFingerprint: (payload == null ? void 0 : payload.calibrationFingerprint) || null,
        selectedP14TargetDb: (payload == null ? void 0 : payload.selectedP14TargetDb) ?? 109,
        p14TargetBasis: (payload == null ? void 0 : payload.p14TargetBasis) ?? "minimum",
        p14TargetLevel: (payload == null ? void 0 : payload.p14TargetLevel) ?? 1,
        p18TargetBasis: (payload == null ? void 0 : payload.p18TargetBasis) ?? (payload == null ? void 0 : payload.p14TargetBasis) ?? "minimum",
        selectedP18RequiredExtensionHz: (payload == null ? void 0 : payload.selectedP18RequiredExtensionHz) ?? null,
        collectDiagnostics: requestedCollectDiagnostics,
        onProgress: (progress) => {
          self.postMessage(createProgressMessage(requestId, fingerprint, progress, identity, diagnosticToken || null, requestedCollectDiagnostics));
        }
      });
      pool.performanceSummary = { ...pool.performanceSummary, workerStartupTimeMs };
      pool.__workerTrace__ = { receivedCollectDiagnostics: requestedCollectDiagnostics, receivedDiagnosticToken: diagnosticToken || null, requestOrigin };
      self.postMessage(createProgressMessage(requestId, fingerprint, { phase: "Worker result posted", poolId: pool.poolId }, { ...identity, poolId: pool.poolId }, diagnosticToken || null, requestedCollectDiagnostics));
      self.postMessage(createCompleteMessage(requestId, fingerprint, pool, { ...identity, poolId: pool.poolId }, diagnosticToken || null, requestedCollectDiagnostics));
    } catch (err) {
      self.postMessage(createErrorMessage(
        requestId,
        fingerprint,
        (err == null ? void 0 : err.message) || String(err) || "Unknown worker calculation error",
        identity,
        diagnosticToken || null,
        requestedCollectDiagnostics
      ));
    }
  };
})();
