import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import { deriveSubwoofersFromCfg } from "@/components/utils/deriveSubwoofersFromCfg";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS as DEFAULTS } from "./bassPhysicsDefaults";

const LABELS = ["left", "right"];
const positionOf = (item) => item?.position ?? item;

export function buildPersistentBassSources({ roomDims, rspPosition, subwoofers, frontSubsCfg, rearSubsCfg }) {
  const live = Array.isArray(subwoofers) && subwoofers.length
    ? subwoofers
    : deriveSubwoofersFromCfg(frontSubsCfg, rearSubsCfg, roomDims, roomDims);
  const sources = live.map((item, index) => {
    const position = positionOf(item);
    const group = item?.group === "rear" || String(item?.role || "").toUpperCase().startsWith("SUBR") ? "rear" : "front";
    const groupItems = live.filter((candidate) => {
      const role = String(candidate?.role || "").toUpperCase();
      return group === "rear" ? candidate?.group === "rear" || role.startsWith("SUBR") : candidate?.group !== "rear" && !role.startsWith("SUBR");
    });
    const groupIndex = Math.max(0, groupItems.indexOf(item));
    const cfg = group === "rear" ? rearSubsCfg : frontSubsCfg;
    const id = item?.id ?? `${group}-sub-${LABELS[groupIndex] ?? groupIndex}`;
    const settings = cfg?.settingsById?.[id] || (Object.keys(cfg?.settingsById || {}).length === 1 ? Object.values(cfg.settingsById)[0] : {}) || {};
    return {
      id, group, modelKey: item?.modelKey ?? item?.model ?? cfg?.model ?? "SUB2-12",
      x: Number(position?.x), y: Number(position?.y), z: Number.isFinite(Number(position?.z)) ? Number(position.z) : 0.35,
      manualDelayMs: Number.isFinite(settings.delayMs) ? settings.delayMs : 0,
      gainDb: Number.isFinite(settings.gainDb) ? settings.gainDb : 0,
      polarity: settings.polarity === "invert" ? 180 : 0,
      sourceIndex: index,
    };
  }).filter((source) => Number.isFinite(source.x) && Number.isFinite(source.y));

  if (!rspPosition || sources.length === 0) return sources.map(({ manualDelayMs, sourceIndex, ...source }) => ({ ...source, tuning: { gainDb: source.gainDb, delayMs: manualDelayMs, polarity: source.polarity } }));
  const arrivals = sources.map((source) => Math.hypot(source.x - rspPosition.x, source.y - rspPosition.y, source.z - rspPosition.z) / 343 * 1000);
  const latest = Math.max(...arrivals);
  return sources.map((source, index) => {
    const { manualDelayMs, gainDb, polarity, sourceIndex, ...rest } = source;
    return { ...rest, tuning: { gainDb, delayMs: manualDelayMs + Math.max(0, latest - arrivals[index]), polarity } };
  });
}

export function simulatePersistentProductBass({ roomDims, seatingPositions, rspPosition, sources }) {
  if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM || !sources.length) return { seatResponses: {} };
  const seatResponses = {};
  [rspPosition, ...(Array.isArray(seatingPositions) ? seatingPositions : [])].filter(Boolean).forEach((seat) => {
    let freqsHz = null;
    let sumRe = null;
    let sumIm = null;
    sources.forEach((source) => {
      const curve = getSubwooferCurve(source.modelKey);
      if (!curve?.length) return;
      const result = simulateBassResponseRewCore(roomDims, { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 }, source, curve, {
        enableReflections: true, enableModes: true, surfaceAbsorption: DEFAULTS.surfaceAbsorption,
        freqMinHz: 20, freqMaxHz: 200, smoothing: "none",
        modalSourceReferenceMode: DEFAULTS.modalSourceReferenceMode, modalGainScalar: DEFAULTS.modalGainScalar,
        axialQ: DEFAULTS.axialQ, modalStorageMode: DEFAULTS.modalStorageMode,
        propagationPhaseScale: DEFAULTS.propagationPhaseScale, pureDeterministicModalSum: false,
        disableReflectionPhaseJitter: DEFAULTS.disableReflectionPhaseJitter,
        disableReflectionCoherenceWeight: DEFAULTS.disableReflectionCoherenceWeight,
        disableLateField: true, disableModalPropagationPhase: true,
        mute68HzAxialMode: DEFAULTS.mute68HzAxialMode, debugDisableModalContribution: DEFAULTS.debugDisableModalContribution,
        overrideConstantAxialQ: DEFAULTS.overrideConstantAxialQ, overrideAbsorptionAxialQ: DEFAULTS.overrideAbsorptionAxialQ,
        debugMode200Multiplier: DEFAULTS.debugMode200Multiplier, debugReflectionOrder: 1,
        reflectionGainScale: DEFAULTS.reflectionGainScale, modalCoherenceMode: DEFAULTS.modalCoherenceMode,
        highOrderAxialScale: DEFAULTS.highOrderAxialScale, qStrategy: DEFAULTS.qStrategy,
        rewModalBandwidthScale: DEFAULTS.rewModalBandwidthScale, runtimeVectorCapture: false,
      });
      if (!freqsHz) {
        freqsHz = result.freqsHz;
        sumRe = result.complexPressure.map((value) => value.re);
        sumIm = result.complexPressure.map((value) => value.im);
      } else result.complexPressure.forEach((value, index) => { sumRe[index] += value.re; sumIm[index] += value.im; });
    });
    if (freqsHz) seatResponses[seat.id || `${seat.x}-${seat.y}`] = { freqsHz, splDb: sumRe.map((re, index) => 20 * Math.log10(Math.max(Math.hypot(re, sumIm[index]), 1e-10))) };
  });
  return { seatResponses };
}

const curveFromResponse = (response) => (response?.freqsHz || []).map((frequency, index) => ({ frequency, spl: response.splDb?.[index] })).filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.spl));

export function buildPersistentResponseCurves(seatResponses) {
  const rspRawCurve = curveFromResponse(seatResponses?.rsp);
  const perSeatRawCurves = Object.entries(seatResponses || {}).filter(([seatId]) => seatId !== "rsp").map(([seatId, response]) => ({ seatId, responseData: curveFromResponse(response) })).filter((seat) => seat.responseData.length);
  return { rspRawCurve, perSeatRawCurves };
}