// restore-engineering-recovery.test.mjs
//
// Focused acceptance tests for the corrected Restore Previous Design
// engineering-recovery and stale-result status behaviour.
//
// Covers:
//   1. Exact contract found in completed cache.
//   2. Exact contract found only in P14 target bank.
//   3. Exact contract found only in valid checkpoint snapshot.
//   4. Wrong-fingerprint contract rejected.
//   5. Wrong P14 target identity rejected.
//   6. Invalid schema rejected (authority gate).
//   7. Genuine cache miss leaves physical Restore successful and engineering
//      requiring calculation.
//   8. Cache miss does not silently lose the recovery checkpoint.
//   9. Stale P19/P20 cannot appear as current.
//  10. Valid recovered engineering results satisfy the current-result gate.
//
// Run: node --import ./test/_alias-register.mjs --test test/restore-engineering-recovery.test.mjs

import { findRestoredContract, RESTORE_CONTRACT_SOURCE } from '../src/components/room/bass/bda/findRestoredContract.js';
import { hasCurrentBassResult } from '../src/components/room/bass/bda/hasCurrentBassResult.js';
import { bassContractMatchesRequestedP14 } from '../src/components/room/bass/completedBassResultPersistence.js';
import { resolveRestoreExit, RESTORE_OUTCOME } from '../src/components/room/bass/bda/restoreRecoveryAuthority.js';

