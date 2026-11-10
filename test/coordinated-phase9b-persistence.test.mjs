// coordinated-phase9b-persistence.test.mjs
// Synthetic round-trip tests proving Phase 9B diagnostic persistence through
// the REAL application functions — no acoustic search, no worker, no browser.
//
// A synthetic coordinatedDiagnostics object with an identifiable status, reason,
// elapsed time, gate inputs and candidate counts is passed through:
//   1. buildCoordinatedSummary        (diagnostic summary construction)
//   2. buildOptimiserPlan             (actionable-plan path)
//   3. serializeOptimiserPlan         (design_state serialization)
//   4. hydrateOptimiserPlan           (restore from persisted state)
//   5. resolveOptimiserPlanStatus     (read-back / UI view)
//   6. buildOptimiserRunEvidence      (no-winner terminal-evidence path)
//
// Asserts the diagnostic values survive every boundary unchanged.
//
// Pure unit tests — no real project, no publication, no acoustic evidence.

import assert from "node:assert";
import { buildCoordinatedSummary } from "../src/components/room/bass/optimiserPlan/coordinatedSummary.js";
import { buildOptimiserPlan } from "../src/components/room/bass/optimiserPlan/buildOptimiserPlan.js";
import { serializeOptimiserPlan, hydrateOptimiserPlan } from "../src/components/room/bass/optimiserPlan/optimiserPlanPersistence.js";
import { resolveOptimiserPlanStatus } from "../src/components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import { buildOptimiserRunEvidence } from "../src/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import { V2_ENGINE_REVISION } from "../src/components/room/bass/improveBassV2/v2EngineRevision.js";
import { OPTIMISER_PLAN_VERSION } from "../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import {
  ELECTRONIC_TIMING_STAGE,
  ELECTRONIC_TIMING_STAGE_LABEL,
  summariseElectronicStageBreakdown,
} from "../src/components/room/bass/electronicSafety/electronicTimingLedger.js";

// ── Synthetic evidence ────────────────────────────────────────────────────
// An identifiable Phase 9B diagnostic object. The sentinel values are chosen
// to be distinctive so they cannot be confused with defaults: status
// "completed", skipReason null, elapsedMs 12345, a gate-inputs block, and a
// confirmed cross-quantity candidate.

const SYNTHETIC_COORDINATED_DIAGNOSTICS = Object.freeze({
  status: "completed",
  eligible: true,
  skipReason: null,
  startedAt: "2026-11-10T12:00:00.000Z",
  elapsedMs: 12345,
  error: null,
  gateInputs: {
    hasExistingAuthority: true,
    hasCurrentFinalist: true,
    hasEffectiveBaseline: true,
    hasCurrentTransfer: true,
  },
  installedQuantity: 2,
  quantityCoverage: { 2: 3, 4: 2 },
  missingQuantities: [1],
  seatingOffsetsConsidered: 11,
  seatingStatesRetained: [-500, -300, 0, 200, 500],
  placementsGenerated: 15,
  placementsRetained: [
    { id: "p1", phase: "symmetric", quantity: 2, coordinates: [{ x: 1, y: 0.3 }, { x: 3, y: 0.3 }] },
    { id: "p2", phase: "cross-quantity", quantity: 4, coordinates: [{ x: 1, y: 0.3 }, { x: 3, y: 0.3 }, { x: 1, y: 5.7 }, { x: 3, y: 5.7 }] },
  ],
  combosEvaluated: 25,
  survivors: [
    { placementId: "p1", quantity: 2, offsetMm: -300, proxyBalancedRange: 3.5 },
    { placementId: "p2", quantity: 4, offsetMm: 200, proxyBalancedRange: 4.1 },
  ],
  confirmed: [{
    candidateId: "coordinated:p1:-300",
    placementId: "p1",
    quantity: 2,
    offsetMm: -300,
    p19Level: "L2",
    p19VariationDb: -2.5,
    p20Level: "L2",
    p20VariationDb: -3.0,
    p14Db: 117,
    p18Hz: 20,
    isCrossQuantity: false,
  }],
  rejected: [{ stage: "retune", placementId: "p3", reason: "no tuning improvement" }],
});

// A minimal synthetic selection that produces a non-null actionable plan.
// The winner is a position candidate with placement changes so the plan has
// at least one lever. The coordinatedDiagnostics field carries the synthetic
// evidence under test.

