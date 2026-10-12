/**
 * proposalDeletionAuthority.js (shared)
 * -------------------------------------
 * THE rule that decides whether a saved proposal may be deleted, and what its
 * deletion is allowed to take with it.
 *
 * What links to a Proposal (confirmed against the entity schemas):
 *   - ProposalSection    (proposal_id) — the proposal's own content. Deleted with it.
 *   - ProposalGeneration (proposal_id) — the proposal's generation history.
 *                                        Deleted with it, so nothing of the
 *                                        proposal is left orphaned.
 *   - ProposalEdit       (proposal_id) — the proposal's saved copy history.
 *                                        Deleted with it, for the same reason.
 *   - ProjectAssetExport (source_record_id) — an ISSUED document the designer
 *                                        exported. Append-only and NEVER deleted;
 *                                        a proposal that has one is therefore
 *                                        refused outright, so no issued document
 *                                        can ever be left pointing at a proposal
 *                                        that is gone.
 *
 * Nothing else references a proposal. Project, ProjectVersion, ReportSnapshot,
 * ProposalAsset and every engineering record are untouched by a deletion.
 *
 * Issuance is decided from the authoritative records, never from a status guess:
 * an issued ProjectAssetExport for the proposal is the primary evidence, and a
 * lifecycle status of issued/accepted (or the legacy 'sent' alias) is the second.
 * "Generated" is NOT "issued", so an ordinary draft or generated proposal is
 * deletable and a test proposal can be cleared away normally.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** One deletion request may name this many proposals. */
export const MAX_PROPOSAL_DELETIONS = 50;

/** Why a proposal may not be deleted. */
export const PROPOSAL_DELETION_REFUSAL = Object.freeze({
  NOT_FOUND: 'not_found',
  FORBIDDEN: 'forbidden',
  ISSUED_DOCUMENT: 'issued_document',
  ISSUED_STATUS: 'issued_status',
  GENERATING: 'generating',
});

/** The same refusals, as the designer reads them. */
export const PROPOSAL_DELETION_REFUSAL_TEXT = Object.freeze({
  [PROPOSAL_DELETION_REFUSAL.NOT_FOUND]: 'This proposal no longer exists.',
  [PROPOSAL_DELETION_REFUSAL.FORBIDDEN]: 'This proposal belongs to another account, so it cannot be deleted here.',
  [PROPOSAL_DELETION_REFUSAL.ISSUED_DOCUMENT]: 'An issued document was exported from this proposal, so it is kept for the project record.',
  [PROPOSAL_DELETION_REFUSAL.ISSUED_STATUS]: 'This proposal has been issued, so it is kept for the project record.',
  [PROPOSAL_DELETION_REFUSAL.GENERATING]: 'This proposal is still being generated. Wait for generation to finish, then delete it.',
});

/** Why a deletion attempt did not complete. */
export const PROPOSAL_DELETION_REASON = Object.freeze({
  RELATED_RECORDS_REMAINING: 'related_records_remaining',
  DELETE_UNCONFIRMED: 'proposal_delete_unconfirmed',
  DELETION_FAILED: 'deletion_failed',
});

export const PROPOSAL_DELETION_REASON_TEXT = Object.freeze({
  [PROPOSAL_DELETION_REASON.RELATED_RECORDS_REMAINING]: 'Some of this proposal\u2019s records could not be removed, so the proposal was kept. Nothing else was affected.',
  [PROPOSAL_DELETION_REASON.DELETE_UNCONFIRMED]: 'The proposal could not be confirmed as removed, so it is still listed. Nothing else was affected.',
  [PROPOSAL_DELETION_REASON.DELETION_FAILED]: 'This proposal could not be deleted. Nothing else was affected.',
});

/**
 * The document types an issued export of a PROPOSAL carries — the export types
 * documentTypeForProposalType assigns. A report export records its own report
 * snapshot as source_record_id, so a match here is an issued proposal document.
 */
export const PROPOSAL_ISSUED_DOCUMENT_TYPES = Object.freeze([
  'proposal',
  'comparison',
  'system_design_summary',
]);

/** Statuses that mean the proposal has left the drafting stage. 'sent' is the legacy alias for 'issued'. */
const ISSUED_STATUSES = new Set(['issued', 'accepted', 'sent']);

export function isIssuedStatus(rawStatus) {
  return ISSUED_STATUSES.has(String(rawStatus || '').trim().toLowerCase());
}

export function isGeneratingStatus(rawStatus) {
  return String(rawStatus || '').trim().toLowerCase() === 'generating';
}

export function proposalDeletionRefusalText(refusal) {
  return PROPOSAL_DELETION_REFUSAL_TEXT[refusal] || 'This proposal cannot be deleted here.';
}

