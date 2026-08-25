// stage2CanonicalEvaluation.js
// Core Stage 2 canonical evaluation: takes a Stage 1 finalist (geometric
// acoustic-centre positions) and evaluates it through the FULL canonical
// bass authority pipeline at the selected P14 target.
//
// Pipeline:
//   Stage 1 finalist coordinates
//   → build sources (selected sub model at finalist positions)
//   → simulateAuthoritativeBassResponse (product-aware room/modal transfer)
//   → rawCurve + perSeatRawCurves
//   → generateCanonicalCandidatePool (selected P14 target)
//   → selectCandidateFromPool (best EQ candidate)
//   → buildFinalOptimisedBassResponse (canonical result)
//   → evaluateCanonicalBassAuthority (P14/P18/P19/P20 authority)
//   → extract per-seat P19/P20 + assessment band + headroom
//
// This module reuses the EXISTING production authority. It does NOT create
// placement-specific P19/P20 maths.

import { simulateAuthoritativeBassResponse } from "../authoritativeBassResponseEngine";
import { generateCanonicalCandidatePool } from "@/components/utils/canonicalBassOptimiser";
import { selectCandidateFromPool } from "@/components/utils/bassCandidatePoolSelection";
import { buildFinalOptimisedBassResponse } from "../finalOptimisedBassResponse";
import { evaluateCanonicalBassAuthority } from "@/components/utils/canonicalBassAuthorityEvaluation";
import { resolveSubwooferBassCapability } from "@/components/utils/speakerModelResolver";
import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "../bassPhysicsDefaults";
import { STAGE2_FALLBACK_SOURCE_HEIGHT_M, STAGE2_PRODUCT_ENGINEERING_VERSION } from "./stage2Constants";
import { gradeP19FromRaw, gradeP20FromRaw } from "../completedBassResultPersistence";

// ── Pure curve helpers (inlined to avoid React-dependent imports) ─────────

function responseCurve(response) {
  const raw = (response?.freqsHz || []).map((frequency, index) => ({
    frequency,
    spl: Number.isFinite(response?.splDb?.[index]) ? response.splDb[index] : null,
  })).filter((point) => Number.isFinite(point.frequency) && point.frequency > 0).sort((a, b) => a.frequency - b.frequency);
  return raw.filter((point, index) => !raw[index + 1] || Math.abs(point.frequency - raw[index + 1].frequency) >= 1e-9);
}

function buildResponseCurves(seatResponses) {
  return {
    rspRawCurve: responseCurve(seatResponses?.rsp),
    perSeatRawCurves: Object.entries(seatResponses || {})
      .filter(([seatId]) => seatId !== "rsp")
      .map(([seatId, response]) => ({
        seatId,
        responseData: responseCurve(response).filter((point) => Number.isFinite(point.spl)),
      }))
      .filter((seat) => seat.responseData.length > 0),
  };
}

// ── Physics builder ──────────────────────────────────────────────────────

function buildStage2Physics() {
  return {
    ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
    // Match the production path: product source curve, no late field,
    // no modal propagation phase (ab_corrected strategy).
    rewSourceCurveMode: "product",
    disableLateField: true,
    disableModalPropagationPhase: true,
  };
}

// ── Source builder ───────────────────────────────────────────────────────

function buildStage2Sources(finalist, roomDims, selectedSubModel, amplifierPowerPerSubW) {
  const W = Number(roomDims.widthM);
  const L = Number(roomDims.lengthM);
  return finalist.sources.map((s, i) => ({
    id: `stage2-src-${i + 1}`,
    modelKey: normaliseModelKey(selectedSubModel),
    bassCapability: resolveSubwooferBassCapability(selectedSubModel),
    subwooferAmplifierPowerW: amplifierPowerPerSubW,
    x: s.xNorm * W,
    y: s.yNorm * L,
    z: STAGE2_FALLBACK_SOURCE_HEIGHT_M,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
  }));
}

// ── Usable LF / transition ───────────────────────────────────────────────

function computeUsableLfHz(sources) {
  const usable = sources
    .map((sub) => MODELS.find((model) => model.key === normaliseModelKey(sub.modelKey))?.approvedUsableLfHzMinus6dB)
    .filter(Number.isFinite);
  return usable.length ? Math.max(...usable) : null;
}