function buildSyntheticSelection() {
  return {
    winner: {
      candidateId: "synthetic-winner",
      candidateKind: "position",
      isPositionCandidate: true,
      positionCoordinates: [{ x: 1.0, y: 0.3 }, { x: 3.0, y: 0.3 }],
      appliedTuning: [
        { sourceId: "sub-1", delayMs: 0.5, gainDb: 0, polarity: 1 },
        { sourceId: "sub-2", delayMs: 0.5, gainDb: 0, polarity: 1 },
      ],
      achievedP19Level: "L2",
      achievedP20Level: "L2",
      achievedP19VariationDb: -2.5,
      achievedP20VariationDb: -3.0,
      p14AchievedDb: 117,
      achievedP18Hz: 20,
    },
    currentResult: {
      achievedP19Level: "L1",
      achievedP20Level: "L1",
      achievedP19VariationDb: -1.0,
      achievedP20VariationDb: -1.0,
      appliedTuning: [
        { sourceId: "sub-1", delayMs: 0, gainDb: 0, polarity: 1 },
        { sourceId: "sub-2", delayMs: 0, gainDb: 0, polarity: 1 },
      ],
    },
    confirmedResults: [],
    coordinatedDiagnostics: SYNTHETIC_COORDINATED_DIAGNOSTICS,
  };
}

const SYNTHETIC_INSTANCES = Object.freeze([
  { id: "sub-1", enabled: true, legacyGroup: "front", model: "sub3-12",
    position: { x: 1.0, y: 0.5 }, delayMs: 0, gainDb: 0, polarity: 1 },
  { id: "sub-2", enabled: true, legacyGroup: "front", model: "sub3-12",
    position: { x: 3.0, y: 0.5 }, delayMs: 0, gainDb: 0, polarity: 1 },
]);

const SYNTHETIC_ROOM_DIMS = Object.freeze({ widthM: 4.0, lengthM: 6.0, heightM: 2.4 });
const SYNTHETIC_SEATING = Object.freeze([{ id: "seat-1", x: 2.0, y: 3.0, z: 1.2 }]);

// ── TEST 1: buildCoordinatedSummary preserves all fields ─────────────────

function testSummaryPreservesAllFields() {
  const summary = buildCoordinatedSummary(SYNTHETIC_COORDINATED_DIAGNOSTICS);
  assert.ok(summary, "Summary must not be null");
  assert.strictEqual(summary.status, "completed");
  assert.strictEqual(summary.eligible, true);
  assert.strictEqual(summary.skipReason, null);
  assert.strictEqual(summary.startedAt, "2026-11-10T12:00:00.000Z");
  assert.strictEqual(summary.elapsedMs, 12345);
  assert.strictEqual(summary.error, null);
  // Gate inputs preserved
  assert.strictEqual(summary.gateInputs.hasExistingAuthority, true);
  assert.strictEqual(summary.gateInputs.hasCurrentFinalist, true);
  assert.strictEqual(summary.gateInputs.hasEffectiveBaseline, true);
  assert.strictEqual(summary.gateInputs.hasCurrentTransfer, true);
  // Quantity coverage preserved
  assert.strictEqual(summary.installedQuantity, 2);
  assert.deepStrictEqual(summary.quantityCoverage, { 2: 3, 4: 2 });
  assert.deepStrictEqual(summary.missingQuantities, [1]);
  // Confirmed candidate preserved
  assert.strictEqual(summary.confirmedCount, 1);
  assert.strictEqual(summary.confirmedCandidates[0].candidateId, "coordinated:p1:-300");
  assert.strictEqual(summary.confirmedCandidates[0].p19VariationDb, -2.5);
}

// ── TEST 2: Actionable-plan path preserves coordinatedSummary ─────────────

function testActionablePlanPreservesCoordinatedSummary() {
  const selection = buildSyntheticSelection();
  const plan = buildOptimiserPlan({
    selection,
    baseline: selection.currentResult,
    identity: {
      projectId: "synthetic-project",
      versionId: "synthetic-version",
      designFingerprint: "synthetic-design-fp",
      resultFingerprint: "synthetic-result-fp",
      cacheKey: "synthetic-cache-key",
      baseDesignFingerprint: "synthetic-base-fp",
      engineRevision: V2_ENGINE_REVISION,
    },
    instances: SYNTHETIC_INSTANCES,
    seatingPositions: SYNTHETIC_SEATING,
    roomDims: SYNTHETIC_ROOM_DIMS,
  });
  assert.ok(plan, "Plan must not be null — winner has placement changes");
  assert.ok(plan.coordinatedSummary, "Plan must have coordinatedSummary");
  assert.strictEqual(plan.coordinatedSummary.status, "completed");
  assert.strictEqual(plan.coordinatedSummary.elapsedMs, 12345);
  assert.strictEqual(plan.coordinatedSummary.gateInputs.hasExistingAuthority, true);
  assert.strictEqual(plan.coordinatedSummary.confirmedCount, 1);
}

