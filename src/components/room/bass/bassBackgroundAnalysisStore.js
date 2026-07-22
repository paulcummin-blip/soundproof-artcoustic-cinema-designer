// Shared Phase 4 lifecycle for the existing detailed product-aware optimiser worker.
// The controller owns scheduling, race rejection and the bounded memory cache;
// acoustic calculation and candidate selection remain in their existing modules.
import {
  BASS_OPTIMISER_POOL_PROPERTY,
  BASS_OPTIMISER_VERSIONS,
  bassOptimiserVersionSignature,
  describeOptimiserCompatibility,
  validateOptimiserVersions,
} from "./bassOptimiserWorkerProtocol";
import { validateCachedBassResult } from "./bassResultAuthority";

export const BASS_BACKGROUND_SCHEMA_VERSION = bassOptimiserVersionSignature();
export const BASS_BACKGROUND_DEBOUNCE_MS = 1000;
export const BASS_BACKGROUND_CACHE_LIMIT = 3;
export const BASS_HEARTBEAT_STALL_MS = 15000;
export const BASS_TERMINAL_WATCHDOG_MS = 180000;

const IDENTITY_FIELDS = ["fingerprint", "geometryFingerprint", "productFingerprint", "calibrationFingerprint", "protocolVersion", "poolVersion", "engineVersion", "resultSchemaVersion", "canonicalPriorityMode"];
const identityMismatch = (requested, returned) => IDENTITY_FIELDS.find((field) => requested?.[field] !== returned?.[field]) || null;

