//
// The bounded wording-correction gate.
//
// A draft is eligible for one automatic wording correction only when every
// rejection it received is a purely lexical or stylistic violation. A single
// engineering, numerical, product, scope, citation, grounding or evidence
// rejection makes the whole set ineligible: the draft is left for the existing
// validation-failed / needs-human-review path, never handed to the writer for an
// automatic fix that could change an engineering fact.
//
// No GPT call is made here, no entity is written.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  WORDING_CORRECTION_ELIGIBLE_REJECTIONS,
  WORDING_CORRECTION_REASON,
  isEligibleForWordingCorrection,
} from '../base44/shared/proposalWriter/writerCorrectionPolicy.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';

const v = (code, extra = {}) => ({ code, ...extra });

test('the allowlist contains only wording-only rejections', () => {
  assert.ok(WORDING_CORRECTION_ELIGIBLE_REJECTIONS.includes(WRITER_REJECTION.GENERIC_MARKETING_PHRASE));
  assert.ok(WORDING_CORRECTION_ELIGIBLE_REJECTIONS.includes(WRITER_REJECTION.EM_DASH_IN_NARRATIVE));
  assert.ok(WORDING_CORRECTION_ELIGIBLE_REJECTIONS.includes(WRITER_REJECTION.STOCK_CONNECTIVE));
  assert.ok(WORDING_CORRECTION_ELIGIBLE_REJECTIONS.includes(WRITER_REJECTION.REPETITIVE_PARAGRAPH_OPENER));
  assert.ok(WORDING_CORRECTION_ELIGIBLE_REJECTIONS.includes(WRITER_REJECTION.REPORT_VOICE));
  assert.ok(WORDING_CORRECTION_ELIGIBLE_REJECTIONS.includes(WRITER_REJECTION.VALIDATION_REGISTER));
});

test('engineering, numerical, product, scope, citation and evidence rejections are NOT in the allowlist', () => {
  const notEligible = [
    WRITER_REJECTION.UNSUPPORTED_CLAIM,
    WRITER_REJECTION.BLOCKED_CLAIM,
    WRITER_REJECTION.MISSING_CLAIM_ID,
    WRITER_REJECTION.INVENTED_BENEFIT,
    WRITER_REJECTION.CHANGED_PARAMETER_VALUE,
    WRITER_REJECTION.CHANGED_LEVEL,
    WRITER_REJECTION.UNSELECTED_PRODUCT,
    WRITER_REJECTION.EXTRA_PRODUCT,
    WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION,
    WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT,
    WRITER_REJECTION.P20_BASS_CONTRADICTION,
    WRITER_REJECTION.SCOPE_MISMATCH,
    WRITER_REJECTION.SCHEMA_VIOLATION,
    WRITER_REJECTION.SECTION_TOO_LONG,
    WRITER_REJECTION.DESIGN_STAGE_COMMENTARY,
    WRITER_REJECTION.MULTI_CABINET_CHANNEL,
  ];
  for (const code of notEligible) {
    assert.equal(
      WORDING_CORRECTION_ELIGIBLE_REJECTIONS.includes(code),
      false,
      `${code} must not be eligible for wording correction`,
    );
  }
});

test('a single generic_marketing_phrase is eligible', () => {
  const result = isEligibleForWordingCorrection([v(WRITER_REJECTION.GENERIC_MARKETING_PHRASE)]);
  assert.equal(result.eligible, true);
  assert.equal(result.reason, WORDING_CORRECTION_REASON);
  assert.deepEqual(result.eligible_rule_ids, [WRITER_REJECTION.GENERIC_MARKETING_PHRASE]);
});

test('multiple wording-only rejections are eligible together', () => {
  const result = isEligibleForWordingCorrection([
    v(WRITER_REJECTION.GENERIC_MARKETING_PHRASE),
    v(WRITER_REJECTION.EM_DASH_IN_NARRATIVE),
    v(WRITER_REJECTION.STOCK_CONNECTIVE),
  ]);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.eligible_rule_ids, [
    WRITER_REJECTION.GENERIC_MARKETING_PHRASE,
    WRITER_REJECTION.EM_DASH_IN_NARRATIVE,
    WRITER_REJECTION.STOCK_CONNECTIVE,
  ]);
});

test('a single engineering rejection makes the whole set ineligible', () => {
  const result = isEligibleForWordingCorrection([
    v(WRITER_REJECTION.GENERIC_MARKETING_PHRASE),
    v(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
  ]);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, null);
  assert.deepEqual(result.eligible_rule_ids, []);
});

test('a product mismatch alone is ineligible', () => {
  const result = isEligibleForWordingCorrection([v(WRITER_REJECTION.UNSELECTED_PRODUCT)]);
  assert.equal(result.eligible, false);
});

test('a schema violation alone is ineligible', () => {
  const result = isEligibleForWordingCorrection([v(WRITER_REJECTION.SCHEMA_VIOLATION)]);
  assert.equal(result.eligible, false);
});

test('an empty violation list is not eligible (a valid draft needs no correction)', () => {
  const result = isEligibleForWordingCorrection([]);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, null);
});

test('a missing or malformed code is treated as ineligible', () => {
  const result = isEligibleForWordingCorrection([{ code: null }, v(WRITER_REJECTION.GENERIC_MARKETING_PHRASE)]);
  assert.equal(result.eligible, false);
});

test('the Cable Smart failure (generic_marketing_phrase with immersive sound) is eligible', () => {
  // The exact rejection that blocked gen_8d0ed828: a generic marketing phrase
  // matched in the what_changes section. This is the regression fixture.
  const result = isEligibleForWordingCorrection([
    v(WRITER_REJECTION.GENERIC_MARKETING_PHRASE, {
      section: 'what_changes',
      detail: 'generic_marketing_phrase:immersive_sound',
      rule_id: 'natural_writing:immersive_sound',
    }),
  ]);
  assert.equal(result.eligible, true);
  assert.equal(result.reason, WORDING_CORRECTION_REASON);
});