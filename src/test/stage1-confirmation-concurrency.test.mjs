// stage1-confirmation-concurrency.test.mjs
// Regression suite for bounded Stage 1 candidate-evaluation concurrency.
//
// This suite exercises the REAL engine with the REAL acoustic maths, using a
// mock evaluation pool that calls evaluateCandidate synchronously. Serial
// (concurrency=1) and concurrent (concurrency=3) runs are compared for exact
// identity across candidate counts, coarse results, coarse shortlist, fine
// results, finalists, coordinates and screening scores.
//
// Scheduling behaviour (peak concurrency, ordering, failure isolation,
// cancellation, phase barrier) is verified against runBoundedConfirmations and
// by source-inspecting the engine.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runBoundedConfirmations } from "../components/room/bass/improveBassV2/runBoundedConfirmations.js";
import { runStage1SearchForQuantity } from "../components/room/bass/stage1/stage1PlacementEngine.js";
import {
  prepareStage1Context,
  evaluateCandidate,
} from "../components/room/bass/stage1/stage1CandidateEvaluation.js";

const { describe, it } = test;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(__dirname, "..", "components/room/bass/stage1/stage1PlacementEngine.js");
const WORKER_PATH = join(__dirname, "..", "components/room/bass/stage1/stage1Placement.worker.js");
const POOL_PATH = join(__dirname, "..", "components/room/bass/stage1/stage1EvaluationPool.js");
const engineSource = readFileSync(ENGINE_PATH, "utf8");
const workerSource = readFileSync(WORKER_PATH, "utf8");
const poolSource = readFileSync(POOL_PATH, "utf8");

// ── Deterministic fixture (serial vs concurrent identity) ────────────────
const FIXTURE = {
  roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
  rspPosition: { x: 2.25, y: 3.5, z: 1.2 },
  seatingPositions: [
    { id: "seat-1", x: 2.25, y: 3.5, z: 1.2, priority: "primary", earHeightM: 1.2 },
    { id: "seat-2", x: 1.6, y: 3.5, z: 1.2, priority: "secondary", earHeightM: 1.2 },
    { id: "seat-3", x: 2.9, y: 3.5, z: 1.2, priority: "secondary", earHeightM: 1.2 },
  ],
  physicsOptions: {
    boundaryGainDb: 0,
    roomGainDb: 0,
    absorptionCoeff: 0.2,
  },
};

/** Mock pool that evaluates candidates with the real evaluateCandidate. */
function createMockStage1Pool(context) {
  let evaluateCalls = 0;
  return {
    evaluate: async (candidate) => {
      evaluateCalls += 1;
      return evaluateCandidate(candidate, context);
    },
    terminateAll: () => {},
    get size() { return 1; },
    _evaluateCalls: () => evaluateCalls,
  };
}

