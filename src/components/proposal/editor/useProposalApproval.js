/**
 * useProposalApproval
 * -------------------
 * The Proposal Editor's approval state and its one action.
 *
 * It reads the human approval state the server resolved with the copy layer — which
 * generated sections the client will read, whether each one has been approved, and
 * whether that approval still matches the wording it was given for — and it offers
 * the single action that gives one: approve THIS section, against the fingerprint
 * of the wording that is on screen.
 *
 * It is kept out of the editor page so the page stays readable, and it holds no
 * rule of its own: which sections need approval, and whether an approval counts, is
 * resolved in base44/shared/proposalApproval/sectionApprovalAuthority.js and read
 * here as given. Nothing in this hook can approve a section on its behalf.
 */

import { useCallback, useMemo, useState } from 'react';
import { isArchived } from '@/components/proposal/proposalLifecycle';
import useSectionApproval from '@/components/proposal/editor/useSectionApproval';
import {
  approvalRowFor,
  approvalStatusByType,
} from '@/components/proposal/editor/sectionApprovalPresentation';

export default function useProposalApproval({ proposal = null, layer = null } = {}) {
  const archived = isArchived(proposal?.status);

  // The approval state the server resolved, or null for a proposal with no
  // generated copy — which is never held to this rule.
  const approval = layer?.approval || null;
  const statusByType = useMemo(() => approvalStatusByType(approval), [approval]);

  // Bumped when a section is approved, so the workspace re-reads the layer and the
  // count, the list and every section state come back from the server.
  const [refreshSignal, setRefreshSignal] = useState(0);
  const { approveSection, busySectionId } = useSectionApproval({
    proposal,
    onApproved: () => setRefreshSignal((count) => count + 1),
  });

  const approve = useCallback(async (section) => {
    if (!section || archived) return;
    // The fingerprint of the wording as the editor last read it. It is the whole
    // protection against approving wording nobody saw: the server compares it
    // against the section's content as it stands and refuses anything else.
    const row = approvalRowFor(approval, section.id);
    if (!row?.fingerprint) return;
    const outcome = await approveSection(section, row.fingerprint);
    if (!outcome?.ok) {
      window.alert(outcome?.message || 'The section could not be approved. Please try again.');
    }
  }, [approval, archived, approveSection]);

  return {
    approval,
    approvalByType: statusByType,
    // The reason the export is withheld until every generated section is approved,
    // in the designer's words. Null when there is nothing left to approve.
    approvalBlockReason: approval && approval.all_approved !== true ? approval.block_reason : null,
    approveSection: approve,
    approvingSectionId: busySectionId,
    refreshSignal,
  };
}