import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { getApprovedContinuousSplDb, getSubwooferCurve, normaliseModelKey } from "@/components/models/speakers/registry";
import { p14ThresholdsForBasis, normalizeP14TargetBasis } from "@/components/utils/p14CapabilityAuthority";

export const SHADOW_P18_FREQUENCIES = Object.freeze({ L1: 30, L2: 25, L3: 18, L4: 15 });
const LEVELS_DESC = ["L4", "L3", "L2", "L1"];
const REFERENCE_SOURCE_DB = 94;
const CONTIGUOUS_GUARD_OCTAVES = 1 / 6;

const finite = (value) => Number.isFinite(Number(value));
const dbToLinear = (db) => Math.pow(10, Number(db) / 20);
const linearToDb = (value) => 20 * Math.log10(Math.max(Number(value), 1e-12));

function interpolateInRange(points, frequency, valueKey) {
  const valid = (points || []).filter((point) => finite(point?.frequency) && finite(point?.[valueKey])).sort((a, b) => a.frequency - b.frequency);
  if (!valid.length || frequency < valid[0].frequency || frequency > valid[valid.length - 1].frequency) return null;
  return interpolate(valid, frequency, valueKey);
}

function interpolate(points, frequency, valueKey) {
  const sorted = (points || []).filter((point) => finite(point?.frequency) && finite(point?.[valueKey])).sort((a, b) => a.frequency - b.frequency);
  if (!sorted.length) return null;
  if (frequency <= sorted[0].frequency) return sorted[0][valueKey];
  if (frequency >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1][valueKey];
  const upper = sorted.findIndex((point) => point.frequency >= frequency);
  const low = sorted[upper - 1];
  const high = sorted[upper];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low[valueKey] + (high[valueKey] - low[valueKey]) * ratio;
}

function cleanCapabilityAt(sub, frequency) {
  const modelKey = normaliseModelKey(sub?.modelKey ?? sub?.model ?? "");
  const approvedDb = getApprovedContinuousSplDb(modelKey);
  const curve = getSubwooferCurve(modelKey);
  if (!finite(approvedDb) || !Array.isArray(curve) || curve.length < 2) return null;
  const upperBand = curve.filter((point) => point.hz >= 30 && point.hz <= 120 && finite(point.db));
  const shapeAnchorDb = upperBand.length ? Math.max(...upperBand.map((point) => point.db)) : null;
  const shapeDb = interpolate(curve.map((point) => ({ frequency: point.hz, db: point.db })), frequency, "db");
  if (!finite(shapeAnchorDb) || !finite(shapeDb)) return null;
  let capabilityDb = Number(approvedDb) + Number(shapeDb) - Number(shapeAnchorDb);
  const amplifierLimitDb = [sub?.amplifierLimitDb, sub?.amplifier?.continuousSplLimitDb, sub?.tuning?.amplifierLimitDb].find(finite);
  if (finite(amplifierLimitDb)) capabilityDb = Math.min(capabilityDb, Number(amplifierLimitDb));
  return { capabilityDb, approvedDb: Number(approvedDb), amplifierLimitDb: finite(amplifierLimitDb) ? Number(amplifierLimitDb) : null };
}

function targetAt(frequency, cutoffHz, targetDb) {
  const fullTargetHz = cutoffHz * Math.pow(2, 1 / 3);
  if (frequency <= cutoffHz) return targetDb - 3;
  if (frequency >= fullTargetHz) return targetDb;
  const fraction = Math.log2(frequency / cutoffHz) / (1 / 3);
  return targetDb - 3 + 3 * fraction;
}

function underTargetRegions(curve, envelope) {
  const misses = curve.map((point) => ({
    frequency: point.frequency,
    shortfallDb: interpolate(envelope, point.frequency, "spl") - point.spl,
  }));
  const regions = [];
  let active = [];
  const close = () => {
    if (!active.length) return;
    const startHz = active[0].frequency;
    const endHz = active[active.length - 1].frequency;
    regions.push({
      startHz,
      endHz,
      bandwidthHz: endHz - startHz,
      bandwidthOctaves: endHz > startHz ? Math.log2(endHz / startHz) : 0,
      depthDb: Math.max(...active.map((point) => point.shortfallDb)),
    });
    active = [];
  };
  misses.forEach((point) => point.shortfallDb > 0 ? active.push(point) : close());
  close();
  return regions;
}

function classifyCause({ worstFrequency, rawCurve, postEqCurve, sourceDiagnostics }) {
  const raw = interpolate(rawCurve, worstFrequency, "spl");
  const post = interpolate(postEqCurve, worstFrequency, "spl");
  if (finite(raw) && finite(post) && raw - post > 0.25) return "EQ headroom";
  const caps = sourceDiagnostics.map((source) => interpolate(source.capabilityCurve, worstFrequency, "spl")).filter(finite);
  const caps80 = sourceDiagnostics.map((source) => interpolate(source.capabilityCurve, 80, "spl")).filter(finite);
  if (caps.length && caps80.length && caps.reduce((a, b) => a + b, 0) / caps.length < caps80.reduce((a, b) => a + b, 0) / caps80.length - 3) return "product roll-off";
  return "acoustic cancellation";
}

