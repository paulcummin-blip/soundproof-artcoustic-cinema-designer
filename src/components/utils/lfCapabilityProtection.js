const PROFILE_PENALTY_WEIGHTS = Object.freeze({
  standard: 1,
  accuracy: 0.7,
  house_curve: 0.45,
});

const finite = (value) => Number.isFinite(Number(value));
const dbToPressure = (db) => 10 ** (Number(db) / 20);

function interpolate(curve, frequency) {
  const points = (Array.isArray(curve) ? curve : [])
    .map((point) => ({ frequency: Number(point?.frequency ?? point?.hz), spl: Number(point?.spl ?? point?.db) }))
    .filter((point) => finite(point.frequency) && finite(point.spl))
    .sort((a, b) => a.frequency - b.frequency);
  if (!points.length || !finite(frequency)) return null;
  if (frequency <= points[0].frequency) return points[0].spl;
  if (frequency >= points.at(-1).frequency) return points.at(-1).spl;
  const upperIndex = points.findIndex((point) => point.frequency >= frequency);
  const low = points[upperIndex - 1];
  const high = points[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}

function capabilityForSub(sub, frequency) {
  const capability = sub?.bassCapability;
  const curveValue = interpolate(capability?.maxSPLCurve, frequency)
    ?? interpolate(capability?.frequencyResponseCurve, frequency);
  return finite(curveValue) ? curveValue : finite(capability?.maxSPL) ? Number(capability.maxSPL) : null;
}

function combinedCapability(activeSubs, valueForSub) {
  const values = (activeSubs || []).map(valueForSub).filter(finite);
  if (!values.length || values.length !== (activeSubs || []).length) return null;
  return 20 * Math.log10(values.reduce((sum, value) => sum + dbToPressure(value), 0));
}

export function getEqCapabilityBoostAllowance({ frequency, requestedBoostDb, activeSubs, maxBoostDb = 6, requestedSystemOutputDb }) {
  const requested = Math.max(0, Number(requestedBoostDb) || 0);
  const systemCapabilityDb = combinedCapability(activeSubs, (sub) => capabilityForSub(sub, frequency));
  const currentSystemSourceOutputDb = finite(requestedSystemOutputDb) ? Number(requestedSystemOutputDb) : 114;
  const availableHeadroomDb = finite(systemCapabilityDb) ? systemCapabilityDb - currentSystemSourceOutputDb : null;
  const allowedBoostDb = availableHeadroomDb == null
    ? Math.min(requested, maxBoostDb)
    : Math.max(0, Math.min(requested, maxBoostDb, availableHeadroomDb));
  return { systemCapabilityDb, currentSystemSourceOutputDb, availableHeadroomDb, allowedBoostDb };
}

export function buildLfCapabilityContext(activeSubs = [], frequencies = [], profileId = "standard", requestedSystemOutputDb = null) {
  const models = activeSubs.map((sub) => sub?.modelKey ?? sub?.model ?? "Unknown");
  const usableValues = activeSubs.map((sub) => Number(sub?.bassCapability?.usableLF_neg6dB)).filter(Number.isFinite);
  const usableLfHz = usableValues.length ? Math.max(...usableValues) : null;
  const evaluated = frequencies.map(Number).filter((frequency) => Number.isFinite(frequency) && frequency > 0);
  const minimumEvaluatedHz = evaluated.length ? Math.min(...evaluated) : null;
  const belowLfFrequencies = Number.isFinite(usableLfHz)
    ? evaluated.filter((frequency) => frequency < usableLfHz)
    : [];
  const scalarSystemMaxSplDb = combinedCapability(activeSubs, (sub) => sub?.bassCapability?.maxSPL);
  const capabilityRelief = Number.isFinite(scalarSystemMaxSplDb)
    ? Math.max(1, Math.min(2.5, 1 + Math.max(0, scalarSystemMaxSplDb - 120) / 18))
    : 1;
  const allowances = belowLfFrequencies.map((frequency) => getEqCapabilityBoostAllowance({
    frequency, requestedBoostDb: 6, activeSubs, requestedSystemOutputDb,
  }).allowedBoostDb).filter(Number.isFinite);
  return {
    models,
    usableLfHz,
    minimumEvaluatedHz,
    belowLfFrequencies,
    scalarSystemMaxSplDb,
    capabilityRelief,
    profileId,
    penaltyWeight: PROFILE_PENALTY_WEIGHTS[profileId] ?? PROFILE_PENALTY_WEIGHTS.standard,
    maximumPermittedLfBoostRegion: {
      startHz: minimumEvaluatedHz,
      endHz: usableLfHz,
      activeInEvaluatedBand: belowLfFrequencies.length > 0,
      minimumPermittedBoostDb: allowances.length ? Math.min(...allowances) : 6,
      maximumPermittedBoostDb: allowances.length ? Math.max(...allowances) : 6,
    },
  };
}

export function calculateLfCapabilityPenalty(filters, context, responseAtFrequency) {
  if (!context?.belowLfFrequencies?.length || typeof responseAtFrequency !== "function") return 0;
  const enabledFilters = (Array.isArray(filters) ? filters : []).filter((filter) => filter?.enabled !== false);
  if (!enabledFilters.some((filter) => Number(filter?.gainDb) > 0)) return 0;
  let sumSquares = 0;
  for (const frequency of context.belowLfFrequencies) {
    const positiveBoostDb = Math.max(0, Number(responseAtFrequency(frequency, enabledFilters)) || 0);
    const depth = Math.max(0, (context.usableLfHz - frequency) / 5);
    sumSquares += (positiveBoostDb * depth) ** 2;
  }
  const rmsWeightedBoost = Math.sqrt(sumSquares / context.belowLfFrequencies.length);
  return rmsWeightedBoost * context.penaltyWeight / context.capabilityRelief;
}

export function buildLfCapabilityProtectionDiagnostics(context, selectedPenaltyCostDb, influence = {}) {
  return {
    activeSubModels: context?.models || [],
    usableLfLimitHz: context?.usableLfHz ?? null,
    maximumPermittedLfBoostRegion: context?.maximumPermittedLfBoostRegion ?? null,
    systemMaxSplDb: context?.scalarSystemMaxSplDb ?? null,
    capabilityRelief: context?.capabilityRelief ?? 1,
    penaltyWeight: context?.penaltyWeight ?? null,
    selectedPenaltyCostDb: Number.isFinite(selectedPenaltyCostDb) ? selectedPenaltyCostDb : 0,
    penaltyInfluencedSelectedFilters: !!influence.penaltyInfluencedSelectedFilters,
    candidatesRejectedByPenalty: influence.candidatesRejectedByPenalty || 0,
    selectionsChangedByPenalty: influence.selectionsChangedByPenalty || 0,
  };
}