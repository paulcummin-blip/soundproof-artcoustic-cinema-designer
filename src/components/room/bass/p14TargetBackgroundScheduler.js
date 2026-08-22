// p14TargetBackgroundScheduler.js — Background scheduler for P14 target cache.
//
// After the foreground target completes, this scheduler quietly calculates
// the remaining 7 P14 target combinations one at a time. Results are stored
// in the persistent target cache (p14TargetCache.js) and NEVER published to
// the live UI.
//
// Key guarantees:
//   - One speculative target at a time (no concurrent heavy calculations)
//   - Yields between targets to keep UI responsive
//   - Cancels immediately when the design changes (baseDesignFingerprint mismatch)
//   - Never touches completedBassResultStore or the live UI
//   - Skips targets that are already cached

import {
  BASS_OPTIMISER_POOL_PROPERTY,
  BASS_OPTIMISER_VERSIONS,
  bassOptimiserVersionSignature,
  validateOptimiserVersions,
} from "./bassOptimiserWorkerProtocol";
import { computeCalibrationFingerprint } from "./bassAnalysisFingerprints";
import { buildBassResultCacheKey } from "./bassResultAuthority";
import { buildCompactContractFromWorkerResult } from "./p14TargetContractBuilder";
import { getTargetCacheEntry, setTargetCacheEntry, flushTargetCachePersistence } from "./p14TargetCache";
import { safeConsole } from "@/components/utils/safeConsole";

const createWorker = () => new Worker(
  new URL("../../utils/bassOptimiser.worker.js", import.meta.url),
  { type: "module", name: bassOptimiserVersionSignature() },
);

const BACKGROUND_IDLE_DELAY_MS = 1500;
const BACKGROUND_IDLE_TIMEOUT_MS = 3000;

export class P14TargetBackgroundScheduler {
  constructor() {
    this.worker = null;
    this.queue = [];
    this.currentBaseDesignFingerprint = null;
    this.currentTarget = null;
    this.cancelled = false;
    this.running = false;
    this.projectId = null;
    this.designContext = null;
    this.allTargets = [];
    this.foregroundTargetKey = null;
    this.delayHandle = null;
    this.idleHandle = null;
  }

  /**
   * Schedule background calculation of remaining targets.
   * If the design is the same as the current run, just updates the foreground
   * target and continues. If the design changed, cancels and restarts.
   */
  schedule({ projectId, baseDesignFingerprint, foregroundTargetKey, allTargets, designContext }) {
    if (this.currentBaseDesignFingerprint !== baseDesignFingerprint || this.projectId !== projectId) {
      // Design/project changed — terminate speculative work and persist any
      // completed targets before rebuilding the family queue.
      this.cancel();
      this.currentBaseDesignFingerprint = baseDesignFingerprint;
    }

    this.cancelled = false;
    this.projectId = projectId;
    this.foregroundTargetKey = foregroundTargetKey;
    this.allTargets = allTargets;
    this.designContext = designContext;
    // Always rebuild from the canonical family. Cached targets are skipped by
    // runNext(), and the currently running target is excluded to avoid a
    // duplicate when React republishes the same scheduling inputs.
    this.queue = allTargets.filter((target) =>
      target.key !== foregroundTargetKey
      && target.key !== this.currentTarget?.key
    );
    if (!this.running) this.scheduleNext();
  }

  runNext() {
    if (this.cancelled) { this.running = false; return; }

    // Skip already-cached targets
    while (this.queue.length > 0) {
      const target = this.queue[0];
      const cached = getTargetCacheEntry(this.projectId, this.currentBaseDesignFingerprint, target.key);
      if (cached) {
        this.queue.shift();
        continue;
      }
      break;
    }

    if (this.queue.length === 0) {
      this.running = false;
      this.currentTarget = null;
      flushTargetCachePersistence(this.projectId);
      return;
    }

    this.running = true;
    const target = this.queue.shift();
    this.currentTarget = target;
    safeConsole.log("p14-bg", `target ${target.key}: starting background calculation (fingerprint ${this.currentBaseDesignFingerprint?.substring(0, 24)}...)`);
    this.runTarget(target);
  }

  runTarget(target) {
    const { payload: basePayload, sources, usableLfHz, rspRawCurve, perSeatRawCurves, fingerprints, fingerprintInputs } = this.designContext;

    // Build modified payload for this target
    const payload = {
      ...basePayload,
      selectedP14TargetDb: target.db,
      p14TargetBasis: target.basis,
      p14TargetLevel: target.level,
      selectedP14RequiredExtensionHz: target.p14RequiredExtensionHz,
      p18TargetBasis: target.p18TargetBasis,
      selectedP18RequiredExtensionHz: target.p18RequiredExtensionHz,
    };

    // Compute target-specific calibration fingerprint
    const targetFingerprintInputs = {
      ...fingerprintInputs,
      selectedP14TargetDb: target.db,
      p14TargetBasis: target.basis,
      p14TargetLevel: target.level,
    };
    const calibrationFingerprint = computeCalibrationFingerprint(targetFingerprintInputs);
    // Use the SAME full cache key as the foreground path so background contracts
    // have identical fingerprint identity (job.resultFingerprint === cacheKey).
    // The raw calibration fingerprint alone would produce contracts with a
    // different fingerprint format, causing completedContractMatches to fail
    // when a cached target is promoted.
    const fingerprint = buildBassResultCacheKey(calibrationFingerprint);

    const identity = {
      fingerprint,
      geometryFingerprint: fingerprints?.geometry ?? null,
      productFingerprint: fingerprints?.product ?? null,
      calibrationFingerprint,
      ...BASS_OPTIMISER_VERSIONS,
      canonicalPriorityMode: "canonical-physics-eq",
      poolId: null,
      selectedP14TargetDb: target.db,
      p14TargetBasis: target.basis,
      p14TargetLevel: target.level,
      selectedP14RequiredExtensionHz: target.p14RequiredExtensionHz,
      p18TargetBasis: target.p18TargetBasis,
      selectedP18RequiredExtensionHz: target.p18RequiredExtensionHz,
    };

    try {
      this.worker = createWorker();
      this.worker.onmessage = (event) => this.handleWorkerMessage(event.data, target, fingerprint, calibrationFingerprint);
      this.worker.onerror = () => this.handleWorkerError(target);
      this.worker.postMessage({
        requestId: `p14-bg-${Date.now()}`,
        fingerprint,
        identity,
        ...BASS_OPTIMISER_VERSIONS,
        payload,
        collectDiagnostics: false,
        origin: "p14-background",
      });
    } catch (e) {
      this.handleWorkerError(target);
    }
  }

