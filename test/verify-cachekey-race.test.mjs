import test from "node:test";
import assert from "node:assert/strict";

// ACTUAL production helpers under test.
import { verifyRecalculationScheduling } from "../src/components/room/bass/optimiseWorkflow/verifyRecalculationScheduling.js";
import { executeElectronicTransaction, settingsEqual, clone, stable } from "../src/components/room/bass/optimiseWorkflow/electronicApplication.js";
import { recommendationSettingsMatch, recommendationResultMatches } from "../src/components/room/bass/optimiseWorkflow/crossoverApplicationVerification.js";

// ---------------------------------------------------------------------------
// Verify the cacheKey scheduling race via the REAL verifyRecalculationScheduling
// helper plus the REAL recommendationSettingsMatch / recommendationResultMatches
// matchers. The helper:
//  - waits for live settings to settle to the committed target (identity guard
//    every poll);
//  - waits for the bass owner's cacheKey to advance PAST THE PER-COMMIT
//    pre-commit key (captured immediately before THIS commit, not once before
//    the transaction), with canCalculate true AND the authoritative settings
//    ingested (real recommendationSettingsMatch, so a geometry/cache advance
//    cannot masquerade as the requested electronic change);
//  - captures the dispatch fingerprint AT DISPATCH and, after publication,
//    requires result/currentJob/cacheKey to ALL equal it;
//  - handles canCalculate false / null key / blocked dispatch / authoritative
//    mismatch / publication fingerprint mismatch as explicit structured
//    failures (no fall-through after timeout);
//  - supports a no-op commit (before === after) without waiting for a cacheKey
//    that will not advance.
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

const expectedResult = {
  achievedP19VariationDb: 0,
  achievedP20VariationDb: 3,
  p14AchievedDb: 117,
  achievedP18Hz: 20,
  perSeatP20: [{ seatId: "seat-1", isPrimary: true, variationDbRaw: 3 }],
};

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
 * Bass-owner simulator. Live settings settle to `settleTo` after `settleMs`;
 * the owner's cacheKey advances from `preCommitCacheKey` to `advanceTo` after
 * `advanceMs`; the authoritative bass context ingests the settled tuning after
 * `authoritativeSettleMs` (default = advanceMs, modelling the bass owner
 * recomputing authoritative from the settled live instances; a larger value
 * models a delayed authoritative tuning); onCalculate captures its dispatch
 * fingerprint (state.cacheKey at call time) and publishes a result for that
 * fingerprint after `calcMs`, with authoritative and result drawn from
 * `publishSettings`/`publishResult`.
 */
