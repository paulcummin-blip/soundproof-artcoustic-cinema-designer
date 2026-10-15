// electronicTimingLedger.js
// ---------------------------------------------------------------------------
// STAGE-LEVEL TIMING FOR THE ELECTRONIC CALCULATION.
//
// Two things live here, and nothing else:
//
//   1. A stage ledger — a small, dependency-free recorder an orchestration can
//      use to measure each named stage of the calculation and the electronic
//      pass, and to count worker calls, transfer-cache hits and misses and
//      canonical confirmations. `begin`/`end`/`add`/`count`, then `report()`.
//
//   2. A pure AGGREGATOR over the telemetry the engine ALREADY publishes
//      (V2RuntimeMetrics.toReport()), which turns the existing worker-call and
//      transfer-operation records into the named stage table the runtime budget
//      is judged against. It reads existing records; it changes nothing.
//
// WHAT THIS MODULE IS NOT
//   • NOT a progress or status authority: it never states a phase to a designer
//     and never drives a progress bar.
//   • NOT an acoustic authority: it records WHEN work happened, never what was
//     calculated, ranked or graded. It changes no search, no candidate count and
//     no P19/P20 maths.
//   • NOT designer-facing: the rows it builds are read only inside developer
//     diagnostics, behind the admin debug gate.
//
// A stage that was never measured is reported as NOT MEASURED rather than as
// zero: an absent measurement is a stated gap, never an invented figure.
//
// PURE. No React, no stores, no worker.
// ---------------------------------------------------------------------------

/** The named stages of the calculation and of the electronic pass. */
export const ELECTRONIC_TIMING_STAGE = Object.freeze({
  // Calculate Bass — the calculation-owned stages.
  TRANSFER_PREPARATION: "transfer-preparation",
  BASELINE_EVALUATION: "baseline-evaluation",
  EQ_RSP: "eq-rsp",
  P19_P20: "p19-p20",
  GRAPH_CONTRACT: "graph-contract",
  PERSISTENCE_PUBLICATION: "persistence-publication",
  // The electronic pass.
  TRANSFER_ACQUISITION: "electronic-transfer-acquisition",
  DELAY_SCREENING: "electronic-delay-screening",
  GAIN_SCREENING: "electronic-gain-screening",
  PHASE_POLARITY_SCREENING: "electronic-phase-polarity-screening",
  COMBINED_SCREENING: "electronic-combined-screening",
  CANONICAL_CONFIRMATIONS: "electronic-canonical-confirmations",
  FINAL_SELECTION: "electronic-final-selection",
});

/** The stage labels, in the order the work happens. */
export const ELECTRONIC_TIMING_STAGE_LABEL = Object.freeze({
  [ELECTRONIC_TIMING_STAGE.TRANSFER_PREPARATION]: "Transfer preparation",
  [ELECTRONIC_TIMING_STAGE.BASELINE_EVALUATION]: "Baseline evaluation",
  [ELECTRONIC_TIMING_STAGE.EQ_RSP]: "EQ / RSP",
  [ELECTRONIC_TIMING_STAGE.P19_P20]: "P19 / P20",
  [ELECTRONIC_TIMING_STAGE.GRAPH_CONTRACT]: "Graph and contract construction",
  [ELECTRONIC_TIMING_STAGE.PERSISTENCE_PUBLICATION]: "Persistence and publication",
  [ELECTRONIC_TIMING_STAGE.TRANSFER_ACQUISITION]: "Transfer acquisition / reuse",
  [ELECTRONIC_TIMING_STAGE.DELAY_SCREENING]: "Delay screening",
  [ELECTRONIC_TIMING_STAGE.GAIN_SCREENING]: "Gain screening",
  [ELECTRONIC_TIMING_STAGE.PHASE_POLARITY_SCREENING]: "Phase / polarity screening",
  [ELECTRONIC_TIMING_STAGE.COMBINED_SCREENING]: "Combined screening",
  [ELECTRONIC_TIMING_STAGE.CANONICAL_CONFIRMATIONS]: "Canonical confirmations",
  [ELECTRONIC_TIMING_STAGE.FINAL_SELECTION]: "Final candidate selection",
});

/** The counters kept alongside the stages. */
export const ELECTRONIC_TIMING_COUNTER = Object.freeze({
  WORKER_CALLS: "workerCalls",
  TRANSFER_CACHE_HITS: "transferCacheHits",
  TRANSFER_CACHE_MISSES: "transferCacheMisses",
  CANONICAL_CONFIRMATIONS: "canonicalConfirmations",
});

