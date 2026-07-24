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

function getCombinedRequestedOutputDb(activeSubs) {
  const configured = (activeSubs || []).map((sub) => sub?.tuning?.requestedOutputDb ?? sub?.requestedOutputDb)
    .find(isFiniteNumber);
  return isFiniteNumber(configured) ? Number(configured) : 114;
}

function getOverallLfeGainDb(activeSubs) {
  const configured = (activeSubs || []).map((sub) => sub?.tuning?.overallLfeGainDb ?? sub?.overallLfeGainDb)
    .find(isFiniteNumber);
  return isFiniteNumber(configured) ? Number(configured) : 0;
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

export function getCurrentSystemSourceOutput(activeSubs) {
  if (!(activeSubs || []).length) return null;
  // The LFE target is one processor output shared by the complete subwoofer
  // system. Cabinets raise maximum capability; they do not duplicate demand.
  return getCombinedRequestedOutputDb(activeSubs) + getOverallLfeGainDb(activeSubs);
}

export function getSourceDomainBoostAllowance({ frequency, requestedBoostDb, activeSubs, usableLfHz, maxBoostDb = 6, requestedSystemOutputDb }) {
  const requested = Math.max(0, Number(requestedBoostDb) || 0);
  const systemCapabilityDb = getSystemSourceCapability(activeSubs, frequency);
  const configuredSystemOutputDb = getCurrentSystemSourceOutput(activeSubs);
  const currentSystemSourceOutputDb = isFiniteNumber(requestedSystemOutputDb)
    ? Number(requestedSystemOutputDb)
    : configuredSystemOutputDb;
  const availableHeadroomDb = isFiniteNumber(systemCapabilityDb) && isFiniteNumber(currentSystemSourceOutputDb)
    ? systemCapabilityDb - currentSystemSourceOutputDb : null;
  const normalAllowedBoostDb = availableHeadroomDb == null ? Math.min(requested, maxBoostDb) : Math.max(0, Math.min(requested, maxBoostDb, availableHeadroomDb));
  const lf = isFiniteNumber(usableLfHz) ? Number(usableLfHz) : null;
  const rampFraction = lf == null ? 1 : Number(frequency) >= lf ? 1 : 0;
  return {
    systemCapabilityDb,
    currentSystemSourceOutputDb,
    availableHeadroomDb,
    headroomDb: availableHeadroomDb,
    requestedBoostDb: requested,
    lfRampFraction: rampFraction,
    lfRampLimitDb: normalAllowedBoostDb * rampFraction,
    allowedBoostDb: normalAllowedBoostDb * rampFraction,
  };
}