function makeOwner({
  preCommitCacheKey = "cal:v1:before",
  advanceTo = "cal:v1:after",
  settleTo = after,
  authoritativeSettleTo,
  publishSettings,
  publishResult = expectedResult,
  settleMs = 10,
  advanceMs = 20,
  authoritativeSettleMs,
  calcMs = 15,
  canCalculate = true,
  neverAdvance = false,
  neverSettle = false,
  neverAuthoritativeSettle = false,
  initialAuthority = null,
  dispatchBlocked = false,
}) {
  const authSettleTo = authoritativeSettleTo || buildAuthoritativeSettings(settleTo.instances || settleTo.instances, settleTo.crossover);
  const pubSettings = publishSettings || authSettleTo;
  const state = {
    cacheKey: preCommitCacheKey,
    canCalculate,
    completedBassAuthority: initialAuthority || { authorityStatus: "UPDATING", contract: { job: { status: "updating" } } },
    authoritative: clone(initialAuthority ? buildAuthoritativeSettings(beforeInstances, beforeCrossover) : buildAuthoritativeSettings(beforeInstances, beforeCrossover)),
    onCalculate: null,
  };
  let liveSettings = clone(before);
  let dispatchFingerprint = null;
  let onCalculateCalls = 0;
  let calcTimer = null;
  state.onCalculate = () => {
    onCalculateCalls += 1;
    dispatchFingerprint = state.cacheKey; // capture AT DISPATCH
    if (dispatchBlocked) return { action: "blocked" };
    if (calcTimer) clearTimeout(calcTimer);
    calcTimer = setTimeout(() => {
      state.completedBassAuthority = buildAuthority(dispatchFingerprint, publishResult);
      state.authoritative = clone(pubSettings);
    }, calcMs);
    return { requestId: "req-" + onCalculateCalls, fingerprint: dispatchFingerprint };
  };
  if (!neverSettle) setTimeout(() => { liveSettings = clone(settleTo); }, settleMs);
  if (!neverAdvance) setTimeout(() => { state.cacheKey = advanceTo; }, advanceMs);
  if (!neverAuthoritativeSettle) setTimeout(() => { state.authoritative = clone(authSettleTo); }, authoritativeSettleMs ?? advanceMs);
  return {
    sharedRef: { current: state },
    phaseRef: { current: "idle" },
    readLiveSettings: () => liveSettings,
    setLiveSettings: (s) => { liveSettings = clone(s); },
    setCacheKey: (k) => { state.cacheKey = k; },
    setAuthoritative: (a) => { state.authoritative = clone(a); },
    getDispatchFingerprint: () => dispatchFingerprint,
    getOnCalculateCalls: () => onCalculateCalls,
  };
}

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
// Mirrors performElectronicUpdate.verify: per-commit preCommitKeyRef, identity
// guard, authoritative-settings match before dispatch, no-op handling, and
// separate restoring diagnostics.
function makeVerify(owner, { preCommitKeyRef, isRestore = false, expected = expectedResult, identityGuard } = {}) {
  return async (settings, restoring = false) => {
    const target = settings;
    const targetTuning = restoring ? beforeTuning : afterTuning;
    const result = await verifyRecalculationScheduling({
      sharedRef: owner.sharedRef,
      phaseRef: owner.phaseRef,
      readLiveSettings: owner.readLiveSettings,
      targetSettings: target,
      preCommitCacheKey: preCommitKeyRef ? preCommitKeyRef.current : (isRestore ? "cal:v1:after" : "cal:v1:before"),
      identityGuard: identityGuard || (() => true),
      authoritativeSettingsMatch: () => recommendationSettingsMatch(owner.sharedRef.current?.authoritative, { crossover: target.effectiveCrossover || target.crossover, tuning: targetTuning }),
      noOp: settingsEqual(before, after),
      waitForPublication: waitForPublication(owner),
      sleep: realSleep,
      settlePollMs: 5,
      cachePollMs: 5,
      settleTimeoutMs: 2000,
      cacheAdvanceTimeoutMs: 2000,
    });
    if (!result.ok) return false;
    if (result.dispatchFingerprint === (preCommitKeyRef ? preCommitKeyRef.current : null) && !result.noOp) return false;
    const authoritative = owner.sharedRef.current.authoritative;
    if (!recommendationSettingsMatch(authoritative, { crossover: target.crossover, tuning: targetTuning })) return false;
    if (!recommendationResultMatches(owner.sharedRef.current.completedBassAuthority, expected)) return false;
    return { fingerprint: result.dispatchFingerprint, levels: { p19: 4, primary: 3, secondary: 2 } };
  };
}

// ---------------------------------------------------------------------------
// 1. Success: settings settle, cacheKey advances, authoritative ingests the
//    tuning, onCalculate dispatched with the advanced fingerprint, publication
//    matches, real matchers pass.
// ---------------------------------------------------------------------------
test("verify scheduling: success path captures advanced dispatch fingerprint", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after" });
  const verify = makeVerify(owner, { preCommitKeyRef: { current: "cal:v1:before" } });
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
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: after, preCommitCacheKey: "cal:v1:before",
    identityGuard: () => true,
    authoritativeSettingsMatch: () => recommendationSettingsMatch(owner.sharedRef.current?.authoritative, { crossover: after.crossover, tuning: afterTuning }),
    waitForPublication: waitForPublication(owner), sleep: realSleep,
    settlePollMs: 5, cachePollMs: 5, settleTimeoutMs: 2000, cacheAdvanceTimeoutMs: 80,
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
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: after, preCommitCacheKey: "cal:v1:before",
    identityGuard: () => true,
    authoritativeSettingsMatch: () => true,
    waitForPublication: waitForPublication(owner), sleep: realSleep,
    settlePollMs: 5, cachePollMs: 5, settleTimeoutMs: 80, cacheAdvanceTimeoutMs: 2000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "settings-not-settled");
  assert.equal(owner.getOnCalculateCalls(), 0);
});

