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

import { searchDelayOnly, searchPolarity, searchGainOnly } from "../stage2/stage2TuningSearch";
import { selectAuthoritativeFinalist, hasPrimarySeatRegression } from "../best-layout/authoritativeFinalistSelection";
import { detectMutedSubs } from "../best-layout/authoritativeFinalistSelection";
import { getCachedRawTransfersForFingerprint } from "../stage2/stage2RawTransferCache";
import { normaliseModelKey } from "@/components/models/speakers/registry";

const MAX_CHALLENGERS = 3;
const YIELD_DELAY_MS = 0;

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

  return {
    tuning, delays: bestDelays, gains: bestGains, polarities: bestPolarities,
    score: trimResult.finalists[0]?.score || Infinity,
  };
}

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

function promoteChallengers(candidates, maxChallengers) {
  const challengers = candidates
    .filter((c) => !c.isCurrent && c.proxyResult)
    .map((c) => ({ ...c, proxyScore: c.proxyResult.score }))
    .sort((a, b) => a.proxyScore - b.proxyScore);

  const promoted = [];
  const seenFamilies = new Set();
  for (const ch of challengers) {
    if (promoted.length >= maxChallengers) break;
    const family = ch.finalist?.familyId || "unknown";
    if (seenFamilies.has(family) && promoted.length > 0) continue;
    seenFamilies.add(family);
    promoted.push(ch);
  }
  if (promoted.length < maxChallengers) {
    for (const ch of challengers) {
      if (promoted.length >= maxChallengers) break;
      if (promoted.some((p) => p.id === ch.id)) continue;
      promoted.push(ch);
    }
  }

  const current = candidates.find((c) => c.isCurrent);
  if (current) promoted.push(current);

  return promoted;
}

// ---------------------------------------------------------------------------
// Winner selection with primary-seat protection
// ---------------------------------------------------------------------------

function selectWinnerWithProtection(confirmedResults, snapshot) {
  if (!confirmedResults.length) return null;

  const currentResult = confirmedResults.find((r) => r.isCurrent);
  const challengerResults = confirmedResults.filter((r) => !r.isCurrent);

  const currentLayout = currentResult
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
  if (currentResult) {
    const regression = hasPrimarySeatRegression(winnerResult, currentResult);
    if (regression.regressed) {
      return {
        isCurrent: true,
        winner: null,
        message: "No safer automatic improvement found — current design retained",
        rejectionReason: `Candidate improved headline but damaged primary seat ${regression.seatId} ${regression.parameter} (L${regression.currentLevel} → L${regression.candidateLevel})`,
        confirmedResults,
        currentResult,
      };
    }
  }

  return {
    isCurrent: false,
    winner: winnerResult,
    message: null,
    confirmedResults,
    currentResult,
  };
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

export async function runImproveBassV2(projectId, params, callbacks) {
  const { onProgress, isCancelled, onBestSoFar } = callbacks;
  const {
    subwooferInstances, roomDims, seatingPositions, rspPosition,
    selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
    p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
    currentAuthority, stage2Result, stage2Fingerprint,
  } = params;

  const worker = new Worker(new URL("./improveBassV2.worker.js", import.meta.url), { type: "module" });

  try {
    // Phase 1: Reviewing current design
    onProgress("reviewing", "Reviewing current design", 0, 1);
    const snapshot = snapshotCurrentDesign({
      subwooferInstances, roomDims, selectedSubModel, currentAuthority,
      p14TargetBasis, p14TargetLevel, p18TargetBasis,
    });
    await yieldToUI();
    if (isCancelled()) return { status: "cancelled", snapshot };

    // Phase 2: Testing practical positions
    onProgress("testing_positions", "Testing practical positions", 0, 1);
    const candidates = gatherCandidates({ subwooferInstances, roomDims, stage2Result, stage2Fingerprint });
    await yieldToUI();
    if (isCancelled()) return { status: "cancelled", snapshot };

    for (let i = 0; i < candidates.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot };
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
      await yieldToUI();
    }

    // Phase 3-5: Proxy search (delay + polarity + trim) — fast, main thread
    onProgress("optimising_timing", "Optimising timing", 0, candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot };
      candidates[i].proxyResult = runProxySearch(candidates[i]);
      onProgress("optimising_timing", `Optimising timing (${i + 1}/${candidates.length})`, i + 1, candidates.length);
      await yieldToUI();
    }

    onProgress("testing_polarity", "Testing polarity", 0, candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot };
      onProgress("testing_polarity", `Testing polarity (${i + 1}/${candidates.length})`, i + 1, candidates.length);
      await yieldToUI();
    }

    onProgress("balancing_levels", "Balancing subwoofer levels", 0, candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      if (isCancelled()) return { status: "cancelled", snapshot };
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
      try {
        const result = await runInWorker(worker, "confirmation", {
          rawTransfer: promoted[i].rawTransfer,
          tuning: promoted[i].proxyResult?.tuning,
          tuningVariant: "delay-polarity-trim",
          p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
        });
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

    // Phase 8: Finalising recommendation
    onProgress("finalising", "Finalising recommendation", 0, 1);
    const selection = selectWinnerWithProtection(confirmedResults, snapshot);
    await yieldToUI();

    return { status: "complete", selection, snapshot, confirmedResults };
  } catch (error) {
    return { status: "error", error: error.message, snapshot: null };
  } finally {
    worker.terminate();
  }
}