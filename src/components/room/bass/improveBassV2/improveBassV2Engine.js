// improveBassV2Engine.js
// Core V2 Improve Bass Response engine.
//
// Workflow:
//   1. Snapshot current design (ALL instances + ACTIVE optimisation subset)
//   2. Check if existing production authority is non-stale → reuse as Current control
//   3. Gather placement candidates (Stage 2 finalists only — Current excluded)
//   4. Compute raw transfers per candidate (worker — modal simulation)
//   5. Search delay + polarity + trim per CHALLENGER candidate (main thread)
//   6. Promote 2-3 best challengers
//   7. Canonical confirmation on promoted challengers (worker — EQ, P14/P18/P19/P20)
//   8. If no valid authority existed, confirm Current with INSTALLED tuning (no search)
//   9. Primary-seat protection (reject candidates that damage primary seats)
//   10. Winner selection or "No safer automatic improvement found"
//
// BLOCKER 2: Current is a FIXED CONTROL. It NEVER enters the delay/polarity/trim
// search. If a valid non-stale authority exists, it is reused as-is. If not,
// Current is canonically recalculated with the EXACT installed tuning.
//
// BLOCKER 4: Null/empty worker results resolve as NO_WINNER, never blank complete.
//
// BLOCKER 6: Snapshot retains ALL instances (including disabled) separately from
// the ACTIVE optimisation subset. Disabled instances are never destroyed.
//
// BLOCKER 7: Cancelled jobs can never publish, apply, or replace Current.

import { searchDelayOnly, searchPolarity, searchGainOnly, resumWithTuning } from "../stage2/stage2TuningSearch.js";
import { selectAuthoritativeFinalist, hasPrimarySeatRegression, detectMutedSubs } from "../best-layout/authoritativeFinalistSelection.js";
import { getCachedRawTransfersForFingerprint } from "../stage2/stage2RawTransferCache.js";
import { normaliseModelKey } from "../../../utils/modelKeyNormaliser.js";
import { computeV2DesignFingerprint, isCurrentAuthorityNonStale } from "./improveBassV2Fingerprint.js";
import { runInWorker, isFatalLifecycleError, V2RunTimeoutError } from "./improveBassV2WorkerLifecycle.js";
import { V2RuntimeMetrics } from "./improveBassV2RuntimeMetrics.js";
import { subscribeImproveBassV2, getImproveBassV2State } from "./improveBassV2Store.js";
import { runCalibrationOnlySearch } from "./calibrationOnlySearch.js";
import { isMaterialImprovement } from "./materialityGate.js";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { setPositionSearchPhase, setPositionExhaustion } from "./improveBassV2Store.js";
import { runPositionScreenPhase, tagGlobalCandidates, checkPhaseMateriality, buildPositionOptimisationState } from "./improveBassV2Escalation.js";

const MAX_CHALLENGERS = 3;

// TODO: replace with measured production threshold after Room B/C browser
// runtime validation. 5 min is a deliberately generous provisional ceiling
// that should not interfere with normal browser measurements.
const V2_WHOLE_RUN_TIMEOUT_MS_PROVISIONAL = 300000;
const YIELD_DELAY_MS = 0;

// Scoring band for proxy P19 (worst-seat peak-to-peak). Matches the tuning
// search band (20–120 Hz) so proxy metrics are consistent with the search.
const PROXY_SCORE_MIN_HZ = 20;
const PROXY_SCORE_MAX_HZ = 120;

// ---------------------------------------------------------------------------
// Snapshot (BLOCKER 6: ALL instances + ACTIVE optimisation subset)
// ---------------------------------------------------------------------------

/**
 * Snapshot the current design state.
 *
 * BLOCKER 6: Maintains ALL instances (including disabled) separately from the
 * ACTIVE optimisation subset. Disabled instances are preserved in allInstances
 * so Apply can restore them. Only enabled instances enter activeInstances for
 * acoustic optimisation.
 *
 * @returns {object} snapshot with allInstances, activeInstances, positions, tuning, etc.
 */
export function snapshotCurrentDesign({
  subwooferInstances,
  roomDims,
  selectedSubModel,
  currentAuthority,
  p14TargetBasis,
  p14TargetLevel,
  p14TargetDb,
  p18TargetBasis,
}) {
  const allInstances = Array.isArray(subwooferInstances) ? subwooferInstances : [];
  const activeInstances = allInstances.filter((s) => s.enabled !== false);

  const positions = activeInstances.map((inst) => ({
    x: Number(inst.position?.x) || 0,
    y: Number(inst.position?.y) || 0,
  }));
  const tuning = activeInstances.map((inst) => ({
    delayMs: Number(inst.delayMs) || 0,
    gainDb: Number(inst.gainDb) || 0,
    polarity: Number(inst.polarity) || 0,
  }));
  const mutedInfo = detectMutedSubs(
    activeInstances.map((inst) => ({
      id: inst.id,
      tuning: { gainDb: Number(inst.gainDb) || 0 },
    })),
  );

  return {
    // BLOCKER 6: ALL instances (including disabled) — preserved for Apply
    allInstances: allInstances.map((inst) => ({
      id: inst.id,
      model: inst.model,
      enabled: inst.enabled !== false,
      position: {
        x: Number(inst.position?.x) || 0,
        y: Number(inst.position?.y) || 0,
        z: Number(inst.position?.z) || 0,
      },
      bottomHeightM: Number(inst.bottomHeightM) || 0,
      rotationDeg: Number(inst.rotationDeg) || 0,
      delayMs: Number(inst.delayMs) || 0,
      gainDb: Number(inst.gainDb) || 0,
      polarity: Number(inst.polarity) || 0,
      positionSource: inst.positionSource || null,
      legacyGroup: inst.legacyGroup || null,
      symmetryLinkId: inst.symmetryLinkId || null,
    })),
    // ACTIVE optimisation subset — only enabled instances
    instanceIds: activeInstances.map((inst) => inst.id),
    models: activeInstances.map((inst) => normaliseModelKey(inst.model || selectedSubModel)),
    positions,
    rotation: activeInstances.map((inst) => Number(inst.rotationDeg) || 0),
    bottomHeightM: activeInstances.map((inst) => Number(inst.bottomHeightM) || 0),
    tuning,
    eqSignature: currentAuthority?.canonicalAuthorityReceipt?.filterBankSignature || null,
    currentP14: currentAuthority?.p14AchievedLevel
      || currentAuthority?.contract?.productAnalysis?.parameters?.p14?.achievedLevel
      || null,
    currentP18: currentAuthority?.p18AchievedLevel || null,
    currentP19: currentAuthority?.achievedP19Level || null,
    currentP20: currentAuthority?.achievedP20Level || null,
    perSeatP19: currentAuthority?.perSeatP19 || [],
    perSeatP20: currentAuthority?.perSeatP20 || [],
    p14TargetBasis,
    p14TargetLevel,
    p14TargetDb,
    p18TargetBasis,
    mutedInfo,
    fingerprint: currentAuthority?.canonicalAuthorityReceipt?.filterBankSignature || null,
  };
}

