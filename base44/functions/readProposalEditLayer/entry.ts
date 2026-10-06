import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { resolveEditorLayer } from '../../shared/proposalEdit/proposalEditEditorModel.js';

/**
 * Read the Proposal Editor's copy layer for one proposal.
 *
 * The editor renders what this returns and decides nothing of its own: which copy
 * there is to show (the latest valid edit, else the validated GPT output), whether
 * it may be issued, exported, completed or sent, the nine sections it may edit
 * with their word limits, the plain-language status and issues, and the copies a
 * revert can restore.
 *
 * The rules live in the shared Phase 3 and Phase 4 modules, so the browser holds
 * no second copy of them and a validation rule can never drift between the two.
 *
 * The audit block — the generation version, every edit, its validation status,
 * who saved it, when, and the fingerprints each record was filed under — is
 * returned only to an authorised editor (a master admin, or an account with Sound
 * Proof access). A client login receives the model without any audit detail, and
 * no client-facing page ever asks for it.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { proposal_id, draft_proposal_id } = body || {};

    if (!proposal_id && !draft_proposal_id) {
      return Response.json({ error: 'proposal_id or draft_proposal_id required' }, { status: 400 });
    }

    const accessContext = await resolveAccountAccess(base44, user);
    const canViewAudit = accessContext?.allowed === true
      && (accessContext.isMasterAdmin === true || accessContext.capabilities?.soundProof === true);

    const query = proposal_id ? { proposal_id } : { draft_proposal_id };

    const generationResult = await base44.entities.ProposalGeneration.filter(query, { sort: '-created_at', limit: 50 });
    const editResult = await base44.entities.ProposalEdit.filter(query, { sort: '-edited_at', limit: 200 });

    const generationRecords = Array.isArray(generationResult) ? generationResult : (generationResult?.items || []);
    const editRecords = Array.isArray(editResult) ? editResult : (editResult?.items || []);

    const layer = resolveEditorLayer({
      generationRecords,
      editRecords,
      proposalId: proposal_id ?? null,
      draftProposalId: draft_proposal_id ?? null,
      canViewAudit,
    });

    return Response.json({ ok: true, layer, can_view_audit: canViewAudit });
  } catch (error) {
    return Response.json({ error: error?.message || 'The proposal copy history could not be read.' }, { status: 500 });
  }
}