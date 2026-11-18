import test from "node:test";
import assert from "node:assert/strict";

// ACTUAL production helpers under test.
import { verifyRecalculationScheduling } from "../src/components/room/bass/optimiseWorkflow/verifyRecalculationScheduling.js";
import { executeElectronicTransaction, settingsEqual, clone, stable } from "../src/components/room/bass/optimiseWorkflow/electronicApplication.js";
import { recommendationSettingsMatch, recommendationResultMatches } from "../src/components/room/bass/optimiseWorkflow/crossoverApplicationVerification.js";

// ---------------------------------------------------------------------------
// Verify the cacheKey scheduling race via the REAL verifyRecalculationScheduling
// helper plus the REAL recommendationSettingsMatch / recommendationResultMatches
// matchers. The helper captures the dispatch fingerprint AT DISPATCH (the
// cacheKey at the moment onCalculate is called), waits for the live settings to
// settle AND the bass owner's cacheKey to advance from its pre-commit value
// before calling onCalculate, and applies the same advancement wait to the
// restore path. A stale-scheduling bug (onCalculate called before the cacheKey
// advanced) is detectable: the dispatch fingerprint would equal the pre-commit
// key, and the matchers would reject the result.
// ---------------------------------------------------------------------------

const beforeCrossover = { frequencyHz: 80, subwooferFrequencyHz: 80, linkFrequencies: true, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24 };
const beforeInstances = [
  { id: "s1", model: "SUB2-12", position: { x: 1, y: 2 }, bottomHeightM: 0.05, rotationDeg: 0, enabled: true, delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: 1 },
  { id: "s2", model: "SUB2-12", position: { x: 3, y: 5 }, bottomHeightM: 0.05, rotationDeg: 180, enabled: true, delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: 1 },
];
const afterInstances = clone(beforeInstances).map((s, i) => ({ ...s, delayMs: i === 0 ? 0.5 : 3, phaseControlDeg: 5, polarity: -1 }));
const afterCrossover = { ...beforeCrossover, speakerHpSlopeDbPerOct: 12 };
const before = { instances: clone(beforeInstances), crossover: clone(beforeCrossover) };
const after = { instances: clone(afterInstances), crossover: clone(afterCrossover) };

const beforeTuning = beforeInstances.map((s) => ({ sourceId: s.id, delayMs: s.delayMs, gainDb: s.gainDb, phaseControlDeg: s.phaseControlDeg, polarity: s.polarity }));
const afterTuning = afterInstances.map((s) => ({ sourceId: s.id, delayMs: s.delayMs, gainDb: s.gainDb, phaseControlDeg: s.phaseControlDeg, polarity: s.polarity }));

// Expected confirmed-candidate result the verify must reproduce.
const expectedResult = {
  achievedP19VariationDb: 0,
  achievedP20VariationDb: 3,
  p14AchievedDb: 117,
  achievedP18Hz: 20,
  perSeatP20: [{ seatId: "seat-1", isPrimary: true, variationDbRaw: 3 }],
};

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Build a completed-bass authority contract whose fields the REAL
// recommendationResultMatches (via extractAuthorityForComparison) reads, so a
// matching publish returns true and a mismatched publish returns false.
function buildAuthority(key, { p19Var = 0, p20Var = 3, p14Db = 117, p18Hz = 20, seatVar = 3 } = {}) {
  return {
    authorityStatus: "AUTHORITATIVE",
    contract: {
      job: { status: "complete", resultFingerprint: key, currentJobFingerprint: key },
      selectedCandidate: {
        perSeatP20Results: [{ seatId: "seat-1", variationDbRaw: seatVar, level: "L3" }],
        achievedP18FrequencyHz: p18Hz,
        achievedP14Db: p14Db,
        achievedP14Level: "L4",
      },
      productAnalysis: {
        parameters: {
          p19: { variationDbRaw: p19Var, level: "L4" },
          p20: { variationDbRaw: p20Var, level: "L3" },
          p18: { level: "L4", value: p18Hz },
          p14: { achievedCapabilityDb: p14Db, achievedLevel: "L4" },
        },
      },
      provenance: { primarySeatIds: ["seat-1"] },
    },
  };
}

