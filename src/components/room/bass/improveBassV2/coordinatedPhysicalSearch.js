// coordinatedPhysicalSearch.js
// Coordinated seating + subwoofer placement discovery for Improve Bass V2.
//
// PROBLEM THIS SOLVES
//   The existing V2 engine searches seating movements with the INSTALLED
//   subwoofer positions (Phase 9) and searches alternative subwoofer
//   positions with the INSTALLED seating (Phases A/B/C + global Stage 2). It
//   never explores COMBINATIONS of moved seating and newly positioned
//   subwoofers. A seating movement that performs poorly with the current
//   subs might perform exceptionally well with different sub positions
//   (the Room D interaction).
//
// WHAT THIS MODULE DOES
//   A bounded, designer-led coordinated physical search that:
//     1. Retains a DIVERSE spread of legal seating offsets — NOT pruned by
//        their performance with the installed sub arrangement.
//     2. For each, reconsiders subwoofer positions using the EXISTING
//        placement generation/screening (runPositionScreenPhase) so the
//        sub positions are genuinely re-searched, not just re-measured.
//     3. Computes raw acoustic transfers for every (placement × seating)
//        combination reusing the EXISTING fast seating-batch worker, which
//        prepares the source/room field ONCE per placement and reuses it
//        across all seating offsets.
//     4. Cheap proxy-screens every combination, shortlists a bounded set.
//     5. Retunes phase → delay → gain on each survivor's OWN raw transfer
//        (never inherits baseline tuning as the final result for a
//        physically different candidate) and canonically confirms it.
//
// WHAT THIS MODULE DOES NOT DO
//   - No new acoustic math. Every transfer, screening, tuning and
//     canonical evaluation goes through the existing V2 helpers.
//   - No replacement of runImproveBassV2. It is a candidate-generation
//     extension that feeds confirmed candidates into the same final
//     ranking, materiality and Primary-seat safety gates as every other
//     lever.
//   - Never auto-applies anything. The designer's layout is the unchanged
//     baseline; coordinated candidates only compete against it.
//
// CROSS-QUANTITY: this initial implementation searches the SAME subwoofer
// quantity as the installed design. The seating-batch worker builds sources
// for one finalist; cross-quantity identity is handled by prepareFullTransfer's
// candidate-owned context layer, which the batch path does not carry. A
// cross-quantity coordinated extension is a natural follow-up; it is noted in
// the diagnostics so a blind run can see it was not searched.

import { runInWorker } from "./improveBassV2WorkerLifecycle.js";
import { runPositionScreenPhase } from "./improveBassV2Escalation.js";
import { generateSeatingCandidates } from "./seatingPositionSearch.js";
import { computeProxyCandidateMetrics } from "./proxyCandidateMetrics.js";
import { isSamePlacement } from "./improveBassV2Engine.js";
import { retuneFullCalibration, confirmCombinedCandidate } from "./combinedOptimisationSearch.js";
import { selectDiverseSeatingStates } from "./coordinatedDiversityPolicy.js";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

// Bounded search contract — a small, topology-diverse set so the search
// stays fast and the shortlist is cheap to confirm canonically.
const COORDINATED_MAX_SEATING_STATES = 5;   // diverse legal offsets retained
const COORDINATED_MAX_PLACEMENTS = 5;       // topology-diverse sub placements
const COORDINATED_SHORTLIST_SIZE = 6;       // survivors sent to electronic retune

/**
 * Run the coordinated physical search. Reuses the existing V2 worker,
 * placement screening, electronic retune and canonical confirmation.
 *
 * @param {object} ctx - engine context (see wiring in improveBassV2Engine.js)
 * @returns {Promise<{ coordinatedCandidates: Array, diagnostics: object }>}
 */
