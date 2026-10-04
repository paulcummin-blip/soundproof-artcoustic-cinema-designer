/**
 * proposalHandoffAuthority.js
 * ---------------------------
 * The gate between generation and the Proposal Editor.
 *
 * The editor reads a proposal and its sections, so it may only open on a
 * proposal that has them. Generation is asynchronous on the server: the call
 * returns once the record and its sections are written, but the editor must
 * never be opened on the strength of an assumption about that. This confirms
 * what is actually saved, and names what is missing when it is not.
 *
 * Reads only: nothing here writes, regenerates or repairs.
 */

import { base44 } from '@/api/base44Client';

const asItems = (result) => (Array.isArray(result) ? result : (result?.items || []));

/**
 * The sections a proposal must have saved before the editor can show it.
 * A cover carries no body; every other section is written by generation.
 */
const REQUIRED_SECTION_TYPES = ['cover', 'system_design_summary', 'key_performance_highlights'];

/**
 * Confirm a generated proposal is whole and safe to open.
 *
 * @param {string} proposalId
 * @returns {Promise<{ok: boolean, reason: string|null, proposal?: Object, sectionCount?: number}>}
 */
export async function confirmProposalSectionsSaved(proposalId) {
  if (!proposalId) return { ok: false, reason: 'The proposal was not created, so there is nothing to open.' };

  const proposal = await base44.entities.Proposal.get(proposalId).catch(() => null);
  if (!proposal?.id) {
    return { ok: false, reason: 'The generated proposal could not be read back, so the editor was not opened.' };
  }
  if (!Array.isArray(proposal.selected_version_ids) || proposal.selected_version_ids.length === 0) {
    return { ok: false, reason: 'The proposal was saved without its selected versions, so the editor was not opened.' };
  }
  if (!proposal.proposal_type) {
    return { ok: false, reason: 'The proposal was saved without its report type, so the editor was not opened.' };
  }

  const sections = asItems(await base44.entities.ProposalSection.filter(
    { proposal_id: proposalId },
    { sort: 'order_index', limit: 60 },
  ));
  if (sections.length === 0) {
    return { ok: false, reason: 'No sections were saved for this proposal, so the editor was not opened. Generate it again.' };
  }

  const missing = REQUIRED_SECTION_TYPES.filter(
    (type) => !sections.some((section) => section.section_type === type),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `The proposal is missing its ${missing.join(', ')} section(s), so the editor was not opened. Generate it again.`,
    };
  }

  // The order is what the document, the navigation and the printed pack read
  // in, so an unusable order is treated as an unfinished record.
  const orders = sections.map((section) => Number(section.order_index));
  if (orders.some((order) => !Number.isFinite(order)) || new Set(orders).size !== orders.length) {
    return { ok: false, reason: 'The proposal sections were saved without a valid order, so the editor was not opened. Generate it again.' };
  }

  return { ok: true, reason: null, proposal, sectionCount: sections.length };
}

export default confirmProposalSectionsSaved;