export function proposalDeletionReasonText(reason) {
  return PROPOSAL_DELETION_REASON_TEXT[reason] || 'This proposal could not be deleted.';
}

/**
 * How many issued documents each proposal has, from the issued-export records.
 *
 * @param {Array<Object>} issuedRows — ProjectAssetExport rows
 * @param {Array<string>} proposalIds
 * @returns {Map<string, number>}
 */
export function issuedDocumentCounts(issuedRows = [], proposalIds = []) {
  const wanted = new Set((Array.isArray(proposalIds) ? proposalIds : []).filter(Boolean));
  const counts = new Map();
  for (const row of Array.isArray(issuedRows) ? issuedRows : []) {
    const proposalId = row?.source_record_id;
    if (!proposalId || !wanted.has(proposalId)) continue;
    if (!PROPOSAL_ISSUED_DOCUMENT_TYPES.includes(row?.document_type)) continue;
    counts.set(proposalId, (counts.get(proposalId) || 0) + 1);
  }
  return counts;
}

/**
 * Whether one proposal may be deleted, and why not when it may not.
 *
 * @param {Object} input
 * @param {Object|null} input.proposal
 * @param {number} [input.issuedDocumentCount] — issued documents for this proposal
 * @param {boolean} [input.canManage] — the caller's authority over this proposal
 * @returns {{deletable: boolean, refusal: string|null, reason: string|null}}
 */
export function proposalDeletionDecision({ proposal = null, issuedDocumentCount = 0, canManage = true } = {}) {
  if (!proposal?.id) {
    return {
      deletable: false,
      refusal: PROPOSAL_DELETION_REFUSAL.NOT_FOUND,
      reason: proposalDeletionRefusalText(PROPOSAL_DELETION_REFUSAL.NOT_FOUND),
    };
  }
  if (!canManage) {
    return {
      deletable: false,
      refusal: PROPOSAL_DELETION_REFUSAL.FORBIDDEN,
      reason: proposalDeletionRefusalText(PROPOSAL_DELETION_REFUSAL.FORBIDDEN),
    };
  }
  if (Number(issuedDocumentCount) > 0) {
    return {
      deletable: false,
      refusal: PROPOSAL_DELETION_REFUSAL.ISSUED_DOCUMENT,
      reason: proposalDeletionRefusalText(PROPOSAL_DELETION_REFUSAL.ISSUED_DOCUMENT),
    };
  }
  if (isIssuedStatus(proposal.status)) {
    return {
      deletable: false,
      refusal: PROPOSAL_DELETION_REFUSAL.ISSUED_STATUS,
      reason: proposalDeletionRefusalText(PROPOSAL_DELETION_REFUSAL.ISSUED_STATUS),
    };
  }
  if (isGeneratingStatus(proposal.status)) {
    return {
      deletable: false,
      refusal: PROPOSAL_DELETION_REFUSAL.GENERATING,
      reason: proposalDeletionRefusalText(PROPOSAL_DELETION_REFUSAL.GENERATING),
    };
  }
  return { deletable: true, refusal: null, reason: null };
}

/**
 * Split the requested proposals into the ones that may be deleted and the ones
 * that are kept, each with the reason the designer reads.
 *
 * @param {Object} input
 * @param {Array<{proposal: Object|null, issuedDocumentCount?: number}>} input.candidates
 * @param {(proposal: Object|null) => boolean} [input.canManageFor]
 * @returns {{deletable: Array<{id: string, title: string}>, refused: Array<{id: string, title: string, refusal: string, reason: string}>}}
 */
export function partitionProposalDeletions({ candidates = [], canManageFor = () => true } = {}) {
  const deletable = [];
  const refused = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const proposal = candidate?.proposal || null;
    const decision = proposalDeletionDecision({
      proposal,
      issuedDocumentCount: candidate?.issuedDocumentCount || 0,
      canManage: proposal ? canManageFor(proposal) === true : false,
    });
    const entry = {
      id: proposal?.id || candidate?.id || null,
      title: proposal?.title || 'Untitled Proposal',
    };
    if (decision.deletable) deletable.push(entry);
    else refused.push({ ...entry, refusal: decision.refusal, reason: decision.reason });
  }

  return { deletable, refused };
}

/** A requested proposal that could not be read at all. */
export function missingProposalRefusal(proposalId) {
  return {
    id: proposalId,
    title: 'Untitled Proposal',
    refusal: PROPOSAL_DELETION_REFUSAL.NOT_FOUND,
    reason: proposalDeletionRefusalText(PROPOSAL_DELETION_REFUSAL.NOT_FOUND),
  };
}

export default proposalDeletionDecision;