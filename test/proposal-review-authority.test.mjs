/**
 * proposal-review-authority.test.mjs
 * ----------------------------------
 * THE PROPOSAL REVIEW STATE, guarded.
 *
 * The Proposal Editor shows two things separately — the document's own evidence
 * check, and the generated copy awaiting approval — and the export dialog names
 * the exact sections that still need approval. Both are read from the
 * complete-document validation that has already run; this authority adds no rule
 * and changes no outcome, so what is guarded here is the CLASSIFICATION and the
 * SECTION it names, not any validation result.
 *
 * A regression here is what makes an export click look like nothing happened:
 * sections that cannot be named cannot be offered for review.
 *
 * Run: node --test test/proposal-review-authority.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REVIEW_FAMILY,
  resolveProposalReview,
  reviewFamilyOf,
} from '../base44/shared/proposalEdit/proposalReviewAuthority.js';
import { writerSectionsForMode } from '../base44/shared/proposalWriter/writerContractSchema.js';

/** The copy layer's own fields, with the real titles for the frozen mode. */
const fields = () => writerSectionsForMode('comparison')
  .map((def) => ({ section: def.section, title: def.title }));

/** The document's own prepared sections, in document order. */
const documentSections = () => [
  { section_type: 'cover', title: 'Cover' },
  { section_type: 'system_design_summary', title: 'System Options Summary' },
  { section_type: 'key_performance_highlights', title: 'Key Differences' },
  { section_type: 'dynamic_range', title: 'Dynamic Range' },
  { section_type: 'overall_design', title: 'Overall Design' },
  { section_type: 'appendix', title: 'Appendix' },
];

/** The unapproved-wording rejections the document check files, one per section. */
const unvalidated = (sectionType) => ({
  code: 'unvalidated_document_text',
  detail: `This section contains wording not approved by the copy validator: ${sectionType}`,
});

test('unapproved wording is named by section, in document order', () => {
  const review = resolveProposalReview({
    fields: fields(),
    validation: {
      valid: false,
      blocked_reason: 'This proposal contains generated copy that still needs your review.',
      document_sections: documentSections(),
      errors: [unvalidated('overall_design'), unvalidated('dynamic_range'), unvalidated('system_design_summary')],
    },
  });

  assert.equal(review.copy.awaiting, 3);
  assert.deepEqual(
    review.copy.items.map((item) => item.label),
    ['System Options Summary', 'Dynamic Range', 'Overall Design'],
  );
  assert.deepEqual(
    review.copy.items.map((item) => item.target_section_type),
    ['system_design_summary', 'dynamic_range', 'overall_design'],
  );
  // Unapproved wording is a copy matter: the evidence check still passed.
  assert.equal(review.evidence.passed, true);
});

test('a writer-contract rejection is named by its section and opens it', () => {
  const review = resolveProposalReview({
    fields: fields(),
    validation: {
      valid: false,
      document_sections: documentSections(),
      errors: [{ code: 'invented_benefit', section: 'dynamic_range', detail: 'invented benefit' }],
    },
  });

  assert.equal(review.copy.awaiting, 1);
  assert.equal(review.copy.items[0].target_section_type, 'dynamic_range');
  assert.match(review.copy.items[0].label, /Dynamic Range/);
  assert.match(review.copy.items[0].reason, /benefit/i);
});

test('a missing required section names the section it is missing', () => {
  const review = resolveProposalReview({
    fields: fields(),
    validation: {
      valid: false,
      document_sections: documentSections(),
      errors: [{ code: 'required_section_missing', detail: 'Required copy is missing: timbre_matching' }],
    },
  });

  assert.equal(review.copy.awaiting, 1);
  assert.equal(review.copy.items[0].target_section_type, 'timbre_matching');
});

test('an engineering failure is an evidence check, never unapproved wording', () => {
  const review = resolveProposalReview({
    fields: fields(),
    validation: {
      valid: false,
      blocked_reason: 'The saved engineering evidence no longer matches this copy.',
      document_sections: documentSections(),
      errors: [{ code: 'frozen_evidence_mismatch', detail: 'frozen evidence mismatch' }],
    },
  });

  assert.equal(review.evidence.passed, false);
  assert.equal(review.evidence.blockers.length, 1);
  // Nothing is offered for review, because nothing about the wording is at fault.
  assert.equal(review.copy.awaiting, 0);
  assert.deepEqual(review.copy.items, []);
});

test('a valid document needs no review at all', () => {
  const review = resolveProposalReview({
    fields: fields(),
    validation: { valid: true, document_sections: documentSections(), errors: [] },
  });

  assert.equal(review.valid, true);
  assert.equal(review.evidence.passed, true);
  assert.equal(review.copy.awaiting, 0);
});

test('the two families are classified apart', () => {
  for (const code of ['frozen_input_missing', 'frozen_evidence_mismatch', 'engineering_snapshot_missing']) {
    assert.equal(reviewFamilyOf(code), REVIEW_FAMILY.EVIDENCE, code);
  }
  for (const code of ['copy_not_valid', 'unvalidated_document_text', 'invented_benefit', 'option_copy_missing']) {
    assert.equal(reviewFamilyOf(code), REVIEW_FAMILY.COPY, code);
  }
});