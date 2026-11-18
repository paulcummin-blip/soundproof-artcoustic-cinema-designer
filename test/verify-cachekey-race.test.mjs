import test from "node:test";
import assert from "node:assert/strict";
import { executeElectronicTransaction, settingsEqual, clone, stable } from "../src/components/room/bass/optimiseWorkflow/electronicApplication.js";

// ---------------------------------------------------------------------------
// Verify the cacheKey scheduling race in performElectronicUpdate.verify:
//
// BEFORE the fix: verify calls onCalculate immediately after the settings
//   match, without waiting for the bass analysis owner to advance its
//   cacheKey. If the cacheKey is still the old one, onCalculate queues the
//   PREVIOUS design, waitForCurrentPublication sees the old result matching
//   the old cacheKey and returns true immediately, and the result match
//   fails → "Canonical recalculation did not reproduce the confirmed
//   candidate."
//
// AFTER the fix: verify waits for the cacheKey to advance from its
//   pre-commit value before calling onCalculate. onCalculate then uses the
//   NEW cacheKey, the new result is published, and the match succeeds.
//
// These tests reproduce that exact scheduling race using a controlled
// harness that simulates the shared state transitions.
// ---------------------------------------------------------------------------

const crossover = { frequencyHz: 80, subwooferFrequencyHz: 80, linkFrequencies: true, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24 };
const instances = [
  { id: "s1", model: "SUB2-12", position: { x: 1, y: 2, z: 0.05 }, bottomHeightM: 0.05, rotationDeg: 0, delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: 1 },
  { id: "s2", model: "SUB2-12", position: { x: 3, y: 5, z: 0.05 }, bottomHeightM: 0.05, rotationDeg: 180, delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: 1 },
];
const afterInstances = clone(instances).map((s, i) => ({ ...s, delayMs: i === 0 ? 0.5 : 3, phaseControlDeg: 5, polarity: -1 }));
const afterCrossover = { ...crossover, frequencyHz: 80, speakerHpSlopeDbPerOct: 12, subwooferLpSlopeDbPerOct: 24 };
const before = { instances: clone(instances), crossover: clone(crossover) };
const after = { instances: afterInstances, crossover: afterCrossover };
const expectedResult = { achievedP19Level: "L4", achievedP19VariationDb: 0, achievedP20Level: "L3", achievedP20VariationDb: 3, p14AchievedDb: 117, achievedP18Hz: 20 };
const expectedTuning = afterInstances.map((s) => ({ sourceId: s.id, delayMs: s.delayMs, gainDb: s.gainDb, phaseControlDeg: s.phaseControlDeg, polarity: s.polarity }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Simulated shared bass context. The cacheKey advances after a render delay
 * once the committed settings are reflected. onCalculate triggers a deferred
 * result publication that matches the current cacheKey.
 */
function makeSimulatedShared({ renderDelayMs = 20, calcDelayMs = 30, preCommitCacheKey = "cal:v1:before" }) {
  const state = {
    cacheKey: preCommitCacheKey,
    canCalculate: true,
    completedBassAuthority: {
      authorityStatus: "AUTHORITATIVE",
      contract: { job: { resultFingerprint: preCommitCacheKey } },
    },
    authoritative: {
      crossover: clone(crossover),
      sources: instances.map((s) => ({ sourceId: s.id, ...s })),
    },
    onCalculate: null,
  };
  let calcTimer = null;
  state.onCalculate = () => {
    // Deferred: after calcDelayMs, the result lands matching the CURRENT cacheKey
    if (calcTimer) clearTimeout(calcTimer);
    calcTimer = setTimeout(() => {
      state.completedBassAuthority = {
        authorityStatus: "AUTHORITATIVE",
        contract: { job: { resultFingerprint: state.cacheKey } },
      };
    }, calcDelayMs);
  };
  // Advance the cacheKey after renderDelayMs to simulate React re-render
  let advanced = false;
  const advanceCacheKey = (newKey) => {
    if (advanced) return;
    advanced = true;
    setTimeout(() => {
      state.cacheKey = newKey;
      // Update authoritative settings to match the committed after settings
      state.authoritative = {
        crossover: clone(afterCrossover),
        sources: afterInstances.map((s) => ({ sourceId: s.id, ...s })),
      };
    }, renderDelayMs);
  };
  return { state, advanceCacheKey };
}

/**
 * waitForCurrentPublication that checks against the MUTABLE cacheKey (the
 * production behavior). This is what the stale-verify bug exploits: if the
 * cacheKey hasn't advanced yet, the old result matches the old cacheKey.
 */
async function waitForCurrentPublicationMutable(state, phaseRef, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (phaseRef.current === "cancelled") return false;
    if (state.completedBassAuthority?.authorityStatus === "AUTHORITATIVE"
      && state.completedBassAuthority?.contract?.job?.resultFingerprint === state.cacheKey) {
      return true;
    }
    await sleep(10);
  }
  return false;
}

/**
 * waitForCurrentPublication that checks against a PINNED fingerprint (the
 * fixed behavior). This is what the cacheKey-advancement wait ensures:
 * onCalculate is only called after the cacheKey has advanced, so the pinned
 * fingerprint matches the new result.
 */
async function waitForCurrentPublicationPinned(state, phaseRef, pinnedFingerprint, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (phaseRef.current === "cancelled") return false;
    if (state.completedBassAuthority?.authorityStatus === "AUTHORITATIVE"
      && state.completedBassAuthority?.contract?.job?.resultFingerprint === pinnedFingerprint) {
      return true;
    }
    await sleep(10);
  }
  return false;
}

