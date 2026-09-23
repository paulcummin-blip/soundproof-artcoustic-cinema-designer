import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { validateTransition, normaliseStatus, computeRestoreStatus } from '../../shared/proposalLifecycleAuthority.ts';

/**
 * Server-authoritative proposal lifecycle transition.
 *
 * Inputs:
 *  - proposal_id: string
 *  - target_status: string (the desired next status)
 *
 * Returns:
 *  - 200 { proposal_id, status, previous_status } on success
 *  - 400 if proposal_id or target_status missing
 *  - 401 if not authenticated
 *  - 404 if proposal not found
 *  - 409 if the transition is invalid (with a user-facing reason)
 *  - 500 on server error
 *
 * This is the ONLY path that should change proposal.status. Client-side
 * direct status updates are rejected by the lifecycle rules.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { proposal_id, target_status } = body;

    if (!proposal_id || !target_status) {
      return Response.json({ error: 'proposal_id and target_status are required.' }, { status: 400 });
    }

    const proposals = await base44.entities.Proposal.filter({ id: proposal_id });
    const proposal = proposals?.[0];
    if (!proposal) return Response.json({ error: 'Proposal not found.' }, { status: 404 });

    const currentStatus = proposal.status;
    const previousStatus = proposal.previous_status || null;

    // Check if the proposal has content (for restore fallback)
    const sections = await base44.entities.ProposalSection.filter({ proposal_id });
    const hasContent = Array.isArray(sections) && sections.some((s) => s.body && s.body.trim().length > 0);

    const result = validateTransition(currentStatus, target_status, previousStatus, hasContent);
    if (!result.valid) {
      return Response.json({ error: result.reason || 'Invalid transition.' }, { status: 409 });
    }

    const update = { status: target_status };

    // When archiving, store the previous status for later restore.
    if (normaliseStatus(target_status) === 'archived') {
      update.previous_status = result.previousStatus;
    }

    // When unarchiving, clear previous_status.
    if (normaliseStatus(currentStatus) === 'archived' && normaliseStatus(target_status) !== 'archived') {
      update.previous_status = null;
    }

    await base44.entities.Proposal.update(proposal_id, update);

    return Response.json({
      proposal_id,
      status: target_status,
      previous_status: update.previous_status !== undefined ? update.previous_status : (proposal.previous_status || null),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}