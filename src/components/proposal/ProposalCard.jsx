import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Layers, Clock, Calendar, RotateCcw } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import ProposalStatusBadge from './ProposalStatusBadge';
import ProposalLibraryActions from './library/ProposalLibraryActions';
import ProposalSourceStateBadge from './library/ProposalSourceStateBadge';
import RevisionBadge from './library/RevisionBadge';
import { getProposalTypeLabel } from './proposalTypes';
import { isArchived } from './proposalLifecycle';

/**
 * Proposal card — mirrors the ProjectCard visual language.
 *
 * Props:
 * - proposal: Proposal record
 * - projectName: string | null  (resolved from Project lookup)
 * - versionLabel: string | null  (single-version fallback label)
 * - versionNames: string[]  (every version the proposal was built from)
 * - sourceState: object | null  (Current / Source changed / Missing source)
 * - sectionCount: number  (count of ProposalSection records)
 * - busy: boolean  (an action is running for this proposal)
 * - onOpen / onRename / onDuplicate / onRegenerate / onExport / onArchive /
 *   onRestore: (proposal) => void
 */
function ProposalCard({
  proposal,
  projectName,
  versionLabel,
  versionNames = [],
  sourceState = null,
  sectionCount,
  busy = false,
  onOpen,
  onRename,
  onDuplicate,
  onRegenerate,
  onExport,
  onArchive,
  onRestore,
}) {
  const navigate = useNavigate();

  if (!proposal) return null;

  const openProposal = () => {
    navigate(`/ProposalEditor?proposalId=${proposal.id}`);
  };

  const handleOpen = () => {
    if (onOpen) onOpen(proposal);
    else openProposal();
  };

  const handleRename = () => {
    if (onRename) onRename(proposal);
  };

  const handleDuplicate = () => {
    if (onDuplicate) onDuplicate(proposal);
  };

  const handleRegenerate = () => {
    if (onRegenerate) onRegenerate(proposal);
  };

  const handleArchive = () => {
    if (onArchive) onArchive(proposal);
  };

  const handleRestore = () => {
    if (onRestore) onRestore(proposal);
  };

  const handleExport = () => {
    // PDF export lives in the editor, which opens the saved proposal.
    if (onExport) onExport(proposal);
    else openProposal();
  };

  const archived = isArchived(proposal.status);
  const typeLabel = getProposalTypeLabel(proposal.proposal_type);
  const createdDate = proposal.created_date ? new Date(proposal.created_date) : null;
  const updatedDate = proposal.updated_date ? new Date(proposal.updated_date) : null;

  return (
    <Card className="bg-white border-[#DCDBD6] flex flex-col hover:border-[#A3A3A3] transition-colors duration-300 relative overflow-hidden">
      {busy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
          <Loader2 className="w-5 h-5 text-[#625143] animate-spin" />
        </div>
      )}
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-[#1B1A1A] truncate font-header" title={proposal.title || 'Untitled Proposal'}>
              {proposal.title || 'Untitled Proposal'}
            </CardTitle>
            <p className="text-sm text-[#3E4349] font-body truncate">
              {projectName || 'No project linked'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <ProposalStatusBadge status={proposal.status} />
              <RevisionBadge proposal={proposal} />
            </div>
          </div>
          <ProposalLibraryActions
            proposal={proposal}
            archived={archived}
            onOpen={handleOpen}
            onRename={handleRename}
            onDuplicate={handleDuplicate}
            onRegenerate={handleRegenerate}
            onExport={handleExport}
            onArchive={handleArchive}
            onRestore={handleRestore}
          />
        </div>
      </CardHeader>

      <CardContent className="flex-grow space-y-2.5 font-body">
        {/* Every version this proposal was built from */}
        <div className="flex items-start gap-2 text-sm text-[#3E4349]">
          <Layers className="w-4 h-4 text-[#8A8477] flex-shrink-0 mt-0.5" />
          {versionNames.length > 0 ? (
            <ul className="min-w-0 space-y-0.5">
              {versionNames.map((name) => (
                <li key={name} className="truncate" title={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <span className="truncate">{versionLabel || typeLabel}</span>
          )}
        </div>

        {/* Source state — whether the project has moved on since generation */}
        {sourceState && (
          <div className="pt-0.5">
            <ProposalSourceStateBadge sourceState={sourceState} />
            {sourceState.reason && (
              <p className="text-[11px] text-[#8A8477] mt-1 leading-snug">{sourceState.reason}</p>
            )}
          </div>
        )}

        {/* Created date */}
        {createdDate && (
          <div className="flex items-center gap-2 text-sm text-[#3E4349]">
            <Calendar className="w-4 h-4 text-[#8A8477] flex-shrink-0" />
            <span>{format(createdDate, 'd MMM yyyy')}</span>
          </div>
        )}

        {/* Last edited */}
        {updatedDate && (
          <div className="flex items-center gap-2 text-sm text-[#3E4349]">
            <Clock className="w-4 h-4 text-[#8A8477] flex-shrink-0" />
            <span>{formatDistanceToNow(updatedDate, { addSuffix: true })}</span>
          </div>
        )}

        {/* Section count */}
        <div className="text-xs text-[#A79E8C] pt-1">
          {sectionCount > 0 ? `${sectionCount} sections` : 'No sections yet'}
        </div>
      </CardContent>

      {/* Footer with primary action — Open (active) or Restore (archived) */}
      <div className="px-4 pb-4 pt-2">
        {archived ? (
          <button
            onClick={handleRestore}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
            style={{
              backgroundColor: '#213428',
              fontFamily: 'Didact Gothic, sans-serif',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore
          </button>
        ) : (
          <button
            onClick={handleOpen}
            className="w-full px-4 py-2 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
            style={{
              backgroundColor: '#213428',
              fontFamily: 'Didact Gothic, sans-serif',
            }}
          >
            Open Proposal
          </button>
        )}
      </div>
    </Card>
  );
}

export default React.memo(ProposalCard);