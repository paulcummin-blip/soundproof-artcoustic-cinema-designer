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
  writerSectionsForMode,
} from '../proposalWriter/writerContractSchema.js';
import { MULTI_CABINET_REASONS } from '../proposalWriter/writerMultiCabinetRules.js';
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

// The wording a dealer reads for a legacy proposal is presented by the Proposal
// Editor's copy status banner. It is deliberately not stored here: the editor's
// bundle cannot read a backend shared module, so the banner holds its own.

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
  [WRITER_REJECTION.MULTI_CABINET_CHANNEL]: 'the centre-channel description needs reviewing.',
  // The document-level rejections. Their own detail can carry a section ID, a
  // version ID or a rule token, so each is stated from here instead.
  copy_not_valid: 'a valid approved copy is required before this document can be issued or exported.',
  frozen_input_missing: 'the approved writing contract this copy was written under is required.',
  option_guidance_changed: 'the alternatives have changed since this copy was approved, so a corrected revision is needed first.',
  option_copy_missing: 'the alternatives need validated Presented Options copy before this document can be issued.',
  required_section_missing: 'required copy is missing from this document.',
  historical_validation_missing: 'the validation this copy was issued under is required.',
  frozen_evidence_mismatch: 'the saved engineering evidence no longer matches this copy.',
  frozen_version_mismatch: 'this proposal and its saved evidence name different design versions.',
  engineering_snapshot_missing: 'a saved engineering specification is required for this document.',
  engineering_snapshot_identity: 'the saved engineering specification belongs to a different project or version.',
  raw_dealer_notes: 'private design instructions cannot be published.',
  unvalidated_document_text: 'this document contains wording that was not approved.',
  document_section_missing: 'a required page of this document is missing or hidden.',
  published_content_missing: 'approved copy did not reach the published page.',
});

/**
 * The exact reason behind a multi-cabinet rejection, where the filed detail
 * carries one. The remaining tokens of that detail are internal IDs — the stage
 * position and the version — so only the reason is read, never the whole detail.
 */
const MULTI_CABINET_SENTENCES = Object.freeze({
  [MULTI_CABINET_REASONS.OMITTED]: 'the centre-channel description needs reviewing.',
  [MULTI_CABINET_REASONS.MULTIPLIED]: 'the centre channel is described as more channels than the design places.',
  [MULTI_CABINET_REASONS.COUNT]: 'the number of centre-channel cabinets does not match the design.',
});

/** A machine code: a snake_case token, which never belongs on a screen. */
const MACHINE_CODE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;

const FAILURE_SENTENCES = Object.freeze({
  [GENERATION_STATUS.NEEDS_HUMAN_REVIEW]: 'the copy broke a rule and needs review.',
  [GENERATION_STATUS.VALIDATION_FAILED]: 'the copy was not in the expected form.',
  [GENERATION_STATUS.PROVIDER_FAILED]: 'the copy writer returned no output.',
});

/**
 * The contract's own name for a section, in the mode the copy was written under:
 * a single-design copy reads Design Overview and Why This Specification where a
 * comparison reads What Stays the Same and What Changes. Section IDs, order and
 * word limits are the same in both modes.
 *
 * A section outside the contract is named in readable words rather than by its
 * stored ID, so no internal identifier is ever printed.
 */
export function sectionLabel(section, mode = 'comparison') {
  const defined = writerSectionsForMode(mode).find((entry) => entry.section === section)
    || writerSection(section);
  if (defined) return defined.title;
  if (typeof section !== 'string' || section.length === 0) return null;
  return section.replace(/_/g, ' ');
}

/**
 * One rejection, as a sentence a designer can act on.
 *
 * The filed detail is read only for the one rejection that carries a reason of
 * its own; every other rejection is stated from the plain-language table. A code
 * that is not in the table is stated in general words rather than shown, so a
 * rule ID, a section ID, a version ID or a fingerprint cannot reach the screen.
 *
 * A rejection is headed with the section it belongs to, except where the sentence
 * already names its own subject: a centre-channel rejection is about the
 * centre-channel description and is never headed with whichever section the
 * writer filed it against.
 */
export function plainIssue(entry, mode = 'comparison') {
  const code = entry?.code;
  const centreChannel = code === WRITER_REJECTION.MULTI_CABINET_CHANNEL;
  const sentence = centreChannel
    ? (MULTI_CABINET_SENTENCES[String(entry?.detail || '').split(':')[0]]
      || SENTENCES[code]
      || 'a rule of the copy contract was broken.')
    : (SENTENCES[code] || 'a rule of the copy contract was broken.');
  // A centre-channel rejection is about the centre-channel description itself, and
  // the sentence already says so. The section the writer happened to file it
  // against is not the reader's subject — a centre-channel problem is not a
  // Dynamic Range problem — so it is stated in its own right rather than under
  // that section's name.
  const section = centreChannel ? null : sectionLabel(entry?.section, mode);
  if (section) return `${section}: ${sentence}`;
  // Nothing precedes it, so it is read as a sentence in its own right.
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Every rejection, as plain sentences, each stated once. */
export function plainIssues(errors = [], mode = 'comparison') {
  const lines = [];
  for (const entry of Array.isArray(errors) ? errors : []) {
    const line = plainIssue(entry, mode);
    if (!lines.includes(line)) lines.push(line);
  }
  return lines;
}

/**
 * The reason a document cannot be published, in the designer's words.
 *
 * The validation result itself is untouched — this decides only which sentence is
 * shown for it. A rejection whose own detail is already a plain sentence keeps
 * that sentence; one carrying a machine code (a rule ID, a section ID, a record
 * ID or a fingerprint) is stated from the plain-language table instead, and an
 * unrecognised code is stated in general words rather than shown verbatim.
 */
export function blockedReasonSentence(error, mode = 'comparison') {
  if (!error) return null;
  const detail = typeof error.detail === 'string' ? error.detail.trim() : '';
  // A detail that is prose is the message itself; anything machine-shaped is not.
  if (!SENTENCES[error.code] && detail && !MACHINE_CODE.test(detail)) return detail;
  return plainIssue(error, mode);
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