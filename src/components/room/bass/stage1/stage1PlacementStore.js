// stage1PlacementStore.js
// Controller for Stage 1 placement search.
// Owns: worker lifecycle, generation ID, fingerprint, cancellation, memory cache.
// Fixes the worker backlog issue: rapid geometry changes terminate obsolete workers.

import { STAGE1_START_DELAY_MS, STAGE1_DEBOUNCE_MS } from "./stage1Constants";
import { bassCacheKey } from "../bassCacheKey";

const listeners = new Set();
const memoryByProject = new Map();

function notify() { listeners.forEach((l) => l()); }

function emptyState(projectId, versionId) {
  return {
    projectId: bassCacheKey(projectId, versionId),
    status: "idle",
    fingerprint: null,
    one_sub_result: null,
    two_sub_result: null,
    four_sub_result: null,
    errorMessage: null,
    isUpdating: false,
    workerStarted: 0,
    completedAtMs: null,
    hydratedFromCache: false,
  };
}

function getMemory(projectId, versionId) {
  const key = bassCacheKey(projectId, versionId);
  if (!memoryByProject.has(key)) memoryByProject.set(key, emptyState(projectId, versionId));
  return memoryByProject.get(key);
}

function setMemory(projectId, versionId, patch) {
  const key = bassCacheKey(projectId, versionId);
  const prev = memoryByProject.get(key) || emptyState(projectId, versionId);
  const next = { ...prev, ...patch };
  memoryByProject.set(key, next);
  notify();
  return next;
}

export function getStage1State(projectId, versionId) {
  return getMemory(projectId, versionId);
}

export function subscribeStage1(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Publish a hydrated cache result as the live state (reopen path).
 */
export function publishHydratedStage1(projectId, versionId, fingerprint, results) {
  return setMemory(projectId, versionId, {
    status: "complete",
    fingerprint,
    one_sub_result: results?.one_sub_result || null,
    two_sub_result: results?.two_sub_result || null,
    four_sub_result: results?.four_sub_result || null,
    errorMessage: null,
    isUpdating: false,
    hydratedFromCache: true,
    completedAtMs: Date.now(),
  });
}

export function markStage1Updating(projectId, versionId, fingerprint) {
  return setMemory(projectId, versionId, {
    status: "updating",
    fingerprint,
    isUpdating: true,
    errorMessage: null,
    hydratedFromCache: false,
  });
}

export function publishStage1Complete(projectId, versionId, fingerprint, results) {
  return setMemory(projectId, versionId, {
    status: "complete",
    fingerprint,
    one_sub_result: results?.one_sub_result || null,
    two_sub_result: results?.two_sub_result || null,
    four_sub_result: results?.four_sub_result || null,
    errorMessage: null,
    isUpdating: false,
    hydratedFromCache: false,
    completedAtMs: Date.now(),
  });
}

export function markStage1Idle(projectId, versionId) {
  return setMemory(projectId, versionId, {
    status: "idle",
    fingerprint: null,
    isUpdating: false,
    errorMessage: null,
  });
}

export function markStage1Error(projectId, versionId, fingerprint, errorMessage) {
  return setMemory(projectId, versionId, {
    status: "error",
    fingerprint,
    isUpdating: false,
    errorMessage,
  });
}

function markStage1Stopped(request, outcome) {
  if (!request) return;
  setMemory(request.projectId, request.versionId, {
    status: outcome === "superseded" || outcome === "request-fingerprint-stale" ? "stale" : "cancelled",
    fingerprint: request.fingerprint,
    isUpdating: false,
    errorMessage: null,
  });
}

// ── Worker controller ───────────────────────────────────────────────────

class Stage1PlacementController {
  constructor() {
    this.worker = null;
    this.activeRequest = null;
    this.requestSequence = 0;
    this.timer = null;
    this.pendingRequest = null;
    this.debounceMs = STAGE1_DEBOUNCE_MS;
    this.startDelayMs = STAGE1_START_DELAY_MS;
  }

  getSnapshot = () => this.state;
  subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

  /**
   * Schedule a Stage 1 search. Cancels any existing pending/active search.
   * Debounces rapid geometry changes.
   */
  schedule({ projectId, versionId, fingerprint, payload, delay }) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.cancelActive("superseded");

    if (!fingerprint) {
      markStage1Idle(projectId, versionId);
      return;
    }

    markStage1Updating(projectId, versionId, fingerprint);

    const waitMs = Number.isFinite(delay) ? delay : this.startDelayMs;
    this.pendingRequest = { projectId, versionId, fingerprint };
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pendingRequest = null;
      this.start({ projectId, versionId, fingerprint, payload });
    }, waitMs);
  }

  start({ projectId, versionId, fingerprint, payload }) {
    const requestId = `stage1-${++this.requestSequence}`;
    this.activeRequest = { requestId, fingerprint, projectId, versionId, startedAtMs: performance.now() };

    try {
      if (!this.worker) {
        const worker = new Worker(new URL("./stage1Placement.worker.js", import.meta.url), { type: "module" });
        this.worker = worker;
        worker.onmessage = (event) => {
          if (this.worker === worker) this.handleMessage(event.data || {});
        };
        worker.onerror = (event) => {
          if (this.worker === worker) this.handleError(event?.message || "Worker error", true);
        };
      }

      this.worker.postMessage({ requestId, generationId: requestId, fingerprint, payload });
    } catch (error) {
      this.handleError(error?.message || String(error), true);
    }
  }

  /**
   * Handle worker messages. Rejects stale results (fingerprint mismatch).
   */
  handleMessage(message) {
    const active = this.activeRequest;
    if (!active || message.requestId !== active.requestId) return; // stale
    if (message.fingerprint !== active.fingerprint) return; // stale fingerprint

    if (message.type === "cancelled") {
      this.activeRequest = null;
      markStage1Stopped(active, "cancelled");
      return;
    }

    if (message.type === "error") {
      this.handleError(message.error);
      return;
    }

    if (message.type === "complete") {
      this.activeRequest = null;
      publishStage1Complete(active.projectId, active.versionId, active.fingerprint, message.result?.results || null);
      this.persist(active.projectId, active.versionId, active.fingerprint, message.result?.results);
    }
  }

  handleError(errorMessage, retireWorker = false) {
    if (retireWorker && this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    const active = this.activeRequest;
    if (!active) return;
    this.activeRequest = null;
    markStage1Error(active.projectId, active.versionId, active.fingerprint, errorMessage);
  }

  /**
   * Cancel the active worker and pending timer.
   */
  cancelActive(outcome = "cancelled") {
    const request = this.activeRequest || this.pendingRequest;
    this.pendingRequest = null;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.worker && this.activeRequest) {
      // Send cancel message to worker
      try {
        this.worker.postMessage({ type: "cancel", requestId: this.activeRequest.requestId });
      } catch { /* ignore */ }
      // Terminate the worker — guarantees no stale CPU work
      this.worker.terminate();
      this.worker = null;
    }
    this.activeRequest = null;
    markStage1Stopped(request, outcome);
  }

  /**
   * Persist results to DB (async, non-blocking).
   */
  async persist(projectId, versionId, fingerprint, results) {
    if (!projectId || projectId === "free" || !results) return;
    try {
      const { syncStage1PlacementCache } = await import("./stage1PlacementPersistence");
      await syncStage1PlacementCache(projectId, versionId, fingerprint, results, null);
    } catch { /* non-fatal */ }
  }

  dispose() {
    this.cancelActive("disposed");
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export const stage1PlacementController = new Stage1PlacementController();