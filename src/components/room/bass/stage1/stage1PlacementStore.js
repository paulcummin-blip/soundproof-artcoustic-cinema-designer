// stage1PlacementStore.js
// Controller for Stage 1 placement search.
// Owns: worker lifecycle, generation ID, fingerprint, cancellation, memory cache.
// Fixes the worker backlog issue: rapid geometry changes terminate obsolete workers.

import { STAGE1_START_DELAY_MS, STAGE1_DEBOUNCE_MS } from "./stage1Constants";

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
    errorMessage: null,
    isUpdating: false,
    workerStarted: 0,
    completedAtMs: null,
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

export function getStage1State(projectId) {
  return getMemory(projectId);
}

export function subscribeStage1(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Publish a hydrated cache result as the live state (reopen path).
 */
export function publishHydratedStage1(projectId, fingerprint, results) {
  return setMemory(projectId, {
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

/**
 * Mark Stage 1 as updating (worker in progress).
 */
export function markStage1Updating(projectId, fingerprint) {
  return setMemory(projectId, {
    status: "updating",
    fingerprint,
    isUpdating: true,
    errorMessage: null,
    hydratedFromCache: false,
  });
}

/**
 * Publish completed Stage 1 results.
 */
export function publishStage1Complete(projectId, fingerprint, results) {
  return setMemory(projectId, {
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

/**
 * Mark Stage 1 as idle (invalid inputs).
 */
export function markStage1Idle(projectId) {
  return setMemory(projectId, {
    status: "idle",
    fingerprint: null,
    isUpdating: false,
    errorMessage: null,
  });
}

/**
 * Mark Stage 1 as error.
 */
export function markStage1Error(projectId, fingerprint, errorMessage) {
  return setMemory(projectId, {
    status: "error",
    fingerprint,
    isUpdating: false,
    errorMessage,
  });
}

// ── Worker controller ───────────────────────────────────────────────────

class Stage1PlacementController {
  constructor() {
    this.worker = null;
    this.activeRequest = null;
    this.requestSequence = 0;
    this.timer = null;
    this.debounceMs = STAGE1_DEBOUNCE_MS;
    this.startDelayMs = STAGE1_START_DELAY_MS;
  }

  getSnapshot = () => this.state;
  subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

  /**
   * Schedule a Stage 1 search. Cancels any existing pending/active search.
   * Debounces rapid geometry changes.
   */
  schedule({ projectId, fingerprint, payload, delay }) {
    // Cancel any existing timer
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }

    // Cancel any active worker
    this.cancelActive("superseded");

    if (!fingerprint) {
      markStage1Idle(projectId);
      return;
    }

    // Mark as updating
    markStage1Updating(projectId, fingerprint);

    const waitMs = Number.isFinite(delay) ? delay : this.startDelayMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.start({ projectId, fingerprint, payload });
    }, waitMs);
  }

  /**
   * Start a worker for the Stage 1 search.
   */
  start({ projectId, fingerprint, payload }) {
    const requestId = `stage1-${++this.requestSequence}`;
    this.activeRequest = { requestId, fingerprint, projectId, startedAtMs: performance.now() };

    try {
      if (!this.worker) {
        this.worker = new Worker(new URL("./stage1Placement.worker.js", import.meta.url), { type: "module" });
        this.worker.onmessage = (event) => this.handleMessage(event.data || {});
        this.worker.onerror = (event) => this.handleError(event?.message || "Worker error");
      }

      this.worker.postMessage({ requestId, generationId: requestId, fingerprint, payload });
    } catch (error) {
      this.handleError(error?.message || String(error));
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
      // Worker was cancelled — do nothing (newer request is active)
      return;
    }

    if (message.type === "error") {
      this.handleError(message.error);
      return;
    }

    if (message.type === "complete") {
      this.activeRequest = null;
      publishStage1Complete(active.projectId, active.fingerprint, message.result?.results || null);
      // Persist asynchronously
      this.persist(active.projectId, active.fingerprint, message.result?.results);
    }
  }

  handleError(errorMessage) {
    const active = this.activeRequest;
    if (!active) return;
    this.activeRequest = null;
    markStage1Error(active.projectId, active.fingerprint, errorMessage);
  }

  /**
   * Cancel the active worker and pending timer.
   */
  cancelActive(outcome = "cancelled") {
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
  }

  /**
   * Persist results to DB (async, non-blocking).
   */
  async persist(projectId, fingerprint, results) {
    if (!projectId || projectId === "free" || !results) return;
    try {
      const { syncStage1PlacementCache } = await import("./stage1PlacementPersistence");
      await syncStage1PlacementCache(projectId, fingerprint, results, null);
    } catch { /* non-fatal */ }
  }

  dispose() {
    this.cancelActive("disposed");
  }
}

export const stage1PlacementController = new Stage1PlacementController();