const nowDefault = () => Date.now();
export const defaultSetTimer = (callback, delay) => globalThis.setTimeout(callback, delay);
export const defaultClearTimer = (timerId) => globalThis.clearTimeout(timerId);

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
    cacheRejectionReason: null,
    errorMessage: null,
    previousResultStale: false,
    progressStage: null,
    progress: null,
    activeJobId: null,
    terminalOutcome: null,
    lastHeartbeatAtMs: null,
    lastHeartbeatAgeMs: null,
    stalled: false,
    workerStatus: "idle",
    requestIdentity: null,
    returnedIdentity: null,
    returnedFingerprint: null,
    replacementRunCount: 0,
    lifecycleTrace: [],
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
  read(fingerprint, validator = validateCachedBassResult) {
    const entry = this.entries.get(fingerprint);
    if (!entry) return { result: null, status: "miss", reason: null };
    if (entry.schemaVersion !== this.schemaVersion) {
      this.entries.delete(fingerprint);
      return { result: null, status: "rejected-stale", reason: "cache-schema-version-mismatch" };
    }
    const validation = validator ? validator(entry.result, { fingerprint }) : { valid: true };
    if (!validation.valid) {
      this.entries.delete(fingerprint);
      return { result: null, status: "rejected-stale", reason: validation.message || validation.reason || "incompatible-result" };
    }
    this.entries.delete(fingerprint);
    this.entries.set(fingerprint, entry);
    return { result: entry.result, status: "hit", reason: null };
  }
  get(fingerprint) {
    return this.read(fingerprint, null).result;
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
  constructor({ workerFactory, debounceMs = BASS_BACKGROUND_DEBOUNCE_MS, now = nowDefault, setTimer = defaultSetTimer, clearTimer = defaultClearTimer, cache } = {}) {
    this.workerFactory = workerFactory;
    this.debounceMs = debounceMs;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.cache = cache || new BassAnalysisLruCache();
    this.state = createBackgroundState();
    this.listeners = new Set();
    this.timer = null;
    this.heartbeatTimer = null;
    this.terminalTimer = null;
    this.worker = null;
    this.activeRequest = null;
    this.pending = null;
    this.requestSequence = 0;
    this.protocolSignature = bassOptimiserVersionSignature();
  }

  getSnapshot = () => this.state;
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  emit(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  stage(name, extra = {}) {
    const atMs = this.now();
    this.emit({
      progressStage: name,
      lastHeartbeatAtMs: atMs,
      lastHeartbeatAgeMs: 0,
      stalled: false,
      lifecycleTrace: [...this.state.lifecycleTrace, { stage: name, atMs, ...extra }],
    });
  }
  clearQueuedTimer() {
    if (this.timer != null) this.clearTimer(this.timer);
    this.timer = null;
  }
  clearWorkerTimers() {
    if (this.heartbeatTimer != null) this.clearTimer(this.heartbeatTimer);
    if (this.terminalTimer != null) this.clearTimer(this.terminalTimer);
    this.heartbeatTimer = null;
    this.terminalTimer = null;
  }
  armHeartbeatTimer(requestId) {
    if (this.heartbeatTimer != null) this.clearTimer(this.heartbeatTimer);
    this.heartbeatTimer = this.setTimer(() => {
      if (this.activeRequest?.requestId !== requestId) return;
      const age = this.now() - (this.state.lastHeartbeatAtMs || this.activeRequest.startedAtMs);
      this.emit({ stalled: true, lastHeartbeatAgeMs: age });
    }, BASS_HEARTBEAT_STALL_MS);
  }
  terminateWorker() {
    this.clearWorkerTimers();
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.activeRequest = null;
  }
  cancelActive(outcome = "cancelled") {
    this.clearQueuedTimer();
    if (this.activeRequest) this.stage(`Job ${outcome}`, { jobId: this.activeRequest.requestId, terminalOutcome: outcome });
    this.terminateWorker();
  }
  ensureProtocolCompatibility(versions = BASS_OPTIMISER_VERSIONS) {
    const nextSignature = bassOptimiserVersionSignature(versions);
    if (this.protocolSignature === nextSignature) return false;
    this.protocolSignature = nextSignature;
    this.cancelActive("protocol-replaced");
    this.cache.clear();
    this.pending = null;
    this.emit({ ...createBackgroundState(), replacementRunCount: 0 });
    return true;
  }

  updateInputs({ valid, fingerprint, legacyFingerprint = null, payload, identity = null, collectDiagnostics = false }) {
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

    this.cancelActive("superseded");
    const staleResult = this.state.result || this.state.staleResult;
    this.stage("Cache lookup", { fingerprint });
    let cacheRead = this.cache.read(fingerprint);
    if (!cacheRead.result && legacyFingerprint && legacyFingerprint !== fingerprint) {
      const legacyRead = this.cache.read(legacyFingerprint);
      if (legacyRead.result || legacyRead.status === "rejected-stale") {
        this.cache.entries.delete(legacyFingerprint);
        cacheRead = { result: null, status: "rejected-stale", reason: legacyRead.reason || "legacy-unversioned-cache-key" };
      }
    }
    const cached = cacheRead.result;
    if (cached) {
      const completedAtMs = this.now();
      this.pending = null;
      this.emit({
        status: "ready", currentCalibrationFingerprint: fingerprint,
        currentJobFingerprint: fingerprint, resultFingerprint: fingerprint,
        queuedAtMs: completedAtMs, startedAtMs: completedAtMs, completedAtMs,
        elapsedMs: 0, cacheStatus: "hit", cacheRejectionReason: null, errorMessage: null,
        previousResultStale: false, progress: null, progressStage: "Cache restored",
        result: cached, staleResult: null, terminalOutcome: "complete", workerStatus: "cache-restored",
        requestIdentity: identity, returnedIdentity: cached.identity || identity, returnedFingerprint: fingerprint,
      });
      return { action: "cache_hit" };
    }

    this.pending = { fingerprint, payload, identity, collectDiagnostics };
    const queuedAtMs = this.now();
    this.emit({
      status: staleResult ? "stale" : "queued",
      currentCalibrationFingerprint: fingerprint, currentJobFingerprint: fingerprint,
      resultFingerprint: null, queuedAtMs, startedAtMs: null, completedAtMs: null,
      elapsedMs: null, cacheStatus: cacheRead.status, cacheRejectionReason: cacheRead.reason, errorMessage: null,
      previousResultStale: !!staleResult, progress: null, progressStage: null,
      result: null, staleResult, terminalOutcome: null, workerStatus: "queued", requestIdentity: identity,
      returnedIdentity: null, returnedFingerprint: null, replacementRunCount: 0,
      });
      this.stage(cacheRead.status === "rejected-stale" ? "Cache rejected" : "Cache miss", { reason: cacheRead.reason || null });
      this.timer = this.setTimer(() => this.startPending(), this.debounceMs);
    return { action: "queued" };
  }

  requestManual({ fingerprint, payload, identity = null, collectDiagnostics = false, force = false }) {
    if (!fingerprint) return { action: "idle" };
    if ((this.state.status === "queued" || this.state.status === "calculating") && this.state.currentJobFingerprint === fingerprint) {
      return { action: "duplicate_ignored" };
    }
    if (!force) return this.updateInputs({ valid: true, fingerprint, payload, identity, collectDiagnostics });
    this.cancelActive();
    const staleResult = this.state.result || this.state.staleResult;
    this.pending = { fingerprint, payload, identity, collectDiagnostics };
    this.emit({
      status: staleResult ? "stale" : "queued", currentCalibrationFingerprint: fingerprint,
      currentJobFingerprint: fingerprint, resultFingerprint: null, queuedAtMs: this.now(),
      startedAtMs: null, completedAtMs: null, elapsedMs: null, cacheStatus: "miss",
      errorMessage: null, previousResultStale: !!staleResult, progress: null,
      progressStage: null, result: null, staleResult, terminalOutcome: null, workerStatus: "queued",
      requestIdentity: identity, returnedIdentity: null, returnedFingerprint: null,
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
    this.activeRequest = { requestId, fingerprint: pending.fingerprint, identity: pending.identity, startedAtMs };
    try {
      const worker = this.workerFactory();
      this.worker = worker;
      this.emit({ status: "calculating", activeJobId: requestId, startedAtMs, elapsedMs: 0, terminalOutcome: null, workerStatus: "active", requestIdentity: pending.identity });
      this.stage("Worker created", { jobId: requestId });
      worker.onmessage = (event) => this.handleWorkerMessage(event?.data || {});
      worker.onerror = (event) => this.handleWorkerError(event?.message || "Worker error", requestId, pending.fingerprint);
      worker.onmessageerror = () => this.handleWorkerError("Worker message could not be decoded", requestId, pending.fingerprint);
      worker.postMessage({ requestId, fingerprint: pending.fingerprint, identity: pending.identity, ...BASS_OPTIMISER_VERSIONS, payload: pending.payload, collectDiagnostics: !!pending.collectDiagnostics, dispatchedAtMs: this.now() });
      this.stage("Worker request posted", { jobId: requestId });
      this.armHeartbeatTimer(requestId);
      this.terminalTimer = this.setTimer(() => this.handleWorkerError(`Bass analysis watchdog expired at: ${this.state.progressStage || "unknown stage"}`, requestId, pending.fingerprint), BASS_TERMINAL_WATCHDOG_MS);
    } catch (error) {
      this.handleWorkerError(error?.message || String(error), requestId, pending.fingerprint);
    }
  }

  handleWorkerMessage(message) {
    const active = this.activeRequest;
    if (!active || message.requestId !== active.requestId) return false;
    if (message.fingerprint !== active.fingerprint) return this.handleIdentityMismatch(active, message, "fingerprint");
    const envelopeCompatibility = validateOptimiserVersions(message, BASS_OPTIMISER_VERSIONS);
    if (!envelopeCompatibility.valid) return this.handleCompatibilityMismatch(active, message, envelopeCompatibility.message);
    const mismatch = identityMismatch(active.identity, message.identity);
    if (mismatch) return this.handleIdentityMismatch(active, message, mismatch);
    if (message.type === "progress") {
      const progress = message.progress && typeof message.progress === "object" ? message.progress : null;
      this.emit({ progress, elapsedMs: this.now() - active.startedAtMs, returnedIdentity: message.identity, returnedFingerprint: message.fingerprint });
      this.stage(typeof progress?.phase === "string" ? progress.phase : "Worker heartbeat", { jobId: active.requestId });
      this.armHeartbeatTimer(active.requestId);
      return true;
    }
    if (message.type === "error") return this.handleWorkerError(message.error || "Unknown worker calculation error", message.requestId, message.fingerprint);
    if (message.type !== "complete") return false;
    if (active.fingerprint !== this.state.currentCalibrationFingerprint) return this.handleIdentityMismatch(active, message, "currentCalibrationFingerprint");
    const completedAtMs = this.now();
    const returnedIdentity = message.identity || active.identity;
    const result = {
      pool: message[BASS_OPTIMISER_POOL_PROPERTY], identity: returnedIdentity,
      calibrationFingerprint: returnedIdentity?.calibrationFingerprint,
      fingerprint: message.fingerprint,
      protocolVersion: message.protocolVersion,
      poolVersion: message.poolVersion,
      engineVersion: message.engineVersion,
      resultSchemaVersion: message.resultSchemaVersion,
      calculationTimeMs: completedAtMs - active.startedAtMs, completedAtMs,
    };
    const validation = validateCachedBassResult(result, { fingerprint: active.fingerprint });
    if (!validation.valid) return this.handleCompatibilityMismatch(active, message, `Rejected incompatible optimiser result: ${validation.message || validation.reason}`);
    this.stage("Main thread received result", { jobId: active.requestId });
    this.stage("Fingerprint validated", { jobId: active.requestId });
    this.cache.set(active.fingerprint, result);
    this.stage("Cache written", { jobId: active.requestId });
    this.terminateWorker();
    this.pending = null;
    this.emit({
      status: "ready", result, staleResult: null, terminalOutcome: "complete", workerStatus: "complete",
      resultFingerprint: active.fingerprint, currentJobFingerprint: active.fingerprint,
      returnedIdentity, returnedFingerprint: message.fingerprint,
      completedAtMs, elapsedMs: result.calculationTimeMs, cacheStatus: "fresh", cacheRejectionReason: this.state.cacheRejectionReason,
      errorMessage: null, previousResultStale: false, progressStage: "Job marked complete",
      lifecycleTrace: [...this.state.lifecycleTrace, { stage: "Job marked complete", atMs: completedAtMs, jobId: active.requestId }],
    });
    return true;
  }

  handleIdentityMismatch(active, message, field) {
    const expected = { ...BASS_OPTIMISER_VERSIONS, fingerprint: active.fingerprint };
    const actual = { ...message, fingerprint: message.fingerprint };
    const reason = `Returned result identity mismatch: ${field}; ${describeOptimiserCompatibility(expected, actual, "identity-mismatch")}`;
    return this.handleCompatibilityMismatch(active, message, reason, field);
  }
  handleCompatibilityMismatch(active, message, reason, field = "worker-handshake") {
    const replacementRunCount = this.state.replacementRunCount || 0;
    this.stage("Job superseded", { jobId: active.requestId, field, terminalOutcome: "superseded" });
    this.cache.entries.delete(active.fingerprint);
    this.terminateWorker();
    if (replacementRunCount < 1 && this.pending) {
      this.emit({ status: "calculating", terminalOutcome: "superseded", errorMessage: reason, replacementRunCount: 1, workerStatus: "replacing", result: null, resultFingerprint: null });
      this.startPending();
    } else {
      this.pending = null;
      this.emit({ status: "error", terminalOutcome: "error", workerStatus: "error", errorMessage: reason, completedAtMs: this.now(), result: null, resultFingerprint: null });
    }
    return true;
  }

  reportMainThreadError(error, stage = "Result adaptation") {
    const message = error?.message || String(error);
    this.stage(`${stage} error`, { terminalOutcome: "error" });
    this.terminateWorker();
    this.pending = null;
    this.emit({ status: "error", terminalOutcome: "error", workerStatus: "error", errorMessage: `${message} (last stage: ${stage})`, completedAtMs: this.now(), result: null, resultFingerprint: null });
  }

  handleWorkerError(error, requestId, fingerprint) {
    const active = this.activeRequest;
    if (!active || requestId !== active.requestId || fingerprint !== active.fingerprint) return false;
    const elapsedMs = this.now() - active.startedAtMs;
    const lastStage = this.state.progressStage || "unknown stage";
    this.stage("Job error", { jobId: requestId, terminalOutcome: "error" });
    this.terminateWorker();
    this.pending = null;
    this.emit({ status: "error", terminalOutcome: "error", workerStatus: "error", errorMessage: `${error} (last stage: ${lastStage})`, elapsedMs, completedAtMs: this.now(), result: null, resultFingerprint: null });
    return true;
  }

  dispose() {
    const hadActiveJob = !!this.activeRequest;
    this.cancelActive("cancelled");
    this.pending = null;
    if (hadActiveJob) this.emit({ status: "idle", terminalOutcome: "cancelled", workerStatus: "cancelled", completedAtMs: this.now() });
  }
}

export const createOptimiserWorker = () => new Worker(new URL("../../utils/bassOptimiser.worker.js", import.meta.url), {
  type: "module",
  name: bassOptimiserVersionSignature(),
});
export function createBassBackgroundAnalysisStore() {
  return new BassBackgroundAnalysisController({ workerFactory: createOptimiserWorker });
}
export const bassBackgroundAnalysisStore = createBassBackgroundAnalysisStore();