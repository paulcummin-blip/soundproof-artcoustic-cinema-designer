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
import { getTargetCacheEntry, getTargetCacheProgress, setTargetCacheEntry, setLimitedTargetCacheEntry, flushTargetCachePersistence } from "./p14TargetCache";
import { isValidLimitedP14Contract } from "./p14LimitedTargetAuthority";
import { resolveBackgroundTargetAdvance, captureTargetFailureDiagnostics, formatDiagnosticLine, createSweepDiagnostics, MAX_BACKGROUND_TARGET_RETRIES, classifyBackgroundPoolFailure, captureGenerationFailureDiagnostics, formatGenerationFailureLine } from "./p14TargetBackgroundDiagnostics";
import { requeueInterruptedTargetOnSoftPause } from "./p14TargetSoftPauseRequeue";
import { pushP14BgTimingRecordFromTimings } from "./p14BgTimingsBuffer";
import { safeConsole } from "@/components/utils/safeConsole";
import { subscribe as subscribeUserInteraction, isUserInteracting, getIdleResumeDeadline } from "@/components/state/userInteractionStore";
import { beginP14AnalysisJob, pauseP14AnalysisJob, publishP14AnalysisProgress } from "./p14AnalysisProgressStore";

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
    // Idle-only background: pending deferred completion + its idle-wait timer.
    this.pendingCompletion = null;
    this.completionProcessHandle = null;
    // Bounded retry + sweep diagnostic state. Reset on design/project change.
    this.retryCounts = new Map();     // targetKey -> attempt count
    this.failedTargets = new Set();   // targetKeys that exhausted retry this sweep
    this.sweepDiagnostics = createSweepDiagnostics();
    // Subscribe once to the shared user-interaction authority. Any meaningful
    // interaction (pointerdown, wheel, keydown, drag) pauses speculative work
    // and resets the 3-second idle-resume timer. Hover/pointermove are ignored.
    this._interactionUnsub = subscribeUserInteraction(() => this.onInteraction());
  }

  /**
   * Shared user-interaction callback: pause speculative work immediately on
   * any meaningful interaction. Preserves the queue and completed cache; only
   * the in-flight worker is terminated. Resume is driven by scheduleNext's
   * idle gate (3-second sustained inactivity).
   */
  onInteraction() {
    if (this.cancelled) return;
    const hasActiveWork = this.running
      || this.delayHandle != null
      || this.idleHandle != null
      || !!this.pendingCompletion;
    if (!hasActiveWork) return;
    this.pauseForInteraction();
  }

  /**
   * Pause speculative work without losing the queue or completed cache. The
   * in-flight worker is terminated; scheduleNext re-arms with the idle gate so
   * background only resumes after sustained inactivity. A held completion is
   * re-armed to process after the new quiet period.
   */
  pauseForInteraction() {
    this.cancelScheduledStart();
    if (this.completionProcessHandle != null) {
      clearTimeout(this.completionProcessHandle);
      this.completionProcessHandle = null;
    }
    // SOFT pause: capture the in-flight target before terminating so it can be
    // requeued at the FRONT (restarts first after 3s idle). HARD cancel goes
    // through cancel() and does NOT requeue against the old fingerprint.
    const interruptedTarget = this.currentTarget;
    const interruptedFingerprint = this.currentBaseDesignFingerprint;
    this.terminateWorker();
    this.currentTarget = null;
    this.running = false;
    pauseP14AnalysisJob(this.projectId, { baseDesignFingerprint: this.currentBaseDesignFingerprint });
    if (this.pendingCompletion) {
      this.armCompletionProcessTimer();
      return;
    }
    if (interruptedTarget) {
      requeueInterruptedTargetOnSoftPause({
        queue: this.queue, target: interruptedTarget,
        targetBaseDesignFingerprint: interruptedFingerprint,
        currentBaseDesignFingerprint: this.currentBaseDesignFingerprint,
        projectId: this.projectId,
        pendingCompletionTargetKey: this.pendingCompletion?.target?.key ?? null,
      });
    }
    this.scheduleNext();
  }

  /** Schedule background calculation of remaining targets. Same design →
    *  update foreground target and continue; changed design → cancel+restart.
    *
    *  Remaining targets are sorted by smallest absolute dBC distance from the
    *  selected (foreground) target. When distances tie, the same Minimum/
    *  Recommended basis as the selected target is preferred. This ensures the
    *  closest targets to the user's selection are calculated first, so a P14
    *  switch to a nearby target is most likely to hit a cached result. */
  schedule({ projectId, baseDesignFingerprint, foregroundTargetKey, allTargets, designContext }) {
    if (this.currentBaseDesignFingerprint !== baseDesignFingerprint || this.projectId !== projectId) {
      this.cancel();
      this.currentBaseDesignFingerprint = baseDesignFingerprint;
      this.retryCounts.clear();
       this.failedTargets.clear();
       this.sweepDiagnostics = createSweepDiagnostics();
    }

    this.cancelled = false;
    this.projectId = projectId;
    this.foregroundTargetKey = foregroundTargetKey;
    this.allTargets = allTargets;
    this.designContext = designContext;

    // Find the foreground target's dB and basis for distance-based sorting
    const foregroundTarget = allTargets.find((t) => t.key === foregroundTargetKey);
    const foregroundDb = Number.isFinite(foregroundTarget?.db) ? foregroundTarget.db : null;
    const foregroundBasis = foregroundTarget?.basis || null;

    // Build the queue of remaining targets, sorted by absolute dBC distance
    // from the selected target. Same-basis preferred when distances tie.
    this.queue = allTargets
      .filter((target) =>
        target.key !== foregroundTargetKey
        && target.key !== this.currentTarget?.key
      )
      .sort((a, b) => {
        if (foregroundDb != null && Number.isFinite(a.db) && Number.isFinite(b.db)) {
          const distA = Math.abs(a.db - foregroundDb);
          const distB = Math.abs(b.db - foregroundDb);
          if (Math.abs(distA - distB) > 0.01) return distA - distB;
          // Tie: same basis as foreground preferred
          const aSameBasis = a.basis === foregroundBasis ? 0 : 1;
          const bSameBasis = b.basis === foregroundBasis ? 0 : 1;
          if (aSameBasis !== bSameBasis) return aSameBasis - bSameBasis;
        }
        // Fallback: sort by key for determinism
        return (a.key || "").localeCompare(b.key || "");
      });

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
      // Report partial family if some targets exhausted retry. Do not
      // pretend the family is 8/8 — successfully completed targets are
      // flushed, missing targets remain identifiable for a later sweep.
      const allKeys = (this.allTargets || []).map((t) => t.key);
      const progress = getTargetCacheProgress(this.projectId, this.currentBaseDesignFingerprint, allKeys);
      const failed = this.sweepDiagnostics.failedAfterRetry;
      publishP14AnalysisProgress(this.projectId, {
        baseDesignFingerprint: this.currentBaseDesignFingerprint,
        status: progress.resolved >= progress.total && progress.total > 0 ? "complete" : "calculating",
        completed: progress.resolved,
        total: progress.total,
        completedDurationsMs: progress.completedDurationsMs,
        failedTargetKeys: failed,
        activeTargetKey: null,
        activeStartedAtMs: null,
      });
      const limitedCount = progress.limitedTargetKeys?.length || 0;
      if (failed.length > 0) {
        safeConsole.warn("p14-bg", `sweep complete: ${progress.ready}/${progress.total} cached (${limitedCount} limited), ${failed.length} failed: ${failed.join(', ')}`);
      } else {
        safeConsole.log("p14-bg", `sweep complete: ${progress.ready}/${progress.total} cached (${limitedCount} limited)`);
      }
      flushTargetCachePersistence(this.projectId);
      return;
    }

    this.running = true;
    const target = this.queue.shift();
    this.currentTarget = target;
    const allKeys = (this.allTargets || []).map((item) => item.key);
    const progress = getTargetCacheProgress(this.projectId, this.currentBaseDesignFingerprint, allKeys);
    beginP14AnalysisJob(this.projectId, {
      baseDesignFingerprint: this.currentBaseDesignFingerprint,
      targetKey: target.key,
      completed: progress.resolved,
      total: progress.total,
      completedDurationsMs: progress.completedDurationsMs,
    });
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

    const targetBaseDesignFingerprint = this.currentBaseDesignFingerprint;

    try {
      this.worker = createWorker();
      this.worker.onmessage = (event) => this.handleWorkerMessage(event.data, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint);
      this.worker.onerror = () => this.handleWorkerError(target, targetBaseDesignFingerprint, fingerprint, calibrationFingerprint);
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
      this.handleWorkerError(target, targetBaseDesignFingerprint, fingerprint, calibrationFingerprint);
    }
  }

  handleWorkerMessage(message, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint) {
    if (this.cancelled) { this.terminateWorker(); return; }
    if (message.fingerprint !== fingerprint) {
      safeConsole.warn("p14-bg", `target ${target.key}: fingerprint mismatch (expected ${fingerprint?.substring(0, 24)}..., got ${message.fingerprint?.substring(0, 24)}...)`);
      this.handleTargetFailure(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, null, 'fingerprint-mismatch');
      return;
    }
    if (message.type === "error") {
      safeConsole.warn("p14-bg", `target ${target.key}: worker returned error: ${message.error || "unknown"}`);
      this.handleTargetFailure(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, null, 'worker-error');
      return;
    }
    if (message.type !== "complete") return; // ignore progress

    const compatibility = validateOptimiserVersions(message, BASS_OPTIMISER_VERSIONS);
    if (!compatibility.valid) {
      safeConsole.warn("p14-bg", `target ${target.key}: rejected incompatible worker result (${compatibility.message})`);
      this.handleTargetFailure(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, null, 'version-incompatible');
      return;
    }

    const pool = message[BASS_OPTIMISER_POOL_PROPERTY];

    // Mirror the foreground classification order (bassBackgroundAnalysisStore.js):
    // inspect generationStatus BEFORE candidate count. A non-complete
    // generationStatus (e.g. "invalid-inputs", "invalid-anchor") is the real
    // failure reason — do NOT mask it as "empty-pool". Only fall back to
    // "no-candidates" when generation completed but the pool is genuinely empty.
    const poolFailureReason = classifyBackgroundPoolFailure(pool);
    if (poolFailureReason !== null) {
      this.terminateWorker();
      if (poolFailureReason !== 'no-candidates' && poolFailureReason !== 'no-pool') {
        // Non-complete generationStatus — capture compact diagnostics and log
        // the real failure reason (invalid-inputs / invalid-anchor / etc.).
        const retryCount = this.retryCounts.get(target.key) || 0;
        const genDiag = captureGenerationFailureDiagnostics({
          targetKey: target.key,
          pool,
          designContext: this.designContext,
          fingerprint,
          baseDesignFingerprint: targetBaseDesignFingerprint,
          retryCount,
        });
        safeConsole.warn("p14-bg", formatGenerationFailureLine(genDiag));
      }
      this.handleTargetFailure(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, null, poolFailureReason);
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

    // Idle-only background: if the user is interacting, defer the heavy
    // synchronous contract-construction path. Hold the completed worker
    // result and process it once the app is genuinely idle. This avoids a
    // worker-completion spike landing in the middle of an interaction.
    if (isUserInteracting()) {
      this.terminateWorker();
      this.running = false;
      this.currentTarget = null;
      this.holdPendingCompletion({ workerResult, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint });
      return;
    }

    this.processCompletedWorkerResult(workerResult, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint);
  }

  /**
   * Hold a completed worker result pending idle processing.
   */
  holdPendingCompletion(pending) {
    this.pendingCompletion = pending;
    this.armCompletionProcessTimer();
  }

  /**
   * Arm a timer that processes the pending completion once the app is idle
   * (3-second sustained inactivity). Re-arms if still interacting on fire.
   */
  armCompletionProcessTimer() {
    if (this.completionProcessHandle != null) clearTimeout(this.completionProcessHandle);
    const now = Date.now();
    const wait = Math.max(0, getIdleResumeDeadline() - now);
    this.completionProcessHandle = setTimeout(() => {
      this.completionProcessHandle = null;
      this.tryProcessPendingCompletion();
    }, wait);
  }

  /**
   * Process the pending completion once idle. Discards if the design changed
   * while waiting — stale background authority must never be processed.
   */
  tryProcessPendingCompletion() {
    if (!this.pendingCompletion) return;
    if (this.cancelled) { this.pendingCompletion = null; return; }
    if (isUserInteracting()) {
      this.armCompletionProcessTimer();
      return;
    }
    const pending = this.pendingCompletion;
    this.pendingCompletion = null;
    if (pending.targetBaseDesignFingerprint !== this.currentBaseDesignFingerprint) {
      safeConsole.log("p14-bg", `target ${pending.target.key}: discarded deferred result (design changed while waiting)`);
      this.handleTargetFailure(pending.target, pending.fingerprint, pending.calibrationFingerprint, pending.targetBaseDesignFingerprint, null, 'design-changed-while-deferred');
      return;
    }
    this.processCompletedWorkerResult(pending.workerResult, pending.target, pending.fingerprint, pending.calibrationFingerprint, pending.targetBaseDesignFingerprint);
  }

  /** Build, validate, compact, and cache a completed worker result. Timings
   *  are always collected and pushed to the preview ring buffer. */
  processCompletedWorkerResult(workerResult, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint) {
    const isDev = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV) === true;
    const timings = {};
    const time = (key, fn) => {
      const s = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      const r = fn();
      timings[key] = (timings[key] || 0) + (((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - s);
      return r;
    };

    const compactContract = time("contract", () => buildCompactContractFromWorkerResult({
      workerResult,
      sources: this.designContext.sources,
      usableLfHz: this.designContext.usableLfHz,
      rspRawCurve: this.designContext.rspRawCurve,
      perSeatRawCurves: this.designContext.perSeatRawCurves,
      fingerprints: this.designContext.fingerprints,
      target,
      timings,
    }));

    // Detect a LIMITED P14 contract: the calculation succeeded but the
    // requested P14 dBC is physically unattainable. This is a terminal
    // engineering result, not a failure. Store via the limited cache path
    // so the authoritative cache gate is not weakened.
    const isLimited = compactContract && isValidLimitedP14Contract(compactContract);

    // Attempt insertion into the target cache.
    //   - AUTHORITATIVE contracts → setTargetCacheEntry
    //   - LIMITED contracts → setLimitedTargetCacheEntry (separate path)
    const insertResult = compactContract
      ? (isLimited
        ? time("cacheInsert", () => setLimitedTargetCacheEntry(
            this.projectId,
            this.currentBaseDesignFingerprint,
            target.key,
            compactContract,
            { deferPersistence: true },
          ))
        : time("cacheInsert", () => setTargetCacheEntry(
            this.projectId,
            this.currentBaseDesignFingerprint,
            target.key,
            compactContract,
            { deferPersistence: true },
          )))
      : false;

    // Verify readback: the cache must return the same entry (authoritative
    // OR limited). A target is complete ONLY when insertion returns true
    // AND getTargetCacheEntry readback returns the contract.
    const readback = insertResult
      ? time("readback", () => getTargetCacheEntry(this.projectId, this.currentBaseDesignFingerprint, target.key))
      : null;

    pushP14BgTimingRecordFromTimings(target.key, timings);
    if (isDev) {
      const keys = ["select", "finalResponse", "authority", "applyAuthority", "metricAuthority", "publication", "adapter", "compact", "graphPayload", "cacheInsert", "readback"];
      const total = keys.reduce((sum, k) => sum + (timings[k] || 0), 0);
      safeConsole.log("p14-bg-timing", `target ${target.key} | select:${(timings.select||0).toFixed(1)} finalResponse:${(timings.finalResponse||0).toFixed(1)} authority:${(timings.authority||0).toFixed(1)} applyAuthority:${(timings.applyAuthority||0).toFixed(1)} metricAuthority:${(timings.metricAuthority||0).toFixed(1)} publication:${(timings.publication||0).toFixed(1)} adapter:${(timings.adapter||0).toFixed(1)} compact:${(timings.compact||0).toFixed(1)} (graphPayload:${(timings.graphPayload||0).toFixed(1)}) cacheInsert:${(timings.cacheInsert||0).toFixed(1)} readback:${(timings.readback||0).toFixed(1)} total:${total.toFixed(1)} ms`);
    }

    const fingerprintChanged = targetBaseDesignFingerprint !== this.currentBaseDesignFingerprint;
    const retryCount = this.retryCounts.get(target.key) || 0;

    const decision = resolveBackgroundTargetAdvance({
      insertResult,
      readbackResult: !!readback,
      retryCount,
      maxRetries: MAX_BACKGROUND_TARGET_RETRIES,
      fingerprintChanged,
      cancelled: this.cancelled,
      isLimited,
      contract: compactContract,
    });

    const failureReason = !compactContract
      ? 'contract-build-null'
      : !insertResult
        ? 'insert-rejected'
        : !readback
          ? 'readback-missing'
          : 'unknown';

    this.applyTargetDecision(decision, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, compactContract, workerResult, failureReason);
  }

  handleWorkerError(target, targetBaseDesignFingerprint, fingerprint, calibrationFingerprint) {
    if (this.cancelled) { this.terminateWorker(); return; }
    this.handleTargetFailure(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, null, 'worker-error');
  }

  /**
   * Unified failure handler: applies the advance/retry/fail/discard decision
   * for a target that did not produce a verified cache entry. Captures exact
   * failure diagnostics without exposing large arrays.
   */
  handleTargetFailure(target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, compactContract, failureReason) {
    const fingerprintChanged = targetBaseDesignFingerprint !== this.currentBaseDesignFingerprint;
    const retryCount = this.retryCounts.get(target.key) || 0;

    const decision = resolveBackgroundTargetAdvance({
      insertResult: false,
      readbackResult: false,
      retryCount,
      maxRetries: MAX_BACKGROUND_TARGET_RETRIES,
      fingerprintChanged,
      cancelled: this.cancelled,
    });

    this.applyTargetDecision(decision, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, compactContract, null, failureReason);
  }

  /**
   * Apply a scheduler decision for a completed (or failed) target.
   * Terminates the worker, updates retry/sweep state, and advances to the
   * next target via the idle-delay scheduler. This replaces the old
   * unconditional yieldAndRunNext() that silently lost failed targets.
   */
  applyTargetDecision(decision, target, fingerprint, calibrationFingerprint, targetBaseDesignFingerprint, compactContract, workerResult, failureReason) {
    this.terminateWorker();

    switch (decision.action) {
      case 'advance': {
        this.retryCounts.delete(target.key);
        const allKeys = (this.allTargets || []).map((item) => item.key);
        const progress = getTargetCacheProgress(this.projectId, this.currentBaseDesignFingerprint, allKeys);
        publishP14AnalysisProgress(this.projectId, {
          baseDesignFingerprint: this.currentBaseDesignFingerprint,
          status: progress.resolved >= progress.total && progress.total > 0 ? "complete" : "calculating",
          completed: progress.resolved,
          total: progress.total,
          completedDurationsMs: progress.completedDurationsMs,
          activeTargetKey: null,
          activeStartedAtMs: null,
        });
        safeConsole.log("p14-bg", `target ${target.key}: cached successfully (fingerprint ${fingerprint?.substring(0, 24)}...)`);
        if (!this.sweepDiagnostics.retried.includes(target.key)) {
          this.sweepDiagnostics.insertedFirstTry.push(target.key);
        }
        break;
      }
      case 'limited': {
        // LIMITED: a terminal capability-limited result. The target is
        // resolved (will not be retried) but is NOT authoritative — it
        // carries P14 capability data only, no P18/P19/P20. Count it as
        // resolved so the sweep can reach 8/8 and report "complete".
        this.retryCounts.delete(target.key);
        const allKeys = (this.allTargets || []).map((item) => item.key);
        const progress = getTargetCacheProgress(this.projectId, this.currentBaseDesignFingerprint, allKeys);
        publishP14AnalysisProgress(this.projectId, {
          baseDesignFingerprint: this.currentBaseDesignFingerprint,
          status: progress.resolved >= progress.total && progress.total > 0 ? "complete" : "calculating",
          completed: progress.resolved,
          total: progress.total,
          completedDurationsMs: progress.completedDurationsMs,
          activeTargetKey: null,
          activeStartedAtMs: null,
        });
        safeConsole.log("p14-bg", `target ${target.key}: LIMITED (capability below requested P14 target) — terminal, not retried`);
        if (!this.sweepDiagnostics.retried.includes(target.key)) {
          this.sweepDiagnostics.insertedFirstTry.push(target.key);
        }
        break;
      }
      case 'retry': {
        this.retryCounts.set(target.key, decision.retryCount);
        if (!this.sweepDiagnostics.retried.includes(target.key)) {
          this.sweepDiagnostics.retried.push(target.key);
        }
        // Requeue at front for retry after idle delay. The target is NOT
        // silently lost — it will be re-attempted once before failing.
        this.queue.unshift(target);
        safeConsole.warn("p14-bg", `target ${target.key}: insertion failed (${failureReason}), requeueing for retry ${decision.retryCount}/${MAX_BACKGROUND_TARGET_RETRIES}`);
        break;
      }
      case 'fail': {
        this.failedTargets.add(target.key);
        if (!this.sweepDiagnostics.failedAfterRetry.includes(target.key)) {
          this.sweepDiagnostics.failedAfterRetry.push(target.key);
        }
        const diag = captureTargetFailureDiagnostics({
          targetKey: target.key,
          compactContract,
          workerResult,
          fingerprint,
          calibrationFingerprint,
          baseDesignFingerprint: targetBaseDesignFingerprint,
          foregroundTargetKey: this.foregroundTargetKey,
          retryCount: decision.retryCount,
          cancelled: this.cancelled,
          failureReason,
        });
        this.sweepDiagnostics.failures.push(diag);
        safeConsole.warn("p14-bg", formatDiagnosticLine(diag));
        break;
      }
      case 'discard': {
        // Cancellation or fingerprint change — not a failure. Do not retry
        // the old target against a changed design; the foreground selected
        // target must recalculate first.
        safeConsole.log("p14-bg", `target ${target.key}: discarded (design changed or cancelled)`);
        break;
      }
    }

    this.currentTarget = null;
    this.running = false;
    this.scheduleNext();
  }

  scheduleNext() {
    if (this.cancelled || this.running || this.delayHandle != null || this.idleHandle != null) return;
    // A completed result waiting for idle takes precedence over starting a new
    // target — let the completion timer drive, then scheduleNext continues.
    if (this.pendingCompletion) {
      this.armCompletionProcessTimer();
      return;
    }
    // Idle gate: after user interaction, background may only resume once
    // IDLE_QUIET_MS (3s) of genuine inactivity has elapsed. The normal
    // inter-target delay (BACKGROUND_IDLE_DELAY_MS) is preserved when no
    // interaction occurred recently.
    const now = Date.now();
    const idleWait = Math.max(0, getIdleResumeDeadline() - now);
    const wait = Math.max(BACKGROUND_IDLE_DELAY_MS, idleWait);
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
    }, wait);
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
    if (this.completionProcessHandle != null) {
      clearTimeout(this.completionProcessHandle);
      this.completionProcessHandle = null;
    }
    this.pendingCompletion = null;
    this.terminateWorker();
    this.queue = [];
    this.running = false;
    this.currentTarget = null;
    pauseP14AnalysisJob(projectId, { baseDesignFingerprint: this.currentBaseDesignFingerprint });
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