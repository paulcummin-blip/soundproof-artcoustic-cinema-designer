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
//        placement generation/screening (runPositionScreenPhase) for the
//        installed quantity AND existing Stage 1/2 finalists for cross
//        quantities (1, 2, 4), where available.
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
// CROSS-QUANTITY: this module searches the installed quantity AND any
// available practical Stage 1/2 finalists for 1, 2 and 4 subwoofers. Each
// cross-quantity finalist carries its own candidate-owned design context
// (source IDs, instances, model, coordinates) so the canonical evaluation
// binds tuning and evidence to the candidate, never to the installed
// instances. Missing quantity finalists are reported, not invented.
//
// OBSERVABILITY: every run records an explicit execution outcome —
// eligible/skipped/started/completed/incomplete — with the specific reason,
// elapsed time, quantity coverage, placement counts, combination counts,
// screening outcomes, confirmations and rejection reasons. No raw acoustic
// curves are retained.

import { runInWorker } from "./improveBassV2WorkerLifecycle.js";
import { runPositionScreenPhase } from "./improveBassV2Escalation.js";
import { generateSeatingCandidates } from "./seatingPositionSearch.js";
import { computeProxyCandidateMetrics } from "./proxyCandidateMetrics.js";
import { isSamePlacement } from "./improveBassV2Engine.js";
import { retuneFullCalibration, confirmCombinedCandidate } from "./combinedOptimisationSearch.js";
import { selectDiverseSeatingStates } from "./coordinatedDiversityPolicy.js";
import { buildCandidateDesignContext, validationContextForCandidate } from "./candidateDesignContext.js";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

// Bounded search contract — a small, topology-diverse set so the search
// stays fast and the shortlist is cheap to confirm canonically.
const COORDINATED_MAX_SEATING_STATES = 5;   // diverse legal offsets retained
const COORDINATED_MAX_PLACEMENTS = 5;       // topology-diverse sub placements (all quantities)
const COORDINATED_SHORTLIST_SIZE = 6;       // survivors sent to electronic retune
const COORDINATED_SUPPORTED_QUANTITIES = [1, 2, 4];

/**
 * Run the coordinated physical search. Reuses the existing V2 worker,
 * placement screening, electronic retune and canonical confirmation.
 *
 * @param {object} ctx - engine context (see wiring in improveBassV2Engine.js)
 *   ctx.crossQuantityFinalists - { 1: [...], 2: [...], 4: [...] } Stage 2 finalists per quantity
 *   ctx.installedQuantity - the installed subwoofer count
 * @returns {Promise<{ coordinatedCandidates: Array, diagnostics: object }>}
 */
