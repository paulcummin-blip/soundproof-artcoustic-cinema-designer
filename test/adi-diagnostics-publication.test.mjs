import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(tmpdir(), "adi-diagnostics-test-"));
globalThis.__adiTest = { read: async () => null, update: async () => {} };
const output = path.join(dir, "fixture.mjs");
await build({
  stdin: { contents: `
    export * from "./src/components/recommendationEngine/recommendationPersistence.js";
    export * from "./src/components/room/bass/optimiserPlan/optimiserRecommendationPublication.js";
    export * from "./src/components/room/bass/optimiserPlan/optimiserRunTimings.js";
    export * from "./src/components/room/bass/optimiserPlan/optimiserRunHistory.js";
    export * from "./src/components/room/bass/optimiserPlan/optimiserPlanPersistence.js";
  `, resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", outfile: output, logLevel: "silent",
  plugins: [{
    name: "isolated-persistence",
    setup(b) {
      b.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: "api", namespace: "mock" }));
      b.onResolve({ filter: /^@\/components\/state\/projectReadCache$/ }, () => ({ path: "reads", namespace: "mock" }));
      b.onResolve({ filter: /^@\/components\/recommendationEngine$/ }, () => ({ path: path.resolve("src/components/recommendationEngine/recommendationPersistence.js") }));
      b.onResolve({ filter: /^@\// }, args => ({ path: path.resolve("src", args.path.slice(2) + (path.extname(args.path) ? "" : ".js")) }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "api"
        ? "export const base44={entities:{ProjectAnalysisCache:{update:(...args)=>globalThis.__adiTest.update(...args)}}};"
        : "export const readProjectAnalysisCacheRecord=(...args)=>globalThis.__adiTest.read(...args); export const invalidateProjectAnalysisCacheRead=()=>{};" }));
    },
  }],
});
const m = await import(pathToFileURL(output));
const realSetTimeout = globalThis.setTimeout;
test.after(async () => { globalThis.setTimeout = realSetTimeout; delete globalThis.__adiTest; await rm(dir, { recursive: true }); });

test("same durable fingerprint writes once, records actual timings, then promotes memory", async () => {
  let writes = 0;
  globalThis.__adiTest.read = async () => ({ id: "cache", completed_by_fingerprint: { durable: { result: 1 }, previous: { result: 2 } } });
  globalThis.__adiTest.update = async (id, body) => {
    assert.equal(m.getRecommendation("success", "v").recommendation, null);
    assert.equal(body.completed_by_fingerprint.previous.result, 2);
    writes++;
  };
  m.beginRunTimings("success", "v", "run1");
  const r = await m.publishOptimiserRecommendation({ projectId: "success", versionId: "v", recommendation: { text: "new" }, plan: { run: { runId: "run1" } }, runFingerprint: "durable", savedFingerprint: "durable" });
  assert.equal(r.ok, true); assert.equal(writes, 1);
  assert.equal(r.results[0].diagnostics.reads, 1);
  assert.equal(r.results[0].diagnostics.writes, 1);
  assert.ok(r.results[0].diagnostics.totalMs >= r.results[0].diagnostics.readMs);
  assert.equal(m.getRecommendation("success", "v").recommendation.optimiserPlan.run.runId, "run1");
  const timing = m.buildPersistedRunTimings(m.getRunTimings("success", "v"));
  assert.ok(timing.runStart); assert.ok(timing.durationsMs.publication >= 0);
});

test("historical wrong-key failure stays snapshot_missing even after second write succeeds", async () => {
  globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms === 250 ? 0 : ms, ...args);
  globalThis.__adiTest.read = async () => ({ id: "cache", completed_by_fingerprint: { durable: {} } });
  globalThis.__adiTest.update = async () => {};
  m.beginRunTimings("partial", "v", "run2");
  const r = await m.publishOptimiserRecommendation({ projectId: "partial", versionId: "v", recommendation: { text: "new" }, plan: {}, runFingerprint: "wrong-input-key", savedFingerprint: "durable" });
  assert.equal(r.ok, false); assert.equal(r.failure.category, "snapshot_missing");
  assert.equal(r.results[0].diagnostics.reads, 20); assert.equal(r.results[0].diagnostics.writes, 0);
  assert.equal(r.results[1].persisted, true);
  const record = m.buildRecommendationPublicationRecord({ publication: r, runId: "run2" });
  assert.deepEqual(record.fingerprints, ["durable"]);
  assert.match(record.error, /snapshot.*missing/);
  globalThis.setTimeout = realSetTimeout;
});

test("refused save preserves the previous authoritative recommendation", async () => {
  globalThis.__adiTest.read = async () => ({ id: "cache", completed_by_fingerprint: { durable: {} } });
  globalThis.__adiTest.update = async () => {};
  assert.equal(await m.publishRecommendation("refused", "v", { text: "previous" }, "durable"), true);
  globalThis.__adiTest.update = async () => { throw new Error("write denied"); };
  assert.equal(await m.publishRecommendation("refused", "v", { text: "new" }, "durable", { writeAttempts: 1 }), false);
  assert.equal(m.getRecommendation("refused", "v").recommendation.text, "previous");
  assert.equal(m.getPublicationFailure("refused", "v").category, "write_refused");
  assert.equal(m.getPublicationDiagnostics("refused", "v").writes, 1);
});

test("completed, failed and cancelled history preserves compact object diagnostics", () => {
  for (const terminalStatus of ["actionable_plan", "failed", "cancelled"]) {
    const r = m.buildOptimiserRunHistoryRecord({ runId: "r", projectId: "p", versionId: "v", terminalStatus,
      workerCalls: { total: 4, roomSimulationCalls: 2 },
      runtimeBreakdown: { runId: "r", measuredStages: { "crossover-screening": 25 }, counts: { crossoverCandidates: 100 }, timings: { durationsMs: { total: 50 } }, responseArrays: [1,2,3] },
    });
    assert.equal(r.worker_calls.roomSimulationCalls, 2);
    assert.ok(r.runtime_breakdown.some(row => row.key === "crossover-screening" && row.value === "25"));
    assert.ok(r.runtime_breakdown.some(row => row.key === "counts" && JSON.parse(row.value).crossoverCandidates === 100));
    assert.ok(!JSON.stringify(r).includes("responseArrays"));
  }
});

test("plan completion waits for the exact run's durable version acknowledgement", async () => {
  let completed = false;
  const waiting = m.waitForOptimiserPlanSave("p", "v", "new-run", 100).then(at => { completed = true; return at; });
  m.acknowledgeOptimiserPlanSave("p", "v", { run: { runId: "old-run" } });
  await Promise.resolve(); assert.equal(completed, false);
  m.acknowledgeOptimiserPlanSave("p", "v", { run: { runId: "new-run" } });
  assert.ok(await waiting);
  await assert.rejects(m.waitForOptimiserPlanSave("p", "v", "never-saved", 5), /not acknowledged/);
});
