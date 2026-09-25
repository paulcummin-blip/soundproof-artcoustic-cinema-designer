/**
 * designRatingPublicationAuthority.js
 * ------------------------------------
 * The ONE canonical predicate that decides whether a numeric Artcoustic
 * System Design Rating may be PUBLISHED (handoff / sidebar / reports).
 *
 * Publication is the act of making a numeric rating visible to a consumer.
 * The underlying calculation functions may still represent provisional
 * inputs internally, but a partial numeric result must never be published
 * as the canonical Engineering Summary.
 *
 * A numeric scoped Design Rating may publish only when:
 *
 *   A. current matching authoritative bass exists and bassReadiness.ready === true
 *      (covers AUTHORITATIVE, no-applicable-bass, BLOCKED, ERROR — all settled
 *      states where bass parameters are either verified or genuinely N/A)
 *
 *   OR
 *
 *   B. verified retained bass exists with the SAME current fingerprint/version
 *      (retainedFromRefresh === true — previously verified same-fingerprint
 *      bass inputs reused while current publication is temporarily unavailable).
 *
 * Otherwise the publication must be neutral (rating: null, engineeringSummary:
 * null) or retain a still-valid settled same-fingerprint summary.
 *
 * P14-target-not-selected is a distinct settled state (no calculation
 * requested) and is NOT publishable as a numeric rating — the caller publishes
 * a null rating with a targeted message.
 *
 * Genuinely N/A / Not-Assessed parameters never block readiness. Only
 * parameters whose authoritative calculation is expected but still
 * pending/provisional block numeric publication.
 */

/**
 * @param {Object} params
 * @param {boolean} params.minimumSystemMet      - LCR + surrounds + ≥1 sub present
 * @param {Object}  params.bassReadiness          - From resolveBassReadiness
 * @param {boolean} params.retainedFromRefresh    - Same-fingerprint retained bass active
 * @param {boolean} params.isP14TargetUnselected  - P14 target not chosen (distinct state)
 * @returns {boolean}
 */
export function isDesignRatingPublishable({
  minimumSystemMet,
  bassReadiness,
  retainedFromRefresh = false,
  isP14TargetUnselected = false,
}) {
  if (!minimumSystemMet) return false;
  if (isP14TargetUnselected) return false;
  if (!bassReadiness) return false;

  // A. Live ready (authoritative, no-applicable-bass, blocked, error)
  if (bassReadiness.ready === true) return true;

  // B. Verified retained same-fingerprint bass
  if (retainedFromRefresh === true) return true;

  // Pending / provisional — do not publish a numeric rating
  return false;
}

/**
 * Decide whether a previously published settled summary may remain visible
 * while the replacement rating is not yet publishable. The published summary
 * remains the engineering truth for the same project, version and seat scope
 * until a complete replacement publishes atomically.
 *
 * @param {Object}  existing           - Previously published handoff snapshot
 * @param {Object}  identity           - Current identity to match against
 * @param {string}  identity.projectId
 * @param {string}  identity.versionId
 * @param {string}  identity.seatPriorityFingerprint
 * @param {string}  identity.bassFingerprint
 * @returns {boolean}
 */
export function isRetainedSummaryStillValid(existing, identity) {
  if (!existing || !identity) return false;
  if (!existing.engineeringSummary || !existing.rating) return false;

  const sameProject = String(existing.projectId || '') === String(identity.projectId || '');
  const sameVersion = String(existing.versionId || '') === String(identity.versionId || '');
  const sameSeatPriority =
    String(existing.rating?.seatPriorityFingerprint || '') ===
    String(identity.seatPriorityFingerprint || '');
  return sameProject && sameVersion && sameSeatPriority;
}