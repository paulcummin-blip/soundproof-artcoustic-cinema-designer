/**
 * proposalReviewAuthority.js (shared)
 * -----------------------------------
 * WHAT STILL NEEDS A HUMAN, read from the document check that has already run.
 *
 * The complete-document validation answers one question — may this document be
 * issued or exported? — with a boolean and the rejections behind it. Neither is
 * something a designer can act on: "needs review" does not say WHICH part of the
 * document, and a rejection code is not a sentence anyone reads.
 *
 * This module adds NO rule and changes NO outcome. It classifies the rejections
 * the validation has already filed into the two things the Proposal Editor shows
 * separately, so the editor can say which is which:
 *
 *   EVIDENCE CHECK   the document's own integrity: the frozen writing contract,
 *                    the saved engineering evidence and the snapshot it names.
 *                    Nothing here is a writing choice, and when one fails the
 *                    document cannot be published at all.
 *
 *   COPY REVIEW      the generated copy itself: the wording that has to be read
 *                    and approved, section by section, before the document is
 *                    fit to issue.
 *
 * The distinction is the point. Unapproved wording is never presented as an
 * engineering failure, and an engineering failure is never presented as merely
 * unapproved wording.
 *
 * Every sentence it carries is the one the plain-language authority already
 * states for that rejection, so no second vocabulary exists.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { PROPOSAL_SECTION_FOR_WRITER_SECTION } from '../proposalWriter/writerSectionMapping.js';
import { blockedReasonSentence } from './proposalEditEditorCopy.js';

/** The two families a rejection belongs to. */
export const REVIEW_FAMILY = Object.freeze({
  EVIDENCE: 'evidence',
  COPY: 'copy',
});

/**
 * The document's own integrity. These are not writing choices and nobody
 * approves them: they say the frozen material behind this document is missing or
 * no longer matches what was approved.
 */
export const EVIDENCE_ERROR_CODES = Object.freeze([
  'frozen_input_missing',
  'frozen_evidence_mismatch',
  'frozen_version_mismatch',
  'engineering_snapshot_missing',
  'engineering_snapshot_identity',
  'historical_validation_missing',
]);

/**
 * The rejections whose own sentence is the general one the export dialog already
 * states, so a section is named without repeating it underneath.
 */
const GENERIC_COPY_CODES = Object.freeze(['unvalidated_document_text']);

/** Whether a rejection is about the document's material or about its wording. */
export function reviewFamilyOf(code) {
  return EVIDENCE_ERROR_CODES.includes(code) ? REVIEW_FAMILY.EVIDENCE : REVIEW_FAMILY.COPY;
}

/**
 * The section a rejection is about, read from the rejection itself.
 *
 * A writer-contract rejection names its contract section on the error. The
 * document-level rejections file the section as the last token of their detail —
 * a document section type, or a contract section for missing copy — and the
 * labels come from the document and the copy layer below, never from the token.
 */
function sectionReferenceOf(error) {
  const code = error?.code;
  const detail = typeof error?.detail === 'string' ? error.detail : '';
  if (typeof error?.section === 'string' && error.section) return { writerSection: error.section };
  if (code === 'required_section_missing') {
    return { writerSection: detail.match(/:\s*([a-z][a-z0-9_]*)\s*$/)?.[1] || null };
  }
  if (code === 'published_content_missing') {
    return { documentType: detail.match(/published ([a-z][a-z0-9_]*) page/)?.[1] || null };
  }
  if (code === 'unvalidated_document_text' || code === 'document_section_missing') {
    return { documentType: detail.match(/:\s*([a-z][a-z0-9_]*)\s*$/)?.[1] || null };
  }
  // The alternatives: either the copy that explains them is missing, or they have
  // changed since the copy was approved. Both are about that one page.
  if (code === 'option_copy_missing' || code === 'option_guidance_changed') {
    return { documentType: 'presented_options' };
  }
  return {};
}

/**
 * One section awaiting approval: what it is called, why, and which part of the
 * document it is so the editor can open it.
 */
function reviewItemFor(error, { fields = [], titles = new Map(), mode = 'comparison', order = new Map() }) {
  const reference = sectionReferenceOf(error);
  const writerSection = reference.writerSection || null;
  const documentType = reference.documentType
    || (writerSection ? PROPOSAL_SECTION_FOR_WRITER_SECTION[writerSection] || null : null);
  const label = (writerSection && fields.find((field) => field.section === writerSection)?.title)
    || (documentType ? titles.get(documentType) : null)
    || writerSection && writerSection.replace(/_/g, ' ')
    || documentType && documentType.replace(/_/g, ' ')
    || 'Generated copy';
  return {
    key: writerSection || documentType || 'document',
    label,
    reason: GENERIC_COPY_CODES.includes(error?.code)
      ? null
      : blockedReasonSentence({ code: error?.code, detail: error?.detail }, mode),
    // The part of the DOCUMENT this belongs to, which is what the editor opens
    // and scrolls to. Null where a rejection is about the document as a whole.
    target_section_type: documentType,
    order: order.get(documentType) ?? Number.MAX_SAFE_INTEGER,
  };
}

/** Distinct sentences, in the order they were stated. */
const unique = (lines) => [...new Set(lines.filter(Boolean))];

/**
 * The review state of one document, from the validation that was already run.
 *
 * @param {Object} input
 * @param {Object|null} input.validation — the complete-document validation result
 * @param {Array<Object>} [input.fields] — the copy layer's contract sections, with
 *   their titles in the mode the copy was written under
 * @returns {Object} the review state the Proposal Editor renders
 */
export function resolveProposalReview({ validation = null, fields = [] } = {}) {
  const errors = Array.isArray(validation?.errors) ? validation.errors : [];

  // The labels come from the document's own prepared sections and from the copy
  // layer's own fields: the names the client reads, in the frozen mode.
  const documentSections = Array.isArray(validation?.document_sections) ? validation.document_sections : [];
  const titles = new Map(documentSections.map((section) => [section.section_type, section.title]));
  const order = new Map(documentSections.map((section, index) => [section.section_type, index]));

  const evidenceErrors = errors.filter((error) => reviewFamilyOf(error?.code) === REVIEW_FAMILY.EVIDENCE);
  const copyErrors = errors.filter((error) => reviewFamilyOf(error?.code) !== REVIEW_FAMILY.EVIDENCE);

  const items = [];
  for (const error of copyErrors) {
    const item = reviewItemFor(error, { fields, titles, order });
    const existing = items.find((entry) => entry.key === item.key);
    if (!existing) {
      items.push(item);
      continue;
    }
    if (!existing.reason && item.reason) existing.reason = item.reason;
  }
  // Document order, so the list reads the way the client reads the proposal and
  // "review copy" opens the first one they would meet.
  items.sort((a, b) => a.order - b.order);

  return {
    checked: Boolean(validation),
    valid: validation?.valid === true,
    evidence: {
      passed: evidenceErrors.length === 0,
      blockers: unique(evidenceErrors.map((error) => blockedReasonSentence(error))),
    },
    copy: {
      awaiting: items.length,
      items: items.map(({ order: _order, ...item }) => item),
    },
    blocked_reason: validation?.blocked_reason ?? null,
  };
}

export default resolveProposalReview;