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
  }

  schedule({ projectId, fingerprint, promotionPlan, allStage1Finalists, stage1Complete, params, quantityOrder, delay }) {
    this.cancelAll("superseded");
    if (!fingerprint) {
      markStage2Idle(projectId);
      return;
    }

    this.projectId = projectId;
    this.currentFingerprint = fingerprint;
    this.params = params;
    this.completedResults = {};
    this.quantityEvaluated = {};
    this.quantityFinal = {};
    this.quantityFinalists = {};
    this.canonicalJobsRun = 0;
    this.completedJobs = 0;
    this.totalJobsPlanned = 0;
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

    // Build the queue: first NORMAL finalists per quantity in quantity order
    this.queue = [];
    for (const qty of quantityOrder) {
      const finalists = promotionPlan[qty] || [];
      this.quantityFinalists[qty] = finalists;
      this.quantityEvaluated[qty] = 0;
      // Mark as final if no finalists to evaluate
      this.quantityFinal[qty] = finalists.length === 0;
      for (let i = 0; i < Math.min(STAGE2_FINALISTS_NORMAL, finalists.length); i++) {
        this.queue.push({ finalist: finalists[i], quantity: qty });
      }
    }

    this.totalJobsPlanned = this.queue.length;
    markStage2Updating(projectId, fingerprint, {
      phase: "preparing",
      completedJobs: 0,
      totalJobsPlanned: this.totalJobsPlanned,
    });

    // If no finalists at all, check B eligibility then complete
    if (this.queue.length === 0 && this.quantityOrder.every((qty) => this.quantityFinal[qty])) {
      this.maybeCheckBAndComplete();
      return;
    }

    const waitMs = Number.isFinite(delay) ? delay : STAGE2_START_DELAY_MS;
    setTimeout(() => {
      if (this.currentFingerprint !== fingerprint) return; // stale
      this.dispatchNext();
    }, waitMs);
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
    this.workers[workerIndex].postMessage({
      requestId,
      fingerprint: this.currentFingerprint,
      finalist: job.finalist,
      ...workerParams,
    });
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
    this.completedJobs++;
    this.canonicalJobsRun++;

    if (message.type === "complete") {
      // Count every completed job (including null results) so the third-finalist
      // check fires even when a finalist evaluation returns null.
      this.quantityEvaluated[qty] = (this.quantityEvaluated[qty] || 0) + 1;
      if (message.result) {
        if (!this.completedResults[qty]) this.completedResults[qty] = [];
        const result = message.result;
        // Track evaluated practical family (has at least one successful result)
        if (result.familyId && !isBFamily(result.familyId) && !isProhibitedFamily(result.familyId)) {
          this.evaluatedFamilyIds.add(result.familyId);
        }
        const seatPriorityMap = this.params?.seatPriorityMap;
        const rankingData = buildStage2RankingTuple(result, seatPriorityMap);
        result.rankingData = rankingData;
        this.completedResults[qty].push(result);
        if (meetsStopCondition(rankingData)) {
          this.quantityFinal[qty] = true;
        }
        // Track B result separately for persistence
        if (wasBJob) {
          this.bResult = result;
        }
        this.publishProgress();
      }
    } else if (message.type === "error") {
      // Track failed practical family (all attempts failed → optimiser incomplete)
      const failedFamilyId = active.finalist?.familyId;
      if (failedFamilyId && !isBFamily(failedFamilyId) && !isProhibitedFamily(failedFamilyId)) {
        this.failedFamilyIds.add(failedFamilyId);
      }
    }

    // Mark B as evaluated (success or error) so completion can proceed
    if (wasBJob) {
      this.bState = "evaluated";
    }

    // Decide whether a third finalist is needed for this quantity
    // (skip for B jobs — B is not a normal finalist)
    if (!wasBJob && !this.quantityFinal[qty] && this.quantityEvaluated[qty] >= STAGE2_FINALISTS_NORMAL) {
      const evaluated = this.completedResults[qty] || [];
      const remaining = (this.quantityFinalists[qty] || []).slice(STAGE2_FINALISTS_NORMAL);
      if (shouldEvaluateThirdFinalist(evaluated, remaining) && remaining.length > 0) {
        this.queue.push({ finalist: remaining[0], quantity: qty });
        this.totalJobsPlanned++;
      } else {
        this.quantityFinal[qty] = true;
      }
    }

    // Dispatch next or check B eligibility + completion
    if (this.queue.length > 0) {
      this.dispatchNext();
    } else if (this.activeJobs.size === 0) {
      this.maybeCheckBAndComplete();
    }
  }

  handleError(workerIndex, errorMessage) {
    const active = this.activeJobs.get(workerIndex);
    this.activeJobs.delete(workerIndex);
    if (active) {
      this.completedJobs++;
      this.canonicalJobsRun++;
    }
    // Track failed practical family (all attempts failed → optimiser incomplete)
    const failedFamilyId = active?.finalist?.familyId;
    if (failedFamilyId && !isBFamily(failedFamilyId) && !isProhibitedFamily(failedFamilyId)) {
      this.failedFamilyIds.add(failedFamilyId);
    }
    // Mark B as evaluated even on error so completion can proceed
    if (active?.isB === true) {
      this.bState = "evaluated";
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
    results.phase = Number.isFinite(nextQuantity) ? `evaluating_${nextQuantity}_sub` : "preparing";
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
        for (const rep of eligibility.missingRepresentatives) {
          this.queue.push({ finalist: rep.finalist, quantity: 4, isRepresentative: true });
          this.totalJobsPlanned++;
        }
        this.dispatchNext();
        return; // defer completion until representatives are evaluated
      }

      if (eligibility.eligible) {
        // Generate B finalist and queue it for evaluation
        this.bState = "queued";
        const bFinalist = generateBFinalist();
        this.queue.push({ finalist: bFinalist, quantity: 4, isB: true });
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
      await syncStage2PlacementCache(projectId, fingerprint, results, null);
    } catch { /* non-fatal */ }
  }
}

export const stage2PlacementController = new Stage2PlacementController();