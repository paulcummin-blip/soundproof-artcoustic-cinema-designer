/**
 * completed-bass-retention-budget.test.mjs
 * -----------------------------------------
 * Regression test for the completed-bass persistence write-volume defect.
 *
 * The client-side retention in buildPersistedBassAuthority previously exempted
 * the first two completed contracts from the 1.25 MB budget. Two ~1.06 MB
 * contracts therefore combined into a ~2.12 MB ProjectAnalysisCache update
 * that the platform refused with HTTP 429 (App entity write traffic volume
 * limit exceeded), and the engineering publication was never reached.
 *
 * The fix enforces the budget on every non-current contract while always
 * protecting the currently selected authoritative contract. This test proves:
 *
 *   1. Two oversized contracts no longer combine past the budget.
 *   2. The current authoritative contract is always retained.
 *   3. A second contract that fits within the remaining budget is still kept.
 *   4. The 4 → 2 → 4 crossover does not resend the full two-contract map.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPersistedBassAuthority } from '../src/components/room/bass/completedBassResultPersistence.js';
import { COMPLETED_BASS_CACHE_VERSION, INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from '../src/lib/bassAuthorityVersion.js';

const BUDGET = 1250000;

function makeSnapshot(fp, sizeChars, completedAtMs = Date.now()) {
  return {
    version: 24,
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    job: { status: 'complete', resultFingerprint: fp, currentJobFingerprint: fp, completedAtMs },
    selectedCandidateId: 'cand-' + fp,
    selectedCandidate: { id: 'cand-' + fp, perSeatP20Results: [] },
    productAnalysis: { status: 'complete', parameters: {} },
    graphPayload: { postEqRspCurve: [{ hz: 20, db: 0 }], correctionCurve: [], data: 'x'.repeat(sizeChars) },
    assessmentEnvelope: { achievedP18FrequencyHz: 20, assessmentStartHz: 20, assessmentEndHz: 160, p19TargetIdentity: 'house-curve-target' },
    bassResult: {},
    metricPublication: { canonicalMetricPublicationValid: true },
  };
}

function makeExisting(map) {
  return {
    version: COMPLETED_BASS_CACHE_VERSION,
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    completedByFingerprint: map,
  };
}

test('two oversized contracts do not combine past the write budget', () => {
  // Each contract is ~1.06 MB — two would combine to ~2.12 MB, above the
  // platform's write limit. The first-two exemption that allowed this is removed.
  const sizeEach = 1060000;
  const fpA = 'cal:four-sub';
  const fpB = 'cal:two-sub';
  const existing = makeExisting({ [fpA]: makeSnapshot(fpA, sizeEach, 1000) });
  // Switching to two-sub: fpB is now current, fpA is the previous result.
  const saved = buildPersistedBassAuthority(existing, fpB, makeSnapshot(fpB, sizeEach, 2000));
  assert.equal(saved.status, 'complete');
  // The current contract (fpB) is always retained.
  assert.ok(saved.completedByFingerprint[fpB], 'current contract must be retained');
  // The previous contract (fpA) is pruned because it would exceed the budget.
  assert.ok(!saved.completedByFingerprint[fpA], 'previous oversized contract must be pruned');
  // The total serialised map is under the budget.
  const totalBytes = JSON.stringify(saved.completedByFingerprint).length;
  assert.ok(totalBytes <= BUDGET, `total ${totalBytes} must not exceed budget ${BUDGET}`);
});

test('the current authoritative contract is always retained even when it alone exceeds the budget', () => {
  // A single contract larger than the budget is still kept — it is the
  // authority. It is never silently truncated; an oversized current contract
  // produces an explicit write failure (HTTP 429) instead.
  const sizeOver = 1400000;
  const fp = 'cal:huge';
  const existing = makeExisting({});
  const saved = buildPersistedBassAuthority(existing, fp, makeSnapshot(fp, sizeOver));
  assert.equal(saved.status, 'complete');
  assert.ok(saved.completedByFingerprint[fp], 'current contract must be retained even when oversized');
});

test('a second contract that fits within the remaining budget is retained', () => {
  // When the current contract is small, a second contract that fits within
  // the remaining budget is still kept. The fix only removes the EXEMPTION,
  // not the budget itself.
  const smallCurrent = 200000;
  const smallOther = 300000;
  const fpCurrent = 'cal:current';
  const fpOther = 'cal:other';
  const existing = makeExisting({ [fpOther]: makeSnapshot(fpOther, smallOther, 1000) });
  const saved = buildPersistedBassAuthority(existing, fpCurrent, makeSnapshot(fpCurrent, smallCurrent, 2000));
  assert.ok(saved.completedByFingerprint[fpCurrent], 'current contract retained');
  assert.ok(saved.completedByFingerprint[fpOther], 'second contract within budget retained');
  const totalBytes = JSON.stringify(saved.completedByFingerprint).length;
  assert.ok(totalBytes <= BUDGET, `total ${totalBytes} within budget`);
});

test('4 → 2 → 4 crossover does not resend a two-contract oversized map', () => {
  // Simulate the reported scenario: calculate 4-sub, switch to 2-sub,
  // then return to 4-sub. Each contract is ~1.06 MB.
  const sizeEach = 1060000;
  const fp4 = 'cal:four-sub';
  const fp2 = 'cal:two-sub';

  // Step 1: 4-sub calculation. Map = {fp4}.
  const step1 = buildPersistedBassAuthority(makeExisting({}), fp4, makeSnapshot(fp4, sizeEach, 1000));
  assert.ok(step1.completedByFingerprint[fp4]);
  assert.ok(JSON.stringify(step1.completedByFingerprint).length <= BUDGET);

  // Step 2: switch to 2-sub. fp2 is current, fp4 is previous. fp4 is pruned.
  const step2 = buildPersistedBassAuthority(
    makeExisting(step1.completedByFingerprint), fp2, makeSnapshot(fp2, sizeEach, 2000),
  );
  assert.ok(step2.completedByFingerprint[fp2], 'new current (2-sub) retained');
  assert.ok(!step2.completedByFingerprint[fp4], 'previous 4-sub pruned to stay within budget');
  assert.ok(JSON.stringify(step2.completedByFingerprint).length <= BUDGET);

  // Step 3: return to 4-sub. fp4 is current again. fp2 is previous and pruned.
  // The 4-sub contract was evicted from the completed map in step 2, but it
  // survives in the P14 target bank and engineering publications — those are
  // separate persistence paths. The completed-map write does not resend both.
  const step3 = buildPersistedBassAuthority(
    makeExisting(step2.completedByFingerprint), fp4, makeSnapshot(fp4, sizeEach, 3000),
  );
  assert.ok(step3.completedByFingerprint[fp4], 'returned 4-sub retained as current');
  assert.ok(!step3.completedByFingerprint[fp2], '2-sub pruned to stay within budget');
  assert.ok(JSON.stringify(step3.completedByFingerprint).length <= BUDGET);
});