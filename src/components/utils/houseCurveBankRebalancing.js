import {
  evaluateProvisionalBankLimits,
  normaliseCurve,
  peakingEqResponseDb,
} from "@/components/utils/designEqCalibration";
import { calculateAllSeatMetrics, houseCurveP19Level } from "@/components/utils/houseCurveFitterCore";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";
import { evaluatePreparedBankLimits } from "@/components/utils/preparedBankValidation";

const MAX_FILTERS = 10;
const MIN_WIDTH_OCTAVES = 0.22;
const MIN_DEPTH_DB = 4;
const MIN_IMPROVEMENT_DB = 1.5;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function correctionAt(frequency, filters) {
  return filters.reduce((sum, filter) => sum + peakingEqResponseDb(frequency, filter), 0);
}

function residualPoints(raw, filters, targetCurve, startHz, endHz, protectedRegions) {
  return raw
    .filter((point) => point.frequency >= startHz && point.frequency <= endHz)
    .map((point) => {
      const targetSpl = interpolateCanonicalTarget(targetCurve, point.frequency);
      return {
        frequency: point.frequency,
        residualDb: point.spl + correctionAt(point.frequency, filters) - targetSpl,
        protected: isProtectedFrequency(point.frequency, protectedRegions),
      };
    })
    .filter((point) => Number.isFinite(point.residualDb));
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
      if (widthOctaves >= MIN_WIDTH_OCTAVES && centre.residualDb <= -MIN_DEPTH_DB) {
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

function quality(points) {
  const scored = points.filter((point) => !point.protected);
  if (!scored.length) return null;
  return {
    maximum: Math.max(...scored.map((point) => Math.abs(point.residualDb))),
    rms: Math.sqrt(scored.reduce((sum, point) => sum + point.residualDb ** 2, 0) / scored.length),
    meanAbsolute: scored.reduce((sum, point) => sum + Math.abs(point.residualDb), 0) / scored.length,
  };
}

function valleyDeficit(points, region) {
  const inside = points.filter((point) => point.frequency >= region.startHz && point.frequency <= region.endHz);
  return inside.length
    ? inside.reduce((sum, point) => sum + Math.max(0, -point.residualDb), 0) / inside.length
    : 0;
}

function shoulderPeaks(points, region) {
  const ranges = [
    {
      side: "lower",
      includes: (point) => point.frequency >= region.startHz / 2 ** 0.5
        && point.frequency < region.startHz,
    },
    {
      side: "upper",
      includes: (point) => point.frequency > region.endHz
        && point.frequency <= region.endHz * 2 ** 0.35,
    },
  ];
  return ranges.map(({ side, includes }) => {
    const candidate = points
      .filter((point) => !point.protected && includes(point))
      .sort((left, right) => right.residualDb - left.residualDb)[0];
    return (candidate?.residualDb ?? 0) >= 2 ? { ...candidate, side } : null;
  }).filter(Boolean);
}

function realSeatsSafe(before, after) {
  const beforeById = new Map((before?.seatMetrics || []).map((seat) => [seat.seatId, seat]));
  return (after?.seatMetrics || []).every((seat) => {
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

const signature = (filters) => filters.map((filter) =>
  `${Number(filter.frequencyHz).toFixed(3)}/${Number(filter.gainDb).toFixed(3)}/${Number(filter.Q).toFixed(3)}`
).join("|");

export function rebalanceBroadValleyBank({
  filters = [], rawCurve = [], targetCurve = [], protectedNullRegions = [],
  objectiveSeats = [], currentMetrics = null, fitStartHz = 20, fitEndHz = 200,
  correctionStartHz = 20, correctionEndHz = 200, anchorDb = 0, bankRaw = [],
  activeSubs = [], usableLfHz = 20, requestedSystemOutputDb,
  profile = { maximumCutDb: 15, maximumAggregateBoostDb: 6 },
  evaluationMemo = null, preparedBankValidation = null, operationCounts = null,
}) {
  const current = filters.filter((filter) => filter?.enabled).map((filter) => ({ ...filter }));
  const raw = normaliseCurve(rawCurve);
  const baselinePoints = residualPoints(
    raw, current, targetCurve, correctionStartHz, correctionEndHz, protectedNullRegions,
  );
  const baselineQuality = quality(baselinePoints);
  const valleys = discoverBroadValleys(
    baselinePoints, Math.max(40, Number(usableLfHz || 20) * 1.25),
  );
  const baselineMetrics = currentMetrics || calculateAllSeatMetrics(
    objectiveSeats, current, fitStartHz, fitEndHz, anchorDb, operationCounts, evaluationMemo,
    { protectedNullRegions, canonicalTargetCurve: targetCurve },
  );
  let bankEvaluationCount = 0;
  const diagnostics = [];
  const preliminary = [];
  const seen = new Set();

  for (const region of valleys.slice(0, 3)) {
    const centreHz = region.centre.frequency;
    const contributions = current.map((filter, index) => ({
      filter, index, contributionDb: peakingEqResponseDb(centreHz, filter),
    }));
    const blocker = contributions
      .filter((entry) => entry.filter.gainDb < -0.1 && entry.contributionDb <= -0.75)
      .sort((left, right) => left.contributionDb - right.contributionDb)[0];
    const boostIndexes = contributions
      .filter((entry) => entry.filter.gainDb > 0.1
        && Math.abs(Math.log2(centreHz / entry.filter.frequencyHz)) <= 0.5)
      .sort((left, right) => right.contributionDb - left.contributionDb)
      .map((entry) => entry.index);
    const shoulders = shoulderPeaks(baselinePoints, region);
    const shoulderCuts = [];
    for (const shoulder of shoulders) {
      const match = current
        .map((filter, index) => ({
          filter, index, shoulder,
          distance: Math.abs(Math.log2(shoulder.frequency / filter.frequencyHz)),
        }))
        .filter((entry) => entry.filter.gainDb < -0.1
          && entry.distance <= 0.3
          && !shoulderCuts.some((selected) => selected.index === entry.index))
        .sort((left, right) => left.distance - right.distance)[0];
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
        contributionDb: blocker.contributionDb,
      } : null,
      blockerCompanion: null,
      shoulderFrequencyHz: shoulders[0]?.frequency ?? null,
      shoulderFrequenciesHz: shoulders.map((shoulder) => shoulder.frequency),
      evaluatedBanks: 0,
      legalBanks: 0,
      acceptedBanks: 0,
    };
    diagnostics.push(diagnostic);
    if (!blocker || blocker.filter.Q >= 8) continue;

    const blockerQValues = [...new Set([1.25, 1.5, 2, 2.5, 3, 4].map((scale) =>
      Number(clamp(blocker.filter.Q * scale, blocker.filter.Q + 0.2, 10).toFixed(4))
    ))];
    const blockerCompanion = current
      .map((filter, index) => ({
        filter, index,
        distance: Math.abs(Math.log2(filter.frequencyHz / blocker.filter.frequencyHz)),
      }))
      .filter((entry) => entry.index !== blocker.index
        && entry.filter.gainDb < -0.1
        && entry.distance <= 0.35)
      .sort((left, right) => left.distance - right.distance)[0] || null;
    const replacementCompanion = blockerCompanion ? null : current
      .map((filter, index) => ({
        filter, index,
        activity: Math.abs(filter.gainDb || 0),
        outsideAssessment: filter.frequencyHz > fitEndHz,
      }))
      .filter((entry) => entry.index !== blocker.index && entry.activity <= 1.5)
      .sort((left, right) =>
        Number(right.outsideAssessment) - Number(left.outsideAssessment)
        || left.activity - right.activity)[0] || null;
    const effectiveCompanion = blockerCompanion || replacementCompanion;
    diagnostic.blockerCompanion = effectiveCompanion ? {
      index: effectiveCompanion.index,
      frequencyHz: effectiveCompanion.filter.frequencyHz,
      gainDb: effectiveCompanion.filter.gainDb,
      Q: effectiveCompanion.filter.Q,
      repurposed: !!replacementCompanion,
    } : null;
    const blockerVariants = blockerQValues.map((blockerQ) => {
      const variant = current.map((filter) => ({ ...filter }));
      variant[blocker.index] = {
        ...variant[blocker.index], Q: blockerQ,
        reason: "Joint broad-valley rebalance: narrow remote peak-cut tail",
      };
      return variant;
    });
    if (effectiveCompanion) {
      const lowerShoulder = shoulders.find((shoulder) => shoulder.side === "lower");
      const splitFrequencyHz = replacementCompanion
        ? Math.sqrt(blocker.filter.frequencyHz
          * (lowerShoulder?.frequency ?? region.startHz))
        : Math.sqrt(blocker.filter.frequencyHz * effectiveCompanion.filter.frequencyHz);
      const splitPresets = [
        [-14, 2, -2, 3],
        [-13, 2.5, -3, 3],
        [-12, 3, -4, 3],
        [-11, 3.5, -5, 3],
        [-10, 4, -6, 3],
        [-9, 4, -7, 4],
        [-12, 4, -4, 4],
        [-10, 5, -6, 4],
      ];
      for (const [primaryGainDb, primaryQ, companionGainDb, companionQ] of splitPresets) {
        const variant = current.map((filter) => ({ ...filter }));
        variant[blocker.index] = {
          ...variant[blocker.index], gainDb: primaryGainDb, Q: primaryQ,
          reason: "Joint broad-valley rebalance: split saturated broad peak cut",
        };
        variant[effectiveCompanion.index] = {
          ...variant[effectiveCompanion.index],
          enabled: true, type: "Peak",
          frequencyHz: splitFrequencyHz, gainDb: companionGainDb, Q: companionQ,
          reason: replacementCompanion
            ? "Joint broad-valley rebalance: repurpose weak slot for overlapping peak control"
            : "Joint broad-valley rebalance: preserve peak control without remote tail",
        };
        blockerVariants.push(variant);
      }
    }
    const boostAdditions = boostIndexes.length ? [0, 1, 2, 3, 4] : [2, 3, 4, 5, 6];
    const boostQValues = boostIndexes.length
      ? [...new Set([current[boostIndexes[0]].Q, 1.5, 2, 2.5, 3]
        .map((value) => Number(clamp(value, 0.5, 4).toFixed(4))))]
      : [1.5, 2, 2.5, 3];
    const shoulderAdjustmentSets = shoulderCuts.length >= 2
      ? [[0, 0], [-1, -1], [-2, -1], [-2, -2], [-3, -2], [-4, -3], [-4, -4]]
      : shoulderCuts.length === 1
        ? [[0], [-1], [-2], [-3], [-4]]
        : [[]];

    const additionalBoostModes = boostIndexes.length && current.length < MAX_FILTERS
      ? [false, true] : [false];
    for (const blockerVariant of blockerVariants) for (const boostAddition of boostAdditions) {
      for (const boostQ of boostQValues) for (const shoulderDeltas of shoulderAdjustmentSets) {
        for (const useAdditionalBoost of additionalBoostModes) {
        let proposed = blockerVariant.map((filter) => ({ ...filter }));
        if (boostIndexes.length && !useAdditionalBoost) {
          const totalGain = boostIndexes.reduce((sum, index) =>
            sum + Math.max(0, proposed[index].gainDb), 0);
          boostIndexes.forEach((index) => {
            const share = totalGain > 0
              ? proposed[index].gainDb / totalGain
              : 1 / boostIndexes.length;
            proposed[index] = {
              ...proposed[index],
              gainDb: clamp(proposed[index].gainDb + boostAddition * share, 0, 6),
              Q: boostQ,
              frequencyHz: proposed[index].frequencyHz
                + (centreHz - proposed[index].frequencyHz) * 0.35,
              reason: "Joint broad-valley rebalance: use available source-domain boost",
            };
          });
        } else {
          if (proposed.length >= MAX_FILTERS) continue;
          proposed.push({
            band: proposed.length + 1, enabled: true, type: "Peak",
            frequencyHz: centreHz,
            gainDb: boostIndexes.length ? boostAddition + 2 : boostAddition,
            Q: boostQ,
            startHz: region.startHz, endHz: region.endHz,
            reason: "Joint broad-valley rebalance: use available aggregate source-domain boost",
          });
        }
        shoulderCuts.forEach((shoulderCut, shoulderIndex) => {
          const shoulderDelta = shoulderDeltas[shoulderIndex] ?? 0;
          if (shoulderDelta >= 0) return;
          const index = shoulderCut.index;
          proposed[index] = {
            ...proposed[index],
            frequencyHz: proposed[index].frequencyHz
              + (shoulderCut.shoulder.frequency - proposed[index].frequencyHz) * 0.5,
            gainDb: clamp(proposed[index].gainDb + shoulderDelta, -15, 0),
            Q: clamp(Math.max(proposed[index].Q, 8), 0.5, 10),
            reason: "Joint broad-valley rebalance: retain both adjacent peak shoulders",
          };
        });
        const candidateSignature = signature(proposed);
        if (seen.has(candidateSignature)) continue;
        seen.add(candidateSignature);
        diagnostic.evaluatedBanks += 1;
        const limits = preparedBankValidation
          ? evaluatePreparedBankLimits(preparedBankValidation, proposed, profile, operationCounts)
          : evaluateProvisionalBankLimits(
            proposed, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile,
          );
        bankEvaluationCount += 1;
        if (!limits.allOk
          || !protectedNullsSafe(current, proposed, protectedNullRegions)) continue;
        diagnostic.legalBanks += 1;
        const points = residualPoints(
          raw, proposed, targetCurve, correctionStartHz, correctionEndHz, protectedNullRegions,
        );
        const candidateQuality = quality(points);
        if (!candidateQuality) continue;
        const valleyImprovementDb = valleyDeficit(baselinePoints, region)
          - valleyDeficit(points, region);
        const centreCorrectionIncreaseDb = correctionAt(centreHz, proposed)
          - correctionAt(centreHz, current);
        if (valleyImprovementDb < MIN_IMPROVEMENT_DB
          || centreCorrectionIncreaseDb < MIN_IMPROVEMENT_DB
          || candidateQuality.maximum > baselineQuality.maximum + 0.25
          || candidateQuality.rms > baselineQuality.rms + 0.1) continue;
        diagnostic.acceptedBanks += 1;
        preliminary.push({
          filters: proposed, region, quality: candidateQuality, limits,
          valleyImprovementDb, centreCorrectionIncreaseDb,
          activity: proposed.reduce((sum, filter) => sum + Math.abs(filter.gainDb || 0), 0),
          usesRepurposedCompanion: !!replacementCompanion
            && proposed[replacementCompanion.index]?.reason
              === "Joint broad-valley rebalance: repurpose weak slot for overlapping peak control",
          adjustedShoulderCount: shoulderCuts.reduce((count, shoulderCut) =>
            count + (Math.abs(
              proposed[shoulderCut.index].gainDb - current[shoulderCut.index].gainDb,
            ) >= 0.5 ? 1 : 0), 0),
        });
        }
      }
    }
  }

  preliminary.sort((left, right) =>
    left.quality.maximum - right.quality.maximum
    || left.quality.rms - right.quality.rms
    || right.valleyImprovementDb - left.valleyImprovementDb
    || left.quality.meanAbsolute - right.quality.meanAbsolute
    || left.activity - right.activity);

  const verification = {
    testedBanks: 0,
    missingMetrics: 0,
    realSeatUnsafe: 0,
    rspLevelRegression: 0,
    rspRmsWorsening: 0,
    samples: [],
  };
  const verificationPool = [];
  const verificationSignatures = new Set();
  const addToVerificationPool = (candidate) => {
    const candidateSignature = signature(candidate.filters);
    if (verificationSignatures.has(candidateSignature)) return;
    verificationSignatures.add(candidateSignature);
    verificationPool.push(candidate);
  };
  preliminary.slice(0, 20).forEach(addToVerificationPool);
  preliminary.filter((candidate) => candidate.usesRepurposedCompanion)
    .slice(0, 20).forEach(addToVerificationPool);
  preliminary.filter((candidate) => candidate.adjustedShoulderCount >= 2)
    .slice(0, 15).forEach(addToVerificationPool);

  const verifiedCandidates = [];
  for (const candidate of verificationPool.slice(0, 55)) {
    verification.testedBanks += 1;
    const metrics = calculateAllSeatMetrics(
      objectiveSeats, candidate.filters, fitStartHz, fitEndHz, anchorDb,
      operationCounts, evaluationMemo,
      { protectedNullRegions, canonicalTargetCurve: targetCurve },
    );
    const realSeatSafe = !!metrics && realSeatsSafe(baselineMetrics, metrics);
    const baselineRspLevel = Number.isFinite(baselineMetrics?.rspMaxDeviationDb)
      ? houseCurveP19Level(baselineMetrics.rspMaxDeviationDb) : null;
    const candidateRspLevel = Number.isFinite(metrics?.rspMaxDeviationDb)
      ? houseCurveP19Level(metrics.rspMaxDeviationDb) : null;
    const rspLevelSafe = baselineRspLevel === null || candidateRspLevel >= baselineRspLevel;
    const absoluteRspRmsSafe = !Number.isFinite(baselineMetrics?.rspRmsDeviationDb)
      || metrics.rspRmsDeviationDb <= baselineMetrics.rspRmsDeviationDb + 0.1;
    const shapeAndLevelSafe = Number.isFinite(baselineMetrics?.rspShapeRmsDeviationDb)
      && Number.isFinite(metrics?.rspShapeRmsDeviationDb)
      && metrics.rspShapeRmsDeviationDb <= baselineMetrics.rspShapeRmsDeviationDb - 0.1
      && metrics.rspMaxDeviationDb <= baselineMetrics.rspMaxDeviationDb + 0.5
      && Math.abs((metrics.rspMeanSignedResidualDb ?? 0)
        - (baselineMetrics.rspMeanSignedResidualDb ?? 0)) <= 1.25;
    const rspRmsSafe = absoluteRspRmsSafe || shapeAndLevelSafe;
    if (verification.samples.length < 8) verification.samples.push({
      rawMaximumResidualDb: candidate.quality.maximum,
      rawRmsResidualDb: candidate.quality.rms,
      valleyImprovementDb: candidate.valleyImprovementDb,
      realSeatSafe,
      baselineRspMaxDeviationDb: baselineMetrics?.rspMaxDeviationDb ?? null,
      candidateRspMaxDeviationDb: metrics?.rspMaxDeviationDb ?? null,
      baselineRspLevel,
      candidateRspLevel,
      baselineRspRmsDeviationDb: baselineMetrics?.rspRmsDeviationDb ?? null,
      candidateRspRmsDeviationDb: metrics?.rspRmsDeviationDb ?? null,
      baselineRspMeanSignedResidualDb: baselineMetrics?.rspMeanSignedResidualDb ?? null,
      candidateRspMeanSignedResidualDb: metrics?.rspMeanSignedResidualDb ?? null,
      baselineRspShapeRmsDeviationDb: baselineMetrics?.rspShapeRmsDeviationDb ?? null,
      candidateRspShapeRmsDeviationDb: metrics?.rspShapeRmsDeviationDb ?? null,
      absoluteRspRmsSafe,
      shapeAndLevelSafe,
      usesRepurposedCompanion: candidate.usesRepurposedCompanion,
      adjustedShoulderCount: candidate.adjustedShoulderCount,
      filterSignature: signature(candidate.filters),
    });
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
  verifiedCandidates.sort((left, right) =>
    houseCurveP19Level(right.metrics.rspMaxDeviationDb)
      - houseCurveP19Level(left.metrics.rspMaxDeviationDb)
    || left.metrics.rspMaxDeviationDb - right.metrics.rspMaxDeviationDb
    || left.metrics.rspShapeRmsDeviationDb - right.metrics.rspShapeRmsDeviationDb
    || left.quality.maximum - right.quality.maximum
    || right.valleyImprovementDb - left.valleyImprovementDb);
  const winner = verifiedCandidates[0] || null;

  if (!winner) {
    return {
      filters: current,
      metrics: baselineMetrics,
      changed: false,
      bankEvaluationCount,
      reason: valleys.length
        ? "no legal joint broad-valley bank improved the response"
        : "no broad unprotected modal valley required rebalancing",
      diagnostics,
      verification,
      selected: null,
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
      bankLimits: winner.limits,
    },
  };
}