export async function runCoordinatedPhysicalSearch(ctx) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const diagnostics = {
    status: "skipped",
    eligible: false,
    skipReason: null,
    startedAt: null,
    elapsedMs: 0,
    gateInputs: {
      hasExistingAuthority: null,
      hasCurrentFinalist: null,
      hasEffectiveBaseline: null,
      hasCurrentTransfer: null,
    },
    installedQuantity: null,
    quantityCoverage: {},
    missingQuantities: [],
    seatingOffsetsConsidered: 0,
    seatingStatesRetained: [],
    placementsGenerated: 0,
    placementsRetained: [],
    combosEvaluated: 0,
    proxyScreened: [],
    survivors: [],
    confirmed: [],
    rejected: [],
    error: null,
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
    crossQuantityFinalists = {},
    installedQuantity = null,
  } = ctx;

  diagnostics.installedQuantity = Number.isFinite(Number(installedQuantity))
    ? Number(installedQuantity)
    : (subwooferInstances || []).filter((i) => i?.enabled !== false).length || null;

  // ── 0. Record eligibility BEFORE branching ────────────────────────────
  // The gate is the same as the existing seating/combined phases: a
  // published baseline is required to compare against. Without it, the
  // final ranking has nothing to compare to.
  // GATE OUTCOME: capture each input the gate checked, BEFORE branching,
  // so a skipped run states which input was absent — not merely that it
  // was skipped. These are boolean presence flags, never raw transfers or
  // internal data.
  const hasCurrentTransfer = !!(currentFinalist?.sources?.length
    && effectiveBaseline?.length);
  diagnostics.gateInputs = {
    hasExistingAuthority: !!existingAuthority,
    hasCurrentFinalist: !!currentFinalist,
    hasEffectiveBaseline: !!(effectiveBaseline?.length),
    hasCurrentTransfer,
  };
  if (!existingAuthority || !currentFinalist || !effectiveBaseline?.length) {
    diagnostics.status = "skipped";
    diagnostics.eligible = false;
    diagnostics.skipReason = !existingAuthority
      ? "no_existing_authority"
      : !currentFinalist
        ? "no_current_finalist"
        : "no_effective_baseline";
    diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    return { coordinatedCandidates: [], diagnostics };
  }

  diagnostics.eligible = true;
  diagnostics.startedAt = new Date().toISOString();

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

  // ── 2. Topology-diverse sub placements: installed-quantity + cross-qty ──
  // Installed-quantity placements come from the existing placement
  // generator/screener (runPositionScreenPhase). Cross-quantity placements
  // come from existing practical Stage 1/2 finalists, where available.
  // Each cross-quantity finalist carries its own candidate-owned design
  // context so tuning and evidence bind to the candidate, not the installed
  // instances.
  const placements = gatherDiversePlacements({
    subwooferInstances, roomDims, selectedSubModel,
    seatingPositions, rspPosition, subwooferBottomHeightM,
    currentFinalist,
    crossQuantityFinalists,
    installedQuantity: diagnostics.installedQuantity,
    supportedQuantities: COORDINATED_SUPPORTED_QUANTITIES,
  });
  diagnostics.placementsGenerated = placements.generated;
  diagnostics.placementsRetained = placements.retained.map((p) => ({
    id: p.id, phase: p.phase, quantity: p.quantity, coordinates: p.coordinates,
  }));
  diagnostics.quantityCoverage = placements.quantityCoverage;
  diagnostics.missingQuantities = placements.missingQuantities;

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
  // For cross-quantity placements, the candidate's own source IDs are
  // injected into the finalist sources so buildStage2Sources preserves them.
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
      // For cross-quantity placements, inject candidate-owned source IDs
      // into the finalist sources so the worker's buildStage2Sources
      // preserves them in the transfer.
      const batchFinalist = placement.designContext
        ? injectCandidateSourceIds(placement.finalist, placement.designContext)
        : placement.finalist;
      batchResult = await runInWorker(worker, "seating-batch", {
        finalist: batchFinalist,
        roomDims, rspPosition,
        candidates: seatingStates,
        selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
        frontOrientation, rearOrientation,
      }, controller.signal);
    } catch (err) {
      diagnostics.rejected.push({ stage: "transfer", placementId: placement.id, quantity: placement.quantity, error: err?.message || "batch transfer failed" });
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
        diagnostics.rejected.push({ stage: "proxy", placementId: placement.id, quantity: placement.quantity, offsetMm, reason: "no transfer" });
        continue;
      }
      const candidateBaseline = placement.designContext
        ? rawTransfer.sources.map(({ id }) => ({
            sourceId: id, delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0,
          }))
        : effectiveBaseline;
      const proxy = computeProxyCandidateMetrics(rawTransfer, candidateBaseline);
      combos.push({
        placementId: placement.id,
        placementCoordinates: placement.coordinates,
        placementQuantity: placement.quantity,
        designContext: placement.designContext || null,
        offsetMm,
        seatingPositions: movedSeats,
        rawTransfer,
        candidateBaseline,
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
    placementId: c.placementId, quantity: c.placementQuantity, offsetMm: c.offsetMm,
    proxyBalancedRange: c.proxyBalancedRange, proxyRspRange: c.proxyRspRange,
    proxyWorstSeatRange: c.proxyWorstSeatRange,
  }));
  diagnostics.survivors = shortlist.map((c) => ({
    placementId: c.placementId, quantity: c.placementQuantity, offsetMm: c.offsetMm,
    proxyBalancedRange: c.proxyBalancedRange,
  }));

  // ── 5. Electronic retune (phase → delay → gain) + canonical confirm ──────
  // Each survivor is retuned on its OWN raw transfer (its own seating geometry
  // and sub coordinates). Baseline tuning is the SEED only; the retune result
  // is what gets canonically confirmed. For cross-quantity candidates, the
  // retune uses the candidate's own instances, and the confirmation binds
  // tuning and validation to the candidate's own source IDs.
  const coordinatedCandidates = [];
  for (let si = 0; si < shortlist.length; si++) {
    if (isCancelled?.() || isStale?.()) {
      diagnostics.status = isStale?.() ? "stale" : "cancelled";
      diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      return { coordinatedCandidates, diagnostics };
    }
    onProgress?.("coordinating", `Coordinated search: confirming ${si + 1}/${shortlist.length}`, si, shortlist.length);
    const combo = shortlist[si];
    const candidateInstances = combo.designContext?.instances || subwooferInstances;
    const retuneCtx = { worker, controller, isStale, metrics, subwooferInstances: candidateInstances, roomDims };
    let tuning = null;
    try {
      tuning = await retuneFullCalibration(retuneCtx, combo.rawTransfer, combo.candidateBaseline);
    } catch (err) {
      diagnostics.rejected.push({ stage: "retune", placementId: combo.placementId, quantity: combo.placementQuantity, offsetMm: combo.offsetMm, error: err?.message || "retune failed" });
      continue;
    }
    if (isStale?.()) {
      diagnostics.status = "stale";
      diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      return { coordinatedCandidates, diagnostics };
    }
    if (!tuning) {
      diagnostics.rejected.push({ stage: "retune", placementId: combo.placementId, quantity: combo.placementQuantity, offsetMm: combo.offsetMm, reason: "no tuning improvement" });
      continue;
    }
    const candidateInfo = {
      coordinates: combo.placementCoordinates,
      candidateOrigin: "coordinated",
      designContext: combo.designContext,
    };
    // For cross-quantity candidates, use the candidate's own validation
    // context (its own source IDs and seats).
    const candidateValidationContext = combo.designContext
      ? validationContextForCandidate({ designContext: combo.designContext }, validationContext)
      : validationContext;
    const confirmCtx = {
      worker, controller, isStale, bindConfirmation,
      validationContext: candidateValidationContext, metrics,
      p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
    };
    let check = null;
    try {
      check = await confirmCombinedCandidate(confirmCtx, combo.rawTransfer, tuning, candidateInfo, "calibration");
    } catch (err) {
      diagnostics.rejected.push({ stage: "confirm", placementId: combo.placementId, quantity: combo.placementQuantity, offsetMm: combo.offsetMm, error: err?.message || "confirmation failed" });
      continue;
    }
    if (isStale?.()) {
      diagnostics.status = "stale";
      diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      return { coordinatedCandidates, diagnostics };
    }
    if (check?.nonAssessable) {
      diagnostics.rejected.push({ stage: "confirm", placementId: combo.placementId, quantity: combo.placementQuantity, offsetMm: combo.offsetMm, nonAssessable: true, reason: check.reason });
      continue;
    }
    if (!check?.valid) {
      diagnostics.rejected.push({ stage: "confirm", placementId: combo.placementId, quantity: combo.placementQuantity, offsetMm: combo.offsetMm, reason: "validation failed", issues: check?.issues });
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
    result.coordinatedQuantity = combo.placementQuantity;
    result.combinedFrom = { coordinated: true, phaseRetuned: true, delayRetuned: true, gainRetuned: true };
    if (combo.designContext) {
      result.designContext = combo.designContext;
      result.isCrossQuantity = true;
    }
    coordinatedCandidates.push(result);
    diagnostics.confirmed.push({
      candidateId: result.candidateId, placementId: combo.placementId,
      quantity: combo.placementQuantity, offsetMm: combo.offsetMm,
      p19Level: result.achievedP19Level, p19VariationDb: result.achievedP19VariationDb,
      p20Level: result.achievedP20Level, p20VariationDb: result.achievedP20VariationDb,
      p14Db: result.p14AchievedDb, p18Hz: result.achievedP18Hz,
      responseBasis: result.responseBasis ?? null,
      crossover: result.crossover ?? combo.rawTransfer.crossover ?? null,
      crossoverSearched: false,
      tuning: result.appliedTuning ?? tuning,
      receipt: result.canonicalAuthorityReceipt ?? null,
      perSeatP20: (result.perSeatP20 || []).map(({ seatId, isPrimary, level, variationDbRaw, worstFrequencyHz }) => ({
        seatId, isPrimary, level, variationDbRaw, worstFrequencyHz,
      })),
      isCrossQuantity: !!combo.designContext,
    });
  }

  diagnostics.status = coordinatedCandidates.length > 0 ? "completed" : "no_improvement";
  diagnostics.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  return { coordinatedCandidates, diagnostics };
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Inject candidate-owned source IDs into a finalist's sources so
 * buildStage2Sources preserves them in the transfer. This is the identity
 * layer only — positions, orientations and acoustic calculations are
 * unchanged.
 */
function injectCandidateSourceIds(finalist, designContext) {
  if (!designContext?.sourceIds?.length) return finalist;
  const sourceIds = designContext.sourceIds;
  return {
    ...finalist,
    sources: (finalist?.sources || []).map((source, index) => ({
      ...source,
      sourceId: sourceIds[index] || source?.sourceId || null,
      modelKey: source?.modelKey || designContext.selectedSubModel || null,
      bottomHeightM: Number.isFinite(Number(source?.bottomHeightM))
        ? Number(source.bottomHeightM)
        : designContext.subwooferBottomHeightM,
    })),
  };
}

// selectDiverseSeatingStates lives in ./coordinatedDiversityPolicy.js
// (import-free, unit-tested).

/**
 * Gather topology-diverse, practical sub placements from BOTH the installed
 * quantity (via existing placement screening) and cross-quantity Stage 1/2
 * finalists (where available). Dedupes against the installed layout and
 * against itself, bounds to COORDINATED_MAX_PLACEMENTS.
 *
 * Returns { generated, retained, quantityCoverage, missingQuantities }.
 * quantityCoverage: { 1: count, 2: count, 4: count } — placements retained per quantity.
 * missingQuantities: quantities in supportedQuantities that had no finalists available.
 */
function gatherDiversePlacements({
  subwooferInstances, roomDims, selectedSubModel,
  seatingPositions, rspPosition, subwooferBottomHeightM,
  currentFinalist,
  crossQuantityFinalists = {},
  installedQuantity = null,
  supportedQuantities = [1, 2, 4],
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

  const byCoord = new Map();
  const quantityCoverage = {};
  const missingQuantities = [];

  // ── Installed-quantity placements via existing screening ──────────────
  const installedQty = Number.isFinite(Number(installedQuantity))
    ? Number(installedQuantity)
    : activeInstances.length;
  if (installedQty > 0) {
    const phases = ["symmetric", "asymmetric-pair", "individual"];
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
      for (const c of phaseResult?.promoted || []) {
        if (!c?.finalist?.sources?.length) continue;
        if (isSamePlacement(c.finalist, currentFinalist, roomDims)) continue;
        const key = coordKey(c.finalist, roomDims);
        if (byCoord.has(key)) continue;
        byCoord.set(key, {
          id: c.id,
          phase,
          quantity: installedQty,
          finalist: { id: c.id, familyId: c.finalist.familyId, sources: c.finalist.sources },
          coordinates: c.coordinates,
          designContext: null,
        });
        if (byCoord.size >= COORDINATED_MAX_PLACEMENTS) break;
      }
      if (byCoord.size >= COORDINATED_MAX_PLACEMENTS) break;
    }
    quantityCoverage[installedQty] = byCoord.size;
  }

  // ── Cross-quantity placements from existing Stage 1/2 finalists ───────
  // Use only quantities that differ from the installed count and that have
  // available finalists. Each finalist gets a candidate-owned design context.
  for (const qty of supportedQuantities) {
    if (qty === installedQty) continue;
    const finalists = Array.isArray(crossQuantityFinalists?.[qty])
      ? crossQuantityFinalists[qty]
      : [];
    if (finalists.length === 0) {
      missingQuantities.push(qty);
      continue;
    }
    let added = 0;
    for (const finalist of finalists) {
      if (!finalist?.sources?.length) continue;
      if (byCoord.size >= COORDINATED_MAX_PLACEMENTS) break;
      const key = coordKey(finalist, roomDims);
      if (byCoord.has(key)) continue;
      // Build candidate-owned design context for this finalist.
      const designContext = buildCandidateDesignContext({
        finalistId: finalist.id,
        quantity: qty,
        coordinates: finalist.coordinates || [],
        selectedSubModel,
        subwooferBottomHeightM,
        seatingPositions,
        rspPosition,
        crossover: null,
        autoAlignEnabled: true,
      });
      byCoord.set(key, {
        id: finalist.id,
        phase: "cross-quantity",
        quantity: qty,
        finalist: { id: finalist.id, familyId: finalist.familyId || "cross-quantity", sources: finalist.sources },
        coordinates: finalist.coordinates || [],
        designContext,
      });
      added++;
    }
    quantityCoverage[qty] = (quantityCoverage[qty] || 0) + added;
    if (byCoord.size >= COORDINATED_MAX_PLACEMENTS) break;
  }

  // generated counts all screened candidates from the installed-quantity
  // phases (the cross-quantity finalists are pre-screened by Stage 1/2).
  let generated = 0;
  // Re-run the phases just to count generated (cheap — no transfer work).
  // This is a diagnostic counter only; it does not affect the search.
  if (installedQty > 0) {
    for (const phase of ["symmetric", "asymmetric-pair", "individual"]) {
      try {
        const pr = runPositionScreenPhase(
          phase, currentPositions, roomDims, cabinetDims,
          seatingPositions, rspPosition, subwooferBottomHeightM, groups,
        );
        generated += pr?.funnel?.generated || 0;
      } catch { /* skip */ }
    }
  }
  // Add cross-quantity finalist count to generated.
  for (const qty of supportedQuantities) {
    if (qty === installedQty) continue;
    generated += (crossQuantityFinalists?.[qty] || []).length;
  }

  return {
    generated,
    retained: Array.from(byCoord.values()),
    quantityCoverage,
    missingQuantities,
  };
}

function coordKey(finalist, roomDims) {
  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  return (finalist?.sources || []).map((s) =>
    `${(Number(s.xNorm) * W).toFixed(2)},${(Number(s.yNorm) * L).toFixed(2)}`,
  ).join("|");
}