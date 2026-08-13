import { useCallback, useMemo, useRef, useState } from "react";
import { simulateBassResponseRewCore, simulateBassResponseRewParityField } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve, MODELS, normaliseModelKey } from "@/components/models/speakers/registry";
import { resolveSubwooferBassCapability } from "@/components/utils/speakerModelResolver";
import { REW_SOURCE_CURVES } from "./rewSourceCurves";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS as DEFAULTS } from "./bassPhysicsDefaults";
import { deriveRequestedCalibrationConfig } from "./requestedCalibrationConfig";
import { ARTCOUSTIC_HOUSE_CURVE } from "@/components/utils/artcousticHouseCurve";
import { computeCalibrationFingerprint, computeGeometryFingerprint, computeHouseCurveFingerprint, computeProductFingerprint } from "./bassAnalysisFingerprints";
import { INSTANCE_STATUS } from "@/components/utils/subwooferInstanceCompatibility";
import {
  DEFAULT_SHARED_SUB_AMPLIFIER_POWER_W,
  getSharedSubwooferAmplifierAuthority,
} from "@/components/utils/subwooferCapability";

const POSITION_LABELS = ["left", "right"];
const clampAbsorption = (value) => Math.max(0, Math.min(0.95, Number(value) || 0.30));

export function buildAuthoritativeRspPosition(roomDims, mlpY_m, mlpX_m) {
  const widthM = Number(roomDims?.widthM);
  const y = Number(mlpY_m);
  if (!Number.isFinite(widthM) || !Number.isFinite(y) || widthM <= 0 || y <= 0) return null;
  // Stage B1: use canonical green-dot X (mlpX_m) when finite; else room centreline.
  const x = Number.isFinite(Number(mlpX_m)) ? Number(mlpX_m) : widthM / 2;
  return { id: "rsp", x, y, z: 1.2, __isSyntheticRsp: true };
}

function resolveSubGroup(subId, fallbackGroup) {
  if (fallbackGroup) return fallbackGroup;
  return subId?.includes("front") || subId?.includes("sub-front") ? "front" : "rear";
}

