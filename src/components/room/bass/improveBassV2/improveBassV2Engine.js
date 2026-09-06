// improveBassV2Engine.js
// Core V2 Improve Bass Response engine.
//
// Workflow:
//   1. Snapshot current design (positions, tuning, EQ, P14/P18/P19/P20)
//   2. Gather placement candidates (Current + existing Stage 2 finalists)
//   3. Compute raw transfers per candidate (worker — modal simulation)
//   4. Search delay + polarity + trim per candidate (main thread — re-summation)
//   5. Promote 2-3 best challengers + Current
//   6. Canonical confirmation on promoted set (worker — EQ, P14/P18/P19/P20)
//   7. Primary-seat protection (reject candidates that damage primary seats)
//   8. Winner selection or "No safer automatic improvement found"
//
// Does NOT restart Stage 1. Reuses existing Stage 2 placement finalists
// and cached raw transfers where fingerprints match.
//
// Does NOT change: P14/P18/P19/P20 maths or grading, smoothing, EQ constraints,
// Stage 2 authoritative per-seat finalist rules.

import { searchDelayOnly, searchPolarity, searchGainOnly, resumWithTuning } from "../stage2/stage2TuningSearch";
import { selectAuthoritativeFinalist, hasPrimarySeatRegression } from "../best-layout/authoritativeFinalistSelection";
import { detectMutedSubs } from "../best-layout/authoritativeFinalistSelection";
import { getCachedRawTransfersForFingerprint } from "../stage2/stage2RawTransferCache";
import { normaliseModelKey } from "@/components/models/speakers/registry";
import { computeV2DesignFingerprint, isCurrentAuthorityNonStale } from "./improveBassV2Fingerprint";

const MAX_CHALLENGERS = 3;
const YIELD_DELAY_MS = 0;