export async function runCoordinatedPhysicalSearch(ctx) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const diagnostics = {
    status: "skipped",
    seatingOffsetsConsidered: 0,
    seatingStatesRetained: [],
    placementsGenerated: 0,
    placementsRetained: [],
    combosEvaluated: 0,
    proxyScreened: [],
    survivors: [],
    confirmed: [],
    rejected: [],
    crossQuantityNote: "same-quantity coordinated search only; cross-quantity deferred",
    elapsedMs: 0,
  };

  const {
    worker, controller, isCancelled, isStale, metrics,
    bindConfirmation, validationContext,
    p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis, correctabilityAssessment,
    roomDims, subwooferInstances, seatingPositions, rspPosition,
    selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
    frontOrientation, rearOrientation,
    existingAuthority, effectiveBaseline, currentFinalist,
    onProgress,
  } = ctx;

  // The coordinated search competes candidates against the published baseline.
  // Without an existing authority the final ranking has nothing to compare to,
  // matching the existing seating/combined phases' precondition.
  if (!existingAuthority || !currentFinalist || !effectiveBaseline?.length) {
    diagnostics.status = "skipped";
    diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    return { coordinatedCandidates: [], diagnostics };
  }

  // ── 1. Diverse legal seating states (NOT pruned by installed-sub proxy) ──
  const screenWall = "front";
  const allSeating = generateSeatingCandidates(seatingPositions, roomDims, screenWall);
  const validNonZero = allSeating.filter((c) => c.valid && c.offsetMm !== 0);
  diagnostics.seatingOffsetsConsidered = validNonZero.length;
  const seatingStates = selectDiverseSeatingStates(validNonZero, COORDINATED_MAX_SEATING_STATES);
  diagnostics.seatingStatesRetained = seatingStates.map((s) => s.offsetMm);
  if (seatingStates.length === 0) {
    diagnostics.status = "no_legal_seating";
    diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    return { coordinatedCandidates: [], diagnostics };
  }

  // ── 2. Topology-diverse sub placements via existing screening ───────────
  // Run the existing placement generator/screener with the ORIGINAL seating
  // geometry as a cheap generator. The real acoustic evaluation of each
  // (placement × moved seating) combination is the batch transfer below, so
  // screening here only gathers a topology-diverse, practical set — it does
  // NOT prune by installed-sub performance.
  const placements = gatherDiversePlacements({
    subwooferInstances, roomDims, selectedSubModel,
    seatingPositions, rspPosition, subwooferBottomHeightM,
    currentFinalist,
  });
  diagnostics.placementsGenerated = placements.generated;
  diagnostics.placementsRetained = placements.retained.map((p) => ({
    id: p.id, phase: p.phase, coordinates: p.coordinates,
  }));
  if (placements.retained.length === 0) {
    diagnostics.status = "no_legal_placements";
    diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    return { coordinatedCandidates: [], diagnostics };
  }

  if (isCancelled?.() || isStale?.()) {
    diagnostics.status = "cancelled";
    diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    return { coordinatedCandidates: [], diagnostics };
  }

  // ── 3. Raw transfers per (placement × seating) via the batch worker ──────
  // The seating-batch worker prepares the source/room modal field ONCE per
  // placement finalist and reuses it across all seating offsets, so this is
  // one batch call per placement — the same fast path the existing seating
  // phase uses, applied to each topology-diverse sub placement.
  const combos = [];
  for (let pi = 0; pi < placements.retained.length; pi++) {
    if (isCancelled?.() || isStale?.()) {
      diagnostics.status = "cancelled";
      diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      return { coordinatedCandidates: [], diagnostics };
    }
    const placement = placements.retained[pi];
    onProgress?.("coordinating", `Coordinated search: placement ${pi + 1}/${placements.retained.length}`, pi, placements.retained.length);
    const batchT0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    let batchResult = null;
    try {
      batchResult = await runInWorker(worker, "seating-batch", {
        finalist: { id: placement.id, familyId: placement.finalist.familyId, sources: placement.finalist.sources },
        roomDims, rspPosition,
        candidates: seatingStates,
        selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
        frontOrientation, rearOrientation,
      }, controller.signal);
    } catch (err) {
      diagnostics.rejected.push({ stage: "transfer", placementId: placement.id, error: err?.message || "batch transfer failed" });
      continue;
    }
    metrics?.addStage?.("coordinated-transfer-batch", (typeof performance !== "undefined" ? performance.now() : Date.now()) - batchT0);
    if (isStale?.()) {
      diagnostics.status = "stale";
      diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      return { coordinatedCandidates: [], diagnostics };
    }

    const perOffset = batchResult?.candidates || [];
    for (let oi = 0; oi < perOffset.length; oi++) {
      const entry = perOffset[oi];
      const rawTransfer = entry?.rawTransfer;
      const offsetMm = entry?.offsetMm ?? seatingStates[oi]?.offsetMm;
      const movedSeats = seatingStates[oi]?.seatingPositions || [];
      if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length) {
        diagnostics.rejected.push({ stage: "proxy", placementId: placement.id, offsetMm, reason: "no transfer" });
        continue;
      }
      const proxy = computeProxyCandidateMetrics(rawTransfer, effectiveBaseline);
      combos.push({
        placementId: placement.id,
        placementCoordinates: placement.coordinates,
        offsetMm,
        seatingPositions: movedSeats,
        rawTransfer,
        proxyRspRange: proxy.proxyRspRange,
        proxyWorstSeatRange: proxy.proxyWorstSeatRange,
        proxyAllSeatRange: proxy.proxyAllSeatRange,
        proxyBalancedRange: proxy.proxyBalancedRange,
      });
      diagnostics.combosEvaluated++;
    }
  }

  if (combos.length === 0) {
    diagnostics.status = "no_combos";
    diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    return { coordinatedCandidates: [], diagnostics };
  }

  // ── 4. Cheap proxy shortlist (balanced range — stands in for P19+P20) ───
  const shortlist = combos
    .filter((c) => Number.isFinite(c.proxyBalancedRange))
    .sort((a, b) => a.proxyBalancedRange - b.proxyBalancedRange)
    .slice(0, COORDINATED_SHORTLIST_SIZE);
  diagnostics.proxyScreened = combos.map((c) => ({
    placementId: c.placementId, offsetMm: c.offsetMm,
    proxyBalancedRange: c.proxyBalancedRange, proxyRspRange: c.proxyRspRange,
    proxyWorstSeatRange: c.proxyWorstSeatRange,
  }));
  diagnostics.survivors = shortlist.map((c) => ({ placementId: c.placementId, offsetMm: c.offsetMm, proxyBalancedRange: c.proxyBalancedRange }));

  // ── 5. Electronic retune (phase → delay → gain) + canonical confirm ──────
  // Each survivor is retuned on its OWN raw transfer (its own seating geometry
  // and sub coordinates). Baseline tuning is the SEED only; the retune result
  // is what gets canonically confirmed.
  const retuneCtx = { worker, controller, isStale, metrics, subwooferInstances, roomDims };
  const confirmCtx = {
    worker, controller, isStale, bindConfirmation, validationContext, metrics,
    p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
  };

  const coordinatedCandidates = [];
  for (let si = 0; si < shortlist.length; si++) {
    if (isCancelled?.() || isStale?.()) {
      diagnostics.status = isStale?.() ? "stale" : "cancelled";
      diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      return { coordinatedCandidates, diagnostics };
    }
    onProgress?.("coordinating", `Coordinated search: confirming ${si + 1}/${shortlist.length}`, si, shortlist.length);
    const combo = shortlist[si];
    let tuning = null;
    try {
      tuning = await retuneFullCalibration(retuneCtx, combo.rawTransfer, effectiveBaseline);
    } catch (err) {
      diagnostics.rejected.push({ stage: "retune", placementId: combo.placementId, offsetMm: combo.offsetMm, error: err?.message || "retune failed" });
      continue;
    }
    if (isStale?.()) {
      diagnostics.status = "stale";
      diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      return { coordinatedCandidates, diagnostics };
    }
    if (!tuning) {
      diagnostics.rejected.push({ stage: "retune", placementId: combo.placementId, offsetMm: combo.offsetMm, reason: "no tuning improvement" });
      continue;
    }
    const candidateInfo = {
      coordinates: combo.placementCoordinates,
      candidateOrigin: "coordinated",
    };
    let check = null;
    try {
      check = await confirmCombinedCandidate(confirmCtx, combo.rawTransfer, tuning, candidateInfo, "calibration");
    } catch (err) {
      diagnostics.rejected.push({ stage: "confirm", placementId: combo.placementId, offsetMm: combo.offsetMm, error: err?.message || "confirmation failed" });
      continue;
    }
    if (isStale?.()) {
      diagnostics.status = "stale";
      diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      return { coordinatedCandidates, diagnostics };
    }
    if (check?.nonAssessable) {
      diagnostics.rejected.push({ stage: "confirm", placementId: combo.placementId, offsetMm: combo.offsetMm, nonAssessable: true, reason: check.reason });
      continue;
    }
    if (!check?.valid) {
      diagnostics.rejected.push({ stage: "confirm", placementId: combo.placementId, offsetMm: combo.offsetMm, reason: "validation failed", issues: check?.issues });
      continue;
    }
    const result = check.result;
    result.candidateKind = "calibration";
    result.candidateId = `coordinated:${combo.placementId}:${combo.offsetMm}`;
    result.candidateOrigin = "coordinated";
    result.isCoordinatedCandidate = true;
    result.seatingOffsetMm = combo.offsetMm;
    result.seatingPositions = combo.seatingPositions;
    result.coordinatedPlacementId = combo.placementId;
    result.combinedFrom = { coordinated: true, phaseRetuned: true, delayRetuned: true, gainRetuned: true };
    coordinatedCandidates.push(result);
    diagnostics.confirmed.push({
      candidateId: result.candidateId, placementId: combo.placementId, offsetMm: combo.offsetMm,
      p19Level: result.achievedP19Level, p19VariationDb: result.achievedP19VariationDb,
      p20Level: result.achievedP20Level, p20VariationDb: result.achievedP20VariationDb,
      p14Db: result.p14AchievedDb, p18Hz: result.achievedP18Hz,
    });
  }

  diagnostics.status = coordinatedCandidates.length > 0 ? "completed" : "no_improvement";
  diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  return { coordinatedCandidates, diagnostics };
}

