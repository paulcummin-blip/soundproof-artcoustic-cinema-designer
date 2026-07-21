import {
  countSameSignFiltersInRegion, isNearDuplicate, limitBoostForCapability, qForRegion,
} from "@/components/utils/designEqCalibration";

export function generateHouseCurveTrials(region, filters, profile, activeSubs, usableLfHz, requestedSystemOutputDb) {
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
  const rawQValues = [baseCandidate.Q * 0.65, baseCandidate.Q, baseCandidate.Q * 1.5, baseCandidate.Q * 2, 4, 8];
  const qValues = [...new Map(rawQValues.map((q) => {
    const value = Math.max(0.5, Math.min(10, q));
    return [value.toFixed(4), value];
  })).values()];

  if (!productLimited && filters.length < 10) {
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
    return Math.log2(Math.max(baseCandidate.frequencyHz, filter.frequencyHz) / Math.min(baseCandidate.frequencyHz, filter.frequencyHz)) <= 1 / 6;
  }).map(({ index }) => index);
  if (!productLimited && mergeIndices.length >= 2) {
    for (const qScale of [0.75, 1, 1.5]) {
      const merged = { ...baseCandidate, band: Math.min(...mergeIndices.map((index) => filters[index].band || index + 1)),
        Q: Math.max(0.5, Math.min(10, baseCandidate.Q * qScale)), reason: "Merged overlapping filters and jointly refit region" };
      trials.push({ action: "merge", filter: merged, mergedFilterIndices: mergeIndices, scalableIndex: filters.length - mergeIndices.length });
    }
  }
  return { trials, productLimited };
}