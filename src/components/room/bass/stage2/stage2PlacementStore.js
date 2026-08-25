// stage2PlacementStore.js
// Controller for Stage 2 canonical placement evaluation.
// Owns: worker pool (max 2), queue, fingerprint, cancellation, memory cache.
// Reuses the existing canonical bass authority pipeline per finalist.

import {
  STAGE2_MAX_CONCURRENT_JOBS,
  STAGE2_FINALISTS_NORMAL,
  STAGE2_START_DELAY_MS,
} from "./stage2Constants";
import { buildStage2RankingTuple, compareStage2Results, meetsStopCondition } from "./stage2Ranking";
import { shouldEvaluateThirdFinalist } from "./stage2FinalistPromotion";

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
    totalRuntimeMs: 0,
    errorMessage: null,
    hydratedFromCache: false,
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
    totalRuntimeMs: results?.total_runtime_ms || 0,
    errorMessage: null,
    hydratedFromCache: true,
  });
}

export function markStage2Updating(projectId, fingerprint) {
  return setMemory(projectId, {
    status: "updating",
    fingerprint,
    errorMessage: null,
    hydratedFromCache: false,
  });
}

export function markStage2Idle(projectId) {
  return setMemory(projectId, {
    status: "idle",
    fingerprint: null,
    errorMessage: null,
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
    totalRuntimeMs: results?.total_runtime_ms || 0,
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
  }

  schedule({ projectId, fingerprint, promotionPlan, params, quantityOrder, delay }) {
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
    this.startTime = now();
    this.quantityOrder = quantityOrder;

    // Build the queue: first NORMAL finalists per quantity in quantity order
    this.queue = [];
    for (const qty of quantityOrder) {
      const finalists = promotionPlan[qty] || [];
      this.quantityFinalists[qty] = finalists;
      this.quantityEvaluated[qty] = 0;
      this.quantityFinal[qty] = false;
      for (let i = 0; i < Math.min(STAGE2_FINALISTS_NORMAL, finalists.length); i++) {
        this.queue.push({ finalist: finalists[i], quantity: qty });
      }
    }

    markStage2Updating(projectId, fingerprint);

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

    if (message.type === "complete" && message.result) {
      if (!this.completedResults[qty]) this.completedResults[qty] = [];
      const result = message.result;
      // Build ranking data
      const seatPriorityMap = this.params?.seatPriorityMap;
      const rankingData = buildStage2RankingTuple(result, seatPriorityMap);
      result.rankingData = rankingData;
      this.completedResults[qty].push(result);
      this.quantityEvaluated[qty] = (this.quantityEvaluated[qty] || 0) + 1;
      this.canonicalJobsRun++;

      // Check stop condition for this quantity
      if (meetsStopCondition(rankingData)) {
        this.quantityFinal[qty] = true;
      }

      // Publish provisional progress
      this.publishProgress();
    } else if (message.type === "error") {
      // Log and continue — a failed finalist is simply not ranked
    }

    // Decide whether a third finalist is needed for this quantity
    if (!this.quantityFinal[qty] && this.quantityEvaluated[qty] >= STAGE2_FINALISTS_NORMAL) {
      const evaluated = this.completedResults[qty] || [];
      const remaining = (this.quantityFinalists[qty] || []).slice(STAGE2_FINALISTS_NORMAL);
      if (shouldEvaluateThirdFinalist(evaluated, remaining) && remaining.length > 0) {
        this.queue.push({ finalist: remaining[0], quantity: qty });
      } else {
        this.quantityFinal[qty] = true;
      }
    }

    // Dispatch next or check completion
    if (this.queue.length > 0) {
      this.dispatchNext();
    } else if (this.activeJobs.size === 0) {
      this.checkComplete();
    }
  }

  handleError(workerIndex, errorMessage) {
    this.activeJobs.delete(workerIndex);
    if (this.queue.length > 0) {
      this.dispatchNext();
    } else if (this.activeJobs.size === 0) {
      this.checkComplete();
    }
  }

  publishProgress() {
    const results = this.buildResultsSnapshot();
    publishStage2Progress(this.projectId, this.currentFingerprint, results);
  }

  checkComplete() {
    const allFinal = this.quantityOrder.every((qty) => this.quantityFinal[qty]);
    if (!allFinal) return;

    const results = this.buildResultsSnapshot();
    results.canonical_jobs_run = this.canonicalJobsRun;
    results.total_runtime_ms = Math.max(0, now() - this.startTime);

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
      const ranked = [...evaluated].sort(compareStage2Results);
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