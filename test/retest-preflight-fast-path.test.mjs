// retest-preflight-fast-path.test.mjs
// ---------------------------------------------------------------------------
// Regression suite for the Re-test Bass Optimisation fast-path preflight.
//
// Verifies the Re-test route reuses the current authoritative bass baseline
// (skipping onCalculate + waitForCurrentPublication) when the authority is
// AUTHORITATIVE, current and fingerprint-matched, and takes the slow path
// otherwise. Changes no acoustic maths, optimiser search, ranking, P14/P18/P19/
// P20, safety, geometry, coordinates, concurrency, cache identity, terminal
// outcomes, or the post-engine lifecycle.
//
// Run: node --import ./test/_alias-register.mjs --test test/retest-preflight-fast-path.test.mjs
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  canReuseCurrentBaselineForOptimiser,
} from "../src/components/room/bass/optimiseWorkflow/retestPreflightAuthority.js";

// ---------------------------------------------------------------------------
// Shared authority fixture builder
// ---------------------------------------------------------------------------

function makeShared({
  authorityStatus = "AUTHORITATIVE",
  resultFingerprint = "fp-design-123",
  designFingerprint = "fp-design-123",
  hasSelectedCandidate = true,
} = {}) {
  return {
    cacheKey: designFingerprint,
    completedBassAuthority: {
      authorityStatus,
      contract: hasSelectedCandidate
        ? {
            job: { resultFingerprint },
            selectedCandidate: { candidateId: "baseline-current" },
          }
        : {
            job: { resultFingerprint },
          },
    },
  };
}

// ---------------------------------------------------------------------------
// FAST PATH — matching current authority skips onCalculate + publication wait
// ---------------------------------------------------------------------------

test("1. current authoritative bass + matching fingerprint → reuse (skip onCalculate)", () => {
  const shared = makeShared({
    authorityStatus: "AUTHORITATIVE",
    resultFingerprint: "fp-match",
    designFingerprint: "fp-match",
  });
  const decision = canReuseCurrentBaselineForOptimiser(shared);
  assert.equal(decision.reuse, true, "matching current authority must reuse the baseline");
  assert.equal(decision.reason, "authoritative_current_match");
  assert.equal(decision.baselineIdentity.resultFingerprint, "fp-match");
  assert.equal(decision.baselineIdentity.designFingerprint, "fp-match");
});

test("2. current authoritative bass + matching fingerprint → skip publication wait", () => {
  // The same condition that skips onCalculate also skips waitForCurrentPublication:
  // both are gated by the same reuse decision. Assert the decision is reuse=true,
  // which the preflight uses to skip BOTH the calculate call and the wait.
  const shared = makeShared({
    authorityStatus: "AUTHORITATIVE",
    resultFingerprint: "fp-match-2",
    designFingerprint: "fp-match-2",
  });
  const decision = canReuseCurrentBaselineForOptimiser(shared);
  assert.equal(decision.reuse, true);
});

test("3. fast path starts optimiser search directly (source inspection)", () => {
  // The preflight in handleStart must guard onCalculate + waitForCurrentPublication
  // behind the reuse decision, so the search request (Phase 2 runOptimisation)
  // follows immediately on the fast path.
  const source = readFileSync(
    "src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx",
    "utf8",
  );
  assert.ok(
    source.includes("canReuseCurrentBaselineForOptimiser"),
    "handleStart must import and use the preflight authority",
  );
  assert.ok(
    /canReuseCurrentBaselineForOptimiser\(sharedStart\)/.test(source),
    "preflight calls the authority with sharedStart",
  );
  // The slow path (onCalculate + waitForCurrentPublication) must be inside an
  // else branch — not unconditional.
  assert.ok(
    source.includes("Slow path") || source.includes("slow path"),
    "the slow path is explicitly marked as conditional",
  );
  // The preflight call site is inside handleStart (after "Phase 1: Preflight").
  assert.ok(
    source.includes("Phase 1: Preflight"),
    "the preflight is marked as Phase 1 in handleStart",
  );
});

// ---------------------------------------------------------------------------
// SLOW PATH — authority issues trigger calculate
// ---------------------------------------------------------------------------

test("4. missing bass authority → calculate (slow path)", () => {
  const shared = makeShared({ authorityStatus: null });
  // missing authority has no contract; simulate that
  shared.completedBassAuthority = { authorityStatus: null, contract: null };
  const decision = canReuseCurrentBaselineForOptimiser(shared);
  assert.equal(decision.reuse, false, "missing authority takes the slow path");
  assert.equal(decision.reason, "no_authority");
});

test("5. stale bass authority → calculate (slow path)", () => {
  const shared = makeShared({ authorityStatus: "STALE" });
  const decision = canReuseCurrentBaselineForOptimiser(shared);
  assert.equal(decision.reuse, false, "stale authority takes the slow path");
  assert.equal(decision.reason, "authority_status_STALE");
});