// ---------------------------------------------------------------------------
// 4. canCalculate false after cacheKey advanced: explicit "cannot-calculate",
//    no fall-through to dispatch.
// ---------------------------------------------------------------------------
test("verify scheduling: canCalculate false reports cannot-calculate (no fall-through)", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after", canCalculate: false });
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: after, preCommitCacheKey: "cal:v1:before",
    identityGuard: () => true,
    authoritativeSettingsMatch: () => true,
    waitForPublication: waitForPublication(owner), sleep: realSleep,
    settlePollMs: 5, cachePollMs: 5, settleTimeoutMs: 2000, cacheAdvanceTimeoutMs: 80,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cannot-calculate", "must not fall through to dispatch");
  assert.equal(owner.getOnCalculateCalls(), 0);
});

// ---------------------------------------------------------------------------
// 5. Blocked dispatch: onCalculate returns {action:"blocked"} → explicit
//    "dispatch-blocked" failure.
// ---------------------------------------------------------------------------
test("verify scheduling: blocked dispatch reports dispatch-blocked", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after", dispatchBlocked: true });
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: after, preCommitCacheKey: "cal:v1:before",
    identityGuard: () => true,
    authoritativeSettingsMatch: () => recommendationSettingsMatch(owner.sharedRef.current?.authoritative, { crossover: after.crossover, tuning: afterTuning }),
    waitForPublication: waitForPublication(owner), sleep: realSleep,
    settlePollMs: 5, cachePollMs: 5,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "dispatch-blocked");
  assert.equal(owner.getOnCalculateCalls(), 1);
});

// ---------------------------------------------------------------------------
// 6. Publication timeout: dispatch happened but publication never landed.
// ---------------------------------------------------------------------------
test("verify scheduling: publication-timeout reports dispatch fingerprint", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after", calcMs: 5000 });
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: after, preCommitCacheKey: "cal:v1:before",
    identityGuard: () => true,
    authoritativeSettingsMatch: () => recommendationSettingsMatch(owner.sharedRef.current?.authoritative, { crossover: after.crossover, tuning: afterTuning }),
    waitForPublication: async () => false, sleep: realSleep,
    settlePollMs: 5, cachePollMs: 5,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "publication-timeout");
  assert.equal(result.dispatchFingerprint, "cal:v1:after", "dispatch fingerprint captured at dispatch");
  assert.equal(owner.getOnCalculateCalls(), 1);
});

// ---------------------------------------------------------------------------
// 7. Cancel during cacheKey wait aborts with reason "cancelled".
// ---------------------------------------------------------------------------
test("verify scheduling: cancel during cache wait returns cancelled", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after", neverAdvance: true, settleMs: 5 });
  let ticks = 0;
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: after, preCommitCacheKey: "cal:v1:before",
    identityGuard: () => true,
    authoritativeSettingsMatch: () => true,
    waitForPublication: waitForPublication(owner),
    sleep: async (ms) => { ticks += 1; if (ticks >= 3) owner.phaseRef.current = "cancelled"; await realSleep(ms); },
    settlePollMs: 5, cachePollMs: 5,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cancelled");
});

