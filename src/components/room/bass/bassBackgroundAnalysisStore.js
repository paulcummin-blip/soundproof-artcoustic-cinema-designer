// Shared Phase 4 lifecycle for the existing detailed product-aware optimiser worker.
// The controller owns scheduling, race rejection and the bounded memory cache;
// acoustic calculation and candidate selection remain in their existing modules.
export const BASS_BACKGROUND_SCHEMA_VERSION = 1;
export const BASS_BACKGROUND_DEBOUNCE_MS = 1000;
export const BASS_BACKGROUND_CACHE_LIMIT = 3;

const nowDefault = () => Date.now();

export function createBackgroundState() {
  return {
    schemaVersion: BASS_BACKGROUND_SCHEMA_VERSION,
    status: "idle",
    currentCalibrationFingerprint: null,
    currentJobFingerprint: null,
    resultFingerprint: null,
    queuedAtMs: null,
    startedAtMs: null,
    completedAtMs: null,
    elapsedMs: null,
    cacheStatus: "none",
    errorMessage: null,
    previousResultStale: false,
    progressStage: null,
    progress: null,
    result: null,
    staleResult: null,
  };
}

export class BassAnalysisLruCache {
  constructor(limit = BASS_BACKGROUND_CACHE_LIMIT, schemaVersion = BASS_BACKGROUND_SCHEMA_VERSION) {
    this.limit = limit;
    this.schemaVersion = schemaVersion;
    this.entries = new Map();
  }
  get(fingerprint) {
    const entry = this.entries.get(fingerprint);
    if (!entry || entry.schemaVersion !== this.schemaVersion) return null;
    this.entries.delete(fingerprint);
    this.entries.set(fingerprint, entry);
    return entry.result;
  }
  set(fingerprint, result) {
    if (!fingerprint || !result) return;
    this.entries.delete(fingerprint);
    this.entries.set(fingerprint, { schemaVersion: this.schemaVersion, result });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
  }
  clear() { this.entries.clear(); }
  keys() { return Array.from(this.entries.keys()); }
}

export class BassBackgroundAnalysisController {
  constructor({ workerFactory, debounceMs = BASS_BACKGROUND_DEBOUNCE_MS, now = nowDefault, setTimer = setTimeout, clearTimer = clearTimeout, cache } = {}) {
    this.workerFactory = workerFactory;
    this.debounceMs = debounceMs;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.cache = cache || new BassAnalysisLruCache();
    this.state = createBackgroundState();
    this.listeners = new Set();
    this.timer = null;
    this.worker = null;
    this.activeRequest = null;
    this.pending = null;
    this.requestSequence = 0;
  }

  getSnapshot = () => this.state;
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  emit(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  clearQueuedTimer() {
    if (this.timer != null) this.clearTimer(this.timer);
    this.timer = null;
  }
  terminateWorker() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.activeRequest = null;
  }
  cancelActive() {
    this.clearQueuedTimer();
    this.terminateWorker();
  }

  updateInputs({ valid, fingerprint, payload, collectDiagnostics = false }) {
    if (!valid || !fingerprint) {
      this.cancelActive();
      const staleResult = this.state.result || this.state.staleResult;
      this.pending = null;
      this.emit({
        status: "idle", currentCalibrationFingerprint: fingerprint || null,
        currentJobFingerprint: null, resultFingerprint: null,
        result: null, staleResult, previousResultStale: !!staleResult,
        cacheStatus: "none", errorMessage: null, progress: null, progressStage: null,
      });
      return { action: "idle" };
    }

    if (this.state.currentCalibrationFingerprint === fingerprint) {
      if (this.state.status === "queued" || this.state.status === "calculating") return { action: "duplicate_ignored" };
      if (this.state.status === "ready" && this.state.resultFingerprint === fingerprint) return { action: "already_ready" };
    }

    this.cancelActive();
    const staleResult = this.state.result || this.state.staleResult;
    const cached = this.cache.get(fingerprint);
    if (cached) {
      const completedAtMs = this.now();
      this.pending = null;
      this.emit({
        status: "ready", currentCalibrationFingerprint: fingerprint,
        currentJobFingerprint: fingerprint, resultFingerprint: fingerprint,
        queuedAtMs: completedAtMs, startedAtMs: completedAtMs, completedAtMs,
        elapsedMs: 0, cacheStatus: "hit", errorMessage: null,
        previousResultStale: false, progress: null, progressStage: null,
        result: cached, staleResult: null,
      });
      return { action: "cache_hit" };
    }

    this.pending = { fingerprint, payload, collectDiagnostics };
    const queuedAtMs = this.now();
    this.emit({
      status: staleResult ? "stale" : "queued",
      currentCalibrationFingerprint: fingerprint, currentJobFingerprint: fingerprint,
      resultFingerprint: null, queuedAtMs, startedAtMs: null, completedAtMs: null,
      elapsedMs: null, cacheStatus: "miss", errorMessage: null,
      previousResultStale: !!staleResult, progress: null, progressStage: null,
      result: null, staleResult,
    });
    this.timer = this.setTimer(() => this.startPending(), this.debounceMs);
    return { action: "queued" };
  }

