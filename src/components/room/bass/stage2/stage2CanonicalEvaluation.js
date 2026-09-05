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
import { deriveCentreZ } from "@/components/utils/subwooferInstanceMigration";
import { gradeP19FromRaw, gradeP20FromRaw } from "../completedBassResultPersistence";
import { buildAuthoritativeAutoAlignDelays } from "../useAuthoritativeBassResponse";
import { searchDelayOnly, searchLevelAndDelay, resumWithTuning } from "./stage2TuningSearch";

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

// Mirrors the production POSITION_LABELS used by buildAuthoritativeAutoAlignDelays
// for sub ID generation (front-sub-left, front-sub-right, rear-sub-left, ...).
const STAGE2_POSITION_LABELS = ["left", "right"];

function buildStage2Sources(finalist, roomDims, selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM, rspPosition, zeroTuning = false) {
  const W = Number(roomDims.widthM);
  const L = Number(roomDims.lengthM);
  const bottomHeightM = (subwooferBottomHeightM != null && Number.isFinite(Number(subwooferBottomHeightM)))
    ? Math.max(0, Number(subwooferBottomHeightM))
    : STAGE2_FALLBACK_SOURCE_HEIGHT_M;
  const modelKey = normaliseModelKey(selectedSubModel);
  const centreZ = deriveCentreZ({ bottomHeightM, model: modelKey });

  const sourcePositions = finalist.sources.map((s) => ({
    x: s.xNorm * W,
    y: s.yNorm * L,
    z: centreZ,
  }));

  const frontSubsLive = [];
  const rearSubsLive = [];
  finalist.sources.forEach((s, i) => {
    const entry = { position: sourcePositions[i] };
    if (s.yNorm < 0.5) frontSubsLive.push(entry);
    else rearSubsLive.push(entry);
  });

  const autoAlignDelays = buildAuthoritativeAutoAlignDelays({
    enabled: true,
    rspPosition,
    frontSubsLive,
    rearSubsLive,
    frontSubsCfg: null,
    rearSubsCfg: null,
  });

  let frontIdx = 0;
  let rearIdx = 0;
  return finalist.sources.map((s, i) => {
    const group = s.yNorm < 0.5 ? "front" : "rear";
    const indexInGroup = group === "front" ? frontIdx++ : rearIdx++;
    const canonicalId = `${group}-sub-${STAGE2_POSITION_LABELS[indexInGroup] ?? indexInGroup}`;
    const autoDelay = autoAlignDelays[canonicalId] ?? 0;
    return {
      id: `stage2-src-${i + 1}`,
      modelKey,
      bassCapability: resolveSubwooferBassCapability(selectedSubModel),
      subwooferAmplifierPowerW: amplifierPowerPerSubW,
      x: sourcePositions[i].x,
      y: sourcePositions[i].y,
      z: centreZ,
      // When zeroTuning=true, all tuning is zero so per-source per-seat
      // complex transfers can be captured for later re-summation with
      // any tuning variant (placement-only, delay-only, level+delay).
      tuning: {
        gainDb: 0,
        delayMs: zeroTuning ? 0 : autoDelay,
        polarity: 0,
      },
      // Auto-align delay stored separately for placement-only re-summation
      autoAlignDelayMs: autoDelay,
    };
  });
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

// ── Placement evaluation (P14-independent) ───────────────────────────────

/**
 * Evaluate a single Stage 1 finalist's P14-INDEPENDENT raw transfer.
 *
 * This runs ONLY the expensive modal simulation (simulateAuthoritativeBassResponse)
 * and builds the raw transfer curves. The result is cached under the placement
 * fingerprint and reused across all P14 target changes.
 *
 * @param {object} params
 * @param {object} params.finalist — Stage 1 finalist { id, familyId, sources: [{ xNorm, yNorm }] }
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {object} params.rspPosition — { x, y, z }
 * @param {Array} params.seatingPositions — [{ id, x, y, z, priority }]
 * @param {string} params.selectedSubModel — subwoofer model key
 * @param {number} params.amplifierPowerPerSubW — amplifier power per sub
 * @param {number} [params.subwooferBottomHeightM] — project subwoofer bottom height
 * @returns {object|null} Raw transfer data, or null on failure
 */
export function evaluateStage2Placement({
  finalist,
  roomDims,
  rspPosition,
  seatingPositions,
  selectedSubModel,
  amplifierPowerPerSubW,
  subwooferBottomHeightM,
}) {
  if (!finalist?.sources?.length || !roomDims?.widthM || !selectedSubModel) {
    return null;
  }

  const seatPriorityMap = buildSeatPriorityMap(seatingPositions);

  const canonicalRspPosition = {
    id: "rsp",
    x: Number(rspPosition.x),
    y: Number(rspPosition.y),
    z: Number.isFinite(Number(rspPosition.z)) ? Number(rspPosition.z) : 1.2,
    __isSyntheticRsp: true,
  };

  // Run simulation with ZERO tuning so per-source per-seat complex transfers
  // can be captured for later re-summation with any tuning variant.
  const sources = buildStage2Sources(finalist, roomDims, selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM, canonicalRspPosition, true);

  const physics = buildStage2Physics();
  const simResult = simulateAuthoritativeBassResponse({
    roomDims,
    seatingPositions,
    rspPosition: canonicalRspPosition,
    sources,
    physics,
    qStrategyOverride: "ab_corrected",
    capturePerSourcePerSeat: true,
  });

  // Re-sum the per-source per-seat complex transfers with auto-align delays
  // to produce the placement-only response (mathematically identical to
  // running the simulation with auto-align tuning).
  const perSourcePerSeatComplexTransfers = simResult.perSourcePerSeatComplexTransfers || [];
  const seatIds = [canonicalRspPosition.id, ...(Array.isArray(seatingPositions) ? seatingPositions.map((s) => String(s.id || `${s.x}-${s.y}`)) : [])];
  const autoAlignTuning = sources.map((s) => ({ delayMs: s.autoAlignDelayMs || 0, gainDb: 0, polarity: 0 }));
  const placementSeatResponses = perSourcePerSeatComplexTransfers.length > 0
    ? resumWithTuning(perSourcePerSeatComplexTransfers, autoAlignTuning, seatIds)
    : simResult.seatResponses;

  const { rspRawCurve, perSeatRawCurves } = buildResponseCurves(placementSeatResponses);
  if (!rspRawCurve.length) return null;

  const perSeatRawCurvesWithPriority = perSeatRawCurves.map((seat) => ({
    ...seat,
    isPrimary: seatPriorityMap.get(String(seat.seatId)) === "primary",
  }));

  const usableLfHz = computeUsableLfHz(sources);
  const transitionHz = computeTransitionHz(roomDims);

  const coordinates = finalist.sources.map((s) => ({
    x: s.xNorm * Number(roomDims.widthM),
    y: s.yNorm * Number(roomDims.lengthM),
  }));

  return {
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
    // Per-source per-seat complex transfers with ZERO tuning, for re-summation
    // with delay-only / level+delay variants in the confirmation phase.
    perSourcePerSeatComplexTransfers,
    // Auto-align tuning (placement-only) for reference
    autoAlignTuning,
    // Seat IDs in order (for re-summation)
    seatIds,
  };
}

// ── Confirmation evaluation (P14-dependent) ──────────────────────────────

/**
 * Evaluate the P14-DEPENDENT canonical confirmation using a cached raw transfer.
 *
 * This runs the EQ candidate pool, selection, and authority evaluation against
 * the selected P14 target. It does NOT re-run simulateAuthoritativeBassResponse —
 * the raw transfer is reused from the placement cache.
 *
 * @param {object} rawTransfer — Cached raw transfer from evaluateStage2Placement
 * @param {object} params — P14 target parameters
 * @param {string} params.p14TargetBasis — "minimum" | "recommended"
 * @param {number} params.p14TargetLevel — 1–4
 * @param {number} params.p14TargetDb — derived P14 target dB
 * @param {string} params.p18TargetBasis — "minimum" | "recommended"
 * @returns {object|null} Stage 2 finalist evaluation result, or null on failure
 */
export function evaluateStage2Confirmation(rawTransfer, {
  p14TargetBasis,
  p14TargetLevel,
  p14TargetDb,
  p18TargetBasis,
}) {
  const startedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

  if (!rawTransfer || !Number.isFinite(p14TargetDb)) return null;

  const seatPriorityMap = new Map(rawTransfer.seatPriorityMap || []);
  const { rspRawCurve, perSeatRawCurves, sources, usableLfHz, transitionHz } = rawTransfer;

  if (!rspRawCurve?.length) return null;

  const pool = generateCanonicalCandidatePool({
    rawCurve: rspRawCurve,
    activeSubs: sources,
    usableLfHz,
    transitionHz,
    correctionEndHz: 200,
    perSeatRawCurves,
    selectedP14TargetDb: p14TargetDb,
    p14TargetBasis,
    p14TargetLevel,
    p18TargetBasis: p18TargetBasis || "minimum",
    perSourceComplexTransfers: [],
    normalizedTransferFingerprint: null,
    calibrationFingerprint: null,
  });

  const selection = selectCandidateFromPool(pool);
  if (!selection?.selectedCandidate) return null;

  const canonicalResult = buildFinalOptimisedBassResponse({
    optimisationResult: selection,
    selectedLayout: sources,
  });
  if (!canonicalResult) return null;

  const authority = evaluateCanonicalBassAuthority({
    canonicalResult,
    activeSubs: sources,
    usableLfHz,
    p14TargetBasis,
    p18TargetBasis: p18TargetBasis || "minimum",
    requestedLevel: p14TargetLevel,
  });
  if (!authority) return null;

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

  const p14Limited = !authority.requestedP14Pass;
  const p18Limited = !authority.requestedP18Pass || !Number.isFinite(achievedP18Hz) || achievedP18Hz === null;
  const limited = p14Limited || p18Limited;

  const endedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

  return {
    finalistId: rawTransfer.finalistId,
    familyId: rawTransfer.familyId,
    quantity: rawTransfer.quantity,
    coordinates: rawTransfer.coordinates,
    selectedProduct: rawTransfer.selectedProduct,
    p14TargetBasis,
    p14TargetLevel,
    p14TargetDb,
    p14AchievedDb,
    p14AchievedLevel: authority.achievedP14Level ?? canonicalResult.achievedP14Level ?? null,
    p14ShortfallDb,
    p14HeadroomDb,
    achievedP18Hz,
    p18AchievedLevel: authority.achievedP18Level ?? canonicalResult.achievedP18Level ?? null,
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
    algorithmVersion: "stage2-canonical-v2",
  };
}

// ── Tuning-variant confirmation (delay-only, level+delay) ────────────────

/**
 * Evaluate a Stage 2 finalist with a specific tuning variant (delay-only or
 * level+delay). Re-sums the per-source per-seat complex transfers with the
 * variant's tuning, then runs the FULL canonical chain (EQ pool, P18, P19,
 * P20, grading). This is mathematically equivalent to re-simulating with the
 * variant's tuning but avoids re-running the modal simulation.
 *
 * @param {object} rawTransfer — Cached raw transfer with perSourcePerSeatComplexTransfers
 * @param {object} params — P14 target parameters + tuningVariant
 * @param {string} params.tuningVariant — "delay-only" | "level-delay"
 * @param {string} params.p14TargetBasis
 * @param {number} params.p14TargetLevel
 * @param {number} params.p14TargetDb
 * @param {string} params.p18TargetBasis
 * @returns {object|null} Stage 2 finalist evaluation result with tuningVariant tag
 */
export function evaluateStage2ConfirmationWithTuning(rawTransfer, {
  tuningVariant,
  p14TargetBasis,
  p14TargetLevel,
  p14TargetDb,
  p18TargetBasis,
}) {
  if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length) return null;
  if (!Number.isFinite(p14TargetDb)) return null;

  const { sources, perSourcePerSeatComplexTransfers, seatIds, usableLfHz, transitionHz } = rawTransfer;
  if (!sources?.length) return null;

  // Search for the best tuning using per-source RSP transfers
  const rspTransfers = perSourcePerSeatComplexTransfers.filter((t) => t.seatId === "rsp");
  let searchResult;
  if (tuningVariant === "delay-only") {
    searchResult = searchDelayOnly(rspTransfers, sources.map((s) => ({ yNorm: s.yNorm ?? (s.y / Number(rawTransfer.coordinates?.[0]?.x ? 1 : 1)) })));
  } else if (tuningVariant === "level-delay") {
    searchResult = searchLevelAndDelay(rspTransfers, sources.map((s) => ({ yNorm: s.yNorm ?? (s.y / Number(rawTransfer.coordinates?.[0]?.x ? 1 : 1)) })));
  } else {
    return null;
  }

  // Re-sum all seats with the best tuning
  const tunedSeatResponses = resumWithTuning(perSourcePerSeatComplexTransfers, searchResult.tuning, seatIds);
  const { rspRawCurve, perSeatRawCurves } = buildResponseCurves(tunedSeatResponses);
  if (!rspRawCurve.length) return null;

  const seatPriorityMap = new Map(rawTransfer.seatPriorityMap || []);
  const perSeatRawCurvesWithPriority = perSeatRawCurves.map((seat) => ({
    ...seat,
    isPrimary: seatPriorityMap.get(String(seat.seatId)) === "primary",
  }));

  // Build a tuned raw transfer for the canonical confirmation
  const tunedRawTransfer = {
    ...rawTransfer,
    rspRawCurve,
    perSeatRawCurves: perSeatRawCurvesWithPriority,
    // Override sources with the tuned delay/level
    sources: sources.map((s, i) => ({
      ...s,
      tuning: searchResult.tuning[i] || { delayMs: 0, gainDb: 0, polarity: 0 },
    })),
  };

  // Run the existing canonical confirmation chain
  const result = evaluateStage2Confirmation(tunedRawTransfer, {
    p14TargetBasis,
    p14TargetLevel,
    p14TargetDb,
    p18TargetBasis,
  });

  if (!result) return null;

  // Tag the result with the tuning variant and per-source tuning
  return {
    ...result,
    tuningVariant,
    tuningSearch: {
      bestDelayMs: searchResult.bestDelayMs,
      bestGainDb: searchResult.bestGainDb ?? 0,
      bestScore: searchResult.bestScore,
    },
    appliedTuning: searchResult.tuning,
  };
}

// ── Legacy combined evaluation (backward compatibility) ───────────────────

/**
 * Evaluate a single Stage 1 finalist through the full canonical bass authority
 * pipeline at the selected P14 target. Combines placement + confirmation.
 * Prefer evaluateStage2Placement + evaluateStage2Confirmation for caching.
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
  subwooferBottomHeightM,
}) {
  if (!finalist?.sources?.length || !roomDims?.widthM || !selectedSubModel || !Number.isFinite(p14TargetDb)) {
    return null;
  }

  const rawTransfer = evaluateStage2Placement({
    finalist,
    roomDims,
    rspPosition,
    seatingPositions,
    selectedSubModel,
    amplifierPowerPerSubW,
    subwooferBottomHeightM,
  });
  if (!rawTransfer) return null;

  return evaluateStage2Confirmation(rawTransfer, {
    p14TargetBasis,
    p14TargetLevel,
    p14TargetDb,
    p18TargetBasis,
  });
}