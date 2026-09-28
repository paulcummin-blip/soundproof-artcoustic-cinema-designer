// test/restore-display-override.test.mjs
//
// Focused tests proving the GLOBAL RESTORE DISPLAY OVERRIDE.
//
// The override ensures that from the first visible frame after clicking
// Restore Previous Design, every visible bass status source treats the
// lifecycle as RESTORING — "Performance is current" is suppressed
// everywhere, P20 does not show current, and no two top-level status
// messages appear at once. After restore completes and coherence is
// confirmed, status returns to Current.
//
// Run: node --import ./test/_alias-register.mjs test/restore-display-override.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { setRestoring, isRestoring, _resetRestoreStateForTest } from "@/components/room/bass/bda/restoreStateStore";
import { BASS_LIFECYCLE_STATE, BASS_LIFECYCLE_COPY, deriveBassDisplayStatus } from "@/components/room/bass/bassCalculationLifecycle";
import { resolveEffectiveBassLifecycleState } from "@/components/room/bass/bda/useEffectiveBassLifecycle";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { BASS_ANALYSIS_CONTRACT_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from "@/lib/bassAuthorityVersion";

const PID = "test-project-override";
const VID = "test-version-override";

function reset() {
  _resetRestoreStateForTest();
}

// Reuse the structurally-complete authority fixture pattern from the
// restore-status-authority suite so publicationVerified is true.
function makeAuthoritativeAuthority({ fingerprint = "fp-override" } = {}) {
  return {
    authoritative: true,
    authorityStatus: "AUTHORITATIVE",
    contract: {
      version: BASS_ANALYSIS_CONTRACT_VERSION,
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      job: {
        status: "complete",
        resultFingerprint: fingerprint,
        currentJobFingerprint: fingerprint,
        metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      },
      selectedCandidate: { id: "cand-1" },
      selectedCandidateId: "cand-1",
      metricPublication: { canonicalMetricPublicationValid: true },
      productAnalysis: {
        parameters: {
          p14: { pass: true, level: 2, selectedLevel: 2, selectedTargetDb: 112, value: 112, targetBasis: "minimum", status: "complete" },
          p18: { value: 26, level: 2, achievedExtensionBounded: false, status: "complete" },
        },
      },
      bassResult: {
        P19: { status: "complete", level: 4, value: 1.8 },
        P20: { status: "complete", level: 1, value: 5 },
        seatResults: { P20: [] },
      },
      selectedMode: "balanced",
    },
  };
}

// ── 1. Effective lifecycle is RESTORING during restore ──────────────────

test("1. resolveEffectiveBassLifecycleState returns RESTORING when restoreActive is true", () => {
  const effective = resolveEffectiveBassLifecycleState(true, BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(effective, BASS_LIFECYCLE_STATE.RESTORING);
});

test("1a. effective lifecycle is RESTORING even when shared state is null", () => {
  const effective = resolveEffectiveBassLifecycleState(true, null);
  assert.equal(effective, BASS_LIFECYCLE_STATE.RESTORING);
});

test("1b. effective lifecycle is RESTORING even when shared state is STALE", () => {
  const effective = resolveEffectiveBassLifecycleState(true, BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION);
  assert.equal(effective, BASS_LIFECYCLE_STATE.RESTORING);
});

test("1c. effective lifecycle falls back to shared state when restore is not active", () => {
  const effective = resolveEffectiveBassLifecycleState(false, BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(effective, BASS_LIFECYCLE_STATE.COMPLETE);
});

test("1d. effective lifecycle falls back to IDLE when shared state is null and not restoring", () => {
  const effective = resolveEffectiveBassLifecycleState(false, null);
  assert.equal(effective, BASS_LIFECYCLE_STATE.IDLE);
});

// ── 2. CurrentDesignBar suppresses Current when restore active ─────────

test("2. deriveBassDisplayStatus(effective=RESTORING) shows 'Restoring previous design…' not 'Performance is current'", () => {
  // Simulate CurrentDesignBar: shared.bassLifecycleState is COMPLETE but
  // restore is active → effective lifecycle is RESTORING.
  const effective = resolveEffectiveBassLifecycleState(true, BASS_LIFECYCLE_STATE.COMPLETE);
  const display = deriveBassDisplayStatus(effective);
  assert.equal(display.text, "Restoring previous design\u2026");
  assert.notEqual(display.text, "Performance is current");
});

test("2a. deriveBassDisplayStatus(effective=RESTORING) has isCalculating=true (spinner, not check)", () => {
  const effective = resolveEffectiveBassLifecycleState(true, BASS_LIFECYCLE_STATE.COMPLETE);
  const display = deriveBassDisplayStatus(effective);
  assert.equal(display.isCalculating, true);
});

// ── 3. P20 / official bass results formatter suppresses Current ────────

test("3. formatOfficialBassResults with effective=RESTORING suppresses 'Performance is current' even when authority is AUTHORITATIVE", () => {
  const completedBassAuthority = makeAuthoritativeAuthority();
  // shared.bassLifecycleState is COMPLETE, but restore is active.
  const effective = resolveEffectiveBassLifecycleState(true, BASS_LIFECYCLE_STATE.COMPLETE);
  const result = formatOfficialBassResults(
    completedBassAuthority,
    { status: "idle" },
    [],
    Date.now(),
    false,
    {},
    null,
    effective,
  );
  assert.equal(result.statusText, "Restoring previous design\u2026");
  assert.notEqual(result.statusText, "Performance is current");
});

test("3a. P20 statusText during restore is 'Restoring previous design…' not 'Performance is current'", () => {
  const completedBassAuthority = makeAuthoritativeAuthority();
  const effective = resolveEffectiveBassLifecycleState(true, BASS_LIFECYCLE_STATE.COMPLETE);
  const result = formatOfficialBassResults(
    completedBassAuthority,
    { status: "idle" },
    [],
    Date.now(),
    false,
    {},
    null,
    effective,
  );
  // P20 pill retains its value (SEAT) — the design being restored TO.
  assert.equal(result.pills.p20.resultText, "SEAT");
  // But the status text is RESTORING.
  assert.equal(result.statusText, "Restoring previous design\u2026");
});

// ── 4. Restoring / Current never overlap ───────────────────────────────

test("4. when restoreActive=true, effective lifecycle is NEVER COMPLETE regardless of shared state", () => {
  const sharedStates = [
    BASS_LIFECYCLE_STATE.COMPLETE,
    BASS_LIFECYCLE_STATE.IDLE,
    BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION,
    BASS_LIFECYCLE_STATE.FAILED,
    BASS_LIFECYCLE_STATE.QUEUED,
    BASS_LIFECYCLE_STATE.PREPARING,
    null,
  ];
  for (const shared of sharedStates) {
    const effective = resolveEffectiveBassLifecycleState(true, shared);
    assert.equal(effective, BASS_LIFECYCLE_STATE.RESTORING, `shared=${shared} should yield RESTORING`);
    assert.notEqual(effective, BASS_LIFECYCLE_STATE.COMPLETE);
  }
});

test("4a. when restoreActive=true, statusText is never 'Performance is current' across all authority statuses", () => {
  const authorityStatuses = ["AUTHORITATIVE", "STALE", "NOT_VERIFIED", "LIMITED", "BLOCKED", "UPDATING"];
  for (const as of authorityStatuses) {
    const completedBassAuthority = makeAuthoritativeAuthority();
    completedBassAuthority.authorityStatus = as;
    completedBassAuthority.authoritative = as === "AUTHORITATIVE";
    const effective = resolveEffectiveBassLifecycleState(true, BASS_LIFECYCLE_STATE.COMPLETE);
    const result = formatOfficialBassResults(
      completedBassAuthority,
      { status: "idle" },
      [],
      Date.now(),
      false,
      {},
      null,
      effective,
    );
    assert.equal(
      result.statusText,
      "Restoring previous design\u2026",
      `authorityStatus=${as} should show RESTORING, got: ${result.statusText}`,
    );
    assert.notEqual(result.statusText, "Performance is current");
  }
});

// ── 5. Current / needs-updating never overlap ──────────────────────────

test("5. when restoreActive=true and shared state is STALE, effective is RESTORING (not STALE)", () => {
  const effective = resolveEffectiveBassLifecycleState(true, BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION);
  assert.equal(effective, BASS_LIFECYCLE_STATE.RESTORING);
  assert.notEqual(effective, BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION);
});

test("5a. deriveBassDisplayStatus(effective=RESTORING from STALE) shows 'Restoring…' not 'Needs recalculation' or 'Performance out of date'", () => {
  const effective = resolveEffectiveBassLifecycleState(true, BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION);
  const display = deriveBassDisplayStatus(effective);
  assert.equal(display.text, "Restoring previous design\u2026");
  assert.notEqual(display.text, "Performance out of date");
  assert.notEqual(display.text, "Needs recalculation");
});

// ── 6. Final coherent state returns to Current ─────────────────────────

test("6. when restore completes (restoreActive=false) and shared state is COMPLETE, effective is COMPLETE", () => {
  const effective = resolveEffectiveBassLifecycleState(false, BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(effective, BASS_LIFECYCLE_STATE.COMPLETE);
});

test("6a. deriveBassDisplayStatus(effective=COMPLETE after restore) shows 'Performance is current'", () => {
  const effective = resolveEffectiveBassLifecycleState(false, BASS_LIFECYCLE_STATE.COMPLETE);
  const display = deriveBassDisplayStatus(effective);
  assert.equal(display.text, "Performance is current");
});

test("6b. formatOfficialBassResults after restore (COMPLETE) shows 'Performance is current'", () => {
  const completedBassAuthority = makeAuthoritativeAuthority();
  const effective = resolveEffectiveBassLifecycleState(false, BASS_LIFECYCLE_STATE.COMPLETE);
  const result = formatOfficialBassResults(
    completedBassAuthority,
    { status: "idle" },
    [],
    Date.now(),
    false,
    {},
    null,
    effective,
  );
  assert.equal(result.statusText, "Performance is current");
});

// ── 7. Shared store integration: setRestoring drives the override ───────

test("7. setRestoring(true) makes isRestoring true — the hook's override source", () => {
  reset();
  assert.equal(isRestoring(PID, VID), false);
  setRestoring(PID, VID, true);
  assert.equal(isRestoring(PID, VID), true);
  // The effective lifecycle would be RESTORING.
  const effective = resolveEffectiveBassLifecycleState(isRestoring(PID, VID), BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(effective, BASS_LIFECYCLE_STATE.RESTORING);
  setRestoring(PID, VID, false);
  assert.equal(isRestoring(PID, VID), false);
  // After clearing, effective returns to shared state.
  const effectiveAfter = resolveEffectiveBassLifecycleState(isRestoring(PID, VID), BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(effectiveAfter, BASS_LIFECYCLE_STATE.COMPLETE);
  reset();
});

test("7a. override is scoped to the correct projectId/versionId key", () => {
  reset();
  setRestoring(PID, VID, true);
  assert.equal(isRestoring(PID, VID), true);
  // A different project is not affected.
  assert.equal(isRestoring("other-project", VID), false);
  assert.equal(isRestoring(PID, "other-version"), false);
  setRestoring(PID, VID, false);
  reset();
});

// ── 8. Full lifecycle: restore → coherent → current ─────────────────────

test("8. full lifecycle: COMPLETE → RESTORING → COMPLETE (no overlap)", () => {
  reset();
  // Start: current, no restore.
  let restoreActive = false;
  let sharedState = BASS_LIFECYCLE_STATE.COMPLETE;
  let effective = resolveEffectiveBassLifecycleState(restoreActive, sharedState);
  assert.equal(effective, BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(deriveBassDisplayStatus(effective).text, "Performance is current");

  // User presses Restore: setRestoring(true) fires synchronously.
  setRestoring(PID, VID, true);
  restoreActive = true;
  // shared.bassLifecycleState is still COMPLETE (BassBackgroundAnalysisOwner
  // hasn't re-rendered yet), but the override makes effective = RESTORING.
  effective = resolveEffectiveBassLifecycleState(restoreActive, sharedState);
  assert.equal(effective, BASS_LIFECYCLE_STATE.RESTORING);
  assert.equal(deriveBassDisplayStatus(effective).text, "Restoring previous design\u2026");
  assert.notEqual(deriveBassDisplayStatus(effective).text, "Performance is current");

  // Restore completes: setRestoring(false), shared state is COMPLETE.
  setRestoring(PID, VID, false);
  restoreActive = false;
  sharedState = BASS_LIFECYCLE_STATE.COMPLETE;
  effective = resolveEffectiveBassLifecycleState(restoreActive, sharedState);
  assert.equal(effective, BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(deriveBassDisplayStatus(effective).text, "Performance is current");

  reset();
});