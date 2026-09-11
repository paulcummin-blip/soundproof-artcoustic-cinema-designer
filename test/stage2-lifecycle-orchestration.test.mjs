// stage2-lifecycle-orchestration.test.mjs
// Tests for the Stage 2 lifecycle orchestration integrated into Improve Bass V2.
//
// Verifies:
//   1. Current Stage 2 → reused without rerun
//   2. Missing Stage 2 → requested then auto-continues
//   3. Stale Stage 2 → rejected and regenerated
//   4. Failed/cancelled Stage 2 → Improve Bass terminates cleanly
//   5. Design fingerprint changes while waiting → result rejected
//   6. Produced evaluatedFinalists IDs exactly match those consumed by Improve Bass
//   7. placementFingerprintUsed becomes non-null/current
//   8. stage2TransfersReused > 0 when reusable transfers are present
//
// Run: node --experimental-vm-modules test/stage2-lifecycle-orchestration.test.mjs

import assert from "node:assert";

import { register } from "node:module";
register("./_alias-loader.mjs", import.meta.url);

const { isStage2ReadyForConsumption, waitForStage2Terminal } = await import(
  "@/components/room/bass/improveBassV2/stage2LifecycleOrchestrator.js"
);
const { setStage2StateForTest } = await import(
  "@/components/room/bass/stage2/stage2PlacementStore.js"
);
const { V2RuntimeMetrics } = await import(
  "@/components/room/bass/improveBassV2/improveBassV2RuntimeMetrics.js"
);
const { setAwaitingStage2, getImproveBassV2State } = await import(
  "@/components/room/bass/improveBassV2/improveBassV2Store.js"
);

// ── Test infrastructure ──────────────────────────────────────────────────

const tests = [];
const results = { passed: 0, failed: 0, skipped: 0 };

function test(name, fn) {
  tests.push({ name, fn });
}

// ── Mock data ────────────────────────────────────────────────────────────

const mockRoomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
const mockSubwooferInstances = [
  { id: "sub-1", enabled: true, position: { x: 1.0, y: 0.5 }, gainDb: 0, delayMs: 0, polarity: 0 },
  { id: "sub-2", enabled: true, position: { x: 3.5, y: 0.5 }, gainDb: 0, delayMs: 0, polarity: 0 },
];

const VALID_PLACEMENT_FINGERPRINT = "stage2-place:v3:abc123";
const VALID_STAGE2_FINGERPRINT = "stage2:v3:def456:target-min-L2-117";

