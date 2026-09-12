import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFullTransferReuseCache, fullTransferIdentity, FULL_TRANSFER_BASIS } from "../src/components/room/bass/stage2/stage2FullTransferReuse.js";
import { evaluateStage2Placement, evaluateStage2ConfirmationWithTuning } from "../src/components/room/bass/stage2/stage2CanonicalEvaluation.js";
import { resolveInstalledEffectiveTuning } from "../src/components/room/bass/improveBassV2/improveBassV2Engine.js";

// Synthetic geometry only; the real frozen project stays in the protected local browser.
const params = {
  finalist: { id: "current", familyId: "current", sources: [
    { xNorm: .2, yNorm: .05 }, { xNorm: .8, yNorm: .05 },
    { xNorm: .2, yNorm: .95 }, { xNorm: .8, yNorm: .95 }] },
  roomDims: { widthM: 4, lengthM: 5, heightM: 2.4 },
  rspPosition: { x: 2, y: 3.5, z: 1.2 },
  seatingPositions: [{ id: "left", x: 1.3, y: 3.5, z: 1.2, priority: "secondary" },
    { id: "centre", x: 2, y: 3.5, z: 1.2, priority: "primary" }],
  selectedSubModel: "sub2-12", amplifierPowerPerSubW: 1000, subwooferBottomHeightM: .05,
};
const clone = x => structuredClone(x);
const raw = evaluateStage2Placement(params);
const make = (cache, p = params, extra = {}) => cache.getOrCompute({ projectId: "synthetic-A", params: p,
  runId: "run-1", compute: () => clone(raw), ...extra });
const target = { p14TargetBasis: "minimum", p14TargetLevel: 3, p14TargetDb: 115, p18TargetBasis: "minimum" };
const confirm = (r, t = target) => {
  const { runtimeMs, ...authority } = evaluateStage2ConfirmationWithTuning(r, {
    tuning: r.autoAlignTuning, tuningVariant: "placement-only", ...t });
  assert.ok(Number.isFinite(runtimeMs)); // Wall time is not an acoustic output.
  return authority;
};