const defaultClock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * "1.24 s" · "840 ms" — a duration in words, or null when there is no
 * measurement. An absent duration is a stated gap: null must never be formatted
 * as "0 ms", because that would report unmeasured work as work that took no time.
 */
export function formatTimingDuration(ms) {
  if (ms === null || ms === undefined || ms === "") return null;
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return null;
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;
}

/**
 * A stage ledger for one run.
 *
 * @param {object} [options]
 * @param {function} [options.clock] - monotonic clock (tests supply their own)
 */
export function createElectronicTimingLedger({ clock = defaultClock } = {}) {
  const totals = new Map();
  const counters = new Map();
  const open = [];
  const workerCalls = [];
  const startedAt = clock();

  const addTo = (map, key, amount) => {
    map.set(key, (map.get(key) || 0) + amount);
  };

  return {
    /** Open a stage. `end` closes the most recent open entry for it. */
    begin(stage) {
      if (!ELECTRONIC_TIMING_STAGE_LABEL[stage]) return;
      open.push({ stage, at: clock() });
    },
    /** Close a stage and add its measured duration. */
    end(stage) {
      if (!ELECTRONIC_TIMING_STAGE_LABEL[stage]) return null;
      for (let index = open.length - 1; index >= 0; index -= 1) {
        if (open[index].stage !== stage) continue;
        const [entry] = open.splice(index, 1);
        const duration = Math.max(0, clock() - entry.at);
        addTo(totals, stage, duration);
        return duration;
      }
      return null;
    },
    /** Add an already-measured duration to a stage. */
    add(stage, durationMs) {
      const value = Number(durationMs);
      if (!ELECTRONIC_TIMING_STAGE_LABEL[stage] || !Number.isFinite(value) || value < 0) return;
      addTo(totals, stage, value);
    },
    /** Count something (worker call, cache hit, confirmation…). */
    count(counter, by = 1) {
      const value = Number(by);
      if (!Number.isFinite(value) || value <= 0) return;
      addTo(counters, counter, value);
    },
    /** One worker call, recorded by phase so the aggregator can group it. */
    recordWorkerCall({ phase = null, candidateId = null, durationMs = null } = {}) {
      const duration = Number(durationMs);
      workerCalls.push({
        phase: phase ? String(phase) : null,
        candidateId: candidateId ? String(candidateId) : null,
        durationMs: Number.isFinite(duration) && duration >= 0 ? duration : null,
      });
      addTo(counters, ELECTRONIC_TIMING_COUNTER.WORKER_CALLS, 1);
    },
    /** A transfer-cache lookup: hit or miss. Nothing else is accepted. */
    recordTransferLookup(result) {
      if (result === "hit") addTo(counters, ELECTRONIC_TIMING_COUNTER.TRANSFER_CACHE_HITS, 1);
      else if (result === "miss") addTo(counters, ELECTRONIC_TIMING_COUNTER.TRANSFER_CACHE_MISSES, 1);
    },
    /** A canonical confirmation of one candidate. */
    recordCanonicalConfirmation() {
      addTo(counters, ELECTRONIC_TIMING_COUNTER.CANONICAL_CONFIRMATIONS, 1);
    },
    /** The measured report, with unmeasured stages stated as such. */
    report() {
      const stages = Object.values(ELECTRONIC_TIMING_STAGE).map((stage) => ({
        key: stage,
        label: ELECTRONIC_TIMING_STAGE_LABEL[stage],
        durationMs: totals.has(stage) ? totals.get(stage) : null,
        measured: totals.has(stage),
      }));
      const read = (counter) => counters.get(counter) || 0;
      return {
        totalWallClockMs: Math.max(0, clock() - startedAt),
        stages,
        unmeasuredStages: stages.filter((stage) => !stage.measured).map((stage) => stage.key),
        counters: {
          [ELECTRONIC_TIMING_COUNTER.WORKER_CALLS]: read(ELECTRONIC_TIMING_COUNTER.WORKER_CALLS),
          [ELECTRONIC_TIMING_COUNTER.TRANSFER_CACHE_HITS]: read(ELECTRONIC_TIMING_COUNTER.TRANSFER_CACHE_HITS),
          [ELECTRONIC_TIMING_COUNTER.TRANSFER_CACHE_MISSES]: read(ELECTRONIC_TIMING_COUNTER.TRANSFER_CACHE_MISSES),
          [ELECTRONIC_TIMING_COUNTER.CANONICAL_CONFIRMATIONS]: read(ELECTRONIC_TIMING_COUNTER.CANONICAL_CONFIRMATIONS),
        },
        workerCalls,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The aggregator: the engine's EXISTING telemetry, in the budget's own terms.
// ---------------------------------------------------------------------------

/**
 * The named stage breakdown of an EXISTING engine run, read from the telemetry
 * the engine already publishes. Nothing is recomputed and nothing is invented:
 * a stage whose work was not recorded is reported as null.
 *
 * @param {object} params
 * @param {object|null} params.runtimeMetrics - V2RuntimeMetrics.toReport()
 * @returns {object|null} the breakdown, or null when there is no telemetry
 */
export function summariseElectronicStageBreakdown({ runtimeMetrics = null } = {}) {
  if (!runtimeMetrics || typeof runtimeMetrics !== "object") return null;

  const calls = Array.isArray(runtimeMetrics.workerCalls) ? runtimeMetrics.workerCalls : [];
  const operations = Array.isArray(runtimeMetrics.transferOperations) ? runtimeMetrics.transferOperations : [];
  const sum = (predicate) => calls
    .filter(predicate)
    .reduce((total, call) => total + (Number(call?.durationMs) || 0), 0);

  // The combined phase retunes through the SAME grouped searches, so its worker
  // calls carry the grouped phase names. They are counted ONCE, in the combined
  // stage: a stage table whose rows overlap would not add up to the total.
  const isCombinedRetune = (call) => String(call?.candidateId || "").includes("combined-retune");
  const byPhase = (phase) => sum((call) => call?.phase === phase && !isCombinedRetune(call));
  const confirmations = calls.filter((call) => call?.phase === "confirmation");
  const combinedScreeningMs = sum(isCombinedRetune);

  const stage2Reused = Number(runtimeMetrics.stage2TransfersReused) || 0;
  const hits = operations.filter((operation) => operation?.lookup === "hit").length + stage2Reused;
  const misses = operations.filter((operation) => operation?.lookup === "miss").length;

  const stages = {
    [ELECTRONIC_TIMING_STAGE.TRANSFER_ACQUISITION]: byPhase("placement"),
    [ELECTRONIC_TIMING_STAGE.DELAY_SCREENING]: byPhase("grouped-delay"),
    [ELECTRONIC_TIMING_STAGE.GAIN_SCREENING]: byPhase("grouped-gain"),
    [ELECTRONIC_TIMING_STAGE.PHASE_POLARITY_SCREENING]: byPhase("grouped-phase"),
    [ELECTRONIC_TIMING_STAGE.COMBINED_SCREENING]: combinedScreeningMs,
    [ELECTRONIC_TIMING_STAGE.CANONICAL_CONFIRMATIONS]: confirmations
      .reduce((total, call) => total + (Number(call?.durationMs) || 0), 0),
    // Not published by the engine's telemetry today — stated as unmeasured rather
    // than reported as zero.
    [ELECTRONIC_TIMING_STAGE.BASELINE_EVALUATION]: null,
    [ELECTRONIC_TIMING_STAGE.FINAL_SELECTION]: null,
  };

  return {
    totalWallClockMs: Number(runtimeMetrics.totalWallClockMs) || 0,
    stages,
    unmeasuredStages: Object.entries(stages).filter(([, value]) => value === null).map(([key]) => key),
    workerCallCount: calls.length,
    canonicalConfirmationCount: confirmations.length,
    transferCache: {
      hits,
      misses,
      stage2TransfersReused: stage2Reused,
      fullTransferReuseHits: Number(runtimeMetrics.fullTransferReuseHits) || 0,
    },
    currentReused: runtimeMetrics.currentReused === true,
  };
}

/**
 * The developer-diagnostic rows for a breakdown: one row per measured stage, the
 * counts, and the total. A stage with no measurement is not a row.
 */
export function buildElectronicTimingRows(breakdown) {
  if (!breakdown) return [];
  const rows = Object.entries(breakdown.stages || {})
    .map(([key, value]) => {
      const formatted = value === null ? null : formatTimingDuration(value);
      if (!formatted) return null;
      return { key: `stage:${key}`, label: ELECTRONIC_TIMING_STAGE_LABEL[key] || key, value: formatted };
    })
    .filter(Boolean);

  const cache = breakdown.transferCache || {};
  const counts = [
    ["Worker calls", breakdown.workerCallCount],
    ["Canonical confirmations", breakdown.canonicalConfirmationCount],
    ["Transfer-cache hits", cache.hits],
    ["Transfer-cache misses", cache.misses],
  ]
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([label, value]) => ({ key: `count:${label}`, label, value: String(Number(value)) }));

  const total = formatTimingDuration(breakdown.totalWallClockMs);
  return [
    ...rows,
    ...counts,
    ...(total ? [{ key: "total", label: "Total wall time", value: total }] : []),
  ];
}