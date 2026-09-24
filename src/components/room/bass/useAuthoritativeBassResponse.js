import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";
import { resolveSubwooferBassCapability } from "@/components/utils/speakerModelResolver";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS as DEFAULTS } from "./bassPhysicsDefaults";
import { deriveRequestedCalibrationConfig } from "./requestedCalibrationConfig";
import { simulateAuthoritativeBassResponse } from "./authoritativeBassResponseEngine";
export { simulateAuthoritativeBassResponse } from "./authoritativeBassResponseEngine";
import { ARTCOUSTIC_HOUSE_CURVE } from "@/components/utils/artcousticHouseCurve";
import { computeCalibrationFingerprint, computeGeometryFingerprint, computeHouseCurveFingerprint, computeProductFingerprint } from "./bassAnalysisFingerprints";
import { getCachedRoomPhysics, setCachedRoomPhysics } from "./roomPhysicsCache";
import { INSTANCE_STATUS } from "@/components/utils/subwooferInstanceCompatibility";
import {
  DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
  getPerSubwooferAmplifierAuthority,
} from "@/components/utils/subwooferCapability";
import { buildAuthoritativeRspPosition } from "./authoritativeRspPosition";
import { buildCanonicalRoomResponse, canonicalRoomResponseCurve as extractRoomResponseCurve } from "./buildCanonicalRoomResponse";

// ── INSTRUMENTATION (diagnostic only — no behaviour change) ──────────────
let __authWorkerIdCounter = 0;
const __authObjIdMap = new WeakMap();
let __authObjIdCounter = 0;
function __getObjId(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object" && typeof obj !== "function") return String(obj);
  let id = __authObjIdMap.get(obj);
  if (id === undefined) { id = ++__authObjIdCounter; __authObjIdMap.set(obj, id); }
  return `obj#${id}`;
}
if (typeof window !== "undefined") {
  window.__BASS_WORKER_DIAG__ = window.__BASS_WORKER_DIAG__ || {
    activeWorkerId: null,
    calculationPhase: null,
    calibrationFingerprint: null,
    simulationFingerprint: null,
  };
}
const __WORKER_TAG = "color: #4ecdc4; font-weight: bold; font-size: 13px;";
const __WORKER_TERM_TAG = "color: #ff6b6b; font-weight: bold; font-size: 13px;";
// ── END INSTRUMENTATION ──────────────────────────────────────────────────

const POSITION_LABELS = ["left", "right"];
const EMPTY_SIMULATION_RESULT = Object.freeze({
  seatResponses: Object.freeze({}),
  metrics: null,
  audit: null,
  runtimeVectorCapture: Object.freeze({ rows: Object.freeze([]) }),
});
const clampAbsorption = (value) => Math.max(0, Math.min(0.95, Number(value) || 0.30));

// buildAuthoritativeRspPosition is extracted to authoritativeRspPosition.js
// (pure, bare-Node importable) so cold-hydration regression tests can call it
// without pulling in @/-aliased modules. Re-exported here for existing
// importers; the imported binding is also used by the hook below.
export { buildAuthoritativeRspPosition };

function resolveSubGroup(subId, fallbackGroup) {
  if (fallbackGroup) return fallbackGroup;
  return subId?.includes("front") || subId?.includes("sub-front") ? "front" : "rear";
}

