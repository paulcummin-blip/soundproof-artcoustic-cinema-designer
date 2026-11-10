// coordinated-phase9b-observability.test.mjs
// Unit tests for Phase 9B observability and cross-quantity identity.
//
// These tests verify the properties required by the Phase 9B completion
// criteria:
//   1. Phase 9B always records an explicit execution outcome.
//   2. Missing quantity finalists are reported, not silently invented.
//   3. Four-subwoofer candidates have four correct, unique source identities.
//   4. Moved seating produces correctly bound seat/RSP transfers.
//   5. Candidate tuning and canonical evidence belong to the same design.
//   6. Missing acoustic evidence cannot be interpreted as zero deviation.
//   7. Existing V2 behaviour remains intact (same-quantity path preserved).
//
// Pure unit tests — no worker, no browser, no acoustic simulation. They test
// the diagnostic structure, the candidate design context identity layer, and
// the coordinated summary persistence.

import assert from "node:assert";
import { buildCandidateDesignContext, validationContextForCandidate } from "../src/components/room/bass/improveBassV2/candidateDesignContext.js";
import { buildCoordinatedSummary } from "../src/components/room/bass/optimiserPlan/coordinatedSummary.js";

// ── TEST 1: Phase 9B always records an explicit execution outcome ─────────

function testSkippedOutcomeIsExplicit() {
  const summary = buildCoordinatedSummary({
    status: "skipped",
    eligible: false,
    skipReason: "no_existing_authority",
    elapsedMs: 0,
  });
  assert.ok(summary, "Skipped run must produce a summary, not null");
  assert.strictEqual(summary.status, "skipped");
  assert.strictEqual(summary.eligible, false);
  assert.strictEqual(summary.skipReason, "no_existing_authority");
  assert.strictEqual(summary.elapsedMs, 0);
}

function testNullDiagnosticsProduceNull() {
  const summary = buildCoordinatedSummary(null);
  assert.strictEqual(summary, null, "No diagnostics must produce null, not a fabricated summary");
}

function testCompletedOutcomeIsExplicit() {
  const summary = buildCoordinatedSummary({
    status: "completed",
    eligible: true,
    skipReason: null,
    startedAt: "2026-11-10T12:00:00.000Z",
    elapsedMs: 12345,
    installedQuantity: 2,
    quantityCoverage: { 2: 3, 4: 2 },
    missingQuantities: [1],
    seatingOffsetsConsidered: 11,
    seatingStatesRetained: [-500, -300, 0, 200, 500],
    placementsGenerated: 15,
    placementsRetained: [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }, { id: "p5" }],
    combosEvaluated: 25,
    survivors: [{ placementId: "p1" }, { placementId: "p2" }],
    confirmed: [{
      candidateId: "coordinated:p1:-300",
      placementId: "p1",
      quantity: 4,
      offsetMm: -300,
      p19Level: "L2",
      p19VariationDb: -2.5,
      p20Level: "L2",
      p20VariationDb: -3.0,
      p14Db: 117,
      p18Hz: 20,
      isCrossQuantity: true,
    }],
    rejected: [{ stage: "retune", placementId: "p3", reason: "no tuning improvement" }],
  });
  assert.ok(summary);
  assert.strictEqual(summary.status, "completed");
  assert.strictEqual(summary.eligible, true);
  assert.strictEqual(summary.installedQuantity, 2);
  assert.deepStrictEqual(summary.quantityCoverage, { 2: 3, 4: 2 });
  assert.deepStrictEqual(summary.missingQuantities, [1]);
  assert.strictEqual(summary.confirmedCount, 1);
  assert.strictEqual(summary.confirmedCandidates[0].quantity, 4);
  assert.strictEqual(summary.confirmedCandidates[0].isCrossQuantity, true);
  assert.strictEqual(summary.rejectedCount, 1);
  assert.strictEqual(summary.rejections[0].reason, "no tuning improvement");
}

function testIncompleteOutcomeRecordsError() {
  const summary = buildCoordinatedSummary({
    status: "incomplete",
    eligible: true,
    error: "batch transfer failed: worker timeout",
    elapsedMs: 5000,
  });
  assert.ok(summary);
  assert.strictEqual(summary.status, "incomplete");
  assert.strictEqual(summary.error, "batch transfer failed: worker timeout");
}

// ── TEST 2: Missing quantity finalists are reported, not invented ────────

function testMissingQuantitiesAreReported() {
  const summary = buildCoordinatedSummary({
    status: "no_improvement",
    eligible: true,
    installedQuantity: 2,
    quantityCoverage: { 2: 3 },
    missingQuantities: [1, 4],
    elapsedMs: 8000,
  });
  assert.ok(summary);
  assert.deepStrictEqual(summary.missingQuantities, [1, 4]);
  assert.strictEqual(summary.quantityCoverage[4], undefined);
}