// ---------------------------------------------------------------------------
// 8. Restore path: the same advancement wait applies, using the PER-COMMIT key
//    (the applied key), not the baseline.
// ---------------------------------------------------------------------------
test("verify scheduling: restore path waits for cacheKey advancement past the applied key", async () => {
  const owner = makeOwner({
    preCommitCacheKey: "cal:v1:after",
    advanceTo: "cal:v1:restore",
    settleTo: before,
    authoritativeSettleTo: buildAuthoritativeSettings(beforeInstances, beforeCrossover),
    publishSettings: buildAuthoritativeSettings(beforeInstances, beforeCrossover),
    publishResult: expectedResult,
  });
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: before, preCommitCacheKey: "cal:v1:after",
    identityGuard: () => true,
    authoritativeSettingsMatch: () => recommendationSettingsMatch(owner.sharedRef.current?.authoritative, { crossover: before.crossover, tuning: beforeTuning }),
    waitForPublication: waitForPublication(owner), sleep: realSleep,
    settlePollMs: 5, cachePollMs: 5,
  });
  assert.equal(result.ok, true);
  assert.equal(result.dispatchFingerprint, "cal:v1:restore", "restore dispatch uses the restored advanced key");
  assert.notEqual(result.dispatchFingerprint, "cal:v1:after");
  assert.equal(owner.getOnCalculateCalls(), 1);
});

// ---------------------------------------------------------------------------
// 9. Intervening design change (intruder cacheKey): the helper requires the
//    REAL recommendationSettingsMatch before dispatch, so an arbitrary
//    geometry/cache advance cannot masquerade as the requested electronic
//    change. onCalculate is NEVER called; the failure is
//    "authoritative-settings-mismatch".
// ---------------------------------------------------------------------------
test("verify scheduling: intervening design change rejected before dispatch (authoritative-settings-mismatch)", async () => {
  const intruderSettings = buildAuthoritativeSettings(
    beforeInstances.map((s, i) => ({ ...s, delayMs: 9, phaseControlDeg: 33, polarity: -1 })),
    { ...afterCrossover, frequencyHz: 70 },
  );
  const owner = makeOwner({
    preCommitCacheKey: "cal:v1:before",
    advanceTo: "cal:v2:intruder",
    authoritativeSettleTo: intruderSettings,
    publishSettings: intruderSettings,
  });
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: after, preCommitCacheKey: "cal:v1:before",
    identityGuard: () => true,
    authoritativeSettingsMatch: () => recommendationSettingsMatch(owner.sharedRef.current?.authoritative, { crossover: after.crossover, tuning: afterTuning }),
    waitForPublication: waitForPublication(owner), sleep: realSleep,
    settlePollMs: 5, cachePollMs: 5, settleTimeoutMs: 2000, cacheAdvanceTimeoutMs: 120,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "authoritative-settings-mismatch", "intruder rejected before dispatch by real settings match");
  assert.equal(owner.getOnCalculateCalls(), 0, "onCalculate must not be called for an intruder design");
  assert.equal(result.dispatchFingerprint, undefined);
});

// ---------------------------------------------------------------------------
// 10. Identity guard failure during a wait aborts with "identity-changed".
// ---------------------------------------------------------------------------
test("verify scheduling: identity guard failure returns identity-changed", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after", neverAdvance: true, settleMs: 5 });
  let ticks = 0;
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: after, preCommitCacheKey: "cal:v1:before",
    identityGuard: () => { ticks += 1; return ticks < 4; },
    authoritativeSettingsMatch: () => true,
    waitForPublication: waitForPublication(owner),
    sleep: realSleep, settlePollMs: 5, cachePollMs: 5,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "identity-changed");
  assert.equal(owner.getOnCalculateCalls(), 0);
});

// ---------------------------------------------------------------------------
// 11. Delayed authoritative tuning: cacheKey advances but the authoritative
//    context has not yet ingested the committed tuning. The helper WAITS for
//    authoritativeSettingsMatch before dispatching (no fall-through), then
//    dispatches once the tuning lands.
// ---------------------------------------------------------------------------
test("verify scheduling: delayed authoritative tuning waits then dispatches", async () => {
  const owner = makeOwner({
    preCommitCacheKey: "cal:v1:before",
    advanceTo: "cal:v1:after",
    settleMs: 5,
    advanceMs: 15,
    authoritativeSettleMs: 120, // authoritative lags the cacheKey advance
  });
  const verify = makeVerify(owner, { preCommitKeyRef: { current: "cal:v1:before" } });
  const out = await verify(after);
  assert.ok(out, "verify succeeds once the authoritative tuning settles");
  assert.equal(out.fingerprint, "cal:v1:after");
  assert.equal(owner.getOnCalculateCalls(), 1, "dispatched exactly once, after authoritative settled");
});