// ---------------------------------------------------------------------------
// Candidate gathering (BLOCKER 2: Current excluded from search candidates)
// ---------------------------------------------------------------------------

function buildCurrentFinalist(subwooferInstances, roomDims) {
  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  if (W <= 0 || L <= 0) return null;

  const instances = (Array.isArray(subwooferInstances) ? subwooferInstances : [])
    .filter((s) => s.enabled !== false);
  if (!instances.length) return null;

  return {
    id: "current-design",
    familyId: "current",
    sources: instances.map((inst) => ({
      xNorm: (Number(inst.position?.x) || 0) / W,
      yNorm: (Number(inst.position?.y) || 0) / L,
    })),
  };
}

/**
 * Gather CHALLENGER candidates from Stage 2 finalists.
 * BLOCKER 2: Current is NOT included in the search candidates. It is handled
 * separately as a fixed control — either reused from existing authority or
 * canonically recalculated with installed tuning.
 */
export function gatherCandidates({
  subwooferInstances,
  roomDims,
  stage2Result,
  placementFingerprint,
}) {
  const candidates = [];
  const currentFinalist = buildCurrentFinalist(subwooferInstances, roomDims);
  const quantity = currentFinalist?.sources?.length;

  const stage2Finalists = extractStage2Finalists(stage2Result, quantity, roomDims);
  // FIX 1: Use the P14-independent placementFingerprint (stage2-place:v3:) for
  // raw-transfer cache retrieval — NOT the P14-dependent combined stage2
  // fingerprint. The cache is keyed by placementFingerprint; using the wrong
  // key produces a 100% cache miss.
  const cachedTransfers = placementFingerprint
    ? getCachedRawTransfersForFingerprint(placementFingerprint)
    : new Map();

  for (const finalist of stage2Finalists) {
    if (isSamePlacement(finalist, currentFinalist, roomDims)) continue;
    const cached = cachedTransfers.get(finalist.id);
    candidates.push({
      id: finalist.id,
      finalist,
      isCurrent: false,
      rawTransfer: cached || null,
    });
  }

  return candidates;
}

function extractStage2Finalists(stage2Result, quantity, roomDims) {
  if (!stage2Result) return [];
  const result = quantity === 1
    ? stage2Result.one_sub_result
    : quantity === 2
      ? stage2Result.two_sub_result
      : quantity === 4
        ? stage2Result.four_sub_result
        : null;
  // FIX: Stage 2 publishes `evaluatedFinalists` (canonical confirmation results),
  // not `finalists`. Reading `finalists` produced zero global challengers reaching
  // final optimisation. Map evaluatedFinalists to the {id, sources} format that
  // gatherCandidates expects, reconstructing normalised sources from coordinates.
  if (!result?.evaluatedFinalists) return [];
  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  const seen = new Set();
  const mapped = [];
  for (const f of result.evaluatedFinalists) {
    if (!f) continue;
    const id = f.finalistId || f.id;
    if (!id || seen.has(id)) continue;
    const coords = Array.isArray(f.coordinates) ? f.coordinates : null;
    if (!coords || coords.length !== quantity) continue;
    seen.add(id);
    const sources = (W > 0 && L > 0)
      ? coords.map((c) => ({ xNorm: Number(c.x) / W, yNorm: Number(c.y) / L }))
      : coords.map(() => ({ xNorm: 0, yNorm: 0 }));
    mapped.push({ ...f, id, sources });
  }
  return mapped;
}

export function isSamePlacement(finalist, currentFinalist, roomDims) {
  if (!currentFinalist?.sources?.length || !finalist?.sources?.length) return false;
  if (finalist.sources.length !== currentFinalist.sources.length) return false;
  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  const tolerance = 0.01;
  for (let i = 0; i < finalist.sources.length; i++) {
    const fx = finalist.sources[i].xNorm * W;
    const fy = finalist.sources[i].yNorm * L;
    const cx = currentFinalist.sources[i].xNorm * W;
    const cy = currentFinalist.sources[i].yNorm * L;
    if (Math.abs(fx - cx) > tolerance || Math.abs(fy - cy) > tolerance) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Worker helper
// ---------------------------------------------------------------------------

// runInWorker is imported from improveBassV2WorkerLifecycle.js — it provides
// cancellation, per-call watchdog, and single-settlement guarantee.

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, YIELD_DELAY_MS));
}

// ---------------------------------------------------------------------------
// Proxy search (delay + polarity + trim) — CHALLENGERS ONLY
// ---------------------------------------------------------------------------

