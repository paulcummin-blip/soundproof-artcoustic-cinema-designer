import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { resolveEditorLayer } from '../../shared/proposalEdit/proposalEditEditorModel.js';
import { readCompleteDocument, readProposalRecords } from '../../shared/proposalEdit/readCompleteDocument.js';
import { authorizeProposalExport } from '../../shared/proposalEdit/proposalExportAuthorization.js';
import { GPT_WRITER_FLAG_FIELD, gptWriterClientState, resolveGptWriterFlag } from '../../shared/proposalWriter/proposalWriterFlag.js';

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
 *
 * The Phase 6 GPT writer flag is resolved here too, from SystemConfig and for
 * this login only, and returned as a resolved state: whether the action may be
 * shown, and its label. The browser is never given the scope lists, and it cannot
 * switch the writer on for itself.
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

    const [generationRecords, editRecords] = await Promise.all([
      readProposalRecords(base44.entities.ProposalGeneration, query),
      readProposalRecords(base44.entities.ProposalEdit, query),
    ]);

    const layer = resolveEditorLayer({
      generationRecords,
      editRecords,
      proposalId: proposal_id ?? null,
      draftProposalId: draft_proposal_id ?? null,
      canViewAudit,
    });

    layer.proposal_id = proposal_id || null;
    if (proposal_id) {
      const proposal = await base44.entities.Proposal.get(proposal_id);
      if (!proposal) return Response.json({ error: 'Proposal not found.' }, { status: 404 });
      const documentValidation = await readCompleteDocument(base44.entities, proposal, { generationRecords, editRecords });
      layer.document_validation = documentValidation;
      layer.ready = documentValidation.valid;
      layer.gate = { ...layer.gate, issuable: documentValidation.valid };
      layer.export_blocked_reason = documentValidation.blocked_reason;
      layer.status_label = documentValidation.valid ? 'Ready to issue' : 'Needs review';
      if (body.action === 'export') {
        const authorization = authorizeProposalExport({ validation: documentValidation, proposal, request: body, copy: layer.export_sections });
        if (!authorization.allowed) return Response.json({ error: authorization.reason }, { status: 409 });
      }
    }

    // The writer flag, resolved server-side for this login only. It defaults OFF:
    // while it is off the editor simply shows no writer action.
    let writer = gptWriterClientState(null);
    try {
      const configResult = await base44.asServiceRole.entities.SystemConfig.filter({}, { limit: 1 });
      const configRecord = (Array.isArray(configResult) ? configResult : (configResult?.items || []))[0] || null;
      writer = gptWriterClientState(resolveGptWriterFlag({
        config: configRecord?.[GPT_WRITER_FLAG_FIELD] || null,
        accountId: accessContext.user?.account_id || accessContext.account?.id || null,
        email: user.email || null,
        isMasterAdmin: accessContext.isMasterAdmin === true,
      }));
    } catch (flagError) {
      // A flag that cannot be read is a flag that is off.
      writer = gptWriterClientState(null);
    }

    return Response.json({ ok: true, layer, can_view_audit: canViewAudit, writer });
  } catch (error) {
    return Response.json({ error: error?.message || 'The proposal copy history could not be read.' }, { status: 500 });
  }
}