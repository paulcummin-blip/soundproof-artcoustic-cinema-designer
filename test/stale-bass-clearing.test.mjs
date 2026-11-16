// test/stale-bass-clearing.test.mjs
//
// Validates that stale bass results are never displayed during recalculation.
// Run: node --import ./test/_alias-register.mjs --test test/stale-bass-clearing.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { BASS_LIFECYCLE_STATE } from "@/components/room/bass/bassCalculationLifecycle";
import { BASS_ANALYSIS_CONTRACT_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from "@/lib/bassAuthorityVersion";

// A structurally-complete AUTHORITATIVE authority (publicationVerified true)
// carrying real P14/P18/P19/P20 values, used as the "previous published result".
function makeAuthoritativeAuthority({ fingerprint = "fp-stale" } = {}) {
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
        seatResults: {
          P20: [
            { seatId: "s1", level: 1, value: 5 },
            { seatId: "s2", level: 2, value: 3 },
          ],
        },
      },
      selectedMode: "balanced",
    },
  };
}

const seatingPositions = [
  { id: "s1", row: 1, indexInRow: 1, priority: "primary" },
  { id: "s2", row: 1, indexInRow: 2, priority: "primary" },
];

test("1. AUTHORITATIVE + COMPLETE: values display normally", () => {
  const authority = makeAuthoritativeAuthority();
  const result = formatOfficialBassResults(
    authority, { status: "idle" }, seatingPositions, Date.now(), false, {}, null,
    BASS_LIFECYCLE_STATE.COMPLETE,
  );
  assert.equal(result.pills.p14.level, "L2", "P14 level shows when current");
  assert.equal(result.pills.p18.level, "L2", "P18 level shows when current");
  assert.equal(result.pills.p19.level, "L4", "P19 level shows when current");
  assert.equal(result.pills.p20.resultText, "SEAT", "P20 headline shows SEAT when current");
  assert.ok(result.p20Rows.length > 0, "P20 per-seat rows populate when current");
  assert.equal(result.perSeatP20Results.length, 2, "Per-seat P20 results present when current");
});

test("2. UPDATING (calculating) with previous published result: pills clear to calculating, P20 rows empty", () => {
  // The authority is AUTHORITATIVE (previous contract preserved), but a real
  // calculation is running (PREPARING). Previous values must NOT show.
  const authority = makeAuthoritativeAuthority();
  const result = formatOfficialBassResults(
    authority, { status: "running" }, seatingPositions, Date.now(), false, {}, null,
    BASS_LIFECYCLE_STATE.PREPARING,
  );
  assert.notEqual(result.pills.p14.level, "L2", "P14 previous level must NOT show during recalculation");
  assert.notEqual(result.pills.p18.level, "L2", "P18 previous level must NOT show during recalculation");
  assert.notEqual(result.pills.p19.level, "L4", "P19 previous level must NOT show during recalculation");
  assert.notEqual(result.pills.p20.resultText, "SEAT", "P20 previous SEAT headline must NOT show during recalculation");
  assert.equal(result.p20Rows.length, 0, "P20 per-seat rows must clear during recalculation");
  assert.equal(result.perSeatP20Results.length, 0, "Per-seat P20 results must clear during recalculation");
  assert.ok(result.isUpdating || result.isCalculatingWithPublishedResult, "Calculation indicator active");
});

test("3. STALE (design changed) with previous published result: pills clear, P20 rows empty", () => {
  // Authority is STALE — design moved on. Previous values must NOT show.
  const authority = makeAuthoritativeAuthority();
  authority.authorityStatus = "STALE";
  authority.authoritative = false;
  const result = formatOfficialBassResults(
    authority, { status: "idle" }, seatingPositions, Date.now(), false, {}, null,
    BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION,
  );
  assert.notEqual(result.pills.p14.level, "L2", "P14 previous level must NOT show when stale");
  assert.notEqual(result.pills.p18.level, "L2", "P18 previous level must NOT show when stale");
  assert.notEqual(result.pills.p19.level, "L4", "P19 previous level must NOT show when stale");
  assert.notEqual(result.pills.p20.resultText, "SEAT", "P20 previous headline must NOT show when stale");
  assert.equal(result.p20Rows.length, 0, "P20 per-seat rows must clear when stale");
  assert.equal(result.perSeatP20Results.length, 0, "Per-seat P20 results must clear when stale");
  assert.equal(result.isStale, true, "Stale flag set");
});

test("4. RESTORING: previous values remain visible (restore is not a recalculation)", () => {
  // Restore is a display override; the design being restored TO keeps its values.
  const authority = makeAuthoritativeAuthority();
  const result = formatOfficialBassResults(
    authority, { status: "idle" }, seatingPositions, Date.now(), false, {}, null,
    BASS_LIFECYCLE_STATE.RESTORING,
  );
  assert.equal(result.statusText, "Restoring previous design\u2026", "Restore status shows");
  assert.equal(result.pills.p20.resultText, "SEAT", "P20 retains value during restore");
  assert.ok(result.p20Rows.length > 0, "P20 rows remain during restore");
});

test("5. Calculation completes for a DIFFERENT design (fingerprint mismatch): must not display stale", () => {
  // A contract whose resultFingerprint does not match the current design's
  // currentFingerprint is not current. authorityStatus AUTHORITATIVE but the
  // contract is for an older fingerprint — publicationVerified stays true, but
  // if the lifecycle is STALE the pills must still clear.
  const authority = makeAuthoritativeAuthority({ fingerprint: "old-design-fp" });
  authority.currentFingerprint = "new-design-fp";
  const result = formatOfficialBassResults(
    authority, { status: "idle" }, seatingPositions, Date.now(), false, {}, null,
    BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION,
  );
  assert.equal(result.p20Rows.length, 0, "Stale fingerprint result must not show per-seat rows");
  assert.notEqual(result.pills.p18.level, "L2", "Stale fingerprint P18 must not show");
});