/**
 * incidentMessages.js (shared)
 * -----------------------------
 * Dealer-facing failure messages and recovery-availability logic for
 * proposal-generation incidents.
 *
 * The messages are calm, specific and never expose technical details,
 * incident references or internal error codes. They tell the dealer what
 * failed, what work has been preserved, and what they can do next.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/**
 * The failure types recognised by the incident system.
 */
export const FAILURE_TYPE = Object.freeze({
  WRITER_REFUSAL: 'writer_refusal',
  DRAFT_REJECTED: 'draft_rejected',
  SECTION_MAPPING_FAILED: 'section_mapping_failed',
  PROVIDER_FAILED: 'provider_failed',
  UNEXPECTED_ERROR: 'unexpected_error',
});

/**
 * Build a calm, specific dealer-facing message for a proposal-generation
 * failure. The message never exposes internal codes, validation details or
 * incident references — those are shown separately only when an incident was
 * successfully recorded.
 *
 * @param {string} failureType — one of FAILURE_TYPE
 * @param {string} [errorCode] — the machine-readable error code
 * @returns {string} the dealer-facing message
 */
export function buildDealerFailureMessage(failureType, errorCode = '') {
  switch (failureType) {
    case FAILURE_TYPE.WRITER_REFUSAL:
      if (errorCode === 'evidence_unavailable') {
        return 'The Project Report for this design needs to be updated before ADI can write the proposal. Your project and design information are safe.';
      }
      if (errorCode === 'writer_flag_off') {
        return "ADI's proposal writing service is currently unavailable. Your project and design information are safe.";
      }
      return "ADI couldn't start the proposal because the design information isn't ready yet. Your project and design information are safe.";
    case FAILURE_TYPE.DRAFT_REJECTED:
      return 'ADI completed the draft but one or more sections need revision before the proposal can be used. Your project and design information are safe.';
    case FAILURE_TYPE.SECTION_MAPPING_FAILED:
      return "ADI completed the draft but its sections couldn't be organised into the proposal structure. Your project and design information are safe.";
    case FAILURE_TYPE.PROVIDER_FAILED:
      return "ADI's writing service was temporarily unavailable. Your project and design information are safe. Please try again.";
    case FAILURE_TYPE.UNEXPECTED_ERROR:
    default:
      return "ADI couldn't complete the proposal. Your project and design information are safe. Please try again.";
  }
}

/**
 * Whether a recovery action (Rewrite with ADI) is genuinely available for
 * this failure type. A recovery is available when retrying the generation
 * could plausibly succeed — i.e. the failure was not a pre-condition refusal.
 *
 * 'Edit Manually' is only available when a proposal record still exists
 * after the failure. The generateProposal function currently rolls back the
 * proposal on failure, so manual editing is not offered in Phase 1.
 *
 * @param {string} failureType — one of FAILURE_TYPE
 * @param {string} [errorCode]
 * @returns {boolean}
 */
export function isRecoveryAvailable(failureType, errorCode = '') {
  switch (failureType) {
    case FAILURE_TYPE.WRITER_REFUSAL:
      // Pre-condition failures: retrying won't help until the condition is fixed.
      return false;
    case FAILURE_TYPE.DRAFT_REJECTED:
    case FAILURE_TYPE.SECTION_MAPPING_FAILED:
    case FAILURE_TYPE.PROVIDER_FAILED:
    case FAILURE_TYPE.UNEXPECTED_ERROR:
    default:
      return true;
  }
}

/**
 * Whether manual editing is available. In Phase 1, the proposal is rolled
 * back on failure, so there is nothing to edit. This returns false and the
 * dealer is not offered 'Edit Manually'.
 *
 * @returns {boolean}
 */
export function isManualEditAvailable() {
  return false;
}

export default buildDealerFailureMessage;