  requestManual({ fingerprint, payload, collectDiagnostics = false, force = false }) {
    if (!fingerprint) return { action: "idle" };
    if ((this.state.status === "queued" || this.state.status === "calculating") && this.state.currentJobFingerprint === fingerprint) {
      return { action: "duplicate_ignored" };
    }
    if (!force) return this.updateInputs({ valid: true, fingerprint, payload, collectDiagnostics });
    this.cancelActive();
    const staleResult = this.state.result || this.state.staleResult;
    this.pending = { fingerprint, payload, collectDiagnostics };
    this.emit({
      status: staleResult ? "stale" : "queued", currentCalibrationFingerprint: fingerprint,
      currentJobFingerprint: fingerprint, resultFingerprint: null, queuedAtMs: this.now(),
      startedAtMs: null, completedAtMs: null, elapsedMs: null, cacheStatus: "miss",
      errorMessage: null, previousResultStale: !!staleResult, progress: null,
      progressStage: null, result: null, staleResult,
    });
    this.startPending();
    return { action: "refresh_started" };
  }

  startPending() {
    this.clearQueuedTimer();
    const pending = this.pending;
    if (!pending || !this.workerFactory) return;
    if (this.activeRequest?.fingerprint === pending.fingerprint) return;
    const requestId = `bass-${++this.requestSequence}`;
    const startedAtMs = this.now();
    this.activeRequest = { requestId, fingerprint: pending.fingerprint, startedAtMs };
    const worker = this.workerFactory();
    this.worker = worker;
    this.emit({ status: "calculating", startedAtMs, elapsedMs: 0, progressStage: null });
    worker.onmessage = (event) => this.handleWorkerMessage(event?.data || {});
    worker.onerror = (event) => this.handleWorkerError(event?.message || "Worker error", requestId, pending.fingerprint);
    worker.postMessage({ requestId, fingerprint: pending.fingerprint, payload: pending.payload, collectDiagnostics: !!pending.collectDiagnostics });
  }

  handleWorkerMessage(message) {
    const active = this.activeRequest;
    if (!active || message.requestId !== active.requestId || message.fingerprint !== active.fingerprint) return false;
    if (message.type === "progress") {
      const progress = message.progress && typeof message.progress === "object" ? message.progress : null;
      this.emit({ progress, progressStage: typeof progress?.phase === "string" ? progress.phase : null, elapsedMs: this.now() - active.startedAtMs });
      return true;
    }
    if (message.type === "error") {
      this.handleWorkerError(message.error || "Unknown worker calculation error", message.requestId, message.fingerprint);
      return true;
    }
    if (message.type !== "complete") return false;
    if (active.fingerprint !== this.state.currentCalibrationFingerprint) return false;
    const completedAtMs = this.now();
    const result = {
      pool: message.pool,
      calibrationFingerprint: active.fingerprint,
      calculationTimeMs: completedAtMs - active.startedAtMs,
      completedAtMs,
    };
    this.cache.set(active.fingerprint, result);
    this.terminateWorker();
    this.pending = null;
    this.emit({
      status: "ready", result, staleResult: null,
      resultFingerprint: active.fingerprint, currentJobFingerprint: active.fingerprint,
      completedAtMs, elapsedMs: result.calculationTimeMs, cacheStatus: "miss",
      errorMessage: null, previousResultStale: false, progressStage: "Complete",
    });
    return true;
  }

  handleWorkerError(error, requestId, fingerprint) {
    const active = this.activeRequest;
    if (!active || requestId !== active.requestId || fingerprint !== active.fingerprint) return false;
    const elapsedMs = this.now() - active.startedAtMs;
    this.terminateWorker();
    this.pending = null;
    this.emit({ status: "error", errorMessage: error, elapsedMs, completedAtMs: this.now(), result: null, resultFingerprint: null });
    return true;
  }

  dispose() {
    this.cancelActive();
    this.pending = null;
  }
}

const createOptimiserWorker = () => new Worker(new URL("../../utils/bassOptimiser.worker.js", import.meta.url), { type: "module" });
export const bassBackgroundAnalysisStore = new BassBackgroundAnalysisController({ workerFactory: createOptimiserWorker });