export function buildAuthoritativeAutoAlignDelays({ enabled, rspPosition, frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg }) {
  if (!enabled || !rspPosition) return {};
  // Ordinary records retain manual + automatic alignment semantics. V2
  // records carry absolute effective delay; suppress only their contribution.
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
      const manualDelayMsRaw = Number(liveEntry?.delay ?? liveEntry?.delayMs);
      const manualDelayMs = Number.isFinite(manualDelayMsRaw) ? manualDelayMsRaw : 0;
      arrivals.push({
        subId: liveEntry?.id ?? `${group}-sub-${POSITION_LABELS[index] ?? index}`,
        effectiveTuning: liveEntry?.tuningSource === "v2-optimised",
        // Align the effective arrival, including any stored/manual delay.
        // The auto-delay is later added to this same manual value.
        arrivalMs: (Math.hypot(x - rspPosition.x, y - rspPosition.y, z - rspPosition.z) / 343 * 1000) + manualDelayMs,
      });
    }
  };
  processGroup(frontSubsCfg, frontSubsLive, "front");
  processGroup(rearSubsCfg, rearSubsLive, "rear");
  if (!arrivals.length) return {};
  const latest = Math.max(...arrivals.map((item) => item.arrivalMs));
  return Object.fromEntries(arrivals.filter((item) => !item.effectiveTuning)
    .map((item) => [item.subId, Math.max(0, latest - item.arrivalMs)]));
}

