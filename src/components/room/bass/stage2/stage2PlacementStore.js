// stage2PlacementStore.js
// Controller for Stage 2 canonical placement evaluation.
// Owns: worker pool (max 2), queue, fingerprint, cancellation, memory cache.
// Reuses the existing canonical bass authority pipeline per finalist.

import {
  STAGE2_MAX_CONCURRENT_JOBS,
  STAGE2_FINALISTS_NORMAL,
  STAGE2_START_DELAY_MS,
} from "./stage2Constants";
import {
  buildStage2RankingTuple,
  compareStage2Results,
  meetsStopCondition,
} from "./stage2Ranking";
import { shouldEvaluateThirdFinalist } from "./stage2FinalistPromotion";
import { evaluateBEligibility, generateBFinalist } from "./stage2BLastResort";
import { isBFamily, isProhibitedFamily } from "../stage1/stage1FamilyRegistry";
import { buildPlacementRankingTuple, comparePlacementResults, isPlacementTied } from "./stage2PlacementRanking";
import {
  getCachedRawTransfer,
  setCachedRawTransfer,
  hasCachedRawTransfer,
  getCachedRawTransfersForFingerprint,
} from "./stage2RawTransferCache";

const listeners = new Set();
const memoryByProject = new Map();

function notify() { listeners.forEach((l) => l()); }

function emptyState(projectId) {
  return {
    projectId: String(projectId || "free"),
    status: "idle",
    fingerprint: null,
    one_sub_result: null,
    two_sub_result: null,
    four_sub_result: null,
    overall_best: null,
    canonicalJobsRun: 0,
    completedJobs: 0,
    totalJobsPlanned: 0,
    phase: "idle",
    totalRuntimeMs: 0,
    errorMessage: null,
    hydratedFromCache: false,
    bEligible: false,
    bEvaluated: false,
    bEligibilityReason: null,
    bFailedCandidates: [],
    bResult: null,
  };
}

function getMemory(projectId) {
  const key = String(projectId || "free");
  if (!memoryByProject.has(key)) memoryByProject.set(key, emptyState(key));
  return memoryByProject.get(key);
}

function setMemory(projectId, patch) {
  const key = String(projectId || "free");
  const prev = memoryByProject.get(key) || emptyState(key);
  const next = { ...prev, ...patch };
  memoryByProject.set(key, next);
  notify();
  return next;
}

export function getStage2State(projectId) {
  return getMemory(projectId);
}

