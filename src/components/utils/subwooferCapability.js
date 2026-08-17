import { MODELS, getApprovedFrequencyRangeHz, getSubwooferCurve, normaliseModelKey } from "@/components/models/speakers/registry";

const isFiniteNumber = (value) => Number.isFinite(Number(value));
const isPositivePower = (value) => value !== null
  && value !== undefined
  && value !== ""
  && Number.isFinite(Number(value))
  && Number(value) > 0;
const dbToPower = (db) => Math.pow(10, Number(db) / 10);

export const DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W = 1000;

export function getPerSubwooferAmplifierAuthority(activeSubs, configuredPowerPerSubW = null) {
  const subs = Array.isArray(activeSubs) ? activeSubs : [];
  const firstConfiguredPowerW = subs
    .map((sub) => sub?.subwooferAmplifierPowerW ?? sub?.amplifierPowerPerSubW)
    .find(isPositivePower);
  const defaultPowerPerSubW = isPositivePower(configuredPowerPerSubW)
    ? Number(configuredPowerPerSubW)
    : isPositivePower(firstConfiguredPowerW)
      ? Number(firstConfiguredPowerW)
      : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;
  const sourceAuthorities = subs.map((sub, index) => {
    const model = MODELS.find((candidate) => candidate.key === getModelKey(sub));
    const productPowerHandlingW = Number(model?.max_power);
    const amplifierPowerW = isPositivePower(sub?.subwooferAmplifierPowerW ?? sub?.amplifierPowerPerSubW)
      ? Number(sub?.subwooferAmplifierPowerW ?? sub?.amplifierPowerPerSubW)
      : defaultPowerPerSubW;
    const powerRatio = Number.isFinite(productPowerHandlingW) && productPowerHandlingW > 0
      ? Math.max(0, Math.min(1, amplifierPowerW / productPowerHandlingW))
      : 1;
    return {
      index,
      modelKey: getModelKey(sub),
      amplifierPowerW,
      productPowerHandlingW: Number.isFinite(productPowerHandlingW) ? productPowerHandlingW : null,
      powerRatio,
      deratingDb: powerRatio > 0 ? 10 * Math.log10(powerRatio) : -Infinity,
      powerLimited: powerRatio < 1 - 1e-9,
    };
  });
  return {
    powerPerSubW: defaultPowerPerSubW,
    totalAvailablePowerW: sourceAuthorities.reduce((sum, source) => sum + source.amplifierPowerW, 0),
    totalProductPowerHandlingW: sourceAuthorities.reduce((sum, source) => sum + (source.productPowerHandlingW || 0), 0),
    sourceAuthorities,
    powerLimited: sourceAuthorities.some((source) => source.powerLimited),
    allocationPolicy: "one-dedicated-amplifier-per-subwoofer",
  };
}

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

export function getSystemSourceCapability(activeSubs, frequency, amplifierPowerPerSubW = null) {
  const amplifier = getPerSubwooferAmplifierAuthority(activeSubs, amplifierPowerPerSubW);
  const levels = (activeSubs || []).map((sub) => interpolateCapabilityCurve(getSubwooferCurve(getModelKey(sub)), frequency));
  if (!levels.length || levels.some((level) => !isFiniteNumber(level))) return null;
  // Product capability is a power-summed source-domain ceiling. Coherent
  // pressure summation belongs to the position-aware room transfer, where
  // phase and path length are explicit. Treating every cabinet as co-located
  // and perfectly coherent here granted four cabinets +12 dB instead of the
  // approved +6 dB quantity gain, creating false LF headroom for P18 and EQ.
  const summedPower = levels.reduce((sum, level, index) => {
    const deratingDb = amplifier.sourceAuthorities[index]?.deratingDb ?? 0;
    return sum + dbToPower(level + deratingDb);
  }, 0);
  return 10 * Math.log10(summedPower);
}

export function getCurrentSystemSourceOutput(activeSubs) {
  if (!(activeSubs || []).length) return null;
  // The LFE target is one processor output shared by the complete subwoofer
  // system. Cabinets raise maximum capability; they do not duplicate demand.
  return getCombinedRequestedOutputDb(activeSubs) + getOverallLfeGainDb(activeSubs);
}

export function getSourceDomainBoostAllowance({ frequency, requestedBoostDb, activeSubs, usableLfHz, maxBoostDb = 6, requestedSystemOutputDb, amplifierPowerPerSubW = null }) {
  const requested = Math.max(0, Number(requestedBoostDb) || 0);
  const amplifierAuthority = getPerSubwooferAmplifierAuthority(activeSubs, amplifierPowerPerSubW);
  const systemCapabilityDb = getSystemSourceCapability(activeSubs, frequency, amplifierPowerPerSubW);
  const configuredSystemOutputDb = getCurrentSystemSourceOutput(activeSubs);
  const currentSystemSourceOutputDb = isFiniteNumber(requestedSystemOutputDb)
    ? Number(requestedSystemOutputDb)
    : configuredSystemOutputDb;
  const availableHeadroomDb = isFiniteNumber(systemCapabilityDb) && isFiniteNumber(currentSystemSourceOutputDb)
    ? systemCapabilityDb - currentSystemSourceOutputDb : null;
  const normalAllowedBoostDb = availableHeadroomDb == null ? Math.min(requested, maxBoostDb) : Math.max(0, Math.min(requested, maxBoostDb, availableHeadroomDb));
  const evaluationHz = Number(frequency);
  const sourceCoverage = (activeSubs || []).map((sub) => {
    const modelKey = getModelKey(sub);
    const curve = getSubwooferCurve(modelKey) || [];
    const curveFrequencies = curve.map((point) => Number(point?.hz ?? point?.frequency)).filter(Number.isFinite);
    const approvedRange = getApprovedFrequencyRangeHz(modelKey);
    const lowerHz = curveFrequencies.length ? Math.min(...curveFrequencies) : Number(approvedRange?.[0]);
    const upperHz = Math.max(
      curveFrequencies.length ? Math.max(...curveFrequencies) : -Infinity,
      Number.isFinite(Number(approvedRange?.[1])) ? Number(approvedRange[1]) : -Infinity,
    );
    return {
      modelKey,
      lowerHz: Number.isFinite(lowerHz) ? lowerHz : null,
      upperHz: Number.isFinite(upperHz) ? upperHz : null,
      covered: Number.isFinite(evaluationHz)
        && Number.isFinite(lowerHz)
        && Number.isFinite(upperHz)
        && evaluationHz >= lowerHz
        && evaluationHz <= upperHz,
    };
  });
  // The approved usable-LF (-6 dB) point is not a brick wall. At lower P14
  // operating levels, the frequency-dependent product curve can retain enough
  // headroom for safe correction below that point. The actual capability curve
  // and +6 dB bank limit remain authoritative; correction is blocked only
  // outside the available engineering/approved frequency coverage.
  const frequencyCoveredByProducts = sourceCoverage.length > 0
    && sourceCoverage.every((source) => source.covered);
  const rampFraction = frequencyCoveredByProducts ? 1 : 0;
  return {
    systemCapabilityDb,
    amplifierAuthority,
    currentSystemSourceOutputDb,
    availableHeadroomDb,
    headroomDb: availableHeadroomDb,
    requestedBoostDb: requested,
    usableLfHz: isFiniteNumber(usableLfHz) ? Number(usableLfHz) : null,
    sourceCoverage,
    frequencyCoveredByProducts,
    lfRampFraction: rampFraction,
    lfRampLimitDb: normalAllowedBoostDb * rampFraction,
    allowedBoostDb: normalAllowedBoostDb * rampFraction,
  };
}