// ── TEST 3: serializeOptimiserPlan preserves coordinatedSummary ──────────

function testSerializePreservesCoordinatedSummary() {
  const selection = buildSyntheticSelection();
  const plan = buildOptimiserPlan({
    selection,
    baseline: selection.currentResult,
    identity: {
      projectId: "synthetic-project",
      versionId: "synthetic-version",
      designFingerprint: "synthetic-design-fp",
      resultFingerprint: "synthetic-result-fp",
      cacheKey: "synthetic-cache-key",
      baseDesignFingerprint: "synthetic-base-fp",
      engineRevision: V2_ENGINE_REVISION,
    },
    instances: SYNTHETIC_INSTANCES,
    seatingPositions: SYNTHETIC_SEATING,
    roomDims: SYNTHETIC_ROOM_DIMS,
  });
  const serialized = serializeOptimiserPlan(plan);
  assert.ok(serialized, "Serialized plan must not be null");
  assert.ok(serialized.coordinatedSummary, "Serialized plan must have coordinatedSummary");
  assert.strictEqual(serialized.coordinatedSummary.status, "completed");
  assert.strictEqual(serialized.coordinatedSummary.elapsedMs, 12345);
  assert.strictEqual(serialized.coordinatedSummary.gateInputs.hasExistingAuthority, true);
  // engineRevision survives serialization
  assert.strictEqual(serialized.engineRevision, V2_ENGINE_REVISION);
}

// ── TEST 4: hydrateOptimiserPlan preserves coordinatedSummary ──────────────

function testHydratePreservesCoordinatedSummary() {
  const selection = buildSyntheticSelection();
  const plan = buildOptimiserPlan({
    selection,
    baseline: selection.currentResult,
    identity: {
      projectId: "synthetic-project",
      versionId: "synthetic-version",
      designFingerprint: "synthetic-design-fp",
      resultFingerprint: "synthetic-result-fp",
      cacheKey: "synthetic-cache-key",
      baseDesignFingerprint: "synthetic-base-fp",
      engineRevision: V2_ENGINE_REVISION,
    },
    instances: SYNTHETIC_INSTANCES,
    seatingPositions: SYNTHETIC_SEATING,
    roomDims: SYNTHETIC_ROOM_DIMS,
  });
  const serialized = serializeOptimiserPlan(plan);
  // hydrateOptimiserPlan writes to the in-memory store and returns the
  // serialized form — this is the same path the app uses on project reopen.
  const hydrated = hydrateOptimiserPlan("synthetic-project", "synthetic-version", serialized);
  assert.ok(hydrated, "Hydrated plan must not be null");
  assert.ok(hydrated.coordinatedSummary, "Hydrated plan must have coordinatedSummary");
  assert.strictEqual(hydrated.coordinatedSummary.status, "completed");
  assert.strictEqual(hydrated.coordinatedSummary.elapsedMs, 12345);
  assert.strictEqual(hydrated.coordinatedSummary.gateInputs.hasCurrentTransfer, true);
  assert.strictEqual(hydrated.engineRevision, V2_ENGINE_REVISION);
}

// ── TEST 5: resolveOptimiserPlanStatus exposes coordinatedSummary ──────────

function testResolveStatusPreservesCoordinatedSummary() {
  const selection = buildSyntheticSelection();
  const plan = buildOptimiserPlan({
    selection,
    baseline: selection.currentResult,
    identity: {
      projectId: "synthetic-project",
      versionId: "synthetic-version",
      designFingerprint: "synthetic-design-fp",
      resultFingerprint: "synthetic-result-fp",
      cacheKey: "synthetic-cache-key",
      baseDesignFingerprint: "synthetic-base-fp",
      engineRevision: V2_ENGINE_REVISION,
    },
    instances: SYNTHETIC_INSTANCES,
    seatingPositions: SYNTHETIC_SEATING,
    roomDims: SYNTHETIC_ROOM_DIMS,
  });
  const serialized = serializeOptimiserPlan(plan);
  const hydrated = hydrateOptimiserPlan("synthetic-project", "synthetic-version", serialized);
  const resolved = resolveOptimiserPlanStatus({
    plan: hydrated,
    currentDesignFingerprint: "synthetic-design-fp",
    instances: SYNTHETIC_INSTANCES,
    seatingPositions: SYNTHETIC_SEATING,
  });
  assert.ok(resolved, "Resolved plan view must not be null");
  assert.ok(resolved.coordinatedSummary, "Resolved view must expose coordinatedSummary");
  assert.strictEqual(resolved.coordinatedSummary.status, "completed");
  assert.strictEqual(resolved.coordinatedSummary.elapsedMs, 12345);
  assert.strictEqual(resolved.coordinatedSummary.gateInputs.hasExistingAuthority, true);
  assert.strictEqual(resolved.coordinatedSummary.confirmedCount, 1);
  assert.strictEqual(resolved.engineRevision, V2_ENGINE_REVISION);
}

