// improveBassV2RuntimeMetrics.js
// Temporary/diagnostic runtime instrumentation for V2 Improve Bass Response.
//
// Captures browser-cost data sufficient to determine a production whole-run
// timeout threshold. NOT user-facing — uses console.debug with a structured
// prefix. Safe to remove once the threshold is finalised.
//
// Captures:
//   - V2 total wall-clock duration
//   - Current authority reuse or recomputation
//   - Each placement-worker operation (phase, candidateId, duration, reused)
//   - Each confirmation-worker operation (phase, candidateId, duration, reused)
//   - Proxy search duration per candidate
//   - Number of worker calls
//   - Whether Stage 2 raw transfers were reused
//   - Number of challengers confirmed
//   - Whether Current was reused or reconfirmed

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export class V2RuntimeMetrics {
  constructor(projectId) {
    this.projectId = projectId;
    this.startMs = now();
    this.endMs = null;
    this.currentReused = null; // true = reused authority, false = recomputed
    this.stage2TransfersReused = 0;
    this.challengersConfirmed = 0;
    this.workerCalls = [];
    this.proxySearches = [];
    this.placementFingerprintUsed = null;
    this.currentRecalculations = 0;
  }

  recordWorkerCall(phase, candidateId, durationMs, reused) {
    this.workerCalls.push({ phase, candidateId, durationMs, reused });
    if (phase === "confirmation" && candidateId === "current") {
      this.currentRecalculations++;
    }
  }

  recordProxySearch(candidateId, durationMs) {
    this.proxySearches.push({ candidateId, durationMs });
  }

  recordCurrentReuse(reused) {
    this.currentReused = reused;
  }

  recordStage2TransferReused() {
    this.stage2TransfersReused++;
  }

  recordChallengerConfirmed() {
    this.challengersConfirmed++;
  }

  recordPlacementFingerprint(fp) {
    this.placementFingerprintUsed = fp || null;
  }

  finish() {
    this.endMs = now();
    this.totalWallClockMs = this.endMs - this.startMs;
  }

  toReport() {
    const placementWorkerCalls = this.workerCalls.filter((c) => c.phase === "placement");
    return {
      projectId: this.projectId,
      totalWallClockMs: Math.round(this.totalWallClockMs || 0),
      currentReused: this.currentReused,
      currentRecalculations: this.currentRecalculations,
      stage2TransfersReused: this.stage2TransfersReused,
      rawTransferCacheHits: this.stage2TransfersReused,
      rawTransferCacheMisses: placementWorkerCalls.length,
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
    };
  }

  logReport() {
    try {
      const report = this.toReport();
      console.debug("[V2-RUNTIME]", JSON.stringify(report));
    } catch {
      // Diagnostics must never break the engine.
    }
  }
}