function runProxySearch(candidate) {
  const rawTransfer = candidate.rawTransfer;
  if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length) return null;

  const rspTransfers = rawTransfer.perSourcePerSeatComplexTransfers.filter((t) => t.seatId === "rsp");
  if (!rspTransfers.length) return null;

  const sources = rawTransfer.sources || [];
  const sourceCount = sources.length;
  if (sourceCount <= 1) {
    return {
      tuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }],
      delays: [0], gains: [0], polarities: [0], score: Infinity,
    };
  }

  const delayResult = searchDelayOnly(rspTransfers, sources);
  const bestDelays = delayResult.finalists[0]?.delays || new Array(sourceCount).fill(0);

  const polarityResult = searchPolarity(rspTransfers, bestDelays, null);
  const bestPolarities = polarityResult.polarities;

  const trimResult = searchGainOnly(rspTransfers, sources, bestDelays, bestPolarities);
  const bestGains = trimResult.finalists[0]?.gains || new Array(sourceCount).fill(0);

  const tuning = [];
  for (let i = 0; i < sourceCount; i++) {
    tuning.push({
      delayMs: bestDelays[i] || 0,
      gainDb: bestGains[i] || 0,
      polarity: bestPolarities[i] || 0,
    });
  }

  const proxyMetrics = computeProxyMetrics(rawTransfer, tuning);

  return {
    tuning, delays: bestDelays, gains: bestGains, polarities: bestPolarities,
    score: trimResult.finalists[0]?.score || Infinity,
    proxyP19: proxyMetrics.proxyP19,
    proxyP20: proxyMetrics.proxyP20,
    proxyBalanced: proxyMetrics.proxyBalanced,
  };
}

// ---------------------------------------------------------------------------
// Proxy metrics (P19/P20 cheap diagnostics for promotion only)
// ---------------------------------------------------------------------------

function computeProxyMetrics(rawTransfer, tuning) {
  const defaultResult = { proxyP19: Infinity, proxyP20: Infinity, proxyBalanced: Infinity };
  if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length) return defaultResult;
  if (!Array.isArray(tuning) || !tuning.length) return defaultResult;

  const seatIds = rawTransfer.seatIds || [];
  if (!seatIds.length) return defaultResult;

  const seatResponses = resumWithTuning(
    rawTransfer.perSourcePerSeatComplexTransfers,
    tuning,
    seatIds,
  );

  let worstSeatPeakToPeak = 0;
  let rspPeakToPeak = Infinity;

  for (const seatId of seatIds) {
    const response = seatResponses[seatId];
    if (!response?.freqsHz?.length) continue;

    const spls = [];
    for (let i = 0; i < response.freqsHz.length; i++) {
      const freq = response.freqsHz[i];
      if (freq >= PROXY_SCORE_MIN_HZ && freq <= PROXY_SCORE_MAX_HZ) {
        spls.push(response.splDb[i]);
      }
    }
    if (!spls.length) continue;

    const peakToPeak = Math.max(...spls) - Math.min(...spls);
    if (seatId === "rsp") {
      rspPeakToPeak = peakToPeak;
    } else {
      if (peakToPeak > worstSeatPeakToPeak) worstSeatPeakToPeak = peakToPeak;
    }
  }

  if (worstSeatPeakToPeak === 0 && Number.isFinite(rspPeakToPeak)) {
    worstSeatPeakToPeak = rspPeakToPeak;
  }

  const proxyP19 = worstSeatPeakToPeak;
  const proxyP20 = rspPeakToPeak;
  const proxyBalanced = Math.max(proxyP19, proxyP20);

  return { proxyP19, proxyP20, proxyBalanced };
}

// ---------------------------------------------------------------------------
// Promotion (CHALLENGERS ONLY — Current is never promoted/searched)
// ---------------------------------------------------------------------------

function promoteChallengers(candidates, maxChallengers) {
  const challengers = candidates
    .filter((c) => !c.isCurrent && c.proxyResult)
    .map((c) => ({
      ...c,
      proxyP19: c.proxyResult.proxyP19 ?? Infinity,
      proxyP20: c.proxyResult.proxyP20 ?? Infinity,
      proxyBalanced: c.proxyResult.proxyBalanced ?? Infinity,
    }));

  if (!challengers.length) return [];

  const promoted = [];
  const promotedIds = new Set();

  function tryAdd(candidate) {
    if (!candidate || promotedIds.has(candidate.id)) return false;
    if (promoted.length >= maxChallengers) return false;
    promoted.push(candidate);
    promotedIds.add(candidate.id);
    return true;
  }

  const bestP19 = challengers.reduce((best, c) =>
    c.proxyP19 < best.proxyP19 ? c : best
  );
  tryAdd(bestP19);

  const bestP20 = challengers.reduce((best, c) =>
    c.proxyP20 < best.proxyP20 ? c : best
  );
  tryAdd(bestP20);

  const bestBalanced = challengers.reduce((best, c) =>
    c.proxyBalanced < best.proxyBalanced ? c : best
  );
  tryAdd(bestBalanced);

  const seenFamilies = new Set(promoted.map((p) => p.finalist?.familyId));
  const byFamilyDiversity = [...challengers]
    .filter((c) => !promotedIds.has(c.id))
    .sort((a, b) => a.proxyBalanced - b.proxyBalanced);
  for (const ch of byFamilyDiversity) {
    if (promoted.length >= maxChallengers) break;
    const family = ch.finalist?.familyId || "unknown";
    if (!seenFamilies.has(family)) {
      tryAdd(ch);
      seenFamilies.add(family);
    }
  }

  if (promoted.length < maxChallengers) {
    const remaining = challengers
      .filter((c) => !promotedIds.has(c.id))
      .sort((a, b) => a.proxyBalanced - b.proxyBalanced);
    for (const ch of remaining) {
      if (promoted.length >= maxChallengers) break;
      tryAdd(ch);
    }
  }

  return promoted;
}

// ---------------------------------------------------------------------------
// Winner selection with primary-seat protection
// ---------------------------------------------------------------------------