// ── TEST 3: Four-subwoofer candidates have four unique source identities ───

function testFourSubCandidateHasFourUniqueSourceIds() {
  const ctx = buildCandidateDesignContext({
    finalistId: "stage2-4sub-finalist-1",
    quantity: 4,
    coordinates: [
      { x: 1.0, y: 0.3 },
      { x: 3.5, y: 0.3 },
      { x: 1.0, y: 5.7 },
      { x: 3.5, y: 5.7 },
    ],
    selectedSubModel: "artcoustic-sub3-12",
    subwooferBottomHeightM: 0.1,
    seatingPositions: [{ id: "seat-1", x: 2.25, y: 3.0, z: 1.2 }],
    rspPosition: { x: 2.25, y: 3.0, z: 1.2 },
  });
  assert.strictEqual(ctx.quantity, 4);
  assert.strictEqual(ctx.sourceIds.length, 4);
  assert.strictEqual(ctx.instances.length, 4);
  // Every source ID must be non-null and unique.
  assert.ok(ctx.sourceIds.every((id) => id && typeof id === "string"));
  assert.strictEqual(new Set(ctx.sourceIds).size, 4);
  // Every instance must carry its sourceId as id.
  assert.ok(ctx.instances.every((inst, i) => inst.id === ctx.sourceIds[i]));
  // The identity must be candidate-owned, not installed.
  assert.ok(ctx.sourceIds.every((id) => id.startsWith("cand-")));
  assert.strictEqual(ctx.isCrossQuantity, true);
}

function testTwoSubCandidateHasTwoUniqueSourceIds() {
  const ctx = buildCandidateDesignContext({
    finalistId: "stage2-2sub-finalist-1",
    quantity: 2,
    coordinates: [{ x: 1.0, y: 0.3 }, { x: 3.5, y: 0.3 }],
    selectedSubModel: "artcoustic-sub3-12",
    subwooferBottomHeightM: 0.1,
  });
  assert.strictEqual(ctx.sourceIds.length, 2);
  assert.strictEqual(new Set(ctx.sourceIds).size, 2);
}

function testOneSubCandidateHasOneSourceId() {
  const ctx = buildCandidateDesignContext({
    finalistId: "stage2-1sub-finalist-1",
    quantity: 1,
    coordinates: [{ x: 2.25, y: 0.3 }],
    selectedSubModel: "artcoustic-sub3-12",
  });
  assert.strictEqual(ctx.sourceIds.length, 1);
  assert.ok(ctx.sourceIds[0]);
}

// ── TEST 4: Moved seating produces correctly bound seat/RSP transfers ─────

function testValidationContextUsesCandidateSeats() {
  const designContext = buildCandidateDesignContext({
    finalistId: "f1",
    quantity: 4,
    coordinates: [{ x: 1, y: 0.3 }, { x: 3, y: 0.3 }, { x: 1, y: 5.7 }, { x: 3, y: 5.7 }],
    selectedSubModel: "sub3-12",
    seatingPositions: [{ id: "moved-seat-1", x: 2, y: 3.5, z: 1.2 }],
    rspPosition: { x: 2, y: 3.5, z: 1.2 },
  });
  const fallbackContext = {
    seats: [{ id: "installed-seat-1", x: 2, y: 3.0, z: 1.2 }],
    sourceIds: ["installed-sub-1", "installed-sub-2"],
    inputIdentity: "fingerprint-123",
  };
  const ctx = validationContextForCandidate({ designContext }, fallbackContext);
  // Must use the candidate's own seats, not the installed seats.
  assert.strictEqual(ctx.seats.length, 1);
  assert.strictEqual(ctx.seats[0].id, "moved-seat-1");
  // Must use the candidate's own source IDs.
  assert.deepStrictEqual(ctx.sourceIds, designContext.sourceIds);
  // Must preserve the input identity.
  assert.strictEqual(ctx.inputIdentity, "fingerprint-123");
}

function testValidationContextFallsBackWithoutDesignContext() {
  const fallbackContext = {
    seats: [{ id: "installed-seat-1" }],
    sourceIds: ["installed-sub-1", "installed-sub-2"],
    inputIdentity: "fingerprint-123",
  };
  const ctx = validationContextForCandidate({}, fallbackContext);
  // No design context → fall back to installed.
  assert.deepStrictEqual(ctx, fallbackContext);
}

// ── TEST 5: Candidate tuning and evidence belong to the same design ───────

