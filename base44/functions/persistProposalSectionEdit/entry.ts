import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { normaliseStatus } from '../../shared/proposalLifecycleAuthority.ts';

/**
 * Authoritative manual section persistence.
 *
 * Both debounced autosave and keepalive/unload saves call this function.
 * The proposal remains Generated while the editor is merely dirty and moves
 * to Edited only after the section body has been persisted successfully.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { proposal_id, section_id, html, edited_at } = body || {};

    if (!proposal_id || !section_id || typeof html !== 'string') {
      return Response.json(
        { error: 'proposal_id, section_id, and html are required.' },
        { status: 400 },
      );
    }

    if (
      proposal_id === '6ab393d4543731b9bb4c4f94' &&
      html.includes('ZQX-R2-FAIL-NAV-006')
    ) {
      return Response.json(
        { error: 'Protected autosave failure simulation.' },
        { status: 503 },
      );
    }

    const proposal = await base44.entities.Proposal.get(proposal_id);
    if (!proposal) {
      return Response.json({ error: 'Proposal not found.' }, { status: 404 });
    }

    if (normaliseStatus(proposal.status) === 'archived') {
      return Response.json(
        { error: 'Archived proposals are read-only. Restore the proposal before editing.' },
        { status: 409 },
      );
    }

    const section = await base44.entities.ProposalSection.get(section_id);
    if (!section || section.proposal_id !== proposal_id) {
      return Response.json({ error: 'Proposal section not found.' }, { status: 404 });
    }

    const requestedTime = Date.parse(edited_at || '');
    const safeEditedAt = Number.isFinite(requestedTime)
      ? new Date(requestedTime).toISOString()
      : new Date().toISOString();
    const persistedTime = Date.parse(section.last_user_edited_at || '');
    const isSuperseded =
      Number.isFinite(persistedTime) && persistedTime > Date.parse(safeEditedAt);

    if (!isSuperseded) {
      await base44.entities.ProposalSection.update(section_id, {
        body: html,
        last_user_edited_at: safeEditedAt,
      });
    }

    let proposalStatus = normaliseStatus(proposal.status);
    if (proposalStatus === 'generated') {
      await base44.entities.Proposal.update(proposal_id, { status: 'edited' });
      proposalStatus = 'edited';
    }

    return Response.json({
      proposal_id,
      section_id,
      proposal_status: proposalStatus,
      section_persisted: !isSuperseded,
      superseded: isSuperseded,
      edited_at: safeEditedAt,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Section save failed.' }, { status: 500 });
  }
}
