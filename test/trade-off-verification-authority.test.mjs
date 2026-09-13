// trade-off-verification-authority.test.mjs
// Deterministic tests for the trade-off Apply verification authority.
//
// Tests:
//   1. Applied tuning present but result still calculating → remains RECALCULATING
//   2. Wrong/stale result fingerprint → not verified (RECALCULATING)
//   3. Completed matching authoritative result → VERIFIED APPLIED
//   4. Failed calculation → verification failure, not success
//   5. No completed authority → RECALCULATING
//   6. Authority not publication-valid → RECALCULATING
//   7. Missing per-seat P19/P20 data → RECALCULATING
//   8. Tuning not yet applied → RECALCULATING
//
// Run: node --import ./test/_alias-register.mjs test/trade-off-verification-authority.test.mjs

import { resolveTradeOffVerification, VERIFICATION_RECALCULATING, VERIFICATION_VERIFIED, VERIFICATION_FAILED } from '@/components/room/bass/improveBassV2/tradeOffVerificationAuthority';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function makeCompletedBassAuthority({ authoritative = true, currentFingerprint = "fp-applied", hasPerSeat = true, p14Level = 2, p18Hz = 20 } = {}) {
  const perSeatP19 = hasPerSeat ? [
    { seatId: "seat-r1-c1", achievedLevel: 4, variationDbRaw: 1.5 },
    { seatId: "seat-r2-c1", achievedLevel: 3, variationDbRaw: 3.5 },
  ] : [];
  const perSeatP20 = hasPerSeat ? [
    { seatId: "seat-r1-c1", deviationDb: 2.1 },
    { seatId: "seat-r2-c1", deviationDb: 6.7 },
  ] : [];
  return {
    authoritative,
    currentFingerprint,
    contract: {
      selectedCandidate: {
        perSeatP19Results: perSeatP19,
        perSeatP20Results: perSeatP20,
        p14AchievedLevel: p14Level,
        p18AchievedExtensionHz: p18Hz,
      },
    },
  };
}

function makeShared({ completedBassAuthority = null, cacheKey = "fp-applied", calculationInProgress = false, calculationOutcome = "idle", detailedStatus = "IDLE", detailedError = null } = {}) {
  return {
    completedBassAuthority,
    cacheKey,
    calculationInProgress,
    calculationOutcome,
    detailedStatus,
    detailedError,
    hasCurrentResult: !!completedBassAuthority,
  };
}

