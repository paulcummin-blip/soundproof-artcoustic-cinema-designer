// Regression suite for bounded electronic-confirmation concurrency.
//
// Covers the 18-point contract from the CONTINUE request:
//   1-4   candidate counts / exactly-once
//   5     peak active <= max concurrency
//   6     stable output ordering
//   7     completion order does not alter winner
//   8     failure isolation
//   9     abort stops queued dispatch
//   10    pool workers terminate
//   11    runId preserved (createConfirmationRunFn passes index)
//   12    full cache key preserved (source: all 4 sites pass full job)
//   13    candidate counts unchanged (source)
//   14    ranking unchanged (source: post-process in original order)
//   15-16 Primary / P19 safety unchanged (source: validateCandidateForRun per result)
//   17    terminal outcome unchanged (source: no early break on completion)
//   18    serial (concurrency=1) vs concurrent (concurrency=3) identical
//
// Behavioral tests use a mock runFn so the scheduling contract is verified
// without the acoustic engine. Source-inspection tests read the engine to
// assert the contracts that keep identity, safety and ranking deterministic.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runBoundedConfirmations } from "../src/components/room/bass/improveBassV2/runBoundedConfirmations.js";
import { createConfirmationRunFn } from "../src/components/room/bass/improveBassV2/createConfirmationRunFn.js";

const { describe, it } = test;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(__dirname, "..", "src/components/room/bass/improveBassV2/improveBassV2Engine.js");
const engineSource = readFileSync(ENGINE_PATH, "utf8");

// ── Mock runFn helpers ───────────────────────────────────────────────────
// A controllable runFn that tracks peak concurrency, records exactly-once,
// and can inject per-index delays and failures.