// authoritative settings shape consumed by recommendationSettingsMatch:
// { crossover, sources:[{ id, tuning:{ delayMs, gainDb, phaseControlDeg, polarity } }] }
function buildAuthoritativeSettings(instances, crossover) {
  return {
    crossover: clone(crossover),
    sources: instances.map((s) => ({
      id: s.id,
      tuning: { delayMs: s.delayMs, gainDb: s.gainDb, phaseControlDeg: s.phaseControlDeg, polarity: s.polarity },
    })),
  };
}

/**
 * Bass-owner simulator. Live settings settle to `settleTo` after `settleMs`; the
 * owner's cacheKey advances from `preCommitCacheKey` to `advanceTo` after
 * `advanceMs` (modelling the asynchronous recompute after the settings land);
 * onCalculate captures its dispatch fingerprint (state.cacheKey at call time)
 * and publishes a result for that fingerprint after `calcMs`, with authoritative
 * settings and result levels drawn from `publishSettings`/`publishResult`.
 */
function makeOwner({
  preCommitCacheKey = "cal:v1:before",
  advanceTo = "cal:v1:after",
  settleTo = after,
  publishSettings = buildAuthoritativeSettings(afterInstances, afterCrossover),
  publishResult = expectedResult,
  settleMs = 10,
  advanceMs = 20,
  calcMs = 15,
  canCalculate = true,
  neverAdvance = false,
  neverSettle = false,
}) {
  const state = {
    cacheKey: preCommitCacheKey,
    canCalculate,
    completedBassAuthority: { authorityStatus: "UPDATING", contract: { job: { status: "updating" } } },
    authoritative: buildAuthoritativeSettings(beforeInstances, beforeCrossover),
    onCalculate: null,
  };
  let liveSettings = clone(before);
  let dispatchFingerprint = null;
  let onCalculateCalls = 0;
  let calcTimer = null;
  state.onCalculate = () => {
    onCalculateCalls += 1;
    dispatchFingerprint = state.cacheKey; // capture AT DISPATCH
    if (calcTimer) clearTimeout(calcTimer);
    calcTimer = setTimeout(() => {
      state.completedBassAuthority = buildAuthority(dispatchFingerprint, publishResult);
      state.authoritative = clone(publishSettings);
    }, calcMs);
  };
  if (!neverSettle) setTimeout(() => { liveSettings = clone(settleTo); }, settleMs);
  if (!neverAdvance) setTimeout(() => { state.cacheKey = advanceTo; }, advanceMs);
  return {
    sharedRef: { current: state },
    phaseRef: { current: "idle" },
    readLiveSettings: () => liveSettings,
    getDispatchFingerprint: () => dispatchFingerprint,
    getOnCalculateCalls: () => onCalculateCalls,
  };
}

// waitForPublication that waits for the published result whose fingerprint
// matches the dispatch fingerprint captured by the owner.
function waitForPublication(owner, { timeoutMs = 2000 } = {}) {
  return async (sharedRef, phaseRef) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (phaseRef.current === "cancelled") return false;
      const df = owner.getDispatchFingerprint();
      const job = sharedRef.current?.completedBassAuthority?.contract?.job;
      if (df && job?.status === "complete" && job?.resultFingerprint === df
          && job?.currentJobFingerprint === df) return true;
      await realSleep(5);
    }
    return false;
  };
}

// Build a verify function that uses the REAL scheduling helper + REAL matchers.
function makeVerify(owner, { preCommitCacheKey }) {
  return async (settings, isRestore = false) => {
    const target = isRestore ? before : settings;
    const targetTuning = isRestore ? beforeTuning : afterTuning;
    const result = await verifyRecalculationScheduling({
      sharedRef: owner.sharedRef,
      phaseRef: owner.phaseRef,
      readLiveSettings: owner.readLiveSettings,
      targetSettings: target,
      preCommitCacheKey,
      waitForPublication: waitForPublication(owner),
      sleep: realSleep,
      settlePollMs: 5,
      cachePollMs: 5,
      settleTimeoutMs: 2000,
      cacheAdvanceTimeoutMs: 2000,
    });
    if (!result.ok) return false;
    // The dispatch fingerprint MUST be the advanced key, never the pre-commit key.
    if (result.dispatchFingerprint === preCommitCacheKey) return false;
    // REAL matchers: published settings and result must reproduce the candidate.
    const authoritative = owner.sharedRef.current.authoritative;
    if (!recommendationSettingsMatch(authoritative, { crossover: target.crossover, tuning: targetTuning })) return false;
    if (!recommendationResultMatches(owner.sharedRef.current.completedBassAuthority, expectedResult)) return false;
    return { fingerprint: result.dispatchFingerprint, levels: { p19: 4, primary: 3, secondary: 2 } };
  };
}

