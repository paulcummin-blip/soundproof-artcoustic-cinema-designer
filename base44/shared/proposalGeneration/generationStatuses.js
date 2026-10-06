/**
 * generationStatuses.js (shared)
 * -------------------------------
 * THE Phase 3 generation status vocabulary.
 *
 * One proposal generation attempt is one immutable record, and its status says
 * what became of that attempt. Seven statuses are written when the record is
 * created; `superseded` is never written at all — it is derived at read time,
 * because an append-only record can never be edited to say it was replaced.
 *
 * The write statuses are derived, never chosen by a caller, so an attempt cannot
 * be filed as something it is not:
 *
 *   draft_created       the attempt exists; no evidence assembled yet
 *   evidence_ready      the pack and the GPT input are assembled, unread by a provider
 *   provider_failed     the provider returned no output, or failed
 *   validation_failed   output arrived but broke the contract's shape
 *   needs_human_review  output arrived and broke a claim, figure, level or product rule
 *   valid_generated     output arrived and passed every rule
 *   discarded           the attempt was abandoned before it produced anything
 *
 * Rule 6 lives here too: one status may be used for issue, export, completion or
 * sending, and it is `valid_generated`. Everything else is refused, with the
 * reason recorded.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { WRITER_REJECTION } from '../proposalWriter/writerContractSchema.js';

/** The generation statuses. */
export const GENERATION_STATUS = Object.freeze({
  DRAFT_CREATED: 'draft_created',
  EVIDENCE_READY: 'evidence_ready',
  PROVIDER_FAILED: 'provider_failed',
  VALIDATION_FAILED: 'validation_failed',
  NEEDS_HUMAN_REVIEW: 'needs_human_review',
  VALID_GENERATED: 'valid_generated',
  DISCARDED: 'discarded',
  SUPERSEDED: 'superseded',
});

/** Every status, in lifecycle order. */
export const GENERATION_STATUSES = Object.freeze(Object.values(GENERATION_STATUS));

/** The statuses a record may be created with. */
export const GENERATION_WRITE_STATUSES = Object.freeze([
  GENERATION_STATUS.DRAFT_CREATED,
  GENERATION_STATUS.EVIDENCE_READY,
  GENERATION_STATUS.PROVIDER_FAILED,
  GENERATION_STATUS.VALIDATION_FAILED,
  GENERATION_STATUS.NEEDS_HUMAN_REVIEW,
  GENERATION_STATUS.VALID_GENERATED,
  GENERATION_STATUS.DISCARDED,
]);

/** The status derived at read time from a newer valid generation. Never written. */
export const GENERATION_DERIVED_STATUSES = Object.freeze([GENERATION_STATUS.SUPERSEDED]);

/** Rule 6. One status may be issued, exported, completed or sent. */
export const GENERATION_ISSUABLE_STATUSES = Object.freeze([GENERATION_STATUS.VALID_GENERATED]);

/** The outcomes an attempt can be reported with. */
export const GENERATION_OUTCOMES = Object.freeze(['generated', 'provider_failed', 'discarded']);

/**
 * The rejections a human has to look at: a claim the pack does not allow, a
 * changed figure or level, a product that is not this option's, a bass claim the
 * result does not support. These are the safety-critical failures, so the
 * attempt is filed as needing review rather than as a plain contract failure.
 */
export const GENERATION_REVIEW_REJECTIONS = Object.freeze([
  WRITER_REJECTION.UNSUPPORTED_CLAIM,
  WRITER_REJECTION.BLOCKED_CLAIM,
  WRITER_REJECTION.INVENTED_BENEFIT,
  WRITER_REJECTION.CHANGED_PARAMETER_VALUE,
  WRITER_REJECTION.CHANGED_LEVEL,
  WRITER_REJECTION.UNSELECTED_PRODUCT,
  WRITER_REJECTION.EXTRA_PRODUCT,
  WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION,
  WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT,
  WRITER_REJECTION.P20_BASS_CONTRADICTION,
]);

/**
 * The rejections that are a failure of shape or of the contract itself: not the
 * JSON object the contract defines, a claim without grounding, a section over its
 * limit. Nothing was claimed wrongly here; the output simply is not the shape.
 */
export const GENERATION_FORMAT_REJECTIONS = Object.freeze([
  WRITER_REJECTION.SCHEMA_VIOLATION,
  WRITER_REJECTION.MISSING_CLAIM_ID,
  WRITER_REJECTION.SECTION_TOO_LONG,
]);

/** Whether a value is one of the generation statuses. */
export function isGenerationStatus(status) {
  return GENERATION_STATUSES.includes(status);
}