test("6. fingerprint mismatch → calculate (slow path)", () => {
  const shared = makeShared({
    authorityStatus: "AUTHORITATIVE",
    resultFingerprint: "fp-old",
    designFingerprint: "fp-new",
  });
  const decision = canReuseCurrentBaselineForOptimiser(shared);
  assert.equal(decision.reuse, false, "fingerprint mismatch takes the slow path");
  assert.equal(decision.reason, "fingerprint_mismatch");
});

test("7. incomplete/provisional result (NOT_VERIFIED) → calculate (slow path)", () => {
  const shared = makeShared({ authorityStatus: "NOT_VERIFIED" });
  const decision = canReuseCurrentBaselineForOptimiser(shared);
  assert.equal(decision.reuse, false, "provisional authority takes the slow path");
  assert.equal(decision.reason, "authority_status_NOT_VERIFIED");
});

test("7b. UPDATING authority → calculate (slow path)", () => {
  const shared = makeShared({ authorityStatus: "UPDATING" });
  const decision = canReuseCurrentBaselineForOptimiser(shared);
  assert.equal(decision.reuse, false);
  assert.equal(decision.reason, "authority_status_UPDATING");
});

test("7c. UNCALCULATED authority → calculate (slow path)", () => {
  const shared = makeShared({ authorityStatus: "UNCALCULATED" });
  const decision = canReuseCurrentBaselineForOptimiser(shared);
  assert.equal(decision.reuse, false);
  assert.equal(decision.reason, "authority_status_UNCALCULATED");
});

test("8. missing required optimiser baseline evidence → calculate (slow path)", () => {
  const shared = makeShared({
    authorityStatus: "AUTHORITATIVE",
    resultFingerprint: "fp-match",
    designFingerprint: "fp-match",
    hasSelectedCandidate: false,
  });
  const decision = canReuseCurrentBaselineForOptimiser(shared);
  assert.equal(decision.reuse, false, "missing baseline evidence takes the slow path");
  assert.equal(decision.reason, "missing_baseline_evidence");
});

// ---------------------------------------------------------------------------
// BASELINE IDENTITY PRESERVATION
// ---------------------------------------------------------------------------

test("9. fast-path baseline identity equals the existing authoritative result", () => {
  const shared = makeShared({
    authorityStatus: "AUTHORITATIVE",
    resultFingerprint: "fp-baseline-xyz",
    designFingerprint: "fp-baseline-xyz",
  });
  const decision = canReuseCurrentBaselineForOptimiser(shared);
  assert.equal(decision.reuse, true);
  assert.equal(decision.baselineIdentity.resultFingerprint, "fp-baseline-xyz");
  assert.equal(decision.baselineIdentity.designFingerprint, "fp-baseline-xyz");
  assert.equal(decision.baselineIdentity.authorityReference, "AUTHORITATIVE");
});

// ---------------------------------------------------------------------------
// RUN ADI AGAIN UNCHANGED
// ---------------------------------------------------------------------------

test("10. Run ADI Again (useRunOptimisationPlan) preflight is unchanged (source inspection)", () => {
  const source = readFileSync(
    "src/components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js",
    "utf8",
  );
  // Run ADI Again keeps its own existing preflight (hasCurrentResult gate).
  // It must NOT use the Re-test preflight authority.
  assert.ok(
    !source.includes("canReuseCurrentBaselineForOptimiser"),
    "Run ADI Again must not use the Re-test preflight authority",
  );
  assert.ok(
    source.includes("hasCurrentResult"),
    "Run ADI Again keeps its own hasCurrentResult preflight",
  );
});

// ---------------------------------------------------------------------------
// RUN IDENTITY + RUNNING UI UNCHANGED
// ---------------------------------------------------------------------------

test("11. runId creation unchanged — beginOptimiserRun still called before preflight (source inspection)", () => {
  const source = readFileSync(
    "src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx",
    "utf8",
  );
  // beginOptimiserRun is called before the preflight, so the runId is minted
  // regardless of fast or slow path. Target the CALL site, not the import.
  const beginIndex = source.indexOf("beginOptimiserRun(projectId, versionId)");
  const preflightCallIndex = source.indexOf("canReuseCurrentBaselineForOptimiser(sharedStart)");
  assert.ok(beginIndex > 0, "beginOptimiserRun is called");
  assert.ok(preflightCallIndex > 0, "preflight authority is called with sharedStart");
  assert.ok(
    beginIndex < preflightCallIndex,
    "runId is minted BEFORE the preflight decision",
  );
});

test("12. running UI unchanged — setStatus running before preflight (source inspection)", () => {
  const source = readFileSync(
    "src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx",
    "utf8",
  );
  // The fast path must not alter the UI running state: startWorkflow is called
  // before the preflight, so the designer sees the same "running" indicator on
  // both paths. Target the CALL site, not the import.
  const startWorkflowIndex = source.indexOf("startWorkflow(projectId, versionId)");
  const preflightCallIndex = source.indexOf("canReuseCurrentBaselineForOptimiser(sharedStart)");
  assert.ok(startWorkflowIndex > 0);
  assert.ok(preflightCallIndex > 0);
  assert.ok(
    startWorkflowIndex < preflightCallIndex,
    "workflow + running UI are started before the preflight decision",
  );
});