export function assessShadowPairedP14P18({ activeSubs = [], perSourceComplexTransfers = [], combinedEqCurve = [], targetBasis = "minimum", upperFrequencyHz = 120 } = {}) {
  const basis = normalizeP14TargetBasis(targetBasis);
  const thresholds = p14ThresholdsForBasis(basis);
  const sources = perSourceComplexTransfers.filter((source) => Array.isArray(source?.points) && source.points.length > 0);
  if (!sources.length || sources.length !== activeSubs.length) return { status: "INCOMPLETE DATA", reason: "Per-source normalized complex transfer is unavailable or does not match the active subwoofer count.", targetBasis: basis };

  const frequencies = sources[0].points.map((point) => point.frequency).filter((frequency) => frequency <= upperFrequencyHz);
  const sourceDiagnostics = [];
  const missing = [];
  const rawDeliveredCurve = frequencies.map((frequency) => {
    let re = 0;
    let im = 0;
    sources.forEach((source, index) => {
      const sub = activeSubs[index];
      const cap = cleanCapabilityAt(sub, frequency);
      const point = source.points.find((candidate) => candidate.frequency === frequency);
      if (!cap || !point || !finite(point.re) || !finite(point.im)) {
        missing.push(`${sub?.modelKey ?? sub?.model ?? `source ${index + 1}`} @ ${frequency.toFixed(1)} Hz`);
        return;
      }
      const referencePressure = dbToLinear(REFERENCE_SOURCE_DB);
      const hRe = point.re / referencePressure;
      const hIm = point.im / referencePressure;
      const sourcePressure = dbToLinear(cap.capabilityDb);
      re += sourcePressure * hRe;
      im += sourcePressure * hIm;
      if (!sourceDiagnostics[index]) sourceDiagnostics[index] = { sourceId: source.sourceId, modelKey: normaliseModelKey(sub?.modelKey ?? sub?.model), amplifierLimitDb: cap.amplifierLimitDb, capabilityCurve: [] };
      sourceDiagnostics[index].capabilityCurve.push({ frequency, spl: cap.capabilityDb });
    });
    return { frequency, spl: linearToDb(Math.hypot(re, im)), re, im };
  });
  if (missing.length) return { status: "INCOMPLETE DATA", reason: `Missing clean capability or transfer data: ${missing[0]}`, missingData: [...new Set(missing)], targetBasis: basis };

  const postEqDeliveredCurve = rawDeliveredCurve.map((point) => {
    const eqDb = Math.max(0, Number(interpolate(combinedEqCurve, point.frequency, "spl")) || 0);
    return { frequency: point.frequency, spl: point.spl - eqDb, positiveEqCostDb: eqDb };
  });
  const smoothedDeliveredCurve = applyBassSmoothing(postEqDeliveredCurve, "third");
  const levelResults = LEVELS_DESC.map((level) => {
    const cutoffHz = SHADOW_P18_FREQUENCIES[level];
    if (cutoffHz < frequencies[0]) return { level, cutoffHz, status: "INCOMPLETE DATA", passes: false, reason: `Transfer begins at ${frequencies[0].toFixed(1)} Hz.` };
    const assessed = smoothedDeliveredCurve.filter((point) => point.frequency >= cutoffHz && point.frequency <= upperFrequencyHz);
    const targetEnvelope = assessed.map((point) => ({ frequency: point.frequency, spl: targetAt(point.frequency, cutoffHz, thresholds[level]) }));
    const regions = underTargetRegions(assessed, targetEnvelope);
    const longest = regions.sort((a, b) => b.bandwidthOctaves - a.bandwidthOctaves || b.depthDb - a.depthDb)[0] || null;
    const worst = assessed.reduce((lowest, point) => !lowest || point.spl < lowest.spl ? point : lowest, null);
    const passes = !regions.some((region) => region.bandwidthOctaves >= CONTIGUOUS_GUARD_OCTAVES);
    return { level, cutoffHz, targetDb: thresholds[level], status: passes ? "PASS" : "FAIL", passes, targetEnvelope, worstCapabilityDb: worst?.spl ?? null, worstFrequencyHz: worst?.frequency ?? null, longestUnderTargetRegion: longest };
  });
  const winner = levelResults.find((result) => result.passes) || null;
  const displayLevel = winner || levelResults.find((result) => result.level === "L1");
  const band = smoothedDeliveredCurve.filter((point) => point.frequency >= (displayLevel?.cutoffHz ?? 30) && point.frequency <= upperFrequencyHz);
  const worst = band.reduce((lowest, point) => !lowest || point.spl < lowest.spl ? point : lowest, null);
  const maxEqCostDb = Math.max(0, ...postEqDeliveredCurve.map((point) => point.positiveEqCostDb));
  return {
    status: winner ? "PASS" : levelResults.some((result) => result.status !== "INCOMPLETE DATA") ? "FAIL" : "INCOMPLETE DATA",
    targetBasis: basis,
    pairedP14Grade: winner?.level ?? "FAIL",
    pairedP18Grade: winner?.level ?? "FAIL",
    rawDeliveredCurve,
    postEqDeliveredCurve,
    smoothedDeliveredCurve,
    selectedTargetEnvelope: displayLevel?.targetEnvelope || [],
    levelResults,
    worstCapabilityDb: worst?.spl ?? null,
    worstFrequencyHz: worst?.frequency ?? null,
    longestContiguousUnderTarget: displayLevel?.longestUnderTargetRegion || null,
    eqHeadroomCostDb: maxEqCostDb,
    limitingCause: classifyCause({ worstFrequency: worst?.frequency, rawCurve: rawDeliveredCurve, postEqCurve: postEqDeliveredCurve, sourceDiagnostics }),
    deliveredAtFrequencies: Object.fromEntries([15, 18, 25, 30].map((frequency) => [frequency, interpolateInRange(smoothedDeliveredCurve, frequency, "spl")])),
    sourceDiagnostics,
    method: { smoothing: "one-third-octave arithmetic dB average", transition: "log-frequency ramp from target −3 dB at cutoff to full target one-third octave above", contiguousGuardOctaves: CONTIGUOUS_GUARD_OCTAVES, upperFrequencyHz, referenceSourceDb: REFERENCE_SOURCE_DB },
  };
}