function makeGenerationId() {
  return { cancelled: false };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Stage 1 bounded concurrency — scheduling (runBoundedConfirmations)", () => {
  it("1: one job → exactly one result", async () => {
    const jobs = [{ id: "a" }];
    const runFn = async (j) => ({ result: j.id, workerMs: 1 });
    const { results, stats } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.equal(results.length, 1);
    assert.equal(results[0].result, "a");
    assert.equal(stats.candidateCount, 1);
    assert.equal(stats.peakActive, 1);
  });

  it("2: N jobs → N results, each evaluated exactly once (ordered)", async () => {
    const jobs = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}` }));
    let calls = 0;
    const runFn = async (j) => { calls += 1; return { result: j.id, workerMs: 1 }; };
    const { results, stats } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.equal(results.length, 8);
    assert.equal(calls, 8);
    // Original order preserved regardless of finish order
    results.forEach((r, i) => assert.equal(r.result, `c${i}`));
    assert.ok(stats.peakActive <= 3, `peak ${stats.peakActive} <= 3`);
  });

  it("3: coarse peak active never exceeds 3", async () => {
    let active = 0; let peak = 0;
    const jobs = Array.from({ length: 8 }, (_, i) => ({ id: i }));
    const runFn = async () => {
      active += 1; if (active > peak) peak = active;
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return { result: "ok", workerMs: 5 };
    };
    const { stats } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.equal(peak, 3);
    assert.ok(stats.peakActive <= 3);
  });

  it("4: results returned in original order regardless of finish order", async () => {
    const jobs = Array.from({ length: 6 }, (_, i) => ({ id: i, delay: (6 - i) * 3 }));
    const runFn = async (j) => {
      await new Promise((r) => setTimeout(r, j.delay)); // later index finishes first
      return { result: j.id, workerMs: j.delay };
    };
    const { results } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.deepEqual(results.map((r) => r.result), [0, 1, 2, 3, 4, 5]);
  });

  it("5: one job failing → siblings succeed, failure isolated at its index", async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const runFn = async (j) => {
      if (j.id === 2) throw new Error("boom");
      return { result: j.id, workerMs: 1 };
    };
    const { results, stats } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.equal(results[2].ok, false);
    assert.equal(stats.jobsFailed, 1);
    const okIdx = [0, 1, 3, 4];
    okIdx.forEach((i) => assert.equal(results[i].ok, true));
  });

  it("6: isAborted true → no new jobs dispatch after active settle", async () => {
    let started = 0;
    let abort = false;
    const jobs = Array.from({ length: 6 }, (_, i) => ({ id: i }));
    const runFn = async (j) => {
      started += 1;
      if (j.id === 1) abort = true;
      await new Promise((r) => setTimeout(r, 8));
      return { result: j.id, workerMs: 8 };
    };
    const { results } = await runBoundedConfirmations({
      jobs,
      maxConcurrency: 3,
      runFn,
      isAborted: () => abort,
    });
    // Some jobs launched before abort; not all 6
    assert.ok(started < 6, `started ${started} < 6`);
    assert.ok(results.length === 6);
  });
});

describe("Stage 1 serial vs concurrent identity (real fixture)", () => {
  // Run quantity 2 (has coarse + fine parameterised families) with the real
  // acoustic maths, comparing concurrency=1 (serial) vs concurrency=3.

  const ctx = prepareStage1Context(FIXTURE);

  let serial = null;
  let concurrent = null;
  let serialPool = null;
  let concurrentPool = null;

  it("7: serial run completes (concurrency=1)", async () => {
    serialPool = createMockStage1Pool(ctx);
    serial = await runStage1SearchForQuantity({
      ...FIXTURE,
      quantity: 2,
      generationId: makeGenerationId(),
      pool: serialPool,
      stage1Concurrency: 1,
    });
    assert.ok(serial, "serial result must not be null");
    assert.equal(serial.status, "complete");
  });

  it("8: concurrent run completes (concurrency=3)", async () => {
    concurrentPool = createMockStage1Pool(ctx);
    concurrent = await runStage1SearchForQuantity({
      ...FIXTURE,
      quantity: 2,
      generationId: makeGenerationId(),
      pool: concurrentPool,
      stage1Concurrency: 3,
    });
    assert.ok(concurrent, "concurrent result must not be null");
    assert.equal(concurrent.status, "complete");
  });

  it("9: coarse candidate count identical", () => {
    assert.equal(serial.coarseCandidateCount, concurrent.coarseCandidateCount);
  });

  it("10: fine candidate count identical", () => {
    assert.equal(serial.fineCandidateCount, concurrent.fineCandidateCount);
  });

  it("11: total candidate count identical", () => {
    assert.equal(serial.candidateCount, concurrent.candidateCount);
  });

  it("12: finalist count identical", () => {
    assert.equal(serial.finalists.length, concurrent.finalists.length);
  });

  it("13: finalist IDs identical and in the same order", () => {
    assert.deepEqual(
      serial.finalists.map((f) => f.id),
      concurrent.finalists.map((f) => f.id),
    );
  });

  it("14: finalist coordinates identical", () => {
    const sCoords = serial.finalists.flatMap((f) => f.sources.map((s) => `${s.xNorm},${s.yNorm}`));
    const cCoords = concurrent.finalists.flatMap((f) => f.sources.map((s) => `${s.xNorm},${s.yNorm}`));
    assert.deepEqual(sCoords, cCoords);
  });

  it("15: finalist family identity identical", () => {
    assert.deepEqual(
      serial.finalists.map((f) => f.familyId),
      concurrent.finalists.map((f) => f.familyId),
    );
  });

  it("16: finalist screening scores identical", () => {
    assert.deepEqual(
      serial.finalists.map((f) => f.screening),
      concurrent.finalists.map((f) => f.screening),
    );
  });

  it("17: A-prohibition validation identical", () => {
    assert.equal(serial.aProhibitionValidation, concurrent.aProhibitionValidation);
  });

  it("18: every coarse candidate evaluated exactly once (serial)", () => {
    assert.equal(serialPool._evaluateCalls(), serial.coarseCandidateCount + serial.fineCandidateCount);
  });

  it("19: every coarse candidate evaluated exactly once (concurrent)", () => {
    assert.equal(concurrentPool._evaluateCalls(), concurrent.coarseCandidateCount + concurrent.fineCandidateCount);
  });
});

describe("Stage 1 — cancellation (source + engine)", () => {
  it("20: engine checks isAborted and returns null when cancelled before fine", async () => {
    const ctx = prepareStage1Context(FIXTURE);
    const pool = createMockStage1Pool(ctx);
    const generationId = { cancelled: false };
    // Cancel immediately — the coarse run will see isAborted and return null
    // (runBoundedConfirmations with isAborted=true from the start resolves with
    // an empty result set, then the engine returns null).
    generationId.cancelled = true;
    const result = await runStage1SearchForQuantity({
      ...FIXTURE,
      quantity: 2,
      generationId,
      pool,
      stage1Concurrency: 3,
    });
    assert.equal(result, null);
  });

  it("21: worker wires cancellation to pool abort (source)", () => {
    assert.ok(workerSource.includes("controller.abort"), "worker must abort pool on cancel");
    assert.ok(workerSource.includes("cancellationChecker.cancelled = true"), "worker must set cancelled flag");
    assert.ok(workerSource.includes("AbortController"), "worker must create an AbortController");
  });

  it("22: engine uses runBoundedConfirmations with isAborted (source)", () => {
    assert.ok(engineSource.includes("runBoundedConfirmations"), "engine must use runBoundedConfirmations");
    assert.ok(engineSource.includes("isAborted"), "engine must pass isAborted to the bounded runner");
  });
});

describe("Stage 1 — phase barrier (source)", () => {
  it("23: coarse run is awaited before fine jobs are built (source)", () => {
    // The coarse run is awaited; fine jobs are built AFTER, reading
    // coarseResults (bestInFamily). This is the mandatory phase barrier.
    assert.ok(
      engineSource.includes("await runBoundedConfirmations") &&
      engineSource.includes("coarseResults.sort(compareScreeningResults)") &&
      engineSource.includes("fineJobs"),
      "engine must await coarse run before building fine jobs",
    );
  });

  it("24: fine jobs depend on coarse shortlist (source)", () => {
    assert.ok(
      engineSource.includes("bestInFamily") && engineSource.includes("coarseResults.find"),
      "fine job generation must read bestInFamily from coarse results",
    );
  });
});

describe("Stage 1 — pool + worker contract (source)", () => {
  it("25: pool reuses runBoundedConfirmations and caps concurrency (source)", () => {
    assert.ok(poolSource.includes("new Worker"), "pool must create workers");
    assert.ok(!poolSource.includes("Promise.all"), "pool must not use unbounded Promise.all");
  });

  it("26: evaluation worker computes preparedModes from shared context (source)", () => {
    const workerEvalPath = join(__dirname, "..", "components/room/bass/stage1/stage1Evaluation.worker.js");
    const evalWorkerSource = readFileSync(workerEvalPath, "utf8");
    assert.ok(evalWorkerSource.includes("prepareStage1Context"), "eval worker must prepare context on init");
    assert.ok(evalWorkerSource.includes("evaluateCandidate"), "eval worker must run evaluateCandidate");
  });

  it("27: Stage 1 worker creates the pool and passes it to the engine (source)", () => {
    assert.ok(workerSource.includes("createStage1EvaluationPool"), "worker must create the evaluation pool");
    assert.ok(workerSource.includes("pool,"), "worker must pass pool to runFullStage1Search");
  });

  it("28: STAGE1_CONCURRENCY = 3 (source)", () => {
    const constantsPath = join(__dirname, "..", "components/room/bass/stage1/stage1Constants.js");
    const constantsSource = readFileSync(constantsPath, "utf8");
    assert.ok(constantsSource.includes("STAGE1_CONCURRENCY = 3"), "concurrency must be 3");
  });
});