// ---------------------------------------------------------------------------
// 1. Success: settings settle, cacheKey advances, onCalculate dispatched with
//    the advanced fingerprint, publication matches, real matchers pass.
// ---------------------------------------------------------------------------
test("verify scheduling: success path captures advanced dispatch fingerprint", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after" });
  const verify = makeVerify(owner, { preCommitCacheKey: "cal:v1:before" });
  const out = await verify(after);
  assert.ok(out, "verify must succeed when settings settle and cacheKey advances");
  assert.equal(out.fingerprint, "cal:v1:after", "dispatch fingerprint must be the advanced key");
  assert.equal(owner.getOnCalculateCalls(), 1, "onCalculate called exactly once");
  assert.notEqual(owner.getDispatchFingerprint(), "cal:v1:before", "must not dispatch with the pre-commit key");
});

// ---------------------------------------------------------------------------
// 2. cacheKey never advances: helper returns ok:false reason "cacheKey-not-
//    advanced", onCalculate is NEVER called, no dispatch fingerprint.
// ---------------------------------------------------------------------------
test("verify scheduling: cacheKey-not-advanced blocks dispatch", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after", neverAdvance: true });
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef,
    phaseRef: owner.phaseRef,
    readLiveSettings: owner.readLiveSettings,
    targetSettings: after,
    preCommitCacheKey: "cal:v1:before",
    waitForPublication: waitForPublication(owner),
    sleep: realSleep,
    settlePollMs: 5,
    cachePollMs: 5,
    settleTimeoutMs: 2000,
    cacheAdvanceTimeoutMs: 80,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cacheKey-not-advanced");
  assert.equal(result.dispatchFingerprint, undefined, "no dispatch occurred");
  assert.equal(owner.getOnCalculateCalls(), 0, "onCalculate must not be called");
});

// ---------------------------------------------------------------------------
// 3. Settings never settle: ok:false reason "settings-not-settled".
// ---------------------------------------------------------------------------
test("verify scheduling: settings-not-settled blocks dispatch", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after", neverSettle: true });
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef,
    phaseRef: owner.phaseRef,
    readLiveSettings: owner.readLiveSettings,
    targetSettings: after,
    preCommitCacheKey: "cal:v1:before",
    waitForPublication: waitForPublication(owner),
    sleep: realSleep,
    settlePollMs: 5,
    cachePollMs: 5,
    settleTimeoutMs: 80,
    cacheAdvanceTimeoutMs: 2000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "settings-not-settled");
  assert.equal(owner.getOnCalculateCalls(), 0);
});

// ---------------------------------------------------------------------------
// 4. Publication timeout: dispatch happened but publication never landed.
// ---------------------------------------------------------------------------
test("verify scheduling: publication-timeout reports dispatch fingerprint", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after", calcMs: 5000 });
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef,
    phaseRef: owner.phaseRef,
    readLiveSettings: owner.readLiveSettings,
    targetSettings: after,
    preCommitCacheKey: "cal:v1:before",
    waitForPublication: async () => false,
    sleep: realSleep,
    settlePollMs: 5,
    cachePollMs: 5,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "publication-timeout");
  assert.equal(result.dispatchFingerprint, "cal:v1:after", "dispatch fingerprint captured at dispatch");
  assert.equal(owner.getOnCalculateCalls(), 1);
});

// ---------------------------------------------------------------------------
// 5. Cancel during cacheKey wait aborts with reason "cancelled".
// ---------------------------------------------------------------------------
test("verify scheduling: cancel during cache wait returns cancelled", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after", neverAdvance: true, settleMs: 5 });
  let ticks = 0;
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef,
    phaseRef: owner.phaseRef,
    readLiveSettings: owner.readLiveSettings,
    targetSettings: after,
    preCommitCacheKey: "cal:v1:before",
    waitForPublication: waitForPublication(owner),
    sleep: async (ms) => { ticks += 1; if (ticks >= 3) owner.phaseRef.current = "cancelled"; await realSleep(ms); },
    settlePollMs: 5,
    cachePollMs: 5,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cancelled");
});