test("A: exact full acoustic entry reused; all transfer and canonical values unchanged", async () => {
  const c = createFullTransferReuseCache(); let calls = 0; const ops = [];
  const first = await make(c, params, { compute: () => { calls++; return clone(raw); }, onOperation: o => ops.push(o) });
  const next = await make(c, params, { runId: "run-2", compute: () => { calls++; throw Error("must reuse"); }, onOperation: o => ops.push(o) });
  assert.equal(calls, 1); assert.deepEqual(next, first); assert.deepEqual(confirm(next), confirm(first));
  assert.equal(ops[1].reason, "previous-run-completed"); assert.equal(ops[1].computationStart, null);
});
test("B: priority-only reuse retags every seat before fresh canonical evaluation", async () => {
  const c = createFullTransferReuseCache(); await make(c);
  const p = clone(params); p.seatingPositions.forEach(s => { s.priority = s.priority === "primary" ? "secondary" : "primary"; });
  assert.equal(fullTransferIdentity(p), fullTransferIdentity(params));
  const hit = await make(c, p, { compute: () => { throw Error("acoustics independent of priority"); } });
  const fresh = evaluateStage2Placement(p);
  assert.deepEqual(hit, fresh); assert.deepEqual(confirm(hit), confirm(fresh));
  assert.deepEqual(hit.perSeatRawCurves.map(s => s.isPrimary), [true, false]);
  assert.deepEqual(confirm(hit).perSeatP19.map(s => s.isPrimary), [true, false]);
});
test("C: P14-only changes reuse acoustics but recompute requested output/authority", async () => {
  const c = createFullTransferReuseCache(); await make(c);
  const p = { ...params, p14TargetDb: 109, p14TargetLevel: 1 };
  assert.equal(fullTransferIdentity(p), fullTransferIdentity(params));
  const hit = await make(c, p, { compute: () => { throw Error("target-independent acoustics"); } });
  const lower = confirm(hit, { ...target, p14TargetDb: 109, p14TargetLevel: 1 });
  assert.deepEqual(lower, confirm(raw, { ...target, p14TargetDb: 109, p14TargetLevel: 1 }));
  assert.equal(lower.operatingOutputDb, 109); assert.equal(lower.p14TargetLevel, 1);
  assert.notEqual(lower.operatingOutputDb, confirm(raw).operatingOutputDb);
});
for (const [name, change] of [
  ["D sub +100mm", p => p.finalist.sources[0].xNorm += .1 / p.roomDims.widthM],
  ["E seat +100mm", p => p.seatingPositions[0].x += .1],
  ["F product", p => p.selectedSubModel = "sub3-12"],
  ["F amplifier", p => p.amplifierPowerPerSubW = 100],
  ["room", p => p.roomDims.widthM += .1],
  ["height", p => p.subwooferBottomHeightM += .1],
  ["RSP", p => p.rspPosition.y += .1],
  ["sub-micrometre motion", p => p.finalist.sources[0].xNorm += 1e-10],
]) test(`${name}: old identity cannot supply changed acoustics`, async () => {
  const c = createFullTransferReuseCache(); await make(c); const p = clone(params); change(p);
  assert.notEqual(fullTransferIdentity(p), fullTransferIdentity(params)); let calls = 0;
  const fresh = evaluateStage2Placement(p);
  const result = await make(c, p, { compute: () => { calls++; return fresh; } });
  assert.equal(calls, 1); assert.deepEqual(result, fresh);
  assert.notDeepEqual(result.perSourcePerSeatComplexTransfers, raw.perSourcePerSeatComplexTransfers);
});
test("G: ordered source geometry misses; effective tuning retains instance IDs", async () => {
  const c = createFullTransferReuseCache(); await make(c); const p = clone(params); p.finalist.sources.reverse();
  let calls = 0; const fresh = evaluateStage2Placement(p);
  const hit = await make(c, p, { compute: () => { calls++; return fresh; } }); assert.equal(calls, 1);
  const instances = ["rear-right", "rear-left", "front-right", "front-left"].map((id,i) => ({ id, enabled: true,
    delayMs: i < 2 ? 7 : 9, gainDb: i, polarity: i === 0 ? -1 : 0, tuningSource: "evaluated-effective" }));
  const tuning = resolveInstalledEffectiveTuning(hit, instances, p.rspPosition);
  assert.deepEqual(tuning.map(t => t.sourceId), instances.map(s => s.id));
  assert.deepEqual(tuning, resolveInstalledEffectiveTuning(fresh, instances, p.rspPosition));
  assert.deepEqual(hit, await make(c, p, { compute: () => { throw Error("exact reordered hit"); } }));
});
test("H: cancelled in-flight work is never admitted; restart succeeds", async () => {
  const c = createFullTransferReuseCache(), controller = new AbortController(); let finish;
  const job = make(c, params, { signal: controller.signal, compute: () => new Promise(r => finish = r) });
  controller.abort(); finish(clone(raw)); await assert.rejects(job, { name: "AbortError" });
  assert.equal(c.stats().entries, 0); await make(c); assert.equal(c.stats().entries, 1);
});
test("H: stale completion rejected; completed unrelated entries survive cancellation", async () => {
  const c = createFullTransferReuseCache(); await make(c); let stale = false, finish;
  const p = clone(params); p.rspPosition.x += .1;
  const job = make(c, p, { isStale: () => stale, compute: () => new Promise(r => finish = r) });
  stale = true; finish(clone(raw)); await assert.rejects(job, { name: "AbortError" });
  assert.equal(c.stats().entries, 1); await make(c, params, { compute: () => { throw Error("valid prior retained"); } });
});
test("I: project ownership isolated; clearing a project retains another", async () => {
  const c = createFullTransferReuseCache(); await make(c); let calls = 0;
  await make(c, params, { projectId: "synthetic-B", compute: () => { calls++; return clone(raw); } });
  assert.equal(calls, 1); assert.equal(c.stats().entries, 2); c.clearProject("synthetic-A");
  assert.equal(c.stats().entries, 1); await make(c, params, { projectId: "synthetic-B", compute: () => { throw Error("B retained"); } });
});
test("basis/engine/physics/grid change cannot reuse a prior entry", async () => {
  const c = createFullTransferReuseCache(); await make(c);
  for (const basis of [{ ...FULL_TRANSFER_BASIS, placementVersion: "different" },
    { ...FULL_TRANSFER_BASIS, grid: "flat-screening" },
    { ...FULL_TRANSFER_BASIS, physics: { ...FULL_TRANSFER_BASIS.physics, axialQ: 5 } }]) {
    let calls = 0; await make(c, params, { basis, compute: () => { calls++; return clone(raw); } }); assert.equal(calls, 1);
  }
});
test("B same-run Current fallback reuses acoustics and retags logical candidate", async () => {
  const c = createFullTransferReuseCache(); await make(c); let op;
  const p = clone(params); p.finalist.id = "current-confirmation"; p.finalist.familyId = "retagged";
  const result = await make(c, p, { compute: () => { throw Error("same-run duplicate"); }, onOperation: o => op = o });
  assert.equal(op.reason, "same-run-completed"); assert.equal(result.finalistId, p.finalist.id);
  assert.equal(result.familyId, "retagged"); assert.deepEqual(result.perSourcePerSeatComplexTransfers, raw.perSourcePerSeatComplexTransfers);
});
test("immutable owned payload: worker/caller mutation and buffer detachment cannot damage entry", async () => {
  const c = createFullTransferReuseCache(), original = clone(raw); original.testBuffer = new Uint8Array([1,2,3]);
  await make(c, params, { compute: () => original });
  original.perSourcePerSeatComplexTransfers[0].points[0].re = -1;
  structuredClone(original.testBuffer, { transfer: [original.testBuffer.buffer] });
  const hit = await make(c); hit.perSourcePerSeatComplexTransfers[0].points[0].re = -2;
  const next = await make(c); assert.equal(next.perSourcePerSeatComplexTransfers[0].points[0].re, raw.perSourcePerSeatComplexTransfers[0].points[0].re);
});
test("incomplete, tuned, non-finite, flat/coarse transfers never become complete entries", async () => {
  for (const mutate of [r => r.perSourcePerSeatComplexTransfers.pop(), r => r.sources[0].tuning.delayMs = 9,
    r => r.perSourcePerSeatComplexTransfers[0].points[0].re = NaN,
    r => r.perSourcePerSeatComplexTransfers[0].points.pop(), r => r.rspRawCurve.shift(),
    r => r.seatIds[1] = "wrong-seat", r => r.sources[0].x += .1]) {
    const c = createFullTransferReuseCache(), r = clone(raw); mutate(r); await make(c, params, { compute: () => r });
    assert.equal(c.stats().entries, 0);
  }
});
test("LRU and byte budget bound entries without clearing another valid project", async () => {
  const c = createFullTransferReuseCache({ maxEntries: 2 });
  await make(c); await make(c, params, { projectId: "B" }); await make(c); await make(c, params, { projectId: "C" });
  assert.equal(c.stats().entries, 2); let calls = 0;
  await make(c, params, { projectId: "B", compute: () => { calls++; return clone(raw); } }); assert.equal(calls, 1);
  const small = createFullTransferReuseCache({ maxBytes: 10 }); await make(small); assert.equal(small.stats().entries, 0);
  assert.ok(c.stats().bytes <= c.stats().maxBytes);
});
test("all four mounted V2 placement consumers use exact reuse; canonical/search paths remain present", () => {
  const source = readFileSync(new URL("../src/components/room/bass/improveBassV2/improveBassV2Engine.js", import.meta.url), "utf8");
  assert.equal((source.match(/await prepareFullTransfer\(/g) || []).length, 4);
  assert.equal((source.match(/runInWorker\(worker, "placement"/g) || []).length, 1);
  assert.ok(source.includes('"grouped-delay"')); assert.ok(source.includes('"confirmation"'));
  assert.ok(source.includes("runPositionScreenPhase")); assert.ok(source.includes("selectConfirmedRecommendations"));
});
