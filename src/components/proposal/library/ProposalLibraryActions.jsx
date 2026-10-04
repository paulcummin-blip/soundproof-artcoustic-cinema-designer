/**
 * ProposalLibraryActions
 * ----------------------
 * The per-proposal action menu in the Proposal Library:
 * Open, Rename, Duplicate, Regenerate from latest source, Export PDF and
 * Archive (or Restore when archived).
 *
 * Presentation only — every action is owned by the library tab.
 */

import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { FileText, Copy, Download, Archive, MoreVertical, Pencil, RefreshCw, RotateCcw } from 'lucide-react';

export default function ProposalLibraryActions({
  proposal,
  archived = false,
  onOpen,
  onRename,
  onDuplicate,
  onRegenerate,
  onExport,
  onArchive,
  onRestore,
}) {
  if (!proposal) return null;

  return (
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
        <DropdownMenuItem onClick={() => onOpen?.(proposal)} className="cursor-pointer hover:!bg-[#F8F8F7]">
          <FileText className="w-4 h-4 mr-2" />
          Open
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRename?.(proposal)} className="cursor-pointer hover:!bg-[#F8F8F7]">
          <Pencil className="w-4 h-4 mr-2" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicate?.(proposal)} className="cursor-pointer hover:!bg-[#F8F8F7]">
          <Copy className="w-4 h-4 mr-2" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRegenerate?.(proposal)} className="cursor-pointer hover:!bg-[#F8F8F7]">
          <RefreshCw className="w-4 h-4 mr-2" />
          Regenerate from latest source
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport?.(proposal)} className="cursor-pointer hover:!bg-[#F8F8F7]">
          <Download className="w-4 h-4 mr-2" />
          Export PDF
        </DropdownMenuItem>
        {archived ? (
          <DropdownMenuItem onClick={() => onRestore?.(proposal)} className="cursor-pointer hover:!bg-[#F8F8F7]">
            <RotateCcw className="w-4 h-4 mr-2" />
            Restore
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => onArchive?.(proposal)}
            className="cursor-pointer !text-[#8A8477] hover:!bg-[#F5F4F0]"
          >
            <Archive className="w-4 h-4 mr-2" />
            Archive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}