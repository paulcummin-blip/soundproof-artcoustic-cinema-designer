import { MODELS, getSubwooferCurve, normaliseModelKey } from "@/components/models/speakers/registry";

const isFiniteNumber = (value) => Number.isFinite(Number(value));
const dbToPressure = (db) => Math.pow(10, Number(db) / 20);

export function interpolateCapabilityCurve(curve, frequency) {
  const points = Array.isArray(curve) ? curve
    .map((point) => ({ frequency: Number(point?.frequency ?? point?.hz ?? point?.[0]), spl: Number(point?.spl ?? point?.db ?? point?.[1]) }))
    .filter((point) => isFiniteNumber(point.frequency) && isFiniteNumber(point.spl))
    .sort((a, b) => a.frequency - b.frequency) : [];
  if (!points.length || !isFiniteNumber(frequency)) return null;
  if (frequency <= points[0].frequency) return points[0].spl;
  if (frequency >= points[points.length - 1].frequency) return points[points.length - 1].spl;
  const upperIndex = points.findIndex((point) => point.frequency >= frequency);
  const low = points[upperIndex - 1];
  const high = points[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}

function getModelKey(sub) {
  return normaliseModelKey(sub?.modelKey ?? sub?.model ?? "");
}

function getSubGainDb(sub) {
  const gain = sub?.tuning?.gainDb ?? sub?.gainDb ?? 0;
  return isFiniteNumber(gain) ? Number(gain) : 0;
}

export function getUsableLfHz(activeSubs) {
  const values = (activeSubs || []).map((sub) => MODELS.find((model) => model.key === getModelKey(sub))?.approvedUsableLfHzMinus6dB)
    .filter(isFiniteNumber);
  return values.length ? Math.max(...values) : null;
}

export function getSystemSourceCapability(activeSubs, frequency) {
  const levels = (activeSubs || []).map((sub) => interpolateCapabilityCurve(getSubwooferCurve(getModelKey(sub)), frequency));
  if (!levels.length || levels.some((level) => !isFiniteNumber(level))) return null;
  return 20 * Math.log10(levels.reduce((sum, level) => sum + dbToPressure(level), 0));
}

export function getCurrentSystemSourceOutput(activeSubs, frequency) {
  const levels = (activeSubs || []).map((sub) => {
    const baseline = interpolateCapabilityCurve(getSubwooferCurve(getModelKey(sub)), frequency);
    return isFiniteNumber(baseline) ? baseline + getSubGainDb(sub) : null;
  });
  if (!levels.length || levels.some((level) => !isFiniteNumber(level))) return null;
  return 20 * Math.log10(levels.reduce((sum, level) => sum + dbToPressure(level), 0));
}

export function getSourceDomainBoostAllowance({ frequency, requestedBoostDb, activeSubs, usableLfHz, maxBoostDb = 6 }) {
  const requested = Math.max(0, Number(requestedBoostDb) || 0);
  const systemCapabilityDb = getSystemSourceCapability(activeSubs, frequency);
  const currentSystemSourceOutputDb = getCurrentSystemSourceOutput(activeSubs, frequency);
  const headroomDb = isFiniteNumber(systemCapabilityDb) && isFiniteNumber(currentSystemSourceOutputDb)
    ? systemCapabilityDb - currentSystemSourceOutputDb : null;
  const normalAllowedBoostDb = headroomDb == null ? Math.min(requested, maxBoostDb) : Math.max(0, Math.min(requested, maxBoostDb, headroomDb));
  const lf = isFiniteNumber(usableLfHz) ? Number(usableLfHz) : null;
  const rampFraction = lf == null ? 1 : Math.max(0, Math.min(1, (Number(frequency) - lf) / 5));
  return {
    systemCapabilityDb,
    currentSystemSourceOutputDb,
    headroomDb,
    requestedBoostDb: requested,
    lfRampFraction: rampFraction,
    lfRampLimitDb: normalAllowedBoostDb * rampFraction,
    allowedBoostDb: normalAllowedBoostDb * rampFraction,
  };
}