export function subscribeStage2(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishHydratedStage2(projectId, fingerprint, results) {
  return setMemory(projectId, {
    status: "complete",
    fingerprint,
    one_sub_result: results?.one_sub_result || null,
    two_sub_result: results?.two_sub_result || null,
    four_sub_result: results?.four_sub_result || null,
    overall_best: results?.overall_best || null,
    canonicalJobsRun: results?.canonical_jobs_run || 0,
    completedJobs: results?.canonical_jobs_run || 0,
    totalJobsPlanned: results?.canonical_jobs_run || 0,
    phase: "ready",
    totalRuntimeMs: results?.total_runtime_ms || 0,
    bEligible: results?.b_eligible || false,
    bEvaluated: results?.b_evaluated || false,
    bEligibilityReason: results?.b_eligibility_reason || null,
    bFailedCandidates: results?.b_failed_candidates || [],
    bResult: results?.b_result || null,
    errorMessage: null,
    hydratedFromCache: true,
  });
}

export function markStage2Updating(projectId, fingerprint, progress = {}) {
  return setMemory(projectId, {
    status: "updating",
    fingerprint,
    one_sub_result: null,
    two_sub_result: null,
    four_sub_result: null,
    overall_best: null,
    canonicalJobsRun: 0,
    completedJobs: 0,
    totalJobsPlanned: 0,
    phase: "preparing",
    errorMessage: null,
    hydratedFromCache: false,
    bEligible: false,
    bEvaluated: false,
    bEligibilityReason: null,
    bFailedCandidates: [],
    bResult: null,
    ...progress,
  });
}

export function markStage2Waiting(projectId, fingerprint, phase = "waiting_for_bass") {
  return markStage2Updating(projectId, fingerprint, { phase });
}

export function markStage2Idle(projectId) {
  return setMemory(projectId, {
    ...emptyState(projectId),
    status: "idle",
  });
}

export function markStage2Error(projectId, fingerprint, errorMessage) {
  return setMemory(projectId, {
    status: "error",
    fingerprint,
    errorMessage,
  });
}

function publishStage2Progress(projectId, fingerprint, results) {
  return setMemory(projectId, {
    status: "updating",
    fingerprint,
    one_sub_result: results?.one_sub_result || null,
    two_sub_result: results?.two_sub_result || null,
    four_sub_result: results?.four_sub_result || null,
    overall_best: results?.overall_best || null,
    canonicalJobsRun: results?.canonical_jobs_run || 0,
    completedJobs: results?.completed_jobs || 0,
    totalJobsPlanned: results?.total_jobs_planned || 0,
    phase: results?.phase || "preparing",
    bEligible: results?.b_eligible || false,
    bEvaluated: results?.b_evaluated || false,
    bEligibilityReason: results?.b_eligibility_reason || null,
    bFailedCandidates: results?.b_failed_candidates || [],
    bResult: results?.b_result || null,
  });
}

function publishStage2Complete(projectId, fingerprint, results) {
  return setMemory(projectId, {
    status: "complete",
    fingerprint,
    one_sub_result: results?.one_sub_result || null,
    two_sub_result: results?.two_sub_result || null,
    four_sub_result: results?.four_sub_result || null,
    overall_best: results?.overall_best || null,
    canonicalJobsRun: results?.canonical_jobs_run || 0,
    completedJobs: results?.completed_jobs ?? results?.canonical_jobs_run ?? 0,
    totalJobsPlanned: results?.total_jobs_planned ?? results?.canonical_jobs_run ?? 0,
    phase: "ready",
    totalRuntimeMs: results?.total_runtime_ms || 0,
    bEligible: results?.b_eligible || false,
    bEvaluated: results?.b_evaluated || false,
    bEligibilityReason: results?.b_eligibility_reason || null,
    bFailedCandidates: results?.b_failed_candidates || [],
    bResult: results?.b_result || null,
    errorMessage: null,
    hydratedFromCache: false,
  });
}

// ── Worker pool controller ───────────────────────────────────────────────

const now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

class Stage2PlacementController {
  constructor() {
    this.workers = [];
    this.activeJobs = new Map();
    this.queue = [];
    this.currentFingerprint = null;
    this.projectId = null;
    this.params = null;
    this.requestSequence = 0;
    this.completedResults = {};
    this.quantityFinalists = {};
    this.quantityEvaluated = {};
    this.quantityFinal = {};
    this.quantityOrder = [];
    this.startTime = 0;
    this.canonicalJobsRun = 0;
    this.completedJobs = 0;
    this.totalJobsPlanned = 0;
    // B last-resort state
    this.bState = "not_checked"; // not_checked | evaluating_representatives | queued | evaluated | not_eligible
    this.bEligibilityReason = null;
    this.bFailedCandidates = [];
    this.bResult = null;
    // Practical family evidence tracking (4-sub only)
    this.evaluatedFamilyIds = new Set();
    this.failedFamilyIds = new Set();
    this.allStage1FourSubFinalists = [];
    this.stage1Complete = false;
    // B-representative lifecycle state: finalistId → "placement" | "confirmation" | "evaluated" | "failed".
    // Prevents the infinite loop where a missing representative's placement
    // completes but no confirmation is ever queued, so evaluatedFamilyIds
    // never records the family and B eligibility re-queues it indefinitely.
    this.representativeState = new Map();
    // Two-phase architecture: placement (P14-independent) → confirmation (P14-dependent)
    this.placementFingerprint = null;
    this.confirmationFingerprint = null;
    this.controllerPhase = "idle"; // idle | placement | confirmation | ready
    this.placementResults = {};   // { qty -> [{ finalistId, rawTransfer, placementRanking }] }
    this.bestPerQuantity = {};    // { qty -> { finalist, rawTransfer } }
    this.confirmationJobsPlanned = 0;
    this.confirmationJobsDone = 0;
  }

  schedule({ projectId, fingerprint, placementFingerprint, confirmationFingerprint, promotionPlan, allStage1Finalists, stage1Complete, params, quantityOrder, delay }) {
    this.cancelAll("superseded");
    if (!fingerprint) {
      markStage2Idle(projectId);
      return;
    }

    this.projectId = projectId;
    this.currentFingerprint = fingerprint;
    this.placementFingerprint = placementFingerprint || null;
    this.confirmationFingerprint = confirmationFingerprint || null;
    this.params = params;
    this.completedResults = {};
    this.quantityEvaluated = {};
    this.quantityFinal = {};
    this.quantityFinalists = {};
    this.placementResults = {};
    this.bestPerQuantity = {};
    this.confirmationQueued = {}; // track per-qty: confirmation already queued?
    this.quantityPlacementProcessed = {}; // qty -> count of processed (cached + completed + failed)
    this.canonicalJobsRun = 0;
    this.completedJobs = 0;
    this.totalJobsPlanned = 0;
    this.confirmationJobsPlanned = 0;
    this.confirmationJobsDone = 0;
    this.startTime = now();
    this.quantityOrder = quantityOrder;
    // Reset B last-resort state
    this.bState = "not_checked";
    this.bEligibilityReason = null;
    this.bFailedCandidates = [];
    this.bResult = null;
    // Reset practical family evidence tracking
    this.evaluatedFamilyIds = new Set();
    this.failedFamilyIds = new Set();
    this.allStage1FourSubFinalists = (allStage1Finalists && allStage1Finalists[4]) || [];
    this.stage1Complete = !!stage1Complete;
    this.representativeState = new Map();

    // Build the promotion plan per quantity. Iterate quantityOrder so the
    // selected quantity's placement jobs are queued first — its confirmation
    // starts as soon as its placement completes, before other quantities.
    this.controllerPhase = "placement";
    this.queue = [];
    for (const qty of quantityOrder) {
      const finalists = promotionPlan[qty] || [];
      this.quantityFinalists[qty] = finalists;
      this.quantityEvaluated[qty] = 0;
      this.quantityFinal[qty] = finalists.length === 0;
      this.confirmationQueued[qty] = false;
      this.placementResults[qty] = [];
      this.quantityPlacementProcessed[qty] = 0;

      for (const f of finalists) {
        if (placementFingerprint && hasCachedRawTransfer(placementFingerprint, f.id)) {
          const rawTransfer = getCachedRawTransfer(placementFingerprint, f.id);
          const seatPriorityMap = new Map(rawTransfer.seatPriorityMap || []);
          const placementRanking = buildPlacementRankingTuple(rawTransfer, seatPriorityMap);
          this.placementResults[qty].push({ finalistId: f.id, rawTransfer, placementRanking });
          this.quantityPlacementProcessed[qty]++;
        } else {
          this.queue.push({ finalist: f, quantity: qty, phase: "placement" });
        }
      }
    }

    this.totalJobsPlanned = this.queue.length;

    // Start confirmation for any quantity whose placement is already complete
    // (all finalists were cached). The selected quantity (quantityOrder[0])
    // is processed first so its authoritative result is published ASAP.
    for (const qty of quantityOrder) {
      if (this.isQuantityPlacementComplete(qty) && !this.confirmationQueued[qty]) {
        this.startConfirmationForQuantity(qty);
      }
    }

    markStage2Updating(projectId, fingerprint, {
      phase: this.queue.length > 0 ? "placement" : "confirmation",
      completedJobs: 0,
      totalJobsPlanned: this.totalJobsPlanned,
    });

    if (this.queue.length === 0 && this.activeJobs.size === 0) {
      // All placement was cached and confirmations are queued — dispatch now.
      this.dispatchNext();
      return;
    }

    const waitMs = Number.isFinite(delay) ? delay : STAGE2_START_DELAY_MS;
    setTimeout(() => {
      if (this.currentFingerprint !== fingerprint) return; // stale
      this.dispatchNext();
    }, waitMs);
  }

  /**
   * Check whether all placement jobs for a quantity are complete (all
   * finalists have raw transfers in placementResults).
   */
  isQuantityPlacementComplete(qty) {
    const finalists = this.quantityFinalists[qty] || [];
    if (finalists.length === 0) return true;
    // Complete when all finalists have been processed (cached, successfully
    // placed, or failed). Failed placements still count as processed — the
    // quantity's confirmation can proceed with whatever placements succeeded.
    return (this.quantityPlacementProcessed[qty] || 0) >= finalists.length;
  }

  /**
   * Start confirmation for a SINGLE quantity after its placement completes.
   * Ranks the quantity's placements P14-independently, selects the best, and
   * queues a confirmation job. Confirmation jobs are inserted at the FRONT of
   * the queue so they are dispatched before remaining placement jobs for other
   * quantities — the selected quantity's authoritative result is published
   * without waiting for non-selected placement to finish.
   */
  startConfirmationForQuantity(qty) {
    if (this.confirmationQueued[qty]) return;
    this.confirmationQueued[qty] = true;

    const placements = this.placementResults[qty] || [];
    this.quantityEvaluated[qty] = 0;
    if (placements.length === 0) {
      this.quantityFinal[qty] = true;
      return;
    }

    // Rank P14-independently and select best
    const ranked = [...placements].sort(comparePlacementResults);
    const best = ranked[0];
    this.bestPerQuantity[qty] = best;

    const W = Number(this.params.roomDims?.widthM);
    const L = Number(this.params.roomDims?.lengthM);

    // Insert confirmation jobs at the FRONT of the queue so they are
    // dispatched before remaining placement jobs for other quantities.
    const confirmationJobs = [];
    confirmationJobs.push({
      finalist: { id: best.finalistId, familyId: best.rawTransfer.familyId, sources: best.rawTransfer.sources?.map((s) => ({ xNorm: s.x / W, yNorm: s.y / L })) },
      quantity: qty,
      phase: "confirmation",
      rawTransfer: best.rawTransfer,
    });
    this.confirmationJobsPlanned++;
    this.totalJobsPlanned++;

    // If there's a tie, queue an alternate confirmation
    if (ranked.length > 1 && isPlacementTied(best, ranked[1])) {
      const alternate = ranked[1];
      confirmationJobs.push({
        finalist: { id: alternate.finalistId, familyId: alternate.rawTransfer.familyId, sources: alternate.rawTransfer.sources?.map((s) => ({ xNorm: s.x / W, yNorm: s.y / L })) },
        quantity: qty,
        phase: "confirmation",
        rawTransfer: alternate.rawTransfer,
      });
      this.confirmationJobsPlanned++;
      this.totalJobsPlanned++;
    }

    // unshift inserts at front — confirmation jobs are dispatched before
    // remaining placement jobs for non-selected quantities.
    this.queue.unshift(...confirmationJobs);

    if (this.controllerPhase === "placement") {
      this.controllerPhase = "confirmation";
    }
  }

  startWorker(workerIndex) {
    const worker = new Worker(new URL("./stage2Placement.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => this.handleMessage(workerIndex, event.data || {});
    worker.onerror = (event) => this.handleError(workerIndex, event?.message || "Worker error");
    this.workers[workerIndex] = worker;
  }

  dispatchToWorker(workerIndex, job) {
    const requestId = `stage2-${++this.requestSequence}`;
    this.activeJobs.set(workerIndex, { requestId, ...job });
    // seatPriorityMap is a Map used only by the controller for ranking —
    // do not send it to the worker (it would be structured-cloned unnecessarily).
    const { seatPriorityMap, ...workerParams } = this.params;
    const phase = job.phase || "placement";
    const workerMessage = {
      requestId,
      fingerprint: this.currentFingerprint,
      phase,
      finalist: job.finalist,
      ...workerParams,
    };
    // For confirmation phase, pass the cached raw transfer
    if (phase === "confirmation" && job.rawTransfer) {
      workerMessage.rawTransfer = job.rawTransfer;
    }
    this.workers[workerIndex].postMessage(workerMessage);
    this.publishProgress();
  }

  dispatchNext() {
    // Start workers if needed (up to max concurrent)
    while (this.workers.length < STAGE2_MAX_CONCURRENT_JOBS && this.queue.length > 0) {
      const workerIndex = this.workers.length;
      this.startWorker(workerIndex);
    }

    // Dispatch to idle workers
    for (let i = 0; i < this.workers.length; i++) {
      if (!this.activeJobs.has(i) && this.queue.length > 0) {
        const job = this.queue.shift();
        this.dispatchToWorker(i, job);
      }
    }
  }

  handleMessage(workerIndex, message) {
    const active = this.activeJobs.get(workerIndex);
    if (!active || message.requestId !== active.requestId) return;
    if (message.fingerprint !== this.currentFingerprint) { this.activeJobs.delete(workerIndex); return; }

    this.activeJobs.delete(workerIndex);
    const qty = active.quantity;
    const wasBJob = active.isB === true;
    const phase = active.phase || "placement";
    this.completedJobs++;
    this.canonicalJobsRun++;

    // ── Placement phase: cache raw transfer ──────────────────────────────
    if (phase === "placement") {
      if (message.type === "complete" && message.result) {
        const rawTransfer = message.result;
        // Cache the raw transfer for reuse across P14 changes
        if (this.placementFingerprint) {
          setCachedRawTransfer(this.placementFingerprint, rawTransfer.finalistId, rawTransfer);
        }

        // B-representative: queue exactly one confirmation job now that the
        // raw transfer exists. This is the critical fix — without this, the
        // representative's placement completes but no confirmation is ever
        // queued (confirmationQueued[4] is already true from the normal
        // confirmation), so evaluatedFamilyIds never records the family and
        // B eligibility re-queues the same representative indefinitely.
        if (active.isRepresentative) {
          const W = Number(this.params.roomDims?.widthM);
          const L = Number(this.params.roomDims?.lengthM);
          this.representativeState.set(rawTransfer.finalistId, "confirmation");
          this.queue.push({
            finalist: { id: rawTransfer.finalistId, familyId: rawTransfer.familyId, sources: rawTransfer.sources?.map((s) => ({ xNorm: s.x / W, yNorm: s.y / L })) },
            quantity: 4,
            phase: "confirmation",
            isRepresentative: true,
            rawTransfer,
          });
          this.totalJobsPlanned++;
        } else if (wasBJob) {
          // B finalist: queue exactly one confirmation job after placement.
          // Same lifecycle defect as representatives — without this, the B
          // finalist's placement completes but no confirmation is queued
          // (confirmationQueued[4] is already true), so bState stays "queued"
          // forever and the controller never completes.
          const W = Number(this.params.roomDims?.widthM);
          const L = Number(this.params.roomDims?.lengthM);
          this.queue.push({
            finalist: { id: rawTransfer.finalistId, familyId: rawTransfer.familyId, sources: rawTransfer.sources?.map((s) => ({ xNorm: s.x / W, yNorm: s.y / L })) },
            quantity: 4,
            phase: "confirmation",
            isB: true,
            rawTransfer,
          });
          this.totalJobsPlanned++;
        } else {
          const seatPriorityMap = new Map(rawTransfer.seatPriorityMap || []);
          const placementRanking = buildPlacementRankingTuple(rawTransfer, seatPriorityMap);
          if (!this.placementResults[qty]) this.placementResults[qty] = [];
          this.placementResults[qty].push({ finalistId: rawTransfer.finalistId, rawTransfer, placementRanking });
        }
      } else if (message.type === "error") {
        const failedFamilyId = active.finalist?.familyId;
        if (failedFamilyId && !isBFamily(failedFamilyId) && !isProhibitedFamily(failedFamilyId)) {
          this.failedFamilyIds.add(failedFamilyId);
        }
        if (active.isRepresentative) {
          this.representativeState.set(active.finalist?.id, "failed");
        }
      }
      // Track placement processing for per-quantity completion (normal
      // finalists only — representatives and B are not part of the per-quantity
      // promotion plan and must not affect quantityPlacementProcessed).
      if (!active.isRepresentative && !wasBJob) {
        this.quantityPlacementProcessed[qty] = (this.quantityPlacementProcessed[qty] || 0) + 1;

        // If this quantity's placement is now complete, start its confirmation
        // immediately — do NOT wait for other quantities' placement to finish.
        // Confirmation jobs are inserted at the front of the queue so they
        // are dispatched before remaining placement jobs for other quantities.
        if (this.isQuantityPlacementComplete(qty) && !this.confirmationQueued[qty]) {
          this.startConfirmationForQuantity(qty);
        }
      }

      this.publishProgress();
      // Dispatch next (may be a representative confirmation, a normal
      // confirmation, or a placement job for another quantity).
      if (this.queue.length > 0) {
        this.dispatchNext();
      } else if (this.activeJobs.size === 0) {
        this.maybeCheckBAndComplete();
      }
      return;
    }

    // ── Confirmation phase: process canonical result ─────────────────────
    if (message.type === "complete") {
      this.quantityEvaluated[qty] = (this.quantityEvaluated[qty] || 0) + 1;
      if (message.result) {
        if (!this.completedResults[qty]) this.completedResults[qty] = [];
        const result = message.result;
        if (result.familyId && !isBFamily(result.familyId) && !isProhibitedFamily(result.familyId)) {
          this.evaluatedFamilyIds.add(result.familyId);
        }
        // Mark B-representative as evaluated — this breaks the infinite loop
        // by ensuring evaluateBEligibility sees the family as evaluated on
        // the next check, so it is never re-queued for the same fingerprint.
        if (active.isRepresentative) {
          this.representativeState.set(active.finalist?.id, "evaluated");
        }
        const seatPriorityMap = this.params?.seatPriorityMap;
        const rankingData = buildStage2RankingTuple(result, seatPriorityMap);
        result.rankingData = rankingData;
        this.completedResults[qty].push(result);
        if (meetsStopCondition(rankingData)) {
          this.quantityFinal[qty] = true;
        }
        if (wasBJob) {
          this.bResult = result;
        }
        this.confirmationJobsDone++;
        this.publishProgress();
      }
    } else if (message.type === "error") {
      const failedFamilyId = active.finalist?.familyId;
      if (failedFamilyId && !isBFamily(failedFamilyId) && !isProhibitedFamily(failedFamilyId)) {
        this.failedFamilyIds.add(failedFamilyId);
      }
      if (active.isRepresentative) {
        this.representativeState.set(active.finalist?.id, "failed");
      }
    }

    if (wasBJob) {
      this.bState = "evaluated";
    }

    // In the confirmation phase, each quantity has at most 1-2 confirmation
    // jobs (best + optional alternate if tied). No third-finalist logic.
    if (!wasBJob && !this.quantityFinal[qty]) {
      this.quantityFinal[qty] = true;
    }

    // Dispatch next or check B eligibility + completion
    if (this.queue.length > 0) {
      this.dispatchNext();
    } else if (this.activeJobs.size === 0) {
      this.maybeCheckBAndComplete();
    }
  }

  // startConfirmation() has been replaced by startConfirmationForQuantity(qty).
  // The old method queued ALL quantities' confirmations at once after ALL
  // placement completed. The new method queues each quantity's confirmation
  // as soon as THAT quantity's placement completes, so the selected quantity
  // (quantityOrder[0]) is confirmed and published before non-selected
  // quantities finish their placement.

  handleError(workerIndex, errorMessage) {
    const active = this.activeJobs.get(workerIndex);
    this.activeJobs.delete(workerIndex);
    if (active) {
      this.completedJobs++;
      this.canonicalJobsRun++;
    }
    const failedFamilyId = active?.finalist?.familyId;
    if (failedFamilyId && !isBFamily(failedFamilyId) && !isProhibitedFamily(failedFamilyId)) {
      this.failedFamilyIds.add(failedFamilyId);
    }
    if (active?.isB === true) {
      this.bState = "evaluated";
    }
    // Mark B-representative as failed on worker error — prevents re-queuing
    if (active?.isRepresentative) {
      this.representativeState.set(active.finalist?.id, "failed");
    }
    // Placement phase errors: track processing and check per-quantity completion
    const phase = active?.phase || "placement";
    if (phase === "placement") {
      const errQty = active.quantity;
      if (errQty != null && !active?.isRepresentative && !active?.isB) {
        this.quantityPlacementProcessed[errQty] = (this.quantityPlacementProcessed[errQty] || 0) + 1;
        if (this.isQuantityPlacementComplete(errQty) && !this.confirmationQueued[errQty]) {
          this.startConfirmationForQuantity(errQty);
        }
      }
      if (this.queue.length > 0) {
        this.dispatchNext();
      } else if (this.activeJobs.size === 0) {
        this.maybeCheckBAndComplete();
      }
      return;
    }
    if (this.queue.length > 0) {
      this.dispatchNext();
    } else if (this.activeJobs.size === 0) {
      this.maybeCheckBAndComplete();
    }
  }

  publishProgress() {
    const results = this.buildResultsSnapshot();
    const activeQuantities = [...this.activeJobs.values()].map((job) => job.quantity).filter(Number.isFinite);
    const nextQuantity = activeQuantities[0] ?? this.queue[0]?.quantity ?? null;
    results.canonical_jobs_run = this.canonicalJobsRun;
    results.completed_jobs = this.completedJobs;
    results.total_jobs_planned = this.totalJobsPlanned;
    // Phase label reflects the interleaved two-phase architecture. Placement
    // and confirmation can overlap: the selected quantity's confirmation may
    // run while non-selected quantities' placement is still in progress.
    //   "placement" — only placement jobs running (no confirmations yet)
    //   "confirmation_N_of_M" — at least one confirmation has started
    //   "ready" — all complete
    const hasConfirmationStarted = this.confirmationJobsDone > 0
      || (this.queue.some((j) => j.phase === "confirmation"))
      || [...this.activeJobs.values()].some((j) => j.phase === "confirmation");
    if (hasConfirmationStarted || this.controllerPhase === "confirmation") {
      const done = this.confirmationJobsDone;
      const total = this.confirmationJobsPlanned || 1;
      results.phase = `confirmation_${done}_of_${total}`;
    } else if (this.controllerPhase === "placement") {
      results.phase = "placement";
    } else {
      results.phase = Number.isFinite(nextQuantity) ? `evaluating_${nextQuantity}_sub` : "preparing";
    }
    publishStage2Progress(this.projectId, this.currentFingerprint, results);
  }

  /**
   * Check B eligibility for 4-sub, then complete if ready.
   * Called when the queue is empty and no active jobs remain.
   *
   * B is only checked once all normal quantities are final. The eligibility
   * gate may require additional practical family representatives to be
   * evaluated before B can be considered (these exceed the normal
   * two-per-quantity promotion limit, but only on the exceptional B failure
   * path). If representatives are missing they are queued and completion is
   * deferred. If B is eligible it is generated and queued. Otherwise the
   * controller proceeds to normal completion.
   */
  maybeCheckBAndComplete() {
    const allFinal = this.quantityOrder.every((qty) => this.quantityFinal[qty]);
    if (!allFinal) return;

    // B only applies to 4-sub. Check eligibility (initial or re-check after
    // representative evaluations complete).
    if (this.bState === "not_checked" || this.bState === "evaluating_representatives") {
      const fourSubResults = this.completedResults[4] || [];

      const eligibility = evaluateBEligibility({
        evaluatedResults: fourSubResults,
        allStage1Finalists: this.allStage1FourSubFinalists,
        stage1Complete: this.stage1Complete,
        evaluatedFamilyIds: this.evaluatedFamilyIds,
        failedFamilyIds: this.failedFamilyIds,
        fingerprint: this.currentFingerprint,
        currentFingerprint: this.currentFingerprint,
      });

      this.bEligibilityReason = eligibility.reason;
      this.bFailedCandidates = eligibility.failedCandidates;

      // Required practical representatives still missing — queue their best
      // finalist for canonical evaluation, then defer completion.
      if (eligibility.missingRepresentatives && eligibility.missingRepresentatives.length > 0) {
        this.bState = "evaluating_representatives";
        const W = Number(this.params.roomDims?.widthM);
        const L = Number(this.params.roomDims?.lengthM);
        let queuedAny = false;
        for (const rep of eligibility.missingRepresentatives) {
          const repId = rep.finalist?.id;
          if (!repId) continue;
          const repState = this.representativeState.get(repId);
          // Skip representatives already evaluated or failed — they must not
          // be re-queued for the same fingerprint.
          if (repState === "evaluated" || repState === "failed") continue;
          // Skip if the family already has a successful evaluation
          if (this.evaluatedFamilyIds.has(rep.familyId)) continue;
          // If a placement or confirmation job is already in-flight, don't duplicate
          if (repState === "placement" || repState === "confirmation") continue;

          // If the raw transfer is already cached (from a prior run or cold
          // hydration), queue the confirmation directly — skip placement.
          if (this.placementFingerprint && hasCachedRawTransfer(this.placementFingerprint, repId)) {
            const rawTransfer = getCachedRawTransfer(this.placementFingerprint, repId);
            this.representativeState.set(repId, "confirmation");
            this.queue.push({
              finalist: { id: repId, familyId: rep.familyId, sources: rawTransfer.sources?.map((s) => ({ xNorm: s.x / W, yNorm: s.y / L })) },
              quantity: 4,
              phase: "confirmation",
              isRepresentative: true,
              rawTransfer,
            });
            this.totalJobsPlanned++;
            queuedAny = true;
          } else {
            // Queue for placement/raw transfer. The confirmation will be
            // queued automatically when this placement completes.
            this.representativeState.set(repId, "placement");
            this.queue.push({ finalist: rep.finalist, quantity: 4, phase: "placement", isRepresentative: true });
            this.totalJobsPlanned++;
            queuedAny = true;
          }
        }
        if (queuedAny) {
          this.dispatchNext();
        }
        return; // defer completion until representatives are evaluated
      }

      if (eligibility.eligible) {
        // Generate B finalist and queue it for evaluation
        this.bState = "queued";
        const bFinalist = generateBFinalist();
        this.queue.push({ finalist: bFinalist, quantity: 4, phase: "placement", isB: true });
        this.totalJobsPlanned++;
        this.dispatchNext();
        return; // defer completion until B is evaluated
      }

      this.bState = "not_eligible";
    }

    // B is queued and still running — wait
    if (this.bState === "queued") return;

    // B is evaluated or not eligible — proceed to completion
    this.checkComplete();
  }

  checkComplete() {
    const allFinal = this.quantityOrder.every((qty) => this.quantityFinal[qty]);
    if (!allFinal) return;

    const results = this.buildResultsSnapshot();
    results.canonical_jobs_run = this.canonicalJobsRun;
    results.completed_jobs = this.completedJobs;
    results.total_jobs_planned = this.totalJobsPlanned;
    results.phase = "ready";
    results.total_runtime_ms = Math.max(0, now() - this.startTime);
    results.b_eligible = this.bState === "queued" || this.bState === "evaluated";
    results.b_evaluated = this.bState === "evaluated" && this.bResult != null;
    results.b_eligibility_reason = this.bEligibilityReason;
    results.b_failed_candidates = this.bFailedCandidates;
    results.b_result = this.bResult;

    publishStage2Complete(this.projectId, this.currentFingerprint, results);
    this.persist(this.projectId, this.currentFingerprint, results);
    this.cancelAll("complete");
  }

  buildResultsSnapshot() {
    const snapshot = {};
    const quantityMap = { 1: "one_sub_result", 2: "two_sub_result", 4: "four_sub_result" };
    let overallBest = null;

    for (const qty of [1, 2, 4]) {
      const evaluated = this.completedResults[qty] || [];
      if (!evaluated.length) {
        snapshot[quantityMap[qty]] = null;
        continue;
      }
      // Only results carrying a valid ranking tuple are eligible for the
      // ranked set / winner selection. Incomplete, malformed, or failed
      // results (no rankingData.rankingTuple) are excluded — they must never
      // become bestFinalist or overall_best. They remain in this.completedResults
      // for lifecycle/progress tracking but are not promoted into the snapshot.
      const rankable = evaluated.filter((r) => Array.isArray(r?.rankingData?.rankingTuple));
      if (!rankable.length) {
        snapshot[quantityMap[qty]] = {
          quantity: qty,
          evaluatedFinalists: [],
          bestFinalist: null,
          finalistCount: 0,
        };
        continue;
      }
      // B is ranked identically to every other candidate through the normal
      // lexicographic ranking. Family preference (tuple position 12) ensures a
      // practical candidate wins any acoustic tie against B.
      const ranked = [...rankable].sort(compareStage2Results);
      const best = ranked[0];
      snapshot[quantityMap[qty]] = {
        quantity: qty,
        evaluatedFinalists: ranked,
        bestFinalist: best,
        finalistCount: ranked.length,
      };
      // Track overall best (first non-null per quantity, preferring lower quantity)
      if (!overallBest) overallBest = { quantity: qty, ...best };
    }

    snapshot.overall_best = overallBest;
    return snapshot;
  }

  cancelAll(outcome = "cancelled") {
    this.queue = [];
    for (let i = 0; i < this.workers.length; i++) {
      if (this.workers[i]) {
        try { this.workers[i].terminate(); } catch { /* ignore */ }
      }
    }
    this.workers = [];
    this.activeJobs.clear();
  }

  async persist(projectId, fingerprint, results) {
    if (!projectId || projectId === "free" || !results) return;
    try {
      const { syncStage2PlacementCache } = await import("./stage2PlacementPersistence");
      // Extract raw transfers from the in-memory cache for this placement
      // fingerprint so they persist across cold reopen + P14 switches.
      let rawTransfersObj = null;
      if (this.placementFingerprint) {
        const rawTransfersMap = getCachedRawTransfersForFingerprint(this.placementFingerprint);
        if (rawTransfersMap.size > 0) {
          rawTransfersObj = {};
          for (const [finalistId, rawTransfer] of rawTransfersMap.entries()) {
            rawTransfersObj[finalistId] = rawTransfer;
          }
        }
      }
      await syncStage2PlacementCache(
        projectId,
        fingerprint,
        results,
        this.placementFingerprint,
        rawTransfersObj,
        null,
      );
    } catch { /* non-fatal */ }
  }
}

export const stage2PlacementController = new Stage2PlacementController();