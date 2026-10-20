import React from 'react';
import { ChevronDown, Lock, Unlock, StickyNote, Undo2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { REGENERATION_ACTIONS } from '@/components/proposal/proposalSections';

/**
 * The "More" menu of the section toolbar: every secondary editing action in one
 * compact dropdown — Undo, the regeneration actions (Rewrite, Refine, Expand,
 * Shorten, Technical, Client Friendly), Lock and Notes.
 *
 * Props:
 * - section: the active section
 * - onRegenerate(action), isRegenerating
 * - onToggleLock(), onToggleNotes()
 * - onUndoWording: () => void, or null when the section has no ADI wording to undo
 * - canUndoAdi, isImprovingWording
 */
export default function SectionToolbarMore({
  section,
  onRegenerate,
  isRegenerating = false,
  onToggleLock,
  onToggleNotes,
  onUndoWording = null,
  canUndoAdi = false,
  isImprovingWording = false,
}) {
  const locked = Boolean(section?.locked);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-toolbar-more="true"
          title="More editing options"
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#3E4349] hover:bg-[#F5F4F0] rounded transition-colors"
        >
          More
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem] text-xs">
        {onUndoWording && (
          <DropdownMenuItem
            data-adi-undo="section"
            disabled={!canUndoAdi || isImprovingWording}
            onSelect={() => onUndoWording()}
          >
            <Undo2 className="w-3.5 h-3.5 mr-2" />
            Undo
          </DropdownMenuItem>
        )}
        {REGENERATION_ACTIONS.map((action) => (
          <DropdownMenuItem
            key={action.value}
            disabled={isRegenerating}
            onSelect={() => onRegenerate(action.value)}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onToggleLock?.()}>
          {locked ? <Lock className="w-3.5 h-3.5 mr-2" /> : <Unlock className="w-3.5 h-3.5 mr-2" />}
          {locked ? 'Unlock' : 'Lock'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggleNotes?.()}>
          <StickyNote className="w-3.5 h-3.5 mr-2" />
          Notes
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}