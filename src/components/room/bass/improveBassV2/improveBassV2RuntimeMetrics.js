// improveBassV2RuntimeMetrics.js
// Diagnostic runtime instrumentation for V2 Improve Bass Response.
//
// MEASUREMENT ONLY. It changes no search, no candidate count, no P19/P20 maths,
// no materiality rule and no safety check. Every figure here is a time or a
// count of work that has already happened.
//
// ONE RUN IDENTITY. Every record carries the run id minted by the optimiser run
// authority (optimiserRunAuthority.beginOptimiserRun), so the engine's own
// elapsed time, the Stage 2 wait before it, the plan save and the publication
// can be reconciled as ONE run rather than as unrelated figures.
//
// WHAT IS CAPTURED
//   • named stage spans        — transfer acquisition, candidate screening,
//                                seating advisory, final selection, …
//   • worker call spans        — phase, candidate, start, end, duration
//   • sequential wait          — the time BETWEEN consecutive worker calls,
//                                which is main-thread work and queueing, not
//                                calculation; this is the figure that explains
//                                a run whose parts do not add up to its total
//   • counts                   — worker calls, confirmations, candidates,
//                                transfer-cache hits and misses
//   • repeated confirmations   — the same transfer + tuning confirmed twice
//
// BOUNDED LOGGING: logReport() writes ONE compact console.debug line (summary,
// top waits, counts). The full arrays travel on the result for diagnostics and
// are never logged wholesale.

// Scalar notifications only; no response arrays or acoustic inputs retained.
let roomSimulationObserver = null;
export function setRoomSimulationObserver(observer) { roomSimulationObserver = observer; }
export function recordRoomSimulationInvocation(kind = "roomSimulationCalls") { roomSimulationObserver?.(kind); }

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

/** A compact, stable signature of one tuning, for repeat-confirmation detection. */
export function tuningSignature(tuning) {
  if (!Array.isArray(tuning) || !tuning.length) return null;
  try {
    return tuning
      .map((row) => [
        row?.sourceId ?? "",
        Number(row?.delayMs) || 0,
        Number(row?.gainDb) || 0,
        Number(row?.polarity) || 0,
        Number(row?.phaseControlDeg ?? row?.phaseAdjust) || 0,
      ].join(":"))
      .join("|");
  } catch {
    return null;
  }
}

export class V2RuntimeMetrics {
  constructor(projectId, { runId = null, versionId = null } = {}) {
    this.projectId = projectId;
    this.runId = runId || null;
    this.versionId = versionId || null;
    this.startMs = now();
    this.endMs = null;
    this.currentReused = null; // true = reused authority, false = recomputed
    this.stage2TransfersReused = 0;
    this.challengersConfirmed = 0;
    this.workerCalls = [];
    this.proxySearches = [];
    this.placementFingerprintUsed = null;
    this.currentRecalculations = 0;
    this.transferOperations = [];
    // Named stage spans, accumulated per key.
    this.stageTotals = new Map();
    this.openStages = [];
    // Counts of work actually performed (never of work planned).
    this.counts = new Map();
  }

  // ── Named stage spans ────────────────────────────────────────────────────

  beginStage(key) {
    if (!key) return;
    this.openStages.push({ key: String(key), at: now() });
  }

  endStage(key) {
    const index = this.openStages.map((entry) => entry.key).lastIndexOf(String(key));
    if (index < 0) return null;
    const [entry] = this.openStages.splice(index, 1);
    const duration = Math.max(0, now() - entry.at);
    this.addStage(key, duration);
    return duration;
  }

  addStage(key, durationMs) {
    const value = finite(durationMs);
    if (!key || value === null || value < 0) return;
    this.stageTotals.set(String(key), (this.stageTotals.get(String(key)) || 0) + value);
  }

  // ── Counts ───────────────────────────────────────────────────────────────

  count(key, by = 1) {
    const value = finite(by);
    if (!key || value === null) return;
    this.counts.set(String(key), (this.counts.get(String(key)) || 0) + value);
  }

  recordCounts(entries) {
    if (!entries || typeof entries !== "object") return;
    Object.entries(entries).forEach(([key, value]) => this.count(key, value));
  }

  // ── Worker calls ─────────────────────────────────────────────────────────

