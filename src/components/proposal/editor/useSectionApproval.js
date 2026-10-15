/**
 * useSectionApproval
 * ------------------
 * The one action that gives a generated section its approval, and the state of
 * that action while it runs.
 *
 * It sends the fingerprint of the wording the designer was reading, and the
 * server compares it against the section's content as it stands before anything
 * is written — so an approval is only ever recorded against wording that is
 * actually on the page, and a section that changed in the meantime is refused
 * with a sentence the designer can act on. Nothing here approves anything by
 * itself: there is no automatic call, no bulk path and no second entry point.
 *
 * Props:
 * - proposal: the saved proposal record
 * - onApproved(data): called after a successful approval, so the workspace can
 *   re-read the approval state from the server
 */

import { useCallback, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function useSectionApproval({ proposal = null, onApproved } = {}) {
  const [busySectionId, setBusySectionId] = useState(null);

  const approveSection = useCallback(async (section, fingerprint) => {
    if (!proposal?.id || !section?.id || !fingerprint) {
      return { ok: false, message: 'This section cannot be approved yet.' };
    }
    setBusySectionId(section.id);
    try {
      const response = await base44.functions.invoke('approveProposalSection', {
        proposal_id: proposal.id,
        section_id: section.id,
        fingerprint,
      });
      const data = response?.data || {};
      if (data.error) throw new Error(data.error);
      onApproved?.(data);
      return { ok: true, data };
    } catch (error) {
      return {
        ok: false,
        message: error?.response?.data?.error || error?.message || 'The section could not be approved.',
      };
    } finally {
      setBusySectionId(null);
    }
  }, [proposal?.id, onApproved]);

  return { approveSection, busySectionId };
}