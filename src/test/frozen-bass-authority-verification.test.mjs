// frozen-bass-authority-verification.test.mjs
// ---------------------------------------------------------------------------
// Tests for the frozen bass authority verification used by the frozen report
// bass reader.

import test from "node:test";
import assert from "node:assert/strict";
import { verifyFrozenBassAuthority } from "../components/report/frozenBassAuthorityVerification.js";

test('1. Valid frozen bass authority passes with fully verified evidence', () => {
  const bassFp = 'fp-123';
  const publication = { provenance: { bass_fingerprint: bassFp } };
  const rows = [{
    status: 'complete',
    completed_by_fingerprint: {
      [bassFp]: { job: { resultFingerprint: bassFp } },
    },
  }];
  const result = verifyFrozenBassAuthority(rows, publication, () => true);
  assert.equal(result.verified, true);
  assert.equal(result.reason, null);
});

test('2. Mismatched frozen bass evidence fails', () => {
  const bassFp = 'fp-123';
  const publication = { provenance: { bass_fingerprint: bassFp } };
  const rows = [{
    status: 'complete',
    completed_by_fingerprint: {
      [bassFp]: { job: { resultFingerprint: 'different-fp' } },
    },
  }];
  const result = verifyFrozenBassAuthority(rows, publication, () => true);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'no-matching-complete-contract');
});

test('2b. Incomplete frozen bass evidence (no matching row) fails', () => {
  const bassFp = 'fp-123';
  const publication = { provenance: { bass_fingerprint: bassFp } };
  const rows = [];
  const result = verifyFrozenBassAuthority(rows, publication, () => true);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'no-matching-complete-contract');
});

test('2c. Non-authoritative contract fails', () => {
  const bassFp = 'fp-123';
  const publication = { provenance: { bass_fingerprint: bassFp } };
  const rows = [{
    status: 'complete',
    completed_by_fingerprint: {
      [bassFp]: { job: { resultFingerprint: bassFp } },
    },
  }];
  const result = verifyFrozenBassAuthority(rows, publication, () => false);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'contract-not-authoritative');
});

test('2d. Retained evidence fingerprint mismatch fails', () => {
  const bassFp = 'fp-123';
  const publication = {
    provenance: { bass_fingerprint: bassFp },
    bass_evidence: { fingerprint: 'wrong-fp', graphPayload: { postEqRspCurve: [] } },
  };
  const rows = [{
    status: 'complete',
    completed_by_fingerprint: {
      [bassFp]: { job: { resultFingerprint: bassFp } },
    },
  }];
  const result = verifyFrozenBassAuthority(rows, publication, () => true);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'retained-fingerprint-mismatch');
});

test('2e. Retained graph payload mismatch fails', () => {
  const bassFp = 'fp-123';
  const cacheCurve = [{ frequency: 20, spl: 90 }];
  const retainedCurve = [{ frequency: 20, spl: 95 }];
  const publication = {
    provenance: { bass_fingerprint: bassFp },
    bass_evidence: {
      fingerprint: bassFp,
      graphPayload: { postEqRspCurve: retainedCurve },
    },
  };
  const rows = [{
    status: 'complete',
    completed_by_fingerprint: {
      [bassFp]: {
        job: { resultFingerprint: bassFp },
        graphPayload: { postEqRspCurve: cacheCurve },
      },
    },
  }];
  const result = verifyFrozenBassAuthority(rows, publication, () => true);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'retained-graph-mismatch');
});

test('2f. Non-complete cache row is ignored', () => {
  const bassFp = 'fp-123';
  const publication = { provenance: { bass_fingerprint: bassFp } };
  const rows = [{
    status: 'updating',
    completed_by_fingerprint: {
      [bassFp]: { job: { resultFingerprint: bassFp } },
    },
  }];
  const result = verifyFrozenBassAuthority(rows, publication, () => true);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'no-matching-complete-contract');
});

test('2g. No bass fingerprint in publication fails', () => {
  const result = verifyFrozenBassAuthority([], { provenance: {} }, () => true);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'no-bass-fingerprint');
});