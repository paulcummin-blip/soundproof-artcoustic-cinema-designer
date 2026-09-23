/**
 * Server-authoritative proposal lifecycle rules.
 *
 * Imported by the transitionProposalStatus backend function. The frontend
 * proposalLifecycle.js mirrors these rules for UI hints only — the server
 * function is the single source of truth for enforcement.
 *
 * Lifecycle:
 *   Draft → Generating → Generated → Edited → Issued → Accepted
 *   Any non-archived → Archived (stores previous_status)
 *   Archived → previous_status (or Edited/Draft fallback)
 */

export function normaliseStatus(rawStatus) {
  if (!rawStatus) return 'draft';
  if (rawStatus === 'reviewed') return 'edited';
  if (rawStatus === 'sent') return 'issued';
  if (['draft', 'generating', 'generated', 'edited', 'issued', 'accepted', 'archived'].includes(rawStatus)) {
    return rawStatus;
  }
  return 'draft';
}

// Adjacent valid transitions (normal progression only — no skips, no reversals).
const ADJACENT_TRANSITIONS = {
  draft: ['generating'],
  generating: ['generated'],
  generated: ['edited'],
  edited: ['issued'],
  issued: ['accepted'],
  accepted: [],
  archived: [],
};

/**
 * Validate a lifecycle transition.
 * Returns { valid, reason, previousStatus }
 *
 * Rules:
 *  - No-op (same status) is rejected.
 *  - Archive: any non-archived → archived. previousStatus is stored.
 *  - Unarchive: archived → previous_status (or 'edited' fallback, or 'draft' if no content).
 *  - Normal progression: adjacent only. No skips, no reversals.
 *  - Accepted → Edited is rejected (reversal).
 *  - Archived editing is rejected (must unarchive first).
 */
export function validateTransition(currentRawStatus, targetRawStatus, previousStatus, hasContent) {
  const current = normaliseStatus(currentRawStatus);
  const target = normaliseStatus(targetRawStatus);

  if (current === target) {
    return { valid: false, reason: 'Proposal is already in this status.', previousStatus: null };
  }

  // Archive: any non-archived → archived
  if (target === 'archived') {
    if (current === 'archived') {
      return { valid: false, reason: 'Proposal is already archived.', previousStatus: null };
    }
    return { valid: true, reason: null, previousStatus: current };
  }

  // Unarchive: archived → restore status
  if (current === 'archived') {
    const restoreStatus = normaliseStatus(previousStatus) || (hasContent ? 'edited' : 'draft');
    if (target !== restoreStatus) {
      return { valid: false, reason: `Archived proposal can only be restored to "${restoreStatus}".`, previousStatus: null };
    }
    return { valid: true, reason: null, previousStatus: null };
  }

  // Normal progression: adjacent only
  const allowed = ADJACENT_TRANSITIONS[current] || [];
  if (!allowed.includes(target)) {
    return { valid: false, reason: `Invalid transition from "${current}" to "${target}".`, previousStatus: null };
  }

  return { valid: true, reason: null, previousStatus: null };
}

/**
 * Compute the restore status for an archived proposal.
 * Returns the normalised status to restore to.
 */
export function computeRestoreStatus(previousStatus, hasContent) {
  const restored = normaliseStatus(previousStatus);
  if (restored && restored !== 'archived') return restored;
  return hasContent ? 'edited' : 'draft';
}