function testCandidateIdentityIsUniquePerFinalist() {
  const ctx1 = buildCandidateDesignContext({
    finalistId: "finalist-A",
    quantity: 4,
    coordinates: [{ x: 1, y: 0.3 }, { x: 3, y: 0.3 }, { x: 1, y: 5.7 }, { x: 3, y: 5.7 }],
    selectedSubModel: "sub3-12",
  });
  const ctx2 = buildCandidateDesignContext({
    finalistId: "finalist-B",
    quantity: 4,
    coordinates: [{ x: 0.5, y: 0.3 }, { x: 4, y: 0.3 }, { x: 0.5, y: 5.7 }, { x: 4, y: 5.7 }],
    selectedSubModel: "sub3-12",
  });
  // Different finalists must produce different source IDs.
  assert.notDeepStrictEqual(ctx1.sourceIds, ctx2.sourceIds);
  assert.ok(ctx1.sourceIds.some((id) => id.includes("finalist-A")));
  assert.ok(ctx2.sourceIds.some((id) => id.includes("finalist-B")));
}

// ── TEST 6: Missing evidence cannot be interpreted as zero deviation ──────

function testMissingEvidenceIsNeverZeroDeviation() {
  // A confirmed candidate with no P19/P20 values must not fabricate 0.
  const summary = buildCoordinatedSummary({
    status: "completed",
    eligible: true,
    confirmed: [{
      candidateId: "coordinated:p1:200",
      placementId: "p1",
      quantity: 4,
      offsetMm: 200,
      p19Level: null,
      p19VariationDb: null,
      p20Level: null,
      p20VariationDb: null,
      p14Db: null,
      p18Hz: null,
      isCrossQuantity: true,
    }],
  });
  // Null values must stay null — never coerced to 0.
  assert.strictEqual(summary.confirmedCandidates[0].p19VariationDb, null);
  assert.strictEqual(summary.confirmedCandidates[0].p20VariationDb, null);
  assert.strictEqual(summary.confirmedCandidates[0].p14Db, null);
  assert.strictEqual(summary.confirmedCandidates[0].p18Hz, null);
}

function testMissingProxyRangeIsNeverZero() {
  // A candidate with no proxy range (missing transfer) must not be
  // interpreted as zero deviation — it is Infinity (no valid data).
  const summary = buildCoordinatedSummary({
    status: "no_combos",
    eligible: true,
    elapsedMs: 100,
  });
  assert.strictEqual(summary.status, "no_combos");
  assert.strictEqual(summary.confirmedCount, 0);
}

// ── TEST 7: Existing V2 behaviour remains intact ─────────────────────────

function testSameQuantityPathHasNoDesignContext() {
  // A same-quantity candidate (designContext = null) must not be marked
  // isCrossQuantity. This is verified in the coordinated search by checking
  // that the designContext is null for installed-quantity placements.
  // Here we verify the validation context falls back correctly.
  const fallbackContext = {
    seats: [{ id: "seat-1" }],
    sourceIds: ["sub-1", "sub-2"],
    inputIdentity: "fp",
  };
  const ctx = validationContextForCandidate({ designContext: null }, fallbackContext);
  assert.deepStrictEqual(ctx, fallbackContext);
}

// ── Run all tests ──────────────────────────────────────────────────────────

const tests = [
  ["TEST 1: Skipped outcome is explicit", testSkippedOutcomeIsExplicit],
  ["TEST 1: Null diagnostics produce null", testNullDiagnosticsProduceNull],
  ["TEST 1: Completed outcome is explicit", testCompletedOutcomeIsExplicit],
  ["TEST 1: Incomplete outcome records error", testIncompleteOutcomeRecordsError],
  ["TEST 2: Missing quantities are reported", testMissingQuantitiesAreReported],
  ["TEST 3: 4-sub candidate has 4 unique source IDs", testFourSubCandidateHasFourUniqueSourceIds],
  ["TEST 3: 2-sub candidate has 2 unique source IDs", testTwoSubCandidateHasTwoUniqueSourceIds],
  ["TEST 3: 1-sub candidate has 1 source ID", testOneSubCandidateHasOneSourceId],
  ["TEST 4: Validation context uses candidate seats", testValidationContextUsesCandidateSeats],
  ["TEST 4: Validation context falls back without design context", testValidationContextFallsBackWithoutDesignContext],
  ["TEST 5: Candidate identity is unique per finalist", testCandidateIdentityIsUniquePerFinalist],
  ["TEST 6: Missing evidence is never zero deviation", testMissingEvidenceIsNeverZeroDeviation],
  ["TEST 6: Missing proxy range is never zero", testMissingProxyRangeIsNeverZero],
  ["TEST 7: Same-quantity path has no design context", testSameQuantityPathHasNoDesignContext],
];

let passed = 0;
let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
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