// ---------------------------------------------------------------------------
// 6. Restore path: the same advancement wait applies. The cacheKey must
//    advance from the post-apply key back to a restored key before onCalculate.
// ---------------------------------------------------------------------------
test("verify scheduling: restore path waits for cacheKey advancement too", async () => {
  // After a failed apply, restore sets live settings back to `before`; the
  // owner's cacheKey must advance from the after key back to a before-restore key.
  const owner = makeOwner({
    preCommitCacheKey: "cal:v1:after",
    advanceTo: "cal:v1:restore",
    settleTo: before,
    publishSettings: buildAuthoritativeSettings(beforeInstances, beforeCrossover),
    publishResult: expectedResult,
  });
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef,
    phaseRef: owner.phaseRef,
    readLiveSettings: owner.readLiveSettings,
    targetSettings: before,
    preCommitCacheKey: "cal:v1:after",
    waitForPublication: waitForPublication(owner),
    sleep: realSleep,
    settlePollMs: 5,
    cachePollMs: 5,
  });
  assert.equal(result.ok, true);
  assert.equal(result.dispatchFingerprint, "cal:v1:restore", "restore dispatch uses the restored advanced key");
  assert.notEqual(result.dispatchFingerprint, "cal:v1:after");
  assert.equal(owner.getOnCalculateCalls(), 1);
});

// ---------------------------------------------------------------------------
// 7. Intervening design change: cacheKey advances to an INTRUDER key. The
//    helper dispatches onCalculate for the intruder fingerprint (it only checks
//    the key advanced, not that it matches a target), but the REAL matchers
//    reject the published intruder settings/result → verify returns false.
// ---------------------------------------------------------------------------
test("verify scheduling: intervening design change rejected by real matchers", async () => {
  const intruderSettings = buildAuthoritativeSettings(
    beforeInstances.map((s, i) => ({ ...s, delayMs: 9, phaseControlDeg: 33, polarity: -1 })),
    { ...afterCrossover, frequencyHz: 70 },
  );
  const owner = makeOwner({
    preCommitCacheKey: "cal:v1:before",
    advanceTo: "cal:v2:intruder",
    publishSettings: intruderSettings,
  });
  const verify = makeVerify(owner, { preCommitCacheKey: "cal:v1:before" });
  const out = await verify(after);
  assert.equal(out, false, "intruder design must be rejected by the real settings/result matchers");
  assert.equal(owner.getDispatchFingerprint(), "cal:v2:intruder", "dispatch happened for the intruder key");
});

// ---------------------------------------------------------------------------
// 8. Full transaction: executeElectronicTransaction with verify using the real
//    helper + real matchers succeeds and commits the verified receipt.
// ---------------------------------------------------------------------------
test("executeElectronicTransaction: real verify succeeds and commits verified", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after" });
  const preCommitCacheKey = "cal:v1:before";
  let saved = clone(before);
  let live = clone(before);
  const events = [];
  const receipt = { runId: "run1", before, after };
  const io = {
    guard: () => true,
    persist: async (settings, r) => { events.push("save:" + r.status); saved = { ...clone(settings), receipt: clone(r) }; },
    readback: async () => clone(saved),
    commit: (settings, r) => { events.push("commit:" + r.status); live = clone(settings); },
    verify: makeVerify(owner, { preCommitCacheKey }),
  };
  const result = await executeElectronicTransaction({ ...io, before, after, receipt });
  assert.equal(result.status, "verified");
  assert.equal(result.resultFingerprint, "cal:v1:after");
  assert.deepEqual(saved.instances, after.instances);
  assert.ok(events.includes("commit:verified"));
});