/** The review-class rejections present in a validation result, deduplicated. */
export function generationReviewRejections(validation) {
  const codes = (Array.isArray(validation?.violations) ? validation.violations : [])
    .map((entry) => entry?.code)
    .filter(Boolean);
  return [...new Set(codes.filter((code) => GENERATION_REVIEW_REJECTIONS.includes(code)))];
}

/** The format-class rejections present in a validation result, deduplicated. */
export function generationFormatRejections(validation) {
  const codes = (Array.isArray(validation?.violations) ? validation.violations : [])
    .map((entry) => entry?.code)
    .filter(Boolean);
  return [...new Set(codes.filter((code) => GENERATION_FORMAT_REJECTIONS.includes(code)))];
}

/**
 * The status of an attempt, derived from what actually happened. Nothing here
 * trusts a caller to declare a valid generation: validity is read from the
 * validation result or it is not granted at all.
 *
 * @param {Object} input
 * @param {string} [input.outcome] — 'generated' | 'provider_failed' | 'discarded'
 * @param {Object} [input.validation] — a validateWriterOutput result
 * @param {boolean} [input.outputReceived] — whether the provider returned output
 * @param {string} [input.providerError] — the provider failure, when there was one
 * @param {boolean} [input.evidenceReady] — whether the pack and input are assembled
 * @returns {string} one of the write statuses
 */
export function deriveGenerationStatus({
  outcome = null,
  validation = null,
  outputReceived = false,
  providerError = null,
  evidenceReady = false,
} = {}) {
  if (outcome === GENERATION_STATUS.DISCARDED) return GENERATION_STATUS.DISCARDED;
  if (providerError || outcome === 'provider_failed' || outcome === GENERATION_STATUS.PROVIDER_FAILED) {
    return GENERATION_STATUS.PROVIDER_FAILED;
  }
  if (!outputReceived) return evidenceReady ? GENERATION_STATUS.EVIDENCE_READY : GENERATION_STATUS.DRAFT_CREATED;
  if (validation && validation.valid === true) return GENERATION_STATUS.VALID_GENERATED;
  if (validation) {
    return generationReviewRejections(validation).length > 0
      ? GENERATION_STATUS.NEEDS_HUMAN_REVIEW
      : GENERATION_STATUS.VALIDATION_FAILED;
  }
  // Output arrived but was never validated. Nothing may call that valid.
  return GENERATION_STATUS.NEEDS_HUMAN_REVIEW;
}

/** Why a generation is not issuable, in machine-readable form. */
export const GENERATION_GATE_REASON = Object.freeze({
  VALID: 'valid_generated',
  NOT_FOUND: 'no_generation_with_that_id',
  NOT_GENERATED_YET: 'the_attempt_has_not_produced_a_generation_yet',
  PROVIDER_FAILED: 'the_provider_returned_no_output',
  INVALID_OUTPUT: 'the_output_failed_the_writer_contract',
  NEEDS_HUMAN_REVIEW: 'the_output_needs_human_review',
  DISCARDED: 'the_attempt_was_discarded',
  SUPERSEDED: 'a_newer_valid_generation_replaced_it',
});

const GATE_REASONS = Object.freeze({
  [GENERATION_STATUS.DRAFT_CREATED]: GENERATION_GATE_REASON.NOT_GENERATED_YET,
  [GENERATION_STATUS.EVIDENCE_READY]: GENERATION_GATE_REASON.NOT_GENERATED_YET,
  [GENERATION_STATUS.PROVIDER_FAILED]: GENERATION_GATE_REASON.PROVIDER_FAILED,
  [GENERATION_STATUS.VALIDATION_FAILED]: GENERATION_GATE_REASON.INVALID_OUTPUT,
  [GENERATION_STATUS.NEEDS_HUMAN_REVIEW]: GENERATION_GATE_REASON.NEEDS_HUMAN_REVIEW,
  [GENERATION_STATUS.DISCARDED]: GENERATION_GATE_REASON.DISCARDED,
  [GENERATION_STATUS.SUPERSEDED]: GENERATION_GATE_REASON.SUPERSEDED,
});

/**
 * Rule 6, in one place: only a valid generation may pass the issue/export gate.
 * The status handed in is the derived status, so a superseded generation is
 * refused just as a failed one is.
 *
 * @returns {{ issuable: boolean, status: string|null, reason: string }}
 */
export function generationGate({ status = null } = {}) {
  if (status === GENERATION_STATUS.VALID_GENERATED) {
    return { issuable: true, status, reason: GENERATION_GATE_REASON.VALID };
  }
  const reason = GATE_REASONS[status] || GENERATION_GATE_REASON.NOT_FOUND;
  return { issuable: false, status: status ?? null, reason };
}

/** Whether one status may be issued, exported, completed or sent. */
export function isGenerationIssuable(status) {
  return generationGate({ status }).issuable;
}