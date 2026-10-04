/**
 * RevisionBadge
 * -------------
 * How a saved proposal relates to the proposal it came from: Original, or
 * Revision N regenerated from the latest source. The original proposal is never
 * demoted or hidden by a revision — it stays independently openable.
 *
 * Presentation only.
 */

import React from 'react';
import { GitBranch } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

/** The revision number of a proposal: 1 = the original. */
export function revisionNumber(proposal) {
  const explicit = Number(proposal?.version);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return proposal?.parent_proposal_id ? 2 : 1;
}

/** 'Original' or 'Revision 2 · regenerated from latest source'. */
export function revisionLabel(proposal) {
  const number = revisionNumber(proposal);
  if (!proposal?.parent_proposal_id && number <= 1) return 'Original';
  return `Revision ${number}`;
}

export default function RevisionBadge({ proposal, className = '' }) {
  const number = revisionNumber(proposal);
  const isRevision = !!proposal?.parent_proposal_id || number > 1;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      data-revision-number={number}
    >
      {isRevision && <GitBranch className="w-3.5 h-3.5 shrink-0" style={{ color: '#625143' }} />}
      <span className="text-[11px] text-[#625143]" style={{ fontFamily: REPORT_FONT_BODY }}>
        {revisionLabel(proposal)}
        {isRevision ? ' · regenerated from latest source' : null}
      </span>
    </span>
  );
}