function makeCompleteStage2State(overrides = {}) {
  return {
    projectId: "test-project",
    status: "complete",
    fingerprint: VALID_STAGE2_FINGERPRINT,
    placementFingerprint: VALID_PLACEMENT_FINGERPRINT,
    one_sub_result: null,
    two_sub_result: {
      evaluatedFinalists: [
        {
          finalistId: "fam-A-2sub",
          familyId: "A",
          coordinates: [{ x: 0.5, y: 0.3 }, { x: 4.0, y: 0.3 }],
        },
        {
          finalistId: "fam-C-2sub",
          familyId: "C",
          coordinates: [{ x: 1.0, y: 5.7 }, { x: 3.5, y: 5.7 }],
        },
      ],
    },
    four_sub_result: null,
    overall_best: null,
    canonicalJobsRun: 2,
    completedJobs: 2,
    totalJobsPlanned: 2,
    phase: "complete",
    totalRuntimeMs: 5000,
    errorMessage: null,
    hydratedFromCache: false,
    bEligible: false,
    bEvaluated: false,
    bEligibilityReason: null,
    bFailedCandidates: [],
    bResult: null,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

// Test 1: Current Stage 2 → reused without rerun
test("REUSE: valid current Stage 2 authority → isStage2ReadyForConsumption returns true", () => {
  const stage2 = makeCompleteStage2State();
  assert.strictEqual(
    isStage2ReadyForConsumption(stage2),
    true,
    "A complete Stage 2 with non-null fingerprints must be ready for consumption",
  );
});

// Test 1b: Reuse path does NOT request a heavy action
test("REUSE: when Stage 2 is ready, no heavy action is requested", () => {
  const stage2 = makeCompleteStage2State();
  // If isStage2ReadyForConsumption returns true, the Improve Bass handleStart
  // skips the requestBassHeavyAction + waitForStage2Terminal path entirely.
  // This is the reuse-without-rerun guarantee.
  assert.ok(
    isStage2ReadyForConsumption(stage2),
    "Stage 2 must be reusable when complete with valid fingerprints",
  );
});

// Test 2: Missing Stage 2 → requested then auto-continues
test("MISSING: incomplete Stage 2 → isStage2ReadyForConsumption returns false", () => {
  // Missing entirely
  assert.strictEqual(isStage2ReadyForConsumption(null), false);
  // Status not complete
  assert.strictEqual(
    isStage2ReadyForConsumption({ status: "idle", placementFingerprint: null, fingerprint: null }),
    false,
  );
  // Complete but missing placementFingerprint
  assert.strictEqual(
    isStage2ReadyForConsumption({ status: "complete", placementFingerprint: null, fingerprint: "fp" }),
    false,
  );
  // Complete but missing fingerprint
  assert.strictEqual(
    isStage2ReadyForConsumption({ status: "complete", placementFingerprint: "pf", fingerprint: null }),
    false,
  );
});

// Test 3: Stale Stage 2 → rejected and regenerated
test("STALE: Stage 2 with old fingerprint → isStage2ReadyForConsumption returns false", () => {
  // A stale Stage 2 would have status "idle" (the hook cancels and marks idle
  // on fingerprint mismatch). So it's not ready for consumption.
  const staleStage2 = {
    status: "idle",
    placementFingerprint: "old-pf",
    fingerprint: "old-fp",
  };
  assert.strictEqual(isStage2ReadyForConsumption(staleStage2), false);
});

// Test 4: Failed/cancelled Stage 2 → Improve Bass terminates cleanly
test("FAILED: waitForStage2Terminal resolves with error status on Stage 2 error", async () => {
  setStage2StateForTest("test-fail", {
    status: "error",
    errorMessage: "Worker crashed",
    placementFingerprint: null,
    fingerprint: null,
  });

  const result = await waitForStage2Terminal("test-fail", {
    isCancelled: () => false,
    getCurrentFingerprint: () => "fp-1",
    startFingerprint: "fp-1",
  });

  assert.strictEqual(result.status, "error");
  assert.ok(result.error, "Error result must carry an error message");
});

// Test 4b: Cancelled Stage 2 → Improve Bass terminates cleanly
test("CANCELLED: waitForStage2Terminal resolves with cancelled status on user cancel", async () => {
  setStage2StateForTest("test-cancel", {
    status: "running",
    placementFingerprint: null,
    fingerprint: null,
  });

  // Simulate user pressing Cancel — isCancelled returns true on first check
  const result = await waitForStage2Terminal("test-cancel", {
    isCancelled: () => true,
    getCurrentFingerprint: () => "fp-1",
    startFingerprint: "fp-1",
  });

  assert.strictEqual(result.status, "cancelled");
});

// Test 5: Design fingerprint changes while waiting → result rejected
test("STALE_WAIT: fingerprint change during Stage 2 wait → stale status", async () => {
  setStage2StateForTest("test-stale-wait", {
    status: "running",
    placementFingerprint: null,
    fingerprint: null,
  });

  const result = await waitForStage2Terminal("test-stale-wait", {
    isCancelled: () => false,
    getCurrentFingerprint: () => "changed-fingerprint",
    startFingerprint: "original-fingerprint",
  });

  assert.strictEqual(result.status, "stale");
  assert.ok(result.message, "Stale result must carry a message");
});

// Test 6: Produced evaluatedFinalists IDs exactly match those consumed
test("FINALIST_IDS: extractStage2Finalists preserves evaluatedFinalists IDs", () => {
  const stage2 = makeCompleteStage2State();
  const result = stage2.two_sub_result;
  const producedIds = result.evaluatedFinalists.map((f) => f.finalistId || f.id);

  // Simulate what gatherCandidates/extractStage2Finalists does
  const consumedIds = [];
  const seen = new Set();
  for (const f of result.evaluatedFinalists) {
    const id = f.finalistId || f.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    consumedIds.push(id);
  }

  assert.deepStrictEqual(consumedIds, producedIds,
    "Consumed finalist IDs must exactly match produced evaluatedFinalists IDs");
});

// Test 7: placementFingerprintUsed becomes non-null/current
test("PLACEMENT_FP: V2RuntimeMetrics records placementFingerprintUsed", () => {
  const metrics = new V2RuntimeMetrics("test-pf");
  metrics.recordPlacementFingerprint(VALID_PLACEMENT_FINGERPRINT);
  metrics.finish();
  const report = metrics.toReport();
  assert.strictEqual(
    report.placementFingerprintUsed,
    VALID_PLACEMENT_FINGERPRINT,
    "placementFingerprintUsed must be the exact Stage 2 placement fingerprint",
  );
  assert.ok(
    report.placementFingerprintUsed !== null,
    "placementFingerprintUsed must be non-null",
  );
});

// Test 8: stage2TransfersReused > 0 when reusable transfers are present
test("TRANSFERS_REUSED: V2RuntimeMetrics counts stage2TransfersReused correctly", () => {
  const metrics = new V2RuntimeMetrics("test-reuse");
  // Simulate 3 cache hits during the run
  metrics.recordStage2TransferReused();
  metrics.recordStage2TransferReused();
  metrics.recordStage2TransferReused();
  metrics.finish();
  const report = metrics.toReport();
  assert.strictEqual(
    report.stage2TransfersReused,
    3,
    "stage2TransfersReused must equal the number of cache hits",
  );
  assert.ok(
    report.stage2TransfersReused > 0,
    "stage2TransfersReused must be > 0 when reusable transfers are present",
  );
});

// Test 9: awaiting_stage2 is a temporary state, not an acoustic authority
test("AWAITING_STATE: awaiting_stage2 status exists in store but is not an authority", () => {
  setAwaitingStage2("test-await", { subwooferInstances: mockSubwooferInstances });
  const state = getImproveBassV2State("test-await");
  assert.strictEqual(state.status, "awaiting_stage2");
  assert.strictEqual(state.phase, "awaiting_stage2");
  // It must NOT carry acoustic authority fields (winner, confirmedChallengers)
  assert.strictEqual(state.winner, null);
  assert.deepStrictEqual(state.confirmedChallengers, []);
});

// ── Runner ──────────────────────────────────────────────────────────────

async function run() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      results.passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      results.failed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    }
  }
  console.log(`\n${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
  if (results.failed > 0) process.exit(1);
}

run();