  /**
   * One worker call. `extra` may carry the call's own start and end on the same
   * clock as `now()` (so sequential wait can be derived), plus the tuning it
   * confirmed (so a repeated confirmation is detectable).
   */
  recordWorkerCall(phase, candidateId, durationMs, reused, extra = {}) {
    const call = {
      phase,
      candidateId,
      durationMs: Number(durationMs) || 0,
      reused,
      startedAt: finite(extra.startedAt),
      endedAt: finite(extra.endedAt),
      transferKey: extra.transferKey ? String(extra.transferKey) : null,
      tuningKey: tuningSignature(extra.tuning),
    };
    this.workerCalls.push(call);
    if (phase === "confirmation") {
      this.count("canonicalConfirmations", 1);
      if (candidateId === "current") this.currentRecalculations++;
      if (call.tuningKey) this.count("confirmationsWithTuningIdentity", 1);
    }
  }

  recordTransferOperation(operation) {
    this.transferOperations.push(operation);
    if (operation?.lookup) this.count(`transfer-${operation.lookup}`, 1);
  }

  recordProxySearch(candidateId, durationMs) {
    this.proxySearches.push({ candidateId, durationMs });
    this.count("proxySearches", 1);
  }

  recordCurrentReuse(reused) {
    this.currentReused = reused;
  }

  recordStage2TransferReused() {
    this.stage2TransfersReused++;
    this.count("stage2TransfersReused", 1);
  }

  recordChallengerConfirmed() {
    this.challengersConfirmed++;
    this.count("challengersConfirmed", 1);
  }

  recordPlacementFingerprint(fp) {
    this.placementFingerprintUsed = fp || null;
  }

  finish() {
    while (this.openStages.length) this.endStage(this.openStages[this.openStages.length - 1].key);
    this.endMs = now();
    this.totalWallClockMs = this.endMs - this.startMs;
  }

  // ── Derived measurement ──────────────────────────────────────────────────

  /**
   * THE RECONCILIATION. Worker calls are sequential on one worker, so the time
   * between two calls belongs to the main thread (or the event loop), not to
   * calculation. Busy + sequential wait must account for the run's own elapsed
   * time; whatever is left is setup/teardown outside the call sequence.
   */
  computeWorkerReconciliation() {
    let busyMs = 0;
    let waitMs = 0;
    let measuredCalls = 0;
    let unmeasuredCalls = 0;
    const waits = [];
    for (let index = 0; index < this.workerCalls.length; index += 1) {
      const call = this.workerCalls[index];
      const hasSpan = call.startedAt !== null && call.endedAt !== null;
      if (!hasSpan) {
        // A call with no recorded span breaks the chain: no gap is invented
        // across an interval whose ends were never measured.
        unmeasuredCalls += 1;
        continue;
      }
      measuredCalls += 1;
      busyMs += Math.max(0, call.endedAt - call.startedAt);
      const previous = this.workerCalls[index - 1];
      if (!previous || previous.endedAt === null) continue;
      const gap = call.startedAt - previous.endedAt;
      if (!Number.isFinite(gap) || gap < 0) continue;
      waitMs += gap;
      if (gap >= 50) {
        waits.push({
          after: previous.phase ? `${previous.phase}:${previous.candidateId}` : String(previous.candidateId),
          before: call.phase ? `${call.phase}:${call.candidateId}` : String(call.candidateId),
          durationMs: Math.round(gap),
        });
      }
    }
    waits.sort((a, b) => b.durationMs - a.durationMs);
    const total = finite(this.totalWallClockMs) ?? Math.max(0, now() - this.startMs);
    return {
      measuredCalls,
      unmeasuredCalls,
      totalCalls: this.workerCalls.length,
      workerBusyMs: Math.round(busyMs),
      sequentialWaitMs: Math.round(waitMs),
      // The part of the run that is neither inside a worker call nor between two
      // of them: setup, the last call's tail and teardown.
      residualMs: Math.round(Math.max(0, total - busyMs - waitMs)),
      // Bounded: the few waits worth looking at, largest first.
      longestWaits: waits.slice(0, 5),
    };
  }