export function selectWinnerWithProtection(confirmedResults, snapshot, existingAuthority) {
  // BLOCKER 4: If no confirmed results and no existing authority, NO_WINNER.
  if (!confirmedResults.length && !existingAuthority) {
    return {
      isCurrent: true,
      winner: null,
      message: "No safer automatic improvement found — current design retained",
      confirmedResults,
      currentResult: null,
    };
  }

  const challengerResults = confirmedResults.filter((r) => !r.isCurrent);

  // BLOCKER 2: Use the existing authority as the Current control when available.
  // The existing authority is the REAL current design's canonical result.
  const useExistingAuthority = !!existingAuthority;

  const currentLayout = useExistingAuthority
    ? {
        metrics: {
          perSeatP19: existingAuthority.perSeatP19 || [],
          perSeatP20: existingAuthority.perSeatP20 || [],
          achievedP19VariationDb: existingAuthority.achievedP19VariationDb,
          achievedP19Level: existingAuthority.achievedP19Level,
          achievedP20VariationDb: existingAuthority.achievedP20VariationDb,
          achievedP20Level: existingAuthority.achievedP20Level,
          p18AchievedLevel: existingAuthority.p18AchievedLevel,
          achievedP18Hz: existingAuthority.achievedP18Hz,
          p14AchievedLevel: existingAuthority.p14AchievedLevel,
          p14AchievedDb: existingAuthority.p14AchievedDb,
        },
        sources: (snapshot.positions || []).map((pos, i) => ({
          id: snapshot.instanceIds?.[i] || `sub-${i + 1}`,
          tuning: snapshot.tuning?.[i] || { gainDb: 0 },
        })),
      }
    : null;

  // If there's a canonically recalculated Current (from confirmation), use it
  // for the layout. Otherwise use the existing authority.
  const recalculatedCurrent = confirmedResults.find((r) => r.isCurrent);
  if (recalculatedCurrent) {
    currentLayout.metrics = {
      perSeatP19: recalculatedCurrent.perSeatP19 || [],
      perSeatP20: recalculatedCurrent.perSeatP20 || [],
      achievedP19VariationDb: recalculatedCurrent.achievedP19VariationDb,
      achievedP19Level: recalculatedCurrent.achievedP19Level,
      achievedP20VariationDb: recalculatedCurrent.achievedP20VariationDb,
      achievedP20Level: recalculatedCurrent.achievedP20Level,
      p18AchievedLevel: recalculatedCurrent.p18AchievedLevel,
      achievedP18Hz: recalculatedCurrent.achievedP18Hz,
      p14AchievedLevel: recalculatedCurrent.p14AchievedLevel,
      p14AchievedDb: recalculatedCurrent.p14AchievedDb,
    };
  }

  // BLOCKER 4: No challengers → NO_WINNER (Current retained)
  if (!challengerResults.length) {
    return {
      isCurrent: true,
      winner: null,
      message: "No safer automatic improvement found — current design retained",
      confirmedResults,
      currentResult: recalculatedCurrent || existingAuthority,
    };
  }

  const quantityResult = {
    evaluatedFinalists: challengerResults.map((r) => ({
      ...r,
      finalistId: r.candidateId || r.finalistId,
    })),
  };

  const selection = selectAuthoritativeFinalist(quantityResult, null, currentLayout);

  if (selection.isCurrent || !selection.winner) {
    return {
      isCurrent: true,
      winner: null,
      message: "No safer automatic improvement found — current design retained",
      confirmedResults,
      currentResult: recalculatedCurrent || existingAuthority,
    };
  }

  const winnerResult = selection.winner;
  const currentForRegression = recalculatedCurrent || existingAuthority;
  if (currentForRegression) {
    const regression = hasPrimarySeatRegression(winnerResult, currentForRegression);
    if (regression.regressed) {
      return {
        isCurrent: true,
        winner: null,
        message: "No safer automatic improvement found — current design retained",
        rejectionReason: `Candidate improved headline but damaged primary seat ${regression.seatId} ${regression.parameter} (L${regression.currentLevel} → L${regression.candidateLevel})`,
        confirmedResults,
        currentResult: currentForRegression,
      };
    }
  }

  // Enforce the canonical material-improvement gate: a candidate that fails
  // isMaterialImprovement MUST NOT become the visible recommendation, even if
  // it ranks first among weak candidates. The correct outcome is then
  // "No verified material automatic improvement found".
  if (existingAuthority && winnerResult) {
    const matCheck = isMaterialImprovement(existingAuthority, winnerResult);
    if (!matCheck.material) {
      return {
        isCurrent: true,
        winner: null,
        message: "No verified material automatic improvement found",
        materialityReason: matCheck.reason,
        confirmedResults,
        currentResult: currentForRegression,
      };
    }
    return {
      isCurrent: false,
      winner: winnerResult,
      message: null,
      confirmedResults,
      currentResult: currentForRegression,
      materialityReason: matCheck.reason,
    };
  }

  return {
    isCurrent: false,
    winner: winnerResult,
    message: null,
    confirmedResults,
    currentResult: currentForRegression,
    materialityReason: null,
  };
}

// ---------------------------------------------------------------------------
// Stage 11B: Iterative position escalation is now in improveBassV2Escalation.js
// The engine calls runPositionScreenPhase per phase, with canonical
// confirmation and materiality testing between each phase.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