// ---------------------------------------------------------------------------
// 9. Full transaction with intervening design change: verify returns false,
//    transaction restores prior settings (and runs the restore verify, which
//    uses the same helper for the before settings).
// ---------------------------------------------------------------------------
test("executeElectronicTransaction: intervening change restores prior settings", async () => {
  const intruderSettings = buildAuthoritativeSettings(
    beforeInstances.map((s) => ({ ...s, delayMs: 9, phaseControlDeg: 33, polarity: -1 })),
    { ...afterCrossover, frequencyHz: 70 },
  );
  const owner = makeOwner({
    preCommitCacheKey: "cal:v1:before",
    advanceTo: "cal:v2:intruder",
    publishSettings: intruderSettings,
  });
  const preCommitCacheKey = "cal:v1:before";
  let saved = clone(before);
  let live = clone(before);
  const events = [];
  const receipt = { runId: "run2", before, after };
  // For the restore verify, the owner must advance to a restored key and
  // publish the before settings/result. Re-configure the owner on restore.
  const applyVerify = makeVerify(owner, { preCommitCacheKey });
  const io = {
    guard: () => true,
    persist: async (settings, r) => { events.push("save:" + r.status); saved = { ...clone(settings), receipt: clone(r) }; },
    readback: async () => clone(saved),
    commit: (settings, r) => { events.push("commit:" + r.status); live = clone(settings); },
    verify: async (settings, isRestore) => {
      if (isRestore) {
        // Switch the owner to restore-mode advancement.
        owner.sharedRef.current.cacheKey = "cal:v1:before";
        setTimeout(() => { owner.sharedRef.current.cacheKey = "cal:v1:restore"; }, 10);
        setTimeout(() => { owner.readLiveSettings = () => clone(before); }, 5);
        // Publish the before settings on the next dispatch.
        const restoreResult = await verifyRecalculationScheduling({
          sharedRef: owner.sharedRef,
          phaseRef: owner.phaseRef,
          readLiveSettings: () => clone(before),
          targetSettings: before,
          preCommitCacheKey: "cal:v1:before",
          waitForPublication: waitForPublication(owner),
          sleep: realSleep,
          settlePollMs: 5,
          cachePollMs: 5,
        });
        return result(okFallbackRestore(result, owner));
      }
      return applyVerify(settings);
    },
  };
  function result(r, o) {
    return r.ok && recommendationSettingsMatch(o.sharedRef.current.authoritative, { crossover: before.crossover, tuning: beforeTuning })
      ? { fingerprint: r.dispatchFingerprint, levels: { p19: 4 } }
      : false;
  }
  function okFallbackRestore(r, o) {
    // Restore verify need not reproduce a candidate; a successful scheduling
    // with matching before-settings is sufficient.
    return r.ok && recommendationSettingsMatch(o.sharedRef.current.authoritative, { crossover: before.crossover, tuning: beforeTuning })
      ? { fingerprint: r.dispatchFingerprint, levels: { p19: 4 } }
      : false;
  }
  await assert.rejects(() => executeElectronicTransaction({ ...io, before, after, receipt }));
  assert.deepEqual(saved.instances, before.instances, "saved restored to before");
  assert.deepEqual(saved.crossover, before.crossover);
  assert.deepEqual(live, before, "live restored to before");
  assert.ok(!events.includes("commit:verified"));
});

// ---------------------------------------------------------------------------
// 10. Sanity: the real matchers behave as expected on matching/mismatched
//     inputs (guard against accidental matcher regression).
// ---------------------------------------------------------------------------
test("matchers: recommendationSettingsMatch matching and mismatching", () => {
  const matching = buildAuthoritativeSettings(afterInstances, afterCrossover);
  assert.equal(recommendationSettingsMatch(matching, { crossover: afterCrossover, tuning: afterTuning }), true);
  const wrongTuning = afterTuning.map((t, i) => i === 0 ? { ...t, delayMs: 99 } : t);
  assert.equal(recommendationSettingsMatch(matching, { crossover: afterCrossover, tuning: wrongTuning }), false);
  assert.equal(recommendationSettingsMatch(null, { crossover: afterCrossover, tuning: afterTuning }), false);
});

test("matchers: recommendationResultMatches matching and mismatching", () => {
  const matching = buildAuthority("cal:v1:after");
  assert.equal(recommendationResultMatches(matching, expectedResult), true);
  const mismatch = buildAuthority("cal:v1:after", { p14Db: 999 });
  assert.equal(recommendationResultMatches(mismatch, expectedResult), false);
  assert.equal(recommendationResultMatches(null, expectedResult), false);
});