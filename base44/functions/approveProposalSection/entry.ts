import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readCompleteDocument } from '../../shared/proposalEdit/readCompleteDocument.js';
import { resolveSectionApproval } from '../../shared/proposalApproval/sectionApprovalAuthority.js';

/**
 * Approve ONE generated narrative section of a proposal.
 *
 * This is the only write path into a section's approval, and it exists because
 * approval is a human decision: a document may be generated, validated, previewed
 * and every one of its evidence checks passed, and its copy is still unapproved
 * until somebody has read that section and said so. Nothing in the app calls this
 * on the section's behalf — not a generation, not a preview, not opening a
 * section, not a passed check and not the export.
 *
 * The caller sends the fingerprint of the wording it was looking at, and it is
 * checked against the section's content AS IT STANDS NOW before anything is
 * written. So an approval can never be recorded against wording that has moved on
 * since it was read: a stale tab, a section edited in another window or a copy
 * regenerated in between is refused with a sentence the designer can act on, and
 * they approve what is actually on the page.
 *
 * Nothing else is written. The record's wording, its timestamps, its metadata and
 * every other section are left exactly as they were, which is why approving one
 * section can never affect another — and why a later change to that section's
 * wording stops counting automatically, without anyone having to reset it.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { proposal_id, section_id, fingerprint } = body || {};

    if (!proposal_id || !section_id || typeof fingerprint !== 'string' || !fingerprint) {
      return Response.json(
        { error: 'proposal_id, section_id and fingerprint are required.' },
        { status: 400 },
      );
    }

    const proposal = await base44.entities.Proposal.get(proposal_id).catch(() => null);
    if (!proposal) return Response.json({ error: 'Proposal not found.' }, { status: 404 });

    if (String(proposal.status || '').toLowerCase() === 'archived') {
      return Response.json(
        { error: 'Archived proposals are read-only. Restore the proposal before approving its copy.' },
        { status: 409 },
      );
    }

    // The section's approval state is resolved from the same document check the
    // editor reads, so what is approved here is the wording the PDF will print.
    const document = await readCompleteDocument(base44.entities, proposal);
    const approval = resolveSectionApproval({
      sections: document.sections || [],
      publishedSections: document.document_sections || [],
    });
    const row = (approval.sections || []).find((entry) => entry.section_id === section_id);
    if (!row) return Response.json({ error: 'Proposal section not found.' }, { status: 404 });

    if (!row.requires_approval) {
      return Response.json(
        { error: 'This section carries no generated copy, so it does not need approval.' },
        { status: 400 },
      );
    }

    if (row.fingerprint !== fingerprint) {
      return Response.json(
        { error: 'This section changed since it was read. Read the current wording, then approve it again.' },
        { status: 409 },
      );
    }

    const section = await base44.entities.ProposalSection.get(section_id).catch(() => null);
    if (!section || section.proposal_id !== proposal_id) {
      return Response.json({ error: 'Proposal section not found.' }, { status: 404 });
    }

    const approvedAt = new Date().toISOString();
    const approvedBy = user.full_name || user.email || 'Unknown user';

    await base44.entities.ProposalSection.update(section_id, {
      metadata: {
        ...(section.metadata || {}),
        approval: {
          status: 'approved',
          approved_at: approvedAt,
          approved_by: approvedBy,
          fingerprint: row.fingerprint,
        },
      },
    });

    return Response.json({
      ok: true,
      proposal_id,
      section_id,
      section_type: row.section_type,
      status: 'approved',
      approved_at: approvedAt,
      approved_by: approvedBy,
      fingerprint: row.fingerprint,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The section could not be approved.' }, { status: 500 });
  }
}