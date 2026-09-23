import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { FileText, Copy, Download, Archive, MoreVertical, Layers, Clock, Calendar, RotateCcw } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import ProposalStatusBadge from './ProposalStatusBadge';
import { getProposalType } from './proposalTypes';
import { isArchived } from './proposalLifecycle';

/**
 * Proposal card — mirrors the ProjectCard visual language.
 *
 * Props:
 * - proposal: Proposal record
 * - projectName: string | null  (resolved from Project lookup)
 * - versionLabel: string | null  (resolved from ProjectVersion lookup)
 * - sectionCount: number  (count of ProposalSection records)
 * - onDuplicate: (proposal) => void
 * - onArchive: (proposal) => void
 * - onRestore: (proposal) => void  (restore from archived)
 */
function ProposalCard({ proposal, projectName, versionLabel, sectionCount, onDuplicate, onArchive, onRestore }) {
  const navigate = useNavigate();

  if (!proposal) return null;

  const handleOpen = () => {
    navigate(`/ProposalEditor?proposalId=${proposal.id}`);
  };

  const handleDuplicate = () => {
    if (onDuplicate) onDuplicate(proposal);
  };

  const handleArchive = () => {
    if (onArchive) onArchive(proposal);
  };

  const handleRestore = () => {
    if (onRestore) onRestore(proposal);
  };

  const handleExport = () => {
    // Stage 4: PDF export. For now, navigate to the editor where export will live.
    navigate(`/ProposalEditor?proposalId=${proposal.id}`);
  };

  const archived = isArchived(proposal.status);
  const typeLabel = getProposalType(proposal.proposal_type)?.label || 'Single Design Proposal';
  const createdDate = proposal.created_date ? new Date(proposal.created_date) : null;
  const updatedDate = proposal.updated_date ? new Date(proposal.updated_date) : null;

  return (
    <Card className="bg-white border-[#DCDBD6] flex flex-col hover:border-[#A3A3A3] transition-colors duration-300 relative overflow-hidden">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-[#1B1A1A] truncate font-header" title={proposal.title || 'Untitled Proposal'}>
              {proposal.title || 'Untitled Proposal'}
            </CardTitle>
            <p className="text-sm text-[#3E4349] font-body truncate">
              {projectName || 'No project linked'}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <ProposalStatusBadge status={proposal.status} />
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-[#3E4349] hover:text-[#1B1A1A] flex-shrink-0"
                aria-label="Open proposal actions"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
              <DropdownMenuItem onClick={handleOpen} className="cursor-pointer hover:!bg-[#F8F8F7]">
                <FileText className="w-4 h-4 mr-2" />
                Open
              </DropdownMenuItem>
              {archived ? (
                <>
                  <DropdownMenuItem onClick={handleRestore} className="cursor-pointer hover:!bg-[#F8F8F7]">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport} className="cursor-pointer hover:!bg-[#F8F8F7]">
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={handleDuplicate} className="cursor-pointer hover:!bg-[#F8F8F7]">
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport} className="cursor-pointer hover:!bg-[#F8F8F7]">
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleArchive}
                    className="cursor-pointer !text-[#8A8477] hover:!bg-[#F5F4F0]"
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    Archive
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="flex-grow space-y-2.5 font-body">
        {/* Version label */}
        <div className="flex items-center gap-2 text-sm text-[#3E4349]">
          <Layers className="w-4 h-4 text-[#8A8477] flex-shrink-0" />
          <span className="truncate">
            {versionLabel || typeLabel}
          </span>
        </div>

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