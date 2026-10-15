/**
 * sectionApprovalPresentation
 * ---------------------------
 * How the designer's approval of a generated section READS on screen: the two
 * states, the words and markers they are shown with, and the count the workspace
 * states. Presentation only — which sections need approval, and whether an
 * approval still counts, is resolved on the server from the section's own content
 * (base44/shared/proposalApproval/sectionApprovalAuthority.js). Nothing here
 * decides or infers an approval, and nothing here can give one.
 *
 * The status strings are the ones the server sends. They are named here rather
 * than compared as loose literals so the sidebar, the section toolbar and the
 * dialog cannot drift apart.
 */

export const APPROVAL_STATUS = Object.freeze({
  APPROVED: 'approved',
  NEEDS_REVIEW: 'needs_review',
});

export const APPROVAL_LABEL = Object.freeze({
  [APPROVAL_STATUS.APPROVED]: 'Approved',
  [APPROVAL_STATUS.NEEDS_REVIEW]: 'Needs review',
});

/** ✓ for approved, ● for still to read — the markers the section list uses. */
export const APPROVAL_MARKER = Object.freeze({
  [APPROVAL_STATUS.APPROVED]: '✓',
  [APPROVAL_STATUS.NEEDS_REVIEW]: '●',
});

const CHIP = Object.freeze({
  [APPROVAL_STATUS.APPROVED]: { color: '#213428', backgroundColor: '#EAF0EC', border: '1px solid #BFCFC4' },
  [APPROVAL_STATUS.NEEDS_REVIEW]: { color: '#8B4A2B', backgroundColor: '#F6E7E1', border: '1px solid #E4C9BC' },
});

/** The section_type → status map the section list renders from. */
export function approvalStatusByType(approval) {
  const map = {};
  for (const row of approval?.sections || []) {
    if (row.status) map[row.section_type] = row.status;
  }
  return map;
}

/** The approval row for one stored section: its status and the fingerprint to approve. */
export function approvalRowFor(approval, sectionId) {
  return (approval?.sections || []).find((row) => row.section_id === sectionId) || null;
}

/** The status of one section, or null when it carries nothing to approve. */
export function approvalStatusOf(approval, sectionId) {
  return approvalRowFor(approval, sectionId)?.status || null;
}

export function approvalChipStyle(status) {
  return CHIP[status] || null;
}

export function approvalLabel(status) {
  return APPROVAL_LABEL[status] || null;
}

export function approvalMarker(status) {
  return APPROVAL_MARKER[status] || null;
}

/**
 * The COPY REVIEW line: how many generated sections have been read and approved.
 * Complete is stated as complete, never as "6 of 6".
 */
export function approvalCountSentence(approval) {
  if (!approval) return null;
  const total = approval.required_count || 0;
  if (total === 0) return 'No generated copy to approve';
  if (approval.all_approved) return 'All client copy approved';
  return `${approval.approved_count || 0} of ${total} sections approved`;
}

/** The sections still awaiting approval, in document order. */
export function awaitingApprovalSections(approval) {
  return approval?.awaiting || [];
}

export default approvalStatusByType;