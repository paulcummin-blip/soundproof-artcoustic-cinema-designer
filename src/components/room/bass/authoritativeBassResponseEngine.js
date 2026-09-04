import { simulateBassResponseRewCore, simulateBassResponseRewParityField, prepareModeBank } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import { REW_SOURCE_CURVES } from "./rewSourceCurves";
import { getPerSubwooferAmplifierAuthority } from "@/components/utils/subwooferCapability";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";

// Flat 94 dB source used for per-source RSP complex transfers (paired P14/P18
// capability logic). The downstream consumer divides by 10^(94/20) to get a
// dimensionless room transfer, then multiplies by the product capability
// curve. This MUST use the flat source — NOT the product curve — so the
// product shaping is applied exactly once by the downstream consumer.
const FLAT_SOURCE_CURVE = REW_SOURCE_CURVES.flat_rew_reference;
const REFERENCE_SOURCE_DB = 94;
const REFERENCE_SOURCE_AMPLITUDE = Math.pow(10, REFERENCE_SOURCE_DB / 20);

export function simulateAuthoritativeBassResponse({ roomDims, seatingPositions, rspPosition, sources, physics, qStrategyOverride }) {
  if (!sources.length || !roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
    return { seatResponses: {}, metrics: null, audit: null, runtimeVectorCapture: { rows: [] }, perSourceRspComplexTransfers: [] };
  }
  const amplifierAuthority = getPerSubwooferAmplifierAuthority(sources);
  const seatResponses = {};
  let stepDebug = null;
  let wholeCurveDebugRows = null;
  let activeModalVectorPath = null;
  const runtimeCaptureByHz = new Map();
  const debugSeatId = "rsp";
  const debugSub = sources[0] || null;
  const listeners = [rspPosition, ...(Array.isArray(seatingPositions) ? seatingPositions : [])].filter(Boolean);

  // PASS 2 — Mode-bank reuse: prepare the room mode bank once per request.
  // The mode bank depends only on room dimensions, absorption, Q strategy and
  // frequency range — never on the source or listener position. Reusing it
  // across all N×M simulations eliminates redundant mode computation with
  // zero acoustic delta (validated: complex-response numerical delta = 0).
  const engineOptionsBase = {
    surfaceAbsorption: physics.surfaceAbsorption,
    freqMinHz: 15,
    freqMaxHz: 200,
    smoothing: "none",
    axialQ: physics.axialQ,
    qStrategy: qStrategyOverride,
    rewModalBandwidthScale: physics.rewModalBandwidthScale,
    enableRewCoreReflections: physics.enableRewCoreReflections,
    rewParityFieldMode: physics.rewParityFieldMode,
    abApplyModeMultiplicity: qStrategyOverride === "ab_corrected",
    roomIsSealed: qStrategyOverride === "ab_corrected",
    abMidbandQScale: 1,
    overrideConstantAxialQ: physics.overrideConstantAxialQ,
    overrideAbsorptionAxialQ: physics.overrideAbsorptionAxialQ,
    debugMode200Multiplier: physics.debugMode200Multiplier,
    debugModalPhaseConvention: "normal",
    reflectionGainScale: physics.reflectionGainScale,
    debugModalHSign: "normal",
    rewParityModalMagnitudeScale: physics.rewSourceCurveMode === "flat_rew_reference" ? physics.rewParityModalMagnitudeScale : 1,
    modalCoherenceMode: physics.modalCoherenceMode,
    highOrderAxialScale: physics.highOrderAxialScale,
    mute68HzAxialMode: physics.mute68HzAxialMode,
    debugDisableModalContribution: physics.debugDisableModalContribution,
    disableReflectionPhaseJitter: physics.disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight: physics.disableReflectionCoherenceWeight,
    disableLateField: physics.disableLateField,
    disableModalPropagationPhase: physics.rewSourceCurveMode === "flat_rew_reference" ? true : physics.disableModalPropagationPhase,
    modalSourceReferenceMode: physics.modalSourceReferenceMode,
    modalGainScalar: physics.modalGainScalar,
    modalDistanceBlend: physics.modalDistanceBlend,
    modalStorageMode: physics.modalStorageMode,
    propagationPhaseScale: physics.propagationPhaseScale,
  };
  const precomputedModes = prepareModeBank(roomDims, { ...engineOptionsBase, enableModes: true });

  // PASS 2 — Per-source RSP complex transfers: run N flat-source simulations
  // for the RSP listener only (reusing the same precomputed mode bank). This
  // produces the dimensionless room transfer data required by paired P14/P18
  // capability logic without a separate full normalized room simulation.
  //
  // CRITICAL: the flat-source transfer options MUST match the old normalized
  // refinement physics exactly (buildNormalizedPhysicsOptions) — NOT
  // engineOptionsBase. engineOptionsBase omits enableModes/enableReflections
  // and the flat-source forcing flags (pureDeterministicModalSum,
  // disableLateField, disableModalPropagationPhase, rewSourceCurveMode,
  // debugReflectionOrder, rewParityModalMagnitudeScale). Without these, the
  // engine defaults enableModes=false and enableReflections=false, producing
  // direct-path-only results that are NOT a room transfer. buildNormalizedPhysicsOptions
  // forces all the same values the old normalized-refinement path used, guaranteeing
  // numerical equivalence with the legacy transfers.
  const flatTransferPhysics = buildNormalizedPhysicsOptions(physics);
  const perSourceRspComplexTransfers = [];
  if (rspPosition && Number.isFinite(rspPosition.x) && Number.isFinite(rspPosition.y)) {
    const rspListenerZ = Number.isFinite(Number(rspPosition.z)) ? Number(rspPosition.z) : 1.2;
    sources.forEach((sub, sourceIndex) => {
      if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y) || !Number.isFinite(sub?.z)) return;
      try {
        const flatResult = simulateBassResponseRewCore(
          roomDims,
          { x: rspPosition.x, y: rspPosition.y, z: rspListenerZ },
          sub,
          FLAT_SOURCE_CURVE,
          { ...flatTransferPhysics, freqMinHz: 15, freqMaxHz: 200, smoothing: "none", precomputedModes }
        );
        perSourceRspComplexTransfers.push({
          sourceIndex,
          sourceId: sub?.id || null,
          amplitudeDomain: "pressure amplitude relative to 20 µPa",
          sourceReferenceDb: REFERENCE_SOURCE_DB,
          sourceReferenceAmplitude: REFERENCE_SOURCE_AMPLITUDE,
          dimensionlessTransferOperation: "complexPressure / sourceReferenceAmplitude",
          points: (flatResult.freqsHz || []).map((frequency, index) => ({
            frequency,
            re: flatResult.complexPressure[index]?.re ?? null,
            im: flatResult.complexPressure[index]?.im ?? null,
          })),
        });
      } catch {
        // Per-source transfer capture failure is non-fatal — the main
        // simulation still produces the authoritative response. The
        // downstream consumer handles missing transfer data gracefully.
      }
    });
  }

  listeners.forEach((seat) => {
    const seatId = seat.id || `${seat.x}-${seat.y}`;
    let freqsHz = null;
    let sumRe = null;
    let sumIm = null;
    sources.forEach((sub, sourceIndex) => {
      const subCurve = getSubwooferCurve(sub.modelKey);
      if (!subCurve?.length) return;
      const sourceAmplifierDeratingDb = amplifierAuthority.sourceAuthorities[sourceIndex]?.deratingDb ?? 0;
      const rawSourceCurve = REW_SOURCE_CURVES[physics.rewSourceCurveMode] || subCurve;
      const sourceCurve = physics.rewSourceCurveMode === "product"
        ? rawSourceCurve.map((point) => {
            const spl = Number(point?.spl);
            const db = Number(point?.db);
            if (Number.isFinite(spl)) return { ...point, spl: spl + sourceAmplifierDeratingDb };
            if (Number.isFinite(db)) return { ...point, db: db + sourceAmplifierDeratingDb };
            return { ...point };
          })
        : rawSourceCurve;
      const parityFullField = physics.rewSourceCurveMode === "flat_rew_reference" && physics.rewParityFieldMode === "full_field";
      const fieldReflections = qStrategyOverride === "ab_corrected" ? false
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
            rewSourceCurveMode: physics.rewSourceCurveMode,
            rewParityFieldMode: qStrategyOverride === "ab_corrected" ? "modes_only" : physics.rewParityFieldMode,
            abApplyModeMultiplicity: qStrategyOverride === "ab_corrected",
            roomIsSealed: qStrategyOverride === "ab_corrected",
            abMidbandQScale: 1,
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
            precomputedModes,
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
    activeModalVectorPath, amplifierAuthority, runtimeVectorCapture: { rows: runtimeRows },
    perSourceRspComplexTransfers };
}