// Regression suite for bounded seating/P20 canonical confirmation concurrency.
//
// Covers the 20-point contract from the CONTINUE request. The seating path
// reuses the SAME runBoundedConfirmations + createConfirmationRunFn + pool
// as the four electronic phases, so scheduling correctness is exercised here
// against seating-shaped payloads and seating-shaped results, and the
// engine contracts (transfer reuse, no duplicate confirmation, runId, cache
// key, terminal outcome) are verified by source inspection.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runBoundedConfirmations } from "../components/room/bass/improveBassV2/runBoundedConfirmations.js";
import { createConfirmationRunFn } from "../components/room/bass/improveBassV2/createConfirmationRunFn.js";
const { describe, it } = test;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(__dirname, "..", "components/room/bass/improveBassV2/improveBassV2Engine.js");
const BATCH_PATH = join(__dirname, "..", "components/room/bass/stage2/stage2SeatingBatchEvaluation.js");
const engineSource = readFileSync(ENGINE_PATH, "utf8");
const batchSource = readFileSync(BATCH_PATH, "utf8");

// ── Seating-shaped mock helpers ───────────────────────────────────────────
// A seating confirmation job carries { rawTransfer, tuning, tuningVariant,
// p14/p18 basis, _offsetMm }. A seating-shaped result carries the P20/P19
// identity fields the post-process reads: perSeatP20, achievedP20Level,
// primarySafety, p19Safety, candidateId, seatIds, etc.

function seatingJob(offsetMm, tuning = []) {
  return {
    rawTransfer: { finalistId: "current", perSourcePerSeatComplexTransfers: [], _offset: offsetMm },
    tuning,
    tuningVariant: "delay-polarity-trim",
    p14TargetBasis: "flat", p14TargetLevel: "L2", p14TargetDb: 0,
    p18TargetBasis: "flat", correctabilityAssessment: { correctable: true },
    _offsetMm: offsetMm,
  };
}