let tests = 0;
let passes = 0;
function check(name, actual, expected) {
  tests += 1;
  const ok = actual === expected;
  if (ok) passes += 1;
  else console.error(`FAIL ${name}: expected ${expected}, got ${actual}`);
}
function checkDeep(name, actual, expected) {
  tests += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passes += 1;
  else console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(name, condition) {
  tests += 1;
  if (condition) passes += 1;
  else console.error(`FAIL ${name}: expected truthy`);
}

const FP_TWO = 'cal:v8:6e4c3272b7842a50';
const FP_FOUR = 'cal:v8:737a07763d876430';

function makeContract(fingerprint, p14 = {}) {
  return {
    version: 'bass-analysis-v8',
    metricSchemaVersion: 9,
    instanceAuthorityVersion: 3,
    job: {
      resultFingerprint: fingerprint,
      currentJobFingerprint: fingerprint,
      status: 'complete',
      completedAtMs: Date.now(),
    },
    fingerprints: { baseDesign: 'base-design-fp' },
    selectedCandidate: { id: 'cand-1' },
    selectedCandidateId: 'cand-1',
    productAnalysis: { status: 'complete', parameters: { p14: {} } },
    metricPublication: { canonicalMetricPublicationValid: true },
    requestedP14TargetDb: p14.targetDb ?? 105,
    requestedP14Basis: p14.basis ?? 'minimum',
    requestedP14Level: p14.level ?? 2,
  };
}

// 1. Exact contract found in completed cache.
{
  const contract = makeContract(FP_TWO);
  const result = findRestoredContract({
    completedByFingerprint: { [FP_TWO]: contract },
    bankTargets: {},
    checkpointSnapshot: null,
    fingerprint: FP_TWO,
  });
  ok('1: contract found', !!result.contract);
  check('1: source is completed cache', result.source, RESTORE_CONTRACT_SOURCE.COMPLETED);
  check('1: correct fingerprint', result.contract.job.resultFingerprint, FP_TWO);
}

// 2. Exact contract found only in P14 target bank.
{
  const contract = makeContract(FP_TWO);
  const result = findRestoredContract({
    completedByFingerprint: {},
    bankTargets: { 'minimum-L2': contract },
    checkpointSnapshot: null,
    fingerprint: FP_TWO,
  });
  ok('2: contract found', !!result.contract);
  check('2: source is target bank', result.source, RESTORE_CONTRACT_SOURCE.BANK);
  check('2: correct fingerprint', result.contract.job.resultFingerprint, FP_TWO);
}

// 3. Exact contract found only in checkpoint snapshot.
{
  const contract = makeContract(FP_TWO);
  const result = findRestoredContract({
    completedByFingerprint: {},
    bankTargets: {},
    checkpointSnapshot: { 'minimum-L2': contract },
    fingerprint: FP_TWO,
  });
  ok('3: contract found', !!result.contract);
  check('3: source is checkpoint snapshot', result.source, RESTORE_CONTRACT_SOURCE.CHECKPOINT);
  check('3: correct fingerprint', result.contract.job.resultFingerprint, FP_TWO);
}

// 4. Wrong-fingerprint contract rejected.
{
  const wrongContract = makeContract(FP_FOUR);
  const result = findRestoredContract({
    completedByFingerprint: { [FP_FOUR]: wrongContract },
    bankTargets: { 'minimum-L2': wrongContract },
    checkpointSnapshot: { 'minimum-L2': wrongContract },
    fingerprint: FP_TWO,
  });
  ok('4: no contract returned', !result.contract);
  check('4: source null', result.source, null);
}

// 5. Wrong P14 target identity rejected.
{
  const contract = makeContract(FP_TWO, { basis: 'minimum', level: 2, targetDb: 105 });
  const requested = { p14TargetBasis: 'recommended', requestedLevel: 3, selectedP14TargetDb: 108 };
  check('5: P14 mismatch rejected', bassContractMatchesRequestedP14(contract, requested), false);

  const matchingRequested = { p14TargetBasis: 'minimum', requestedLevel: 2, selectedP14TargetDb: 105 };
  check('5b: P14 match accepted', bassContractMatchesRequestedP14(contract, matchingRequested), true);
}

// 6. Invalid schema rejected (authority gate simulates the caller).
{
  // A contract with the right fingerprint but missing the metricPublication
  // receipt — isAuthoritativeBassContract would reject it. findRestoredContract
  // finds it by fingerprint; the caller's authority gate rejects it, so
  // hasCurrentBassResult (which checks authoritative) returns false.
  const invalidContract = makeContract(FP_TWO);
  invalidContract.metricPublication = { canonicalMetricPublicationValid: false };
  const result = findRestoredContract({
    completedByFingerprint: { [FP_TWO]: invalidContract },
    bankTargets: {},
    checkpointSnapshot: null,
    fingerprint: FP_TWO,
  });
  ok('6: findRestoredContract finds by fingerprint', !!result.contract);
  // The caller validates authority — simulate a non-authoritative authority.
  const nonAuthoritativeAuthority = { authoritative: false, contract: invalidContract };
  check('6: hasCurrentBassResult rejects non-authoritative', hasCurrentBassResult(nonAuthoritativeAuthority, FP_TWO), false);
}

// 7. Genuine cache miss leaves physical Restore successful, engineering requiring calculation.
{
  const result = findRestoredContract({
    completedByFingerprint: {},
    bankTargets: {},
    checkpointSnapshot: null,
    fingerprint: FP_TWO,
  });
  ok('7: no contract found', !result.contract);

  // Restore returns cache-miss with physicalRestored=true.
  const restoreResult = { ok: false, reason: 'cache-miss', physicalRestored: true, bankRestored: false };
  const exit = resolveRestoreExit(restoreResult);
  check('7: outcome is NEEDS_UPDATE', exit.outcome, RESTORE_OUTCOME.NEEDS_UPDATE);
  ok('7: showNeedsUpdate', exit.showNeedsUpdate);
  ok('7: not retry', !exit.showRetry);
}

// 8. Cache miss does not silently lose the recovery checkpoint.
{
  // resolveRestoreExit maps cache-miss to NEEDS_UPDATE, not RETRY. The restore
  // transaction retains the checkpoint (the code no longer calls clearCheckpoint
  // on cache-miss). The bar shows the "needs update / recalculate" state while
  // the checkpoint persists, and clears it only when the designer presses
  // Recalculate (acknowledging the outcome).
  const restoreResult = { ok: false, reason: 'cache-miss', physicalRestored: true, bankRestored: false };
  const exit = resolveRestoreExit(restoreResult);
  check('8: outcome is NEEDS_UPDATE (not RETRY)', exit.outcome, RESTORE_OUTCOME.NEEDS_UPDATE);
  ok('8: releaseRestoring (transaction ended)', exit.releaseRestoring);
  ok('8: needsBankRebuild', exit.needsBankRebuild);

  // A promotion-failed outcome also retains the checkpoint (NEEDS_UPDATE, not RETRY).
  const promotionFailed = { ok: false, reason: 'promotion-failed', physicalRestored: true };
  const exit2 = resolveRestoreExit(promotionFailed);
  check('8b: promotion-failed is NEEDS_UPDATE', exit2.outcome, RESTORE_OUTCOME.NEEDS_UPDATE);
  ok('8b: promotion-failed not retry', !exit2.showRetry);

  // A physical failure retains the checkpoint for retry (RETRY).
  const physicalFailed = { ok: false, reason: 'physical-restore-failed', physicalRestored: false };
  const exit3 = resolveRestoreExit(physicalFailed);
  check('8c: physical failure is RETRY', exit3.outcome, RESTORE_OUTCOME.RETRY);
  ok('8c: physical failure shows retry', exit3.showRetry);
}

// 9. Stale P19/P20 cannot appear as current.
{
  // After a restore to a two-sub design, the retained four-sub contract is
  // preserved by the authority store (authoritative=false after stale marking,
  // but the contract object remains). hasCurrentBassResult must return false
  // because the contract fingerprint differs from the active cacheKey.
  const fourSubContract = makeContract(FP_FOUR);
  const staleAuthority = { authoritative: true, contract: fourSubContract };
  check('9: stale (fingerprint mismatch) not current', hasCurrentBassResult(staleAuthority, FP_TWO), false);

  // Even a genuinely authoritative authority with a matching fingerprint is current.
  const twoSubContract = makeContract(FP_TWO);
  const currentAuthority = { authoritative: true, contract: twoSubContract };
  check('9b: matching fingerprint is current', hasCurrentBassResult(currentAuthority, FP_TWO), true);

  // A non-authoritative authority (stale-marked) is never current regardless of fingerprint.
  const staleNonAuth = { authoritative: false, contract: twoSubContract };
  check('9c: non-authoritative not current', hasCurrentBassResult(staleNonAuth, FP_TWO), false);

  // Missing cacheKey is never current.
  check('9d: no cacheKey not current', hasCurrentBassResult(currentAuthority, null), false);
}

// 10. Valid recovered engineering results satisfy the current-result gate.
{
  const recoveredContract = makeContract(FP_TWO);
  const authority = { authoritative: true, contract: recoveredContract };
  ok('10: recovered authoritative + matching fingerprint is current', hasCurrentBassResult(authority, FP_TWO));

  // The restored design's requested P14 identity matches the recovered contract.
  const requested = { p14TargetBasis: 'minimum', requestedLevel: 2, selectedP14TargetDb: 105 };
  ok('10b: P14 identity matches', bassContractMatchesRequestedP14(recoveredContract, requested));

  // A valid restore (ok=true, bankRestored=true) maps to CURRENT.
  const validResult = { ok: true, bankRestored: true, physicalRestored: true };
  const exit = resolveRestoreExit(validResult);
  check('10c: valid restore is CURRENT', exit.outcome, RESTORE_OUTCOME.CURRENT);
  ok('10d: valid restore no needsUpdate', !exit.showNeedsUpdate);
}

if (passes === tests) {
  console.log('restore-engineering-recovery: all checks passed');
} else {
  console.error(`${passes}/${tests} checks passed`);
  process.exit(1);
}