// ── TEST 6: No-winner terminal evidence preserves coordinatedSummary ──────

function testTerminalEvidencePreservesCoordinatedSummary() {
  // A no-winner selection: the run completed but found no actionable plan.
  // The terminal evidence must still carry the Phase 9B summary so the
  // panel can state what happened to Phase 9B even when nothing is offered.
  const noWinnerSelection = {
    winner: null,
    currentResult: null,
    confirmedResults: [],
    coordinatedDiagnostics: SYNTHETIC_COORDINATED_DIAGNOSTICS,
  };
  const evidence = buildOptimiserRunEvidence({
    selection: noWinnerSelection,
    identity: {
      projectId: "synthetic-project",
      versionId: "synthetic-version",
      designFingerprint: "synthetic-design-fp",
      resultFingerprint: "synthetic-result-fp",
      cacheKey: "synthetic-cache-key",
      baseDesignFingerprint: "synthetic-base-fp",
      engineRevision: V2_ENGINE_REVISION,
    },
    terminalOutcome: "no_useful_improvement",
    runIdentity: { runId: "synthetic-run", startedAt: "2026-11-10T12:00:00.000Z" },
  });
  assert.ok(evidence, "Terminal evidence must not be null");
  assert.ok(evidence.coordinatedSummary, "Terminal evidence must have coordinatedSummary");
  assert.strictEqual(evidence.coordinatedSummary.status, "completed");
  assert.strictEqual(evidence.coordinatedSummary.elapsedMs, 12345);
  assert.strictEqual(evidence.coordinatedSummary.gateInputs.hasExistingAuthority, true);
  assert.strictEqual(evidence.engineRevision, V2_ENGINE_REVISION);
}

// ── TEST 7: Skipped Phase 9B summary survives the full round trip ─────────

function testSkippedSummarySurvivesRoundTrip() {
  const skippedDiagnostics = {
    status: "skipped",
    eligible: false,
    skipReason: "no_existing_authority",
    elapsedMs: 0,
    gateInputs: {
      hasExistingAuthority: false,
      hasCurrentFinalist: true,
      hasEffectiveBaseline: true,
      hasCurrentTransfer: false,
    },
    installedQuantity: 2,
  };
  const summary = buildCoordinatedSummary(skippedDiagnostics);
  assert.strictEqual(summary.status, "skipped");
  assert.strictEqual(summary.eligible, false);
  assert.strictEqual(summary.skipReason, "no_existing_authority");
  assert.strictEqual(summary.gateInputs.hasExistingAuthority, false);
  assert.strictEqual(summary.gateInputs.hasCurrentTransfer, false);

  // The no-winner terminal evidence must also carry the skipped summary.
  const evidence = buildOptimiserRunEvidence({
    selection: { coordinatedDiagnostics: skippedDiagnostics },
    identity: { projectId: "p", versionId: "v" },
    runIdentity: { runId: "r", startedAt: "2026-11-10T12:00:00.000Z" },
  });
  assert.ok(evidence.coordinatedSummary);
  assert.strictEqual(evidence.coordinatedSummary.status, "skipped");
  assert.strictEqual(evidence.coordinatedSummary.skipReason, "no_existing_authority");
  assert.strictEqual(evidence.coordinatedSummary.gateInputs.hasExistingAuthority, false);
}

// ── TEST 8: Recoverable failure summary survives the full round trip ──────