// ── Helpers ──────────────────────────────────────────────────────────────

// selectDiverseSeatingStates lives in ./coordinatedDiversityPolicy.js
// (import-free, unit-tested).

/**
 * Gather topology-diverse, practical sub placements using the EXISTING
 * placement generator/screener (runPositionScreenPhase). Dedupes against the
 * installed layout and against itself, bounds to COORDINATED_MAX_PLACEMENTS.
 */
function gatherDiversePlacements({
  subwooferInstances, roomDims, selectedSubModel,
  seatingPositions, rspPosition, subwooferBottomHeightM,
  currentFinalist,
}) {
  const activeInstances = (subwooferInstances || []).filter((i) => i?.enabled !== false);
  const currentPositions = activeInstances.map((p, index) => ({
    x: Number(p.position?.x) || 0,
    y: Number(p.position?.y) || 0,
    sourceId: p.id || null,
    model: p.model || null,
  }));
  const groups = activeInstances.map((i) => i?.legacyGroup || null);

  let cabinetDims = { widthM: 0.5, depthM: 0.3, heightM: 0.5 };
  try {
    const meta = getSpeakerModelMeta(selectedSubModel);
    cabinetDims = {
      widthM: Number(meta?.widthM) || 0.5,
      depthM: Number(meta?.depthM) || 0.3,
      heightM: Number(meta?.heightM) || 0.5,
    };
  } catch { /* registry lookup failed — use defaults */ }

  const phases = ["symmetric", "asymmetric-pair", "individual"];
  let generated = 0;
  const byCoord = new Map();
  for (const phase of phases) {
    let phaseResult;
    try {
      phaseResult = runPositionScreenPhase(
        phase, currentPositions, roomDims, cabinetDims,
        seatingPositions, rspPosition, subwooferBottomHeightM, groups,
      );
    } catch {
      continue;
    }
    generated += phaseResult?.funnel?.generated || 0;
    for (const c of phaseResult?.promoted || []) {
      if (!c?.finalist?.sources?.length) continue;
      if (isSamePlacement(c.finalist, currentFinalist, roomDims)) continue;
      const key = coordKey(c.finalist, roomDims);
      if (byCoord.has(key)) continue;
      byCoord.set(key, {
        id: c.id,
        phase,
        finalist: { id: c.id, familyId: c.finalist.familyId, sources: c.finalist.sources },
        coordinates: c.coordinates,
      });
      if (byCoord.size >= COORDINATED_MAX_PLACEMENTS) break;
    }
    if (byCoord.size >= COORDINATED_MAX_PLACEMENTS) break;
  }
  return { generated, retained: Array.from(byCoord.values()) };
}

function coordKey(finalist, roomDims) {
  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  return (finalist?.sources || []).map((s) =>
    `${(Number(s.xNorm) * W).toFixed(2)},${(Number(s.yNorm) * L).toFixed(2)}`,
  ).join("|");
}