// ---------------------------------------------------------------------------
// 12. No-op commit (before === after): the helper confirms the EXISTING
//     published result is current for the current cacheKey and returns without
//     dispatching or waiting for advancement. onCalculate is NEVER called.
// ---------------------------------------------------------------------------
test("verify scheduling: no-op commit skips dispatch and confirms existing publication", async () => {
  const owner = makeOwner({
    preCommitCacheKey: "cal:noop",
    advanceTo: "cal:noop-should-not-advance",
    settleTo: before, // before === after for a no-op
    authoritativeSettleTo: buildAuthoritativeSettings(beforeInstances, beforeCrossover),
    initialAuthority: buildAuthority("cal:noop", expectedResult),
    neverAdvance: true,
  });
  const noOpBefore = { instances: clone(beforeInstances), crossover: clone(beforeCrossover) };
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: noOpBefore, preCommitCacheKey: "cal:noop",
    identityGuard: () => true,
    authoritativeSettingsMatch: () => recommendationSettingsMatch(owner.sharedRef.current?.authoritative, { crossover: before.crossover, tuning: beforeTuning }),
    noOp: true,
    waitForPublication: waitForPublication(owner), sleep: realSleep,
    settlePollMs: 5, cachePollMs: 5, settleTimeoutMs: 2000, cacheAdvanceTimeoutMs: 2000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.noOp, true);
  assert.equal(result.dispatchFingerprint, "cal:noop");
  assert.equal(owner.getOnCalculateCalls(), 0, "onCalculate must not be called for a no-op");
});

// ---------------------------------------------------------------------------
// 13. Publication fingerprint mismatch: publication lands for a DIFFERENT
//     fingerprint than the dispatch fingerprint (a mutable-newdesign slipped
//     in during the wait). Rejected with "publication-fingerprint-mismatch".
// ---------------------------------------------------------------------------
test("verify scheduling: publication fingerprint mismatch rejected", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after", calcMs: 30 });
  // waitForPublication returns true, but the published job's fingerprint is a
  // different design (the cacheKey moved on during the wait).
  const result = await verifyRecalculationScheduling({
    sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
    targetSettings: after, preCommitCacheKey: "cal:v1:before",
    identityGuard: () => true,
    authoritativeSettingsMatch: () => recommendationSettingsMatch(owner.sharedRef.current?.authoritative, { crossover: after.crossover, tuning: afterTuning }),
    waitForPublication: async () => {
      // Simulate a mutated design landing: published job fingerprints disagree
      // with the dispatch fingerprint, and the live cacheKey moved on.
      await realSleep(5);
      owner.sharedRef.current.completedBassAuthority = buildAuthority("cal:v2:moved");
      owner.sharedRef.current.cacheKey = "cal:v2:moved";
      return true;
    },
    sleep: realSleep, settlePollMs: 5, cachePollMs: 5,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "publication-fingerprint-mismatch");
  assert.equal(result.dispatchFingerprint, "cal:v1:after");
  assert.equal(result.resultFingerprint, "cal:v2:moved");
  assert.equal(result.currentCacheKey, "cal:v2:moved");
});