function computeTransitionHz(roomDims) {
  const volume = Number(roomDims?.widthM) * Number(roomDims?.lengthM) * Number(roomDims?.heightM);
  return volume > 0 ? 2000 * Math.sqrt(0.4 / volume) : 120;
}

// ── Seat priority map ────────────────────────────────────────────────────

function buildSeatPriorityMap(seatingPositions) {
  const map = new Map();
  (Array.isArray(seatingPositions) ? seatingPositions : []).forEach((seat) => {
    const id = String(seat.id || `${seat.x}-${seat.y}`);
    map.set(id, seat.priority === "secondary" ? "secondary" : "primary");
  });
  return map;
}

// ── Per-seat result extractor ─────────────────────────────────────────────

function extractPerSeatP19(perSeatP19Results, seatPriorityMap) {
  return (Array.isArray(perSeatP19Results) ? perSeatP19Results : []).map((seat) => {
    const variationDbRaw = Number(seat?.variationDbRaw);
    const wholeDbDeviation = Number.isFinite(variationDbRaw) ? Math.floor(Math.abs(variationDbRaw)) : null;
    const seatId = String(seat?.seatId || "");
    return {
      seatId,
      isPrimary: seatPriorityMap.get(seatId) === "primary",
      variationDbRaw: Number.isFinite(variationDbRaw) ? variationDbRaw : null,
      wholeDbDeviation,
      level: seat?.level ?? gradeP19FromRaw(variationDbRaw),
      worstFrequencyHz: seat?.worstFrequencyHz ?? null,
    };
  });
}

function extractPerSeatP20(perSeatP20Results, seatPriorityMap) {
  return (Array.isArray(perSeatP20Results) ? perSeatP20Results : []).map((seat) => {
    const variationDbRaw = Number(seat?.variationDbRaw);
    const wholeDbDeviation = Number.isFinite(variationDbRaw) ? Math.floor(Math.abs(variationDbRaw)) : null;
    const seatId = String(seat?.seatId || "");
    return {
      seatId,
      isPrimary: seatPriorityMap.get(seatId) === "primary",
      variationDbRaw: Number.isFinite(variationDbRaw) ? variationDbRaw : null,
      wholeDbDeviation,
      level: seat?.level ?? gradeP20FromRaw(variationDbRaw),
      worstFrequencyHz: seat?.worstFrequencyHz ?? null,
    };
  });
}

// ── Main evaluation function ──────────────────────────────────────────────

/**
 * Evaluate a single Stage 1 finalist through the full canonical bass authority
 * pipeline at the selected P14 target.
 *
 * @param {object} params
 * @param {object} params.finalist — Stage 1 finalist { id, familyId, sources: [{ xNorm, yNorm }] }
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {object} params.rspPosition — { x, y, z }
 * @param {Array} params.seatingPositions — [{ id, x, y, z, priority }]
 * @param {string} params.selectedSubModel — subwoofer model key
 * @param {number} params.amplifierPowerPerSubW — amplifier power per sub
 * @param {string} params.p14TargetBasis — "minimum" | "recommended"
 * @param {number} params.p14TargetLevel — 1–4
 * @param {number} params.p14TargetDb — derived P14 target dB
 * @param {string} params.p18TargetBasis — "minimum" | "recommended"
 * @returns {object|null} Stage 2 finalist evaluation result, or null on failure
 */
