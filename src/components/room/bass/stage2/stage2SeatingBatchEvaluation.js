// stage2SeatingBatchEvaluation.js
// Batch seating position evaluation — prepares the source/room field ONCE
// and reuses it across all seating offsets.
//
// This is mathematically IDENTICAL to calling evaluateStage2Placement for each
// offset individually. The only difference is performance: the receiver-
// invariant modal terms (mode×frequency, source×mode coupling, mode weights,
// source×frequency amplitudes, tuning rotations) are computed once instead of
// 10 times.
//
// The prepared field contains NO listener-dependent data. Only the listener-
// mode coupling and transfer matrix are recomputed per offset.

import { prepareSourceRoomField, evaluateReceiversFromPreparedField } from "@/bass/core/batchModalEvaluator";
import { prepareModeBank } from "@/bass/core/rewBassEngine";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "../bassPhysicsDefaults";
import {
  buildStage2Sources,
  buildResponseCurves,
  computeUsableLfHz,
  computeTransitionHz,
  buildSeatPriorityMap,
} from "./stage2CanonicalEvaluation";
import { resumWithTuning } from "./stage2TuningSearch";
import { buildAuthoritativeAutoAlignDelays } from "../useAuthoritativeBassResponse";
import { normaliseModelKey, getSubwooferCurve } from "@/components/models/speakers/registry";
import { getPerSubwooferAmplifierAuthority } from "@/components/utils/subwooferCapability";

const STAGE2_POSITION_LABELS = ["left", "right"];

/**
 * Evaluate all seating offset candidates in a single batch.
 *
 * @param {object} params
 * @param {object} params.finalist — Stage 1 finalist { id, familyId, sources: [{ xNorm, yNorm }] }
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {object} params.rspPosition — original RSP { x, y, z }
 * @param {Array} params.candidates — seating candidates from generateSeatingCandidates (non-zero offsets only)
 * @param {string} params.selectedSubModel — subwoofer model key
 * @param {number} params.amplifierPowerPerSubW — amplifier power per sub
 * @param {number} [params.subwooferBottomHeightM] — project subwoofer bottom height
 * @returns {{ candidates: Array, timing: object }} per-candidate rawTransfer results + timing
 */
