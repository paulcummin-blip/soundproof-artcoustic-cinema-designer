import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import {
  MAX_PROPOSAL_DELETIONS,
  PROPOSAL_DELETION_REASON,
  issuedDocumentCounts,
  missingProposalRefusal,
  partitionProposalDeletions,
  proposalDeletionReasonText,
} from '../../shared/proposalDeletion/proposalDeletionAuthority.js';

/**
 * Delete selected proposals from the Proposal Library — the only path that
 * removes a proposal.
 *
 * AUTHORITY is resolved server-side from the session and the account records
 * (never from the request): a master admin may delete any proposal, and an
 * account may delete only proposals it owns, and only with the Sound Proof
 * capability. Every selected id is checked individually, so a request cannot
 * reach a proposal the caller does not manage.
 *
 * WHAT IS REMOVED, and in what order: the proposal's own records first —
 * ProposalSection, ProposalGeneration and ProposalEdit, all keyed by
 * proposal_id — each removal verified as empty before anything else happens,
 * and the Proposal record itself deleted last. If any of its records cannot be
 * removed, the proposal is KEPT and reported: a partially deleted proposal is
 * never reported as deleted, and nothing of the proposal is left orphaned.
 *
 * WHAT IS NEVER REMOVED: Project, ProjectVersion, ReportSnapshot, published
 * engineering, project images and ProposalAssets, and issued documents
 * (ProjectAssetExport, which is append-only). Because an issued document points
 * at its proposal, a proposal that has one is refused outright rather than
 * deleted — "generated" is not "issued", so ordinary test proposals still delete
 * normally.
 *
 * A dry run (dry_run: true) performs every check and changes nothing: it reports
 * exactly which proposals would be deleted and which would be kept, with the
 * reason, so the designer confirms against the real outcome.
 *
 * Returns:
 *   dry run  { dry_run: true, requested_count, deletable, deletable_count, refused, refused_count }
 *   live     { dry_run: false, requested_count, deleted, deleted_ids, deleted_count,
 *              not_deleted, not_deleted_count, refused_count }
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await resolveAccountAccess(base44, user);
    if (!access.allowed) {
      return Response.json({
        error: 'Your account access could not be verified, so no proposal was deleted.',
      }, { status: 403 });
    }
    if (access.capabilities?.soundProof !== true) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const requestedIds = [...new Set(
      (Array.isArray(body?.proposal_ids) ? body.proposal_ids : [])
        .filter((id) => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim()),
    )];

    if (requestedIds.length === 0) {
      return Response.json({ error: 'Select at least one proposal to delete.' }, { status: 400 });
    }
    if (requestedIds.length > MAX_PROPOSAL_DELETIONS) {
      return Response.json({
        error: `Delete up to ${MAX_PROPOSAL_DELETIONS} proposals at a time.`,
      }, { status: 400 });
    }

    const service = base44.asServiceRole;

    // ── What was asked for, read as it stands ──
    const proposals = asItems(await service.entities.Proposal.filter({ id: { $in: requestedIds } }));
    const issuedRows = asItems(await service.entities.ProjectAssetExport.filter(
      { source_record_id: { $in: requestedIds } },
      { fields: ['id', 'source_record_id', 'document_type'], limit: 1000 },
    ));
    const issuedCounts = issuedDocumentCounts(issuedRows, requestedIds);

    const callerAccountId = access.account?.id || access.user?.account_id || null;
    const { deletable, refused } = partitionProposalDeletions({
      candidates: proposals.map((proposal) => ({
        proposal,
        issuedDocumentCount: issuedCounts.get(proposal.id) || 0,
      })),
      // The caller's own authority over this exact record: a master admin may
      // delete it; an account member may delete it only when they own it.
      canManageFor: (proposal) => access.isMasterAdmin === true
        || (!!callerAccountId && proposal.account_id === callerAccountId),
    });

    // An id that could not be read is reported, never silently ignored.
    const found = new Set(proposals.map((proposal) => proposal.id));
    const allRefused = [
      ...refused,
      ...requestedIds.filter((id) => !found.has(id)).map(missingProposalRefusal),
    ];

    if (dryRun) {
      return Response.json({
        dry_run: true,
        requested_count: requestedIds.length,
        deletable,
        deletable_count: deletable.length,
        refused: allRefused,
        refused_count: allRefused.length,
      });
    }

    // ── The deletion: one proposal at a time, each isolated ──
    // A failure on one proposal is reported against that proposal and cannot
    // affect any other, selected or not.
    const deleted = [];
    const notDeleted = [...allRefused];

    for (const entry of deletable) {
      try {
        const removal = await deleteProposalAndItsRecords(service, entry.id);
        if (removal.ok) {
          deleted.push({ id: entry.id, title: entry.title });
        } else {
          notDeleted.push({
            id: entry.id,
            title: entry.title,
            reason_code: removal.reasonCode,
            reason: proposalDeletionReasonText(removal.reasonCode),
            step: removal.step,
          });
        }
      } catch (error) {
        notDeleted.push({
          id: entry.id,
          title: entry.title,
          reason_code: PROPOSAL_DELETION_REASON.DELETION_FAILED,
          reason: proposalDeletionReasonText(PROPOSAL_DELETION_REASON.DELETION_FAILED),
          detail: String(error?.message || error).slice(0, 300),
        });
      }
    }

    return Response.json({
      dry_run: false,
      requested_count: requestedIds.length,
      deleted,
      deleted_ids: deleted.map((entry) => entry.id),
      deleted_count: deleted.length,
      not_deleted: notDeleted,
      not_deleted_count: notDeleted.length,
      refused_count: allRefused.length,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The proposals could not be deleted.' }, { status: 500 });
  }
}

function asItems(result) {
  if (Array.isArray(result)) return result;
  return result?.items || [];
}

/**
 * Remove one proposal and everything of it.
 *
 * Its own records go first and each removal is verified empty before the next
 * step, so the proposal itself is only removed once nothing of it remains. The
 * proposal's removal is then confirmed, so an unconfirmed delete is reported
 * rather than claimed.
 */
async function deleteProposalAndItsRecords(service, proposalId) {
  const children = [
    {
      step: 'ProposalSection',
      remove: () => service.entities.ProposalSection.deleteMany({ proposal_id: proposalId }),
      remaining: () => service.entities.ProposalSection.count({ proposal_id: proposalId }),
    },
    {
      step: 'ProposalGeneration',
      remove: () => service.entities.ProposalGeneration.deleteMany({ proposal_id: proposalId }),
      remaining: () => service.entities.ProposalGeneration.count({ proposal_id: proposalId }),
    },
    {
      step: 'ProposalEdit',
      remove: () => service.entities.ProposalEdit.deleteMany({ proposal_id: proposalId }),
      remaining: () => service.entities.ProposalEdit.count({ proposal_id: proposalId }),
    },
  ];

  for (const child of children) {
    await child.remove();
    const left = await child.remaining();
    if (Number(left) > 0) {
      return {
        ok: false,
        step: child.step,
        reasonCode: PROPOSAL_DELETION_REASON.RELATED_RECORDS_REMAINING,
      };
    }
  }

  await service.entities.Proposal.delete(proposalId);

  const survivors = await service.entities.Proposal.filter({ id: proposalId });
  if (asItems(survivors).length > 0) {
    return {
      ok: false,
      step: 'Proposal',
      reasonCode: PROPOSAL_DELETION_REASON.DELETE_UNCONFIRMED,
    };
  }

  return { ok: true, step: null, reasonCode: null };
}