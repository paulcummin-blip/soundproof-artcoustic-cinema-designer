// test/design-rating-publication-authority.test.mjs
// --------------------------------------------------
// Tests for the Design Rating publication readiness gate.
//
// Verifies that a partial numeric Design Rating (e.g. 68/63/66 with
// P14/P18/P19/P20 excluded) is NEVER published while bass authority is
// provisional, and that a complete rating (88/71/82) publishes only when
// bass is ready or verified retained same-fingerprint bass exists.
//
// These tests exercise the pure predicate + retention logic only. No RP22
// scoring, bass simulation, seat scope, or fingerprint logic is changed.

import {
  isDesignRatingPublishable,
  isRetainedSummaryStillValid,
} from '../src/components/state/designRatingPublicationAuthority.js';
import assert from 'node:assert/strict';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── isDesignRatingPublishable ──

test('A: provisional bass + no retained authority → NOT publishable', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: true, reason: 'hydration-loading', fingerprint: 'fp-123' },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, false);
});

test('A2: provisional bass (loading) + no retained → NOT publishable', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: true, reason: 'loading', fingerprint: 'fp-123' },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, false);
});

test('A3: bass-not-yet-computed + no retained → NOT publishable', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: true, reason: 'bass-not-yet-computed', fingerprint: null },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, false);
});

test('B: provisional bass + valid same-fingerprint retained authority → publishable', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: true, reason: 'loading', fingerprint: 'fp-123' },
    retainedFromRefresh: true,
    isP14TargetUnselected: false,
  });
  assert.equal(result, true);
});

test('C: live ready bass → publishable', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: true, pending: false, reason: 'authoritative', fingerprint: 'fp-123' },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, true);
});

test('C2: no-applicable-bass (settled) → publishable', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: true, pending: false, reason: 'no-applicable-bass', fingerprint: null },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, true);
});

test('C3: blocked (settled) → publishable', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: true, pending: false, reason: 'blocked', fingerprint: null },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, true);
});

test('D: stale retained fingerprint → NOT publishable (retained must match)', () => {
  // retainedFromRefresh is only true when fingerprints match; a stale
  // fingerprint means retainedFromRefresh is false, so not publishable.
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: true, reason: 'fingerprint-mismatch', fingerprint: 'fp-NEW' },
    retainedFromRefresh: false, // stale fingerprint → retained not active
    isP14TargetUnselected: false,
  });
  assert.equal(result, false);
});

test('E: partial bass cannot publish (fingerprint mismatch, no retained)', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: true, reason: 'fingerprint-mismatch', fingerprint: 'fp-NEW' },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, false);
});

test('F: N/A parameters do not block readiness (no-applicable-bass is ready)', () => {
  // When bass is genuinely N/A (no subwoofer), bassReadiness.ready is true
  // and the rating publishes with bass parameters excluded as N/A.
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: true, pending: false, reason: 'no-applicable-bass', fingerprint: null },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, true);
});

test('G: Not Calculated / pending expected bass DOES block numeric publication', () => {
  // bassApplicable + UNCALCULATED → bassReadiness.pending = true → not publishable
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: true, reason: 'bass-not-yet-computed', fingerprint: null },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, false);
});

test('G2: hydration-loading blocks numeric publication', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: true, reason: 'hydration-loading', fingerprint: null },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, false);
});

test('H: bass ready + summary not joined → sidebar neutral (not publishable until joined)', () => {
  // This models the race: bass simulation says ready but the Design Rating
  // handoff hasn't joined yet. bassReadiness.ready is false until the
  // authority joins. isPublishable is false → sidebar shows neutral.
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: true, reason: 'loading', fingerprint: 'fp-123' },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, false);
});

test('I: once joined, sidebar becomes complete settled rating', () => {
  // After bass authority joins, bassReadiness.ready becomes true → publishable.
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: true, pending: false, reason: 'authoritative', fingerprint: 'fp-123' },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, true);
});

test('J: 68/63/66 regression fixture never publishes numerically', () => {
  // The 68/63/66 transient occurs when bass is provisional (hydration-loading)
  // with no retained authority. This must never be publishable.
  const transientState = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: true, reason: 'hydration-loading', fingerprint: 'fp-123' },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(transientState, false, '68/63/66 transient must NOT be publishable');

  // The settled 88/71/82 occurs when bass is authoritative.
  const settledState = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: true, pending: false, reason: 'authoritative', fingerprint: 'fp-123' },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(settledState, true, '88/71/82 settled must be publishable');
});

