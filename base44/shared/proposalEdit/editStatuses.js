/**
 * editStatuses.js (shared)
 * -------------------------
 * THE Phase 4 edit validation vocabulary.
 *
 * One saved edit is one append-only record, and its status says what became of
 * that copy. Three statuses are written, and the status is never chosen by a
 * caller: it is read from the Phase 2 writer validation, so a copy that broke a
 * claim, figure, level or product rule can never say it did not.
 *
 *   valid               the edited copy passed every writer rule
 *   needs_human_review  it broke a claim, figure, level or product rule
 *   validation_failed   it was not the contract's shape, or was not validated at all
 *
 * The classification reuses the Phase 3 generation classification, so an edit and
 * a draft are judged by the same authority and cannot drift apart.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import {
  generationFormatRejections,
  generationReviewRejections,
} from '../proposalGeneration/generationStatuses.js';

/**
 * The one rejection the edit layer adds of its own. Everything else an edit is
 * held to is the Phase 2 writer contract, reported with its own codes.
 *
 * A copy may re-point its grounding — a section may cite the claims that support
 * what it now says — but it may never drop a claim ID the copy it started from
 * cited. Otherwise the evidence-backed meaning of a section could be deleted
 * while the prose that needed it stayed, and the link from the client-facing copy
 * back to the reports would be gone. The rule only ever adds a rejection: keeping
 * the claim IDs a copy already cited can never break a writer rule, because the
 * cited claims are read for the kinds they support.
 */
export const EDIT_RULE_REJECTION = Object.freeze({
  GROUNDING_REMOVED: 'grounding_removed',
});

/** The edit-layer rejections a human has to look at. */
export const EDIT_REVIEW_REJECTIONS = Object.freeze([EDIT_RULE_REJECTION.GROUNDING_REMOVED]);

/** How an edit's validation ended. */
export const EDIT_VALIDATION_STATUS = Object.freeze({
  VALID: 'valid',
  NEEDS_HUMAN_REVIEW: 'needs_human_review',
  VALIDATION_FAILED: 'validation_failed',
});

/** Every status, in lifecycle order. */
export const EDIT_VALIDATION_STATUSES = Object.freeze(Object.values(EDIT_VALIDATION_STATUS));

/** The statuses an edit record may be created with. All of them: an invalid edit is retained. */
export const EDIT_WRITE_STATUSES = Object.freeze([
  EDIT_VALIDATION_STATUS.VALID,
  EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW,
  EDIT_VALIDATION_STATUS.VALIDATION_FAILED,
]);

/** Only a valid edit copy may be issued, exported, completed or sent. */
export const EDIT_ISSUABLE_STATUSES = Object.freeze([EDIT_VALIDATION_STATUS.VALID]);

/** How an edit came to exist. A manual edit is the designer's own wording. */
export const EDIT_SOURCE = Object.freeze({
  MANUAL: 'manual',
  REVERT: 'revert',
});

/** The edit sources a record may be created with. */
export const EDIT_SOURCES = Object.freeze(Object.values(EDIT_SOURCE));

/** Which copy a render or an issue action uses. */
export const EDIT_RENDER_SOURCE = Object.freeze({
  EDIT: 'edit',
  GENERATED: 'generated',
});

/**
 * Why a copy may or may not be rendered or issued, in machine-readable form.
 * One vocabulary for both questions, because they are the same question asked
 * about a different copy.
 */
export const EDIT_GATE_REASON = Object.freeze({
  VALID: 'valid_edit',
  NOT_FOUND: 'no_edit_with_that_id',
  INVALID_EDIT: 'the_edit_failed_the_writer_contract',
  NEEDS_HUMAN_REVIEW: 'the_edit_needs_human_review',
  LATEST_EDIT_INVALID: 'the_newest_edit_is_not_valid',
  LATEST_VALID_EDIT: 'the_latest_valid_edit',
  GENERATED_COPY: 'the_validated_gpt_output',
  NO_COPY: 'there_is_no_validated_copy_to_render',
});

/**
 * The status of an edited copy, read from the validation result and from nothing
 * else. A result is only accepted as valid when it says so *and* reported no
 * violations at all — a result that claims validity while carrying rejections is
 * not a valid copy.
 *
 * @param {Object|null} validation — a validateWriterOutput result
 * @returns {string} one of EDIT_WRITE_STATUSES
 */
export function deriveEditValidationStatus(validation) {
  const violations = Array.isArray(validation?.violations) ? validation.violations : null;
  if (validation?.valid === true && violations !== null && violations.length === 0) {
    return EDIT_VALIDATION_STATUS.VALID;
  }

  const codes = (violations || []).map((entry) => entry?.code).filter(Boolean);
  const reviewClass = generationReviewRejections(validation).length > 0
    || codes.some((code) => EDIT_REVIEW_REJECTIONS.includes(code));
  if (reviewClass) {
    return EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW;
  }
  if (validation && generationFormatRejections(validation).length > 0) {
    return EDIT_VALIDATION_STATUS.VALIDATION_FAILED;
  }
  // An unvalidated copy is never valid, and nothing may call it so.
  return EDIT_VALIDATION_STATUS.VALIDATION_FAILED;
}

/** The statuses that mean a human should look at the copy. */
export const EDIT_REVIEW_STATUSES = Object.freeze([
  EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW,
  EDIT_VALIDATION_STATUS.VALIDATION_FAILED,
]);

const GATE_REASONS = Object.freeze({
  [EDIT_VALIDATION_STATUS.VALID]: EDIT_GATE_REASON.VALID,
  [EDIT_VALIDATION_STATUS.NEEDS_HUMAN_REVIEW]: EDIT_GATE_REASON.NEEDS_HUMAN_REVIEW,
  [EDIT_VALIDATION_STATUS.VALIDATION_FAILED]: EDIT_GATE_REASON.INVALID_EDIT,
});

/**
 * May this copy be issued, exported, completed or sent? One status may, and it
 * is `valid`.
 *
 * @returns {{ issuable: boolean, status: string|null, reason: string }}
 */
export function editGate({ status = null } = {}) {
  if (status === EDIT_VALIDATION_STATUS.VALID) {
    return { issuable: true, status, reason: EDIT_GATE_REASON.VALID };
  }
  const reason = GATE_REASONS[status] || EDIT_GATE_REASON.NOT_FOUND;
  return { issuable: false, status: status ?? null, reason };
}

/** Whether one edit status may be issued, exported, completed or sent. */
export function isEditIssuable(status) {
  return editGate({ status }).issuable;
}