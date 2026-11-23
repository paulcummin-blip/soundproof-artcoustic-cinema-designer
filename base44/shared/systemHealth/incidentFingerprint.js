/**
 * incidentFingerprint.js (shared)
 * --------------------------------
 * Computes a stable grouping fingerprint for a system health incident.
 *
 * Two failures with the same fingerprint are the same underlying problem:
 * repeated occurrences increment the occurrence_count on the existing
 * incident rather than creating a duplicate record.
 *
 * The fingerprint is computed from the stable identity of the failure:
 *   component + operation + error_code + sorted violation codes
 *
 * It deliberately excludes volatile details (timestamps, specific error
 * messages, project IDs) so that the same defect manifesting on different
 * projects at different times is recognised as the same incident.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/**
 * Compute a stable grouping fingerprint for an incident.
 *
 * @param {Object} input
 * @param {string} input.component — e.g. 'proposal_generation'
 * @param {string} input.operation — e.g. 'generateProposal'
 * @param {string} input.errorCode — e.g. 'DRAFT_REJECTED'
 * @param {Array<string>} [input.violationCodes] — sorted validation violation codes
 * @returns {string} the grouping fingerprint
 */
export function computeIncidentFingerprint({
  component = '',
  operation = '',
  errorCode = '',
  violationCodes = [],
} = {}) {
  const codes = Array.isArray(violationCodes)
    ? [...violationCodes].filter((c) => typeof c === 'string' && c.length > 0).sort()
    : [];
  return [component, operation, errorCode, codes.join(',')]
    .map((part) => String(part || '').trim())
    .join('::');
}

export default computeIncidentFingerprint;