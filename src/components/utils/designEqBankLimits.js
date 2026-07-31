import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";

const SAMPLE_RATE = 48000;
let bankEvaluationCounter = 0;

export const resetDesignEqBankEvaluationCount = () => { bankEvaluationCounter = 0; };
export const getDesignEqBankEvaluationCount = () => bankEvaluationCounter;

export function peakingEqResponseDb(frequencyHz, filter) {
  const evaluationHz = Number(frequencyHz);
  const requestedCentreHz = Number(filter?.frequencyHz);
  const centreHz = Math.min(requestedCentreHz, SAMPLE_RATE * 0.45);
  const gainDb = Number(filter?.gainDb);
  const q = Number(filter?.Q);
  if (!filter?.enabled || !Number.isFinite(evaluationHz) || evaluationHz <= 0
    || !Number.isFinite(centreHz) || centreHz <= 0 || !Number.isFinite(q) || q <= 0
    || !Number.isFinite(gainDb)) return 0;

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
    -(b1 * Math.sin(w) + b2 * Math.sin(2 * w)),
  );
  const denominatorMagnitude = Math.hypot(
    1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w),
    -(a1 * Math.sin(w) + a2 * Math.sin(2 * w)),
  );
  if (![numeratorMagnitude, denominatorMagnitude].every(Number.isFinite)
    || numeratorMagnitude <= 0 || denominatorMagnitude <= 0) return 0;
  const responseDb = 20 * Math.log10(numeratorMagnitude / denominatorMagnitude);
  return Number.isFinite(responseDb) ? responseDb : 0;
}

export function limitBoostForCapability(filter, activeSubs, usableLfHz, requestedSystemOutputDb) {
  if (!(filter?.gainDb > 0)) return filter;
  const allowance = getSourceDomainBoostAllowance({
    frequency: filter.frequencyHz,
    requestedBoostDb: filter.gainDb,
    activeSubs,
    usableLfHz,
    maxBoostDb: 6,
    requestedSystemOutputDb,
  });
  return { ...filter, gainDb: Math.max(0, Math.min(6, allowance.allowedBoostDb)) };
}

export function aggregateResponseDbAt(frequency, filters) {
  return filters.reduce((sum, filter) => sum + peakingEqResponseDb(frequency, filter), 0);
}

export function evaluateProvisionalBankLimits(filters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile) {
  bankEvaluationCounter += 1;
  const maximumAggregateBoostDb = (profile?.maximumAggregateBoostDb ?? 6) + 0.05;
  const aggregateCutFloorDb = -((profile?.maximumCutDb ?? 15) + 0.05);
  const bandPoints = raw.filter((point) => point.frequency >= 20 && point.frequency <= 200);
  let maxAggregateBoostDb = 0;
  let maxAggregateBoostHz = null;
  let maxAggregateCutDb = 0;
  let maxAggregateCutHz = null;
  let limitingPermittedBoostDb = 6;
  let boostLimitOk = true;
  let cutLimitOk = true;
  let sourceDomainHeadroomOk = true;

  for (const point of bandPoints) {
    const aggregateDb = aggregateResponseDbAt(point.frequency, filters);
    const allowance = getSourceDomainBoostAllowance({
      frequency: point.frequency,
      requestedBoostDb: 6,
      activeSubs,
      usableLfHz,
      maxBoostDb: 6,
      requestedSystemOutputDb,
    });
    const permittedBoostDb = Math.max(0, Math.min(6, allowance.allowedBoostDb));
    limitingPermittedBoostDb = Math.min(limitingPermittedBoostDb, permittedBoostDb);
    if (aggregateDb > maxAggregateBoostDb) {
      maxAggregateBoostDb = aggregateDb;
      maxAggregateBoostHz = point.frequency;
    }
    if (aggregateDb < maxAggregateCutDb) {
      maxAggregateCutDb = aggregateDb;
      maxAggregateCutHz = point.frequency;
    }
    if (aggregateDb > maximumAggregateBoostDb) boostLimitOk = false;
    if (aggregateDb > permittedBoostDb + 0.05) sourceDomainHeadroomOk = false;
    if (aggregateDb < aggregateCutFloorDb) cutLimitOk = false;
  }
  return {
    maxAggregateBoostDb,
    maxAggregateBoostHz,
    maxAggregateCutDb,
    maxAggregateCutHz,
    limitingPermittedBoostDb,
    boostLimitOk,
    cutLimitOk,
    sourceDomainHeadroomOk,
    // Stage B: sourceDomainHeadroomOk remains as a diagnostic field but is
    // no longer part of the allOk gate. Per-filter clamping in
    // scaleCandidateForBankLimits is the frequency-dependent authority.
    allOk: boostLimitOk && cutLimitOk,
  };
}