test('minimum system not met → NOT publishable', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: false,
    bassReadiness: { ready: true, pending: false, reason: 'authoritative', fingerprint: 'fp-123' },
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(result, false);
});

test('P14 target unselected → NOT publishable (distinct state)', () => {
  const result = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: { ready: false, pending: false, reason: 'p14-target-not-selected', fingerprint: null },
    retainedFromRefresh: false,
    isP14TargetUnselected: true,
  });
  assert.equal(result, false);
});

// ── isRetainedSummaryStillValid ──

test('retained summary valid when all identity matches', () => {
  const existing = {
    projectId: 'proj-1',
    versionId: 'ver-1',
    rating: { seatPriorityFingerprint: 'seat-fp-1' },
    engineeringSummary: { project: {} },
    calculationFingerprint: 'bass-fp-1',
  };
  const result = isRetainedSummaryStillValid(existing, {
    projectId: 'proj-1',
    versionId: 'ver-1',
    seatPriorityFingerprint: 'seat-fp-1',
    bassFingerprint: 'bass-fp-1',
  });
  assert.equal(result, true);
});

test('retained summary invalid when bass fingerprint changed', () => {
  const existing = {
    projectId: 'proj-1',
    versionId: 'ver-1',
    rating: { seatPriorityFingerprint: 'seat-fp-1' },
    engineeringSummary: { project: {} },
    calculationFingerprint: 'bass-fp-OLD',
  };
  const result = isRetainedSummaryStillValid(existing, {
    projectId: 'proj-1',
    versionId: 'ver-1',
    seatPriorityFingerprint: 'seat-fp-1',
    bassFingerprint: 'bass-fp-NEW',
  });
  assert.equal(result, false);
});

test('retained summary invalid when seat priority fingerprint changed', () => {
  const existing = {
    projectId: 'proj-1',
    versionId: 'ver-1',
    rating: { seatPriorityFingerprint: 'seat-fp-OLD' },
    engineeringSummary: { project: {} },
    calculationFingerprint: 'bass-fp-1',
  };
  const result = isRetainedSummaryStillValid(existing, {
    projectId: 'proj-1',
    versionId: 'ver-1',
    seatPriorityFingerprint: 'seat-fp-NEW',
    bassFingerprint: 'bass-fp-1',
  });
  assert.equal(result, false);
});

test('retained summary invalid when version changed', () => {
  const existing = {
    projectId: 'proj-1',
    versionId: 'ver-1',
    rating: { seatPriorityFingerprint: 'seat-fp-1' },
    engineeringSummary: { project: {} },
    calculationFingerprint: 'bass-fp-1',
  };
  const result = isRetainedSummaryStillValid(existing, {
    projectId: 'proj-1',
    versionId: 'ver-2',
    seatPriorityFingerprint: 'seat-fp-1',
    bassFingerprint: 'bass-fp-1',
  });
  assert.equal(result, false);
});

test('retained summary invalid when existing has no engineeringSummary', () => {
  const existing = {
    projectId: 'proj-1',
    versionId: 'ver-1',
    rating: { seatPriorityFingerprint: 'seat-fp-1' },
    engineeringSummary: null,
    calculationFingerprint: 'bass-fp-1',
  };
  const result = isRetainedSummaryStillValid(existing, {
    projectId: 'proj-1',
    versionId: 'ver-1',
    seatPriorityFingerprint: 'seat-fp-1',
    bassFingerprint: 'bass-fp-1',
  });
  assert.equal(result, false);
});

test('retained summary invalid when existing has no rating (neutral)', () => {
  const existing = {
    projectId: 'proj-1',
    versionId: 'ver-1',
    rating: null,
    engineeringSummary: { project: {} },
    calculationFingerprint: 'bass-fp-1',
  };
  const result = isRetainedSummaryStillValid(existing, {
    projectId: 'proj-1',
    versionId: 'ver-1',
    seatPriorityFingerprint: 'seat-fp-1',
    bassFingerprint: 'bass-fp-1',
  });
  assert.equal(result, false);
});

// ── Run ──

let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed (${tests.length} total)`);
if (failed > 0) process.exit(1);