import { simulateBassResponseRewCore, simulateBassResponseRewParityField } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import { REW_SOURCE_CURVES } from "./rewSourceCurves";
import { getPerSubwooferAmplifierAuthority } from "@/components/utils/subwooferCapability";

export function simulateAuthoritativeBassResponse({ roomDims, seatingPositions, rspPosition, sources, physics, qStrategyOverride }) {
  if (!sources.length || !roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
    return { seatResponses: {}, metrics: null, audit: null, runtimeVectorCapture: { rows: [] } };
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