  handleWorkerMessage(message, target, fingerprint, calibrationFingerprint) {
    if (this.cancelled) { this.terminateWorker(); return; }
    if (message.fingerprint !== fingerprint) {
      safeConsole.warn("p14-bg", `target ${target.key}: fingerprint mismatch (expected ${fingerprint?.substring(0, 24)}..., got ${message.fingerprint?.substring(0, 24)}...)`);
      this.handleWorkerError(target);
      return;
    }
    if (message.type === "error") {
      safeConsole.warn("p14-bg", `target ${target.key}: worker returned error: ${message.error || "unknown"}`);
      this.handleWorkerError(target);
      return;
    }
    if (message.type !== "complete") return; // ignore progress

    const compatibility = validateOptimiserVersions(message, BASS_OPTIMISER_VERSIONS);
    if (!compatibility.valid) {
      safeConsole.warn("p14-bg", `target ${target.key}: rejected incompatible worker result (${compatibility.message})`);
      this.handleWorkerError(target);
      return;
    }

    const pool = message[BASS_OPTIMISER_POOL_PROPERTY];
    if (!pool || !Array.isArray(pool.candidates) || pool.candidates.length === 0) {
      this.terminateWorker();
      this.yieldAndRunNext();
      return;
    }

    const workerResult = {
      pool,
      identity: message.identity,
      calibrationFingerprint,
      fingerprint,
      protocolVersion: message.protocolVersion,
      poolVersion: message.poolVersion,
      engineVersion: message.engineVersion,
      resultSchemaVersion: message.resultSchemaVersion,
      metricSchemaVersion: message.metricSchemaVersion,
    };

    const compactContract = buildCompactContractFromWorkerResult({
      workerResult,
      sources: this.designContext.sources,
      usableLfHz: this.designContext.usableLfHz,
      rspRawCurve: this.designContext.rspRawCurve,
      perSeatRawCurves: this.designContext.perSeatRawCurves,
      fingerprints: this.designContext.fingerprints,
      target,
    });

    if (compactContract && setTargetCacheEntry(
      this.projectId,
      this.currentBaseDesignFingerprint,
      target.key,
      compactContract,
      { deferPersistence: true },
    )) {
      safeConsole.log("p14-bg", `target ${target.key}: cached successfully (fingerprint ${fingerprint?.substring(0, 24)}...)`);
    } else {
      // Contract build or publication validation failed. The target remains
      // missing and eligible for a later retry — do not cache a non-authoritative
      // contract. Log enough to identify the target and reason for dev diagnosis.
      safeConsole.warn("p14-bg", `target ${target.key}: contract build returned null (publication validation failed)`);
    }

    this.terminateWorker();
    this.yieldAndRunNext();
  }

  handleWorkerError(target) {
    // Worker error — the target remains missing and eligible for a later retry.
    // Log enough to identify the target for dev diagnosis without noisy
    // permanent user-facing diagnostics.
    safeConsole.warn("p14-bg", `target ${target.key}: worker error, will retry on next schedule`);
    this.terminateWorker();
    this.yieldAndRunNext();
  }

  yieldAndRunNext() {
    this.currentTarget = null;
    this.running = false;
    this.scheduleNext();
  }

  scheduleNext() {
    if (this.cancelled || this.running || this.delayHandle != null || this.idleHandle != null) return;
    // A real quiet period separates heavy jobs. Once elapsed, prefer the
    // browser's idle scheduler so speculative work only starts when the main
    // thread has room; the timeout prevents the family from starving forever.
    this.delayHandle = setTimeout(() => {
      this.delayHandle = null;
      if (this.cancelled) return;
      if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
        this.idleHandle = window.requestIdleCallback(() => {
          this.idleHandle = null;
          this.runNext();
        }, { timeout: BACKGROUND_IDLE_TIMEOUT_MS });
      } else {
        this.runNext();
      }
    }, BACKGROUND_IDLE_DELAY_MS);
  }

  cancelScheduledStart() {
    if (this.delayHandle != null) {
      clearTimeout(this.delayHandle);
      this.delayHandle = null;
    }
    if (this.idleHandle != null && typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(this.idleHandle);
      this.idleHandle = null;
    }
  }

  terminateWorker() {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }

  cancel() {
    const projectId = this.projectId;
    this.cancelled = true;
    this.cancelScheduledStart();
    this.terminateWorker();
    this.queue = [];
    this.running = false;
    this.currentTarget = null;
    // Completed background targets remain memory-first, then flush as one
    // snapshot when a sweep is interrupted by foreground/user work.
    if (projectId) flushTargetCachePersistence(projectId);
  }

  isRunning() { return this.running; }
}

let globalScheduler = null;
export function getP14TargetBackgroundScheduler() {
  if (!globalScheduler) globalScheduler = new P14TargetBackgroundScheduler();
  return globalScheduler;
}