export function evaluateStage2Finalist({
  finalist,
  roomDims,
  rspPosition,
  seatingPositions,
  selectedSubModel,
  amplifierPowerPerSubW,
  p14TargetBasis,
  p14TargetLevel,
  p14TargetDb,
  p18TargetBasis,
}) {
  const startedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

  if (!finalist?.sources?.length || !roomDims?.widthM || !selectedSubModel || !Number.isFinite(p14TargetDb)) {
    return null;
  }

  const seatPriorityMap = buildSeatPriorityMap(seatingPositions);

  // 1. Build sources from finalist positions + selected sub model
  const sources = buildStage2Sources(finalist, roomDims, selectedSubModel, amplifierPowerPerSubW);

  // 2. Run product-aware authoritative bass simulation
  const physics = buildStage2Physics();
  const simResult = simulateAuthoritativeBassResponse({
    roomDims,
    seatingPositions,
    rspPosition,
    sources,
    physics,
    qStrategyOverride: "ab_corrected",
  });

  // 3. Build rawCurve + perSeatRawCurves
  const { rspRawCurve, perSeatRawCurves } = buildResponseCurves(simResult.seatResponses);
  if (!rspRawCurve.length) return null;

  // Add isPrimary to perSeatRawCurves for the canonical pipeline
  const perSeatRawCurvesWithPriority = perSeatRawCurves.map((seat) => ({
    ...seat,
    isPrimary: seatPriorityMap.get(String(seat.seatId)) === "primary",
  }));

  // 4. Compute usableLfHz + transitionHz
  const usableLfHz = computeUsableLfHz(sources);
  const transitionHz = computeTransitionHz(roomDims);

  // 5. Run generateCanonicalCandidatePool at the selected P14 target
  const pool = generateCanonicalCandidatePool({
    rawCurve: rspRawCurve,
    activeSubs: sources,
    usableLfHz,
    transitionHz,
    correctionEndHz: 200,
    perSeatRawCurves: perSeatRawCurvesWithPriority,
    selectedP14TargetDb: p14TargetDb,
    p14TargetBasis,
    p14TargetLevel,
    p18TargetBasis: p18TargetBasis || "minimum",
    perSourceComplexTransfers: [],
    normalizedTransferFingerprint: null,
    calibrationFingerprint: null,
  });

  // 6. Select best candidate from pool
  const selection = selectCandidateFromPool(pool);
  if (!selection?.selectedCandidate) return null;

  // 7. Build canonicalResult
  const canonicalResult = buildFinalOptimisedBassResponse({
    optimisationResult: selection,
    selectedLayout: sources,
  });
  if (!canonicalResult) return null;

  // 8. Run evaluateCanonicalBassAuthority
  const authority = evaluateCanonicalBassAuthority({
    canonicalResult,
    activeSubs: sources,
    usableLfHz,
    p14TargetBasis,
    p18TargetBasis: p18TargetBasis || "minimum",
    requestedLevel: p14TargetLevel,
  });
  if (!authority) return null;

  // 9. Extract results
  const perSeatP19 = extractPerSeatP19(authority.perSeatP19Results, seatPriorityMap);
  const perSeatP20 = extractPerSeatP20(authority.perSeatP20Results, seatPriorityMap);

  const p14AchievedDb = authority.achievedP14Db;
  const p14ShortfallDb = Number.isFinite(p14AchievedDb) && Number.isFinite(p14TargetDb)
    ? Math.max(0, p14TargetDb - p14AchievedDb)
    : null;
  const p14HeadroomDb = authority.p14MarginDb;
  const achievedP18Hz = authority.achievedP18FrequencyHz;
  const assessmentStartHz = authority.assessmentStartHz;
  const assessmentEndHz = authority.assessmentEndHz;

  // P14/P18 limited: cannot achieve selected P14 target or valid P18
  const p14Limited = !authority.requestedP14Pass;
  const p18Limited = !authority.requestedP18Pass || !Number.isFinite(achievedP18Hz) || achievedP18Hz === null;
  const limited = p14Limited || p18Limited;

  const coordinates = finalist.sources.map((s) => ({
    x: s.xNorm * Number(roomDims.widthM),
    y: s.yNorm * Number(roomDims.lengthM),
  }));

  const endedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

  return {
    finalistId: finalist.id,
    familyId: finalist.familyId,
    quantity: finalist.sources.length,
    coordinates,
    selectedProduct: normaliseModelKey(selectedSubModel),
    p14TargetBasis,
    p14TargetLevel,
    p14TargetDb,
    p14AchievedDb,
    p14ShortfallDb,
    p14HeadroomDb,
    achievedP18Hz,
    p18AchievedLevel: authority.achievedP18Level ?? null,
    assessmentStartHz,
    assessmentEndHz,
    perSeatP19,
    perSeatP20,
    limited,
    p14Limited,
    p18Limited,
    canonicalAuthorityReceipt: {
      selectedCandidateId: selection.selectedCandidateId,
      filterBankSignature: selection.filterBankSignature,
      postEqCurveSignature: selection.postEqCurveSignature,
      poolId: pool.poolId,
      productEngineeringVersion: STAGE2_PRODUCT_ENGINEERING_VERSION,
    },
    runtimeMs: Math.max(0, endedAt - startedAt),
    algorithmVersion: "stage2-canonical-v1",
  };
}