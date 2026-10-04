/**
 * ProposalLibraryGroup
 * --------------------
 * One project's proposals in the Proposal Library: an editorial project heading
 * with the proposal count, then the proposal cards for that project.
 *
 * Presentation only — data and actions come from the library tab.
 */

import React from 'react';
import ProposalCard from '@/components/proposal/ProposalCard';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

export default function ProposalLibraryGroup({
  group,
  sourceById = {},
  versionNamesFor,
  sectionCounts = {},
  actionLoading = null,
  onOpen,
  onRename,
  onDuplicate,
  onRegenerate,
  onExport,
  onArchive,
  onRestore,
}) {
  if (!group?.proposals?.length) return null;

  return (
    <section className="mb-12" data-proposal-library-group={group.projectId}>
      <div className="flex items-baseline justify-between gap-4 border-b border-[#E5E1D8] pb-3 mb-6">
        <h3
          className="text-[20px] leading-none font-normal text-[#1B1A1A] tracking-tight truncate"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          {group.projectName}
        </h3>
        <span className="text-[11px] uppercase tracking-[0.14em] text-[#A79E8C] shrink-0">
          {group.proposals.length} {group.proposals.length === 1 ? 'proposal' : 'proposals'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {group.proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            projectName={group.projectName}
            versionNames={versionNamesFor ? versionNamesFor(proposal) : []}
            sourceState={sourceById[proposal.id] || null}
            sectionCount={sectionCounts[proposal.id] || 0}
            busy={!!actionLoading && actionLoading.endsWith(proposal.id)}
            onOpen={onOpen}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onRegenerate={onRegenerate}
            onExport={onExport}
            onArchive={onArchive}
            onRestore={onRestore}
          />
        ))}
      </div>
    </section>
  );
}