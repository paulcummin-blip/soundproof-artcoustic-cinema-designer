/**
 * proposalEditEditorCopy.js (shared)
 * -----------------------------------
 * The plain-language wording the Proposal Editor's copy layer shows a designer.
 *
 * A validation result is machine-readable — codes, sections, claim IDs — and a
 * designer is not. This is the one place the two meet: every rejection code
 * becomes a sentence someone non-technical can act on, a copy's status becomes
 * "Ready to issue" or "Needs review", and a blocked export states why.
 *
 * Presentation only. It decides nothing about whether a copy is valid, it changes
 * no record, and it restates no rule of its own: the codes are the Phase 2 and
 * Phase 4 vocabularies, imported rather than copied.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import {
  WRITER_REJECTION,
  writerSection,
} from '../proposalWriter/writerContractSchema.js';
import { GENERATION_STATUS } from '../proposalGeneration/generationStatuses.js';
import { EDIT_RULE_REJECTION, EDIT_VALIDATION_STATUS } from './editStatuses.js';

/** What a copy's status reads as to the designer. */
export const READY_LABEL = 'Ready to issue';
export const REVIEW_LABEL = 'Needs review';

/** The two copies there are, named for where they came from. */
export const SOURCE_LABEL = Object.freeze({
  generated: 'Original generated copy',
  edit: 'Your edited copy',
});

/** A legacy proposal is never broken: it simply was not written this way. */
export const LEGACY_TITLE = 'Legacy proposal';
export const LEGACY_MESSAGE =
  'This proposal was not written by the copy writer, so it has no generation history. Its saved sections stay fully editable, exactly as before.';

/** Why a proposal's copy cannot be issued, exported, completed or sent. */
export const LATEST_EDIT_INVALID_SENTENCE =
  'The most recent edit did not pass validation. Issue and export are blocked until it is corrected or reverted.';
export const SUPERSEDED_SENTENCE =
  'A newer validated copy has replaced this one, so this copy is no longer issuable.';
export const NOT_VALIDATED_SENTENCE =
  'The generated copy has not passed validation, so there is nothing that may be issued or exported.';
export const NO_VALID_COPY_SENTENCE =
  'No validated copy has been written for this proposal yet, so there is nothing that may be issued or exported.';

const SENTENCES = Object.freeze({
  [WRITER_REJECTION.SCHEMA_VIOLATION]: 'a section is missing or is not in the form the copy must take.',
  [WRITER_REJECTION.UNSUPPORTED_CLAIM]: 'a statement is not supported by the saved reports.',
  [WRITER_REJECTION.BLOCKED_CLAIM]: 'a statement the reports do not support has been claimed.',
  [WRITER_REJECTION.MISSING_CLAIM_ID]: 'a client-facing statement is no longer linked to the evidence behind it.',
  [WRITER_REJECTION.INVENTED_BENEFIT]: 'a benefit is claimed that the reports do not support.',
  [WRITER_REJECTION.CHANGED_PARAMETER_VALUE]: 'a figure was changed from the value the reports record.',
  [WRITER_REJECTION.CHANGED_LEVEL]: 'a performance level was changed from the level the reports record.',
  [WRITER_REJECTION.UNSELECTED_PRODUCT]: 'a product the design does not use was named.',
  [WRITER_REJECTION.EXTRA_PRODUCT]: 'a product belonging to the other option was presented as this one\'s.',
  [WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION]: 'a recommendation is made that the reports do not support.',
  [WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT]: 'an improvement is claimed in an area the reports record as unchanged.',
  [WRITER_REJECTION.P20_BASS_CONTRADICTION]: 'seat-to-seat bass consistency is claimed, which the bass result does not support.',
  [WRITER_REJECTION.SECTION_TOO_LONG]: 'the section is longer than its word limit.',
  [EDIT_RULE_REJECTION.GROUNDING_REMOVED]: 'evidence links were removed, so the section is no longer tied to the reports.',
});

const FAILURE_SENTENCES = Object.freeze({
  [GENERATION_STATUS.NEEDS_HUMAN_REVIEW]: 'the copy broke a rule and needs review.',
  [GENERATION_STATUS.VALIDATION_FAILED]: 'the copy was not in the expected form.',
  [GENERATION_STATUS.PROVIDER_FAILED]: 'the copy writer returned no output.',
});

/** The contract's own name for a section, falling back to the stored ID. */
export function sectionLabel(section) {
  const defined = writerSection(section);
  if (defined) return defined.title;
  return typeof section === 'string' && section.length > 0 ? section : null;
}

/** One rejection, as a sentence a designer can act on. */
export function plainIssue(entry) {
  const sentence = SENTENCES[entry?.code] || 'a rule of the copy contract was broken.';
  const section = sectionLabel(entry?.section);
  return section ? `${section}: ${sentence}` : sentence;
}

/** Every rejection, as plain sentences, each stated once. */
export function plainIssues(errors = []) {
  const lines = [];
  for (const entry of Array.isArray(errors) ? errors : []) {
    const line = plainIssue(entry);
    if (!lines.includes(line)) lines.push(line);
  }
  return lines;
}

/** "Ready to issue" or "Needs review" — nothing else may be shown. */
export function validationStatusLabel(status) {
  return status === EDIT_VALIDATION_STATUS.VALID ? READY_LABEL : REVIEW_LABEL;
}

/** What became of a generation attempt that produced no usable copy. */
export function generationFailureSentence(status) {
  const sentence = FAILURE_SENTENCES[status];
  return sentence ? `The last attempt ${sentence}` : 'The last attempt produced no usable copy.';
}