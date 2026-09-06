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
import { computeV2DesignFingerprint, isCurrentAuthorityNonStale, extractBaseFingerprint } from "./improveBassV2Fingerprint.js";

const MAX_CHALLENGERS = 3;
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
    currentP14: currentAuthority?.p14AchievedLevel || null,
    currentP18: currentAuthority?.p18AchievedLevel || null,
    currentP19: currentAuthority?.achievedP19Level || null,
    currentP20: currentAuthority?.achievedP20Level || null,
    perSeatP19: currentAuthority?.perSeatP19 || [],
    perSeatP20: currentAuthority?.perSeatP20 || [],
    p14TargetBasis,
    p14TargetLevel,
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
  stage2Fingerprint,
}) {
  const candidates = [];
  const currentFinalist = buildCurrentFinalist(subwooferInstances, roomDims);
  const quantity = currentFinalist?.sources?.length;

  const stage2Finalists = extractStage2Finalists(stage2Result, quantity);
  const cachedTransfers = stage2Fingerprint
    ? getCachedRawTransfersForFingerprint(stage2Fingerprint)
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

function extractStage2Finalists(stage2Result, quantity) {
  if (!stage2Result) return [];
  const result = quantity === 1
    ? stage2Result.one_sub_result
    : quantity === 2
      ? stage2Result.two_sub_result
      : quantity === 4
        ? stage2Result.four_sub_result
        : null;
  if (!result?.finalists) return [];
  return result.finalists.filter((f) => f?.sources?.length === quantity);
}

function isSamePlacement(finalist, currentFinalist, roomDims) {
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

function runInWorker(worker, phase, params) {
  return new Promise((resolve, reject) => {
    const requestId = `${phase}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const handler = (event) => {
      const data = event.data || {};
      if (data.requestId !== requestId) return;
      worker.removeEventListener("message", handler);
      if (data.type === "complete") resolve(data.result);
      else reject(new Error(data.error || "Worker failed"));
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ requestId, phase, ...params });
  });
}

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

function selectWinnerWithProtection(confirmedResults, snapshot, existingAuthority) {
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

  return {
    isCurrent: false,
    winner: winnerResult,
    message: null,
    confirmedResults,
    currentResult: currentForRegression,
  };
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

export async function runImproveBassV2(projectId, params, callbacks) {
  const { onProgress, isCancelled, onBestSoFar, getCurrentFingerprint } = callbacks;
  const {
    subwooferInstances, roomDims, seatingPositions, rspPosition,
    selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
    p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
    currentAuthority, stage2Result, stage2Fingerprint,
  } = params;

  const worker = new Worker(new URL("./improveBassV2.worker.js", import.meta.url), { type: "module" });

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
      p14TargetBasis, p14TargetLevel, p18TargetBasis,
    });

    // BLOCKER 1 + BLOCKER 2: Check if the existing production authority is
    // non-stale. If so, reuse it as the Current control — do NOT recalculate
    // or retune Current. The existing authority is the REAL current design's
    // canonical result with actual positions, tuning, and metrics.
    const authorityNonStale = isCurrentAuthorityNonStale(currentAuthority, startFingerprint);
    const existingAuthority = authorityNonStale
      ? extractAuthorityForComparison(currentAuthority)
      : null;

    await yieldToUI();
    if (isCancelled()) return { status: "cancelled", snapshot };
    if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

    // Phase 2: Testing practical positions (CHALLENGERS ONLY)
    onProgress("testing_positions", "Testing practical positions", 0, 1);
    const candidates = gatherCandidates({ subwooferInstances, roomDims, stage2Result, stage2Fingerprint });

    await yieldToUI();
    if (isCancelled()) return { status: "cancelled", snapshot };
    if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

    for (let i = 0; i < candidates.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot };
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      onProgress("testing_positions", `Testing practical positions (${i + 1}/${candidates.length})`, i, candidates.length);
      if (!candidates[i].rawTransfer) {
        try {
          candidates[i].rawTransfer = await runInWorker(worker, "placement", {
            finalist: candidates[i].finalist,
            roomDims, rspPosition, seatingPositions,
            selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
          });
        } catch (err) {
          candidates[i].rawTransfer = null;
          candidates[i].error = err.message;
        }
      }
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      await yieldToUI();
    }

    // Phase 3-5: Proxy search (delay + polarity + trim) — CHALLENGERS ONLY
    // BLOCKER 2: Current NEVER enters the proxy search.
    onProgress("optimising_timing", "Optimising timing", 0, candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot };
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      candidates[i].proxyResult = runProxySearch(candidates[i]);
      onProgress("optimising_timing", `Optimising timing (${i + 1}/${candidates.length})`, i + 1, candidates.length);
      await yieldToUI();
    }

    onProgress("testing_polarity", "Testing polarity", 0, candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot };
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      onProgress("testing_polarity", `Testing polarity (${i + 1}/${candidates.length})`, i + 1, candidates.length);
      await yieldToUI();
    }

    onProgress("balancing_levels", "Balancing subwoofer levels", 0, candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot };
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      onProgress("balancing_levels", `Balancing subwoofer levels (${i + 1}/${candidates.length})`, i + 1, candidates.length);
      await yieldToUI();
    }

    // Phase 6: Promote challengers (Current NOT included)
    const promoted = promoteChallengers(candidates, MAX_CHALLENGERS);

    // Phase 7: Confirming best options (CHALLENGERS + optionally Current)
    onProgress("confirming", "Confirming best options", 0, promoted.length + (authorityNonStale ? 0 : 1));
    const confirmedResults = [];

    // BLOCKER 2: If no valid authority exists, canonically recalculate Current
    // with the EXACT installed tuning (no proxy optimisation). Current uses
    // the installed delay/trim/polarity — never the proxy-searched tuning.
    if (!authorityNonStale) {
      if (isCancelled()) return { status: "cancelled", snapshot };
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      try {
        const currentFinalist = buildCurrentFinalist(subwooferInstances, roomDims);
        if (currentFinalist) {
          // Compute Current's raw transfer (placement) if not already cached
          let currentRawTransfer = null;
          // Try to find a matching cached transfer from Stage 2
          const cachedTransfers = stage2Fingerprint
            ? getCachedRawTransfersForFingerprint(stage2Fingerprint)
            : new Map();
          for (const [fid, transfer] of cachedTransfers.entries()) {
            if (isSamePlacement({ sources: currentFinalist.sources }, currentFinalist, roomDims)) {
              currentRawTransfer = transfer;
              break;
            }
          }
          // If no cached transfer, run the worker for Current's placement
          if (!currentRawTransfer) {
            currentRawTransfer = await runInWorker(worker, "placement", {
              finalist: currentFinalist,
              roomDims, rspPosition, seatingPositions,
              selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
            });
          }
          if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

          // BLOCKER 2: Use INSTALLED tuning for Current confirmation — NOT proxy-optimised
          const installedTuning = (snapshot.tuning || []).map((t) => ({
            delayMs: Number(t.delayMs) || 0,
            gainDb: Number(t.gainDb) || 0,
            polarity: Number(t.polarity) || 0,
          }));

          const currentConfirmation = await runInWorker(worker, "confirmation", {
            rawTransfer: currentRawTransfer,
            tuning: installedTuning,
            tuningVariant: "delay-polarity-trim",
            p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
          });
          if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

          // BLOCKER 4: null result → treat as missing, not blank complete
          if (currentConfirmation) {
            currentConfirmation.candidateId = "current";
            currentConfirmation.isCurrent = true;
            currentConfirmation.appliedTuning = installedTuning;
            confirmedResults.push(currentConfirmation);
          }
        }
      } catch (err) {
        // Current confirmation failed — continue with challengers only.
        // The existing authority (if any) will be used as fallback.
      }
      onProgress("confirming", "Confirming best options (Current)", 1, promoted.length + 1);
      await yieldToUI();
    }

    for (let i = 0; i < promoted.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot, bestSoFar: confirmedResults };
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded", bestSoFar: confirmedResults };
      try {
        const result = await runInWorker(worker, "confirmation", {
          rawTransfer: promoted[i].rawTransfer,
          tuning: promoted[i].proxyResult?.tuning,
          tuningVariant: "delay-polarity-trim",
          p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
        });
        if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded", bestSoFar: confirmedResults };
        // BLOCKER 4: null worker result → skip, do NOT add as blank
        if (result) {
          result.candidateId = promoted[i].id;
          result.isCurrent = false;
          result.appliedTuning = promoted[i].proxyResult?.tuning;
          confirmedResults.push(result);
          onBestSoFar({ result, candidate: promoted[i] });
        }
      } catch (err) {
        // Challenger confirmation failed — skip it, continue with others
      }
      onProgress("confirming", `Confirming best options (${i + 1 + (authorityNonStale ? 0 : 1)}/${promoted.length + (authorityNonStale ? 0 : 1)})`, i + 1 + (authorityNonStale ? 0 : 1), promoted.length + (authorityNonStale ? 0 : 1));
      await yieldToUI();
    }

    // BLOCKER 7: Final stale + cancel checks before publishing winner
    if (isCancelled()) return { status: "cancelled", snapshot, bestSoFar: confirmedResults };
    if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded", bestSoFar: confirmedResults };

    // Phase 8: Finalising recommendation
    onProgress("finalising", "Finalising recommendation", 0, 1);
    const selection = selectWinnerWithProtection(confirmedResults, snapshot, existingAuthority);
    await yieldToUI();

    // BLOCKER 4: If selection is null/undefined (shouldn't happen, but guard),
    // return NO_WINNER explicitly
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

    return { status: "complete", selection, snapshot, confirmedResults };
  } catch (error) {
    return { status: "error", error: error.message, snapshot: null };
  } finally {
    worker.terminate();
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
  const p14Param = params.p14 || {};

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
    p14AchievedLevel: p14Param.level ?? null,
    p14AchievedDb: Number.isFinite(Number(p14Param.value)) ? Number(p14Param.value) : null,
  };
}