// ---------------------------------------------------------------------------
// 14. Per-commit preCommitCacheKey: baseline→candidate→baseline restore. The
//     restore verify must wait past the APPLIED (candidate) key, not the
//     baseline key captured once before the transaction. A single key captured
//     once would wait for baseline !== baseline forever, or dispatch on the
//     still-applied candidate before rollback settles.
// ---------------------------------------------------------------------------
test("per-commit preCommitCacheKey: restore verify uses the applied key, not the baseline", async () => {
  // Mimic performElectronicUpdate: a preCommitKeyRef captured inside commit(),
  // and a verify that reads it. Apply fails (mismatched result) so the
  // transaction rolls back; the restore verify must then wait past the applied
  // key ("cal:cand") to the restored key ("cal:restored").
  const owner = makeOwner({
    preCommitCacheKey: "cal:base",
    advanceTo: "cal:cand",
    settleTo: after,
    publishResult: { ...expectedResult, p14AchievedDb: 999 }, // apply verify fails result match
  });
  const preCommitKeyRef = { current: "cal:base" };
  let saved = clone(before);
  let live = clone(before);
  const events = [];
  const receipt = { runId: "run-pc", before, after };
  const applyVerify = makeVerify(owner, { preCommitKeyRef, expected: { ...expectedResult, p14AchievedDb: 999 } });
  const restoreVerify = async () => {
    // Reconfigure the owner for the rollback: live settings return to before,
    // the cacheKey is the applied key, and it must advance to the restored key.
    owner.setLiveSettings(before);
    owner.setCacheKey("cal:cand");
    owner.setAuthoritative(buildAuthoritativeSettings(beforeInstances, beforeCrossover));
    setTimeout(() => { owner.setCacheKey("cal:restored"); }, 10);
    setTimeout(() => { owner.setAuthoritative(buildAuthoritativeSettings(beforeInstances, beforeCrossover)); }, 12);
    // The restore verify reads preCommitKeyRef.current — which commit(before)
    // captured as the applied key ("cal:cand"), proving per-commit capture.
    const r = await verifyRecalculationScheduling({
      sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
      targetSettings: before, preCommitCacheKey: preCommitKeyRef.current,
      identityGuard: () => true,
      authoritativeSettingsMatch: () => recommendationSettingsMatch(owner.sharedRef.current?.authoritative, { crossover: before.crossover, tuning: beforeTuning }),
      noOp: false,
      waitForPublication: waitForPublication(owner), sleep: realSleep,
      settlePollMs: 5, cachePollMs: 5,
    });
    return r.ok ? { fingerprint: r.dispatchFingerprint } : false;
  };
  const io = {
    guard: () => true,
    persist: async (settings, r) => { events.push("save:" + r.status); saved = { ...clone(settings), receipt: clone(r) }; },
    readback: async () => clone(saved),
    commit: (settings, r) => {
      events.push("commit:" + r.status);
      // Capture the cacheKey immediately before the mutation (per-commit).
      preCommitKeyRef.current = owner.sharedRef.current?.cacheKey || null;
      live = clone(settings);
      // Apply commit: owner advances cacheKey to the candidate key.
      if (settingsEqual(settings, after)) setTimeout(() => { owner.setCacheKey("cal:cand"); }, 8);
      // Restore commit: owner advances cacheKey to the restored key.
      if (settingsEqual(settings, before)) setTimeout(() => { owner.setCacheKey("cal:restored"); }, 8);
    },
    verify: async (settings, isRestore) => (isRestore ? restoreVerify() : applyVerify(settings)),
  };
  await assert.rejects(() => executeElectronicTransaction({ ...io, before, after, receipt }));
  assert.deepEqual(saved.instances, before.instances, "saved restored to before");
  // The restore verify dispatched on the RESTORED key, not the applied key.
  assert.equal(owner.getDispatchFingerprint(), "cal:restored", "restore must dispatch on the restored advanced key");
  assert.notEqual(owner.getDispatchFingerprint(), "cal:cand", "must not dispatch on the still-applied candidate key");
  // Per-commit capture: the last commit captured the applied key, not the baseline.
  assert.equal(preCommitKeyRef.current, "cal:cand", "commit(before) captured the applied key, not the baseline");
});

