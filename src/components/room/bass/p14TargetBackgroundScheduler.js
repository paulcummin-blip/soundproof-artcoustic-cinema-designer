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
} from "./bassOptimiserWorkerProtocol";
import { computeCalibrationFingerprint } from "./bassAnalysisFingerprints";
import { buildBassResultCacheKey } from "./bassResultAuthority";
import { buildCompactContractFromWorkerResult } from "./p14TargetContractBuilder";
import { getTargetCacheEntry, setTargetCacheEntry } from "./p14TargetCache";
import { safeConsole } from "@/components/utils/safeConsole";

const createWorker = () => new Worker(
  new URL("../../utils/bassOptimiser.worker.js", import.meta.url),
  { type: "module", name: bassOptimiserVersionSignature() },
);

const YIELD_MS = 100; // Yield between targets to keep UI responsive

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
  }

  /**
   * Schedule background calculation of remaining targets.
   * If the design is the same as the current run, just updates the foreground
   * target and continues. If the design changed, cancels and restarts.
   */
  schedule({ projectId, baseDesignFingerprint, foregroundTargetKey, allTargets, designContext }) {
    if (this.currentBaseDesignFingerprint === baseDesignFingerprint) {
      // Same design — just update foreground target and continue
      this.cancelled = false; // Reset in case we were paused
      this.foregroundTargetKey = foregroundTargetKey;
      this.projectId = projectId;
      this.designContext = designContext;
      this.allTargets = allTargets;
      // Remove foreground target from queue if present
      this.queue = this.queue.filter((t) => t.key !== foregroundTargetKey);
      if (!this.running) this.runNext();
      return;
    }
    // Design changed — cancel and restart
    this.cancel();
    this.cancelled = false;
    this.projectId = projectId;
    this.currentBaseDesignFingerprint = baseDesignFingerprint;
    this.foregroundTargetKey = foregroundTargetKey;
    this.allTargets = allTargets;
    this.designContext = designContext;
    this.queue = allTargets.filter((t) => t.key !== foregroundTargetKey);
    this.runNext();
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

    if (compactContract) {
      setTargetCacheEntry(this.projectId, this.currentBaseDesignFingerprint, target.key, compactContract);
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
    setTimeout(() => this.runNext(), YIELD_MS);
  }

  terminateWorker() {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }

  cancel() {
    this.cancelled = true;
    this.terminateWorker();
    this.queue = [];
    this.running = false;
    this.currentTarget = null;
  }

  isRunning() { return this.running; }
}

let globalScheduler = null;
export function getP14TargetBackgroundScheduler() {
  if (!globalScheduler) globalScheduler = new P14TargetBackgroundScheduler();
  return globalScheduler;
}