export function buildAuthoritativeAutoAlignDelays({ enabled, rspPosition, frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg }) {
  if (!enabled || !rspPosition) return {};
  const arrivals = [];
  const processGroup = (cfg, liveSubs, group) => {
    const live = Array.isArray(liveSubs) ? liveSubs : [];
    const cfgPositions = Array.isArray(cfg?.positions) ? cfg.positions : [];
    const count = live.length > 0 ? live.length : (cfg?.count || cfgPositions.length || 0);
    for (let index = 0; index < count; index += 1) {
      const liveEntry = live[index];
      const livePosition = liveEntry?.position ?? liveEntry;
      const position = liveEntry && Number.isFinite(Number(livePosition?.x)) ? livePosition : cfgPositions[index];
      if (!position) continue;
      const x = Number(position.x);
      const y = Number(position.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const z = Number.isFinite(Number(position.z)) ? Number(position.z) : 0.35;
      arrivals.push({
        subId: `${group}-sub-${POSITION_LABELS[index] ?? index}`,
        arrivalMs: Math.hypot(x - rspPosition.x, y - rspPosition.y, z - rspPosition.z) / 343 * 1000,
      });
    }
  };
  processGroup(frontSubsCfg, frontSubsLive, "front");
  processGroup(rearSubsCfg, rearSubsLive, "rear");
  if (!arrivals.length) return {};
  const latest = Math.max(...arrivals.map((item) => item.arrivalMs));
  return Object.fromEntries(arrivals.map((item) => [item.subId, Math.max(0, latest - item.arrivalMs)]));
}

export function buildAuthoritativeBassSources({
  frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg, autoAlignDelays,
  sharedAmplifierPowerW = DEFAULT_SHARED_SUB_AMPLIFIER_POWER_W,
}) {
  const resolveAutoDelay = (subId, group, index) => {
    if (autoAlignDelays[subId] != null) return autoAlignDelays[subId];
    const canonicalId = `${group}-sub-${POSITION_LABELS[index] ?? index}`;
    if (autoAlignDelays[canonicalId] != null) return autoAlignDelays[canonicalId];
    const alternateId = `sub-${group}-${index + 1}`;
    return autoAlignDelays[alternateId] ?? 0;
  };
  const toSource = (item, group, index, cfg) => {
    const position = item?.position ?? item;
    const x = Number(position?.x);
    const y = Number(position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const id = item?.id ?? `${group}-sub-${POSITION_LABELS[index] ?? index}`;
    // Stage 1: Canonical instance calibration — NOT CFG settingsById.
    // The item comes from bassInputAdapter which carries gainDb, delay,
    // polarity, model, and enabled from the canonical subwooferInstances.
    const resolvedGroup = resolveSubGroup(id, group);
    const resolvedIndex = id?.includes("-right") || id?.includes("-2") ? 1 : index;
    const modelKey = item?.modelKey ?? item?.model ?? "SUB2-12";
    const instGainDb = Number(item?.gainDb);
    const instDelayMs = Number(item?.delay ?? item?.delayMs);
    const instPolarity = item?.polarity ?? 1;
    return {
      id,
      modelKey,
      bassCapability: resolveSubwooferBassCapability(modelKey),
      sharedAmplifierPowerW,
      x,
      y,
      z: Number.isFinite(Number(position?.z)) ? Number(position.z) : 0.35,
      tuning: {
        gainDb: Number.isFinite(instGainDb) ? instGainDb : 0,
        delayMs: (Number.isFinite(instDelayMs) ? instDelayMs : 0) + resolveAutoDelay(id, resolvedGroup, resolvedIndex),
        polarity: instPolarity === -1 ? 180 : 0,
      },
    };
  };
  return [
    ...(Array.isArray(frontSubsLive) ? frontSubsLive : []).map((item, index) => toSource(item, "front", index, frontSubsCfg)),
    ...(Array.isArray(rearSubsLive) ? rearSubsLive : []).map((item, index) => toSource(item, "rear", index, rearSubsCfg)),
  ].filter(Boolean);
}

export function simulateAuthoritativeBassResponse({ roomDims, seatingPositions, rspPosition, sources, physics, qStrategyOverride }) {
  if (!sources.length || !roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
    return { seatResponses: {}, metrics: null, audit: null, runtimeVectorCapture: { rows: [] } };
  }
  const amplifierAuthority = getSharedSubwooferAmplifierAuthority(sources);
  const seatResponses = {};
  let stepDebug = null;
  let wholeCurveDebugRows = null;
  let activeModalVectorPath = null;
  const runtimeCaptureByHz = new Map();
  const debugSeatId = "rsp";
  const debugSub = sources[0] || null;
  const listeners = [rspPosition, ...(Array.isArray(seatingPositions) ? seatingPositions : [])].filter(Boolean);
  listeners.forEach((seat) => {
    const seatId = seat.id || `${seat.x}-${seat.y}`;
    let freqsHz = null;
    let sumRe = null;
    let sumIm = null;
    sources.forEach((sub) => {
      const subCurve = getSubwooferCurve(sub.modelKey);
      if (!subCurve?.length) return;
      const rawSourceCurve = REW_SOURCE_CURVES[physics.rewSourceCurveMode] || subCurve;
      const sourceCurve = physics.rewSourceCurveMode === "product"
        ? rawSourceCurve.map((point) => {
            const spl = Number(point?.spl);
            const db = Number(point?.db);
            if (Number.isFinite(spl)) return { ...point, spl: spl + amplifierAuthority.deratingDb };
            if (Number.isFinite(db)) return { ...point, db: db + amplifierAuthority.deratingDb };
            return { ...point };
          })
        : rawSourceCurve;
      const parityFullField = physics.rewSourceCurveMode === "flat_rew_reference" && physics.rewParityFieldMode === "full_field";
      const fieldReflections = qStrategyOverride === "ab_corrected" ? true
        : parityFullField ? false
        : ["modes_only", "direct_plus_modes"].includes(physics.rewParityFieldMode) ? false
        : physics.rewParityFieldMode === "reflections_only" ? true
        : physics.enableRewCoreReflections;
      const fieldModes = parityFullField ? true : physics.rewParityFieldMode === "reflections_only" ? false : true;
      const fieldLateField = parityFullField ? true
        : ["reflections_only", "modes_only", "direct_plus_modes"].includes(physics.rewParityFieldMode) ? true
        : physics.disableLateField;
      const seatZ = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
      let modalReferenceMode = physics.modalSourceReferenceMode;
      let modalGainScalar = physics.modalGainScalar;
      if (physics.modalSourceReferenceMode === "distance_blend") {
        const blend = Math.max(0, Math.min(1, physics.modalDistanceBlend));
        if (blend >= 1) modalReferenceMode = "distance_normalized";
        else if (blend <= 0) modalReferenceMode = "existing";
        else {
          const distanceM = Math.max(0.01, Math.hypot(sub.x - seat.x, sub.y - seat.y, sub.z - seatZ));
          modalGainScalar = physics.modalGainScalar * Math.pow(10, (-20 * Math.log10(distanceM) * blend) / 20);
          modalReferenceMode = "existing";
        }
      }
      const useParityFieldSolver = false;
      const result = useParityFieldSolver
        ? simulateBassResponseRewParityField(roomDims, { x: seat.x, y: seat.y, z: seatZ }, sub, sourceCurve, {
            surfaceAbsorption: physics.surfaceAbsorption, freqMinHz: 20, freqMaxHz: 200, axialQ: physics.axialQ,
          })
        : simulateBassResponseRewCore(roomDims, { x: seat.x, y: seat.y, z: seatZ }, sub, sourceCurve, {
            enableReflections: fieldReflections,
            enableModes: fieldModes,
            surfaceAbsorption: physics.surfaceAbsorption,
            freqMinHz: 15,
            freqMaxHz: 200,
            smoothing: "none",
            modalSourceReferenceMode: modalReferenceMode,
            modalGainScalar,
            axialQ: physics.axialQ,
            modalStorageMode: physics.modalStorageMode,
            propagationPhaseScale: physics.propagationPhaseScale,
            pureDeterministicModalSum: physics.rewSourceCurveMode === "flat_rew_reference",
            disableReflectionPhaseJitter: physics.disableReflectionPhaseJitter,
            disableReflectionCoherenceWeight: physics.disableReflectionCoherenceWeight,
            disableLateField: fieldLateField,
            disableModalPropagationPhase: physics.rewSourceCurveMode === "flat_rew_reference" ? true : physics.disableModalPropagationPhase,
            debugInvertModalVector: false,
            debugModalPhaseConvention: "normal",
            mute68HzAxialMode: physics.mute68HzAxialMode,
            debugDisableModalContribution: physics.debugDisableModalContribution,
            overrideConstantAxialQ: physics.overrideConstantAxialQ,
            overrideAbsorptionAxialQ: physics.overrideAbsorptionAxialQ,
            debugMode200Multiplier: physics.debugMode200Multiplier,
            debugReflectionOrder: (physics.rewSourceCurveMode === "flat_rew_reference" || qStrategyOverride === "ab_corrected") ? 1 : 3,
            reflectionGainScale: physics.reflectionGainScale,
            debugModalHSign: "normal",
            rewParityModalMagnitudeScale: physics.rewSourceCurveMode === "flat_rew_reference" ? physics.rewParityModalMagnitudeScale : 1,
            modalCoherenceMode: physics.modalCoherenceMode,
            highOrderAxialScale: physics.highOrderAxialScale,
            qStrategy: qStrategyOverride,
            rewModalBandwidthScale: physics.rewModalBandwidthScale,
            runtimeVectorCapture: physics.runtimeVectorCapture,
          });
      if (stepDebug === null && seatId === debugSeatId && sub === debugSub && result.stepDebug?.length > 0) {
        stepDebug = result.stepDebug;
        wholeCurveDebugRows = result.wholeCurveDebugRows;
        activeModalVectorPath = result.activeModalVectorPath ?? null;
        if (wholeCurveDebugRows) {
          wholeCurveDebugRows.preModalSeries = result.preModalSeries;
          wholeCurveDebugRows.modalOnlySeries = result.modalOnlySeries;
          wholeCurveDebugRows.postModalSeries = result.postModalSeries;
        }
      }
      if (seatId === debugSeatId && Array.isArray(result.runtimeVectorCapture)) {
        result.runtimeVectorCapture.forEach((row) => {
          const existing = runtimeCaptureByHz.get(row.frequencyHz) || { frequencyHz: row.frequencyHz, subs: [] };
          existing.subs.push({ subId: sub.id, ...row });
          runtimeCaptureByHz.set(row.frequencyHz, existing);
        });
      }
      if (!freqsHz) {
        freqsHz = result.freqsHz;
        sumRe = result.complexPressure.map((value) => value.re);
        sumIm = result.complexPressure.map((value) => value.im);
      } else {
        result.complexPressure.forEach((value, index) => {
          if (Number.isFinite(value.re) && Number.isFinite(value.im)) {
            sumRe[index] += value.re;
            sumIm[index] += value.im;
          }
        });
      }
    });
    if (freqsHz && sumRe && sumIm) {
      seatResponses[seatId] = {
        freqsHz,
        splDb: sumRe.map((re, index) => 20 * Math.log10(Math.max(Math.hypot(re, sumIm[index]), 1e-10))),
        _sumRe: sumRe,
        _sumIm: sumIm,
        nulls: { count: 0, worstDb: 0, nulls: [] },
      };
    }
  });
  const runtimeRows = Array.from(runtimeCaptureByHz.values()).map((row) => {
    const response = seatResponses[debugSeatId];
    const index = response?.freqsHz?.findIndex((hz) => hz === row.frequencyHz) ?? -1;
    const finalRe = index >= 0 ? response._sumRe?.[index] : null;
    const finalIm = index >= 0 ? response._sumIm?.[index] : null;
    const sum = (key) => row.subs.reduce((total, item) => total + item[key], 0);
    const directRe = row.subs.reduce((total, item) => total + item.direct.directRe, 0);
    const directIm = row.subs.reduce((total, item) => total + item.direct.directIm, 0);
    const modalRe = sum("modalRe");
    const modalIm = sum("modalIm");
    const preModalRe = sum("preModalRe");
    const preModalIm = sum("preModalIm");
    const directPlusReflectionRe = sum("directPlusReflectionRe");
    const directPlusReflectionIm = sum("directPlusReflectionIm");
    const finalMagnitude = Math.hypot(finalRe, finalIm);
    return { ...row, directRe, directIm, modalRe, modalIm, preModalRe, preModalIm,
      preModalMagnitude: Math.hypot(preModalRe, preModalIm),
      preModalSplDb: 20 * Math.log10(Math.max(Math.hypot(preModalRe, preModalIm), 1e-10)),
      directPlusReflectionRe, directPlusReflectionIm,
      directPlusReflectionSplDb: 20 * Math.log10(Math.max(Math.hypot(directPlusReflectionRe, directPlusReflectionIm), 1e-10)),
      finalRe, finalIm, finalMagnitude,
      finalSplDb: 20 * Math.log10(Math.max(finalMagnitude, 1e-10)),
      plottedGraphValueDb: 20 * Math.log10(Math.max(finalMagnitude, 1e-10)) };
  });
  return { seatResponses, metrics: null, audit: null, stepDebug, wholeCurveDebugRows,
    activeModalVectorPath, amplifierAuthority, runtimeVectorCapture: { rows: runtimeRows } };
}

function responseCurve(response) {
  const raw = (response?.freqsHz || []).map((frequency, index) => ({
    frequency,
    spl: Number.isFinite(response?.splDb?.[index]) ? response.splDb[index] : null,
  })).filter((point) => Number.isFinite(point.frequency) && point.frequency > 0).sort((a, b) => a.frequency - b.frequency);
  return raw.filter((point, index) => !raw[index + 1] || Math.abs(point.frequency - raw[index + 1].frequency) >= 1e-9);
}

export function buildAuthoritativeResponseCurves(seatResponses) {
  return {
    rspRawCurve: responseCurve(seatResponses?.rsp),
    perSeatRawCurves: Object.entries(seatResponses || {}).filter(([seatId]) => seatId !== "rsp").map(([seatId, response]) => ({
      seatId,
      responseData: responseCurve(response).filter((point) => Number.isFinite(point.spl)),
    })).filter((seat) => seat.responseData.length > 0),
  };
}

export function useAuthoritativeBassResponse({ appState, frontSubsLive, rearSubsLive }) {
  const roomDims = appState?.roomDims;
  const seatingPositions = appState?.seatingPositions || [];
  const frontSubsCfg = appState?.frontSubsCfg;
  const rearSubsCfg = appState?.rearSubsCfg;
  const splConfig = appState?.splConfig;
  const instanceStatus = appState?.subwooferInstancesStatus ?? INSTANCE_STATUS.UNINITIALISED;
  const rspPosition = useMemo(() => buildAuthoritativeRspPosition(roomDims, appState?.mlpY_m, appState?.mlpX_m), [roomDims?.widthM, appState?.mlpY_m, appState?.mlpX_m]);

  const [autoAlignEnabled, setAutoAlignEnabled] = useState(true);
  const [roomDamping, setRoomDamping] = useState(DEFAULTS.roomDamping);
  const [surfaceAbsorptionInputs, setSurfaceAbsorptionInputs] = useState(DEFAULTS.surfaceAbsorption);
  const [enableRewCoreReflections, setEnableRewCoreReflections] = useState(DEFAULTS.enableRewCoreReflections);
  const [rewSourceCurveMode, setRewSourceCurveMode] = useState("product");
  const [modalSourceReferenceMode, setModalSourceReferenceMode] = useState(DEFAULTS.modalSourceReferenceMode);
  const [modalGainScalar, setModalGainScalar] = useState(DEFAULTS.modalGainScalar);
  const [axialQ, setAxialQ] = useState(DEFAULTS.axialQ);
  const [modalStorageMode] = useState(DEFAULTS.modalStorageMode);
  const [propagationPhaseScale, setPropagationPhaseScale] = useState(DEFAULTS.propagationPhaseScale);
  const [disableReflectionPhaseJitter] = useState(DEFAULTS.disableReflectionPhaseJitter);
  const [disableReflectionCoherenceWeight] = useState(DEFAULTS.disableReflectionCoherenceWeight);
  const [disableLateField] = useState(true);
  const [disableModalPropagationPhase] = useState(true);
  const [mute68HzAxialMode] = useState(DEFAULTS.mute68HzAxialMode);
  const [debugDisableModalContribution] = useState(DEFAULTS.debugDisableModalContribution);
  const [rewParityFieldMode, setRewParityFieldMode] = useState(DEFAULTS.rewParityFieldMode);
  const [modalDistanceBlend, setModalDistanceBlend] = useState(DEFAULTS.modalDistanceBlend);
  const [overrideConstantAxialQ] = useState(DEFAULTS.overrideConstantAxialQ);
  const [overrideAbsorptionAxialQ] = useState(DEFAULTS.overrideAbsorptionAxialQ);
  const [debugMode200Multiplier, setDebugMode200Multiplier] = useState(DEFAULTS.debugMode200Multiplier);
  const [debugModalPhaseConvention, setDebugModalPhaseConvention] = useState("normal");
  const [debugModalHSign, setDebugModalHSign] = useState("normal");
  const [reflectionGainScale, setReflectionGainScale] = useState(DEFAULTS.reflectionGainScale);
  const [rewParityModalMagnitudeScale, setRewParityModalMagnitudeScale] = useState(1);
  const [modalCoherenceMode, setModalCoherenceMode] = useState(DEFAULTS.modalCoherenceMode);
  const [highOrderAxialScale, setHighOrderAxialScale] = useState(DEFAULTS.highOrderAxialScale);
  const [qStrategy, setQStrategy] = useState(DEFAULTS.qStrategy);
  const [rewModalBandwidthScale, setRewModalBandwidthScale] = useState(DEFAULTS.rewModalBandwidthScale);
  const [bassSmoothingMode, setBassSmoothingMode] = useState("none");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const designEqEnabledRef = useRef(appState?.designEqEnabled);
  designEqEnabledRef.current = appState?.designEqEnabled;

  const surfaceAbsorption = useMemo(() => ({
    front: clampAbsorption(surfaceAbsorptionInputs.front), back: clampAbsorption(surfaceAbsorptionInputs.back),
    left: clampAbsorption(surfaceAbsorptionInputs.left), right: clampAbsorption(surfaceAbsorptionInputs.right),
    ceiling: clampAbsorption(surfaceAbsorptionInputs.ceiling), floor: clampAbsorption(surfaceAbsorptionInputs.floor),
  }), [surfaceAbsorptionInputs]);
  const autoAlignDelays = useMemo(() => buildAuthoritativeAutoAlignDelays({
    enabled: autoAlignEnabled, rspPosition, frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg,
  }), [autoAlignEnabled, rspPosition, frontSubsLive, rearSubsLive, frontSubsCfg?.count, frontSubsCfg?.positions, rearSubsCfg?.count, rearSubsCfg?.positions]);
  // ERROR GATE: When instance status is ERROR or UNINITIALISED, produce zero sources.
  // This blocks all downstream analysis: no worker jobs, no fingerprints, no cache.
  const analysisBlocked = instanceStatus === INSTANCE_STATUS.ERROR || instanceStatus === INSTANCE_STATUS.UNINITIALISED;
  const sharedSubAmplifierPowerW = Number.isFinite(Number(splConfig?.subwooferAmplifierPowerW))
    ? Number(splConfig.subwooferAmplifierPowerW)
    : DEFAULT_SHARED_SUB_AMPLIFIER_POWER_W;
  const sources = useMemo(() => {
    if (analysisBlocked) return [];
    return buildAuthoritativeBassSources({
      frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg, autoAlignDelays,
      sharedAmplifierPowerW: sharedSubAmplifierPowerW,
    });
  }, [frontSubsLive, rearSubsLive, autoAlignDelays, sharedSubAmplifierPowerW, analysisBlocked]);
  const physics = useMemo(() => ({
    surfaceAbsorption, roomDamping, enableRewCoreReflections, rewSourceCurveMode, modalSourceReferenceMode,
    modalGainScalar, axialQ, modalStorageMode, propagationPhaseScale, disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight, disableLateField, disableModalPropagationPhase, mute68HzAxialMode,
    debugDisableModalContribution, rewParityFieldMode, modalDistanceBlend, overrideConstantAxialQ,
    overrideAbsorptionAxialQ, debugMode200Multiplier, debugModalPhaseConvention, debugModalHSign,
    reflectionGainScale, rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale,
    rewModalBandwidthScale, runtimeVectorCapture: !designEqEnabledRef.current && bassSmoothingMode === "none",
  }), [surfaceAbsorption, roomDamping, enableRewCoreReflections, rewSourceCurveMode, modalSourceReferenceMode,
    modalGainScalar, axialQ, modalStorageMode, propagationPhaseScale, disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight, disableLateField, disableModalPropagationPhase, mute68HzAxialMode,
    debugDisableModalContribution, rewParityFieldMode, modalDistanceBlend, overrideConstantAxialQ,
    overrideAbsorptionAxialQ, debugMode200Multiplier, debugModalPhaseConvention, debugModalHSign,
    reflectionGainScale, rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale,
    rewModalBandwidthScale, bassSmoothingMode]);
  const runSimulation = useCallback((strategy = qStrategy) => {
    if (analysisBlocked) return { seatResponses: {}, metrics: null, audit: null, runtimeVectorCapture: { rows: [] } };
    return simulateAuthoritativeBassResponse({
      roomDims, seatingPositions, rspPosition, sources, physics, qStrategyOverride: strategy,
    });
  }, [roomDims, seatingPositions, rspPosition, sources, physics, qStrategy, analysisBlocked]);
  const simulationResults = useMemo(() => {
    if (analysisBlocked) return { seatResponses: {}, metrics: null, audit: null, runtimeVectorCapture: { rows: [] } };
    return runSimulation(qStrategy);
  }, [runSimulation, qStrategy, analysisBlocked]);
  const { rspRawCurve, perSeatRawCurves } = useMemo(() => {
    if (!simulationResults) return { rspRawCurve: [], perSeatRawCurves: [] };
    return buildAuthoritativeResponseCurves(simulationResults.seatResponses);
  }, [simulationResults]);
  const designEqSystemLimits = useMemo(() => {
    const usable = sources.map((sub) => MODELS.find((model) => model.key === normaliseModelKey(sub.modelKey))?.approvedUsableLfHzMinus6dB).filter(Number.isFinite);
    return {
      activeSubs: sources,
      usableLfHz: usable.length ? Math.max(...usable) : null,
      amplifierAuthority: getSharedSubwooferAmplifierAuthority(sources, sharedSubAmplifierPowerW),
    };
  }, [sources, sharedSubAmplifierPowerW]);
  const optimisationTransitionHz = useMemo(() => {
    const volume = Number(roomDims?.widthM) * Number(roomDims?.lengthM) * Number(roomDims?.heightM);
    return volume > 0 ? 2000 * Math.sqrt(0.4 / volume) : 120;
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);
  const requested = useMemo(() => deriveRequestedCalibrationConfig({ splConfig, optimisationTransitionHz, designEqSystemLimits }), [splConfig, optimisationTransitionHz, designEqSystemLimits]);
  const p14TargetBasis = requested.p14TargetBasis;
  const productCapabilities = useMemo(() => sources.map((sub) => {
    const model = MODELS.find((item) => item.key === normaliseModelKey(sub.modelKey));
    return model ? { modelKey: model.key, bassCapability: model.bassCapability ?? null, response: model.frequency_response_curve, usableLfHz: model.approvedUsableLfHzMinus6dB, continuousSplDb: model.approvedContinuousSplAt1mDb, continuousSpl30HzDb: model.approvedContinuousSplAt30HzDb, peakSplDb: model.approvedPeakSplDb, maxPowerW: model.max_power, sharedAmplifierPowerW: sharedSubAmplifierPowerW } : { modelKey: sub.modelKey, sharedAmplifierPowerW: sharedSubAmplifierPowerW };
  }), [sources, sharedSubAmplifierPowerW]);
  const fingerprintInputs = useMemo(() => ({
    roomDims, sources, rspPosition, seatingPositions, surfaceAbsorption, roomDamping, axialQ,
    modalSourceReferenceMode, modalGainScalar, modalDistanceBlend, modalStorageMode, propagationPhaseScale,
    enableRewCoreReflections, rewSourceCurveMode, qStrategy, rewModalBandwidthScale,
    disableReflectionPhaseJitter, disableReflectionCoherenceWeight, disableLateField,
    disableModalPropagationPhase, mute68HzAxialMode, debugDisableModalContribution, rewParityFieldMode,
    overrideConstantAxialQ, overrideAbsorptionAxialQ, debugMode200Multiplier, debugModalPhaseConvention,
    reflectionGainScale, debugModalHSign, rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale,
    splConfig, optimisationTransitionHz,
    houseCurveFingerprint: computeHouseCurveFingerprint(ARTCOUSTIC_HOUSE_CURVE),
    assessmentStartHz: 20, assessmentEndHz: 200,
    activeFitProfile: null,
    usableLfHz: designEqSystemLimits.usableLfHz, evaluatedProfiles: requested.evaluatedProfiles,
    productDataVersion: 4, productCapabilities,
    selectedP14TargetDb: requested.selectedP14TargetDb,
    p14TargetBasis: requested.p14TargetBasis,
    p14TargetLevel: requested.requestedLevel,
    selectedP14RequiredExtensionHz: requested.selectedP14RequiredExtensionHz,
  }), [roomDims, sources, rspPosition, seatingPositions, surfaceAbsorption, roomDamping, axialQ,
    modalSourceReferenceMode, modalGainScalar, modalDistanceBlend, modalStorageMode, propagationPhaseScale,
    enableRewCoreReflections, rewSourceCurveMode, qStrategy, rewModalBandwidthScale,
    disableReflectionPhaseJitter, disableReflectionCoherenceWeight, disableLateField,
    disableModalPropagationPhase, mute68HzAxialMode, debugDisableModalContribution, rewParityFieldMode,
    overrideConstantAxialQ, overrideAbsorptionAxialQ, debugMode200Multiplier, debugModalPhaseConvention,
    reflectionGainScale, debugModalHSign, rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale,
    splConfig, optimisationTransitionHz, requested, productCapabilities]);
  const fingerprints = useMemo(() => {
    if (analysisBlocked) return null;
    return {
      geometry: computeGeometryFingerprint(fingerprintInputs),
      product: computeProductFingerprint(fingerprintInputs),
      calibration: computeCalibrationFingerprint(fingerprintInputs),
    };
  }, [fingerprintInputs, analysisBlocked]);
  const payload = useMemo(() => ({ rawCurve: rspRawCurve, activeSubs: sources, usableLfHz: designEqSystemLimits.usableLfHz, transitionHz: optimisationTransitionHz, correctionEndHz: 200, perSeatRawCurves, selectedP14TargetDb: requested.selectedP14TargetDb, p14TargetBasis: requested.p14TargetBasis, p14TargetLevel: requested.requestedLevel }), [rspRawCurve, sources, designEqSystemLimits.usableLfHz, optimisationTransitionHz, perSeatRawCurves, requested.selectedP14TargetDb, requested.p14TargetBasis, requested.requestedLevel]);
  const inputsValid = !!rspPosition && seatingPositions.length > 0 && rspRawCurve.length > 0 && sources.length > 0 && [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM].every((value) => Number(value) > 0);
  const blockedReason = analysisBlocked
    ? (instanceStatus === INSTANCE_STATUS.ERROR ? "subwoofer_instance_error" : "subwoofer_instances_uninitialised")
    : null;

  return {
    status: analysisBlocked ? "blocked" : "ready",
    reason: blockedReason,
    exportable: !analysisBlocked && inputsValid,
    roomDims, seatingPositions, splConfig, rspPosition, sources, subsForSimulation: sources, simulationResults,
    frontSubsLive, rearSubsLive,
    rspRawCurve, perSeatRawCurves, designEqSystemLimits, optimisationTransitionHz, requested,
    fingerprintInputs, fingerprints, payload, inputsValid, physics, runSimulation,
    autoAlignEnabled, setAutoAlignEnabled, autoAlignDelays, roomDamping, setRoomDamping,
    surfaceAbsorptionInputs, setSurfaceAbsorptionInputs, surfaceAbsorption,
    enableRewCoreReflections, setEnableRewCoreReflections, rewSourceCurveMode, setRewSourceCurveMode,
    modalSourceReferenceMode, setModalSourceReferenceMode, modalGainScalar, setModalGainScalar,
    axialQ, setAxialQ, modalStorageMode, propagationPhaseScale, setPropagationPhaseScale,
    disableReflectionPhaseJitter, disableReflectionCoherenceWeight, disableLateField,
    disableModalPropagationPhase, mute68HzAxialMode, debugDisableModalContribution,
    rewParityFieldMode, setRewParityFieldMode, modalDistanceBlend, setModalDistanceBlend,
    overrideConstantAxialQ, overrideAbsorptionAxialQ, debugMode200Multiplier, setDebugMode200Multiplier,
    debugModalPhaseConvention, setDebugModalPhaseConvention, debugModalHSign, setDebugModalHSign,
    reflectionGainScale, setReflectionGainScale, rewParityModalMagnitudeScale, setRewParityModalMagnitudeScale,
    modalCoherenceMode, setModalCoherenceMode, highOrderAxialScale, setHighOrderAxialScale,
    qStrategy, setQStrategy, rewModalBandwidthScale, setRewModalBandwidthScale,
    bassSmoothingMode, setBassSmoothingMode, includeDiagnostics, setIncludeDiagnostics,
  };
}