  /** Confirmations of the same transfer + tuning, recorded more than once. */
  computeRepeatedConfirmations() {
    const groups = new Map();
    this.workerCalls
      .filter((call) => call.phase === "confirmation" && call.tuningKey)
      .forEach((call) => {
        const key = `${call.transferKey || "unknown"}|${call.tuningKey}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(call.candidateId || "unknown");
      });
    const repeated = [...groups.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => ({ key, count: ids.length, candidateIds: ids.slice(0, 4) }));
    return {
      repeatedGroups: repeated.length,
      repeatedCalls: repeated.reduce((total, entry) => total + entry.count - 1, 0),
      // Bounded: a handful of examples, never the whole ledger.
      examples: repeated.slice(0, 5),
    };
  }

  stageReport() {
    const stages = [...this.stageTotals.entries()]
      .map(([key, durationMs]) => ({ key, durationMs: Math.round(durationMs) }))
      .sort((a, b) => b.durationMs - a.durationMs);
    const total = finite(this.totalWallClockMs) ?? Math.max(0, now() - this.startMs);
    return {
      runId: this.runId,
      projectId: this.projectId,
      versionId: this.versionId,
      totalWallClockMs: Math.round(total),
      stages,
      stageTotalMs: stages.reduce((sum, stage) => sum + stage.durationMs, 0),
      worker: this.computeWorkerReconciliation(),
      repeatedConfirmations: this.computeRepeatedConfirmations(),
      counts: Object.fromEntries(this.counts.entries()),
    };
  }

  toReport() {
    const stageReport = this.stageReport();
    return {
      runId: this.runId,
      projectId: this.projectId,
      versionId: this.versionId,
      totalWallClockMs: Math.round(this.totalWallClockMs || 0),
      currentReused: this.currentReused,
      currentRecalculations: this.currentRecalculations,
      stage2TransfersReused: this.stage2TransfersReused,
      rawTransferCacheHits: this.stage2TransfersReused + this.transferOperations.filter(o => o.lookup === "hit").length,
      fullTransferReuseHits: this.transferOperations.filter(o => o.lookup === "hit").length,
      rawTransferCacheMisses: this.transferOperations.filter(o => o.lookup === "miss").length,
      transferOperations: this.transferOperations,
      placementFingerprintUsed: this.placementFingerprintUsed,
      challengersConfirmed: this.challengersConfirmed,
      workerCallCount: this.workerCalls.length,
      workerCalls: this.workerCalls.map((c) => ({
        phase: c.phase,
        candidateId: c.candidateId,
        durationMs: Math.round(c.durationMs),
        reused: c.reused,
      })),
      proxySearchCount: this.proxySearches.length,
      proxySearches: this.proxySearches.map((p) => ({
        candidateId: p.candidateId,
        durationMs: Math.round(p.durationMs),
      })),
      // ── the new stage-level measurement ──
      stageSpans: Object.fromEntries(stageReport.stages.map((stage) => [stage.key, stage.durationMs])),
      stageTotalMs: stageReport.stageTotalMs,
      workerBusyMs: stageReport.worker.workerBusyMs,
      sequentialWaitMs: stageReport.worker.sequentialWaitMs,
      residualMs: stageReport.worker.residualMs,
      longestWaits: stageReport.worker.longestWaits,
      repeatedConfirmations: stageReport.repeatedConfirmations,
      counts: stageReport.counts,
    };
  }

  /** ONE compact, bounded diagnostic line. Never the full arrays. */
  logReport() {
    try {
      const stageReport = this.stageReport();
      const stageText = stageReport.stages
        .slice(0, 10)
        .map((stage) => `${stage.key}=${stage.durationMs}ms`)
        .join(" ");
      console.debug(
        "[V2-RUNTIME]",
        JSON.stringify({
          runId: stageReport.runId,
          totalMs: stageReport.totalWallClockMs,
          workerBusyMs: stageReport.worker.workerBusyMs,
          sequentialWaitMs: stageReport.worker.sequentialWaitMs,
          residualMs: stageReport.worker.residualMs,
          calls: `${stageReport.worker.measuredCalls}/${stageReport.worker.totalCalls}`,
          repeatedConfirmations: stageReport.repeatedConfirmations.repeatedCalls,
          counts: stageReport.counts,
          stages: stageText,
          longestWaits: stageReport.worker.longestWaits,
        }),
      );
    } catch {
      // Diagnostics must never break the engine.
    }
  }
}