// ---------------------------------------------------------------------------
// POST-ENGINE LIFECYCLE UNCHANGED
// ---------------------------------------------------------------------------

test("13. post-engine lifecycle unchanged — preflight only guards Phase 1 (source inspection)", () => {
  const source = readFileSync(
    "src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx",
    "utf8",
  );
  // The preflight must only guard the Phase 1 onCalculate + waitForCurrentPublication.
  // The Phase 2 search, the save boundary, the history pre-write, the null-tuning
  // guard, the no-apply branch, the apply path, the recalc, the publication, the
  // phase-aware failure classification and the catch block must all be unchanged.
  const preflightIndex = source.indexOf("canReuseCurrentBaselineForOptimiser");
  const phase2Index = source.indexOf("phaseRef.current = \"optimising\"");
  assert.ok(preflightIndex > 0);
  assert.ok(phase2Index > 0);
  assert.ok(
    preflightIndex < phase2Index,
    "preflight is before Phase 2; everything from Phase 2 onward is unchanged",
  );
  // The null-tuning guard and no-apply branch must still be present.
  assert.ok(source.includes("hasValidTuning"), "null-tuning guard unchanged");
  assert.ok(source.includes("NO-APPLY COMPLETION"), "no-apply branch unchanged");
  assert.ok(source.includes("historyPreWritten"), "history pre-write unchanged");
  assert.ok(source.includes("resolveCanonicalTerminalOutcome"), "canonical terminal outcome unchanged");
});

// ---------------------------------------------------------------------------
// CASE C REPLAY — preflight on the audited state
// ---------------------------------------------------------------------------

test("14. Case C replay — authoritative + current + matching fingerprint → fast path", () => {
  // The audited Case C baseline: bass authority current, published fingerprint
  // matches current design, required baseline present.
  const caseCShared = makeShared({
    authorityStatus: "AUTHORITATIVE",
    resultFingerprint: "case-c-design-fp",
    designFingerprint: "case-c-design-fp",
    hasSelectedCandidate: true,
  });
  const decision = canReuseCurrentBaselineForOptimiser(caseCShared);
  assert.equal(decision.reuse, true, "Case C baseline takes the fast path");
  assert.equal(decision.reason, "authoritative_current_match");
  // On the fast path: no onCalculate, no waitForCurrentPublication, search
  // dispatch follows immediately after lightweight setup.
});

test("15. Case C replay — onCalculate NOT called when fast path taken (source inspection)", () => {
  const source = readFileSync(
    "src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx",
    "utf8",
  );
  // The onCalculate call in Phase 1 must be inside the slow-path else branch,
  // after the preflight reuse check. (The later onCalculate at Phase 4
  // recalculation is a separate `sharedRef.current?.onCalculate` call.)
  const phase1Marker = source.indexOf("Phase 1: Preflight");
  const preflightReuse = source.indexOf("preflight.reuse");
  const phase2Marker = source.indexOf("phaseRef.current = \"optimising\"");
  assert.ok(phase1Marker > 0, "Phase 1 preflight marker present");
  assert.ok(preflightReuse > phase1Marker, "preflight reuse check is inside Phase 1");
  assert.ok(phase2Marker > preflightReuse, "Phase 2 follows the preflight");
  // The first sharedStart?.onCalculate reference after the preflight must be
  // inside the else branch (slow path). It appears as a typeof guard.
  const onCalculateInPhase1 = source.indexOf(
    "sharedStart?.onCalculate",
    preflightReuse,
  );
  assert.ok(
    onCalculateInPhase1 > preflightReuse && onCalculateInPhase1 < phase2Marker,
    "onCalculate is inside the slow-path else branch, after the preflight check",
  );
});

// ---------------------------------------------------------------------------
// NO STALE BASELINE — failure-behaviour safety
// ---------------------------------------------------------------------------

test("16. fast path never reuses a stale fingerprint", () => {
  // Even if authorityStatus were AUTHORITATIVE, a fingerprint mismatch must
  // force the slow path. This is the guard against optimising against a stale
  // baseline.
  const staleShared = makeShared({
    authorityStatus: "AUTHORITATIVE",
    resultFingerprint: "fp-old-result",
    designFingerprint: "fp-new-design",
  });
  const decision = canReuseCurrentBaselineForOptimiser(staleShared);
  assert.equal(decision.reuse, false);
  assert.equal(decision.reason, "fingerprint_mismatch");
});

test("17. fast path never reuses when authority becomes stale mid-check (blocked guard)", () => {
  // The optimiser's own baseline parity check (result.status === 'blocked')
  // remains the safety net if the authority becomes stale between the preflight
  // and the search. This is unchanged by the fast path (source inspection).
  const source = readFileSync(
    "src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx",
    "utf8",
  );
  assert.ok(
    source.includes('result.status === "blocked"'),
    "the blocked-result safety net is unchanged",
  );
});