// ── Test 1: Applied tuning present but result still calculating → RECALCULATING ──
{
  const shared = makeShared({
    completedBassAuthority: makeCompletedBassAuthority({ authoritative: false }),
    calculationInProgress: true,
    detailedStatus: "CALCULATING",
  });
  const result = resolveTradeOffVerification({ isApplied: true, shared, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_RECALCULATING, "Test 1: should be RECALCULATING when calculation in progress");
  assert(result.verifiedValues === null, "Test 1: no verified values while calculating");
}

// ── Test 2: Wrong/stale result fingerprint → not verified (RECALCULATING) ──
{
  const shared = makeShared({
    completedBassAuthority: makeCompletedBassAuthority({
      authoritative: true,
      currentFingerprint: "fp-old",
    }),
    cacheKey: "fp-applied",
  });
  const result = resolveTradeOffVerification({ isApplied: true, shared, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_RECALCULATING, "Test 2: should be RECALCULATING when fingerprint mismatch");
  assert(result.verifiedValues === null, "Test 2: no verified values for stale fingerprint");
  assert(result.reason === "fingerprint-mismatch-waiting-for-new-result", `Test 2: reason should be fingerprint-mismatch, got ${result.reason}`);
}

// ── Test 3: Completed matching authoritative result → VERIFIED APPLIED ──
{
  const shared = makeShared({
    completedBassAuthority: makeCompletedBassAuthority({
      authoritative: true,
      currentFingerprint: "fp-applied",
      hasPerSeat: true,
      p14Level: 4,
      p18Hz: 20,
    }),
    cacheKey: "fp-applied",
    calculationInProgress: false,
    calculationOutcome: "success",
    detailedStatus: "COMPLETE",
  });
  const result = resolveTradeOffVerification({ isApplied: true, shared, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_VERIFIED, `Test 3: should be VERIFIED, got ${result.status} (${result.reason})`);
  assert(result.verifiedValues !== null, "Test 3: verified values should be present");
  assert(result.verifiedValues.perSeatP19Results.length === 2, "Test 3: should have 2 per-seat P19 results");
  assert(result.verifiedValues.perSeatP20Results.length === 2, "Test 3: should have 2 per-seat P20 results");
  assert(result.verifiedValues.p14AchievedLevel === 4, "Test 3: P14 achieved level should be 4");
  assert(result.verifiedValues.p18AchievedExtensionHz === 20, "Test 3: P18 extension should be 20 Hz");
}

// ── Test 4: Failed calculation → verification failure, not success ──
{
  const shared = makeShared({
    completedBassAuthority: null,
    calculationOutcome: "error",
    detailedStatus: "ERROR",
    detailedError: "Modal engine failed",
  });
  const result = resolveTradeOffVerification({ isApplied: true, shared, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_FAILED, "Test 4: should be FAILED on calculation error");
  assert(result.verifiedValues === null, "Test 4: no verified values on failure");
  assert(result.reason === "Modal engine failed", `Test 4: reason should be error message, got ${result.reason}`);
}

// ── Test 5: No completed authority → RECALCULATING ──
{
  const shared = makeShared({
    completedBassAuthority: null,
    cacheKey: "fp-applied",
  });
  const result = resolveTradeOffVerification({ isApplied: true, shared, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_RECALCULATING, "Test 5: should be RECALCULATING with no authority");
  assert(result.reason === "no-completed-authority", `Test 5: reason should be no-completed-authority, got ${result.reason}`);
}

// ── Test 6: Authority not publication-valid → RECALCULATING ──
{
  const shared = makeShared({
    completedBassAuthority: makeCompletedBassAuthority({
      authoritative: false,
      currentFingerprint: "fp-applied",
    }),
    cacheKey: "fp-applied",
  });
  const result = resolveTradeOffVerification({ isApplied: true, shared, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_RECALCULATING, "Test 6: should be RECALCULATING when not publication-valid");
  assert(result.reason === "authority-not-yet-publication-valid", `Test 6: reason should be authority-not-yet-publication-valid, got ${result.reason}`);
}

// ── Test 7: Missing per-seat P19/P20 data → RECALCULATING ──
{
  const shared = makeShared({
    completedBassAuthority: makeCompletedBassAuthority({
      authoritative: true,
      currentFingerprint: "fp-applied",
      hasPerSeat: false,
    }),
    cacheKey: "fp-applied",
  });
  const result = resolveTradeOffVerification({ isApplied: true, shared, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_RECALCULATING, "Test 7: should be RECALCULATING when per-seat data missing");
  assert(result.reason === "metric-values-not-yet-available", `Test 7: reason should be metric-values-not-yet-available, got ${result.reason}`);
}

// ── Test 8: Tuning not yet applied → RECALCULATING ──
{
  const shared = makeShared({
    completedBassAuthority: makeCompletedBassAuthority({ authoritative: true, currentFingerprint: "fp-applied" }),
    cacheKey: "fp-applied",
  });
  const result = resolveTradeOffVerification({ isApplied: false, shared, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_RECALCULATING, "Test 8: should be RECALCULATING when tuning not applied");
  assert(result.reason === "tuning-not-yet-applied", `Test 8: reason should be tuning-not-yet-applied, got ${result.reason}`);
}

// ── Test 9: Stale authority (fingerprint mismatch, authoritative=false) → RECALCULATING ──
{
  const shared = makeShared({
    completedBassAuthority: makeCompletedBassAuthority({
      authoritative: false,
      currentFingerprint: "fp-old",
    }),
    cacheKey: "fp-applied",
  });
  const result = resolveTradeOffVerification({ isApplied: true, shared, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_RECALCULATING, "Test 9: should be RECALCULATING for stale authority");
  assert(result.reason === "authority-fingerprint-stale-waiting-for-recalc", `Test 9: reason should be authority-fingerprint-stale, got ${result.reason}`);
}

// ── Test 10: No shared results at all → RECALCULATING ──
{
  const result = resolveTradeOffVerification({ isApplied: true, shared: null, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_RECALCULATING, "Test 10: should be RECALCULATING with no shared");
  assert(result.reason === "no-shared-results", `Test 10: reason should be no-shared-results, got ${result.reason}`);
}

// ── Test 11: Missing fingerprint identity → RECALCULATING ──
{
  const shared = makeShared({
    completedBassAuthority: makeCompletedBassAuthority({
      authoritative: true,
      currentFingerprint: null,
    }),
    cacheKey: "fp-applied",
  });
  const result = resolveTradeOffVerification({ isApplied: true, shared, currentDesignFingerprint: "fp-applied" });
  assert(result.status === VERIFICATION_RECALCULATING, "Test 11: should be RECALCULATING with missing fingerprint");
  assert(result.reason === "missing-fingerprint-identity", `Test 11: reason should be missing-fingerprint-identity, got ${result.reason}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);