// Scoring band for proxy P19 (worst-seat peak-to-peak). Matches the tuning
// search band (20–120 Hz) so proxy metrics are consistent with the search.
const PROXY_SCORE_MIN_HZ = 20;
const PROXY_SCORE_MAX_HZ = 120;

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export function snapshotCurrentDesign({
  subwooferInstances,
  roomDims,
  selectedSubModel,
  currentAuthority,
  p14TargetBasis,
  p14TargetLevel,
  p18TargetBasis,
}) {
  const instances = Array.isArray(subwooferInstances)
    ? subwooferInstances.filter((s) => s.enabled !== false)
    : [];
  const positions = instances.map((inst) => ({
    x: Number(inst.position?.x) || 0,
    y: Number(inst.position?.y) || 0,
  }));
  const tuning = instances.map((inst) => ({
    delayMs: Number(inst.delayMs) || 0,
    gainDb: Number(inst.gainDb) || 0,
    polarity: Number(inst.polarity) || 0,
  }));
  const mutedInfo = detectMutedSubs(
    instances.map((inst) => ({
      id: inst.id,
      tuning: { gainDb: Number(inst.gainDb) || 0 },
    })),
  );

  return {
    instanceIds: instances.map((inst) => inst.id),
    models: instances.map((inst) => normaliseModelKey(inst.model || selectedSubModel)),
    positions,
    rotation: instances.map((inst) => Number(inst.rotationDeg) || 0),
    bottomHeightM: instances.map((inst) => Number(inst.bottomHeightM) || 0),
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
// Candidate gathering
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

export function gatherCandidates({
  subwooferInstances,
  roomDims,
  stage2Result,
  stage2Fingerprint,
}) {
  const candidates = [];
  const currentFinalist = buildCurrentFinalist(subwooferInstances, roomDims);
  if (currentFinalist) {
    candidates.push({
      id: "current",
      finalist: currentFinalist,
      isCurrent: true,
      rawTransfer: null,
    });
  }

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
// Proxy search (delay + polarity + trim)
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

  // Compute cheap proxy P19 (worst-seat peak-to-peak) and proxy P20 (RSP
  // peak-to-peak) from the per-source per-seat complex transfers re-summed
  // with the found tuning. These are PROMOTION-ONLY metrics — the final
  // winner is still selected by full canonical post-EQ authority.
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

/**
 * Compute cheap proxy P19 (worst-seat peak-to-peak SPL variation) and proxy
 * P20 (RSP peak-to-peak SPL variation) from per-source per-seat complex
 * transfers re-summed with a given tuning.
 *
 * These are NOT authoritative P19/P20 — they are fast diagnostics used ONLY
 * to promote a diverse shortlist. The final winner is selected by full
 * canonical post-EQ authority (EQ pool, P14/P18/P19/P20 grading).
 *
 * @param {object} rawTransfer - raw transfer with perSourcePerSeatComplexTransfers
 * @param {Array} tuning - [{ delayMs, gainDb, polarity }] per source
 * @returns {{ proxyP19: number, proxyP20: number, proxyBalanced: number }}
 */
function computeProxyMetrics(rawTransfer, tuning) {
  const defaultResult = { proxyP19: Infinity, proxyP20: Infinity, proxyBalanced: Infinity };
  if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length) return defaultResult;
  if (!Array.isArray(tuning) || !tuning.length) return defaultResult;

  const seatIds = rawTransfer.seatIds || [];
  if (!seatIds.length) return defaultResult;

  // Re-sum all seats with the tuning
  const seatResponses = resumWithTuning(
    rawTransfer.perSourcePerSeatComplexTransfers,
    tuning,
    seatIds,
  );

  // Compute peak-to-peak per seat in the scoring band
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

  // If no non-RSP seats, proxy P19 = RSP peak-to-peak
  if (worstSeatPeakToPeak === 0 && Number.isFinite(rspPeakToPeak)) {
    worstSeatPeakToPeak = rspPeakToPeak;
  }

  const proxyP19 = worstSeatPeakToPeak;
  const proxyP20 = rspPeakToPeak;
  // Balanced = max of the two (minimise the worst dimension)
  const proxyBalanced = Math.max(proxyP19, proxyP20);

  return { proxyP19, proxyP20, proxyBalanced };
}

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Multi-objective promotion (BLOCKER 1 fix)
// ---------------------------------------------------------------------------

/**
 * Promote a diverse shortlist of challengers using cheap proxy metrics ONLY.
 *
 * Preserves, where available:
 *   - best P19-oriented candidate (lowest proxyP19 = worst-seat flatness)
 *   - best P20-oriented candidate (lowest proxyP20 = RSP flatness)
 *   - best balanced candidate (lowest proxyBalanced = max of P19/P20)
 *   - materially different tuning family (family diversity)
 *   - Current (always appended last)
 *
 * Maximum canonical challengers: maxChallengers (2–3) plus Current.
 * Does NOT increase the confirmation explosion.
 *
 * Proxy metrics are for promotion ONLY. The final winner remains full
 * canonical post-EQ authority.
 */
function promoteChallengers(candidates, maxChallengers) {
  const challengers = candidates
    .filter((c) => !c.isCurrent && c.proxyResult)
    .map((c) => ({
      ...c,
      proxyP19: c.proxyResult.proxyP19 ?? Infinity,
      proxyP20: c.proxyResult.proxyP20 ?? Infinity,
      proxyBalanced: c.proxyResult.proxyBalanced ?? Infinity,
    }));

  if (!challengers.length) {
    const current = candidates.find((c) => c.isCurrent);
    return current ? [current] : [];
  }

  const promoted = [];
  const promotedIds = new Set();

  function tryAdd(candidate) {
    if (!candidate || promotedIds.has(candidate.id)) return false;
    if (promoted.length >= maxChallengers) return false;
    promoted.push(candidate);
    promotedIds.add(candidate.id);
    return true;
  }

  // 1. Best P19-oriented (worst-seat flatness)
  const bestP19 = challengers.reduce((best, c) =>
    c.proxyP19 < best.proxyP19 ? c : best
  );
  tryAdd(bestP19);

  // 2. Best P20-oriented (RSP flatness)
  const bestP20 = challengers.reduce((best, c) =>
    c.proxyP20 < best.proxyP20 ? c : best
  );
  tryAdd(bestP20);

  // 3. Best balanced (max of P19/P20)
  const bestBalanced = challengers.reduce((best, c) =>
    c.proxyBalanced < best.proxyBalanced ? c : best
  );
  tryAdd(bestBalanced);

  // 4. Materially different tuning family (family diversity)
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

  // 5. Backfill by balanced score if still under max
  if (promoted.length < maxChallengers) {
    const remaining = challengers
      .filter((c) => !promotedIds.has(c.id))
      .sort((a, b) => a.proxyBalanced - b.proxyBalanced);
    for (const ch of remaining) {
      if (promoted.length >= maxChallengers) break;
      tryAdd(ch);
    }
  }

  // Always append Current last
  const current = candidates.find((c) => c.isCurrent);
  if (current) promoted.push(current);

  return promoted;
}

// ---------------------------------------------------------------------------
// Winner selection with primary-seat protection
// ---------------------------------------------------------------------------

function selectWinnerWithProtection(confirmedResults, snapshot, existingAuthority) {
  if (!confirmedResults.length && !existingAuthority) return null;

  const currentResult = confirmedResults.find((r) => r.isCurrent);
  const challengerResults = confirmedResults.filter((r) => !r.isCurrent);

  // BLOCKER 3: If the existing authority is non-stale and authoritative, use
  // it directly as the Current control — do NOT use the proxy-reconfirmed
  // Current. The existing authority is the REAL current design's canonical
  // result (actual positions, model, tuning, bottomHeightM, delay, trim,
  // polarity). Only fall back to the confirmed Current if the authority is
  // unavailable or stale.
  const useExistingAuthority = existingAuthority && !currentResult;

  const currentLayout = useExistingAuthority
    ? {
        metrics: {
          perSeatP19: existingAuthority.perSeatP19 || snapshot.perSeatP19 || [],
          perSeatP20: existingAuthority.perSeatP20 || snapshot.perSeatP20 || [],
          achievedP19VariationDb: existingAuthority.achievedP19VariationDb,
          achievedP19Level: existingAuthority.achievedP19Level,
          achievedP20VariationDb: existingAuthority.achievedP20VariationDb,
          achievedP20Level: existingAuthority.achievedP20Level,
          p18AchievedLevel: existingAuthority.p18AchievedLevel,
          achievedP18Hz: existingAuthority.achievedP18Hz,
          p14AchievedLevel: existingAuthority.p14AchievedLevel,
          p14AchievedDb: existingAuthority.p14AchievedDb,
        },
        sources: snapshot.positions.map((pos, i) => ({
          id: snapshot.instanceIds?.[i] || `sub-${i + 1}`,
          tuning: snapshot.tuning?.[i] || { gainDb: 0 },
        })),
      }
    : currentResult
      ? {
          metrics: {
            perSeatP19: currentResult.perSeatP19 || snapshot.perSeatP19 || [],
            perSeatP20: currentResult.perSeatP20 || snapshot.perSeatP20 || [],
            achievedP19VariationDb: currentResult.achievedP19VariationDb,
            achievedP19Level: currentResult.achievedP19Level,
            achievedP20VariationDb: currentResult.achievedP20VariationDb,
            achievedP20Level: currentResult.achievedP20Level,
            p18AchievedLevel: currentResult.p18AchievedLevel,
            achievedP18Hz: currentResult.achievedP18Hz,
            p14AchievedLevel: currentResult.p14AchievedLevel,
            p14AchievedDb: currentResult.p14AchievedDb,
          },
          sources: snapshot.positions.map((pos, i) => ({
            id: snapshot.instanceIds?.[i] || `sub-${i + 1}`,
            tuning: snapshot.tuning?.[i] || { gainDb: 0 },
          })),
        }
      : null;

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
      currentResult,
    };
  }

  const winnerResult = selection.winner;
  // Use existing authority for regression check when Current was not
  // canonically re-confirmed (BLOCKER 3).
  const currentForRegression = currentResult || (useExistingAuthority ? existingAuthority : null);
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

  // BLOCKER 2: Capture the start fingerprint for stale-job rejection.
  // Uses the same computeCalibrationFingerprint authority as the production path.
  const startFingerprint = computeV2DesignFingerprint({
    subwooferInstances, roomDims, seatingPositions, rspPosition,
    selectedSubModel, p14TargetBasis, p14TargetLevel, p14TargetDb,
  });

  // Stale check: compare current fingerprint against start fingerprint.
  // If the design changed during V2 execution, terminate cleanly as stale.
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

    // BLOCKER 3: Check if the existing authority is non-stale and authoritative.
    // If so, use it directly as the Current control — do NOT re-confirm Current
    // with proxy-optimised tuning. The existing authority is the REAL current
    // design's canonical result.
    const authorityNonStale = isCurrentAuthorityNonStale(currentAuthority, startFingerprint);
    const existingAuthority = authorityNonStale
      ? extractAuthorityForComparison(currentAuthority)
      : null;

    await yieldToUI();
    if (isCancelled()) return { status: "cancelled", snapshot };
    if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };

    // Phase 2: Testing practical positions
    onProgress("testing_positions", "Testing practical positions", 0, 1);
    const candidates = gatherCandidates({ subwooferInstances, roomDims, stage2Result, stage2Fingerprint });

    // BLOCKER 3: If the existing authority is non-stale, exclude Current from
    // canonical confirmation — we already have the real current result.
    // Only canonically recalculate Current if authority is unavailable/stale.
    if (authorityNonStale) {
      const idx = candidates.findIndex((c) => c.isCurrent);
      if (idx >= 0) candidates.splice(idx, 1);
    }

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
      // BLOCKER 2: Worker-boundary stale rejection — check after each worker result
      if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded" };
      await yieldToUI();
    }

    // Phase 3-5: Proxy search (delay + polarity + trim) — fast, main thread
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

    // Phase 6: Promote challengers
    const promoted = promoteChallengers(candidates, MAX_CHALLENGERS);

    // Phase 7: Confirming best options
    onProgress("confirming", "Confirming best options", 0, promoted.length);
    const confirmedResults = [];
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
        // BLOCKER 2: Worker-boundary stale rejection — check after confirmation
        if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded", bestSoFar: confirmedResults };
        if (result) {
          result.candidateId = promoted[i].id;
          result.isCurrent = promoted[i].isCurrent;
          result.appliedTuning = promoted[i].proxyResult?.tuning;
          confirmedResults.push(result);
          onBestSoFar({ result, candidate: promoted[i] });
        }
      } catch (err) {
        if (promoted[i].isCurrent) {
          return { status: "error", error: `Current design confirmation failed: ${err.message}`, snapshot, confirmedResults };
        }
      }
      onProgress("confirming", `Confirming best options (${i + 1}/${promoted.length})`, i + 1, promoted.length);
      await yieldToUI();
    }

    // BLOCKER 2: Final stale check before publishing winner
    if (isStale()) return { status: "stale", snapshot, message: "Design changed — optimisation result discarded", bestSoFar: confirmedResults };

    // Phase 8: Finalising recommendation
    onProgress("finalising", "Finalising recommendation", 0, 1);
    const selection = selectWinnerWithProtection(confirmedResults, snapshot, existingAuthority);
    await yieldToUI();

    return { status: "complete", selection, snapshot, confirmedResults };
  } catch (error) {
    return { status: "error", error: error.message, snapshot: null };
  } finally {
    worker.terminate();
  }
}