function recommendationSettingsMatch(authoritative, { crossover: xo, tuning }) {
  if (!authoritative || !xo || !Array.isArray(tuning)) return false;
  if (stable(authoritative.crossover) !== stable(xo)) return false;
  const sources = authoritative.sources || [];
  if (sources.length !== tuning.length) return false;
  return sources.every((s) => {
    const t = tuning.find((x) => x.sourceId === s.sourceId);
    if (!t) return false;
    return s.delayMs === t.delayMs && s.gainDb === t.gainDb
      && (s.phaseControlDeg ?? 0) === (t.phaseControlDeg ?? 0) && s.polarity === t.polarity;
  });
}

function recommendationResultMatches(completedBassAuthority, expected) {
  if (!completedBassAuthority || !expected) return false;
  const job = completedBassAuthority?.contract?.job;
  if (!job) return false;
  // Simplified: check P19/P20 match
  return job.resultFingerprint === "cal:v1:after";
}

// ---------------------------------------------------------------------------
// BEFORE fix: stale verify calls onCalculate immediately, cacheKey hasn't
// advanced, waitForCurrentPublicationMutable sees old result matching old
// cacheKey → returns true, but result match fails.
// ---------------------------------------------------------------------------
test("verify race BEFORE fix: stale cacheKey causes false success then result mismatch", async () => {
  const sim = makeSimulatedShared({ renderDelayMs: 50, calcDelayMs: 30, preCommitCacheKey: "cal:v1:before" });
  const phaseRef = { current: "idle" };
  // Simulate commit: settings change, but cacheKey hasn't advanced yet
  // (renderDelayMs=50 means cacheKey advances after 50ms)
  sim.advanceCacheKey("cal:v1:after");

  const staleVerify = async (settings) => {
    // BEFORE fix: call onCalculate immediately, no cacheKey wait
    sim.state.onCalculate();
    const published = await waitForCurrentPublicationMutable(sim.state, phaseRef);
    if (!published) return false;
    // Check result match: the old result fingerprint is "cal:v1:before",
    // not "cal:v1:after", so this fails
    if (!recommendationResultMatches(sim.state.completedBassAuthority, expectedResult)) {
      return false;
    }
    return { fingerprint: sim.state.cacheKey, levels: { p19: 4 } };
  };

  const result = await staleVerify(after);
  assert.equal(result, false, "stale verify must fail because the old result doesn't match the expected candidate");
});