export async function runImproveBassV2(projectId, params, callbacks) {
  const { onProgress, isCancelled, onBestSoFar, getCurrentFingerprint } = callbacks;
  const {
    subwooferInstances, roomDims, seatingPositions, rspPosition,
    selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
    p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
    currentAuthority, liveCacheKey, stage2Result, placementFingerprint,
  } = params;

  const worker = new Worker(new URL("./improveBassV2.worker.js", import.meta.url), { type: "module" });

  // ── Run-owned AbortController (interruption mechanism) ──────────────────
  // The store remains the write authority for cancellation. The AbortController
  // is only the run-local interruption mechanism — it provides immediate worker
  // termination when the user cancels or the whole-run deadline expires.
  // Stale detection remains completely separate (isStale does NOT check signal).
  const controller = new AbortController();
  const metrics = new V2RuntimeMetrics(projectId);

  // Subscribe to the V2 store for this project. When cancelRequested becomes
  // true, abort the controller immediately (synchronous — same call stack as
  // the user's click). Unsubscribe in finally.
  const storeListener = () => {
    const st = getImproveBassV2State(projectId);
    if (st?.cancelRequested === true && !controller.signal.aborted) {
      controller.abort();
    }
  };
  const unsubscribe = subscribeImproveBassV2(storeListener);

  // Whole-run elapsed timer. Uses the same AbortController as the interruption
  // mechanism, but with a distinct V2RunTimeoutError reason so the engine can
  // classify it as canonical error, not cancelled.
  // TODO: replace with measured production threshold after Room B/C browser
  // runtime validation.
  let wholeRunTimer = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new V2RunTimeoutError(
        `V2 whole-run exceeded ${V2_WHOLE_RUN_TIMEOUT_MS_PROVISIONAL}ms provisional limit`,
      ));
    }
  }, V2_WHOLE_RUN_TIMEOUT_MS_PROVISIONAL);

  const startFingerprint = computeV2DesignFingerprint({
    subwooferInstances, roomDims, seatingPositions, rspPosition,
    selectedSubModel, p14TargetBasis, p14TargetLevel, p14TargetDb,
  });

  function isStale() {
    if (!getCurrentFingerprint) return false;
    const current = getCurrentFingerprint();
    if (!current) return false;
    return current !== startFingerprint;
  }

  try {
    // Phase 1: Reviewing current design
    onProgress("reviewing", "Reviewing current design", 0, 1);
    const snapshot = snapshotCurrentDesign({
      subwooferInstances, roomDims, selectedSubModel, currentAuthority,
      p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
    });

    // BLOCKER 1 + BLOCKER 2: Check if the existing production authority is
    // non-stale. If so, reuse it as the Current control — do NOT recalculate
    // or retune Current. The existing authority is the REAL current design's
    // canonical result with actual positions, tuning, and metrics.
    // FIX 2: Consume the production-resolved live authority condition.
    // The production path (BassBackgroundAnalysisOwner) already compares
    // completedBassAuthority.currentFingerprint against the live cacheKey
    // (buildBassResultCacheKey(calibrationFingerprint)) via its stale-detection
    // effect. When authoritative === true AND currentFingerprint === liveCacheKey,
    // the persisted authority belongs to the live design. V2 must NOT
    // reconstruct a partial calibration fingerprint — it consumes the
    // production-resolved condition directly.
    const authorityNonStale = isCurrentAuthorityNonStale(currentAuthority, liveCacheKey);
    const existingAuthority = authorityNonStale
      ? extractAuthorityForComparison(currentAuthority)
      : null;
    metrics.recordCurrentReuse(authorityNonStale);
    metrics.recordPlacementFingerprint(placementFingerprint);

    await yieldToUI();
    if (isCancelled()) return { status: "cancelled", snapshot };
    if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

    // ── Phase 1.5: Calibration-only search on Current positions (Stage 11A) ─
    // Search delay/polarity/trim on the CURRENT installed positions before any
    // physical movement. Produces the "Recommended Calibration" tier (B).
    let calibrationResult = null;
    let calibrationMaterial = null;
    let calibrationTuning = null;

    try {
      onProgress("calibrating", "Searching calibration improvements", 0, 2);
      const currentFinalist = buildCurrentFinalist(subwooferInstances, roomDims);
      if (currentFinalist) {
        // Get or compute Current's raw transfers (zero tuning)
        let currentRawTransfer = null;
        const cachedTransfers = placementFingerprint
          ? getCachedRawTransfersForFingerprint(placementFingerprint)
          : new Map();
        for (const [fid, transfer] of cachedTransfers.entries()) {
          if (!transfer?.sources) continue;
          if (transfer.sources.length !== currentFinalist.sources.length) continue;
          if (isSamePlacement({ sources: transfer.sources }, currentFinalist, roomDims)) {
            if (transfer.selectedProduct && normaliseModelKey(selectedSubModel) !== transfer.selectedProduct) continue;
            currentRawTransfer = transfer;
            break;
          }
        }

        if (!currentRawTransfer) {
          const _calT0 = typeof performance !== "undefined" ? performance.now() : Date.now();
          currentRawTransfer = await runInWorker(worker, "placement", {
            finalist: currentFinalist,
            roomDims, rspPosition, seatingPositions,
            selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
          }, controller.signal);
          metrics.recordWorkerCall("placement", "calibration-current",
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - _calT0, false);
        } else {
          metrics.recordStage2TransferReused();
        }

        if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

        // Run combined delay + polarity + trim search on Current's raw transfers
        const calibrationSearch = runCalibrationOnlySearch(currentRawTransfer);
        onProgress("calibrating", "Searching calibration improvements", 1, 2);

        if (calibrationSearch?.bestTuning) {
          // Confirm through the full canonical chain (EQ, P14, P18, P19, P20)
          const _confirmT0 = typeof performance !== "undefined" ? performance.now() : Date.now();
          const calibrationConfirmation = await runInWorker(worker, "confirmation", {
            rawTransfer: currentRawTransfer,
            tuning: calibrationSearch.bestTuning,
            tuningVariant: "delay-polarity-trim",
            p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
          }, controller.signal);
          metrics.recordWorkerCall("confirmation", "calibration",
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - _confirmT0, false);

          if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

          if (calibrationConfirmation) {
            calibrationConfirmation.candidateId = "calibration-only";
            calibrationConfirmation.isCurrent = true;
            calibrationConfirmation.appliedTuning = calibrationSearch.bestTuning;
            calibrationTuning = calibrationSearch.bestTuning;
            calibrationResult = calibrationConfirmation;

            // Apply materiality gate against installed tuning
            if (existingAuthority) {
              calibrationMaterial = isMaterialImprovement(existingAuthority, calibrationConfirmation);
            } else {
              // No existing authority — first calibration result, always show it
              calibrationMaterial = { material: true, reason: "First calibration result" };
            }
          }
        }
      }
    } catch (err) {
      if (isFatalLifecycleError(err)) throw err;
      // Calibration-only search failed — continue with challenger flow
    }

    onProgress("calibrating", "Searching calibration improvements", 2, 2);
    await yieldToUI();
    if (isCancelled()) return { status: "cancelled", snapshot };
    if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

    // ── Phase 2: Gather global Stage 2 candidates (GLOBAL challengers) ──
    // These are the existing geometric finalist search results — they give
    // the engine the ability to discover that the best answer is not merely
    // a small movement around Current. They compete under the SAME canonical
    // winner selection as local position candidates.
    onProgress("testing_positions", "Testing recommended positions", 0, 1);
    let allCandidates = tagGlobalCandidates(
      gatherCandidates({ subwooferInstances, roomDims, stage2Result, placementFingerprint })
    );

    // Compute raw transfers for global candidates (cached or worker)
    for (let i = 0; i < allCandidates.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot };
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      onProgress("testing_positions", `Testing recommended positions (${i + 1}/${allCandidates.length})`, i, allCandidates.length);
      if (!allCandidates[i].rawTransfer) {
        try {
          const _t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
          allCandidates[i].rawTransfer = await runInWorker(worker, "placement", {
            finalist: allCandidates[i].finalist,
            roomDims, rspPosition, seatingPositions,
            selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
          }, controller.signal);
          metrics.recordWorkerCall("placement", allCandidates[i].id,
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - _t0, false);
        } catch (err) {
          if (isFatalLifecycleError(err)) throw err;
          allCandidates[i].rawTransfer = null;
          allCandidates[i].error = err.message;
        }
      } else {
        metrics.recordStage2TransferReused();
      }
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      await yieldToUI();
    }

    // Proxy search (delay + polarity + trim) for global candidates
    // BLOCKER 2: Current NEVER enters the proxy search.
    for (let i = 0; i < allCandidates.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot };
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      const _proxyT0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      allCandidates[i].proxyResult = runProxySearch(allCandidates[i]);
      metrics.recordProxySearch(allCandidates[i].id,
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - _proxyT0);
      onProgress("testing_positions", `Optimising timing (${i + 1}/${allCandidates.length})`, i + 1, allCandidates.length);
      await yieldToUI();
    }

    // ── Confirm Current (if no existing authority) ──────────────────────
    // BLOCKER 2: If no valid authority exists, canonically recalculate Current
    // with the EXACT installed tuning (no proxy optimisation).
    const confirmedResults = [];
    if (!authorityNonStale) {
      if (isCancelled()) return { status: "cancelled", snapshot };
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      try {
        const currentFinalist = buildCurrentFinalist(subwooferInstances, roomDims);
        if (currentFinalist) {
          let currentRawTransfer = null;
          const cachedTransfers = placementFingerprint
            ? getCachedRawTransfersForFingerprint(placementFingerprint)
            : new Map();
          for (const [fid, transfer] of cachedTransfers.entries()) {
            if (!transfer?.sources) continue;
            if (transfer.sources.length !== currentFinalist.sources.length) continue;
            if (isSamePlacement({ sources: transfer.sources }, currentFinalist, roomDims)) {
              if (transfer.selectedProduct && normaliseModelKey(selectedSubModel) !== transfer.selectedProduct) continue;
              currentRawTransfer = transfer;
              break;
            }
          }
          if (!currentRawTransfer) {
            const _t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
            currentRawTransfer = await runInWorker(worker, "placement", {
              finalist: currentFinalist,
              roomDims, rspPosition, seatingPositions,
              selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
            }, controller.signal);
            metrics.recordWorkerCall("placement", "current",
              (typeof performance !== "undefined" ? performance.now() : Date.now()) - _t0, false);
          } else {
            metrics.recordStage2TransferReused();
          }
          if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

          const installedTuning = (snapshot.tuning || []).map((t) => ({
            delayMs: Number(t.delayMs) || 0,
            gainDb: Number(t.gainDb) || 0,
            polarity: Number(t.polarity) || 0,
          }));

          const _confirmT0 = typeof performance !== "undefined" ? performance.now() : Date.now();
          const currentConfirmation = await runInWorker(worker, "confirmation", {
            rawTransfer: currentRawTransfer,
            tuning: installedTuning,
            tuningVariant: "delay-polarity-trim",
            p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
          }, controller.signal);
          metrics.recordWorkerCall("confirmation", "current",
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - _confirmT0, false);
          if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

          if (currentConfirmation) {
            currentConfirmation.candidateId = "current";
            currentConfirmation.isCurrent = true;
            currentConfirmation.appliedTuning = installedTuning;
            confirmedResults.push(currentConfirmation);
          }
        }
      } catch (err) {
        if (isFatalLifecycleError(err)) throw err;
      }
      await yieldToUI();
    }

    // ── Stage 11B: Iterative position escalation ────────────────────────
    // Symmetric → confirm → test materiality → only if not material:
    // Asymmetric pair → confirm → test → only if not material:
    // Individual → confirm → final winner selection.
    //
    // Each phase generates many candidates, fast-screens them, and promotes
    // only 2-3 into the expensive V2 pipeline. The funnel ensures
    // FULL_STAGE2_PLACEMENT_EVALUATIONS correspond to promoted candidates,
    // NOT generated local candidates.
    let materialSubImprovementFound = false;
    let subOptimisationExhausted = false;
    const phasesRun = [];
    const funnel = {};
    let cabinetDims = { widthM: 0.5, depthM: 0.3, heightM: 0.5 };

    try {
      const cabinetMeta = getSpeakerModelMeta(selectedSubModel);
      cabinetDims = {
        widthM: Number(cabinetMeta?.widthM) || 0.5,
        depthM: Number(cabinetMeta?.depthM) || 0.3,
        heightM: Number(cabinetMeta?.heightM) || 0.5,
      };
    } catch { /* registry lookup failed — use defaults */ }

    const currentPositions = (snapshot.positions || []).map((p) => ({ x: p.x, y: p.y }));

    const escalationPhases = [
      { name: "symmetric", label: "Testing symmetric movements", confirmLabel: "Confirming symmetric solutions" },
      { name: "asymmetric-pair", label: "Testing alternative positions", confirmLabel: "Confirming alternative solutions" },
      { name: "individual", label: "Testing final position options", confirmLabel: "Confirming final solution" },
    ];

    for (const escPhase of escalationPhases) {
      if (isCancelled()) return { status: "cancelled", snapshot, bestSoFar: confirmedResults };
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded", bestSoFar: confirmedResults };

      const funnelKey = escPhase.name === "asymmetric-pair" ? "asymmetricPair" : escPhase.name;

      // ── Generate + screen + promote (fast batch modal — NO full simulation)
      setPositionSearchPhase(projectId, escPhase.name);
      onProgress(`screening_${escPhase.name}`, escPhase.label, 0, 1);

      let phaseResult;
      try {
        phaseResult = runPositionScreenPhase(
          escPhase.name, currentPositions, roomDims, cabinetDims,
          seatingPositions, rspPosition, subwooferBottomHeightM,
        );
      } catch (err) {
        if (isFatalLifecycleError(err)) throw err;
        phaseResult = { promoted: [], funnel: { generated: 0, screened: 0, promotedToV2: 0 }, timingMs: 0 };
      }

      funnel[funnelKey] = { ...phaseResult.funnel, confirmed: 0 };
      phasesRun.push(escPhase.name);

      onProgress(`screening_${escPhase.name}`,
        phaseResult.promoted.length > 0
          ? `${escPhase.label} (${phaseResult.funnel.generated} generated, ${phaseResult.funnel.promotedToV2} promoted)`
          : `${escPhase.label} (no valid candidates)`,
        1, 1);
      await yieldToUI();

      if (phaseResult.promoted.length === 0) continue;

      // ── Compute raw transfers for promoted local candidates (worker)
      for (const c of phaseResult.promoted) {
        if (isCancelled()) return { status: "cancelled", snapshot, bestSoFar: confirmedResults };
        if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded", bestSoFar: confirmedResults };
        try {
          const _t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
          c.rawTransfer = await runInWorker(worker, "placement", {
            finalist: c.finalist,
            roomDims, rspPosition, seatingPositions,
            selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
          }, controller.signal);
          metrics.recordWorkerCall("placement", c.id,
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - _t0, false);
        } catch (err) {
          if (isFatalLifecycleError(err)) throw err;
          c.rawTransfer = null;
          c.error = err.message;
        }
        await yieldToUI();
      }

      // ── Proxy search (delay + polarity + trim) for new local candidates
      for (const c of phaseResult.promoted) {
        if (isCancelled()) return { status: "cancelled", snapshot, bestSoFar: confirmedResults };
        const _proxyT0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        c.proxyResult = runProxySearch(c);
        metrics.recordProxySearch(c.id,
          (typeof performance !== "undefined" ? performance.now() : Date.now()) - _proxyT0);
        await yieldToUI();
      }

      // ── Merge into unified candidate pool
      allCandidates = [...allCandidates, ...phaseResult.promoted];

      // ── Promote from merged pool (global + all local so far)
      const promoted = promoteChallengers(allCandidates, MAX_CHALLENGERS);

      // ── Confirm only NEW promoted candidates (skip already-confirmed)
      const confirmedIds = new Set(confirmedResults.map((r) => r.candidateId));
      const newPromoted = promoted.filter((p) => !confirmedIds.has(p.id));

      onProgress(`confirming_${escPhase.name}`, escPhase.confirmLabel, 0, newPromoted.length);
      let phaseConfirmedCount = 0;

      for (let i = 0; i < newPromoted.length; i++) {
        if (isCancelled()) return { status: "cancelled", snapshot, bestSoFar: confirmedResults };
        if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded", bestSoFar: confirmedResults };
        try {
          const _t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
          const result = await runInWorker(worker, "confirmation", {
            rawTransfer: newPromoted[i].rawTransfer,
            tuning: newPromoted[i].proxyResult?.tuning,
            tuningVariant: "delay-polarity-trim",
            p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
          }, controller.signal);
          metrics.recordWorkerCall("confirmation", newPromoted[i].id,
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - _t0, false);
          if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded", bestSoFar: confirmedResults };
          if (result) {
            result.candidateId = newPromoted[i].id;
            result.isCurrent = false;
            result.appliedTuning = newPromoted[i].proxyResult?.tuning;
            // Carry position candidate metadata through confirmation
            if (newPromoted[i].isPositionCandidate) {
              result.isPositionCandidate = true;
              result.positionPhase = newPromoted[i].phase;
              result.movementDescription = newPromoted[i].movement;
              result.positionCoordinates = newPromoted[i].coordinates;
              result.candidateOrigin = newPromoted[i].candidateOrigin;
            } else {
              result.candidateOrigin = newPromoted[i].candidateOrigin || "global-placement";
            }
            confirmedResults.push(result);
            phaseConfirmedCount++;
            metrics.recordChallengerConfirmed();
            onBestSoFar({ result, candidate: newPromoted[i] });
          }
        } catch (err) {
          if (isFatalLifecycleError(err)) throw err;
        }
        onProgress(`confirming_${escPhase.name}`, `${escPhase.confirmLabel} (${i + 1}/${newPromoted.length})`, i + 1, newPromoted.length);
        await yieldToUI();
      }

      funnel[funnelKey].confirmed = phaseConfirmedCount;

      // ── Check CANONICAL materiality — proxy does NOT decide this
      if (existingAuthority) {
        const matCheck = checkPhaseMateriality(confirmedResults, existingAuthority);
        if (matCheck.material) {
          materialSubImprovementFound = true;
          break; // STOP escalation — material improvement found
        }
      }
    }

    // BLOCKER 7: Final stale + cancel checks before publishing winner
    if (isCancelled()) return { status: "cancelled", snapshot, bestSoFar: confirmedResults };
    if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded", bestSoFar: confirmedResults };

    // ── Phase 8: Final single winner selection ───────────────────────────
    onProgress("finalising", "Finalising recommendation", 0, 1);
    const selection = selectWinnerWithProtection(confirmedResults, snapshot, existingAuthority);
    await yieldToUI();

    // BLOCKER 4: If selection is null/undefined, return NO_WINNER explicitly
    if (!selection) {
      return {
        status: "complete",
        selection: {
          isCurrent: true,
          winner: null,
          message: "No safer automatic improvement found — current design retained",
          confirmedResults,
          currentResult: existingAuthority,
        },
        snapshot,
        confirmedResults,
      };
    }

    // Stage 11A: Attach calibration-only result to the selection
    if (calibrationResult) {
      selection.calibrationResult = calibrationResult;
      selection.calibrationMaterial = calibrationMaterial;
      selection.calibrationTuning = calibrationTuning;
    }

    // Stage 11B: Build per-phase exhaustion state from the unified winner
    const positionOpt = buildPositionOptimisationState(phasesRun, funnel, existingAuthority, selection.winner);
    materialSubImprovementFound = positionOpt.materialSubImprovementFound;
    subOptimisationExhausted = positionOpt.subOptimisationExhausted;
    setPositionExhaustion(projectId, subOptimisationExhausted, materialSubImprovementFound, selection.winner);
    selection.positionOptimisation = positionOpt;

    return { status: "complete", selection, snapshot, confirmedResults };
  } catch (error) {
    // AbortError = user cancellation → canonical cancelled.
    // V2RunTimeoutError / V2TimeoutError / generic Error → canonical error.
    if (error?.name === "AbortError") {
      return { status: "cancelled", snapshot: null };
    }
    return { status: "error", error: error.message, snapshot: null };
  } finally {
    // ── Cleanup: no leaked timer, listener, subscription, or worker ────────
    unsubscribe();
    if (wholeRunTimer) { clearTimeout(wholeRunTimer); wholeRunTimer = null; }
    metrics.finish();
    metrics.logReport();
    try { worker.terminate(); } catch { /* idempotent on already-terminated worker */ }
  }
}