function testIncompleteSummarySurvivesRoundTrip() {
  const incompleteDiagnostics = {
    status: "incomplete",
    eligible: true,
    skipReason: null,
    elapsedMs: 5000,
    error: "batch transfer failed: worker timeout",
    gateInputs: {
      hasExistingAuthority: true,
      hasCurrentFinalist: true,
      hasEffectiveBaseline: true,
      hasCurrentTransfer: true,
    },
    installedQuantity: 2,
  };
  const summary = buildCoordinatedSummary(incompleteDiagnostics);
  assert.strictEqual(summary.status, "incomplete");
  assert.strictEqual(summary.error, "batch transfer failed: worker timeout");

  const evidence = buildOptimiserRunEvidence({
    selection: { coordinatedDiagnostics: incompleteDiagnostics },
    identity: { projectId: "p", versionId: "v" },
    runIdentity: { runId: "r", startedAt: "2026-11-10T12:00:00.000Z" },
  });
  assert.ok(evidence.coordinatedSummary);
  assert.strictEqual(evidence.coordinatedSummary.status, "incomplete");
  assert.strictEqual(evidence.coordinatedSummary.error, "batch transfer failed: worker timeout");
}

// ── TEST 9: V2_ENGINE_REVISION is a stable non-empty string ────────────────

function testEngineRevisionIsStable() {
  assert.ok(typeof V2_ENGINE_REVISION === "string", "Engine revision must be a string");
  assert.ok(V2_ENGINE_REVISION.length > 0, "Engine revision must not be empty");
  // Must not be a URL, a build command, or a secret — just a short identifier.
  assert.ok(!V2_ENGINE_REVISION.includes("http"), "Engine revision must not be a URL");
  assert.ok(!V2_ENGINE_REVISION.includes("npm"), "Engine revision must not be a build command");
}

// ── TEST 10: Coordinated-search timing stage exists in the ledger ─────────

function testCoordinatedSearchStageExists() {
  // The electronic timing ledger must recognise the coordinated-search stage
  // so it appears in the displayed runtime breakdown, not just the raw metrics.
  assert.ok(ELECTRONIC_TIMING_STAGE.COORDINATED_SEARCH, "COORDINATED_SEARCH stage must exist");
  assert.strictEqual(ELECTRONIC_TIMING_STAGE.COORDINATED_SEARCH, "coordinated-search");
  assert.ok(ELECTRONIC_TIMING_STAGE_LABEL[ELECTRONIC_TIMING_STAGE.COORDINATED_SEARCH],
    "COORDINATED_SEARCH must have a label");
  // The summariser must map the stage from raw metrics.
  const breakdown = summariseElectronicStageBreakdown({
    runtimeMetrics: {
      runId: "test-run",
      engineRevision: V2_ENGINE_REVISION,
      stageSpans: { "coordinated-search": 5000 },
      workerCalls: [],
      counts: {},
    },
  });
  assert.ok(breakdown, "Breakdown must not be null");
  assert.strictEqual(breakdown.stages[ELECTRONIC_TIMING_STAGE.COORDINATED_SEARCH], 5000,
    "coordinated-search must appear in the breakdown stages");
  assert.strictEqual(breakdown.engineRevision, V2_ENGINE_REVISION,
    "engineRevision must appear in the breakdown");
}

// ── Run all tests ──────────────────────────────────────────────────────────

const tests = [
  ["TEST 1: buildCoordinatedSummary preserves all fields", testSummaryPreservesAllFields],
  ["TEST 2: Actionable-plan path preserves coordinatedSummary", testActionablePlanPreservesCoordinatedSummary],
  ["TEST 3: serializeOptimiserPlan preserves coordinatedSummary", testSerializePreservesCoordinatedSummary],
  ["TEST 4: hydrateOptimiserPlan preserves coordinatedSummary", testHydratePreservesCoordinatedSummary],
  ["TEST 5: resolveOptimiserPlanStatus exposes coordinatedSummary", testResolveStatusPreservesCoordinatedSummary],
  ["TEST 6: No-winner terminal evidence preserves coordinatedSummary", testTerminalEvidencePreservesCoordinatedSummary],
  ["TEST 7: Skipped Phase 9B summary survives round trip", testSkippedSummarySurvivesRoundTrip],
  ["TEST 8: Recoverable failure summary survives round trip", testIncompleteSummarySurvivesRoundTrip],
  ["TEST 9: V2_ENGINE_REVISION is a stable non-empty string", testEngineRevisionIsStable],
  ["TEST 10: coordinated-search timing stage exists in the ledger", testCoordinatedSearchStageExists],
];

let passed = 0;
let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}
console.log(`\n${passed}/${tests.length} tests passed`);
if (failed > 0) process.exit(1);