/**
 * Extract the relevant fields from the completed bass authority contract
 * for use as the Current control in winner selection (BLOCKER 3).
 * Returns null if the contract lacks the required per-seat data.
 */
function extractAuthorityForComparison(currentAuthority) {
  if (!currentAuthority?.contract) return null;
  const contract = currentAuthority.contract;
  const perSeatP19 = Array.isArray(contract.perSeatP19) ? contract.perSeatP19 : [];
  const perSeatP20 = Array.isArray(contract.perSeatP20) ? contract.perSeatP20 : [];
  if (perSeatP19.length === 0 || perSeatP20.length === 0) return null;

  return {
    perSeatP19,
    perSeatP20,
    achievedP19VariationDb: contract.achievedP19VariationDb ?? currentAuthority.achievedP19VariationDb,
    achievedP19Level: contract.achievedP19Level ?? currentAuthority.achievedP19Level,
    achievedP20VariationDb: contract.achievedP20VariationDb ?? currentAuthority.achievedP20VariationDb,
    achievedP20Level: contract.achievedP20Level ?? currentAuthority.achievedP20Level,
    p18AchievedLevel: contract.p18AchievedLevel ?? currentAuthority.p18AchievedLevel,
    achievedP18Hz: contract.achievedP18Hz ?? currentAuthority.achievedP18Hz,
    p14AchievedLevel: contract.p14AchievedLevel ?? currentAuthority.p14AchievedLevel,
    p14AchievedDb: contract.p14AchievedDb ?? currentAuthority.p14AchievedDb,
  };
}