/**
 * Extract the relevant fields from the completed bass authority contract
 * for use as the Current control in winner selection (BLOCKER 1).
 *
 * BLOCKER 1 FIX: Reads from the REAL production contract structure:
 *   - Per-seat: contract.selectedCandidate.perSeatP19Results / perSeatP20Results
 *   - Headline: contract.productAnalysis.parameters.p19/p20/p18/p14
 *
 * Maps perSeatP19Results → perSeatP19 (and perSeatP20Results → perSeatP20)
 * so hasPrimarySeatRegression can consume them with its existing field names.
 *
 * Returns null if the contract lacks the required per-seat data.
 */
function extractAuthorityForComparison(currentAuthority) {
  if (!currentAuthority?.contract) return null;
  const contract = currentAuthority.contract;
  const selectedCandidate = contract.selectedCandidate || {};

  // BLOCKER 1: Read per-seat from the REAL production structure
  const perSeatP19Results = Array.isArray(selectedCandidate.perSeatP19Results)
    ? selectedCandidate.perSeatP19Results
    : [];
  const perSeatP20Results = Array.isArray(selectedCandidate.perSeatP20Results)
    ? selectedCandidate.perSeatP20Results
    : [];
  if (perSeatP19Results.length === 0 || perSeatP20Results.length === 0) return null;

  // Map perSeatP19Results → perSeatP19 (field names are compatible:
  // both have seatId, isPrimary, level, variationDbRaw)
  const perSeatP19 = perSeatP19Results.map((s) => ({
    seatId: s.seatId,
    isPrimary: s.isPrimary || false,
    level: s.level,
    variationDbRaw: s.variationDbRaw,
    worstFrequencyHz: s.worstFrequencyHz,
  }));
  const perSeatP20 = perSeatP20Results.map((s) => ({
    seatId: s.seatId,
    isPrimary: s.isPrimary || false,
    level: s.level,
    variationDbRaw: s.variationDbRaw,
    worstFrequencyHz: s.worstFrequencyHz,
  }));

  // Extract headline metrics from productAnalysis.parameters
  const params = contract.productAnalysis?.parameters || {};
  const p19Param = params.p19 || {};
  const p20Param = params.p20 || {};
  const p18Param = params.p18 || {};

  // P14 achieved capability: read from selectedCandidate (full contract) or
  // from productAnalysis.parameters.p14 (compact contract). In the compact
  // contract, selectedCandidate.achievedP14Db/Level are stripped during
  // compaction, but productAnalysis.parameters.p14 preserves the achieved
  // data in achievedCapabilityDb and achievedLevel (NOT in .value/.level
  // which carry the designer-selected TARGET semantics after buildBassTargetViews).
  const p14Param = contract.productAnalysis?.parameters?.p14 || {};
  const p14AchievedLevel = selectedCandidate.achievedP14Level
    ?? contract.achievedP14Level
    ?? p14Param.achievedLevel
    ?? null;
  const p14AchievedDbRaw = selectedCandidate.achievedP14Db
    ?? contract.achievedP14Db
    ?? p14Param.achievedCapabilityDb
    ?? p14Param.availableCapabilityDb
    ?? null;
  const p14AchievedDb = Number.isFinite(Number(p14AchievedDbRaw)) ? Number(p14AchievedDbRaw) : null;

  return {
    perSeatP19,
    perSeatP20,
    achievedP19VariationDb: Number.isFinite(Number(p19Param.value)) ? Number(p19Param.value) : null,
    achievedP19Level: p19Param.level ?? null,
    achievedP20VariationDb: Number.isFinite(Number(p20Param.value)) ? Number(p20Param.value) : null,
    achievedP20Level: p20Param.level ?? null,
    p18AchievedLevel: p18Param.level ?? null,
    achievedP18Hz: Number.isFinite(Number(selectedCandidate.achievedP18FrequencyHz))
      ? Number(selectedCandidate.achievedP18FrequencyHz)
      : (Number.isFinite(Number(p18Param.value)) ? Number(p18Param.value) : null),
    p14AchievedLevel,
    p14AchievedDb,
  };
}