export function scaleCandidateForBankLimits(candidate, existingFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile) {
  // Stage B: Frequency-dependent boost authority.
  // Each positive-gain filter is individually clamped to the source-domain
  // boost allowance available at its own centre frequency. A single unsafe
  // frequency no longer vetoes the entire filter bank — the global
  // sourceDomainHeadroomOk flag remains as a diagnostic only.
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
      requestedSystemOutputDb,
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
      reason: headroomLimited
        ? `Boost reduced from ${requestedGainDb.toFixed(2)} dB to ${appliedGainDb.toFixed(2)} dB — source-domain headroom limit at ${candidate.frequencyHz.toFixed(1)} Hz`
        : `Boost within source-domain allowance at ${candidate.frequencyHz.toFixed(1)} Hz`,
    };
    // Remove the filter if the permitted gain at this frequency is effectively zero.
    if (appliedGainDb <= 0.1) {
      return {
        filter: null,
        scaled: true,
        limits: evaluateProvisionalBankLimits([...existingFilters, { ...candidate, gainDb: 0 }], raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile),
        perFilterDiagnostics,
      };
    }
    clampedCandidate = { ...candidate, gainDb: appliedGainDb };
  }

  const initial = evaluateProvisionalBankLimits([...existingFilters, clampedCandidate], raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  if (initial.allOk) return { filter: clampedCandidate, scaled: clampedCandidate.gainDb !== candidate.gainDb, limits: initial, perFilterDiagnostics };

  // Binary search on gain for boost/cut limit violations only.
  // sourceDomainHeadroomOk is not part of allOk (Stage B) so the search
  // constrains only on aggregate boost/cut envelope limits.
  let low = 0;
  let high = Math.abs(clampedCandidate.gainDb);
  for (let index = 0; index < 14; index += 1) {
    const magnitude = (low + high) / 2;
    const gainDb = isBoost ? magnitude : -magnitude;
    const limits = evaluateProvisionalBankLimits(
      [...existingFilters, { ...clampedCandidate, gainDb }], raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile,
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
    limits: evaluateProvisionalBankLimits([...existingFilters, filter], raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile),
    perFilterDiagnostics,
  };
}

export function isNearDuplicate(candidate, existingFilters) {
  const sign = candidate.gainDb > 0 ? 1 : -1;
  return existingFilters.some((filter) => {
    if (!filter.enabled || (filter.gainDb > 0 ? 1 : -1) !== sign) return false;
    const frequencyDistance = Math.log2(Math.max(candidate.frequencyHz, filter.frequencyHz) / Math.min(candidate.frequencyHz, filter.frequencyHz));
    const qRatio = Math.max(candidate.Q, filter.Q) / Math.min(candidate.Q, filter.Q);
    return frequencyDistance <= 1 / 24 && qRatio <= 1.25;
  });
}

export function countSameSignFiltersInRegion(candidate, existingFilters) {
  const sign = candidate.gainDb > 0 ? 1 : -1;
  return existingFilters.filter((filter) => {
    if (!filter.enabled || (filter.gainDb > 0 ? 1 : -1) !== sign) return false;
    return Math.log2(Math.max(candidate.frequencyHz, filter.frequencyHz) / Math.min(candidate.frequencyHz, filter.frequencyHz)) <= 1 / 12;
  }).length;
}

export function maxSameRegionFilterCount(filters) {
  return filters.reduce((maximum, candidate) => (
    candidate.enabled ? Math.max(maximum, countSameSignFiltersInRegion(candidate, filters.filter((filter) => filter !== candidate)) + 1) : maximum
  ), 0);
}

export function buildCurveFromBank(raw, filters) {
  return raw.map((point) => ({
    frequency: point.frequency,
    spl: point.spl + aggregateResponseDbAt(point.frequency, filters),
  }));
}

export function scaleRevisionForBankLimits(existingFilter, proposedGainDelta, filterIndex, existingFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile) {
  const maximumCutDb = profile?.maximumCutDb ?? 15;
  const maximumAggregateBoostDb = profile?.maximumAggregateBoostDb ?? 6;
  const proposedGain = existingFilter.gainDb + proposedGainDelta;
  const clampedGain = existingFilter.gainDb > 0
    ? Math.min(maximumAggregateBoostDb, proposedGain)
    : Math.max(-maximumCutDb, proposedGain);
  const clampedDelta = clampedGain - existingFilter.gainDb;
  if (Math.abs(clampedDelta) <= 0.1) return { filter: null, scaled: false, limits: null, acceptedDelta: 0 };
  const revisedFilter = { ...existingFilter, gainDb: clampedGain };
  const initialFilters = existingFilters.map((filter, index) => index === filterIndex ? revisedFilter : filter);
  const initial = evaluateProvisionalBankLimits(initialFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  if (initial.allOk) return { filter: revisedFilter, scaled: false, limits: initial, acceptedDelta: clampedDelta };

  const isBoost = clampedDelta > 0;
  let low = 0;
  let high = Math.abs(clampedDelta);
  for (let index = 0; index < 14; index += 1) {
    const magnitude = (low + high) / 2;
    const delta = isBoost ? magnitude : -magnitude;
    const trial = { ...existingFilter, gainDb: existingFilter.gainDb + delta };
    const trialFilters = existingFilters.map((filter, candidateIndex) => candidateIndex === filterIndex ? trial : filter);
    const limits = evaluateProvisionalBankLimits(trialFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
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
    limits: evaluateProvisionalBankLimits(acceptedFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile),
    acceptedDelta,
  };
}

export function emptyFilters(filters) {
  return [...filters, ...Array.from({ length: Math.max(0, 10 - filters.length) }, (_, index) => ({
    band: filters.length + index + 1,
    enabled: false,
    type: "Peak",
    frequencyHz: null,
    gainDb: 0,
    Q: null,
    startHz: null,
    endHz: null,
    reason: "Unused",
  }))];
}