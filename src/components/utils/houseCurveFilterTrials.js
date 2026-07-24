import {
  countSameSignFiltersInRegion, isNearDuplicate, limitBoostForCapability, qForRegion,
} from "@/components/utils/designEqCalibration";
import { resolveRequiredCorrectionDb } from "@/components/utils/houseCurveTargetAuthority";
import { classifyEqCorrectionRegion, validatePhysicalEqAction } from "@/components/utils/designEqPhysicsAuthority";

export function generateHouseCurveTrials(region, filters, profile, activeSubs, usableLfHz, requestedSystemOutputDb) {
  const trials = [];
  const requiredAtCentreDb = resolveRequiredCorrectionDb({
    targetSplDb: 0,
    currentPostEqSplDb: region.centrePoint.deviationDb,
    protectedNull: !!region.protectedNull,
  });
  const authority = classifyEqCorrectionRegion({
    frequency: region.centrePoint.frequency,
    rawSpl: region.rawSpl,
    currentSpl: region.centrePoint.spl,
    targetSpl: region.centrePoint.targetSpl,
    protectedNull: !!region.protectedNull,
    widthOctaves: region.widthOctaves,
  });
  if (["Null", "Capability limited"].includes(authority.classification)) {
    return { trials, productLimited: authority.classification === "Capability limited", authority };
  }
  const isPeak = authority.classification === "Peak";
  const maximumCutDb = profile.maximumCutDb;
  const maximumAggregateBoostDb = profile.maximumAggregateBoostDb;
  const requestedGainDb = isPeak
    ? -Math.min(maximumCutDb, Math.abs(authority.rawResidualDb ?? requiredAtCentreDb))
    : Math.min(maximumAggregateBoostDb, Math.max(0, requiredAtCentreDb) * 0.75);
  const correctionSign = Math.sign(requestedGainDb);
  const baseCandidate = limitBoostForCapability({
    band: filters.length + 1, enabled: true, type: "Peak",
    frequencyHz: region.centrePoint.frequency, gainDb: requestedGainDb,
    Q: qForRegion(region), startHz: region.startHz, endHz: region.endHz,
    classification: authority.classification,
    expectedAction: authority.expectedAction,
    beforeEqSpl: region.rawSpl,
    targetSpl: region.centrePoint.targetSpl,
    reason: authority.reason,
  }, activeSubs, usableLfHz, requestedSystemOutputDb);
  const physicalAction = validatePhysicalEqAction(authority.classification, baseCandidate.gainDb);
  const productLimited = Math.abs(baseCandidate.gainDb) <= 0.1 || !physicalAction.passed;
  const gainScales = [1, 0.75, 0.5];
  const rawQValues = [baseCandidate.Q * 0.65, baseCandidate.Q, 4, 5, 6, 7, 8, 10];
  const qValues = [...new Map(rawQValues.map((q) => {
    const value = Math.max(0.5, Math.min(10, q));
    return [value.toFixed(4), value];
  })).values()];

  const overlappingSameSignCount = filters.filter((filter) => filter?.enabled
    && Math.sign(filter.gainDb) === correctionSign
    && Math.log2(Math.max(baseCandidate.frequencyHz, filter.frequencyHz) / Math.min(baseCandidate.frequencyHz, filter.frequencyHz)) <= 1 / 2).length;
  if (!productLimited && filters.length < 10 && overlappingSameSignCount < 2) {
    const seenVariants = new Set();
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
          const refit = { ...baseCandidate, band: existing.band, gainDb: baseCandidate.gainDb * gainScale,
            Q: Math.max(0.5, Math.min(10, baseCandidate.Q * qScale)), reason: "Joint centre/gain/Q refit of occupied region" };
          trials.push({ action: "refit", filter: refit, replacedFilterIndex: index, scalableIndex: index });
        }
        const proposedGain = existing.gainDb + baseCandidate.gainDb * gainScale;
        const gainDb = existing.gainDb > 0 ? Math.min(maximumAggregateBoostDb, proposedGain) : Math.max(-maximumCutDb, proposedGain);
        if (Math.abs(gainDb - existing.gainDb) > 0.1) trials.push({ action: "revise", filter: { ...existing, gainDb }, replacedFilterIndex: index, scalableIndex: index });
      }
      for (const multiplier of [0.5, 0.75, 1.5, 2, 3]) {
        const Q = Math.max(0.5, Math.min(10, existing.Q * multiplier));
        if (Math.abs(Q - existing.Q) > 0.1) trials.push({ action: "reviseQ", filter: { ...existing, Q }, replacedFilterIndex: index, scalableIndex: index });
      }
    } else if (existingSign !== correctionSign) {
      if (!productLimited) trials.push({ action: "replace", filter: { ...baseCandidate, band: existing.band }, replacedFilterIndex: index, scalableIndex: index });
      trials.push({ action: "remove", removedFilterIndex: index, scalableIndex: null });
    }
  }

  const mergeIndices = filters.map((filter, index) => ({ filter, index })).filter(({ filter }) => {
    if (!filter?.enabled || Math.sign(filter.gainDb) !== correctionSign) return false;
    return Math.log2(Math.max(baseCandidate.frequencyHz, filter.frequencyHz) / Math.min(baseCandidate.frequencyHz, filter.frequencyHz)) <= 1 / 2;
  }).map(({ index }) => index);
  if (!productLimited && mergeIndices.length >= 2) {
    for (const qScale of [0.75, 1, 1.5]) {
      const merged = { ...baseCandidate, band: Math.min(...mergeIndices.map((index) => filters[index].band || index + 1)),
        Q: Math.max(0.5, Math.min(10, baseCandidate.Q * qScale)), reason: "Merged overlapping filters and jointly refit region" };
      trials.push({ action: "merge", filter: merged, mergedFilterIndices: mergeIndices, scalableIndex: filters.length - mergeIndices.length });
    }
  }
  return { trials, productLimited, authority };
}