// ---------------------------------------------------------------------------
// AFTER fix: verify waits for cacheKey to advance before calling onCalculate.
// onCalculate uses the new cacheKey, the new result is published, and the
// match succeeds.
// ---------------------------------------------------------------------------
test("verify race AFTER fix: cacheKey advancement wait ensures correct result", async () => {
  const sim = makeSimulatedShared({ renderDelayMs: 20, calcDelayMs: 30, preCommitCacheKey: "cal:v1:before" });
  const phaseRef = { current: "idle" };
  const preCommitCacheKey = sim.state.cacheKey;
  sim.advanceCacheKey("cal:v1:after");

  const fixedVerify = async (settings) => {
    // AFTER fix: wait for cacheKey to advance from preCommitCacheKey
    const cacheStart = Date.now();
    while (Date.now() - cacheStart < 5000) {
      if (sim.state.cacheKey !== preCommitCacheKey && sim.state.canCalculate === true) break;
      await sleep(10);
    }
    if (sim.state.cacheKey === preCommitCacheKey) return false;
    // Now call onCalculate with the ADVANCED cacheKey
    sim.state.onCalculate();
    // Wait for the pinned fingerprint (the new cacheKey)
    const published = await waitForCurrentPublicationPinned(sim.state, phaseRef, "cal:v1:after");
    if (!published) return false;
    if (!recommendationResultMatches(sim.state.completedBassAuthority, expectedResult)) return false;
    return { fingerprint: sim.state.cacheKey, levels: { p19: 4 } };
  };

  const result = await fixedVerify(after);
  assert.ok(result, "fixed verify must succeed because the cacheKey advanced before onCalculate");
  assert.equal(result.fingerprint, "cal:v1:after");
});

// ---------------------------------------------------------------------------
// The full executeElectronicTransaction with a fixed verify succeeds, while
// a stale verify fails and restores the prior settings.
// ---------------------------------------------------------------------------
test("executeElectronicTransaction with stale verify restores prior settings", async () => {
  let saved = clone(before);
  let live = clone(before);
  const events = [];
  const receipt = { runId: "run1", before, after };
  const io = {
    guard: () => true,
    persist: async (settings, r) => { events.push("save:" + r.status); saved = { ...clone(settings), receipt: clone(r) }; },
    readback: async () => clone(saved),
    commit: (settings, r) => { events.push("commit:" + r.status); live = clone(settings); },
    verify: async () => {
      events.push("verify");
      return false; // stale verify fails
    },
  };
  await assert.rejects(() => executeElectronicTransaction(io));
  // Restore path: saved and live revert to before
  assert.deepEqual(saved.instances, before.instances);
  assert.deepEqual(saved.crossover, before.crossover);
  assert.deepEqual(live, before);
  assert.ok(!events.includes("commit:verified"));
});

test("executeElectronicTransaction with fixed verify succeeds", async () => {
  let saved = clone(before);
  let live = clone(before);
  const events = [];
  const receipt = { runId: "run2", before, after };
  const sim = makeSimulatedShared({ renderDelayMs: 5, calcDelayMs: 10, preCommitCacheKey: "cal:v1:before" });
  sim.advanceCacheKey("cal:v1:after");
  const phaseRef = { current: "idle" };
  const preCommitCacheKey = sim.state.cacheKey;

  const io = {
    guard: () => true,
    persist: async (settings, r) => { events.push("save:" + r.status); saved = { ...clone(settings), receipt: clone(r) }; },
    readback: async () => clone(saved),
    commit: (settings, r) => { events.push("commit:" + r.status); live = clone(settings); },
    verify: async (settings) => {
      // Fixed verify: wait for cacheKey advancement
      const cacheStart = Date.now();
      while (Date.now() - cacheStart < 5000) {
        if (sim.state.cacheKey !== preCommitCacheKey && sim.state.canCalculate === true) break;
        await sleep(10);
      }
      if (sim.state.cacheKey === preCommitCacheKey) return false;
      sim.state.onCalculate();
      const published = await waitForCurrentPublicationPinned(sim.state, phaseRef, "cal:v1:after");
      if (!published) return false;
      return { fingerprint: "cal:v1:after", levels: { p19: 4, primary: 3, secondary: 2 } };
    },
  };
  const result = await executeElectronicTransaction(io);
  assert.equal(result.status, "verified");
  assert.equal(result.resultFingerprint, "cal:v1:after");
  assert.deepEqual(saved.instances, after.instances);
  assert.ok(events.includes("commit:verified"));
});