export function buildAuthoritativeBassSources({
  frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg, autoAlignDelays,
  amplifierPowerPerSubW = DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
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
    const instPhaseControlDeg = Number(item?.phaseControlDeg ?? item?.phaseAdjust);
    return {
      id,
      modelKey,
      bassCapability: resolveSubwooferBassCapability(modelKey),
      subwooferAmplifierPowerW: amplifierPowerPerSubW,
      x,
      y,
      z: Number.isFinite(Number(position?.z)) ? Number(position.z) : 0.35,
      tuning: {
        gainDb: Number.isFinite(instGainDb) ? instGainDb : 0,
        delayMs: (Number.isFinite(instDelayMs) ? instDelayMs : 0) + (item?.tuningSource === "v2-optimised" ? 0 : resolveAutoDelay(id, resolvedGroup, resolvedIndex)),
        polarity: instPolarity === -1 || Number(instPolarity) === 180 ? 180 : 0,
        phaseControlDeg: Number.isFinite(instPhaseControlDeg)
          ? Math.max(0, Math.min(175, instPhaseControlDeg))
          : 0,
      },
    };
  };
  return [
    ...(Array.isArray(frontSubsLive) ? frontSubsLive : []).map((item, index) => toSource(item, "front", index, frontSubsCfg)),
    ...(Array.isArray(rearSubsLive) ? rearSubsLive : []).map((item, index) => toSource(item, "rear", index, rearSubsCfg)),
  ].filter(Boolean);
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

export function useAuthoritativeBassResponse({ appState, frontSubsLive, rearSubsLive, analysisRequestId = null, analysisRequestFingerprint = null }) {
  const roomDims = appState?.roomDims;
  const seatingPositions = appState?.seatingPositions || [];
  const frontSubsCfg = appState?.frontSubsCfg;
  const rearSubsCfg = appState?.rearSubsCfg;
  const splConfig = appState?.splConfig;
  const instanceStatus = appState?.subwooferInstancesStatus ?? INSTANCE_STATUS.UNINITIALISED;
  const designatedRspSeatId = appState?.designatedRspSeatId ?? null;
  const designatedRspSeat = useMemo(() => {
    if (!designatedRspSeatId) return null;
    const seat = (Array.isArray(seatingPositions) ? seatingPositions : []).find((s) => s?.id === designatedRspSeatId);
    if (!seat) return null;
    const x = Number(seat.x);
    const y = Number(seat.y);
    const z = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { id: seat.id, x, y, z };
  }, [designatedRspSeatId, seatingPositions]);
  const rspPosition = useMemo(() => buildAuthoritativeRspPosition(roomDims, appState?.mlpY_m, appState?.mlpX_m, designatedRspSeat), [roomDims?.widthM, appState?.mlpY_m, appState?.mlpX_m, designatedRspSeat]);

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
  // Default to 1/3-octave so the graph visually matches the canonical P19/P20
  // assessment (which uses applyBassSmoothing(..., "third")). "None" remains
  // available as raw diagnostic detail via the graph smoothing control.
  const [bassSmoothingMode, setBassSmoothingMode] = useState("third");
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
  const amplifierPowerPerSubW = Number.isFinite(Number(splConfig?.subwooferAmplifierPowerW))
    ? Number(splConfig.subwooferAmplifierPowerW)
    : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;
  const sources = useMemo(() => {
    if (analysisBlocked) return [];
    return buildAuthoritativeBassSources({
      frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg, autoAlignDelays,
      amplifierPowerPerSubW,
    });
  }, [frontSubsLive, rearSubsLive, autoAlignDelays, amplifierPowerPerSubW, analysisBlocked]);
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
  const simulationRequest = useMemo(() => ({
    roomDims, seatingPositions, rspPosition, sources, physics, qStrategyOverride: qStrategy,
  }), [roomDims, seatingPositions, rspPosition, sources, physics, qStrategy]);
  const simulationGenerationRef = useRef(0);
  const [simulationState, setSimulationState] = useState({
    request: null,
    status: "idle",
    result: null,
    error: null,
  });

  // ── INSTRUMENTATION: track current deps for cleanup reason detection ────
  const __currentDepsRef = useRef(null);
  __currentDepsRef.current = {
    analysisBlocked, simulationRequest, runSimulation, qStrategy,
    analysisRequestId, analysisRequestFingerprint,
    frontSubsLive, rearSubsLive,
    appStateSubwoofers: appState?.subwoofers,
  };
  // ── END INSTRUMENTATION ────────────────────────────────────────────────

  useEffect(() => {
    const generation = simulationGenerationRef.current + 1;
    simulationGenerationRef.current = generation;

    if (analysisBlocked) {
      setSimulationState({ request: simulationRequest, status: "blocked", result: null, error: null });
      return undefined;
    }

    // Manual-authority gate: raw authoritative room simulation may start only
    // for an explicit request whose submitted GEOMETRY fingerprint is still
    // the live geometry fingerprint. Design-objective changes (P14/P18) do
    // NOT invalidate room physics — only geometry changes do. The gate uses
    // the geometry fingerprint so that a P14-only change reuses the cached
    // room response and only re-runs the optimiser.
    if (!analysisRequestId || !analysisRequestFingerprint || analysisRequestFingerprint !== fingerprints?.geometry) {
      setSimulationState({ request: null, status: "idle", result: null, error: null });
      return undefined;
    }

    // Room-physics cache: if a result for the current geometry fingerprint
    // already exists (e.g. from a previous calculation before a P14-only
    // change), reuse it immediately without starting a new worker. Room
    // physics is geometry-dependent only — the flat 94 dB source means
    // the transfer functions and seat responses are model-independent.
    const geometryFingerprint = fingerprints?.geometry;
    let cancelled = false;
    const finish = (nextState) => {
      if (!cancelled && simulationGenerationRef.current === generation) {
        setSimulationState({ request: simulationRequest, ...nextState });
      }
    };
    const cachedRoomPhysics = geometryFingerprint ? getCachedRoomPhysics(geometryFingerprint) : null;
    if (cachedRoomPhysics) {
      finish({ status: "complete", result: cachedRoomPhysics, error: null });
      return () => { cancelled = true; };
    }

    setSimulationState({ request: simulationRequest, status: "calculating", result: null, error: null });

    if (typeof Worker === "undefined") {
      const timer = setTimeout(() => {
        try {
          const result = runSimulation(qStrategy);
          if (geometryFingerprint && result) setCachedRoomPhysics(geometryFingerprint, result);
          finish({ status: "complete", result, error: null });
        } catch (error) {
          finish({ status: "error", result: null, error: error?.message || String(error) });
        }
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    const worker = new Worker(
      new URL("./authoritativeBassResponse.worker.js", import.meta.url),
      { type: "module" },
    );

    // ── INSTRUMENTATION: Worker CREATED ───────────────────────────────────
    const workerId = ++__authWorkerIdCounter;
    const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;
    if (isDev) {
      console.log(`%c[AuthWorker] Worker #${workerId} CREATED`, __WORKER_TAG);
      console.log(`  timestamp: ${new Date().toISOString()}`);
      console.log(`  analysisRequestId: ${analysisRequestId}`);
      console.log(`  analysisRequestFingerprint: ${analysisRequestFingerprint}`);
      console.log(`  calibrationFingerprint: ${fingerprints?.calibration ?? "—"}`);
      console.log(`  simulationRequest: ${__getObjId(simulationRequest)}`);
      console.log(`  sources: ${__getObjId(sources)}`);
      console.log(`  frontSubsLive: ${__getObjId(frontSubsLive)}`);
      console.log(`  rearSubsLive: ${__getObjId(rearSubsLive)}`);
      console.log(`  appState.subwoofers: ${__getObjId(appState?.subwoofers)}`);
      console.log(`  runSimulation: ${__getObjId(runSimulation)}`);
      console.log(`  qStrategy: ${qStrategy}`);
      if (typeof window !== "undefined" && window.__BASS_WORKER_DIAG__) {
        window.__BASS_WORKER_DIAG__.activeWorkerId = workerId;
        window.__BASS_WORKER_DIAG__.calculationPhase = "preparing";
        window.__BASS_WORKER_DIAG__.calibrationFingerprint = fingerprints?.calibration ?? null;
        window.__BASS_WORKER_DIAG__.simulationFingerprint = fingerprints?.calibration ?? null;
      }
    }
    // ── END INSTRUMENTATION ──────────────────────────────────────────────

    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.generation !== generation) return;
      if (message.type === "complete") {
        // Store the room-physics result in the geometry-keyed cache so that
        // a subsequent P14-only change reuses it without re-running the
        // modal engine. Room physics is geometry-dependent only.
        if (geometryFingerprint && message.result) {
          setCachedRoomPhysics(geometryFingerprint, message.result);
        }
        finish({ status: "complete", result: message.result, error: null });
      } else {
        finish({ status: "error", result: null, error: message.error || "Authoritative bass simulation failed" });
      }
      worker.terminate();
    };
    worker.onerror = (event) => {
      finish({ status: "error", result: null, error: event?.message || "Authoritative bass worker failed" });
      worker.terminate();
    };
    worker.postMessage({ generation, payload: simulationRequest });

    return () => {
      cancelled = true;
      worker.terminate();

      // ── INSTRUMENTATION: Worker TERMINATED with reason ─────────────────
      if (isDev) {
        const oldDeps = {
          analysisBlocked, simulationRequest, runSimulation, qStrategy,
          analysisRequestId, analysisRequestFingerprint,
          frontSubsLive, rearSubsLive,
          appStateSubwoofers: appState?.subwoofers,
        };
        const newDeps = __currentDepsRef.current || {};
        const changedDeps = [];
        if (oldDeps.analysisBlocked !== newDeps.analysisBlocked) changedDeps.push("analysisBlocked");
        if (oldDeps.simulationRequest !== newDeps.simulationRequest) changedDeps.push(`simulationRequest (${__getObjId(oldDeps.simulationRequest)} → ${__getObjId(newDeps.simulationRequest)})`);
        if (oldDeps.runSimulation !== newDeps.runSimulation) changedDeps.push(`runSimulation (${__getObjId(oldDeps.runSimulation)} → ${__getObjId(newDeps.runSimulation)})`);
        if (oldDeps.qStrategy !== newDeps.qStrategy) changedDeps.push(`qStrategy (${oldDeps.qStrategy} → ${newDeps.qStrategy})`);
        if (oldDeps.analysisRequestId !== newDeps.analysisRequestId) changedDeps.push(`analysisRequestId (${oldDeps.analysisRequestId} → ${newDeps.analysisRequestId})`);
        if (oldDeps.analysisRequestFingerprint !== newDeps.analysisRequestFingerprint) changedDeps.push(`analysisRequestFingerprint (${oldDeps.analysisRequestFingerprint} → ${newDeps.analysisRequestFingerprint})`);
        if (oldDeps.frontSubsLive !== newDeps.frontSubsLive) changedDeps.push(`frontSubsLive (${__getObjId(oldDeps.frontSubsLive)} → ${__getObjId(newDeps.frontSubsLive)})`);
        if (oldDeps.rearSubsLive !== newDeps.rearSubsLive) changedDeps.push(`rearSubsLive (${__getObjId(oldDeps.rearSubsLive)} → ${__getObjId(newDeps.rearSubsLive)})`);
        if (oldDeps.appStateSubwoofers !== newDeps.appStateSubwoofers) changedDeps.push(`appState.subwoofers (${__getObjId(oldDeps.appStateSubwoofers)} → ${__getObjId(newDeps.appStateSubwoofers)})`);

        let reason;
        if (changedDeps.length === 0) {
          reason = "component unmounted";
        } else if (newDeps.analysisRequestId === null || newDeps.analysisRequestId === undefined) {
          reason = "analysis cancelled";
        } else if (newDeps.analysisRequestFingerprint !== oldDeps.analysisRequestFingerprint) {
          reason = "fingerprint mismatch";
        } else {
          reason = "dependency changed";
        }

        console.log(`%c[AuthWorker] Worker #${workerId} TERMINATED`, __WORKER_TERM_TAG);
        console.log(`  Reason: ${reason}`);
        if (changedDeps.length > 0) {
          console.log(`  Changed dependencies:`);
          changedDeps.forEach((d) => console.log(`    • ${d}`));
        }
        if (typeof window !== "undefined" && window.__BASS_WORKER_DIAG__ && window.__BASS_WORKER_DIAG__.activeWorkerId === workerId) {
          window.__BASS_WORKER_DIAG__.activeWorkerId = null;
          window.__BASS_WORKER_DIAG__.calculationPhase = null;
        }
      }
      // ── END INSTRUMENTATION ──────────────────────────────────────────────
    };
  }, [analysisBlocked, simulationRequest, runSimulation, qStrategy, analysisRequestId, analysisRequestFingerprint]);
  const simulationReady = simulationState.request === simulationRequest
    && simulationState.status === "complete"
    && !!simulationState.result;
  const simulationResults = simulationReady ? simulationState.result : EMPTY_SIMULATION_RESULT;
  // PASS 2: perSourceRspComplexTransfers now come from the authoritative
  // simulation itself (flat-source RSP transfers, same mode bank). No
  // separate normalized full simulation is required on the manual path.
  const perSourceRspComplexTransfers = useMemo(
    () => Array.isArray(simulationResults?.perSourceRspComplexTransfers)
      ? simulationResults.perSourceRspComplexTransfers
      : [],
    [simulationResults],
  );
  // Stage 1: Build the canonical unsmoothed flat-reference Room Response
  // from the already-calculated perSourceRspComplexTransfers. Zero acoustic
  // cost — combination only (~1 ms). This is the same 360-point, 15–200 Hz
  // curve the legacy normalized engine produced, built from the same
  // flat-source transfers the authoritative engine already computes.
  const canonicalRoomResponseResult = useMemo(
    () => buildCanonicalRoomResponse(perSourceRspComplexTransfers),
    [perSourceRspComplexTransfers],
  );
  const canonicalRoomResponseCurve = useMemo(
    () => extractRoomResponseCurve(canonicalRoomResponseResult),
    [canonicalRoomResponseResult],
  );
  const { rspRawCurve, perSeatRawCurves } = useMemo(() => {
    if (!simulationResults) return { rspRawCurve: [], perSeatRawCurves: [] };
    return buildAuthoritativeResponseCurves(simulationResults.seatResponses);
  }, [simulationResults]);
  const designEqSystemLimits = useMemo(() => {
    const usable = sources.map((sub) => MODELS.find((model) => model.key === normaliseModelKey(sub.modelKey))?.approvedUsableLfHzMinus6dB).filter(Number.isFinite);
    return {
      activeSubs: sources,
      usableLfHz: usable.length ? Math.max(...usable) : null,
      amplifierAuthority: getPerSubwooferAmplifierAuthority(sources, amplifierPowerPerSubW),
    };
  }, [sources, amplifierPowerPerSubW]);
  const optimisationTransitionHz = useMemo(() => {
    const volume = Number(roomDims?.widthM) * Number(roomDims?.lengthM) * Number(roomDims?.heightM);
    return volume > 0 ? 2000 * Math.sqrt(0.4 / volume) : 120;
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);
  const requested = useMemo(() => deriveRequestedCalibrationConfig({ splConfig, optimisationTransitionHz, designEqSystemLimits }), [splConfig, optimisationTransitionHz, designEqSystemLimits]);
  const p14TargetBasis = requested.p14TargetBasis;
  const productCapabilities = useMemo(() => sources.map((sub) => {
    const model = MODELS.find((item) => item.key === normaliseModelKey(sub.modelKey));
    return model ? { modelKey: model.key, bassCapability: model.bassCapability ?? null, response: model.frequency_response_curve, usableLfHz: model.approvedUsableLfHzMinus6dB, continuousSplDb: model.approvedContinuousSplAt1mDb, continuousSpl30HzDb: model.approvedContinuousSplAt30HzDb, peakSplDb: model.approvedPeakSplDb, maxPowerW: model.max_power, amplifierPowerPerSubW } : { modelKey: sub.modelKey, amplifierPowerPerSubW };
  }), [sources, amplifierPowerPerSubW]);
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
    productDataVersion: 5, productCapabilities,
    selectedP14TargetDb: requested.selectedP14TargetDb,
    p14TargetBasis: requested.p14TargetBasis,
    p14TargetLevel: requested.requestedLevel,
    selectedP14RequiredExtensionHz: requested.selectedP14RequiredExtensionHz,
    p18TargetBasis: requested.p18TargetBasis,
    selectedP18RequiredExtensionHz: requested.selectedP18RequiredExtensionHz,
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
  const payload = useMemo(() => ({ rawCurve: rspRawCurve, activeSubs: sources, usableLfHz: designEqSystemLimits.usableLfHz, transitionHz: optimisationTransitionHz, correctionEndHz: 200, perSeatRawCurves, selectedP14TargetDb: requested.selectedP14TargetDb, p14TargetBasis: requested.p14TargetBasis, p14TargetLevel: requested.requestedLevel, p18TargetBasis: requested.p18TargetBasis, selectedP18RequiredExtensionHz: requested.selectedP18RequiredExtensionHz }), [rspRawCurve, sources, designEqSystemLimits.usableLfHz, optimisationTransitionHz, perSeatRawCurves, requested.selectedP14TargetDb, requested.p14TargetBasis, requested.requestedLevel, requested.p18TargetBasis, requested.selectedP18RequiredExtensionHz]);
  const inputsValid = !!rspPosition && seatingPositions.length > 0 && rspRawCurve.length > 0 && sources.length > 0 && [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM].every((value) => Number(value) > 0);
  const blockedReason = analysisBlocked
    ? (instanceStatus === INSTANCE_STATUS.ERROR ? "subwoofer_instance_error" : "subwoofer_instances_uninitialised")
    : simulationState.request === simulationRequest && simulationState.status === "error"
      ? simulationState.error || "authoritative_simulation_error"
      : null;
  const responseStatus = analysisBlocked
    ? "blocked"
    : blockedReason ? "error"
      : !analysisRequestId || analysisRequestFingerprint !== fingerprints?.geometry
        ? "idle"
        : simulationReady ? "ready" : "calculating";

  return {
    status: responseStatus,
    reason: blockedReason,
    exportable: !analysisBlocked && inputsValid,
    roomDims, seatingPositions, splConfig, rspPosition, sources, subsForSimulation: sources, simulationResults,
    frontSubsLive, rearSubsLive,
    rspRawCurve, perSeatRawCurves, perSourceRspComplexTransfers,
    canonicalRoomResponseCurve,
    designEqSystemLimits, optimisationTransitionHz, requested,
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