function makeSeatingRunFn({ delays = {}, failOffsets = new Set() } = {}) {
  const state = { invocations: [], peakActive: 0, _active: 0 };
  const runFn = async (job, index) => {
    state.invocations.push({ index, offsetMm: job._offsetMm });
    state._active += 1;
    if (state._active > state.peakActive) state.peakActive = state._active;
    const delay = delays[index] || 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    state._active -= 1;
    if (failOffsets.has(job._offsetMm)) throw new Error(`seating-fail:${job._offsetMm}`);
    // Deterministic seating-shaped result derived from offset so identity
    // can be compared field-by-field across concurrency settings.
    const off = Number(job._offsetMm);
    return {
      result: {
        candidateId: "seating:" + off,
        seatingOffsetMm: off,
        seatIds: ["rsp", "seat-1", "seat-2"],
        seatPriorities: { rsp: "primary", "seat-1": "secondary", "seat-2": "secondary" },
        perSeatRaw: [
          { seatId: "rsp", p20Raw: 30 + (off % 7) },
          { seatId: "seat-1", p20Raw: 28 + (off % 5) },
          { seatId: "seat-2", p20Raw: 29 + (off % 6) },
        ],
        achievedP20Raw: 30 + (off % 7),
        achievedP20Level: off % 2 === 0 ? "L3" : "L2",
        primarySafety: off % 2 === 0,
        p19Safety: true,
        p19Raw: 45 - (off % 4),
        p19Level: off % 3 === 0 ? "L3" : "L2",
        materiality: off === 300,
        rankingScore: 100 - Math.abs(off),
        winner: off === 300,
        tradeOff: off === -200,
        unsafe: off % 2 !== 0,
      },
      workerMs: delay || 1,
    };
  };
  return { runFn, state };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1-4. CANDIDATE COUNTS / EXACTLY-ONCE
// ═══════════════════════════════════════════════════════════════════════════
describe("Seating confirmations — candidate counts", () => {
  it("1: one seating candidate → exactly one result", async () => {
    const { runFn, state } = makeSeatingRunFn();
    const { results, stats } = await runBoundedConfirmations({
      jobs: [seatingJob(100)], maxConcurrency: 3, runFn,
    });
    assert.equal(results.length, 1);
    assert.equal(state.invocations.length, 1);
    assert.equal(stats.candidateCount, 1);
  });

  it("2: eight candidates → eight results, each evaluated exactly once", async () => {
    const offsets = [-500, -400, -300, -200, -100, 100, 200, 300];
    const jobs = offsets.map((o) => seatingJob(o));
    const { runFn, state } = makeSeatingRunFn();
    const { results, stats } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.equal(results.length, 8);
    assert.equal(stats.candidateCount, 8);
    const seen = new Set(state.invocations.map((i) => i.offsetMm));
    assert.equal(seen.size, 8, "all 8 offsets evaluated");
    for (const i of state.invocations) {
      const count = state.invocations.filter((x) => x.offsetMm === i.offsetMm).length;
      assert.equal(count, 1, `offset ${i.offsetMm} invoked exactly once`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. MAX ACTIVE <= 3
// ═══════════════════════════════════════════════════════════════════════════
describe("Seating confirmations — peak concurrency", () => {
  it("3: peak active never exceeds 3 over eight candidates", async () => {
    const offsets = [-500, -400, -300, -200, -100, 100, 200, 300];
    const jobs = offsets.map((o) => seatingJob(o));
    const delays = Object.fromEntries(jobs.map((_, i) => [i, 5 + (i % 3)]));
    const { runFn, state } = makeSeatingRunFn({ delays });
    const { stats } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.ok(stats.peakActive <= 3, `peakActive ${stats.peakActive} <= 3`);
    assert.ok(stats.peakActive >= 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4-5. STABLE ORDERING / REVERSED COMPLETION DOES NOT AFFECT ORDER
// ═══════════════════════════════════════════════════════════════════════════
describe("Seating confirmations — ordering", () => {
  it("4: results returned in original offset order regardless of finish order", async () => {
    const offsets = [-400, -300, -200, -100, 100, 200, 300, 400];
    const jobs = offsets.map((o) => seatingJob(o));
    // Reverse completion: later indices finish first.
    const delays = Object.fromEntries(jobs.map((_, i) => [i, (8 - i) * 3]));
    const { runFn } = makeSeatingRunFn({ delays });
    const { results } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    for (let i = 0; i < offsets.length; i++) {
      assert.equal(results[i].result.candidateId, "seating:" + offsets[i]);
      assert.equal(results[i].result.seatingOffsetMm, offsets[i]);
    }
  });

  it("5: reversed completion order does not affect result order (winner at index 4)", async () => {
    const offsets = [-400, -300, -200, -100, 300, 200, 100, 400];
    const jobs = offsets.map((o) => seatingJob(o));
    // winner = offset 300 (index 4). Make it the SLOWEST.
    const delays = Object.fromEntries(jobs.map((_, i) => [i, i === 4 ? 80 : 2]));
    const { runFn } = makeSeatingRunFn({ delays });
    const { results } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.equal(results[4].result.winner, true, "winner stays at original index 4");
    assert.equal(results[4].result.candidateId, "seating:300");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6-13. SERIAL VS CONCURRENT IDENTITY (P20, grades, safety, ranking, winner, trade-off)
// ═══════════════════════════════════════════════════════════════════════════
describe("Seating — serial vs concurrent identity", () => {
  const offsets = [-500, -400, -300, -200, -100, 100, 200, 300];
  const identityFields = [
    "candidateId", "seatingOffsetMm", "seatIds", "seatPriorities",
    "perSeatRaw", "achievedP20Raw", "achievedP20Level",
    "primarySafety", "p19Safety", "p19Raw", "p19Level",
    "materiality", "rankingScore", "winner", "tradeOff", "unsafe",
  ];

  it("6: serial (concurrency=1) vs concurrent (=3) produce identical seat rows", async () => {
    const jobs = offsets.map((o) => seatingJob(o, [{ delayMs: o / 100 }]));
    const makeRunFn = () => makeSeatingRunFn().runFn;
    const serial = await runBoundedConfirmations({ jobs, maxConcurrency: 1, runFn: makeRunFn() });
    const concurrent = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn: makeRunFn() });
    assert.equal(serial.results.length, concurrent.results.length);
    for (let i = 0; i < jobs.length; i++) {
      assert.deepEqual(serial.results[i].result.seatIds, concurrent.results[i].result.seatIds);
      assert.deepEqual(serial.results[i].result.perSeatRaw, concurrent.results[i].result.perSeatRaw);
    }
  });

  it("7: identical raw P20 values", async () => {
    const jobs = offsets.map((o) => seatingJob(o));
    const makeRunFn = () => makeSeatingRunFn().runFn;
    const serial = await runBoundedConfirmations({ jobs, maxConcurrency: 1, runFn: makeRunFn() });
    const concurrent = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn: makeRunFn() });
    for (let i = 0; i < jobs.length; i++) {
      assert.equal(serial.results[i].result.achievedP20Raw, concurrent.results[i].result.achievedP20Raw);
      assert.deepEqual(serial.results[i].result.perSeatRaw, concurrent.results[i].result.perSeatRaw);
    }
  });

  it("8: identical P20 grades (level)", async () => {
    const jobs = offsets.map((o) => seatingJob(o));
    const makeRunFn = () => makeSeatingRunFn().runFn;
    const serial = await runBoundedConfirmations({ jobs, maxConcurrency: 1, runFn: makeRunFn() });
    const concurrent = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn: makeRunFn() });
    for (let i = 0; i < jobs.length; i++) {
      assert.equal(serial.results[i].result.achievedP20Level, concurrent.results[i].result.achievedP20Level);
    }
  });

  it("9: identical Primary-seat safety", async () => {
    const jobs = offsets.map((o) => seatingJob(o));
    const makeRunFn = () => makeSeatingRunFn().runFn;
    const serial = await runBoundedConfirmations({ jobs, maxConcurrency: 1, runFn: makeRunFn() });
    const concurrent = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn: makeRunFn() });
    for (let i = 0; i < jobs.length; i++) {
      assert.equal(serial.results[i].result.primarySafety, concurrent.results[i].result.primarySafety);
    }
  });

  it("10: identical P19 safety", async () => {
    const jobs = offsets.map((o) => seatingJob(o));
    const makeRunFn = () => makeSeatingRunFn().runFn;
    const serial = await runBoundedConfirmations({ jobs, maxConcurrency: 1, runFn: makeRunFn() });
    const concurrent = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn: makeRunFn() });
    for (let i = 0; i < jobs.length; i++) {
      assert.equal(serial.results[i].result.p19Safety, concurrent.results[i].result.p19Safety);
      assert.equal(serial.results[i].result.p19Raw, concurrent.results[i].result.p19Raw);
    }
  });

  it("11: identical ranking score", async () => {
    const jobs = offsets.map((o) => seatingJob(o));
    const makeRunFn = () => makeSeatingRunFn().runFn;
    const serial = await runBoundedConfirmations({ jobs, maxConcurrency: 1, runFn: makeRunFn() });
    const concurrent = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn: makeRunFn() });
    for (let i = 0; i < jobs.length; i++) {
      assert.equal(serial.results[i].result.rankingScore, concurrent.results[i].result.rankingScore);
    }
  });

  it("12: identical winner", async () => {
    const jobs = offsets.map((o) => seatingJob(o));
    const makeRunFn = () => makeSeatingRunFn().runFn;
    const serial = await runBoundedConfirmations({ jobs, maxConcurrency: 1, runFn: makeRunFn() });
    const concurrent = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn: makeRunFn() });
    const serialWinners = serial.results.filter((r) => r.result.winner).map((r) => r.result.candidateId);
    const concurrentWinners = concurrent.results.filter((r) => r.result.winner).map((r) => r.result.candidateId);
    assert.deepEqual(serialWinners, concurrentWinners);
  });

  it("13: identical trade-off", async () => {
    const jobs = offsets.map((o) => seatingJob(o));
    const makeRunFn = () => makeSeatingRunFn().runFn;
    const serial = await runBoundedConfirmations({ jobs, maxConcurrency: 1, runFn: makeRunFn() });
    const concurrent = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn: makeRunFn() });
    const serialTrade = serial.results.filter((r) => r.result.tradeOff).map((r) => r.result.candidateId);
    const concurrentTrade = concurrent.results.filter((r) => r.result.tradeOff).map((r) => r.result.candidateId);
    assert.deepEqual(serialTrade, concurrentTrade);
  });

  it("6-13 (full): every identity field matches serial vs concurrent", async () => {
    const jobs = offsets.map((o) => seatingJob(o));
    const makeRunFn = () => makeSeatingRunFn().runFn;
    const serial = await runBoundedConfirmations({ jobs, maxConcurrency: 1, runFn: makeRunFn() });
    const concurrent = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn: makeRunFn() });
    for (let i = 0; i < jobs.length; i++) {
      for (const f of identityFields) {
        assert.deepEqual(serial.results[i].result[f], concurrent.results[i].result[f],
          `job ${i} field ${f} identical`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. FAILURE ISOLATION
// ═══════════════════════════════════════════════════════════════════════════
describe("Seating confirmations — failure isolation", () => {
  it("14: one seating candidate failing → 7 valid siblings succeed, failure recorded at its index", async () => {
    const offsets = [-500, -400, -300, -200, -100, 100, 200, 300];
    const jobs = offsets.map((o) => seatingJob(o));
    const { runFn } = makeSeatingRunFn({ failOffsets: new Set([-200]) });
    const { results, stats } = await runBoundedConfirmations({ jobs, maxConcurrency: 3, runFn });
    assert.equal(results.length, 8);
    const failIdx = offsets.indexOf(-200);
    assert.equal(results[failIdx].ok, false, "failed index is { ok: false }");
    assert.ok(results[failIdx].error, "failed index carries error evidence");
    for (let i = 0; i < 8; i++) {
      if (i === failIdx) continue;
      assert.equal(results[i].ok, true, `sibling ${i} (offset ${offsets[i]}) succeeded`);
      assert.equal(results[i].result.candidateId, "seating:" + offsets[i]);
    }
    assert.equal(stats.jobsFailed, 1);
    assert.equal(stats.jobsCompleted, 8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. CANCELLATION
// ═══════════════════════════════════════════════════════════════════════════
describe("Seating confirmations — cancellation", () => {
  it("15: isAborted true after a batch starts → no new seating jobs dispatch", async () => {
    const offsets = [-500, -400, -300, -200, -100, 100, 200, 300];
    const jobs = offsets.map((o) => seatingJob(o));
    const started = [];
    const { runFn } = makeSeatingRunFn({ delays: Object.fromEntries(jobs.map((_, i) => [i, 10])) });
    const trackedRunFn = async (job, index) => {
      started.push(index);
      return runFn(job, index);
    };
    const isAborted = () => started.length >= 3;
    const { stats } = await runBoundedConfirmations({
      jobs, maxConcurrency: 3, runFn: trackedRunFn, isAborted,
    });
    assert.ok(started.length <= 3, `no more than 3 started, got ${started.length}`);
    assert.ok(stats.jobsStarted <= 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16-17. LISTENER-TRANSFER REUSE / NO DUPLICATED CONFIRMATION (source)
// ═══════════════════════════════════════════════════════════════════════════
describe("Seating — transfer reuse + no duplication (source)", () => {
  it("16: existing listener-transfer reuse unchanged — batch worker untouched", () => {
    // stage2SeatingBatchEvaluation still prepares the field once and reuses
    // listener-mode coupling per offset (the optimisation this task preserves).
    assert.ok(/prepareSourceRoomField/.test(batchSource), "batch still prepares source/room field once");
    assert.ok(/evaluateReceiversFromPreparedField/.test(batchSource), "batch still reuses prepared field per offset");
    // The engine still consumes sc.seatingTransfer as-is — no recompute added.
    assert.ok(/rawTransfer:\s*sc\.seatingTransfer/.test(engineSource), "engine consumes precomputed seatingTransfer");
    assert.ok(!/prepareFullTransfer.*seating/i.test(engineSource), "no new transfer computation in seating confirm");
  });

  it("17: no duplicated canonical confirmation — exactly one bounded batch for seating", () => {
    // One runBoundedConfirmations call for the seating shortlist, and the
    // post-process loop iterates each shortlist index exactly once.
    const seatingBatchCalls = (engineSource.match(/seatingBatch\s*=\s*await\s*runBoundedConfirmations/g) || []).length;
    assert.equal(seatingBatchCalls, 1, "exactly one bounded seating confirmation batch");
    const seatingJobMap = (engineSource.match(/shortlist\.map\(\(sc\)\s*=>\s*\(\{/g) || []).length;
    assert.equal(seatingJobMap, 1, "seating jobs built once from shortlist");
    assert.ok(/for \(let i = 0; i < shortlist\.length; i\+\+\)\s*\{[\s\S]*?confirmedSeatingCandidates\.push/.test(engineSource),
      "post-process pushes each shortlist index once");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18-19. runId / CACHE KEY UNCHANGED (source)
// ═══════════════════════════════════════════════════════════════════════════
describe("Seating — runId + cache key unchanged (source)", () => {
  it("18: runId unchanged — labelFor preserves the 'seating-<index>' metric label", () => {
    assert.ok(/labelFor:\s*\(_job,\s*index\)\s*=>\s*"seating-"\s*\+\s*index/.test(engineSource),
      "seating label is 'seating-' + index (matches old seating-${i})");
  });

  it("19: cache key unchanged — transferKeyFor preserves 'seating:<offsetMm>'", () => {
    assert.ok(/transferKeyFor:\s*\(job\)\s*=>\s*"seating:"\s*\+\s*\(job\?\._offsetMm\s*\?\?\s*""\)/.test(engineSource),
      "seating transferKey is 'seating:' + offsetMm (matches old transferKey)");
    // The job still carries the full P14/P18 basis cache-key fields.
    assert.ok(/p14TargetBasis,\s*p14TargetLevel,\s*p14TargetDb,\s*p18TargetBasis,\s*correctabilityAssessment/.test(engineSource),
      "seating jobs carry full P14/P18 cache-key basis");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. TERMINAL OUTCOME UNCHANGED (source)
// ═══════════════════════════════════════════════════════════════════════════
describe("Seating — terminal outcome unchanged (source)", () => {
  it("20: no early break on completion order; selectSeatingWinner runs after full post-process", () => {
    // The post-process loop has no bare break; winner selection runs AFTER it.
    const postProcessIdx = engineSource.indexOf("for (let i = 0; i < shortlist.length; i++) {");
    assert.ok(postProcessIdx >= 0, "seating post-process loop present");
    const slice = engineSource.slice(postProcessIdx, postProcessIdx + 1200);
    assert.ok(!/\bbreak;/.test(slice), "no early break in seating post-process");
    // selectSeatingWinner runs after the post-process loop, on the full
    // confirmedSeatingCandidates list — not on completion order.
    const winnerSelectIdx = engineSource.indexOf("selectSeatingWinner(confirmedSeatingCandidates");
    assert.ok(winnerSelectIdx > postProcessIdx, "selectSeatingWinner runs AFTER the post-process loop");
    // No sort of seating results by completion/worker time.
    assert.ok(!/seatingBatch\.results\.sort\(/.test(engineSource), "no sort of seating batch results");
  });
});