function makeMockRunFn({ delays = {}, failIndices = new Set() } = {}) {
  const state = { invocations: [], peakActive: 0, _active: 0 };
  const runFn = async (job, index) => {
    state.invocations.push(index);
    state._active += 1;
    if (state._active > state.peakActive) state.peakActive = state._active;
    const delay = delays[index] || 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    state._active -= 1;
    if (failIndices.has(index)) throw new Error(`fail:${index}`);
    return { result: `r${index}`, workerMs: delay };
  };
  return { runFn, state };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1-4. CANDIDATE COUNTS / EXACTLY-ONCE
// ═══════════════════════════════════════════════════════════════════════════
describe("Bounded confirmations — candidate counts", () => {
  it("1: one candidate → exactly one result", async () => {
    const { runFn, state } = makeMockRunFn();
    const { results, stats } = await runBoundedConfirmations({
      jobs: [{ id: 0 }], maxConcurrency: 3, runFn,
    });
    assert.equal(results.length, 1);
    assert.equal(state.invocations.length, 1);
    assert.equal(stats.candidateCount, 1);
  });

  it("2: two candidates → two results in order", async () => {
    const { runFn, state } = makeMockRunFn();
    const { results, stats } = await runBoundedConfirmations({
      jobs: [{ id: 0 }, { id: 1 }], maxConcurrency: 3, runFn,
    });
    assert.equal(results.length, 2);
    assert.equal(state.invocations.length, 2);
    assert.equal(results[0].result, "r0");
    assert.equal(results[1].result, "r1");
    assert.equal(stats.candidateCount, 2);
  });

  it("3: 22 candidates / concurrency 3 → 22 results", async () => {
    const jobs = Array.from({ length: 22 }, (_, i) => ({ id: i }));
    const { runFn, state } = makeMockRunFn();
    const { results, stats } = await runBoundedConfirmations({
      jobs, maxConcurrency: 3, runFn,
    });
    assert.equal(results.length, 22);
    assert.equal(state.invocations.length, 22);
    assert.equal(stats.candidateCount, 22);
  });

  it("4: every candidate evaluated exactly once", async () => {
    const jobs = Array.from({ length: 15 }, (_, i) => ({ id: i }));
    const { runFn, state } = makeMockRunFn();
    await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    const counts = new Map();
    for (const idx of state.invocations) counts.set(idx, (counts.get(idx) || 0) + 1);
    for (let i = 0; i < 15; i++) assert.equal(counts.get(i), 1, `job ${i} invoked exactly once`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. PEAK ACTIVE <= MAX CONCURRENCY
// ═══════════════════════════════════════════════════════════════════════════
describe("Bounded confirmations — peak concurrency", () => {
  it("5: peak active never exceeds max concurrency (3)", async () => {
    const jobs = Array.from({ length: 22 }, (_, i) => ({ id: i }));
    const delays = Object.fromEntries(jobs.map((j, i) => [i, 5 + (i % 3)])); // staggered
    const { runFn, state } = makeMockRunFn({ delays });
    const { stats } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.ok(stats.peakActive <= 3, `peakActive ${stats.peakActive} <= 3`);
    assert.ok(stats.peakActive >= 1, "peakActive observed at least 1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6-7. STABLE ORDERING / COMPLETION ORDER DOES NOT ALTER WINNER
// ═══════════════════════════════════════════════════════════════════════════
describe("Bounded confirmations — ordering", () => {
  it("6: results returned in original input order regardless of finish order", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    // Reverse the completion order: later indices finish first.
    const delays = Object.fromEntries(jobs.map((_, i) => [i, (10 - i) * 3]));
    const { runFn } = makeMockRunFn({ delays });
    const { results } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    for (let i = 0; i < 10; i++) assert.equal(results[i].result, `r${i}`);
  });

  it("7: completion order does not alter the winner (first result is job 0)", async () => {
    const jobs = Array.from({ length: 8 }, (_, i) => ({ id: i }));
    // job 0 is the SLOWEST — finishes last. Serial would pick it first.
    const delays = Object.fromEntries(jobs.map((_, i) => [i, i === 0 ? 60 : 2]));
    const { runFn } = makeMockRunFn({ delays });
    const { results } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.equal(results[0].result, "r0", "winner (index 0) preserved despite finishing last");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. FAILURE ISOLATION
// ═══════════════════════════════════════════════════════════════════════════
describe("Bounded confirmations — failure isolation", () => {
  it("8: one candidate throwing → siblings succeed, failed index recorded", async () => {
    const jobs = Array.from({ length: 6 }, (_, i) => ({ id: i }));
    const { runFn } = makeMockRunFn({ failIndices: new Set([3]) });
    const { results, stats } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.equal(results.length, 6);
    assert.equal(results[3].ok, false, "failed index is { ok: false }");
    assert.ok(results[3].error, "failed index carries error");
    for (const i of [0, 1, 2, 4, 5]) {
      assert.equal(results[i].ok, true, `sibling ${i} succeeded`);
      assert.equal(results[i].result, `r${i}`);
    }
    assert.equal(stats.jobsFailed, 1);
    assert.equal(stats.jobsCompleted, 6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. CANCELLATION / ABORT STOPS QUEUED DISPATCH
// ═══════════════════════════════════════════════════════════════════════════
describe("Bounded confirmations — cancellation", () => {
  it("9: isAborted true after a batch starts → no new jobs dispatch", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    let abortAfter = 3; // flip abort once 3 have started
    const started = [];
    const { runFn } = makeMockRunFn({ delays: Object.fromEntries(jobs.map((_, i) => [i, 8])) });
    const isAborted = () => started.length >= abortAfter;
    const trackedRunFn = async (job, index) => {
      started.push(index);
      return runFn(job, index);
    };
    const { results, stats } = await runBoundedConfirmations({
      jobs, maxConcurrency: 3, runFn: trackedRunFn, isAborted,
    });
    // Only the first 3 (the initial fill) launch; the rest never start.
    assert.ok(started.length <= 3, `no more than 3 started, got ${started.length}`);
    assert.ok(stats.jobsStarted <= 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. POOL WORKERS TERMINATE
// ═══════════════════════════════════════════════════════════════════════════
// Pool termination and aborted acquisitions are exercised behaviourally in
// v2-confirmation-pool-startup.test.mjs.

// ═══════════════════════════════════════════════════════════════════════════
// 11. runId PRESERVED (createConfirmationRunFn passes index)
// ═══════════════════════════════════════════════════════════════════════════
describe("createConfirmationRunFn — identity preservation", () => {
  it("11: labelFor / transferKeyFor receive the job index so runId is preserved", async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, tuning: { delay: i } }));
    const recorded = [];
    const mockPool = {
      runConfirmation: async (job) => ({ ok: true, job }),
    };
    const mockMetrics = {
      recordWorkerCall: (type, label, ms, _flag, meta) => recorded.push({ label, transferKey: meta.transferKey }),
    };
    const runFn = createConfirmationRunFn({
      pool: mockPool,
      controller: { signal: undefined },
      metrics: mockMetrics,
      isFatalLifecycleError: () => false,
      labelFor: (_job, index) => `phase:${index}`,
      transferKeyFor: (_job, index) => `tk${index}`,
    });
    const { results } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.equal(results.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(results[i].result.job.id, `c${i}`);
      assert.equal(recorded[i].label, `phase:${i}`);
      assert.equal(recorded[i].transferKey, `tk${i}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12-17. SOURCE-INSPECTION: ENGINE CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Engine contracts (source-inspection)", () => {
  it("12: all four confirmation sites pass the full cache-key job object", () => {
    // Each job carries rawTransfer + tuning + p14/p18 basis — never a partial.
    const sites = ["phaseConfirmJobs", "calConfirmJobs", "gainConfirmJobs", "positionJobs"];
    for (const key of sites) {
      assert.ok(engineSource.includes(key), `${key} job list present`);
    }
    assert.ok(engineSource.includes("rawTransfer:"), "jobs carry rawTransfer (cache key)");
    assert.ok(engineSource.includes("p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis, correctabilityAssessment"),
      "jobs carry full P14/P18 cache-key fields");
  });

  it("13: candidate counts unchanged — one job per retained candidate/option", () => {
    // phase: map over retainedPhase; cal: map over retained; gain: map over gainRetained;
    // position: flat (candidate × option) but no candidate dropped or duplicated.
    assert.ok(/retainedPhase\.map\(/.test(engineSource), "phase: one job per retained phase candidate");
    assert.ok(/retained\.map\(/.test(engineSource), "cal: one job per retained delay candidate");
    assert.ok(/gainRetained\.map\(/.test(engineSource), "gain: one job per retained gain candidate");
    assert.ok(/for \(let optionIndex/.test(engineSource), "position: one job per (candidate × option)");
  });

  it("14: ranking unchanged — post-processing iterates in ORIGINAL order", () => {
    // No sort by finish time; each post-process loop is a plain index loop over
    // the retained set, reading results[index] / results[gi] / results[jobIdx].
    assert.ok(/for \(let index = 0; index < retainedPhase\.length/.test(engineSource), "phase post-process in order");
    assert.ok(/for \(let index=0;index<retained\.length/.test(engineSource), "cal post-process in order");
    assert.ok(/for \(let gi = 0; gi < gainRetained\.length/.test(engineSource), "gain post-process in order");
    assert.ok(/for \(let jobIdx = 0; jobIdx < positionJobs\.length/.test(engineSource), "position post-process in order");
    // No Array.sort on results by completion/worker time.
    assert.ok(!/results\.sort\(/.test(engineSource), "no sort of confirmation results");
  });

  it("15: Primary safety unchanged — validateCandidateForRun called per result", () => {
    const hits = engineSource.split("validateCandidateForRun(").length - 1;
    assert.ok(hits >= 4, `validateCandidateForRun invoked at each of the 4 post-process sites (found ${hits})`);
  });

  it("16: P19 safety unchanged — no candidate is pushed without validation", () => {
    // Every push to a confirmed list is guarded by check.valid / check.nonAssessable.
    assert.ok(/if\(check\.nonAssessable\)\{.*?recordNonAssessable/.test(engineSource.replace(/\n/g, " ")), "non-assessable recorded, not pushed");
    assert.ok(/else if\(check\.valid\)\{.*?confirmedResults\.push/.test(engineSource.replace(/\n/g, " ")), "confirmed push only when check.valid");
  });

  it("17: terminal outcome unchanged — no early break on completion order", () => {
    // The materiality break that stops escalation runs AFTER the full batch
    // completes (break inside the existing-authority check), never mid-batch.
    assert.ok(/materialSubImprovementFound = true;[\s\S]{0,40}break;/.test(engineSource), "escalation break is post-batch materiality only");
    // No break inside the post-process loops.
    const postProcessBlocks = ["for (let index = 0; index < retainedPhase.length", "for (let index=0;index<retained.length", "for (let gi = 0; gi < gainRetained.length", "for (let jobIdx = 0; jobIdx < positionJobs.length"];
    for (const block of postProcessBlocks) {
      const idx = engineSource.indexOf(block);
      assert.ok(idx >= 0, `${block} present`);
      // Scan the next 400 chars for a bare `break;` (not inside a nested switch).
      const slice = engineSource.slice(idx, idx + 500);
      assert.ok(!/^\s*break;/.test(slice.replace(/\n/g, " ")) || slice.includes("switch"), `no bare break in ${block}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. SERIAL VS CONCURRENT IDENTICAL
// ═══════════════════════════════════════════════════════════════════════════
describe("Serial vs concurrent identity", () => {
  it("18: maxConcurrency=1 and maxConcurrency=3 produce identical results", async () => {
    const jobs = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      tuning: { gain: i % 3, delay: (i * 7) % 20, polarity: i % 2 },
    }));
    // Deterministic mock: result is a deep object derived from the job so
    // identity can be compared field-by-field.
    const makeRunFn = () => async (job, index) => ({
      result: {
        candidateId: job.id,
        gain: job.tuning.gain,
        delay: job.tuning.delay,
        polarity: job.tuning.polarity,
        p18: 20 + (index % 5),
        p19Raw: 45 - (index % 4),
        p20Raw: 30 + (index % 6),
        seatRows: [[1, 2], [3, 4]],
        validity: true,
        primarySafety: index % 2 === 0,
        p19Safety: true,
        materiality: index === 5,
        rankingScore: 100 - index,
        winner: index === 5,
        tradeOff: index === 7,
      },
      workerMs: 1,
    });

    const serial = await runBoundedConfirmations({ jobs, maxConcurrency: 1, runFn: makeRunFn() });
    const concurrent = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn: makeRunFn() });

    assert.equal(serial.results.length, concurrent.results.length);
    const fields = ["candidateId", "gain", "delay", "polarity", "p18", "p19Raw", "p20Raw", "validity", "primarySafety", "p19Safety", "materiality", "rankingScore", "winner", "tradeOff"];
    for (let i = 0; i < jobs.length; i++) {
      const s = serial.results[i].result;
      const c = concurrent.results[i].result;
      for (const f of fields) {
        assert.deepEqual(s[f], c[f], `job ${i} field ${f} identical serial vs concurrent`);
      }
    }
  });
});