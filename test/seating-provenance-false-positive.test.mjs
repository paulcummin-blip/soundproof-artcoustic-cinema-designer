// seating-provenance-false-positive.test.mjs
// Tests that the Seating Apply provenance authority correctly rejects
// false positives and accepts genuine Apply actions.
//
// Test cases:
//   1. Matching coordinates with no provenance → NOT APPLIED
//   2. Old candidate provenance → NOT APPLIED
//   3. Wrong baseline → NOT APPLIED
//   4. Successful current Apply → APPLIED
//   5. Stale rejected Apply → NOT APPLIED
//
// Run: node --import ./test/_alias-register.mjs test/seating-provenance-false-positive.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSeatingProvenanceApplied } from '@/components/room/bass/improveBassV2/seatingProvenanceAuthority';
import { buildProvenance } from '@/components/room/bass/improveBassV2/appliedProvenance';

const WINNER_APPLY_FINGERPRINT = 'baseline-fp-123';
const POST_MUTATION_FINGERPRINT = 'post-mutation-fp-456';
const CANDIDATE_ID = 'seating:-400';
const STAGE_KEY = 'seating_positions';

const stageResult = {
  result: {
    candidateId: CANDIDATE_ID,
    seatingOffsetMm: -400,
  },
};

test('Seating provenance false-positive rejection', async (t) => {
  await t.test('1. Matching coordinates with no provenance → NOT APPLIED', () => {
    const result = isSeatingProvenanceApplied(null, stageResult, WINNER_APPLY_FINGERPRINT);
    assert.equal(result, false);
  });

  await t.test('2. Old candidate provenance → NOT APPLIED', () => {
    const oldProvenance = buildProvenance(
      STAGE_KEY,
      'seating:+200', // different candidate
      WINNER_APPLY_FINGERPRINT,
      POST_MUTATION_FINGERPRINT,
    );
    const result = isSeatingProvenanceApplied(oldProvenance, stageResult, WINNER_APPLY_FINGERPRINT);
    assert.equal(result, false);
  });

  await t.test('3. Wrong baseline → NOT APPLIED', () => {
    const wrongBaseline = buildProvenance(
      STAGE_KEY,
      CANDIDATE_ID,
      'wrong-baseline-fp', // wrong baseline
      POST_MUTATION_FINGERPRINT,
    );
    const result = isSeatingProvenanceApplied(wrongBaseline, stageResult, WINNER_APPLY_FINGERPRINT);
    assert.equal(result, false);
  });

  await t.test('4. Successful current Apply → APPLIED', () => {
    const validProvenance = buildProvenance(
      STAGE_KEY,
      CANDIDATE_ID,
      WINNER_APPLY_FINGERPRINT,
      POST_MUTATION_FINGERPRINT,
    );
    const result = isSeatingProvenanceApplied(validProvenance, stageResult, WINNER_APPLY_FINGERPRINT);
    assert.equal(result, true);
  });

  await t.test('5. Stale rejected Apply (missing appliedFingerprint) → NOT APPLIED', () => {
    const staleProvenance = {
      stageKey: STAGE_KEY,
      candidateId: CANDIDATE_ID,
      baselineFingerprint: WINNER_APPLY_FINGERPRINT,
      appliedFingerprint: null, // missing → stale
    };
    const result = isSeatingProvenanceApplied(staleProvenance, stageResult, WINNER_APPLY_FINGERPRINT);
    assert.equal(result, false);
  });

  await t.test('6. Wrong stageKey → NOT APPLIED', () => {
    const wrongStage = buildProvenance(
      'subPositions', // wrong stage
      CANDIDATE_ID,
      WINNER_APPLY_FINGERPRINT,
      POST_MUTATION_FINGERPRINT,
    );
    const result = isSeatingProvenanceApplied(wrongStage, stageResult, WINNER_APPLY_FINGERPRINT);
    assert.equal(result, false);
  });

  await t.test('7. Missing stageResult → NOT APPLIED', () => {
    const validProvenance = buildProvenance(
      STAGE_KEY,
      CANDIDATE_ID,
      WINNER_APPLY_FINGERPRINT,
      POST_MUTATION_FINGERPRINT,
    );
    const result = isSeatingProvenanceApplied(validProvenance, null, WINNER_APPLY_FINGERPRINT);
    assert.equal(result, false);
  });

  await t.test('8. Missing winnerApplyFingerprint → NOT APPLIED', () => {
    const validProvenance = buildProvenance(
      STAGE_KEY,
      CANDIDATE_ID,
      WINNER_APPLY_FINGERPRINT,
      POST_MUTATION_FINGERPRINT,
    );
    const result = isSeatingProvenanceApplied(validProvenance, stageResult, null);
    assert.equal(result, false);
  });
});