// ---------------------------------------------------------------------------
// 15. Full transaction: executeElectronicTransaction with verify using the real
//     helper + real matchers succeeds and commits the verified receipt.
// ---------------------------------------------------------------------------
test("executeElectronicTransaction: real verify succeeds and commits verified", async () => {
  const owner = makeOwner({ preCommitCacheKey: "cal:v1:before", advanceTo: "cal:v1:after" });
  const preCommitKeyRef = { current: "cal:v1:before" };
  let saved = clone(before);
  let live = clone(before);
  const events = [];
  const receipt = { runId: "run1", before, after };
  const io = {
    guard: () => true,
    persist: async (settings, r) => { events.push("save:" + r.status); saved = { ...clone(settings), receipt: clone(r) }; },
    readback: async () => clone(saved),
    commit: (settings, r) => { events.push("commit:" + r.status); preCommitKeyRef.current = owner.sharedRef.current?.cacheKey || null; live = clone(settings); },
    verify: makeVerify(owner, { preCommitKeyRef }),
  };
  const result = await executeElectronicTransaction({ ...io, before, after, receipt });
  assert.equal(result.status, "verified");
  assert.equal(result.resultFingerprint, "cal:v1:after");
  assert.deepEqual(saved.instances, after.instances);
  assert.ok(events.includes("commit:verified"));
});

// ---------------------------------------------------------------------------
// 16. Full transaction with intervening design change: verify returns false,
//     transaction restores prior settings (and runs the restore verify, which
//     uses the same helper for the before settings).
// ---------------------------------------------------------------------------
test("executeElectronicTransaction: intervening change restores prior settings", async () => {
  const intruderSettings = buildAuthoritativeSettings(
    beforeInstances.map((s) => ({ ...s, delayMs: 9, phaseControlDeg: 33, polarity: -1 })),
    { ...afterCrossover, frequencyHz: 70 },
  );
  const owner = makeOwner({
    preCommitCacheKey: "cal:v1:before",
    advanceTo: "cal:v2:intruder",
    authoritativeSettleTo: intruderSettings,
    publishSettings: intruderSettings,
  });
  const preCommitKeyRef = { current: "cal:v1:before" };
  let saved = clone(before);
  let live = clone(before);
  const events = [];
  const receipt = { runId: "run2", before, after };
  const applyVerify = makeVerify(owner, { preCommitKeyRef });
  const restoreVerify = async () => {
    owner.setLiveSettings(before);
    owner.setCacheKey("cal:v1:before");
    owner.setAuthoritative(buildAuthoritativeSettings(beforeInstances, beforeCrossover));
    setTimeout(() => { owner.setCacheKey("cal:v1:restore"); }, 10);
    setTimeout(() => { owner.setAuthoritative(buildAuthoritativeSettings(beforeInstances, beforeCrossover)); }, 12);
    const r = await verifyRecalculationScheduling({
      sharedRef: owner.sharedRef, phaseRef: owner.phaseRef, readLiveSettings: owner.readLiveSettings,
      targetSettings: before, preCommitCacheKey: preCommitKeyRef.current,
      identityGuard: () => true,
      authoritativeSettingsMatch: () => recommendationSettingsMatch(owner.sharedRef.current?.authoritative, { crossover: before.crossover, tuning: beforeTuning }),
      noOp: false,
      waitForPublication: waitForPublication(owner), sleep: realSleep,
      settlePollMs: 5, cachePollMs: 5,
    });
    if (!r.ok) return false;
    if (!recommendationSettingsMatch(owner.sharedRef.current.authoritative, { crossover: before.crossover, tuning: beforeTuning })) return false;
    return { fingerprint: r.dispatchFingerprint, levels: { p19: 4 } };
  };
  const io = {
    guard: () => true,
    persist: async (settings, r) => { events.push("save:" + r.status); saved = { ...clone(settings), receipt: clone(r) }; },
    readback: async () => clone(saved),
    commit: (settings, r) => { events.push("commit:" + r.status); preCommitKeyRef.current = owner.sharedRef.current?.cacheKey || null; live = clone(settings); },
    verify: async (settings, isRestore) => (isRestore ? restoreVerify() : applyVerify(settings)),
  };
  await assert.rejects(() => executeElectronicTransaction({ ...io, before, after, receipt }));
  assert.deepEqual(saved.instances, before.instances, "saved restored to before");
  assert.deepEqual(saved.crossover, before.crossover);
  assert.deepEqual(live, before, "live restored to before");
  assert.ok(!events.includes("commit:verified"));
});

// ---------------------------------------------------------------------------
// 17. Sanity: the real matchers behave as expected on matching/mismatched
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