export function evaluateSeatingBatch({
  finalist,
  roomDims,
  rspPosition,
  candidates,
  selectedSubModel,
  amplifierPowerPerSubW,
  subwooferBottomHeightM,
}) {
  if (!finalist?.sources?.length || !roomDims?.widthM || !selectedSubModel || !candidates?.length) {
    return { candidates: [], timing: { totalMs: 0, preparedSourceRoomMs: 0, perOffsetMs: [] } };
  }

  const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

  // ── 1. Build sources ONCE with zeroTuning=true ──────────────────────────
  // The sources (positions, model curves, zero tuning) are identical for all
  // seating offsets. Only the listeners (RSP + seats) change per offset.
  const canonicalRspBase = {
    id: "rsp",
    x: Number(rspPosition.x),
    y: Number(rspPosition.y),
    z: Number.isFinite(Number(rspPosition.z)) ? Number(rspPosition.z) : 1.2,
    __isSyntheticRsp: true,
  };

  const sources = buildStage2Sources(
    finalist, roomDims, selectedSubModel, amplifierPowerPerSubW,
    subwooferBottomHeightM, canonicalRspBase, true,
  );

  // ── 2. Prepare the source/room field ONCE ──────────────────────────────
  // This computes all receiver-invariant modal terms: mode×frequency response,
  // source×mode coupling, mode weights, source×frequency amplitudes, tuning
  // rotations. These terms do NOT depend on listener coordinates.
  // Build derated product curves — matches simulateAuthoritativeBassResponse's
  // buildDeratedProductCurve exactly. Without this, sourceFreqAmplitude would
  // be computed from an undefined curve, producing wrong complex transfers.
  const amplifierAuthority = getPerSubwooferAmplifierAuthority(sources);
  const batchSources = sources.map((s, sourceIndex) => {
    const subCurve = getSubwooferCurve(s.modelKey);
    const deratingDb = amplifierAuthority.sourceAuthorities[sourceIndex]?.deratingDb ?? 0;
    const deratedCurve = (Number.isFinite(deratingDb) && deratingDb !== 0 && subCurve)
      ? subCurve.map((point) => {
          const spl = Number(point?.spl);
          const db = Number(point?.db);
          if (Number.isFinite(spl)) return { ...point, spl: spl + deratingDb };
          if (Number.isFinite(db)) return { ...point, db: db + deratingDb };
          return { ...point };
        })
      : subCurve;
    return {
      x: s.x, y: s.y, z: s.z,
      modelKey: s.modelKey,
      sourceCurve: deratedCurve,
      tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
    };
  });

  const physics = {
    ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
    rewSourceCurveMode: "product",
    disableLateField: true,
    disableModalPropagationPhase: true,
  };

  // Match simulateAuthoritativeBassResponse's engineOptionsBase EXACTLY so
  // prepareModeBank produces the same mode list. Missing fields cause
  // prepareModeBank to use different defaults, producing different modes.
  const engineOptionsBase = {
    surfaceAbsorption: physics.surfaceAbsorption,
    freqMinHz: 15,
    freqMaxHz: 200,
    smoothing: "none",
    axialQ: physics.axialQ,
    qStrategy: "ab_corrected",
    rewModalBandwidthScale: physics.rewModalBandwidthScale,
    enableRewCoreReflections: physics.enableRewCoreReflections,
    rewParityFieldMode: physics.rewParityFieldMode,
    abApplyModeMultiplicity: true,
    roomIsSealed: true,
    abMidbandQScale: 1,
    overrideConstantAxialQ: physics.overrideConstantAxialQ,
    overrideAbsorptionAxialQ: physics.overrideAbsorptionAxialQ,
    debugMode200Multiplier: physics.debugMode200Multiplier,
    debugModalPhaseConvention: "normal",
    reflectionGainScale: physics.reflectionGainScale,
    debugModalHSign: "normal",
    rewParityModalMagnitudeScale: 1,
    modalCoherenceMode: physics.modalCoherenceMode,
    highOrderAxialScale: physics.highOrderAxialScale,
    mute68HzAxialMode: physics.mute68HzAxialMode,
    debugDisableModalContribution: physics.debugDisableModalContribution,
    disableReflectionPhaseJitter: physics.disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight: physics.disableReflectionCoherenceWeight,
    disableLateField: physics.disableLateField,
    disableModalPropagationPhase: physics.disableModalPropagationPhase,
    modalSourceReferenceMode: physics.modalSourceReferenceMode,
    modalGainScalar: physics.modalGainScalar,
    modalDistanceBlend: physics.modalDistanceBlend,
    modalStorageMode: physics.modalStorageMode,
    propagationPhaseScale: physics.propagationPhaseScale,
  };

  const precomputedModes = prepareModeBank(roomDims, { ...engineOptionsBase, enableModes: true });

  const preparedField = prepareSourceRoomField({
    roomDims,
    sources: batchSources,
    precomputedModes,
    physics,
    qStrategyOverride: "ab_corrected",
  });

  const tPrep = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const preparedSourceRoomMs = tPrep - t0;

  // ── 3. Precompute offset-invariant metadata ────────────────────────────
  const seatPriorityMap = buildSeatPriorityMap(candidates[0]?.seatingPositions || []);
  const usableLfHz = computeUsableLfHz(sources);
  const transitionHz = computeTransitionHz(roomDims);
  const coordinates = finalist.sources.map((s) => ({
    x: s.xNorm * Number(roomDims.widthM),
    y: s.yNorm * Number(roomDims.lengthM),
  }));

  // ── 4. Iterate offsets — evaluate receivers from prepared field ────────
  const results = [];
  const perOffsetMs = [];

  for (const candidate of candidates) {
    const tOffsetStart = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    // Build moved RSP + moved seats for this offset
    const movedRsp = {
      ...canonicalRspBase,
      y: (rspPosition?.y || 0) + candidate.effectiveOffsetM,
    };

    const movedSeats = candidate.seatingPositions || [];
    const listeners = [movedRsp, ...movedSeats.map((seat) => ({
      id: String(seat.id || `${seat.x}-${seat.y}`),
      x: Number(seat.x),
      y: Number(seat.y),
      z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2,
    }))];

    // Evaluate receivers from the prepared field (only listener-dependent terms)
    const receiverResult = evaluateReceiversFromPreparedField(preparedField, listeners);

    // Assemble perSourcePerSeatComplexTransfers (same format as production)
    const perSourcePerSeatComplexTransfers = [];
    for (const transfer of receiverResult.perSourcePerListenerTransfers) {
      const sub = sources[transfer.sourceIndex];
      perSourcePerSeatComplexTransfers.push({
        seatId: transfer.listenerId,
        sourceIndex: transfer.sourceIndex,
        sourceId: sub?.id || null,
        points: transfer.points,
      });
    }

    // Compute auto-align delays for the MOVED RSP position.
    // CRITICAL: include z coordinate — buildAuthoritativeAutoAlignDelays uses
    // 3D distance (Math.hypot(x-rsp.x, y-rsp.y, z-rsp.z)). Missing z falls back
    // to 0.35 instead of the subwoofer's centreZ, producing wrong delays.
    const frontSubsLive = [];
    const rearSubsLive = [];
    finalist.sources.forEach((s, i) => {
      const entry = { position: { x: sources[i].x, y: sources[i].y, z: sources[i].z } };
      if (s.yNorm < 0.5) frontSubsLive.push(entry);
      else rearSubsLive.push(entry);
    });
    const autoAlignDelays = buildAuthoritativeAutoAlignDelays({
      enabled: true,
      rspPosition: movedRsp,
      frontSubsLive,
      rearSubsLive,
      frontSubsCfg: null,
      rearSubsCfg: null,
    });

    // Build auto-align tuning from the moved RSP delays
    let frontIdx = 0, rearIdx = 0;
    const autoAlignTuning = finalist.sources.map((s, i) => {
      const group = s.yNorm < 0.5 ? "front" : "rear";
      const indexInGroup = group === "front" ? frontIdx++ : rearIdx++;
      const canonicalId = `${group}-sub-${STAGE2_POSITION_LABELS[indexInGroup] ?? indexInGroup}`;
      const autoDelay = autoAlignDelays[canonicalId] ?? 0;
      return { delayMs: autoDelay, gainDb: 0, polarity: 0 };
    });

    // Re-sum with auto-align tuning to get placement seat responses
    const seatIds = [movedRsp.id, ...movedSeats.map((s) => String(s.id || `${s.x}-${s.y}`))];
    const placementSeatResponses = perSourcePerSeatComplexTransfers.length > 0
      ? resumWithTuning(perSourcePerSeatComplexTransfers, autoAlignTuning, seatIds)
      : {};

    const { rspRawCurve, perSeatRawCurves } = buildResponseCurves(placementSeatResponses);

    const perSeatRawCurvesWithPriority = perSeatRawCurves.map((seat) => ({
      ...seat,
      isPrimary: seatPriorityMap.get(String(seat.seatId)) === "primary",
    }));

    const tOffsetEnd = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    perOffsetMs.push(tOffsetEnd - tOffsetStart);

    // Build rawTransfer (same shape as evaluateStage2Placement)
    results.push({
      offsetMm: candidate.offsetMm,
      effectiveOffsetM: candidate.effectiveOffsetM,
      rawTransfer: rspRawCurve.length ? {
        finalistId: finalist.id,
        familyId: finalist.familyId,
        quantity: finalist.sources.length,
        coordinates,
        selectedProduct: normaliseModelKey(selectedSubModel),
        rspRawCurve,
        perSeatRawCurves: perSeatRawCurvesWithPriority,
        sources,
        usableLfHz,
        transitionHz,
        seatPriorityMap: Array.from(seatPriorityMap.entries()),
        perSourcePerSeatComplexTransfers,
        autoAlignTuning,
        seatIds,
      } : null,
    });
  }

  const tEnd = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

  return {
    candidates: results,
    timing: {
      totalMs: tEnd - t0,
      preparedSourceRoomMs,
      perOffsetMs,
      receiverEvalTotalMs: perOffsetMs.reduce((s, v) => s + v, 0),
    },
  };
}